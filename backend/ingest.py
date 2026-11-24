from __future__ import annotations

import json
import re
import subprocess
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import httpx
import numpy as np
import yt_dlp
from youtube_transcript_api import YouTubeTranscriptApi

from ffutil import FFMPEG_BIN, FFPROBE_BIN, filter_quote
from models import (
    COOKIES_FILE,
    DEMOS_DIR,
    MAX_UPLOAD_BYTES,
    MAX_SUBTITLE_BYTES,
    TranscriptSegment,
    WordTiming,
)

def _resolve_bold_font() -> str:
    """Pick an on-disk bold TTF for ffmpeg drawtext, across platforms."""
    candidates = [
        # Windows
        "C:/Windows/Fonts/arialbd.ttf",
        "C:/Windows/Fonts/segoeuib.ttf",
        # macOS
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
        "/Library/Fonts/Arial Bold.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
        # Linux
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    ]
    for cand in candidates:
        if Path(cand).is_file():
            return cand
    return ""


FONT_BOLD = _resolve_bold_font()
# drawtext option fragment: an escaped fontfile clause, or empty (fontconfig default).
# expansion=none keeps literal '%' in captions from being parsed as expansion syntax.
FONT_OPT = f"expansion=none:fontfile={filter_quote(FONT_BOLD)}:" if FONT_BOLD else "expansion=none:"


class YouTubeBlockedError(Exception):
    def __init__(self, message: str, meta: Optional[dict] = None):
        super().__init__(message)
        self.meta = meta or {}


def extract_youtube_id(url: str) -> Optional[str]:
    patterns = [
        r"(?:v=|\/v\/|embed\/|shorts\/|live\/)([A-Za-z0-9_-]{11})",
        r"youtu\.be\/([A-Za-z0-9_-]{11})",
    ]
    for pat in patterns:
        m = re.search(pat, url)
        if m:
            return m.group(1)
    return None


def fetch_youtube_oembed(url: str) -> dict:
    try:
        r = httpx.get(
            "https://www.youtube.com/oembed",
            params={"url": url, "format": "json"},
            timeout=10.0,
        )
        if r.status_code == 200:
            return r.json()
    except Exception:
        pass
    return {}


_VIDEO_MAGIC = (
    b"\x1a\x45\xdf\xa3",  # EBML header: WebM / Matroska (.mkv)
)


def is_supported_video_bytes(head: bytes) -> bool:
    """Sniff container magic bytes: ISO-BMFF (MP4/MOV/M4V) or EBML (WebM/MKV)."""
    if len(head) >= 12 and head[4:8] == b"ftyp":
        return True
    return any(head.startswith(sig) for sig in _VIDEO_MAGIC)


def probe_video(video_path: Path) -> Tuple[float, int, int]:
    cmd = [
        FFPROBE_BIN,
        "-v",
        "error",
        "-print_format",
        "json",
        "-show_format",
        "-show_streams",
        str(video_path),
    ]
    try:
        res = subprocess.run(cmd, capture_output=True, text=True, check=True, timeout=30)
    except FileNotFoundError as exc:
        raise RuntimeError("FFprobe was not found. Install FFmpeg or set CLIPPULSE_FFPROBE_PATH.") from exc
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError("Video probing timed out.") from exc

    info = json.loads(res.stdout)
    video_stream = next(
        (stream for stream in info.get("streams", []) if stream.get("codec_type") == "video"),
        None,
    )
    if video_stream is None:
        raise ValueError("The file does not contain a video stream.")
    width = int(video_stream.get("width") or 0)
    height = int(video_stream.get("height") or 0)
    duration = float(info.get("format", {}).get("duration", 0.0) or 0.0)
    if duration <= 0:
        duration = float(video_stream.get("duration") or 0.0)
    if duration <= 0 or width <= 0 or height <= 0:
        raise ValueError("The video stream has invalid duration or dimensions.")
    return duration, width, height


