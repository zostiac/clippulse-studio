from __future__ import annotations

import logging
import mimetypes
import os
import shutil
import tempfile
import threading
import uuid
import zipfile
from contextlib import asynccontextmanager
from pathlib import Path
from typing import List, Optional

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from starlette.background import BackgroundTask
from starlette.concurrency import run_in_threadpool

from analyzer import analyze_project
from exporter import export_clip_mp4
from ingest import (
    YouTubeBlockedError,
    compute_energy_peaks,
    distribute_words,
    ensure_demo_project_assets,
    generate_thumbnail,
    ingest_youtube,
    is_valid_youtube_url,
    parse_plain_transcript,
    parse_subtitle_text,
    probe_video,
    validate_netscape_cookies,
)
from mediautil import parse_byte_range, safe_join
from models import (
    BASE_DIR,
    COOKIES_FILE,
    EXPORTS_DIR,
    PROJECTS_DIR,
    Clip,
    ClipStyle,
    PlatformMeta,
    Project,
    SubScores,
    TranscriptSegment,
    delete_project,
    get_project_dir,
    is_valid_project_id,
    list_projects,
    load_project,
    load_settings,
    mutate_project,
    save_cookies,
    save_project,
    save_settings,
)

logger = logging.getLogger("clippulse")

# Shortest clip the studio will produce, in seconds.
MIN_CLIP_SECONDS = 1.5

# Upload cap (MB). Override with CLIPPULSE_MAX_UPLOAD_MB; 0 disables the cap.
MAX_UPLOAD_BYTES = int(os.environ.get("CLIPPULSE_MAX_UPLOAD_MB", "4096")) * 1024 * 1024

ALLOWED_VIDEO_EXTS = {".mp4", ".mov", ".webm", ".mkv", ".m4v"}


@asynccontextmanager
async def lifespan(_app: FastAPI):
    _recover_interrupted_exports()
    yield


app = FastAPI(title="ClipPulse Studio API", version="1.0.0", lifespan=lifespan)

# This is a local tool with no authentication, so by default only pages served
# from localhost may call it from a browser. Set CLIPPULSE_CORS_ORIGINS to a
# comma-separated list of origins to allow others.
_cors_origins = [o.strip() for o in os.environ.get("CLIPPULSE_CORS_ORIGINS", "").split(",") if o.strip()]
if _cors_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=_cors_origins,
        allow_methods=["*"],
        allow_headers=["*"],
    )
else:
    app.add_middleware(
        CORSMiddleware,
        allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$",
        allow_methods=["*"],
        allow_headers=["*"],
    )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_project_or_404(project_id: str) -> Project:
    proj = load_project(project_id)
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found")
    return proj


def _recover_interrupted_exports() -> None:
    """Exports run in daemon threads, so a restart leaves clips stuck in
    "rendering" forever. Mark them as failed so they can be exported again."""
    try:
        for proj in list_projects():
            if not any(c.export_status == "rendering" for c in proj.clips):
                continue

            def _fix(p: Project) -> None:
                for c in p.clips:
                    if c.export_status == "rendering":
                        c.export_status = "error"
                        c.export_progress = 0
                        c.export_error = "Export was interrupted by a server restart. Please export again."

            mutate_project(proj.id, _fix)
    except Exception:
        logger.exception("Could not recover interrupted exports")


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

    try:
        byte_range = parse_byte_range(range_header, file_size)
    except ValueError:
        return Response(status_code=416, headers={"Content-Range": f"bytes */{file_size}"})
    if byte_range is None:
        return FileResponse(path, media_type=content_type, headers=headers)
    start, end = byte_range

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


def _link_or_copy(src: Path, dest: Path) -> None:
    """Hard-link when possible (demo sources are never modified), else copy."""
    try:
        os.link(src, dest)
    except OSError:
        shutil.copyfile(src, dest)


def _status_detail(engine_used: str) -> str:
    if engine_used == "energy_only":
        return (
            "No transcript was available, so clips were picked from audio energy only. "
            "Upload subtitles, enable local Whisper, or add an API provider in Settings, then re-scan."
        )
    return ""


