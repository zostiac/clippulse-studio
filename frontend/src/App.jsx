import React, { useCallback, useEffect, useRef, useState } from "react";
import { Sliders, FileText, Share2, X } from "lucide-react";
import { api } from "./api";
import HeaderBar from "./components/HeaderBar";
import IngestView from "./components/IngestView";
import ClipListSidebar from "./components/ClipListSidebar";
import StudioPreview from "./components/StudioPreview";
import EditorControls from "./components/EditorControls";
import TranscriptEditor from "./components/TranscriptEditor";
import SocialMetadataPanel from "./components/SocialMetadataPanel";
import SettingsModal from "./components/SettingsModal";

// Server-owned export fields. While a render is running the poll only copies
// these, so it can never overwrite edits the user is making locally.
const EXPORT_FIELDS = [
  "export_status",
  "export_progress",
  "export_url",
  "export_filename",
  "export_error",
];

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
  const patchTimerRef = useRef(null);
  // clipId -> { projId, patch }: edits waiting for the debounce, merged per clip
  const pendingRef = useRef({});

  const reportError = useCallback((e, fallback) => {
    console.error(e);
    setActionError(e?.message || fallback);
  }, []);

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

  // Poll active project while any clip is rendering
  const hasRendering = activeProject?.clips?.some((c) => c.export_status === "rendering");
  useEffect(() => {
    if (!activeProject || !hasRendering) return;
    const projectId = activeProject.id;
    const timer = setInterval(async () => {
      try {
        const fresh = await api.getProject(projectId);
        setActiveProject((prev) => {
          if (!prev || prev.id !== fresh.id) return prev;
          const freshById = new Map(fresh.clips.map((c) => [c.id, c]));
          return {
            ...prev,
            clips: prev.clips.map((c) => {
              const f = freshById.get(c.id);
              if (!f) return c;
              const next = { ...c };
              for (const k of EXPORT_FIELDS) next[k] = f[k];
              return next;
            }),
          };
        });
      } catch {
        // ignore transient poll err
      }
    }, 650);
    return () => clearInterval(timer);
  }, [activeProject?.id, hasRendering]);

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
    try {
      const proj = await api.getProject(id);
      openProjectObj(proj);
    } catch (e) {
      reportError(e, "Could not open the project.");
    }
  }

  async function handleDeleteProject(id) {
    try {
      await api.deleteProject(id);
    } catch (e) {
      reportError(e, "Could not delete the project.");
      return;
    }
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

  // Send every queued edit now. Edits are merged per clip, so quickly changing
  // the style, then the title, then another clip never drops an earlier change.
  const flushPatches = useCallback(async () => {
    if (patchTimerRef.current) {
      clearTimeout(patchTimerRef.current);
      patchTimerRef.current = null;
    }
    const entries = Object.entries(pendingRef.current);
    pendingRef.current = {};
    await Promise.all(
      entries.map(async ([clipId, { projId, patch }]) => {
        try {
          await api.updateClip(projId, clipId, patch);
        } catch (e) {
          reportError(e, "Your latest changes could not be saved.");
        }
      })
    );
  }, [reportError]);

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

    const queued = pendingRef.current[clipId];
    pendingRef.current[clipId] = { projId, patch: { ...(queued?.patch || {}), ...patch } };

    if (patchTimerRef.current) clearTimeout(patchTimerRef.current);
    patchTimerRef.current = setTimeout(flushPatches, 300);
  }

  async function handleCreateClip(payload) {
    if (!activeProject) return;
    try {
      const created = await api.createClip(activeProject.id, payload);
      setActiveProject((prev) => (prev ? { ...prev, clips: [created, ...prev.clips] } : prev));
      setSelectedClipId(created.id);
    } catch (e) {
      reportError(e, "Could not create the clip.");
      throw e; // let the form stay open
    }
  }

  async function handleDeleteClip(clipId) {
    if (!activeProject) return;
    try {
      await api.deleteClip(activeProject.id, clipId);
    } catch (e) {
      reportError(e, "Could not delete the clip.");
      return;
    }
    delete pendingRef.current[clipId];
    if (selectedClip?.id === clipId) {
      const next = activeProject.clips.find((c) => c.id !== clipId);
      setSelectedClipId(next?.id || null);
    }
    setActiveProject((prev) =>
      prev ? { ...prev, clips: prev.clips.filter((c) => c.id !== clipId) } : prev
    );
  }

  async function handleReanalyze() {
    if (!activeProject) return;
    setReanalyzing(true);
    // Re-scanning replaces every clip, so edits still waiting to be sent are moot
    if (patchTimerRef.current) {
      clearTimeout(patchTimerRef.current);
      patchTimerRef.current = null;
    }
    pendingRef.current = {};
    try {
      const updated = await api.reanalyzeProject(activeProject.id);
      setActiveProject(updated);
      setSelectedClipId(updated.clips?.[0]?.id || null);
    } catch (e) {
      reportError(e, "Re-scan failed.");
    } finally {
      setReanalyzing(false);
    }
  }

  async function handleSaveTranscript(segments) {
    if (!activeProject) return;
    const updated = await api.updateTranscript(activeProject.id, segments);
    // Only take the transcript: replacing the whole project would discard
    // clip edits that have not reached the server yet.
    setActiveProject((prev) =>
      prev && prev.id === updated.id ? { ...prev, transcript: updated.transcript } : prev
    );
  }

  async function handleExportClip() {
    if (!activeProject || !selectedClip) return;
    try {
      // Make sure the server has every pending style/trim edit before rendering
      await flushPatches();
      const updatedClip = await api.exportClip(activeProject.id, selectedClip.id);
      setActiveProject((prev) =>
        prev
          ? { ...prev, clips: prev.clips.map((c) => (c.id === updatedClip.id ? updatedClip : c)) }
          : prev
      );
    } catch (e) {
      reportError(e, "Export could not be started.");
    }
  }

  async function handleExportAll() {
    if (!activeProject) return;
    try {
      await flushPatches();
      const updatedProj = await api.exportAll(activeProject.id);
      setActiveProject(updatedProj);
    } catch (e) {
      reportError(e, "Export could not be started.");
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
        onGoHome={() => {
          setActiveProject(null);
          api.listProjects().then(setProjects).catch(() => {});
        }}
        onOpenSettings={() => setSettingsOpen(true)}
        onExportAll={handleExportAll}
        exportingAll={!!hasRendering}
      />

      {actionError && (
        <div
          role="alert"
          className="flex items-start justify-between gap-3 px-4 py-2 text-xs text-rose-200 bg-rose-500/10 border-b border-rose-500/30"
        >
          <span className="leading-relaxed">{actionError}</span>
          <button
            type="button"
            onClick={() => setActionError("")}
            aria-label="Dismiss error"
            className="shrink-0 p-0.5 rounded hover:bg-white/10 text-rose-200"
          >
            <X className="w-3.5 h-3.5" />
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
