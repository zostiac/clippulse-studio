from __future__ import annotations

import json
import math
import re
import subprocess
import threading
import wave
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import httpx
import numpy as np

from ffutil import FFMPEG_BIN, FFPROBE_BIN

from models import (
    AppSettings,
    Clip,
    ClipStyle,
    PlatformMeta,
    SubScores,
    TranscriptSegment,
    TranscriptionError,
    WordTiming,
)

HOOK_POWER_WORDS = {
    "why", "never", "stop", "secret", "mistake", "biggest", "truth", "lie",
    "everybody", "nobody", "literally", "shocked", "formula", "system",
    "playbook", "first", "number", "separates", "single", "without", "zero",
    "million", "thousand", "percent", "double", "doubles", "fast", "faster",
    "broke", "stuck", "wait", "actually", "hack", "rule", "framework",
}

STOPWORDS = {
    "this", "that", "with", "from", "they", "them", "their", "there", "these",
    "those", "what", "when", "where", "which", "would", "could", "should",
    "about", "into", "before", "after", "your", "have", "just", "more", "than",
    "will", "been", "being", "were", "here", "then", "also", "very", "most",
    "some", "only", "make", "like", "know", "want", "need", "going", "guys",
}

PROVIDER_DEFAULTS: Dict[str, dict] = {
    "groq": {
        "chat_url": "https://api.groq.com/openai/v1/chat/completions",
        "whisper_url": "https://api.groq.com/openai/v1/audio/transcriptions",
        "whisper_model": "whisper-large-v3-turbo",
        "default_model": "llama-3.3-70b-versatile",
    },
    "openrouter": {
        "chat_url": "https://openrouter.ai/api/v1/chat/completions",
        "default_model": "meta-llama/llama-3.3-70b-instruct:free",
    },
    "openai": {
        "chat_url": "https://api.openai.com/v1/chat/completions",
        "whisper_url": "https://api.openai.com/v1/audio/transcriptions",
        "whisper_model": "whisper-1",
        "default_model": "gpt-4o-mini",
    },
    "gemini": {
        "default_model": "gemini-2.5-flash",
    },
}

_whisper_lock = threading.Lock()
_whisper_cache: Dict[str, object] = {}


def _get_local_whisper(model_name: str):
    from faster_whisper import WhisperModel
    with _whisper_lock:
        if model_name not in _whisper_cache:
            _whisper_cache[model_name] = WhisperModel(
                model_name, device="cpu", compute_type="int8"
            )
        return _whisper_cache[model_name]


def _extract_audio(video_path: Path, out_args: List[str], out_path: Path) -> None:
    """Extract mono 16 kHz audio with ffmpeg, with diagnosable errors."""
    probe = subprocess.run(
        [FFPROBE_BIN, "-v", "error", "-select_streams", "a", "-show_entries",
         "stream=index", "-of", "csv=p=0", str(video_path)],
        capture_output=True, text=True, timeout=30,
    )
    if probe.returncode == 0 and not probe.stdout.strip():
        raise RuntimeError(
            "This video has no audio track, so there is nothing to transcribe. "
            "Upload a .srt/.vtt subtitle file or paste a transcript with the video instead."
        )
    cmd = [FFMPEG_BIN, "-y", "-i", str(video_path), "-vn", "-ac", "1", "-ar", "16000"]
    cmd += out_args + [str(out_path)]
    try:
        subprocess.run(cmd, capture_output=True, check=True, timeout=180)
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError("Audio extraction timed out. Try a shorter video or a subtitle file.") from exc
    except FileNotFoundError as exc:
        raise RuntimeError("FFmpeg not found on PATH. Install FFmpeg and restart the server.") from exc
    except subprocess.CalledProcessError as exc:
        tail = (exc.stderr or b"").decode(errors="ignore").strip().splitlines()[-3:]
        raise RuntimeError(
            "Audio extraction failed (ffmpeg): " + (" / ".join(tail) or str(exc))
        ) from exc


def _energy_in_range(energy_peaks: List[float], start: float, end: float, duration: float) -> Tuple[float, float]:
    if not energy_peaks or duration <= 0:
        return 0.5, 0.7
    n = len(energy_peaks)
    i0 = max(0, min(n - 1, int((start / duration) * n)))
    i1 = max(i0 + 1, min(n, int((end / duration) * n) + 1))
    sl = energy_peaks[i0:i1]
    return sum(sl) / len(sl), max(sl)


