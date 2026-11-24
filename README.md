# ClipPulse Studio

AI-powered long-form YouTube & video clipping platform that turns podcasts, keynotes, and videos into ready-to-publish 9:16 vertical clips for **YouTube Shorts**, **Instagram Reels**, and **TikTok**.

## Features
- **3 Ingestion Modes**:
  - **YouTube URL** (`yt-dlp` + `youtube-transcript-api` + optional Netscape `cookies.txt` in Settings)
  - **Direct Video Upload** (`.mp4`, `.mov`, `.webm`, `.mkv` + optional `.srt`/`.vtt` or plain transcript)
  - **Instant Studio Demos** (two built-in multi-speaker studio projects ready to test immediately)
- **100% Free AI Viral Clip Detection**:
  - Works completely free out of the box using **local `faster-whisper`** word-level speech-to-text, FFmpeg RMS audio energy analysis, and hook/pacing/payoff heuristic scoring (`0–99` viral score with Hook, Retention, Shareability, and Clarity sub-scores).
  - Optional **Free-Tier API** support in Settings for **Groq** (free Whisper Large v3 + Llama 3.3 70B), **Google Gemini** (free AI Studio tier), **OpenRouter** (`:free` models), or OpenAI BYOK.
- **9:16 Vertical Studio & Safe-Zone Previews**:
  - Layouts: **Smart 9:16 Crop** (with horizontal speaker pan), **Blur-Fill 16:9**, and **Split Screen** (top/bottom dual framing).
  - Dynamic Word-by-Word Captions: **Hormozi Pop**, **Beast Clean**, **Minimal Pill**, **Neon Creator**, plus 3-second top Hook Banner.
  - Platform Safe-Zone Overlays for **YouTube Shorts**, **Instagram Reels**, and **TikTok**.
- **Real FFmpeg + libass MP4 Export**:
  - Frame-accurate trimming, **1080×1920 (Full HD, minimum)** or **1440×2560 (QHD)** H.264 MP4 rendering with burned-in `.ass` animated captions (legacy 720p settings are automatically upgraded to the 1080p floor).
  - Download individual MP4s or a complete **ZIP bundle** with ready-to-copy YouTube Shorts, Instagram Reels, and TikTok titles, descriptions, and hashtags.

## Running Locally

### Prerequisites
- **FFmpeg** installed and on PATH (`ffmpeg -version` to verify)
- **Python 3.10–3.13** (3.14 is not yet supported by the pinned `youtube-transcript-api`/`numpy`/`faster-whisper` wheels)
- **Node.js 20+** (for frontend build)

### Quick Start
```bash
# 1. Clone & enter
cd clippulse

# 2. Backend dependencies
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt

# 3. Frontend build
cd ../frontend
npm install
npm run build

# 4. Start unified FastAPI server on port 8000
cd ../backend
uvicorn main:app --host 127.0.0.1 --port 8000
```

Open **http://localhost:8000** — the API serves the built React app automatically.

### Development Mode (Hot Reload)
```bash
# Terminal 1: Backend with auto-reload
cd backend
uvicorn main:app --reload --port 8000

# Terminal 2: Frontend dev server (proxies /api & /media to backend)
cd frontend
npm run dev
```
Then open **http://localhost:5173**.

---

## Project Structure
```
clippulse/
├── backend/
│   ├── main.py           # FastAPI app — all REST endpoints
│   ├── models.py         # Pydantic models + file-based storage
│   ├── analyzer.py       # Transcription + viral clip detection (heuristic + LLM)
│   ├── ingest.py         # YouTube download (yt-dlp), subtitle parsing, demo generator
│   ├── exporter.py       # FFmpeg + libass MP4 export (3 layouts, 4 caption styles)
│   └── requirements.txt  # Python deps (pinned)
├── frontend/
│   ├── src/
│   │   ├── App.jsx       # Main app — state, routing, 3-panel studio
│   │   ├── api.js        # Fetch wrapper with timeout/abort
│   │   ├── components/
│   │   │   ├── HeaderBar.jsx
│   │   │   ├── IngestView.jsx
│   │   │   ├── ClipListSidebar.jsx
│   │   │   ├── StudioPreview.jsx   # 9:16 phone preview + waveform scrubber
│   │   │   ├── EditorControls.jsx  # Layout, captions, pan, hook banner
│   │   │   ├── TranscriptEditor.jsx
│   │   │   ├── SocialMetadataPanel.jsx
│   │   │   └── SettingsModal.jsx
│   │   ├── index.css     # Tailwind v4 + custom styles
│   │   └── main.jsx
│   ├── package.json
│   ├── vite.config.js    # Proxies /api & /media to backend
│   └── index.html
├── data/                 # Runtime data (gitignored)
│   ├── demos/            # Built-in demo MP4s (generated on first run)
│   ├── projects/         # Per-project: source.mp4, project.json, thumb.jpg
│   └── exports/          # Rendered MP4s + .ass files
├── .gitignore
└── README.md
```

