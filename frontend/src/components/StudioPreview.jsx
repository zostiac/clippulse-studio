import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Repeat,
  Download,
  Loader2,
  Eye,
  Heart,
  MessageCircle,
  Share2,
  Music,
  Smartphone,
  Sparkles,
} from "lucide-react";
import { fmtTime } from "../api";
import { formatCaptionWord, getCaptionBackground, getCaptionHighlight } from "../utils/captionStyle";

function getClipWords(transcript, start, end) {
  const words = [];
  for (const seg of transcript || []) {
    if (seg.end < start || seg.start > end) continue;
    if (seg.words && seg.words.length > 0) {
      for (const w of seg.words) {
        if (w.end >= start && w.start <= end) {
          words.push(w);
        }
      }
    } else {
      const tokens = (seg.text || "").split(/\s+/).filter(Boolean);
      if (!tokens.length) continue;
      const s = Math.max(start, seg.start);
      const e = Math.min(end, seg.end);
      const step = Math.max(0, e - s) / tokens.length;
      tokens.forEach((tok, idx) => {
        const wordStart = s + idx * step;
        const wordEnd = idx === tokens.length - 1 ? e : s + (idx + 1) * step;
        if (wordEnd > wordStart) words.push({ word: tok, start: wordStart, end: wordEnd });
      });
    }
  }
  return words;
}

