import React, { useEffect, useMemo, useRef, useState } from "react";
import { useStudio, routeTo } from "../studio.jsx";
import { fmtTC } from "../utils/format.js";
import { PromptDialog } from "../components/Dialogs.jsx";
import CaptionTrack from "../components/CaptionTrack.jsx";
import {
  generateTitleVariants,
  titleViralityScore,
  ctrEstimate,
  buildDescription,
  suggestTags,
} from "../utils/socialCopy.js";

const PLATFORMS = [
  { key: "shorts", label: "Shorts", icon: "smart_display" },
  { key: "reels", label: "Reels", icon: "movie" },
  { key: "tiktok", label: "TikTok", icon: "bolt" },
  { key: "linkedin", label: "LinkedIn", icon: "share" },
];

const CHANNEL_TABS = [
  { key: "youtube", label: "YouTube Shorts", handle: "@StudioChannel", dot: "bg-accent" },
  { key: "instagram", label: "Instagram Reels", handle: "@clippulse.pro", dot: "bg-live" },
  { key: "tiktok", label: "TikTok Native", handle: "@clippulse_off", dot: "bg-live" },
  { key: "linkedin", label: "LinkedIn", handle: "BYOK Mode", dot: "bg-ink-faint" },
];

function loadDispatchPrefs(clipId) {
  try {
    return JSON.parse(localStorage.getItem(`clippulse_dispatch_${clipId}`)) || {};
  } catch {
    return {};
  }
}

