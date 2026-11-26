import React, { useEffect, useRef, useState } from "react";
import { Cpu, Mic, Sliders, Youtube, Palette, Eye, EyeOff, Upload } from "lucide-react";
import { api } from "../api";
import { CAPTION_STYLES, LAYOUTS, PROVIDERS, providerById } from "../engine";
import { Button, Field, Notice, Segmented, Toggle, inputClass } from "./ui";

const TABS = [
  { id: "engine", label: "AI engine", Icon: Cpu },
  { id: "transcription", label: "Transcription", Icon: Mic },
  { id: "defaults", label: "Clip defaults", Icon: Sliders },
  { id: "youtube", label: "YouTube access", Icon: Youtube },
  { id: "appearance", label: "Appearance", Icon: Palette },
];

function fromSettings(s) {
  return {
    provider: s.ai_provider || "local_free",
    model: s.ai_model || "",
    whisperOn: s.enable_local_whisper !== false,
    whisperModel: s.whisper_model || "tiny",
    caption: s.default_caption_style || "hormozi",
    layout: s.default_layout || "center_crop",
    apiKey: "",
  };
}

function isSame(a, b) {
  return Object.keys(a).every((k) => a[k] === b[k]);
}

/** Tiny diagram of how a 16:9 frame sits inside the 9:16 output. */
function LayoutGlyph({ kind }) {
  return (
    <svg viewBox="0 0 36 64" className="w-7 h-12 shrink-0" aria-hidden="true">
      <rect x="0.75" y="0.75" width="34.5" height="62.5" rx="4" className="fill-sunken stroke-line-strong" strokeWidth="1.5" />
      {kind === "center_crop" && <rect x="9" y="2" width="18" height="60" rx="2" className="fill-accent" />}
      {kind === "blur_fill" && (
        <>
          <rect x="2" y="2" width="32" height="60" rx="3" className="fill-ink/15" />
          <rect x="2" y="23" width="32" height="18" className="fill-accent" />
        </>
      )}
      {kind === "split_screen" && (
        <>
          <rect x="2" y="2" width="32" height="29" rx="2" className="fill-accent" />
          <rect x="2" y="33" width="32" height="29" rx="2" className="fill-ink/40" />
        </>
      )}
    </svg>
  );
}

function CaptionSample({ kind }) {
  const base = "h-9 rounded-md bg-black flex items-center justify-center overflow-hidden px-2 text-[11px] leading-none";
  if (kind === "off") return <div className={`${base} text-white/50`}>Off</div>;
  if (kind === "hormozi") return <div className={`${base} font-extrabold uppercase text-[#ffd400]`}>Watch this</div>;
  if (kind === "beast") return <div className={`${base} font-extrabold uppercase text-white`}>Watch this</div>;
  if (kind === "minimal") return <div className={base}><span className="px-2 py-1 rounded-full bg-white/90 text-black font-medium">Watch this</span></div>;
  return <div className={`${base} font-bold text-[#7df9ff] [text-shadow:0_0_8px_#22d3ee]`}>Watch this</div>;
}

function Panel({ title, description, children }) {
  return (
    <section className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-ink">{title}</h2>
        {description && <p className="text-sm text-muted mt-1 max-w-xl leading-relaxed">{description}</p>}
      </div>
      {children}
    </section>
  );
}

