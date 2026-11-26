import React, { useCallback, useRef } from "react";
import { clamp, fmtTC } from "../utils/format.js";

function peaksPath(peaks, width, height, maxBars = 160) {
  const n = peaks.length;
  if (!n) return "";
  const step = Math.max(1, Math.floor(n / maxBars));
  const values = [];
  for (let i = 0; i < n; i += step) {
    const slice = peaks.slice(i, i + step);
    values.push(slice.reduce((a, b) => a + b, 0) / slice.length);
  }
  const barW = width / values.length;
  return values
    .map((v, i) => {
      const h = Math.max(2, v * height);
      const x = i * barW;
      const y = (height - h) / 2;
      return `M${x.toFixed(1)},${y.toFixed(1)}h${Math.max(1, barW * 0.55).toFixed(1)}v${h.toFixed(1)}h${(-Math.max(1, barW * 0.55)).toFixed(1)}z`;
    })
    .join(" ");
}

export default function Waveform({
  energyPeaks = [],
  duration = 0,
  start = 0,
  end = 0,
  currentTime = 0,
  onSeek,
  onTrimStart,
  onTrimEnd,
}) {
  const trackRef = useRef(null);
  const dragging = useRef(null);
  const W = 1000;
  const H = 50;
  const pct = (t) => (duration > 0 ? clamp(t / duration, 0, 1) * 100 : 0);

  const timeAt = useCallback(
    (clientX) => {
      const rect = trackRef.current?.getBoundingClientRect();
      if (!rect || !duration) return 0;
      return clamp((clientX - rect.left) / rect.width, 0, 1) * duration;
    },
    [duration]
  );

  const onPointerDown = (e, mode) => {
    e.preventDefault();
    e.stopPropagation();
    dragging.current = mode;
    e.target.setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e) => {
    const mode = dragging.current;
    if (!mode) return;
    const t = timeAt(e.clientX);
    if (mode === "start") onTrimStart?.(Math.min(t, end - 1.5));
    else if (mode === "end") onTrimEnd?.(Math.max(t, start + 1.5));
  };

  const onPointerUp = () => {
    dragging.current = null;
  };

  const selLeft = pct(start);
  const selRight = pct(end);

  return (
    <div className="flex flex-col gap-1 select-none">
      <div
        ref={trackRef}
        className="relative w-full h-16 bg-surface-container rounded-lg overflow-hidden cursor-crosshair flex items-center px-1"
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onClick={(e) => onSeek?.(timeAt(e.clientX))}
      >
        <svg className="w-full h-12 text-outline-variant" preserveAspectRatio="none" viewBox={`0 0 ${W} ${H}`}>
          <path d={peaksPath(energyPeaks, W, H)} fill="currentColor" opacity="0.7" />
        </svg>

        {/* Selected range */}
        <div
          className="absolute top-0 bottom-0 bg-primary-container/15 rounded border-x-2 border-primary-container flex justify-between items-center px-1"
          style={{ left: `${selLeft}%`, width: `${Math.max(0, selRight - selLeft)}%` }}
        >
          <button
            type="button"
            className="w-1.5 h-6 bg-primary-container rounded-full cursor-ew-resize"
            onPointerDown={(e) => onPointerDown(e, "start")}
            title="Trim start"
          />
          <button
            type="button"
            className="w-1.5 h-6 bg-primary-container rounded-full cursor-ew-resize"
            onPointerDown={(e) => onPointerDown(e, "end")}
            title="Trim end"
          />
        </div>

        {/* Playhead needle */}
        <div className="absolute top-0 bottom-0 w-0.5 bg-primary-container z-20 flex flex-col items-center" style={{ left: `${pct(currentTime)}%` }}>
          <div className="w-3 h-3 bg-primary-container -mt-0.5 rotate-45 shadow-md" />
        </div>
      </div>
      <div className="flex items-center justify-between font-label-sm text-label-sm text-on-surface-variant px-1">
        <span>00:00</span>
        <span className="font-semibold text-on-surface">
          Selection: {fmtTC(start)} → {fmtTC(end)} ({Math.max(0, end - start).toFixed(1)}s)
        </span>
        <span>{fmtTC(duration)}</span>
      </div>
    </div>
  );
}
