async function req(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const headers = new Headers(options.headers || {});
    const apiToken = import.meta.env.VITE_CLIPPULSE_API_TOKEN;
    if (apiToken) headers.set("X-API-Token", apiToken);
    const res = await fetch(url, { ...options, headers, signal: controller.signal });
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
    req("/api/projects/demo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ demo_key }),
    }),

  createFromYoutube: (url, fallback_transcript = "") =>
    req("/api/projects/youtube", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, fallback_transcript }),
    }),

  uploadVideo: (formData) =>
    req("/api/projects/upload", {
      method: "POST",
      body: formData,
    }),

  reanalyzeProject: (id) =>
    req(`/api/projects/${id}/reanalyze`, { method: "POST" }),

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
