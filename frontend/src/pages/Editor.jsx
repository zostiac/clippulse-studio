import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useStudio, routeTo } from "../studio.jsx";
import { fmtTC, clamp } from "../utils/format.js";
import { ConfirmDialog } from "../components/Dialogs.jsx";
import { collectClipWords } from "../components/CaptionTrack.jsx";
import CaptionTrack from "../components/CaptionTrack.jsx";
import Waveform from "../components/Waveform.jsx";
import { api } from "../api.js";

const LAYOUTS = [
  { key: "center_crop", label: "Smart 9:16", icon: "crop_free" },
  { key: "blur_fill", label: "Blur-Fill", icon: "blur_on" },
  { key: "split_screen", label: "Split Screen", icon: "vertical_split" },
];

const CAPTION_STYLES = [
  { key: "hormozi", label: "Hormozi Pop", tag: "WORD POP", tagClass: "bg-primary-container text-on-primary-container", hint: "Gold Box" },
  { key: "beast", label: "Beast Clean", tag: "CRISP CYAN", tagClass: "bg-tertiary-fixed text-on-tertiary-fixed", hint: "Shadowed" },
  { key: "minimal", label: "Minimal Pill", tag: "SOFT AMBER", tagClass: "bg-primary-fixed text-on-primary-fixed-variant", hint: "Pill" },
  { key: "neon", label: "Neon Creator", tag: "NEON POP", tagClass: "bg-surface-container-highest text-on-surface", hint: "Glow" },
  { key: "off", label: "Captions Off", tag: "CLEAN", tagClass: "bg-surface-container text-on-surface-variant", hint: "None" },
];

