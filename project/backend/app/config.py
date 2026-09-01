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

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.FRONTEND_URL.split(",") if origin.strip()]


settings = Settings()