export default function SettingsPage({ settings, initialTab, onUpdated, onDirtyChange, themePref, onThemeChange }) {
  const [tab, setTab] = useState(TABS.some((t) => t.id === initialTab) ? initialTab : "engine");
  const [draft, setDraft] = useState(() => (settings ? fromSettings(settings) : null));
  const [showKey, setShowKey] = useState(false);
  const [confirmRemoveKey, setConfirmRemoveKey] = useState(false);
  const [cookiesText, setCookiesText] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null); // { tone, text }
  const initialised = useRef(!!settings);

  // Settings can arrive after this page mounts; take them once, never overwrite edits.
  useEffect(() => {
    if (settings && !initialised.current) {
      setDraft(fromSettings(settings));
      initialised.current = true;
    }
  }, [settings]);

  const base = settings ? fromSettings(settings) : null;
  const dirty = !!draft && !!base && !isSame(draft, base);

  useEffect(() => {
    if (onDirtyChange) onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);

  useEffect(() => () => onDirtyChange && onDirtyChange(false), [onDirtyChange]);

  if (!settings || !draft || !base) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-muted" role="status">
        Loading settings...
      </div>
    );
  }

  const prov = providerById(draft.provider);
  const baseProv = providerById(base.provider);
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));

  function selectTab(id) {
    setTab(id);
    setNotice(null);
  }

  function chooseProvider(id) {
    const p = providerById(id);
    set({ provider: id, model: id === base.provider ? base.model : p.defaultModel, apiKey: "" });
    setShowKey(false);
  }

  async function run(fn) {
    setBusy(true);
    setNotice(null);
    try {
      await fn();
    } catch (ex) {
      setNotice({ tone: "error", text: ex.message || "Something went wrong." });
    } finally {
      setBusy(false);
    }
  }

  function save() {
    if (draft.provider !== "local_free" && !settings.has_api_key && !draft.apiKey.trim()) {
      setTab("engine");
      setNotice({ tone: "error", text: `Add an API key for ${prov.label}, or choose Local only.` });
      return;
    }
    run(async () => {
      const payload = {
        ai_provider: draft.provider,
        ai_model: draft.model.trim() || prov.defaultModel,
        enable_local_whisper: draft.whisperOn,
        whisper_model: draft.whisperModel,
        default_caption_style: draft.caption,
        default_layout: draft.layout,
      };
      if (draft.apiKey.trim()) payload.api_key = draft.apiKey.trim();
      const updated = await api.updateSettings(payload);
      onUpdated(updated);
      setDraft(fromSettings(updated));
      setShowKey(false);
      setNotice({ tone: "ok", text: "Settings saved." });
    });
  }

  function discard() {
    setDraft(fromSettings(settings));
    setNotice(null);
    setShowKey(false);
  }

  function removeKey() {
    run(async () => {
      const updated = await api.updateSettings({ ai_provider: "local_free", api_key: "" });
      onUpdated(updated);
      setDraft(fromSettings(updated));
      setConfirmRemoveKey(false);
      setNotice({ tone: "ok", text: "API key removed. ClipPulse now runs locally." });
    });
  }

  function saveCookies() {
    run(async () => {
      const updated = await api.uploadCookies(cookiesText);
      onUpdated(updated);
      setCookiesText("");
      setNotice({ tone: "ok", text: "YouTube cookies saved. Downloads will use them." });
    });
  }

  function clearCookies() {
    run(async () => {
      const updated = await api.clearCookies();
      onUpdated(updated);
      setNotice({ tone: "ok", text: "YouTube cookies removed." });
    });
  }

  async function loadCookiesFile(e) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    try {
      setCookiesText(await f.text());
      setNotice(null);
    } catch {
      setNotice({ tone: "error", text: "Could not read that file. Try pasting its contents instead." });
    }
  }

  const tabStatus = {
    engine: baseProv.label,
    youtube: settings.has_youtube_cookies ? "Cookies saved" : "Not set",
  };

  const keyMismatch = draft.provider !== "local_free" && draft.provider !== base.provider && settings.has_api_key && !draft.apiKey.trim();

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-8 sm:pt-10">
        <h1 className="text-3xl font-bold text-ink">Settings</h1>

        <div className="mt-6 grid grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)] gap-6 lg:gap-10">
          <nav aria-label="Settings sections" className="lg:sticky lg:top-6 self-start">
            <ul className="flex lg:flex-col gap-1 overflow-x-auto pb-1 lg:pb-0">
              {TABS.map(({ id, label, Icon }) => {
                const active = tab === id;
                return (
                  <li key={id} className="shrink-0">
                    <button
                      type="button"
                      onClick={() => selectTab(id)}
                      aria-current={active ? "page" : undefined}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-left transition-colors ${
                        active ? "bg-raised border border-line text-ink font-semibold" : "border border-transparent text-muted hover:text-ink hover:bg-ink/6"
                      }`}
                    >
                      <Icon className={`w-4 h-4 shrink-0 ${active ? "text-accent" : "text-faint"}`} aria-hidden="true" />
                      <span className="flex-1 whitespace-nowrap">{label}</span>
                      {tabStatus[id] && <span className="hidden lg:inline text-xs text-faint truncate max-w-[84px]">{tabStatus[id]}</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="min-w-0 pb-6">
            <div aria-live="polite" className="mb-4 empty:hidden">
              {notice && <Notice tone={notice.tone} onDismiss={() => setNotice(null)}>{notice.text}</Notice>}
            </div>

            {tab === "engine" && (
              <Panel
                title="AI engine"
                description="Chooses who picks your clips. Local only needs no account and nothing leaves this computer. A cloud provider needs its own API key."
              >
                <div role="radiogroup" aria-label="AI engine" className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {PROVIDERS.map((p) => {
                    const active = draft.provider === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => chooseProvider(p.id)}
                        className={`text-left rounded-xl border p-3.5 transition-colors ${
                          active ? "border-accent bg-accent/8 ring-1 ring-accent" : "border-line bg-raised hover:border-line-strong"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-ink">{p.label}</span>
                          <span className="text-xs text-muted">{p.badge}</span>
                        </div>
                        <p className="text-sm text-muted mt-1 leading-snug">{p.desc}</p>
                      </button>
                    );
                  })}
                </div>

                {draft.provider !== "local_free" && (
                  <div className="rounded-xl border border-line bg-raised p-4 space-y-4">
                    {keyMismatch && (
                      <Notice tone="warn">
                        A key is already saved, but it may belong to {baseProv.label}. Enter a key for {prov.label} to switch.
                      </Notice>
                    )}
                    <Field
                      label={`${prov.label} API key`}
                      htmlFor="api-key"
                      hint={
                        settings.has_api_key && draft.provider === base.provider
                          ? `A key ending in ${settings.api_key_preview.replace(/^•+/, "")} is saved. Leave this empty to keep it.`
                          : prov.keyUrl
                          ? `Get a key at ${prov.keyUrl}. It is stored in this app's data folder on this computer.`
                          : undefined
                      }
                    >
                      <div className="flex gap-2">
                        <input
                          id="api-key"
                          name="api-key"
                          type={showKey ? "text" : "password"}
                          autoComplete="off"
                          spellCheck={false}
                          value={draft.apiKey}
                          onChange={(e) => set({ apiKey: e.target.value })}
                          placeholder={settings.has_api_key && draft.provider === base.provider ? "Enter a new key to replace it" : prov.placeholder}
                          className={inputClass}
                        />
                        <button
                          type="button"
                          onClick={() => setShowKey((v) => !v)}
                          aria-label={showKey ? "Hide key" : "Show key"}
                          aria-pressed={showKey}
                          className="shrink-0 px-2.5 rounded-lg border border-line text-muted hover:text-ink hover:border-line-strong"
                        >
                          {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </Field>
                    <Field label="Model" htmlFor="ai-model" hint="The default works for most people. Change it only if you know the model name.">
                      <input
                        id="ai-model"
                        type="text"
                        spellCheck={false}
                        value={draft.model || prov.defaultModel}
                        onChange={(e) => set({ model: e.target.value })}
                        className={`${inputClass} font-mono text-[13px]`}
                      />
                    </Field>
                  </div>
                )}

                {settings.has_api_key && (
                  <div className="flex flex-wrap items-center gap-3 text-sm">
                    {confirmRemoveKey ? (
                      <>
                        <span className="text-ink">Remove the saved key and go back to Local only?</span>
                        <Button variant="danger" size="sm" onClick={removeKey} disabled={busy}>
                          Remove key
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setConfirmRemoveKey(false)}>
                          Keep it
                        </Button>
                      </>
                    ) : (
                      <Button variant="ghost" size="sm" onClick={() => setConfirmRemoveKey(true)}>
                        Remove saved key
                      </Button>
                    )}
                  </div>
                )}
              </Panel>
            )}

            {tab === "transcription" && (
              <Panel
                title="Transcription"
                description="Captions need a transcript. ClipPulse uses subtitles you provide first. When there are none, it transcribes the audio with Groq or OpenAI Whisper if you added a key for one, then with local Whisper."
              >
                <div className="rounded-xl border border-line bg-raised p-4 space-y-5">
                  <Toggle
                    checked={draft.whisperOn}
                    onChange={(v) => set({ whisperOn: v })}
                    label="Transcribe on this computer"
                    description="Uses faster-whisper with word-level timing. Free, but slower on long videos, and the first run downloads the model."
                  />
                  <div className={draft.whisperOn ? "" : "opacity-50 pointer-events-none"} aria-disabled={!draft.whisperOn}>
                    <div className="text-sm font-medium text-ink mb-1.5">Model size</div>
                    <Segmented
                      label="Whisper model size"
                      value={draft.whisperModel}
                      onChange={(v) => set({ whisperModel: v })}
                      options={[
                        { value: "tiny", label: "Tiny, fastest" },
                        { value: "base", label: "Base, more accurate" },
                      ]}
                    />
                  </div>
                </div>
                {!draft.whisperOn && (
                  <Notice tone="warn">
                    With local transcription off, videos without subtitles get no captions unless you use Groq or OpenAI with a saved key.
                  </Notice>
                )}
              </Panel>
            )}

            {tab === "defaults" && (
              <Panel title="Clip defaults" description="Every new clip starts with these. You can still change them per clip in the studio.">
                <div className="space-y-6">
                  <fieldset>
                    <legend className="text-sm font-medium text-ink mb-2">Framing</legend>
                    <div role="radiogroup" aria-label="Default framing" className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {LAYOUTS.map((l) => {
                        const active = draft.layout === l.value;
                        return (
                          <button
                            key={l.value}
                            type="button"
                            role="radio"
                            aria-checked={active}
                            onClick={() => set({ layout: l.value })}
                            className={`text-left rounded-xl border p-3 flex gap-3 transition-colors ${
                              active ? "border-accent bg-accent/8 ring-1 ring-accent" : "border-line bg-raised hover:border-line-strong"
                            }`}
                          >
                            <LayoutGlyph kind={l.value} />
                            <span className="min-w-0">
                              <span className="block font-semibold text-ink text-sm">{l.label}</span>
                              <span className="block text-xs text-muted mt-0.5 leading-snug">{l.note}</span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </fieldset>

                  <fieldset>
                    <legend className="text-sm font-medium text-ink mb-2">Caption style</legend>
                    <div role="radiogroup" aria-label="Default caption style" className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {CAPTION_STYLES.map((c) => {
                        const active = draft.caption === c.value;
                        return (
                          <button
                            key={c.value}
                            type="button"
                            role="radio"
                            aria-checked={active}
                            onClick={() => set({ caption: c.value })}
                            className={`text-left rounded-xl border p-3 space-y-2 transition-colors ${
                              active ? "border-accent bg-accent/8 ring-1 ring-accent" : "border-line bg-raised hover:border-line-strong"
                            }`}
                          >
                            <CaptionSample kind={c.value} />
                            <span className="block">
                              <span className="block font-semibold text-ink text-sm">{c.label}</span>
                              <span className="block text-xs text-muted mt-0.5 leading-snug">{c.note}</span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </fieldset>
                </div>
              </Panel>
            )}

            {tab === "youtube" && (
              <Panel
                title="YouTube access"
                description="YouTube sometimes asks downloaders to sign in, mostly on cloud servers. Cookies from a signed-in browser let ClipPulse download those videos. You do not need this when running on your own computer."
              >
                <div className="rounded-xl border border-line bg-raised p-4 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-sm">
                      <span className={`w-2 h-2 rounded-full ${settings.has_youtube_cookies ? "bg-ok" : "bg-line-strong"}`} aria-hidden="true" />
                      <span className="font-medium text-ink">{settings.has_youtube_cookies ? "Cookies saved" : "No cookies saved"}</span>
                    </div>
                    {settings.has_youtube_cookies && (
                      <Button variant="danger" size="sm" onClick={clearCookies} disabled={busy}>
                        Remove cookies
                      </Button>
                    )}
                  </div>

                  <p className="text-sm text-muted leading-relaxed">
                    Export a <code className="text-ink">cookies.txt</code> file with a browser extension such as "Get cookies.txt LOCALLY", then load or paste it
                    below. It must be in Netscape format and include youtube.com cookies. Treat it like a password: anyone with it can use your YouTube session.
                  </p>

                  <textarea
                    rows={5}
                    value={cookiesText}
                    onChange={(e) => setCookiesText(e.target.value)}
                    placeholder="# Netscape HTTP Cookie File"
                    spellCheck={false}
                    aria-label="cookies.txt contents"
                    className={`${inputClass} font-mono text-xs`}
                  />
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-line bg-raised text-xs font-semibold text-ink hover:border-line-strong cursor-pointer">
                      <Upload className="w-3.5 h-3.5" aria-hidden="true" />
                      Load cookies.txt
                      <input type="file" accept=".txt,text/plain" onChange={loadCookiesFile} className="sr-only" />
                    </label>
                    <Button variant="primary" size="sm" onClick={saveCookies} disabled={busy || !cookiesText.trim()}>
                      Save cookies
                    </Button>
                  </div>
                </div>
              </Panel>
            )}

            {tab === "appearance" && (
              <Panel title="Appearance" description="Applies immediately and is remembered in this browser.">
                <div className="rounded-xl border border-line bg-raised p-4 space-y-2">
                  <div className="text-sm font-medium text-ink">Theme</div>
                  <Segmented
                    label="Theme"
                    value={themePref}
                    onChange={onThemeChange}
                    options={[
                      { value: "system", label: "Match system" },
                      { value: "light", label: "Light" },
                      { value: "dark", label: "Dark" },
                    ]}
                  />
                </div>
              </Panel>
            )}
          </div>
        </div>
      </div>

      {dirty && (
        <div className="sticky bottom-0 border-t border-line bg-surface/95 backdrop-blur">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm font-medium text-ink" role="status">
              You have unsaved changes
            </span>
            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={discard} disabled={busy}>
                Discard
              </Button>
              <Button variant="primary" onClick={save} disabled={busy}>
                {busy ? "Saving..." : "Save changes"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
