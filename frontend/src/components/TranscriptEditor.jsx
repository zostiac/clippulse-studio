import React, { useState, useEffect } from "react";
import { Save, Check } from "lucide-react";
import { fmtTime } from "../api";

function distributeWords(text, start, end) {
  const tokens = text.split(/\s+/).filter(Boolean);
  if (!tokens.length) return [];
  const dur = Math.max(0.2, end - start);
  const step = dur / tokens.length;
  return tokens.map((tok, idx) => ({
    word: tok,
    start: start + idx * step,
    end: start + (idx + 1) * step,
  }));
}

export default function TranscriptEditor({
  project,
  clip,
  currentTime,
  onSeek,
  onSaveTranscript,
  onUpdateRange,
}) {
  const [segments, setSegments] = useState(project.transcript || []);
  const [dirty, setDirty] = useState(false);
  const [savedToast, setSavedToast] = useState(false);
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    setSegments(project.transcript || []);
    setDirty(false);
  }, [project.id, project.transcript]);

  function handleTextChange(idx, val) {
    setSegments((prev) =>
      prev.map((s, i) => {
        if (i !== idx) return s;
        const words = distributeWords(val, s.start, s.end);
        return { ...s, text: val, words };
      })
    );
    setDirty(true);
  }

  async function handleSave() {
    setSaveError("");
    try {
      await onSaveTranscript(segments);
    } catch (e) {
      // Keep the edits and the Save button so the user can retry
      setSaveError(e?.message || "Could not save captions.");
      return;
    }
    setDirty(false);
    setSavedToast(true);
    setTimeout(() => setSavedToast(false), 1800);
  }

  return (
    <div className="space-y-4">
      {/* Trim Start / End */}
      {clip && (
        <div className="p-3 rounded-xl bg-sunken border border-line space-y-2">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">
            Exact Clip Trim (Seconds)
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[10px] text-faint mb-1">Start</label>
              <input
                type="number"
                step="0.2"
                min="0"
                max={Math.max(0, clip.end - 1.5)}
                value={clip.start}
                onChange={(e) => onUpdateRange(parseFloat(e.target.value) || 0, clip.end)}
                className="w-full px-2.5 py-1.5 rounded-lg bg-raised border border-line text-xs tabular-nums text-ink"
              />
            </div>
            <div>
              <label className="block text-[10px] text-faint mb-1">End</label>
              <input
                type="number"
                step="0.2"
                min={clip.start + 1.5}
                max={project.duration}
                value={clip.end}
                onChange={(e) => onUpdateRange(clip.start, parseFloat(e.target.value) || clip.end)}
                className="w-full px-2.5 py-1.5 rounded-lg bg-raised border border-line text-xs tabular-nums text-ink"
              />
            </div>
          </div>
        </div>
      )}

      {/* Transcript Header */}
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">
          Transcript ({segments.length} lines)
        </span>
        {(dirty || savedToast) && (
          <button
            onClick={handleSave}
            className="px-2.5 py-1 rounded-lg bg-ok hover:brightness-110 text-on-ok text-[11px] font-semibold flex items-center gap-1 transition"
          >
            {savedToast ? <Check className="w-3 h-3" /> : <Save className="w-3 h-3" />}
            <span>{savedToast ? "Saved!" : "Save Captions"}</span>
          </button>
        )}
      </div>

      {saveError && (
        <div role="alert" className="p-2.5 rounded-lg bg-bad/10 border border-bad/30 text-[11px] text-bad">
          {saveError}
        </div>
      )}

      {segments.length === 0 ? (
        <div className="p-4 rounded-xl bg-sunken border border-line text-xs text-muted leading-relaxed">
          No transcript detected yet. Make sure free Local Whisper is enabled in Settings and click Re-scan, or upload an .srt/.vtt file.
        </div>
      ) : (
        <div className="space-y-2">
          {segments.map((seg, idx) => {
            const inClip = clip && seg.end >= clip.start && seg.start <= clip.end;
            const isActive = currentTime >= seg.start && currentTime <= seg.end;
            return (
              <div
                key={seg.id || idx}
                className={`p-2.5 rounded-xl border transition ${
                  isActive
                    ? "bg-accent/15 border-accent/60"
                    : inClip
                    ? "bg-raised border-line-strong"
                    : "bg-sunken/60 border-line opacity-60 hover:opacity-100"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <button
                    type="button"
                    onClick={() => onSeek(seg.start)}
                    className="text-[10px] tabular-nums text-accent hover:underline"
                  >
                    {fmtTime(seg.start)} – {fmtTime(seg.end)}
                  </button>
                  {inClip && (
                    <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-accent/20 text-accent">
                      In Clip
                    </span>
                  )}
                </div>
                <textarea
                  rows={2}
                  value={seg.text}
                  onChange={(e) => handleTextChange(idx, e.target.value)}
                  className="w-full bg-transparent text-xs text-ink focus:outline-none resize-none leading-relaxed"
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
