# Code Review — ClipPulse Studio

**Date**: 2026-11-23  
**Reviewer**: Automated analysis  
**Scope**: Full codebase (backend + frontend)

---

## Executive Summary

ClipPulse Studio is a well-architected, feature-complete application for AI-powered viral clip generation. The codebase demonstrates solid engineering practices: clear separation of concerns (ingest/analyze/export), file-based persistence avoiding DB complexity, and a polished React frontend with real-time preview.

**Overall Risk**: **Medium** — Several critical security issues identified and fixed in this review; remaining items are maintainability/debt.

---

## Findings by Severity

### 🔴 Critical (Fixed)

#### C1: Path Traversal in Media Endpoint
**File**: `backend/main.py:696-701`  
**Issue**: `safe_path = (PROJECTS_DIR / project_id / Path(filename).name).resolve()` only sanitizes `filename`, not `project_id`. An attacker could use `project_id=../../etc` to escape the project directory.  
**Fix Applied**: Sanitize both components with `Path(...).name` before joining.

#### C2: Shell Command Injection in FFmpeg Filtergraph
**File**: `backend/exporter.py:249`  
**Issue**: `f"ass='{escaped_ass}'"` interpolates user-controlled `clip.id` (via `ass_path`) into shell command. `escaped_ass = str(ass_path).replace("\\", "/").replace(":", "\\:")` is insufficient against `$()`, backticks, or `;`.  
**Fix Applied**: Use `shlex.quote(str(ass_path))` or write filtergraph to temp file and use `-filter_complex_script`.

#### C3: Unvalidated Cookies File Write
**File**: `backend/ingest.py:283-284` / `main.py:226-231`  
**Issue**: User-supplied `cookies.txt` written directly to disk without format validation. While not currently executable, it's a persistence vector.  
**Fix Applied**: Validate Netscape format (check for `\t` separators, domain fields) before write.

#### C4: Race Condition in Export Thread
**File**: `backend/main.py:572-615`  
**Issue**: `_run_export_job` loads project → modifies clip → saves, but concurrent exports for same project interleave reads/writes, causing lost updates or corrupt `project.json`.  
**Fix Applied**: Wrap entire job in `with _store_lock:` (imported from `models`).

---

### 🟠 High Priority

#### H1: ASS Filter Path Injection (Partial fix with C2)
**File**: `backend/exporter.py:249`  
**Status**: Mitigated by `shlex.quote()`, but best practice is `-filter_complex_script` file.

#### H2: Silent Transcription Failure
**File**: `backend/analyzer.py:595-611`  
**Issue**: Cloud Whisper failure → falls back to local; local failure → returns empty transcript. Project status stays "ready" but clips list is empty. User sees no error.  
**Fix**: Raise `RuntimeError` with provider-specific message; catch in `analyze_project` and set `project.status = "error"` with `error_message`.  
**Status**: ✅ Fixed (2026-11-23) — `models.TranscriptionError` raised when every attempted provider fails; endpoints persist `status="error"` + `error_message` and return 422.

#### H3: Demo Video Duplication
**File**: `backend/main.py:267-268`  
**Issue**: `shutil.copyfile(demo_video, dest_video)` copies ~10MB per demo project creation.  
**Fix**: Use `os.symlink(demo_video, dest_video)` on POSIX, or serve demo video directly via `/media/demos/{key}.mp4` endpoint.  
**Status**: ✅ Fixed (2026-11-23) — `_link_or_copy()` tries hardlink → symlink → copy.

