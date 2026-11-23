import React, { useState, useEffect } from "react";
import { X, Key, Cookie, CheckCircle2, Trash2, Sparkles, Upload, Cpu } from "lucide-react";
import { api } from "../api";

const PROVIDERS = [
  {
    id: "local_free",
    label: "100% Free Local AI",
    badge: "No API Key",
    desc: "Local faster-whisper speech-to-text + audio energy & viral hook scorer.",
    defaultModel: "tiny",
    placeholder: "",
  },
  {
    id: "groq",
    label: "Groq (Free Tier)",
    badge: "Free API",
    desc: "Ultra-fast free Whisper Large v3 + Llama 3.3 70B (console.groq.com).",
    defaultModel: "llama-3.3-70b-versatile",
    placeholder: "gsk_...",
  },
  {
    id: "gemini",
    label: "Google Gemini (Free Tier)",
    badge: "Free API",
    desc: "Free Gemini Flash key from Google AI Studio (aistudio.google.com).",
    defaultModel: "gemini-2.5-flash",
    placeholder: "AIza...",
  },
  {
    id: "openrouter",
    label: "OpenRouter (:free models)",
    badge: "Free API",
    desc: "Free community models ending in :free (openrouter.ai).",
    defaultModel: "meta-llama/llama-3.3-70b-instruct:free",
    placeholder: "sk-or-...",
  },
  {
    id: "openai",
    label: "OpenAI (Paid BYOK)",
    badge: "Optional",
    desc: "Whisper + GPT-4o-mini if you already have an OpenAI key.",
    defaultModel: "gpt-4o-mini",
    placeholder: "sk-...",
  },
];

