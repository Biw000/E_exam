"""
Face service.

Uses MediaPipe's pre-trained Face Detection and Face Mesh solutions (no
training, no dataset). Face Detection counts faces (for NO_FACE /
MULTIPLE_FACES). Face Mesh's 468 landmarks build a normalized geometric
embedding compared with cosine distance, and also feed a solvePnP head pose
estimate (yaw / pitch / roll).

Nothing here decides whether someone cheated. It reports what the frame
contains; the routers turn that into events, and severity is only ever a
review-priority hint.
"""
import base64
import io
import math
from dataclasses import dataclass, field

import cv2
import numpy as np
import mediapipe as mp
from PIL import Image

from app.config import settings

mp_face_detection = mp.solutions.face_detection
mp_face_mesh = mp.solutions.face_mesh

# Landmark indices used for head pose, in the same order as _MODEL_POINTS.
_POSE_LANDMARK_IDS = (1, 152, 33, 263, 61, 291)

# A generic 3D head model in millimetres: nose tip, chin, outer eye corners,
# mouth corners. Absolute scale does not matter, only relative geometry.
_MODEL_POINTS = np.array(
    [
        (0.0, 0.0, 0.0),        # nose tip
        (0.0, -63.6, -12.5),    # chin
        (-43.3, 32.7, -26.0),   # left eye, outer corner
        (43.3, 32.7, -26.0),    # right eye, outer corner
        (-28.9, -28.9, -24.1),  # left mouth corner
        (28.9, -28.9, -24.1),   # right mouth corner
    ],
    dtype=np.float64,
)

# Faces smaller than this fraction of the frame are too far away to embed well.
_MIN_FACE_SPAN_RATIO = 0.18
# Mean pixel value below which the frame is considered too dark to trust.
_MIN_BRIGHTNESS = 45.0


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


def decode_base64_image(image_base64: str) -> np.ndarray:
    """Decode a base64 (optionally data-URL prefixed) image string into a BGR numpy array."""
    if not image_base64:
        raise ValueError("Empty image data")
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


def _landmarks(image_bgr: np.ndarray):
    """Run Face Mesh once and return the raw landmark list, or None."""
    rgb = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB)
    with mp_face_mesh.FaceMesh(
        static_image_mode=True, max_num_faces=1, refine_landmarks=False, min_detection_confidence=0.6
    ) as mesh:
        result = mesh.process(rgb)
        if not result.multi_face_landmarks:
            return None
        return result.multi_face_landmarks[0].landmark


def _embedding_from_landmarks(landmarks) -> list[float] | None:
    points = np.array([[lm.x, lm.y, lm.z] for lm in landmarks], dtype=np.float32)
    # Center on the centroid and scale by max radius, so the embedding is
    # invariant to where the face sits in the frame and how large it is.
    centroid = points.mean(axis=0)
    centered = points - centroid
    scale = np.linalg.norm(centered, axis=1).max()
    if scale == 0:
        return None
    return (centered / scale).flatten().tolist()


def _head_pose_from_landmarks(landmarks, width: int, height: int) -> HeadPoseResult | None:
    """Estimate yaw/pitch/roll with solvePnP against a generic 3D head model."""
    try:
        image_points = np.array(
            [(landmarks[i].x * width, landmarks[i].y * height) for i in _POSE_LANDMARK_IDS],
            dtype=np.float64,
        )
    except (IndexError, TypeError):
        return None

    focal_length = float(width)
    camera_matrix = np.array(
        [[focal_length, 0, width / 2.0], [0, focal_length, height / 2.0], [0, 0, 1]],
        dtype=np.float64,
    )
    dist_coeffs = np.zeros((4, 1))

    ok, rotation_vector, _ = cv2.solvePnP(
        _MODEL_POINTS, image_points, camera_matrix, dist_coeffs, flags=cv2.SOLVEPNP_ITERATIVE
    )
    if not ok:
        return None

    rotation_matrix, _ = cv2.Rodrigues(rotation_vector)
    sy = math.sqrt(rotation_matrix[0, 0] ** 2 + rotation_matrix[1, 0] ** 2)
    if sy < 1e-6:
        # Gimbal-locked; the estimate would be meaningless.
        return None

    pitch = math.degrees(math.atan2(-rotation_matrix[2, 1], rotation_matrix[2, 2]))
    yaw = math.degrees(math.atan2(rotation_matrix[2, 0], sy))
    roll = math.degrees(math.atan2(-rotation_matrix[1, 0], rotation_matrix[0, 0]))

    # atan2 on the pitch axis returns values near ±180 for a roughly upright
    # head. Fold them back so "looking straight ahead" reads as ~0.
    if pitch > 90:
        pitch -= 180
    elif pitch < -90:
        pitch += 180

    return HeadPoseResult(yaw=yaw, pitch=pitch, roll=roll)