def generate_thumbnail(video_path: Path, out_path: Path, duration: float) -> None:
    seek = min(3.0, max(0.2, duration * 0.2))
    cmd = [
        FFMPEG_BIN,
        "-y",
        "-ss",
        f"{seek:.2f}",
        "-i",
        str(video_path),
        "-vframes",
        "1",
        "-vf",
        "scale=640:-2",
        "-q:v",
        "3",
        str(out_path),
    ]
    subprocess.run(cmd, capture_output=True, check=False, timeout=60)


def compute_energy_peaks(video_path: Path, bins: int = 120) -> List[float]:
    cmd = [
        "ffmpeg",
        "-v",
        "quiet",
        "-i",
        str(video_path),
        "-ac",
        "1",
        "-ar",
        "8000",
        "-f",
        "s16le",
        "pipe:1",
    ]
    res = subprocess.run(cmd, capture_output=True, check=False, timeout=300)
    raw = res.stdout
    if not raw or len(raw) < 200:
        return [0.35] * bins
    samples = np.frombuffer(raw, dtype=np.int16).astype(np.float32)
    if len(samples) < bins:
        return [0.35] * bins
    chunks = np.array_split(samples, bins)
    rms = np.array([float(np.sqrt(np.mean(c * c))) if len(c) else 0.0 for c in chunks])
    max_val = float(np.max(rms)) if len(rms) else 1.0
    if max_val <= 1e-6:
        return [0.25] * bins
    norm = np.clip(rms / max_val, 0.08, 1.0)
    return [round(float(x), 3) for x in norm]


def _parse_ts(ts: str) -> float:
    ts = ts.strip().replace(",", ".")
    parts = ts.split(":")
    if len(parts) == 3:
        h, m, s = parts
        return int(h) * 3600 + int(m) * 60 + float(s)
    if len(parts) == 2:
        m, s = parts
        return int(m) * 60 + float(s)
    return float(parts[0])


def distribute_words(text: str, start: float, end: float) -> List[WordTiming]:
    tokens = [w for w in re.split(r"\s+", text.strip()) if w]
    if not tokens or end <= start:
        return []
    # Use the actual cue duration. Padding very short cues to 0.2s can push
    # later word starts beyond the cue end and create invalid timestamps.
    dur = end - start
    weights = [max(1, len(re.sub(r"[^\w]", "", w))) for w in tokens]
    total_w = sum(weights)
    words: List[WordTiming] = []
    cursor = start
    for index, (tok, weight) in enumerate(zip(tokens, weights)):
        next_cursor = end if index == len(tokens) - 1 else cursor + dur * (weight / total_w)
        if next_cursor > cursor:
            words.append(WordTiming(word=tok, start=cursor, end=min(end, next_cursor)))
        cursor = next_cursor
    return words


