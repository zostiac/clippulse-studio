"""Regression smoke tests for the post-merge hardening and frontend reliability batch.

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
import time
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
short_subtitle = parse_subtitle_text("1\n00:00:00,000 --> 00:00:00,100\none two three")
assert len(short_subtitle) == 1
assert all(word.end > word.start and word.end <= short_subtitle[0].end for word in short_subtitle[0].words)
pasted = parse_plain_transcript("First sentence. Second sentence.", 1.5)
assert pasted and pasted[-1].end <= 1.5

# Cross-platform font plumbing and filter escaping for the demo generator.
from ffutil import FFMPEG_BIN, FFPROBE_BIN, filter_quote  # noqa: E402
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

# Starlette's TestClient labels its peer "testclient" (older httpx versions
# do not expose a client= override), so map that synthetic host to loopback.
from unittest.mock import patch  # noqa: E402

_real_ip_address = main.ipaddress.ip_address
main.ipaddress.ip_address = lambda host: _real_ip_address("127.0.0.1") if host == "testclient" else _real_ip_address(host)
client = TestClient(main.app)

r = client.get("/api/health")
assert r.status_code == 200, r.text
caps = r.json()["capabilities"]
assert "ffmpeg" in caps and "video_pipeline_ready" in caps
print("health OK ->", caps)

# API and media are local-only unless a shared token is configured.
with patch.object(
    main.ipaddress,
    "ip_address",
    side_effect=lambda host: _real_ip_address("203.0.113.10") if host == "testclient" else _real_ip_address(host),
):
    remote_client = TestClient(main.app)
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

if _shutil.which(FFMPEG_BIN) and _shutil.which(FFPROBE_BIN):
    import tempfile

    from analyzer import _extract_audio

    with tempfile.TemporaryDirectory() as td:
        td = Path(td)
        _subprocess.run(
            [FFMPEG_BIN, "-y", "-f", "lavfi", "-i", "testsrc2=s=320x180:r=10:d=1",
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

        # End-to-end upload with a supplied transcript exercises the ingesting
        # -> analyzing -> ready state transition without needing an AI provider.
        valid_video = td / "valid.mp4"
        _subprocess.run(
            [FFMPEG_BIN, "-y", "-f", "lavfi", "-i", "testsrc2=s=320x180:r=10:d=2",
             "-c:v", "libx264", "-pix_fmt", "yuv420p", str(valid_video)],
            check=True, capture_output=True,
        )
        with valid_video.open("rb") as video_file:
            r = client.post(
                "/api/projects/upload",
                files={"file": ("valid.mp4", video_file, "video/mp4")},
                data={"title": "Upload smoke test", "transcript_text": "A short test transcript."},
            )
        assert r.status_code == 200, r.text
        created = r.json()
        assert created["status"] == "ready", created["status"]
        assert created["duration"] >= 1.5

        # Exercise trim bounds and a real FFmpeg export, including the worker
        # status lifecycle and cleanup of a stale render after style changes.
        project_id = created["id"]
        clip_response = client.post(
            f"/api/projects/{project_id}/clips",
            json={"title": "Export smoke test", "start": 0, "end": 2},
        )
        assert clip_response.status_code == 200, clip_response.text
        clip = clip_response.json()
        trimmed = client.patch(
            f"/api/projects/{project_id}/clips/{clip['id']}",
            json={"start": 1.8},
        )
        assert trimmed.status_code == 200, trimmed.text
        assert trimmed.json()["start"] == 0.5 and trimmed.json()["end"] == 2.0

        export_response = client.post(
            f"/api/projects/{project_id}/clips/{clip['id']}/export"
        )
        assert export_response.status_code == 200, export_response.text
        deadline = time.monotonic() + 60
        exported_clip = None
        while time.monotonic() < deadline:
            project_state = client.get(f"/api/projects/{project_id}").json()
            exported_clip = next(item for item in project_state["clips"] if item["id"] == clip["id"])
            if exported_clip["export_status"] in {"done", "error"}:
                break
            time.sleep(0.25)
        assert exported_clip and exported_clip["export_status"] == "done", exported_clip
        rendered_file = EXPORTS_DIR / exported_clip["export_filename"]
        assert rendered_file.is_file() and rendered_file.stat().st_size > 1024

        updated_style = client.patch(
            f"/api/projects/{project_id}/clips/{clip['id']}",
            json={"style": {"font_size": 64}},
        )
        assert updated_style.status_code == 200, updated_style.text
        assert updated_style.json()["export_status"] == "idle"
        assert updated_style.json()["export_filename"] is None
        assert not rendered_file.exists()
        assert client.delete(f"/api/projects/{project_id}").status_code == 200
    print("upload, clip trimming, FFmpeg export, and export invalidation OK")
else:
    print("audio extraction SKIPPED (ffmpeg not on PATH)")

# --- local whisper passes float32 ndarray (avoids PyAV 16+ metadata_errors) ---
import wave  # noqa: E402
import numpy as np  # noqa: E402

with tempfile.TemporaryDirectory() as wav_td:
    test_wav = Path(wav_td) / "sample.wav"
    pcm = np.array([0, 16384, -16384, 32767], dtype="<i2")
    with wave.open(str(test_wav), "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(16000)
        wf.writeframes(pcm.tobytes())
    samples = analyzer._load_pcm_wav_float32(test_wav)
    assert isinstance(samples, np.ndarray) and samples.dtype == np.float32
    assert len(samples) == 4 and abs(float(samples[1]) - 0.5) < 1e-4

    seen_audio = []

    class _FakeWhisperModel:
        def transcribe(self, audio, **_kwargs):
            seen_audio.append(audio)
            return [], None

    orig_extract = analyzer._extract_audio
    orig_get_whisper = analyzer._get_local_whisper
    try:
        def _fake_extract(_video_path, _args, out_path):
            out_path.write_bytes(test_wav.read_bytes())

        analyzer._extract_audio = _fake_extract
        analyzer._get_local_whisper = lambda _name: _FakeWhisperModel()
        analyzer.transcribe_with_local_whisper(Path(wav_td) / "fake.mp4", "tiny")
    finally:
        analyzer._extract_audio = orig_extract
        analyzer._get_local_whisper = orig_get_whisper
    assert len(seen_audio) == 1 and isinstance(seen_audio[0], np.ndarray)
    assert seen_audio[0].dtype == np.float32 and len(seen_audio[0]) == 4
print("local whisper float32 ndarray decoding OK")

print("ALL SMOKE TESTS PASSED")