export default function SocialKit() {
  const { route, navigate, projects, updateClip, exportClip, toast } = useStudio();
  const projectId = route.projectId || projects.find((p) => !p.archived)?.id || projects[0]?.id || null;
  const project = projects.find((p) => p.id === projectId) || null;
  const clips = useMemo(() => [...(project?.clips || [])].sort((a, b) => a.start - b.start), [project]);
  const clip = clips.find((c) => c.id === route.clipId) || clips[0] || null;

  const [platform, setPlatform] = useState("shorts");
  const [channel, setChannel] = useState("youtube");
  const [showOverlay, setShowOverlay] = useState(true);
  const [showSafeZone, setShowSafeZone] = useState(true);
  const [round, setRound] = useState(0);
  const [selectedTitle, setSelectedTitle] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(clip?.start || 0);
  const videoRef = useRef(null);
  const previewRef = useRef(null);

  const [prefs, setPrefs] = useState(() => loadDispatchPrefs(clip?.id || ""));
  useEffect(() => {
    setPrefs(loadDispatchPrefs(clip?.id || ""));
    setPlaying(false);
    setCurrentTime(clip?.start || 0);
  }, [clip?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const savePrefs = (patch) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    if (clip) localStorage.setItem(`clippulse_dispatch_${clip.id}`, JSON.stringify(next));
  };

  const variants = useMemo(() => generateTitleVariants(clip, project, round), [clip, project, round]);
  const tagSets = useMemo(() => suggestTags(clip, project), [clip, project]);
  const [extraTags, setExtraTags] = useState([]);
  const [tagPrompt, setTagPrompt] = useState(false);
  const [selectedTags, setSelectedTags] = useState(() => new Set());
  useEffect(() => {
    const meta = clip?.platform_meta || {};
    const initial = [...(meta.youtube_tags || []), ...(meta.tiktok_hashtags || []), ...(meta.instagram_hashtags || [])].map((t) =>
      String(t).replace(/^#/, "").toLowerCase()
    );
    setSelectedTags(new Set(initial.slice(0, 6)));
    setExtraTags([]);
  }, [clip?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const allTags = useMemo(() => {
    const base = [...tagSets.core.map((t) => t.replace(/^#/, "")), ...extraTags];
    return [...new Set(base)];
  }, [tagSets, extraTags]);

  const viralityTags = tagSets.virality.map((t) => t.replace(/^#/, ""));

  useEffect(() => {
    const v = videoRef.current;
    if (!v || !clip) return undefined;
    const onTime = () => {
      const t = v.currentTime;
      setCurrentTime(t);
      if (t >= clip.end - 0.05) {
        v.currentTime = clip.start;
      }
    };
    v.addEventListener("timeupdate", onTime);
    return () => v.removeEventListener("timeupdate", onTime);
  }, [clip?.id, clip?.start, clip?.end]); // eslint-disable-line react-hooks/exhaustive-deps

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v || !clip) return;
    if (v.paused) {
      if (v.currentTime < clip.start || v.currentTime >= clip.end - 0.1) v.currentTime = clip.start;
      v.play().catch(() => {});
      setPlaying(true);
    } else {
      v.pause();
      setPlaying(false);
    }
  };

  const copyText = (text, label) => {
    navigator.clipboard?.writeText(text).then(
      () => toast(`${label} copied to clipboard.`, "success"),
      () => toast("Clipboard unavailable in this browser.", "error")
    );
  };

  const commitTags = async (tags) => {
    if (!clip) return;
    const hashtags = tags.map((t) => `#${t}`);
    await updateClip(
      project.id,
      clip.id,
      {
        platform_meta: {
          ...clip.platform_meta,
          youtube_tags: hashtags.slice(0, 8),
          instagram_hashtags: [...hashtags.slice(0, 6), "#reels"],
          tiktok_hashtags: [...hashtags.slice(0, 5), "#fyp"],
        },
      },
      { silent: true }
    );
  };

  const applyTitle = async (variant) => {
    if (!clip) return;
    setSelectedTitle(variants.indexOf(variant));
    await updateClip(
      project.id,
      clip.id,
      {
        platform_meta: {
          ...clip.platform_meta,
          youtube_title: variant,
          tiktok_caption: variant,
          instagram_caption: variant,
        },
      },
      { silent: true }
    );
  };

  const regenerateCopy = () => {
    setRound((r) => r + 3);
    if (clip) {
      const desc = buildDescription(clip, project);
      updateClip(project.id, clip.id, { platform_meta: { ...clip.platform_meta, youtube_description: desc } }, { silent: true });
    }
    toast("AI copy regenerated from the clip hook & transcript.", "success");
  };

  const downloadBundle = () => {
    if (!project) return;
    const a = document.createElement("a");
    a.href = `/api/projects/${project.id}/download-bundle`;
    a.download = "";
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const downloadMp4 = async () => {
    if (!clip) return;
    if (clip.export_status === "done" && clip.export_url) {
      const a = document.createElement("a");
      a.href = clip.export_url;
      a.download = "";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } else {
      await exportClip(project.id, clip.id);
      toast("Rendering the 9:16 MP4 — download will unlock when done.", "info");
    }
  };

  const publishAll = async () => {
    if (!project) return;
    await exportClip(project.id, clips[0]?.id);
    toast("ZIP export kit downloaded — direct platform publishing APIs are on the roadmap.", "info");
    downloadBundle();
  };

  if (!project || !clip) {
    return (
      <div className="flex items-center justify-center h-[70vh]">
        <div className="bg-white p-8 rounded-xl border border-line shadow-sm text-center max-w-md">
          <h2 className="text-xl font-semibold text-ink mb-2">No clip selected</h2>
          <p className="text-sm text-ink-muted mb-4">Open a project in the editor first, then launch the Social Distribution Kit.</p>
          <button
            type="button"
            onClick={() => navigate(routeTo("editor", projectId || undefined))}
            className="px-5 py-2 rounded-lg bg-accent text-white text-sm font-semibold hover:bg-accent-deep transition-colors"
          >
            Open Editor
          </button>
        </div>
      </div>
    );
  }

  const clipIdx = clips.findIndex((c) => c.id === clip.id) + 1;
  const desc = clip.platform_meta.youtube_description || buildDescription(clip, project);
  const channelField =
    channel === "youtube"
      ? { label: "YouTube Title", value: clip.platform_meta.youtube_title, key: "youtube_title" }
      : channel === "instagram"
        ? { label: "Instagram Caption", value: clip.platform_meta.instagram_caption, key: "instagram_caption" }
        : channel === "tiktok"
          ? { label: "TikTok Caption", value: clip.platform_meta.tiktok_caption, key: "tiktok_caption" }
          : null;

  return (
    <div className="relative w-full">
      <PromptDialog
        open={tagPrompt}
        title="Add custom hashtag"
        message="Hashtag without the # symbol."
        placeholder="creatorlife"
        submitLabel="Add tag"
        onSubmit={(custom) => {
          setTagPrompt(false);
          const clean = custom.trim().replace(/^#/, "").replace(/\s+/g, "");
          if (!clean) return;
          setExtraTags((prev) => [...new Set([...prev, clean])]);
          setSelectedTags((prev) => new Set(prev).add(clean));
          commitTags([...new Set([...selectedTags, clean])]);
        }}
        onCancel={() => setTagPrompt(false)}
      />
      <div className="pointer-events-none fixed -top-24 right-1/4 w-[640px] h-[640px] bg-accent/5 rounded-full blur-[140px] z-0" />

      {/* Sub-header */}
      <section className="relative z-10 w-full px-3 py-4 bg-white/90 backdrop-blur-md border-b border-line">
        <div className="max-w-[1600px] mx-auto flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex flex-col gap-1 min-w-0">
            <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 font-label-code-sm text-label-code-sm text-ink-faint flex-wrap">
              <button type="button" onClick={() => navigate(routeTo("projects"))} className="hover:text-accent transition-colors">
                Projects
              </button>
              <span className="text-ink-300">/</span>
              <button
                type="button"
                onClick={() => navigate(routeTo("editor", project.id))}
                className="hover:text-accent transition-colors truncate max-w-[220px]"
              >
                {project.title}
              </button>
              <span className="text-ink-300">/</span>
              <button
                type="button"
                onClick={() => navigate(routeTo("editor", project.id, clip.id))}
                className="hover:text-accent transition-colors text-ink"
              >
                Clip #{clipIdx} ({(clip.end - clip.start).toFixed(1)}s)
              </button>
              <span className="text-ink-300">/</span>
              <span className="text-accent font-semibold">Social Distribution Kit</span>
            </nav>
            <div className="flex items-center gap-2 flex-wrap mt-0.5">
              <h1 className="font-headline-md text-[22px] leading-[30px] font-medium tracking-tight text-ink">
                Social Distribution Kit
              </h1>
              <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-accent-line border border-accent-sand">
                <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                <span className="font-label-code-sm text-label-code-sm uppercase tracking-wider text-accent font-bold">
                  CLIP #{clipIdx} • {clip.viral_score} VIRAL SCORE
                </span>
              </div>
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-line-soft border border-line">
                <span className="font-label-code-sm text-label-code-sm uppercase tracking-wider text-tertiary font-semibold">
                  READY FOR DISPATCH
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 self-start md:self-auto shrink-0">
            <button
              type="button"
              onClick={() => navigate(routeTo("editor", project.id, clip.id))}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-white hover:bg-cloud text-ink-muted hover:text-ink transition-all text-title-sm font-title-sm border border-ink-300 shadow-sm"
            >
              <span className="material-symbols-outlined text-[16px]">arrow_back</span>
              <span>Back to Editor</span>
            </button>
            <button
              type="button"
              onClick={regenerateCopy}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-white hover:bg-cloud text-ink hover:text-accent transition-all text-title-sm font-title-sm border border-ink-300 shadow-sm"
            >
              <span className="material-symbols-outlined text-accent text-[16px]">auto_fix_high</span>
              <span>Regenerate AI Copy</span>
            </button>
            <button
              type="button"
              onClick={publishAll}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded bg-accent text-white hover:bg-accent-deep font-title-sm text-title-sm font-semibold shadow-md active:scale-95 transition-all"
            >
              <span className="material-symbols-outlined text-[18px]">file_download</span>
              <span>Export All &amp; Download ZIP ({clips.length})</span>
            </button>
          </div>
        </div>
      </section>

      {/* Workspace */}
      <main className="relative z-10 w-full max-w-[1600px] mx-auto px-3 py-4">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          {/* LEFT: preview */}
          <div className="lg:col-span-5 flex flex-col gap-4 sticky top-20">
            <div className="p-1 rounded bg-white border border-line shadow-sm flex items-center justify-between gap-1 overflow-x-auto">
              {PLATFORMS.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => setPlatform(p.key)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded font-label-code-sm text-label-code-sm tracking-wide transition-all ${
                    platform === p.key
                      ? "bg-accent-line text-accent border border-accent-sand font-bold shadow-sm"
                      : "hover:bg-cloud text-ink-muted hover:text-ink"
                  }`}
                >
                  <span className="material-symbols-outlined text-[14px]">{p.icon}</span>
                  <span className="truncate">{p.label}</span>
                </button>
              ))}
            </div>

            <div
              ref={previewRef}
              className="relative w-full aspect-[9/16] max-h-[680px] mx-auto rounded-lg overflow-hidden bg-black border border-ink-300 shadow-2xl flex flex-col justify-between group ring-1 ring-black/5"
            >
              <video
                ref={videoRef}
                className="absolute inset-0 w-full h-full object-cover"
                src={project.video_url}
                playsInline
                preload="metadata"
                onClick={togglePlay}
                role="button"
                tabIndex={0}
                aria-label={playing ? "Pause preview" : "Play preview"}
                onKeyDown={(e) => {
                  if (e.key === " " || e.key === "Enter") {
                    e.preventDefault();
                    togglePlay();
                  }
                }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-black/80 pointer-events-none" />

              {showSafeZone && (
                <div className="absolute inset-x-5 inset-y-12 border border-dashed border-accent/60 pointer-events-none rounded">
                  <div className="absolute top-1 left-2 flex items-center gap-1">
                    <span className="font-label-code-sm text-[8px] uppercase tracking-wider text-accent-glow-soft bg-black/80 px-1 py-0.5 rounded backdrop-blur-sm">
                      Captions Safe Zone
                    </span>
                    <span className="font-label-code-sm text-[8px] uppercase tracking-wider text-white bg-black/80 px-1 py-0.5 rounded backdrop-blur-sm">
                      0% Obscured
                    </span>
                  </div>
                  <div className="absolute -bottom-2 right-2">
                    <span className="font-label-code-sm text-[8px] uppercase tracking-wider text-ink-300 bg-black/90 px-1 py-0.5 rounded border border-white/20 backdrop-blur-sm">
                      HUD Free Zone
                    </span>
                  </div>
                </div>
              )}

              {/* top HUD */}
              <div className="relative z-20 pt-4 px-4 flex flex-col items-center gap-2">
                <div className="flex items-center justify-between w-full">
                  <span className="font-label-code-sm text-label-code-sm text-accent-glow-soft flex items-center gap-1 bg-black/75 backdrop-blur-md px-2 py-0.5 rounded border border-white/10">
                    <span className="material-symbols-outlined text-[12px] text-accent-glow">hdr_auto</span>
                    {clip.style.resolution === "1440x2560" ? "1440 × 2560" : "1080 × 1920"}
                  </span>
                  <span className="font-label-code-sm text-label-code-sm text-white bg-black/75 backdrop-blur-md px-2 py-0.5 rounded border border-white/10">
                    {fmtTC(currentTime)} / {fmtTC(clip.end - clip.start)}
                  </span>
                </div>
                {clip.style.show_hook_banner && clip.style.hook_banner_text && (
                  <div className="w-full mt-2 p-2 rounded bg-black/85 backdrop-blur-md border border-accent/50 shadow-lg text-center">
                    <span className="font-label-code-sm text-label-code-sm uppercase tracking-widest text-accent-glow font-bold block mb-0.5">
                      Top Virality Retention Hook
                    </span>
                    <p className="font-title-sm text-[13px] leading-tight text-white font-semibold">&ldquo;{clip.style.hook_banner_text}&rdquo;</p>
                  </div>
                )}
              </div>

              {/* center play + captions */}
              <div className="relative z-20 flex flex-col items-center justify-center px-6 text-center my-auto">
                <button
                  type="button"
                  onClick={togglePlay}
                  className="w-14 h-14 rounded-full bg-black/75 backdrop-blur-md border border-accent flex items-center justify-center text-accent-glow shadow-[0_0_24px_rgba(217,119,6,0.5)] cursor-pointer hover:scale-110 active:scale-95 transition-all"
                >
                  <span className="material-symbols-outlined text-[32px] translate-x-0.5">{playing ? "pause" : "play_arrow"}</span>
                </button>
              </div>
              <CaptionTrack project={project} clip={clip} currentTime={currentTime} style={clip.style} />

              {/* platform UI mock */}
              {showOverlay && (
                <div className="relative z-20 pb-4 px-4 flex items-end justify-between">
                  <div className="flex flex-col gap-2 max-w-[78%]">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-accent text-white flex items-center justify-center font-bold text-xs shadow-md">CP</div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-title-sm text-title-sm text-white font-semibold drop-shadow">@ClipPulseStudio</span>
                        <button type="button" className="px-2 py-0.5 rounded-full bg-white text-black font-body-sm text-[11px] font-bold shadow-sm">
                          Subscribe
                        </button>
                      </div>
                    </div>
                    <p className="font-body-sm text-body-sm text-white line-clamp-2 drop-shadow leading-snug">
                      {(channelField?.value || clip.platform_meta.youtube_title || clip.title).slice(0, 140)}
                    </p>
                    <div className="flex items-center gap-1.5 text-ink-300 font-label-code-sm text-label-code-sm drop-shadow">
                      <span className="material-symbols-outlined text-[13px]">music_note</span>
                      <span className="truncate">Original Sound • ClipPulse Studio Mix</span>
                    </div>
                  </div>
                  <div className="flex flex-col items-center gap-4 shrink-0 pb-1">
                    {[
                      ["thumb_up", "14.2K"],
                      ["thumb_down", "Dislike"],
                      ["comment", "842"],
                      ["share", "2.1K"],
                    ].map(([icon, label]) => (
                      <div key={icon} className="flex flex-col items-center">
                        <div className="w-10 h-10 rounded-full bg-black/70 backdrop-blur-md flex items-center justify-center text-white hover:text-accent-glow transition-colors cursor-pointer border border-white/20">
                          <span className="material-symbols-outlined text-[20px] filled">{icon}</span>
                        </div>
                        <span className="font-label-code-sm text-[10px] text-white font-semibold mt-1">{label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* preview controls */}
            <div className="p-2 rounded bg-white border border-line shadow-sm flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-ink-muted">
                  <span className="material-symbols-outlined text-[16px] text-accent">graphic_eq</span>
                  <span className="font-label-code-sm text-label-code-sm uppercase font-semibold">Source Mix:</span>
                  <span className="font-label-code-sm text-label-code-sm text-ink font-medium">
                    {(clip.end - clip.start).toFixed(1)}s cut • Normalized
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1 cursor-pointer select-none">
                    <input
                      className="w-3.5 h-3.5 accent-accent rounded cursor-pointer"
                      type="checkbox"
                      checked={showOverlay}
                      onChange={(e) => setShowOverlay(e.target.checked)}
                    />
                    <span className="font-label-code-sm text-[10px] text-ink-muted font-medium">UI Overlay</span>
                  </label>
                  <label className="flex items-center gap-1 cursor-pointer select-none ml-2">
                    <input
                      className="w-3.5 h-3.5 accent-accent rounded cursor-pointer"
                      type="checkbox"
                      checked={showSafeZone}
                      onChange={(e) => setShowSafeZone(e.target.checked)}
                    />
                    <span className="font-label-code-sm text-[10px] text-ink-muted font-medium">Safe Zone</span>
                  </label>
                </div>
              </div>
              <div className="h-px bg-line my-0.5" />
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={downloadMp4}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded bg-cloud hover:bg-white text-ink border border-ink-300 font-title-sm text-title-sm transition-colors shadow-sm"
                >
                  <span className="material-symbols-outlined text-[16px] text-ink-muted">download</span>
                  <span>
                    {clip.export_status === "done" ? "Download Raw 9:16 MP4" : "Render & Download 9:16 MP4"}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const el = previewRef.current;
                    if (el?.requestFullscreen) el.requestFullscreen();
                  }}
                  className="p-1.5 rounded bg-cloud hover:bg-white text-ink-muted hover:text-ink border border-ink-300 shadow-sm transition-colors"
                  title="Full Screen View"
                >
                  <span className="material-symbols-outlined text-[18px]">fullscreen</span>
                </button>
              </div>
            </div>
          </div>

          {/* RIGHT: metadata command center */}
          <div className="lg:col-span-7 flex flex-col gap-4">
            {/* channel tabs */}
            <div className="p-1 rounded bg-white border border-line shadow-sm flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1">
                {CHANNEL_TABS.map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setChannel(tab.key)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded font-title-sm text-title-sm transition-all ${
                      channel === tab.key
                        ? "bg-accent-line/60 border-b-2 border-accent text-ink font-bold"
                        : "hover:bg-cloud text-ink-muted hover:text-ink"
                    }`}
                  >
                    <span className={`w-2 h-2 rounded-full ${tab.dot}`} />
                    <span>{tab.label}</span>
                    <span className="font-label-code-sm text-label-code-sm text-ink-faint">{tab.handle}</span>
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1.5 pr-2">
                <span className="font-label-code-sm text-label-code-sm text-ink-faint uppercase tracking-wider">Sync:</span>
                <span className="font-label-code-sm text-label-code-sm text-accent font-bold">ALL LINKED</span>
              </div>
            </div>

            {channel === "linkedin" ? (
              <div className="p-4 rounded bg-white border border-line shadow-sm">
                <p className="text-sm text-ink-muted">
                  LinkedIn publishing runs in <span className="font-semibold text-ink">BYOK mode</span> — bring your own
                  OAuth app in Settings to enable dispatch. The metadata pack covers LinkedIn descriptions too.
                </p>
              </div>
            ) : (
              <div className="p-4 rounded bg-white border border-line shadow-sm flex flex-col gap-2">
                <label className="font-label-code-sm text-label-code-sm uppercase text-ink-muted tracking-wider font-semibold">
                  {channelField.label}
                </label>
                <input
                  className="w-full bg-cloud border border-ink-300 rounded px-3 py-1.5 font-label-code-md text-label-code-md text-ink focus:bg-white focus:border-accent"
                  value={channelField.value}
                  onChange={(e) => updateClip(project.id, clip.id, { platform_meta: { ...clip.platform_meta, [channelField.key]: e.target.value } }, { silent: true })}
                />
              </div>
            )}

            {/* Hook titles */}
            <div className="p-4 rounded bg-white border border-line flex flex-col gap-2 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-accent text-[20px]">psychology</span>
                  <h2 className="font-title-md text-title-md text-ink font-semibold tracking-tight">AI Viral Hook Titles</h2>
                  <span className="font-label-code-sm text-label-code-sm uppercase px-2 py-0.5 rounded-full bg-accent-line text-accent border border-accent-sand font-bold">
                    Top 3 Ranked
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setRound((r) => r + 3)}
                  className="flex items-center gap-1 font-label-code-sm text-label-code-sm text-ink-muted hover:text-accent transition-colors"
                >
                  <span className="material-symbols-outlined text-[14px]">refresh</span>
                  <span>Generate 3 More</span>
                </button>
              </div>
              <div className="flex flex-col gap-1">
                {variants.map((variant, i) => {
                  const score = titleViralityScore(variant, clip);
                  const active = selectedTitle === i;
                  return (
                    <div
                      key={variant}
                      className={`group relative p-2 rounded flex flex-col gap-2 transition-all ${
                        active ? "bg-accent-soft border-2 border-accent/50 shadow-sm" : "bg-white border border-line hover:border-ink-300"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={`w-5 h-5 rounded-full font-label-code-sm text-label-code-sm font-bold flex items-center justify-center shrink-0 ${
                              active ? "bg-accent text-white" : "bg-line-soft text-ink-muted border border-line"
                            }`}
                          >
                            {i + 1}
                          </span>
                          <p className={`font-title-sm text-title-sm ${active ? "text-ink font-bold" : "text-ink-700 font-medium"}`}>
                            {variant}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => copyText(variant, "Title")}
                            className="p-1 rounded bg-white hover:bg-cloud text-ink-muted hover:text-ink border border-ink-300 transition-colors"
                            title="Copy Title"
                          >
                            <span className="material-symbols-outlined text-[16px]">content_copy</span>
                          </button>
                          {active ? (
                            <span className="font-label-code-sm text-label-code-sm text-accent font-semibold flex items-center gap-1 px-1">
                              <span className="material-symbols-outlined text-[14px]">check_circle</span> Active
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => applyTitle(variant)}
                              className="px-2 py-0.5 rounded bg-white hover:bg-cloud text-ink border border-ink-300 font-label-code-sm text-label-code-sm font-semibold transition-colors"
                            >
                              Select
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center justify-between pt-1 border-t border-line-soft">
                        <div className="flex items-center gap-2">
                          <span
                            className={`font-label-code-sm text-label-code-sm px-1.5 py-0.5 rounded font-semibold ${
                              active ? "bg-accent-line text-accent font-bold" : "bg-line-soft text-ink-600"
                            }`}
                          >
                            {score} VIRALITY
                          </span>
                          <span className="font-label-code-sm text-label-code-sm text-ink-muted">
                            Predicted CTR: {ctrEstimate(score)}
                          </span>
                        </div>
                        <span className="font-label-code-sm text-label-code-sm text-ink-muted">
                          {i === 0 ? "Curiosity Gap Model" : i === 1 ? "Contrarian Angle" : "Educational Hook"}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Description */}
            <div className="p-4 rounded bg-white border border-line flex flex-col gap-2 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-accent text-[20px]">description</span>
                  <h2 className="font-title-md text-title-md text-ink font-semibold tracking-tight">
                    Optimized Description &amp; Chapters
                  </h2>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-label-code-sm text-label-code-sm text-ink-muted">{desc.length} / 5,000 Characters</span>
                </div>
              </div>
              <textarea
                className="w-full bg-cloud border border-ink-300 rounded-lg p-2 font-label-code-md text-label-code-md text-ink placeholder:text-ink-faint focus:bg-white focus:border-accent leading-relaxed resize-none transition-colors"
                rows={7}
                value={desc}
                onChange={(e) =>
                  updateClip(project.id, clip.id, { platform_meta: { ...clip.platform_meta, youtube_description: e.target.value } }, { silent: true })
                }
              />
              <div className="flex items-center justify-between flex-wrap gap-2 pt-1 border-t border-line">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      updateClip(
                        project.id,
                        clip.id,
                        { platform_meta: { ...clip.platform_meta, youtube_description: `${desc}\n\n🔗 Full breakdown: https://clippulse.studio` } },
                        { silent: true }
                      )
                    }
                    className="flex items-center gap-1.5 px-3 py-1 rounded bg-cloud hover:bg-white text-ink font-title-sm text-[12px] border border-ink-300 transition-colors"
                  >
                    <span className="material-symbols-outlined text-[14px] text-ink-muted">link</span>
                    <span>+ Add Affiliate Link</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      updateClip(
                        project.id,
                        clip.id,
                        { platform_meta: { ...clip.platform_meta, youtube_description: `${desc}\n\n📌 Pinned: the exact timestamps and sources for everything in this clip.` } },
                        { silent: true }
                      )
                    }
                    className="flex items-center gap-1.5 px-3 py-1 rounded bg-cloud hover:bg-white text-ink font-title-sm text-[12px] border border-ink-300 transition-colors"
                  >
                    <span className="material-symbols-outlined text-[14px] text-ink-muted">comment</span>
                    <span>Auto-Format Pins</span>
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => copyText(desc, "Description")}
                  className="flex items-center gap-1 px-3 py-1 rounded bg-accent-line hover:bg-accent-sand text-accent font-label-code-sm text-label-code-sm font-bold transition-colors border border-accent-sand"
                >
                  <span className="material-symbols-outlined text-[14px]">content_copy</span>
                  <span>Copy Description</span>
                </button>
              </div>
            </div>

            {/* Tag matrix */}
            <div className="p-4 rounded bg-white border border-line flex flex-col gap-2 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-accent text-[20px]">tag</span>
                  <h2 className="font-title-md text-title-md text-ink font-semibold tracking-tight">
                    Tag Matrix &amp; Hashtag Taxonomy
                  </h2>
                </div>
                <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-line-soft border border-line">
                  <span className="font-label-code-sm text-label-code-sm uppercase text-ink-muted font-medium">SEO Index:</span>
                  <span className="font-label-code-sm text-label-code-sm text-accent font-bold">
                    {Math.min(99, 76 + selectedTags.size * 3)}/100 ({selectedTags.size >= 5 ? "Optimal" : "Building"})
                  </span>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <span className="font-label-code-sm text-label-code-sm uppercase text-ink-muted tracking-wider font-semibold">
                  Category Core Tags
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {allTags.map((tag) => {
                    const active = selectedTags.has(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => {
                          setSelectedTags((prev) => {
                            const next = new Set(prev);
                            if (next.has(tag)) next.delete(tag);
                            else next.add(tag);
                            commitTags([...next]);
                            return next;
                          });
                        }}
                        className={`flex items-center gap-1 px-3 py-1 rounded-full font-label-code-sm text-label-code-sm transition-all ${
                          active
                            ? "bg-accent text-white font-semibold shadow-xs"
                            : "bg-white text-ink-700 hover:border-accent hover:text-accent border border-ink-300 font-medium"
                        }`}
                      >
                        <span>#{tag}</span>
                        {active && <span className="material-symbols-outlined text-[12px]">check</span>}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => setTagPrompt(true)}
                    className="flex items-center gap-1 px-3 py-1 rounded-full bg-white text-ink-700 hover:border-accent hover:text-accent border border-ink-300 font-label-code-sm text-label-code-sm font-medium transition-all"
                  >
                    + Add Custom Tag
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-1.5 mt-1">
                <span className="font-label-code-sm text-label-code-sm uppercase text-ink-muted tracking-wider font-semibold">
                  Algorithmic Virality Drivers
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {viralityTags.map((tag, i) => {
                    const active = selectedTags.has(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => {
                          setSelectedTags((prev) => {
                            const next = new Set(prev);
                            if (next.has(tag)) next.delete(tag);
                            else next.add(tag);
                            commitTags([...next]);
                            return next;
                          });
                        }}
                        className={`flex items-center gap-1 px-3 py-1 rounded-full font-label-code-sm text-label-code-sm transition-all ${
                          active
                            ? "bg-accent-line text-accent border border-accent-sand font-bold"
                            : "bg-white text-ink-600 hover:text-ink hover:border-ink-faint border border-ink-300"
                        }`}
                      >
                        <span>#{tag}</span>
                        {i < 2 && <span className="material-symbols-outlined text-[12px]">bolt</span>}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-line">
                <span className="font-label-code-sm text-label-code-sm text-ink-muted">
                  Selected: {selectedTags.size} / 15 tags recommended
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const all = new Set([...allTags, ...viralityTags]);
                    setSelectedTags(all);
                    commitTags([...all]);
                  }}
                  className="font-label-code-sm text-label-code-sm text-accent font-bold hover:underline"
                >
                  Select All ({allTags.length + viralityTags.length})
                </button>
              </div>
            </div>

            {/* Publishing settings */}
            <div className="p-4 rounded bg-white border border-line flex flex-col gap-2 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-accent text-[20px]">tune</span>
                  <h2 className="font-title-md text-title-md text-ink font-semibold tracking-tight">
                    Channel Publishing Settings
                  </h2>
                </div>
                <span className="font-label-code-sm text-label-code-sm text-ink-faint uppercase font-semibold">Shorts API v3</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <label className="font-label-code-sm text-label-code-sm text-ink-muted uppercase font-semibold">Visibility Mode</label>
                  <select
                    className="w-full bg-cloud border border-ink-300 rounded px-3 py-1.5 font-label-code-md text-label-code-md text-ink focus:bg-white focus:border-accent"
                    value={prefs.visibility || "public"}
                    onChange={(e) => savePrefs({ visibility: e.target.value })}
                  >
                    <option value="public">Public (Immediate Algorithmic Feed)</option>
                    <option value="unlisted">Unlisted (Client Review Only)</option>
                    <option value="scheduled">Scheduled for Peak Velocity</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="font-label-code-sm text-label-code-sm text-ink-muted uppercase font-semibold">
                    Target Dispatch Window
                  </label>
                  <div className="relative">
                    <input
                      className="w-full bg-accent-soft border border-accent-sand rounded px-3 py-1.5 font-label-code-md text-label-code-md text-accent font-bold focus:border-accent pl-8"
                      value={prefs.schedule || "Today @ 18:30 EST (Auto-Optimal)"}
                      onChange={(e) => savePrefs({ schedule: e.target.value })}
                    />
                    <span className="material-symbols-outlined text-[16px] text-accent absolute left-2.5 top-1/2 -translate-y-1/2">
                      schedule
                    </span>
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="font-label-code-sm text-label-code-sm text-ink-muted uppercase font-semibold">Niche Category</label>
                  <input
                    className="w-full bg-cloud border border-ink-300 rounded px-3 py-1.5 font-label-code-md text-label-code-md text-ink-600"
                    value={prefs.category || "Education & How-To"}
                    onChange={(e) => savePrefs({ category: e.target.value })}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="font-label-code-sm text-label-code-sm text-ink-muted uppercase font-semibold">
                    Audience Declaration
                  </label>
                  <input
                    className="w-full bg-cloud border border-ink-300 rounded px-3 py-1.5 font-label-code-md text-label-code-md text-ink-600"
                    value={prefs.audience || "Not Made for Kids • All Ages"}
                    onChange={(e) => savePrefs({ audience: e.target.value })}
                  />
                </div>
              </div>
              <div className="pt-2 flex flex-col gap-1.5 border-t border-line">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    className="w-4 h-4 accent-accent rounded border-ink-300"
                    type="checkbox"
                    checked={prefs.auto_pin !== false}
                    onChange={(e) => savePrefs({ auto_pin: e.target.checked })}
                  />
                  <span className="font-body-sm text-body-sm text-ink-700">
                    Auto-pin first comment with full source breakdown and community link
                  </span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    className="w-4 h-4 accent-accent rounded border-ink-300"
                    type="checkbox"
                    checked={prefs.notify !== false}
                    onChange={(e) => savePrefs({ notify: e.target.checked })}
                  />
                  <span className="font-body-sm text-body-sm text-ink-700">
                    Notify subscribers in YouTube feed &amp; send algorithmic notification ping
                  </span>
                </label>
              </div>
            </div>

            {/* Dispatch deck */}
            <div className="p-4 rounded-lg bg-white border border-accent-sand shadow-lg flex flex-col sm:flex-row items-center justify-between gap-2 ring-1 ring-accent/10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-accent-line border border-accent-sand flex items-center justify-center text-accent shrink-0">
                  <span className="material-symbols-outlined text-[22px]">verified</span>
                </div>
                <div className="flex flex-col">
                  <div className="flex items-center gap-2">
                    <span className="font-title-sm text-title-sm text-ink font-bold">Package Ready for Transmission</span>
                    <span className="font-label-code-sm text-[9px] uppercase px-1.5 py-0.5 rounded bg-accent-line text-accent font-bold">
                      1080p H.264
                    </span>
                  </div>
                  <span className="font-label-code-sm text-label-code-sm text-ink-muted">
                    H.264 + AAC • Burned-in captions • All Safe-Zones Clean • {selectedTags.size} tags synced
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                <button
                  type="button"
                  onClick={downloadBundle}
                  className="px-3 py-2 rounded bg-white hover:bg-cloud text-ink font-title-sm text-title-sm border border-ink-300 shadow-sm transition-colors"
                  title="Download Asset Bundle"
                >
                  <span className="material-symbols-outlined text-[16px] inline-block mr-1 align-text-bottom text-ink-muted">
                    folder_zip
                  </span>
                  <span>Metadata Pack (.zip)</span>
                </button>
                <button
                  type="button"
                  onClick={downloadMp4}
                  className="px-5 py-2 rounded bg-accent text-white hover:bg-accent-deep font-title-sm text-title-sm font-bold shadow-md active:scale-95 transition-all flex items-center gap-2"
                >
                  <span>Publish to YouTube Shorts</span>
                  <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
