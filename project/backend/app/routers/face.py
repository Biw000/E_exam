from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.deps import get_current_user
from app.models.user import User
from app.models.face_embedding import FaceEmbedding, FacePoseType, REQUIRED_ENROLLMENT_POSES
from app.schemas.face import (
    EnrollSampleRequest,
    EnrollSampleResponse,
    EnrollmentStatusResponse,
    FaceConfigResponse,
    FaceVerifyRequest,
    FaceVerifyResponse,
    HeadPose,
)
from app.services import face_service

router = APIRouter(prefix="/api/face", tags=["face"])

_VALID_POSES = {pose.value for pose in FacePoseType}

# Message shown for each quality problem, so the frontend does not have to
# carry its own copy of these strings.
_QUALITY_MESSAGES = {
    "FACE_TOO_SMALL": "กรุณาขยับเข้าใกล้กล้องมากขึ้น",
    "FACE_NOT_CENTERED": "กรุณาจัดใบหน้าให้อยู่กลางกรอบ",
    "TOO_DARK": "แสงน้อยเกินไป กรุณาเพิ่มแสงสว่าง",
}


def _to_schema(pose: face_service.HeadPoseResult | None) -> HeadPose | None:
    if pose is None:
        return None
    return HeadPose(**pose.as_dict())


def _stored_embeddings(db: Session, user: User) -> dict[str, list[float]]:
    rows = db.query(FaceEmbedding).filter(FaceEmbedding.user_id == user.id).all()
    return {row.pose_type: row.embedding for row in rows}


@router.get("/config", response_model=FaceConfigResponse)
def face_config():
    """
    Thresholds for the browser-side tracker. Public on purpose: these are
    tuning numbers, not secrets, and the exam page needs them before the
    student is fully authenticated on slow connections.
    """
    return FaceConfigResponse(**settings.head_pose_config)


@router.get("/enrollment", response_model=EnrollmentStatusResponse)
def enrollment_status(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    enrolled = sorted(_stored_embeddings(db, current_user).keys())
    required = list(REQUIRED_ENROLLMENT_POSES)
    missing = [pose for pose in required if pose not in enrolled]
    return EnrollmentStatusResponse(
        enrolled_poses=enrolled,
        required_poses=required,
        missing_poses=missing,
        complete=not missing,
    )


@router.post("/enroll", response_model=EnrollSampleResponse)
def enroll_pose(
    payload: EnrollSampleRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Add or replace one pose for the signed-in user. Used to finish an
    enrollment that was interrupted, or to re-capture a pose that keeps
    failing verification. Never returns the embedding itself.
    """
    pose = payload.pose_type.strip().upper()
    if pose not in _VALID_POSES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="ท่าใบหน้าไม่ถูกต้อง")

    try:
        image = face_service.decode_base64_image(payload.image_base64)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="ภาพไม่ถูกต้อง")

    result = face_service.analyze_enrollment_sample(image)

    if result.face_count == 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="ไม่พบใบหน้า")
    if result.face_count > 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="พบใบหน้ามากกว่า 1 คนในเฟรม"
        )
    if result.quality_issues:
        first = result.quality_issues[0]
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=_QUALITY_MESSAGES.get(first, "คุณภาพภาพไม่เพียงพอ"),
        )
    if result.embedding is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="ไม่สามารถสร้างข้อมูลใบหน้าได้"
        )

    existing = (
        db.query(FaceEmbedding)
        .filter(FaceEmbedding.user_id == current_user.id, FaceEmbedding.pose_type == pose)
        .first()
    )
    if existing:
        existing.embedding = result.embedding
    else:
        db.add(FaceEmbedding(user_id=current_user.id, pose_type=pose, embedding=result.embedding))
    db.commit()

    return EnrollSampleResponse(
        pose_type=pose,
        accepted=True,
        message=f"บันทึกท่า {pose} เรียบร้อย",
        head_pose=_to_schema(result.head_pose),
        enrolled_poses=sorted(_stored_embeddings(db, current_user).keys()),
    )


@router.post("/verify", response_model=FaceVerifyResponse)
def verify(
    payload: FaceVerifyRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    stored = _stored_embeddings(db, current_user)
    if not stored:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="ยังไม่ได้ลงทะเบียนใบหน้าสำหรับบัญชีนี้",
        )

    try:
        image = face_service.decode_base64_image(payload.image_base64)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="ภาพไม่ถูกต้อง")

    threshold = settings.FACE_MATCH_THRESHOLD
    result = face_service.analyze_frame(image)

    if result.face_count == 0:
        return FaceVerifyResponse(
            match=False, distance=1.0, threshold=threshold, message="ไม่พบใบหน้า"
        )
    if result.face_count > 1:
        return FaceVerifyResponse(
            match=False, distance=1.0, threshold=threshold, message="พบใบหน้ามากกว่า 1 คน"
        )
    if result.embedding is None:
        return FaceVerifyResponse(
            match=False, distance=1.0, threshold=threshold, message="ไม่สามารถอ่านใบหน้าได้"
        )

    pose, distance = face_service.best_match(result.embedding, stored)
    is_match = distance <= threshold
    return FaceVerifyResponse(
        match=is_match,
        distance=distance,
        threshold=threshold,
        message="ยืนยันใบหน้าสำเร็จ" if is_match else "ยืนยันใบหน้าไม่สำเร็จ",
        matched_pose=pose if is_match else None,
    )
