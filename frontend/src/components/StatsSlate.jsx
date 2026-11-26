import React, { useMemo } from "react";

export function computeStats(projects) {
  const clips = projects.flatMap((p) => p.clips || []);
  const exported = clips.filter((c) => c.export_status === "done").length;
  const scores = clips.map((c) => Number(c.viral_score)).filter((n) => Number.isFinite(n));
  const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
  const best = scores.length ? Math.max(...scores) : null;
  return { projects: projects.length, clips: clips.length, exported, avg, best };
}

function Cell({ label, value, note }) {
  return (
    <div className="bg-raised px-4 sm:px-5 py-4 min-w-0">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="mt-1 font-display font-bold text-4xl sm:text-5xl leading-none tabular-nums text-ink">{value}</dd>
      <dd className="mt-2 text-xs text-faint truncate">{note}</dd>
    </div>
  );
}

/**
 * The dashboard's stat strip. It borrows the clapperboard arm (the striped bar)
 * so the numbers read as one slate for the current session of work.
 */
export default function StatsSlate({ projects }) {
  const s = useMemo(() => computeStats(projects), [projects]);

  return (
    <section aria-label="Overview" className="rounded-xl border border-line bg-raised overflow-hidden">
      <div className="slate-arm" aria-hidden="true" />
      {/* gap-px over a line-coloured backdrop draws the hairline dividers */}
      <dl className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-line">
        <Cell label="Projects" value={s.projects} note={s.projects === 1 ? "1 video added" : `${s.projects} videos added`} />
        <Cell label="Clips found" value={s.clips} note={s.projects ? "Across all projects" : "Added when a video is analyzed"} />
        <Cell label="Exported" value={s.exported} note={s.clips ? `of ${s.clips} clips` : "Rendered 9:16 MP4s"} />
        <Cell
          label="Average score"
          value={s.avg === null ? "-" : s.avg}
          note={s.best === null ? "Hook strength, 0 to 100" : `Best clip scores ${s.best}`}
        />
      </dl>
    </section>
  );
}
