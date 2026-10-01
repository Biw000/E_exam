"""
Image helpers shared by every provider.

Deliberately free of any model dependency: importing this module must not pull
in mediapipe, so a deployment that uses the remote provider never loads the
local model stack.
"""
import base64
import io

import cv2
import numpy as np
from PIL import Image


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


def encode_image_base64(image_bgr: np.ndarray, quality: int = 80) -> str:
    """
    Inverse of decode_base64_image, used when a frame has to be handed to a
    remote provider. JPEG rather than PNG: the difference is roughly ten times
    the payload for an image a model is only extracting landmarks from.
    """
    ok, buffer = cv2.imencode(".jpg", image_bgr, [int(cv2.IMWRITE_JPEG_QUALITY), quality])
    if not ok:
        raise ValueError("Could not encode image")
    return base64.b64encode(buffer.tobytes()).decode("ascii")
