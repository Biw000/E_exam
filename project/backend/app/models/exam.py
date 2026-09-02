import uuid
from datetime import datetime

from sqlalchemy import Column, String, Integer, Float, DateTime, Text, Boolean, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.database import Base


class Exam(Base):
    __tablename__ = "exams"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    duration = Column(Integer, nullable=False)  # minutes
    start_time = Column(DateTime, nullable=False)
    end_time = Column(DateTime, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    subject_id = Column(
        UUID(as_uuid=True), ForeignKey("subjects.id", ondelete="SET NULL"), nullable=True, index=True
    )
    # Percentage of the total score a student must reach to be counted as
    # passing in the results summary. Purely for reporting - it never blocks
    # anyone from taking or submitting the exam.
    passing_percentage = Column(Float, nullable=False, default=50.0)

    subject = relationship("Subject", back_populates="exams")
    questions = relationship(
        "Question", back_populates="exam", cascade="all, delete-orphan", order_by="Question.order"
    )
    attempts = relationship("ExamAttempt", back_populates="exam", cascade="all, delete-orphan")


class Question(Base):
    __tablename__ = "questions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    exam_id = Column(UUID(as_uuid=True), ForeignKey("exams.id", ondelete="CASCADE"), nullable=False, index=True)
    question_text = Column(Text, nullable=False)
    score = Column(Integer, nullable=False, default=1)
    order = Column(Integer, nullable=False, default=0)

    exam = relationship("Exam", back_populates="questions")
    choices = relationship(
        "Choice", back_populates="question", cascade="all, delete-orphan", order_by="Choice.order"
    )
    answers = relationship("Answer", back_populates="question")


class Choice(Base):
    __tablename__ = "choices"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    question_id = Column(
        UUID(as_uuid=True), ForeignKey("questions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    choice_text = Column(String(500), nullable=False)
    is_correct = Column(Boolean, nullable=False, default=False)
    order = Column(Integer, nullable=False, default=0)

    question = relationship("Question", back_populates="choices")
