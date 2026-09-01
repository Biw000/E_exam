"""
Password policy.

Single source of truth for password rules. The frontend mirrors these same
rules in `lib/password.ts` for live feedback, but the frontend check is only a
convenience - this module is what actually decides whether a password is
accepted, because a client can be bypassed entirely.
"""
import re

MIN_LENGTH = 8

# bcrypt hashes at most 72 bytes and raises on anything longer. Reject early
# with a clear message instead of letting it blow up inside passlib.
MAX_BYTES = 72

SPECIAL_CHARACTERS = "!@#$%^&*?_-+=.,:;()[]{}<>/\\|~`'\""

_UPPER = re.compile(r"[A-Z]")
_LOWER = re.compile(r"[a-z]")
_DIGIT = re.compile(r"[0-9]")
_SPECIAL = re.compile("[" + re.escape(SPECIAL_CHARACTERS) + "]")


def check_password(password: str) -> list[str]:
    """
    Return a list of human-readable problems. An empty list means the password
    is acceptable.
    """
    problems: list[str] = []

    if len(password) < MIN_LENGTH:
        problems.append(f"ต้องมีอย่างน้อย {MIN_LENGTH} ตัวอักษร")
    if len(password.encode("utf-8")) > MAX_BYTES:
        problems.append(f"ยาวเกินไป (สูงสุด {MAX_BYTES} bytes)")
    if not _UPPER.search(password):
        problems.append("ต้องมีตัวพิมพ์ใหญ่อย่างน้อย 1 ตัว")
    if not _LOWER.search(password):
        problems.append("ต้องมีตัวพิมพ์เล็กอย่างน้อย 1 ตัว")
    if not _DIGIT.search(password):
        problems.append("ต้องมีตัวเลขอย่างน้อย 1 ตัว")
    if not _SPECIAL.search(password):
        problems.append("ต้องมีอักขระพิเศษอย่างน้อย 1 ตัว")

    return problems


def is_valid(password: str) -> bool:
    return not check_password(password)
