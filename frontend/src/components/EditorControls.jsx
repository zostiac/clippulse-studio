import React from "react";
import { Maximize2, Columns2, RectangleVertical, Type, Sparkles } from "lucide-react";

const LAYOUTS = [
  {
    id: "center_crop",
    label: "Smart 9:16",
    desc: "Full-bleed vertical crop",
    Icon: RectangleVertical,
  },
  {
    id: "blur_fill",
    label: "Blur-Fill",
    desc: "16:9 over blurred backdrop",
    Icon: Maximize2,
  },
  {
    id: "split_screen",
    label: "Split Screen",
    desc: "Host top + Guest bottom",
    Icon: Columns2,
  },
];

const CAPTION_PRESETS = [
  { id: "hormozi", name: "Hormozi Pop", sample: "WORD POP", badge: "bg-yellow-400 text-black" },
  { id: "beast", name: "Beast Clean", sample: "CRISP CYAN", badge: "bg-cyan-400 text-black" },
  { id: "minimal", name: "Minimal Pill", sample: "Clean Pill", badge: "bg-slate-800 text-white border border-white/20" },
  { id: "neon", name: "Neon Creator", sample: "NEON GLOW", badge: "bg-fuchsia-500 text-white" },
  { id: "off", name: "No Captions", sample: "Off", badge: "bg-ink/5 text-muted" },
];