def parse_subtitle_text(raw: str) -> List[TranscriptSegment]:
    raw = raw.replace("\r\n", "\n").replace("\r", "\n").strip()
    if not raw:
        return []

    blocks = re.split(r"\n\s*\n", raw)
    segments: List[TranscriptSegment] = []
    time_re = re.compile(
        r"(\d{1,2}:?\d{2}:\d{2}[.,]\d{3}|\d{1,2}:\d{2}[.,]\d{3})\s*-->\s*(\d{1,2}:?\d{2}:\d{2}[.,]\d{3}|\d{1,2}:\d{2}[.,]\d{3})"
    )

    for block in blocks:
        lines = [ln.strip() for ln in block.split("\n") if ln.strip()]
        if not lines:
            continue
        if lines[0].upper().startswith("WEBVTT") or lines[0].startswith("NOTE") or lines[0].startswith("Kind:") or lines[0].startswith("Language:"):
            continue
        time_line_idx = -1
        m = None
        for idx, ln in enumerate(lines[:2]):
            m = time_re.search(ln)
            if m:
                time_line_idx = idx
                break
        if time_line_idx == -1 or m is None:
            continue

        start = _parse_ts(m.group(1))
        end = _parse_ts(m.group(2))
        if end <= start:
            end = start + 1.5

        body_lines = lines[time_line_idx + 1 :]
        if not body_lines:
            continue
        joined = " ".join(body_lines)

        # Check for YouTube VTT inline word timestamps <00:00:01.234><c> word</c>
        inline_matches = list(re.finditer(r"<(\d{2}:\d{2}:\d{2}\.\d{3})><c>(.*?)</c>", joined))
        clean_text = re.sub(r"<[^>]+>", "", joined)
        clean_text = re.sub(r"\s+", " ", clean_text).strip()
        if not clean_text:
            continue

        # Deduplicate overlapping auto-caption lines
        if segments and segments[-1].text == clean_text:
            segments[-1].end = max(segments[-1].end, end)
            continue

        if inline_matches:
            words: List[WordTiming] = []
            # First prefix word before first <timestamp>
            first_tag_pos = joined.find("<")
            prefix = re.sub(r"<[^>]+>", "", joined[:first_tag_pos]).strip() if first_tag_pos > 0 else ""
            if prefix:
                first_ts = _parse_ts(inline_matches[0].group(1))
                words.extend(distribute_words(prefix, start, max(start + 0.15, first_ts)))
            for i, im in enumerate(inline_matches):
                w_start = _parse_ts(im.group(1))
                w_end = _parse_ts(inline_matches[i + 1].group(1)) if i + 1 < len(inline_matches) else end
                w_txt = re.sub(r"<[^>]+>", "", im.group(2)).strip()
                for sub_w in w_txt.split():
                    words.append(WordTiming(word=sub_w, start=round(w_start, 3), end=round(max(w_start + 0.1, w_end), 3)))
        else:
            words = distribute_words(clean_text, start, end)

        segments.append(
            TranscriptSegment(
                start=round(start, 3),
                end=round(end, 3),
                text=clean_text,
                words=words,
            )
        )
    return segments


def parse_plain_transcript(text: str, duration: float) -> List[TranscriptSegment]:
    sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+|\n+", text.strip()) if s.strip()]
    if not sentences:
        return []
    # Keep transcript timestamps inside the actual source duration. The old
    # 1.4-second minimum per sentence pushed long pasted transcripts beyond the video.
    sentences = sentences[:10_000]
    total_chars = sum(len(sentence) for sentence in sentences)
    dur = max(0.001, float(duration))
    cursor = 0.0
    segs: List[TranscriptSegment] = []
    for index, sentence in enumerate(sentences):
        end = dur if index == len(sentences) - 1 else cursor + dur * (len(sentence) / max(1, total_chars))
        if end > cursor:
            segs.append(
                TranscriptSegment(
                    start=cursor,
                    end=end,
                    text=sentence,
                    words=distribute_words(sentence, cursor, end),
                )
            )
        cursor = end
    return segs


