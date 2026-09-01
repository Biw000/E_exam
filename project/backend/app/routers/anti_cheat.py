import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import require_student
from app.models.user import User
from app.models.attempt import ExamAttempt
from app.models.face_embedding import FaceEmbedding
from app.models.suspicious_event import SuspiciousEvent, SuspiciousEventType
from app.schemas.event import EventCreateRequest, EventResponse
from app.schemas.face import FaceCheckRequest, FaceCheckResponse
from app.services import face_service

router = APIRouter(tags=["anti-cheat"])


def _get_owned_attempt(db: Session, attempt_id: uuid.UUID, user: User) -> ExamAttempt:
    attempt = db.query(ExamAttempt).filter(ExamAttempt.id == attempt_id).first()
    if not attempt:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attempt not found")
    if attempt.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your attempt")
    return attempt


@router.post("/api/attempts/{attempt_id}/events", response_model=EventResponse, status_code=status.HTTP_201_CREATED)
def log_event(attempt_id: uuid.UUID, payload: EventCreateRequest, db: Session = Depends(get_db),
              student: User = Depends(require_student)):
    attempt = _get_owned_attempt(db, attempt_id, student)
    event = SuspiciousEvent(
        attempt_id=attempt.id,
        event_type=payload.event_type,
        confidence=payload.confidence,
        description=payload.description,
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return event


@router.get("/api/attempts/{attempt_id}/events", response_model=list[EventResponse])
def list_events_for_student(attempt_id: uuid.UUID, db: Session = Depends(get_db),
                             student: User = Depends(require_student)):
    attempt = _get_owned_attempt(db, attempt_id, student)
    return (
        db.query(SuspiciousEvent)
        .filter(SuspiciousEvent.attempt_id == attempt.id)
        .order_by(SuspiciousEvent.created_at.desc())
        .all()
    )


@router.post("/api/attempts/{attempt_id}/face-check", response_model=FaceCheckResponse)
def face_check(attempt_id: uuid.UUID, payload: FaceCheckRequest, db: Session = Depends(get_db),
                student: User = Depends(require_student)):
    """
    Called periodically (every ~5-10s) by the exam page. Analyzes a single
    frame, logs the appropriate SuspiciousEvent, and returns the result so
    the frontend can show live status without deciding anything itself.
    """
    attempt = _get_owned_attempt(db, attempt_id, student)
    stored = db.query(FaceEmbedding).filter(FaceEmbedding.user_id == student.id).first()

    try:
        image = face_service.decode_base64_image(payload.image_base64)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid face image")

    result = face_service.analyze_frame(image, stored.embedding if stored else None)

    if result.face_count == 0:
        event_type, confidence, message = SuspiciousEventType.NO_FACE, None, "No face detected"
    elif result.face_count > 1:
        event_type, confidence, message = SuspiciousEventType.MULTIPLE_FACES, None, "Multiple faces detected"
    elif stored and result.embedding is not None:
        distance = face_service.compare_faces(result.embedding, stored.embedding)
        from app.config import settings
        if distance <= settings.FACE_MATCH_THRESHOLD:
            event_type, confidence, message = SuspiciousEventType.FACE_OK, distance, "Face verified"
        else:
            event_type, confidence, message = SuspiciousEventType.FACE_MISMATCH, distance, "Face does not match"
    else:
        event_type, confidence, message = SuspiciousEventType.FACE_OK, None, "Face detected"

    db.add(SuspiciousEvent(attempt_id=attempt.id, event_type=event_type, confidence=confidence, description=message))
    db.commit()

    return FaceCheckResponse(event_type=event_type.value, confidence=confidence, message=message)
