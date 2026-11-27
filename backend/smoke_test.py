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
import tempfile
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
from models import AppSettings, Clip, ClipStyle, TranscriptSegment, TranscriptionError, WordTiming  # noqa: E402

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

# A YouTube subtitle HTTP 429 must not fail an otherwise successful video download.
import ingest as _ingest  # noqa: E402
from unittest.mock import patch  # noqa: E402


class _FakeYoutubeDL:
    instances = 0

    def __init__(self, options):
        self.options = options
        type(self).instances += 1
        self.instance_number = type(self).instances

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def extract_info(self, _url, download=True):
        if self.instance_number == 1:
            assert self.options["writesubtitles"] is False
            (youtube_test_dir / "source.mp4").write_bytes(b"video payload")
            return {"title": "429 test video", "uploader": "Test channel"}
        assert self.options["skip_download"] is True
        raise RuntimeError("HTTP Error 429: Too Many Requests")


class _UnavailableTranscriptApi:
    def fetch(self, _video_id):
        raise RuntimeError("captions unavailable")


with tempfile.TemporaryDirectory() as youtube_td:
    youtube_test_dir = Path(youtube_td)
    _FakeYoutubeDL.instances = 0
    with patch.object(_ingest.yt_dlp, "YoutubeDL", _FakeYoutubeDL), \
         patch.object(_ingest, "fetch_youtube_oembed", return_value={}), \
         patch.object(_ingest, "YouTubeTranscriptApi", _UnavailableTranscriptApi):
        youtube_video, youtube_meta, youtube_transcript = _ingest.ingest_youtube(
            "https://youtu.be/abcdefghijk", youtube_test_dir
        )
    assert youtube_video.exists()
    assert youtube_meta["title"] == "429 test video"
    assert youtube_transcript == []
print("YouTube subtitle 429 fallback OK")

# A truncated cached demo must be regenerated, and only a probed MP4 may be published.
import ingest as _ingest  # noqa: E402

if __import__("shutil").which(FFMPEG_BIN) and __import__("shutil").which(FFPROBE_BIN):
    with tempfile.TemporaryDirectory() as demo_td:
        original_demos_dir = _ingest.DEMOS_DIR
        _ingest.DEMOS_DIR = Path(demo_td)
        try:
            corrupt_demo = Path(demo_td) / "podcast_creators_1080p.mp4"
            corrupt_demo.write_bytes(b"\x00" * 150_000)  # large enough to fool the old size-only check
            demo_path, _, _ = _ingest.ensure_demo_project_assets("podcast_creators")
            assert demo_path == corrupt_demo and demo_path.stat().st_size > 100_000
            demo_duration, demo_width, demo_height = probe_video(demo_path)
            assert demo_duration > 0 and demo_width == 1920 and demo_height == 1080
            assert not list(Path(demo_td).glob("*.tmp.mp4"))
        finally:
            _ingest.DEMOS_DIR = original_demos_dir
    print("corrupt demo cache recovery and MP4 validation OK")
else:
    print("demo cache recovery SKIPPED (ffmpeg/ffprobe not on PATH)")

# --- transcription failure must surface (H2) --------------------------------
import analyzer  # noqa: E402


def _boom(*_a, **_k):
    raise RuntimeError("provider down")


_orig_cloud_whisper = analyzer.transcribe_with_cloud_whisper
_orig_local_whisper = analyzer.transcribe_with_local_whisper
analyzer.transcribe_with_cloud_whisper = _boom
analyzer.transcribe_with_local_whisper = _boom

try:
    try:
        analyzer.analyze_project(
            "proj_t", "t", __file__, 60.0, [], [],
            AppSettings(ai_provider="groq", enable_local_whisper=True, api_key="k"),
        )
    except TranscriptionError as exc:
        print("H2 OK ->", str(exc)[:120])
    else:
        raise AssertionError("TranscriptionError not raised")
finally:
    analyzer.transcribe_with_cloud_whisper = _orig_cloud_whisper
    analyzer.transcribe_with_local_whisper = _orig_local_whisper

