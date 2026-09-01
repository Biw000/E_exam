import enum
import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Float, String
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship

from app.database import Base


class EventSeverity(str, enum.Enum):
    """
    How much attention an event deserves. This is a triage aid for the person
    reviewing the log - it is deliberately NOT a verdict. No single event, and
    no severity level, means the student cheated.
    """

    INFO = "INFO"
    WARNING = "WARNING"
    SUSPICIOUS = "SUSPICIOUS"


class SuspiciousEventType(str, enum.Enum):
    """
    Stored in the database as a plain string, so adding a member here needs no
    database migration.
    """

    # --- face state ---
    FACE_OK = "FACE_OK"
    NO_FACE = "NO_FACE"
    MULTIPLE_FACES = "MULTIPLE_FACES"
    FACE_MISMATCH = "FACE_MISMATCH"

    # --- head pose (raised only after a sustained duration, never instantly) ---
    LOOKING_LEFT = "LOOKING_LEFT"
    LOOKING_RIGHT = "LOOKING_RIGHT"
    LOOKING_UP = "LOOKING_UP"
    LOOKING_DOWN = "LOOKING_DOWN"
    HEAD_POSE_WARNING = "HEAD_POSE_WARNING"

    # --- browser / window activity ---
    TAB_SWITCH = "TAB_SWITCH"
    WINDOW_BLUR = "WINDOW_BLUR"
    WINDOW_FOCUS = "WINDOW_FOCUS"
    FULLSCREEN_EXIT = "FULLSCREEN_EXIT"

    # --- clipboard / input ---
    COPY_ATTEMPT = "COPY_ATTEMPT"
    CUT_ATTEMPT = "CUT_ATTEMPT"
    PASTE_ATTEMPT = "PASTE_ATTEMPT"
    CONTEXT_MENU = "CONTEXT_MENU"

    # --- hardware ---
    CAMERA_DISABLED = "CAMERA_DISABLED"


# Default severity per event type. The frontend may not set severity itself;
# the backend always resolves it from this map so the classification stays
# consistent no matter which client sent the event.
DEFAULT_SEVERITY: dict[str, EventSeverity] = {
    SuspiciousEventType.FACE_OK.value: EventSeverity.INFO,
    SuspiciousEventType.WINDOW_FOCUS.value: EventSeverity.INFO,
    SuspiciousEventType.NO_FACE.value: EventSeverity.WARNING,
    SuspiciousEventType.LOOKING_LEFT.value: EventSeverity.WARNING,
    SuspiciousEventType.LOOKING_RIGHT.value: EventSeverity.WARNING,
    SuspiciousEventType.LOOKING_UP.value: EventSeverity.WARNING,
    SuspiciousEventType.LOOKING_DOWN.value: EventSeverity.WARNING,
    SuspiciousEventType.HEAD_POSE_WARNING.value: EventSeverity.WARNING,
    SuspiciousEventType.TAB_SWITCH.value: EventSeverity.WARNING,
    SuspiciousEventType.WINDOW_BLUR.value: EventSeverity.WARNING,
    SuspiciousEventType.FULLSCREEN_EXIT.value: EventSeverity.WARNING,
    SuspiciousEventType.COPY_ATTEMPT.value: EventSeverity.WARNING,
    SuspiciousEventType.CUT_ATTEMPT.value: EventSeverity.WARNING,
    SuspiciousEventType.PASTE_ATTEMPT.value: EventSeverity.WARNING,
    SuspiciousEventType.CONTEXT_MENU.value: EventSeverity.INFO,
    SuspiciousEventType.CAMERA_DISABLED.value: EventSeverity.WARNING,
    SuspiciousEventType.MULTIPLE_FACES.value: EventSeverity.SUSPICIOUS,
    SuspiciousEventType.FACE_MISMATCH.value: EventSeverity.SUSPICIOUS,
}

# Weight used to build a review-priority score for the admin log. Higher means
# "look at this attempt first", not "this student cheated".
SEVERITY_WEIGHT: dict[str, int] = {
    EventSeverity.INFO.value: 0,
    EventSeverity.WARNING.value: 2,
    EventSeverity.SUSPICIOUS.value: 5,
}


def resolve_severity(event_type: str) -> EventSeverity:
    return DEFAULT_SEVERITY.get(event_type, EventSeverity.INFO)


class SuspiciousEvent(Base):
    __tablename__ = "suspicious_events"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    attempt_id = Column(
        UUID(as_uuid=True), ForeignKey("exam_attempts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    event_type = Column(String(50), nullable=False, index=True)
    severity = Column(String(20), nullable=False, default=EventSeverity.INFO.value, index=True)
    confidence = Column(Float, nullable=True)
    description = Column(String(500), nullable=True)
    # Free-form context: head pose angles, duration held, aggregated repeat
    # count, etc. Never holds a face embedding or a raw image.
    event_metadata = Column(JSONB, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)

    attempt = relationship("ExamAttempt", back_populates="suspicious_events")
