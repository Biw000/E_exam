import enum
import uuid
from datetime import datetime

from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Boolean
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.database import Base


class AttemptStatus(str, enum.Enum):
    in_progress = "in_progress"
    submitted = "submitted"
    expired = "expired"
    # Ended early by the proctoring rules rather than by the student.
    terminated = "terminated"


class ExamAttempt(Base):
    __tablename__ = "exam_attempts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    exam_id = Column(UUID(as_uuid=True), ForeignKey("exams.id", ondelete="CASCADE"), nullable=False, index=True)
    started_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    submitted_at = Column(DateTime, nullable=True)
    score = Column(Integer, nullable=True)
    status = Column(String(20), nullable=False, default=AttemptStatus.in_progress.value)

    # The question order for this attempt only. Re-shuffled on every new
    # attempt, but persisted so a page refresh does not reorder mid-exam.
    question_order = Column(JSONB, nullable=True)
    terminated_reason = Column(String(80), nullable=True)

    user = relationship("User", back_populates="attempts")
    exam = relationship("Exam", back_populates="attempts")
    answers = relationship("Answer", back_populates="attempt", cascade="all, delete-orphan")
    suspicious_events = relationship(
        "SuspiciousEvent", back_populates="attempt", cascade="all, delete-orphan"
    )


class Answer(Base):
    __tablename__ = "answers"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    attempt_id = Column(
        UUID(as_uuid=True), ForeignKey("exam_attempts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    question_id = Column(
        UUID(as_uuid=True), ForeignKey("questions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    choice_id = Column(UUID(as_uuid=True), ForeignKey("choices.id", ondelete="SET NULL"), nullable=True)
    is_correct = Column(Boolean, nullable=True)
    score = Column(Integer, nullable=True)

    attempt = relationship("ExamAttempt", back_populates="answers")
    question = relationship("Question", back_populates="answers")
