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
    const proj = await api.getProject(id);
    openProjectObj(proj);
  }

  async function handleDeleteProject(id) {
    for (const [key, queued] of patchTimerRef.current.entries()) {
      if (key.startsWith(`${id}:`)) {
        clearTimeout(queued.timer);
        patchTimerRef.current.delete(key);
      }
    }
    await api.deleteProject(id);
    setProjects((prev) => prev.filter((p) => p.id !== id));
    if (activeProject?.id === id) {
      setActiveProject(null);
      setSelectedClipId(null);
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
    if (existing) clearTimeout(existing.timer);
    const mergedPatch = { ...(existing?.patch || {}), ...patch };
    const timer = setTimeout(async () => {
      patchTimerRef.current.delete(key);
      try {
        await api.updateClip(projId, clipId, mergedPatch);
      } catch (e) {
        console.error("Failed to save clip update:", e);
      }
    }, 300);
    patchTimerRef.current.set(key, { patch: mergedPatch, timer });
  }

  async function handleCreateClip(payload) {
    if (!activeProject) return;
    const created = await api.createClip(activeProject.id, payload);
    setActiveProject((prev) => ({
      ...prev,
      clips: [created, ...prev.clips],
    }));
    setSelectedClipId(created.id);
  }

  async function handleDeleteClip(clipId) {
    if (!activeProject) return;
    const patchKey = `${activeProject.id}:${clipId}`;
    const pending = patchTimerRef.current.get(patchKey);
    if (pending) {
      clearTimeout(pending.timer);
      patchTimerRef.current.delete(patchKey);
    }
    await api.deleteClip(activeProject.id, clipId);
    setActiveProject((prev) => {
      const remaining = prev.clips.filter((c) => c.id !== clipId);
      if (selectedClipId === clipId) {
        setSelectedClipId(remaining[0]?.id || null);
      }
      return { ...prev, clips: remaining };
    });
  }

  async function handleReanalyze() {
    if (!activeProject) return;
    setReanalyzing(true);
    try {
      const updated = await api.reanalyzeProject(activeProject.id);
      setActiveProject(updated);
      setSelectedClipId(updated.clips?.[0]?.id || null);
    } finally {
      setReanalyzing(false);
    }
  }

  async function handleSaveTranscript(segments) {
    if (!activeProject) return;
    const updated = await api.updateTranscript(activeProject.id, segments);
    setActiveProject(updated);
  }

  async function handleExportClip() {
    if (!activeProject || !selectedClip) return;
    // Flush this clip's queued edits before starting its export.
    const patchKey = `${activeProject.id}:${selectedClip.id}`;
    const pending = patchTimerRef.current.get(patchKey);
    if (pending) {
      clearTimeout(pending.timer);
      patchTimerRef.current.delete(patchKey);
      await api.updateClip(activeProject.id, selectedClip.id, pending.patch);
    }
    const updatedClip = await api.exportClip(activeProject.id, selectedClip.id);
    setActiveProject((prev) => ({
      ...prev,
      clips: prev.clips.map((c) => (c.id === updatedClip.id ? updatedClip : c)),
    }));
  }

  async function handleExportAll() {
    if (!activeProject) return;
    const updatedProj = await api.exportAll(activeProject.id);
    setActiveProject(updatedProj);
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
        onGoHome={() => {
          setActiveProject(null);
          api.listProjects().then(setProjects).catch(() => {});
        }}
        onOpenSettings={() => setSettingsOpen(true)}
        onExportAll={handleExportAll}
        exportingAll={!!hasRendering}
      />

      {!activeProject ? (
        <IngestView
          projects={projects}
          onProjectCreated={handleProjectCreated}
          onOpenProject={handleOpenProject}
          onDeleteProject={handleDeleteProject}
          onOpenSettings={() => setSettingsOpen(true)}
        />
      ) : (
        <main className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden">
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
          <aside className="w-full lg:w-[340px] xl:w-[370px] shrink-0 border-l border-white/10 bg-[#0E1017] flex flex-col min-h-0">
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