export default function StudioPreview({
  project,
  clip,
  currentTime,
  onTimeUpdate,
  onSeekRef,
  onNudgeStart,
  onNudgeEnd,
  onExportClip,
  onUpdateStyle,
}) {
  const mainVideoRef = useRef(null);
  const auxVideoRef = useRef(null);

  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [loopClip, setLoopClip] = useState(true);
  const [safeZone, setSafeZone] = useState("none"); // none | yt | ig | tt
  const [previewMode, setPreviewMode] = useState("live"); // live | exported

  // Return to the live editor when the selected clip or its export changes.
  useEffect(() => {
    setPreviewMode("live");
    setPlaying(false);
  }, [clip?.id, clip?.export_status]);

  // The exported MP4 timeline starts at zero; the source timeline starts at
  // the absolute clip start. Re-seek whenever the preview source is swapped.
  useEffect(() => {
    if (!mainVideoRef.current || !clip) return;
    mainVideoRef.current.currentTime = previewMode === "live" ? clip.start : 0;
    if (auxVideoRef.current) auxVideoRef.current.currentTime = clip.start;
    onTimeUpdate(clip.start);
  }, [clip?.id, clip?.start, previewMode, onTimeUpdate]);

  // Expose seek function to parent (for transcript click-to-seek)
  useEffect(() => {
    if (!onSeekRef) return;
    onSeekRef.current = (t) => {
      if (previewMode === "exported") setPreviewMode("live");
      if (mainVideoRef.current) {
        mainVideoRef.current.currentTime = t;
      }
      if (auxVideoRef.current) {
        auxVideoRef.current.currentTime = t;
      }
      onTimeUpdate(t);
    };
  }, [onSeekRef, previewMode, onTimeUpdate]);

  // Sync only while playing, and update React state at a modest cadence.
  // The previous always-on 60fps loop re-rendered the entire editor while paused.
  useEffect(() => {
    if (previewMode !== "live" || !playing) return;
    let rafId;
    let lastUiUpdate = 0;
    const tick = (now) => {
      const video = mainVideoRef.current;
      if (video && clip && !video.paused) {
        const time = video.currentTime;
        if (now - lastUiUpdate >= 66) {
          onTimeUpdate(time);
          lastUiUpdate = now;
        }
        if (auxVideoRef.current && Math.abs(auxVideoRef.current.currentTime - time) > 0.12) {
          auxVideoRef.current.currentTime = time;
        }
        if (loopClip && time >= clip.end) {
          video.currentTime = clip.start;
          if (auxVideoRef.current) auxVideoRef.current.currentTime = clip.start;
        }
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [clip?.id, clip?.start, clip?.end, loopClip, previewMode, playing, onTimeUpdate]);

  function togglePlay() {
    const v = mainVideoRef.current;
    if (!v) return;
    if (v.paused) {
      if (previewMode === "live" && clip && (v.currentTime < clip.start || v.currentTime >= clip.end)) {
        v.currentTime = clip.start;
      }
      const playPromise = v.play();
      if (auxVideoRef.current) {
        auxVideoRef.current.currentTime = v.currentTime;
        auxVideoRef.current.play().catch(() => {});
      }
      Promise.resolve(playPromise).then(() => setPlaying(true)).catch(() => setPlaying(false));
    } else {
      v.pause();
      if (auxVideoRef.current) auxVideoRef.current.pause();
      setPlaying(false);
    }
  }

  function handleLiveEnded() {
    const video = mainVideoRef.current;
    if (previewMode === "live" && loopClip && clip && video) {
      video.currentTime = clip.start;
      if (auxVideoRef.current) auxVideoRef.current.currentTime = clip.start;
      video.play().catch(() => setPlaying(false));
      return;
    }
    setPlaying(false);
  }

  // Group words into active chunk for live captions
  const clipWords = useMemo(() => {
    if (!clip) return [];
    return getClipWords(project.transcript, clip.start, clip.end);
  }, [project.transcript, clip?.start, clip?.end]);

  const activeCaptionGroup = useMemo(() => {
    if (!clip || clip.style.caption_style === "off" || !clipWords.length) return null;
    const chunkSize = Math.max(1, Math.min(6, clip.style.words_per_line || 3));
    const idx = clipWords.findIndex(
      (w) => currentTime >= w.start - 0.05 && currentTime <= w.end + 0.08
    );
    if (idx === -1) return null;
    const groupStart = Math.floor(idx / chunkSize) * chunkSize;
    return {
      words: clipWords.slice(groupStart, groupStart + chunkSize),
      activeLocalIdx: idx - groupStart,
    };
  }, [clipWords, currentTime, clip?.style?.caption_style, clip?.style?.words_per_line]);

  if (!clip) {
    return (
      <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">
        Select or create a clip to preview in 9:16 Studio.
      </div>
    );
  }

  const style = clip.style;
  const clipDur = Math.max(0.5, clip.end - clip.start);
  const relTime = Math.max(0, currentTime - clip.start);
  const showBannerNow =
    previewMode === "live" &&
    style.show_hook_banner &&
    style.hook_banner_text?.trim() &&
    relTime <= 4.5;

  const panPct = ((Math.max(-1, Math.min(1, style.pan_x || 0)) + 1) / 2) * 100;

  // Caption CSS styling
  const posClass =
    style.caption_position === "top"
      ? "top-[16%]"
      : style.caption_position === "middle"
      ? "top-1/2 -translate-y-1/2"
      : "bottom-[17%]";

  const scaledFontPx = Math.max(13, Math.round((style.font_size || 58) * 0.34));

  function renderCaptionWord(w, idx, activeIdx) {
    const animation = style.caption_animation || "pop";
    const isAct = idx === activeIdx && animation !== "none";
    const background = getCaptionBackground(style);
    return (
      <span
        key={idx}
        className="inline-block mx-1 font-black tracking-tight"
        style={{
          color: isAct ? getCaptionHighlight(style) : "#FFFFFF",
          textShadow: background === "outline"
            ? "0 2px 0 #000, 2px 0 0 #000, -2px 0 0 #000, 0 -2px 0 #000, 0 4px 10px rgba(0,0,0,0.9)"
            : "none",
          transform: isAct && animation === "pop" ? "scale(1.1)" : "scale(1)",
          opacity: animation === "fade" && !isAct ? 0.82 : 1,
          transition: "color 90ms ease, transform 90ms ease, opacity 90ms ease",
          fontFamily: style.caption_font || "Arial",
          fontWeight: style.caption_style === "minimal" ? 600 : 900,
        }}
      >
        {formatCaptionWord(w.word, style)}
      </span>
    );
  }

  return (
    <section className="cp-studio-preview flex-1 min-w-0 flex flex-col bg-[#0A0B0F] overflow-y-auto">
      {/* Top Safe-Zone & Mode Bar */}
      <div className="px-4 py-2.5 border-b border-white/10 bg-[#0E1017]/70 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Smartphone className="w-3.5 h-3.5 text-slate-400 mr-1" />
          <span className="text-[11px] text-slate-400 hidden sm:inline mr-1">
            Safe Zone:
          </span>
          {[
            ["none", "Clean"],
            ["yt", "YT Shorts"],
            ["ig", "IG Reels"],
            ["tt", "TikTok"],
          ].map(([id, label]) => (
            <button
              key={id}
              onClick={() => setSafeZone(id)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition ${
                safeZone === id
                  ? "bg-violet-600 text-white"
                  : "bg-white/5 text-slate-400 hover:text-white"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {clip.export_status === "done" && clip.export_url && (
          <div className="flex items-center gap-1 bg-[#141724] p-0.5 rounded-lg border border-white/10">
            <button
              onClick={() => {
                setPreviewMode("live");
                setPlaying(false);
              }}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition ${
                previewMode === "live"
                  ? "bg-white/15 text-white"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Live Editor
            </button>
            <button
              onClick={() => {
                setPreviewMode("exported");
                setPlaying(false);
              }}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium flex items-center gap-1 transition ${
                previewMode === "exported"
                  ? "bg-emerald-600 text-white"
                  : "text-emerald-300 hover:text-emerald-200"
              }`}
            >
              <Eye className="w-3 h-3" />
              Exported MP4
            </button>
          </div>
        )}
      </div>

      {/* Phone Stage */}
      <div className="flex-1 flex flex-col items-center justify-center p-4 min-h-[420px]">
        <div
          onClick={togglePlay}
          className="relative w-[270px] sm:w-[300px] aspect-[9/16] rounded-[28px] overflow-hidden bg-black border-[3px] border-white/15 shadow-[0_24px_80px_rgba(0,0,0,0.75)] cursor-pointer select-none group"
        >
          {previewMode === "exported" && clip.export_url ? (
            <video
              ref={mainVideoRef}
              src={`${clip.export_url}?v=${clip.exported_at || 0}`}
              muted={muted}
              loop
              playsInline
              onEnded={() => setPlaying(false)}
              className="w-full h-full object-cover"
            />
          ) : (
            <>
              {/* LAYOUT 1: CENTER CROP */}
              {style.layout === "center_crop" && (
                <video
                  ref={mainVideoRef}
                  src={project.video_url}
                  muted={muted}
                  playsInline
                  onEnded={handleLiveEnded}
                  className="w-full h-full object-cover"
                  style={{ objectPosition: `${panPct}% center` }}
                />
              )}

              {/* LAYOUT 2: BLUR FILL */}
              {style.layout === "blur_fill" && (
                <>
                  <video
                    ref={auxVideoRef}
                    src={project.video_url}
                    muted
                    playsInline
                    className="absolute inset-0 w-full h-full object-cover blur-2xl scale-110 brightness-75"
                  />
                  <video
                    ref={mainVideoRef}
                    src={project.video_url}
                    muted={muted}
                    playsInline
                    onEnded={handleLiveEnded}
                    className="relative z-10 w-full h-full object-contain"
                  />
                </>
              )}

              {/* LAYOUT 3: SPLIT SCREEN */}
              {style.layout === "split_screen" && (
                <div className="w-full h-full flex flex-col">
                  <div className="h-1/2 w-full overflow-hidden border-b-2 border-[#0A0B0F]">
                    <video
                      ref={mainVideoRef}
                      src={project.video_url}
                      muted={muted}
                      playsInline
                      onEnded={handleLiveEnded}
                      className="w-full h-full object-cover object-left"
                    />
                  </div>
                  <div className="h-1/2 w-full overflow-hidden">
                    <video
                      ref={auxVideoRef}
                      src={project.video_url}
                      muted
                      playsInline
                      className="w-full h-full object-cover object-right"
                    />
                  </div>
                </div>
              )}

              {/* Hook Banner Overlay */}
              {showBannerNow && (
                <div className="absolute top-[11%] inset-x-4 z-20 flex justify-center pointer-events-none">
                  <div className="px-3 py-1.5 rounded-lg bg-[#141829]/90 border border-violet-400/50 text-white text-center text-[11px] font-extrabold tracking-wide shadow-lg">
                    {style.hook_banner_text}
                  </div>
                </div>
              )}

              {/* Live Dynamic Captions Overlay */}
              {activeCaptionGroup && (
                <div
                  className={`absolute inset-x-3 z-20 flex justify-center pointer-events-none ${posClass}`}
                >
                  <div
                    className={`text-center leading-tight px-2 ${
                      getCaptionBackground(style) === "pill"
                        ? "bg-slate-950/85 backdrop-blur-sm px-3 py-1.5 rounded-xl border border-white/10"
                        : ""
                    }`}
                    style={{ fontSize: `${scaledFontPx}px` }}
                  >
                    {activeCaptionGroup.words.map((w, idx) =>
                      renderCaptionWord(w, idx, activeCaptionGroup.activeLocalIdx)
                    )}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Platform Safe-Zone Overlays */}
          {safeZone !== "none" && (
            <div className="absolute inset-0 z-30 pointer-events-none">
              {/* TikTok Top Bar */}
              {safeZone === "tt" && (
                <div className="absolute top-3 inset-x-0 flex justify-center gap-4 text-[10px] font-semibold text-white/75">
                  <span>Following</span>
                  <span className="border-b-2 border-white pb-0.5 text-white">For You</span>
                </div>
              )}
              {/* Right Action Stack */}
              <div className="absolute right-2.5 bottom-16 flex flex-col items-center gap-3.5 text-white/80">
                <div className="flex flex-col items-center">
                  <div className="w-8 h-8 rounded-full bg-black/45 border border-white/20 flex items-center justify-center">
                    <Heart className="w-4 h-4" />
                  </div>
                  <span className="text-[9px] mt-0.5">42.8K</span>
                </div>
                <div className="flex flex-col items-center">
                  <div className="w-8 h-8 rounded-full bg-black/45 border border-white/20 flex items-center justify-center">
                    <MessageCircle className="w-4 h-4" />
                  </div>
                  <span className="text-[9px] mt-0.5">1.2K</span>
                </div>
                <div className="flex flex-col items-center">
                  <div className="w-8 h-8 rounded-full bg-black/45 border border-white/20 flex items-center justify-center">
                    <Share2 className="w-4 h-4" />
                  </div>
                  <span className="text-[9px] mt-0.5">Share</span>
                </div>
              </div>
              {/* Bottom Caption Safe Zone */}
              <div className="absolute bottom-3 left-3 right-12 space-y-1 text-white/80">
                <div className="text-[11px] font-bold">
                  @{project.channel_name?.toLowerCase().replace(/\s+/g, "") || "creator"}
                </div>
                <div className="text-[10px] line-clamp-2 opacity-80">
                  {clip.title}
                </div>
                {safeZone === "tt" && (
                  <div className="flex items-center gap-1 text-[9px] opacity-75">
                    <Music className="w-2.5 h-2.5" /> Original Sound
                  </div>
                )}
              </div>
              {/* Safe zone subtle frame label */}
              <div className="absolute top-2.5 left-3 px-1.5 py-0.5 rounded bg-rose-500/80 text-[9px] font-bold uppercase text-white">
                {safeZone === "yt" ? "YT Shorts UI" : safeZone === "ig" ? "IG Reels UI" : "TikTok UI"}
              </div>
            </div>
          )}

          {/* Center Play Overlay when paused */}
          {!playing && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/20 group-hover:bg-black/30 transition">
              <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-md border border-white/30 flex items-center justify-center text-white shadow-xl">
                <Play className="w-5 h-5 fill-white ml-0.5" />
              </div>
            </div>
          )}
        </div>

        {/* Playback Controls */}
        <div className="mt-3 flex items-center gap-2">
          <button
            onClick={togglePlay}
            className="px-3.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-white text-xs font-medium flex items-center gap-1.5 transition"
          >
            {playing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            <span>{playing ? "Pause" : "Play"}</span>
          </button>

          <button
            onClick={() => setMuted((m) => !m)}
            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10"
            title={muted ? "Unmute" : "Mute"}
          >
            {muted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
          </button>

          <button
            onClick={() => setLoopClip((l) => !l)}
            className={`px-2.5 py-1.5 rounded-lg text-xs flex items-center gap-1 border transition ${
              loopClip
                ? "bg-violet-500/20 text-violet-300 border-violet-500/40"
                : "bg-white/5 text-slate-400 border-white/10"
            }`}
            title="Loop selected clip range"
          >
            <Repeat className="w-3.5 h-3.5" />
            <span>Loop</span>
          </button>

          <span className="ml-2 text-xs font-mono text-slate-400 tabular-nums">
            {fmtTime(currentTime)} / {fmtTime(project.duration)}
          </span>
        </div>
      </div>

      {/* Bottom Waveform Scrubber + Export Bar */}
      <div className="border-t border-white/10 bg-[#0E1017] p-3.5 space-y-3">
        {/* Audio Energy Waveform Timeline */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <div className="flex items-center gap-2 font-mono">
              <span className="text-violet-300 font-semibold">
                Clip: {fmtTime(clip.start)} – {fmtTime(clip.end)}
              </span>
              <span className="text-slate-500">({clipDur.toFixed(1)}s)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => onNudgeStart(-0.5)}
                className="px-1.5 py-0.5 rounded bg-white/5 hover:bg-white/10 text-[10px] font-mono text-slate-300"
              >
                Start -0.5s
              </button>
              <button
                onClick={() => onNudgeStart(0.5)}
                className="px-1.5 py-0.5 rounded bg-white/5 hover:bg-white/10 text-[10px] font-mono text-slate-300"
              >
                +0.5s
              </button>
              <span className="text-slate-700">|</span>
              <button
                onClick={() => onNudgeEnd(-0.5)}
                className="px-1.5 py-0.5 rounded bg-white/5 hover:bg-white/10 text-[10px] font-mono text-slate-300"
              >
                End -0.5s
              </button>
              <button
                onClick={() => onNudgeEnd(0.5)}
                className="px-1.5 py-0.5 rounded bg-white/5 hover:bg-white/10 text-[10px] font-mono text-slate-300"
              >
                +0.5s
              </button>
            </div>
          </div>

          <div
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
              const targetT = ratio * (project.duration || 1);
              if (onSeekRef?.current) onSeekRef.current(targetT);
            }}
            className="relative h-12 rounded-lg bg-[#0A0B0F] border border-white/10 px-1.5 flex items-center gap-[2px] cursor-pointer overflow-hidden"
            title="Click anywhere on waveform to seek"
          >
            {/* Active clip highlight window */}
            {project.duration > 0 && (
              <div
                className="absolute top-0 bottom-0 bg-violet-500/18 border-x border-violet-400/70 pointer-events-none"
                style={{
                  left: `${(clip.start / project.duration) * 100}%`,
                  width: `${((clip.end - clip.start) / project.duration) * 100}%`,
                }}
              />
            )}

            {/* Energy bars */}
            {(project.energy_peaks?.length ? project.energy_peaks : Array(80).fill(0.4)).map(
              (val, idx, arr) => {
                const barT = (idx / arr.length) * (project.duration || 1);
                const inClip = barT >= clip.start && barT <= clip.end;
                return (
                  <div
                    key={idx}
                    className={`flex-1 rounded-full transition-colors ${
                      inClip ? "bg-violet-400" : "bg-slate-700/70"
                    }`}
                    style={{ height: `${Math.max(14, Math.round(val * 88))}%` }}
                  />
                );
              }
            )}

            {/* Playhead */}
            {project.duration > 0 && (
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-cyan-300 shadow-[0_0_8px_#22d3ee] pointer-events-none"
                style={{
                  left: `${Math.min(100, Math.max(0, (currentTime / project.duration) * 100))}%`,
                }}
              />
            )}
          </div>
        </div>

        {/* Export Action Row */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">Output:</span>
            <select
              value={["1080x1920", "1440x2560"].includes(style.resolution) ? style.resolution : "1080x1920"}
              onChange={(e) => onUpdateStyle({ ...style, resolution: e.target.value })}
              className="px-2.5 py-1.5 rounded-lg bg-[#0A0B0F] border border-white/10 text-xs text-white focus:outline-none focus:border-violet-500"
            >
              <option value="1080x1920">1080×1920 · Full HD (min)</option>
              <option value="1440x2560">1440×2560 · QHD</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onExportClip}
              disabled={clip.export_status === "rendering"}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-violet-600 to-cyan-500 hover:from-violet-500 hover:to-cyan-400 disabled:opacity-60 text-white text-xs font-semibold flex items-center gap-2 transition shadow-lg shadow-violet-600/20"
            >
              {clip.export_status === "rendering" ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Rendering MP4 ({clip.export_progress}%)...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>
                    {clip.export_status === "done" ? "Re-Export 9:16 MP4" : "Export 9:16 MP4"}
                  </span>
                </>
              )}
            </button>

            {clip.export_status === "done" && clip.export_url && (
              <a
                href={`${clip.export_url}?download=1`}
                download={`${(clip.title || clip.id).replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-").toLowerCase() || clip.id}.mp4`}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 transition"
              >
                <Download className="w-4 h-4" />
                <span>Download MP4</span>
              </a>
            )}
          </div>
        </div>

        {clip.export_status === "error" && clip.export_error && (
          <div className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">
            {clip.export_error}
          </div>
        )}
      </div>
    </section>
  );
}
