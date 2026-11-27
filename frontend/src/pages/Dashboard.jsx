import React, { useState } from "react";
import { useStudio, routeTo } from "../studio.jsx";
import { fmtDur, fmtRelTime } from "../utils/format.js";

const DEMO_CARDS = [
  {
    key: "podcast_creators",
    art: "/art/demo-podcast.jpg",
    badge: "DUAL-SPEAKER PODCAST • 1:06",
    score: 98,
    scoreClass: "bg-primary-container text-on-primary-container",
    overlay: "Dual-Stack 9:16",
    title: "\"Why 90% of Creators Quit Before Day 30\"",
    desc: "Full dual-panel podcast setup with intelligent speaker-switching active pan, Hormozi-style bouncy typography captions, and built-in safe zones.",
    meta: "Yellow-Pop Text",
    metaIcon: "closed_caption",
    cta: "Open Podcast Studio Demo",
  },
  {
    key: "tech_keynote",
    art: "/art/demo-keynote.jpg",
    badge: "TECH KEYNOTE • 1:00",
    score: 94,
    scoreClass: "bg-secondary-container text-on-secondary-container",
    overlay: "Blur-Fill 16:9 Inset",
    title: "\"How Small AI Teams Ship 10x Faster Than Giants\"",
    desc: "Single founder tech talk with background ambient blur-fill frame, dynamic Beast Clean captions, audio ducking, and auto-hook highlights.",
    meta: "Beast Clean Sans",
    metaIcon: "subtitles",
    cta: "Open Tech Keynote Demo",
  },
];

const SANDBOX_TILES = [
  {
    key: "solo_vlog",
    art: "/art/tile-solo-vlog.jpg",
    tag: "Solo Creator",
    title: "Solo Vlog Monologue",
    meta: "Center Tracking • 0:45",
  },
  {
    key: "gameplay_stream",
    art: "/art/tile-gameplay.jpg",
    tag: "Streamer",
    title: "High-Action Gameplay Stream",
    meta: "Facecam Inset • 1:12",
  },
  {
    key: "product_walkthrough",
    art: "/art/tile-walkthrough.jpg",
    tag: "Tutorial",
    title: "Product Walkthrough",
    meta: "Smart Zoom • 0:58",
  },
];