# No provider configured at all -> heuristic-only fallback, no exception.
tr, clips, eng, warnings = analyzer.analyze_project(
    "proj_t2", "t", __file__, 60.0, [], [],
    AppSettings(ai_provider="local_free", enable_local_whisper=False),
)
assert tr == [] and clips and eng == "local_free"
assert warnings == []
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

        # Force deterministic face-track keyframes so CI exercises the actual
        # per-frame FFmpeg crop expression without relying on a real face in testsrc.
        import exporter as _exporter
        face_detector = _exporter._detect_face_keyframes
        _exporter._detect_face_keyframes = lambda *_args: [(0.0, 20.0), (1.5, 200.0)]
        try:
            face_style = client.patch(
                f"/api/projects/{project_id}/clips/{clip['id']}",
                json={"style": {"reframe_mode": "face_follow"}},
            )
            assert face_style.status_code == 200, face_style.text
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
        finally:
            _exporter._detect_face_keyframes = face_detector
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
        analyzer._get_local_whisper = lambda _name, **_kwargs: _FakeWhisperModel()
        analyzer.transcribe_with_local_whisper(Path(wav_td) / "fake.mp4", "tiny")
    finally:
        analyzer._extract_audio = orig_extract
        analyzer._get_local_whisper = orig_get_whisper
    assert len(seen_audio) == 1 and isinstance(seen_audio[0], np.ndarray)
    assert seen_audio[0].dtype == np.float32 and len(seen_audio[0]) == 4
print("local whisper float32 ndarray decoding OK")

# --- bounded-memory local transcription and caption/reframe rendering ---
from analyzer import _iter_wav_chunks  # noqa: E402
from exporter import _crop_x_expression, build_ass_subtitles  # noqa: E402

