import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useStudio, routeTo } from "../studio.jsx";
import { fmtTC, clamp } from "../utils/format.js";
import { collectClipWords } from "../components/CaptionTrack.jsx";
import CaptionTrack from "../components/CaptionTrack.jsx";
import Waveform from "../components/Waveform.jsx";

const LAYOUTS = [
  { key: "center_crop", label: "Smart 9:16", icon: "crop_free" },
  { key: "blur_fill", label: "Blur-Fill", icon: "blur_on" },
  { key: "split_screen", label: "Split Screen", icon: "vertical_split" },
];

const CAPTION_STYLES = [
  { key: "hormozi", label: "Hormozi Pop", tag: "WORD POP", tagClass: "bg-primary-container text-on-primary-container", hint: "Gold Box" },
  { key: "beast", label: "Beast Clean", tag: "CRISP CYAN", tagClass: "bg-tertiary-fixed text-on-tertiary-fixed", hint: "Shadowed" },
  { key: "minimal", label: "Minimal Pill", tag: "SOFT VIOLET", tagClass: "bg-secondary-fixed text-on-secondary-fixed-variant", hint: "Pill" },
  { key: "neon", label: "Neon Creator", tag: "NEON POP", tagClass: "bg-surface-container-highest text-on-surface", hint: "Glow" },
  { key: "off", label: "Captions Off", tag: "CLEAN", tagClass: "bg-surface-container text-on-surface-variant", hint: "None" },
];

const RESOLUTIONS = [
  { label: "1080x1920 • Full HD (60fps HQ)", value: "1080x1920" },
  { label: "720x1280 • Optimized Social", value: "720x1280" },
  { label: "4K 2160x3840 • Ultra Studio", value: "1440x2560" },
];

