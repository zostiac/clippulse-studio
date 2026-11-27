import React, { useEffect, useRef } from "react";
import { useStudio, routeTo } from "../../studio.jsx";

const AI_PILL = {
  local_free: "Local Whisper AI",
  groq: "Groq Free AI",
  gemini: "Gemini Free AI",
  openrouter: "OpenRouter Free",
  openai: "OpenAI BYOK",
};

export default function TopHeader({ variant = "material", onMenu }) {
  const { navigate, route, settings, search, setSearch, exportAll, busy } = useStudio();
  // Cloud providers only engage when an API key is saved — without one the
  // engine runs fully local, and the pill should say so.
  const hasKey = Boolean(settings?.api_key_preview);
  const effProvider = settings?.ai_provider && settings.ai_provider !== "local_free" && hasKey ? settings.ai_provider : "local_free";
  const aiLabel = AI_PILL[effProvider] || "Local Whisper AI";
  const searchRef = useRef(null);

  // ⌘K / Ctrl+K focuses the search input.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select?.();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const onSearchKeyDown = (e) => {
    if (e.key === "Enter") {
      navigate(routeTo("projects"));
    }
  };

  const onExportAll = async () => {
    if (route.name === "editor" && route.projectId) {
      await exportAll(route.projectId);
    } else {
      navigate(routeTo("projects"));
    }
  };

  const menuButton = (
    <button
      type="button"
      onClick={onMenu}
      aria-label="Open navigation"
      className="lg:hidden p-1.5 rounded-lg hover:bg-surface-container-high text-on-surface-variant"
    >
      <span className="material-symbols-outlined text-[22px]">menu</span>
    </button>
  );

  const editorialMenuButton = (
    <button
      type="button"
      onClick={onMenu}
      aria-label="Open navigation"
      className="lg:hidden p-1.5 rounded-lg hover:bg-line-soft text-ink-muted"
    >
      <span className="material-symbols-outlined text-[22px]">menu</span>
    </button>
  );

  if (variant === "editorial") {
    return (
      <header className="fixed top-0 left-0 lg:left-64 right-0 h-14 bg-white/95 backdrop-blur-xl border-b border-line z-40 flex items-center justify-between px-4 shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {editorialMenuButton}
          <div className="relative w-56 sm:w-72 max-w-sm">
            <span className="material-symbols-outlined text-[16px] text-ink-faint absolute left-2.5 top-1/2 -translate-y-1/2">
              search
            </span>
            <input
              ref={searchRef}
              id="cp-search"
              className="w-full bg-paper-cool border border-line rounded pl-8 pr-8 py-1 font-label-code-md text-label-code-md text-ink placeholder:text-ink-faint focus:bg-white focus:border-accent transition-colors"
              placeholder="Search clips, markers, transcripts..."
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={onSearchKeyDown}
            />
            <kbd className="absolute right-2 top-1/2 -translate-y-1/2 font-label-code-sm text-label-code-sm text-ink-muted bg-white px-1 py-0.5 rounded border border-line">
              ⌘K
            </kbd>
          </div>
          <div className="hidden md:flex items-center gap-1 px-2.5 py-1 rounded bg-accent-soft border border-accent-sand">
            <span className="material-symbols-outlined text-accent text-[14px]">auto_awesome</span>
            <span className="font-label-code-sm text-label-code-sm text-accent-ink font-medium">{aiLabel}</span>
            <span className="w-1.5 h-1.5 rounded-full bg-accent" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate(routeTo("dashboard"))}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-accent text-white hover:bg-accent-600 transition-colors font-title-sm text-title-sm font-semibold shadow-sm"
          >
            <span className="material-symbols-outlined text-[16px]">add</span>
            <span>+ New Video</span>
          </button>
          <button
            type="button"
            onClick={onExportAll}
            disabled={busy[`export_all_${route.projectId}`]}
            className="hidden sm:flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white border border-line text-ink-deep hover:border-ink-300 hover:bg-paper-cool transition-colors font-title-sm text-title-sm shadow-sm"
          >
            <span className="material-symbols-outlined text-[16px]">ios_share</span>
            <span>Export All</span>
          </button>
          <div className="h-5 w-px bg-line mx-1" />
          <button
            type="button"
            onClick={() => navigate(routeTo("settings"))}
            className="p-1.5 rounded-lg text-ink-muted hover:bg-line-soft hover:text-ink transition-colors"
            title="Settings"
          >
            <span className="material-symbols-outlined text-[20px]">settings</span>
          </button>
          <button
            type="button"
            className="w-8 h-8 rounded-full bg-paper-cool border border-line flex items-center justify-center hover:border-ink-300 transition-colors"
            title="Profile"
          >
            <span className="material-symbols-outlined text-accent text-[18px]">person</span>
          </button>
        </div>
      </header>
    );
  }

  return (
    <header className="fixed top-0 left-0 lg:left-64 right-0 h-16 bg-surface/80 backdrop-blur-xl shadow-[0_1px_8px_rgba(0,0,0,0.04)] z-40 px-margin flex items-center justify-between gap-gutter">
      <div className="flex items-center gap-space-md flex-1 max-w-md">
        {menuButton}
        <div className="relative w-full flex items-center">
          <span className="material-symbols-outlined absolute left-space-sm text-on-surface-variant text-[18px]">
            search
          </span>
          <input
            ref={searchRef}
            id="cp-search"
            className="w-full pl-9 pr-12 py-1.5 bg-surface-container-lowest rounded-lg font-body-sm text-body-sm text-on-surface placeholder:text-on-surface-variant shadow-[0_1px_4px_rgba(0,0,0,0.02)]"
            placeholder="Search clips, markers, transcripts..."
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={onSearchKeyDown}
          />
          <span className="absolute right-space-sm px-1.5 py-0.5 rounded bg-surface-container font-label-sm text-label-sm text-on-surface-variant">
            ⌘K
          </span>
        </div>
      </div>
      <div className="flex items-center gap-space-md">
        <div className="hidden md:flex items-center gap-space-xs px-space-sm py-1 bg-tertiary-fixed rounded-full">
          <span className="material-symbols-outlined text-[16px] text-on-tertiary-fixed-variant">auto_awesome</span>
          <span className="font-label-sm text-label-sm text-on-tertiary-fixed font-semibold">{aiLabel}</span>
        </div>
        <button
          type="button"
          onClick={onExportAll}
          disabled={busy[`export_all_${route.projectId}`]}
          className="hidden sm:flex px-space-md py-1.5 rounded-lg bg-surface-container-lowest text-on-surface font-body-sm text-body-sm hover:bg-surface-container-high transition-colors shadow-[0_1px_4px_rgba(0,0,0,0.02)] items-center gap-space-xs disabled:opacity-60"
        >
          <span className="material-symbols-outlined text-[16px]">
            {busy[`export_all_${route.projectId}`] ? "progress_activity" : "file_upload"}
          </span>
          <span>Export All</span>
        </button>
        <button
          type="button"
          onClick={() => navigate(routeTo("dashboard"))}
          className="px-space-md py-1.5 rounded-lg bg-primary-container text-on-primary-container font-body-sm text-body-sm font-semibold hover:bg-primary transition-colors flex items-center gap-space-xs"
        >
          <span className="material-symbols-outlined text-[18px]">add</span>
          <span className="hidden sm:inline">+ New Video</span>
        </button>
        <button
          type="button"
          onClick={() => navigate(routeTo("settings"))}
          className="text-on-surface-variant hover:text-on-surface transition-colors p-1 flex items-center justify-center"
          title="Settings"
        >
          <span className="material-symbols-outlined text-[20px]">tune</span>
        </button>
        <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
          <span className="material-symbols-outlined text-on-primary text-[18px]">person</span>
        </div>
      </div>
    </header>
  );
}
