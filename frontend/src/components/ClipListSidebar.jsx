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
    try {
      await onCreateClip({
        title: newTitle.trim() || "Custom Viral Short",
        start: Number(newStart),
        end: Number(newEnd),
      });
      setCreating(false);
      setNewTitle("");
    } catch {
      // The error is shown by the app-level banner; keep the form open so nothing is lost.
    }
  }

  function scoreBadgeColor(score) {
    if (score >= 90) return "bg-ok/15 text-ok border-ok/30";
    if (score >= 82) return "bg-accent/15 text-accent border-accent/30";
    return "bg-warn/15 text-warn border-warn/30";
  }

  return (
    <aside className="w-full lg:w-[320px] xl:w-[340px] shrink-0 border-r border-line bg-surface flex flex-col min-h-0">
      {/* Header */}
      <div className="p-3.5 border-b border-line flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Flame className="w-4 h-4 text-accent" />
          <span className="text-xs font-semibold uppercase tracking-wider text-ink">
            Viral Clips ({project.clips.length})
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={onReanalyze}
            disabled={reanalyzing}
            title="Re-scan video for viral moments"
            className="p-1.5 rounded-lg bg-ink/5 hover:bg-ink/10 text-muted hover:text-ink border border-line transition disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${reanalyzing ? "animate-spin" : ""}`} />
          </button>
          <button
            onClick={() => setCreating((v) => !v)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-accent/90 hover:bg-accent-hover text-on-accent text-xs font-medium transition"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Custom</span>
          </button>
        </div>
      </div>

      {project.status_detail && (
        <div className="px-3.5 py-2 text-[11px] leading-relaxed text-warn bg-warn/10 border-b border-warn/20">
          {project.status_detail}
        </div>
      )}

      {/* Inline Custom Clip Form */}
      {creating && (
        <form
          onSubmit={handleAddClip}
          className="p-3.5 border-b border-line bg-raised space-y-2.5"
        >
          <input
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Clip title..."
            className="w-full px-2.5 py-1.5 rounded-lg bg-sunken border border-line text-xs text-ink placeholder:text-faint focus:outline-none focus:border-accent"
          />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] text-muted mb-0.5">
                Start (sec)
              </label>
              <input
                type="number"
                step="0.5"
                min="0"
                max={Math.max(0, project.duration - 2)}
                value={newStart}
                onChange={(e) => setNewStart(e.target.value)}
                className="w-full px-2 py-1 rounded-lg bg-sunken border border-line text-xs tabular-nums text-ink"
              />
            </div>
            <div>
              <label className="block text-[10px] text-muted mb-0.5">
                End (sec)
              </label>
              <input
                type="number"
                step="0.5"
                min="2"
                max={project.duration}
                value={newEnd}
                onChange={(e) => setNewEnd(e.target.value)}
                className="w-full px-2 py-1 rounded-lg bg-sunken border border-line text-xs tabular-nums text-ink"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setCreating(false)}
              className="px-2.5 py-1 rounded text-xs text-muted hover:text-ink"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-3 py-1 rounded-lg bg-accent hover:bg-accent-hover text-xs font-semibold text-on-accent"
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
              className={`group cursor-pointer rounded-xl p-3 border transition ${
                active
                  ? "bg-raised border-accent/70 shadow-lg "
                  : "bg-raised border-line hover:border-line-strong"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[11px] tabular-nums text-faint shrink-0">
                    #{index + 1}
                  </span>
                  <span
                    className={`text-[11px] font-bold px-2 py-0.5 rounded-md border tabular-nums shrink-0 ${scoreBadgeColor(
                      clip.viral_score
                    )}`}
                  >
                    {clip.viral_score} Viral
                  </span>
                  <span className="text-[11px] tabular-nums text-muted flex items-center gap-1 shrink-0">
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
                  className="opacity-0 group-hover:opacity-100 p-1 rounded text-faint hover:text-bad transition"
                  title="Remove clip"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              <h3 className="mt-2 text-xs sm:text-[13px] font-semibold text-ink line-clamp-2 leading-snug">
                {clip.title}
              </h3>

              <div className="mt-2 flex items-center justify-between text-[11px] tabular-nums text-muted">
                <span>
                  {fmtTime(clip.start)} → {fmtTime(clip.end)}
                </span>

                {clip.export_status === "done" && (
                  <span className="inline-flex items-center gap-1 text-ok font-sans font-medium">
                    <CheckCircle2 className="w-3 h-3" /> MP4 Ready
                  </span>
                )}
                {clip.export_status === "rendering" && (
                  <span className="inline-flex items-center gap-1 text-accent font-sans font-medium">
                    <Loader2 className="w-3 h-3 animate-spin" /> {clip.export_progress}%
                  </span>
                )}
              </div>

              {/* Sub-scores mini grid when active */}
              {active && clip.sub_scores && (
                <div className="mt-3 pt-2.5 border-t border-line space-y-2">
                  <div className="grid grid-cols-4 gap-1.5 text-center">
                    {[
                      ["Hook", clip.sub_scores.hook],
                      ["Retain", clip.sub_scores.retention],
                      ["Share", clip.sub_scores.shareability],
                      ["Clarity", clip.sub_scores.clarity],
                    ].map(([lbl, val]) => (
                      <div
                        key={lbl}
                        className="rounded-md bg-sunken px-1.5 py-1 border border-line"
                      >
                        <div className="text-[10px] text-faint">{lbl}</div>
                        <div className="text-xs font-bold text-ink tabular-nums">
                          {val}
                        </div>
                      </div>
                    ))}
                  </div>
                  {clip.reason && (
                    <p className="text-[11px] text-muted leading-relaxed flex items-start gap-1.5">
                      <Sparkles className="w-3 h-3 text-accent shrink-0 mt-0.5" />
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
