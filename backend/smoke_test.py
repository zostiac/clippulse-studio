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
from ingest import (
    distribute_words,
    is_supported_video_bytes,
    parse_plain_transcript,
    parse_subtitle_text,
    probe_video,
)  # noqa: E402
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
short_words = distribute_words("one two three", 0.0, 0.1)
assert len(short_words) == 3
assert all(word.end > word.start for word in short_words)
assert short_words[-1].end <= 0.1
short_subtitle = parse_subtitle_text("1\\n00:00:00,000 --> 00:00:00,100\\none two three")
assert len(short_subtitle) == 1
assert all(word.end > word.start and word.end <= short_subtitle[0].end for word in short_subtitle[0].words)
pasted = parse_plain_transcript("First sentence. Second sentence.", 1.5)
assert pasted and pasted[-1].end <= 1.5

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
# Storage lock must be re-entrant because export progress updates save while locked.
from models import _store_lock, get_project_dir, load_project, delete_project, EXPORTS_DIR  # noqa: E402

try:
    get_project_dir("../outside")
    raise AssertionError("project path traversal was accepted")
except ValueError:
    pass
assert load_project("../outside") is None
assert delete_project("../outside") is False
with _store_lock:
    with _store_lock:
        pass
print("storage path/lock checks OK")
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

client = TestClient(main.app, client=("127.0.0.1", 50000))

r = client.get("/api/health")
assert r.status_code == 200, r.text
caps = r.json()["capabilities"]
assert "ffmpeg" in caps and "video_pipeline_ready" in caps
print("health OK ->", caps)

# API and media are local-only unless a shared token is configured.
remote_client = TestClient(main.app, client=("203.0.113.10", 50000))
assert remote_client.get("/api/projects").status_code == 503
assert remote_client.get("/media/exports/not-a-real-file.mp4").status_code == 503
assert remote_client.get("/api/health").status_code == 200
print("remote API/media access guard OK")

# Range requests support suffix ranges (used by video seeking).
range_path = EXPORTS_DIR / "range-smoke.bin"
try:
    range_path.write_bytes(b"0123456789")
    r = client.get("/media/exports/range-smoke.bin", headers={"Range": "bytes=-4"})
    assert r.status_code == 206 and r.content == b"6789", (r.status_code, r.content)
    r = client.get("/media/exports/range-smoke.bin", headers={"Range": "bytes=20-"})
    assert r.status_code == 416, (r.status_code, r.text)
finally:
    range_path.unlink(missing_ok=True)
print("media range handling OK")

# Garbage bytes rejected by container sniff.
files = {"file": ("evil.mp4", io.BytesIO(b"<html>not a video" * 50), "video/mp4")}
r = client.post("/api/projects/upload", files=files)
assert r.status_code == 400 and "Unsupported or empty video" in r.json()["detail"], r.text
print("upload sniff OK ->", r.json()["detail"])

# Hostname validation must reject lookalike domains before yt-dlp is called.
r = client.post("/api/projects/youtube", json={"url": "https://youtube.com.evil.example/watch?v=abcdefghijk"})
assert r.status_code == 400, (r.status_code, r.text)
print("YouTube hostname validation OK")

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
        _subprocess.run(
            ["ffmpeg", "-y", "-f", "lavfi", "-i", "sine=frequency=440:duration=1",
             "-c:a", "aac", str(td / "audio-only.mp4")],
            check=True, capture_output=True,
        )
        try:
            probe_video(td / "audio-only.mp4")
            raise AssertionError("audio-only media was accepted as a video")
        except ValueError as exc:
            assert "video stream" in str(exc)
        try:
            _extract_audio(td / "noaudio.mp4", ["-f", "wav"], td / "a.wav")
            raise AssertionError("no-audio video did not raise")
        except RuntimeError as exc:
            assert "no audio track" in str(exc), exc
    print("audio extraction OK (friendly no-audio error)")
else:
    print("audio extraction SKIPPED (ffmpeg not on PATH)")

print("ALL SMOKE TESTS PASSED")