function useMediaQuery(query) {
  const [matches, setMatches] = useState(
    () => typeof window !== "undefined" && window.matchMedia(query).matches
  );
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = (event) => setMatches(event.matches);
    setMatches(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

// Live mirror of the video element, cover-cropped at the given anchor. The
// canvas buffer follows its on-screen size so the crop math is exact at any
// phone scale, and the draw loop self-heals so a single bad frame can never
// freeze the pane.
function SplitMirror({ videoRef, cropX = 0.5, cropY = 0.75, className = "w-full h-1/2 pointer-events-none" }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    let raf = 0;
    let alive = true;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.max(2, Math.round(rect.width * dpr) || 2);
      const h = Math.max(2, Math.round(rect.height * dpr) || 2);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
    };
    const draw = () => {
      if (!alive) return;
      try {
        resize();
        const v = videoRef.current;
        const c = canvasRef.current;
        if (v && c && v.readyState >= 2 && v.videoWidth > 0 && v.videoHeight > 0) {
          const ctx = c.getContext("2d");
          if (ctx) {
            const scale = Math.max(c.width / v.videoWidth, c.height / v.videoHeight);
            const sw = c.width / scale;
            const sh = c.height / scale;
            const sx = (v.videoWidth - sw) * Math.max(0, Math.min(1, cropX));
            const sy = (v.videoHeight - sh) * Math.max(0, Math.min(1, cropY));
            ctx.drawImage(v, sx, sy, sw, sh, 0, 0, c.width, c.height);
          }
        }
      } catch {
        // Never let one failed frame kill the loop.
      }
      raf = requestAnimationFrame(draw);
    };
    resize();
    raf = requestAnimationFrame(draw);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
    };
  }, [videoRef, cropX, cropY]);
  return <canvas ref={canvasRef} className={className} aria-hidden="true" />;
}

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
  const [mobilePane, setMobilePane] = useState("stage");
  const [playing, setPlaying] = useState(false);
  const [loop, setLoop] = useState(true);
  const [muted, setMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(clip?.start || 0);
  const [resolution, setResolution] = useState("1080x1920");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const videoRef = useRef(null);
  const trimTimer = useRef(null);
  const isXl = useMediaQuery("(min-width: 1280px)");
  const [faceTracking, setFaceTracking] = useState(false);

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

  // Linear interpolation over the cached face-track keyframes at clip time t.
  const faceAnchorAt = (t) => {
    const pts = clip?.style?.reframe_keyframes || [];
    if (!pts.length) return null;
    const rel = t - (clip?.start || 0);
    if (rel <= pts[0][0]) return pts[0][1];
    for (let i = 1; i < pts.length; i += 1) {
      if (rel <= pts[i][0]) {
        const [t0, x0] = pts[i - 1];
        const [t1, x1] = pts[i];
        const span = t1 - t0;
        const f = span > 0 ? (rel - t0) / span : 1;
        return x0 + (x1 - x0) * f;
      }
    }
    return pts[pts.length - 1][1];
  };

  const onReframeMode = async (mode) => {
    if (!clip || !project) return;
    patchStyle({ reframe_mode: mode });
    if (mode === "face_follow") {
      setFaceTracking(true);
      try {
        const updated = await api.faceTrackClip(project.id, clip.id);
        const kfs = updated?.style?.reframe_keyframes || [];
        await updateClip(
          project.id,
          clip.id,
          { style: { ...clip.style, reframe_mode: "face_follow", reframe_keyframes: kfs } },
          { silent: true }
        );
        if (kfs.length) {
          toast(`Auto AI tracked ${kfs.length} keyframes — the preview and export now follow the speaker.`, "success");
        } else {
          toast("No face movement detected in this clip — the crop stays centered. Use Manual to pan.", "info");
        }
      } catch {
        toast("Face tracking failed — switch to Manual to pan the crop.", "error");
      } finally {
        setFaceTracking(false);
      }
    }
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

  const words = useMemo(() => collectClipWords(project, clip), [project, clip]);

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
          <div className="shrink-0 whitespace-nowrap flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-surface-container font-label-sm text-label-sm text-on-surface-variant font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-primary-container" />
            <span>{clips.length} Viral Cuts Generated</span>
          </div>
        </div>
        <div className="flex items-center gap-space-md">
          <div className="hidden md:flex shrink-0 whitespace-nowrap items-center gap-2 px-3 py-1 bg-surface-container-low rounded-lg font-label-md text-label-md text-on-surface-variant">
            <span>Master Reel:</span>
            <span className="font-semibold text-on-surface">{fmtTC(project.duration)}</span>
            <span className="text-outline-variant">•</span>
            <span className="text-tertiary font-semibold">{project.width >= 1440 ? "1440p" : "1080p"} source</span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
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
              onClick={() => clip && setConfirmDelete(true)}
            >
              <span className="material-symbols-outlined text-[18px]">delete_sweep</span>
            </button>
            <ConfirmDialog
              open={confirmDelete}
              title="Delete this clip?"
              message={`"${clip?.title || "This clip"}" will be removed from the project. This cannot be undone.`}
              confirmLabel="Delete clip"
              danger
              onConfirm={() => {
                setConfirmDelete(false);
                if (clip) deleteClip(project.id, clip.id).then(() => navigate(routeTo("editor", project.id)));
              }}
              onCancel={() => setConfirmDelete(false)}
            />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1 px-2 py-1.5 bg-surface-container-lowest border-b border-outline-variant/40" style={{ display: isXl ? "none" : "flex" }}>
        {[
          { key: "clips", label: "Clips", icon: "list_alt" },
          { key: "stage", label: "Stage", icon: "smartphone" },
          { key: "inspect", label: "Inspect", icon: "tune" },
        ].map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setMobilePane(t.key)}
            aria-pressed={mobilePane === t.key}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg font-label-sm text-label-sm uppercase transition-colors ${
              mobilePane === t.key
                ? "bg-primary-container text-on-primary-container font-semibold shadow-sm"
                : "text-on-surface-variant hover:bg-surface-container"
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </div>
      <div className="grid grid-cols-12 gap-0 h-[calc(100dvh-160px)] xl:h-[calc(100dvh-116px)] overflow-hidden bg-surface">
        {/* LEFT: clips drawer */}
        <aside className="col-span-12 xl:col-span-3 min-h-0 bg-surface-container-low p-margin-sm flex-col gap-space-md shadow-[inset_-1px_0_0_rgba(15,23,42,0.04)]" style={{ display: isXl || mobilePane === "clips" ? "flex" : "none" }}>
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

          <div className="flex-1 min-h-0 flex flex-col gap-space-sm overflow-y-auto pr-1">
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
        <main className="col-span-12 xl:col-span-6 min-h-0 overflow-y-auto p-space-md flex-col justify-between gap-space-md bg-surface" style={{ display: isXl || mobilePane === "stage" ? "flex" : "none" }}>
          <div className="shrink-0 flex items-center justify-between bg-surface-container-lowest p-2 rounded-xl shadow-sm">
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
          <div className="relative flex justify-center items-center flex-1 min-h-[120px] py-1">
            <div className="absolute inset-0 m-auto h-full max-h-[550px] aspect-[310/550] bg-inverse-surface rounded-[38px] p-2.5 shadow-2xl flex flex-col justify-between overflow-hidden ring-4 ring-surface-container-highest">
              <div className="relative w-full h-full rounded-[30px] overflow-hidden bg-black flex flex-col justify-between">
                {clip?.style.layout === "blur_fill" ? (
                  <>
                    <SplitMirror
                      videoRef={videoRef}
                      cropX={0.5}
                      cropY={0.5}
                      className="absolute inset-0 w-full h-full blur-xl scale-110 opacity-80 brightness-[0.84] pointer-events-none"
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
                      style={{
                        objectPosition: `${(clip?.style.split_top_x ?? 0.5) * 100}% ${(clip?.style.split_top_y ?? 0.25) * 100}%`,
                      }}
                    />
                    <SplitMirror
                      videoRef={videoRef}
                      cropX={clip?.style.split_bottom_x ?? 0.5}
                      cropY={clip?.style.split_bottom_y ?? 0.75}
                    />
                    <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-[3px] bg-[#0A0B0F] pointer-events-none" />
                  </div>
                ) : (
                  <video
                    ref={videoRef}
                    className="absolute inset-0 w-full h-full object-cover"
                    src={project.video_url}
                    muted={muted}
                    playsInline
                    preload="metadata"
                    style={{
                      objectPosition:
                        clip?.style.reframe_mode === "face_follow"
                          ? `${((faceAnchorAt(currentTime) ?? 0.5) * 100).toFixed(2)}% 50%`
                          : `${50 + (clip?.style.pan_x || 0) * 50}% 50%`,
                    }}
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
                  <CaptionTrack project={project} clip={clip} currentTime={currentTime} style={clip?.style} words={words} />
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
          <div className="shrink-0 bg-surface-container-lowest p-space-sm rounded-xl shadow-sm flex flex-col gap-space-xs">
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
          <div className="shrink-0 bg-surface-container-lowest p-space-sm rounded-xl shadow-sm flex items-center justify-between gap-space-md">
            <div className="flex items-center gap-space-sm">
              <span className="font-label-sm text-label-sm text-on-surface-variant uppercase font-medium">Export Preset:</span>
              <div className="relative">
                <select
                  className="appearance-none bg-surface-container-low text-on-surface font-body-sm text-body-sm font-semibold pl-3 pr-8 py-1.5 rounded-lg border-none focus:ring-1 focus:ring-primary-container cursor-pointer"
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
        <aside className="col-span-12 xl:col-span-3 min-h-0 bg-surface-container-lowest p-margin-sm flex-col gap-space-md shadow-[inset_1px_0_0_rgba(15,23,42,0.04)] overflow-y-auto" style={{ display: isXl || mobilePane === "inspect" ? "flex" : "none" }}>
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
                  className="w-full p-2.5 rounded-lg bg-surface-container-low text-on-surface font-body-sm text-body-sm border border-outline-variant/30 focus:border-secondary focus:ring-1 focus:ring-secondary/20 transition-all resize-none font-medium"
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

              {clip.style.layout === "split_screen" && (
                <div className="flex flex-col gap-2 bg-surface-container-low p-space-sm rounded-xl">
                  <div className="flex items-center justify-between">
                    <span className="font-label-sm text-label-sm font-semibold text-on-surface uppercase tracking-wider">
                      Split-Screen Crop
                    </span>
                    <button
                      type="button"
                      onClick={() => patchStyle({ split_top_x: 0.5, split_top_y: 0.25, split_bottom_x: 0.5, split_bottom_y: 0.75 })}
                      className="text-primary-container font-label-sm text-label-sm font-semibold hover:underline"
                    >
                      Reset
                    </button>
                  </div>
                  <p className="text-on-surface-variant font-body-sm text-body-sm">
                    Place each pane&apos;s crop window over the source — e.g. the person on one pane, gameplay on the other.
                  </p>
                  <div className="flex items-center gap-1.5">
                    {[
                      { label: "Stacked", v: { split_top_x: 0.5, split_top_y: 0.25, split_bottom_x: 0.5, split_bottom_y: 0.75 } },
                      { label: "Side-by-Side", v: { split_top_x: 0.12, split_top_y: 0.5, split_bottom_x: 0.88, split_bottom_y: 0.5 } },
                    ].map((preset) => (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() => patchStyle(preset.v)}
                        className="flex-1 px-2 py-1 rounded-lg bg-surface-container text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest font-label-sm text-label-sm font-medium transition-colors"
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                  {[
                    { key: "split_top_x", label: "Top Pane — Horizontal", value: clip.style.split_top_x },
                    { key: "split_top_y", label: "Top Pane — Vertical", value: clip.style.split_top_y },
                    { key: "split_bottom_x", label: "Bottom Pane — Horizontal", value: clip.style.split_bottom_x },
                    { key: "split_bottom_y", label: "Bottom Pane — Vertical", value: clip.style.split_bottom_y },
                  ].map((row) => (
                    <div key={row.key} className="flex flex-col gap-0.5">
                      <div className="flex justify-between font-label-sm text-label-sm text-on-surface-variant">
                        <span className="font-medium">{row.label}</span>
                        <span className="font-semibold text-on-surface">{Math.round((row.value ?? 0.5) * 100)}%</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.01"
                        value={row.value ?? 0.5}
                        onChange={(e) => patchStyle({ [row.key]: Number(e.target.value) })}
                        className="w-full h-1.5 bg-surface-container-highest rounded-lg appearance-none cursor-pointer accent-primary-container"
                        aria-label={row.label}
                      />
                    </div>
                  ))}
                </div>
              )}

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
                        onClick={() => onReframeMode(mode)}
                        className={`px-2 py-0.5 rounded font-label-sm text-label-sm transition-all ${
                          clip.style.reframe_mode === mode
                            ? "bg-surface-container-lowest text-on-surface font-semibold shadow-sm"
                            : "text-on-surface-variant font-medium"
                        }`}
                      >
                        {mode === "manual" ? "Manual" : faceTracking ? "Tracking…" : "Auto AI"}
                      </button>
                    ))}
                  </div>
                </div>
                <p className="text-on-surface-variant font-body-sm text-[11px]">
                  {clip.style.reframe_mode === "face_follow"
                    ? "Auto AI follows the detected face — preview and export share the same tracking."
                    : "Drag to reframe the 9:16 crop across the source."}
                </p>
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
                    aria-label="Speaker pan position"
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
                  className="w-full px-2.5 py-1.5 rounded-lg bg-surface-container-lowest text-on-surface font-headline-sm text-body-sm font-bold border border-outline-variant/30 focus:ring-1 focus:ring-primary-container"
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
                    aria-label="Caption font size"
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
                    aria-label="Words per caption line"
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
                    className="px-2 py-1.5 rounded-lg bg-surface-container-low text-on-surface font-body-sm text-body-sm"
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
                    className="px-2 py-1.5 rounded-lg bg-surface-container-low text-on-surface font-body-sm text-body-sm"
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
                    className="px-2 py-1.5 rounded-lg bg-surface-container-low text-on-surface font-body-sm text-body-sm"
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
                    className="px-2 py-1.5 rounded-lg bg-surface-container-low text-on-surface font-body-sm text-body-sm"
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
                  className="w-full p-2.5 rounded-lg bg-surface-container-low text-on-surface font-body-sm text-body-sm border border-outline-variant/30 focus:border-secondary resize-none"
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
                  className="w-full p-2.5 rounded-lg bg-surface-container-low text-on-surface font-body-sm text-body-sm border border-outline-variant/30 focus:border-secondary resize-none"
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
                  className="w-full p-2.5 rounded-lg bg-surface-container-low text-on-surface font-body-sm text-body-sm border border-outline-variant/30 focus:border-secondary resize-none"
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