def _finalize_project(
    proj_id: str,
    title: str,
    source_type: str,
    video_path: Path,
    duration: float,
    width: int,
    height: int,
    transcript: List[TranscriptSegment],
    *,
    source_url: Optional[str] = None,
    channel_name: Optional[str] = None,
    fallback_thumbnail_url: Optional[str] = None,
) -> Project:
    """Thumbnail, audio energy, analysis and persistence shared by every ingest path."""
    pdir = video_path.parent
    thumb_path = pdir / "thumb.jpg"
    generate_thumbnail(video_path, thumb_path, duration)
    energy = compute_energy_peaks(video_path)

    settings = load_settings()
    transcript, clips, engine_used = analyze_project(
        proj_id, title, video_path, duration, transcript, energy, settings
    )

    project = Project(
        id=proj_id,
        title=title,
        source_type=source_type,  # type: ignore[arg-type]
        source_url=source_url,
        channel_name=channel_name,
        video_path=str(video_path),
        video_url=f"/media/projects/{proj_id}/{video_path.name}",
        thumbnail_url=f"/media/projects/{proj_id}/thumb.jpg" if thumb_path.exists() else fallback_thumbnail_url,
        duration=round(duration, 2),
        width=width,
        height=height,
        status="ready",
        status_detail=_status_detail(engine_used),
        transcript=transcript,
        clips=clips,
        energy_peaks=energy,
        ai_engine_used=engine_used,
    )
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
    return {"status": "ok", "service": "ClipPulse Studio"}


@app.get("/api/settings")
def get_settings():
    s = load_settings()
    active_key = s.api_key or s.openai_api_key
    masked = ""
    if active_key:
        # Only ever reveal the last 4 characters
        masked = f"••••{active_key[-4:]}" if len(active_key) >= 12 else "••••"
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


@app.post("/api/settings/cookies")
def upload_cookies(payload: CookiesRequest):
    txt = payload.cookies_text.strip("\r\n")
    if not txt.strip() or "youtube.com" not in txt:
        raise HTTPException(status_code=400, detail="Please paste valid Netscape-format cookies.txt containing youtube.com cookies.")
    if not validate_netscape_cookies(txt):
        raise HTTPException(status_code=400, detail="Invalid cookies.txt format. Must be Netscape format with 7 tab-separated fields per line.")
    save_cookies(txt + "\n")
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
    return _get_project_or_404(project_id).model_dump()


@app.delete("/api/projects/{project_id}")
def api_delete_project(project_id: str):
    if not delete_project(project_id):
        raise HTTPException(status_code=404, detail="Project not found")
    return {"deleted": True}


@app.post("/api/projects/demo")
def api_create_demo(payload: DemoRequest):
    proj_id = f"proj_{uuid.uuid4().hex[:8]}"
    pdir = get_project_dir(proj_id)
    try:
        demo_video, meta, transcript = ensure_demo_project_assets(payload.demo_key)

        dest_video = pdir / "source.mp4"
        _link_or_copy(demo_video, dest_video)

        duration, width, height = probe_video(dest_video)
        project = _finalize_project(
            proj_id,
            meta["title"],
            "demo",
            dest_video,
            duration,
            width,
            height,
            transcript,
            channel_name=meta["channel_name"],
        )
    except Exception:
        shutil.rmtree(pdir, ignore_errors=True)
        raise
    return project.model_dump()


@app.post("/api/projects/youtube")
def api_create_youtube(payload: YouTubeRequest):
    url = payload.url.strip()
    if not is_valid_youtube_url(url):
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

    try:
        duration, width, height = probe_video(video_path)
        if not transcript and payload.fallback_transcript:
            transcript = parse_plain_transcript(payload.fallback_transcript, duration)
        project = _finalize_project(
            proj_id,
            meta["title"],
            "youtube",
            video_path,
            duration,
            width,
            height,
            transcript,
            source_url=url,
            channel_name=meta.get("channel_name"),
            fallback_thumbnail_url=meta.get("thumbnail_url"),
        )
    except Exception:
        shutil.rmtree(pdir, ignore_errors=True)
        raise
    return project.model_dump()


def _create_project_from_upload(
    proj_id: str,
    pdir: Path,
    dest_video: Path,
    original_name: str,
    title: Optional[str],
    transcript_text: Optional[str],
    raw_subtitles: Optional[str],
) -> Project:
    """Blocking part of an upload (ffprobe, ffmpeg, Whisper...). Runs in a worker thread."""
    try:
        duration, width, height = probe_video(dest_video)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Could not read video file: {exc}")

    transcript: List[TranscriptSegment] = []
    if raw_subtitles is not None:
        transcript = parse_subtitle_text(raw_subtitles)
    elif transcript_text and transcript_text.strip():
        raw_t = transcript_text.strip()
        if "-->" in raw_t:
            transcript = parse_subtitle_text(raw_t)
        else:
            transcript = parse_plain_transcript(raw_t, duration)

    clean_title = (title or "").strip() or Path(original_name or "Uploaded Video").stem.replace("_", " ").replace("-", " ")
    return _finalize_project(
        proj_id,
        clean_title,
        "upload",
        dest_video,
        duration,
        width,
        height,
        transcript,
        channel_name="Local Upload",
    )


