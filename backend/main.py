from __future__ import annotations

import hmac
import io
import ipaddress
import logging
import mimetypes
import os
import shutil
import subprocess
import threading
import time
import uuid
import zipfile
from pathlib import Path
from typing import Dict, List, Optional
from urllib.parse import urlsplit

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from analyzer import analyze_project, detect_clips_heuristic
from exporter import export_clip_mp4
from ffutil import FFMPEG_BIN, FFPROBE_BIN
from ingest import (
    YouTubeBlockedError,
    compute_energy_peaks,
    extract_youtube_id,
    ensure_demo_project_assets,
    fetch_youtube_oembed,
    generate_thumbnail,
    ingest_youtube,
    is_supported_video_bytes,
    parse_plain_transcript,
    parse_subtitle_text,
    probe_video,
)
from models import (
    BASE_DIR,
    COOKIES_FILE,
    DATA_DIR,
    EXPORTS_DIR,
    MAX_SUBTITLE_BYTES,
    MAX_UPLOAD_BYTES,
    MAX_UPLOAD_MB,
    PROJECTS_DIR,
    AppSettings,
    Clip,
    ClipStyle,
    PlatformMeta,
    Project,
    SubScores,
    TranscriptSegment,
    TranscriptionError,
    delete_project,
    get_project_dir,
    list_projects,
    load_project,
    load_settings,
    save_project,
    save_settings,
    _store_lock,
)

app = FastAPI(title="ClipPulse Studio API", version="1.2.0")
logger = logging.getLogger("clippulse")
API_TOKEN = os.getenv("CLIPPULSE_API_TOKEN", "").strip()
ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "CLIPPULSE_ALLOWED_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173,http://localhost:8000,http://127.0.0.1:8000",
    ).split(",")
    if origin.strip()
]

if "*" in ALLOWED_ORIGINS:
    raise RuntimeError("CLIPPULSE_ALLOWED_ORIGINS must list explicit origins; wildcard CORS is disabled.")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "X-API-Token"],
)


@app.middleware("http")
async def protect_api(request: Request, call_next):
    is_protected_path = request.url.path.startswith(("/api/", "/media/"))
    if is_protected_path and request.url.path != "/api/health" and request.method != "OPTIONS":
        content_length = request.headers.get("content-length")
        if content_length:
            try:
                request_size = int(content_length)
            except ValueError:
                return JSONResponse(status_code=400, content={"detail": "Invalid Content-Length header."})
            max_request_size = (
                MAX_UPLOAD_BYTES + MAX_SUBTITLE_BYTES + (2 * 1024 * 1024)
                if request.url.path == "/api/projects/upload"
                else max(20 * 1024 * 1024, MAX_SUBTITLE_BYTES + (2 * 1024 * 1024))
            )
            if request_size < 0 or request_size > max_request_size:
                return JSONResponse(status_code=413, content={"detail": "Request body exceeds the configured size limit."})
        if API_TOKEN:
            supplied = request.headers.get("x-api-token", "")
            if not hmac.compare_digest(supplied, API_TOKEN):
                return JSONResponse(status_code=401, content={"detail": "Valid API token required."})
        else:
            host = request.client.host if request.client else ""
            try:
                local_request = ipaddress.ip_address(host).is_loopback
            except ValueError:
                local_request = False
            if not local_request:
                return JSONResponse(
                    status_code=503,
                    content={"detail": "Remote API access is disabled. Configure CLIPPULSE_API_TOKEN first."},
                )
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("Referrer-Policy", "same-origin")
    response.headers.setdefault("X-Frame-Options", "DENY")
    return response


_EXPORT_LOCK = threading.Lock()
_ACTIVE_EXPORTS: set[str] = set()


_capability_cache: Dict[str, object] = {}


def _probe_binary_version(binary: str) -> Optional[str]:
    """Return `<name> <version>` for a required external tool, or None if missing."""
    key = f"bin:{binary}"
    if key in _capability_cache:
        return _capability_cache[key]  # type: ignore[return-value]
    try:
        res = subprocess.run(
            [binary, "-version"], capture_output=True, text=True, timeout=10
        )
        first_line = (res.stdout or res.stderr).splitlines()
        value: Optional[str] = first_line[0].strip() if first_line else binary
    except Exception:
        value = None
    _capability_cache[key] = value
    return value


# ---------------------------------------------------------------------------
# Helpers: Range-supporting video streaming
# ---------------------------------------------------------------------------