def _extract_keywords(text: str, limit: int = 5) -> List[str]:
    words = re.findall(r"[a-zA-Z]{4,}", text.lower())
    freq: dict[str, int] = {}
    for w in words:
        if w in STOPWORDS:
            continue
        freq[w] = freq.get(w, 0) + 1
    ranked = sorted(freq.items(), key=lambda x: (-x[1], -len(x[0])))
    return [w for w, _ in ranked[:limit]]


def _build_platform_meta(title: str, text: str, hook: str) -> PlatformMeta:
    kws = _extract_keywords(text, 5)
    base_tags = [k for k in kws] + ["shorts", "viral", "contentcreator"]
    seen = set()
    uniq_tags = []
    for t in base_tags:
        if t not in seen:
            seen.add(t)
            uniq_tags.append(t)

    yt_title = title[:95]
    if "#" not in yt_title and len(yt_title) < 82:
        yt_title = f"{yt_title} #shorts"

    snippet = text.strip()
    if len(snippet) > 180:
        snippet = snippet[:177].rsplit(" ", 1)[0] + "..."

    ig_tags = [f"#{t}" for t in uniq_tags[:6]] + ["#reels", "#explorepage"]
    tt_tags = [f"#{t}" for t in uniq_tags[:5]] + ["#fyp", "#tiktokgrowth"]

    return PlatformMeta(
        youtube_title=yt_title,
        youtube_description=f"{hook}\n\n{snippet}\n\nSubscribe for more high-signal clips.\n\n#shorts #{uniq_tags[0] if uniq_tags else 'clips'}",
        youtube_tags=uniq_tags[:8],
        instagram_caption=f"{hook}\n\nSave this for later and share with someone who needs to hear it.\n\n{snippet}",
        instagram_hashtags=ig_tags,
        tiktok_caption=f"{hook} — agree or disagree? 👇",
        tiktok_hashtags=tt_tags,
    )


def _score_window(segs: List[TranscriptSegment], energy_peaks: List[float], duration: float) -> Tuple[int, SubScores, str]:
    opener = segs[0].text.lower()
    full_text = " ".join(s.text for s in segs)
    full_lower = full_text.lower()
    win_dur = max(1.0, segs[-1].end - segs[0].start)

    hook = 64
    opener_words = set(re.findall(r"[a-zA-Z]+", opener))
    hook_hits = len(opener_words & HOOK_POWER_WORDS)
    hook += min(20, hook_hits * 7)
    if "?" in segs[0].text or "!" in segs[0].text:
        hook += 8
    if re.search(r"\b\d+\b", segs[0].text):
        hook += 6

    word_count = len(full_text.split())
    wps = word_count / win_dur
    retention = 72
    if 2.0 <= wps <= 3.8:
        retention += 14
    elif 1.5 <= wps <= 4.3:
        retention += 8
    avg_e, peak_e = _energy_in_range(energy_peaks, segs[0].start, segs[-1].end, duration)
    retention += int(avg_e * 10 + peak_e * 4)

    all_words = set(re.findall(r"[a-zA-Z]+", full_lower))
    share_hits = len(all_words & HOOK_POWER_WORDS)
    shareability = min(98, 65 + share_hits * 4 + (6 if re.search(r"\b\d+\b", full_text) else 0))

    avg_seg_len = word_count / max(1, len(segs))
    clarity = 88 if 7 <= avg_seg_len <= 22 else 78
    if segs[-1].text.strip().endswith((".", "!", "?")):
        clarity = min(97, clarity + 6)

    hook = max(55, min(99, hook))
    retention = max(55, min(99, retention))
    shareability = max(55, min(99, shareability))
    clarity = max(55, min(99, clarity))

    overall = int(round(hook * 0.34 + retention * 0.28 + shareability * 0.22 + clarity * 0.16))
    reasons = []
    if hook >= 80:
        reasons.append("Strong curiosity/contrarian opener in the first 3s")
    if peak_e >= 0.72 or avg_e >= 0.55:
        reasons.append("High vocal energy & dynamic cadence")
    if re.search(r"\b\d+\b", full_text):
        reasons.append("Concrete numbers boost save & share rate")
    if not reasons:
        reasons.append("Clean self-contained insight ideal for 9:16 vertical pacing")

    return overall, SubScores(hook=hook, retention=retention, shareability=shareability, clarity=clarity), " • ".join(reasons)