@app.post("/api/projects/upload")
async def api_create_upload(
    file: UploadFile = File(...),
    title: Optional[str] = Form(None),
    transcript_text: Optional[str] = Form(None),
    subtitle_file: Optional[UploadFile] = File(None),
):
    proj_id = f"proj_{uuid.uuid4().hex[:8]}"
    pdir = get_project_dir(proj_id)

    try:
        ext = Path(file.filename or "video.mp4").suffix.lower() or ".mp4"
        if ext not in ALLOWED_VIDEO_EXTS:
            ext = ".mp4"
        dest_video = pdir / f"source{ext}"

        written = 0
        with dest_video.open("wb") as out_f:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                written += len(chunk)
                if MAX_UPLOAD_BYTES and written > MAX_UPLOAD_BYTES:
                    raise HTTPException(
                        status_code=413,
                        detail=f"Video is larger than the {MAX_UPLOAD_BYTES // (1024 * 1024)} MB upload limit "
                        "(set CLIPPULSE_MAX_UPLOAD_MB to change it).",
                    )
                out_f.write(chunk)

        raw_subtitles: Optional[str] = None
        if subtitle_file is not None:
            raw_subtitles = (await subtitle_file.read()).decode("utf-8", errors="ignore")

        # Probing, Whisper and FFmpeg can take minutes: keep them off the event
        # loop so the API (progress polling, media streaming) stays responsive.
        project = await run_in_threadpool(
            _create_project_from_upload,
            proj_id,
            pdir,
            dest_video,
            file.filename or "",
            title,
            transcript_text,
            raw_subtitles,
        )
    except Exception:
        shutil.rmtree(pdir, ignore_errors=True)
        raise
    return project.model_dump()


@app.post("/api/projects/{project_id}/reanalyze")
def api_reanalyze(project_id: str):
    proj = _get_project_or_404(project_id)
    settings = load_settings()
    transcript, clips, engine_used = analyze_project(
        proj.id,
        proj.title,
        Path(proj.video_path),
        proj.duration,
        proj.transcript,
        proj.energy_peaks,
        settings,
    )

    def _apply(p: Project) -> None:
        p.transcript = transcript
        p.clips = clips
        p.ai_engine_used = engine_used
        p.status_detail = _status_detail(engine_used)

    updated = mutate_project(project_id, _apply)
    if updated is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return updated.model_dump()


@app.put("/api/projects/{project_id}/transcript")
def api_update_transcript(project_id: str, payload: UpdateTranscriptRequest):
    def _apply(p: Project) -> None:
        existing = {s.id: s for s in p.transcript}
        updated: List[TranscriptSegment] = []
        for seg in payload.segments:
            start = max(0.0, seg.start)
            end = seg.end if seg.end > start else start + 0.2
            prev = existing.get(seg.id)
            same_text = prev is not None and " ".join(prev.text.split()) == " ".join(seg.text.split())
            if prev is not None and same_text and prev.words and prev.start == start and prev.end == end:
                # Untouched line: keep the original (e.g. Whisper) word timings
                words = prev.words
            else:
                words = distribute_words(seg.text, start, end)
            updated.append(TranscriptSegment(id=seg.id, start=start, end=end, text=seg.text, words=words))
        p.transcript = updated

    proj = mutate_project(project_id, _apply)
    if proj is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return proj.model_dump()


@app.post("/api/projects/{project_id}/clips")
def api_create_clip(project_id: str, payload: CreateClipRequest):
    settings = load_settings()
    created: List[Clip] = []

    def _apply(proj: Project) -> None:
        dur = proj.duration
        st = max(0.0, min(payload.start, max(0.0, dur - 2.0)))
        en = max(st + 2.0, payload.end)
        if dur > 0:
            en = min(en, dur)

        title = payload.title.strip() or "Custom Clip"
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
        created.append(new_clip)

    if mutate_project(project_id, _apply) is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return created[0].model_dump()


class _ClipMissing(Exception):
    pass