with tempfile.TemporaryDirectory() as chunk_td:
    chunk_wav = Path(chunk_td) / "long.wav"
    silence = np.zeros(65 * 16000, dtype="<i2")
    with wave.open(str(chunk_wav), "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(16000)
        wf.writeframes(silence.tobytes())
    chunks = list(_iter_wav_chunks(chunk_wav))
    assert len(chunks) == 2
    assert len(chunks[0][3]) == 60 * 16000
    assert len(chunks[1][3]) == 7 * 16000
    assert abs(chunks[0][2] - chunks[1][1]) < 1e-6
    assert chunks[0][2] == 59.0 and chunks[1][1] == 59.0
print("local Whisper chunking/overlap boundaries OK")

track_expr = _crop_x_expression([(0.0, 20.0), (2.0, 120.0)], 60.0)
assert "if(lt(t,2.000)" in track_expr and "120.00" in track_expr
assert _crop_x_expression([], 42.0) == "42.0"

caption_clip = Clip(
    project_id="proj_1234abcd",
    title="Caption test",
    start=0.0,
    end=2.0,
    style=ClipStyle(
        caption_animation="none",
        caption_case="uppercase",
        caption_highlight="green",
        caption_background="pill",
        caption_font="Impact",
        show_hook_banner=False,
    ),
)
caption_transcript = [
    TranscriptSegment(
        start=0.0,
        end=2.0,
        text="hello there",
        words=[
            WordTiming(word="hello", start=0.0, end=0.8),
            WordTiming(word="there", start=0.8, end=1.6),
        ],
    )
]
with tempfile.TemporaryDirectory() as caption_td:
    ass_path = Path(caption_td) / "captions.ass"
    assert build_ass_subtitles(caption_clip, caption_transcript, ass_path, 1080, 1920)
    ass_text = ass_path.read_text(encoding="utf-8")
    assert "Impact" in ass_text and "HELLO THERE" in ass_text
    assert ",3," in ass_text  # pill background border style
    assert ("{" + chr(92) + "c") not in ass_text  # static phrase does not animate/highlight
assert ClipStyle().caption_animation == "pop"
assert ClipStyle().reframe_mode == "manual"
print("caption customization and static phrase ASS output OK")


# --- hybrid providers: Groq Whisper transcription + Gemini LLM clip detection ---
hybrid_calls = []


def _fake_cloud_whisper(_video_path, key, provider):
    hybrid_calls.append(("whisper", provider, key))
    return [TranscriptSegment(start=0.0, end=5.0, text="Hello viral world")]


def _fake_llm_clips(project_id, _title, _duration, _transcript, settings):
    hybrid_calls.append(("llm", settings.ai_provider, settings.api_key))
    return [Clip(project_id=project_id, title="Gemini clip", start=0.0, end=5.0)]


_orig_cw = analyzer.transcribe_with_cloud_whisper
_orig_llm = analyzer.detect_clips_with_llm
try:
    analyzer.transcribe_with_cloud_whisper = _fake_cloud_whisper
    analyzer.detect_clips_with_llm = _fake_llm_clips
    tr_h, clips_h, eng_h, warnings_h = analyzer.analyze_project(
        "proj_hybrid",
        "Hybrid test",
        Path(__file__),
        10.0,
        [],
        [],
        AppSettings(
            ai_provider="gemini",
            api_key="AIza_gemini_key",
            transcription_provider="groq",
            transcription_api_key="gsk_groq_whisper_key",
            enable_local_whisper=False,
        ),
    )
    assert len(tr_h) == 1 and len(clips_h) == 1 and eng_h == "gemini_free"
    assert hybrid_calls == [
        ("whisper", "groq", "gsk_groq_whisper_key"),
        ("llm", "gemini", "AIza_gemini_key"),
    ], hybrid_calls
finally:
    analyzer.transcribe_with_cloud_whisper = _orig_cw
    analyzer.detect_clips_with_llm = _orig_llm
print("hybrid Groq Whisper + Gemini LLM routing OK")

# --- atomic write retries transient Windows PermissionError (WinError 5) ---
import models as _models  # noqa: E402

with tempfile.TemporaryDirectory() as atomic_td:
    target_file = Path(atomic_td) / "project.json"
    replace_calls = {"n": 0}
    _real_replace = _models.os.replace

    def _flaky_replace(src, dst):
        replace_calls["n"] += 1
        if replace_calls["n"] < 3:
            raise PermissionError("simulated WinError 5")
        return _real_replace(src, dst)

    _models.os.replace = _flaky_replace
    try:
        _models._atomic_write_text(target_file, '{"ok": true}')
    finally:
        _models.os.replace = _real_replace
    assert replace_calls["n"] == 3 and target_file.read_text(encoding="utf-8") == '{"ok": true}'
    assert not list(Path(atomic_td).glob("*.tmp"))
print("atomic write WinError 5 retry OK")

# --- export render parity: layouts honour the split-screen crop anchors ------
# Renders each layout through the real FFmpeg pipeline from a two-tone source
# (left half red, right half blue) and checks the panes land where the crop
# anchors say — locking "the export matches the editor preview".
import shutil  # noqa: E402
import subprocess  # noqa: E402

from exporter import export_clip_mp4  # noqa: E402
from models import EXPORTS_DIR  # noqa: E402

_ff = shutil.which("ffmpeg")
_ffprobe = shutil.which("ffprobe")
if _ff and _ffprobe:
    EXPORTS_DIR.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as render_td:
        src = Path(render_td) / "twotone.mp4"
        subprocess.run(
            [
                _ff, "-hide_banner", "-loglevel", "error", "-y",
                "-f", "lavfi", "-i", "color=c=red:s=1280x720:d=2:r=24",
                "-f", "lavfi", "-i", "color=c=blue:s=1280x720:d=2:r=24",
                "-filter_complex", "[0:v][1:v]hstack=inputs=2,format=yuv420p[v]",
                "-map", "[v]", "-t", "2", str(src),
            ],
            check=True,
        )

        def _probe_size(path):
            out = subprocess.run(
                [_ffprobe, "-v", "error", "-select_streams", "v:0",
                 "-show_entries", "stream=width,height", "-of", "csv=p=0", str(path)],
                check=True, capture_output=True, text=True,
            ).stdout.strip()
            return tuple(int(v) for v in out.split(","))

        def _pixel(path, x, y, t=0.5):
            raw = subprocess.run(
                [_ff, "-hide_banner", "-loglevel", "error", "-i", str(path),
                 "-ss", f"{t}", "-vf", f"format=rgb24,crop=1:1:{x}:{y}", "-frames:v", "1",
                 "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
                check=True, capture_output=True,
            ).stdout
            return raw[0], raw[1], raw[2]

        def _mk_clip(layout, **style_kw):
            return Clip(
                id="clip_deadbeef",
                project_id="proj_deadbeef",
                title="render parity",
                start=0.0,
                end=2.0,
                style=ClipStyle(layout=layout, **style_kw),
            )

        # split_screen with hard-anchored panes: top = left (red), bottom = right (blue)
        split_out = export_clip_mp4(
            _mk_clip("split_screen", split_top_x=0.0, split_bottom_x=1.0), src, 2560, 720, []
        )
        assert _probe_size(split_out) == (1080, 1920), _probe_size(split_out)
        r, g, b = _pixel(split_out, 540, 300)
        assert r > 150 and b < 110, f"top pane should show the red (left) region, got {(r, g, b)}"
        r, g, b = _pixel(split_out, 540, 1600)
        assert b > 150 and r < 110, f"bottom pane should show the blue (right) region, got {(r, g, b)}"
        split_out.unlink(missing_ok=True)
        (EXPORTS_DIR / "proj_deadbeef_clip_deadbeef.ass").unlink(missing_ok=True)
        print("split_screen crop anchor parity OK")

        # center_crop with pan_x = -1 keeps the red (left) region in frame
        crop_out = export_clip_mp4(_mk_clip("center_crop", pan_x=-1.0), src, 2560, 720, [])
        assert _probe_size(crop_out) == (1080, 1920)
        r, g, b = _pixel(crop_out, 540, 960)
        assert r > 150 and b < 110, f"panned crop should stay on the red region, got {(r, g, b)}"
        crop_out.unlink(missing_ok=True)
        (EXPORTS_DIR / "proj_deadbeef_clip_deadbeef.ass").unlink(missing_ok=True)
        print("center_crop pan anchor parity OK")

        # blur_fill blurs the full source as backdrop (left stays reddish, right bluish)
        blur_out = export_clip_mp4(_mk_clip("blur_fill"), src, 2560, 720, [])
        assert _probe_size(blur_out) == (1080, 1920)
        r, g, b = _pixel(blur_out, 40, 40)
        assert r > g + 40 and r > b + 40, f"blur backdrop left edge should stay red, got {(r, g, b)}"
        r, g, b = _pixel(blur_out, 1040, 1880)
        assert b > r + 40 and b > g + 40, f"blur backdrop right edge should stay blue, got {(r, g, b)}"
        blur_out.unlink(missing_ok=True)
        (EXPORTS_DIR / "proj_deadbeef_clip_deadbeef.ass").unlink(missing_ok=True)
        print("blur_fill backdrop parity OK")

        # face_follow with cached keyframes pans the crop across the source:
        # early frames sit on the red (left) region, late frames on the blue.
        face_out = export_clip_mp4(
            _mk_clip(
                "center_crop",
                reframe_mode="face_follow",
                reframe_keyframes=[[0.0, 0.0], [2.0, 1.0]],
            ),
            src,
            2560,
            720,
            [],
        )
        assert _probe_size(face_out) == (1080, 1920)
        r, g, b = _pixel(face_out, 540, 400, t=0.3)
        assert r > 150 and b < 110, f"early face-follow frame should be red, got {(r, g, b)}"
        r, g, b = _pixel(face_out, 540, 1500, t=1.7)
        assert b > 150 and r < 110, f"late face-follow frame should be blue, got {(r, g, b)}"
        face_out.unlink(missing_ok=True)
        (EXPORTS_DIR / "proj_deadbeef_clip_deadbeef.ass").unlink(missing_ok=True)
        print("face_follow cached keyframe parity OK")
else:
    print("ffmpeg/ffprobe not found — skipped export render parity checks")

# --- hybrid routing: per-service keys, task lanes, settings migration --------
from analyzer import _llm_candidates, resolve_max_clips  # noqa: E402

assert resolve_max_clips(AppSettings(), 1260) == 13  # Auto: ~1 clip / 2 min
assert resolve_max_clips(AppSettings(max_clips=6), 1260) == 6

assert _llm_candidates(AppSettings(ai_provider="hybrid", gemini_api_key="AIzaG", groq_api_key="gskQ")) == [
    ("gemini", "AIzaG"),
    ("groq", "gskQ"),
]
assert _llm_candidates(AppSettings(ai_provider="hybrid", groq_api_key="gskQ")) == [("groq", "gskQ")]
assert _llm_candidates(AppSettings(ai_provider="hybrid", gemini_api_key="AIzaG")) == [("gemini", "AIzaG")]
assert _llm_candidates(AppSettings(ai_provider="local_free", gemini_api_key="AIzaG")) == []
assert _llm_candidates(AppSettings(ai_provider="gemini", api_key="AIzaX")) == [("gemini", "AIzaX")]
assert _llm_candidates(AppSettings(ai_provider="groq", groq_api_key="gskQ")) == [("groq", "gskQ")]
assert AppSettings().ai_provider == "hybrid"
print("hybrid routing candidates OK")

import json as _json  # noqa: E402

with tempfile.TemporaryDirectory() as mig_td:
    mig_file = Path(mig_td) / "settings.json"
    mig_file.write_text(
        _json.dumps({"ai_provider": "gemini", "api_key": "AIzaLegacy", "openai_api_key": "AIzaLegacy"}),
        encoding="utf-8",
    )
    _orig_settings_file = _models.SETTINGS_FILE
    _models.SETTINGS_FILE = mig_file
    try:
        migrated = _models.load_settings()
        assert migrated.ai_provider == "hybrid", migrated.ai_provider
        assert migrated.gemini_api_key == "AIzaLegacy", migrated.gemini_api_key
    finally:
        _models.SETTINGS_FILE = _orig_settings_file
print("settings v2 hybrid migration OK")

print("ALL SMOKE TESTS PASSED")
