"""
Data types shared by every face provider.

Kept in their own module so that a provider implementation can import them
without importing the local MediaPipe provider, which would pull several
hundred megabytes of native libraries into a process that may not need them.
"""
from dataclasses import dataclass, field

from app.config import settings


@dataclass
class HeadPoseResult:
    yaw: float
    pitch: float
    roll: float

    @property
    def direction_x(self) -> str:
        if self.yaw <= -settings.HEAD_POSE_CENTER_TOLERANCE:
            return "LEFT"
        if self.yaw >= settings.HEAD_POSE_CENTER_TOLERANCE:
            return "RIGHT"
        return "CENTER"

    @property
    def direction_y(self) -> str:
        if self.pitch >= settings.HEAD_POSE_CENTER_TOLERANCE:
            return "UP"
        if self.pitch <= -settings.HEAD_POSE_CENTER_TOLERANCE:
            return "DOWN"
        return "CENTER"

    def as_dict(self) -> dict:
        return {
            "yaw": round(self.yaw, 2),
            "pitch": round(self.pitch, 2),
            "roll": round(self.roll, 2),
            "direction_x": self.direction_x,
            "direction_y": self.direction_y,
        }


@dataclass
class FaceCheckResult:
    face_count: int
    embedding: list[float] | None
    head_pose: HeadPoseResult | None = None
    quality_issues: list[str] = field(default_factory=list)
