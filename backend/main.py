from __future__ import annotations

import io
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

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from analyzer import analyze_project, detect_clips_heuristic
from exporter import export_clip_mp4
from ingest import (
    YouTubeBlockedError,
    compute_energy_peaks,
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

app = FastAPI(title="ClipPulse Studio API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    # Wildcard origins cannot be combined with credentials; the app is token-free/local.
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

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

    # Parse Range: bytes=start-end
    try:
        units, rng = range_header.strip().split("=", 1)
        if units != "bytes":
            return FileResponse(path, media_type=content_type, headers=headers)
        start_str, end_str = rng.split("-", 1)
        start = int(start_str) if start_str else 0
        end = int(end_str) if end_str else file_size - 1
        start = max(0, start)
        end = min(file_size - 1, end)
        if start > end:
            raise ValueError("Invalid range")
    except Exception:
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
    """Avoid duplicating multi-MB demo assets: hardlink, then symlink, then copy."""
    if dst.exists() or dst.is_symlink():
        return
    try:
        os.link(src, dst)
        return
    except OSError:
        pass
    try:
        os.symlink(src, dst)
        return
    except OSError:
        pass
    shutil.copyfile(src, dst)


def _run_analysis(project: Project, settings: AppSettings) -> Project:
    """Transcribe/score a project, persisting `analyzing` then `ready`/`error`."""
    project.status = "analyzing"
    project.error_message = None
    save_project(project)
    try:
        transcript, clips, engine_used = analyze_project(
            project.id,
            project.title,
            Path(project.video_path),
            project.duration,
            project.transcript,
            project.energy_peaks,
            settings,
        )
    except Exception as exc:
        # Never leave a project stuck in "analyzing": surface the failure on disk.
        project.status = "error"
        project.error_message = str(exc)
        save_project(project)
        raise
    project.transcript = transcript
    project.clips = clips
    project.ai_engine_used = engine_used
    project.status = "ready"
    if not transcript:
        project.status_detail = (
            "No transcript produced: clips were ranked with energy heuristics only. "
            "Enable Local Whisper or a cloud provider in Settings for captions and better cuts."
        )
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
    url: str
    fallback_transcript: Optional[str] = None


class CookiesRequest(BaseModel):
    cookies_text: str


class SettingsUpdate(BaseModel):
    ai_provider: Optional[str] = None
    api_key: Optional[str] = None
    ai_model: Optional[str] = None
    enable_local_whisper: Optional[bool] = None
    whisper_model: Optional[str] = None
    openai_api_key: Optional[str] = None
    openai_model: Optional[str] = None
    default_caption_style: Optional[str] = None
    default_layout: Optional[str] = None


class CreateClipRequest(BaseModel):
    title: str = "Custom Viral Clip"
    start: float
    end: float


class UpdateClipRequest(BaseModel):
    title: Optional[str] = None
    start: Optional[float] = None
    end: Optional[float] = None
    style: Optional[ClipStyle] = None
    platform_meta: Optional[PlatformMeta] = None


class UpdateTranscriptRequest(BaseModel):
    segments: List[TranscriptSegment]


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/api/health")
def health():
    ffmpeg = _probe_binary_version("ffmpeg")
    ffprobe = _probe_binary_version("ffprobe")
    try:
        import faster_whisper  # noqa: F401

        whisper = "available"
    except Exception:
        whisper = "unavailable"
    return {
        "status": "ok",
        "service": "ClipPulse Studio",
        "capabilities": {
            "ffmpeg": ffmpeg,
            "ffprobe": ffprobe,
            "local_whisper": whisper,
            "video_pipeline_ready": bool(ffmpeg and ffprobe),
        },
    }


@app.get("/api/settings")
def get_settings():
    s = load_settings()
    active_key = s.api_key or s.openai_api_key
    masked = ""
    if active_key:
        masked = f"{active_key[:6]}...{active_key[-4:]}" if len(active_key) > 12 else "••••"
    return {
        "ai_provider": s.ai_provider,
        "has_api_key": bool(active_key),
        "api_key_preview": masked,
        "ai_model": s.ai_model,
        "enable_local_whisper": s.enable_local_whisper,
        "whisper_model": s.whisper_model,
        "has_openai_key": bool(active_key),
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
    lines = [ln.strip() for ln in text.splitlines() if ln.strip() and not ln.startswith("#")]
    if not lines:
        return False
    for ln in lines:
        parts = ln.split("\t")
        if len(parts) != 7:
            return False
        # domain, flag, path, secure, expiration, name, value
        if not parts[0] or not parts[5]:
            return False
    return True


@app.post("/api/settings/cookies")
def upload_cookies(payload: CookiesRequest):
    txt = payload.cookies_text.strip()
    if not txt or "youtube.com" not in txt:
        raise HTTPException(status_code=400, detail="Please paste valid Netscape-format cookies.txt containing youtube.com cookies.")
    if not _validate_netscape_cookies(txt):
        raise HTTPException(status_code=400, detail="Invalid cookies.txt format. Must be Netscape format with 7 tab-separated fields per line.")
    COOKIES_FILE.write_text(txt + "\n", encoding="utf-8")
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
    if not delete_project(project_id):
        raise HTTPException(status_code=404, detail="Project not found")
    return {"deleted": True}


@app.post("/api/projects/demo")
def api_create_demo(payload: DemoRequest):
    proj_id = f"proj_{uuid.uuid4().hex[:8]}"
    pdir = get_project_dir(proj_id)
    demo_video, meta, transcript = ensure_demo_project_assets(payload.demo_key)

    dest_video = pdir / "source.mp4"
    # Demo assets are identical across projects: hardlink/symlink instead of copying.
    _link_or_copy(demo_video, dest_video)

    duration, width, height = probe_video(dest_video)
    thumb_path = pdir / "thumb.jpg"
    generate_thumbnail(dest_video, thumb_path, duration)
    energy = compute_energy_peaks(dest_video)

    project = Project(
        id=proj_id,
        title=meta["title"],
        source_type="demo",
        channel_name=meta["channel_name"],
        video_path=str(dest_video),
        video_url=f"/media/projects/{proj_id}/source.mp4",
        thumbnail_url=f"/media/projects/{proj_id}/thumb.jpg" if thumb_path.exists() else None,
        duration=round(duration, 2),
        width=width,
        height=height,
        status="analyzing",
        transcript=transcript,
        energy_peaks=energy,
    )
    save_project(project)

    settings = load_settings()
    try:
        project = _run_analysis(project, settings)
    except TranscriptionError as exc:
        raise HTTPException(status_code=422, detail=f"Transcription failed: {exc}")
    return project.model_dump()


@app.post("/api/projects/youtube")
def api_create_youtube(payload: YouTubeRequest):
    url = payload.url.strip()
    if not url or ("youtube.com" not in url and "youtu.be" not in url):
        raise HTTPException(status_code=400, detail="Please enter a valid YouTube URL.")

    proj_id = f"proj_{uuid.uuid4().hex[:8]}"
    pdir = get_project_dir(proj_id)

    try:
        video_path, meta, transcript = ingest_youtube(url, pdir)
    except YouTubeBlockedError as exc:
        shutil.rmtree(pdir, ignore_errors=True)
        return JSONResponse(
            status_code=422,
            content={
                "code": "YOUTUBE_BOT_BLOCK",
                "detail": str(exc),
                "oembed": exc.meta,
            },
        )
    except Exception as exc:
        shutil.rmtree(pdir, ignore_errors=True)
        raise HTTPException(status_code=400, detail=str(exc))

    duration, width, height = probe_video(video_path)
    if not transcript and payload.fallback_transcript:
        transcript = parse_plain_transcript(payload.fallback_transcript, duration)

    thumb_path = pdir / "thumb.jpg"
    generate_thumbnail(video_path, thumb_path, duration)
    energy = compute_energy_peaks(video_path)

    project = Project(
        id=proj_id,
        title=meta["title"],
        source_type="youtube",
        source_url=url,
        channel_name=meta.get("channel_name"),
        video_path=str(video_path),
        video_url=f"/media/projects/{proj_id}/{video_path.name}",
        thumbnail_url=f"/media/projects/{proj_id}/thumb.jpg" if thumb_path.exists() else meta.get("thumbnail_url"),
        duration=round(duration, 2),
        width=width,
        height=height,
        status="analyzing",
        transcript=transcript,
        energy_peaks=energy,
    )
    save_project(project)

    settings = load_settings()
    try:
        project = _run_analysis(project, settings)
    except TranscriptionError as exc:
        raise HTTPException(status_code=422, detail=f"Transcription failed: {exc}")
    return project.model_dump()


@app.post("/api/projects/upload")
async def api_create_upload(
    file: UploadFile = File(...),
    title: Optional[str] = Form(None),
    transcript_text: Optional[str] = Form(None),
    subtitle_file: Optional[UploadFile] = File(None),
):
    proj_id = f"proj_{uuid.uuid4().hex[:8]}"
    pdir = get_project_dir(proj_id)

    ext = Path(file.filename or "video.mp4").suffix.lower() or ".mp4"
    if ext not in {".mp4", ".mov", ".webm", ".mkv", ".m4v"}:
        ext = ".mp4"
    dest_video = pdir / f"source{ext}"

    total = 0
    sniff_head = b""
    try:
        with dest_video.open("wb") as out_f:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                total += len(chunk)
                if total > MAX_UPLOAD_BYTES:
                    raise HTTPException(
                        status_code=413,
                        detail=f"Video exceeds the {MAX_UPLOAD_MB} MB upload limit.",
                    )
                if len(sniff_head) < 16:
                    sniff_head += chunk[: 16 - len(sniff_head)]
                out_f.write(chunk)
    except BaseException:
        # Covers HTTPException (cap) and client disconnects: never leave partial files.
        shutil.rmtree(pdir, ignore_errors=True)
        raise

    if total == 0 or not is_supported_video_bytes(sniff_head):
        shutil.rmtree(pdir, ignore_errors=True)
        raise HTTPException(
            status_code=400,
            detail="Unsupported video format. Upload an MP4, MOV, WebM or MKV file.",
        )

    try:
        duration, width, height = probe_video(dest_video)
    except Exception as exc:
        shutil.rmtree(pdir, ignore_errors=True)
        raise HTTPException(status_code=400, detail=f"Could not read video file: {exc}")

    transcript: List[TranscriptSegment] = []
    if subtitle_file is not None:
        raw_bytes = await subtitle_file.read()
        if len(raw_bytes) > MAX_SUBTITLE_BYTES:
            shutil.rmtree(pdir, ignore_errors=True)
            raise HTTPException(status_code=413, detail="Subtitle file is too large.")
        raw_sub = raw_bytes.decode("utf-8", errors="ignore")
        transcript = parse_subtitle_text(raw_sub)
    elif transcript_text and transcript_text.strip():
        raw_t = transcript_text.strip()
        if "-->" in raw_t:
            transcript = parse_subtitle_text(raw_t)
        else:
            transcript = parse_plain_transcript(raw_t, duration)

    thumb_path = pdir / "thumb.jpg"
    generate_thumbnail(dest_video, thumb_path, duration)
    energy = compute_energy_peaks(dest_video)

    clean_title = (title or "").strip() or Path(file.filename or "Uploaded Video").stem.replace("_", " ").replace("-", " ")

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
        status="analyzing",
        transcript=transcript,
        energy_peaks=energy,
    )
    save_project(project)

    settings = load_settings()
    try:
        project = _run_analysis(project, settings)
    except TranscriptionError as exc:
        raise HTTPException(status_code=422, detail=f"Transcription failed: {exc}")
    return project.model_dump()


@app.post("/api/projects/{project_id}/reanalyze")
def api_reanalyze(project_id: str):
    proj = load_project(project_id)
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found")
    settings = load_settings()
    try:
        proj = _run_analysis(proj, settings)
    except TranscriptionError as exc:
        raise HTTPException(status_code=422, detail=f"Transcription failed: {exc}")
    return proj.model_dump()


@app.put("/api/projects/{project_id}/transcript")
def api_update_transcript(project_id: str, payload: UpdateTranscriptRequest):
    proj = load_project(project_id)
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found")
    from ingest import distribute_words
    updated: List[TranscriptSegment] = []
    for seg in payload.segments:
        words = distribute_words(seg.text, seg.start, seg.end)
        updated.append(TranscriptSegment(id=seg.id, start=seg.start, end=seg.end, text=seg.text, words=words))
    proj.transcript = updated
    save_project(proj)
    return proj.model_dump()


@app.post("/api/projects/{project_id}/clips")
def api_create_clip(project_id: str, payload: CreateClipRequest):
    proj = load_project(project_id)
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found")
    st = max(0.0, min(payload.start, proj.duration - 2.0))
    en = max(st + 2.0, min(payload.end, proj.duration))
    settings = load_settings()

    snippet_txt = " ".join(
        s.text for s in proj.transcript if s.end >= st and s.start <= en
    ) or payload.title
    hook_banner = " ".join(payload.title.split()[:6]).upper()

    new_clip = Clip(
        project_id=proj.id,
        title=payload.title.strip() or "Custom Clip",
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
            youtube_title=f"{payload.title[:82]} #shorts",
            youtube_description=snippet_txt[:220],
            youtube_tags=["shorts", "viral", "clips"],
            instagram_caption=snippet_txt[:220],
            instagram_hashtags=["#reels", "#viral", "#shorts"],
            tiktok_caption=payload.title,
            tiktok_hashtags=["#fyp", "#viral"],
        ),
    )
    proj.clips.insert(0, new_clip)
    save_project(proj)
    return new_clip.model_dump()


@app.patch("/api/projects/{project_id}/clips/{clip_id}")
def api_update_clip(project_id: str, clip_id: str, payload: UpdateClipRequest):
    proj = load_project(project_id)
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found")
    target: Optional[Clip] = None
    for c in proj.clips:
        if c.id == clip_id:
            target = c
            break
    if not target:
        raise HTTPException(status_code=404, detail="Clip not found")

    if payload.title is not None:
        target.title = payload.title
    if payload.start is not None:
        target.start = round(max(0.0, min(payload.start, proj.duration - 1.5)), 2)
    if payload.end is not None:
        target.end = round(max(target.start + 1.5, min(payload.end, proj.duration)), 2)
    if payload.style is not None:
        target.style = payload.style
    if payload.platform_meta is not None:
        target.platform_meta = payload.platform_meta

    # Reset export state if geometry/style changed while previously done
    if payload.start is not None or payload.end is not None or payload.style is not None:
        if target.export_status == "done":
            target.export_status = "idle"
            target.export_progress = 0
            target.exported_at = None

    save_project(proj)
    return target.model_dump()


@app.delete("/api/projects/{project_id}/clips/{clip_id}")
def api_delete_clip(project_id: str, clip_id: str):
    proj = load_project(project_id)
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found")
    proj.clips = [c for c in proj.clips if c.id != clip_id]
    save_project(proj)
    return {"deleted": True}


def _run_export_job(project_id: str, clip_id: str) -> None:
    # Capture initial project data under lock
    with _store_lock:
        proj = load_project(project_id)
        if not proj:
            return
        clip = next((c for c in proj.clips if c.id == clip_id), None)
        if not clip:
            return
        video_path = Path(proj.video_path)
        src_w = proj.width
        src_h = proj.height
        transcript = proj.transcript

    def update_progress(pct: int) -> None:
        with _store_lock:
            p = load_project(project_id)
            if not p:
                return
            for c in p.clips:
                if c.id == clip_id:
                    c.export_progress = pct
            save_project(p)

    try:
        out_path = export_clip_mp4(
            clip=clip,
            video_path=video_path,
            src_w=src_w,
            src_h=src_h,
            transcript=transcript,
            on_progress=update_progress,
        )
        with _store_lock:
            p = load_project(project_id)
            if p:
                for c in p.clips:
                    if c.id == clip_id:
                        c.export_status = "done"
                        c.export_progress = 100
                        c.export_filename = out_path.name
                        c.export_url = f"/media/exports/{out_path.name}"
                        c.export_error = None
                        c.exported_at = time.time()
                save_project(p)
    except Exception as exc:
        with _store_lock:
            p = load_project(project_id)
            if p:
                for c in p.clips:
                    if c.id == clip_id:
                        c.export_status = "error"
                        c.export_error = str(exc)
                save_project(p)


@app.post("/api/projects/{project_id}/clips/{clip_id}/export")
def api_export_clip(project_id: str, clip_id: str):
    proj = load_project(project_id)
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found")
    clip = next((c for c in proj.clips if c.id == clip_id), None)
    if not clip:
        raise HTTPException(status_code=404, detail="Clip not found")

    clip.export_status = "rendering"
    clip.export_progress = 5
    clip.export_error = None
    save_project(proj)

    t = threading.Thread(target=_run_export_job, args=(project_id, clip_id), daemon=True)
    t.start()
    return clip.model_dump()


@app.post("/api/projects/{project_id}/export-all")
def api_export_all(project_id: str):
    proj = load_project(project_id)
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found")
    for c in proj.clips:
        if c.export_status != "rendering":
            c.export_status = "rendering"
            c.export_progress = 5
            c.export_error = None
    save_project(proj)

    def run_seq():
        for c in proj.clips:
            _run_export_job(project_id, c.id)

    threading.Thread(target=run_seq, daemon=True).start()
    return proj.model_dump()


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
            mp4 = EXPORTS_DIR / (c.export_filename or "")
            if mp4.exists():
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
    if not str(safe_path).startswith(str(PROJECTS_DIR.resolve())):
        raise HTTPException(status_code=403, detail="Forbidden")
    return _stream_file_range(safe_path, request)


@app.get("/media/exports/{filename}")
def serve_export_media(filename: str, request: Request, download: int = 0):
    safe_path = (EXPORTS_DIR / Path(filename).name).resolve()
    if not str(safe_path).startswith(str(EXPORTS_DIR.resolve())):
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
        candidate = FRONTEND_DIST / full_path
        if full_path and candidate.exists() and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(FRONTEND_DIST / "index.html")
