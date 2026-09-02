import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
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


# ---------------------------------------------------------------------------
# Exam statistics
# ---------------------------------------------------------------------------

class ScoreBucket(BaseModel):
    label: str
    count: int


class ExamStatsResponse(BaseModel):
    exam_id: uuid.UUID
    exam_title: str
    subject_name: str | None
    total_score: int
    passing_percentage: float
    participants: int
    submitted: int
    in_progress: int
    average_score: float | None
    average_percentage: float | None
    highest_score: int | None
    lowest_score: int | None
    passed: int
    failed: int
    pass_rate: float | None
    distribution: list[ScoreBucket]


@router.get("/api/admin/exams/{exam_id}/stats", response_model=ExamStatsResponse)
def exam_stats(exam_id: uuid.UUID, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    """
    Summary of one exam's results.

    Only graded (submitted) attempts count towards the averages and the pass
    rate. Including in-progress attempts would drag every average down with
    scores that are not final yet, so they are reported separately instead.
    """
    exam = db.query(Exam).options(joinedload(Exam.subject)).filter(Exam.id == exam_id).first()
    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="ไม่พบข้อสอบนี้")

    total_score = _total_score_for_exam(db, exam_id)
    attempts = db.query(ExamAttempt).filter(ExamAttempt.exam_id == exam_id).all()

    graded = [a for a in attempts if a.score is not None]
    scores = [a.score for a in graded]
    in_progress = len(attempts) - len(graded)

    pass_mark = (exam.passing_percentage or 50.0) / 100 * total_score if total_score else 0
    passed = sum(1 for s in scores if s >= pass_mark)
    failed = len(scores) - passed

    buckets = [("0-49%", 0), ("50-59%", 0), ("60-69%", 0), ("70-79%", 0), ("80-89%", 0), ("90-100%", 0)]
    counts = dict(buckets)
    for s in scores:
        pct = (s / total_score * 100) if total_score else 0
        if pct < 50:
            counts["0-49%"] += 1
        elif pct < 60:
            counts["50-59%"] += 1
        elif pct < 70:
            counts["60-69%"] += 1
        elif pct < 80:
            counts["70-79%"] += 1
        elif pct < 90:
            counts["80-89%"] += 1
        else:
            counts["90-100%"] += 1

    average = sum(scores) / len(scores) if scores else None

    return ExamStatsResponse(
        exam_id=exam.id,
        exam_title=exam.title,
        subject_name=exam.subject.name if exam.subject else None,
        total_score=total_score,
        passing_percentage=exam.passing_percentage or 50.0,
        participants=len(attempts),
        submitted=len(graded),
        in_progress=in_progress,
        average_score=round(average, 2) if average is not None else None,
        average_percentage=(
            round(average / total_score * 100, 1) if average is not None and total_score else None
        ),
        highest_score=max(scores) if scores else None,
        lowest_score=min(scores) if scores else None,
        passed=passed,
        failed=failed,
        pass_rate=round(passed / len(scores) * 100, 1) if scores else None,
        distribution=[ScoreBucket(label=label, count=counts[label]) for label, _ in buckets],
    )