def _stream_file_range(path: Path, request: Request, download_name: Optional[str] = None) -> Response:
    if not path.exists() or not path.is_file():
        raise HTTPException(status_code=404, detail="Media file not found")

    file_size = path.stat().st_size
    content_type, _ = mimetypes.guess_type(str(path))
    content_type = content_type or "application/octet-stream"

    headers = {
        "Accept-Ranges": "bytes",
        "Cache-Control": "no-cache",
    }
    if download_name:
        headers["Content-Disposition"] = f'attachment; filename="{download_name}"'

    range_header = request.headers.get("range")
    if not range_header:
        return FileResponse(path, media_type=content_type, headers=headers)

    # Support one RFC 9110 byte range, including suffix ranges (bytes=-500).
    try:
        units, rng = range_header.strip().split("=", 1)
        if units.lower() != "bytes" or "," in rng or file_size == 0:
            raise ValueError("Unsupported range")
        start_str, end_str = rng.split("-", 1)
        if not start_str:
            suffix_length = int(end_str)
            if suffix_length <= 0:
                raise ValueError("Invalid suffix range")
            start = max(0, file_size - suffix_length)
            end = file_size - 1
        else:
            start = int(start_str)
            end = int(end_str) if end_str else file_size - 1
            if start >= file_size:
                raise ValueError("Range starts beyond end of file")
            end = min(end, file_size - 1)
        if start < 0 or start > end:
            raise ValueError("Invalid range")
    except (TypeError, ValueError):
        return Response(status_code=416, headers={"Content-Range": f"bytes */{file_size}"})

    chunk_len = end - start + 1

    def iter_file(chunk_size: int = 1024 * 512):
        with path.open("rb") as f:
            f.seek(start)
            remaining = chunk_len
            while remaining > 0:
                data = f.read(min(chunk_size, remaining))
                if not data:
                    break
                remaining -= len(data)
                yield data

    headers["Content-Range"] = f"bytes {start}-{end}/{file_size}"
    headers["Content-Length"] = str(chunk_len)
    return StreamingResponse(iter_file(), status_code=206, media_type=content_type, headers=headers)


# ---------------------------------------------------------------------------
# Helpers: demo asset linking + analysis orchestration
# ---------------------------------------------------------------------------

def _link_or_copy(src: Path, dst: Path) -> None:
    """Reuse demo assets safely: hardlink when possible, otherwise copy.

    Do not create symlinks here: media serving deliberately rejects resolved
    paths outside the per-project directory.
    """
    if dst.exists() or dst.is_symlink():
        return
    try:
        os.link(src, dst)
        return
    except OSError:
        shutil.copyfile(src, dst)


def _run_analysis(project: Project, settings: AppSettings) -> Project:
    """Transcribe/score a project, persisting `analyzing` then `ready`/`error`."""
    with _store_lock:
        # Callers may have loaded this project before acquiring the lock. Always
        # re-read the persisted state while holding the lock so two concurrent
        # reanalysis requests cannot both pass a stale "ready" status check.
        current = load_project(project.id)
        if current is None:
            raise HTTPException(status_code=404, detail="Project not found")
        project = current
        if project.status == "analyzing":
            raise HTTPException(status_code=409, detail="This project is already being analyzed.")
        if any(item.export_status == "rendering" for item in project.clips):
            raise HTTPException(status_code=409, detail="Wait for active exports to finish before analyzing this project.")
        project.status = "analyzing"
        project.error_message = None
        save_project(project)
    try:
        analysis_result = analyze_project(
            project.id,
            project.title,
            Path(project.video_path),
            project.duration,
            project.transcript,
            project.energy_peaks,
            settings,
        )
        if len(analysis_result) == 3:
            transcript, clips, engine_used = analysis_result
            analysis_warnings = []
        else:
            transcript, clips, engine_used, analysis_warnings = analysis_result
    except Exception as exc:
        # Never leave a project stuck in "analyzing": surface the failure on disk.
        project.status = "error"
        project.error_message = str(exc)
        save_project(project)
        raise
    project.transcript = transcript
    project.clips = clips
    project.ai_engine_used = engine_used
    project.analysis_warnings = analysis_warnings
    project.status = "ready"
    if not transcript:
        project.status_detail = (
            "No transcript produced: clips were ranked with energy heuristics only. "
            "Enable Local Whisper or a cloud provider in Settings for captions and better cuts."
        )
    elif analysis_warnings:
        project.status_detail = " ".join(analysis_warnings)
    else:
        project.status_detail = ""
    save_project(project)
    return project


# ---------------------------------------------------------------------------
# Request Schemas
# ---------------------------------------------------------------------------

class DemoRequest(BaseModel):
    demo_key: str = "podcast_creators"


class YouTubeRequest(BaseModel):
    url: str = Field(min_length=1, max_length=2048)
    fallback_transcript: Optional[str] = Field(default=None, max_length=5_000_000)


class CookiesRequest(BaseModel):
    cookies_text: str = Field(max_length=1_000_000)


class SettingsUpdate(BaseModel):
    ai_provider: Optional[str] = None
    api_key: Optional[str] = Field(default=None, max_length=4096)
    ai_model: Optional[str] = Field(default=None, max_length=200)
    transcription_provider: Optional[str] = None
    transcription_api_key: Optional[str] = Field(default=None, max_length=4096)
    enable_local_whisper: Optional[bool] = None
    whisper_model: Optional[str] = None
    openai_api_key: Optional[str] = None
    openai_model: Optional[str] = None
    default_caption_style: Optional[str] = None
    default_layout: Optional[str] = None


class CreateClipRequest(BaseModel):
    title: str = Field(default="Custom Viral Clip", max_length=300)
    start: float = Field(ge=0)
    end: float = Field(ge=0)


