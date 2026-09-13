import uuid
from datetime import datetime

from pydantic import BaseModel

from app.models.attempt import AttemptStatus
from app.schemas.exam import QuestionResponse


class TerminateAttemptRequest(BaseModel):
    reason: str
    detail: str | None = None


class StartAttemptRequest(BaseModel):
    face_image_base64: str
    # Required only when the exam has a room code configured.
    join_code: str | None = None


class SavedAnswer(BaseModel):
    question_id: uuid.UUID
    choice_id: uuid.UUID | None


class AttemptResponse(BaseModel):
    id: uuid.UUID
    exam_id: uuid.UUID
    started_at: datetime
    submitted_at: datetime | None
    status: AttemptStatus
    duration: int  # minutes, copied from exam for convenience
    server_time: datetime  # authoritative "now" so frontend can compute remaining time
    questions: list[QuestionResponse]
    answers: list[SavedAnswer] = []  # previously saved answers, so a page refresh loses nothing

    class Config:
        from_attributes = True


class SubmitAnswerRequest(BaseModel):
    question_id: uuid.UUID
    choice_id: uuid.UUID | None = None


class SubmitAnswerResponse(BaseModel):
    question_id: uuid.UUID
    choice_id: uuid.UUID | None
    saved_at: datetime


class SubmitExamResponse(BaseModel):
    id: uuid.UUID
    score: int
    total_score: int
    percentage: float
    submitted_at: datetime


class MyResultResponse(BaseModel):
    attempt_id: uuid.UUID
    exam_id: uuid.UUID
    exam_title: str
    score: int | None
    total_score: int
    percentage: float | None
    started_at: datetime
    submitted_at: datetime | None
    status: AttemptStatus


class AdminResultResponse(BaseModel):
    attempt_id: uuid.UUID
    student_name: str
    student_email: str
    exam_id: uuid.UUID
    exam_title: str
    subject_name: str | None = None
    passing_percentage: float = 50.0
    score: int | None
    total_score: int
    started_at: datetime
    submitted_at: datetime | None
    status: AttemptStatus
