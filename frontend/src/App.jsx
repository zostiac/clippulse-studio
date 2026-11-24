import React, { useCallback, useEffect, useRef, useState } from "react";
import { Sliders, FileText, Share2 } from "lucide-react";
import { api } from "./api";
import HeaderBar from "./components/HeaderBar";
import IngestView from "./components/IngestView";
import ClipListSidebar from "./components/ClipListSidebar";
import StudioPreview from "./components/StudioPreview";
import EditorControls from "./components/EditorControls";
import TranscriptEditor from "./components/TranscriptEditor";
import SocialMetadataPanel from "./components/SocialMetadataPanel";
import SettingsModal from "./components/SettingsModal";

export default function App() {
  const [settings, setSettings] = useState(null);
  const [projects, setProjects] = useState([]);
  const [activeProject, setActiveProject] = useState(null);
  const [selectedClipId, setSelectedClipId] = useState(null);
  const [inspectorTab, setInspectorTab] = useState("style"); // style | transcript | social
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [reanalyzing, setReanalyzing] = useState(false);
  const [actionError, setActionError] = useState("");

  const seekRef = useRef(null);
  const patchTimerRef = useRef(new Map());

  const loadInitial = useCallback(async () => {
    try {
      const [s, list] = await Promise.all([api.getSettings(), api.listProjects()]);
      setSettings(s);
      setProjects(list);
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    loadInitial();
  }, [loadInitial]);

  // Poll only while exports are active; preserve optimistic edits that have not
  // reached the backend yet and ignore responses for a project that is no longer open.
  const hasRendering = activeProject?.clips?.some((c) => c.export_status === "rendering");
  useEffect(() => {
    if (!activeProject || !hasRendering) return;
    const projectId = activeProject.id;
    const timer = setInterval(async () => {
      try {
        const fresh = await api.getProject(projectId);
        const pending = [...patchTimerRef.current.entries()]
          .filter(([key]) => key.startsWith(`${projectId}:`));
        const mergedClips = fresh.clips.map((clip) => {
          const queued = pending.find(([key]) => key === `${projectId}:${clip.id}`);
          return queued ? { ...clip, ...queued[1].patch } : clip;
        });
        setActiveProject((current) =>
          current?.id === projectId ? { ...fresh, clips: mergedClips } : current
        );
      } catch {
        // Ignore transient polling errors; the next cycle will retry.
      }
    }, 1400);
    return () => clearInterval(timer);
  }, [activeProject?.id, hasRendering]);

  useEffect(() => () => {
    for (const queued of patchTimerRef.current.values()) clearTimeout(queued.timer);
    patchTimerRef.current.clear();
  }, []);

  async function flushClipPatch(projectId, clipId) {
    const key = `${projectId}:${clipId}`;
    const queued = patchTimerRef.current.get(key);
    if (!queued) return;
    if (queued.timer) {
      clearTimeout(queued.timer);
      queued.timer = null;
      queued.error = null;
      queued.promise = Promise.resolve(queued.promise)
        .catch(() => {})
        .then(() => api.updateClip(projectId, clipId, queued.patch));
    } else if (queued.error) {
      // A debounced save failed; retry it before a destructive or export action.
      queued.error = null;
      queued.promise = Promise.resolve(queued.promise)
        .catch(() => {})
        .then(() => api.updateClip(projectId, clipId, queued.patch));
    }
    try {
      await queued.promise;
      if (queued.error) {
        queued.error = null;
        await api.updateClip(projectId, clipId, queued.patch);
      }
      if (patchTimerRef.current.get(key) === queued) patchTimerRef.current.delete(key);
    } catch (error) {
      queued.error = error;
      throw error;
    }
  }

  async function flushProjectPatches(projectId) {
    const clipIds = [...patchTimerRef.current.keys()]
      .filter((key) => key.startsWith(`${projectId}:`))
      .map((key) => key.slice(projectId.length + 1));
    await Promise.all(clipIds.map((clipId) => flushClipPatch(projectId, clipId)));
  }

  const selectedClip =
    activeProject?.clips?.find((c) => c.id === selectedClipId) ||
    activeProject?.clips?.[0] ||
    null;

  function openProjectObj(proj) {
    setActiveProject(proj);
    setSelectedClipId(proj.clips?.[0]?.id || null);
    setCurrentTime(proj.clips?.[0]?.start || 0);
  }

  async function handleOpenProject(id) {
    setActionError("");
    try {
      const proj = await api.getProject(id);
      openProjectObj(proj);
    } catch (error) {
      setActionError(error.message || "Could not open this project.");
    }
  }

  async function handleDeleteProject(id) {
    setActionError("");
    try {
      await flushProjectPatches(id);
      await api.deleteProject(id);
      setProjects((prev) => prev.filter((p) => p.id !== id));
      if (activeProject?.id === id) {
        setActiveProject(null);
        setSelectedClipId(null);
      }
    } catch (error) {
      setActionError(error.message || "Could not delete this project.");
    }
  }

  function handleProjectCreated(proj) {
    setProjects((prev) => [proj, ...prev.filter((p) => p.id !== proj.id)]);
    openProjectObj(proj);
  }

  // Optimistic local clip update + debounced PATCH
  function patchSelectedClip(patch) {
    if (!activeProject || !selectedClip) return;
    const clipId = selectedClip.id;
    const projId = activeProject.id;

    setActiveProject((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        clips: prev.clips.map((c) => {
          if (c.id !== clipId) return c;
          const next = { ...c, ...patch };
          if (patch.style || patch.start !== undefined || patch.end !== undefined) {
            if (next.export_status === "done") {
              next.export_status = "idle";
              next.export_progress = 0;
            }
          }
          return next;
        }),
      };
    });

    const key = `${projId}:${clipId}`;
    const existing = patchTimerRef.current.get(key);
    if (existing?.timer) clearTimeout(existing.timer);
    const queued = {
      patch: { ...(existing?.patch || {}), ...patch },
      timer: null,
      promise: existing?.promise || Promise.resolve(),
    };
    queued.timer = setTimeout(() => {
      queued.timer = null;
      queued.promise = Promise.resolve(queued.promise)
        .catch(() => {})
        .then(() => api.updateClip(projId, clipId, queued.patch))
        .then(() => {
          if (patchTimerRef.current.get(key) === queued) patchTimerRef.current.delete(key);
        })
        .catch((e) => {
          queued.error = e;
          console.error("Failed to save clip update; it will retry before the next action:", e);
        });
    }, 300);
    patchTimerRef.current.set(key, queued);
  }

  async function handleCreateClip(payload) {
    if (!activeProject) return;
    setActionError("");
    try {
      const created = await api.createClip(activeProject.id, payload);
      setActiveProject((prev) => ({
        ...prev,
        clips: [created, ...prev.clips],
      }));
      setSelectedClipId(created.id);
    } catch (error) {
      setActionError(error.message || "Could not create this clip.");
    }
  }

  async function handleDeleteClip(clipId) {
    if (!activeProject) return;
    setActionError("");
    try {
      await flushClipPatch(activeProject.id, clipId);
      await api.deleteClip(activeProject.id, clipId);
      const remaining = activeProject.clips.filter((c) => c.id !== clipId);
      setActiveProject((prev) => ({ ...prev, clips: prev.clips.filter((c) => c.id !== clipId) }));
      if (selectedClipId === clipId) setSelectedClipId(remaining[0]?.id || null);
    } catch (error) {
      setActionError(error.message || "Could not delete this clip.");
    }
  }

  async function handleReanalyze() {
    if (!activeProject) return;
    await flushProjectPatches(activeProject.id);
    setReanalyzing(true);
    setActionError("");
    try {
      const updated = await api.reanalyzeProject(activeProject.id);
      setActiveProject(updated);
      setSelectedClipId(updated.clips?.[0]?.id || null);
    } catch (error) {
      setActionError(error.message || "Could not reanalyze this project.");
    } finally {
      setReanalyzing(false);
    }
  }

  async function handleSaveTranscript(segments) {
    if (!activeProject) return;
    try {
      const updated = await api.updateTranscript(activeProject.id, segments);
      setActiveProject(updated);
      setActionError("");
    } catch (error) {
      setActionError(error.message || "Could not save the transcript.");
      throw error;
    }
  }

  async function handleExportClip() {
    if (!activeProject || !selectedClip) return;
    setActionError("");
    try {
      await flushClipPatch(activeProject.id, selectedClip.id);
      const updatedClip = await api.exportClip(activeProject.id, selectedClip.id);
      setActiveProject((prev) => ({
        ...prev,
        clips: prev.clips.map((c) => (c.id === updatedClip.id ? updatedClip : c)),
      }));
    } catch (error) {
      setActionError(error.message || "Could not start this export.");
    }
  }

  async function handleExportAll() {
    if (!activeProject) return;
    setActionError("");
    try {
      await flushProjectPatches(activeProject.id);
      const updatedProj = await api.exportAll(activeProject.id);
      setActiveProject(updatedProj);
    } catch (error) {
      setActionError(error.message || "Could not start the export queue.");
    }
  }

  function handleNudgeStart(delta) {
    if (!selectedClip || !activeProject) return;
    const nextStart = Math.max(0, Math.min(selectedClip.end - 1.5, Number((selectedClip.start + delta).toFixed(2))));
    patchSelectedClip({ start: nextStart });
    if (seekRef.current) seekRef.current(nextStart);
  }

  function handleNudgeEnd(delta) {
    if (!selectedClip || !activeProject) return;
    const nextEnd = Math.min(activeProject.duration, Math.max(selectedClip.start + 1.5, Number((selectedClip.end + delta).toFixed(2))));
    patchSelectedClip({ end: nextEnd });
  }

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col bg-[#0A0B0F] text-slate-100">
      <HeaderBar
        project={activeProject}
        settings={settings}
        onGoHome={async () => {
          if (activeProject) await flushProjectPatches(activeProject.id);
          setActiveProject(null);
          setSelectedClipId(null);
          try {
            setProjects(await api.listProjects());
          } catch (error) {
            console.error("Could not refresh projects:", error);
          }
        }}
        onOpenSettings={() => setSettingsOpen(true)}
        onExportAll={handleExportAll}
        exportingAll={!!hasRendering}
      />

      {actionError && (
        <div role="alert" className="flex items-start justify-between gap-3 border-b border-rose-400/20 bg-rose-500/10 px-4 py-2.5 text-xs text-rose-200">
          <span>{actionError}</span>
          <button type="button" onClick={() => setActionError("")} className="shrink-0 font-semibold text-rose-100 underline underline-offset-2">
            Dismiss
          </button>
        </div>
      )}

      {!activeProject ? (
        <IngestView
          projects={projects}
          onProjectCreated={handleProjectCreated}
          onOpenProject={handleOpenProject}
          onDeleteProject={handleDeleteProject}
          onOpenSettings={() => setSettingsOpen(true)}
        />
      ) : (
        <main className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-y-auto lg:overflow-hidden">
          {/* Left: Ranked Viral Clips */}
          <ClipListSidebar
            project={activeProject}
            selectedClipId={selectedClip?.id}
            onSelectClip={(id) => {
              setSelectedClipId(id);
              const target = activeProject.clips.find((c) => c.id === id);
              if (target) setCurrentTime(target.start);
            }}
            onCreateClip={handleCreateClip}
            onDeleteClip={handleDeleteClip}
            onReanalyze={handleReanalyze}
            reanalyzing={reanalyzing}
          />

          {/* Center: 9:16 Phone Studio & Waveform */}
          <StudioPreview
            project={activeProject}
            clip={selectedClip}
            currentTime={currentTime}
            onTimeUpdate={setCurrentTime}
            onSeekRef={seekRef}
            onNudgeStart={handleNudgeStart}
            onNudgeEnd={handleNudgeEnd}
            onExportClip={handleExportClip}
            onUpdateStyle={(style) => patchSelectedClip({ style })}
          />

          {/* Right: 3-Tab Inspector */}
          <aside className="w-full lg:w-[340px] xl:w-[370px] shrink-0 min-h-[380px] lg:min-h-0 border-l border-white/10 bg-[#0E1017] flex flex-col min-h-0">
            <div className="grid grid-cols-3 border-b border-white/10 bg-[#0B0D13]">
              {[
                { id: "style", label: "Style", Icon: Sliders },
                { id: "transcript", label: "Captions", Icon: FileText },
                { id: "social", label: "Social Kit", Icon: Share2 },
              ].map(({ id, label, Icon }) => (
                <button
                  key={id}
                  onClick={() => setInspectorTab(id)}
                  className={`py-3 text-xs font-semibold flex items-center justify-center gap-1.5 border-b-2 transition ${
                    inspectorTab === id
                      ? "border-violet-500 text-white bg-white/[0.03]"
                      : "border-transparent text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{label}</span>
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {inspectorTab === "style" && (
                <EditorControls
                  clip={selectedClip}
                  onUpdateStyle={(style) => patchSelectedClip({ style })}
                  onUpdateTitle={(title) => patchSelectedClip({ title })}
                />
              )}

              {inspectorTab === "transcript" && (
                <TranscriptEditor
                  project={activeProject}
                  clip={selectedClip}
                  currentTime={currentTime}
                  onSeek={(t) => seekRef.current && seekRef.current(t)}
                  onSaveTranscript={handleSaveTranscript}
                  onUpdateRange={(st, en) =>
                    patchSelectedClip({
                      start: Math.max(0, Math.min(st, en - 1.5)),
                      end: Math.min(activeProject.duration, Math.max(st + 1.5, en)),
                    })
                  }
                />
              )}

              {inspectorTab === "social" && (
                <SocialMetadataPanel
                  clip={selectedClip}
                  onUpdateMeta={(platform_meta) => patchSelectedClip({ platform_meta })}
                />
              )}
            </div>
          </aside>
        </main>
      )}

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        onUpdated={(s) => setSettings(s)}
      />
    </div>
  );
}
