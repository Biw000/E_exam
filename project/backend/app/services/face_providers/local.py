"""
Local face provider: MediaPipe running inside this process.

No network calls and no per-request cost. The models ship with the mediapipe
package, so the only resource cost is memory, which is why the CPU-friendly
BlazeFace and Face Mesh solutions are used rather than a heavier recognition
network.

The embedding is geometric, not learned: the 468 mesh landmarks are centred
and scaled, then flattened. That is weaker than a trained face-recognition
model, and it is the reason enrolment captures five poses instead of one.
"""
import base64
import io
import math

import cv2
import numpy as np
import mediapipe as mp
from PIL import Image

from app.config import settings
from app.services.face_providers.base import FaceProvider
from app.services.face_providers.imaging import decode_base64_image, encode_image_base64
from app.services.face_providers.types import FaceCheckResult, HeadPoseResult

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


class LocalFaceProvider(FaceProvider):
    """MediaPipe Face Detection + Face Mesh, executed in this process."""

    name = "mediapipe-local"

    def detect_faces(self, image_bgr: np.ndarray) -> int:
        """Return the number of faces detected in the image."""
        rgb = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB)
        with mp_face_detection.FaceDetection(model_selection=1, min_detection_confidence=0.6) as detector:
            result = detector.process(rgb)
            if not result.detections:
                return 0
            return len(result.detections)


    def _landmarks(self, image_bgr: np.ndarray):
        """Run Face Mesh once and return the raw landmark list, or None."""
        rgb = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB)
        with mp_face_mesh.FaceMesh(
            static_image_mode=True, max_num_faces=1, refine_landmarks=False, min_detection_confidence=0.6
        ) as mesh:
            result = mesh.process(rgb)
            if not result.multi_face_landmarks:
                return None
            return result.multi_face_landmarks[0].landmark


    def _embedding_from_landmarks(self, landmarks) -> list[float] | None:
        points = np.array([[lm.x, lm.y, lm.z] for lm in landmarks], dtype=np.float32)
        # Center on the centroid and scale by max radius, so the embedding is
        # invariant to where the face sits in the frame and how large it is.
        centroid = points.mean(axis=0)
        centered = points - centroid
        scale = np.linalg.norm(centered, axis=1).max()
        if scale == 0:
            return None
        return (centered / scale).flatten().tolist()


    def _head_pose_from_landmarks(self, landmarks, width: int, height: int) -> HeadPoseResult | None:
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

        # Match the browser-side convention: positive pitch means chin up and
        # positive yaw means turned to the user's right. Without these the server
        # would report UP/LEFT where the client reports DOWN/RIGHT.
        pitch = -pitch
        yaw = -yaw

        return HeadPoseResult(yaw=yaw, pitch=pitch, roll=roll)


    def _quality_issues(self, image_bgr: np.ndarray, landmarks) -> list[str]:
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


    def create_embedding(self, image_bgr: np.ndarray) -> list[float] | None:
        """
        Build a normalized landmark-based embedding for the most prominent face.
        Returns None if no face is found.
        """
        landmarks = self._landmarks(image_bgr)
        if landmarks is None:
            return None
        return self._embedding_from_landmarks(landmarks)


    def estimate_head_pose(self, image_bgr: np.ndarray) -> HeadPoseResult | None:
        landmarks = self._landmarks(image_bgr)
        if landmarks is None:
            return None
        height, width = image_bgr.shape[:2]
        return self._head_pose_from_landmarks(landmarks, width, height)


    def analyze(self, image_bgr: np.ndarray) -> FaceCheckResult:
        """
        Single entry point for the periodic monitoring endpoint.

        The caller does the identity comparison itself, so that one frame can be
        weighed against every enrolled pose rather than a single stored vector.
        """
        face_count = self.detect_faces(image_bgr)
        if face_count != 1:
            return FaceCheckResult(face_count=face_count, embedding=None)

        landmarks = self._landmarks(image_bgr)
        if landmarks is None:
            return FaceCheckResult(face_count=face_count, embedding=None)

        height, width = image_bgr.shape[:2]
        return FaceCheckResult(
            face_count=face_count,
            embedding=self._embedding_from_landmarks(landmarks),
            head_pose=self._head_pose_from_landmarks(landmarks, width, height),
            quality_issues=self._quality_issues(image_bgr, landmarks),
        )
