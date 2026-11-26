import React from "react";
import StatsSlate from "./StatsSlate";
import NewProject from "./NewProject";
import ProjectGrid from "./ProjectGrid";

export default function Dashboard({ projects, settings, onProjectCreated, onOpenProject, onDeleteProject, onOpenSettings }) {
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-10 space-y-8">
        <div className="max-w-2xl">
          <h1 className="text-3xl sm:text-4xl font-bold text-ink leading-tight">Turn long videos into shorts</h1>
          <p className="mt-2 text-base text-muted leading-relaxed">
            Add a video, review the moments ClipPulse finds, then trim, caption and export them in 9:16.
          </p>
        </div>

        <StatsSlate projects={projects} />

        <NewProject
          settings={settings}
          hasProjects={projects.length > 0}
          onProjectCreated={onProjectCreated}
          onOpenSettings={onOpenSettings}
        />

        <ProjectGrid projects={projects} onOpen={onOpenProject} onDelete={onDeleteProject} />
      </div>
    </div>
  );
}