export default function EditorControls({ clip, onUpdateStyle, onUpdateTitle }) {
  if (!clip) return null;
  const style = clip.style;

  const set = (patch) => onUpdateStyle({ ...style, ...patch });

  return (
    <div className="space-y-6">
      {/* Clip Title */}
      <div className="space-y-1.5">
        <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted">
          Clip Title
        </label>
        <input
          type="text"
          value={clip.title}
          onChange={(e) => onUpdateTitle(e.target.value)}
          className="w-full px-3 py-2 rounded-xl bg-sunken border border-line text-xs text-ink focus:outline-none focus:border-accent"
        />
      </div>

      {/* Framing Layout */}
      <div className="space-y-2">
        <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted">
          9:16 Aspect Layout
        </label>
        <div className="grid grid-cols-3 gap-2">
          {LAYOUTS.map(({ id, label, desc, Icon }) => {
            const active = style.layout === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => set({ layout: id })}
                className={`p-2.5 rounded-xl border text-left transition flex flex-col gap-1 ${
                  active
                    ? "bg-accent/15 border-accent text-ink"
                    : "bg-sunken border-line text-muted hover:border-line-strong hover:text-ink"
                }`}
              >
                <Icon className={`w-4 h-4 ${active ? "text-accent" : "text-muted"}`} />
                <span className="text-[11px] font-semibold leading-tight">{label}</span>
                <span className="text-[9px] text-faint leading-tight">{desc}</span>
              </button>
            );
          })}
        </div>

        {style.layout === "center_crop" && (
          <div className="pt-2 space-y-1.5">
            <div className="flex justify-between text-[11px] text-muted">
              <span>Horizontal Speaker Focus (Pan)</span>
              <span className="tabular-nums text-ink">
                {style.pan_x < -0.15
                  ? "Left"
                  : style.pan_x > 0.15
                  ? "Right"
                  : "Center"}{" "}
                ({Math.round((style.pan_x || 0) * 100)}%)
              </span>
            </div>
            <input
              type="range"
              min="-1"
              max="1"
              step="0.05"
              value={style.pan_x || 0}
              onChange={(e) => set({ pan_x: parseFloat(e.target.value) })}
              className="w-full accent-accent"
            />
            <div className="flex justify-between text-[10px] text-faint">
              <button type="button" onClick={() => set({ pan_x: -0.6 })} className="hover:text-ink">
                Left Speaker
              </button>
              <button type="button" onClick={() => set({ pan_x: 0 })} className="hover:text-ink">
                Center
              </button>
              <button type="button" onClick={() => set({ pan_x: 0.6 })} className="hover:text-ink">
                Right Speaker
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Caption Presets */}
      <div className="space-y-2.5">
        <div className="flex items-center gap-1.5">
          <Type className="w-3.5 h-3.5 text-accent" />
          <label className="text-[11px] font-semibold uppercase tracking-wider text-muted">
            Animated Word Captions
          </label>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {CAPTION_PRESETS.map((p) => {
            const active = style.caption_style === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => set({ caption_style: p.id })}
                className={`p-2.5 rounded-xl border text-left transition space-y-1.5 ${
                  active
                    ? "bg-accent/15 border-accent"
                    : "bg-sunken border-line hover:border-line-strong"
                }`}
              >
                <span className={`inline-block text-[10px] font-black px-2 py-0.5 rounded ${p.badge}`}>
                  {p.sample}
                </span>
                <div className="text-[11px] font-medium text-ink">{p.name}</div>
              </button>
            );
          })}
        </div>

        {style.caption_style !== "off" && (
          <div className="p-3 rounded-xl bg-sunken border border-line space-y-3">
            {/* Position */}
            <div className="space-y-1">
              <span className="text-[11px] text-muted">Vertical Position</span>
              <div className="grid grid-cols-3 gap-1.5">
                {["top", "middle", "bottom"].map((pos) => (
                  <button
                    key={pos}
                    type="button"
                    onClick={() => set({ caption_position: pos })}
                    className={`py-1.5 rounded-lg text-[11px] capitalize font-medium transition ${
                      style.caption_position === pos
                        ? "bg-accent text-on-accent"
                        : "bg-ink/5 text-muted hover:text-ink"
                    }`}
                  >
                    {pos}
                  </button>
                ))}
              </div>
            </div>

            {/* Font size */}
            <div className="space-y-1">
              <div className="flex justify-between text-[11px] text-muted">
                <span>Font Size</span>
                <span className="tabular-nums text-ink">{style.font_size}px</span>
              </div>
              <input
                type="range"
                min="38"
                max="80"
                step="2"
                value={style.font_size || 58}
                onChange={(e) => set({ font_size: parseInt(e.target.value, 10) })}
                className="w-full accent-accent"
              />
            </div>

            {/* Words per line */}
            <div className="space-y-1">
              <div className="flex justify-between text-[11px] text-muted">
                <span>Words Per Line</span>
                <span className="tabular-nums text-ink">{style.words_per_line} words</span>
              </div>
              <input
                type="range"
                min="2"
                max="5"
                step="1"
                value={style.words_per_line || 3}
                onChange={(e) => set({ words_per_line: parseInt(e.target.value, 10) })}
                className="w-full accent-accent"
              />
            </div>
          </div>
        )}
      </div>

      {/* Top Hook Banner */}
      <div className="space-y-2 p-3 rounded-xl bg-sunken border border-line">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-warn" />
            <span className="text-xs font-semibold text-ink">
              3-Sec Top Hook Banner
            </span>
          </div>
          <label className="inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={!!style.show_hook_banner}
              onChange={(e) => set({ show_hook_banner: e.target.checked })}
              className="sr-only peer"
            />
            <div className="w-8 h-4 bg-ink/20 peer-checked:bg-accent rounded-full relative after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:w-3 after:h-3 after:bg-on-accent after:rounded-full after:transition-all peer-checked:after:translate-x-4" />
          </label>
        </div>

        {style.show_hook_banner && (
          <input
            type="text"
            value={style.hook_banner_text || ""}
            onChange={(e) => set({ hook_banner_text: e.target.value })}
            placeholder="TOP HOOK HEADLINE..."
            className="w-full px-2.5 py-1.5 rounded-lg bg-raised border border-line text-xs font-semibold text-ink placeholder:text-faint focus:outline-none focus:border-accent"
          />
        )}
      </div>
    </div>
  );
}
