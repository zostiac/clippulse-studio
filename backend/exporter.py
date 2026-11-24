from __future__ import annotations

import re
import subprocess
from pathlib import Path
from typing import Callable, List, Optional

from ffutil import FFMPEG_BIN, filter_quote
from models import Clip, EXPORTS_DIR, TranscriptSegment, WordTiming

# Vertical export presets. Every render honors a hard 1080x1920 full-HD floor.
RESOLUTION_PRESETS = {
    "1080x1920": (1080, 1920),
    "1440x2560": (1440, 2560),
}
MIN_OUT_W, MIN_OUT_H = 1080, 1920


def resolve_output_size(resolution: str) -> tuple[int, int]:
    """Map a stored resolution label to an output size, never below the 1080p floor."""
    w, h = RESOLUTION_PRESETS.get(resolution, RESOLUTION_PRESETS["1080x1920"])
    return max(MIN_OUT_W, w), max(MIN_OUT_H, h)


def _fmt_ass_time(sec: float) -> str:
    sec = max(0.0, sec)
    h = int(sec // 3600)
    m = int((sec % 3600) // 60)
    s = sec % 60
    return f"{h}:{m:02d}:{s:05.2f}"


def _esc_ass(txt: str) -> str:
    return txt.replace("\\", "").replace("{", "(").replace("}", ")").replace("\n", "\\N")


def _collect_clip_words(transcript: List[TranscriptSegment], start: float, end: float) -> List[WordTiming]:
    clip_duration = max(0.0, end - start)
    if clip_duration <= 0:
        return []
    words: List[WordTiming] = []
    for seg in transcript:
        if seg.end <= start or seg.start >= end:
            continue
        if seg.words:
            for word in seg.words:
                if word.end <= start or word.start >= end:
                    continue
                rel_start = max(0.0, min(clip_duration, word.start - start))
                rel_end = max(rel_start, min(clip_duration, word.end - start))
                if rel_end > rel_start:
                    words.append(WordTiming(word=word.word, start=rel_start, end=rel_end))
        else:
            tokens = seg.text.split()
            if not tokens:
                continue
            seg_start = max(start, seg.start)
            seg_end = min(end, seg.end)
            segment_duration = seg_end - seg_start
            if segment_duration <= 0:
                continue
            step = segment_duration / len(tokens)
            for index, token in enumerate(tokens):
                rel_start = seg_start - start + index * step
                rel_end = seg_end - start if index == len(tokens) - 1 else rel_start + step
                if rel_end > rel_start:
                    words.append(WordTiming(word=token, start=rel_start, end=rel_end))
    return words


def build_ass_subtitles(clip: Clip, transcript: List[TranscriptSegment], out_ass: Path, out_w: int, out_h: int) -> bool:
    style = clip.style
    if style.caption_style == "off" and not (style.show_hook_banner and style.hook_banner_text.strip()):
        return False

    scale = out_w / 1080.0
    font_size = max(28, int(round(style.font_size * scale)))
    hook_font = max(24, int(round(44 * scale)))

    # Alignment: 8 = top-center, 5 = middle-center, 2 = bottom-center
    if style.caption_position == "top":
        align = 8
        margin_v = int(280 * scale)
    elif style.caption_position == "middle":
        align = 5
        margin_v = 0
    else:
        align = 2
        margin_v = int(320 * scale)

    # Style palettes (ASS uses &HAABBGGRR)
    palettes = {
        "hormozi": {
            "primary": "&H00FFFFFF",
            "highlight": "&H0015CCFA",  # #FACC15 yellow
            "outline_color": "&H00000000",
            "back_color": "&H99000000",
            "border_style": 1,
            "outline": max(3, int(6 * scale)),
            "shadow": max(2, int(4 * scale)),
            "upper": True,
        },
        "beast": {
            "primary": "&H00FFFFFF",
            "highlight": "&H00EED322",  # #22D3EE cyan
            "outline_color": "&H00101010",
            "back_color": "&HA0000000",
            "border_style": 1,
            "outline": max(3, int(6 * scale)),
            "shadow": max(2, int(4 * scale)),
            "upper": True,
        },
        "minimal": {
            "primary": "&H00F8FAFC",
            "highlight": "&H00FA8BA7",  # #A78BFA violet
            "outline_color": "&H900B0E17",
            "back_color": "&H900B0E17",
            "border_style": 3,
            "outline": max(4, int(10 * scale)),
            "shadow": 0,
            "upper": False,
        },
        "neon": {
            "primary": "&H00FFFFFF",
            "highlight": "&H00F65C8B",  # #8B5CF6 violet-pink
            "outline_color": "&H00260F38",
            "back_color": "&H80000000",
            "border_style": 1,
            "outline": max(3, int(5 * scale)),
            "shadow": max(2, int(4 * scale)),
            "upper": True,
        },
    }
    pal = palettes.get(style.caption_style, palettes["hormozi"])

    header = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {out_w}
PlayResY: {out_h}
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Caption,Arial,{font_size},{pal['primary']},&H00FFFFFF,{pal['outline_color']},{pal['back_color']},-1,0,0,0,100,100,0,0,{pal['border_style']},{pal['outline']},{pal['shadow']},{align},60,60,{margin_v},1
Style: HookBanner,Arial,{hook_font},&H00FFFFFF,&H00FFFFFF,&H005C3B7C,&HCC141829,-1,0,0,0,100,100,0,0,3,{max(6, int(14 * scale))},0,8,70,70,{int(145 * scale)},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""

    events: List[str] = []
    clip_dur = max(0.5, clip.end - clip.start)

    if style.show_hook_banner and style.hook_banner_text.strip():
        banner_end = min(clip_dur, 4.5)
        banner_txt = _esc_ass(style.hook_banner_text.strip())
        events.append(
            f"Dialogue: 2,{_fmt_ass_time(0.0)},{_fmt_ass_time(banner_end)},HookBanner,,0,0,0,,{banner_txt}"
        )

    if style.caption_style != "off":
        words = _collect_clip_words(transcript, clip.start, clip.end)
        chunk_sz = max(1, min(6, style.words_per_line))
        for i in range(0, len(words), chunk_sz):
            group = words[i : i + chunk_sz]
            if not group:
                continue
            for active_idx, w in enumerate(group):
                ev_s = w.start
                if active_idx + 1 < len(group):
                    ev_e = min(clip_dur, max(ev_s + 0.04, group[active_idx + 1].start))
                else:
                    ev_e = min(clip_dur, max(ev_s + 0.04, w.end))
                if ev_e <= ev_s:
                    continue
                parts = []
                for idx2, gw in enumerate(group):
                    word_txt = gw.word.upper() if pal["upper"] else gw.word
                    word_txt = _esc_ass(word_txt)
                    if idx2 == active_idx:
                        parts.append(f"{{\\c{pal['highlight']}&\\fscx110\\fscy110}}{word_txt}{{\\rCaption}}")
                    else:
                        parts.append(word_txt)
                line_text = " ".join(parts)
                events.append(
                    f"Dialogue: 1,{_fmt_ass_time(ev_s)},{_fmt_ass_time(ev_e)},Caption,,0,0,0,,{line_text}"
                )

    out_ass.write_text(header + "\n".join(events) + "\n", encoding="utf-8")
    return True


def export_clip_mp4(
    clip: Clip,
    video_path: Path,
    src_w: int,
    src_h: int,
    transcript: List[TranscriptSegment],
    on_progress: Optional[Callable[[int], None]] = None,
) -> Path:
    if not re.fullmatch(r"proj_[a-f0-9]{8}", clip.project_id):
        raise ValueError("Invalid project ID for export.")
    if not re.fullmatch(r"clip_[a-f0-9]{8}", clip.id):
        raise ValueError("Invalid clip ID for export.")
    if not video_path.is_file():
        raise FileNotFoundError("Source video file is missing.")

    out_w, out_h = resolve_output_size(clip.style.resolution)
    out_name = f"{clip.project_id}_{clip.id}_{clip.style.layout}.mp4"
    out_path = (EXPORTS_DIR / out_name).resolve()
    if not out_path.is_relative_to(EXPORTS_DIR.resolve()):
        raise ValueError("Invalid export output path.")
    ass_path = EXPORTS_DIR / f"{clip.project_id}_{clip.id}.ass"
    has_ass = build_ass_subtitles(clip, transcript, ass_path, out_w, out_h)

    layout = clip.style.layout
    pan_x = max(-1.0, min(1.0, clip.style.pan_x))

    if layout == "blur_fill":
        filter_graph = (
            f"[0:v]split=2[bg][fg];"
            f"[bg]scale={out_w}:{out_h}:force_original_aspect_ratio=increase,"
            f"crop={out_w}:{out_h},boxblur=26:2,eq=brightness=-0.16[bg_b];"
            f"[fg]scale={out_w}:-2:force_original_aspect_ratio=decrease[fg_s];"
            f"[bg_b][fg_s]overlay=(W-w)/2:(H-h)/2[vbase]"
        )
    elif layout == "split_screen":
        half_h = out_h // 2
        if src_w / max(1, src_h) > 1.15:
            crop_w = int(round(src_w * 0.56))
            crop_w -= crop_w % 2
            x_left = 0
            x_right = max(0, src_w - crop_w)
            filter_graph = (
                f"[0:v]split=2[top_in][bot_in];"
                f"[top_in]crop={crop_w}:{src_h}:{x_left}:0,"
                f"scale={out_w}:{half_h}:force_original_aspect_ratio=increase,crop={out_w}:{half_h}[top];"
                f"[bot_in]crop={crop_w}:{src_h}:{x_right}:0,"
                f"scale={out_w}:{half_h}:force_original_aspect_ratio=increase,crop={out_w}:{half_h}[bot];"
                f"[top][bot]vstack=inputs=2,drawbox=x=0:y={half_h-2}:w={out_w}:h=4:color=0x0A0B0F:t=fill[vbase]"
            )
        else:
            filter_graph = (
                f"[0:v]split=2[top_in][bot_in];"
                f"[top_in]scale={out_w}:{half_h}:force_original_aspect_ratio=increase,crop={out_w}:{half_h}[top];"
                f"[bot_in]scale={out_w}:{half_h}:force_original_aspect_ratio=increase,crop={out_w}:{half_h}[bot];"
                f"[top][bot]vstack=inputs=2[vbase]"
            )
    else:
        target_ratio = 9.0 / 16.0
        src_ratio = src_w / max(1, src_h)
        if src_ratio > target_ratio:
            crop_h = src_h - (src_h % 2)
            crop_w = int(round(crop_h * target_ratio))
            crop_w -= crop_w % 2
            max_x = max(0, src_w - crop_w)
            crop_x = int(round(((pan_x + 1.0) / 2.0) * max_x))
            filter_graph = (
                f"[0:v]crop={crop_w}:{crop_h}:{crop_x}:0,"
                f"scale={out_w}:{out_h}:flags=lanczos[vbase]"
            )
        else:
            filter_graph = (
                f"[0:v]scale={out_w}:{out_h}:force_original_aspect_ratio=increase,"
                f"crop={out_w}:{out_h}[vbase]"
            )

    if has_ass:
        filter_graph += f";[vbase]ass=filename={filter_quote(str(ass_path))}[vout]"
    else:
        filter_graph += ";[vbase]null[vout]"

    clip_dur = max(0.5, clip.end - clip.start)
    if on_progress:
        on_progress(15)

    cmd = [
        FFMPEG_BIN,
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-ss",
        f"{clip.start:.3f}",
        "-t",
        f"{clip_dur:.3f}",
        "-i",
        str(video_path),
        "-filter_complex",
        filter_graph,
        "-map",
        "[vout]",
        "-map",
        "0:a?",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "20",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        "-movflags",
        "+faststart",
        "-progress",
        "pipe:1",
        "-nostats",
        str(out_path),
    ]

    proc = None
    succeeded = False
    log_tail: List[str] = []
    try:
        try:
            proc = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1,
            )
        except FileNotFoundError as exc:
            raise RuntimeError("FFmpeg was not found. Install FFmpeg or set CLIPPULSE_FFMPEG_PATH.") from exc

        assert proc.stdout is not None
        for line in proc.stdout:
            line = line.strip()
            if line.startswith("out_time_us="):
                try:
                    microseconds = int(line.split("=", 1)[1])
                    pct = min(96, max(18, int(18 + (microseconds / (clip_dur * 1_000_000)) * 78)))
                    if on_progress:
                        on_progress(pct)
                except ValueError:
                    pass
            elif line and not line.startswith(("frame=", "fps=", "stream_", "bitrate=", "total_size=", "out_time=", "dup_frames=", "drop_frames=", "speed=", "progress=")):
                log_tail.append(line)
                log_tail = log_tail[-20:]

        ret = proc.wait()
        if ret != 0 or not out_path.is_file() or out_path.stat().st_size < 1024:
            raise RuntimeError(f"FFmpeg export failed: {' / '.join(log_tail)[-500:] or f'exit code {ret}'}")
        succeeded = True
        if on_progress:
            on_progress(100)
        return out_path
    finally:
        if proc is not None and proc.poll() is None:
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()
                proc.wait()
        if ass_path.exists():
            ass_path.unlink(missing_ok=True)
        if not succeeded and out_path.exists():
            out_path.unlink(missing_ok=True)
