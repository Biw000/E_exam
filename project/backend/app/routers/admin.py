import uuid
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import require_admin
from app.models.attempt import AttemptStatus, ExamAttempt
from app.models.exam import Exam
from app.models.face_embedding import FaceEmbedding
from app.models.suspicious_event import EventSeverity, SuspiciousEvent
from app.models.user import User, UserRole

router = APIRouter(prefix="/api/admin", tags=["admin"])


class DashboardStats(BaseModel):
    total_exams: int
    total_students: int
    total_attempts: int
    total_suspicious_events: int


class AdminUserResponse(BaseModel):
    id: uuid.UUID
    name: str
    email: EmailStr
    role: str
    created_at: str
    attempt_count: int
    enrolled_poses: list[str]
    face_enrolled: bool


@router.get("/dashboard", response_model=DashboardStats)
def dashboard(db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    return DashboardStats(
        total_exams=db.query(func.count(Exam.id)).scalar() or 0,
        total_students=db.query(func.count(User.id)).filter(User.role == UserRole.student).scalar() or 0,
        total_attempts=db.query(func.count(ExamAttempt.id)).scalar() or 0,
        total_suspicious_events=db.query(func.count(SuspiciousEvent.id)).scalar() or 0,
    )


@router.get("/users", response_model=list[AdminUserResponse])
def list_users(db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    """
    Every account, newest first. Deliberately returns which poses are enrolled
    but never the embedding values themselves - an admin needs to know whether
    enrollment is complete, not what the biometric data contains.
    """
    users = db.query(User).order_by(User.created_at.desc()).all()

    attempt_counts = dict(
        db.query(ExamAttempt.user_id, func.count(ExamAttempt.id))
        .group_by(ExamAttempt.user_id)
        .all()
    )

    poses_by_user: dict[uuid.UUID, list[str]] = {}
    for user_id, pose in db.query(FaceEmbedding.user_id, FaceEmbedding.pose_type).all():
        poses_by_user.setdefault(user_id, []).append(pose)

    return [
        AdminUserResponse(
            id=user.id,
            name=user.name,
            email=user.email,
            role=user.role.value,
            created_at=user.created_at.isoformat(),
            attempt_count=attempt_counts.get(user.id, 0),
            enrolled_poses=sorted(poses_by_user.get(user.id, [])),
            face_enrolled=bool(poses_by_user.get(user.id)),
        )
        for user in users
    ]


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: uuid.UUID,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """
    Permanently remove an account along with its face embeddings, attempts,
    answers and event log (all cascade from the foreign keys).

    Two guards, because this cannot be undone: an admin cannot delete their own
    account mid-session, and the last remaining admin cannot be removed, which
    would lock everyone out of this dashboard for good.
    """
    if user_id == admin.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="ไม่สามารถลบบัญชีที่กำลังใช้งานอยู่ได้",
        )

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="ไม่พบบัญชีนี้")

    if user.role == UserRole.admin:
        remaining_admins = (
            db.query(func.count(User.id)).filter(User.role == UserRole.admin).scalar() or 0
        )
        if remaining_admins <= 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="ต้องมีบัญชีผู้ดูแลระบบอย่างน้อย 1 บัญชี",
            )

    db.delete(user)
    db.commit()


class AlertResponse(BaseModel):
    event_id: uuid.UUID
    attempt_id: uuid.UUID
    student_name: str
    student_email: EmailStr
    exam_title: str
    event_type: str
    severity: str
    description: str | None
    attempt_status: str
    created_at: str


@router.get("/alerts", response_model=list[AlertResponse])
def alerts(
    minutes: int = 180,
    limit: int = 50,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """
    Recent high-priority activity, newest first, for the proctor dashboard.

    Polled rather than pushed: a websocket would be the "real" answer, but it
    needs a connection that survives Render's free tier spinning the service
    down, and a 20-second poll is indistinguishable to a human watching a room.

    Only SUSPICIOUS events and terminated attempts appear here. Putting every
    warning in the feed would make it scroll too fast to be read, which is the
    same as having no alerts at all.
    """
    since = datetime.utcnow() - timedelta(minutes=max(1, minutes))

    rows = (
        db.query(SuspiciousEvent, ExamAttempt, User, Exam)
        .join(ExamAttempt, SuspiciousEvent.attempt_id == ExamAttempt.id)
        .join(User, ExamAttempt.user_id == User.id)
        .join(Exam, ExamAttempt.exam_id == Exam.id)
        .filter(SuspiciousEvent.created_at >= since)
        .filter(
            (SuspiciousEvent.severity == EventSeverity.SUSPICIOUS.value)
            | (SuspiciousEvent.event_type == "ATTEMPT_TERMINATED")
        )
        .order_by(SuspiciousEvent.created_at.desc())
        .limit(max(1, min(limit, 200)))
        .all()
    )

    return [
        AlertResponse(
            event_id=event.id,
            attempt_id=attempt.id,
            student_name=user.name,
            student_email=user.email,
            exam_title=exam.title,
            event_type=event.event_type,
            severity=event.severity,
            description=event.description,
            attempt_status=attempt.status,
            created_at=event.created_at.isoformat(),
        )
        for event, attempt, user, exam in rows
    ]
