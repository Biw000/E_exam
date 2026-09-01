import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import require_admin
from app.models.user import User
from app.models.exam import Exam, Question, Choice
from app.schemas.exam import QuestionCreate, QuestionUpdate, QuestionAdminResponse

router = APIRouter(tags=["questions"])


@router.post("/api/exams/{exam_id}/questions", response_model=QuestionAdminResponse, status_code=status.HTTP_201_CREATED)
def create_question(exam_id: uuid.UUID, payload: QuestionCreate, db: Session = Depends(get_db),
                     admin: User = Depends(require_admin)):
    exam = db.query(Exam).filter(Exam.id == exam_id).first()
    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")

    question = Question(
        exam_id=exam_id,
        question_text=payload.question_text,
        score=payload.score,
        order=payload.order,
    )
    db.add(question)
    db.flush()

    for choice_data in payload.choices:
        db.add(Choice(question_id=question.id, **choice_data.model_dump()))

    db.commit()
    db.refresh(question)
    return question


@router.put("/api/questions/{question_id}", response_model=QuestionAdminResponse)
def update_question(question_id: uuid.UUID, payload: QuestionUpdate, db: Session = Depends(get_db),
                     admin: User = Depends(require_admin)):
    question = db.query(Question).filter(Question.id == question_id).first()
    if not question:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Question not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(question, field, value)
    db.commit()
    db.refresh(question)
    return question


@router.delete("/api/questions/{question_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_question(question_id: uuid.UUID, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    question = db.query(Question).filter(Question.id == question_id).first()
    if not question:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Question not found")
    db.delete(question)
    db.commit()
    return None
