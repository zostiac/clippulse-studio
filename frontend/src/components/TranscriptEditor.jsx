import React, { useState, useEffect, useRef } from "react";
import { Save, Check } from "lucide-react";
import { fmtTime } from "../api";

function distributeWords(text, start, end) {
  const tokens = text.split(/\s+/).filter(Boolean);
  if (!tokens.length) return [];
  const dur = Math.max(0, end - start);
  const step = dur / tokens.length;
  return tokens.flatMap((tok, idx) => {
    const wordStart = start + idx * step;
    const wordEnd = idx === tokens.length - 1 ? end : start + (idx + 1) * step;
    return wordEnd > wordStart ? [{ word: tok, start: wordStart, end: wordEnd }] : [];
  });
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
  const [saving, setSaving] = useState(false);
  const [savedToast, setSavedToast] = useState(false);
  const [saveError, setSaveError] = useState("");
  const previousProjectId = useRef(project.id);
  const editRevision = useRef(0);
  const saveRequestId = useRef(0);
  const savingRef = useRef(false);

  useEffect(() => {
    // Export polling refreshes the project object frequently. Never discard
    // unsaved transcript edits just because that refreshed array has a new identity.
    if (previousProjectId.current !== project.id) {
      previousProjectId.current = project.id;
      editRevision.current += 1;
      saveRequestId.current += 1;
      savingRef.current = false;
      setSaving(false);
      setSegments(project.transcript || []);
      setDirty(false);
      setSavedToast(false);
      setSaveError("");
      return;
    }
    if (!dirty) setSegments(project.transcript || []);
  }, [project.id, project.transcript, dirty]);

  function handleTextChange(idx, val) {
    editRevision.current += 1;
    setSaveError("");
    setSavedToast(false);
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
    if (savingRef.current) return;
    savingRef.current = true;
    const requestId = ++saveRequestId.current;
    const projectId = project.id;
    const revisionAtSave = editRevision.current;
    const snapshot = segments;
    setSaving(true);
    setSaveError("");
    setSavedToast(false);

    try {
      await onSaveTranscript(snapshot);
      // A user may keep typing while the request is in flight. Only mark the
      // editor clean when the exact revision that was sent is still visible.
      if (
        previousProjectId.current === projectId &&
        editRevision.current === revisionAtSave
      ) {
        setDirty(false);
        setSavedToast(true);
      }
    } catch (error) {
      if (previousProjectId.current === projectId) {
        setSaveError(error.message || "Could not save the transcript.");
      }
    } finally {
      // Ignore completion from an older project/save after the editor switches.
      if (saveRequestId.current === requestId) {
        savingRef.current = false;
        setSaving(false);
      }
    }
  }

  return (
    <div className="space-y-4">
      {/* Trim Start / End */}
      {clip && (
        <div className="p-3 rounded-xl bg-[#0A0B0F] border border-white/10 space-y-2">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Exact Clip Trim (Seconds)
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[10px] text-slate-500 mb-1">Start</label>
              <input
                type="number"
                step="0.2"
                min="0"
                max={Math.max(0, clip.end - 1.5)}
                value={clip.start}
                onChange={(e) => onUpdateRange(parseFloat(e.target.value) || 0, clip.end)}
                className="w-full px-2.5 py-1.5 rounded-lg bg-[#12141D] border border-white/10 text-xs font-mono text-white"
              />
            </div>
            <div>
              <label className="block text-[10px] text-slate-500 mb-1">End</label>
              <input
                type="number"
                step="0.2"
                min={clip.start + 1.5}
                max={project.duration}
                value={clip.end}
                onChange={(e) => onUpdateRange(clip.start, parseFloat(e.target.value) || clip.end)}
                className="w-full px-2.5 py-1.5 rounded-lg bg-[#12141D] border border-white/10 text-xs font-mono text-white"
              />
            </div>
          </div>
        </div>
      )}

      {saveError && (
        <p role="alert" className="rounded-lg border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-[11px] text-rose-200">
          {saveError}
        </p>
      )}

      {/* Transcript Header */}
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          Transcript ({segments.length} lines)
        </span>
        {(dirty || savedToast) && (
          <button
            type="button"
            onClick={handleSave}
            disabled={!dirty || saving}
            className="px-2.5 py-1 rounded-lg disabled:opacity-60 bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-semibold flex items-center gap-1 transition"
          >
            {savedToast && !dirty ? <Check className="w-3 h-3" /> : <Save className="w-3 h-3" />}
            <span>{saving ? "Saving…" : savedToast && !dirty ? "Saved!" : "Save Captions"}</span>
          </button>
        )}
      </div>

      {segments.length === 0 ? (
        <div className="p-4 rounded-xl bg-[#0A0B0F] border border-white/10 text-xs text-slate-400 leading-relaxed">
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
                    ? "bg-violet-500/15 border-violet-500/60"
                    : inClip
                    ? "bg-[#141724] border-white/15"
                    : "bg-[#0A0B0F]/60 border-white/5 opacity-60 hover:opacity-100"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <button
                    type="button"
                    onClick={() => onSeek(seg.start)}
                    className="text-[10px] font-mono text-cyan-300 hover:underline"
                  >
                    {fmtTime(seg.start)} – {fmtTime(seg.end)}
                  </button>
                  {inClip && (
                    <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-300">
                      In Clip
                    </span>
                  )}
                </div>
                <textarea
                  rows={2}
                  value={seg.text}
                  onChange={(e) => handleTextChange(idx, e.target.value)}
                  className="w-full bg-transparent text-xs text-slate-200 focus:outline-none resize-none leading-relaxed"
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