function ProjectCard({ project }) {
  const { navigate, busy } = useStudio();
  const topScores = [...(project.clips || [])].sort((a, b) => b.viral_score - a.viral_score).slice(0, 3);
  const extra = Math.max(0, (project.clips?.length || 0) - 3);
  const exported = (project.clips || []).filter((c) => c.export_status === "done").length;
  const analyzing = project.status === "analyzing" || project.status === "ingesting";

  return (
    <div className="bg-surface-container-lowest p-space-md rounded-xl shadow-md hover:shadow-xl transition-all flex flex-col justify-between group">
      <div>
        <div className="relative w-full h-52 rounded-lg overflow-hidden bg-surface-dim mb-space-md">
          {project.thumbnail_url ? (
            <img
              className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
              src={project.thumbnail_url}
              alt={project.title}
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-surface-container to-surface-dim" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-inverse-surface/90 via-inverse-surface/20 to-transparent" />
          <div className="absolute top-space-sm left-space-sm flex items-center gap-1.5">
            <span className="px-2 py-0.5 rounded bg-surface-container-lowest/90 backdrop-blur-md text-on-surface font-label-sm text-[10px] font-bold uppercase flex items-center gap-1">
              <span
                className={`material-symbols-outlined text-[12px] ${
                  project.source_type === "youtube" ? "text-error" : "text-primary-container"
                }`}
              >
                {project.source_type === "youtube" ? "smart_display" : project.source_type === "upload" ? "file_upload" : "auto_videocam"}
              </span>
              {project.source_type === "youtube" ? "YOUTUBE" : project.source_type === "upload" ? "UPLOAD" : "DEMO"}
            </span>
            <span className="px-2 py-0.5 rounded bg-surface-container-lowest/90 backdrop-blur-md text-on-surface font-label-sm text-[10px] font-semibold">
              {project.width}x{project.height}
            </span>
          </div>
          <div className="absolute top-space-sm right-space-sm">
            <span className="px-2 py-0.5 rounded bg-inverse-surface/80 text-inverse-on-surface font-label-sm text-label-sm font-semibold">
              {fmtDur(project.duration)}
            </span>
          </div>
          <div className="absolute bottom-space-sm left-space-sm right-space-sm flex items-center justify-between text-inverse-on-surface">
            <div className="flex items-center gap-2">
              {analyzing ? (
                <>
                  <span className="w-2.5 h-2.5 rounded-full bg-secondary animate-ping" />
                  <span className="font-label-sm text-label-sm font-medium">{project.status_detail || "Analyzing…"}</span>
                </>
              ) : (
                <>
                  <span className="w-2.5 h-2.5 rounded-full bg-tertiary-container animate-ping" />
                  <span className="font-label-sm text-label-sm font-medium">{project.clips?.length || 0} Shorts Extracted</span>
                </>
              )}
            </div>
            <div className="flex items-center gap-1 font-label-sm text-label-sm bg-primary-container/90 px-2 py-0.5 rounded">
              <span className="material-symbols-outlined text-[14px]">auto_awesome</span>
              <span>9:16 Ready</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-space-xs mb-1">
          <span className="font-label-sm text-label-sm text-on-surface-variant font-medium">
            Last modified {fmtRelTime(project.updated_at || project.created_at)}
          </span>
          <span className="text-on-surface-variant">•</span>
          <span className="font-label-sm text-label-sm text-primary-container font-semibold">{exported} Clips Exported</span>
        </div>
        <h3 className="font-headline-sm text-headline-sm text-on-surface font-semibold group-hover:text-primary-container transition-colors line-clamp-1 mb-space-xs">
          {project.title}
        </h3>
        <p className="font-body-sm text-body-sm text-on-surface-variant line-clamp-2 mb-space-md">
          {project.status === "ready"
            ? `Analysis completed. ${project.clips?.length || 0} high-retention hooks detected. Ready for final export.`
            : project.status === "error"
              ? project.error_message || "Analysis failed."
              : "AI hook detection and transcription in progress…"}
        </p>
      </div>
      <div className="flex items-center justify-between pt-space-sm bg-surface-container-lowest">
        <div className="flex items-center -space-x-2">
          {topScores.map((clip, i) => (
            <div
              key={clip.id}
              className={`w-7 h-7 rounded-full flex items-center justify-center font-label-sm text-[10px] font-bold shadow-sm ${
                i === 0
                  ? "bg-primary-container text-on-primary-container"
                  : i === 1
                    ? "bg-secondary-container text-on-secondary-container"
                    : "bg-tertiary-container text-on-tertiary-container"
              }`}
            >
              {clip.viral_score}
            </div>
          ))}
          {extra > 0 && <span className="pl-3 font-label-sm text-[11px] text-on-surface-variant">+{extra} more hooks</span>}
          {!topScores.length && <span className="pl-1 font-label-sm text-[11px] text-on-surface-variant">Scoring hooks…</span>}
        </div>
        <div className="flex items-center gap-space-xs">
          <button
            type="button"
            onClick={() => navigate(routeTo("editor", project.id))}
            className="px-space-md py-1.5 rounded-lg bg-primary-container text-on-primary-container font-body-sm text-body-sm font-semibold hover:bg-primary transition-colors flex items-center gap-1 shadow-sm disabled:opacity-60"
            disabled={analyzing || busy[`demo_${project.id}`]}
          >
            <span>{exported > 0 ? "Resume Editing" : "Open Project"}</span>
            <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { projects, settings, createDemo, ingestYoutube, uploadVideo, busy, health } = useStudio();
  const [tab, setTab] = useState("tab-youtube");
  const [ytUrl, setYtUrl] = useState("");
  const [showTranscript, setShowTranscript] = useState(false);
  const [ytTranscript, setYtTranscript] = useState("");
  const [file, setFile] = useState(null);
  const [subtitleFile, setSubtitleFile] = useState(null);
  const [projectTitle, setProjectTitle] = useState("");
  const [subtitleSource, setSubtitleSource] = useState("whisper");
  const [view, setView] = useState("grid");

  const recent = [...projects].sort((a, b) => b.created_at - a.created_at).slice(0, 4);

  const onFindClips = () => {
    const url = ytUrl.trim();
    if (!url) return;
    ingestYoutube(url, showTranscript ? ytTranscript : "");
  };

  const onUpload = () => {
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    if (projectTitle.trim()) fd.append("title", projectTitle.trim());
    if (subtitleSource === "attach" && subtitleFile) fd.append("subtitle_file", subtitleFile);
    if (subtitleSource === "skip") fd.append("skip_transcription", "true");
    uploadVideo(fd);
  };

  const aiLabel =
    settings?.ai_provider === "local_free"
      ? `Whisper ${(settings?.whisper_model || "tiny").toUpperCase()} + Heuristic Scorer`
      : `${settings?.ai_provider?.toUpperCase()} + Whisper Base`;

  return (
    <div className="flex flex-col w-full">
      <div className="relative w-full overflow-hidden px-margin lg:px-margin-lg py-margin lg:py-margin-lg">
        <div className="absolute top-0 right-1/4 w-96 h-96 bg-primary-container/5 rounded-full blur-3xl pointer-events-none -z-10" />
        <div className="absolute top-32 left-10 w-80 h-80 bg-secondary/5 rounded-full blur-3xl pointer-events-none -z-10" />

        {/* HERO */}
        <div className="flex flex-col items-center text-center max-w-4xl mx-auto mb-space-xl">
          <div className="inline-flex items-center gap-space-xs px-space-md py-1 rounded-full bg-surface-container-low shadow-sm mb-space-md">
            <span className="w-2 h-2 rounded-full bg-tertiary-container animate-pulse" />
            <span className="font-label-sm text-label-sm text-on-surface-variant font-medium tracking-wide">
              ✦ 100% Free • Local Whisper AI + Groq / Gemini Acceleration
            </span>
            <span className="px-1.5 py-0.5 rounded-full bg-tertiary-fixed text-on-tertiary-fixed font-label-sm text-[9px] uppercase font-bold tracking-wider">
              Zero Setup
            </span>
          </div>
          <h1 className="font-display-lg text-display-lg text-on-surface tracking-tight mb-space-sm selection:bg-primary-fixed">
            Turn 1 long video into <span className="italic font-normal text-primary-container">scroll-stopping</span> 9:16 shorts
          </h1>
          <p className="font-body-lg text-body-lg text-on-surface-variant max-w-2xl leading-relaxed">
            AI viral hook scoring, smart 9:16 reframing &amp; split-screen face tracking, dynamic word-by-word animated
            captions, and instantaneous 1080p MP4 exports.
          </p>
          <div className="flex items-center justify-center gap-space-lg mt-space-md pt-space-xs text-on-surface-variant">
            <div className="flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[16px] text-tertiary-container">verified</span>
              <span className="font-label-sm text-label-sm tracking-wide uppercase">No Watermark</span>
            </div>
            <div className="w-1 h-1 rounded-full bg-outline-variant" />
            <div className="flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[16px] text-primary-container">offline_bolt</span>
              <span className="font-label-sm text-label-sm tracking-wide uppercase">On-Device Whisper</span>
            </div>
            <div className="w-1 h-1 rounded-full bg-outline-variant" />
            <div className="flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[16px] text-secondary">aspect_ratio</span>
              <span className="font-label-sm text-label-sm tracking-wide uppercase">Hormozi &amp; Beast Styles</span>
            </div>
          </div>
        </div>

        {/* INGEST WORKBENCH */}
        <div className="max-w-5xl mx-auto w-full mb-space-xl">
          <div className="bg-surface-container-lowest rounded-xl shadow-xl overflow-hidden">
            <div className="flex items-center justify-between px-space-md pt-space-md bg-surface-container-low/60">
              <div className="flex items-center gap-space-xs" role="tablist">
                {[
                  { id: "tab-youtube", label: "YouTube Link", icon: "play_circle", iconClass: "text-error", fast: true },
                  { id: "tab-upload", label: "Upload Video", icon: "cloud_upload", iconClass: "text-primary-container" },
                  { id: "tab-demos", label: "Instant Studio Demos", icon: "auto_videocam", iconClass: "text-secondary" },
                ].map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    role="tab"
                    aria-selected={tab === t.id}
                    onClick={() => setTab(t.id)}
                    className={`flex items-center gap-space-xs px-space-md py-space-sm rounded-t-lg font-body-sm text-body-sm transition-all ${
                      tab === t.id
                        ? "bg-surface-container-lowest text-on-surface font-semibold shadow-sm"
                        : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high"
                    }`}
                  >
                    <span className={`material-symbols-outlined text-[18px] ${t.iconClass}`}>{t.icon}</span>
                    <span>{t.label}</span>
                    {t.fast && (
                      <span className="ml-1 px-1.5 py-0.5 bg-error-container text-on-error-container rounded-full font-label-sm text-[10px]">
                        Fast
                      </span>
                    )}
                  </button>
                ))}
              </div>
              <div className="hidden sm:flex items-center gap-space-xs pb-space-xs">
                <span className="font-label-sm text-label-sm text-on-surface-variant">Audio Engine:</span>
                <span className="font-label-sm text-label-sm font-semibold text-on-surface px-2 py-0.5 rounded bg-surface-container-high">
                  {aiLabel}
                </span>
              </div>
            </div>

            {/* YouTube panel */}
            {tab === "tab-youtube" && (
              <div className="p-space-md lg:p-space-lg flex flex-col gap-space-lg">
                <div className="flex flex-col gap-space-xs">
                  <label className="font-body-md text-body-md font-medium text-on-surface flex items-center justify-between" htmlFor="youtube-url">
                    <span>Paste a YouTube video, podcast, or livestream URL</span>
                    <span className="font-label-sm text-label-sm text-on-surface-variant">Max length: 3h 30m</span>
                  </label>
                  <div className="relative flex flex-col sm:flex-row items-stretch gap-space-xs bg-surface-container-low p-1.5 rounded-lg shadow-inner">
                    <div className="relative flex-1 flex items-center">
                      <span className="material-symbols-outlined absolute left-space-md text-on-surface-variant text-[20px]">link</span>
                      <input
                        className="w-full pl-11 pr-space-md py-3.5 bg-surface-container-lowest rounded-lg font-body-md text-body-md text-on-surface placeholder:text-on-surface-variant shadow-sm"
                        id="youtube-url"
                        placeholder="https://www.youtube.com/watch?v=... or youtu.be/dQw4w9WgXcQ"
                        type="url"
                        value={ytUrl}
                        onChange={(e) => setYtUrl(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && onFindClips()}
                      />
                    </div>
                    <button
                      className="px-space-lg py-3.5 rounded-lg bg-primary-container text-on-primary-container font-body-md text-body-md font-semibold hover:bg-primary transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-space-xs whitespace-nowrap active:translate-y-0.5 disabled:opacity-70"
                      id="btn-find-clips"
                      type="button"
                      onClick={onFindClips}
                      disabled={busy.youtube}
                    >
                      <span className="material-symbols-outlined text-[20px]">
                        {busy.youtube ? "progress_activity" : "magic_button"}
                      </span>
                      <span>{busy.youtube ? "Analyzing Audio..." : "Find Viral Clips"}</span>
                    </button>
                  </div>
                </div>

                {/* transcript override */}
                <div className="flex flex-col rounded-lg bg-surface-container-low/50 overflow-hidden">
                  <button
                    className="w-full px-space-md py-space-sm flex items-center justify-between text-left text-on-surface-variant hover:text-on-surface transition-colors"
                    type="button"
                    onClick={() => setShowTranscript((v) => !v)}
                  >
                    <div className="flex items-center gap-space-xs">
                      <span className="material-symbols-outlined text-[18px]">{showTranscript ? "expand_more" : "chevron_right"}</span>
                      <span className="font-label-md text-label-md uppercase tracking-wider font-semibold">
                        Optional: Paste transcript if the YouTube video has captions disabled
                      </span>
                    </div>
                    <span className="font-label-sm text-label-sm text-on-surface-variant">Supports .SRT, .VTT or plain text</span>
                  </button>
                  {showTranscript && (
                    <div className="px-space-md pb-space-md pt-space-xs">
                      <textarea
                        className="w-full p-space-sm rounded bg-surface-container-lowest font-label-sm text-label-sm text-on-surface placeholder:text-on-surface-variant shadow-inner resize-y"
                        placeholder="Paste timestamps and spoken text here (e.g. 00:00:15 Look, here is the secret to scaling customer acquisition...)"
                        rows={3}
                        value={ytTranscript}
                        onChange={(e) => setYtTranscript(e.target.value)}
                      />
                      <div className="flex items-center justify-between mt-space-xs">
                        <span className="font-label-sm text-label-sm text-on-surface-variant">
                          AI will align timestamps automatically with speech waveform.
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* quick demo banner */}
                <div className="flex items-center justify-between p-space-sm px-space-md rounded-lg bg-surface-container-low">
                  <div className="flex items-center gap-space-xs">
                    <span className="material-symbols-outlined text-primary-container text-[20px]">bolt</span>
                    <span className="font-body-sm text-body-sm text-on-surface">
                      Want to test the 9:16 studio, Hormozi captions &amp; MP4 export right away without waiting?
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => createDemo("podcast_creators")}
                    disabled={busy.demo_podcast_creators}
                    className="font-body-sm text-body-sm font-semibold text-primary-container hover:text-primary transition-colors flex items-center gap-1 group"
                  >
                    <span>Launch 1-Click Podcast Demo</span>
                    <span className="material-symbols-outlined text-[16px] group-hover:translate-x-1 transition-transform">
                      arrow_forward
                    </span>
                  </button>
                </div>

                {/* dual demo cards */}
                <div className="flex flex-col gap-space-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-label-md text-label-md uppercase tracking-widest text-on-surface-variant font-semibold">
                      Pre-Engineered Instant Workspaces
                    </span>
                    <span className="font-label-sm text-label-sm text-on-surface-variant">Preloaded with hooks, faces &amp; captions</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-gutter">
                    {DEMO_CARDS.map((card) => (
                      <div
                        key={card.key}
                        className="group relative bg-surface-container-low hover:bg-surface-container-lowest p-space-md rounded-lg shadow-sm hover:shadow-md transition-all flex flex-col justify-between"
                      >
                        <div>
                          <div className="relative w-full h-44 rounded overflow-hidden mb-space-sm bg-surface-dim">
                            <img
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                              src={card.art}
                              alt={card.title}
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-inverse-surface/80 via-transparent to-transparent" />
                            <div className="absolute top-2 left-2">
                              <span className="px-2 py-0.5 rounded bg-surface-container-lowest/90 backdrop-blur-md text-on-surface font-label-sm text-label-sm font-semibold">
                                {card.badge}
                              </span>
                            </div>
                            <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between text-inverse-on-surface">
                              <span className="font-label-sm text-label-sm flex items-center gap-1">
                                <span className="material-symbols-outlined text-[14px] text-tertiary-fixed">smart_display</span>
                                {card.overlay}
                              </span>
                              <span className={`font-label-sm text-label-sm px-1.5 py-0.5 rounded font-bold ${card.scoreClass}`}>
                                Score {card.score}/100
                              </span>
                            </div>
                          </div>
                          <h4 className="font-headline-sm text-headline-sm text-on-surface font-semibold mb-1 group-hover:text-primary-container transition-colors">
                            {card.title}
                          </h4>
                          <p className="font-body-sm text-body-sm text-on-surface-variant mb-space-md">{card.desc}</p>
                        </div>
                        <div className="flex items-center justify-between pt-space-xs">
                          <div className="flex items-center gap-space-xs text-on-surface-variant font-label-sm text-label-sm">
                            <span className="material-symbols-outlined text-[16px]">{card.metaIcon}</span>
                            <span>{card.meta}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => createDemo(card.key)}
                            disabled={busy[`demo_${card.key}`]}
                            className="px-space-md py-1.5 rounded-lg bg-surface-container-highest text-on-surface font-body-sm text-body-sm font-semibold group-hover:bg-primary-container group-hover:text-on-primary-container transition-all flex items-center gap-1 disabled:opacity-60"
                          >
                            <span>{busy[`demo_${card.key}`] ? "Preparing…" : card.cta}</span>
                            <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Upload panel */}
            {tab === "tab-upload" && (
              <div className="p-space-md lg:p-space-lg flex flex-col gap-space-lg">
                <div className="flex flex-col gap-space-md">
                  <label className="relative group cursor-pointer p-space-xl rounded-xl bg-surface-container-low hover:bg-surface-container transition-all flex flex-col items-center justify-center text-center">
                    <input
                      accept="video/mp4,video/quicktime,video/webm,video/x-matroska"
                      className="absolute inset-0 opacity-0 cursor-pointer z-10"
                      type="file"
                      onChange={(e) => setFile(e.target.files?.[0] || null)}
                    />
                    <div className="w-16 h-16 rounded-full bg-surface-container-lowest shadow-md flex items-center justify-center mb-space-md text-primary-container group-hover:scale-110 transition-transform">
                      <span className="material-symbols-outlined text-[32px]">upload_file</span>
                    </div>
                    <h3 className="font-headline-sm text-headline-sm text-on-surface font-semibold mb-1">
                      {file ? file.name : "Drop or select long-form video"}
                    </h3>
                    <p className="font-body-md text-body-md text-on-surface-variant max-w-sm mb-space-md">
                      Supports MP4, MOV, WebM, MKV, M4V up to {settings ? "the configured limit" : "4GB"}. Processed locally with FFmpeg.
                    </p>
                    <div className="flex items-center gap-space-sm">
                      <span className="px-space-md py-2 rounded-lg bg-primary-container text-on-primary-container font-body-sm text-body-sm font-semibold shadow-sm">
                        Browse Files
                      </span>
                      <span className="font-label-sm text-label-sm text-on-surface-variant">or press ⌘U</span>
                    </div>
                  </label>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-gutter">
                    <div className="flex flex-col gap-1.5">
                      <label className="font-body-sm text-body-sm font-medium text-on-surface">Project Title (Optional)</label>
                      <input
                        className="px-space-md py-2.5 rounded bg-surface-container-low text-on-surface font-body-sm text-body-sm"
                        placeholder="e.g. Masterclass Q3 Keynote Recording"
                        type="text"
                        value={projectTitle}
                        onChange={(e) => setProjectTitle(e.target.value)}
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="font-body-sm text-body-sm font-medium text-on-surface">Subtitle Source</label>
                      <select
                        className="px-space-md py-2.5 rounded bg-surface-container-low text-on-surface font-body-sm text-body-sm"
                        value={subtitleSource}
                        onChange={(e) => setSubtitleSource(e.target.value)}
                      >
                        <option value="whisper">Free Local Whisper AI (on-device)</option>
                        <option value="attach">Attach custom .SRT or .VTT file</option>
                        <option value="skip">Skip speech-to-text</option>
                      </select>
                      {subtitleSource === "attach" && (
                        <input
                          accept=".srt,.vtt"
                          className="font-label-sm text-label-sm text-on-surface-variant"
                          type="file"
                          onChange={(e) => setSubtitleFile(e.target.files?.[0] || null)}
                        />
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={onUpload}
                    disabled={!file || busy.upload}
                    className="self-end px-space-lg py-2.5 rounded-lg bg-primary-container text-on-primary-container font-body-md text-body-md font-semibold hover:bg-primary transition-all shadow-md flex items-center gap-space-xs disabled:opacity-60"
                  >
                    <span className="material-symbols-outlined text-[20px]">
                      {busy.upload ? "progress_activity" : "magic_button"}
                    </span>
                    <span>{busy.upload ? "Ingesting & Analyzing..." : "Find Viral Clips"}</span>
                  </button>
                </div>
              </div>
            )}

            {/* Demos panel */}
            {tab === "tab-demos" && (
              <div className="p-space-md lg:p-space-lg flex flex-col gap-space-md">
                <div className="text-center max-w-lg mx-auto mb-space-sm">
                  <h3 className="font-headline-sm text-headline-sm text-on-surface font-semibold mb-1">Production Sandboxes</h3>
                  <p className="font-body-sm text-body-sm text-on-surface-variant">
                    Explore pre-analyzed videos ready for immediate export, timeline scrubbing, and hook testing.
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-gutter">
                  {SANDBOX_TILES.map((tile) => (
                    <button
                      key={tile.key}
                      type="button"
                      onClick={() => createDemo(tile.key)}
                      disabled={busy[`demo_${tile.key}`]}
                      className="bg-surface-container-low p-space-sm rounded-lg flex flex-col gap-2 hover:bg-surface-container transition-all cursor-pointer text-left disabled:opacity-60"
                    >
                      <div className="h-28 rounded bg-surface-dim overflow-hidden relative">
                        <img className="w-full h-full object-cover" src={tile.art} alt={tile.title} />
                        <span className="absolute bottom-1 right-1 font-label-sm text-[9px] bg-inverse-surface/80 text-inverse-on-surface px-1 rounded">
                          {tile.tag}
                        </span>
                      </div>
                      <span className="font-body-sm text-body-sm font-semibold text-on-surface">{tile.title}</span>
                      <span className="font-label-sm text-label-sm text-on-surface-variant">
                        {busy[`demo_${tile.key}`] ? "Preparing sandbox…" : tile.meta}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* RECENT PROJECTS */}
        <div className="max-w-5xl mx-auto w-full mb-space-xl">
          <div className="flex items-center justify-between mb-space-md">
            <div className="flex items-center gap-space-sm">
              <h2 className="font-headline-md text-headline-md text-on-surface font-semibold">Recent Studio Projects</h2>
              <span className="px-2 py-0.5 rounded-full bg-surface-container-high text-on-surface font-label-sm text-label-sm font-semibold">
                {projects.filter((pr) => !pr.archived).length} active
              </span>
            </div>
            <div className="flex items-center gap-space-xs">
              <button
                type="button"
                onClick={() => setView("list")}
                className={`p-1 rounded transition-colors ${view === "list" ? "text-primary-container bg-surface-container-high" : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high"}`}
                title="List view"
              >
                <span className="material-symbols-outlined text-[20px]">view_list</span>
              </button>
              <button
                type="button"
                onClick={() => setView("grid")}
                className={`p-1 rounded transition-colors ${view === "grid" ? "text-primary-container bg-surface-container-high" : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high"}`}
                title="Grid view"
              >
                <span className="material-symbols-outlined text-[20px]">grid_view</span>
              </button>
            </div>
          </div>
          {recent.length ? (
            <div className={`gap-gutter ${view === "grid" ? "grid grid-cols-1 md:grid-cols-2" : "flex flex-col"}`}>
              {recent.map((p) => (
                <ProjectCard key={p.id} project={p} />
              ))}
            </div>
          ) : (
            <div className="bg-surface-container-lowest rounded-xl shadow-md p-space-lg text-center">
              <p className="font-body-md text-body-md text-on-surface-variant">
                No projects yet — paste a YouTube link or launch an instant demo above.
              </p>
            </div>
          )}
        </div>

        {/* PIPELINE BENTO */}
        <div className="max-w-5xl mx-auto w-full mb-space-lg">
          <div className="bg-surface-container-low rounded-xl p-space-lg shadow-sm">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-space-md mb-space-md">
              <div>
                <span className="font-label-sm text-label-sm uppercase tracking-wider text-primary-container font-semibold">
                  How ClipPulse Engine Works
                </span>
                <h3 className="font-headline-sm text-headline-sm text-on-surface font-semibold">Automated 4-Step Viral Pipeline</h3>
              </div>
              <div className="flex items-center gap-space-xs text-on-surface-variant font-label-sm text-label-sm">
                <span className="material-symbols-outlined text-[16px] text-tertiary-container">lock</span>
                <span>
                  {health?.capabilities?.video_pipeline_ready
                    ? "Zero cloud file storage • 100% local processing"
                    : "FFmpeg not detected • install it to enable exports"}
                </span>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-gutter">
              {[
                {
                  n: "01",
                  ring: "bg-primary-fixed",
                  text: "text-on-primary-fixed",
                  title: "Whisper AI Speech",
                  desc: "Extracts high-fidelity word timestamps without sending media to external servers.",
                },
                {
                  n: "02",
                  ring: "bg-secondary-fixed",
                  text: "text-on-secondary-fixed",
                  title: "Hook Detection",
                  desc: "Gemini & Groq evaluate narrative velocity, curiosity gaps, and payoff density.",
                },
                {
                  n: "03",
                  ring: "bg-tertiary-fixed",
                  text: "text-on-tertiary-fixed",
                  title: "Face & Safe Framing",
                  desc: "Dynamic auto-crop tracks active speakers while dodging TikTok & Reels UI overlays.",
                },
                {
                  n: "04",
                  ring: "bg-surface-container-highest",
                  text: "text-on-surface",
                  title: "1080p MP4 Export",
                  desc: "FFmpeg + libass renders finished 9:16 vertical video with animated captions.",
                },
              ].map((step) => (
                <div key={step.n} className="p-space-md bg-surface-container-lowest rounded-lg shadow-sm flex flex-col gap-space-xs">
                  <div className={`w-8 h-8 rounded-full ${step.ring} ${step.text} flex items-center justify-center font-label-sm font-bold`}>
                    {step.n}
                  </div>
                  <span className="font-body-md text-body-md font-semibold text-on-surface">{step.title}</span>
                  <p className="font-body-sm text-body-sm text-on-surface-variant">{step.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
