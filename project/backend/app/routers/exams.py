import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.deps import get_current_user, require_admin
from app.models.user import User
from app.models.attempt import ExamAttempt
from app.models.exam import Exam, Question
from app.schemas.exam import (
    ExamCreate,
    ExamUpdate,
    ExamListResponse,
    ExamDetailResponse,
    ExamAdminDetailResponse,
    JoinByCodeRequest,
    JoinByCodeResponse,
)
from app.services.exam_service import get_exam_status

router = APIRouter(prefix="/api/exams", tags=["exams"])


def _to_list_response(exam: Exam, attempts_used: int = 0) -> ExamListResponse:
    return ExamListResponse(
        id=exam.id,
        title=exam.title,
        description=exam.description,
        duration=exam.duration,
        start_time=exam.start_time,
        end_time=exam.end_time,
        status=get_exam_status(exam),
        subject_id=exam.subject_id,
        subject_name=exam.subject.name if exam.subject else None,
        passing_percentage=exam.passing_percentage or 50.0,
        requires_code=bool(exam.join_code),
        max_attempts=exam.max_attempts if exam.max_attempts is not None else 1,
        shuffle_questions=bool(exam.shuffle_questions),
        strict_mode=bool(exam.strict_mode),
        violation_limit=exam.violation_limit or 1,
        attempts_used=attempts_used,
    )


@router.get("", response_model=list[ExamListResponse])
def list_exams(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    exams = (
        db.query(Exam)
        .options(joinedload(Exam.subject))
        .order_by(Exam.start_time.desc())
        .all()
    )
    used = dict(
        db.query(ExamAttempt.exam_id, func.count(ExamAttempt.id))
        .filter(ExamAttempt.user_id == current_user.id)
        .group_by(ExamAttempt.exam_id)
        .all()
    )
    return [_to_list_response(e, used.get(e.id, 0)) for e in exams]


@router.get("/{exam_id}", response_model=ExamDetailResponse)
def get_exam(exam_id: uuid.UUID, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    exam = (
        db.query(Exam)
        .options(joinedload(Exam.questions).joinedload(Question.choices))
        .filter(Exam.id == exam_id)
        .first()
    )
    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")
    used = (
        db.query(func.count(ExamAttempt.id))
        .filter(ExamAttempt.exam_id == exam.id, ExamAttempt.user_id == current_user.id)
        .scalar()
        or 0
    )
    base = _to_list_response(exam, used)
    return ExamDetailResponse(**base.model_dump(), questions=exam.questions)



def _normalise_code(code: str | None) -> str | None:
    """Blank means "no code". Codes are stored and compared uppercase."""
    if code is None:
        return None
    cleaned = code.strip().upper()
    return cleaned or None


def _assert_code_free(db: Session, code: str | None, exam_id: uuid.UUID | None) -> None:
    if not code:
        return
    query = db.query(Exam).filter(func.upper(Exam.join_code) == code)
    if exam_id:
        query = query.filter(Exam.id != exam_id)
    if query.first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="รหัสเข้าห้องนี้ถูกใช้กับข้อสอบอื่นแล้ว"
        )


@router.post("/join", response_model=JoinByCodeResponse)
def join_by_code(
    payload: JoinByCodeRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """Look up an exam by its room code so a student can go straight to it."""
    code = _normalise_code(payload.code)
    exam = db.query(Exam).filter(func.upper(Exam.join_code) == code).first() if code else None
    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="ไม่พบข้อสอบที่ใช้รหัสนี้")
    return JoinByCodeResponse(id=exam.id, title=exam.title, status=get_exam_status(exam))


# ----- Admin only -----

@router.post("", response_model=ExamAdminDetailResponse, status_code=status.HTTP_201_CREATED)
def create_exam(payload: ExamCreate, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    data = payload.model_dump()
    data["join_code"] = _normalise_code(data.get("join_code"))
    _assert_code_free(db, data["join_code"], None)
    exam = Exam(**data)
    db.add(exam)
    db.commit()
    db.refresh(exam)
    base = _to_list_response(exam)
    return ExamAdminDetailResponse(**base.model_dump(), questions=[], join_code=exam.join_code)


@router.put("/{exam_id}", response_model=ExamAdminDetailResponse)
def update_exam(exam_id: uuid.UUID, payload: ExamUpdate, db: Session = Depends(get_db),
                 admin: User = Depends(require_admin)):
    exam = db.query(Exam).options(joinedload(Exam.questions).joinedload(Question.choices)).filter(Exam.id == exam_id).first()
    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")
    updates = payload.model_dump(exclude_unset=True)
    if "join_code" in updates:
        updates["join_code"] = _normalise_code(updates["join_code"])
        _assert_code_free(db, updates["join_code"], exam_id)
    for field, value in updates.items():
        setattr(exam, field, value)
    db.commit()
    db.refresh(exam)
    base = _to_list_response(exam)
    return ExamAdminDetailResponse(
        **base.model_dump(), questions=exam.questions, join_code=exam.join_code
    )


@router.delete("/{exam_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_exam(exam_id: uuid.UUID, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    exam = db.query(Exam).filter(Exam.id == exam_id).first()
    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")
    db.delete(exam)
    db.commit()
    return None


@router.get("/{exam_id}/admin", response_model=ExamAdminDetailResponse)
def get_exam_admin(exam_id: uuid.UUID, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    exam = (
        db.query(Exam)
        .options(joinedload(Exam.questions).joinedload(Question.choices))
        .filter(Exam.id == exam_id)
        .first()
    )
    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")
    base = _to_list_response(exam)
    return ExamAdminDetailResponse(
        **base.model_dump(), questions=exam.questions, join_code=exam.join_code
    )
