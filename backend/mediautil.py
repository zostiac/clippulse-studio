"""Small, dependency-free helpers for serving media safely (unit-testable)."""
from __future__ import annotations

from pathlib import Path
from typing import Optional, Tuple


def parse_byte_range(header: str, file_size: int) -> Optional[Tuple[int, int]]:
    """Parse an HTTP ``Range`` header for a file of ``file_size`` bytes.

    Returns ``(start, end)`` (inclusive) for a satisfiable single byte range, or
    ``None`` when the header should be ignored and the whole file served
    (unknown unit, multi-range). Raises ``ValueError`` for malformed or
    unsatisfiable ranges (the caller answers 416).

    Supports ``bytes=A-B``, ``bytes=A-`` and the suffix form ``bytes=-N`` (the
    last N bytes).
    """
    units, _, rng = header.strip().partition("=")
    if units.strip().lower() != "bytes" or not rng:
        return None
    if "," in rng:
        return None
    start_str, sep, end_str = rng.strip().partition("-")
    if not sep:
        raise ValueError("Malformed range")
    if start_str:
        start = int(start_str)
        end = int(end_str) if end_str else file_size - 1
    else:
        suffix = int(end_str)
        if suffix <= 0:
            raise ValueError("Invalid suffix range")
        start = max(0, file_size - suffix)
        end = file_size - 1
    end = min(file_size - 1, end)
    if start < 0 or start > end:
        raise ValueError("Unsatisfiable range")
    return start, end


def safe_join(base: Path, *parts: str) -> Path:
    """Join user-supplied path parts onto ``base`` without escaping it.

    Each part is reduced to its final path component, and the resolved result
    must still be inside ``base``; otherwise ``PermissionError`` is raised.
    """
    base_resolved = base.resolve()
    candidate = base_resolved.joinpath(*[Path(p).name for p in parts]).resolve()
    if not candidate.is_relative_to(base_resolved):
        raise PermissionError("Path escapes the base directory")
    return candidate