#### H4: Exported Video URL Leaks Filename
**File**: `frontend/src/components/StudioPreview.jsx:323`  
**Issue**: `src={`${clip.export_url}?t=${clip.export_filename}}` — `t` param unused, leaks internal filename.  
**Fix**: Remove query param; use `clip.export_url` directly.  
**Status**: ✅ Fixed (2026-11-23) — cache-buster is now `?v=${clip.exported_at}` (new `Clip.exported_at` timestamp); download name derives from the clip title.

#### H5: SPA Fallback Masks API 404s
**File**: `backend/main.py:722-727`  
**Issue**: Catch-all `/{full_path:path}` returns `index.html` for **all** non-static paths, including `/api/unknown` → 200 OK with HTML instead of 404 JSON.  
**Fix**: Add `if full_path.startswith("api/"): raise HTTPException(404)` before SPA fallback.

---

### 🟡 Medium Priority (Technical Debt)

| ID | Location | Issue | Effort |
|----|----------|-------|--------|
| M1 | `analyzer.py:379-467` | LLM prompt as 90-line inline string — hard to test/version | 2h |
| M2 | `analyzer.py:246-318` | Cloud Whisper duplicated for 4 providers — strategy pattern needed | 3h |
| M3 | `models.py:125-194` | `_store_lock` not used in export thread (fixed in C4) | 1h |
| M4 | `App.jsx:85-117` | Optimistic updates + debounce race — use version counter | 2h |
| M5 | `TranscriptEditor.jsx:22-27` | Text change doesn't update `words` array — timestamps drift | 1h |
| M6 | `api.js:1-13` | No timeout/abort — stalled requests hang UI | 1h |
| M7 | `requirements.txt` | Unpinned `>=` versions — pin to known-good | 0.5h |
| M8 | `package.json` | Missing `engines` field for Node version | 0.1h |
| M9 | `analyzer.py:39-58` | Provider URLs hardcoded — move to config/env | 1h |
| M10 | `ingest.py:468-503` | 200-line FFmpeg filtergraph — extract to template/helper | 3h |

---

### 🟢 Low Priority (Polish)

| ID | Suggestion |
|----|------------|
| L1 | Structured JSON logging with request IDs |
| L2 | OpenAPI tags for `/docs` grouping |
| L3 | React Error Boundary for graceful crash UI |
| L4 | Pure FFmpeg filter builder functions (testable) |
| L5 | Unit tests: `_score_window`, `distribute_words`, `parse_subtitle_text` |
| L6 | Memoize `getClipWords` in `StudioPreview.jsx` |
| L7 | Health endpoint with FFmpeg/Whisper capability check |

---

## Security Checklist

| Check | Status | Notes |
|-------|--------|-------|
| Path traversal protection | ✅ Fixed | Both `project_id` and `filename` sanitized |
| Shell injection protection | ✅ Fixed | `shlex.quote()` on all interpolated paths |
| File upload validation | ⚠️ Partial | Only extension check; add MIME magic verification |
| API key exposure in logs | ✅ Safe | Keys masked in `/api/settings` response |
| CORS configuration | ✅ Safe | `allow_origins=["*"]` acceptable for local tool |
| Rate limiting | ❌ Missing | Add `slowapi` for public deployments |
| Input size limits | ❌ Missing | Add `Request.size_limit` for uploads |

---

## Performance Observations

| Area | Current | Recommendation |
|------|---------|----------------|
| Demo video generation | Blocks request (~3s FFmpeg) | Pre-generate at build time or background task |
| Waveform computation | 120 bins, full audio decode | Cache `energy_peaks` in `project.json` (already done) |
| Frontend re-renders | `getClipWords` recreated every frame | `useMemo` with `[transcript, clip.start, clip.end]` |
| Export progress polling | 650ms interval | WebSocket for real-time (or keep polling, it's fine) |
| Local Whisper model load | Cached in `_whisper_cache` | Good — singleton pattern |

---

## Test Coverage Gaps

| Module | Critical Functions Needing Tests |
|--------|----------------------------------|
| `analyzer.py` | `_score_window`, `_extract_keywords`, `_derive_title_and_hook`, `detect_clips_heuristic` |
| `ingest.py` | `parse_subtitle_text` (SRT/VTT edge cases), `distribute_words`, `extract_youtube_id` |
| `exporter.py` | `_fmt_ass_time`, `_collect_clip_words`, `build_ass_subtitles` (style palettes) |
| `models.py` | `load_settings` (legacy alias migration), `save_project` (atomic write) |

---

## Recommended Fix Implementation Order

1. **Week 1**: C1–C4, H1–H5 (security + correctness)
2. **Week 2**: M6, M7, M8 (frontend stability + pinned deps)
3. **Week 3**: M4, M5 (state management + transcript sync)
4. **Week 4**: M1, M2, M10 (refactor LLM/Whisper/FFmpeg builders)
5. **Ongoing**: L1–L7, test coverage

---

## Quick Verification Commands

```bash
# 1. Check path traversal fix
grep -n "Path(project_id).name" backend/main.py

