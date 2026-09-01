import uuid
from datetime import datetime

from pydantic import BaseModel

from app.models.suspicious_event import SuspiciousEventType


class EventCreateRequest(BaseModel):
    event_type: SuspiciousEventType
    confidence: float | None = None
    description: str | None = None


class EventResponse(BaseModel):
    id: uuid.UUID
    event_type: SuspiciousEventType
    confidence: float | None
    description: str | None
    created_at: datetime

    class Config:
        from_attributes = True
