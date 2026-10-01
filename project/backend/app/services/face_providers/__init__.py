"""
Provider selection.

Which engine the system uses is a deployment decision, not a code change:
set FACE_PROVIDER=local (default) or FACE_PROVIDER=api in the environment.
The provider is built once and reused, because constructing the local one
loads native libraries and constructing it per request would be slow.
"""
import logging

from app.config import settings
from app.services.face_providers.base import FaceProvider
from app.services.face_providers.types import FaceCheckResult, HeadPoseResult

logger = logging.getLogger(__name__)

_provider: FaceProvider | None = None


def get_provider() -> FaceProvider:
    """Return the configured provider, building it on first use."""
    global _provider
    if _provider is not None:
        return _provider

    choice = (settings.FACE_PROVIDER or "local").strip().lower()

    if choice in {"api", "remote", "http"}:
        try:
            from app.services.face_providers.remote import RemoteFaceProvider

            _provider = RemoteFaceProvider()
            logger.info("face provider: remote api at %s", settings.FACE_API_URL)
            return _provider
        except Exception as exc:
            # A misconfigured API must not leave the system with no face engine
            # at all, so fall back to local and say so loudly in the log.
            if not settings.FACE_API_FALLBACK_TO_LOCAL:
                raise
            logger.error("remote face provider unavailable (%s); using local", exc)

    from app.services.face_providers.local import LocalFaceProvider

    _provider = LocalFaceProvider()
    logger.info("face provider: local mediapipe")
    return _provider


def reset_provider() -> None:
    """Drop the cached provider. Used by tests and after a settings change."""
    global _provider
    _provider = None


__all__ = ["FaceProvider", "FaceCheckResult", "HeadPoseResult", "get_provider", "reset_provider"]
