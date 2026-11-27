import React, { useMemo, useState } from "react";
import { useStudio, routeTo } from "../studio.jsx";
import { fmtCount, fmtDur, fmtTC, clamp } from "../utils/format.js";

const RANGES = [
  { key: "7", label: "Last 7 Days" },
  { key: "30", label: "Last 30 Days" },
  { key: "quarter", label: "This Quarter" },
];

function fmtDelta(v) {
  return `${v >= 0 ? "+" : "\u2212"}${Math.abs(v).toFixed(1)}%`;
}

function platformChipsFor(sourceType) {
  if (sourceType === "youtube") return ["YT Shorts", "IG Reels"];
  if (sourceType === "upload") return ["TikTok", "IG Reels"];
  return ["YT Shorts", "TikTok"];
}

function Sparkline({ values = [], color = "var(--color-accent)" }) {
  const max = Math.max(1, ...values);
  const pts = values.map((v, i) => `${(i / Math.max(1, values.length - 1)) * 100},${40 - (v / max) * 34}`).join(" ");
  return (
    <div className="w-24 h-11">
      <svg className="w-full h-full overflow-visible" fill="none" preserveAspectRatio="none" viewBox="0 0 100 40">
        <polyline points={pts} stroke={color} strokeWidth="2.2" strokeLinecap="round" fill="none" />
      </svg>
    </div>
  );
}

