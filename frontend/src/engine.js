// Shared description of the AI engine, so the header, the new-project flow and
// Settings always say the same thing.

export const PROVIDERS = [
  {
    id: "local_free",
    label: "Local only",
    badge: "No key needed",
    desc: "Runs on this computer: faster-whisper for speech-to-text, plus audio-energy and hook scoring.",
    defaultModel: "",
    placeholder: "",
    keyUrl: "",
  },
  {
    id: "groq",
    label: "Groq",
    badge: "Free tier",
    desc: "Fast Whisper Large v3 transcription and Llama 3.3 70B for clip picking.",
    defaultModel: "llama-3.3-70b-versatile",
    placeholder: "gsk_...",
    keyUrl: "console.groq.com",
  },
  {
    id: "gemini",
    label: "Google Gemini",
    badge: "Free tier",
    desc: "Gemini Flash picks the clips. Get a key from Google AI Studio.",
    defaultModel: "gemini-2.5-flash",
    placeholder: "AIza...",
    keyUrl: "aistudio.google.com",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    badge: "Free models",
    desc: "Community models whose names end in :free.",
    defaultModel: "meta-llama/llama-3.3-70b-instruct:free",
    placeholder: "sk-or-...",
    keyUrl: "openrouter.ai",
  },
  {
    id: "openai",
    label: "OpenAI",
    badge: "Paid",
    desc: "Whisper transcription and GPT-4o mini. Use this if you already have a key.",
    defaultModel: "gpt-4o-mini",
    placeholder: "sk-...",
    keyUrl: "platform.openai.com",
  },
];

export function providerById(id) {
  return PROVIDERS.find((p) => p.id === id) || PROVIDERS[0];
}

/** True when a cloud provider is selected and a key is saved for it. */
export function usesCloud(settings) {
  return !!settings && settings.ai_provider !== "local_free" && !!settings.has_api_key;
}

export function engineLabel(settings) {
  if (!settings) return "Engine";
  return usesCloud(settings) ? providerById(settings.ai_provider).label : "Local only";
}

/**
 * One plain sentence about where captions will come from when the video has no
 * subtitles. Mirrors the order the backend tries: cloud Whisper (Groq/OpenAI),
 * then local Whisper, otherwise no captions.
 */
export function transcriptionPlan(settings) {
  if (!settings) return "";
  const cloudWhisper = usesCloud(settings) && ["groq", "openai"].includes(settings.ai_provider);
  const model = settings.whisper_model || "tiny";
  if (cloudWhisper && settings.enable_local_whisper) {
    return `${providerById(settings.ai_provider).label} Whisper, with local Whisper (${model}) as backup.`;
  }
  if (cloudWhisper) return `${providerById(settings.ai_provider).label} Whisper.`;
  if (settings.enable_local_whisper) return `Local Whisper (${model}) on this computer.`;
  return "None. Without subtitles, clips are picked from audio energy only and have no captions.";
}

export const CAPTION_STYLES = [
  { value: "hormozi", label: "Hormozi pop", note: "Bold, one word pops at a time" },
  { value: "beast", label: "Beast clean", note: "Large, outlined, high contrast" },
  { value: "minimal", label: "Minimal pill", note: "Small text in a rounded pill" },
  { value: "neon", label: "Neon creator", note: "Glowing colour on dark" },
  { value: "off", label: "No captions", note: "Video only" },
];

export const LAYOUTS = [
  { value: "center_crop", label: "Smart crop", note: "Fills the 9:16 frame, follows the speaker" },
  { value: "blur_fill", label: "Blur fill", note: "Whole 16:9 frame over a blurred backdrop" },
  { value: "split_screen", label: "Split screen", note: "Stacks two speakers or panels" },
];
