import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator

from app.models.user import UserRole
from app.services import password_policy


class RegisterRequest(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    email: EmailStr
    password: str = Field(min_length=password_policy.MIN_LENGTH, max_length=128)
    confirm_password: str = Field(min_length=password_policy.MIN_LENGTH, max_length=128)
    # base64-encoded JPEG/PNG image data URL or raw base64 string from the camera.
    # Kept for backward compatibility: a client that only captures one frame can
    # still register. New clients send `face_samples` instead.
    face_image_base64: str | None = None
    # Multi-pose enrollment: {"CENTER": "<base64>", "LEFT": "<base64>", ...}
    face_samples: dict[str, str] | None = None

    @field_validator("name")
    @classmethod
    def name_not_blank(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("กรุณากรอกชื่อ-นามสกุล")
        return cleaned

    @field_validator("password")
    @classmethod
    def password_meets_policy(cls, value: str) -> str:
        problems = password_policy.check_password(value)
        if problems:
            raise ValueError("รหัสผ่านไม่ผ่านเงื่อนไข: " + ", ".join(problems))
        return value

    @model_validator(mode="after")
    def passwords_match_and_face_present(self) -> "RegisterRequest":
        if self.password != self.confirm_password:
            raise ValueError("รหัสผ่านและการยืนยันรหัสผ่านไม่ตรงกัน")
        if not self.face_samples and not self.face_image_base64:
            raise ValueError("กรุณาลงทะเบียนใบหน้าก่อนสมัครสมาชิก")
        return self


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserResponse(BaseModel):
    id: uuid.UUID
    name: str
    email: EmailStr
    role: UserRole
    created_at: datetime

    class Config:
        from_attributes = True
