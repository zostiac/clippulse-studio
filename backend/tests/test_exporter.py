import shutil
import subprocess

import pytest

import exporter
from models import Clip, ClipStyle, TranscriptSegment, WordTiming

HAS_FFMPEG = shutil.which("ffmpeg") is not None and shutil.which("ffprobe") is not None


def _has_ass_filter() -> bool:
    if not HAS_FFMPEG:
        return False
    out = subprocess.run(["ffmpeg", "-hide_banner", "-filters"], capture_output=True, text=True).stdout
    return " ass " in out


def _transcript():
    return [
        TranscriptSegment(
            start=0.0, end=2.0, text="hello brave new world",
            words=[
                WordTiming(word="hello", start=0.1, end=0.5),
                WordTiming(word="brave", start=0.5, end=1.0),
                WordTiming(word="new", start=1.0, end=1.4),
                WordTiming(word="world", start=1.4, end=1.9),
            ],
        )
    ]


def _clip(**style):
    return Clip(
        id="clip_test0001", project_id="proj_0a1b2c3d", title="t", start=0.0, end=2.0,
        style=ClipStyle(resolution="720x1280", hook_banner_text="WATCH THIS", **style),
    )


def test_ass_time_format():
    assert exporter._fmt_ass_time(0) == "0:00:00.00"
    assert exporter._fmt_ass_time(3661.5) == "1:01:01.50"
    assert exporter._fmt_ass_time(-4) == "0:00:00.00"


def test_esc_ass_strips_override_syntax():
    assert exporter._esc_ass("a{b}\\c\r\nd") == "a(b)c\\Nd"


def test_collect_words_is_relative_to_clip_start():
    words = exporter._collect_clip_words(_transcript(), 0.5, 1.5)
    assert [w.word for w in words] == ["hello", "brave", "new", "world"]
    assert words[1].start == pytest.approx(0.0)


def test_build_ass_contains_hook_and_active_word(tmp_path):
    out = tmp_path / "x.ass"
    assert exporter.build_ass_subtitles(_clip(), _transcript(), out, 720, 1280)
    text = out.read_text(encoding="utf-8")
    assert "HookBanner" in text and "WATCH THIS" in text
    assert "HELLO" in text  # hormozi style upper-cases


def test_build_ass_off_without_banner_writes_nothing(tmp_path):
    clip = _clip(caption_style="off", show_hook_banner=False)
    assert exporter.build_ass_subtitles(clip, _transcript(), tmp_path / "x.ass", 720, 1280) is False


def test_unsafe_ids_are_rejected(tmp_path):
    clip = _clip()
    clip.id = "clip;rm -rf"
    with pytest.raises(ValueError):
        exporter.export_clip_mp4(clip, tmp_path / "in.mp4", 640, 360, _transcript())


def _make_source(path, w, h):
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error",
         "-f", "lavfi", "-i", f"testsrc2=size={w}x{h}:rate=24:duration=3",
         "-f", "lavfi", "-i", "sine=frequency=440:duration=3",
         "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", str(path)],
        check=True,
    )


def _probe_size(path):
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height",
         "-of", "csv=p=0", str(path)],
        capture_output=True, text=True, check=True,
    ).stdout.strip()
    w, h = out.split(",")
    return int(w), int(h)


@pytest.mark.skipif(not _has_ass_filter(), reason="needs ffmpeg with the libass `ass` filter")
@pytest.mark.parametrize(
    "layout,src",
    [("center_crop", (640, 360)), ("blur_fill", (640, 360)), ("blur_fill", (360, 640)), ("split_screen", (640, 360))],
)
def test_real_export_every_layout(tmp_path, monkeypatch, layout, src):
    exports = tmp_path / "exports"
    exports.mkdir()
    monkeypatch.setattr(exporter, "EXPORTS_DIR", exports)
    source = tmp_path / "source.mp4"
    _make_source(source, *src)

    progress = []
    out = exporter.export_clip_mp4(
        _clip(layout=layout), source, src[0], src[1], _transcript(), on_progress=progress.append
    )

    assert out.exists() and out.stat().st_size > 1000
    assert _probe_size(out) == (720, 1280)
    assert progress and progress[-1] == 100
    assert list(exports.glob("*.ass")) == [], "temporary .ass file should be cleaned up"


@pytest.mark.skipif(not _has_ass_filter(), reason="needs ffmpeg with the libass `ass` filter")
@pytest.mark.parametrize("dirname", ["my exports", "colon:dir", "it's dir"])
def test_export_dir_with_special_characters(tmp_path, monkeypatch, dirname):
    # Regression: the ASS path used to be interpolated into the filtergraph
    # (wrapped in shlex.quote, which is meaningless without a shell). A ':' or
    # "'" in the path, e.g. any Windows "C:\\..." install, broke the filter.
    exports = tmp_path / dirname
    exports.mkdir()
    monkeypatch.setattr(exporter, "EXPORTS_DIR", exports)
    source = tmp_path / "source.mp4"
    _make_source(source, 640, 360)
    out = exporter.export_clip_mp4(_clip(), source, 640, 360, _transcript())
    assert out.exists() and out.stat().st_size > 1000


@pytest.mark.skipif(not _has_ass_filter(), reason="needs ffmpeg with the libass `ass` filter")
def test_failed_export_raises_and_leaves_no_partial_file(tmp_path, monkeypatch):
    exports = tmp_path / "exports"
    exports.mkdir()
    monkeypatch.setattr(exporter, "EXPORTS_DIR", exports)
    bogus = tmp_path / "missing.mp4"
    with pytest.raises(RuntimeError, match="FFmpeg export failed"):
        exporter.export_clip_mp4(_clip(), bogus, 640, 360, _transcript())
    assert list(exports.iterdir()) == []


@pytest.mark.skipif(not _has_ass_filter(), reason="needs ffmpeg with the libass `ass` filter")
def test_progress_callback_errors_do_not_abort_export(tmp_path, monkeypatch):
    exports = tmp_path / "exports"
    exports.mkdir()
    monkeypatch.setattr(exporter, "EXPORTS_DIR", exports)
    source = tmp_path / "source.mp4"
    _make_source(source, 640, 360)

    def bad_cb(_pct):
        raise RuntimeError("db is locked")

    out = exporter.export_clip_mp4(_clip(), source, 640, 360, _transcript(), on_progress=bad_cb)
    assert out.exists()
