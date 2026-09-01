import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.deps import get_current_user, require_student
from app.models.user import User
from app.models.exam import Exam, Question
from app.models.attempt import ExamAttempt, Answer, AttemptStatus
from app.models.face_embedding import FaceEmbedding
from app.schemas.attempt import (
    StartAttemptRequest,
    AttemptResponse,
    SavedAnswer,
    SubmitAnswerRequest,
    SubmitAnswerResponse,
    SubmitExamResponse,
)
from app.services import face_service
from app.services.exam_service import is_exam_open, is_attempt_time_expired
from app.services.scoring_service import calculate_score

router = APIRouter(tags=["attempts"])


def _get_owned_attempt(db: Session, attempt_id: uuid.UUID, user: User) -> ExamAttempt:
    attempt = (
        db.query(ExamAttempt)
        .options(joinedload(ExamAttempt.answers))
        .filter(ExamAttempt.id == attempt_id)
        .first()
    )
    if not attempt:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attempt not found")
    if attempt.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your attempt")
    return attempt


def _to_attempt_response(db: Session, attempt: ExamAttempt) -> AttemptResponse:
    exam = db.query(Exam).options(joinedload(Exam.questions).joinedload("choices")).filter(Exam.id == attempt.exam_id).first()
    saved_answers = (
        db.query(Answer).filter(Answer.attempt_id == attempt.id).all()
    )
    return AttemptResponse(
        id=attempt.id,
        exam_id=attempt.exam_id,
        started_at=attempt.started_at,
        submitted_at=attempt.submitted_at,
        status=attempt.status,
        duration=exam.duration,
        server_time=datetime.utcnow(),
        questions=exam.questions,
        answers=[SavedAnswer(question_id=a.question_id, choice_id=a.choice_id) for a in saved_answers],
    )


@router.post("/api/exams/{exam_id}/start", response_model=AttemptResponse, status_code=status.HTTP_201_CREATED)
def start_attempt(exam_id: uuid.UUID, payload: StartAttemptRequest, db: Session = Depends(get_db),
                   student: User = Depends(require_student)):
    exam = db.query(Exam).options(joinedload(Exam.questions).joinedload("choices")).filter(Exam.id == exam_id).first()
    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")
    if not is_exam_open(exam):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Exam is not currently open")

    existing = (
        db.query(ExamAttempt)
        .filter(ExamAttempt.exam_id == exam_id, ExamAttempt.user_id == student.id,
                ExamAttempt.status == AttemptStatus.in_progress)
        .first()
    )
    if existing:
        return _to_attempt_response(db, existing)

    stored = db.query(FaceEmbedding).filter(FaceEmbedding.user_id == student.id).first()
    if not stored:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No registered face found")

    try:
        image = face_service.decode_base64_image(payload.face_image_base64)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid face image")

    face_count = face_service.detect_faces(image)
    if face_count != 1:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Face verification failed")

    is_match, _ = face_service.verify_face(image, stored.embedding)
    if not is_match:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Face verification failed")

    attempt = ExamAttempt(user_id=student.id, exam_id=exam_id, status=AttemptStatus.in_progress)
    db.add(attempt)
    db.commit()
    db.refresh(attempt)
    return _to_attempt_response(db, attempt)


@router.get("/api/attempts/{attempt_id}", response_model=AttemptResponse)
def get_attempt(attempt_id: uuid.UUID, db: Session = Depends(get_db), student: User = Depends(get_current_user)):
    attempt = _get_owned_attempt(db, attempt_id, student)
    return _to_attempt_response(db, attempt)


@router.post("/api/attempts/{attempt_id}/answers", response_model=SubmitAnswerResponse)
def save_answer(attempt_id: uuid.UUID, payload: SubmitAnswerRequest, db: Session = Depends(get_db),
                 student: User = Depends(require_student)):
    attempt = _get_owned_attempt(db, attempt_id, student)

    if attempt.status != AttemptStatus.in_progress:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Attempt already submitted")

    exam = db.query(Exam).filter(Exam.id == attempt.exam_id).first()
    if is_attempt_time_expired(attempt.started_at, exam.duration, exam.end_time):
        attempt.status = AttemptStatus.expired
        db.commit()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Exam time has expired")

    question = db.query(Question).filter(Question.id == payload.question_id, Question.exam_id == exam.id).first()
    if not question:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Question not found in this exam")

    answer = (
        db.query(Answer)
        .filter(Answer.attempt_id == attempt.id, Answer.question_id == payload.question_id)
        .first()
    )
    if answer:
        answer.choice_id = payload.choice_id
    else:
        answer = Answer(attempt_id=attempt.id, question_id=payload.question_id, choice_id=payload.choice_id)
        db.add(answer)

    db.commit()
    return SubmitAnswerResponse(question_id=payload.question_id, choice_id=payload.choice_id, saved_at=datetime.utcnow())


@router.post("/api/attempts/{attempt_id}/submit", response_model=SubmitExamResponse)
def submit_attempt(attempt_id: uuid.UUID, db: Session = Depends(get_db), student: User = Depends(require_student)):
    attempt = _get_owned_attempt(db, attempt_id, student)

    if attempt.status != AttemptStatus.in_progress:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Attempt already submitted")

    earned, total = calculate_score(db, attempt)
    attempt.score = earned
    attempt.status = AttemptStatus.submitted
    attempt.submitted_at = datetime.utcnow()
    db.commit()

    percentage = round((earned / total) * 100, 2) if total > 0 else 0.0
    return SubmitExamResponse(id=attempt.id, score=earned, total_score=total, percentage=percentage,
                               submitted_at=attempt.submitted_at)
