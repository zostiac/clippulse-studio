async function req(url, options = {}) {
  const { timeoutMs = 30000, signal: externalSignal, ...fetchOptions } = options;
  const controller = new AbortController();
  let timedOut = false;
  const abortFromCaller = () => controller.abort(externalSignal?.reason);

  if (externalSignal?.aborted) abortFromCaller();
  else externalSignal?.addEventListener("abort", abortFromCaller, { once: true });

  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const res = await fetch(url, { ...fetchOptions, signal: controller.signal });
    const contentType = res.headers.get("content-type") || "";
    let data = null;

    if (contentType.includes("application/json")) {
      try {
        data = await res.json();
      } catch {
        throw new Error("The server returned an invalid response. Please try again.");
      }
    } else {
      data = await res.text();
    }

    if (!res.ok) {
      const detail = data && typeof data === "object" ? data.detail : null;
      const message = Array.isArray(detail)
        ? detail.map((item) => item.msg || String(item)).join("; ")
        : typeof detail === "string"
        ? detail
        : `Request failed (${res.status})`;
      const err = new Error(message);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  } catch (e) {
    if (timedOut) {
      const err = new Error(
        `Request timed out after ${Math.round(timeoutMs / 1000)}s. The server may still be processing it; check the project list before retrying.`
      );
      err.name = "TimeoutError";
      throw err;
    }
    if (e && e.name === "AbortError") {
      const err = new Error("Request cancelled.");
      err.name = "AbortError";
      throw err;
    }
    if (e instanceof TypeError && /fetch/i.test(e.message)) {
      throw new Error("Cannot reach ClipPulse Studio. Check that the backend is running and try again.");
    }
    throw e;
  } finally {
    clearTimeout(timeout);
    externalSignal?.removeEventListener("abort", abortFromCaller);
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
  getProject: (id) => req(`/api/projects/${encodeURIComponent(id)}`),
  deleteProject: (id) => req(`/api/projects/${encodeURIComponent(id)}`, { method: "DELETE" }),

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
    req(`/api/projects/${encodeURIComponent(id)}/reanalyze`, { method: "POST", timeoutMs: ANALYSIS_TIMEOUT_MS }),

  updateTranscript: (id, segments) =>
    req(`/api/projects/${encodeURIComponent(id)}/transcript`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ segments }),
    }),

  createClip: (projectId, payload) =>
    req(`/api/projects/${encodeURIComponent(projectId)}/clips`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),

  updateClip: (projectId, clipId, payload) =>
    req(`/api/projects/${encodeURIComponent(projectId)}/clips/${encodeURIComponent(clipId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),

  deleteClip: (projectId, clipId) =>
    req(`/api/projects/${encodeURIComponent(projectId)}/clips/${encodeURIComponent(clipId)}`, { method: "DELETE" }),

  exportClip: (projectId, clipId) =>
    req(`/api/projects/${encodeURIComponent(projectId)}/clips/${encodeURIComponent(clipId)}/export`, { method: "POST" }),

  exportAll: (projectId) =>
    req(`/api/projects/${encodeURIComponent(projectId)}/export-all`, { method: "POST" }),

  updateProject: (projectId, payload) =>
    req(`/api/projects/${encodeURIComponent(projectId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),

  getAnalytics: () => req("/api/analytics"),

  getHealth: () => req("/api/health"),

  downloadBundleUrl: (projectId) => `/api/projects/${encodeURIComponent(projectId)}/download-bundle`,
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
