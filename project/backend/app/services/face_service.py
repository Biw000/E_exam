"""
Face service.

Uses MediaPipe's pre-trained Face Detection and Face Mesh solutions (no
training, no dataset). Face Detection is used to count faces (for
NO_FACE / MULTIPLE_FACES checks). Face Mesh's 468 facial landmarks are
used to build a normalized geometric embedding vector for the detected
face, which is then compared using cosine distance. This keeps the MVP
free of any heavy model downloads (e.g. dlib/FaceNet weights) while still
being a genuine pre-trained-model pipeline suitable for a 4-day project.

If stronger accuracy is required later, swap `create_embedding` for a
proper face-embedding network (e.g. FaceNet / ArcFace) — the rest of the
service (API shape, threshold config, comparison logic) does not need to
change.
"""
import base64
import io
from dataclasses import dataclass

import cv2
import numpy as np
import mediapipe as mp
from PIL import Image

from app.config import settings

mp_face_detection = mp.solutions.face_detection
mp_face_mesh = mp.solutions.face_mesh


@dataclass
class FaceCheckResult:
    face_count: int
    embedding: list[float] | None


def decode_base64_image(image_base64: str) -> np.ndarray:
    """Decode a base64 (optionally data-URL prefixed) image string into a BGR numpy array."""
    if "," in image_base64 and image_base64.strip().startswith("data:"):
        image_base64 = image_base64.split(",", 1)[1]
    try:
        raw = base64.b64decode(image_base64)
        img = Image.open(io.BytesIO(raw)).convert("RGB")
    except Exception as exc:
        raise ValueError("Invalid image data") from exc
    arr = np.array(img)
    return cv2.cvtColor(arr, cv2.COLOR_RGB2BGR)


def detect_faces(image_bgr: np.ndarray) -> int:
    """Return the number of faces detected in the image."""
    rgb = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB)
    with mp_face_detection.FaceDetection(model_selection=1, min_detection_confidence=0.6) as detector:
        result = detector.process(rgb)
        if not result.detections:
            return 0
        return len(result.detections)


def create_embedding(image_bgr: np.ndarray) -> list[float] | None:
    """
    Build a normalized landmark-based embedding vector for the single most
    prominent face in the image. Returns None if no face is found.
    """
    rgb = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB)
    with mp_face_mesh.FaceMesh(
        static_image_mode=True, max_num_faces=1, refine_landmarks=False, min_detection_confidence=0.6
    ) as mesh:
        result = mesh.process(rgb)
        if not result.multi_face_landmarks:
            return None
        landmarks = result.multi_face_landmarks[0].landmark
        points = np.array([[lm.x, lm.y, lm.z] for lm in landmarks], dtype=np.float32)

        # Normalize: center on centroid, scale by max distance, so the
        # embedding is invariant to face position/size within the frame.
        centroid = points.mean(axis=0)
        centered = points - centroid
        scale = np.linalg.norm(centered, axis=1).max()
        if scale == 0:
            return None
        normalized = centered / scale
        return normalized.flatten().tolist()


def compare_faces(embedding1: list[float], embedding2: list[float]) -> float:
    """Return cosine distance (0 = identical, 2 = opposite) between two embeddings."""
    v1 = np.array(embedding1, dtype=np.float32)
    v2 = np.array(embedding2, dtype=np.float32)
    if v1.shape != v2.shape:
        return 2.0
    denom = (np.linalg.norm(v1) * np.linalg.norm(v2))
    if denom == 0:
        return 2.0
    cosine_similarity = float(np.dot(v1, v2) / denom)
    return 1.0 - cosine_similarity


def verify_face(image_bgr: np.ndarray, stored_embedding: list[float]) -> tuple[bool, float]:
    """Detect + embed the given frame and compare against the stored embedding."""
    embedding = create_embedding(image_bgr)
    if embedding is None:
        return False, 2.0
    distance = compare_faces(embedding, stored_embedding)
    is_match = distance <= settings.FACE_MATCH_THRESHOLD
    return is_match, distance


def analyze_frame(image_bgr: np.ndarray, stored_embedding: list[float] | None) -> FaceCheckResult:
    """Single entry point used by the periodic anti-cheat monitoring endpoint."""
    face_count = detect_faces(image_bgr)
    embedding = None
    if face_count == 1:
        embedding = create_embedding(image_bgr)
    return FaceCheckResult(face_count=face_count, embedding=embedding)
