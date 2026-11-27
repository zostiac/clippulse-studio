import React, { useEffect, useRef, useState } from "react";
import { useStudio } from "../studio.jsx";

const PROVIDERS = [
  {
    value: "hybrid",
    icon: "sync_alt",
    title: "Hybrid — Both at Once",
    badge: "Recommended",
    badgeClass: "bg-primary-container text-on-primary-container",
    desc: "Both engines run together: Groq transcribes the audio (fastest free Whisper) while Gemini picks the viral clips and writes titles, hooks & metadata.",
    meta: "Groq Whisper + Gemini Flash",
    metaStrong: "BEST OF BOTH",
    span: true,
  },
  {
    value: "local_free",
    icon: "memory",
    title: "100% Free Local AI",
    badge: "No API Key",
    badgeClass: "bg-tertiary-fixed text-on-tertiary-fixed",
    desc: "Local faster-whisper speech-to-text with audio energy spike tracking & algorithmic viral hook scorer.",
    meta: "UNLIMITED · 0ms Latency",
    metaStrong: "UNLIMITED",
    span: false,
  },
  {
    value: "groq",
    icon: "bolt",
    title: "Groq (Free Tier)",
    badge: "Free API",
    badgeClass: "bg-surface-container-highest text-on-surface",
    desc: "Ultra-fast free Whisper Large v3 + Llama 3.3 70B via LPU inference (console.groq.com).",
    meta: "Llama 3.3 70B",
    metaStrong: null,
    span: false,
  },
  {
    value: "gemini",
    icon: "auto_awesome",
    title: "Google Gemini",
    badge: "Free API",
    badgeClass: "bg-surface-container-highest text-on-surface",
    desc: "Free Gemini 1.5 Flash token quota from Google AI Studio (aistudio.google.com). 1M token context.",
    meta: "Gemini 1.5 Flash",
    metaStrong: null,
    span: false,
  },
  {
    value: "openrouter",
    icon: "hub",
    title: "OpenRouter Free",
    badge: "Free API",
    badgeClass: "bg-surface-container-highest text-on-surface",
    desc: "Access community-hosted open weights ending in :free without credit card limits.",
    meta: "Mistral / DeepSeek R1",
    metaStrong: null,
    span: false,
  },
  {
    value: "openai",
    icon: "key",
    title: "OpenAI (Paid BYOK)",
    badge: "Optional",
    badgeClass: "bg-surface-container-highest text-on-surface-variant",
    desc: "Official Whisper API audio digestion + GPT-4o-mini if you already carry a standard paid key.",
    meta: "Pay-as-you-go billing direct with OpenAI",
    metaStrong: null,
    span: true,
  },
];

const SECTIONS = [
  { id: "engine", label: "AI & Transcription Engine", icon: "neurology" },
  { id: "youtube-cookies", label: "YouTube Cookies & Ingestion", icon: "cookie" },
  { id: "style-presets", label: "Default Export & Aspect Presets", icon: "aspect_ratio" },
  { id: "telemetry", label: "Cloud Storage & Quota", icon: "cloud_sync" },
];

