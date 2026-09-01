from pydantic import BaseModel, Field


class HeadPose(BaseModel):
    """Head orientation in degrees. 0/0/0 means looking straight at the camera."""

    yaw: float = Field(description="Negative = turned left, positive = turned right")
    pitch: float = Field(description="Negative = looking down, positive = looking up")
    roll: float = Field(description="Head tilt toward a shoulder")
    direction_x: str = Field(description="LEFT | CENTER | RIGHT")
    direction_y: str = Field(description="UP | CENTER | DOWN")


class FaceVerifyRequest(BaseModel):
    image_base64: str


class FaceVerifyResponse(BaseModel):
    match: bool
    distance: float
    threshold: float
    message: str
    matched_pose: str | None = None


class FaceCheckRequest(BaseModel):
    image_base64: str
    # Head pose measured in the browser. The backend trusts this only as
    # context for the log - it never decides a match from client-sent angles.
    head_pose: HeadPose | None = None


class FaceCheckResponse(BaseModel):
    event_type: str
    confidence: float | None = None
    message: str
    severity: str = "INFO"
    head_pose: HeadPose | None = None


class FaceQualityIssue(BaseModel):
    code: str
    message: str


class EnrollSampleRequest(BaseModel):
    """Re-enroll (or add) a single pose for the signed-in user."""

    pose_type: str
    image_base64: str


class EnrollSampleResponse(BaseModel):
    pose_type: str
    accepted: bool
    message: str
    head_pose: HeadPose | None = None
    enrolled_poses: list[str] = []


class EnrollmentStatusResponse(BaseModel):
    enrolled_poses: list[str]
    required_poses: list[str]
    missing_poses: list[str]
    complete: bool


class FaceConfigResponse(BaseModel):
    """
    Thresholds the browser-side tracker must use. Serving them from here keeps
    a single source of truth - the angles are never hard-coded in the frontend.
    """

    center_tolerance: float
    warning_yaw: float
    warning_pitch: float
    critical_yaw: float
    critical_pitch: float
    warning_duration: float
    suspicious_duration: float
    face_check_interval_seconds: float
