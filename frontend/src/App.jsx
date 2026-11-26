import React, { useCallback, useEffect, useRef, useState } from "react";
import { Sliders, FileText, Share2 } from "lucide-react";
import { api } from "./api";
import { useTheme } from "./theme";
import HeaderBar from "./components/HeaderBar";
import Dashboard from "./components/Dashboard";
import SettingsPage from "./components/SettingsPage";
import { Notice } from "./components/ui";
import ClipListSidebar from "./components/ClipListSidebar";
import StudioPreview from "./components/StudioPreview";
import EditorControls from "./components/EditorControls";
import TranscriptEditor from "./components/TranscriptEditor";
import SocialMetadataPanel from "./components/SocialMetadataPanel";

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
  const [view, setView] = useState("home"); // home | studio | settings
  const [settingsTab, setSettingsTab] = useState("engine");
  const [settingsNonce, setSettingsNonce] = useState(0);
  const { pref: themePref, setTheme, isDark } = useTheme();
  const [currentTime, setCurrentTime] = useState(0);
  const [reanalyzing, setReanalyzing] = useState(false);
  const [actionError, setActionError] = useState("");

  const settingsDirtyRef = useRef(false);
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
    setView("studio");
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
      setView("home");
    }
  }

  const handleSettingsDirty = useCallback((dirty) => {
    settingsDirtyRef.current = dirty;
  }, []);

  // One place for every screen change, so unsaved settings are never lost silently.
  function navigate(next, tab) {
    if (next === "studio" && !activeProject) return;
    if (view === "settings" && next !== "settings" && settingsDirtyRef.current) {
      if (!window.confirm("You have unsaved settings. Leave without saving them?")) return;
      settingsDirtyRef.current = false;
    }
    if (next === "settings" && view !== "settings") {
      setSettingsTab(tab || "engine");
      setSettingsNonce((n) => n + 1);
    }
    if (next === "home") {
      api.listProjects().then(setProjects).catch(() => {});
    }
    setView(next);
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
    <div className="h-screen w-screen overflow-hidden flex flex-col bg-canvas text-ink">
      <HeaderBar
        view={view}
        project={activeProject}
        settings={settings}
        isDark={isDark}
        onToggleTheme={() => setTheme(isDark ? "light" : "dark")}
        onNavigate={navigate}
        onExportAll={handleExportAll}
        exportingAll={!!hasRendering}
      />

      {actionError && (
        <div className="px-4 py-2 border-b border-line bg-surface">
          <Notice tone="error" onDismiss={() => setActionError("")}>
            {actionError}
          </Notice>
        </div>
      )}

      {view === "settings" && (
        <SettingsPage
          key={settingsNonce}
          settings={settings}
          initialTab={settingsTab}
          onUpdated={(s) => setSettings(s)}
          onDirtyChange={handleSettingsDirty}
          themePref={themePref}
          onThemeChange={setTheme}
        />
      )}

      {view === "home" && (
        <Dashboard
          projects={projects}
          settings={settings}
          onProjectCreated={handleProjectCreated}
          onOpenProject={handleOpenProject}
          onDeleteProject={handleDeleteProject}
          onOpenSettings={(tab) => navigate("settings", tab)}
        />
      )}

      {view === "studio" && activeProject && (
        <main className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden">
          {/* Left: ranked clips */}
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

          {/* Centre: 9:16 preview and waveform */}
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

          {/* Right: inspector */}
          <aside className="w-full lg:w-[340px] xl:w-[370px] shrink-0 border-l border-line bg-surface flex flex-col min-h-0">
            <div role="tablist" aria-label="Clip inspector" className="grid grid-cols-3 border-b border-line bg-canvas/60">
              {[
                { id: "style", label: "Style", Icon: Sliders },
                { id: "transcript", label: "Captions", Icon: FileText },
                { id: "social", label: "Social kit", Icon: Share2 },
              ].map(({ id, label, Icon }) => (
                <button
                  key={id}
                  role="tab"
                  aria-selected={inspectorTab === id}
                  onClick={() => setInspectorTab(id)}
                  className={`py-3 text-sm font-medium flex items-center justify-center gap-1.5 border-b-2 transition-colors ${
                    inspectorTab === id
                      ? "border-accent text-ink bg-raised"
                      : "border-transparent text-muted hover:text-ink"
                  }`}
                >
                  <Icon className="w-4 h-4" aria-hidden="true" />
                  <span>{label}</span>
                </button>
              ))}
            </div>

            <div role="tabpanel" className="flex-1 overflow-y-auto p-4">
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
    </div>
  );
}
