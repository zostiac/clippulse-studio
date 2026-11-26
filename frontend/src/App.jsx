import React from "react";
import { StudioProvider, useStudio } from "./studio.jsx";
import Sidebar from "./components/shell/Sidebar.jsx";
import TopHeader from "./components/shell/TopHeader.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Projects from "./pages/Projects.jsx";
import Editor from "./pages/Editor.jsx";
import Analytics from "./pages/Analytics.jsx";
import Settings from "./pages/Settings.jsx";
import SocialKit from "./pages/SocialKit.jsx";

function Toaster() {
  const { toasts, dismissToast } = useStudio();
  if (!toasts.length) return null;
  const icon = { success: "check_circle", error: "error", info: "info" };
  return (
    <div className="fixed bottom-6 right-6 z-[80] flex flex-col gap-space-sm items-end pointer-events-none">
      {toasts.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => dismissToast(t.id)}
          className="pointer-events-auto flex items-center gap-space-xs px-space-md py-space-sm rounded-lg bg-inverse-surface text-inverse-on-surface shadow-xl text-left"
        >
          <span
            className={`material-symbols-outlined text-[20px] ${
              t.kind === "success" ? "text-tertiary-fixed" : t.kind === "error" ? "text-error-container" : "text-primary-fixed-dim"
            }`}
          >
            {icon[t.kind] || "info"}
          </span>
          <span className="font-body-sm text-body-sm font-medium max-w-sm">{t.message}</span>
        </button>
      ))}
    </div>
  );
}

function Shell() {
  const { route } = useStudio();
  const editorial = route.name === "projects" || route.name === "analytics" || route.name === "social";
  const shellVariant = editorial ? "editorial" : "material";

  let page = null;
  switch (route.name) {
    case "projects":
      page = <Projects />;
      break;
    case "editor":
      page = <Editor />;
      break;
    case "analytics":
      page = <Analytics />;
      break;
    case "settings":
      page = <Settings />;
      break;
    case "social":
      page = <SocialKit />;
      break;
    case "dashboard":
    default:
      page = <Dashboard />;
      break;
  }

  return (
    <div className={`min-h-screen ${editorial ? "bg-[#fafafa] text-[#0f172a]" : "bg-surface text-on-surface"}`}>
      <Sidebar variant={shellVariant} />
      <div className="pl-64">
        <TopHeader variant={shellVariant} />
        <main className={editorial ? "relative pt-14 min-h-screen" : "relative pt-16 min-h-screen"}>{page}</main>
      </div>
      <Toaster />
    </div>
  );
}

export default function App() {
  return (
    <StudioProvider>
      <Shell />
    </StudioProvider>
  );
}