def ingest_youtube(url: str, project_dir: Path) -> Tuple[Path, dict, List[TranscriptSegment]]:
    video_id = extract_youtube_id(url)
    oembed = fetch_youtube_oembed(url)
    out_template = str(project_dir / "source.%(ext)s")

    ydl_opts: dict = {
        "format": "bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080][ext=mp4]/best",
        "merge_output_format": "mp4",
        "outtmpl": out_template,
        "writesubtitles": True,
        "writeautomaticsub": True,
        "subtitleslangs": ["en", "en-US", "en-GB"],
        "subtitlesformat": "vtt/srt",
        "quiet": True,
        "no_warnings": True,
        "noplaylist": True,
        "max_filesize": MAX_UPLOAD_BYTES,
        "socket_timeout": 20,
        "retries": 2,
        "fragment_retries": 2,
        "concurrent_fragment_downloads": 2,
    }
    if COOKIES_FILE.exists() and COOKIES_FILE.stat().st_size > 10:
        ydl_opts["cookiefile"] = str(COOKIES_FILE)

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
    except Exception as exc:
        msg = str(exc)
        if "Sign in to confirm" in msg or "bot" in msg.lower() or "cookies" in msg.lower():
            raise YouTubeBlockedError(
                "YouTube blocked automated download from this server IP (bot check). Upload your YouTube cookies.txt in Settings, upload an MP4 directly, or launch a Demo Studio Project to test clipping & export immediately.",
                meta=oembed,
            )
        raise RuntimeError(f"YouTube download failed: {msg}")

    # Find downloaded video file
    video_path = project_dir / "source.mp4"
    if not video_path.exists():
        candidates = [
            p for p in project_dir.glob("source.*")
            if p.suffix.lower() in {".mp4", ".mkv", ".webm", ".mov"}
        ]
        if not candidates:
            raise RuntimeError("Video downloaded but output file was not found.")
        video_path = candidates[0]
    if video_path.stat().st_size > MAX_UPLOAD_BYTES:
        video_path.unlink(missing_ok=True)
        raise RuntimeError("Downloaded YouTube video exceeds the configured upload size limit.")

    # Parse subtitle file if downloaded
    transcript: List[TranscriptSegment] = []
    sub_files = list(project_dir.glob("*.vtt")) + list(project_dir.glob("*.srt"))
    if sub_files:
        subtitle_path = sub_files[0]
        if subtitle_path.stat().st_size <= MAX_SUBTITLE_BYTES:
            transcript = parse_subtitle_text(subtitle_path.read_text(encoding="utf-8-sig", errors="replace"))
        else:
            subtitle_path.unlink(missing_ok=True)

    if not transcript and video_id:
        try:
            fetched = YouTubeTranscriptApi().fetch(video_id)
            for item in fetched:
                txt = re.sub(r"\s+", " ", item.text).strip()
                if not txt:
                    continue
                st = float(item.start)
                en = st + float(item.duration)
                if st < 0 or en <= st:
                    continue
                transcript.append(
                    TranscriptSegment(
                        start=round(st, 3),
                        end=round(en, 3),
                        text=txt,
                        words=distribute_words(txt, st, en),
                    )
                )
        except Exception:
            pass
    transcript = transcript[:10_000]

    meta = {
        "title": info.get("title") or oembed.get("title") or "YouTube Video",
        "channel_name": info.get("uploader") or info.get("channel") or oembed.get("author_name") or "Creator",
        "thumbnail_url": info.get("thumbnail") or oembed.get("thumbnail_url"),
    }
    return video_path, meta, transcript


# ---------------------------------------------------------------------------
# Built-in Demo Long-Form Studio Generator (Real Playable 16:9 H.264 MP4s)
# ---------------------------------------------------------------------------

