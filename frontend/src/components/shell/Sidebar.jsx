import React from "react";
import { useStudio, routeTo } from "../../studio.jsx";
import { fmtBytes } from "../../utils/format.js";

const NAV = [
  { key: "dashboard", label: "Dashboard", icon: "grid_view" },
  { key: "projects", label: "Projects", icon: "video_library" },
  { key: "editor", label: "Editor", icon: "movie_edit" },
  { key: "analytics", label: "Analytics", icon: "monitoring" },
  { key: "settings", label: "Settings", icon: "settings" },
];

const VAULT_CAP_BYTES = 500 * 1024 * 1024 * 1024;

export default function Sidebar({ variant = "material" }) {
  const { route, navigate, analytics } = useStudio();
  const used = analytics?.storage?.total_bytes ?? 0;
  const pct = Math.min(100, (used / VAULT_CAP_BYTES) * 100);

  const go = (key) => {
    if (key === "editor") {
      const last = analytics?.top_clips?.[0]?.project_id || null;
      navigate(routeTo("editor", last || route.projectId || undefined));
    } else {
      navigate(routeTo(key));
    }
  };

  if (variant === "editorial") {
    return (
      <aside className="fixed left-0 top-0 h-full w-64 bg-[#f8f9fa] z-50 flex flex-col justify-between py-2 border-r border-[#e2e8f0] shadow-sm">
        <div className="flex flex-col gap-4">
          <div className="h-14 px-2 flex items-center justify-between border-b border-[#e2e8f0]">
            <div className="flex items-center gap-1">
              <span className="material-symbols-outlined text-[#b45309] text-[22px]">movie_edit</span>
              <div className="flex items-baseline gap-1">
                <span className="font-headline-md text-[22px] leading-[30px] font-medium tracking-tight text-[#0f172a]">
                  ClipPulse
                </span>
                <span className="font-label-code-sm text-label-code-sm uppercase px-1.5 py-0.5 rounded bg-[#f1f5f9] text-[#b45309] border border-[#e2e8f0] font-semibold">
                  Studio
                </span>
              </div>
            </div>
          </div>
          <div className="px-2">
            <div className="font-label-code-sm text-label-code-sm uppercase tracking-wider text-[#94a3b8] px-1 mb-1 font-semibold">
              Navigation
            </div>
            <nav className="flex flex-col gap-1">
              {NAV.map((item) => {
                const active = route.name === item.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => go(item.key)}
                    className={`flex items-center px-2 py-1 rounded text-left transition-all font-body-sm text-body-sm ${
                      active
                        ? "bg-white text-[#903f00] font-semibold border border-[#e2e8f0] shadow-sm"
                        : "text-[#64748b] hover:bg-white hover:text-[#0f172a]"
                    }`}
                  >
                    {item.label}
                  </button>
                );
              })}
            </nav>
          </div>
        </div>
        <div className="px-2 flex flex-col gap-2">
          <div className="p-2 rounded bg-white border border-[#e2e8f0] shadow-sm flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span className="font-label-code-sm text-label-code-sm uppercase text-[#64748b]">Vault Storage</span>
              <span className="font-label-code-sm text-label-code-sm text-[#b45309] font-semibold">
                {fmtBytes(used)} / 500 GB
              </span>
            </div>
            <div className="w-full h-1.5 bg-[#f1f5f9] rounded-full overflow-hidden">
              <div className="h-full bg-[#b45309] rounded-full" style={{ width: `${Math.max(2, pct)}%` }} />
            </div>
          </div>
          <div className="p-2 rounded bg-white border border-[#e2e8f0] shadow-sm flex items-center justify-between">
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-[#10b981] shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
              <span className="font-label-code-sm text-label-code-sm uppercase text-[#0f172a] font-semibold">
                Studio Pro v2.8
              </span>
            </div>
            <span className="font-label-code-sm text-label-code-sm text-[#10b981] uppercase font-bold">Active</span>
          </div>
        </div>
      </aside>
    );
  }

  return (
    <aside className="fixed left-0 top-0 h-full w-64 bg-surface-container-lowest z-50 flex flex-col justify-between shadow-[0_1px_8px_rgba(0,0,0,0.04)]">
      <div className="flex flex-col">
        <div className="h-16 px-margin flex items-center gap-space-sm bg-surface-container-lowest">
          <span className="font-headline-sm text-headline-sm font-semibold tracking-tight text-on-surface">
            ClipPulse
          </span>
          <span className="px-space-xs py-0.5 rounded-lg bg-primary-container text-on-primary-container font-label-sm text-label-sm uppercase font-semibold">
            STUDIO
          </span>
        </div>
        <nav className="flex flex-col gap-space-xs px-margin-sm mt-space-md">
          {NAV.map((item) => {
            const active = route.name === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => go(item.key)}
                className={`flex items-center gap-space-sm px-space-md py-space-sm rounded-lg transition-all text-left ${
                  active
                    ? "bg-surface-container-high text-on-surface font-semibold"
                    : "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
                }`}
              >
                <span className="material-symbols-outlined text-[20px]">{item.icon}</span>
                <span className="font-body-md text-body-md">{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>
      <div className="p-margin-sm bg-surface-container-low flex flex-col gap-space-md">
        <div className="bg-surface-container-lowest p-space-sm rounded-lg shadow-[0_1px_8px_rgba(0,0,0,0.02)] flex flex-col gap-space-xs">
          <div className="flex items-center justify-between text-on-surface-variant font-label-sm text-label-sm">
            <span>Storage</span>
            <span className="font-label-sm text-label-sm font-semibold text-on-surface">
              {fmtBytes(used)} / 500 GB
            </span>
          </div>
          <div className="w-full h-1.5 bg-surface-container-highest rounded-full overflow-hidden">
            <div className="bg-primary-container h-full" style={{ width: `${Math.max(2, pct)}%` }} />
          </div>
        </div>
        <div className="flex items-center justify-between px-space-xs">
          <div className="flex items-center gap-space-xs">
            <span className="w-2 h-2 rounded-full bg-tertiary-container" />
            <span className="font-label-sm text-label-sm uppercase font-semibold text-on-surface-variant">
              STUDIO PRO V2.8 ACTIVE
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
}