class UpdateClipRequest(BaseModel):
    title: Optional[str] = Field(default=None, max_length=300)
    start: Optional[float] = Field(default=None, ge=0)
    end: Optional[float] = Field(default=None, ge=0)
    style: Optional[ClipStyle] = None
    platform_meta: Optional[PlatformMeta] = None


class UpdateTranscriptRequest(BaseModel):
    segments: List[TranscriptSegment] = Field(max_length=1_000)


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/api/health")
def health():
    ffmpeg = _probe_binary_version(FFMPEG_BIN)
    ffprobe = _probe_binary_version(FFPROBE_BIN)
    try:
        import faster_whisper  # noqa: F401

        whisper = "available"
    except Exception:
        whisper = "unavailable"
    try:
        import cv2  # noqa: F401

        face_follow = "available"
    except Exception:
        face_follow = "unavailable"
    return {
        "status": "ok",
        "service": "ClipPulse Studio",
        "capabilities": {
            "ffmpeg": ffmpeg,
            "ffprobe": ffprobe,
            "local_whisper": whisper,
            "local_face_follow": face_follow,
            "video_pipeline_ready": bool(ffmpeg and ffprobe),
        },
    }


def _mask_key(key: str) -> str:
    if not key:
        return ""
    return f"{key[:6]}...{key[-4:]}" if len(key) > 12 else "••••"


@app.get("/api/settings")
def get_settings():
    s = load_settings()
    active_key = s.api_key or s.openai_api_key
    trans_key = s.transcription_api_key
    return {
        "ai_provider": s.ai_provider,
        "has_api_key": bool(active_key),
        "api_key_preview": _mask_key(active_key),
        "ai_model": s.ai_model,
        "transcription_provider": s.transcription_provider,
        "has_transcription_api_key": bool(trans_key),
        "transcription_api_key_preview": _mask_key(trans_key),
        "enable_local_whisper": s.enable_local_whisper,
        "whisper_model": s.whisper_model,
        "has_openai_key": bool(s.openai_api_key),
        "has_youtube_cookies": s.has_youtube_cookies,
        "default_caption_style": s.default_caption_style,
        "default_layout": s.default_layout,
    }


@app.put("/api/settings")
def update_settings(payload: SettingsUpdate):
    s = load_settings()
    if payload.ai_provider in ("local_free", "groq", "gemini", "openrouter", "openai"):
        s.ai_provider = payload.ai_provider  # type: ignore
    if payload.api_key is not None:
        s.api_key = payload.api_key.strip()
        s.openai_api_key = payload.api_key.strip()
    elif payload.openai_api_key is not None:
        s.api_key = payload.openai_api_key.strip()
        s.openai_api_key = payload.openai_api_key.strip()
    if payload.ai_model is not None:
        s.ai_model = payload.ai_model.strip()
    elif payload.openai_model is not None:
        s.ai_model = payload.openai_model.strip()
    if payload.transcription_provider in ("auto", "groq", "openai", "local"):
        s.transcription_provider = payload.transcription_provider  # type: ignore
    if payload.transcription_api_key is not None:
        s.transcription_api_key = payload.transcription_api_key.strip()
    if payload.enable_local_whisper is not None:
        s.enable_local_whisper = payload.enable_local_whisper
    if payload.whisper_model in ("tiny", "base"):
        s.whisper_model = payload.whisper_model  # type: ignore
    if payload.default_caption_style in ("hormozi", "beast", "minimal", "neon", "off"):
        s.default_caption_style = payload.default_caption_style  # type: ignore
    if payload.default_layout in ("center_crop", "blur_fill", "split_screen"):
        s.default_layout = payload.default_layout  # type: ignore
    save_settings(s)
    return get_settings()


def _validate_netscape_cookies(text: str) -> bool:
    """Basic validation for Netscape cookie format."""
    lines = [ln.strip() for ln in text.splitlines() if ln.strip() and (not ln.startswith("#") or ln.startswith("#HttpOnly_"))]
    if not lines:
        return False
    for ln in lines:
        parts = ln.split("\t")
        if len(parts) != 7:
            return False
        domain, include_subdomains, cookie_path, secure, expiry, name, _value = parts
        domain = domain.removeprefix("#HttpOnly_").lstrip(".").lower()
        if domain != "youtube.com" and not domain.endswith(".youtube.com"):
            return False
        if include_subdomains.upper() not in {"TRUE", "FALSE"}:
            return False
        if secure.upper() not in {"TRUE", "FALSE"}:
            return False
        if not cookie_path.startswith("/") or not expiry.isdigit() or not name:
            return False
    return True


@app.post("/api/settings/cookies")
def upload_cookies(payload: CookiesRequest):
    txt = payload.cookies_text.strip()
    if not txt or len(txt.encode("utf-8")) > 1_000_000:
        raise HTTPException(status_code=413, detail="Cookies file must be between 1 byte and 1 MB.")
    if not _validate_netscape_cookies(txt):
        raise HTTPException(status_code=400, detail="Invalid cookies.txt format. Must be Netscape format with 7 tab-separated fields per line.")
    COOKIES_FILE.write_text(txt + "\n", encoding="utf-8")
    try:
        COOKIES_FILE.chmod(0o600)
    except OSError:
        logger.warning("Could not restrict permissions on the YouTube cookies file")
    return get_settings()