DEMO_CATALOG: Dict[str, dict] = {
    "podcast_creators": {
        "title": "Why 90% of Creators Quit Before Day 30 (Podcast Ep. 42)",
        "channel_name": "Creator Lab Podcast",
        "duration": 66.0,
        "left_speaker": "ALEX (HOST)",
        "right_speaker": "MAYA (GROWTH)",
        "accent": "#7C5CFC",
        "segments": [
            (0.4, 4.6, "Everybody thinks going viral is about having a ten-thousand-dollar camera setup."),
            (4.7, 9.2, "Wait—that is literally the biggest lie keeping new creators broke and stuck."),
            (9.3, 14.5, "Here is why: viewers decide in the first 1.8 seconds whether to scroll or stay."),
            (14.8, 20.0, "Look at the retention graph. Three things separate a 200-view flop from 2 million views."),
            (20.4, 25.6, "Number one: cut the slow intro. Never start a short with hey guys welcome back."),
            (25.8, 31.0, "Start inside the conflict! Drop the boldest claim in frame one with high-contrast captions."),
            (31.5, 36.8, "Number two: visual pattern interrupts every four seconds keep watch time above 85 percent."),
            (37.2, 42.4, "Most people upload horizontal 16 by 9 clips with tiny text nobody can read on a phone."),
            (42.8, 48.2, "When you reframe to 9 by 16 and highlight one power word at a time, completion doubles."),
            (48.6, 54.0, "Number three: end with a loopable takeaway so viewers rewatch before realizing it restarted."),
            (54.4, 60.0, "Stop waiting for perfect gear. Ship thirty ruthless shorts in thirty days and study the data."),
            (60.2, 65.2, "That single system took our podcast from four hundred subscribers to half a million in six months."),
        ],
    },
    "tech_keynote": {
        "title": "How Small AI Teams Ship 10x Faster Than Giants",
        "channel_name": "BuildFast Summit",
        "duration": 60.0,
        "left_speaker": "DEVON (FOUNDER)",
        "right_speaker": "LIVE DEMO",
        "accent": "#06B6D4",
        "segments": [
            (0.4, 4.8, "Why did a two-person startup beat a five-hundred-engineer tech company in ninety days?"),
            (5.0, 10.2, "Because big teams hold twelve meetings to approve one button. Small teams talk to users daily."),
            (10.5, 15.8, "Here is the exact playbook we used to hit fifty thousand recurring users with zero ad spend."),
            (16.0, 21.4, "First, turn every customer support ticket into a sixty-second vertical product demo."),
            (21.7, 27.2, "Nobody reads a twelve-page blog post anymore, but 400,000 founders watch a 35-second reel."),
            (27.5, 33.0, "Second, automate the boring pipeline: record one deep twenty-minute walkthrough every Friday."),
            (33.3, 39.0, "Then clip the five sharpest insights into YouTube Shorts, Reels, and TikTok before Monday morning."),
            (39.3, 45.0, "The secret is specificity. Show real numbers, real failures, and the exact fix in under forty seconds."),
            (45.3, 51.2, "If your distribution engine runs every week, your product compounds even while you sleep."),
            (51.5, 58.8, "Try publishing three raw founder clips this week—you will be shocked which twenty-second insight explodes."),
        ],
    },
}