def _derive_title_and_hook(segs: List[TranscriptSegment]) -> Tuple[str, str]:
    opener = segs[0].text.strip()
    clean = re.sub(r"^(and|so|but|well|yeah|wait)[,\s—-]+", "", opener, flags=re.IGNORECASE).strip()
    words = clean.split()
    title = " ".join(words[:9]).rstrip(".,;:")
    if len(words) > 9:
        title += "..."
    if not title:
        title = "High-Retention Viral Moment"

    hook_words = clean.split()[:6]
    hook_banner = " ".join(hook_words).upper().rstrip(".,;:")
    return title, hook_banner


def _load_pcm_wav_float32(wav_path: Path) -> np.ndarray:
    """Read a 16-bit PCM WAV file into a 1D float32 array in [-1.0, 1.0].

    Passing a decoded NumPy array to faster-whisper bypasses PyAV's av.open(),
    which breaks on PyAV 16+ where the `metadata_errors` kwarg was removed.
    """
    with wave.open(str(wav_path), "rb") as wf:
        if wf.getsampwidth() != 2:
            raise RuntimeError(f"Expected 16-bit PCM WAV, got {wf.getsampwidth() * 8}-bit.")
        raw = wf.readframes(wf.getnframes())
    if not raw:
        return np.zeros(0, dtype=np.float32)
    return np.frombuffer(raw, dtype="<i2").astype(np.float32) / 32768.0


def transcribe_with_local_whisper(video_path: Path, model_name: str = "tiny") -> List[TranscriptSegment]:
    wav_path = video_path.parent / "audio_local.wav"
    try:
        _extract_audio(video_path, ["-c:a", "pcm_s16le", "-f", "wav"], wav_path)
        audio = _load_pcm_wav_float32(wav_path)
        model = _get_local_whisper(model_name or "tiny")
        try:
            segs_iter, _ = model.transcribe(
                audio,
                word_timestamps=True,
                vad_filter=True,
            )
        except Exception:
            # VAD (onnxruntime) can be unavailable on some machines; plain
            # transcription still works without it.
            segs_iter, _ = model.transcribe(
                audio,
                word_timestamps=True,
            )
        segments: List[TranscriptSegment] = []
        for s in segs_iter:
            txt = (s.text or "").strip()
            if not txt:
                continue
            words: List[WordTiming] = []
            for w in (s.words or []):
                wt = (w.word or "").strip()
                if wt:
                    words.append(
                        WordTiming(
                            word=wt,
                            start=round(float(w.start), 3),
                            end=round(max(float(w.start) + 0.06, float(w.end)), 3),
                        )
                    )
            if not words:
                from ingest import distribute_words
                words = distribute_words(txt, float(s.start), float(s.end))
            segments.append(
                TranscriptSegment(
                    start=round(float(s.start), 3),
                    end=round(max(float(s.start) + 0.2, float(s.end)), 3),
                    text=txt,
                    words=words,
                )
            )
        return segments
    finally:
        if wav_path.exists():
            wav_path.unlink(missing_ok=True)


def transcribe_with_cloud_whisper(
    video_path: Path, api_key: str, provider: str
) -> List[TranscriptSegment]:
    cfg = PROVIDER_DEFAULTS.get(provider)
    if not cfg or "whisper_url" not in cfg:
        return []
    audio_path = video_path.parent / "audio_whisper.mp3"
    _extract_audio(video_path, ["-b:a", "48k"], audio_path)
    try:
        with audio_path.open("rb") as f:
            resp = httpx.post(
                cfg["whisper_url"],
                headers={"Authorization": f"Bearer {api_key}"},
                data={
                    "model": cfg["whisper_model"],
                    "response_format": "verbose_json",
                    "timestamp_granularities[]": ["word", "segment"],
                },
                files={"file": ("audio.mp3", f, "audio/mpeg")},
                timeout=180.0,
            )
        resp.raise_for_status()
        data = resp.json()
    finally:
        if audio_path.exists():
            audio_path.unlink(missing_ok=True)

    raw_words = data.get("words") or []
    raw_segments = data.get("segments") or []

    word_objs: List[WordTiming] = []
    for item in raw_words:
        try:
            word = str(item.get("word", "")).strip()
            start = float(item.get("start", 0.0))
            end = float(item.get("end", 0.0))
            if not word or not math.isfinite(start) or not math.isfinite(end) or end <= start:
                continue
            word_objs.append(WordTiming(word=word, start=round(start, 3), end=round(end, 3)))
        except (AttributeError, TypeError, ValueError):
            continue

    segments: List[TranscriptSegment] = []
    if raw_segments:
        for seg in raw_segments:
            try:
                st = round(float(seg.get("start", 0.0)), 3)
                en = round(float(seg.get("end", st + 1.0)), 3)
                txt = str(seg.get("text", "")).strip()
            except (AttributeError, TypeError, ValueError):
                continue
            if not txt or not math.isfinite(st) or not math.isfinite(en) or en <= st:
                continue
            seg_words = [w for w in word_objs if w.start >= st - 0.08 and w.end <= en + 0.12]
            if not seg_words:
                from ingest import distribute_words
                seg_words = distribute_words(txt, st, en)
            segments.append(TranscriptSegment(start=st, end=en, text=txt, words=seg_words))
    elif word_objs:
        for i in range(0, len(word_objs), 10):
            chunk = word_objs[i : i + 10]
            segments.append(
                TranscriptSegment(
                    start=chunk[0].start,
                    end=chunk[-1].end,
                    text=" ".join(w.word for w in chunk),
                    words=chunk,
                )
            )
    return segments


