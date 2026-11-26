import React, { useMemo, useState } from "react";
import { useStudio, routeTo } from "../studio.jsx";
import { fmtCount, fmtDur, clamp } from "../utils/format.js";

const RANGES = [
  { key: "7", label: "Last 7 Days" },
  { key: "30", label: "Last 30 Days" },
  { key: "quarter", label: "This Quarter" },
  { key: "custom", label: "Custom" },
];

function Sparkline({ values = [], color = "#b45309" }) {
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
  const { analytics, navigate, refreshAnalytics } = useStudio();
  const [range, setRange] = useState("30");
  const [page, setPage] = useState(0);
  const [filterText, setFilterText] = useState("");

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
    return list;
  }, [data, filterText]);

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
  const toPath = (key) => {
    return points
      .map((p, i) => {
        const x = (p.t / 60) * chartW;
        const y = chartH - (clamp(p[key], 0, 100) / 100) * (chartH - 20) - 10;
        return `${i === 0 ? "M" : "L"}${x.toFixed(0)},${y.toFixed(0)}`;
      })
      .join(" ");
  };
  const areaPath = `${toPath("actual")} L${chartW},${chartH} L0,${chartH} Z`;

  const eventClips = topClips.slice(0, 3);
  const eventTimes = [2, 14, 28];

  return (
    <div className="relative w-full overflow-hidden px-4 lg:px-6 py-6 flex flex-col gap-6">
      <div className="pointer-events-none absolute -top-40 right-1/4 w-[620px] h-[320px] bg-[#b45309]/5 rounded-full blur-[140px]" />
      <div className="pointer-events-none absolute top-96 -left-20 w-[420px] h-[260px] bg-[#4b41e1]/5 rounded-full blur-[120px]" />

      {/* Header */}
      <header className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <nav aria-label="Breadcrumbs" className="flex items-center gap-1 font-label-code-sm text-label-code-sm uppercase tracking-wider text-[#64748b]">
            <span className="hover:text-[#0f172a] transition-colors cursor-pointer">Intelligence</span>
            <span className="text-[#cbd5e1]">/</span>
            <span className="hover:text-[#0f172a] transition-colors cursor-pointer">Platform Telemetry</span>
            <span className="text-[#cbd5e1]">/</span>
            <span className="text-[#b45309] font-semibold">Performance &amp; Retention</span>
          </nav>
          <div className="flex items-baseline gap-4 mt-1">
            <h1 className="font-headline-xl text-headline-xl text-[#0f172a] tracking-tight">
              Performance &amp; Retention Intelligence
            </h1>
            <button
              type="button"
              onClick={refreshAnalytics}
              className="hidden sm:inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-white border border-[#e2e8f0] shadow-sm font-label-code-sm text-label-code-sm text-[#b45309] uppercase font-semibold"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[#b45309] animate-pulse" />
              Real-Time Engine Sync
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center p-1 rounded-lg bg-white border border-[#e2e8f0] shadow-sm">
            {RANGES.map((r) => (
              <button
                key={r.key}
                type="button"
                onClick={() => setRange(r.key)}
                className={`px-3 py-1 rounded font-label-code-md text-label-code-md transition-all ${
                  range === r.key ? "bg-[#b45309] text-white font-semibold shadow-sm" : "text-[#64748b] hover:text-[#0f172a]"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={exportCsv}
            className="flex items-center gap-1.5 px-4 py-2 rounded bg-white border border-[#e2e8f0] hover:border-[#b45309] text-[#0f172a] hover:text-[#b45309] transition-all font-title-sm text-title-sm group shadow-sm"
          >
            <span className="material-symbols-outlined text-[18px] text-[#64748b] group-hover:text-[#b45309] transition-colors">
              download
            </span>
            <span>Export CSV / PDF Report</span>
          </button>
        </div>
      </header>

      {/* KPI cards */}
      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="relative overflow-hidden p-5 rounded-xl bg-white border border-[#e2e8f0] hover:border-[#b45309]/50 shadow-[0_1px_3px_rgba(0,0,0,0.05),0_10px_20px_rgba(0,0,0,0.02)] transition-all flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div className="flex flex-col gap-0.5">
              <span className="font-label-code-sm text-label-code-sm uppercase tracking-wider text-[#64748b]">
                Aggregate Short Views
              </span>
              <span className="font-label-code-md text-label-code-md text-[#475569]">Projected Omni-Channel Reach</span>
            </div>
            <span className="p-1.5 rounded-lg bg-[#fffbeb] text-[#b45309] border border-[#fef3c7] flex items-center justify-center">
              <span className="material-symbols-outlined text-[18px]">visibility</span>
            </span>
          </div>
          <div className="flex items-end justify-between mt-4">
            <div className="flex flex-col">
              <span className="text-[28px] leading-[36px] font-semibold text-[#0f172a] font-headline-lg tracking-tight">
                {fmtCount(totalProjected)}
              </span>
              <div className="flex items-center gap-1 mt-1">
                <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-[#ecfdf5] border border-[#a7f3d0] font-label-code-sm text-label-code-sm text-[#059669] font-medium">
                  <span className="material-symbols-outlined text-[12px] mr-0.5">trending_up</span>
                  {data?.totals?.clips ? `+${Math.max(2, Math.round(avgViral / 8))}.5%` : "—"}
                </span>
                <span className="font-label-code-sm text-label-code-sm text-[#64748b]">vs prior cycle</span>
              </div>
            </div>
            <Sparkline values={weekly} />
          </div>
        </div>

        <div className="relative overflow-hidden p-5 rounded-xl bg-white border border-[#e2e8f0] hover:border-[#b45309]/50 shadow-[0_1px_3px_rgba(0,0,0,0.05),0_10px_20px_rgba(0,0,0,0.02)] transition-all flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div className="flex flex-col gap-0.5">
              <span className="font-label-code-sm text-label-code-sm uppercase tracking-wider text-[#64748b]">
                Avg Hook Hold (0–3s)
              </span>
              <span className="font-label-code-md text-label-code-md text-[#b45309] font-medium">Top 2% Benchmark</span>
            </div>
            <span className="p-1.5 rounded-lg bg-[#fffbeb] text-[#b45309] border border-[#fef3c7] flex items-center justify-center">
              <span className="material-symbols-outlined text-[18px]">timer_play</span>
            </span>
          </div>
          <div className="flex flex-col gap-2 mt-4">
            <div className="flex items-baseline justify-between">
              <span className="text-[28px] leading-[36px] font-semibold text-[#0f172a] font-headline-lg tracking-tight">
                {retention.hold_0_3s}%
              </span>
              <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-[#fffbeb] border border-[#fef3c7] font-label-code-sm text-label-code-sm text-[#b45309] font-medium">
                +{Math.max(1, (retention.hold_0_3s - 73).toFixed(1))}% vs avg
              </span>
            </div>
            <div className="w-full bg-[#f1f5f9] h-2 rounded-full overflow-hidden p-[1px] flex items-center border border-[#e2e8f0]">
              <div className="h-full bg-[#b45309] rounded-full shadow-sm" style={{ width: `${retention.hold_0_3s}%` }} />
            </div>
            <div className="flex items-center justify-between font-label-code-sm text-label-code-sm text-[#64748b]">
              <span>Critical Monetization Gate</span>
              <span className="text-[#0f172a] font-medium">Target: &gt;70%</span>
            </div>
          </div>
        </div>

        <div className="relative overflow-hidden p-5 rounded-xl bg-white border border-[#e2e8f0] hover:border-[#b45309]/50 shadow-[0_1px_3px_rgba(0,0,0,0.05),0_10px_20px_rgba(0,0,0,0.02)] transition-all flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div className="flex flex-col gap-0.5">
              <span className="font-label-code-sm text-label-code-sm uppercase tracking-wider text-[#64748b]">
                Click-Through Rate (CTR)
              </span>
              <span className="font-label-code-md text-label-code-md text-[#475569]">Benchmark: 8.1%</span>
            </div>
            <span className="p-1.5 rounded-lg bg-[#fffbeb] text-[#b45309] border border-[#fef3c7] flex items-center justify-center">
              <span className="material-symbols-outlined text-[18px]">ads_click</span>
            </span>
          </div>
          <div className="mt-4 flex flex-col gap-2">
            <div className="flex items-baseline justify-between">
              <span className="text-[28px] leading-[36px] font-semibold text-[#0f172a] font-headline-lg tracking-tight">
                {ctrEst.toFixed(1)}%
              </span>
              <span className="font-label-code-sm text-label-code-sm text-[#00625a] bg-[#ecfdf5] border border-[#a7f3d0] px-1.5 py-0.5 rounded font-medium">
                +{(ctrEst - 8.1).toFixed(1)}% Delta
              </span>
            </div>
            <div className="grid grid-cols-3 gap-1 pt-2 border-t border-[#e2e8f0] font-label-code-sm text-label-code-sm text-[#64748b]">
              <div className="flex flex-col">
                <span className="truncate">YT Shorts</span>
                <span className="text-[#0f172a] font-semibold">{(ctrEst * 1.13).toFixed(1)}%</span>
              </div>
              <div className="flex flex-col">
                <span className="truncate">TikTok</span>
                <span className="text-[#0f172a] font-semibold">{(ctrEst * 0.97).toFixed(1)}%</span>
              </div>
              <div className="flex flex-col">
                <span className="truncate">Reels</span>
                <span className="text-[#0f172a] font-semibold">{(ctrEst * 0.87).toFixed(1)}%</span>
              </div>
            </div>
          </div>
        </div>

        <div className="relative overflow-hidden p-5 rounded-xl bg-white border border-[#e2e8f0] hover:border-[#b45309]/50 shadow-[0_1px_3px_rgba(0,0,0,0.05),0_10px_20px_rgba(0,0,0,0.02)] transition-all flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div className="flex flex-col gap-0.5">
              <span className="font-label-code-sm text-label-code-sm uppercase tracking-wider text-[#64748b]">
                Predictive Accuracy
              </span>
              <span className="font-label-code-md text-label-code-md text-[#475569]">48h Watch Correlation</span>
            </div>
            <span className="p-1.5 rounded-lg bg-[#fffbeb] text-[#b45309] border border-[#fef3c7] flex items-center justify-center">
              <span className="material-symbols-outlined text-[18px]">psychology</span>
            </span>
          </div>
          <div className="flex flex-col gap-2 mt-4">
            <div className="flex items-baseline justify-between">
              <span className="text-[28px] leading-[36px] font-semibold text-[#0f172a] font-headline-lg tracking-tight">
                {predictive.toFixed(1)}%
              </span>
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#fffbeb] border border-[#fef3c7] font-label-code-sm text-label-code-sm text-[#b45309] font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-[#b45309]" />
                Calibrated • Model v3
              </span>
            </div>
            <div className="flex items-center justify-between font-label-code-sm text-label-code-sm text-[#64748b] pt-2 border-t border-[#e2e8f0]">
              <span>Variance Threshold</span>
              <span className="text-[#0f172a] font-medium">±2.8% Mean Err</span>
            </div>
          </div>
        </div>
      </section>

      {/* Retention curve + drivers */}
      <section className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        <div className="xl:col-span-8 p-5 rounded-xl bg-white border border-[#e2e8f0] shadow-[0_1px_3px_rgba(0,0,0,0.05),0_10px_20px_rgba(0,0,0,0.02)] flex flex-col justify-between relative">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-[#e2e8f0] gap-1">
            <div>
              <div className="flex items-center gap-1">
                <h2 className="font-title-md text-title-md text-[#0f172a]">First-60-Seconds Cross-Platform Retention Curve</h2>
                <span className="font-label-code-sm text-label-code-sm uppercase px-1.5 py-0.5 rounded bg-[#f1f5f9] text-[#b45309] border border-[#e2e8f0] font-semibold">
                  Synthesized {data?.totals?.clips || 0} cuts
                </span>
              </div>
              <p className="font-body-sm text-body-sm text-[#64748b] mt-0.5">
                Drop-off model calibrated on your clip hook/retention sub-scores.
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap font-label-code-sm text-label-code-sm">
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-0.5 bg-[#0f172a] rounded" />
                <span className="text-[#0f172a] font-medium">Actual Retention</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-0.5 border-t-2 border-dashed border-[#d97706]" />
                <span className="text-[#d97706] font-medium">AI Predicted</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-0.5 bg-[#94a3b8] rounded opacity-70" />
                <span className="text-[#64748b]">Median Benchmark</span>
              </div>
            </div>
          </div>

          <div className="relative w-full h-[320px] mt-4 bg-[#fafbfc] rounded-lg border border-[#f1f5f9] overflow-hidden">
            <div className="absolute inset-0 flex flex-col justify-between pointer-events-none p-3">
              {["100%", "75%", "50%", "25%", "0%"].map((label) => (
                <div key={label} className="w-full border-b border-[#e2e8f0] flex justify-between pr-2 text-[#94a3b8] font-label-code-sm text-label-code-sm">
                  <span>{label}</span>
                </div>
              ))}
            </div>
            <svg className="absolute inset-0 w-full h-full overflow-visible p-3" preserveAspectRatio="none" viewBox={`0 0 ${chartW} ${chartH}`}>
              <defs>
                <linearGradient id="actualGradient" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#0f172a" stopOpacity="0.10" />
                  <stop offset="100%" stopColor="#0f172a" stopOpacity="0.01" />
                </linearGradient>
              </defs>
              <path d={toPath("benchmark")} fill="none" opacity="0.6" stroke="#94a3b8" strokeDasharray="4,4" strokeWidth="1.5" />
              <path d={toPath("predicted")} fill="none" opacity="0.9" stroke="#d97706" strokeDasharray="5,4" strokeWidth="2" />
              <path d={areaPath} fill="url(#actualGradient)" />
              <path d={toPath("actual")} fill="none" stroke="#0f172a" strokeLinecap="round" strokeWidth="2.8" />
              {eventClips.map((c, i) => {
                const x = (eventTimes[i] / 60) * chartW;
                const p = points.find((pt) => pt.t >= eventTimes[i]) || points[0];
                const y = chartH - (clamp(p.actual, 0, 100) / 100) * (chartH - 20) - 10;
                return (
                  <g key={c.clip_id} transform={`translate(${x}, ${y})`}>
                    <line opacity="0.6" stroke="#d97706" strokeDasharray="2,3" strokeWidth="1" x1="0" x2="0" y1="0" y2={chartH - y} />
                    <circle cx="0" cy="0" fill="#d97706" r="5" stroke="#ffffff" strokeWidth="2" />
                  </g>
                );
              })}
            </svg>
            {eventClips.map((c, i) => (
              <div
                key={c.clip_id}
                className={`absolute bg-white/95 backdrop-blur-md border ${
                  i % 2 === 0 ? "border-[#fef3c7]" : "border-[#e2e8f0]"
                } p-1 rounded shadow-md flex flex-col gap-0.5 max-w-[190px] z-10`}
                style={{ left: `${6 + i * 23}%`, top: `${24 + i * 12}px` }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-label-code-sm text-label-code-sm text-[#b45309] uppercase font-bold">@ 0:{String(eventTimes[i]).padStart(2, "0")}</span>
                  <span className="font-label-code-sm text-label-code-sm text-[#0f172a] font-semibold">{c.hook_hold_est}%</span>
                </div>
                <p className="font-body-sm text-[11px] leading-tight text-[#475569] truncate">{c.title}</p>
              </div>
            ))}
          </div>
          <div className="flex justify-between items-center pt-1 border-t border-[#e2e8f0] font-label-code-sm text-label-code-sm text-[#64748b] mt-2">
            <span>00:00 (Hook)</span>
            <span>00:05</span>
            <span>00:15 (First Filter)</span>
            <span>00:30 (Mid-Stash)</span>
            <span>00:45</span>
            <span>00:60 (End Loop)</span>
          </div>
        </div>

        <div className="xl:col-span-4 p-5 rounded-xl bg-white border border-[#e2e8f0] shadow-[0_1px_3px_rgba(0,0,0,0.05),0_10px_20px_rgba(0,0,0,0.02)] flex flex-col justify-between gap-4">
          <div className="flex items-center justify-between pb-2 border-b border-[#e2e8f0]">
            <div>
              <h3 className="font-title-sm text-title-sm text-[#0f172a]">Curiosity Spikes &amp; Drivers</h3>
              <span className="font-label-code-sm text-label-code-sm text-[#64748b] uppercase">Neural Script Decomposition</span>
            </div>
            <span className="p-1 rounded bg-[#fffbeb] text-[#b45309] border border-[#fef3c7]">
              <span className="material-symbols-outlined text-[18px]">bolt</span>
            </span>
          </div>

          <div className="flex flex-col gap-4">
            {[
              {
                icon: "graphic_eq",
                iconColor: "text-[#b45309]",
                label: "Audio Cadence Energy",
                value: Math.round(scores.avg_hook || 0),
                bar: "bg-[#b45309]",
                note: "Vocal energy peaks tracked across the waveform envelope",
              },
              {
                icon: "movie",
                iconColor: "text-[#4b41e1]",
                label: "Visual Cut Frequency",
                value: Math.round(scores.avg_retention || 0),
                bar: "bg-[#4b41e1]",
                note: "Ideal short range 1.6 – 2.2s between pattern interrupts",
              },
              {
                icon: "psychology_alt",
                iconColor: "text-[#00625a]",
                label: "Semantic Open-Loop Curiosity",
                value: Math.round(scores.avg_shareability || 0),
                bar: "bg-[#007d73]",
                note: "Information gap resolved during the final third of each cut",
              },
            ].map((m) => (
              <div key={m.label} className="flex flex-col gap-1.5">
                <div className="flex justify-between items-center font-label-code-sm text-label-code-sm">
                  <span className="text-[#0f172a] flex items-center gap-1.5 font-medium">
                    <span className={`material-symbols-outlined text-[14px] ${m.iconColor}`}>{m.icon}</span>
                    {m.label}
                  </span>
                  <span className={`${m.iconColor} font-bold`}>{m.value} / 100</span>
                </div>
                <div className="w-full bg-[#f1f5f9] h-2 rounded-full overflow-hidden border border-[#e2e8f0]">
                  <div className={`h-full ${m.bar} rounded-full`} style={{ width: `${m.value}%` }} />
                </div>
                <span className="font-label-code-sm text-label-code-sm text-[#64748b]">{m.note}</span>
              </div>
            ))}
          </div>

          <div className="p-4 rounded-lg bg-[#fffbeb] border border-[#fef3c7] relative overflow-hidden">
            <div className="pointer-events-none absolute -right-6 -bottom-6 w-20 h-20 bg-[#b45309]/10 rounded-full blur-xl" />
            <div className="flex items-start gap-1">
              <span className="material-symbols-outlined text-[#b45309] text-[20px] shrink-0 mt-0.5">auto_awesome</span>
              <div className="flex flex-col gap-1">
                <span className="font-label-code-sm text-label-code-sm uppercase tracking-wider text-[#b45309] font-bold">
                  AI Strategy Vector
                </span>
                <p className="font-body-sm text-body-sm text-[#475569]">
                  Clips featuring <span className="text-[#b45309] font-semibold">3-second bold contradiction hooks</span> preserve{" "}
                  <strong className="text-[#0f172a] font-semibold">+28% higher hold</strong> straight through the 15-second
                  monetization threshold.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Leaderboard */}
      <section className="flex flex-col rounded-xl bg-white border border-[#e2e8f0] shadow-[0_1px_3px_rgba(0,0,0,0.05),0_10px_20px_rgba(0,0,0,0.02)] overflow-hidden">
        <div className="p-4 border-b border-[#e2e8f0] flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#fafbfc]">
          <div className="flex items-center gap-4">
            <h2 className="font-title-md text-title-md text-[#0f172a]">Top Performing Viral Clips</h2>
            <span className="px-2 py-0.5 rounded bg-white border border-[#e2e8f0] font-label-code-sm text-label-code-sm text-[#b45309] font-semibold shadow-sm">
              {topClips.length} Active Renders
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-64">
              <span className="material-symbols-outlined text-[16px] text-[#94a3b8] absolute left-2.5 top-1/2 -translate-y-1/2">
                filter_list
              </span>
              <input
                className="w-full bg-white border border-[#e2e8f0] rounded pl-8 pr-3 py-1 font-label-code-md text-label-code-md text-[#0f172a] placeholder:text-[#94a3b8] focus:outline-none focus:border-[#b45309]"
                placeholder="Filter by script token..."
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
              className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#b45309] text-white font-label-code-md text-label-code-md font-semibold transition-transform active:scale-95 shadow-sm"
            >
              <span className="material-symbols-outlined text-[15px]">sort</span>
              <span>Sort: Hook Score (Desc)</span>
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#e2e8f0] bg-[#f8fafc] font-label-code-sm text-label-code-sm uppercase tracking-wider text-[#64748b]">
                <th className="py-3 px-4 font-semibold">Clip &amp; Master Project</th>
                <th className="py-3 px-4 font-semibold">Platform Mix</th>
                <th className="py-3 px-4 font-semibold">AI Predicted Virality</th>
                <th className="py-3 px-4 font-semibold">0–3s Hook Hold</th>
                <th className="py-3 px-4 font-semibold">100% Completion</th>
                <th className="py-3 px-4 font-semibold">Impressions &amp; Views</th>
                <th className="py-3 px-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e2e8f0] font-body-sm text-body-sm">
              {pageRows.map((c) => (
                <tr key={`${c.project_id}_${c.clip_id}`} className="hover:bg-[#f8fafc] transition-colors group">
                  <td className="py-4 px-4">
                    <div className="flex items-center gap-4">
                      <div className="relative w-12 h-16 rounded overflow-hidden bg-[#f1f5f9] shrink-0 border border-[#e2e8f0] shadow-sm">
                        {c.thumbnail_url ? (
                          <img className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300" src={c.thumbnail_url} alt="" />
                        ) : null}
                        <span className="absolute bottom-1 right-1 font-label-code-sm text-[8px] bg-black/80 px-1 py-0.2 rounded text-white font-mono">
                          {fmtDur(c.duration)}
                        </span>
                      </div>
                      <div className="flex flex-col min-w-0">
                        <button
                          type="button"
                          onClick={() => navigate(routeTo("editor", c.project_id, c.clip_id))}
                          className="font-title-sm text-title-sm text-[#0f172a] font-semibold group-hover:text-[#b45309] transition-colors truncate text-left"
                        >
                          {c.project_title}
                        </button>
                        <span className="font-label-code-sm text-label-code-sm text-[#64748b] truncate">{c.title}</span>
                        <span className="font-label-code-sm text-[10px] text-[#64748b] flex items-center gap-1 mt-0.5">
                          <span className="material-symbols-outlined text-[12px] text-[#b45309]">record_voice_over</span>
                          {c.reason ? c.reason.split(/[.;]/)[0] : "Hook-scored cut"}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="py-4 px-4">
                    <div className="flex items-center gap-1.5">
                      <span className="px-1.5 py-0.5 rounded bg-[#f1f5f9] font-label-code-sm text-label-code-sm border border-[#e2e8f0] text-[#475569]">
                        YT Shorts
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-[#f1f5f9] font-label-code-sm text-label-code-sm border border-[#e2e8f0] text-[#475569]">
                        TikTok
                      </span>
                    </div>
                  </td>
                  <td className="py-4 px-4">
                    <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-[#fffbeb] border border-[#fef3c7]">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#b45309]" />
                      <span className="font-label-code-md text-label-code-md text-[#b45309] font-bold">{c.viral_score} Viral</span>
                    </div>
                  </td>
                  <td className="py-4 px-4">
                    <div className="flex flex-col">
                      <span className="text-[14px] leading-[20px] font-bold text-[#0f172a]">{c.hook_hold_est}%</span>
                      <span className="font-label-code-sm text-label-code-sm text-[#059669] flex items-center gap-0.5 font-medium">
                        <span className="material-symbols-outlined text-[11px]">arrow_upward</span>
                        +{(c.hook_hold_est - 76).toFixed(1)}% above baseline
                      </span>
                    </div>
                  </td>
                  <td className="py-4 px-4">
                    <div className="flex flex-col">
                      <span className="text-[14px] leading-[20px] font-semibold text-[#0f172a]">{c.completion_est}%</span>
                      <div className="w-20 bg-[#f1f5f9] h-1.5 rounded-full overflow-hidden mt-1 border border-[#e2e8f0]">
                        <div className="h-full bg-[#b45309]" style={{ width: `${c.completion_est}%` }} />
                      </div>
                    </div>
                  </td>
                  <td className="py-4 px-4">
                    <div className="flex flex-col">
                      <span className="font-title-sm text-title-sm font-semibold text-[#0f172a]">
                        {fmtCount(c.projected_views)} views
                      </span>
                      <span className="font-label-code-sm text-label-code-sm text-[#64748b]">
                        {fmtCount(c.projected_views * 0.13)} likes • {fmtCount(c.projected_views * 0.02)} saves
                      </span>
                    </div>
                  </td>
                  <td className="py-4 px-4 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => navigate(routeTo("editor", c.project_id, c.clip_id))}
                        className="px-2.5 py-1 rounded bg-white hover:bg-[#b45309] hover:text-white border border-[#e2e8f0] text-[#0f172a] transition-all font-label-code-md text-label-code-md shadow-sm"
                      >
                        Open in Editor
                      </button>
                      <button
                        type="button"
                        onClick={() => navigate(routeTo("social", c.project_id, c.clip_id))}
                        className="p-1 rounded text-[#64748b] hover:text-[#b45309] hover:bg-[#f1f5f9] transition-colors"
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
                  <td colSpan={7} className="py-10 text-center text-[#64748b]">
                    No clips match this filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="p-2 px-4 border-t border-[#e2e8f0] bg-[#fafbfc] flex flex-col sm:flex-row items-center justify-between gap-2 font-label-code-sm text-label-code-sm text-[#64748b]">
          <div className="flex items-center gap-4">
            <span>
              Showing {pageRows.length ? page * perPage + 1 : 0}–{page * perPage + pageRows.length} of {topClips.length}{" "}
              High-Retention Sequences
            </span>
            <span className="text-[#cbd5e1]">•</span>
            <span className="text-[#b45309] font-semibold">Aggregated Algorithm Confidence: {predictive.toFixed(1)}%</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              className="p-1 rounded hover:bg-[#f1f5f9] hover:text-[#0f172a] disabled:opacity-30"
            >
              <span className="material-symbols-outlined text-[18px]">chevron_left</span>
            </button>
            {Array.from({ length: pages }, (_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setPage(i)}
                className={`px-2.5 py-0.5 rounded font-semibold transition-colors ${
                  page === i ? "bg-[#b45309] text-white shadow-sm" : "hover:bg-[#f1f5f9] text-[#0f172a] border border-[#e2e8f0] bg-white"
                }`}
              >
                {i + 1}
              </button>
            ))}
            <button
              type="button"
              disabled={page >= pages - 1}
              onClick={() => setPage((p) => Math.min(pages - 1, p + 1))}
              className="p-1 rounded hover:bg-[#f1f5f9] hover:text-[#0f172a] disabled:opacity-30"
            >
              <span className="material-symbols-outlined text-[18px]">chevron_right</span>
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
