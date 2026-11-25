import React, { useState } from "react";
import {
  Flame,
  Plus,
  RefreshCw,
  Trash2,
  CheckCircle2,
  Loader2,
  Clock,
  Sparkles,
} from "lucide-react";
import { fmtTime } from "../api";

export default function ClipListSidebar({
  project,
  selectedClipId,
  onSelectClip,
  onCreateClip,
  onDeleteClip,
  onReanalyze,
  reanalyzing,
}) {
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newStart, setNewStart] = useState(0);
  const [newEnd, setNewEnd] = useState(Math.min(25, Math.round(project.duration || 25)));

  async function handleAddClip(e) {
    e.preventDefault();
    await onCreateClip({
      title: newTitle.trim() || "Custom Viral Short",
      start: Number(newStart),
      end: Number(newEnd),
    });
    setCreating(false);
    setNewTitle("");
  }

  function scoreBadgeColor(score) {
    if (score >= 90) return "bg-emerald-500/15 text-emerald-300 border-emerald-500/30";
    if (score >= 82) return "bg-violet-500/15 text-violet-300 border-violet-500/30";
    return "bg-amber-500/15 text-amber-300 border-amber-500/30";
  }

  return (
    <aside className="cp-clip-sidebar w-full lg:w-[320px] xl:w-[340px] shrink-0 max-h-[34vh] lg:max-h-none min-h-[220px] border-r border-white/10 bg-[#0E1017] flex flex-col min-h-0">
      {/* Header */}
      <div className="p-3.5 border-b border-white/10 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Flame className="w-4 h-4 text-violet-400" />
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-200">
            Viral Clips ({project.clips.length})
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={onReanalyze}
            disabled={reanalyzing}
            title="Re-scan video for viral moments"
            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10 transition disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${reanalyzing ? "animate-spin" : ""}`} />
          </button>
          <button
            onClick={() => setCreating((v) => !v)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-violet-600/90 hover:bg-violet-500 text-white text-xs font-medium transition"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Custom</span>
          </button>
        </div>
      </div>

      {/* Inline Custom Clip Form */}
      {creating && (
        <form
          onSubmit={handleAddClip}
          className="p-3.5 border-b border-white/10 bg-[#141724] space-y-2.5"
        >
          <input
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Clip title..."
            className="w-full px-2.5 py-1.5 rounded-lg bg-[#0A0B0F] border border-white/10 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-violet-500"
          />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] text-slate-400 mb-0.5">
                Start (sec)
              </label>
              <input
                type="number"
                step="0.5"
                min="0"
                max={Math.max(0, project.duration - 2)}
                value={newStart}
                onChange={(e) => setNewStart(e.target.value)}
                className="w-full px-2 py-1 rounded-lg bg-[#0A0B0F] border border-white/10 text-xs font-mono text-white"
              />
            </div>
            <div>
              <label className="block text-[10px] text-slate-400 mb-0.5">
                End (sec)
              </label>
              <input
                type="number"
                step="0.5"
                min="2"
                max={project.duration}
                value={newEnd}
                onChange={(e) => setNewEnd(e.target.value)}
                className="w-full px-2 py-1 rounded-lg bg-[#0A0B0F] border border-white/10 text-xs font-mono text-white"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setCreating(false)}
              className="px-2.5 py-1 rounded text-xs text-slate-400 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-3 py-1 rounded-lg bg-violet-600 hover:bg-violet-500 text-xs font-semibold text-white"
            >
              Add Clip
            </button>
          </div>
        </form>
      )}

      {/* Clips List */}
      <div className="flex-1 overflow-y-auto p-2.5 space-y-2.5">
        {project.clips.map((clip, index) => {
          const active = clip.id === selectedClipId;
          const dur = Math.max(0, clip.end - clip.start);

          return (
            <div
              key={clip.id}
              onClick={() => onSelectClip(clip.id)}
              className={`cp-clip-card group cursor-pointer rounded-xl p-3 border transition ${
                active
                  ? "bg-[#171B2A] border-violet-500/70 shadow-lg shadow-violet-950/30"
                  : "bg-[#12141D] border-white/8 hover:border-white/20"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[11px] font-mono text-slate-500 shrink-0">
                    #{index + 1}
                  </span>
                  <span
                    className={`text-[11px] font-bold px-2 py-0.5 rounded-md border tabular-nums shrink-0 ${scoreBadgeColor(
                      clip.viral_score
                    )}`}
                  >
                    {clip.viral_score} Viral
                  </span>
                  <span className="text-[11px] font-mono text-slate-400 flex items-center gap-1 shrink-0">
                    <Clock className="w-3 h-3" />
                    {dur.toFixed(1)}s
                  </span>
                </div>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteClip(clip.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded text-slate-500 hover:text-rose-400 transition"
                  title="Remove clip"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              <h3 className="mt-2 text-xs sm:text-[13px] font-semibold text-white line-clamp-2 leading-snug">
                {clip.title}
              </h3>

              <div className="mt-2 flex items-center justify-between text-[11px] font-mono text-slate-400">
                <span>
                  {fmtTime(clip.start)} → {fmtTime(clip.end)}
                </span>

                {clip.export_status === "done" && (
                  <span className="inline-flex items-center gap-1 text-emerald-400 font-sans font-medium">
                    <CheckCircle2 className="w-3 h-3" /> MP4 Ready
                  </span>
                )}
                {clip.export_status === "rendering" && (
                  <span className="inline-flex items-center gap-1 text-cyan-300 font-sans font-medium">
                    <Loader2 className="w-3 h-3 animate-spin" /> {clip.export_progress}%
                  </span>
                )}
              </div>

              {/* Sub-scores mini grid when active */}
              {active && clip.sub_scores && (
                <div className="mt-3 pt-2.5 border-t border-white/10 space-y-2">
                  <div className="grid grid-cols-4 gap-1.5 text-center">
                    {[
                      ["Hook", clip.sub_scores.hook],
                      ["Retain", clip.sub_scores.retention],
                      ["Share", clip.sub_scores.shareability],
                      ["Clarity", clip.sub_scores.clarity],
                    ].map(([lbl, val]) => (
                      <div
                        key={lbl}
                        className="rounded-md bg-[#0A0B0F] px-1.5 py-1 border border-white/5"
                      >
                        <div className="text-[10px] text-slate-500">{lbl}</div>
                        <div className="text-xs font-bold text-slate-200 tabular-nums">
                          {val}
                        </div>
                      </div>
                    ))}
                  </div>
                  {clip.reason && (
                    <p className="text-[11px] text-slate-400 leading-relaxed flex items-start gap-1.5">
                      <Sparkles className="w-3 h-3 text-violet-400 shrink-0 mt-0.5" />
                      <span>{clip.reason}</span>
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
}
