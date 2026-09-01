import enum
import uuid
from datetime import datetime

from sqlalchemy import Column, String, DateTime, Enum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.database import Base


class UserRole(str, enum.Enum):
    student = "student"
    admin = "admin"


class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False)
    email = Column(String(255), nullable=False, unique=True, index=True)
    password_hash = Column(String(255), nullable=False)
    role = Column(Enum(UserRole), nullable=False, default=UserRole.student)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # A user now has one embedding per enrolled pose (CENTER/LEFT/RIGHT/UP/DOWN),
    # so this is a list. Accounts enrolled before multi-pose support have a
    # single CENTER entry.
    face_embeddings = relationship(
        "FaceEmbedding", back_populates="user", cascade="all, delete-orphan"
    )
    attempts = relationship("ExamAttempt", back_populates="user", cascade="all, delete-orphan")