def ensure_demo_project_assets(demo_key: str) -> Tuple[Path, dict, List[TranscriptSegment]]:
    if demo_key not in DEMO_CATALOG:
        demo_key = "podcast_creators"
    cfg = DEMO_CATALOG[demo_key]
    out_video = DEMOS_DIR / f"{demo_key}_1080p.mp4"
    dur = float(cfg["duration"])

    transcript: List[TranscriptSegment] = []
    for st, en, txt in cfg["segments"]:
        transcript.append(
            TranscriptSegment(
                start=st,
                end=en,
                text=txt,
                words=distribute_words(txt, st, en),
            )
        )

    if not out_video.exists() or out_video.stat().st_size < 100_000:
        # Build rich 1920x1080 (full HD) studio video with dual speaker panels + live topic badge + modulated speech-cadence audio
        left_lbl = cfg["left_speaker"]
        right_lbl = cfg["right_speaker"]
        title_lbl = cfg["title"][:48]
        chan_lbl = cfg["channel_name"]

        # Dynamic drawtext per segment for live studio teleprompter/topic feel
        seg_filters = []
        for idx, (st, en, txt) in enumerate(cfg["segments"]):
            short_topic = txt[:54] + ("..." if len(txt) > 54 else "")
            enable = filter_quote(f"between(t,{st},{en})")
            active_side = "LEFT" if idx % 2 == 0 else "RIGHT"
            # Subtle active glow box on speaking side
            if active_side == "LEFT":
                seg_filters.append(
                    f"drawbox=x=90:y=165:w=840:h=645:color=0x7C5CFC@0.22:t=fill:enable={enable}"
                )
            else:
                seg_filters.append(
                    f"drawbox=x=990:y=165:w=840:h=645:color=0x22D3EE@0.22:t=fill:enable={enable}"
                )
            seg_filters.append(
                f"drawtext={FONT_OPT}text={filter_quote(short_topic)}:fontcolor=white:fontsize=33:"
                f"x=(w-text_w)/2:y=918:enable={enable}"
            )

        vf_parts = [
            "drawbox=x=0:y=0:w=1920:h=1080:color=0x0D101B:t=fill",
            # Studio header bar
            "drawbox=x=0:y=0:w=1920:h=117:color=0x141829:t=fill",
            f"drawtext={FONT_OPT}text={filter_quote(chan_lbl)}:fontcolor=0x22D3EE:fontsize=30:x=90:y=42",
            f"drawtext={FONT_OPT}text={filter_quote(title_lbl)}:fontcolor=white:fontsize=33:x=495:y=39",
            # Left speaker panel
            "drawbox=x=90:y=165:w=840:h=645:color=0x191F36:t=fill",
            "drawbox=x=90:y=165:w=840:h=645:color=0x7C5CFC@0.55:t=5",
            # Stylized speaker silhouette Left
            "drawbox=x=413:y=278:w=195:h=195:color=0x7C5CFC:t=fill",
            "drawbox=x=330:y=503:w=360:h=225:color=0x4C35B5:t=fill",
            f"drawtext={FONT_OPT}text={filter_quote(left_lbl)}:fontcolor=white:fontsize=33:x=150:y=203",
            # Right speaker panel
            "drawbox=x=990:y=165:w=840:h=645:color=0x162235:t=fill",
            "drawbox=x=990:y=165:w=840:h=645:color=0x22D3EE@0.55:t=5",
            # Stylized speaker silhouette Right
            "drawbox=x=1313:y=278:w=195:h=195:color=0x22D3EE:t=fill",
            "drawbox=x=1230:y=503:w=360:h=225:color=0x0E7490:t=fill",
            f"drawtext={FONT_OPT}text={filter_quote(right_lbl)}:fontcolor=white:fontsize=33:x=1050:y=203",
            # Lower third bar
            "drawbox=x=90:y=870:w=1740:h=144:color=0x131726@0.95:t=fill",
            "drawbox=x=90:y=870:w=12:h=144:color=0x7C5CFC:t=fill",
        ] + seg_filters

        vf = ",".join(vf_parts)

        # Modulated speech-cadence audio with rhythmic energy variation per segment
        # Base warm harmonic chord + amplitude modulation so energy peaks reflect hook moments
        audio_expr = (
            "0.12*sin(2*PI*160*t)*(0.5+0.5*sin(2*PI*3.2*t))"
            "+0.08*sin(2*PI*240*t)*(0.5+0.5*cos(2*PI*4.7*t))"
            "+0.05*sin(2*PI*320*t)*(0.4+0.6*sin(2*PI*1.5*t))"
        )

        cmd = [
            FFMPEG_BIN,
            "-y",
            "-f",
            "lavfi",
            "-i",
            f"color=c=0x0D101B:s=1920x1080:r=24:d={dur}",
            "-f",
            "lavfi",
            "-i",
            f"aevalsrc='{audio_expr}':s=44100:d={dur}",
            "-vf",
            vf,
            "-c:v",
            "libx264",
            "-preset",
            "ultrafast",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            "-b:a",
            "128k",
            "-movflags",
            "+faststart",
            str(out_video),
        ]
        try:
            subprocess.run(cmd, capture_output=True, check=True, timeout=180)
        except subprocess.TimeoutExpired as exc:
            raise RuntimeError("Demo video generation timed out.") from exc
        except FileNotFoundError as exc:
            raise RuntimeError(
                "FFmpeg not found on PATH. Install FFmpeg and restart the server."
            ) from exc
        except subprocess.CalledProcessError as exc:
            tail = (exc.stderr or b"").decode(errors="ignore").strip().splitlines()[-3:]
            raise RuntimeError(
                "Demo video generation failed (ffmpeg): " + (" / ".join(tail) or str(exc))
            ) from exc

    meta = {
        "title": cfg["title"],
        "channel_name": cfg["channel_name"],
        "thumbnail_url": None,
    }
    return out_video, meta, transcript
