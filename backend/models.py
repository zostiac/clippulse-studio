from __future__ import annotations

import json
import os
import re
import shutil
import threading
import time
import uuid
from pathlib import Path
from typing import Dict, List, Literal, Optional

from pydantic import BaseModel, Field, field_validator, model_validator

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
PROJECTS_DIR = DATA_DIR / "projects"
DEMOS_DIR = DATA_DIR / "demos"
EXPORTS_DIR = DATA_DIR / "exports"
SETTINGS_FILE = DATA_DIR / "settings.json"
COOKIES_FILE = DATA_DIR / "youtube_cookies.txt"

# Upload guardrails (override with CLIPPULSE_MAX_UPLOAD_MB / CLIPPULSE_MAX_SUBTITLE_MB)
def _positive_env_int(name: str, default: int, maximum: int) -> int:
    try:
        value = int(os.environ.get(name, str(default)))
    except (TypeError, ValueError):
        value = default
    return max(1, min(value, maximum))


MAX_UPLOAD_MB = _positive_env_int("CLIPPULSE_MAX_UPLOAD_MB", 4096, 4096)
MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024
MAX_SUBTITLE_MB = _positive_env_int("CLIPPULSE_MAX_SUBTITLE_MB", 5, 25)
MAX_SUBTITLE_BYTES = MAX_SUBTITLE_MB * 1024 * 1024

for d in (PROJECTS_DIR, DEMOS_DIR, EXPORTS_DIR):
    d.mkdir(parents=True, exist_ok=True)


class TranscriptionError(RuntimeError):
    """A transcription provider was attempted and produced no usable transcript."""


class WordTiming(BaseModel):
    word: str = Field(min_length=1, max_length=200)
    start: float = Field(ge=0)
    end: float = Field(ge=0)

    @model_validator(mode="after")
    def _valid_interval(self):
        if self.end <= self.start:
            raise ValueError("Word end must be after word start.")
        return self


class TranscriptSegment(BaseModel):
    id: str = Field(default_factory=lambda: uuid.uuid4().hex[:8])
    start: float = Field(ge=0)
    end: float = Field(ge=0)
    text: str = Field(max_length=20_000)
    words: List[WordTiming] = Field(default_factory=list)

    @model_validator(mode="after")
    def _valid_interval(self):
        if self.end <= self.start:
            raise ValueError("Transcript segment end must be after start.")
        return self


class ClipStyle(BaseModel):
    layout: Literal["center_crop", "blur_fill", "split_screen"] = "center_crop"
    pan_x: float = Field(default=0.0, ge=-1.0, le=1.0)
    caption_style: Literal["hormozi", "beast", "minimal", "neon", "off"] = "hormozi"
    caption_position: Literal["top", "middle", "bottom"] = "bottom"
    font_size: int = Field(default=58, ge=24, le=100)
    words_per_line: int = Field(default=3, ge=1, le=6)
    # Local, export-safe caption controls. "style" keeps the selected preset's look.
    caption_animation: Literal["pop", "karaoke", "fade", "none"] = "pop"
    caption_case: Literal["style", "uppercase", "lowercase", "sentence"] = "style"
    caption_highlight: Literal["style", "yellow", "cyan", "amber", "green", "white", "violet"] = "style"
    caption_background: Literal["style", "outline", "pill", "none"] = "style"
    caption_font: Literal["Arial", "Arial Black", "DejaVu Sans", "Impact"] = "Arial"
    # Face follow is performed locally during export; manual pan remains the fallback.
    reframe_mode: Literal["manual", "face_follow"] = "manual"
    show_hook_banner: bool = True
    hook_banner_text: str = ""
    # Vertical exports never drop below the 1080x1920 floor.
    resolution: Literal["1080x1920", "1440x2560"] = "1080x1920"

    @field_validator("resolution", mode="before")
    @classmethod
    def _enforce_resolution_floor(cls, value):
        """Coerce legacy/unknown values (e.g. 720x1280) up to the 1080p minimum."""
        return value if value in ("1080x1920", "1440x2560") else "1080x1920"


class PlatformMeta(BaseModel):
    youtube_title: str = ""
    youtube_description: str = ""
    youtube_tags: List[str] = Field(default_factory=list)
    instagram_caption: str = ""
    instagram_hashtags: List[str] = Field(default_factory=list)
    tiktok_caption: str = ""
    tiktok_hashtags: List[str] = Field(default_factory=list)


class SubScores(BaseModel):
    hook: int = 85
    retention: int = 82
    shareability: int = 80
    clarity: int = 86


class Clip(BaseModel):
    id: str = Field(default_factory=lambda: f"clip_{uuid.uuid4().hex[:8]}")
    project_id: str
    title: str = Field(min_length=1, max_length=300)
    start: float = Field(ge=0)
    end: float = Field(ge=0)
    viral_score: int = Field(default=85, ge=0, le=100)
    sub_scores: SubScores = Field(default_factory=SubScores)
    reason: str = ""
    style: ClipStyle = Field(default_factory=ClipStyle)
    platform_meta: PlatformMeta = Field(default_factory=PlatformMeta)
    export_status: Literal["idle", "rendering", "done", "error"] = "idle"
    export_progress: int = 0
    export_url: Optional[str] = None
    export_filename: Optional[str] = None
    export_error: Optional[str] = None
    exported_at: Optional[float] = None

    @model_validator(mode="after")
    def _valid_interval(self):
        if self.end - self.start < 1.5:
            raise ValueError("Clip duration must be at least 1.5 seconds.")
        return self


