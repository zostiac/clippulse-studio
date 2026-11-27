import React from "react";
import { formatCaptionWord, getCaptionHighlight, getCaptionBackground } from "../utils/captionStyle.js";

export function collectClipWords(project, clip) {
  const words = [];
  if (!project || !clip) return words;
  for (const seg of project.transcript || []) {
    if (seg.end < clip.start - 0.25 || seg.start > clip.end + 0.25) continue;
    const segWords = seg.words?.length
      ? seg.words
      : String(seg.text || "")
          .split(/\s+/)
          .filter(Boolean)
          .map((word, i, arr) => ({
            word,
            start: seg.start + ((seg.end - seg.start) * i) / Math.max(1, arr.length),
            end: seg.start + ((seg.end - seg.start) * (i + 1)) / Math.max(1, arr.length),
          }));
    for (const w of segWords) {
      if (w.end > clip.start && w.start < clip.end) words.push(w);
    }
  }
  words.sort((a, b) => a.start - b.start);
  return words;
}

export default function CaptionTrack({ project, clip, currentTime, style, words: wordsProp, className = "" }) {
  const words = wordsProp || collectClipWords(project, clip);
  const capStyle = style || clip?.style || {};
  if (!words.length || capStyle.caption_style === "off") return null;

  const perLine = Math.max(1, Math.min(6, capStyle.words_per_line || 3));
  const chunks = [];
  for (let i = 0; i < words.length; i += perLine) chunks.push(words.slice(i, i + perLine));

  let activeChunk = chunks.findLast
    ? chunks.findLast((chunk) => chunk[0].start <= currentTime + 0.08)
    : [...chunks].reverse().find((chunk) => chunk[0].start <= currentTime + 0.08);
  activeChunk = activeChunk || chunks[0];
  const activeWord = activeChunk.find((w) => currentTime >= w.start - 0.05 && currentTime <= w.end + 0.08) || null;

  const highlight = getCaptionHighlight(capStyle);
  const background = getCaptionBackground(capStyle);
  const fontSize = Math.max(12, Math.round((capStyle.font_size || 58) * 0.36));
  const position = capStyle.caption_position || "bottom";
  const posClass =
    position === "top"
      ? "items-start pt-14"
      : position === "middle"
        ? "items-center"
        : "items-end pb-14";

  const bgClass =
    background === "pill"
      ? "bg-black/75 rounded-lg px-3 py-1.5"
      : background === "outline"
        ? "bg-black/55 rounded px-2.5 py-1"
        : "";

  return (
    <div className={`relative z-20 mx-3 flex flex-col ${posClass} ${className}`}>
      <div className={`flex flex-wrap items-center justify-center gap-1.5 text-center ${bgClass}`}>
        {activeChunk.map((w) => {
          const isActive = activeWord && w === activeWord;
          const label = formatCaptionWord(w.word, capStyle);
          if (isActive) {
            return (
              <span
                key={`${w.start}_${w.word}_on`}
                className="caption-pop px-2 py-0.5 rounded font-black tracking-wider uppercase shadow-md"
                style={{
                  fontSize: `${fontSize}px`,
                  lineHeight: 1.15,
                  background: highlight,
                  color: "#131b2e",
                  fontFamily: '"Plus Jakarta Sans Variable", sans-serif',
                }}
              >
                {label}
              </span>
            );
          }
          return (
            <span
              key={`${w.start}_${w.word}`}
              className="font-extrabold tracking-wider uppercase drop-shadow-md"
              style={{
                fontSize: `${fontSize}px`,
                lineHeight: 1.15,
                color: "#ffffff",
                fontFamily: '"Plus Jakarta Sans Variable", sans-serif',
              }}
            >
              {label}
            </span>
          );
        })}
      </div>
    </div>
  );
}
