import React, { useEffect, useRef, useState } from "react";
import { Youtube, Upload, Film, ArrowLeft, ArrowRight, Check, FileText, Cookie } from "lucide-react";
import { api } from "../api";
import { transcriptionPlan } from "../engine";
import { Button, Field, Notice, inputClass } from "./ui";

const SOURCES = [
  { id: "youtube", label: "YouTube link", note: "A video, podcast or livestream URL", Icon: Youtube },
  { id: "upload", label: "Video file", note: "MP4, MOV, WebM or MKV from this computer", Icon: Upload },
  { id: "sample", label: "Sample video", note: "Try the studio without your own footage", Icon: Film },
];

const SAMPLES = [
  {
    key: "podcast_creators",
    title: "Why 90% of Creators Quit Before Day 30",
    meta: "Two-speaker podcast, 1:06",
    note: "Good for testing split screen and Hormozi-style captions.",
  },
  {
    key: "tech_keynote",
    title: "How Small AI Teams Ship 10x Faster Than Giants",
    meta: "Keynote with a live demo, 1:00",
    note: "Good for testing blur fill and the social captions.",
  },
];

const STEPS = ["Source", "Details", "Start"];

const YOUTUBE_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be", "www.youtu.be"]);
const VIDEO_EXTS = [".mp4", ".mov", ".webm", ".mkv", ".m4v"];

function looksLikeYoutube(value) {
  try {
    const u = new URL(value.trim());
    return (u.protocol === "https:" || u.protocol === "http:") && YOUTUBE_HOSTS.has(u.hostname.toLowerCase());
  } catch {
    return false;
  }
}

function isVideoFile(file) {
  if (!file) return false;
  if (file.type && file.type.startsWith("video/")) return true;
  const name = file.name.toLowerCase();
  return VIDEO_EXTS.some((ext) => name.endsWith(ext));
}

