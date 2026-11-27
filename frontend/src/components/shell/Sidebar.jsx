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
  const { route, navigate, analytics, sidebarOpen, setSidebarOpen } = useStudio();
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

  const editorial = variant === "editorial";

  return (
    <>
      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed left-0 top-0 h-full w-64 z-50 flex flex-col justify-between py-2 transition-transform duration-300 lg:translate-x-0 ${
          editorial
            ? "bg-[#f8f9fa] border-r border-[#e2e8f0] shadow-sm"
            : "bg-surface-container-lowest shadow-[0_1px_8px_rgba(0,0,0,0.04)]"
        } ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="flex flex-col gap-4">
          <div
            className={`flex items-center justify-between px-2 ${
              editorial ? "h-14 border-b border-[#e2e8f0]" : "h-16 px-margin"
            }`}
          >
            <div className="flex items-center gap-1">
              {editorial ? (
                <>
                  <span className="material-symbols-outlined text-[#b45309] text-[22px]">movie_edit</span>
                  <div className="flex items-baseline gap-1">
                    <span className="font-headline-md text-[22px] leading-[30px] font-medium tracking-tight text-[#0f172a]">
                      ClipPulse
                    </span>
                    <span className="font-label-code-sm text-label-code-sm uppercase px-1.5 py-0.5 rounded bg-[#f1f5f9] text-[#b45309] border border-[#e2e8f0] font-semibold">
                      Studio
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <span className="font-headline-sm text-headline-sm font-semibold tracking-tight text-on-surface">
                    ClipPulse
                  </span>
                  <span className="px-space-xs py-0.5 rounded-lg bg-primary-container text-on-primary-container font-label-sm text-label-sm uppercase font-semibold">
                    STUDIO
                  </span>
                </>
              )}
            </div>
            <button
              type="button"
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden p-1 rounded text-on-surface-variant hover:bg-surface-container-high"
              aria-label="Close menu"
            >
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>
          <div className={editorial ? "px-2" : "px-margin-sm"}>
            {editorial && (
              <div className="font-label-code-sm text-label-code-sm uppercase tracking-wider text-[#94a3b8] px-1 mb-1 font-semibold">
                Navigation
              </div>
            )}
            <nav className="flex flex-col gap-1">
              {NAV.map((item) => {
                const active = route.name === item.key;
                if (editorial) {
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => go(item.key)}
                      className={`flex items-center gap-2 px-2 py-1.5 rounded text-left transition-all font-body-sm text-body-sm ${
                        active
                          ? "bg-white text-[#903f00] font-semibold border border-[#e2e8f0] shadow-sm"
                          : "text-[#64748b] hover:bg-white hover:text-[#0f172a]"
                      }`}
                    >
                      <span className="material-symbols-outlined text-[18px]">{item.icon}</span>
                      <span>{item.label}</span>
                    </button>
                  );
                }
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
        </div>
        <div className={editorial ? "px-2 flex flex-col gap-2" : "p-margin-sm bg-surface-container-low flex flex-col gap-space-md"}>
          <div
            className={`p-2 rounded ${
              editorial
                ? "bg-white border border-[#e2e8f0] shadow-sm flex flex-col gap-1"
                : "bg-surface-container-lowest p-space-sm rounded-lg shadow-[0_1px_8px_rgba(0,0,0,0.02)] flex flex-col gap-space-xs"
            }`}
          >
            <div
              className={`flex items-center justify-between ${
                editorial ? "font-label-code-sm text-label-code-sm uppercase text-[#64748b]" : "text-on-surface-variant font-label-sm text-label-sm"
              }`}
            >
              <span>Vault Storage</span>
              <span className={`font-semibold ${editorial ? "text-[#b45309]" : "text-on-surface"}`}>
                {fmtBytes(used)} / 500 GB
              </span>
            </div>
            <div
              className={`w-full h-1.5 rounded-full overflow-hidden ${
                editorial ? "bg-[#f1f5f9]" : "bg-surface-container-highest"
              }`}
            >
              <div
                className={editorial ? "h-full bg-[#b45309] rounded-full" : "bg-primary-container h-full rounded-full"}
                style={{ width: `${Math.max(2, pct)}%` }}
              />
            </div>
          </div>
          <div className={`flex items-center justify-between ${editorial ? "p-2 rounded bg-white border border-[#e2e8f0] shadow-sm" : "px-space-xs"}`}>
            <div className="flex items-center gap-1">
              <span className={`w-2 h-2 rounded-full ${editorial ? "bg-[#10b981] shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-tertiary-container"}`} />
              <span
                className={`font-label-sm text-label-sm uppercase font-semibold ${
                  editorial ? "text-[#0f172a]" : "text-on-surface-variant"
                }`}
              >
                Studio Pro v2.8
              </span>
            </div>
            <span className={`font-label-sm text-label-sm uppercase font-bold ${editorial ? "text-[#10b981]" : "text-tertiary-container"}`}>
              Active
            </span>
          </div>
        </div>
      </aside>
    </>
  );
}