@app.delete("/api/settings/cookies")
def clear_cookies():
    if COOKIES_FILE.exists():
        COOKIES_FILE.unlink(missing_ok=True)
    return get_settings()


@app.get("/api/projects")
def api_list_projects():
    return [p.model_dump() for p in list_projects()]


@app.get("/api/projects/{project_id}")
def api_get_project(project_id: str):
    proj = load_project(project_id)
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found")
    return proj.model_dump()


@app.delete("/api/projects/{project_id}")
def api_delete_project(project_id: str):
    with _store_lock:
        project = load_project(project_id)
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        if project.status in {"ingesting", "analyzing"} or any(item.export_status == "rendering" for item in project.clips):
            raise HTTPException(status_code=409, detail="Wait for analysis and exports to finish before deleting this project.")
        with _EXPORT_LOCK:
            if any(key.startswith(f"{project_id}:") for key in _ACTIVE_EXPORTS):
                raise HTTPException(status_code=409, detail="Wait for active exports to finish before deleting this project.")
        try:
            if not delete_project(project_id):
                raise HTTPException(status_code=404, detail="Project not found")
        except OSError as exc:
            logger.exception("Could not delete project %s", project_id)
            raise HTTPException(status_code=500, detail="Could not delete project files.") from exc
    return {"deleted": True}


@app.post("/api/projects/demo")
def api_create_demo(payload: DemoRequest):
    proj_id = f"proj_{uuid.uuid4().hex[:8]}"
    pdir = get_project_dir(proj_id)
    try:
        demo_video, meta, transcript = ensure_demo_project_assets(payload.demo_key)
        dest_video = pdir / "source.mp4"
        # Demo assets are identical across projects: hardlink/symlink instead of copying.
        _link_or_copy(demo_video, dest_video)
        duration, width, height = probe_video(dest_video)
        if duration < 1.5 or width <= 0 or height <= 0:
            raise ValueError("Demo asset does not contain a valid video stream.")
        thumb_path = pdir / "thumb.jpg"
        generate_thumbnail(dest_video, thumb_path, duration)
        energy = compute_energy_peaks(dest_video)

        project = Project(
            id=proj_id,
            title=str(meta.get("title") or "ClipPulse Demo")[:300],
            source_type="demo",
            channel_name=meta.get("channel_name"),
            video_path=str(dest_video),
            video_url=f"/media/projects/{proj_id}/source.mp4",
            thumbnail_url=f"/media/projects/{proj_id}/thumb.jpg" if thumb_path.exists() else None,
            duration=round(duration, 2),
            width=width,
            height=height,
            status="ingesting",
            transcript=transcript,
            energy_peaks=energy,
        )
        save_project(project)
    except Exception as exc:
        shutil.rmtree(pdir, ignore_errors=True)
        logger.exception("Demo project preparation failed for project %s", proj_id)
        raise HTTPException(status_code=500, detail="Could not prepare the demo project.") from exc

    try:
        project = _run_analysis(project, load_settings())
    except TranscriptionError as exc:
        raise HTTPException(status_code=422, detail=f"Transcription failed: {exc}") from exc
    return project.model_dump()


@app.post("/api/projects/youtube")
def api_create_youtube(payload: YouTubeRequest):
    url = payload.url.strip()
    try:
        parsed = urlsplit(url)
        valid_host = parsed.hostname in {"youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"}
        valid_port = parsed.port in (None, 80, 443)
    except ValueError:
        parsed = None
        valid_host = False
        valid_port = False
    if (
        not url
        or parsed is None
        or parsed.scheme not in {"http", "https"}
        or not valid_host
        or not valid_port
        or parsed.username
        or parsed.password
        or not extract_youtube_id(url)
    ):
        raise HTTPException(status_code=400, detail="Please enter a valid YouTube video URL.")
    if payload.fallback_transcript and len(payload.fallback_transcript.encode("utf-8")) > MAX_SUBTITLE_BYTES:
        raise HTTPException(status_code=413, detail="Fallback transcript exceeds the configured subtitle size limit.")

    proj_id = f"proj_{uuid.uuid4().hex[:8]}"
    pdir = get_project_dir(proj_id)
    try:
        video_path, meta, transcript = ingest_youtube(url, pdir)
        duration, width, height = probe_video(video_path)
        if duration < 1.5 or width <= 0 or height <= 0:
            raise ValueError("Downloaded video does not contain a valid video stream.")
        if not transcript and payload.fallback_transcript:
            transcript = parse_plain_transcript(payload.fallback_transcript, duration)

        thumb_path = pdir / "thumb.jpg"
        generate_thumbnail(video_path, thumb_path, duration)
        energy = compute_energy_peaks(video_path)
    except YouTubeBlockedError as exc:
        shutil.rmtree(pdir, ignore_errors=True)
        return JSONResponse(
            status_code=422,
            content={"code": "YOUTUBE_BOT_BLOCK", "detail": str(exc), "oembed": exc.meta},
        )
    except Exception as exc:
        shutil.rmtree(pdir, ignore_errors=True)
        logger.exception("YouTube ingestion failed for project %s", proj_id)
        raise HTTPException(status_code=400, detail="Could not download or process this YouTube video. Check the URL and try again.") from exc

    project = Project(
        id=proj_id,
        title=(meta.get("title") or "YouTube video")[:300],
        source_type="youtube",
        source_url=url,
        channel_name=meta.get("channel_name"),
        video_path=str(video_path),
        video_url=f"/media/projects/{proj_id}/{video_path.name}",
        thumbnail_url=f"/media/projects/{proj_id}/thumb.jpg" if thumb_path.exists() else meta.get("thumbnail_url"),
        duration=round(duration, 2),
        width=width,
        height=height,
        status="ingesting",
        transcript=transcript,
        energy_peaks=energy,
    )
    save_project(project)

    try:
        project = _run_analysis(project, load_settings())
    except TranscriptionError as exc:
        raise HTTPException(status_code=422, detail=f"Transcription failed: {exc}") from exc
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("YouTube project analysis failed for project %s", proj_id)
        raise HTTPException(status_code=500, detail="Video was downloaded, but analysis failed. Open the project to inspect its status.") from exc
    return project.model_dump()