export default function Editor() {
  const {
    route,
    navigate,
    projects,
    updateClip,
    createClip,
    deleteClip,
    reanalyze,
    exportClip,
    busy,
    toast,
  } = useStudio();

  const projectId = route.projectId || projects.find((p) => !p.archived)?.id || projects[0]?.id || null;
  const project = projects.find((p) => p.id === projectId) || null;
  const clips = useMemo(() => [...(project?.clips || [])].sort((a, b) => a.start - b.start), [project]);
  const clip = clips.find((c) => c.id === route.clipId) || clips[0] || null;

  const [safeZone, setSafeZone] = useState("clean");
  const [inspectorTab, setInspectorTab] = useState("style");
  const [playing, setPlaying] = useState(false);
  const [loop, setLoop] = useState(true);
  const [muted, setMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(clip?.start || 0);
  const [resolution, setResolution] = useState("1080x1920");
  const videoRef = useRef(null);
  const trimTimer = useRef(null);

  // Sync playhead when the selected clip changes
  useEffect(() => {
    if (!clip) return;
    setCurrentTime(clip.start);
    const v = videoRef.current;
    if (v) v.currentTime = clip.start;
    setPlaying(false);
  }, [clip?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Playback confined to the clip range
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !clip) return undefined;
    const onTime = () => {
      const t = v.currentTime;
      setCurrentTime(t);
      if (t >= clip.end - 0.05) {
        if (loop) {
          v.currentTime = clip.start;
        } else {
          v.pause();
          setPlaying(false);
        }
      }
      if (t < clip.start - 0.4) v.currentTime = clip.start;
    };
    v.addEventListener("timeupdate", onTime);
    return () => v.removeEventListener("timeupdate", onTime);
  }, [clip?.id, clip?.start, clip?.end, loop]); // eslint-disable-line react-hooks/exhaustive-deps

  const togglePlay = useCallback(() => {
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
  }, [clip]);

  const seek = useCallback(
    (t) => {
      const v = videoRef.current;
      const clamped = clamp(t, clip?.start ?? 0, clip?.end ?? t);
      setCurrentTime(clamped);
      if (v) v.currentTime = clamped;
    },
    [clip]
  );

  const patchStyle = (patch) => {
    if (!clip) return;
    updateClip(project.id, clip.id, { style: { ...clip.style, ...patch } }, { silent: true });
  };

  const patchMeta = (patch) => {
    if (!clip) return;
    updateClip(project.id, clip.id, { platform_meta: { ...clip.platform_meta, ...patch } }, { silent: true });
  };

  const queueTrim = (start, end) => {
    setCurrentTime((t) => clamp(t, start, end));
    clearTimeout(trimTimer.current);
    trimTimer.current = setTimeout(() => {
      updateClip(project.id, clip.id, { start, end }, { silent: true });
    }, 450);
  };

  const onExport = async () => {
    if (!clip) return;
    if (resolution === "720x1280") {
      toast("720p is automatically upgraded to the 1080p studio floor.", "info");
    } else if (resolution === "1440x2560" && clip.style.resolution !== "1440x2560") {
      await updateClip(project.id, clip.id, { style: { ...clip.style, resolution: "1440x2560" } }, { silent: true });
    } else if (resolution === "1080x1920" && clip.style.resolution !== "1080x1920") {
      await updateClip(project.id, clip.id, { style: { ...clip.style, resolution: "1080x1920" } }, { silent: true });
    }
    exportClip(project.id, clip.id);
  };

  const onCustomClip = async () => {
    const duration = project?.duration || 30;
    const start = clamp(currentTime, 0, Math.max(0, duration - 2));
    const end = clamp(start + 15, start + 1.5, duration);
    const proj = await createClip(project.id, { title: "Custom Viral Clip", start, end });
    const created = proj?.clips?.slice().sort((a, b) => b.id.localeCompare(a.id))[0];
    if (created) navigate(routeTo("editor", project.id, created.id));
  };

  if (!project) {
    return (
      <div className="flex items-center justify-center h-[70vh]">
        <div className="bg-surface-container-lowest p-space-lg rounded-xl shadow-md text-center max-w-md">
          <h2 className="font-headline-md text-headline-md text-on-surface mb-space-sm">No studio project open</h2>
          <p className="font-body-md text-body-md text-on-surface-variant mb-space-md">
            Ingest a video or launch an instant demo to open the 9:16 editor workspace.
          </p>
          <button
            type="button"
            onClick={() => navigate(routeTo("dashboard"))}
            className="px-space-lg py-2 rounded-lg bg-primary-container text-on-primary-container font-body-sm text-body-sm font-semibold hover:bg-primary transition-colors"
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const words = collectClipWords(project, clip);
  const activeIdx = clip ? clips.findIndex((c) => c.id === clip.id) + 1 : 0;
  const exporting = clip?.export_status === "rendering";
  const exported = clip?.export_status === "done";
  const topReasons = (clip?.reason || "").split(/[.;]\s+/).filter(Boolean).slice(0, 2);

  return (
    <div className="flex flex-col w-full">
      {/* Breadcrumb sub-header */}
      <div className="px-margin py-3 bg-surface-container-lowest flex items-center justify-between shadow-[0_1px_4px_rgba(15,23,42,0.03)] z-20">
        <div className="flex items-center gap-space-md min-w-0">
          <div className="flex items-center gap-2 text-on-surface-variant font-label-md text-label-md">
            <button type="button" onClick={() => navigate(routeTo("projects"))} className="hover:text-primary transition-colors flex items-center gap-1">
              <span className="material-symbols-outlined text-[16px]">folder</span>
              <span>Projects</span>
            </button>
            <span className="text-outline-variant font-body-sm">/</span>
            <span className="font-headline-sm text-headline-sm text-on-surface truncate font-semibold">{project.title}</span>
          </div>
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-surface-container font-label-sm text-label-sm text-on-surface-variant font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-primary-container" />
            <span>{clips.length} Viral Cuts Generated</span>
          </div>
        </div>
        <div className="flex items-center gap-space-md">
          <div className="flex items-center gap-2 px-3 py-1 bg-surface-container-low rounded-lg font-label-md text-label-md text-on-surface-variant">
            <span>Master Reel:</span>
            <span className="font-semibold text-on-surface">{fmtTC(project.duration)}</span>
            <span className="text-outline-variant">•</span>
            <span className="text-tertiary font-semibold">{project.width >= 1440 ? "1440p" : "1080p"} source</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container transition-colors"
              title="Re-analyze transcript"
              onClick={() => reanalyze(project.id)}
            >
              <span className="material-symbols-outlined text-[18px]">history</span>
            </button>
            <button
              type="button"
              className="p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container transition-colors"
              title="Delete clip"
              onClick={() => {
                if (clip && window.confirm("Delete this clip?")) {
                  deleteClip(project.id, clip.id).then(() => navigate(routeTo("editor", project.id)));
                }
              }}
            >
              <span className="material-symbols-outlined text-[18px]">delete_sweep</span>
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-0 min-h-[calc(100vh-112px)] bg-surface">
        {/* LEFT: clips drawer */}
        <aside className="col-span-12 xl:col-span-3 bg-surface-container-low p-margin-sm flex flex-col gap-space-md shadow-[inset_-1px_0_0_rgba(15,23,42,0.04)]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-label-lg text-label-lg font-semibold tracking-wider text-on-surface uppercase">VIRAL CLIPS</span>
              <span className="px-2 py-0.5 bg-surface-container-highest text-primary-container font-label-sm text-label-sm font-semibold rounded-full">
                {clips.length}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => reanalyze(project.id)}
                className="p-1 rounded hover:bg-surface-container text-on-surface-variant transition-colors"
                title="Re-analyze Transcript"
              >
                <span className="material-symbols-outlined text-[18px]">refresh</span>
              </button>
              <button
                type="button"
                onClick={onCustomClip}
                className="px-2 py-1 bg-surface-container-lowest text-on-surface font-label-sm text-label-sm font-semibold rounded-lg shadow-sm hover:bg-surface-container transition-all flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-[14px]">add</span>
                <span>Custom</span>
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-space-sm overflow-y-auto pr-1">
            {clips.map((c, i) => {
              const active = clip && c.id === clip.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => navigate(routeTo("editor", project.id, c.id))}
                  className={`text-left rounded-xl shadow-sm hover:shadow-md transition-all cursor-pointer flex flex-col gap-2 group ${
                    active
                      ? "bg-surface-container-lowest p-space-sm ring-2 ring-primary-container relative bg-gradient-to-b from-surface-container-lowest to-surface-container-low/40"
                      : "bg-surface-container-lowest p-space-sm"
                  }`}
                >
                  {active && (
                    <span className="absolute -top-2 right-4 px-2 py-0.5 bg-primary-container text-on-primary-container font-label-sm text-label-sm font-semibold rounded-full uppercase tracking-wider shadow-sm flex items-center gap-1">
                      <span className="material-symbols-outlined text-[12px]">play_arrow</span> ACTIVE CUT
                    </span>
                  )}
                  <div className={`flex items-center justify-between ${active ? "pt-1" : ""}`}>
                    <div className="flex items-center gap-1.5">
                      <span className={`font-label-sm text-label-sm font-semibold ${active ? "font-bold text-primary-container" : "text-primary"}`}>
                        #{i + 1}
                      </span>
                      <span
                        className={`px-1.5 py-0.5 rounded font-label-sm text-label-sm font-medium ${
                          active ? "bg-primary-fixed text-on-primary-fixed-variant font-semibold" : "bg-surface-container text-on-surface-variant"
                        }`}
                      >
                        {(c.end - c.start).toFixed(1)}s
                      </span>
                    </div>
                    <div
                      className={`flex items-center gap-1 px-2 py-0.5 rounded-full font-label-sm text-label-sm ${
                        active
                          ? "bg-primary-container text-on-primary-container font-bold shadow-sm"
                          : "bg-surface-container text-on-surface font-semibold"
                      }`}
                    >
                      <span className="material-symbols-outlined text-[14px]">
                        {active ? "local_fire_department" : "bolt"}
                      </span>
                      <span>{c.viral_score} Viral</span>
                    </div>
                  </div>
                  {active ? (
                    <div className="flex flex-col gap-1">
                      <span className="font-headline-sm text-body-lg font-semibold text-on-surface leading-tight">
                        {c.title}
                      </span>
                      <span className="font-label-sm text-label-sm text-on-surface-variant">
                        Timecode: {fmtTC(c.start)} → {fmtTC(c.end)}
                      </span>
                    </div>
                  ) : (
                    <>
                      <p className="font-body-sm text-body-sm text-on-surface font-medium line-clamp-2">{c.title}</p>
                      <div className="flex items-center justify-between font-label-sm text-label-sm text-on-surface-variant">
                        <span>
                          TC {fmtTC(c.start)} → {fmtTC(c.end)}
                        </span>
                        <span className="text-tertiary font-semibold flex items-center gap-0.5">
                          <span className="material-symbols-outlined text-[14px]">trending_up</span>
                          {c.export_status === "done" ? "Exported" : "Good Pacing"}
                        </span>
                      </div>
                    </>
                  )}

                  {active && (
                    <>
                      <div className="grid grid-cols-4 gap-1 p-2 bg-surface-container rounded-lg">
                        {[
                          ["Hook", c.sub_scores.hook],
                          ["Retain", c.sub_scores.retention],
                          ["Share", c.sub_scores.shareability],
                          ["Clarity", c.sub_scores.clarity],
                        ].map(([label, val]) => (
                          <div key={label} className="flex flex-col items-center">
                            <span className="font-label-sm text-[10px] text-on-surface-variant uppercase font-medium">{label}</span>
                            <span className="font-label-lg text-label-lg font-bold text-on-surface">{val}</span>
                          </div>
                        ))}
                      </div>
                      {topReasons.length > 0 && (
                        <div className="flex flex-col gap-1.5 pt-1">
                          {topReasons.map((r, ri) => (
                            <div key={ri} className="flex items-start gap-1.5 text-on-surface-variant">
                              <span className={`material-symbols-outlined text-[16px] mt-0.5 ${ri === 0 ? "text-tertiary" : "text-primary"}`}>
                                {ri === 0 ? "verified" : "electric_bolt"}
                              </span>
                              <span className="font-body-sm text-[12px] leading-tight font-medium text-on-surface">{r}.</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </button>
              );
            })}
            {!clips.length && (
              <div className="bg-surface-container-lowest p-space-md rounded-xl text-on-surface-variant font-body-sm text-body-sm">
                No clips yet. Re-analyze the transcript to detect viral moments.
              </div>
            )}
          </div>
        </aside>

        {/* CENTER: monitor + transport */}
        <main className="col-span-12 xl:col-span-6 p-space-md flex flex-col justify-between gap-space-md bg-surface">
          <div className="flex items-center justify-between bg-surface-container-lowest p-2 rounded-xl shadow-sm">
            <div className="flex items-center gap-1 text-on-surface-variant font-label-sm text-label-sm font-medium">
              <span className="material-symbols-outlined text-[18px]">aspect_ratio</span>
              <span className="uppercase">Safe Zone Overlays:</span>
            </div>
            <div className="flex items-center gap-1 bg-surface-container-low p-1 rounded-lg">
              {["clean", "shorts", "reels", "tiktok"].map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setSafeZone(mode)}
                  className={`px-2.5 py-1 rounded font-label-sm text-label-sm transition-all ${
                    safeZone === mode
                      ? "bg-surface-container-lowest text-on-surface font-semibold shadow-sm"
                      : "text-on-surface-variant hover:text-on-surface font-medium"
                  }`}
                >
                  {mode === "clean" ? "Clean" : mode === "shorts" ? "YT Shorts" : mode === "reels" ? "IG Reels" : "TikTok"}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <button type="button" className="p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-colors" title="Zoom Stage">
                <span className="material-symbols-outlined text-[18px]">fit_screen</span>
              </button>
              <button type="button" className="p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-colors" title="Snap to Grid">
                <span className="material-symbols-outlined text-[18px]">grid_goldenratio</span>
              </button>
            </div>
          </div>

          {/* Phone monitor */}
          <div className="flex justify-center items-center flex-1 py-1">
            <div className="relative w-[310px] h-[550px] bg-inverse-surface rounded-[38px] p-2.5 shadow-2xl flex flex-col justify-between overflow-hidden ring-4 ring-surface-container-highest">
              <div className="relative w-full h-full rounded-[30px] overflow-hidden bg-black flex flex-col justify-between">
                {clip?.style.layout === "blur_fill" ? (
                  <>
                    <div
                      className="absolute inset-0 bg-cover bg-center blur-lg scale-110 opacity-70"
                      style={{ backgroundImage: project.thumbnail_url ? `url(${project.thumbnail_url})` : undefined }}
                    />
                    <video
                      ref={videoRef}
                      className="relative w-full h-full object-contain"
                      src={project.video_url}
                      muted={muted}
                      playsInline
                      preload="metadata"
                    />
                  </>
                ) : clip?.style.layout === "split_screen" ? (
                  <div className="absolute inset-0 flex flex-col">
                    <video
                      ref={videoRef}
                      className="w-full h-1/2 object-cover"
                      src={project.video_url}
                      muted={muted}
                      playsInline
                      preload="metadata"
                      style={{ objectPosition: "center 25%" }}
                    />
                    <video
                      className="w-full h-1/2 object-cover pointer-events-none"
                      src={project.video_url}
                      muted
                      playsInline
                      preload="metadata"
                      style={{ objectPosition: "center 75%" }}
                    />
                  </div>
                ) : (
                  <video
                    ref={videoRef}
                    className="absolute inset-0 w-full h-full object-cover"
                    src={project.video_url}
                    muted={muted}
                    playsInline
                    preload="metadata"
                    style={{ objectPosition: `${50 + (clip?.style.pan_x || 0) * 35}% 50%` }}
                  />
                )}
                <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-black/60 pointer-events-none" />

                {/* safe zone guide */}
                {safeZone !== "clean" && (
                  <div className="absolute inset-0 pointer-events-none border-2 border-dashed border-white/25 m-6 rounded-2xl flex flex-col justify-between p-3 opacity-70">
                    <span className="font-label-sm text-[9px] text-white/60 tracking-wider">
                      {safeZone === "shorts" ? "YT SHORTS UI SAFE" : safeZone === "reels" ? "REELS UI SAFE" : "TIKTOK UI SAFE"}
                    </span>
                    <span className="font-label-sm text-[9px] text-white/60 tracking-wider text-right">ENGAGEMENT RAIL</span>
                  </div>
                )}

                {/* hook banner */}
                {clip?.style.show_hook_banner && clip?.style.hook_banner_text ? (
                  <div className="relative z-10 mx-3 mt-8 p-2.5 bg-surface-container-lowest/95 backdrop-blur-md rounded-xl shadow-lg border border-white/40 flex flex-col gap-0.5">
                    <div className="flex items-center justify-between">
                      <span className="px-1.5 py-0.5 rounded bg-primary-container text-on-primary-container font-label-sm text-[9px] font-bold tracking-widest uppercase">
                        VIRAL HOOK (0:00 - 0:03)
                      </span>
                      <span className="material-symbols-outlined text-primary-container text-[14px]">psychology</span>
                    </div>
                    <p className="font-headline-sm text-[12px] font-bold text-on-surface leading-tight tracking-tight uppercase">
                      {clip.style.hook_banner_text}
                    </p>
                  </div>
                ) : (
                  <div className="relative z-10 mx-3 mt-8" />
                )}

                {/* center play */}
                <div className="relative z-10 flex items-center justify-center my-auto">
                  <button
                    type="button"
                    onClick={togglePlay}
                    className="w-14 h-14 rounded-full bg-white/20 backdrop-blur-md hover:bg-white/30 text-white flex items-center justify-center transition-transform hover:scale-110 shadow-xl border border-white/40"
                  >
                    <span className="material-symbols-outlined text-[32px] ml-0.5">{playing ? "pause" : "play_arrow"}</span>
                  </button>
                </div>

                {/* captions */}
                {words.length > 0 ? (
                  <CaptionTrack project={project} clip={clip} currentTime={currentTime} style={clip?.style} />
                ) : (
                  <div className="relative z-10 mx-3 mb-10 flex justify-center">
                    <span className="px-2.5 py-1 rounded bg-black/60 font-label-sm text-label-sm text-white/80">
                      {clip?.style.caption_style === "off" ? "Captions disabled" : "No transcript words in range"}
                    </span>
                  </div>
                )}

                {/* timecode bar */}
                <div className="relative z-10 px-4 py-2 bg-gradient-to-t from-black/90 to-transparent flex items-center justify-between text-white font-label-sm text-label-sm">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-primary-container animate-ping" />
                    <span>{fmtTC(currentTime)}</span>
                  </div>
                  <span className="text-white/60">
                    Clip {String(activeIdx).padStart(2, "0")} of {String(clips.length).padStart(2, "0")}
                  </span>
                  <span>{(clip ? clip.end - clip.start : 0).toFixed(1)}s total</span>
                </div>
              </div>
            </div>
          </div>

          {/* scrubber + transport */}
          <div className="bg-surface-container-lowest p-space-sm rounded-xl shadow-sm flex flex-col gap-space-xs">
            <div className="flex items-center justify-between px-space-xs font-label-sm text-label-sm">
              <div className="flex items-center gap-space-sm">
                <span className="text-on-surface-variant">Selection:</span>
                <span className="font-bold text-primary-container">{fmtTC(clip?.start || 0)}</span>
                <span className="text-outline-variant">→</span>
                <span className="font-bold text-primary-container">{fmtTC(clip?.end || 0)}</span>
                <span className="px-1.5 py-0.5 rounded bg-surface-container text-on-surface font-semibold">
                  ({(clip ? clip.end - clip.start : 0).toFixed(1)}s)
                </span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => clip && queueTrim(Math.max(0, clip.start - 0.5), clip.end)}
                  className="px-2 py-0.5 rounded bg-surface-container-low text-on-surface-variant hover:text-on-surface font-label-sm text-label-sm font-medium transition-colors"
                >
                  -0.5s In
                </button>
                <button
                  type="button"
                  onClick={() => clip && queueTrim(clip.start, Math.min(project.duration, clip.end + 0.5))}
                  className="px-2 py-0.5 rounded bg-surface-container-low text-on-surface-variant hover:text-on-surface font-label-sm text-label-sm font-medium transition-colors"
                >
                  +0.5s Out
                </button>
              </div>
            </div>

            <Waveform
              energyPeaks={project.energy_peaks || []}
              duration={project.duration}
              start={clip?.start || 0}
              end={clip?.end || 0}
              currentTime={currentTime}
              onSeek={seek}
              onTrimStart={(t) => clip && queueTrim(Math.round(t * 10) / 10, clip.end)}
              onTrimEnd={(t) => clip && queueTrim(clip.start, Math.round(t * 10) / 10)}
            />

            <div className="flex items-center justify-between pt-1">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => seek(currentTime - 5)}
                  className="p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-colors"
                  title="Rewind 5s"
                >
                  <span className="material-symbols-outlined text-[20px]">replay_5</span>
                </button>
                <button
                  type="button"
                  onClick={togglePlay}
                  className="p-2 rounded-full bg-primary-container text-on-primary-container hover:bg-primary transition-transform hover:scale-105 shadow-sm"
                  title="Play / Pause"
                >
                  <span className="material-symbols-outlined text-[22px]">{playing ? "pause" : "play_arrow"}</span>
                </button>
                <button
                  type="button"
                  onClick={() => seek(currentTime + 5)}
                  className="p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-colors"
                  title="Forward 5s"
                >
                  <span className="material-symbols-outlined text-[20px]">forward_5</span>
                </button>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setMuted((m) => !m)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-surface-container-low text-on-surface font-label-sm text-label-sm hover:bg-surface-container transition-colors"
                >
                  <span className="material-symbols-outlined text-[16px]">{muted ? "volume_off" : "volume_up"}</span>
                  <span>{muted ? "0%" : "100%"}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setLoop((v) => !v)}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg font-label-sm text-label-sm font-semibold transition-colors ${
                    loop ? "bg-surface-container-low text-primary-container" : "bg-surface-container-low text-on-surface-variant"
                  }`}
                >
                  <span className="material-symbols-outlined text-[16px]">repeat</span>
                  <span>Loop Range</span>
                </button>
              </div>
            </div>
          </div>

          {/* export bar */}
          <div className="bg-surface-container-lowest p-space-sm rounded-xl shadow-sm flex items-center justify-between gap-space-md">
            <div className="flex items-center gap-space-sm">
              <span className="font-label-sm text-label-sm text-on-surface-variant uppercase font-medium">Export Preset:</span>
              <div className="relative">
                <select
                  className="appearance-none bg-surface-container-low text-on-surface font-body-sm text-body-sm font-semibold pl-3 pr-8 py-1.5 rounded-lg border-none focus:outline-none focus:ring-1 focus:ring-primary-container cursor-pointer"
                  value={resolution}
                  onChange={(e) => setResolution(e.target.value)}
                >
                  {RESOLUTIONS.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
                <span className="material-symbols-outlined absolute right-2 top-2 text-[16px] pointer-events-none text-on-surface-variant">
                  expand_more
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={togglePlay}
                className="px-space-md py-2 rounded-lg bg-surface-container text-on-surface font-body-sm text-body-sm font-semibold hover:bg-surface-container-high transition-colors"
              >
                Preview Render
              </button>
              {exported && clip?.export_url ? (
                <a
                  href={clip.export_url}
                  download
                  className="px-space-lg py-2 rounded-lg bg-tertiary text-on-tertiary font-body-sm text-body-sm font-semibold hover:opacity-90 transition-all shadow-md flex items-center gap-2"
                >
                  <span className="material-symbols-outlined text-[18px]">download</span>
                  <span>Download 9:16 MP4</span>
                </a>
              ) : (
                <button
                  type="button"
                  onClick={onExport}
                  disabled={exporting || busy[`export_${project.id}`]}
                  className="px-space-lg py-2 rounded-lg bg-primary-container text-on-primary-container font-body-sm text-body-sm font-semibold hover:bg-primary transition-all shadow-md flex items-center gap-2 disabled:opacity-70"
                >
                  <span className="material-symbols-outlined text-[18px]">{exporting ? "progress_activity" : "download"}</span>
                  <span>{exporting ? "Rendering…" : "Export 9:16 MP4"}</span>
                </button>
              )}
            </div>
          </div>
        </main>

        {/* RIGHT: inspector */}
        <aside className="col-span-12 xl:col-span-3 bg-surface-container-lowest p-margin-sm flex flex-col gap-space-md shadow-[inset_1px_0_0_rgba(15,23,42,0.04)] overflow-y-auto">
          <div className="flex items-center p-1 bg-surface-container-low rounded-xl">
            {[
              { key: "style", label: "Style" },
              { key: "captions", label: "Captions" },
              { key: "social", label: "Social Kit" },
            ].map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setInspectorTab(t.key)}
                className={`flex-1 py-1.5 rounded-lg font-label-md text-label-md transition-all text-center ${
                  inspectorTab === t.key
                    ? "bg-surface-container-lowest text-on-surface font-semibold shadow-sm"
                    : "text-on-surface-variant hover:text-on-surface font-medium"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {clip && inspectorTab === "style" && (
            <div className="flex flex-col gap-space-lg">
              <div className="flex flex-col gap-1.5">
                <label className="font-label-sm text-label-sm font-semibold text-on-surface uppercase tracking-wider flex items-center justify-between">
                  <span>Clip Headline Title</span>
                  <span className="text-on-surface-variant font-normal">{clip.title.length} chars</span>
                </label>
                <textarea
                  className="w-full p-2.5 rounded-lg bg-surface-container-low text-on-surface font-body-sm text-body-sm border border-outline-variant/30 focus:border-secondary focus:outline-none focus:ring-1 focus:ring-secondary/20 transition-all resize-none font-medium"
                  rows={2}
                  value={clip.title}
                  onChange={(e) => {
                    const title = e.target.value;
                    updateClip(project.id, clip.id, { title }, { silent: true });
                  }}
                  onBlur={(e) => updateClip(project.id, clip.id, { title: e.target.value })}
                />
              </div>

              <div className="flex flex-col gap-2">
                <label className="font-label-sm text-label-sm font-semibold text-on-surface uppercase tracking-wider">
                  9:16 Canvas Layout Mode
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {LAYOUTS.map((m) => {
                    const active = clip.style.layout === m.key;
                    return (
                      <button
                        key={m.key}
                        type="button"
                        onClick={() => patchStyle({ layout: m.key })}
                        className={`flex flex-col items-center gap-1.5 p-2 rounded-xl bg-surface-container-low text-left transition-all ${
                          active ? "ring-2 ring-primary-container" : "hover:bg-surface-container"
                        }`}
                      >
                        <div
                          className={`w-7 h-10 rounded flex items-center justify-center ${
                            active ? "border-2 border-primary-container bg-primary-fixed" : "bg-surface-container-highest"
                          }`}
                        >
                          <span className={`material-symbols-outlined text-[14px] ${active ? "text-primary-container" : "text-on-surface-variant"}`}>
                            {m.icon}
                          </span>
                        </div>
                        <span
                          className={`font-label-sm text-[11px] text-center ${
                            active ? "font-bold text-on-surface" : "font-medium text-on-surface-variant"
                          }`}
                        >
                          {m.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex flex-col gap-2 bg-surface-container-low p-space-sm rounded-xl">
                <div className="flex items-center justify-between">
                  <span className="font-label-sm text-label-sm font-semibold text-on-surface uppercase tracking-wider">
                    Speaker Reframing
                  </span>
                  <div className="flex items-center gap-1 bg-surface-container p-0.5 rounded-lg">
                    {["manual", "face_follow"].map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => patchStyle({ reframe_mode: mode })}
                        className={`px-2 py-0.5 rounded font-label-sm text-label-sm transition-all ${
                          clip.style.reframe_mode === mode
                            ? "bg-surface-container-lowest text-on-surface font-semibold shadow-sm"
                            : "text-on-surface-variant font-medium"
                        }`}
                      >
                        {mode === "manual" ? "Manual" : "Auto AI"}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex flex-col gap-1 pt-1">
                  <div className="flex justify-between font-label-sm text-label-sm text-on-surface-variant">
                    <span>Left Pan</span>
                    <span className="text-on-surface font-bold">
                      {clip.style.pan_x === 0
                        ? "Center (0px)"
                        : `${clip.style.pan_x < 0 ? "Left" : "Right"} (${Math.round(Math.abs(clip.style.pan_x) * 100)}%)`}
                    </span>
                    <span>Right Pan</span>
                  </div>
                  <input
                    className="w-full accent-primary-container cursor-pointer"
                    type="range"
                    min="-100"
                    max="100"
                    value={Math.round((clip.style.pan_x || 0) * 100)}
                    disabled={clip.style.reframe_mode === "face_follow"}
                    onChange={(e) => patchStyle({ pan_x: Number(e.target.value) / 100 })}
                  />
                </div>
              </div>

              <div className="bg-surface-container-low p-space-sm rounded-xl flex flex-col gap-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="font-label-sm text-label-sm font-bold text-on-surface uppercase">Top Hook Banner</span>
                    <span className="font-body-sm text-[11px] text-on-surface-variant">First 3 seconds attention booster</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => patchStyle({ show_hook_banner: !clip.style.show_hook_banner })}
                    className={`w-10 h-5 rounded-full p-0.5 transition-colors relative flex items-center ${
                      clip.style.show_hook_banner ? "bg-primary-container justify-end" : "bg-surface-container-highest justify-start"
                    }`}
                  >
                    <span className="w-4 h-4 bg-white rounded-full shadow-sm" />
                  </button>
                </div>
                <input
                  className="w-full px-2.5 py-1.5 rounded-lg bg-surface-container-lowest text-on-surface font-headline-sm text-body-sm font-bold border border-outline-variant/30 focus:outline-none focus:ring-1 focus:ring-primary-container"
                  type="text"
                  value={clip.style.hook_banner_text || ""}
                  placeholder="RIGHT? WELL, NO..."
                  onChange={(e) => patchStyle({ hook_banner_text: e.target.value.toUpperCase() })}
                />
              </div>
            </div>
          )}

          {clip && inspectorTab === "captions" && (
            <div className="flex flex-col gap-space-lg">
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <label className="font-label-sm text-label-sm font-semibold text-on-surface uppercase tracking-wider">
                    Caption Animations
                  </label>
                  <span className="font-label-sm text-label-sm text-tertiary font-semibold">Synced Audio</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {CAPTION_STYLES.map((s) => {
                    const active = clip.style.caption_style === s.key;
                    return (
                      <button
                        key={s.key}
                        type="button"
                        onClick={() => patchStyle({ caption_style: s.key })}
                        className={`p-2.5 rounded-xl bg-surface-container-low text-left flex flex-col gap-1 transition-all ${
                          active ? "ring-2 ring-primary-container" : "hover:bg-surface-container"
                        }`}
                      >
                        <span className="font-headline-sm text-body-sm font-bold text-on-surface">{s.label}</span>
                        <div className="flex items-center gap-1">
                          <span className={`px-1.5 py-0.5 rounded font-label-sm text-[9px] font-bold ${s.tagClass}`}>{s.tag}</span>
                          <span className="text-on-surface-variant text-[10px]">{s.hint}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="font-label-sm text-label-sm font-semibold text-on-surface uppercase">Position</span>
                  <div className="flex items-center gap-1 bg-surface-container-low p-1 rounded-lg">
                    {["top", "middle", "bottom"].map((pos) => (
                      <button
                        key={pos}
                        type="button"
                        onClick={() => patchStyle({ caption_position: pos })}
                        className={`px-2 py-0.5 rounded font-label-sm text-label-sm capitalize transition-all ${
                          clip.style.caption_position === pos
                            ? "bg-surface-container-lowest text-on-surface font-bold shadow-sm"
                            : "text-on-surface-variant"
                        }`}
                      >
                        {pos}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between font-label-sm text-label-sm">
                    <span className="text-on-surface-variant">Font Size</span>
                    <span className="font-bold text-on-surface">{clip.style.font_size} px</span>
                  </div>
                  <input
                    className="w-full accent-primary-container cursor-pointer"
                    type="range"
                    min="32"
                    max="80"
                    value={clip.style.font_size}
                    onChange={(e) => patchStyle({ font_size: Number(e.target.value) })}
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between font-label-sm text-label-sm">
                    <span className="text-on-surface-variant">Words Per Screen Line</span>
                    <span className="font-bold text-on-surface">{clip.style.words_per_line} words</span>
                  </div>
                  <input
                    className="w-full accent-primary-container cursor-pointer"
                    type="range"
                    min="1"
                    max="6"
                    value={clip.style.words_per_line}
                    onChange={(e) => patchStyle({ words_per_line: Number(e.target.value) })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <label className="font-label-sm text-label-sm font-medium text-on-surface-variant uppercase">Animation</label>
                  <select
                    className="px-2 py-1.5 rounded-lg bg-surface-container-low text-on-surface font-body-sm text-body-sm focus:outline-none"
                    value={clip.style.caption_animation}
                    onChange={(e) => patchStyle({ caption_animation: e.target.value })}
                  >
                    <option value="pop">Word Pop</option>
                    <option value="karaoke">Karaoke</option>
                    <option value="fade">Fade</option>
                    <option value="none">Static</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="font-label-sm text-label-sm font-medium text-on-surface-variant uppercase">Case</label>
                  <select
                    className="px-2 py-1.5 rounded-lg bg-surface-container-low text-on-surface font-body-sm text-body-sm focus:outline-none"
                    value={clip.style.caption_case}
                    onChange={(e) => patchStyle({ caption_case: e.target.value })}
                  >
                    <option value="style">Style default</option>
                    <option value="uppercase">UPPERCASE</option>
                    <option value="lowercase">lowercase</option>
                    <option value="sentence">Sentence</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="font-label-sm text-label-sm font-medium text-on-surface-variant uppercase">Highlight</label>
                  <select
                    className="px-2 py-1.5 rounded-lg bg-surface-container-low text-on-surface font-body-sm text-body-sm focus:outline-none"
                    value={clip.style.caption_highlight}
                    onChange={(e) => patchStyle({ caption_highlight: e.target.value })}
                  >
                    <option value="style">Style default</option>
                    <option value="yellow">Yellow</option>
                    <option value="cyan">Cyan</option>
                    <option value="amber">Amber</option>
                    <option value="green">Green</option>
                    <option value="white">White</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="font-label-sm text-label-sm font-medium text-on-surface-variant uppercase">Background</label>
                  <select
                    className="px-2 py-1.5 rounded-lg bg-surface-container-low text-on-surface font-body-sm text-body-sm focus:outline-none"
                    value={clip.style.caption_background}
                    onChange={(e) => patchStyle({ caption_background: e.target.value })}
                  >
                    <option value="style">Style default</option>
                    <option value="outline">Outline</option>
                    <option value="pill">Pill</option>
                    <option value="none">None</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {clip && inspectorTab === "social" && (
            <div className="flex flex-col gap-space-lg">
              <div className="flex flex-col gap-2">
                <label className="font-label-sm text-label-sm font-semibold text-on-surface uppercase tracking-wider">
                  YouTube Shorts Title
                </label>
                <textarea
                  className="w-full p-2.5 rounded-lg bg-surface-container-low text-on-surface font-body-sm text-body-sm border border-outline-variant/30 focus:border-secondary focus:outline-none resize-none"
                  rows={2}
                  value={clip.platform_meta.youtube_title}
                  onChange={(e) => patchMeta({ youtube_title: e.target.value })}
                />
              </div>
              <div className="flex flex-col gap-2">
                <label className="font-label-sm text-label-sm font-semibold text-on-surface uppercase tracking-wider">
                  TikTok Caption
                </label>
                <textarea
                  className="w-full p-2.5 rounded-lg bg-surface-container-low text-on-surface font-body-sm text-body-sm border border-outline-variant/30 focus:border-secondary focus:outline-none resize-none"
                  rows={2}
                  value={clip.platform_meta.tiktok_caption}
                  onChange={(e) => patchMeta({ tiktok_caption: e.target.value })}
                />
              </div>
              <div className="flex flex-col gap-2">
                <label className="font-label-sm text-label-sm font-semibold text-on-surface uppercase tracking-wider">
                  Instagram Caption
                </label>
                <textarea
                  className="w-full p-2.5 rounded-lg bg-surface-container-low text-on-surface font-body-sm text-body-sm border border-outline-variant/30 focus:border-secondary focus:outline-none resize-none"
                  rows={2}
                  value={clip.platform_meta.instagram_caption}
                  onChange={(e) => patchMeta({ instagram_caption: e.target.value })}
                />
              </div>
              <button
                type="button"
                onClick={() => navigate(routeTo("social", project.id, clip.id))}
                className="w-full py-2.5 rounded-lg bg-primary-container text-on-primary-container font-body-sm text-body-sm font-semibold hover:bg-primary transition-all shadow-md flex items-center justify-center gap-2"
              >
                <span className="material-symbols-outlined text-[18px]">rocket_launch</span>
                <span>Open Social Distribution Kit</span>
              </button>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
