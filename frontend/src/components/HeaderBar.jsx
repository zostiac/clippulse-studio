import React from "react";
import {
  Scissors,
  Plus,
  Settings,
  Sparkles,
  Download,
  Layers,
  Cpu,
  CheckCircle2,
} from "lucide-react";

export default function HeaderBar({
  project,
  settings,
  onGoHome,
  onOpenSettings,
  onExportAll,
  exportingAll,
}) {
  const exportedCount = project
    ? project.clips.filter((c) => c.export_status === "done").length
    : 0;

  return (
    <header className="cp-header h-14 shrink-0 border-b border-white/10 bg-[#0E1017]/95 backdrop-blur px-4 flex items-center justify-between gap-3 z-30">
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={onGoHome}
          className="flex items-center gap-2.5 group focus:outline-none"
          title="Back to Projects"
        >
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-cyan-400 flex items-center justify-center shadow-lg shadow-violet-500/20 group-hover:scale-105 transition-transform">
            <Scissors className="w-4 h-4 text-white" />
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="font-bold tracking-tight text-white text-base">
              ClipPulse
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-300 border border-violet-500/25">
              Studio
            </span>
          </div>
        </button>

        {project && (
          <>
            <span className="text-slate-600 hidden sm:inline">/</span>
            <div className="hidden sm:flex items-center gap-2 min-w-0">
              <span className="text-sm font-medium text-slate-200 truncate max-w-[260px] md:max-w-[380px]">
                {project.title}
              </span>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/5 text-slate-400 border border-white/10 shrink-0">
                {project.clips.length} clips
              </span>
            </div>
          </>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={onOpenSettings}
          className={`hidden md:flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition hover:brightness-110 ${
            settings?.has_api_key && settings?.ai_provider !== "local_free"
              ? "bg-cyan-500/10 text-cyan-300 border-cyan-500/25"
              : "bg-emerald-500/10 text-emerald-300 border-emerald-500/25"
          }`}
          title="Click to configure Free AI Provider or Local Whisper"
        >
          {settings?.has_api_key && settings?.ai_provider !== "local_free" ? (
            <Sparkles className="w-3.5 h-3.5" />
          ) : (
            <Cpu className="w-3.5 h-3.5" />
          )}
          <span>
            {settings?.ai_provider === "groq" && settings?.has_api_key
              ? "Groq Free AI"
              : settings?.ai_provider === "gemini" && settings?.has_api_key
              ? "Gemini Free AI"
              : settings?.ai_provider === "openrouter" && settings?.has_api_key
              ? "OpenRouter Free"
              : settings?.ai_provider === "openai" && settings?.has_api_key
              ? "OpenAI BYOK"
              : "100% Free Local AI"}
          </span>
        </button>

        {project && (
          <>
            <button
              onClick={onGoHome}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-200 border border-white/10 transition"
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">New Video</span>
            </button>

            <button
              onClick={onExportAll}
              disabled={exportingAll || project.clips.length === 0}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white transition shadow-sm shadow-violet-600/30"
            >
              <Layers className="w-3.5 h-3.5" />
              <span>{exportingAll ? "Rendering..." : "Export All"}</span>
            </button>

            {exportedCount > 0 && (
              <a
                href={`/api/projects/${project.id}/download-bundle`}
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-emerald-600/90 hover:bg-emerald-500 text-white transition"
                title="Download all exported MP4s + YT/IG/TikTok captions as ZIP"
              >
                <Download className="w-3.5 h-3.5" />
                <span className="hidden lg:inline">
                  ZIP ({exportedCount})
                </span>
              </a>
            )}
          </>
        )}

        <button
          onClick={onOpenSettings}
          className="relative p-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10 transition"
          title="Settings: OpenAI API Key & YouTube Cookies"
        >
          <Settings className="w-4 h-4" />
          {settings?.has_youtube_cookies && (
            <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400 absolute -top-0.5 -right-0.5 bg-[#0E1017] rounded-full" />
          )}
        </button>
      </div>
    </header>
  );
}