@app.post("/api/projects/upload")
async def api_create_upload(
    file: UploadFile = File(...),
    title: Optional[str] = Form(None),
    transcript_text: Optional[str] = Form(None),
    subtitle_file: Optional[UploadFile] = File(None),
):
    filename = (file.filename or "").strip()
    ext = Path(filename).suffix.lower()
    if ext not in {".mp4", ".mov", ".webm", ".mkv", ".m4v"}:
        raise HTTPException(status_code=415, detail="Unsupported video format. Upload MP4, MOV, WebM, MKV, or M4V.")
    if subtitle_file and Path(subtitle_file.filename or "").suffix.lower() not in {".srt", ".vtt"}:
        raise HTTPException(status_code=415, detail="Subtitle files must use .srt or .vtt.")

    proj_id = f"proj_{uuid.uuid4().hex[:8]}"
    pdir = get_project_dir(proj_id)
    project_saved = False
    dest_video = pdir / f"source{ext}"

    try:
        total_bytes = 0
        sniff_head = b""
        with dest_video.open("wb") as out_f:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                total_bytes += len(chunk)
                if total_bytes > MAX_UPLOAD_BYTES:
                    raise HTTPException(
                        status_code=413,
                        detail=f"Video exceeds the {MAX_UPLOAD_MB} MB upload limit.",
                    )
                if len(sniff_head) < 16:
                    sniff_head += chunk[: 16 - len(sniff_head)]
                out_f.write(chunk)

        if total_bytes == 0 or not is_supported_video_bytes(sniff_head):
            raise HTTPException(
                status_code=400,
                detail="Unsupported or empty video. Upload a valid MP4, MOV, WebM, MKV, or M4V file.",
            )

        duration, width, height = probe_video(dest_video)
        if duration < 1.5 or width <= 0 or height <= 0:
            raise HTTPException(status_code=400, detail="Video must contain a valid video stream at least 1.5 seconds long.")

        transcript: List[TranscriptSegment] = []
        if subtitle_file is not None:
            raw_bytes = await subtitle_file.read(MAX_SUBTITLE_BYTES + 1)
            if len(raw_bytes) > MAX_SUBTITLE_BYTES:
                raise HTTPException(
                    status_code=413,
                    detail=f"Subtitle file exceeds the {MAX_SUBTITLE_BYTES // (1024 * 1024)} MB limit.",
                )
            raw_sub = raw_bytes.decode("utf-8-sig", errors="replace")
            transcript = parse_subtitle_text(raw_sub)
        elif transcript_text and transcript_text.strip():
            if len(transcript_text.encode("utf-8")) > MAX_SUBTITLE_BYTES:
                raise HTTPException(status_code=413, detail="Transcript text exceeds the configured subtitle size limit.")
            raw_text = transcript_text.strip()
            transcript = (
                parse_subtitle_text(raw_text)
                if "-->" in raw_text
                else parse_plain_transcript(raw_text, duration)
            )

        thumb_path = pdir / "thumb.jpg"
        generate_thumbnail(dest_video, thumb_path, duration)
        energy = compute_energy_peaks(dest_video)
        clean_title = (title or "").strip()[:300] or Path(filename).stem.replace("_", " ").replace("-", " ")

        project = Project(
            id=proj_id,
            title=clean_title,
            source_type="upload",
            channel_name="Local Upload",
            video_path=str(dest_video),
            video_url=f"/media/projects/{proj_id}/{dest_video.name}",
            thumbnail_url=f"/media/projects/{proj_id}/thumb.jpg" if thumb_path.exists() else None,
            duration=round(duration, 2),
            width=width,
            height=height,
            status="ingesting",
            transcript=transcript,
            energy_peaks=energy,
        )
        save_project(project)
        project_saved = True

        try:
            project = _run_analysis(project, load_settings())
        except TranscriptionError as exc:
            raise HTTPException(status_code=422, detail=f"Transcription failed: {exc}") from exc
        return project.model_dump()
    except HTTPException:
        if not project_saved:
            shutil.rmtree(pdir, ignore_errors=True)
        raise
    except Exception as exc:
        if not project_saved:
            shutil.rmtree(pdir, ignore_errors=True)
        logger.exception("Video upload processing failed for project %s", proj_id)
        raise HTTPException(status_code=400, detail="Could not process the uploaded video. Verify the file and try again.") from exc
    except BaseException:
        if not project_saved:
            shutil.rmtree(pdir, ignore_errors=True)
        raise
    finally:
        await file.close()
        if subtitle_file is not None:
            await subtitle_file.close()