---

## Configuration

### Settings (UI: Gear icon → Settings Modal)
| Setting | Description |
|---------|-------------|
| **AI Provider** | `local_free` (default), `groq`, `gemini`, `openrouter`, `openai` |
| **API Key** | Required for non-local providers (Groq/Gemini/OpenRouter keys are free) |
| **Model** | Override default model per provider |
| **Local Whisper** | Enable/disable `faster-whisper` fallback (tiny/base) |
| **Default Caption Style** | Hormozi Pop / Beast Clean / Minimal Pill / Neon Creator / Off |
| **Default Layout** | Smart 9:16 Crop / Blur-Fill 16:9 / Split Screen |
| **YouTube Cookies** | Paste Netscape-format `cookies.txt` to bypass YouTube bot checks on cloud servers |

### Local API security

- The API is intended for local use by default. Requests from non-loopback clients are rejected unless `CLIPPULSE_API_TOKEN` is configured.
- CORS uses an explicit local-origin allowlist. Add only the exact browser origins you trust with `CLIPPULSE_ALLOWED_ORIGINS`.
- If you expose the app on a LAN or through a reverse proxy, use HTTPS, real user authentication, rate limiting, and have the trusted proxy inject `X-API-Token` on both API and `/media/` requests. Do **not** put a shared token in a `VITE_*` variable or frontend bundle.
- The development server binds to `127.0.0.1` by default. Set `VITE_DEV_HOST=0.0.0.0` and explicitly list the device hostname/IP in `VITE_ALLOWED_HOSTS` only when you intentionally need LAN access and have secured the backend/proxy.
- YouTube cookies are sensitive session credentials; store only your own cookies and keep the data directory private.

