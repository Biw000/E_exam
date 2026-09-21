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
        .options(
            joinedload(ExamAttempt.exam).joinedload(Exam.subject),
            joinedload(ExamAttempt.user),
        )
        .order_by(ExamAttempt.started_at.desc())
        .all()
    )
    results = []
    for attempt in attempts:
        total = _total_score_for_exam(db, attempt.exam_id)
        results.append(
            AdminResultResponse(
                attempt_id=attempt.id,
                user_id=attempt.user_id,
                student_name=attempt.user.name,
                student_email=attempt.user.email,
                exam_id=attempt.exam_id,
                exam_title=attempt.exam.title,
                subject_name=attempt.exam.subject.name if attempt.exam.subject else None,
                passing_percentage=attempt.exam.passing_percentage or 50.0,
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


# ---------------------------------------------------------------------------
# Per-student report
# ---------------------------------------------------------------------------

class StudentAttemptRow(BaseModel):
    attempt_id: uuid.UUID
    exam_id: uuid.UUID
    exam_title: str
    subject_name: str | None
    status: str
    score: int | None
    total_score: int
    percentage: float | None
    passed: bool | None
    passing_percentage: float
    started_at: str
    submitted_at: str | None
    terminated_reason: str | None
    warning_events: int
    suspicious_events: int


class StudentReportResponse(BaseModel):
    user_id: uuid.UUID
    name: str
    email: str
    total_attempts: int
    graded_attempts: int
    terminated_attempts: int
    average_percentage: float | None
    best_percentage: float | None
    passed_count: int
    failed_count: int
    attempts: list[StudentAttemptRow]


@router.get("/api/admin/users/{user_id}/results", response_model=StudentReportResponse)
def student_report(
    user_id: uuid.UUID, db: Session = Depends(get_db), admin: User = Depends(require_admin)
):
    """
    Every attempt one student has made, with a summary on top.

    Percentages rather than raw scores are averaged, because exams have
    different totals and averaging 8/10 with 40/100 as raw numbers is
    meaningless.
    """
    from app.models.suspicious_event import EventSeverity

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="ไม่พบผู้ใช้นี้")

    attempts = (
        db.query(ExamAttempt)
        .options(joinedload(ExamAttempt.exam).joinedload(Exam.subject))
        .filter(ExamAttempt.user_id == user_id)
        .order_by(ExamAttempt.started_at.desc())
        .all()
    )

    # One grouped query for event counts instead of one query per attempt.
    from sqlalchemy import func

    counts: dict[tuple, int] = {}
    if attempts:
        rows = (
            db.query(SuspiciousEvent.attempt_id, SuspiciousEvent.severity, func.count(SuspiciousEvent.id))
            .filter(SuspiciousEvent.attempt_id.in_([a.id for a in attempts]))
            .group_by(SuspiciousEvent.attempt_id, SuspiciousEvent.severity)
            .all()
        )
        counts = {(attempt_id, severity): n for attempt_id, severity, n in rows}

    totals: dict = {}
    result_rows: list[StudentAttemptRow] = []
    percentages: list[float] = []
    passed_count = failed_count = terminated = 0

    for attempt in attempts:
        exam = attempt.exam
        if exam.id not in totals:
            totals[exam.id] = _total_score_for_exam(db, exam.id)
        total = totals[exam.id]
        pass_pct = exam.passing_percentage or 50.0

        pct = None
        passed = None
        if attempt.score is not None and total:
            pct = round(attempt.score / total * 100, 1)
            passed = pct >= pass_pct
            percentages.append(pct)
            if passed:
                passed_count += 1
            else:
                failed_count += 1

        status_value = attempt.status.value if hasattr(attempt.status, "value") else attempt.status
        if status_value == "terminated":
            terminated += 1

        result_rows.append(
            StudentAttemptRow(
                attempt_id=attempt.id,
                exam_id=exam.id,
                exam_title=exam.title,
                subject_name=exam.subject.name if exam.subject else None,
                status=status_value,
                score=attempt.score,
                total_score=total,
                percentage=pct,
                passed=passed,
                passing_percentage=pass_pct,
                started_at=attempt.started_at.isoformat(),
                submitted_at=attempt.submitted_at.isoformat() if attempt.submitted_at else None,
                terminated_reason=getattr(attempt, "terminated_reason", None),
                warning_events=counts.get((attempt.id, EventSeverity.WARNING.value), 0),
                suspicious_events=counts.get((attempt.id, EventSeverity.SUSPICIOUS.value), 0),
            )
        )

    return StudentReportResponse(
        user_id=user.id,
        name=user.name,
        email=user.email,
        total_attempts=len(attempts),
        graded_attempts=len(percentages),
        terminated_attempts=terminated,
        average_percentage=round(sum(percentages) / len(percentages), 1) if percentages else None,
        best_percentage=max(percentages) if percentages else None,
        passed_count=passed_count,
        failed_count=failed_count,
        attempts=result_rows,
    )