@app.post("/api/projects/{project_id}/reanalyze")
def api_reanalyze(project_id: str):
    proj = load_project(project_id)
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found")
    if any(item.export_status == "rendering" for item in proj.clips):
        raise HTTPException(status_code=409, detail="Wait for active exports to finish before reanalyzing this project.")
    settings = load_settings()
    try:
        proj = _run_analysis(proj, settings)
    except TranscriptionError as exc:
        raise HTTPException(status_code=422, detail=f"Transcription failed: {exc}")
    return proj.model_dump()


@app.put("/api/projects/{project_id}/transcript")
def api_update_transcript(project_id: str, payload: UpdateTranscriptRequest):
    from ingest import distribute_words
    with _store_lock:
        proj = load_project(project_id)
        if not proj:
            raise HTTPException(status_code=404, detail="Project not found")
        if proj.status in {"ingesting", "analyzing"} or any(item.export_status == "rendering" for item in proj.clips):
            raise HTTPException(status_code=409, detail="Wait for analysis and exports to finish before editing the transcript.")
        updated: List[TranscriptSegment] = []
        for seg in payload.segments:
            words = distribute_words(seg.text, seg.start, seg.end)
            updated.append(TranscriptSegment(id=seg.id, start=seg.start, end=seg.end, text=seg.text, words=words))
        proj.transcript = updated
        save_project(proj)
        return proj.model_dump()


@app.post("/api/projects/{project_id}/clips")
def api_create_clip(project_id: str, payload: CreateClipRequest):
    with _store_lock:
        proj = load_project(project_id)
        if not proj:
            raise HTTPException(status_code=404, detail="Project not found")
        if proj.status in {"ingesting", "analyzing"}:
            raise HTTPException(status_code=409, detail="Wait for analysis to finish before creating clips.")
        if proj.duration < 1.5:
            raise HTTPException(status_code=400, detail="This source video is too short to create a clip.")
        min_clip_duration = min(2.0, proj.duration)
        st = max(0.0, min(float(payload.start), proj.duration - min_clip_duration))
        en = max(st + min_clip_duration, min(float(payload.end), proj.duration))
        title = (payload.title or "").strip()[:300] or "Custom Viral Clip"
        settings = load_settings()
        snippet_txt = " ".join(
            s.text for s in proj.transcript if s.end >= st and s.start <= en
        ) or title
        hook_banner = " ".join(title.split()[:6]).upper()

        new_clip = Clip(
            project_id=proj.id,
            title=title,
            start=round(st, 2),
            end=round(en, 2),
            viral_score=84,
            sub_scores=SubScores(hook=84, retention=85, shareability=82, clarity=86),
            reason="Manual custom range selected in timeline studio.",
            style=ClipStyle(
                layout=settings.default_layout,
                caption_style=settings.default_caption_style,
                hook_banner_text=hook_banner,
            ),
            platform_meta=PlatformMeta(
                youtube_title=f"{title[:82]} #shorts",
                youtube_description=snippet_txt[:220],
                youtube_tags=["shorts", "viral", "clips"],
                instagram_caption=snippet_txt[:220],
                instagram_hashtags=["#reels", "#viral", "#shorts"],
                tiktok_caption=title,
                tiktok_hashtags=["#fyp", "#viral"],
            ),
        )
        proj.clips.insert(0, new_clip)
        save_project(proj)
        return new_clip.model_dump()


