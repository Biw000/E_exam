"""
Seed script: creates a dev-only admin account, a dev-only student account
(with a placeholder face embedding), and one sample exam with questions.

Run with:
    python seed.py

DO NOT use these credentials in production. They exist for local/dev
testing only and are intentionally simple.
"""
import random
from datetime import datetime, timedelta

from app.database import SessionLocal, Base, engine
from app import models  # noqa: F401
from app.models.user import User, UserRole
from app.models.face_embedding import FaceEmbedding
from app.models.exam import Exam, Question, Choice
from app.services.security import hash_password

Base.metadata.create_all(bind=engine)

db = SessionLocal()

try:
    if not db.query(User).filter(User.email == "admin@example.com").first():
        admin = User(
            name="Admin User",
            email="admin@example.com",
            password_hash=hash_password("DevAdmin123!"),
            role=UserRole.admin,
        )
        db.add(admin)
        print("Created admin@example.com / DevAdmin123! (DEV ONLY)")

    if not db.query(User).filter(User.email == "student@example.com").first():
        student = User(
            name="Student User",
            email="student@example.com",
            password_hash=hash_password("DevStudent123!"),
            role=UserRole.student,
        )
        db.add(student)
        db.flush()

        # Placeholder embedding (468 landmarks * 3 dims = 1404 values) so the
        # seeded student can call /api/face/verify without registering via
        # the UI first. Real accounts get a real embedding at registration.
        random.seed(42)
        placeholder_embedding = [random.uniform(-1, 1) for _ in range(468 * 3)]
        db.add(FaceEmbedding(user_id=student.id, embedding=placeholder_embedding))
        print("Created student@example.com / DevStudent123! (DEV ONLY, placeholder face embedding)")

    if not db.query(Exam).filter(Exam.title == "Programming Fundamentals").first():
        exam = Exam(
            title="Programming Fundamentals",
            description="Sample exam seeded for local testing.",
            duration=30,
            start_time=datetime.utcnow() - timedelta(minutes=5),
            end_time=datetime.utcnow() + timedelta(days=7),
        )
        db.add(exam)
        db.flush()

        q1 = Question(exam_id=exam.id, question_text="Python คืออะไร?", score=10, order=1)
        db.add(q1)
        db.flush()
        db.add_all([
            Choice(question_id=q1.id, choice_text="Programming Language", is_correct=True, order=1),
            Choice(question_id=q1.id, choice_text="Database", is_correct=False, order=2),
            Choice(question_id=q1.id, choice_text="Operating System", is_correct=False, order=3),
            Choice(question_id=q1.id, choice_text="Browser", is_correct=False, order=4),
        ])

        q2 = Question(exam_id=exam.id, question_text="FastAPI ใช้ภาษาอะไร?", score=10, order=2)
        db.add(q2)
        db.flush()
        db.add_all([
            Choice(question_id=q2.id, choice_text="Python", is_correct=True, order=1),
            Choice(question_id=q2.id, choice_text="JavaScript", is_correct=False, order=2),
            Choice(question_id=q2.id, choice_text="Go", is_correct=False, order=3),
            Choice(question_id=q2.id, choice_text="Rust", is_correct=False, order=4),
        ])

        print("Created sample exam: Programming Fundamentals")

    db.commit()
    print("Seed complete.")
finally:
    db.close()
