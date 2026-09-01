import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

from app.models.suspicious_event import SuspiciousEventType, EventSeverity


class EventCreateRequest(BaseModel):
    event_type: SuspiciousEventType
    confidence: float | None = None
    description: str | None = Field(default=None, max_length=500)
    # Optional context from the client: head pose angles, how long a pose was
    # held, how many repeats were aggregated into this one event, etc.
    event_metadata: dict[str, Any] | None = None


class EventResponse(BaseModel):
    id: uuid.UUID
    event_type: str
    severity: EventSeverity
    confidence: float | None
    description: str | None
    event_metadata: dict[str, Any] | None
    created_at: datetime

    class Config:
        from_attributes = True