@app.patch("/api/projects/{project_id}/clips/{clip_id}")
def api_update_clip(project_id: str, clip_id: str, payload: UpdateClipRequest):
    with _store_lock:
        proj = load_project(project_id)
        if not proj:
            raise HTTPException(status_code=404, detail="Project not found")
        if proj.status in {"ingesting", "analyzing"}:
            raise HTTPException(status_code=409, detail="Wait for analysis to finish before editing clips.")
        target = next((item for item in proj.clips if item.id == clip_id), None)
        if not target:
            raise HTTPException(status_code=404, detail="Clip not found")
        if target.export_status == "rendering":
            raise HTTPException(status_code=409, detail="Wait for this clip's export to finish before editing it.")

        if payload.title is not None:
            target.title = payload.title.strip()[:300] or target.title
        if payload.start is not None or payload.end is not None:
            if proj.duration < 1.5:
                raise HTTPException(status_code=400, detail="This source video is too short to trim.")
            min_duration = min(1.5, proj.duration)
            next_start = target.start if payload.start is None else float(payload.start)
            next_end = target.end if payload.end is None else float(payload.end)
            next_start = max(0.0, min(next_start, proj.duration - min_duration))
            next_end = max(0.0, min(next_end, proj.duration))
            if next_end - next_start < min_duration:
                if payload.start is not None and payload.end is None:
                    next_end = min(proj.duration, next_start + min_duration)
                    next_start = max(0.0, next_end - min_duration)
                elif payload.end is not None and payload.start is None:
                    next_end = max(min_duration, next_end)
                    next_start = max(0.0, next_end - min_duration)
                else:
                    next_end = min(proj.duration, next_start + min_duration)
                    next_start = max(0.0, next_end - min_duration)
            target.start = round(next_start, 2)
            target.end = round(next_end, 2)
        if payload.style is not None:
            target.style = payload.style
        if payload.platform_meta is not None:
            target.platform_meta = payload.platform_meta

        if payload.start is not None or payload.end is not None or payload.style is not None:
            if target.export_status in {"done", "error"}:
                old_filename = target.export_filename
                target.export_status = "idle"
                target.export_progress = 0
                target.export_error = None
                target.export_filename = None
                target.export_url = None
                target.exported_at = None
                if old_filename and Path(old_filename).name == old_filename:
                    old_path = (EXPORTS_DIR / old_filename).resolve()
                    if old_path.is_relative_to(EXPORTS_DIR.resolve()) and old_path.is_file():
                        old_path.unlink(missing_ok=True)

        save_project(proj)
        return target.model_dump()


@app.delete("/api/projects/{project_id}/clips/{clip_id}")
def api_delete_clip(project_id: str, clip_id: str):
    with _store_lock:
        proj = load_project(project_id)
        if not proj:
            raise HTTPException(status_code=404, detail="Project not found")
        if proj.status in {"ingesting", "analyzing"}:
            raise HTTPException(status_code=409, detail="Wait for analysis to finish before deleting clips.")
        target = next((item for item in proj.clips if item.id == clip_id), None)
        if target and target.export_status == "rendering":
            raise HTTPException(status_code=409, detail="Wait for this clip's export to finish before deleting it.")
        with _EXPORT_LOCK:
            if f"{project_id}:{clip_id}" in _ACTIVE_EXPORTS:
                raise HTTPException(status_code=409, detail="Wait for this clip's export to finish before deleting it.")
        proj.clips = [item for item in proj.clips if item.id != clip_id]
        save_project(proj)
        return {"deleted": True}


def _run_export_job(project_id: str, clip_id: str) -> None:
    export_key = f"{project_id}:{clip_id}"
    with _EXPORT_LOCK:
        if export_key in _ACTIVE_EXPORTS:
            return
        _ACTIVE_EXPORTS.add(export_key)

    try:
        with _store_lock:
            proj = load_project(project_id)
            if not proj:
                return
            clip = next((c for c in proj.clips if c.id == clip_id), None)
            if not clip:
                return
            video_path = Path(proj.video_path)
            src_w, src_h = proj.width, proj.height
            transcript = proj.transcript

        def update_progress(pct: int) -> None:
            with _store_lock:
                current = load_project(project_id)
                if not current:
                    return
                for item in current.clips:
                    if item.id == clip_id:
                        item.export_progress = pct
                        break
                save_project(current)

        out_path = export_clip_mp4(
            clip=clip,
            video_path=video_path,
            src_w=src_w,
            src_h=src_h,
            transcript=transcript,
            on_progress=update_progress,
        )
        with _store_lock:
            current = load_project(project_id)
            if current:
                for item in current.clips:
                    if item.id == clip_id:
                        item.export_status = "done"
                        item.export_progress = 100
                        item.export_filename = out_path.name
                        item.export_url = f"/media/exports/{out_path.name}"
                        item.export_error = None
                        item.exported_at = time.time()
                        break
                save_project(current)
    except Exception as exc:
        logger.exception("Export failed for project %s clip %s", project_id, clip_id)
        with _store_lock:
            current = load_project(project_id)
            if current:
                for item in current.clips:
                    if item.id == clip_id:
                        item.export_status = "error"
                        item.export_error = str(exc)
                        break
                save_project(current)
    finally:
        with _EXPORT_LOCK:
            _ACTIVE_EXPORTS.discard(export_key)


@app.post("/api/projects/{project_id}/clips/{clip_id}/export")
def api_export_clip(project_id: str, clip_id: str):
    with _store_lock:
        proj = load_project(project_id)
        if not proj:
            raise HTTPException(status_code=404, detail="Project not found")
        if proj.status in {"ingesting", "analyzing"}:
            raise HTTPException(status_code=409, detail="Wait for analysis to finish before exporting clips.")
        clip = next((item for item in proj.clips if item.id == clip_id), None)
        if not clip:
            raise HTTPException(status_code=404, detail="Clip not found")
        if clip.export_status == "rendering":
            raise HTTPException(status_code=409, detail="This clip is already being exported.")
        clip.export_status = "rendering"
        clip.export_progress = 5
        clip.export_error = None
        save_project(proj)
        response = clip.model_dump()

    try:
        threading.Thread(target=_run_export_job, args=(project_id, clip_id), daemon=True).start()
    except Exception:
        with _store_lock:
            current = load_project(project_id)
            if current:
                for item in current.clips:
                    if item.id == clip_id:
                        item.export_status = "error"
                        item.export_error = "Could not start the export worker."
                save_project(current)
        raise HTTPException(status_code=500, detail="Could not start the export worker.")
    return response


