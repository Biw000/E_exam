from sqlalchemy.orm import Session

from app.models.attempt import ExamAttempt, Answer
from app.models.exam import Question, Choice


def calculate_score(db: Session, attempt: ExamAttempt) -> tuple[int, int]:
    """
    Recalculates and persists is_correct/score for every answer in the
    attempt, and returns (total_score_earned, total_possible_score).
    """
    questions = (
        db.query(Question).filter(Question.exam_id == attempt.exam_id).all()
    )
    total_possible = sum(q.score for q in questions)

    answers = {a.question_id: a for a in attempt.answers}
    total_earned = 0

    for question in questions:
        answer = answers.get(question.id)
        if answer is None or answer.choice_id is None:
            continue
        choice = db.query(Choice).filter(Choice.id == answer.choice_id).first()
        is_correct = bool(choice and choice.is_correct)
        answer.is_correct = is_correct
        answer.score = question.score if is_correct else 0
        total_earned += answer.score

    return total_earned, total_possible
