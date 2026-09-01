import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.deps import require_student, require_admin
from app.models.user import User
from app.models.attempt import ExamAttempt
from app.models.exam import Exam, Question
from app.schemas.attempt import MyResultResponse, AdminResultResponse
from app.schemas.event import EventResponse
from app.models.suspicious_event import SuspiciousEvent

router = APIRouter(tags=["results"])


def _total_score_for_exam(db: Session, exam_id) -> int:
    questions = db.query(Question).filter(Question.exam_id == exam_id).all()
    return sum(q.score for q in questions)


@router.get("/api/results/my", response_model=list[MyResultResponse])
def my_results(db: Session = Depends(get_db), student: User = Depends(require_student)):
    attempts = (
        db.query(ExamAttempt)
        .options(joinedload(ExamAttempt.exam))
        .filter(ExamAttempt.user_id == student.id)
        .order_by(ExamAttempt.started_at.desc())
        .all()
    )
    results = []
    for attempt in attempts:
        total = _total_score_for_exam(db, attempt.exam_id)
        percentage = round((attempt.score / total) * 100, 2) if attempt.score is not None and total > 0 else None
        results.append(
            MyResultResponse(
                attempt_id=attempt.id,
                exam_id=attempt.exam_id,
                exam_title=attempt.exam.title,
                score=attempt.score,
                total_score=total,
                percentage=percentage,
                started_at=attempt.started_at,
                submitted_at=attempt.submitted_at,
                status=attempt.status,
            )
        )
    return results


@router.get("/api/admin/results", response_model=list[AdminResultResponse])
def admin_results(db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    attempts = (
        db.query(ExamAttempt)
        .options(joinedload(ExamAttempt.exam), joinedload(ExamAttempt.user))
        .order_by(ExamAttempt.started_at.desc())
        .all()
    )
    results = []
    for attempt in attempts:
        total = _total_score_for_exam(db, attempt.exam_id)
        results.append(
            AdminResultResponse(
                attempt_id=attempt.id,
                student_name=attempt.user.name,
                student_email=attempt.user.email,
                exam_title=attempt.exam.title,
                score=attempt.score,
                total_score=total,
                started_at=attempt.started_at,
                submitted_at=attempt.submitted_at,
                status=attempt.status,
            )
        )
    return results


@router.get("/api/admin/attempts/{attempt_id}/events", response_model=list[EventResponse])
def admin_attempt_events(attempt_id: uuid.UUID, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    attempt = db.query(ExamAttempt).filter(ExamAttempt.id == attempt_id).first()
    if not attempt:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attempt not found")
    return (
        db.query(SuspiciousEvent)
        .filter(SuspiciousEvent.attempt_id == attempt_id)
        .order_by(SuspiciousEvent.created_at.asc())
        .all()
    )