def _parse_llm_clips_json(
    raw: str,
    project_id: str,
    duration: float,
    settings: AppSettings,
) -> Optional[List[Clip]]:
    # Strip markdown fences if any model includes ```json
    cleaned = raw.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", cleaned, flags=re.DOTALL).strip()
    parsed = json.loads(cleaned)
    items = parsed.get("clips") if isinstance(parsed, dict) else parsed
    if not isinstance(items, list):
        return None
    clips: List[Clip] = []
    for item in items:
        st = max(0.0, float(item.get("start", 0.0)))
        en = min(duration, float(item.get("end", st + 20.0)))
        if en - st < 6.0:
            continue
        tags = [str(t).lstrip("#").lower() for t in (item.get("hashtags") or ["shorts", "viral"])]
        hook_banner = str(item.get("hook_banner") or item.get("title") or "WATCH THIS")[:42].upper()
        clips.append(
            Clip(
                project_id=project_id,
                title=str(item.get("title") or "Viral Clip"),
                start=round(st, 2),
                end=round(en, 2),
                viral_score=int(max(60, min(99, int(item.get("viral_score", 86))))),
                sub_scores=SubScores(
                    hook=int(item.get("hook", 86)),
                    retention=int(item.get("retention", 84)),
                    shareability=int(item.get("shareability", 85)),
                    clarity=int(item.get("clarity", 88)),
                ),
                reason=str(item.get("reason") or "High-retention hook and clear takeaway."),
                style=ClipStyle(
                    layout=settings.default_layout,
                    caption_style=settings.default_caption_style,
                    hook_banner_text=hook_banner,
                ),
                platform_meta=PlatformMeta(
                    youtube_title=str(item.get("youtube_title") or item.get("title") or "Viral Short"),
                    youtube_description=f"{hook_banner}\n\n{item.get('reason', '')}\n\n" + " ".join(f"#{t}" for t in tags[:5]),
                    youtube_tags=tags[:8],
                    instagram_caption=str(item.get("instagram_caption") or item.get("reason") or ""),
                    instagram_hashtags=[f"#{t}" for t in tags[:6]] + ["#reels"],
                    tiktok_caption=str(item.get("tiktok_caption") or item.get("title") or ""),
                    tiktok_hashtags=[f"#{t}" for t in tags[:5]] + ["#fyp"],
                ),
            )
        )
    if clips:
        clips.sort(key=lambda c: c.viral_score, reverse=True)
        return clips
    return None


