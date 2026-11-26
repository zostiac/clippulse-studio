import React from "react";
import { Settings, Download, Layers, Sun, Moon, FolderOpen, Film, Cpu } from "lucide-react";
import { engineLabel } from "../engine";

/** The mark: a rounded square holding a single pulse line. */
function Mark({ className = "" }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="8" className="fill-ink" />
      <path
        d="M4.5 17.5h6l2.6-8.5 4.4 15 3-9.5 1.5 3h5.5"
        fill="none"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="stroke-mark"
      />
    </svg>
  );
}

function NavButton({ active, onClick, icon: Icon, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
        active ? "bg-ink text-canvas" : "text-muted hover:text-ink hover:bg-ink/8"
      }`}
    >
      <Icon className="w-4 h-4" aria-hidden="true" />
      <span className="hidden sm:inline">{children}</span>
    </button>
  );
}

export default function HeaderBar({
  view,
  project,
  settings,
  isDark,
  onToggleTheme,
  onNavigate,
  onExportAll,
  exportingAll,
}) {
  const exportedCount = project ? project.clips.filter((c) => c.export_status === "done").length : 0;
  const inStudio = view === "studio" && !!project;

  return (
    <header className="h-14 shrink-0 border-b border-line bg-surface px-3 sm:px-4 flex items-center justify-between gap-3 z-30">
      <div className="flex items-center gap-2 sm:gap-4 min-w-0">
        <button
          type="button"
          onClick={() => onNavigate("home")}
          className="flex items-center gap-2.5 shrink-0"
          aria-label="ClipPulse Studio home"
        >
          <Mark className="w-8 h-8" />
          <span className="hidden sm:inline font-display font-bold text-lg tracking-tight text-ink">ClipPulse</span>
        </button>

        <nav aria-label="Main" className="flex items-center gap-1">
          <NavButton active={view === "home"} onClick={() => onNavigate("home")} icon={FolderOpen}>
            Projects
          </NavButton>
          {project && (
            <NavButton active={view === "studio"} onClick={() => onNavigate("studio")} icon={Film}>
              Studio
            </NavButton>
          )}
          <NavButton active={view === "settings"} onClick={() => onNavigate("settings")} icon={Settings}>
            Settings
          </NavButton>
        </nav>

        {inStudio && (
          <span
            className="hidden md:block truncate max-w-[260px] lg:max-w-[420px] text-sm text-muted border-l border-line pl-4"
            title={project.title}
          >
            {project.title}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onNavigate("settings", "engine")}
          className="hidden lg:flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border border-line text-muted hover:text-ink hover:border-line-strong transition-colors"
          title="Open engine settings"
        >
          <Cpu className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Engine: {engineLabel(settings)}</span>
        </button>

        {inStudio && (
          <>
            <button
              type="button"
              onClick={onExportAll}
              disabled={exportingAll || project.clips.length === 0}
              className="flex items-center gap-1.5 text-sm font-semibold px-3 py-1.5 rounded-lg bg-accent hover:bg-accent-hover text-on-accent transition-colors disabled:opacity-50"
            >
              <Layers className="w-4 h-4" aria-hidden="true" />
              <span>{exportingAll ? "Rendering..." : "Export all"}</span>
            </button>

            {exportedCount > 0 && (
              <a
                href={`/api/projects/${project.id}/download-bundle`}
                className="flex items-center gap-1.5 text-sm font-semibold px-3 py-1.5 rounded-lg bg-ok text-on-ok hover:brightness-110 transition"
                title="Download the exported MP4s and the YouTube, Instagram and TikTok captions as a ZIP"
              >
                <Download className="w-4 h-4" aria-hidden="true" />
                <span className="hidden sm:inline">Download ZIP ({exportedCount})</span>
                <span className="sm:hidden">{exportedCount}</span>
              </a>
            )}
          </>
        )}

        <button
          type="button"
          onClick={onToggleTheme}
          aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
          title={isDark ? "Switch to light theme" : "Switch to dark theme"}
          className="p-2 rounded-lg border border-line text-muted hover:text-ink hover:border-line-strong transition-colors"
        >
          {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
      </div>
    </header>
  );
}