class Project(BaseModel):
    id: str = Field(default_factory=lambda: f"proj_{uuid.uuid4().hex[:8]}")
    title: str
    source_type: Literal["youtube", "upload", "demo"]
    source_url: Optional[str] = None
    channel_name: Optional[str] = None
    video_path: str = ""
    video_url: str = ""
    thumbnail_url: Optional[str] = None
    duration: float = Field(default=0.0, ge=0)
    width: int = Field(default=1920, ge=0)
    height: int = Field(default=1080, ge=0)
    created_at: float = Field(default_factory=time.time)
    updated_at: float = Field(default=0.0)
    status: Literal["ingesting", "analyzing", "ready", "error"] = "ready"
    status_detail: str = ""
    error_message: Optional[str] = None
    analysis_warnings: List[str] = Field(default_factory=list)
    transcript: List[TranscriptSegment] = Field(default_factory=list)
    clips: List[Clip] = Field(default_factory=list)
    energy_peaks: List[float] = Field(default_factory=list)
    ai_engine_used: str = "local_free"
    archived: bool = False
    skip_transcription: bool = False


AIProvider = Literal["local_free", "groq", "gemini", "openrouter", "openai"]
TranscriptionProvider = Literal["auto", "groq", "openai", "local"]


class AppSettings(BaseModel):
    ai_provider: AIProvider = "groq"
    api_key: str = ""
    ai_model: str = ""
    transcription_provider: TranscriptionProvider = "auto"
    transcription_api_key: str = ""
    enable_local_whisper: bool = True
    use_cuda: bool = True
    whisper_model: Literal["tiny", "base", "small", "medium"] = "small"
    max_clips: int = Field(default=6, ge=1, le=15)
    # Legacy alias support
    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"
    has_youtube_cookies: bool = False
    default_caption_style: Literal["hormozi", "beast", "minimal", "neon", "off"] = "hormozi"
    default_layout: Literal["center_crop", "blur_fill", "split_screen"] = "center_crop"


# Re-entrant because request/export flows often hold the store lock while
# calling save_project(), which also acquires it.
_store_lock = threading.RLock()


def _project_path(project_id: str) -> Optional[Path]:
    if not re.fullmatch(r"proj_[a-f0-9]{8}", str(project_id or "")):
        return None
    root = PROJECTS_DIR.resolve()
    path = (root / project_id).resolve()
    return path if path.is_relative_to(root) else None


def get_project_dir(project_id: str) -> Path:
    d = _project_path(project_id)
    if d is None:
        raise ValueError("Invalid project ID.")
    d.mkdir(parents=True, exist_ok=True)
    return d


def _atomic_write_text(path: Path, text: str) -> None:
    """Atomically write UTF-8 text, retrying transient Windows file locks."""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = path.with_name(f"{path.name}.{uuid.uuid4().hex}.tmp")
    tmp_path.write_text(text, encoding="utf-8")
    try:
        for attempt in range(8):
            try:
                os.replace(tmp_path, path)
                return
            except PermissionError:
                if attempt == 7:
                    raise
                time.sleep(0.02 * (attempt + 1))
    except Exception:
        tmp_path.unlink(missing_ok=True)
        raise


def save_project(project: Project) -> None:
    with _store_lock:
        project.updated_at = time.time()
        pdir = get_project_dir(project.id)
        _atomic_write_text(pdir / "project.json", project.model_dump_json(indent=2))


def load_project(project_id: str) -> Optional[Project]:
    project_dir = _project_path(project_id)
    if project_dir is None:
        return None
    meta_path = project_dir / "project.json"
    with _store_lock:
        if not meta_path.exists():
            return None
        try:
            return Project.model_validate_json(meta_path.read_text(encoding="utf-8"))
        except Exception:
            return None


def list_projects() -> List[Project]:
    items: List[Project] = []
    if not PROJECTS_DIR.exists():
        return items
    for pdir in PROJECTS_DIR.iterdir():
        if pdir.is_dir():
            proj = load_project(pdir.name)
            if proj:
                items.append(proj)
    items.sort(key=lambda p: (p.updated_at or p.created_at), reverse=True)
    return items


def delete_project(project_id: str) -> bool:
    pdir = _project_path(project_id)
    if pdir is not None and pdir.exists():
        shutil.rmtree(pdir)
        return True
    return False


def load_settings() -> AppSettings:
    with _store_lock:
        if SETTINGS_FILE.exists():
            try:
                data = json.loads(SETTINGS_FILE.read_text(encoding="utf-8"))
                s = AppSettings.model_validate(data)
                if not s.api_key and s.openai_api_key:
                    s.api_key = s.openai_api_key
                    if s.ai_provider == "local_free":
                        s.ai_provider = "openai"
                s.has_youtube_cookies = COOKIES_FILE.exists() and COOKIES_FILE.stat().st_size > 10
                return s
            except Exception:
                pass
        return AppSettings(has_youtube_cookies=COOKIES_FILE.exists() and COOKIES_FILE.stat().st_size > 10)


def save_settings(settings: AppSettings) -> AppSettings:
    with _store_lock:
        _atomic_write_text(SETTINGS_FILE, settings.model_dump_json(indent=2))
        return load_settings()