@app.post("/api/projects/{project_id}/export-all")
def api_export_all(project_id: str):
    with _store_lock:
        proj = load_project(project_id)
        if not proj:
            raise HTTPException(status_code=404, detail="Project not found")
        if proj.status in {"ingesting", "analyzing"}:
            raise HTTPException(status_code=409, detail="Wait for analysis to finish before exporting clips.")
        queued_ids = []
        for item in proj.clips:
            if item.export_status != "rendering":
                item.export_status = "rendering"
                item.export_progress = 5
                item.export_error = None
                queued_ids.append(item.id)
        save_project(proj)
        response = proj.model_dump()

    def run_seq():
        for queued_id in queued_ids:
            _run_export_job(project_id, queued_id)

    if queued_ids:
        try:
            threading.Thread(target=run_seq, daemon=True).start()
        except Exception as exc:
            with _store_lock:
                current = load_project(project_id)
                if current:
                    for item in current.clips:
                        if item.id in queued_ids:
                            item.export_status = "error"
                            item.export_error = "Could not start the export worker."
                    save_project(current)
            logger.exception("Could not start export-all worker for project %s", project_id)
            raise HTTPException(status_code=500, detail="Could not start the export queue.") from exc
    return response


@app.get("/api/projects/{project_id}/download-bundle")
def api_download_bundle(project_id: str):
    proj = load_project(project_id)
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found")

    exported = [c for c in proj.clips if c.export_status == "done" and c.export_filename]
    if not exported:
        raise HTTPException(status_code=400, detail="Export at least one clip before downloading the bundle.")

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        meta_lines = [f"PROJECT: {proj.title}\n"]
        for idx, c in enumerate(exported, 1):
            mp4 = (EXPORTS_DIR / (c.export_filename or "")).resolve()
            if mp4.is_relative_to(EXPORTS_DIR.resolve()) and mp4.is_file():
                safe_name = f"{idx:02d}_{c.id}.mp4"
                zf.write(mp4, arcname=safe_name)
            meta_lines.append(
                f"=== CLIP {idx}: {c.title} (Score: {c.viral_score}) ===\n"
                f"YouTube Shorts Title: {c.platform_meta.youtube_title}\n"
                f"YouTube Description:\n{c.platform_meta.youtube_description}\n\n"
                f"Instagram Reels:\n{c.platform_meta.instagram_caption}\n{' '.join(c.platform_meta.instagram_hashtags)}\n\n"
                f"TikTok:\n{c.platform_meta.tiktok_caption}\n{' '.join(c.platform_meta.tiktok_hashtags)}\n\n"
            )
        zf.writestr("social_captions.txt", "\n".join(meta_lines))

    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{proj.id}_shorts_bundle.zip"'},
    )


# ---------------------------------------------------------------------------
# Media endpoints (range-capable for smooth scrubbing)
# ---------------------------------------------------------------------------

@app.get("/media/projects/{project_id}/{filename}")
def serve_project_media(project_id: str, filename: str, request: Request):
    # Sanitize both path components to prevent traversal
    safe_project_id = Path(project_id).name
    safe_filename = Path(filename).name
    safe_path = (PROJECTS_DIR / safe_project_id / safe_filename).resolve()
    if not safe_path.is_relative_to(PROJECTS_DIR.resolve()):
        raise HTTPException(status_code=403, detail="Forbidden")
    return _stream_file_range(safe_path, request)


@app.get("/media/exports/{filename}")
def serve_export_media(filename: str, request: Request, download: int = 0):
    safe_path = (EXPORTS_DIR / Path(filename).name).resolve()
    if not safe_path.is_relative_to(EXPORTS_DIR.resolve()):
        raise HTTPException(status_code=403, detail="Forbidden")
    return _stream_file_range(safe_path, request, download_name=safe_path.name if download else None)


# ---------------------------------------------------------------------------
# Frontend Static Bundle Serving (when built)
# ---------------------------------------------------------------------------

FRONTEND_DIST = BASE_DIR / "frontend" / "dist"
if FRONTEND_DIST.exists():
    assets_dir = FRONTEND_DIST / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")

    @app.get("/{full_path:path}")
    def serve_spa(full_path: str):
        # Don't serve SPA for API routes — return 404 for unknown API endpoints
        if full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="API endpoint not found")
        dist_root = FRONTEND_DIST.resolve()
        candidate = (FRONTEND_DIST / full_path).resolve()
        if (
            full_path
            and candidate.is_relative_to(dist_root)
            and candidate.exists()
            and candidate.is_file()
        ):
            return FileResponse(candidate)
        return FileResponse(FRONTEND_DIST / "index.html")
