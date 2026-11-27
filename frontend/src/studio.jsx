import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { api } from "./api.js";

const StudioCtx = createContext(null);

export function useStudio() {
  return useContext(StudioCtx);
}

function parseHash() {
  const raw = (window.location.hash || "#/dashboard").replace(/^#\/?/, "");
  const [name = "dashboard", ...rest] = raw.split("/").filter(Boolean);
  const known = ["dashboard", "projects", "editor", "analytics", "settings", "social"];
  const page = known.includes(name) ? name : "dashboard";
  return { name: page, projectId: rest[0] || null, clipId: rest[1] || null };
}

export function routeTo(name, projectId, clipId) {
  const parts = [name];
  if (projectId) parts.push(projectId);
  if (clipId) parts.push(clipId);
  return `#/${parts.join("/")}`;
}

export function StudioProvider({ children }) {
  const [route, setRoute] = useState(parseHash);
  const [projects, setProjects] = useState([]);
  const [settings, setSettings] = useState(null);
  const [health, setHealth] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState({});
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pollers = useRef(new Set());

  // ---- routing -------------------------------------------------------------
  useEffect(() => {
    const onChange = () => setRoute(parseHash());
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);

  const navigate = useCallback((hash) => {
    if (window.location.hash === hash) {
      setRoute(parseHash());
    } else {
      window.location.hash = hash;
    }
    window.scrollTo({ top: 0 });
    setSidebarOpen(false);
  }, []);

  // ---- toasts --------------------------------------------------------------
  const toast = useCallback((message, kind = "info") => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    setToasts((list) => [...list, { id, message, kind }]);
    window.setTimeout(() => {
      setToasts((list) => list.filter((t) => t.id !== id));
    }, 3600);
  }, []);

  const dismissToast = useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  // ---- data ----------------------------------------------------------------
  const refreshProjects = useCallback(async () => {
    try {
      setProjects(await api.listProjects());
    } catch (err) {
      toast(`Could not load projects: ${err.message}`, "error");
    }
  }, [toast]);

  const refreshSettings = useCallback(async () => {
    try {
      setSettings(await api.getSettings());
    } catch (err) {
      toast(`Could not load settings: ${err.message}`, "error");
    }
  }, [toast]);

  const refreshHealth = useCallback(async () => {
    try {
      setHealth(await api.getHealth());
    } catch {
      setHealth(null);
    }
  }, []);

  const refreshAnalytics = useCallback(async () => {
    try {
      setAnalytics(await api.getAnalytics());
    } catch {
      setAnalytics(null);
    }
  }, []);

  const loadProject = useCallback(async (id) => {
    if (!id) return null;
    try {
      return await api.getProject(id);
    } catch (err) {
      toast(`Could not load project: ${err.message}`, "error");
      return null;
    }
  }, [toast]);

  useEffect(() => {
    refreshProjects();
    refreshSettings();
    refreshHealth();
    refreshAnalytics();
  }, [refreshProjects, refreshSettings, refreshHealth, refreshAnalytics]);

  // ---- export polling ------------------------------------------------------
  const pollProject = useCallback(
    (projectId) => {
      if (pollers.current.has(projectId)) return;
      pollers.current.add(projectId);
      const tick = async () => {
        try {
          const proj = await api.getProject(projectId);
          setProjects((list) => list.map((p) => (p.id === proj.id ? { ...p, ...proj } : p)));
          const rendering = proj.clips.some((c) => c.export_status === "rendering");
          const failed = proj.clips.find((c) => c.export_status === "error");
          if (rendering) {
            window.setTimeout(tick, 1600);
            return;
          }
          pollers.current.delete(projectId);
          if (failed?.export_error) {
            toast(`Export failed: ${failed.export_error}`, "error");
          } else {
            toast("Export finished — MP4s are ready to download.", "success");
          }
          refreshAnalytics();
        } catch {
          pollers.current.delete(projectId);
        }
      };
      window.setTimeout(tick, 1200);
    },
    [toast, refreshAnalytics]
  );

  // ---- actions -------------------------------------------------------------
  const run = useCallback(async (key, fn) => {
    setBusy((b) => ({ ...b, [key]: true }));
    try {
      return await fn();
    } finally {
      setBusy((b) => ({ ...b, [key]: false }));
    }
  }, []);

  const createDemo = useCallback(
    (demoKey) =>
      run(`demo_${demoKey}`, async () => {
        try {
          const proj = await api.createDemo(demoKey);
          setProjects((list) => [proj, ...list.filter((p) => p.id !== proj.id)]);
          refreshAnalytics();
          toast(`Demo ready: ${proj.title}`, "success");
          navigate(routeTo("editor", proj.id));
          return proj;
        } catch (err) {
          toast(`Demo failed: ${err.message}`, "error");
          return null;
        }
      }),
    [run, toast, navigate, refreshAnalytics]
  );

  const ingestYoutube = useCallback(
    (url, fallbackTranscript) =>
      run("youtube", async () => {
        try {
          const proj = await api.createFromYoutube(url, fallbackTranscript);
          setProjects((list) => [proj, ...list.filter((p) => p.id !== proj.id)]);
          refreshAnalytics();
          toast(`Ingested: ${proj.title}`, "success");
          navigate(routeTo("editor", proj.id));
          return proj;
        } catch (err) {
          toast(`YouTube ingest failed: ${err.message}`, "error");
          return null;
        }
      }),
    [run, toast, navigate, refreshAnalytics]
  );

  const uploadVideo = useCallback(
    (formData) =>
      run("upload", async () => {
        try {
          const proj = await api.uploadVideo(formData);
          setProjects((list) => [proj, ...list.filter((p) => p.id !== proj.id)]);
          refreshAnalytics();
          toast(`Uploaded: ${proj.title}`, "success");
          navigate(routeTo("editor", proj.id));
          return proj;
        } catch (err) {
          toast(`Upload failed: ${err.message}`, "error");
          return null;
        }
      }),
    [run, toast, navigate, refreshAnalytics]
  );

  const reanalyze = useCallback(
    (projectId) =>
      run(`reanalyze_${projectId}`, async () => {
        try {
          const proj = await api.reanalyzeProject(projectId);
          setProjects((list) => list.map((p) => (p.id === proj.id ? proj : p)));
          refreshAnalytics();
          toast("Re-analysis complete.", "success");
          return proj;
        } catch (err) {
          toast(`Re-analysis failed: ${err.message}`, "error");
          return null;
        }
      }),
    [run, toast, refreshAnalytics]
  );

  const deleteProject = useCallback(
    async (projectId) => {
      try {
        await api.deleteProject(projectId);
        setProjects((list) => list.filter((p) => p.id !== projectId));
        refreshAnalytics();
        toast("Project deleted.", "success");
        return true;
      } catch (err) {
        toast(`Delete failed: ${err.message}`, "error");
        return false;
      }
    },
    [toast, refreshAnalytics]
  );

  const setArchived = useCallback(
    async (projectId, archived) => {
      try {
        const proj = await api.updateProject(projectId, { archived });
        setProjects((list) => list.map((p) => (p.id === proj.id ? proj : p)));
        refreshAnalytics();
        toast(archived ? "Project archived." : "Project restored.", "success");
        return proj;
      } catch (err) {
        toast(`Archive failed: ${err.message}`, "error");
        return null;
      }
    },
    [toast, refreshAnalytics]
  );

  const renameProject = useCallback(
    async (projectId, title) => {
      try {
        const proj = await api.updateProject(projectId, { title });
        setProjects((list) => list.map((p) => (p.id === proj.id ? proj : p)));
        return proj;
      } catch (err) {
        toast(`Rename failed: ${err.message}`, "error");
        return null;
      }
    },
    [toast]
  );

  const createClip = useCallback(
    async (projectId, payload) => {
      try {
        await api.createClip(projectId, payload);
        const proj = await api.getProject(projectId);
        setProjects((list) => list.map((p) => (p.id === proj.id ? proj : p)));
        refreshAnalytics();
        toast("Custom clip created.", "success");
        return proj;
      } catch (err) {
        toast(`Could not create clip: ${err.message}`, "error");
        return null;
      }
    },
    [toast, refreshAnalytics]
  );

  const updateClip = useCallback(
    async (projectId, clipId, patch, { silent = false } = {}) => {
      try {
        await api.updateClip(projectId, clipId, patch);
        const proj = await api.getProject(projectId);
        setProjects((list) => list.map((p) => (p.id === proj.id ? proj : p)));
        return proj;
      } catch (err) {
        if (!silent) toast(`Update failed: ${err.message}`, "error");
        return null;
      }
    },
    [toast]
  );

  const deleteClip = useCallback(
    async (projectId, clipId) => {
      try {
        await api.deleteClip(projectId, clipId);
        const proj = await api.getProject(projectId);
        setProjects((list) => list.map((p) => (p.id === proj.id ? proj : p)));
        refreshAnalytics();
        toast("Clip deleted.", "success");
        return proj;
      } catch (err) {
        toast(`Delete failed: ${err.message}`, "error");
        return null;
      }
    },
    [toast, refreshAnalytics]
  );

  const exportClip = useCallback(
    async (projectId, clipId) => {
      try {
        await api.exportClip(projectId, clipId);
        pollProject(projectId);
        toast("Rendering 9:16 MP4…", "info");
        return true;
      } catch (err) {
        toast(`Export failed: ${err.message}`, "error");
        return false;
      }
    },
    [toast, pollProject]
  );

  const exportAll = useCallback(
    async (projectId) => {
      try {
        await api.exportAll(projectId);
        pollProject(projectId);
        toast("Rendering all clips…", "info");
        return true;
      } catch (err) {
        toast(`Export failed: ${err.message}`, "error");
        return false;
      }
    },
    [toast, pollProject]
  );

  const saveSettings = useCallback(
    async (patch) => {
      try {
        const next = await api.updateSettings(patch);
        setSettings(next);
        toast("Settings saved to studio configuration.", "success");
        return next;
      } catch (err) {
        toast(`Settings not saved: ${err.message}`, "error");
        return null;
      }
    },
    [toast]
  );

  const saveCookies = useCallback(
    async (cookiesText) => {
      try {
        const next = await api.uploadCookies(cookiesText);
        setSettings(next);
        toast("YouTube cookies verified & stored.", "success");
        return next;
      } catch (err) {
        toast(`Cookies not saved: ${err.message}`, "error");
        return null;
      }
    },
    [toast]
  );

  const clearCookies = useCallback(async () => {
    try {
      const next = await api.clearCookies();
      setSettings(next);
      toast("YouTube cookies cleared.", "success");
      return next;
    } catch (err) {
      toast(`Could not clear cookies: ${err.message}`, "error");
      return null;
    }
  }, [toast]);

  const value = useMemo(
    () => ({
      route,
      navigate,
      projects,
      settings,
      health,
      analytics,
      toasts,
      toast,
      dismissToast,
      search,
      setSearch,
      busy,
      sidebarOpen,
      setSidebarOpen,
      refreshProjects,
      refreshSettings,
      refreshHealth,
      refreshAnalytics,
      loadProject,
      createDemo,
      ingestYoutube,
      uploadVideo,
      reanalyze,
      deleteProject,
      setArchived,
      renameProject,
      createClip,
      updateClip,
      deleteClip,
      exportClip,
      exportAll,
      saveSettings,
      saveCookies,
      clearCookies,
    }),
    [
      route,
      navigate,
      projects,
      settings,
      health,
      analytics,
      toasts,
      toast,
      dismissToast,
      search,
      busy,
      sidebarOpen,
      refreshProjects,
      refreshSettings,
      refreshHealth,
      refreshAnalytics,
      loadProject,
      createDemo,
      ingestYoutube,
      uploadVideo,
      reanalyze,
      deleteProject,
      setArchived,
      renameProject,
      createClip,
      updateClip,
      deleteClip,
      exportClip,
      exportAll,
      saveSettings,
      saveCookies,
      clearCookies,
    ]
  );

  return <StudioCtx.Provider value={value}>{children}</StudioCtx.Provider>;
}