@app.patch("/api/projects/{project_id}/clips/{clip_id}")
def api_update_clip(project_id: str, clip_id: str, payload: UpdateClipRequest):
    result: List[Clip] = []

    def _apply(proj: Project) -> None:
        target = next((c for c in proj.clips if c.id == clip_id), None)
        if target is None:
            raise _ClipMissing()

        if payload.title is not None:
            target.title = payload.title
        if payload.start is not None:
            target.start = round(max(0.0, min(payload.start, max(0.0, proj.duration - MIN_CLIP_SECONDS))), 2)
        if payload.end is not None:
            end = payload.end
            if proj.duration > 0:
                end = min(end, proj.duration)
            target.end = round(end, 2)
        # Always restore the minimum length, including when only `start` moved
        # past the old end.
        if target.end < target.start + MIN_CLIP_SECONDS:
            end = target.start + MIN_CLIP_SECONDS
            if proj.duration > 0:
                end = min(end, proj.duration)
            target.end = round(end, 2)
        if payload.style is not None:
            target.style = payload.style
        if payload.platform_meta is not None:
            target.platform_meta = payload.platform_meta

        # Reset export state if geometry/style changed while previously done
        if payload.start is not None or payload.end is not None or payload.style is not None:
            if target.export_status == "done":
                target.export_status = "idle"
                target.export_progress = 0
        result.append(target)

    try:
        proj = mutate_project(project_id, _apply)
    except _ClipMissing:
        raise HTTPException(status_code=404, detail="Clip not found")
    if proj is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return result[0].model_dump()


@app.delete("/api/projects/{project_id}/clips/{clip_id}")
def api_delete_clip(project_id: str, clip_id: str):
    def _apply(proj: Project) -> None:
        proj.clips = [c for c in proj.clips if c.id != clip_id]

    if mutate_project(project_id, _apply) is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return {"deleted": True}


def _update_clip_fields(project_id: str, clip_id: str, **fields) -> None:
    def _apply(p: Project) -> None:
        for c in p.clips:
            if c.id == clip_id:
                for k, v in fields.items():
                    setattr(c, k, v)

    mutate_project(project_id, _apply)


def _run_export_job(project_id: str, clip_id: str) -> None:
    proj = load_project(project_id)
    if not proj:
        return
    found = next((c for c in proj.clips if c.id == clip_id), None)
    if not found:
        return
    clip = found.model_copy(deep=True)  # snapshot of what is being rendered
    video_path = Path(proj.video_path)
    src_w, src_h = proj.width, proj.height
    transcript = proj.transcript

    def update_progress(pct: int) -> None:
        _update_clip_fields(project_id, clip_id, export_progress=pct)

    try:
        out_path = export_clip_mp4(
            clip=clip,
            video_path=video_path,
            src_w=src_w,
            src_h=src_h,
            transcript=transcript,
            on_progress=update_progress,
        )

        def _finish(p: Project) -> None:
            for c in p.clips:
                if c.id != clip_id:
                    continue
                if (c.start, c.end, c.style) != (clip.start, clip.end, clip.style):
                    # Edited while rendering: the file no longer matches the clip
                    c.export_status = "idle"
                    c.export_progress = 0
                    c.export_error = None
                    return
                c.export_status = "done"
                c.export_progress = 100
                c.export_filename = out_path.name
                c.export_url = f"/media/exports/{out_path.name}"
                c.export_error = None

        mutate_project(project_id, _finish)
    except Exception as exc:
        logger.exception("Export failed for %s/%s", project_id, clip_id)
        _update_clip_fields(project_id, clip_id, export_status="error", export_error=str(exc))


@app.post("/api/projects/{project_id}/clips/{clip_id}/export")
def api_export_clip(project_id: str, clip_id: str):
    started: List[bool] = []
    result: List[Clip] = []

    def _apply(p: Project) -> None:
        clip = next((c for c in p.clips if c.id == clip_id), None)
        if clip is None:
            raise _ClipMissing()
        if clip.export_status != "rendering":
            clip.export_status = "rendering"
            clip.export_progress = 5
            clip.export_error = None
            started.append(True)
        result.append(clip)

    try:
        proj = mutate_project(project_id, _apply)
    except _ClipMissing:
        raise HTTPException(status_code=404, detail="Clip not found")
    if proj is None:
        raise HTTPException(status_code=404, detail="Project not found")

    # A second request for a clip that is already rendering must not start a
    # second ffmpeg writing to the same output file.
    if started:
        threading.Thread(target=_run_export_job, args=(project_id, clip_id), daemon=True).start()
    return result[0].model_dump()


