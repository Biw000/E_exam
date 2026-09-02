import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user, require_admin
from app.models.exam import Exam
from app.models.subject import Subject
from app.models.user import User
from app.schemas.subject import SubjectCreate, SubjectResponse, SubjectUpdate

router = APIRouter(prefix="/api/subjects", tags=["subjects"])


def _with_counts(db: Session, subjects: list[Subject]) -> list[SubjectResponse]:
    counts = dict(
        db.query(Exam.subject_id, func.count(Exam.id)).group_by(Exam.subject_id).all()
    )
    return [
        SubjectResponse(
            id=s.id,
            name=s.name,
            code=s.code,
            description=s.description,
            created_at=s.created_at,
            exam_count=counts.get(s.id, 0),
        )
        for s in subjects
    ]


@router.get("", response_model=list[SubjectResponse])
def list_subjects(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Readable by students too, so the exam list can be grouped by subject."""
    subjects = db.query(Subject).order_by(Subject.name.asc()).all()
    return _with_counts(db, subjects)


@router.post("", response_model=SubjectResponse, status_code=status.HTTP_201_CREATED)
def create_subject(
    payload: SubjectCreate, db: Session = Depends(get_db), admin: User = Depends(require_admin)
):
    name = payload.name.strip()
    if db.query(Subject).filter(func.lower(Subject.name) == name.lower()).first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="มีวิชาชื่อนี้อยู่แล้ว"
        )
    subject = Subject(name=name, code=payload.code, description=payload.description)
    db.add(subject)
    db.commit()
    db.refresh(subject)
    return _with_counts(db, [subject])[0]


@router.put("/{subject_id}", response_model=SubjectResponse)
def update_subject(
    subject_id: uuid.UUID,
    payload: SubjectUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    subject = db.query(Subject).filter(Subject.id == subject_id).first()
    if not subject:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="ไม่พบวิชานี้")

    data = payload.model_dump(exclude_unset=True)
    if "name" in data and data["name"]:
        name = data["name"].strip()
        clash = (
            db.query(Subject)
            .filter(func.lower(Subject.name) == name.lower(), Subject.id != subject_id)
            .first()
        )
        if clash:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="มีวิชาชื่อนี้อยู่แล้ว"
            )
        data["name"] = name

    for field, value in data.items():
        setattr(subject, field, value)
    db.commit()
    db.refresh(subject)
    return _with_counts(db, [subject])[0]


@router.delete("/{subject_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_subject(
    subject_id: uuid.UUID, db: Session = Depends(get_db), admin: User = Depends(require_admin)
):
    """
    Removing a subject does NOT remove its exams. The foreign key is ON DELETE
    SET NULL, so the exams (and every result filed under them) survive and
    simply become ungrouped - deleting a category should never destroy data.
    """
    subject = db.query(Subject).filter(Subject.id == subject_id).first()
    if not subject:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="ไม่พบวิชานี้")
    db.delete(subject)
    db.commit()
