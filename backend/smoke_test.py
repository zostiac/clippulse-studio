"""Regression smoke tests for the 2026-11-23 fix batch.

Run from the repo root or this directory after installing requirements:

    pip install -r requirements.txt
    python backend/smoke_test.py

Covers: the 1080p export floor, legacy resolution coercion, container
sniffing, upload size caps, transcription failure surfacing (H2), and
the /api/health capability report.
"""
import io
import os
import sys
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

os.environ.setdefault("CLIPPULSE_MAX_UPLOAD_MB", "1")

# --- unit checks -------------------------------------------------------------
from exporter import RESOLUTION_PRESETS, resolve_output_size  # noqa: E402
from ingest import is_supported_video_bytes  # noqa: E402
from models import AppSettings, ClipStyle, TranscriptionError  # noqa: E402

assert resolve_output_size("1080x1920") == (1080, 1920)
assert resolve_output_size("1440x2560") == (1440, 2560)
assert resolve_output_size("720x1280") == (1080, 1920)  # 1080p floor enforced
assert resolve_output_size("garbage") == (1080, 1920)
assert min(w for w, _ in RESOLUTION_PRESETS.values()) >= 1080

assert ClipStyle(resolution="720x1280").resolution == "1080x1920"  # legacy coerced up
assert ClipStyle(resolution="1440x2560").resolution == "1440x2560"
assert ClipStyle().resolution == "1080x1920"

assert is_supported_video_bytes(b"\x00\x00\x00\x18ftypmp42" + b"\x00" * 8)
assert is_supported_video_bytes(b"\x1a\x45\xdf\xa3rest")
assert not is_supported_video_bytes(b"<html><body>nope")
assert not is_supported_video_bytes(b"\x89PNG\r\n\x1a\n")

# Cross-platform font plumbing and filter escaping for the demo generator.
from ffutil import filter_quote  # noqa: E402
from ingest import FONT_BOLD, FONT_OPT, _resolve_bold_font  # noqa: E402

assert filter_quote("C:\\Windows\\Fonts\\a.ttf") == "'C\\:\\\\Windows\\\\Fonts\\\\a.ttf'"
assert filter_quote("/usr/share/fonts/x.ttf") == "'/usr/share/fonts/x.ttf'"
assert filter_quote("it's 90%") == "'it\\'s 90%'"
assert _resolve_bold_font() == FONT_BOLD  # consistent at import time
if FONT_BOLD:
    assert Path(FONT_BOLD).is_file(), FONT_BOLD
    assert "fontfile=" in FONT_OPT
else:
    assert "fontfile=" not in FONT_OPT  # falls back to fontconfig default
assert FONT_OPT.startswith("expansion=none")  # literal '%' in captions is safe
print("font/escaping OK ->", FONT_BOLD or "(fontconfig default)")

# Project status vocabulary: intermediate state used by create/reanalyze flows.
from models import Project  # noqa: E402

Project(title="x", source_type="demo", status="analyzing")
print("unit checks OK")

# --- transcription failure must surface (H2) --------------------------------
import analyzer  # noqa: E402


def _boom(*_a, **_k):
    raise RuntimeError("provider down")


analyzer.transcribe_with_cloud_whisper = _boom
analyzer.transcribe_with_local_whisper = _boom

try:
    analyzer.analyze_project(
        "proj_t", "t", __file__, 60.0, [], [],
        AppSettings(ai_provider="groq", enable_local_whisper=True, api_key="k"),
    )
except TranscriptionError as exc:
    print("H2 OK ->", str(exc)[:120])
else:
    raise AssertionError("TranscriptionError not raised")

# No provider configured at all -> heuristic-only fallback, no exception.
tr, clips, eng = analyzer.analyze_project(
    "proj_t2", "t", __file__, 60.0, [], [],
    AppSettings(ai_provider="local_free", enable_local_whisper=False),
)
assert tr == [] and clips and eng == "local_free"
print("heuristic-only fallback OK, clips:", len(clips))

# --- FastAPI endpoints ------------------------------------------------------
from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402

client = TestClient(main.app)

r = client.get("/api/health")
assert r.status_code == 200, r.text
caps = r.json()["capabilities"]
assert "ffmpeg" in caps and "video_pipeline_ready" in caps
print("health OK ->", caps)

# Garbage bytes rejected by container sniff.
files = {"file": ("evil.mp4", io.BytesIO(b"<html>not a video" * 50), "video/mp4")}
r = client.post("/api/projects/upload", files=files)
assert r.status_code == 400 and "Unsupported video format" in r.json()["detail"], r.text
print("upload sniff OK ->", r.json()["detail"])

# Oversized upload rejected (limit 1 MB via env).
files = {
    "file": (
        "big.mp4",
        io.BytesIO(b"\x00\x00\x00\x18ftypmp42" + b"\x00" * (2 * 1024 * 1024)),
        "video/mp4",
    )
}
r = client.post("/api/projects/upload", files=files)
assert r.status_code == 413, (r.status_code, r.text)
print("upload cap OK ->", r.json()["detail"])

# Transcription audio-extraction diagnostics (skipped when ffmpeg is absent).
import shutil as _shutil  # noqa: E402
import subprocess as _subprocess  # noqa: E402

if _shutil.which("ffmpeg") and _shutil.which("ffprobe"):
    import tempfile

    from analyzer import _extract_audio

    with tempfile.TemporaryDirectory() as td:
        td = Path(td)
        _subprocess.run(
            ["ffmpeg", "-y", "-f", "lavfi", "-i", "testsrc2=s=320x180:r=10:d=1",
             "-c:v", "libx264", "-pix_fmt", "yuv420p", str(td / "noaudio.mp4")],
            check=True, capture_output=True,
        )
        try:
            _extract_audio(td / "noaudio.mp4", ["-f", "wav"], td / "a.wav")
            raise AssertionError("no-audio video did not raise")
        except RuntimeError as exc:
            assert "no audio track" in str(exc), exc
    print("audio extraction OK (friendly no-audio error)")
else:
    print("audio extraction SKIPPED (ffmpeg not on PATH)")

print("ALL SMOKE TESTS PASSED")
