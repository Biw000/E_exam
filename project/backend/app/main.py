from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import Base, engine
from app import models  # noqa: F401  (ensures all models are registered on Base.metadata)
from app.routers import auth, face, exams, questions, attempts, anti_cheat, results, admin

# Create tables on startup if they don't exist yet. For a 4-day MVP this
# replaces a full Alembic migration workflow; Alembic is still included in
# requirements.txt if you want to add migrations later.
Base.metadata.create_all(bind=engine)

app = FastAPI(title="E-Exam API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(face.router)
app.include_router(exams.router)
app.include_router(questions.router)
app.include_router(attempts.router)
app.include_router(anti_cheat.router)
app.include_router(results.router)
app.include_router(admin.router)


@app.get("/health")
def health():
    return {"status": "ok"}
