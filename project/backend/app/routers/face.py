from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.deps import get_current_user
from app.models.user import User
from app.models.face_embedding import FaceEmbedding
from app.schemas.face import FaceVerifyRequest, FaceVerifyResponse
from app.services import face_service

router = APIRouter(prefix="/api/face", tags=["face"])


@router.post("/verify", response_model=FaceVerifyResponse)
def verify(payload: FaceVerifyRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    stored = db.query(FaceEmbedding).filter(FaceEmbedding.user_id == current_user.id).first()
    if not stored:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No registered face found for this account")

    try:
        image = face_service.decode_base64_image(payload.image_base64)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid face image")

    face_count = face_service.detect_faces(image)
    if face_count == 0:
        return FaceVerifyResponse(match=False, distance=1.0, threshold=settings.FACE_MATCH_THRESHOLD,
                                   message="No face detected")
    if face_count > 1:
        return FaceVerifyResponse(match=False, distance=1.0, threshold=settings.FACE_MATCH_THRESHOLD,
                                   message="Multiple faces detected")

    is_match, distance = face_service.verify_face(image, stored.embedding)
    message = "Face verification passed" if is_match else "Face verification failed"
    return FaceVerifyResponse(match=is_match, distance=distance, threshold=settings.FACE_MATCH_THRESHOLD, message=message)
