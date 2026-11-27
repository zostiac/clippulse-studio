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


def _caption_case(text: str, mode: str, preset: str) -> str:
    selected = mode
    if selected == "style":
        selected = "sentence" if preset == "minimal" else "uppercase"
    if selected == "uppercase":
        return text.upper()
    if selected == "lowercase":
        return text.lower()
    if selected == "sentence":
        lowered = text.lower()
        return lowered[:1].upper() + lowered[1:]
    return text


def build_ass_subtitles(clip: Clip, transcript: List[TranscriptSegment], out_ass: Path, out_w: int, out_h: int) -> bool:
    style = clip.style
    if style.caption_style == "off" and not (style.show_hook_banner and style.hook_banner_text.strip()):
        return False

    scale = out_w / 1080.0
    font_size = max(28, int(round(style.font_size * scale)))
    hook_font = max(24, int(round(44 * scale)))

    if style.caption_position == "top":
        align, margin_v = 8, int(280 * scale)
    elif style.caption_position == "middle":
        align, margin_v = 5, 0
    else:
        align, margin_v = 2, int(320 * scale)

    palettes = {
        "hormozi": {
            "primary": "&H00FFFFFF", "highlight": "&H0015CCFA",
            "outline_color": "&H00000000", "back_color": "&H99000000",
            "border_style": 1, "outline": max(3, int(6 * scale)),
            "shadow": max(2, int(4 * scale)),
        },
        "beast": {
            "primary": "&H00FFFFFF", "highlight": "&H00EED322",
            "outline_color": "&H00101010", "back_color": "&HA0000000",
            "border_style": 1, "outline": max(3, int(6 * scale)),
            "shadow": max(2, int(4 * scale)),
        },
        "minimal": {
            "primary": "&H00F8FAFC", "highlight": "&H00FA8BA7",
            "outline_color": "&H900B0E17", "back_color": "&H900B0E17",
            "border_style": 3, "outline": max(4, int(10 * scale)),
            "shadow": 0,
        },
        "neon": {
            "primary": "&H00FFFFFF", "highlight": "&H00F65C8B",
            "outline_color": "&H00260F38", "back_color": "&H80000000",
            "border_style": 1, "outline": max(3, int(5 * scale)),
            "shadow": max(2, int(4 * scale)),
        },
    }
    pal = palettes.get(style.caption_style, palettes["hormozi"])
    highlights = {
        "yellow": "&H0015CCFA",
        "cyan": "&H00EED322",
        "violet": "&H00FA8BA7",
        "green": "&H0099D334",
        "white": "&H00FFFFFF",
    }
    highlight = highlights.get(style.caption_highlight, pal["highlight"])
    background = style.caption_background
    if background == "style":
        background = "pill" if style.caption_style == "minimal" else "outline"
    border_style = 3 if background == "pill" else 1
    outline = pal["outline"] if background == "outline" else (max(4, int(10 * scale)) if background == "pill" else 0)
    shadow = pal["shadow"] if background == "outline" else 0
    back_color = pal["back_color"] if background != "none" else "&HFF000000"
    if background == "pill":
        back_color = "&H990B0E17"

    header = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {out_w}
PlayResY: {out_h}
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Caption,{style.caption_font},{font_size},{pal['primary']},&H00FFFFFF,{pal['outline_color']},{back_color},-1,0,0,0,100,100,0,0,{border_style},{outline},{shadow},{align},60,60,{margin_v},1
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
        animation = style.caption_animation
        for i in range(0, len(words), chunk_sz):
            group = words[i : i + chunk_sz]
            if not group:
                continue
            if animation == "none":
                phrase = " ".join(
                    _esc_ass(_caption_case(word.word, style.caption_case, style.caption_style))
                    for word in group
                )
                events.append(
                    f"Dialogue: 1,{_fmt_ass_time(group[0].start)},{_fmt_ass_time(min(clip_dur, group[-1].end))},Caption,,0,0,0,,{phrase}"
                )
                continue

            for active_idx, word in enumerate(group):
                event_start = word.start
                event_end = (
                    min(clip_dur, max(event_start + 0.04, group[active_idx + 1].start))
                    if active_idx + 1 < len(group)
                    else min(clip_dur, max(event_start + 0.04, word.end))
                )
                if event_end <= event_start:
                    continue
                parts = []
                for word_idx, grouped_word in enumerate(group):
                    text = _esc_ass(
                        _caption_case(grouped_word.word, style.caption_case, style.caption_style)
                    )
                    if word_idx == active_idx:
                        if animation == "pop":
                            tag = f"\\c{highlight}&\\fscx110\\fscy110"
                        elif animation == "fade":
                            tag = f"\\fad(80,80)\\c{highlight}"
                        else:
                            tag = f"\\c{highlight}"
                        parts.append(f"{{{tag}}}{text}{{\\rCaption}}")
                    else:
                        parts.append(text)
                events.append(
                    f"Dialogue: 1,{_fmt_ass_time(event_start)},{_fmt_ass_time(event_end)},Caption,,0,0,0,,{' '.join(parts)}"
                )

    out_ass.write_text(header + "\n".join(events) + "\n", encoding="utf-8")
    return True


