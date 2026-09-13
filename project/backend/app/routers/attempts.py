import random
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.config import settings
from app.database import get_db
from app.deps import get_current_user, require_student
from app.models.user import User
from app.models.exam import Exam, Question
from app.models.attempt import ExamAttempt, Answer, AttemptStatus
from app.models.face_embedding import FaceEmbedding
from app.routers.anti_cheat import record_event
from app.schemas.attempt import (
    StartAttemptRequest,
    AttemptResponse,
    SavedAnswer,
    SubmitAnswerRequest,
    SubmitAnswerResponse,
    SubmitExamResponse,
    TerminateAttemptRequest,
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
    exam = db.query(Exam).options(joinedload(Exam.questions).joinedload(Question.choices)).filter(Exam.id == attempt.exam_id).first()
    saved_answers = (
        db.query(Answer).filter(Answer.attempt_id == attempt.id).all()
    )
    # Apply this attempt's shuffle. Any question added to the exam after the
    # attempt started is appended at the end rather than dropped.
    questions = list(exam.questions)
    order = attempt.question_order or []
    if order:
        position = {qid: i for i, qid in enumerate(order)}
        questions.sort(key=lambda q: position.get(str(q.id), len(position)))

    return AttemptResponse(
        id=attempt.id,
        exam_id=attempt.exam_id,
        started_at=attempt.started_at,
        submitted_at=attempt.submitted_at,
        status=attempt.status,
        duration=exam.duration,
        server_time=datetime.utcnow(),
        questions=questions,
        answers=[SavedAnswer(question_id=a.question_id, choice_id=a.choice_id) for a in saved_answers],
    )


@router.post("/api/exams/{exam_id}/start", response_model=AttemptResponse, status_code=status.HTTP_201_CREATED)
def start_attempt(exam_id: uuid.UUID, payload: StartAttemptRequest, db: Session = Depends(get_db),
                   student: User = Depends(require_student)):
    exam = db.query(Exam).options(joinedload(Exam.questions).joinedload(Question.choices)).filter(Exam.id == exam_id).first()
    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")
    if not is_exam_open(exam):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="ข้อสอบนี้ยังไม่เปิดสอบ หรือหมดเวลาแล้ว")

    # Room code, when the exam has one. Checked before the face work so a wrong
    # code fails instantly instead of after a round trip through MediaPipe.
    if exam.join_code:
        supplied = (payload.join_code or "").strip().upper()
        if supplied != exam.join_code.strip().upper():
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, detail="รหัสเข้าห้องสอบไม่ถูกต้อง"
            )

    existing = (
        db.query(ExamAttempt)
        .filter(ExamAttempt.exam_id == exam_id, ExamAttempt.user_id == student.id,
                ExamAttempt.status == AttemptStatus.in_progress.value)
        .first()
    )
    if existing:
        return _to_attempt_response(db, existing)

    # Retake limit. max_attempts = 0 means unlimited.
    used = (
        db.query(func.count(ExamAttempt.id))
        .filter(ExamAttempt.exam_id == exam_id, ExamAttempt.user_id == student.id)
        .scalar()
        or 0
    )
    limit = exam.max_attempts if exam.max_attempts is not None else 1
    if limit and used >= limit:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"ทำข้อสอบนี้ครบจำนวนครั้งที่กำหนดแล้ว ({limit} ครั้ง)",
        )

    stored_rows = db.query(FaceEmbedding).filter(FaceEmbedding.user_id == student.id).all()
    if not stored_rows:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="ยังไม่ได้ลงทะเบียนใบหน้าสำหรับบัญชีนี้"
        )
    stored = {row.pose_type: row.embedding for row in stored_rows}

    try:
        image = face_service.decode_base64_image(payload.face_image_base64)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="ภาพใบหน้าไม่ถูกต้อง")

    result = face_service.analyze_frame(image)
    if result.face_count == 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="ไม่พบใบหน้า")
    if result.face_count > 1:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="พบใบหน้ามากกว่า 1 คน")
    if result.embedding is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="ไม่สามารถอ่านใบหน้าได้")

    # Compare against every enrolled pose, not just whichever row came back
    # first: a student tilted slightly should match their LEFT sample rather
    # than be rejected against CENTER alone.
    _, distance = face_service.best_match(result.embedding, stored)
    if distance > settings.FACE_MATCH_THRESHOLD:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="ยืนยันใบหน้าไม่สำเร็จ"
        )

    # Fresh shuffle per attempt, stored so a refresh keeps the same order.
    question_ids = [str(q.id) for q in exam.questions]
    if exam.shuffle_questions:
        random.shuffle(question_ids)

    attempt = ExamAttempt(
        user_id=student.id,
        exam_id=exam_id,
        status=AttemptStatus.in_progress.value,
        question_order=question_ids,
    )
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


@router.post("/api/attempts/{attempt_id}/terminate", response_model=SubmitExamResponse)
def terminate_attempt(
    attempt_id: uuid.UUID,
    payload: TerminateAttemptRequest,
    db: Session = Depends(get_db),
    student: User = Depends(require_student),
):
    """
    End an attempt early because a proctoring rule was broken.

    Whatever was answered is still graded. Silently discarding the work would
    make an accidental trigger - a system notification stealing focus, say -
    far more costly than the rule is worth. The reason is recorded so a human
    can review it and grant another attempt if it was unfair.
    """
    attempt = _get_owned_attempt(db, attempt_id, student)

    if attempt.status != AttemptStatus.in_progress:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="การสอบนี้จบไปแล้ว"
        )

    record_event(
        db,
        attempt_id=attempt.id,
        event_type="ATTEMPT_TERMINATED",
        description=payload.detail or payload.reason,
        event_metadata={"reason": payload.reason},
    )

    earned, total = calculate_score(db, attempt)
    attempt.score = earned
    attempt.status = AttemptStatus.terminated.value
    attempt.terminated_reason = payload.reason[:80]
    attempt.submitted_at = datetime.utcnow()
    db.commit()

    percentage = round((earned / total) * 100, 2) if total > 0 else 0.0
    return SubmitExamResponse(
        id=attempt.id,
        score=earned,
        total_score=total,
        percentage=percentage,
        submitted_at=attempt.submitted_at,
    )
