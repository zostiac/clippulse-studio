// Pure copy-generation helpers for the Social Distribution Kit.
// Deterministic template variants — no network required.

const CURATED = {
  curiosity: [
    "Why {seed} is secretly the most important thing you never hear about",
    "The {seed} story nobody is telling you (it changes everything)",
    "What everyone gets wrong about {seed}",
  ],
  contrarian: [
    "Stop doing this with {seed} (do this instead)",
    "The truth about {seed} nobody admits",
    "{seed}: the advice everyone repeats that is simply wrong",
  ],
  educational: [
    "How {seed} actually works, in under 60 seconds",
    "{seed}, explained in three sentences",
    "The exact {seed} playbook that works right now",
  ],
};

export function titleSeeds(clip, project) {
  const base = String(clip?.title || "this clip")
    .replace(/^"|"$/g, "")
    .replace(/\s*\(.*?\)\s*/g, " ")
    .trim();
  const stop = new Set([
    "why", "how", "what", "when", "where", "who", "which", "the", "and", "but", "for", "with",
    "that", "this", "these", "those", "from", "into", "your", "you", "our", "are", "was", "were",
    "been", "being", "have", "has", "had", "does", "did", "will", "would", "should", "can",
    "could", "just", "than", "then", "them", "they", "about", "actually", "literally",
  ]);
  const words = base
    .split(/\s+/)
    .map((w) => w.replace(/^[^\w%$]+|[^\w%$!?.,]+$/g, ""))
    .filter((w) => w.length > 2 && !stop.has(w.toLowerCase()));
  const seed = words.slice(0, 4).join(" ") || project?.title || "this video";
  return seed.toLowerCase();
}

function fillVariants(templates, seed) {
  return templates.map((t) => {
    const out = t.replace(/\{seed\}/g, seed);
    return out.charAt(0).toUpperCase() + out.slice(1);
  });
}

export function generateTitleVariants(clip, project, round = 0, count = 3) {
  const seed = titleSeeds(clip, project);
  const groups = [CURATED.curiosity, CURATED.contrarian, CURATED.educational];
  const out = [];
  for (let i = 0; i < count; i += 1) {
    const group = groups[(round + i) % groups.length];
    out.push(fillVariants(group, seed)[(round + i) % group.length]);
  }
  // Deduplicate while keeping order
  return [...new Set(out)];
}

export function titleViralityScore(variant, clip) {
  const base = clip?.viral_score ?? 85;
  const lenBonus = variant.length <= 70 ? 4 : 0;
  const questionBonus = /\?/.test(variant) ? 2 : 0;
  const numberBonus = /\d/.test(variant) ? 3 : 0;
  return Math.min(99, base + lenBonus + questionBonus + numberBonus - 2);
}

export function ctrEstimate(score) {
  return `${Math.max(4.2, Math.min(18.9, (score - 55) * 0.32)).toFixed(1)}%`;
}

export function buildDescription(clip, project) {
  const title = String(clip?.title || "This clip").replace(/^"|"$/g, "");
  const reason = String(clip?.reason || "").trim();
  const dur = Math.max(1, Math.round((clip?.end || 0) - (clip?.start || 0)));
  const chapters = [
    `0:00 - ${title.split(/\s+/).slice(0, 5).join(" ")}`,
    `0:${String(Math.min(59, Math.round(dur / 3))).padStart(2, "0")} - The Key Insight`,
    `0:${String(Math.min(59, Math.round((dur * 2) / 3))).padStart(2, "0")} - The Takeaway`,
  ].join("\n");
  const tags = (clip?.platform_meta?.youtube_tags || []).slice(0, 5).map((t) => `#${String(t).replace(/^#/, "")}`);
  return [
    `${title}.`,
    reason ? `\n${reason}.` : "",
    `\nIn this clip: ${project?.title || "our latest breakdown"}.`,
    `\n⏱️ Chapters:\n${chapters}`,
    "\n🔔 Subscribe for daily viral breakdowns.",
    tags.length ? `\n${tags.join(" ")}` : "",
  ]
    .filter(Boolean)
    .join("");
}

export function suggestTags(clip, project) {
  const words = `${clip?.title || ""} ${project?.title || ""}`
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .map((w) => w.toLowerCase());
  const seen = new Set();
  const core = [];
  for (const w of words) {
    if (!seen.has(w)) {
      seen.add(w);
      core.push(w);
    }
    if (core.length >= 4) break;
  }
  return {
    core: core.map((w) => `#${w}`),
    virality: ["#shorts", "#contentcreator", "#viral", "#reels", "#tiktokgrowth", "#fyp"],
  };
}

export function chapterizeDescription(existing, clip) {
  if (!existing) return buildDescription(clip, null);
  return existing;
}
