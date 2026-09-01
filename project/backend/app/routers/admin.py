from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import require_admin
from app.models.user import User, UserRole
from app.models.exam import Exam
from app.models.attempt import ExamAttempt
from app.models.suspicious_event import SuspiciousEvent
from pydantic import BaseModel

router = APIRouter(prefix="/api/admin", tags=["admin"])


class DashboardStats(BaseModel):
    total_exams: int
    total_students: int
    total_attempts: int
    total_suspicious_events: int


@router.get("/dashboard", response_model=DashboardStats)
def dashboard(db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    return DashboardStats(
        total_exams=db.query(func.count(Exam.id)).scalar() or 0,
        total_students=db.query(func.count(User.id)).filter(User.role == UserRole.student).scalar() or 0,
        total_attempts=db.query(func.count(ExamAttempt.id)).scalar() or 0,
        total_suspicious_events=db.query(func.count(SuspiciousEvent.id)).scalar() or 0,
    )
