import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class ChoiceCreate(BaseModel):
    choice_text: str
    is_correct: bool = False
    order: int = 0


class ChoiceResponse(BaseModel):
    id: uuid.UUID
    choice_text: str
    order: int
    # is_correct intentionally omitted for student-facing responses

    class Config:
        from_attributes = True


class ChoiceAdminResponse(ChoiceResponse):
    is_correct: bool


class QuestionCreate(BaseModel):
    question_text: str
    score: int = Field(default=1, ge=0)
    order: int = 0
    choices: list[ChoiceCreate] = Field(default_factory=list)


class QuestionUpdate(BaseModel):
    question_text: str | None = None
    score: int | None = None
    order: int | None = None


class QuestionResponse(BaseModel):
    id: uuid.UUID
    question_text: str
    score: int
    order: int
    choices: list[ChoiceResponse]

    class Config:
        from_attributes = True


class QuestionAdminResponse(BaseModel):
    id: uuid.UUID
    question_text: str
    score: int
    order: int
    choices: list[ChoiceAdminResponse]

    class Config:
        from_attributes = True


class ExamCreate(BaseModel):
    title: str
    description: str | None = None
    duration: int = Field(gt=0, description="Duration in minutes")
    start_time: datetime
    end_time: datetime
    subject_id: uuid.UUID | None = None
    passing_percentage: float = Field(default=50.0, ge=0, le=100)
    join_code: str | None = Field(default=None, max_length=12)
    max_attempts: int = Field(default=1, ge=0, le=50)
    shuffle_questions: bool = True
    strict_mode: bool = False
    violation_limit: int = Field(default=1, ge=1, le=20)


class ExamUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    duration: int | None = None
    start_time: datetime | None = None
    end_time: datetime | None = None
    subject_id: uuid.UUID | None = None
    passing_percentage: float | None = Field(default=None, ge=0, le=100)
    join_code: str | None = Field(default=None, max_length=12)
    # These were missing here while present on ExamCreate, so edits to the
    # proctoring settings were accepted by the API and silently dropped by
    # Pydantic before they ever reached the model.
    max_attempts: int | None = Field(default=None, ge=0, le=50)
    shuffle_questions: bool | None = None
    strict_mode: bool | None = None
    violation_limit: int | None = Field(default=None, ge=1, le=20)


class ExamListResponse(BaseModel):
    id: uuid.UUID
    title: str
    description: str | None
    duration: int
    start_time: datetime
    end_time: datetime
    status: str  # upcoming | open | closed
    subject_id: uuid.UUID | None = None
    subject_name: str | None = None
    passing_percentage: float = 50.0
    # Students are told a code is needed, never what the code is.
    requires_code: bool = False
    max_attempts: int = 1
    shuffle_questions: bool = True
    strict_mode: bool = False
    violation_limit: int = 1
    # Filled in for students so the UI can say "ทำได้อีก 1 ครั้ง".
    attempts_used: int = 0

    class Config:
        from_attributes = True


class ExamDetailResponse(ExamListResponse):
    questions: list[QuestionResponse]


class ExamAdminDetailResponse(ExamListResponse):
    questions: list[QuestionAdminResponse]
    join_code: str | None = None


class JoinByCodeRequest(BaseModel):
    code: str = Field(min_length=1, max_length=12)


class JoinByCodeResponse(BaseModel):
    id: uuid.UUID
    title: str
    status: str