export default function Settings() {
  const { settings, health, saveSettings, saveCookies, clearCookies, toast } = useStudio();
  const [section, setSection] = useState("engine");
  const [provider, setProvider] = useState(settings?.ai_provider || "hybrid");
  const [apiKey, setApiKey] = useState("");
  const [groqKey, setGroqKey] = useState("");
  const [geminiKey, setGeminiKey] = useState("");
  const [aiModel, setAiModel] = useState(settings?.ai_model || "");
  const [whisperModel, setWhisperModel] = useState(settings?.whisper_model || "small");
  const [cuda, setCuda] = useState(true);
  const [sttFallback, setSttFallback] = useState(settings?.transcription_provider || "auto");
  const [captionStyle, setCaptionStyle] = useState(settings?.default_caption_style || "hormozi");
  const [layout, setLayout] = useState(settings?.default_layout || "center_crop");
  const [maxClips, setMaxClips] = useState(settings?.max_clips ?? 0);
  const [cookies, setCookies] = useState("");
  const [cookieBytes, setCookieBytes] = useState(0);
  const fileRef = useRef(null);

  useEffect(() => {
    if (!settings) return;
    setProvider(settings.ai_provider);
    setAiModel(settings.ai_model || "");
    setWhisperModel(settings.whisper_model);
    setCuda(settings.use_cuda ?? true);
    setSttFallback(settings.transcription_provider);
    setCaptionStyle(settings.default_caption_style);
    setLayout(settings.default_layout);
    setMaxClips(settings.max_clips ?? 0);
  }, [settings]);

  const goto = (id) => {
    setSection(id);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const onProviderChange = (value) => {
    setProvider(value);
    saveSettings({ ai_provider: value });
    toast(`Active AI Engine switched to: ${value.toUpperCase()}`, "success");
  };

  const onSaveCookies = () => {
    if (!cookies.trim()) {
      toast("Paste Netscape cookies first.", "error");
      return;
    }
    saveCookies(cookies);
  };

  const onCookieFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = String(ev.target.result || "");
      setCookies(text);
      setCookieBytes(text.length);
      toast(`Imported ${file.name}`, "success");
    };
    reader.readAsText(file);
  };

  const saveDefaults = () => {
    saveSettings({
      default_caption_style: captionStyle,
      default_layout: layout,
      max_clips: maxClips,
      whisper_model: whisperModel,
      transcription_provider: sttFallback,
    });
    toast("AI Framing & Caption defaults updated", "success");
  };

  const resetDefaults = () => {
    setProvider("groq");
    setWhisperModel("small");
    setSttFallback("auto");
    setCaptionStyle("hormozi");
    setLayout("center_crop");
    setMaxClips(6);
    saveSettings({
      ai_provider: "hybrid",
      api_key: "",
      groq_api_key: "",
      gemini_api_key: "",
      ai_model: "",
      whisper_model: "small",
      transcription_provider: "auto",
      enable_local_whisper: true,
      default_caption_style: "hormozi",
      default_layout: "center_crop",
      max_clips: 0,
    });
  };

  const caps = health?.capabilities || {};
  const healthy = health?.status === "ok";

  if (!settings) {
    return (
      <div className="px-margin-lg py-margin flex flex-col gap-space-lg" aria-busy="true">
        <div className="h-40 rounded-xl bg-surface-container-lowest shadow-sm animate-pulse" />
        <div className="h-12 rounded-xl bg-surface-container-lowest shadow-sm animate-pulse" />
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg">
          <div className="lg:col-span-8 h-96 rounded-xl bg-surface-container-lowest shadow-sm animate-pulse" />
          <div className="lg:col-span-4 h-96 rounded-xl bg-surface-container-lowest shadow-sm animate-pulse" />
        </div>
        <p className="font-body-sm text-body-sm text-on-surface-variant text-center">Loading engine configuration…</p>
      </div>
    );
  }

  return (
    <div className="px-margin-lg py-margin flex flex-col gap-space-lg">
      {/* Header banner */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-gutter pb-space-md shadow-sm bg-surface-container-lowest p-space-lg rounded-xl">
        <div className="flex flex-col gap-space-xs">
          <div className="flex items-center gap-space-xs">
            <span className="font-label-sm text-label-sm uppercase tracking-wider text-primary-container font-semibold">
              Studio Infrastructure
            </span>
            <span className="w-1.5 h-1.5 rounded-full bg-outline-variant" />
            <span className="font-label-sm text-label-sm text-on-surface-variant font-medium">
              Node: studio-free-worker-01
            </span>
          </div>
          <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight">Engine &amp; Ingestion Workspace</h1>
          <p className="font-body-md text-body-md text-on-surface-variant max-w-2xl">
            Calibrate edge AI synthesis, configure zero-cost local Whisper models, and configure Netscape session
            authentication for uninterrupted YouTube short-form scraping.
          </p>
        </div>
        <div className="flex items-center gap-space-sm self-start md:self-auto">
          <div className="flex flex-col items-end px-space-md py-space-xs rounded-lg bg-surface-container-low shadow-sm">
            <span className="font-label-sm text-label-sm text-on-surface-variant uppercase">Local Model Status</span>
            <div className="flex items-center gap-space-xs">
              <span className={`w-2 h-2 rounded-full ${caps.local_whisper === "available" ? "bg-tertiary-container animate-pulse" : "bg-error"}`} />
              <span className="font-label-md text-label-md text-on-surface font-semibold">
                {caps.local_whisper === "available" ? "Whisper Ready" : "Whisper Unavailable"}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={resetDefaults}
            className="px-space-md py-2 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface font-body-sm text-body-sm transition-all shadow-sm"
          >
            Reset Defaults
          </button>
        </div>
      </div>

      {/* Segmented nav */}
      <div className="flex items-center gap-space-xs overflow-x-auto pb-space-xs">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => goto(s.id)}
            className={`flex items-center gap-space-xs px-space-md py-2 rounded-lg font-body-sm text-body-sm shadow-sm transition-colors whitespace-nowrap ${
              section === s.id
                ? "bg-primary-container text-on-primary-container font-semibold"
                : "bg-surface-container-lowest text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high"
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">{s.icon}</span>
            <span>{s.label}</span>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg">
        {/* Left column */}
        <div className="lg:col-span-8 flex flex-col gap-space-lg">
          {/* 01 engine */}
          <div className="bg-surface-container-lowest rounded-xl p-space-lg shadow-sm flex flex-col gap-space-md" id="engine">
            <div className="flex items-center justify-between pb-space-xs">
              <div className="flex items-center gap-space-sm">
                <span className="w-8 h-8 rounded-lg bg-primary-container text-on-primary-container flex items-center justify-center font-label-md text-label-md font-semibold">
                  01
                </span>
                <div>
                  <h2 className="font-headline-sm text-headline-sm text-on-surface">Speech-to-Text &amp; Reasoning Core</h2>
                  <p className="font-body-sm text-body-sm text-on-surface-variant">
                    Run both engines together — Groq transcribes, Gemini reasons — or pin a single backend.
                  </p>
                </div>
              </div>
              <span className="px-space-sm py-1 rounded bg-tertiary-fixed text-on-tertiary-fixed font-label-sm text-label-sm font-semibold flex items-center gap-space-xs">
                <span className="w-1.5 h-1.5 rounded-full bg-tertiary-container" />
                {provider === "hybrid" && (settings?.has_groq_key || settings?.has_gemini_key)
                  ? "Hybrid Mode Active"
                  : provider === "local_free" || !(settings?.api_key_preview || settings?.has_groq_key || settings?.has_gemini_key)
                    ? "Free Mode Active"
                    : "Cloud Mode"}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-space-sm mt-space-xs">
              {PROVIDERS.map((p) => {
                const active = provider === p.value;
                return (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => onProviderChange(p.value)}
                    className={`relative flex flex-col justify-between p-space-md rounded-xl text-left cursor-pointer transition-all ${
                      p.span ? "sm:col-span-2" : ""
                    } ${active ? "bg-surface-container-low shadow-md" : "bg-surface-container-lowest shadow-sm hover:bg-surface-container-low"}`}
                  >
                    <div className="flex flex-col gap-space-xs">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-space-xs">
                          <span
                            className={`material-symbols-outlined text-[22px] ${active ? "text-primary-container" : "text-on-surface-variant"}`}
                          >
                            {p.icon}
                          </span>
                          <span className="font-body-md text-body-md font-semibold text-on-surface">{p.title}</span>
                        </div>
                        <span className={`px-space-xs py-0.5 rounded font-label-sm text-label-sm font-semibold ${p.badgeClass}`}>
                          {p.badge}
                        </span>
                      </div>
                      <p className="font-body-sm text-body-sm text-on-surface-variant mt-space-xs">{p.desc}</p>
                    </div>
                    <div className="mt-space-md pt-space-xs flex items-center justify-between">
                      <div className="flex items-center gap-space-xs text-on-surface-variant">
                        {p.metaStrong && (
                          <span className="font-label-sm text-label-sm font-semibold text-primary-container">{p.metaStrong}</span>
                        )}
                        <span className="font-label-sm text-label-sm">{p.meta}</span>
                      </div>
                      <div
                        className={`w-5 h-5 rounded-full flex items-center justify-center text-[12px] ${
                          active ? "bg-primary-container text-on-primary-container" : "bg-surface-container text-transparent"
                        }`}
                      >
                        <span className="material-symbols-outlined text-[14px]">check</span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {provider === "hybrid" && (
              <div className="mt-space-sm p-space-md rounded-xl bg-surface-container-low flex flex-col gap-space-xs">
                <label className="font-label-sm text-label-sm font-medium text-on-surface-variant uppercase">
                  Both Engine Keys — Transcribe + Reason
                </label>
                <div className="flex items-center gap-space-sm">
                  <input
                    type="password"
                    className="flex-1 px-space-md py-2 rounded-lg bg-surface-container-lowest font-label-md text-label-md text-on-surface shadow-sm"
                    placeholder={
                      settings?.has_groq_key ? `Groq saved: ${settings.groq_api_key_preview}` : "Groq API key (transcription — console.groq.com)"
                    }
                    value={groqKey}
                    onChange={(e) => setGroqKey(e.target.value)}
                  />
                  <input
                    type="password"
                    className="flex-1 px-space-md py-2 rounded-lg bg-surface-container-lowest font-label-md text-label-md text-on-surface shadow-sm"
                    placeholder={
                      settings?.has_gemini_key ? `Gemini saved: ${settings.gemini_api_key_preview}` : "Gemini API key (clip intelligence — aistudio.google.com)"
                    }
                    value={geminiKey}
                    onChange={(e) => setGeminiKey(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() =>
                      saveSettings({
                        ...(groqKey ? { groq_api_key: groqKey } : {}),
                        ...(geminiKey ? { gemini_api_key: geminiKey } : {}),
                      })
                    }
                    className="px-space-md py-2 rounded-lg bg-primary-container text-on-primary-container font-body-sm text-body-sm font-semibold hover:bg-primary transition-colors"
                  >
                    Save Keys
                  </button>
                </div>
                <p className="font-body-sm text-[11px] text-on-surface-variant">
                  Either key alone still works — missing jobs fall back to the free local engine.
                </p>
              </div>
            )}

            {provider !== "local_free" && provider !== "hybrid" && (
              <div className="mt-space-sm p-space-md rounded-xl bg-surface-container-low flex flex-col gap-space-xs">
                <label className="font-label-sm text-label-sm font-medium text-on-surface-variant uppercase">
                  {provider.toUpperCase()} API Key
                </label>
                <div className="flex items-center gap-space-sm">
                  <input
                    type="password"
                    className="flex-1 px-space-md py-2 rounded-lg bg-surface-container-lowest font-label-md text-label-md text-on-surface shadow-sm"
                    placeholder={
                      (provider === "groq" ? settings?.groq_api_key_preview : provider === "gemini" ? settings?.gemini_api_key_preview : settings?.api_key_preview)
                        ? `Saved: ${provider === "groq" ? settings.groq_api_key_preview : provider === "gemini" ? settings.gemini_api_key_preview : settings.api_key_preview}`
                        : "Paste your API key"
                    }
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                  />
                  <input
                    type="text"
                    className="w-56 px-space-md py-2 rounded-lg bg-surface-container-lowest font-label-md text-label-md text-on-surface shadow-sm"
                    placeholder="Model override (optional)"
                    value={aiModel}
                    onChange={(e) => setAiModel(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => saveSettings({ api_key: apiKey, ai_model: aiModel })}
                    className="px-space-md py-2 rounded-lg bg-primary-container text-on-primary-container font-body-sm text-body-sm font-semibold hover:bg-primary transition-colors"
                  >
                    Save Key
                  </button>
                </div>
              </div>
            )}

            {/* whisper calibration */}
            <div className="mt-space-md p-space-md rounded-xl bg-surface-container-low flex flex-col gap-space-md">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-space-xs">
                  <span className="material-symbols-outlined text-primary-container text-[20px]">tune</span>
                  <span className="font-body-md text-body-md font-semibold text-on-surface">
                    Offline Speech-to-Text (faster-whisper) Calibration
                  </span>
                </div>
                <span className="font-label-sm text-label-sm text-on-surface-variant font-medium">CTranslate2 Backend</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-space-md">
                <div className="flex flex-col gap-space-xs">
                  <label className="font-label-sm text-label-sm font-medium text-on-surface-variant uppercase">
                    Local Model Quantization
                  </label>
                  <div className="relative">
                    <select
                      className="w-full appearance-none px-space-md py-2 pr-8 rounded-lg bg-surface-container-lowest font-body-sm text-body-sm text-on-surface shadow-sm"
                      value={whisperModel}
                      onChange={(e) => setWhisperModel(e.target.value)}
                    >
                      <option value="tiny">tiny.en — 39 MB (Fastest, ~12x Realtime)</option>
                      <option value="base">base.en — 74 MB (Recommended for podcasts)</option>
                      <option value="small">small.en — 244 MB (High accuracy on accents)</option>
                      <option value="medium">medium — 769 MB (Multilingual Studio)</option>
                    </select>
                    <span className="material-symbols-outlined absolute right-space-sm top-2.5 text-on-surface-variant pointer-events-none text-[18px]">
                      expand_more
                    </span>
                  </div>
                  <span className="font-body-sm text-body-sm text-on-surface-variant">
                    Model downloads automatically on first inference pass.
                  </span>
                </div>
                <div className="flex flex-col gap-space-xs">
                  <label className="font-label-sm text-label-sm font-medium text-on-surface-variant uppercase">
                    Hardware Acceleration
                  </label>
                  <div className="flex items-center justify-between px-space-md py-1.5 rounded-lg bg-surface-container-lowest shadow-sm h-[38px]">
                    <div className="flex items-center gap-space-xs">
                      <span className="material-symbols-outlined text-primary-container text-[18px]">speed</span>
                      <span className="font-body-sm text-body-sm font-medium text-on-surface">NVIDIA CUDA (Float16)</span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        className="sr-only peer"
                        type="checkbox"
                        aria-label="NVIDIA CUDA acceleration"
                        checked={cuda}
                        onChange={(e) => {
                          setCuda(e.target.checked);
                          saveSettings({ use_cuda: e.target.checked });
                        }}
                      />
                      <div
                        className={`w-9 h-5 rounded-full peer-transition-colors after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-surface-container-lowest after:rounded-full after:h-4 after:w-4 after:transition-all ${
                          cuda ? "bg-primary-container after:translate-x-full" : "bg-surface-container-highest"
                        }`}
                      />
                    </label>
                  </div>
                  <span className="font-body-sm text-body-sm text-on-surface-variant">
                    Falls back cleanly to CPU INT8 if GPU VRAM &lt; 2GB.
                  </span>
                </div>
              </div>
              <div className="flex flex-col gap-space-xs pt-space-xs">
                <label className="font-label-sm text-label-sm font-medium text-on-surface-variant uppercase">
                  Cloud Speech-to-Text Fallback Routing
                </label>
                <div className="relative">
                  <select
                    className="w-full appearance-none px-space-md py-2 pr-8 rounded-lg bg-surface-container-lowest font-body-sm text-body-sm text-on-surface shadow-sm"
                    value={sttFallback}
                    onChange={(e) => setSttFallback(e.target.value)}
                  >
                    <option value="auto">Auto (Match AI Provider — zero extra configuration)</option>
                    <option value="groq">Groq Whisper Large v3 (Fastest remote)</option>
                    <option value="openai">OpenAI Whisper-1 (Highest accuracy)</option>
                    <option value="local">Never Fallback (Strict offline local only)</option>
                  </select>
                  <span className="material-symbols-outlined absolute right-space-sm top-2.5 text-on-surface-variant pointer-events-none text-[18px]">
                    expand_more
                  </span>
                </div>
                <p className="font-body-sm text-body-sm text-on-surface-variant">
                  If local audio files contain intense clipping or heavy background tracks, ClipPulse safely retries via the
                  remote fallback node without interrupting export pipelines.
                </p>
              </div>
            </div>
          </div>

          {/* 02 cookies */}
          <div className="bg-surface-container-lowest rounded-xl p-space-lg shadow-sm flex flex-col gap-space-md" id="youtube-cookies">
            <div className="flex items-center justify-between pb-space-xs">
              <div className="flex items-center gap-space-sm">
                <span className="w-8 h-8 rounded-lg bg-primary-container text-on-primary-container flex items-center justify-center font-label-md text-label-md font-semibold">
                  02
                </span>
                <div>
                  <h2 className="font-headline-sm text-headline-sm text-on-surface flex items-center gap-space-xs">
                    <span>Free YouTube Download Cookies</span>
                    <span className="font-label-sm text-label-sm px-space-xs py-0.5 rounded bg-surface-container text-on-surface-variant">
                      cookies.txt
                    </span>
                  </h2>
                  <p className="font-body-sm text-body-sm text-on-surface-variant">
                    Bypass &quot;Sign in to confirm you&apos;re not a bot&quot; throttling on cloud hosts.
                    {settings?.has_youtube_cookies ? " ✓ Cookies currently stored." : ""}
                  </p>
                </div>
              </div>
              <span className="material-symbols-outlined text-primary-container text-[24px]">cookie</span>
            </div>

            <div className="p-space-md rounded-xl bg-surface-container flex items-start gap-space-md">
              <span className="material-symbols-outlined text-primary text-[22px] shrink-0 mt-0.5">info</span>
              <div className="flex flex-col gap-space-xs text-on-surface">
                <p className="font-body-sm text-body-sm leading-relaxed">
                  On cloud servers, YouTube asks for sign-in verification. You can export a free{" "}
                  <span className="font-label-sm text-label-sm bg-surface-container-lowest px-1 py-0.5 rounded text-primary-container font-semibold">
                    cookies.txt
                  </span>{" "}
                  file using any free browser extension (e.g. <em>Get cookies.txt LOCALLY</em>) and paste or load it here — or
                  run ClipPulse locally on your own PC with zero cookies.
                </p>
                <div className="flex items-center gap-space-sm mt-space-xs">
                  <span className="font-label-sm text-label-sm text-on-surface-variant">
                    Format: Netscape HTTP Cookie File
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-space-xs">
              <div className="flex items-center justify-between text-on-surface-variant">
                <span className="font-label-sm text-label-sm uppercase font-medium">Session Payload</span>
                <span className="font-label-sm text-label-sm">{cookieBytes} bytes loaded</span>
              </div>
              <div className="relative rounded-xl overflow-hidden bg-surface-container-low shadow-inner">
                <textarea
                  className="w-full p-space-md bg-transparent font-label-md text-label-md text-on-surface resize-y placeholder:text-on-surface-variant/50 leading-relaxed"
                  rows={7}
                  spellCheck={false}
                  placeholder={`# Netscape HTTP Cookie File\n# https://curl.haxx.se/rfc/cookie_spec.html\n\n.youtube.com\tTRUE\t/\tTRUE\t1743518400\tVISITOR_INFO1_LIVE\tq9vKk4B7a_A`}
                  value={cookies}
                  onChange={(e) => {
                    setCookies(e.target.value);
                    setCookieBytes(e.target.value.length);
                  }}
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-space-sm pt-space-xs">
              <div className="flex items-center gap-space-xs">
                <input ref={fileRef} accept=".txt" className="hidden" type="file" onChange={onCookieFile} />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="px-space-md py-2 rounded-lg bg-surface-container text-on-surface hover:bg-surface-container-high transition-colors font-body-sm text-body-sm font-medium flex items-center gap-space-xs shadow-sm"
                >
                  <span className="material-symbols-outlined text-[18px]">upload_file</span>
                  <span>Load cookies.txt file</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCookies("");
                    setCookieBytes(0);
                    clearCookies();
                  }}
                  className="px-space-sm py-2 rounded-lg text-on-surface-variant hover:text-error hover:bg-error-container/40 transition-colors font-body-sm text-body-sm"
                >
                  Clear
                </button>
              </div>
              <button
                type="button"
                onClick={onSaveCookies}
                className="px-space-lg py-2 rounded-lg bg-primary-container text-on-primary-container hover:bg-primary transition-all font-body-sm text-body-sm font-semibold flex items-center gap-space-xs shadow-md"
              >
                <span className="material-symbols-outlined text-[18px]">verified_user</span>
                <span>Save YouTube Cookies</span>
              </button>
            </div>
          </div>
        </div>

        {/* Right column */}
        <div className="lg:col-span-4 flex flex-col gap-space-lg">
          <div className="bg-surface-container-lowest rounded-xl p-space-lg shadow-sm flex flex-col gap-space-md" id="style-presets">
            <div className="flex items-center gap-space-sm pb-space-xs">
              <span className="w-8 h-8 rounded-lg bg-secondary-container text-on-secondary-container flex items-center justify-center font-label-md text-label-md font-semibold">
                03
              </span>
              <div>
                <h2 className="font-headline-sm text-headline-sm text-on-surface">AI &amp; Style Defaults</h2>
                <p className="font-body-sm text-body-sm text-on-surface-variant">Global canvas rules applied to batch imports.</p>
              </div>
            </div>

            <div className="flex flex-col gap-space-xs">
              <label className="font-label-sm text-label-sm font-medium text-on-surface-variant uppercase">
                Default Caption Style
              </label>
              <div className="relative">
                <select
                  className="w-full appearance-none px-space-md py-2 pr-8 rounded-lg bg-surface-container-low font-body-sm text-body-sm text-on-surface shadow-sm"
                  value={captionStyle}
                  onChange={(e) => setCaptionStyle(e.target.value)}
                >
                  <option value="hormozi">Hormozi Pop (High-contrast yellow/green words)</option>
                  <option value="beast">Beast Clean (Solid bold stroke, center anchor)</option>
                  <option value="minimal">Minimal Pill (Soft rounded backdrop)</option>
                  <option value="neon">Neon Creator (Glowing highlights)</option>
                  <option value="off">Captions Off</option>
                </select>
                <span className="material-symbols-outlined absolute right-space-sm top-2.5 text-on-surface-variant pointer-events-none text-[18px]">
                  expand_more
                </span>
              </div>
              <span className="font-body-sm text-body-sm text-on-surface-variant">
                Kinetic word highlight synced to Whisper timestamps.
              </span>
            </div>

            <div className="flex flex-col gap-space-xs">
              <label className="font-label-sm text-label-sm font-medium text-on-surface-variant uppercase">
                Default 9:16 Framing Technique
              </label>
              <div className="relative">
                <select
                  className="w-full appearance-none px-space-md py-2 pr-8 rounded-lg bg-surface-container-low font-body-sm text-body-sm text-on-surface shadow-sm"
                  value={layout}
                  onChange={(e) => setLayout(e.target.value)}
                >
                  <option value="center_crop">Smart 9:16 Crop (AI Speaker Face-Track)</option>
                  <option value="blur_fill">Blur-Fill 16:9 (Ambient blurred backing)</option>
                  <option value="split_screen">Split-Screen Multi-Cam (Reaction + Screen)</option>
                </select>
                <span className="material-symbols-outlined absolute right-space-sm top-2.5 text-on-surface-variant pointer-events-none text-[18px]">
                  expand_more
                </span>
              </div>
              <span className="font-body-sm text-body-sm text-on-surface-variant">
                Auto-detects active speaker mouth trajectory and centers canvas.
              </span>
            </div>

            <div className="flex flex-col gap-space-xs">
              <div className="flex justify-between items-center">
                <label className="font-label-sm text-label-sm font-medium text-on-surface-variant uppercase">
                  Max Viral Clips / Source
                </label>
                <span className="font-label-md text-label-md font-semibold text-primary-container">
                  {maxClips === 0 ? "Auto" : `${maxClips} ${maxClips === 1 ? "Clip" : "Clips"}`}
                </span>
              </div>
              <input
                className="w-full h-1.5 bg-surface-container-highest rounded-lg appearance-none cursor-pointer accent-primary-container"
                type="range"
                aria-label="Maximum viral clips per source"
                min="0"
                max="15"
                value={maxClips}
                onChange={(e) => setMaxClips(Number(e.target.value))}
              />
              <div className="flex justify-between font-label-sm text-label-sm text-on-surface-variant">
                <span>Auto (by length)</span>
                <span>15 (Deep Scan)</span>
              </div>
              {maxClips === 0 && (
                <p className="text-on-surface-variant font-body-sm text-body-sm">
                  Auto scales with the video: about one clip per 2 minutes of footage (3–15 clips).
                </p>
              )}
            </div>

            <div className="rounded-xl overflow-hidden bg-surface-container-low p-space-sm flex flex-col gap-space-xs">
              <span className="font-label-sm text-label-sm font-semibold uppercase text-on-surface-variant">
                Style Simulation Target
              </span>
              <div className="relative h-44 rounded-lg overflow-hidden bg-inverse-surface flex items-center justify-center">
                <img className="absolute inset-0 w-full h-full object-cover opacity-85" src="/art/demo-keynote.jpg" alt="" />
                <div className="relative z-10 px-space-md py-space-xs rounded bg-inverse-surface/80 backdrop-blur-md text-center">
                  <span className="font-body-md text-body-md font-bold text-tertiary-fixed">
                    &quot;THIS ONE TRICK&quot;
                  </span>
                  <span className="block font-label-sm text-label-sm text-inverse-on-surface mt-0.5">
                    {layout === "center_crop" ? "Smart 9:16 Face-Anchor" : layout === "blur_fill" ? "Blur-Fill 16:9" : "Split-Screen"} [Active]
                  </span>
                </div>
                <div className="absolute bottom-2 right-2 px-space-xs py-0.5 rounded bg-surface-container-lowest/90 font-label-sm text-label-sm text-on-surface font-semibold">
                  9:16 Vertical
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={saveDefaults}
              className="w-full py-2.5 rounded-lg bg-primary-container text-on-primary-container hover:bg-primary transition-all font-body-sm text-body-sm font-semibold shadow-md flex items-center justify-center gap-space-xs"
            >
              <span className="material-symbols-outlined text-[18px]">save</span>
              <span>Save AI &amp; Style Defaults</span>
            </button>
          </div>

          {/* telemetry */}
          <div className="bg-surface-container-lowest rounded-xl p-space-lg shadow-sm flex flex-col gap-space-md" id="telemetry">
            <div className="flex items-center justify-between">
              <span className="font-headline-sm text-headline-sm text-on-surface">Runtime Telemetry</span>
              <span
                className={`px-space-xs py-0.5 rounded font-label-sm text-label-sm font-semibold ${
                  healthy ? "bg-tertiary-fixed text-on-tertiary-fixed" : "bg-error-container text-on-error-container"
                }`}
              >
                {healthy ? "HEALTHY" : "DEGRADED"}
              </span>
            </div>
            <div className="flex flex-col gap-space-sm font-label-sm text-label-sm">
              <div className="flex items-center justify-between p-space-xs rounded bg-surface-container-low">
                <span className="text-on-surface-variant">FFmpeg Core</span>
                <span className="text-on-surface font-semibold">{caps.ffmpeg || "not installed"}</span>
              </div>
              <div className="flex items-center justify-between p-space-xs rounded bg-surface-container-low">
                <span className="text-on-surface-variant">Local Whisper</span>
                <span className="text-on-surface font-semibold">{caps.local_whisper || "unavailable"}</span>
              </div>
              <div className="flex items-center justify-between p-space-xs rounded bg-surface-container-low">
                <span className="text-on-surface-variant">Face-Follow Reframing</span>
                <span className="text-on-surface font-semibold">{caps.local_face_follow || "unavailable"}</span>
              </div>
              <div className="flex items-center justify-between p-space-xs rounded bg-surface-container-low">
                <span className="text-on-surface-variant">Daily Free Quota</span>
                <span className="text-primary-container font-semibold">
                  {provider === "local_free" ? "Unlimited (Free Local Active)" : "Provider free tier"}
                </span>
              </div>
            </div>
            <div className="p-space-sm rounded-lg bg-surface-container-high text-on-surface-variant font-body-sm text-body-sm flex items-start gap-space-xs">
              <span className="material-symbols-outlined text-[18px] text-primary shrink-0 mt-0.5">verified</span>
              <span>Local speech models never send audio outside your machine. Zero tracking or remote audio caching.</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