def detect_clips_with_llm(
    project_id: str,
    title: str,
    duration: float,
    transcript: List[TranscriptSegment],
    settings: AppSettings,
) -> Optional[List[Clip]]:
    api_key = (settings.api_key or settings.openai_api_key or "").strip()
    provider = settings.ai_provider
    if provider == "local_free" or not api_key or not transcript:
        return None

    lines = [f"[{s.start:.1f}-{s.end:.1f}] {s.text}" for s in transcript[:180]]
    transcript_block = "\n".join(lines)

    prompt = f"""You are an elite short-form video strategist (YouTube Shorts, Instagram Reels, TikTok).
Analyze this video transcript ("{title}", total duration {duration:.1f}s) and extract 3 to 6 self-contained viral short clips.
Rules:
- Each clip must be between 14s and 58s (or proportional if the video is short).
- Align start and end strictly to the provided timestamps.
- Prioritize strong hooks, contrarian claims, actionable insights, and emotional/curiosity peaks.
- Return ONLY a valid JSON object with key "clips": an array of objects with:
  - "title": punchy 4-9 word title
  - "hook_banner": 3-6 uppercase words for top banner
  - "start": number (seconds)
  - "end": number (seconds)
  - "viral_score": integer 70-99
  - "hook": integer 65-99
  - "retention": integer 65-99
  - "shareability": integer 65-99
  - "clarity": integer 65-99
  - "reason": 1 crisp sentence explaining why it goes viral
  - "youtube_title": string (max 95 chars)
  - "instagram_caption": string
  - "tiktok_caption": string
  - "hashtags": array of 5 lowercase strings without #

Transcript:
{transcript_block}"""

    try:
        if provider == "gemini":
            model = settings.ai_model or PROVIDER_DEFAULTS["gemini"]["default_model"]
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
            resp = httpx.post(
                url,
                params={"key": api_key},
                json={
                    "contents": [{"parts": [{"text": prompt}]}],
                    "generationConfig": {
                        "temperature": 0.4,
                        "responseMimeType": "application/json",
                    },
                },
                timeout=45.0,
            )
            resp.raise_for_status()
            raw = resp.json()["candidates"][0]["content"]["parts"][0]["text"]
            return _parse_llm_clips_json(raw, project_id, duration, settings)

        cfg = PROVIDER_DEFAULTS.get(provider)
        if not cfg:
            return None
        model = settings.ai_model or cfg["default_model"]
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }
        if provider == "openrouter":
            headers["HTTP-Referer"] = "https://clippulse.studio"
            headers["X-Title"] = "ClipPulse Studio"

        body: dict = {
            "model": model,
            "temperature": 0.4,
            "messages": [
                {"role": "system", "content": "Return only valid JSON."},
                {"role": "user", "content": prompt},
            ],
        }
        if provider in ("openai", "groq"):
            body["response_format"] = {"type": "json_object"}

        resp = httpx.post(cfg["chat_url"], headers=headers, json=body, timeout=45.0)
        resp.raise_for_status()
        raw = resp.json()["choices"][0]["message"]["content"]
        return _parse_llm_clips_json(raw, project_id, duration, settings)
    except Exception:
        return None


def detect_clips_heuristic(
    project_id: str,
    duration: float,
    transcript: List[TranscriptSegment],
    energy_peaks: List[float],
    settings: AppSettings,
) -> List[Clip]:
    clips: List[Clip] = []

    if transcript and len(transcript) >= 2:
        min_dur = 14.0 if duration >= 45 else max(6.0, duration * 0.25)
        max_dur = 48.0 if duration >= 60 else max(18.0, duration * 0.65)
        target_dur = 22.0 if duration <= 80 else 32.0

        candidates = []
        n = len(transcript)
        for i in range(n):
            for j in range(i, n):
                st = transcript[i].start
                en = transcript[j].end
                d = en - st
                if d < min_dur:
                    continue
                if d > max_dur:
                    break
                segs = transcript[i : j + 1]
                score, sub, reason = _score_window(segs, energy_peaks, duration)
                dur_bonus = max(0, 4 - abs(d - target_dur) * 0.2)
                candidates.append((score + dur_bonus, score, st, en, segs, sub, reason))

        if not candidates:
            st = transcript[0].start
            en = min(duration, transcript[-1].end)
            score, sub, reason = _score_window(transcript, energy_peaks, duration)
            candidates.append((score, score, st, en, transcript, sub, reason))

        candidates.sort(key=lambda x: x[0], reverse=True)
        chosen: List[Tuple[float, float]] = []
        for _, score, st, en, segs, sub, reason in candidates:
            overlaps = False
            for cst, cen in chosen:
                inter = max(0.0, min(en, cen) - max(st, cst))
                if inter > 0.35 * min(en - st, cen - cst):
                    overlaps = True
                    break
            if overlaps:
                continue
            chosen.append((st, en))
            title, hook_banner = _derive_title_and_hook(segs)
            full_text = " ".join(s.text for s in segs)
            clips.append(
                Clip(
                    project_id=project_id,
                    title=title,
                    start=round(st, 2),
                    end=round(en, 2),
                    viral_score=score,
                    sub_scores=sub,
                    reason=reason,
                    style=ClipStyle(
                        layout=settings.default_layout,
                        caption_style=settings.default_caption_style,
                        hook_banner_text=hook_banner,
                    ),
                    platform_meta=_build_platform_meta(title, full_text, hook_banner),
                )
            )
            if len(clips) >= 5:
                break
    else:
        win = min(30.0, max(10.0, duration * 0.35))
        step = max(8.0, win * 0.75)
        t = 0.0
        idx = 1
        windows = []
        while t + min(8.0, duration * 0.25) < duration and len(windows) < 6:
            en = min(duration, t + win)
            avg_e, peak_e = _energy_in_range(energy_peaks, t, en, duration)
            sc = int(min(95, max(68, 68 + avg_e * 18 + peak_e * 10)))
            windows.append((sc, t, en, avg_e, peak_e))
            t += step
        windows.sort(key=lambda x: x[0], reverse=True)
        for sc, st, en, avg_e, peak_e in windows[:4]:
            title = f"High-Energy Segment #{idx}"
            hook = f"HIGHLIGHT MOMENT #{idx}"
            clips.append(
                Clip(
                    project_id=project_id,
                    title=title,
                    start=round(st, 2),
                    end=round(en, 2),
                    viral_score=sc,
                    sub_scores=SubScores(
                        hook=min(96, sc + 2),
                        retention=int(min(96, 70 + avg_e * 24)),
                        shareability=sc - 2,
                        clarity=82,
                    ),
                    reason=f"Peak audio energy ({int(peak_e*100)}%) detected in this window.",
                    style=ClipStyle(
                        layout=settings.default_layout,
                        caption_style=settings.default_caption_style,
                        hook_banner_text=hook,
                    ),
                    platform_meta=_build_platform_meta(title, title, hook),
                )
            )
            idx += 1

    clips.sort(key=lambda c: c.viral_score, reverse=True)
    return clips


