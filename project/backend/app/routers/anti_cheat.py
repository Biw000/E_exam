import uuid
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.deps import require_student
from app.models.user import User
from app.models.attempt import ExamAttempt
from app.models.face_embedding import FaceEmbedding
from app.models.suspicious_event import SuspiciousEvent, SuspiciousEventType, resolve_severity
from app.schemas.event import EventCreateRequest, EventResponse
from app.schemas.face import FaceCheckRequest, FaceCheckResponse
from app.services import face_service

router = APIRouter(tags=["anti-cheat"])

# Event types that repeat constantly while a condition persists. Writing one
# row per detection would flood the table, so identical consecutive events
# inside the cooldown window are folded into the existing row instead.
_COOLDOWN_EVENTS = {
    SuspiciousEventType.NO_FACE.value,
    SuspiciousEventType.FACE_OK.value,
    SuspiciousEventType.MULTIPLE_FACES.value,
    SuspiciousEventType.FACE_MISMATCH.value,
    SuspiciousEventType.LOOKING_LEFT.value,
    SuspiciousEventType.LOOKING_RIGHT.value,
    SuspiciousEventType.LOOKING_UP.value,
    SuspiciousEventType.LOOKING_DOWN.value,
    SuspiciousEventType.HEAD_POSE_WARNING.value,
    SuspiciousEventType.WINDOW_BLUR.value,
    SuspiciousEventType.CONTEXT_MENU.value,
}


def _get_owned_attempt(db: Session, attempt_id: uuid.UUID, user: User) -> ExamAttempt:
    attempt = db.query(ExamAttempt).filter(ExamAttempt.id == attempt_id).first()
    if not attempt:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attempt not found")
    if attempt.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your attempt")
    return attempt


def record_event(
    db: Session,
    attempt_id: uuid.UUID,
    event_type: str,
    confidence: float | None = None,
    description: str | None = None,
    event_metadata: dict | None = None,
) -> SuspiciousEvent:
    """
    Persist one event, applying severity resolution and cooldown aggregation.

    Aggregation keeps a `repeat_count` in the metadata rather than inserting a
    new row, so an admin sees "NO_FACE x 24" instead of 24 separate lines.
    """
    cooldown = timedelta(seconds=settings.EVENT_COOLDOWN_SECONDS)

    if event_type in _COOLDOWN_EVENTS and cooldown.total_seconds() > 0:
        cutoff = datetime.utcnow() - cooldown
        recent = (
            db.query(SuspiciousEvent)
            .filter(
                SuspiciousEvent.attempt_id == attempt_id,
                SuspiciousEvent.event_type == event_type,
                SuspiciousEvent.created_at >= cutoff,
            )
            .order_by(SuspiciousEvent.created_at.desc())
            .first()
        )
        if recent is not None:
            merged = dict(recent.event_metadata or {})
            merged["repeat_count"] = int(merged.get("repeat_count", 1)) + 1
            merged["last_seen_at"] = datetime.utcnow().isoformat()
            if event_metadata:
                merged.update(event_metadata)
            # Reassign (rather than mutate) so SQLAlchemy marks JSONB dirty.
            recent.event_metadata = merged
            if confidence is not None:
                recent.confidence = confidence
            db.commit()
            db.refresh(recent)
            return recent

    event = SuspiciousEvent(
        attempt_id=attempt_id,
        event_type=event_type,
        severity=resolve_severity(event_type).value,
        confidence=confidence,
        description=description,
        event_metadata=event_metadata,
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return event


@router.post(
    "/api/attempts/{attempt_id}/events",
    response_model=EventResponse,
    status_code=status.HTTP_201_CREATED,
)
def log_event(
    attempt_id: uuid.UUID,
    payload: EventCreateRequest,
    db: Session = Depends(get_db),
    student: User = Depends(require_student),
):
    attempt = _get_owned_attempt(db, attempt_id, student)
    return record_event(
        db,
        attempt.id,
        payload.event_type.value,
        confidence=payload.confidence,
        description=payload.description,
        event_metadata=payload.event_metadata,
    )


@router.get("/api/attempts/{attempt_id}/events", response_model=list[EventResponse])
def list_events_for_student(
    attempt_id: uuid.UUID,
    db: Session = Depends(get_db),
    student: User = Depends(require_student),
):
    attempt = _get_owned_attempt(db, attempt_id, student)
    return (
        db.query(SuspiciousEvent)
        .filter(SuspiciousEvent.attempt_id == attempt.id)
        .order_by(SuspiciousEvent.created_at.desc())
        .all()
    )


@router.post("/api/attempts/{attempt_id}/face-check", response_model=FaceCheckResponse)
def face_check(
    attempt_id: uuid.UUID,
    payload: FaceCheckRequest,
    db: Session = Depends(get_db),
    student: User = Depends(require_student),
):
    """
    Called periodically by the exam page. Analyzes a single frame, logs the
    appropriate event, and returns the result so the frontend can show live
    status without deciding anything itself.

    The frame is compared against every enrolled pose and the best (smallest)
    distance wins - a student who tilts their head slightly should match their
    LEFT or RIGHT enrollment sample rather than fail against CENTER alone.
    """
    attempt = _get_owned_attempt(db, attempt_id, student)
    stored = db.query(FaceEmbedding).filter(FaceEmbedding.user_id == student.id).all()

    try:
        image = face_service.decode_base64_image(payload.image_base64)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid face image")

    reference = stored[0].embedding if stored else None
    result = face_service.analyze_frame(image, reference)

    metadata: dict = {}

    if result.face_count == 0:
        event_type = SuspiciousEventType.NO_FACE.value
        confidence, message = None, "No face detected"
    elif result.face_count > 1:
        event_type = SuspiciousEventType.MULTIPLE_FACES.value
        confidence, message = None, "Multiple faces detected"
        metadata["face_count"] = result.face_count
    elif stored and result.embedding is not None:
        distances = {
            row.pose_type: face_service.compare_faces(result.embedding, row.embedding)
            for row in stored
        }
        best_pose = min(distances, key=distances.get)
        distance = distances[best_pose]
        metadata["matched_pose"] = best_pose
        metadata["threshold"] = settings.FACE_MATCH_THRESHOLD

        if distance <= settings.FACE_MATCH_THRESHOLD:
            event_type = SuspiciousEventType.FACE_OK.value
            confidence, message = distance, "Face verified"
        else:
            event_type = SuspiciousEventType.FACE_MISMATCH.value
            confidence, message = distance, "Face does not match"
    else:
        event_type = SuspiciousEventType.FACE_OK.value
        confidence, message = None, "Face detected"

    record_event(
        db,
        attempt.id,
        event_type,
        confidence=confidence,
        description=message,
        event_metadata=metadata or None,
    )

    return FaceCheckResponse(event_type=event_type, confidence=confidence, message=message)
