"""Test setup: isolated data dir + stand-ins for heavy optional dependencies."""
import importlib
import os
import sys
import tempfile
import types
from pathlib import Path

# Must happen before `models` is imported: it creates directories on import.
_DATA_DIR = tempfile.mkdtemp(prefix="clippulse_test_data_")
os.environ["CLIPPULSE_DATA_DIR"] = _DATA_DIR

BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))


def _stub_if_missing(name: str, **attrs) -> None:
    """Network libraries are not needed by the logic under test; stub them when absent."""
    try:
        importlib.import_module(name)
    except ImportError:
        module = types.ModuleType(name)
        for key, value in attrs.items():
            setattr(module, key, value)
        sys.modules[name] = module


def _unavailable(*_a, **_k):
    raise RuntimeError("network access is not available in tests")


_stub_if_missing("httpx", get=_unavailable, post=_unavailable)
_stub_if_missing("yt_dlp", YoutubeDL=_unavailable)
_stub_if_missing("youtube_transcript_api", YouTubeTranscriptApi=_unavailable)
