"""
Face service.

This module is the only face-related entry point the routers use. It keeps the
function names the rest of the application already calls, and forwards each one
to whichever provider is configured (see app/services/face_providers).

Nothing here decides whether someone cheated. It reports what a frame contains;
the routers turn that into events, and severity is only ever a review-priority
hint.
"""
import numpy as np

from app.config import settings
from app.services.face_providers import get_provider
from app.services.face_providers.imaging import decode_base64_image, encode_image_base64
from app.services.face_providers.types import FaceCheckResult, HeadPoseResult

__all__ = [
    "HeadPoseResult",
    "FaceCheckResult",
    "decode_base64_image",
    "encode_image_base64",
    "detect_faces",
    "create_embedding",
    "estimate_head_pose",
    "compare_faces",
    "best_match",
    "verify_face",
    "analyze_frame",
    "analyze_enrollment_sample",
    "provider_name",
    "provider_health",
]


def detect_faces(image_bgr: np.ndarray) -> int:
    """Return the number of faces detected in the image."""
    return get_provider().detect_faces(image_bgr)


def create_embedding(image_bgr: np.ndarray) -> list[float] | None:
    """Build the numeric representation of the most prominent face."""
    return get_provider().create_embedding(image_bgr)


def estimate_head_pose(image_bgr: np.ndarray) -> HeadPoseResult | None:
    return get_provider().estimate_head_pose(image_bgr)


def compare_faces(embedding1: list[float], embedding2: list[float]) -> float:
    """Distance between two embeddings, 0 meaning identical."""
    return get_provider().compare(embedding1, embedding2)


def best_match(embedding: list[float], stored: dict[str, list[float]]) -> tuple[str | None, float]:
    """Closest enrolled pose and its distance."""
    return get_provider().best_match(embedding, stored)


def verify_face(image_bgr: np.ndarray, stored_embedding: list[float]) -> tuple[bool, float]:
    """Embed the given frame and compare it against a single stored embedding."""
    embedding = create_embedding(image_bgr)
    if embedding is None:
        return False, 2.0
    distance = compare_faces(embedding, stored_embedding)
    return distance <= settings.FACE_MATCH_THRESHOLD, distance


def analyze_frame(
    image_bgr: np.ndarray, stored_embedding: list[float] | None = None
) -> FaceCheckResult:
    """
    Single entry point for enrolment and for the periodic monitoring check.

    `stored_embedding` is accepted for backward compatibility with the original
    signature; the caller does the comparison itself so it can weigh the frame
    against every enrolled pose.
    """
    return get_provider().analyze(image_bgr)


def analyze_enrollment_sample(image_bgr: np.ndarray) -> FaceCheckResult:
    """Same as analyze_frame; named separately because the UI reports quality issues."""
    return get_provider().analyze(image_bgr)


def provider_name() -> str:
    return get_provider().name


def provider_health() -> dict:
    return get_provider().health()
