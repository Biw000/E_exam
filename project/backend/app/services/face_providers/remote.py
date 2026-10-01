"""
Remote face provider: calls an HTTP service instead of running a model here.

This is a generic adapter, not a driver for one specific vendor. Every hosted
face service (AWS Rekognition, Azure Face, Face++, or a model you host
yourself) has a different request shape, so this class speaks one simple
contract and expects the service on the other end to match it. Pointing it at
a vendor directly will not work; put a small translation service in front, or
subclass this and override _post.

Expected contract, all requests POST with JSON and Bearer authentication:

    POST {FACE_API_URL}/detect
      -> {"image_base64": "..."}
      <- {"face_count": 1}

    POST {FACE_API_URL}/analyze
      -> {"image_base64": "..."}
      <- {"face_count": 1,
          "embedding": [0.1, ...],
          "head_pose": {"yaw": 0.0, "pitch": 0.0, "roll": 0.0},
          "quality_issues": ["TOO_DARK"]}

    POST {FACE_API_URL}/compare            (optional)
      -> {"embedding_a": [...], "embedding_b": [...]}
      <- {"distance": 0.23}

If /compare is not implemented the cosine distance from the base class is used,
which is correct for any provider that returns L2-comparable vectors.

Two things to be aware of before switching a live system to this provider:
frames now leave the server on every check, which is the privacy property the
local provider was chosen to avoid; and embeddings from a different model are
not comparable with the ones already stored, so everyone must enrol again.
"""
import logging

import httpx
import numpy as np

from app.config import settings
from app.services.face_providers.base import FaceProvider
from app.services.face_providers.types import FaceCheckResult, HeadPoseResult
from app.services.face_providers.imaging import encode_image_base64

logger = logging.getLogger(__name__)


class RemoteFaceProvider(FaceProvider):
    """Face analysis delegated to an external HTTP service."""

    name = "remote-api"

    def __init__(self) -> None:
        self.base_url = settings.FACE_API_URL.rstrip("/")
        self.timeout = settings.FACE_API_TIMEOUT
        self._headers = {"Content-Type": "application/json"}
        if settings.FACE_API_KEY:
            self._headers["Authorization"] = f"Bearer {settings.FACE_API_KEY}"
        if not self.base_url:
            raise ValueError("FACE_API_URL must be set when FACE_PROVIDER is 'api'")

    # ------------------------------------------------------------------
    def _post(self, path: str, payload: dict) -> dict | None:
        """
        One request to the service. Returns None on any failure rather than
        raising: a face check that cannot reach the API must not take down an
        exam that is already in progress. The caller decides what to do with
        a missing result, and the failure is logged for the operator.
        """
        try:
            with httpx.Client(timeout=self.timeout) as client:
                response = client.post(
                    f"{self.base_url}{path}", json=payload, headers=self._headers
                )
                response.raise_for_status()
                return response.json()
        except httpx.HTTPStatusError as exc:
            logger.warning("face api %s returned %s", path, exc.response.status_code)
        except httpx.RequestError as exc:
            logger.warning("face api %s unreachable: %s", path, exc.__class__.__name__)
        except ValueError:
            logger.warning("face api %s returned a body that is not JSON", path)
        return None

    # ------------------------------------------------------------------
    def detect_faces(self, image_bgr: np.ndarray) -> int:
        data = self._post("/detect", {"image_base64": encode_image_base64(image_bgr)})
        if not data:
            return 0
        return int(data.get("face_count", 0))

    def analyze(self, image_bgr: np.ndarray) -> FaceCheckResult:
        data = self._post("/analyze", {"image_base64": encode_image_base64(image_bgr)})
        if not data:
            return FaceCheckResult(face_count=0, embedding=None)

        pose = None
        raw_pose = data.get("head_pose")
        if isinstance(raw_pose, dict):
            try:
                pose = HeadPoseResult(
                    yaw=float(raw_pose["yaw"]),
                    pitch=float(raw_pose["pitch"]),
                    roll=float(raw_pose.get("roll", 0.0)),
                )
            except (KeyError, TypeError, ValueError):
                pose = None

        embedding = data.get("embedding")
        if embedding is not None and not isinstance(embedding, list):
            embedding = None

        issues = data.get("quality_issues") or []
        if not isinstance(issues, list):
            issues = []

        return FaceCheckResult(
            face_count=int(data.get("face_count", 0)),
            embedding=embedding,
            head_pose=pose,
            quality_issues=[str(i) for i in issues],
        )

    def create_embedding(self, image_bgr: np.ndarray) -> list[float] | None:
        return self.analyze(image_bgr).embedding

    def estimate_head_pose(self, image_bgr: np.ndarray) -> HeadPoseResult | None:
        return self.analyze(image_bgr).head_pose

    def compare(self, embedding1: list[float], embedding2: list[float]) -> float:
        if settings.FACE_API_USE_REMOTE_COMPARE:
            data = self._post(
                "/compare", {"embedding_a": embedding1, "embedding_b": embedding2}
            )
            if data and "distance" in data:
                try:
                    return float(data["distance"])
                except (TypeError, ValueError):
                    pass
            # Fall through to the local metric rather than returning a value
            # that would silently pass verification.
        return super().compare(embedding1, embedding2)

    def health(self) -> dict:
        return {
            "provider": self.name,
            "endpoint": self.base_url,
            "authenticated": bool(settings.FACE_API_KEY),
            "available": self._post("/detect", {"image_base64": ""}) is not None,
        }
