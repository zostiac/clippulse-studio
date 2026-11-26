import React, { useMemo, useState } from "react";
import { Film, Search, Trash2, Check, X } from "lucide-react";
import { fmtTimeShort } from "../api";

const SORTS = [
  { value: "newest", label: "Newest first" },
  { value: "title", label: "Title A to Z" },
  { value: "score", label: "Highest clip score" },
];

const SOURCE_LABEL = { youtube: "YouTube", upload: "Upload", demo: "Sample" };

function topScore(p) {
  const scores = (p.clips || []).map((c) => Number(c.viral_score) || 0);
  return scores.length ? Math.max(...scores) : 0;
}

/** One bar per clip, in timeline order; the strongest clip is highlighted. */
function PulseStrip({ clips }) {
  if (!clips.length) {
    return <div className="h-7 flex items-center text-xs text-faint">No clips found</div>;
  }
  const ordered = [...clips].sort((a, b) => a.start - b.start).slice(0, 24);
  const top = Math.max(...ordered.map((c) => Number(c.viral_score) || 0));
  return (
    <div className="flex items-end gap-[3px] h-7" role="img" aria-label={`${clips.length} clips, best score ${top}`}>
      {ordered.map((c) => {
        const score = Number(c.viral_score) || 0;
        const h = Math.max(18, Math.min(100, ((score - 50) / 50) * 100));
        return (
          <span
            key={c.id}
            style={{ height: `${h}%` }}
            className={`w-1.5 rounded-[2px] ${score === top ? "bg-accent" : "bg-ink/25"}`}
          />
        );
      })}
    </div>
  );
}

function ProjectCard({ project: p, onOpen, onDelete }) {
  const [confirming, setConfirming] = useState(false);
  const exported = (p.clips || []).filter((c) => c.export_status === "done").length;
  const created = p.created_at ? new Date(p.created_at * 1000).toLocaleDateString() : "";

  return (
    <article className="rounded-xl border border-line bg-raised overflow-hidden flex flex-col hover:border-line-strong transition-colors">
      <button type="button" onClick={() => onOpen(p.id)} className="text-left flex-1 flex flex-col" aria-label={`Open ${p.title}`}>
        <div className="aspect-video bg-sunken relative overflow-hidden">
          {p.thumbnail_url ? (
            <img src={p.thumbnail_url} alt="" loading="lazy" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-faint">
              <Film className="w-8 h-8" aria-hidden="true" />
            </div>
          )}
          <span className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-black/80 text-white text-xs tabular-nums">
            {fmtTimeShort(p.duration)}
          </span>
        </div>
        <div className="p-4 space-y-3 flex-1">
          <div>
            <h3 className="font-display font-bold text-ink leading-snug line-clamp-2">{p.title}</h3>
            <p className="text-xs text-faint mt-1">
              {SOURCE_LABEL[p.source_type] || p.source_type}
              {created ? `, added ${created}` : ""}
            </p>
          </div>
          <PulseStrip clips={p.clips || []} />
          <p className="text-sm text-muted tabular-nums">
            {p.clips.length} {p.clips.length === 1 ? "clip" : "clips"}
            {p.clips.length > 0 ? `, ${exported} exported` : ""}
          </p>
        </div>
      </button>

      <div className="px-4 py-2.5 border-t border-line flex items-center justify-end gap-2 min-h-[46px]">
        {confirming ? (
          <>
            <span className="text-sm text-ink mr-auto">Delete this project and its files?</span>
            <button
              type="button"
              onClick={() => onDelete(p.id)}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-bad text-on-accent hover:brightness-110"
            >
              <Check className="w-3.5 h-3.5" aria-hidden="true" />
              Delete
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold text-muted hover:text-ink hover:bg-ink/8"
            >
              <X className="w-3.5 h-3.5" aria-hidden="true" />
              Keep
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            aria-label={`Delete ${p.title}`}
            title="Delete project"
            className="p-1.5 rounded-md text-faint hover:text-bad hover:bg-bad/10 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>
    </article>
  );
}

export default function ProjectGrid({ projects, onOpen, onDelete }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("newest");

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q ? projects.filter((p) => p.title.toLowerCase().includes(q)) : [...projects];
    filtered.sort((a, b) => {
      if (sort === "title") return a.title.localeCompare(b.title);
      if (sort === "score") return topScore(b) - topScore(a);
      return (b.created_at || 0) - (a.created_at || 0);
    });
    return filtered;
  }, [projects, query, sort]);

  if (projects.length === 0) return null;

  return (
    <section aria-labelledby="projects-heading" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="projects-heading" className="text-xl font-bold text-ink">
          Your projects
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="w-4 h-4 text-faint absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by title"
              aria-label="Search projects by title"
              className="w-52 pl-8 pr-3 py-1.5 rounded-lg bg-raised border border-line text-sm text-ink placeholder:text-faint hover:border-line-strong focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
            />
          </div>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            aria-label="Sort projects"
            className="px-2.5 py-1.5 rounded-lg bg-raised border border-line text-sm text-ink hover:border-line-strong focus:outline-none focus:border-accent"
          >
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line-strong p-8 text-center text-sm text-muted">
          No projects match "{query}".{" "}
          <button type="button" onClick={() => setQuery("")} className="text-accent hover:underline underline-offset-2">
            Clear search
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {visible.map((p) => (
            <ProjectCard key={p.id} project={p} onOpen={onOpen} onDelete={onDelete} />
          ))}
        </div>
      )}
    </section>
  );
}
