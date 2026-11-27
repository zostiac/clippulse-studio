const PRESET_HIGHLIGHTS = {
  hormozi: "#FACC15",
  beast: "#22D3EE",
  minimal: "#F8FAFC",
  neon: "#E879F9",
};

const CUSTOM_HIGHLIGHTS = {
  yellow: "#FACC15",
  cyan: "#22D3EE",
  amber: "#F59E0B",
  green: "#34D399",
  white: "#FFFFFF",
};

export function formatCaptionWord(word, style = {}) {
  const value = String(word ?? "");
  const mode = style.caption_case || "style";
  if (mode === "uppercase" || (mode === "style" && style.caption_style !== "minimal")) {
    return value.toUpperCase();
  }
  if (mode === "lowercase") return value.toLowerCase();
  return value;
}

export function getCaptionHighlight(style = {}) {
  const custom = style.caption_highlight;
  return custom && custom !== "style"
    ? CUSTOM_HIGHLIGHTS[custom] || "#FACC15"
    : PRESET_HIGHLIGHTS[style.caption_style] || "#FACC15";
}

export function getCaptionBackground(style = {}) {
  const background = style.caption_background || "style";
  return background === "style"
    ? (style.caption_style === "minimal" ? "pill" : "outline")
    : background;
}
