import React, { useState } from "react";
import {
  Youtube,
  Upload,
  Sparkles,
  Play,
  Trash2,
  Clock,
  Scissors,
  AlertTriangle,
  Cookie,
  Film,
  Loader2,
  ArrowRight,
  FileText,
} from "lucide-react";
import { api, fmtTimeShort } from "../api";

export default function IngestView({
  projects,
  onProjectCreated,
  onOpenProject,
  onDeleteProject,
  onOpenSettings,
}) {
  const [tab, setTab] = useState("youtube"); // youtube | upload | demo
  const [ytUrl, setYtUrl] = useState("");
  const [ytFallbackTranscript, setYtFallbackTranscript] = useState("");
  const [ytBlocked, setYtBlocked] = useState(null);

  const [uploadFile, setUploadFile] = useState(null);
  const [uploadSubFile, setUploadSubFile] = useState(null);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadTranscript, setUploadTranscript] = useState("");

  const [loading, setLoading] = useState(false);
  const [loadingLabel, setLoadingLabel] = useState("");
  const [error, setError] = useState(null);

  async function handleYoutubeSubmit(e) {
    e.preventDefault();
    if (!ytUrl.trim()) return;
    setLoading(true);
    setLoadingLabel("Fetching YouTube video & scanning viral hooks...");
    setError(null);
    setYtBlocked(null);
    try {
      const proj = await api.createFromYoutube(ytUrl.trim(), ytFallbackTranscript);
      onProjectCreated(proj);
    } catch (ex) {
      if (ex.data?.code === "YOUTUBE_BOT_BLOCK") {
        setYtBlocked(ex.data);
      } else {
        setError(ex.message);
      }
    } finally {
      setLoading(false);
      setLoadingLabel("");
    }
  }

  async function handleUploadSubmit(e) {
    e.preventDefault();
    if (!uploadFile) return;
    setLoading(true);
    setLoadingLabel("Uploading video, analyzing audio peaks & finding viral clips...");
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", uploadFile);
      if (uploadTitle.trim()) fd.append("title", uploadTitle.trim());
      if (uploadTranscript.trim()) fd.append("transcript_text", uploadTranscript.trim());
      if (uploadSubFile) fd.append("subtitle_file", uploadSubFile);
      const proj = await api.uploadVideo(fd);
      onProjectCreated(proj);
    } catch (ex) {
      setError(ex.message);
    } finally {
      setLoading(false);
      setLoadingLabel("");
    }
  }

  async function handleLaunchDemo(demoKey) {
    setLoading(true);
    setLoadingLabel("Preparing Studio Demo video & scoring viral moments...");
    setError(null);
    try {
      const proj = await api.createDemo(demoKey);
      onProjectCreated(proj);
    } catch (ex) {
      setError(ex.message);
    } finally {
      setLoading(false);
      setLoadingLabel("");
    }
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-8 sm:py-12">
      <div className="max-w-5xl mx-auto space-y-10">
        {/* Hero */}
        <div className="text-center space-y-3 max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-emerald-300 text-xs font-medium">
            <Sparkles className="w-3.5 h-3.5" />
            <span>100% Free • Local Whisper AI + Optional Groq / Gemini Free Tier</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-white">
            Turn 1 long video into{" "}
            <span className="bg-gradient-to-r from-violet-400 via-fuchsia-400 to-cyan-300 bg-clip-text text-transparent">
              scroll-stopping 9:16 shorts
            </span>
          </h1>
          <p className="text-sm text-slate-400 leading-relaxed">
            AI viral hook scoring, smart 9:16 reframing & split-screen, dynamic word-by-word captions, platform safe-zone previews, and real 1080p MP4 export.
          </p>
        </div>

        {/* Ingestion Card */}
        <div className="bg-[#12141D] border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b border-white/10 bg-[#0E1017]">
            <button
              onClick={() => {
                setTab("youtube");
                setError(null);
              }}
              className={`flex-1 py-3.5 px-4 text-xs sm:text-sm font-medium flex items-center justify-center gap-2 border-b-2 transition ${
                tab === "youtube"
                  ? "border-violet-500 text-white bg-white/[0.03]"
                  : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              <Youtube className="w-4 h-4 text-rose-500" />
              <span>YouTube Link</span>
            </button>
            <button
              onClick={() => {
                setTab("upload");
                setError(null);
              }}
              className={`flex-1 py-3.5 px-4 text-xs sm:text-sm font-medium flex items-center justify-center gap-2 border-b-2 transition ${
                tab === "upload"
                  ? "border-violet-500 text-white bg-white/[0.03]"
                  : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              <Upload className="w-4 h-4 text-cyan-400" />
              <span>Upload Video</span>
            </button>
            <button
              onClick={() => {
                setTab("demo");
                setError(null);
              }}
              className={`flex-1 py-3.5 px-4 text-xs sm:text-sm font-medium flex items-center justify-center gap-2 border-b-2 transition ${
                tab === "demo"
                  ? "border-violet-500 text-white bg-white/[0.03]"
                  : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              <Film className="w-4 h-4 text-violet-400" />
              <span>Instant Studio Demos</span>
            </button>
          </div>

          <div className="p-6">
            {loading && (
              <div className="mb-5 p-4 rounded-xl bg-violet-500/10 border border-violet-500/30 flex items-center gap-3">
                <Loader2 className="w-5 h-5 text-violet-400 animate-spin shrink-0" />
                <div>
                  <div className="text-sm font-medium text-white">
                    {loadingLabel}
                  </div>
                  <div className="text-xs text-slate-400">
                    Extracting frames, computing audio energy waveform, and scoring hooks...
                  </div>
                </div>
              </div>
            )}

            {error && (
              <div className="mb-5 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {/* TAB 1: YOUTUBE */}
            {tab === "youtube" && (
              <form onSubmit={handleYoutubeSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-2">
                    Paste a YouTube video, podcast, or livestream URL
                  </label>
                  <div className="flex flex-col sm:flex-row gap-2.5">
                    <input
                      type="url"
                      required
                      value={ytUrl}
                      onChange={(e) => setYtUrl(e.target.value)}
                      placeholder="https://www.youtube.com/watch?v=..."
                      className="flex-1 px-4 py-3 rounded-xl bg-[#0A0B0F] border border-white/10 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-violet-500"
                    />
                    <button
                      type="submit"
                      disabled={loading || !ytUrl.trim()}
                      className="px-6 py-3 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:opacity-50 text-white text-sm font-semibold flex items-center justify-center gap-2 transition shadow-lg shadow-violet-600/25 shrink-0"
                    >
                      <Sparkles className="w-4 h-4" />
                      <span>Find Viral Clips</span>
                    </button>
                  </div>
                </div>

                {/* Optional fallback transcript */}
                <details className="group">
                  <summary className="text-xs text-slate-400 hover:text-slate-200 cursor-pointer select-none">
                    + Optional: Paste transcript if the YouTube video has captions disabled
                  </summary>
                  <textarea
                    rows={3}
                    value={ytFallbackTranscript}
                    onChange={(e) => setYtFallbackTranscript(e.target.value)}
                    placeholder="Paste plain text or .srt/.vtt transcript..."
                    className="mt-2 w-full px-3 py-2 rounded-xl bg-[#0A0B0F] border border-white/10 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-violet-500"
                  />
                </details>

                {/* YouTube Bot-Check Recovery Box */}
                {ytBlocked && (
                  <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-3">
                    <div className="flex items-start gap-3">
                      {ytBlocked.oembed?.thumbnail_url && (
                        <img
                          src={ytBlocked.oembed.thumbnail_url}
                          alt=""
                          className="w-24 h-14 object-cover rounded-lg border border-white/10 shrink-0"
                        />
                      )}
                      <div className="space-y-1">
                        <div className="text-xs font-semibold text-amber-300 flex items-center gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          <span>
                            {ytBlocked.oembed?.title
                              ? `Detected "${ytBlocked.oembed.title}" — YouTube Bot Check Active`
                              : "YouTube Blocked Cloud Server Download"}
                          </span>
                        </div>
                        <p className="text-xs text-slate-300 leading-relaxed">
                          {ytBlocked.detail}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 pt-1">
                      <button
                        type="button"
                        onClick={onOpenSettings}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 text-slate-950 text-xs font-semibold hover:bg-amber-400 transition"
                      >
                        <Cookie className="w-3.5 h-3.5" />
                        Add cookies.txt in Settings
                      </button>
                      <button
                        type="button"
                        onClick={() => setTab("upload")}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-white text-xs font-medium transition"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        Upload MP4 Instead
                      </button>
                      <button
                        type="button"
                        onClick={() => handleLaunchDemo("podcast_creators")}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-medium transition"
                      >
                        <Play className="w-3.5 h-3.5" />
                        Try Instant Podcast Demo
                      </button>
                    </div>
                  </div>
                )}

                {/* Quick Demo Banner */}
                <div className="pt-2 flex flex-wrap items-center justify-between gap-3 border-t border-white/5 text-xs text-slate-400">
                  <span>
                    Want to test the 9:16 studio, Hormozi captions & MP4 export right away?
                  </span>
                  <button
                    type="button"
                    onClick={() => handleLaunchDemo("podcast_creators")}
                    disabled={loading}
                    className="inline-flex items-center gap-1.5 text-cyan-300 hover:text-cyan-200 font-medium"
                  >
                    <span>Launch 1-Click Podcast Demo</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </form>
            )}

            {/* TAB 2: UPLOAD */}
            {tab === "upload" && (
              <form onSubmit={handleUploadSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <label className="cursor-pointer border-2 border-dashed border-white/15 hover:border-cyan-400/50 rounded-xl p-6 flex flex-col items-center justify-center text-center bg-[#0A0B0F]/60 transition">
                    <Upload className="w-8 h-8 text-cyan-400 mb-2" />
                    <span className="text-sm font-medium text-white">
                      {uploadFile ? uploadFile.name : "Drop or select long-form video"}
                    </span>
                    <span className="text-xs text-slate-500 mt-1">
                      MP4, MOV, WebM, MKV
                    </span>
                    <input
                      type="file"
                      accept="video/*,.mp4,.mov,.webm,.mkv"
                      onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                      className="hidden"
                    />
                  </label>

                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">
                        Project Title (Optional)
                      </label>
                      <input
                        type="text"
                        value={uploadTitle}
                        onChange={(e) => setUploadTitle(e.target.value)}
                        placeholder="e.g. Founder Podcast Episode 14"
                        className="w-full px-3 py-2 rounded-xl bg-[#0A0B0F] border border-white/10 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-cyan-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">
                        Optional Subtitle File (.srt / .vtt)
                      </label>
                      <label className="cursor-pointer flex items-center gap-2 px-3 py-2 rounded-xl bg-[#0A0B0F] border border-white/10 text-xs text-slate-300 hover:border-white/25">
                        <FileText className="w-4 h-4 text-violet-400" />
                        <span className="truncate">
                          {uploadSubFile ? uploadSubFile.name : "Choose .srt or .vtt file (or use Whisper / pasted text)"}
                        </span>
                        <input
                          type="file"
                          accept=".srt,.vtt"
                          onChange={(e) => setUploadSubFile(e.target.files?.[0] || null)}
                          className="hidden"
                        />
                      </label>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Or paste transcript / SRT text (optional — free local Whisper transcribes automatically!)
                  </label>
                  <textarea
                    rows={3}
                    value={uploadTranscript}
                    onChange={(e) => setUploadTranscript(e.target.value)}
                    placeholder="Paste transcript or SRT captions here..."
                    className="w-full px-3 py-2 rounded-xl bg-[#0A0B0F] border border-white/10 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={loading || !uploadFile}
                    className="px-6 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:opacity-40 text-slate-950 text-sm font-semibold flex items-center gap-2 transition"
                  >
                    <Scissors className="w-4 h-4" />
                    <span>Upload & Detect Viral Clips</span>
                  </button>
                </div>
              </form>
            )}

            {/* TAB 3: DEMOS */}
            {tab === "demo" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-5 rounded-xl bg-[#0A0B0F] border border-white/10 hover:border-violet-500/40 transition flex flex-col justify-between gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded bg-violet-500/15 text-violet-300">
                        Dual-Speaker Podcast • 1:06
                      </span>
                      <span className="text-xs text-slate-500">1280×720</span>
                    </div>
                    <h3 className="font-semibold text-white text-base">
                      Why 90% of Creators Quit Before Day 30
                    </h3>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Full dual-panel podcast setup ideal for testing Smart 9:16 Pan, Split-Screen Host+Guest stacking, and Hormozi animated captions.
                    </p>
                  </div>
                  <button
                    onClick={() => handleLaunchDemo("podcast_creators")}
                    disabled={loading}
                    className="w-full py-2.5 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center justify-center gap-2 transition"
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>Open Podcast Studio Demo</span>
                  </button>
                </div>

                <div className="p-5 rounded-xl bg-[#0A0B0F] border border-white/10 hover:border-cyan-500/40 transition flex flex-col justify-between gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded bg-cyan-500/15 text-cyan-300">
                        Tech Keynote • 1:00
                      </span>
                      <span className="text-xs text-slate-500">1280×720</span>
                    </div>
                    <h3 className="font-semibold text-white text-base">
                      How Small AI Teams Ship 10x Faster Than Giants
                    </h3>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Founder talk + live demo layout ideal for testing Blur-Fill 16:9 framing, Beast Clean captions, and YouTube/TikTok metadata.
                    </p>
                  </div>
                  <button
                    onClick={() => handleLaunchDemo("tech_keynote")}
                    disabled={loading}
                    className="w-full py-2.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-slate-950 text-xs font-semibold flex items-center justify-center gap-2 transition"
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>Open Tech Keynote Demo</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Recent Projects */}
        {projects.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
                Recent Studio Projects ({projects.length})
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {projects.map((p) => (
                <div
                  key={p.id}
                  onClick={() => onOpenProject(p.id)}
                  className="group cursor-pointer rounded-xl bg-[#12141D] border border-white/10 hover:border-violet-500/50 overflow-hidden transition flex flex-col"
                >
                  <div className="aspect-video bg-[#0A0B0F] relative overflow-hidden">
                    {p.thumbnail_url ? (
                      <img
                        src={p.thumbnail_url}
                        alt={p.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-600">
                        <Film className="w-8 h-8" />
                      </div>
                    )}
                    <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-black/70 backdrop-blur text-[10px] font-semibold uppercase tracking-wider text-slate-200 border border-white/10">
                      {p.source_type}
                    </div>
                    <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded bg-black/80 text-[11px] font-mono text-white flex items-center gap-1">
                      <Clock className="w-3 h-3 text-slate-400" />
                      {fmtTimeShort(p.duration)}
                    </div>
                  </div>
                  <div className="p-3.5 flex-1 flex flex-col justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-semibold text-white line-clamp-1">
                        {p.title}
                      </h3>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {p.clips.length} viral clips detected
                      </p>
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t border-white/5">
                      <span className="text-[11px] text-violet-300 font-medium group-hover:underline">
                        Open in Studio →
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteProject(p.id);
                        }}
                        className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition"
                        title="Delete Project"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