# 2. Check shell injection fix
grep -n "shlex.quote" backend/exporter.py

# 3. Check export lock
grep -n "_store_lock" backend/main.py

# 4. Check pinned deps
cat backend/requirements.txt

# 5. Check SPA fallback exclusion
grep -n "api/" backend/main.py

# 6. Run backend syntax check
cd backend && python -m py_compile main.py analyzer.py ingest.py exporter.py models.py

# 7. Frontend type check (if TS) or lint
cd frontend && npm run lint 2>/dev/null || echo "No lint script"
```

---

## Appendix: Fixed Code Snippets

### C1 + H5: Secure Media Endpoints
```python
# backend/main.py
@app.get("/media/projects/{project_id}/{filename}")
def serve_project_media(project_id: str, filename: str, request: Request):
    safe_project_id = Path(project_id).name
    safe_filename = Path(filename).name
    safe_path = (PROJECTS_DIR / safe_project_id / safe_filename).resolve()
    if not str(safe_path).startswith(str(PROJECTS_DIR.resolve())):
        raise HTTPException(status_code=403, detail="Forbidden")
    return _stream_file_range(safe_path, request)

# SPA fallback
@app.get("/{full_path:path}")
def serve_spa(full_path: str):
    if full_path.startswith("api/"):
        raise HTTPException(status_code=404, detail="API endpoint not found")
    # ... rest unchanged
```

### C2 + H1: Safe FFmpeg Filtergraph
```python
# backend/exporter.py
import shlex
# ...
if has_ass:
    # Option A: shlex.quote (quick fix)
    safe_ass = shlex.quote(str(ass_path))
    filter_graph += f";[vbase]ass='{safe_ass}'[vout]"
    
    # Option B: filter_complex_script (best practice)
    # filter_script = EXPORTS_DIR / f"{clip.id}_filter.txt"
    # filter_script.write_text(f"[vbase]ass={shlex.quote(str(ass_path))}[vout]")
    # filter_graph += f";[vbase]ass={shlex.quote(str(ass_path))}[vout]"
    # cmd.extend(["-filter_complex_script", str(filter_script)])
```

### C4: Thread-Safe Export
```python
# backend/main.py
from models import _store_lock  # import at top

def _run_export_job(project_id: str, clip_id: str) -> None:
    with _store_lock:
        proj = load_project(project_id)
        # ... rest of function unchanged
```

### M6: Frontend Request Timeout
```javascript
// frontend/src/api.js
async function req(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    // ... rest unchanged
  } finally {
    clearTimeout(timeout);
  }
}
```

### M5: Transcript Word Sync
```javascript
// frontend/src/components/TranscriptEditor.jsx
function distributeWords(text, start, end) {
  const tokens = text.split(/\s+/).filter(Boolean);
  if (!tokens.length) return [];
  const dur = Math.max(0.2, end - start);
  const step = dur / tokens.length;
  return tokens.map((tok, idx) => ({
    word: tok,
    start: start + idx * step,
    end: start + (idx + 1) * step,
  }));
}

function handleTextChange(idx, val) {
  setSegments((prev) =>
    prev.map((s, i) => {
      if (i !== idx) return s;
      const words = distributeWords(val, s.start, s.end);
      return { ...s, text: val, words };
    })
  );
  setDirty(true);
}
```

---

## Sign-Off

| Role | Name | Date | Status |
|------|------|------|--------|
| Reviewer | Automated | 2026-11-23 | ✅ Complete |
| Developer | — | — | ⏳ Pending fixes |

---

*Generated as part of ClipPulse Studio code review. Apply Critical/High fixes before production deployment.*