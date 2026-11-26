# Project memory

## Product intent & audience

- Caption/transcript editor app.
- Core capabilities inferred: video ingestion, analysis, transcript editing, clip management, studio preview, export, and settings.
- Audience assumed to be creators/editors working with video captions and transcripts (unconfirmed).

## Brand personality & voice

- Not yet established.

## Visual design & UX direction

- Frontend structure includes main views/components: transcript editor, clip list, studio preview, settings.
- No aesthetic, color, typography, spacing, or interaction details inferred yet.

## Decisions, constraints & rationale

- Backend: Python, FastAPI-based; includes video ingestion, analysis, and export tooling.
- Frontend: React + Vite.
- Repo has tests, a CI workflow, and a code review doc.
- Project is not initialized as a git repo, though source files are present.

## Open questions & assumptions

- Exact target user and primary use cases unconfirmed.
- Deployment target, environments, and runtime constraints unknown.
- Design system, component library, and accessibility requirements not yet specified.
- Whether the app is local-only, web-based, or hybrid is unconfirmed.
- Export formats and supported video/media types not yet defined.