### Environment Variables (Optional)
```bash
# Backend .env (create if needed)
CLIPPULSE_DATA_DIR=./data          # Override data directory
CLIPPULSE_FFMPEG_PATH=ffmpeg       # Custom ffmpeg binary path
CLIPPULSE_MAX_UPLOAD_MB=1024       # Video upload size cap (1–4096 MB)
CLIPPULSE_MAX_SUBTITLE_MB=5        # Subtitle/transcript cap (1–25 MB)
CLIPPULSE_ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
CLIPPULSE_API_TOKEN=               # Optional shared API token for remote API clients
```

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/health` | Health check + capability report (ffmpeg/ffprobe/local whisper) |
| `GET` | `/api/settings` | Get current settings (keys masked) |
| `PUT` | `/api/settings` | Update settings |
| `POST` | `/api/settings/cookies` | Upload YouTube cookies.txt |
| `DELETE` | `/api/settings/cookies` | Clear cookies |
| `GET` | `/api/projects` | List all projects |
| `GET` | `/api/projects/{id}` | Get project with clips |
| `DELETE` | `/api/projects/{id}` | Delete project |
| `POST` | `/api/projects/demo` | Create demo project (`{demo_key: "podcast_creators"|"tech_keynote"}`) |
| `POST` | `/api/projects/youtube` | Ingest from YouTube URL |
| `POST` | `/api/projects/upload` | Upload video file (multipart; size-capped via `CLIPPULSE_MAX_UPLOAD_MB`, container-sniffed) |
| `POST` | `/api/projects/{id}/reanalyze` | Re-run viral detection |
| `PUT` | `/api/projects/{id}/transcript` | Update transcript segments |
| `POST` | `/api/projects/{id}/clips` | Create custom clip |
| `PATCH` | `/api/projects/{id}/clips/{clip_id}` | Update clip (trim, style, meta) |
| `DELETE` | `/api/projects/{id}/clips/{clip_id}` | Delete clip |
| `POST` | `/api/projects/{id}/clips/{clip_id}/export` | Export single clip to MP4 |
| `POST` | `/api/projects/{id}/export-all` | Export all clips |
| `GET` | `/api/projects/{id}/download-bundle` | Download ZIP bundle |
| `GET` | `/media/projects/{id}/{file}` | Stream source video/thumbnail |
| `GET` | `/media/exports/{file}` | Stream exported MP4 |

---

## Code Review — Known Issues & Fixes

> **Status**: This project was reviewed for security, correctness, and maintainability. See `CODE_REVIEW.md` for full details.

### Critical (Fixed in this version)
- **C1**: Path traversal in `/media/projects/{project_id}/{filename}` — sanitized both `project_id` and `filename` with `Path(...).name`
- **C2**: Shell injection via ASS filter path — used `shlex.quote()` for filtergraph interpolation
- **C4**: Export race condition — wrapped `_run_export_job` with global `_store_lock`

### High Priority (Fixed in this version)
- **H1**: ASS path injection — addressed via `shlex.quote()`
- **H2**: Silent transcription failure — transcription errors now raise `TranscriptionError`, persist `status="error"` with `error_message`, and surface in the UI (422)
- **H3**: Demo video duplication — demo assets are hardlinked/symlinked into new projects instead of copied
- **H4**: Exported video URL leaked internal filename — cache-buster now uses a numeric `exported_at` timestamp
- **H5**: SPA fallback masks 404s — added `/api` exclusion

### Also fixed in this version
- **1080p export floor** — clip exports render at 1080×1920 minimum (optional 1440×2560 QHD); legacy 720p settings auto-upgrade
- **Broken install** — `yt-dlp` pin now points at an existing PyPI release; `package-lock.json` re-synced so `npm ci` works
- **Broken lint** — ESLint 9 flat config added, `npm run lint` runs clean
- **Upload guardrails** — configurable size caps + container magic-byte sniffing on uploads

### Medium Priority (Backlog)
- **M1–M10**: Code organization, testability, timeouts, pinned deps, error boundaries — see `CODE_REVIEW.md`

---

## Tech Stack
| Layer | Technology |
|-------|------------|
| Backend | FastAPI 0.115, Uvicorn, Pydantic v2 |
| AI/ML | `faster-whisper` (CPU int8), optional Groq/Gemini/OpenRouter/OpenAI |
| Video | FFmpeg 6+ (libx264, libass, lavfi) |
| Frontend | React 18, Vite 6, Tailwind CSS v4, Lucide Icons |
| Data | File-based JSON (no database) |

---

## License
MIT — Free for personal and commercial use.

---

## Contributing
1. Fork → branch → PR
2. Run `python backend/smoke_test.py` and `npm run lint` before committing
3. Add tests for new heuristic scoring logic

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `ffmpeg not found` | Install FFmpeg and ensure it's on PATH |
| `Could not find a version that satisfies the requirement youtube-transcript-api==1.0.0` (or similar "requires a different python version") | You're on Python 3.14+. Install Python 3.12 (`winget install Python.Python.3.12`), recreate the venv with `py -3.12 -m venv venv`, and reinstall requirements |
| `ModuleNotFoundError: faster_whisper` | `pip install -r backend/requirements.txt` |
| YouTube download fails with "Sign in to confirm" | Add cookies.txt in Settings, or use Upload/Demo mode |
| Frontend shows blank page | Run `npm run build` in `frontend/`, then restart backend |
| Export fails with "FFmpeg export failed" | Check FFmpeg version (`ffmpeg -version`); ensure libass support |
| Port 8000 in use | Change port: `uvicorn main:app --port 8080` |

---

## Roadmap
- [ ] Batch clip export with progress WebSocket
- [ ] Custom font upload for captions
- [ ] Multi-language whisper support
- [ ] Direct TikTok/Reels/Shorts publishing (OAuth)
- [ ] Project templates & branding presets
- [ ] Unit test suite (pytest + vitest)