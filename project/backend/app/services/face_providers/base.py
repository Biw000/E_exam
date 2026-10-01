"""
The contract every face provider must satisfy.

The system needs four things from a face engine: how many faces are in a
frame, a comparable numeric representation of one face, the head orientation,
and a way to measure the distance between two representations. Anything that
can do those four can be plugged in here — the local MediaPipe implementation
today, a hosted API tomorrow — without touching the routers.

One rule holds for every implementation: embeddings produced by one provider
are NOT comparable with embeddings produced by another. They come from
different models with different dimensions and different geometry. Switching
providers therefore invalidates the face data already enrolled, and every user
has to enrol again. `name` exists so the application can detect that.
"""
from abc import ABC, abstractmethod

import numpy as np

from app.services.face_providers.types import FaceCheckResult, HeadPoseResult


class FaceProvider(ABC):
    """Base class for face detection and recognition back ends."""

    #: Short identifier stored alongside enrolled data, e.g. "mediapipe-local".
    name: str = "base"

    @abstractmethod
    def detect_faces(self, image_bgr: np.ndarray) -> int:
        """Return how many faces are visible in the frame."""

    @abstractmethod
    def analyze(self, image_bgr: np.ndarray) -> FaceCheckResult:
        """
        Run a full pass over one frame: face count, embedding, head pose and
        any image-quality problems. Callers use this for both enrolment and
        the periodic identity check, so it must be safe to call repeatedly.
        """

    @abstractmethod
    def create_embedding(self, image_bgr: np.ndarray) -> list[float] | None:
        """Return the numeric representation of the most prominent face."""

    @abstractmethod
    def estimate_head_pose(self, image_bgr: np.ndarray) -> HeadPoseResult | None:
        """Return yaw / pitch / roll in degrees, or None if it cannot be found."""

    def compare(self, embedding1: list[float], embedding2: list[float]) -> float:
        """
        Distance between two embeddings, where 0 means identical.

        Cosine distance is the default because it is what the local provider
        produces and what the stored threshold is calibrated against. A
        provider whose model is trained for a different metric should override
        this, and must document the range it returns.
        """
        v1 = np.asarray(embedding1, dtype=np.float32)
        v2 = np.asarray(embedding2, dtype=np.float32)
        if v1.shape != v2.shape or v1.size == 0:
            return 2.0
        denom = float(np.linalg.norm(v1) * np.linalg.norm(v2))
        if denom == 0:
            return 2.0
        return 1.0 - float(np.dot(v1, v2) / denom)

    def best_match(
        self, embedding: list[float], stored: dict[str, list[float]]
    ) -> tuple[str | None, float]:
        """
        Compare against every enrolled pose and return the closest one.

        Lives on the base class because the logic is identical whatever engine
        produced the vectors: a student tilted slightly should be allowed to
        match their LEFT sample rather than be failed against CENTER alone.
        """
        if not stored:
            return None, 2.0
        distances = {pose: self.compare(embedding, vector) for pose, vector in stored.items()}
        pose = min(distances, key=distances.get)
        return pose, distances[pose]

    def health(self) -> dict:
        """Status shown on the admin page. Never include credentials."""
        return {"provider": self.name, "available": True}
