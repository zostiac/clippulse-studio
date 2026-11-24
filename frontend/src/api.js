async function req(url, options = {}) {
  const { timeoutMs = 30000, ...fetchOptions } = options;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...fetchOptions, signal: controller.signal });
    const contentType = res.headers.get("content-type") || "";
    const isJson = contentType.includes("application/json");
    const data = isJson ? await res.json() : await res.text();
    if (!res.ok) {
      const err = new Error((data && data.detail) || `Request failed (${res.status})`);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  } catch (e) {
    if (e && e.name === "AbortError") {
      throw new Error(
        `Request timed out after ${Math.round(timeoutMs / 1000)}s. The server may still be working — refresh the page to see the result.`
      );
    }
    throw e;
  } finally {
    clearTimeout(timeout);
  }
}

// Ingest/analysis calls run FFmpeg and Whisper and can take minutes.
const ANALYSIS_TIMEOUT_MS = 600000;

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
    req("/api/projects/demo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ demo_key }),
      timeoutMs: ANALYSIS_TIMEOUT_MS,
    }),

  createFromYoutube: (url, fallback_transcript = "") =>
    req("/api/projects/youtube", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, fallback_transcript }),
      timeoutMs: ANALYSIS_TIMEOUT_MS,
    }),

  uploadVideo: (formData) =>
    req("/api/projects/upload", {
      method: "POST",
      body: formData,
      timeoutMs: ANALYSIS_TIMEOUT_MS,
    }),

  reanalyzeProject: (id) =>
    req(`/api/projects/${id}/reanalyze`, { method: "POST", timeoutMs: ANALYSIS_TIMEOUT_MS }),

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
