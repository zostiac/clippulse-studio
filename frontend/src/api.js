const DEFAULT_TIMEOUT_MS = 30_000;
// Ingest/analysis can run for minutes (yt-dlp download, Whisper, FFmpeg), so
// those calls get a much longer budget than ordinary reads and writes.
const LONG_TIMEOUT_MS = 30 * 60_000;

function errorMessage(data, status) {
  const detail = data && typeof data === "object" ? data.detail : undefined;
  if (typeof detail === "string" && detail) return detail;
  if (Array.isArray(detail) && detail.length) {
    // FastAPI validation errors: [{ loc, msg, type }, ...]
    return detail
      .map((d) => (d && d.msg ? `${(d.loc || []).slice(1).join(".") || "request"}: ${d.msg}` : String(d)))
      .join("; ");
  }
  return `Request failed (${status})`;
}

async function req(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    const contentType = res.headers.get("content-type") || "";
    const raw = await res.text();
    let data = raw;
    if (contentType.includes("application/json") && raw) {
      try {
        data = JSON.parse(raw);
      } catch {
        data = raw;
      }
    }
    if (!res.ok) {
      const err = new Error(errorMessage(data, res.status));
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  } catch (e) {
    if (e && e.name === "AbortError") {
      const err = new Error(
        `The request timed out after ${Math.round(timeoutMs / 1000)}s. The server may still be working on it, so check your project list before retrying.`
      );
      err.timeout = true;
      throw err;
    }
    throw e;
  } finally {
    clearTimeout(timeout);
  }
}

export const api = {
  getSettings: () => req("/api/settings"),
  updateSettings: (payload) =>
    req("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  uploadCookies: (cookies_text) =>
    req("/api/settings/cookies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cookies_text }),
    }),
  clearCookies: () => req("/api/settings/cookies", { method: "DELETE" }),

  listProjects: () => req("/api/projects"),
  getProject: (id) => req(`/api/projects/${id}`),
  deleteProject: (id) => req(`/api/projects/${id}`, { method: "DELETE" }),

  createDemo: (demo_key) =>
    req(
      "/api/projects/demo",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ demo_key }),
      },
      LONG_TIMEOUT_MS
    ),

  createFromYoutube: (url, fallback_transcript = "") =>
    req(
      "/api/projects/youtube",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, fallback_transcript }),
      },
      LONG_TIMEOUT_MS
    ),

  uploadVideo: (formData) =>
    req(
      "/api/projects/upload",
      {
        method: "POST",
        body: formData,
      },
      LONG_TIMEOUT_MS
    ),

  reanalyzeProject: (id) =>
    req(`/api/projects/${id}/reanalyze`, { method: "POST" }, LONG_TIMEOUT_MS),

  updateTranscript: (id, segments) =>
    req(`/api/projects/${id}/transcript`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ segments }),
    }),

  createClip: (projectId, payload) =>
    req(`/api/projects/${projectId}/clips`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),

  updateClip: (projectId, clipId, payload) =>
    req(`/api/projects/${projectId}/clips/${clipId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),

  deleteClip: (projectId, clipId) =>
    req(`/api/projects/${projectId}/clips/${clipId}`, { method: "DELETE" }),

  exportClip: (projectId, clipId) =>
    req(`/api/projects/${projectId}/clips/${clipId}/export`, { method: "POST" }),

  exportAll: (projectId) =>
    req(`/api/projects/${projectId}/export-all`, { method: "POST" }),
};

export function fmtTime(sec) {
  const s = Math.max(0, Number(sec) || 0);
  const mins = Math.floor(s / 60);
  const rem = s % 60;
  return `${mins}:${rem < 10 ? "0" : ""}${rem.toFixed(1)}`;
}

export function fmtTimeShort(sec) {
  const s = Math.max(0, Math.round(Number(sec) || 0));
  const mins = Math.floor(s / 60);
  const rem = s % 60;
  return `${mins}:${rem < 10 ? "0" : ""}${rem}`;
}
