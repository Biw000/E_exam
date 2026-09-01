from datetime import datetime, timedelta

from app.models.exam import Exam


def get_exam_status(exam: Exam, now: datetime | None = None) -> str:
    now = now or datetime.utcnow()
    if now < exam.start_time:
        return "upcoming"
    if now > exam.end_time:
        return "closed"
    return "open"


def is_exam_open(exam: Exam, now: datetime | None = None) -> bool:
    return get_exam_status(exam, now) == "open"


def attempt_deadline(started_at: datetime, duration_minutes: int, exam_end_time: datetime) -> datetime:
    """
    The attempt must end at the earlier of (started_at + duration) and the
    exam's overall end_time, so a student can never answer past either limit.
    """
    return min(started_at + timedelta(minutes=duration_minutes), exam_end_time)


def is_attempt_time_expired(started_at: datetime, duration_minutes: int, exam_end_time: datetime,
                             now: datetime | None = None) -> bool:
    now = now or datetime.utcnow()
    return now > attempt_deadline(started_at, duration_minutes, exam_end_time)
