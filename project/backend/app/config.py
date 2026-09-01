from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """
    Central application configuration loaded from environment variables (.env).
    Never hard-code secrets or thresholds anywhere else in the codebase —
    always import `settings` from this module.
    """

    DATABASE_URL: str

    JWT_SECRET: str
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440

    FRONTEND_URL: str = "http://localhost:3000"

    FACE_MATCH_THRESHOLD: float = 0.6
    FACE_CHECK_INTERVAL_SECONDS: int = 7

    # ------------------------------------------------------------------
    # Head pose thresholds (degrees).
    #
    # Angles alone never mean cheating. A pose has to exceed the angle AND be
    # held past the duration below before any event is raised, which is what
    # keeps a quick glance from becoming a false positive.
    # ------------------------------------------------------------------
    HEAD_POSE_CENTER_TOLERANCE: float = 12.0
    HEAD_POSE_WARNING_YAW: float = 15.0
    HEAD_POSE_WARNING_PITCH: float = 15.0
    HEAD_POSE_CRITICAL_YAW: float = 25.0
    HEAD_POSE_CRITICAL_PITCH: float = 25.0

    # How long an off-center pose must be held (seconds).
    POSE_WARNING_DURATION: float = 3.0
    POSE_SUSPICIOUS_DURATION: float = 8.0

    # Identical repeated events inside this window are merged into one row
    # with a repeat_count instead of inserting duplicates. 0 disables merging.
    EVENT_COOLDOWN_SECONDS: int = 15

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.FRONTEND_URL.split(",") if origin.strip()]

    @property
    def head_pose_config(self) -> dict[str, float]:
        """Sent to the frontend so the browser-side tracker uses the same numbers."""
        return {
            "center_tolerance": self.HEAD_POSE_CENTER_TOLERANCE,
            "warning_yaw": self.HEAD_POSE_WARNING_YAW,
            "warning_pitch": self.HEAD_POSE_WARNING_PITCH,
            "critical_yaw": self.HEAD_POSE_CRITICAL_YAW,
            "critical_pitch": self.HEAD_POSE_CRITICAL_PITCH,
            "warning_duration": self.POSE_WARNING_DURATION,
            "suspicious_duration": self.POSE_SUSPICIOUS_DURATION,
            "face_check_interval_seconds": self.FACE_CHECK_INTERVAL_SECONDS,
        }


settings = Settings()
