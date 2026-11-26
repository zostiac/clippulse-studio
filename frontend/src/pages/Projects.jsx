import React, { useMemo, useState } from "react";
import { useStudio, routeTo } from "../studio.jsx";
import { fmtDur, fmtRelTime, fmtBytes, clamp } from "../utils/format.js";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "ingested", label: "Ingested" },
  { key: "editor", label: "In Editor" },
  { key: "exported", label: "Exported" },
  { key: "archived", label: "Archived" },
];

function statusKey(p) {
  if (p.archived) return "archived";
  if (p.status === "ingesting" || p.status === "analyzing") return "ingested";
  const exported = (p.clips || []).some((c) => c.export_status === "done");
  return exported ? "exported" : "editor";
}

function statusPill(p) {
  const key = statusKey(p);
  if (key === "ingested") {
    return (
      <span className="px-2.5 py-1 rounded-full bg-teal-50 border border-teal-200 text-teal-800 font-mono text-[10px] font-semibold uppercase tracking-wider flex items-center gap-1.5 shadow-sm">
        <span className="w-1.5 h-1.5 rounded-full bg-teal-600 animate-ping" />
        Ingesting &amp; Analyzing
      </span>
    );
  }
  if (key === "exported") {
    return (
      <span className="px-2.5 py-1 rounded-full bg-indigo-600/90 backdrop-blur-md text-white font-mono text-[10px] font-semibold uppercase tracking-wider shadow-sm">
        Rendered &amp; Exported
      </span>
    );
  }
  if (key === "archived") {
    return (
      <span className="px-2.5 py-1 rounded-full bg-slate-900/80 backdrop-blur-md text-white font-mono text-[10px] font-semibold uppercase tracking-wider shadow-sm">
        Archived
      </span>
    );
  }
  return (
    <span className="px-2.5 py-1 rounded-full bg-amber-500/90 backdrop-blur-md text-white font-mono text-[10px] font-semibold uppercase tracking-wider shadow-sm">
      Active in Editor
    </span>
  );
}

