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


class ExamUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    duration: int | None = None
    start_time: datetime | None = None
    end_time: datetime | None = None


class ExamListResponse(BaseModel):
    id: uuid.UUID
    title: str
    description: str | None
    duration: int
    start_time: datetime
    end_time: datetime
    status: str  # upcoming | open | closed

    class Config:
        from_attributes = True


class ExamDetailResponse(ExamListResponse):
    questions: list[QuestionResponse]


class ExamAdminDetailResponse(ExamListResponse):
    questions: list[QuestionAdminResponse]
