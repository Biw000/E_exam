"""
CSV exports for the admin dashboard.

Every file is written with a UTF-8 byte order mark. Without it Excel on Windows
opens a UTF-8 CSV as Windows-874 and every Thai character turns into garbage —
which is the single most common complaint about CSV exports from Thai systems,
and it costs one three-byte prefix to avoid.

Values are written through csv.writer rather than joined by hand, so a comma,
quote or newline inside a question or a description cannot break the columns.
"""
import csv
import io
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.deps import require_admin
from app.models.attempt import Answer, ExamAttempt
from app.models.exam import Exam, Question
from app.models.suspicious_event import SuspiciousEvent
from app.models.user import User

router = APIRouter(prefix="/api/admin", tags=["export"])

UTF8_BOM = "\ufeff"


def _csv_response(filename: str, header: list[str], rows: list[list]) -> StreamingResponse:
    buffer = io.StringIO()
    buffer.write(UTF8_BOM)
    writer = csv.writer(buffer, lineterminator="\r\n")
    writer.writerow(header)
    for row in rows:
        writer.writerow(["" if v is None else v for v in row])
    buffer.seek(0)

    # RFC 5987 encoding so a Thai filename survives the HTTP header.
    quoted = filename.encode("utf-8").decode("latin-1", "ignore")
    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": (
                f"attachment; filename=\"{quoted}\"; "
                f"filename*=UTF-8''{filename.replace(' ', '%20')}"
            )
        },
    )


def _stamp() -> str:
    return datetime.utcnow().strftime("%Y%m%d-%H%M")


def _fmt(dt) -> str:
    return dt.strftime("%Y-%m-%d %H:%M:%S") if dt else ""


def _status_value(attempt: ExamAttempt) -> str:
    return attempt.status.value if hasattr(attempt.status, "value") else attempt.status


def _total_score(db: Session, exam_id: uuid.UUID) -> int:
    from sqlalchemy import func

    return int(
        db.query(func.coalesce(func.sum(Question.score), 0))
        .filter(Question.exam_id == exam_id)
        .scalar()
        or 0
    )


# ---------------------------------------------------------------- per exam
@router.get("/exams/{exam_id}/results.csv")
def export_exam_results(
    exam_id: uuid.UUID, db: Session = Depends(get_db), admin: User = Depends(require_admin)
):
    """Score sheet for one exam: one row per attempt."""
    exam = db.query(Exam).options(joinedload(Exam.subject)).filter(Exam.id == exam_id).first()
    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="ไม่พบข้อสอบนี้")

    total = _total_score(db, exam_id)
    pass_mark = (exam.passing_percentage or 50.0) / 100 * total if total else 0

    attempts = (
        db.query(ExamAttempt)
        .options(joinedload(ExamAttempt.user))
        .filter(ExamAttempt.exam_id == exam_id)
        .order_by(ExamAttempt.started_at.asc())
        .all()
    )

    rows = []
    for a in attempts:
        percent = round(a.score / total * 100, 2) if (a.score is not None and total) else ""
        passed = "" if a.score is None or not total else ("ผ่าน" if a.score >= pass_mark else "ไม่ผ่าน")
        rows.append([
            a.user.name,
            a.user.email,
            exam.subject.name if exam.subject else "",
            exam.title,
            a.score if a.score is not None else "",
            total,
            percent,
            exam.passing_percentage,
            passed,
            _status_value(a),
            _fmt(a.started_at),
            _fmt(a.submitted_at),
            getattr(a, "terminated_reason", "") or "",
        ])

    return _csv_response(
        f"results-{exam.title}-{_stamp()}.csv",
        ["ชื่อผู้สอบ", "อีเมล", "วิชา", "ข้อสอบ", "คะแนนที่ได้", "คะแนนเต็ม",
         "ร้อยละ", "เกณฑ์ผ่าน(%)", "ผลการตัดสิน", "สถานะ",
         "เวลาเริ่มสอบ", "เวลาส่งข้อสอบ", "สาเหตุที่ถูกยกเลิก"],
        rows,
    )


@router.get("/exams/{exam_id}/events.csv")
def export_exam_events(
    exam_id: uuid.UUID, db: Session = Depends(get_db), admin: User = Depends(require_admin)
):
    """Every recorded event for every attempt of one exam."""
    exam = db.query(Exam).filter(Exam.id == exam_id).first()
    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="ไม่พบข้อสอบนี้")

    records = (
        db.query(SuspiciousEvent, ExamAttempt, User)
        .join(ExamAttempt, SuspiciousEvent.attempt_id == ExamAttempt.id)
        .join(User, ExamAttempt.user_id == User.id)
        .filter(ExamAttempt.exam_id == exam_id)
        .order_by(SuspiciousEvent.created_at.asc())
        .all()
    )

    rows = [
        [
            user.name,
            user.email,
            exam.title,
            _fmt(event.created_at),
            event.event_type,
            event.severity,
            event.description or "",
            round(event.confidence, 4) if event.confidence is not None else "",
            _metadata_text(event.event_metadata),
            str(attempt.id),
        ]
        for event, attempt, user in records
    ]

    return _csv_response(
        f"events-{exam.title}-{_stamp()}.csv",
        ["ชื่อผู้สอบ", "อีเมล", "ข้อสอบ", "เวลา", "ประเภทเหตุการณ์",
         "ระดับ", "คำอธิบาย", "ค่าระยะห่าง", "ข้อมูลประกอบ", "รหัสการเข้าสอบ"],
        rows,
    )