export default function Projects() {
  const {
    projects,
    analytics,
    navigate,
    deleteProject,
    setArchived,
    reanalyze,
    exportAll,
    search,
  } = useStudio();
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("modified");
  const [view, setView] = useState("grid");
  const [selected, setSelected] = useState(() => new Set());

  const toggleSelect = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filtered = useMemo(() => {
    const q = (search || "").trim().toLowerCase();
    let list = projects.filter((p) => (filter === "all" ? !p.archived : statusKey(p) === filter));
    if (q) {
      list = list.filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          (p.clips || []).some((c) => c.title.toLowerCase().includes(q))
      );
    }
    const sorted = [...list];
    if (sort === "modified") sorted.sort((a, b) => b.created_at - a.created_at);
    else if (sort === "score") {
      sorted.sort(
        (a, b) =>
          Math.max(0, ...(b.clips || []).map((c) => c.viral_score)) -
          Math.max(0, ...(a.clips || []).map((c) => c.viral_score))
      );
    } else if (sort === "duration") sorted.sort((a, b) => b.duration - a.duration);
    else sorted.sort((a, b) => a.title.localeCompare(b.title));
    return sorted;
  }, [projects, filter, sort, search]);

  const totalClips = projects.reduce((n, p) => n + (p.clips?.length || 0), 0);
  const storageUsed = analytics?.storage?.total_bytes ?? 0;
  const vaultPct = clamp((storageUsed / (500 * 1024 ** 3)) * 100, 2, 100);

  const batchExport = async () => {
    for (const id of selected) await exportAll(id);
  };
  const batchTranscribe = async () => {
    for (const id of selected) await reanalyze(id);
  };
  const batchArchive = async () => {
    for (const id of selected) await setArchived(id, true);
    setSelected(new Set());
  };
  const batchDelete = async () => {
    if (!window.confirm(`Delete ${selected.size} project(s)? This cannot be undone.`)) return;
    for (const id of selected) await deleteProject(id);
    setSelected(new Set());
  };

  return (
    <div className="px-8 py-6 flex flex-col gap-6">
      {/* Page header */}
      <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <span className="font-mono text-[11px] uppercase tracking-widest text-[#b45309] font-semibold">02 / Media Vault</span>
            <span className="text-[#cbd5e1]">•</span>
            <span className="px-2.5 py-0.5 rounded-full bg-white border border-[#e2e8f0] text-[#64748b] font-mono text-[11px] shadow-sm">
              {projects.length} Projects • {totalClips} Clips
            </span>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-[#0f172a] font-headline-lg">Studio Library &amp; Archives</h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-3 px-4 py-2 rounded-xl bg-white border border-[#e2e8f0] shadow-sm">
            <div className="flex flex-col">
              <span className="font-mono text-[10px] uppercase tracking-wider text-[#64748b]">Vault Capacity</span>
              <span className="font-mono text-xs font-semibold text-[#0f172a]">
                {fmtBytes(storageUsed)} / 500 GB
              </span>
            </div>
            <div className="w-24 h-1.5 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
              <div className="h-full bg-[#b45309] rounded-full" style={{ width: `${vaultPct}%` }} />
            </div>
          </div>
          <div className="flex items-center p-1 rounded-xl bg-white border border-[#e2e8f0] shadow-sm">
            <button
              type="button"
              onClick={() => setView("grid")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium text-xs shadow-sm transition-all ${
                view === "grid" ? "bg-[#0f172a] text-white" : "text-[#64748b] hover:text-[#0f172a] hover:bg-slate-50"
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">grid_view</span>
              <span>Grid</span>
            </button>
            <button
              type="button"
              onClick={() => setView("list")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium text-xs transition-all ${
                view === "list" ? "bg-[#0f172a] text-white shadow-sm" : "text-[#64748b] hover:text-[#0f172a] hover:bg-slate-50"
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">view_list</span>
              <span>List</span>
            </button>
          </div>
        </div>
      </div>

      {/* Filters & sort */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={`px-3.5 py-1.5 rounded-full text-xs shadow-sm transition-all ${
                filter === f.key
                  ? "bg-[#0f172a] text-white font-semibold"
                  : "bg-white border border-[#e2e8f0] text-[#64748b] hover:text-[#0f172a] hover:border-slate-300 font-medium"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-[11px] uppercase tracking-wider text-[#64748b]">Sort by</span>
          <div className="relative">
            <select
              className="appearance-none bg-white border border-[#e2e8f0] text-[#0f172a] text-xs font-medium pl-3.5 pr-9 py-2 rounded-xl shadow-sm focus:outline-none focus:border-slate-400 cursor-pointer"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
            >
              <option value="modified">Last Modified</option>
              <option value="score">Viral Score (High-Low)</option>
              <option value="duration">Duration</option>
              <option value="alpha">Alphabetical</option>
            </select>
            <span className="material-symbols-outlined text-[16px] text-[#64748b] absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
              expand_more
            </span>
          </div>
        </div>
      </div>

      {/* Bulk dock */}
      <div
        className="flex flex-wrap items-center justify-between gap-4 px-5 py-3 rounded-xl bg-white border border-[#e2e8f0] shadow-sm transition-opacity"
        style={{ opacity: selected.size > 0 ? 1 : 0.4 }}
      >
        <div className="flex items-center gap-3">
          <span className="w-2 h-2 rounded-full bg-[#b45309] animate-pulse" />
          <span className="font-mono text-xs font-semibold text-[#0f172a]">
            <span>{selected.size}</span> Selected
          </span>
          <span className="text-[#cbd5e1]">|</span>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={!selected.size}
              onClick={batchExport}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-[#b45309] hover:bg-amber-100 text-xs font-medium transition-colors disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-[15px]">ios_share</span>
              <span>Batch Export 9:16</span>
            </button>
            <button
              type="button"
              disabled={!selected.size}
              onClick={batchTranscribe}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-50 border border-[#e2e8f0] text-[#1e293b] hover:bg-slate-100 text-xs font-medium transition-colors disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-[15px] text-[#64748b]">subtitles</span>
              <span>Transcribe</span>
            </button>
            <button
              type="button"
              disabled={!selected.size}
              onClick={batchArchive}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-50 border border-[#e2e8f0] text-[#1e293b] hover:bg-slate-100 text-xs font-medium transition-colors disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-[15px] text-[#64748b]">archive</span>
              <span>Archive</span>
            </button>
            <button
              type="button"
              disabled={!selected.size}
              onClick={batchDelete}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 hover:bg-rose-100 text-xs font-medium transition-colors disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-[15px]">delete</span>
              <span>Delete</span>
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setSelected(new Set())}
          className="font-mono text-[11px] text-[#64748b] hover:text-[#0f172a] transition-colors"
        >
          Clear Selection
        </button>
      </div>

      {/* Cards / list */}
      {filtered.length === 0 ? (
        <div className="px-6 py-12 rounded-xl bg-white border border-[#e2e8f0] shadow-sm text-center">
          <p className="font-body-md text-[#64748b]">Nothing here yet. Ingest a video from the Dashboard to fill your vault.</p>
        </div>
      ) : view === "grid" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
          {filtered.map((p) => {
            const key = statusKey(p);
            const topScore = Math.max(0, ...(p.clips || []).map((c) => c.viral_score));
            const exportedCount = (p.clips || []).filter((c) => c.export_status === "done").length;
            const isSel = selected.has(p.id);
            return (
              <div
                key={p.id}
                className="group relative flex flex-col rounded-xl bg-white border border-[#e2e8f0] shadow-sm hover:shadow-md overflow-hidden transition-all duration-300 hover:-translate-y-1"
              >
                {key === "ingested" ? (
                  <div className="relative aspect-[9/12] w-full overflow-hidden bg-slate-50 flex flex-col justify-between p-4 border-b border-slate-100">
                    <div className="absolute inset-0 bg-gradient-to-br from-amber-50/50 via-slate-50 to-teal-50/50" />
                    <div className="relative z-10 flex items-center justify-between">
                      <label className="cursor-pointer flex items-center justify-center w-6 h-6 rounded-md bg-white shadow-sm border border-[#e2e8f0]">
                        <input
                          className="accent-[#b45309] w-4 h-4 cursor-pointer"
                          type="checkbox"
                          checked={isSel}
                          onChange={() => toggleSelect(p.id)}
                        />
                      </label>
                      {statusPill(p)}
                    </div>
                    <div className="relative z-10 flex flex-col items-center justify-center gap-3 my-auto">
                      <div className="w-16 h-16 rounded-2xl bg-white border border-[#e2e8f0] flex items-center justify-center text-[#b45309] shadow-sm">
                        <span className="material-symbols-outlined text-[32px] animate-pulse">graphic_eq</span>
                      </div>
                      <div className="flex flex-col items-center gap-1 w-full px-2">
                        <div className="flex items-center justify-between w-full font-mono text-xs">
                          <span className="text-[#b45309] font-semibold">AI</span>
                          <span className="text-[#64748b]">working…</span>
                        </div>
                        <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-[#b45309] to-teal-600 rounded-full animate-pulse w-2/3" />
                        </div>
                      </div>
                    </div>
                    <div className="relative z-10 flex items-center justify-between font-mono text-[10px] text-[#64748b]">
                      <span>AI Hook Detection</span>
                      <span>Whisper</span>
                    </div>
                  </div>
                ) : (
                  <div className="relative aspect-[9/12] w-full overflow-hidden bg-slate-100">
                    {p.thumbnail_url ? (
                      <img
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                        src={p.thumbnail_url}
                        alt=""
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-slate-200 to-slate-100" />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/40" />
                    <div className="absolute top-3 left-3 right-3 flex items-center justify-between">
                      <label className="cursor-pointer flex items-center justify-center w-6 h-6 rounded-md bg-white/90 backdrop-blur-md shadow-sm">
                        <input
                          className="accent-[#b45309] w-4 h-4 cursor-pointer"
                          type="checkbox"
                          checked={isSel}
                          onChange={() => toggleSelect(p.id)}
                        />
                      </label>
                      {statusPill(p)}
                    </div>
                    <button
                      type="button"
                      className="absolute inset-0 flex items-center justify-center"
                      onClick={() => navigate(routeTo("editor", p.id))}
                    >
                      <div className="w-12 h-12 rounded-full bg-white/90 backdrop-blur-md flex items-center justify-center text-[#b45309] group-hover:scale-110 shadow-md transition-transform">
                        <span className="material-symbols-outlined text-[26px] filled">play_arrow</span>
                      </div>
                    </button>
                    <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between">
                      <span className="px-2.5 py-1 rounded-md bg-emerald-600/90 backdrop-blur-md text-white font-mono text-[11px] font-semibold">
                        {topScore} Viral
                      </span>
                      <span className="px-2 py-0.5 rounded bg-white/90 backdrop-blur-md text-slate-800 font-mono text-[10px] font-medium">
                        {fmtDur(p.duration)}
                      </span>
                    </div>
                  </div>
                )}
                <div className="p-4 flex flex-col flex-1 justify-between gap-4">
                  <div className="flex flex-col gap-2">
                    <h2 className="text-sm font-semibold text-[#0f172a] leading-snug line-clamp-2">{p.title}</h2>
                    <div
                      className={`flex items-center gap-2 text-xs font-medium ${
                        key === "exported" ? "text-indigo-600" : key === "ingested" ? "text-teal-700" : "text-[#b45309]"
                      }`}
                    >
                      <span className="material-symbols-outlined text-[15px]">
                        {key === "exported" ? "check_circle" : key === "ingested" ? "memory" : "auto_awesome"}
                      </span>
                      <span>
                        {key === "exported"
                          ? `${exportedCount} Clips Exported`
                          : key === "ingested"
                            ? "Scanning Transcript & Audio"
                            : `${p.clips?.length || 0} Viral Clips Detected`}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 mt-1">
                      <span className="px-2 py-0.5 rounded bg-slate-100 text-[#64748b] font-mono text-[10px]">YT Shorts</span>
                      <span className="px-2 py-0.5 rounded bg-slate-100 text-[#64748b] font-mono text-[10px]">IG Reels</span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-3 pt-2 border-t border-slate-100">
                    <div className="flex items-center justify-between font-mono text-[11px] text-[#64748b]">
                      <span>{key === "exported" ? "Exported" : "Last Edited"}: {fmtRelTime(p.created_at)}</span>
                    </div>
                    <button
                      type="button"
                      disabled={key === "ingested"}
                      onClick={() => navigate(routeTo("editor", p.id))}
                      className={`w-full py-2.5 rounded-lg font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors ${
                        key === "ingested"
                          ? "bg-slate-50 border border-slate-200 text-[#94a3b8] cursor-not-allowed"
                          : "bg-[#b45309] text-white hover:bg-[#d97706] shadow-sm"
                      }`}
                    >
                      <span className="material-symbols-outlined text-[16px]">
                        {key === "ingested" ? "hourglass_top" : key === "exported" ? "video_library" : "movie_edit"}
                      </span>
                      <span>
                        {key === "ingested" ? "Processing..." : key === "exported" ? "View Clips" : "Resume Editing"}
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col rounded-xl bg-white border border-[#e2e8f0] shadow-sm overflow-hidden">
          {filtered.map((p) => (
            <div
              key={p.id}
              className="flex items-center gap-4 px-5 py-3 border-b border-slate-100 last:border-b-0 hover:bg-slate-50 transition-colors"
            >
              <input
                className="accent-[#b45309] w-4 h-4 cursor-pointer"
                type="checkbox"
                checked={selected.has(p.id)}
                onChange={() => toggleSelect(p.id)}
              />
              <div className="w-10 h-14 rounded overflow-hidden bg-slate-100 shrink-0">
                {p.thumbnail_url ? <img className="w-full h-full object-cover" src={p.thumbnail_url} alt="" /> : null}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-[#0f172a] truncate">{p.title}</div>
                <div className="font-mono text-[11px] text-[#64748b]">
                  {p.clips?.length || 0} clips • {fmtDur(p.duration)} • {fmtRelTime(p.created_at)}
                </div>
              </div>
              {statusPill(p)}
              <button
                type="button"
                onClick={() => navigate(routeTo("editor", p.id))}
                className="px-3 py-1.5 rounded-lg bg-[#b45309] text-white text-xs font-semibold hover:bg-[#d97706] transition-colors"
              >
                Open
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Vault summary */}
      <div className="mt-4 px-6 py-4 rounded-xl bg-white border border-[#e2e8f0] shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-[#b45309] text-[20px]">cloud_done</span>
          <span className="font-mono text-xs text-[#64748b]">
            {fmtBytes(storageUsed)} / 500 GB Vault Storage Used
          </span>
        </div>
        <button
          type="button"
          onClick={() => window.alert("Cached proxies are managed automatically by the local export engine.")}
          className="px-4 py-2 rounded-lg bg-slate-50 border border-slate-200 text-[#b45309] hover:bg-amber-50 font-mono text-xs font-semibold transition-colors flex items-center gap-2"
        >
          <span className="material-symbols-outlined text-[16px]">cleaning_services</span>
          <span>Purge Cached Proxies</span>
        </button>
      </div>
    </div>
  );
}
