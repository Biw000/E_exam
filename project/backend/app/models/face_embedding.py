import enum
import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, ARRAY, Float, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.database import Base


class FacePoseType(str, enum.Enum):
    """
    The head positions captured during enrollment. Stored as a plain string
    column (not a postgres ENUM) so new poses can be added without a database
    type migration.
    """

    CENTER = "CENTER"
    LEFT = "LEFT"
    RIGHT = "RIGHT"
    UP = "UP"
    DOWN = "DOWN"


# The poses a user must complete before enrollment counts as finished.
REQUIRED_ENROLLMENT_POSES: tuple[str, ...] = (
    FacePoseType.CENTER.value,
    FacePoseType.LEFT.value,
    FacePoseType.RIGHT.value,
    FacePoseType.UP.value,
    FacePoseType.DOWN.value,
)


class FaceEmbedding(Base):
    """
    One row per (user, pose). A user enrolled with the full Face ID flow will
    have five rows; accounts created before multi-pose enrollment existed keep
    their single CENTER row and continue to work.

    The embedding vector itself is sensitive and is never serialized back to
    the frontend - no pydantic response schema exposes this model.
    """

    __tablename__ = "face_embeddings"
    __table_args__ = (
        UniqueConstraint("user_id", "pose_type", name="uq_face_embeddings_user_pose"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    pose_type = Column(String(16), nullable=False, default=FacePoseType.CENTER.value)
    # Stored as an array of floats (embedding vector). Never returned to frontend.
    embedding = Column(ARRAY(Float), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    user = relationship("User", back_populates="face_embeddings")