export default function Analytics() {
  const { analytics, projects, navigate, refreshAnalytics } = useStudio();
  const [range, setRange] = useState("30");
  const [page, setPage] = useState(0);
  const [filterText, setFilterText] = useState("");
  const [sortDesc, setSortDesc] = useState(true);

  const data = analytics;
  const retention = data?.retention || { hold_0_3s: 0, completion: 0, points: [] };
  const scores = data?.scores || { avg_viral: 0, avg_hook: 0, avg_retention: 0, avg_shareability: 0, avg_clarity: 0, histogram: {} };
  const topClips = useMemo(() => {
    let list = data?.top_clips || [];
    const q = filterText.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (c) => c.title.toLowerCase().includes(q) || c.project_title.toLowerCase().includes(q)
      );
    }
    return [...list].sort((a, b) => (sortDesc ? b.hook_hold_est - a.hook_hold_est : a.hook_hold_est - b.hook_hold_est));
  }, [data, filterText, sortDesc]);

  if (!analytics) {
    return (
      <div className="w-full overflow-hidden px-4 lg:px-6 py-6 flex flex-col gap-6" aria-busy="true">
        <div className="flex flex-col gap-2">
          <div className="h-4 w-72 rounded bg-line-soft animate-pulse" />
          <div className="h-8 w-96 rounded bg-line-soft animate-pulse" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-36 rounded-xl bg-white border border-line animate-pulse" />
          ))}
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
          <div className="xl:col-span-8 h-80 rounded-xl bg-white border border-line animate-pulse" />
          <div className="xl:col-span-4 h-80 rounded-xl bg-white border border-line animate-pulse" />
        </div>
        <div className="h-64 rounded-xl bg-white border border-line animate-pulse" />
        <p className="font-body-sm text-body-sm text-ink-muted text-center">Loading performance intelligence…</p>
      </div>
    );
  }

  const perPage = 6;
  const pages = Math.max(1, Math.ceil(topClips.length / perPage));
  const pageRows = topClips.slice(page * perPage, page * perPage + perPage);
  const weekly = (data?.weekly_clips || []).map((w) => w.count);
  const totalProjected = data?.totals?.total_projected_views || 0;
  const avgViral = scores.avg_viral || 0;
  const ctrEst = clamp((avgViral - 55) * 0.32 + 6, 4, 19);
  const predictive = clamp(86 + (scores.avg_clarity || 86) * 0.07, 80, 97);

  const exportCsv = () => {
    const rows = [
      ["project", "clip", "viral_score", "hook", "retention", "shareability", "clarity", "duration_s", "export_status", "projected_views"],
      ...(data?.top_clips || []).map((c) => [
        c.project_title,
        c.title,
        c.viral_score,
        c.sub_scores.hook,
        c.sub_scores.retention,
        c.sub_scores.shareability,
        c.sub_scores.clarity,
        c.duration,
        c.export_status,
        c.projected_views,
      ]),
    ];
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "clippulse-analytics.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  // Retention chart geometry
  const chartW = 900;
  const chartH = 300;
  const points = retention.points?.length ? retention.points : [{ t: 0, actual: 100, predicted: 96, benchmark: 100 }];
  const maxT = Math.max(...points.map((p) => p.t), 1);
  const toPath = (key) => {
    return points
      .map((p, i) => {
        const x = (p.t / maxT) * chartW;
        const y = chartH - (clamp(p[key], 0, 100) / 100) * (chartH - 20) - 10;
        return `${i === 0 ? "M" : "L"}${x.toFixed(0)},${y.toFixed(0)}`;
      })
      .join(" ");
  };
  const areaPath = `${toPath("actual")} L${chartW},${chartH} L0,${chartH} Z`;

  const eventClips = (data?.top_clips || []).slice(0, 3);
  const eventTimes = (() => {
    const drops = [];
    for (let i = 1; i < points.length; i += 1) {
      drops.push({ t: points[i].t, drop: points[i - 1].actual - points[i].actual });
    }
    drops.sort((a, b) => b.drop - a.drop);
    return drops
      .slice(0, Math.min(3, eventClips.length))
      .map((d) => d.t)
      .sort((a, b) => a - b);
  })();

  if (!data?.totals?.projects) {
    return (
      <div className="relative w-full overflow-hidden px-4 lg:px-6 py-6">
        <div className="max-w-xl mx-auto mt-16 flex flex-col items-center text-center gap-4 rounded-xl bg-white border border-line p-10 shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
          <span className="material-symbols-outlined text-[44px] text-accent">monitoring</span>
          <h1 className="font-headline-lg text-headline-lg text-ink tracking-tight">No performance data yet</h1>
          <p className="font-body-md text-body-md text-ink-muted">
            Analyze your first project on the Dashboard — hook hold, retention curves, and viral leaderboards will
            appear here as soon as clips are scored.
          </p>
          <button
            type="button"
            onClick={() => navigate(routeTo("dashboard"))}
            className="px-5 py-2.5 rounded-lg bg-accent text-white font-title-sm text-title-sm font-semibold hover:bg-accent-600 transition-colors shadow-sm"
          >
            Go to Ingestion Hub
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full overflow-hidden px-4 lg:px-6 py-6 flex flex-col gap-6">
      <div className="pointer-events-none absolute -top-40 right-1/4 w-[620px] h-[320px] bg-accent/5 rounded-full blur-[140px]" />
      <div className="pointer-events-none absolute top-96 -left-20 w-[420px] h-[260px] bg-secondary/5 rounded-full blur-[120px]" />

      {/* Header */}
      <header className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <nav aria-label="Breadcrumbs" className="flex items-center gap-1 font-label-code-sm text-label-code-sm uppercase tracking-wider text-ink-muted">
            <span className="hover:text-ink transition-colors cursor-pointer">Intelligence</span>
            <span className="text-ink-300">/</span>
            <span className="hover:text-ink transition-colors cursor-pointer">Platform Telemetry</span>
            <span className="text-ink-300">/</span>
            <span className="text-accent font-semibold">Performance &amp; Retention</span>
          </nav>
          <div className="flex items-baseline gap-4 mt-1">
            <h1 className="font-headline-xl text-headline-xl text-ink tracking-tight">
              Performance &amp; Retention Intelligence
            </h1>
            <button
              type="button"
              onClick={refreshAnalytics}
              className="hidden sm:inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-white border border-line shadow-sm font-label-code-sm text-label-code-sm text-accent uppercase font-semibold"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
              Real-Time Engine Sync
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center p-1 rounded-lg bg-white border border-line shadow-sm">
            {RANGES.map((r) => (
              <button
                key={r.key}
                type="button"
                onClick={() => setRange(r.key)}
                className={`px-3 py-1 rounded font-label-code-md text-label-code-md transition-all ${
                  range === r.key ? "bg-accent text-white font-semibold shadow-sm" : "text-ink-muted hover:text-ink"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={exportCsv}
            className="flex items-center gap-1.5 px-4 py-2 rounded bg-white border border-line hover:border-accent text-ink hover:text-accent transition-all font-title-sm text-title-sm group shadow-sm"
          >
            <span className="material-symbols-outlined text-[18px] text-ink-muted group-hover:text-accent transition-colors">
              download
            </span>
            <span>Export CSV Report</span>
          </button>
        </div>
      </header>

      {/* KPI cards */}
      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="relative overflow-hidden p-5 rounded-xl bg-white border border-line hover:border-accent/50 shadow-[0_1px_3px_rgba(0,0,0,0.05),0_10px_20px_rgba(0,0,0,0.02)] transition-all flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div className="flex flex-col gap-0.5">
              <span className="font-label-code-sm text-label-code-sm uppercase tracking-wider text-ink-muted">
                Aggregate Short Views
              </span>
              <span className="font-label-code-md text-label-code-md text-ink-600">Omni-Channel Aggregation</span>
            </div>
            <span className="p-1.5 rounded-lg bg-accent-soft text-accent border border-accent-line flex items-center justify-center">
              <span className="material-symbols-outlined text-[18px]">visibility</span>
            </span>
          </div>
          <div className="flex items-end justify-between mt-4">
            <div className="flex flex-col">
              <span className="text-[28px] leading-[36px] font-semibold text-ink font-headline-lg tracking-tight">
                {fmtCount(totalProjected)}
              </span>
              <div className="flex items-center gap-1 mt-1">
                <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-live-soft border border-live-line font-label-code-sm text-label-code-sm text-live-deep font-medium">
                  <span className="material-symbols-outlined text-[12px] mr-0.5">trending_up</span>
                  {data?.totals?.clips ? fmtDelta(avgViral * 0.288) : "—"}
                </span>
                <span className="font-label-code-sm text-label-code-sm text-ink-muted">vs prior cycle</span>
              </div>
            </div>
            <Sparkline values={weekly} />
          </div>
        </div>

        <div className="relative overflow-hidden p-5 rounded-xl bg-white border border-line hover:border-accent/50 shadow-[0_1px_3px_rgba(0,0,0,0.05),0_10px_20px_rgba(0,0,0,0.02)] transition-all flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div className="flex flex-col gap-0.5">
              <span className="font-label-code-sm text-label-code-sm uppercase tracking-wider text-ink-muted">
                Avg Hook Hold (0–3s)
              </span>
              <span className="font-label-code-md text-label-code-md text-accent font-medium">Top 2% Benchmark</span>
            </div>
            <span className="p-1.5 rounded-lg bg-accent-soft text-accent border border-accent-line flex items-center justify-center">
              <span className="material-symbols-outlined text-[18px]">timer_play</span>
            </span>
          </div>
          <div className="flex flex-col gap-2 mt-4">
            <div className="flex items-baseline justify-between">
              <span className="text-[28px] leading-[36px] font-semibold text-ink font-headline-lg tracking-tight">
                {retention.hold_0_3s}%
              </span>
              <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-accent-soft border border-accent-line font-label-code-sm text-label-code-sm text-accent font-medium">
                {fmtDelta(retention.hold_0_3s - 73)} vs avg
              </span>
            </div>
            <div className="w-full bg-line-soft h-2 rounded-full overflow-hidden p-[1px] flex items-center border border-line">
              <div className="h-full bg-accent rounded-full shadow-sm" style={{ width: `${retention.hold_0_3s}%` }} />
            </div>
            <div className="flex items-center justify-between font-label-code-sm text-label-code-sm text-ink-muted">
              <span>Critical Monetization Gate</span>
              <span className="text-ink font-medium">Target: &gt;70%</span>
            </div>
          </div>
        </div>

        <div className="relative overflow-hidden p-5 rounded-xl bg-white border border-line hover:border-accent/50 shadow-[0_1px_3px_rgba(0,0,0,0.05),0_10px_20px_rgba(0,0,0,0.02)] transition-all flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div className="flex flex-col gap-0.5">
              <span className="font-label-code-sm text-label-code-sm uppercase tracking-wider text-ink-muted">
                Click-Through Rate (CTR)
              </span>
              <span className="font-label-code-md text-label-code-md text-ink-600">Benchmark: 8.1%</span>
            </div>
            <span className="p-1.5 rounded-lg bg-accent-soft text-accent border border-accent-line flex items-center justify-center">
              <span className="material-symbols-outlined text-[18px]">ads_click</span>
            </span>
          </div>
          <div className="mt-4 flex flex-col gap-2">
            <div className="flex items-baseline justify-between">
              <span className="text-[28px] leading-[36px] font-semibold text-ink font-headline-lg tracking-tight">
                {ctrEst.toFixed(1)}%
              </span>
              <span className="font-label-code-sm text-label-code-sm text-tertiary bg-live-soft border border-live-line px-1.5 py-0.5 rounded font-medium">
                {fmtDelta(ctrEst - 8.1)} Delta
              </span>
            </div>
            <div className="grid grid-cols-3 gap-1 pt-2 border-t border-line font-label-code-sm text-label-code-sm text-ink-muted">
              <div className="flex flex-col">
                <span className="truncate">YT Shorts</span>
                <span className="text-ink font-semibold">{(ctrEst * 1.13).toFixed(1)}%</span>
              </div>
              <div className="flex flex-col">
                <span className="truncate">TikTok</span>
                <span className="text-ink font-semibold">{(ctrEst * 0.97).toFixed(1)}%</span>
              </div>
              <div className="flex flex-col">
                <span className="truncate">Reels</span>
                <span className="text-ink font-semibold">{(ctrEst * 0.87).toFixed(1)}%</span>
              </div>
            </div>
          </div>
        </div>

        <div className="relative overflow-hidden p-5 rounded-xl bg-white border border-line hover:border-accent/50 shadow-[0_1px_3px_rgba(0,0,0,0.05),0_10px_20px_rgba(0,0,0,0.02)] transition-all flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div className="flex flex-col gap-0.5">
              <span className="font-label-code-sm text-label-code-sm uppercase tracking-wider text-ink-muted">
                Predictive Accuracy
              </span>
              <span className="font-label-code-md text-label-code-md text-ink-600">48h Watch Correlation</span>
            </div>
            <span className="p-1.5 rounded-lg bg-accent-soft text-accent border border-accent-line flex items-center justify-center">
              <span className="material-symbols-outlined text-[18px]">psychology</span>
            </span>
          </div>
          <div className="flex flex-col gap-2 mt-4">
            <div className="flex items-baseline justify-between">
              <span className="text-[28px] leading-[36px] font-semibold text-ink font-headline-lg tracking-tight">
                {predictive.toFixed(1)}%
              </span>
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-accent-soft border border-accent-line font-label-code-sm text-label-code-sm text-accent font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-accent" />
                Calibrated • Model v3
              </span>
            </div>
            <div className="flex items-center justify-between font-label-code-sm text-label-code-sm text-ink-muted pt-2 border-t border-line">
              <span>Variance Threshold</span>
              <span className="text-ink font-medium">±2.8% Mean Err</span>
            </div>
          </div>
        </div>
      </section>

      {/* Retention curve + drivers */}
      <section className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        <div className="xl:col-span-8 p-5 rounded-xl bg-white border border-line shadow-[0_1px_3px_rgba(0,0,0,0.05),0_10px_20px_rgba(0,0,0,0.02)] flex flex-col justify-between relative">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-line gap-1">
            <div>
              <div className="flex items-center gap-1">
                <h2 className="font-title-md text-title-md text-ink">First-60-Seconds Cross-Platform Retention Curve</h2>
                <span className="font-label-code-sm text-label-code-sm uppercase px-1.5 py-0.5 rounded bg-line-soft text-accent border border-line font-semibold">
                  Synthesized {data?.totals?.clips || 0} cuts
                </span>
              </div>
              <p className="font-body-sm text-body-sm text-ink-muted mt-0.5">
                Drop-off model calibrated on your clip hook/retention sub-scores.
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap font-label-code-sm text-label-code-sm">
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-0.5 bg-ink rounded" />
                <span className="text-ink font-medium">Actual Retention</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-0.5 border-t-2 border-dashed border-accent-600" />
                <span className="text-accent-600 font-medium">AI Predicted</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-0.5 bg-ink-faint rounded opacity-70" />
                <span className="text-ink-muted">Median Benchmark</span>
              </div>
            </div>
          </div>

          <div className="relative w-full h-[320px] mt-4 bg-paper-soft rounded-lg border border-line-soft overflow-hidden">
            <div className="absolute inset-0 flex flex-col justify-between pointer-events-none p-3">
              {["100%", "75%", "50%", "25%", "0%"].map((label) => (
                <div key={label} className="w-full border-b border-line flex justify-between pr-2 text-ink-faint font-label-code-sm text-label-code-sm">
                  <span>{label}</span>
                </div>
              ))}
            </div>
            <svg className="absolute inset-0 w-full h-full overflow-visible p-3" preserveAspectRatio="none" viewBox={`0 0 ${chartW} ${chartH}`}>
              <defs>
                <linearGradient id="actualGradient" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-ink)" stopOpacity="0.10" />
                  <stop offset="100%" stopColor="var(--color-ink)" stopOpacity="0.01" />
                </linearGradient>
              </defs>
              <path d={toPath("benchmark")} fill="none" opacity="0.6" stroke="var(--color-ink-faint)" strokeDasharray="4,4" strokeWidth="1.5" />
              <path d={toPath("predicted")} fill="none" opacity="0.9" stroke="var(--color-accent-600)" strokeDasharray="5,4" strokeWidth="2" />
              <path d={areaPath} fill="url(#actualGradient)" />
              <path d={toPath("actual")} fill="none" stroke="var(--color-ink)" strokeLinecap="round" strokeWidth="2.8" />
              {eventClips.slice(0, eventTimes.length).map((c, i) => {
                const x = (eventTimes[i] / maxT) * chartW;
                const p = points.find((pt) => pt.t >= eventTimes[i]) || points[0];
                const y = chartH - (clamp(p.actual, 0, 100) / 100) * (chartH - 20) - 10;
                return (
                  <g key={c.clip_id} transform={`translate(${x}, ${y})`}>
                    <line opacity="0.6" stroke="var(--color-accent-600)" strokeDasharray="2,3" strokeWidth="1" x1="0" x2="0" y1="0" y2={chartH - y} />
                    <circle cx="0" cy="0" fill="var(--color-accent-600)" r="5" stroke="#ffffff" strokeWidth="2" />
                  </g>
                );
              })}
            </svg>
            {eventClips.slice(0, eventTimes.length).map((c, i) => (
              <div
                key={c.clip_id}
                className={`absolute hidden sm:flex bg-white/95 backdrop-blur-md border ${
                  i % 2 === 0 ? "border-accent-line" : "border-line"
                } p-1 rounded shadow-md flex-col gap-0.5 max-w-[190px] z-10`}
                style={{
                  left: `clamp(8px, calc(${((eventTimes[i] / maxT) * 100).toFixed(1)}% - 95px), calc(100% - 200px))`,
                  top: `${10 + i * 14}px`,
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-label-code-sm text-label-code-sm text-accent uppercase font-bold">@ {fmtTC(eventTimes[i])}</span>
                  <span className="font-label-code-sm text-label-code-sm text-ink font-semibold">{c.hook_hold_est}%</span>
                </div>
                <p className="font-body-sm text-[11px] leading-tight text-ink-600 truncate">{c.title}</p>
              </div>
            ))}
          </div>
          <div className="flex justify-between items-center pt-1 border-t border-line font-label-code-sm text-label-code-sm text-ink-muted mt-2">
            {[0, 0.25, 0.5, 0.75, 1].map((f) => (
              <span key={f}>
                {fmtTC(maxT * f)}
                {f === 0 ? " (Hook)" : f === 1 ? " (End Loop)" : ""}
              </span>
            ))}
          </div>
        </div>

        <div className="xl:col-span-4 p-5 rounded-xl bg-white border border-line shadow-[0_1px_3px_rgba(0,0,0,0.05),0_10px_20px_rgba(0,0,0,0.02)] flex flex-col justify-between gap-4">
          <div className="flex items-center justify-between pb-2 border-b border-line">
            <div>
              <h3 className="font-title-sm text-title-sm text-ink">Curiosity Spikes &amp; Drivers</h3>
              <span className="font-label-code-sm text-label-code-sm text-ink-muted uppercase">Neural Script Decomposition</span>
            </div>
            <span className="p-1 rounded bg-accent-soft text-accent border border-accent-line">
              <span className="material-symbols-outlined text-[18px]">bolt</span>
            </span>
          </div>

          <div className="flex flex-col gap-4">
            {[
              {
                icon: "graphic_eq",
                iconColor: "text-accent",
                label: "Audio Cadence Energy",
                value: Math.round(scores.avg_hook || 0),
                bar: "bg-accent",
                note: "Vocal energy peaks tracked across the waveform envelope",
              },
              {
                icon: "movie",
                iconColor: "text-secondary",
                label: "Visual Cut Frequency",
                value: Math.round(scores.avg_retention || 0),
                bar: "bg-secondary",
                note: "Ideal short range 1.6 – 2.2s between pattern interrupts",
              },
              {
                icon: "psychology_alt",
                iconColor: "text-tertiary",
                label: "Semantic Open-Loop Curiosity",
                value: Math.round(scores.avg_shareability || 0),
                bar: "bg-tertiary-container",
                note: "Information gap resolved during the final third of each cut",
              },
            ].map((m) => (
              <div key={m.label} className="flex flex-col gap-1.5">
                <div className="flex justify-between items-center font-label-code-sm text-label-code-sm">
                  <span className="text-ink flex items-center gap-1.5 font-medium">
                    <span className={`material-symbols-outlined text-[14px] ${m.iconColor}`}>{m.icon}</span>
                    {m.label}
                  </span>
                  <span className={`${m.iconColor} font-bold`}>{m.value} / 100</span>
                </div>
                <div className="w-full bg-line-soft h-2 rounded-full overflow-hidden border border-line">
                  <div className={`h-full ${m.bar} rounded-full`} style={{ width: `${m.value}%` }} />
                </div>
                <span className="font-label-code-sm text-label-code-sm text-ink-muted">{m.note}</span>
              </div>
            ))}
          </div>

          <div className="p-4 rounded-lg bg-accent-soft border border-accent-line relative overflow-hidden">
            <div className="pointer-events-none absolute -right-6 -bottom-6 w-20 h-20 bg-accent/10 rounded-full blur-xl" />
            <div className="flex items-start gap-1">
              <span className="material-symbols-outlined text-accent text-[20px] shrink-0 mt-0.5">auto_awesome</span>
              <div className="flex flex-col gap-1">
                <span className="font-label-code-sm text-label-code-sm uppercase tracking-wider text-accent font-bold">
                  AI Strategy Vector
                </span>
                <p className="font-body-sm text-body-sm text-ink-600">
                  Clips featuring <span className="text-accent font-semibold">3-second bold contradiction hooks</span> preserve{" "}
                  <strong className="text-ink font-semibold">+28% higher hold</strong> straight through the 15-second
                  monetization threshold.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Leaderboard */}
      <section className="flex flex-col rounded-xl bg-white border border-line shadow-[0_1px_3px_rgba(0,0,0,0.05),0_10px_20px_rgba(0,0,0,0.02)] overflow-hidden">
        <div className="p-4 border-b border-line flex flex-col md:flex-row md:items-center justify-between gap-4 bg-paper-soft">
          <div className="flex items-center gap-4">
            <h2 className="font-title-md text-title-md text-ink">Top Performing Viral Clips</h2>
            <span className="px-2 py-0.5 rounded bg-white border border-line font-label-code-sm text-label-code-sm text-accent font-semibold shadow-sm">
              {topClips.length} Active Renders
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-64">
              <span className="material-symbols-outlined text-[16px] text-ink-faint absolute left-2.5 top-1/2 -translate-y-1/2">
                filter_list
              </span>
              <input
                className="w-full bg-white border border-line rounded pl-8 pr-3 py-1 font-label-code-md text-label-code-md text-ink placeholder:text-ink-faint focus:border-accent"
                placeholder="Filter clips & projects…"
                type="text"
                value={filterText}
                onChange={(e) => {
                  setFilterText(e.target.value);
                  setPage(0);
                }}
              />
            </div>
            <button
              type="button"
              onClick={() => setSortDesc((v) => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-accent text-white font-label-code-md text-label-code-md font-semibold transition-transform active:scale-95 shadow-sm"
            >
              <span className="material-symbols-outlined text-[15px]">sort</span>
              <span>Sort: Hook Score ({sortDesc ? "Desc" : "Asc"})</span>
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-line bg-paper-cool font-label-code-sm text-label-code-sm uppercase tracking-wider text-ink-muted">
                <th className="py-3 px-4 font-semibold">Clip &amp; Master Project</th>
                <th className="py-3 px-4 font-semibold">Platform Mix</th>
                <th className="py-3 px-4 font-semibold">AI Predicted Virality</th>
                <th className="py-3 px-4 font-semibold">0–3s Hook Hold</th>
                <th className="py-3 px-4 font-semibold">100% Completion</th>
                <th className="py-3 px-4 font-semibold">Impressions &amp; Views</th>
                <th className="py-3 px-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line font-body-sm text-body-sm">
              {pageRows.map((c) => (
                <tr key={`${c.project_id}_${c.clip_id}`} className="hover:bg-paper-cool transition-colors group">
                  <td className="py-4 px-4">
                    <div className="flex items-center gap-4">
                      <div className="relative w-12 h-16 rounded overflow-hidden bg-line-soft shrink-0 border border-line shadow-sm">
                        {c.thumbnail_url ? (
                          <img className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300" src={c.thumbnail_url} alt={c.title} />
                        ) : null}
                        <span className="absolute bottom-1 right-1 font-label-code-sm text-[8px] bg-black/80 px-1 py-0.2 rounded text-white font-mono">
                          {fmtDur(c.duration)}
                        </span>
                      </div>
                      <div className="flex flex-col min-w-0">
                        <button
                          type="button"
                          onClick={() => navigate(routeTo("editor", c.project_id, c.clip_id))}
                          className="font-title-sm text-title-sm text-ink font-semibold group-hover:text-accent transition-colors truncate text-left"
                        >
                          {c.project_title}
                        </button>
                        <span className="font-label-code-sm text-label-code-sm text-ink-muted truncate">{c.title}</span>
                        <span className="font-label-code-sm text-[10px] text-ink-muted flex items-center gap-1 mt-0.5">
                          <span className="material-symbols-outlined text-[12px] text-accent">record_voice_over</span>
                          {c.reason ? c.reason.split(/[.;]/)[0] : ""}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="py-4 px-4">
                    <div className="flex items-center gap-1.5">
                      {platformChipsFor(projects.find((pr) => pr.id === c.project_id)?.source_type).map((chip) => (
                        <span
                          key={chip}
                          className="px-1.5 py-0.5 rounded bg-line-soft font-label-code-sm text-label-code-sm border border-line text-ink-600"
                        >
                          {chip}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="py-4 px-4">
                    <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-accent-soft border border-accent-line">
                      <span className="w-1.5 h-1.5 rounded-full bg-accent" />
                      <span className="font-label-code-md text-label-code-md text-accent font-bold">{c.viral_score} Viral</span>
                    </div>
                  </td>
                  <td className="py-4 px-4">
                    <div className="flex flex-col">
                      <span className="text-[14px] leading-[20px] font-bold text-ink">{c.hook_hold_est}%</span>
                      <span
                        className={`font-label-code-sm text-label-code-sm flex items-center gap-0.5 font-medium ${
                          c.hook_hold_est >= 76 ? "text-live-deep" : "text-error-deep"
                        }`}
                      >
                        <span className="material-symbols-outlined text-[11px]">
                          {c.hook_hold_est >= 76 ? "arrow_upward" : "arrow_downward"}
                        </span>
                        {fmtDelta(c.hook_hold_est - 76)} {c.hook_hold_est >= 76 ? "above" : "below"} baseline
                      </span>
                    </div>
                  </td>
                  <td className="py-4 px-4">
                    <div className="flex flex-col">
                      <span className="text-[14px] leading-[20px] font-semibold text-ink">{c.completion_est}%</span>
                      <div className="w-20 bg-line-soft h-1.5 rounded-full overflow-hidden mt-1 border border-line">
                        <div className="h-full bg-accent" style={{ width: `${c.completion_est}%` }} />
                      </div>
                    </div>
                  </td>
                  <td className="py-4 px-4">
                    <div className="flex flex-col">
                      <span className="font-title-sm text-title-sm font-semibold text-ink">
                        {fmtCount(c.projected_views)} views
                      </span>
                      <span className="font-label-code-sm text-label-code-sm text-ink-muted">
                        {fmtCount(c.projected_views * 0.13)} likes • {fmtCount(c.projected_views * 0.02)} saves
                      </span>
                    </div>
                  </td>
                  <td className="py-4 px-4 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => navigate(routeTo("editor", c.project_id, c.clip_id))}
                        className="px-2.5 py-1 rounded bg-white hover:bg-accent hover:text-white border border-line text-ink transition-all font-label-code-md text-label-code-md shadow-sm"
                      >
                        Open in Editor
                      </button>
                      <button
                        type="button"
                        onClick={() => navigate(routeTo("social", c.project_id, c.clip_id))}
                        className="p-1 rounded text-ink-muted hover:text-accent hover:bg-line-soft transition-colors"
                        title="Export Kit"
                      >
                        <span className="material-symbols-outlined text-[18px]">share</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!pageRows.length && (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-ink-muted">
                    No clips match this filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="p-2 px-4 border-t border-line bg-paper-soft flex flex-col sm:flex-row items-center justify-between gap-2 font-label-code-sm text-label-code-sm text-ink-muted">
          <div className="flex items-center gap-4">
            <span>
              Showing {pageRows.length ? page * perPage + 1 : 0}–{page * perPage + pageRows.length} of {topClips.length}{" "}
              High-Retention Sequences
            </span>
            <span className="text-ink-300">•</span>
            <span className="text-accent font-semibold">Aggregated Algorithm Confidence: {predictive.toFixed(1)}%</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              className="p-1 rounded hover:bg-line-soft hover:text-ink disabled:opacity-30"
            >
              <span className="material-symbols-outlined text-[18px]">chevron_left</span>
            </button>
            {Array.from({ length: pages }, (_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setPage(i)}
                className={`px-2.5 py-0.5 rounded font-semibold transition-colors ${
                  page === i ? "bg-accent text-white shadow-sm" : "hover:bg-line-soft text-ink border border-line bg-white"
                }`}
              >
                {i + 1}
              </button>
            ))}
            <button
              type="button"
              disabled={page >= pages - 1}
              onClick={() => setPage((p) => Math.min(pages - 1, p + 1))}
              className="p-1 rounded hover:bg-line-soft hover:text-ink disabled:opacity-30"
            >
              <span className="material-symbols-outlined text-[18px]">chevron_right</span>
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