def _quality_issues(image_bgr: np.ndarray, landmarks) -> list[str]:
    """Cheap sanity checks run before an enrollment sample is accepted."""
    issues: list[str] = []
    height, width = image_bgr.shape[:2]

    xs = [lm.x for lm in landmarks]
    ys = [lm.y for lm in landmarks]
    span = max(max(xs) - min(xs), max(ys) - min(ys))
    if span < _MIN_FACE_SPAN_RATIO:
        issues.append("FACE_TOO_SMALL")

    cx, cy = (max(xs) + min(xs)) / 2, (max(ys) + min(ys)) / 2
    if not (0.25 <= cx <= 0.75 and 0.2 <= cy <= 0.8):
        issues.append("FACE_NOT_CENTERED")

    if float(cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY).mean()) < _MIN_BRIGHTNESS:
        issues.append("TOO_DARK")

    return issues


def create_embedding(image_bgr: np.ndarray) -> list[float] | None:
    """
    Build a normalized landmark-based embedding for the most prominent face.
    Returns None if no face is found.
    """
    landmarks = _landmarks(image_bgr)
    if landmarks is None:
        return None
    return _embedding_from_landmarks(landmarks)


def estimate_head_pose(image_bgr: np.ndarray) -> HeadPoseResult | None:
    landmarks = _landmarks(image_bgr)
    if landmarks is None:
        return None
    height, width = image_bgr.shape[:2]
    return _head_pose_from_landmarks(landmarks, width, height)


def compare_faces(embedding1: list[float], embedding2: list[float]) -> float:
    """Return cosine distance (0 = identical, 2 = opposite) between two embeddings."""
    v1 = np.array(embedding1, dtype=np.float32)
    v2 = np.array(embedding2, dtype=np.float32)
    if v1.shape != v2.shape:
        return 2.0
    denom = float(np.linalg.norm(v1) * np.linalg.norm(v2))
    if denom == 0:
        return 2.0
    cosine_similarity = float(np.dot(v1, v2) / denom)
    return 1.0 - cosine_similarity


def best_match(embedding: list[float], stored: dict[str, list[float]]) -> tuple[str | None, float]:
    """
    Compare against every enrolled pose and return the closest one.

    A student who tilts their head slightly should be allowed to match their
    LEFT or RIGHT enrollment sample rather than be failed against CENTER alone.
    """
    if not stored:
        return None, 2.0
    distances = {pose: compare_faces(embedding, vector) for pose, vector in stored.items()}
    pose = min(distances, key=distances.get)
    return pose, distances[pose]


def verify_face(image_bgr: np.ndarray, stored_embedding: list[float]) -> tuple[bool, float]:
    """Detect + embed the given frame and compare against a single stored embedding."""
    embedding = create_embedding(image_bgr)
    if embedding is None:
        return False, 2.0
    distance = compare_faces(embedding, stored_embedding)
    return distance <= settings.FACE_MATCH_THRESHOLD, distance


def analyze_frame(image_bgr: np.ndarray, stored_embedding: list[float] | None = None) -> FaceCheckResult:
    """
    Single entry point for the periodic monitoring endpoint.

    `stored_embedding` is accepted for backward compatibility with the original
    signature; the caller does the comparison itself so it can weigh the frame
    against every enrolled pose.
    """
    face_count = detect_faces(image_bgr)
    if face_count != 1:
        return FaceCheckResult(face_count=face_count, embedding=None)

    landmarks = _landmarks(image_bgr)
    if landmarks is None:
        return FaceCheckResult(face_count=face_count, embedding=None)

    height, width = image_bgr.shape[:2]
    return FaceCheckResult(
        face_count=face_count,
        embedding=_embedding_from_landmarks(landmarks),
        head_pose=_head_pose_from_landmarks(landmarks, width, height),
        quality_issues=_quality_issues(image_bgr, landmarks),
    )


def analyze_enrollment_sample(image_bgr: np.ndarray) -> FaceCheckResult:
    """Same as analyze_frame, but always reports quality issues for the UI."""
    return analyze_frame(image_bgr)
