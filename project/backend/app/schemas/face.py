from pydantic import BaseModel


class FaceVerifyRequest(BaseModel):
    image_base64: str


class FaceVerifyResponse(BaseModel):
    match: bool
    distance: float
    threshold: float
    message: str


class FaceCheckRequest(BaseModel):
    image_base64: str


class FaceCheckResponse(BaseModel):
    event_type: str
    confidence: float | None = None
    message: str