def _detect_face_keyframes(
    video_path: Path,
    clip_start: float,
    clip_end: float,
    src_w: int,
    crop_w: int,
) -> List[tuple[float, float]]:
    """Sample frontal faces locally and return (clip-relative time, crop-x) keyframes."""
    try:
        import cv2
    except ImportError:
        return []

    capture = cv2.VideoCapture(str(video_path))
    if not capture.isOpened():
        capture.release()
        return []
    try:
        cascades = []
        for name in ("haarcascade_frontalface_default.xml", "haarcascade_frontalface_alt2.xml", "haarcascade_profileface.xml"):
            detector = cv2.CascadeClassifier(str(Path(cv2.data.haarcascades) / name))
            if not detector.empty():
                cascades.append(detector)
        if not cascades:
            return []
        duration = max(0.0, clip_end - clip_start)
        if duration <= 0 or src_w <= crop_w:
            return []
        sample_times = [0.0]
        current = 1.25
        while current < duration:
            sample_times.append(current)
            current += 1.25
        if duration > 0.25:
            sample_times.append(duration)

        keyframes: List[tuple[float, float]] = []
        previous_center = None
        for relative_time in sample_times:
            capture.set(cv2.CAP_PROP_POS_MSEC, (clip_start + relative_time) * 1000.0)
            ok, frame = capture.read()
            if not ok or frame is None:
                continue
            frame_h, frame_w = frame.shape[:2]
            factor = min(1.0, 640.0 / max(1, frame_w))
            if factor < 1.0:
                frame = cv2.resize(frame, (max(1, int(frame_w * factor)), max(1, int(frame_h * factor))))
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            gray = cv2.equalizeHist(gray)
            faces = ()
            for detector in cascades:
                faces = detector.detectMultiScale(
                    gray, scaleFactor=1.1, minNeighbors=4, minSize=(24, 24)
                )
                if len(faces) > 0:
                    break
            if len(faces) == 0:
                if previous_center is not None:
                    # Hold the last known position through detection dropouts.
                    crop_x = max(0.0, min(float(src_w - crop_w), previous_center - crop_w / 2.0))
                    keyframes.append((relative_time, crop_x))
                continue
            def score(box):
                x, _y, width, _height = box
                center = (x + width / 2.0) / factor
                area = width * _height
                return (abs(center - previous_center) - area * 0.001) if previous_center is not None else -area
            x, _y, width, _height = min(faces, key=score)
            center_x = (x + width / 2.0) / factor
            previous_center = center_x
            crop_x = max(0.0, min(float(src_w - crop_w), center_x - crop_w / 2.0))
            keyframes.append((relative_time, crop_x))

        if not keyframes:
            return []
        # Extend the first/last detected position to the clip boundaries and
        # lightly smooth adjacent detections to reduce camera jitter.
        if keyframes[0][0] > 0:
            keyframes.insert(0, (0.0, keyframes[0][1]))
        if keyframes[-1][0] < duration:
            keyframes.append((duration, keyframes[-1][1]))
        smoothed = []
        for index, (timestamp, x_value) in enumerate(keyframes):
            neighbors = [keyframes[j][1] for j in range(max(0, index - 1), min(len(keyframes), index + 2))]
            smoothed.append((timestamp, sum(neighbors) / len(neighbors)))
        return smoothed
    finally:
        capture.release()


