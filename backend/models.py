from __future__ import annotations

import json
import os
import re
import threading
import time
import uuid
from pathlib import Path
from typing import Dict, List, Literal, Optional

from pydantic import BaseModel, Field, field_validator

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


MAX_UPLOAD_MB = _positive_env_int("CLIPPULSE_MAX_UPLOAD_MB", 1024, 4096)
MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024
MAX_SUBTITLE_MB = _positive_env_int("CLIPPULSE_MAX_SUBTITLE_MB", 5, 25)
MAX_SUBTITLE_BYTES = MAX_SUBTITLE_MB * 1024 * 1024

for d in (PROJECTS_DIR, DEMOS_DIR, EXPORTS_DIR):
    d.mkdir(parents=True, exist_ok=True)


class TranscriptionError(RuntimeError):
    """A transcription provider was attempted and produced no usable transcript."""


class WordTiming(BaseModel):
    word: str
    start: float
    end: float


class TranscriptSegment(BaseModel):
    id: str = Field(default_factory=lambda: uuid.uuid4().hex[:8])
    start: float
    end: float
    text: str
    words: List[WordTiming] = Field(default_factory=list)


class ClipStyle(BaseModel):
    layout: Literal["center_crop", "blur_fill", "split_screen"] = "center_crop"
    pan_x: float = Field(default=0.0, ge=-1.0, le=1.0)
    caption_style: Literal["hormozi", "beast", "minimal", "neon", "off"] = "hormozi"
    caption_position: Literal["top", "middle", "bottom"] = "bottom"
    font_size: int = Field(default=58, ge=24, le=100)
    words_per_line: int = Field(default=3, ge=1, le=6)
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
    title: str
    start: float
    end: float
    viral_score: int = 85
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


class Project(BaseModel):
    id: str = Field(default_factory=lambda: f"proj_{uuid.uuid4().hex[:8]}")
    title: str
    source_type: Literal["youtube", "upload", "demo"]
    source_url: Optional[str] = None
    channel_name: Optional[str] = None
    video_path: str = ""
    video_url: str = ""
    thumbnail_url: Optional[str] = None
    duration: float = 0.0
    width: int = 1920
    height: int = 1080
    created_at: float = Field(default_factory=time.time)
    status: Literal["ingesting", "analyzing", "ready", "error"] = "ready"
    status_detail: str = ""
    error_message: Optional[str] = None
    transcript: List[TranscriptSegment] = Field(default_factory=list)
    clips: List[Clip] = Field(default_factory=list)
    energy_peaks: List[float] = Field(default_factory=list)
    ai_engine_used: str = "local_free"


AIProvider = Literal["local_free", "groq", "gemini", "openrouter", "openai"]


class AppSettings(BaseModel):
    ai_provider: AIProvider = "local_free"
    api_key: str = ""
    ai_model: str = ""
    enable_local_whisper: bool = True
    whisper_model: Literal["tiny", "base"] = "tiny"
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


def save_project(project: Project) -> None:
    with _store_lock:
        pdir = get_project_dir(project.id)
        meta_path = pdir / "project.json"
        tmp_path = pdir / "project.json.tmp"
        tmp_path.write_text(project.model_dump_json(indent=2), encoding="utf-8")
        os.replace(tmp_path, meta_path)


def load_project(project_id: str) -> Optional[Project]:
    project_dir = _project_path(project_id)
    if project_dir is None:
        return None
    meta_path = project_dir / "project.json"
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
    items.sort(key=lambda p: p.created_at, reverse=True)
    return items


def delete_project(project_id: str) -> bool:
    import shutil
    pdir = _project_path(project_id)
    if pdir is not None and pdir.exists():
        shutil.rmtree(pdir, ignore_errors=True)
        return True
    return False


def load_settings() -> AppSettings:
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
        SETTINGS_FILE.write_text(settings.model_dump_json(indent=2), encoding="utf-8")
    return load_settings()
