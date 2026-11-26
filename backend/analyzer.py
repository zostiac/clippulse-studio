from __future__ import annotations

import json
import logging
import re
import subprocess
import threading
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import httpx

from models import (
    AppSettings,
    Clip,
    ClipStyle,
    PlatformMeta,
    SubScores,
    TranscriptSegment,
    WordTiming,
)

logger = logging.getLogger(__name__)

# Long transcripts are sent to the LLM in several chunks so clips can be found
# across the whole video, not just in the first few minutes.
LLM_CHUNK_SEGMENTS = 180
LLM_MAX_CHUNKS = 4
LLM_MAX_CLIPS = 8

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


def transcribe_with_local_whisper(video_path: Path, model_name: str = "tiny") -> List[TranscriptSegment]:
    wav_path = video_path.parent / "audio_local.wav"
    subprocess.run(
        [
            "ffmpeg", "-y", "-i", str(video_path),
            "-vn", "-ac", "1", "-ar", "16000", "-f", "wav",
            str(wav_path),
        ],
        capture_output=True,
        check=True,
    )
    try:
        model = _get_local_whisper(model_name or "tiny")
        segs_iter, _ = model.transcribe(
            str(wav_path),
            word_timestamps=True,
            vad_filter=True,
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
    subprocess.run(
        [
            "ffmpeg", "-y", "-i", str(video_path),
            "-vn", "-ac", "1", "-ar", "16000", "-b:a", "48k",
            str(audio_path),
        ],
        capture_output=True,
        check=True,
    )
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

    word_objs = [
        WordTiming(
            word=str(w.get("word", "")).strip(),
            start=round(float(w.get("start", 0.0)), 3),
            end=round(float(w.get("end", 0.0)), 3),
        )
        for w in raw_words
        if str(w.get("word", "")).strip()
    ]

    segments: List[TranscriptSegment] = []
    if raw_segments:
        for seg in raw_segments:
            st = round(float(seg.get("start", 0.0)), 3)
            en = round(float(seg.get("end", st + 1.0)), 3)
            txt = str(seg.get("text", "")).strip()
            if not txt:
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


def _num(value, default: float, lo: Optional[float] = None, hi: Optional[float] = None) -> float:
    """Best-effort float parse for model output ("85", 85, None, "85/100" ...)."""
    try:
        out = float(value)
    except (TypeError, ValueError):
        return default
    if out != out:  # NaN
        return default
    if lo is not None:
        out = max(lo, out)
    if hi is not None:
        out = min(hi, out)
    return out


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
        # One malformed entry must not throw away the other clips
        try:
            if not isinstance(item, dict):
                continue
            st = _num(item.get("start"), 0.0, lo=0.0)
            en = _num(item.get("end"), st + 20.0)
            if duration > 0:
                en = min(duration, en)
            if en - st < 6.0:
                continue
            raw_tags = item.get("hashtags") or ["shorts", "viral"]
            if isinstance(raw_tags, str):
                raw_tags = re.split(r"[\s,]+", raw_tags)
            tags = [str(t).lstrip("#").lower() for t in raw_tags if str(t).strip("# ")] or ["shorts", "viral"]
            hook_banner = str(item.get("hook_banner") or item.get("title") or "WATCH THIS")[:42].upper()
            clips.append(
                Clip(
                    project_id=project_id,
                    title=str(item.get("title") or "Viral Clip"),
                    start=round(st, 2),
                    end=round(en, 2),
                    viral_score=int(_num(item.get("viral_score"), 86, lo=60, hi=99)),
                    sub_scores=SubScores(
                        hook=int(_num(item.get("hook"), 86, lo=0, hi=100)),
                        retention=int(_num(item.get("retention"), 84, lo=0, hi=100)),
                        shareability=int(_num(item.get("shareability"), 85, lo=0, hi=100)),
                        clarity=int(_num(item.get("clarity"), 88, lo=0, hi=100)),
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
        except Exception:
            logger.warning("Skipping malformed clip from LLM response", exc_info=True)
    if clips:
        clips.sort(key=lambda c: c.viral_score, reverse=True)
        return clips
    return None


def _chunk_transcript(
    transcript: List[TranscriptSegment],
    size: int = LLM_CHUNK_SEGMENTS,
    max_chunks: int = LLM_MAX_CHUNKS,
) -> List[List[TranscriptSegment]]:
    """Split a transcript into at most ``max_chunks`` contiguous, even parts."""
    if len(transcript) <= size:
        return [transcript]
    n_chunks = min(max_chunks, -(-len(transcript) // size))
    per_chunk = -(-len(transcript) // n_chunks)
    return [transcript[i : i + per_chunk] for i in range(0, len(transcript), per_chunk)]


def _dedupe_overlapping(clips: List[Clip], limit: int) -> List[Clip]:
    """Keep the highest-scoring clips, dropping ones that mostly overlap a kept clip."""
    kept: List[Clip] = []
    for c in sorted(clips, key=lambda c: c.viral_score, reverse=True):
        overlaps = False
        for k in kept:
            inter = max(0.0, min(c.end, k.end) - max(c.start, k.start))
            if inter > 0.35 * min(c.end - c.start, k.end - k.start):
                overlaps = True
                break
        if not overlaps:
            kept.append(c)
        if len(kept) >= limit:
            break
    return kept


def _build_llm_prompt(
    title: str, duration: float, chunk: List[TranscriptSegment], part: int, parts: int
) -> str:
    transcript_block = "\n".join(f"[{s.start:.1f}-{s.end:.1f}] {s.text}" for s in chunk)
    if parts > 1:
        scope = (
            f"This is part {part} of {parts} of the transcript, covering "
            f"{chunk[0].start:.1f}s to {chunk[-1].end:.1f}s. Extract 2 to 4 self-contained viral short clips "
            "that lie entirely within this part."
        )
    else:
        scope = "Extract 3 to 6 self-contained viral short clips."
    return f"""You are an elite short-form video strategist (YouTube Shorts, Instagram Reels, TikTok).
Analyze this video transcript ("{title}", total duration {duration:.1f}s). {scope}
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


def _llm_complete(provider: str, api_key: str, settings: AppSettings, prompt: str) -> Optional[str]:
    """Send ``prompt`` to the configured provider and return the raw text reply."""
    if provider == "gemini":
        model = settings.ai_model or PROVIDER_DEFAULTS["gemini"]["default_model"]
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
        # The key goes in a header, not the query string, so it cannot end up in
        # URLs that httpx puts into exception messages and logs.
        resp = httpx.post(
            url,
            headers={"x-goog-api-key": api_key},
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
        return resp.json()["candidates"][0]["content"]["parts"][0]["text"]

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
    return resp.json()["choices"][0]["message"]["content"]


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

    chunks = _chunk_transcript(transcript)
    found: List[Clip] = []
    for idx, chunk in enumerate(chunks, 1):
        prompt = _build_llm_prompt(title, duration, chunk, idx, len(chunks))
        try:
            raw = _llm_complete(provider, api_key, settings, prompt)
            if not raw:
                continue
            parsed = _parse_llm_clips_json(raw, project_id, duration, settings)
            if parsed:
                found.extend(parsed)
        except Exception as exc:
            # Log the failure (never the key) and carry on with the other parts
            logger.warning("LLM clip detection failed (%s, part %d/%d): %s", provider, idx, len(chunks), exc)
    if not found:
        return None
    if len(chunks) == 1:
        return found  # already sorted by score; keep the model's picks as-is
    # Several parts can propose overlapping clips near their borders
    return _dedupe_overlapping(found, LLM_MAX_CLIPS)


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
            if duration > 0:
                en = min(en, duration)  # transcripts can run slightly past the video
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
        if api_key and settings.ai_provider in ("groq", "openai"):
            try:
                transcript = transcribe_with_cloud_whisper(video_path, api_key, settings.ai_provider)
                if transcript:
                    engine_used = f"{settings.ai_provider}_whisper"
            except Exception as exc:
                logger.warning("Cloud transcription failed (%s): %s", settings.ai_provider, exc)
                transcript = []

        if not transcript and settings.enable_local_whisper:
            try:
                transcript = transcribe_with_local_whisper(video_path, settings.whisper_model)
                if transcript:
                    engine_used = "local_whisper"
            except Exception as exc:
                logger.warning("Local Whisper transcription failed: %s", exc)
                transcript = []

    # 2. LLM viral clip scoring (if free-tier or OpenAI key configured), else Local Heuristic
    clips: Optional[List[Clip]] = None
    if api_key and settings.ai_provider != "local_free" and transcript:
        clips = detect_clips_with_llm(project_id, title, duration, transcript, settings)
        if clips:
            engine_used = f"{settings.ai_provider}_free" if settings.ai_provider in ("groq", "gemini", "openrouter") else settings.ai_provider

    if not clips:
        clips = detect_clips_heuristic(project_id, duration, transcript, energy_peaks, settings)
        if not transcript:
            # Be explicit that these clips come from audio energy alone, so the
            # UI can tell the user why there are no captions.
            engine_used = "energy_only"

    return transcript, clips, engine_used