def _crop_x_expression(keyframes: List[tuple[float, float]], fallback_x: float) -> str:
    """Build an FFmpeg crop expression that linearly follows detected face positions."""
    if not keyframes:
        return str(round(fallback_x, 2))
    points = sorted(keyframes, key=lambda point: point[0])
    expression = f"{points[-1][1]:.2f}"
    for index in range(len(points) - 2, -1, -1):
        t0, x0 = points[index]
        t1, x1 = points[index + 1]
        if t1 <= t0:
            continue
        interpolation = f"{x0:.2f}+({x1 - x0:.2f})*(t-{t0:.3f})/{t1 - t0:.3f}"
        expression = f"if(lt(t,{t1:.3f}),{interpolation},{expression})"
    return f"if(lt(t,{points[0][0]:.3f}),{points[0][1]:.2f},{expression})"

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
        half_h -= half_h % 2
        target_ratio = out_w / max(1, half_h)
        src_ratio = src_w / max(1, src_h)

        def _pane_filter(in_label: str, out_label: str, ax: float, ay: float) -> str:
            # Cover-window crop anchored at (ax, ay) — matches the object-cover
            # crop placement the editor preview shows for each pane.
            if src_ratio >= target_ratio:
                crop_h = src_h - (src_h % 2)
                crop_w = int(round(crop_h * target_ratio))
            else:
                crop_w = src_w - (src_w % 2)
                crop_h = int(round(crop_w / target_ratio))
            crop_w = max(2, min(crop_w, src_w - (src_w % 2)))
            crop_h = max(2, min(crop_h, src_h - (src_h % 2)))
            crop_x = int(round(max(0.0, min(1.0, ax)) * (src_w - crop_w)))
            crop_y = int(round(max(0.0, min(1.0, ay)) * (src_h - crop_h)))
            return (
                f"[{in_label}]crop={crop_w}:{crop_h}:{crop_x}:{crop_y},"
                f"scale={out_w}:{half_h}:force_original_aspect_ratio=increase,"
                f"crop={out_w}:{half_h}[{out_label}]"
            )

        top_f = _pane_filter("top_in", "top", clip.style.split_top_x, clip.style.split_top_y)
        bot_f = _pane_filter("bot_in", "bot", clip.style.split_bottom_x, clip.style.split_bottom_y)
        filter_graph = (
            f"[0:v]split=2[top_in][bot_in];"
            f"{top_f};{bot_f};"
            f"[top][bot]vstack=inputs=2,drawbox=x=0:y={half_h - 2}:w={out_w}:h=4:color=0x0A0B0F:t=fill[vbase]"
        )
    else:
        target_ratio = 9.0 / 16.0
        src_ratio = src_w / max(1, src_h)
        if src_ratio > target_ratio:
            crop_h = src_h - (src_h % 2)
            crop_w = int(round(crop_h * target_ratio))
            crop_w -= crop_w % 2
            max_x = max(0, src_w - crop_w)
            crop_x = ((pan_x + 1.0) / 2.0) * max_x
            if clip.style.reframe_mode == "face_follow":
                stored = getattr(clip.style, "reframe_keyframes", None) or []
                if stored:
                    # Cached face-track results (normalized anchors) — the same
                    # data the editor preview follows, so export matches it.
                    max_x = max(1, src_w - crop_w)
                    keyframes = [
                        (float(item[0]), max(0.0, min(1.0, float(item[1]))) * max_x)
                        for item in stored
                        if len(item) >= 2
                    ]
                else:
                    keyframes = _detect_face_keyframes(
                        video_path, clip.start, clip.end, src_w, crop_w
                    )
                crop_x_expr = _crop_x_expression(keyframes, crop_x)
                crop_x_expr = f"2*floor(({crop_x_expr})/2)"
                crop_filter = f"crop=w={crop_w}:h={crop_h}:x='{crop_x_expr}':y=0"
            else:
                crop_filter = f"crop={crop_w}:{crop_h}:{int(round(crop_x))}:0"
            filter_graph = (
                f"[0:v]{crop_filter},"
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
