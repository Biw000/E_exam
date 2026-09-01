import enum
import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Enum, Float, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.database import Base


class SuspiciousEventType(str, enum.Enum):
    NO_FACE = "NO_FACE"
    MULTIPLE_FACES = "MULTIPLE_FACES"
    FACE_MISMATCH = "FACE_MISMATCH"
    FACE_OK = "FACE_OK"
    TAB_SWITCH = "TAB_SWITCH"
    FULLSCREEN_EXIT = "FULLSCREEN_EXIT"
    CAMERA_DISABLED = "CAMERA_DISABLED"


class SuspiciousEvent(Base):
    __tablename__ = "suspicious_events"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    attempt_id = Column(
        UUID(as_uuid=True), ForeignKey("exam_attempts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    event_type = Column(Enum(SuspiciousEventType), nullable=False, index=True)
    confidence = Column(Float, nullable=True)
    description = Column(String(500), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)

    attempt = relationship("ExamAttempt", back_populates="suspicious_events")
