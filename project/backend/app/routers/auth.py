from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models.user import User, UserRole
from app.models.face_embedding import FaceEmbedding, FacePoseType
from app.schemas.auth import RegisterRequest, LoginRequest, TokenResponse, UserResponse
from app.services import face_service
from app.services.security import hash_password, verify_password, create_access_token

router = APIRouter(prefix="/api/auth", tags=["auth"])

_VALID_POSES = {pose.value for pose in FacePoseType}


def _build_embedding(image_base64: str, pose_label: str) -> list[float]:
    """
    Decode one enrollment frame, run the quality checks, and return its
    embedding. Raises HTTPException with a message naming the failing pose so
    the frontend can send the user back to the right step.
    """
    try:
        image = face_service.decode_base64_image(image_base64)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"ภาพท่า {pose_label} ไม่ถูกต้อง",
        )

    face_count = face_service.detect_faces(image)
    if face_count == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"ไม่พบใบหน้าในท่า {pose_label}",
        )
    if face_count > 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"พบใบหน้ามากกว่า 1 คนในท่า {pose_label}",
        )

    embedding = face_service.create_embedding(image)
    if embedding is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"ไม่สามารถสร้างข้อมูลใบหน้าจากท่า {pose_label} ได้",
        )
    return embedding


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == payload.email).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="อีเมลนี้ถูกใช้งานแล้ว"
        )

    # Normalize both request shapes into {pose: base64}. Older clients that
    # send a single frame are treated as a CENTER-only enrollment.
    if payload.face_samples:
        samples = {
            pose.upper(): image
            for pose, image in payload.face_samples.items()
            if pose.upper() in _VALID_POSES and image
        }
        if not samples:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="ข้อมูลการลงทะเบียนใบหน้าไม่ถูกต้อง",
            )
        if FacePoseType.CENTER.value not in samples:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="ต้องมีภาพท่ามองตรง (CENTER) เสมอ",
            )
    else:
        samples = {FacePoseType.CENTER.value: payload.face_image_base64}

    # Build every embedding BEFORE writing anything, so a bad frame on the
    # last pose does not leave a half-registered account behind.
    embeddings: dict[str, list[float]] = {
        pose: _build_embedding(image, pose) for pose, image in samples.items()
    }

    user = User(
        name=payload.name,
        email=payload.email,
        password_hash=hash_password(payload.password),
        role=UserRole.student,
    )
    db.add(user)
    db.flush()  # populate user.id before creating the dependent rows

    for pose, embedding in embeddings.items():
        db.add(FaceEmbedding(user_id=user.id, pose_type=pose, embedding=embedding))

    db.commit()
    db.refresh(user)

    token = create_access_token(user.id, user.role.value)
    return TokenResponse(access_token=token)


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="อีเมลหรือรหัสผ่านไม่ถูกต้อง"
        )

    token = create_access_token(user.id, user.role.value)
    return TokenResponse(access_token=token)


@router.get("/me", response_model=UserResponse)
def me(current_user: User = Depends(get_current_user)):
    return current_user
