from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import Base, engine
from app import models  # noqa: F401  (ensures all models are registered on Base.metadata)
from app.routers import (
    auth,
    face,
    exams,
    subjects,
    questions,
    attempts,
    anti_cheat,
    results,
    admin,
    exports,
)

# Create tables on startup if they don't exist yet. For a 4-day MVP this
# replaces a full Alembic migration workflow; Alembic is still included in
# requirements.txt if you want to add migrations later.
Base.metadata.create_all(bind=engine)

app = FastAPI(title="SightExam API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    # Without this the browser hides Content-Disposition from JavaScript, so a
    # fetch-based download cannot read the filename the server chose.
    expose_headers=["Content-Disposition"],
)

app.include_router(auth.router)
app.include_router(face.router)
app.include_router(exams.router)
app.include_router(subjects.router)
app.include_router(questions.router)
app.include_router(attempts.router)
app.include_router(anti_cheat.router)
app.include_router(results.router)
app.include_router(admin.router)
app.include_router(exports.router)


@app.get("/health")
def health():
    return {"status": "ok"}
