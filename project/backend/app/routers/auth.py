from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models.user import User, UserRole
from app.models.face_embedding import FaceEmbedding
from app.schemas.auth import RegisterRequest, LoginRequest, TokenResponse, UserResponse
from app.services import face_service
from app.services.security import hash_password, verify_password, create_access_token

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == payload.email).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered")

    try:
        image = face_service.decode_base64_image(payload.face_image_base64)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid face image")

    face_count = face_service.detect_faces(image)
    if face_count == 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No face detected")
    if face_count > 1:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Multiple faces detected")

    embedding = face_service.create_embedding(image)
    if embedding is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Could not build face embedding")

    user = User(
        name=payload.name,
        email=payload.email,
        password_hash=hash_password(payload.password),
        role=UserRole.student,
    )
    db.add(user)
    db.flush()  # populate user.id before creating the dependent row

    db.add(FaceEmbedding(user_id=user.id, embedding=embedding))
    db.commit()
    db.refresh(user)

    token = create_access_token(user.id, user.role.value)
    return TokenResponse(access_token=token)


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")

    token = create_access_token(user.id, user.role.value)
    return TokenResponse(access_token=token)


@router.get("/me", response_model=UserResponse)
def me(current_user: User = Depends(get_current_user)):
    return current_user