@app.post("/api/projects/{project_id}/export-all")
def api_export_all(project_id: str):
    to_run: List[str] = []

    def _apply(p: Project) -> None:
        for c in p.clips:
            if c.export_status != "rendering":
                c.export_status = "rendering"
                c.export_progress = 5
                c.export_error = None
                to_run.append(c.id)

    proj = mutate_project(project_id, _apply)
    if proj is None:
        raise HTTPException(status_code=404, detail="Project not found")

    if to_run:
        def run_seq() -> None:
            for cid in to_run:
                _run_export_job(project_id, cid)

        threading.Thread(target=run_seq, daemon=True).start()
    return proj.model_dump()


@app.get("/api/projects/{project_id}/download-bundle")
def api_download_bundle(project_id: str):
    proj = _get_project_or_404(project_id)

    exported = [c for c in proj.clips if c.export_status == "done" and c.export_filename]
    if not exported:
        raise HTTPException(status_code=400, detail="Export at least one clip before downloading the bundle.")

    # Build the archive on disk, not in memory: a few 1080p clips can be hundreds of MB.
    tmp = tempfile.NamedTemporaryFile(prefix="clippulse_bundle_", suffix=".zip", delete=False)
    tmp.close()
    try:
        with zipfile.ZipFile(tmp.name, "w") as zf:
            meta_lines = [f"PROJECT: {proj.title}\n"]
            for idx, c in enumerate(exported, 1):
                mp4 = EXPORTS_DIR / Path(c.export_filename or "").name
                if mp4.is_file():
                    # MP4 is already compressed; storing is faster and no larger
                    zf.write(mp4, arcname=f"{idx:02d}_{c.id}.mp4", compress_type=zipfile.ZIP_STORED)
                meta_lines.append(
                    f"=== CLIP {idx}: {c.title} (Score: {c.viral_score}) ===\n"
                    f"YouTube Shorts Title: {c.platform_meta.youtube_title}\n"
                    f"YouTube Description:\n{c.platform_meta.youtube_description}\n\n"
                    f"Instagram Reels:\n{c.platform_meta.instagram_caption}\n{' '.join(c.platform_meta.instagram_hashtags)}\n\n"
                    f"TikTok:\n{c.platform_meta.tiktok_caption}\n{' '.join(c.platform_meta.tiktok_hashtags)}\n\n"
                )
            zf.writestr("social_captions.txt", "\n".join(meta_lines), compress_type=zipfile.ZIP_DEFLATED)
    except Exception:
        os.unlink(tmp.name)
        raise

    return FileResponse(
        tmp.name,
        media_type="application/zip",
        filename=f"{proj.id}_shorts_bundle.zip",
        background=BackgroundTask(os.unlink, tmp.name),
    )


# ---------------------------------------------------------------------------
# Media endpoints (range-capable for smooth scrubbing)
# ---------------------------------------------------------------------------

def _safe_media_path(base: Path, *parts: str) -> Path:
    try:
        return safe_join(base, *parts)
    except PermissionError:
        raise HTTPException(status_code=403, detail="Forbidden")


@app.get("/media/projects/{project_id}/{filename}")
def serve_project_media(project_id: str, filename: str, request: Request):
    if not is_valid_project_id(project_id):
        raise HTTPException(status_code=404, detail="Media file not found")
    safe_path = _safe_media_path(PROJECTS_DIR, project_id, filename)
    return _stream_file_range(safe_path, request)


@app.get("/media/exports/{filename}")
def serve_export_media(filename: str, request: Request, download: int = 0):
    safe_path = _safe_media_path(EXPORTS_DIR, filename)
    return _stream_file_range(safe_path, request, download_name=safe_path.name if download else None)


# ---------------------------------------------------------------------------
# Frontend Static Bundle Serving (when built)
# ---------------------------------------------------------------------------

FRONTEND_DIST = BASE_DIR / "frontend" / "dist"
if FRONTEND_DIST.exists():
    assets_dir = FRONTEND_DIST / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")

    _frontend_root = FRONTEND_DIST.resolve()

    @app.get("/{full_path:path}")
    def serve_spa(full_path: str):
        # Don't serve the SPA for API/media routes: unknown ones must 404
        if full_path.startswith(("api/", "media/")):
            raise HTTPException(status_code=404, detail="Not found")
        if full_path:
            # Resolve and verify containment: a path like "../data/settings.json"
            # must never escape the built frontend directory.
            candidate = (_frontend_root / full_path).resolve()
            if candidate.is_relative_to(_frontend_root) and candidate.is_file():
                return FileResponse(candidate)
        return FileResponse(_frontend_root / "index.html")