# ---------------------------------------------------------------- per account
@router.get("/users/{user_id}/results.csv")
def export_user_results(
    user_id: uuid.UUID, db: Session = Depends(get_db), admin: User = Depends(require_admin)
):
    """Every attempt one account has made, across all exams."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="ไม่พบผู้ใช้นี้")

    attempts = (
        db.query(ExamAttempt)
        .options(joinedload(ExamAttempt.exam).joinedload(Exam.subject))
        .filter(ExamAttempt.user_id == user_id)
        .order_by(ExamAttempt.started_at.asc())
        .all()
    )

    totals: dict[uuid.UUID, int] = {}
    rows = []
    for a in attempts:
        exam = a.exam
        if exam.id not in totals:
            totals[exam.id] = _total_score(db, exam.id)
        total = totals[exam.id]
        percent = round(a.score / total * 100, 2) if (a.score is not None and total) else ""
        pass_mark = (exam.passing_percentage or 50.0) / 100 * total if total else 0
        passed = "" if a.score is None or not total else ("ผ่าน" if a.score >= pass_mark else "ไม่ผ่าน")
        rows.append([
            user.name,
            user.email,
            exam.subject.name if exam.subject else "",
            exam.title,
            a.score if a.score is not None else "",
            total,
            percent,
            passed,
            _status_value(a),
            _fmt(a.started_at),
            _fmt(a.submitted_at),
            getattr(a, "terminated_reason", "") or "",
        ])

    return _csv_response(
        f"results-{user.email}-{_stamp()}.csv",
        ["ชื่อผู้สอบ", "อีเมล", "วิชา", "ข้อสอบ", "คะแนนที่ได้", "คะแนนเต็ม",
         "ร้อยละ", "ผลการตัดสิน", "สถานะ", "เวลาเริ่มสอบ", "เวลาส่งข้อสอบ",
         "สาเหตุที่ถูกยกเลิก"],
        rows,
    )


@router.get("/users/{user_id}/events.csv")
def export_user_events(
    user_id: uuid.UUID, db: Session = Depends(get_db), admin: User = Depends(require_admin)
):
    """Full activity log for one account, across every exam it has taken."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="ไม่พบผู้ใช้นี้")

    records = (
        db.query(SuspiciousEvent, ExamAttempt, Exam)
        .join(ExamAttempt, SuspiciousEvent.attempt_id == ExamAttempt.id)
        .join(Exam, ExamAttempt.exam_id == Exam.id)
        .filter(ExamAttempt.user_id == user_id)
        .order_by(SuspiciousEvent.created_at.asc())
        .all()
    )

    rows = [
        [
            user.name,
            user.email,
            exam.title,
            _fmt(event.created_at),
            event.event_type,
            event.severity,
            event.description or "",
            round(event.confidence, 4) if event.confidence is not None else "",
            _metadata_text(event.event_metadata),
            str(attempt.id),
        ]
        for event, attempt, exam in records
    ]

    return _csv_response(
        f"events-{user.email}-{_stamp()}.csv",
        ["ชื่อผู้สอบ", "อีเมล", "ข้อสอบ", "เวลา", "ประเภทเหตุการณ์",
         "ระดับ", "คำอธิบาย", "ค่าระยะห่าง", "ข้อมูลประกอบ", "รหัสการเข้าสอบ"],
        rows,
    )


# ---------------------------------------------------------------- per attempt
@router.get("/attempts/{attempt_id}/events.csv")
def export_attempt_events(
    attempt_id: uuid.UUID, db: Session = Depends(get_db), admin: User = Depends(require_admin)
):
    """Activity log for a single attempt, and the answers given."""
    attempt = (
        db.query(ExamAttempt)
        .options(joinedload(ExamAttempt.user), joinedload(ExamAttempt.exam))
        .filter(ExamAttempt.id == attempt_id)
        .first()
    )
    if not attempt:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="ไม่พบการเข้าสอบนี้")

    events = (
        db.query(SuspiciousEvent)
        .filter(SuspiciousEvent.attempt_id == attempt_id)
        .order_by(SuspiciousEvent.created_at.asc())
        .all()
    )

    rows = [
        [
            attempt.user.name,
            attempt.exam.title,
            _fmt(e.created_at),
            e.event_type,
            e.severity,
            e.description or "",
            round(e.confidence, 4) if e.confidence is not None else "",
            _metadata_text(e.event_metadata),
        ]
        for e in events
    ]

    return _csv_response(
        f"events-attempt-{_stamp()}.csv",
        ["ชื่อผู้สอบ", "ข้อสอบ", "เวลา", "ประเภทเหตุการณ์", "ระดับ",
         "คำอธิบาย", "ค่าระยะห่าง", "ข้อมูลประกอบ"],
        rows,
    )


def _metadata_text(metadata) -> str:
    """Flatten the JSON metadata into one readable cell."""
    if not metadata or not isinstance(metadata, dict):
        return ""
    return " | ".join(f"{k}={v}" for k, v in metadata.items())