def analyze_project(
    project_id: str,
    title: str,
    video_path: Path,
    duration: float,
    transcript: List[TranscriptSegment],
    energy_peaks: List[float],
    settings: AppSettings,
) -> Tuple[List[TranscriptSegment], List[Clip], str]:
    engine_used = "local_free"
    api_key = (settings.api_key or settings.openai_api_key or "").strip()

    # 1. Free or cloud transcription if no subtitles exist yet
    if not transcript:
        attempted = False
        failures: List[str] = []

        cloud_whisper_provider: Optional[str] = None
        cloud_whisper_key = ""
        if settings.transcription_provider in ("groq", "openai"):
            cloud_whisper_provider = settings.transcription_provider
            cloud_whisper_key = (settings.transcription_api_key or "").strip()
            if not cloud_whisper_key and settings.ai_provider == cloud_whisper_provider:
                cloud_whisper_key = api_key
        elif settings.transcription_provider == "auto" and api_key and settings.ai_provider in ("groq", "openai"):
            cloud_whisper_provider = settings.ai_provider
            cloud_whisper_key = api_key

        if cloud_whisper_provider and cloud_whisper_key:
            attempted = True
            try:
                transcript = transcribe_with_cloud_whisper(
                    video_path, cloud_whisper_key, cloud_whisper_provider
                )
                if transcript:
                    engine_used = f"{cloud_whisper_provider}_whisper"
                else:
                    failures.append(f"{cloud_whisper_provider} Whisper returned no segments")
            except Exception as exc:
                failures.append(f"{cloud_whisper_provider} Whisper failed: {exc}")
                transcript = []

        if not transcript and settings.enable_local_whisper:
            attempted = True
            try:
                transcript = transcribe_with_local_whisper(video_path, settings.whisper_model)
                if transcript:
                    engine_used = "local_whisper"
                else:
                    failures.append("Local Whisper returned no segments")
            except Exception as exc:
                failures.append(f"Local Whisper failed: {exc}")
                transcript = []

        if not transcript and attempted:
            raise TranscriptionError(
                "; ".join(failures)
                + ". Enable a free cloud provider in Settings, turn on Local Whisper, "
                "or upload a .srt/.vtt subtitle file / paste a transcript with the video."
            )

    # 2. LLM viral clip scoring (if free-tier or OpenAI key configured), else Local Heuristic
    clips: Optional[List[Clip]] = None
    if api_key and settings.ai_provider != "local_free" and transcript:
        clips = detect_clips_with_llm(project_id, title, duration, transcript, settings)
        if clips:
            engine_used = f"{settings.ai_provider}_free" if settings.ai_provider in ("groq", "gemini", "openrouter") else settings.ai_provider

    if not clips:
        clips = detect_clips_heuristic(project_id, duration, transcript, energy_peaks, settings)

    return transcript, clips, engine_used