export default function SettingsModal({ open, onClose, settings, onUpdated }) {
  const [provider, setProvider] = useState("local_free");
  const [apiKey, setApiKey] = useState("");
  const [aiModel, setAiModel] = useState("");
  const [enableLocalWhisper, setEnableLocalWhisper] = useState(true);
  const [whisperModel, setWhisperModel] = useState("tiny");
  const [captionStyle, setCaptionStyle] = useState("hormozi");
  const [layout, setLayout] = useState("center_crop");
  const [cookiesText, setCookiesText] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    if (open && settings) {
      setProvider(settings.ai_provider || "local_free");
      setAiModel(settings.ai_model || "");
      setEnableLocalWhisper(settings.enable_local_whisper !== false);
      setWhisperModel(settings.whisper_model || "tiny");
      setCaptionStyle(settings.default_caption_style || "hormozi");
      setLayout(settings.default_layout || "center_crop");
      setMsg(null);
      setErr(null);
    }
  }, [open, settings]);

  if (!open) return null;

  const activeProv = PROVIDERS.find((p) => p.id === provider) || PROVIDERS[0];

  async function handleSaveSettings(e) {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    setMsg(null);
    try {
      const payload = {
        ai_provider: provider,
        ai_model: aiModel.trim() || activeProv.defaultModel,
        enable_local_whisper: enableLocalWhisper,
        whisper_model: whisperModel,
        default_caption_style: captionStyle,
        default_layout: layout,
      };
      if (apiKey.trim()) {
        payload.api_key = apiKey.trim();
      }
      const updated = await api.updateSettings(payload);
      onUpdated(updated);
      setApiKey("");
      setMsg("Free AI & studio settings saved.");
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleClearKey() {
    setSaving(true);
    try {
      const updated = await api.updateSettings({ ai_provider: "local_free", api_key: "" });
      onUpdated(updated);
      setProvider("local_free");
      setMsg("API key removed. Using 100% Free Local AI.");
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveCookies() {
    if (!cookiesText.trim()) return;
    setSaving(true);
    setErr(null);
    setMsg(null);
    try {
      const updated = await api.uploadCookies(cookiesText);
      onUpdated(updated);
      setCookiesText("");
      setMsg("YouTube cookies saved for yt-dlp downloads.");
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleCookiesFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setCookiesText(text);
  }

  async function handleClearCookies() {
    setSaving(true);
    try {
      const updated = await api.clearCookies();
      onUpdated(updated);
      setMsg("YouTube cookies cleared.");
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-[#12141D] border border-white/10 rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-emerald-400" />
            <h2 className="font-semibold text-white text-base">
              Free AI Engine & YouTube Settings
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-6">
          {msg && (
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{msg}</span>
            </div>
          )}
          {err && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
              {err}
            </div>
          )}

          {/* AI Provider Section */}
          <form onSubmit={handleSaveSettings} className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Cpu className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-semibold text-white">
                  AI Clip & Transcription Engine
                </h3>
              </div>
              {settings?.has_api_key && (
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300">
                    {settings.api_key_preview}
                  </span>
                  <button
                    type="button"
                    onClick={handleClearKey}
                    className="text-xs text-rose-400 hover:text-rose-300 flex items-center gap-1"
                  >
                    <Trash2 className="w-3 h-3" /> Use Local Free
                  </button>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {PROVIDERS.map((p) => {
                const active = provider === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setProvider(p.id);
                      setAiModel(p.defaultModel);
                    }}
                    className={`p-3 rounded-xl border text-left transition ${
                      active
                        ? "bg-violet-500/15 border-violet-500"
                        : "bg-[#0A0B0F] border-white/10 hover:border-white/25"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-white">{p.label}</span>
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                          p.id === "local_free"
                            ? "bg-emerald-500/20 text-emerald-300"
                            : p.id === "openai"
                            ? "bg-white/10 text-slate-300"
                            : "bg-cyan-500/20 text-cyan-300"
                        }`}
                      >
                        {p.badge}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1 leading-snug">{p.desc}</p>
                  </button>
                );
              })}
            </div>

            {provider !== "local_free" && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3.5 rounded-xl bg-[#0A0B0F] border border-white/10">
                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-medium text-slate-400 mb-1 flex items-center gap-1">
                    <Key className="w-3 h-3 text-cyan-400" />
                    {activeProv.label} API Key
                  </label>
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder={
                      settings?.has_api_key
                        ? "Saved (enter new key to replace)..."
                        : activeProv.placeholder
                    }
                    className="w-full px-3 py-2 rounded-lg bg-[#12141D] border border-white/10 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-violet-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-400 mb-1">
                    Model
                  </label>
                  <input
                    type="text"
                    value={aiModel || activeProv.defaultModel}
                    onChange={(e) => setAiModel(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-[#12141D] border border-white/10 text-xs font-mono text-white focus:outline-none focus:border-violet-500"
                  />
                </div>
              </div>
            )}

            {/* Local Whisper Fallback Option */}
            <div className="p-3 rounded-xl bg-[#0A0B0F] border border-white/10 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-xs font-semibold text-white">
                  Free Offline Speech-to-Text (faster-whisper)
                </div>
                <div className="text-[11px] text-slate-400">
                  Automatically transcribes uploaded videos with word-level timestamps at $0 cost.
                </div>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={whisperModel}
                  onChange={(e) => setWhisperModel(e.target.value)}
                  className="px-2.5 py-1.5 rounded-lg bg-[#12141D] border border-white/10 text-xs text-white"
                >
                  <option value="tiny">tiny (fastest)</option>
                  <option value="base">base (more accurate)</option>
                </select>
                <label className="inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={enableLocalWhisper}
                    onChange={(e) => setEnableLocalWhisper(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-8 h-4 bg-slate-700 peer-checked:bg-emerald-500 rounded-full relative after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:w-3 after:h-3 after:bg-white after:rounded-full after:transition-all peer-checked:after:translate-x-4" />
                </label>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1">
                  Default Caption Style
                </label>
                <select
                  value={captionStyle}
                  onChange={(e) => setCaptionStyle(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-[#0A0B0F] border border-white/10 text-sm text-white focus:outline-none focus:border-violet-500"
                >
                  <option value="hormozi">Hormozi Pop</option>
                  <option value="beast">Beast Clean</option>
                  <option value="minimal">Minimal Pill</option>
                  <option value="neon">Neon Creator</option>
                  <option value="off">Off</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1">
                  Default 9:16 Framing
                </label>
                <select
                  value={layout}
                  onChange={(e) => setLayout(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-[#0A0B0F] border border-white/10 text-sm text-white focus:outline-none focus:border-violet-500"
                >
                  <option value="center_crop">Smart 9:16 Crop</option>
                  <option value="blur_fill">Blur-Fill 16:9</option>
                  <option value="split_screen">Split Screen</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold transition disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save AI & Style Defaults"}
              </button>
            </div>
          </form>

          <hr className="border-white/10" />

          {/* YouTube Cookies Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Cookie className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-semibold text-white">
                  Free YouTube Download Cookies (cookies.txt)
                </h3>
              </div>
              {settings?.has_youtube_cookies && (
                <div className="flex items-center gap-2">
                  <span className="text-[11px] px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300">
                    Cookies Active
                  </span>
                  <button
                    type="button"
                    onClick={handleClearCookies}
                    className="text-xs text-rose-400 hover:text-rose-300 flex items-center gap-1"
                  >
                    <Trash2 className="w-3 h-3" /> Remove
                  </button>
                </div>
              )}
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              On cloud servers, YouTube asks for sign-in verification. You can export a free{" "}
              <code className="text-slate-300">cookies.txt</code> file using any free browser extension (e.g.{" "}
              <em>Get cookies.txt LOCALLY</em>) and paste or load it here—or run ClipPulse locally on your own PC with zero cookies.
            </p>
            <textarea
              rows={3}
              value={cookiesText}
              onChange={(e) => setCookiesText(e.target.value)}
              placeholder="# Netscape HTTP Cookie File&#10;.youtube.com	TRUE	/	TRUE	..."
              className="w-full px-3 py-2 rounded-lg bg-[#0A0B0F] border border-white/10 text-xs font-mono text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-amber-500"
            />
            <div className="flex items-center justify-between gap-2">
              <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-slate-300">
                <Upload className="w-3.5 h-3.5" />
                <span>Load cookies.txt file</span>
                <input
                  type="file"
                  accept=".txt"
                  onChange={handleCookiesFile}
                  className="hidden"
                />
              </label>
              <button
                type="button"
                onClick={handleSaveCookies}
                disabled={saving || !cookiesText.trim()}
                className="px-4 py-1.5 rounded-lg bg-amber-500/90 hover:bg-amber-400 text-slate-950 text-xs font-semibold transition disabled:opacity-40"
              >
                Save YouTube Cookies
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