function formatElapsed(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function Stepper({ step }) {
  return (
    <ol className="flex items-center gap-2 text-sm" aria-label="Progress">
      {STEPS.map((label, i) => {
        const n = i + 1;
        const done = n < step;
        const current = n === step;
        return (
          <li key={label} className="flex items-center gap-2" aria-current={current ? "step" : undefined}>
            <span
              className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-semibold tabular-nums border ${
                current
                  ? "bg-ink text-canvas border-ink"
                  : done
                  ? "bg-accent/15 text-accent border-accent/40"
                  : "bg-transparent text-faint border-line-strong"
              }`}
            >
              {done ? <Check className="w-3.5 h-3.5" aria-hidden="true" /> : n}
            </span>
            <span className={current ? "font-medium text-ink" : "text-muted"}>{label}</span>
            {n < STEPS.length && <span className="w-6 sm:w-10 h-px bg-line-strong" aria-hidden="true" />}
          </li>
        );
      })}
    </ol>
  );
}

export default function NewProject({ settings, hasProjects, onProjectCreated, onOpenSettings }) {
  const [step, setStep] = useState(1);
  const [source, setSource] = useState("youtube");

  const [ytUrl, setYtUrl] = useState("");
  const [ytTranscript, setYtTranscript] = useState("");

  const [file, setFile] = useState(null);
  const [title, setTitle] = useState("");
  const [subFile, setSubFile] = useState(null);
  const [pastedTranscript, setPastedTranscript] = useState("");
  const [dragging, setDragging] = useState(false);

  const [sample, setSample] = useState("podcast_creators");

  const [fieldError, setFieldError] = useState("");
  const [error, setError] = useState(null);
  const [blocked, setBlocked] = useState(null);
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (!running) return undefined;
    setElapsed(0);
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [running]);

  function chooseSource(id) {
    setSource(id);
    setFieldError("");
    setError(null);
    setBlocked(null);
  }

  function pickFile(f) {
    if (!f) return;
    if (!isVideoFile(f)) {
      setFieldError("That file is not a video. Choose an MP4, MOV, WebM or MKV file.");
      return;
    }
    setFieldError("");
    setFile(f);
  }

  function validateDetails() {
    if (source === "youtube" && !looksLikeYoutube(ytUrl)) {
      setFieldError("Enter a full YouTube link, for example https://www.youtube.com/watch?v=...");
      return false;
    }
    if (source === "upload" && !file) {
      setFieldError("Choose a video file to continue.");
      return false;
    }
    setFieldError("");
    return true;
  }

  function goNext() {
    setError(null);
    setBlocked(null);
    if (step === 2 && !validateDetails()) return;
    setStep((s) => Math.min(3, s + 1));
  }

  function goBack() {
    setFieldError("");
    setError(null);
    setBlocked(null);
    setStep((s) => Math.max(1, s - 1));
  }

  async function start() {
    setRunning(true);
    setError(null);
    setBlocked(null);
    try {
      let proj;
      if (source === "youtube") {
        proj = await api.createFromYoutube(ytUrl.trim(), ytTranscript);
      } else if (source === "upload") {
        const fd = new FormData();
        fd.append("file", file);
        if (title.trim()) fd.append("title", title.trim());
        if (pastedTranscript.trim()) fd.append("transcript_text", pastedTranscript.trim());
        if (subFile) fd.append("subtitle_file", subFile);
        proj = await api.uploadVideo(fd);
      } else {
        proj = await api.createDemo(sample);
      }
      onProjectCreated(proj);
    } catch (ex) {
      if (ex.data?.code === "YOUTUBE_BOT_BLOCK") setBlocked(ex.data);
      else setError(ex.message || "Something went wrong while creating the project.");
    } finally {
      setRunning(false);
    }
  }

  const sourceMeta = SOURCES.find((s) => s.id === source);
  const sampleMeta = SAMPLES.find((s) => s.key === sample);
  const hasOwnCaptions = source === "upload" && (!!subFile || !!pastedTranscript.trim());

  const summary =
    source === "youtube"
      ? ytUrl.trim()
      : source === "upload"
      ? file
        ? `${file.name} (${(file.size / (1024 * 1024)).toFixed(1)} MB)`
        : ""
      : sampleMeta?.title;

  const workingText =
    source === "youtube"
      ? "Downloading the video, then transcribing it and scoring the moments."
      : source === "upload"
      ? "Reading the file, then transcribing it and scoring the moments."
      : "Preparing the sample video and scoring the moments.";

  return (
    <section aria-labelledby="new-project-heading" className="rounded-xl border border-line bg-raised">
      <div className="px-4 sm:px-6 pt-5 pb-4 flex flex-wrap items-center justify-between gap-3 border-b border-line">
        <div>
          <h2 id="new-project-heading" className="text-xl font-bold text-ink">
            New project
          </h2>
          {!hasProjects && <p className="text-sm text-muted mt-0.5">No projects yet. Start with the sample video to see how the studio works.</p>}
        </div>
        {!running && <Stepper step={step} />}
      </div>

      <div className="px-4 sm:px-6 py-5 space-y-5">
        {running ? (
          <div className="space-y-4 py-2" role="status" aria-live="polite">
            <div>
              <div className="font-display font-bold text-lg text-ink">Working on your video</div>
              <p className="text-sm text-muted mt-1 max-w-xl">{workingText} Keep this tab open until it finishes.</p>
            </div>
            <div className="working-bar max-w-xl" aria-hidden="true" />
            <div className="text-sm text-faint tabular-nums">Elapsed {formatElapsed(elapsed)}. Long videos can take several minutes.</div>
          </div>
        ) : (
          <>
            {blocked && (
              <Notice
                tone="warn"
                title={
                  blocked.oembed?.title
                    ? `YouTube is asking for sign-in on "${blocked.oembed.title}"`
                    : "YouTube blocked the download"
                }
                actions={
                  <>
                    <Button variant="primary" size="sm" onClick={() => onOpenSettings("youtube")}>
                      <Cookie className="w-3.5 h-3.5" aria-hidden="true" />
                      Add cookies in Settings
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => {
                        chooseSource("upload");
                        setStep(2);
                      }}
                    >
                      Upload the file instead
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => {
                        chooseSource("sample");
                        setStep(2);
                      }}
                    >
                      Try the sample
                    </Button>
                  </>
                }
              >
                {blocked.detail}
              </Notice>
            )}

            {error && (
              <Notice tone="error" title="Couldn't create the project" onDismiss={() => setError(null)}>
                {error}
              </Notice>
            )}

            {/* STEP 1 */}
            {step === 1 && (
              <div role="radiogroup" aria-label="Where is the video?" className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {SOURCES.map(({ id, label, note, Icon }) => {
                  const active = source === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => chooseSource(id)}
                      className={`text-left rounded-xl border p-4 transition-colors ${
                        active ? "border-accent bg-accent/8 ring-1 ring-accent" : "border-line bg-surface hover:border-line-strong"
                      }`}
                    >
                      <Icon className={`w-5 h-5 mb-3 ${active ? "text-accent" : "text-muted"}`} aria-hidden="true" />
                      <div className="font-semibold text-ink">{label}</div>
                      <div className="text-sm text-muted mt-0.5">{note}</div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* STEP 2 */}
            {step === 2 && source === "youtube" && (
              <div className="space-y-4 max-w-2xl">
                <Field label="YouTube link" htmlFor="yt-url" hint="Public videos work best. Private or age-restricted videos may need cookies in Settings.">
                  <input
                    id="yt-url"
                    type="url"
                    autoFocus
                    value={ytUrl}
                    onChange={(e) => {
                      setYtUrl(e.target.value);
                      setFieldError("");
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        goNext();
                      }
                    }}
                    placeholder="https://www.youtube.com/watch?v=..."
                    aria-invalid={!!fieldError}
                    aria-describedby={fieldError ? "details-error" : undefined}
                    className={inputClass}
                  />
                </Field>
                <details>
                  <summary className="text-sm text-muted hover:text-ink select-none">Add a transcript yourself (for videos without captions)</summary>
                  <textarea
                    rows={4}
                    value={ytTranscript}
                    onChange={(e) => setYtTranscript(e.target.value)}
                    placeholder="Paste plain text, or the contents of an .srt or .vtt file"
                    className={`${inputClass} mt-2`}
                    aria-label="Transcript"
                  />
                </details>
              </div>
            )}

            {step === 2 && source === "upload" && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 max-w-4xl">
                <div>
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragging(true);
                    }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragging(false);
                      pickFile(e.dataTransfer.files?.[0]);
                    }}
                    className={`rounded-xl border-2 border-dashed p-6 text-center transition-colors ${
                      dragging ? "border-accent bg-accent/8" : "border-line-strong bg-surface"
                    }`}
                  >
                    <Upload className="w-7 h-7 mx-auto text-muted" aria-hidden="true" />
                    <div className="mt-2 text-sm font-medium text-ink break-all">{file ? file.name : "Drop a video here"}</div>
                    <div className="text-xs text-faint mt-0.5">
                      {file ? `${(file.size / (1024 * 1024)).toFixed(1)} MB` : "MP4, MOV, WebM or MKV"}
                    </div>
                    <Button className="mt-3" size="sm" onClick={() => fileInputRef.current?.click()}>
                      {file ? "Choose a different file" : "Choose file"}
                    </Button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="video/*,.mp4,.mov,.webm,.mkv,.m4v"
                      onChange={(e) => pickFile(e.target.files?.[0])}
                      className="sr-only"
                      tabIndex={-1}
                      aria-label="Video file"
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <Field label="Project name" htmlFor="up-title" hint="Optional. Defaults to the file name.">
                    <input
                      id="up-title"
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="Founder podcast, episode 14"
                      className={inputClass}
                    />
                  </Field>
                  <details>
                    <summary className="text-sm text-muted hover:text-ink select-none">Add your own captions (optional)</summary>
                    <div className="mt-3 space-y-3">
                      <label className="flex items-center gap-2 px-3 py-2 rounded-lg bg-sunken border border-line text-sm text-muted hover:border-line-strong cursor-pointer">
                        <FileText className="w-4 h-4 text-faint shrink-0" aria-hidden="true" />
                        <span className="truncate">{subFile ? subFile.name : "Choose an .srt or .vtt file"}</span>
                        <input
                          type="file"
                          accept=".srt,.vtt"
                          onChange={(e) => setSubFile(e.target.files?.[0] || null)}
                          className="sr-only"
                        />
                      </label>
                      <textarea
                        rows={3}
                        value={pastedTranscript}
                        onChange={(e) => setPastedTranscript(e.target.value)}
                        placeholder="Or paste a transcript or SRT text"
                        className={inputClass}
                        aria-label="Transcript"
                      />
                    </div>
                  </details>
                </div>
              </div>
            )}

            {step === 2 && source === "sample" && (
              <div role="radiogroup" aria-label="Sample video" className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-3xl">
                {SAMPLES.map((s) => {
                  const active = sample === s.key;
                  return (
                    <button
                      key={s.key}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setSample(s.key)}
                      className={`text-left rounded-xl border p-4 transition-colors ${
                        active ? "border-accent bg-accent/8 ring-1 ring-accent" : "border-line bg-surface hover:border-line-strong"
                      }`}
                    >
                      <div className="text-xs text-muted">{s.meta}</div>
                      <div className="font-display font-bold text-ink mt-1 leading-snug">{s.title}</div>
                      <div className="text-sm text-muted mt-2">{s.note}</div>
                    </button>
                  );
                })}
              </div>
            )}

            {fieldError && step === 2 && (
              <p id="details-error" role="alert" className="text-sm text-bad">
                {fieldError}
              </p>
            )}

            {/* STEP 3 */}
            {step === 3 && (
              <div className="space-y-4 max-w-2xl">
                <dl className="rounded-xl border border-line divide-y divide-line bg-surface text-sm">
                  <div className="flex gap-4 px-4 py-3">
                    <dt className="w-28 shrink-0 text-muted">Source</dt>
                    <dd className="min-w-0 break-words text-ink">
                      {sourceMeta?.label}: {summary}
                    </dd>
                  </div>
                  <div className="flex gap-4 px-4 py-3">
                    <dt className="w-28 shrink-0 text-muted">Captions from</dt>
                    <dd className="min-w-0 text-ink">
                      {hasOwnCaptions || (source === "youtube" && ytTranscript.trim())
                        ? "The transcript you provided."
                        : source === "sample"
                        ? "Built into the sample."
                        : `Subtitles on the video if they exist, otherwise: ${transcriptionPlan(settings)}`}
                    </dd>
                  </div>
                </dl>
                <button
                  type="button"
                  onClick={() => onOpenSettings("engine")}
                  className="text-sm text-accent hover:underline underline-offset-2"
                >
                  Change engine and transcription settings
                </button>
              </div>
            )}

            <div className="flex items-center justify-between gap-3 pt-1">
              <div>
                {step > 1 && (
                  <Button variant="ghost" onClick={goBack}>
                    <ArrowLeft className="w-4 h-4" aria-hidden="true" />
                    Back
                  </Button>
                )}
              </div>
              {step < 3 ? (
                <Button variant="primary" onClick={goNext}>
                  Continue
                  <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </Button>
              ) : (
                <Button variant="primary" size="lg" onClick={start}>
                  Find clips
                </Button>
              )}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
