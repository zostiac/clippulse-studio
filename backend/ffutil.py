"""Cross-version-safe escaping for ffmpeg filtergraph option values.

FFmpeg's filter strings are parsed in (at least) two layers with semantics
that changed between the 4.x and 7.x/8.x/9.x generations: naive ``\\:`` or
``shlex.quote`` escaping that satisfies one generation breaks the other on
option boundaries (the classic symptom on Windows is
``No option name near '/Windows/Fonts/...'``).

The form below is empirically verified to survive FFmpeg 4.x through 9.x:
wrap the value in single quotes and backslash-escape ``\\``, ``:`` and ``'``
inside. Add ``expansion=none`` to drawtext so literal ``%`` characters in
captions are not treated as expansion syntax.
"""
from __future__ import annotations


def filter_quote(value: str) -> str:
    """Quote a value (file path, caption text) for a filter option."""
    inner = value.replace("\\", "\\\\").replace(":", "\\:").replace("'", "\\'")
    return f"'{inner}'"
