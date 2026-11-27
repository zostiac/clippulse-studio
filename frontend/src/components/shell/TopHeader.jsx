import React, { useEffect, useRef } from "react";
import { useStudio, routeTo } from "../../studio.jsx";

const AI_PILL = {
  local_free: "Local Whisper AI",
  groq: "Groq Free AI",
  gemini: "Gemini Free AI",
  openrouter: "OpenRouter Free",
  openai: "OpenAI BYOK",
};

export default function TopHeader({ variant = "material" }) {
  const { navigate, route, settings, search, setSearch, exportAll, busy, setSidebarOpen } = useStudio();
  const aiLabel = AI_PILL[settings?.ai_provider] || "Local Whisper AI";
  const searchRef = useRef(null);

  // Cmd/Ctrl+K focuses the search input
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const onExportAll = async () => {
    if (route.name === "editor" && route.projectId) {
      await exportAll(route.projectId);
    } else {
      navigate(routeTo("projects"));
    }
  };

  if (variant === "editorial") {
    return (
      <header className="fixed top-0 left-0 lg:left-64 right-0 h-14 bg-white/95 backdrop-blur-xl border-b border-[#e2e8f0] z-30 flex items-center justify-between px-4 shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
        <div className="flex items-center gap-2 lg:gap-4 min-w-0 flex-1">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden p-1.5 rounded text-[#64748b] hover:bg-[#f1f5f9] hover:text-[#0f172a] transition-colors shrink-0"
            aria-label="Open menu"
          >
            <span className="material-symbols-outlined text-[22px]">menu</span>
          </button>
          <div className="relative w-48 sm:w-72 max-w-sm">
            <span className="material-symbols-outlined text-[16px] text-[#94a3b8] absolute left-2.5 top-1/2 -translate-y-1/2">
              search
            </span>
            <input
              ref={searchRef}
              className="w-full bg-[#f8fafc] border border-[#e2e8f0] rounded pl-8 pr-8 py-1 font-label-code-md text-label-code-md text-[#0f172a] placeholder:text-[#94a3b8] focus:bg-white focus:outline-none focus:border-[#b45309] transition-colors"
              placeholder="Search clips, markers, projects..."
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <kbd className="absolute right-2 top-1/2 -translate-y-1/2 font-label-code-sm text-label-code-sm text-[#64748b] bg-white px-1 py-0.5 rounded border border-[#e2e8f0] hidden sm:block">
              ⌘K
            </kbd>
          </div>
          <div className="hidden md:flex items-center gap-1 px-2.5 py-1 rounded bg-[#f8fafc] border border-[#e2e8f0]">
            <span className="material-symbols-outlined text-[#b45309] text-[14px]">auto_awesome</span>
            <span className="font-label-code-sm text-label-code-sm text-[#1e293b] font-medium">{aiLabel}</span>
            <span className="w-1.5 h-1.5 rounded-full bg-[#10b981]" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate(routeTo("dashboard"))}
            className="flex items-center gap-1 px-3 py-1.5 rounded bg-[#b45309] text-white hover:bg-[#903f00] transition-colors font-title-sm text-title-sm font-semibold shadow-sm whitespace-nowrap"
          >
            <span className="material-symbols-outlined text-[16px]">add</span>
            <span className="hidden sm:inline">+ New Video</span>
          </button>
          <button
            type="button"
            onClick={onExportAll}
            disabled={busy[`export_all_${route.projectId}`]}
            className="hidden sm:flex items-center gap-1 px-3 py-1.5 rounded bg-white border border-[#e2e8f0] text-[#0f172a] hover:border-[#b45309] hover:text-[#b45309] transition-colors font-title-sm text-title-sm shadow-sm"
          >
            <span className="material-symbols-outlined text-[16px] text-[#64748b]">ios_share</span>
            <span>Export All</span>
          </button>
          <div className="h-5 w-px bg-[#e2e8f0] mx-1 hidden sm:block" />
          <button
            type="button"
            onClick={() => navigate(routeTo("settings"))}
            className="p-1.5 rounded text-[#64748b] hover:bg-[#f1f5f9] hover:text-[#0f172a] transition-colors"
            title="Settings"
          >
            <span className="material-symbols-outlined text-[20px]">settings</span>
          </button>
          <button
            type="button"
            className="w-8 h-8 rounded-full bg-[#f8fafc] border border-[#e2e8f0] flex items-center justify-center hover:border-[#b45309] transition-colors shrink-0"
            title="Profile"
          >
            <span className="material-symbols-outlined text-[#b45309] text-[18px]">person</span>
          </button>
        </div>
      </header>
    );
  }

  return (
    <header className="fixed top-0 left-0 lg:left-64 right-0 h-16 bg-surface/80 backdrop-blur-xl shadow-[0_1px_8px_rgba(0,0,0,0.04)] z-30 px-margin flex items-center justify-between gap-gutter">
      <div className="flex items-center gap-space-md flex-1 max-w-md min-w-0">
        <button
          type="button"
          onClick={() => setSidebarOpen(true)}
          className="lg:hidden p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors shrink-0"
          aria-label="Open menu"
        >
          <span className="material-symbols-outlined text-[22px]">menu</span>
        </button>
        <div className="relative w-full flex items-center">
          <span className="material-symbols-outlined absolute left-space-sm text-on-surface-variant text-[18px]">
            search
          </span>
          <input
            ref={searchRef}
            className="w-full pl-9 pr-12 py-1.5 bg-surface-container-lowest rounded-lg font-body-sm text-body-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:ring-2 focus:ring-primary-container/30 shadow-[0_1px_4px_rgba(0,0,0,0.02)]"
            placeholder="Search clips, markers, transcripts..."
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <span className="absolute right-space-sm px-1.5 py-0.5 rounded bg-surface-container font-label-sm text-label-sm text-on-surface-variant hidden sm:block">
            ⌘K
          </span>
        </div>
      </div>
      <div className="flex items-center gap-space-md">
        <div className="flex items-center gap-space-xs px-space-sm py-1 bg-tertiary-fixed rounded-full hidden md:flex">
          <span className="material-symbols-outlined text-[16px] text-on-tertiary-fixed-variant">auto_awesome</span>
          <span className="font-label-sm text-label-sm text-on-tertiary-fixed font-semibold">{aiLabel}</span>
        </div>
        <button
          type="button"
          onClick={onExportAll}
          className="hidden sm:flex px-space-md py-1.5 rounded-lg bg-surface-container-lowest text-on-surface font-body-sm text-body-sm hover:bg-surface-container-high transition-colors shadow-[0_1px_4px_rgba(0,0,0,0.02)] items-center gap-space-xs"
        >
          <span className="material-symbols-outlined text-[16px]">file_upload</span>
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
          className="text-on-surface-variant hover:text-on-surface transition-colors p-1 flex items-center justify-center focus-visible:ring-2 focus-visible:ring-primary-container/30 rounded-lg"
          title="Settings"
        >
          <span className="material-symbols-outlined text-[20px]">tune</span>
        </button>
        <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center shrink-0">
          <span className="material-symbols-outlined text-on-primary text-[18px]">person</span>
        </div>
      </div>
    </header>
  );
}
