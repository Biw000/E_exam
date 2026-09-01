import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.deps import get_current_user, require_admin
from app.models.user import User
from app.models.exam import Exam
from app.schemas.exam import (
    ExamCreate,
    ExamUpdate,
    ExamListResponse,
    ExamDetailResponse,
    ExamAdminDetailResponse,
)
from app.services.exam_service import get_exam_status

router = APIRouter(prefix="/api/exams", tags=["exams"])


def _to_list_response(exam: Exam) -> ExamListResponse:
    return ExamListResponse(
        id=exam.id,
        title=exam.title,
        description=exam.description,
        duration=exam.duration,
        start_time=exam.start_time,
        end_time=exam.end_time,
        status=get_exam_status(exam),
    )


@router.get("", response_model=list[ExamListResponse])
def list_exams(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    exams = db.query(Exam).order_by(Exam.start_time.desc()).all()
    return [_to_list_response(e) for e in exams]


@router.get("/{exam_id}", response_model=ExamDetailResponse)
def get_exam(exam_id: uuid.UUID, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    exam = (
        db.query(Exam)
        .options(joinedload(Exam.questions).joinedload("choices"))
        .filter(Exam.id == exam_id)
        .first()
    )
    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")
    base = _to_list_response(exam)
    return ExamDetailResponse(**base.model_dump(), questions=exam.questions)


# ----- Admin only -----

@router.post("", response_model=ExamAdminDetailResponse, status_code=status.HTTP_201_CREATED)
def create_exam(payload: ExamCreate, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    exam = Exam(**payload.model_dump())
    db.add(exam)
    db.commit()
    db.refresh(exam)
    base = _to_list_response(exam)
    return ExamAdminDetailResponse(**base.model_dump(), questions=[])


@router.put("/{exam_id}", response_model=ExamAdminDetailResponse)
def update_exam(exam_id: uuid.UUID, payload: ExamUpdate, db: Session = Depends(get_db),
                 admin: User = Depends(require_admin)):
    exam = db.query(Exam).options(joinedload(Exam.questions).joinedload("choices")).filter(Exam.id == exam_id).first()
    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(exam, field, value)
    db.commit()
    db.refresh(exam)
    base = _to_list_response(exam)
    return ExamAdminDetailResponse(**base.model_dump(), questions=exam.questions)


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
        .options(joinedload(Exam.questions).joinedload("choices"))
        .filter(Exam.id == exam_id)
        .first()
    )
    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")
    base = _to_list_response(exam)
    return ExamAdminDetailResponse(**base.model_dump(), questions=exam.questions)
