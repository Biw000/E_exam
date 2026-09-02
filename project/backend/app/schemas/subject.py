import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class SubjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    code: str | None = Field(default=None, max_length=50)
    description: str | None = None


class SubjectUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    code: str | None = Field(default=None, max_length=50)
    description: str | None = None


class SubjectResponse(BaseModel):
    id: uuid.UUID
    name: str
    code: str | None
    description: str | None
    created_at: datetime
    exam_count: int = 0

    class Config:
        from_attributes = True
