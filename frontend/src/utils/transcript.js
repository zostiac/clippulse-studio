export function distributeWords(text, start, end) {
  const tokens = String(text ?? "").split(/\s+/).filter(Boolean);
  if (!tokens.length) return [];

  const duration = Math.max(0, Number(end) - Number(start));
  if (!Number.isFinite(duration) || !Number.isFinite(Number(start)) || duration <= 0) {
    return [];
  }

  const step = duration / tokens.length;
  return tokens.map((word, index) => ({
    word,
    start: Number(start) + index * step,
    end: index === tokens.length - 1 ? Number(end) : Number(start) + (index + 1) * step,
  }));
}
