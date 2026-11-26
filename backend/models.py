from __future__ import annotations

import json
import os
import re
import shutil
import threading
import time
import uuid
from pathlib import Path
from typing import Callable, Dict, List, Literal, Optional

from pydantic import BaseModel, Field

BASE_DIR = Path(__file__).resolve().parent.parent
# CLIPPULSE_DATA_DIR relocates all runtime data (projects, exports, settings)
DATA_DIR = Path(os.environ.get("CLIPPULSE_DATA_DIR") or (BASE_DIR / "data")).expanduser().resolve()
PROJECTS_DIR = DATA_DIR / "projects"
DEMOS_DIR = DATA_DIR / "demos"
EXPORTS_DIR = DATA_DIR / "exports"
SETTINGS_FILE = DATA_DIR / "settings.json"
COOKIES_FILE = DATA_DIR / "youtube_cookies.txt"

for d in (PROJECTS_DIR, DEMOS_DIR, EXPORTS_DIR):
    d.mkdir(parents=True, exist_ok=True)


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
    pan_x: float = 0.0
    caption_style: Literal["hormozi", "beast", "minimal", "neon", "off"] = "hormozi"
    caption_position: Literal["top", "middle", "bottom"] = "bottom"
    font_size: int = 58
    words_per_line: int = 3
    show_hook_banner: bool = True
    hook_banner_text: str = ""
    resolution: Literal["1080x1920", "720x1280"] = "1080x1920"


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


# Re-entrant on purpose: callers hold the lock across a load -> modify -> save
# cycle, and ``save_project`` takes the same lock again. A plain ``Lock`` would
# deadlock the calling thread on its own second acquire.
_store_lock = threading.RLock()

_PROJECT_ID_RE = re.compile(r"^proj_[0-9a-f]{8}$")


def is_valid_project_id(project_id: str) -> bool:
    """Project ids are generated server-side as ``proj_<8 hex>``.

    Anything else (``..``, absolute paths, separators) must never be joined onto
    PROJECTS_DIR: ``delete_project("..")`` would otherwise rmtree the data dir.
    """
    return bool(_PROJECT_ID_RE.match(project_id or ""))


def _project_dir_path(project_id: str) -> Path:
    if not is_valid_project_id(project_id):
        raise ValueError(f"Invalid project id: {project_id!r}")
    return PROJECTS_DIR / project_id


def get_project_dir(project_id: str) -> Path:
    d = _project_dir_path(project_id)
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
    if not is_valid_project_id(project_id):
        return None
    meta_path = PROJECTS_DIR / project_id / "project.json"
    if not meta_path.exists():
        return None
    try:
        return Project.model_validate_json(meta_path.read_text(encoding="utf-8"))
    except Exception:
        return None


def mutate_project(project_id: str, fn: Callable[[Project], None]) -> Optional[Project]:
    """Atomically load a project, apply ``fn`` to it and save it.

    Serialises concurrent writers (API handlers and export threads) so that one
    cannot overwrite another's changes with a stale copy. Returns the saved
    project, or ``None`` if it does not exist.
    """
    with _store_lock:
        proj = load_project(project_id)
        if proj is None:
            return None
        fn(proj)
        save_project(proj)
        return proj


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
    if not is_valid_project_id(project_id):
        return False
    with _store_lock:
        pdir = PROJECTS_DIR / project_id
        if pdir.exists():
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


def _write_private(path: Path, text: str) -> None:
    """Atomically write ``text`` to ``path`` readable only by the current user.

    settings.json holds API keys and the cookies file holds session cookies.
    """
    tmp = path.with_name(path.name + ".tmp")
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        f.write(text)
    os.replace(tmp, path)


def save_settings(settings: AppSettings) -> AppSettings:
    with _store_lock:
        _write_private(SETTINGS_FILE, settings.model_dump_json(indent=2))
    return load_settings()


def save_cookies(text: str) -> None:
    with _store_lock:
        _write_private(COOKIES_FILE, text)
