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
  { id: "minimal", name: "Minimal Pill", sample: "Clean Pill", badge: "bg-slate-800 text-violet-300 border border-white/15" },
  { id: "neon", name: "Neon Creator", sample: "NEON GLOW", badge: "bg-fuchsia-500 text-white" },
  { id: "off", name: "No Captions", sample: "Off", badge: "bg-white/5 text-slate-400" },
];

export default function EditorControls({ clip, onUpdateStyle, onUpdateTitle }) {
  if (!clip) return null;
  const style = clip.style;

  const set = (patch) => onUpdateStyle({ ...style, ...patch });

  return (
    <div className="space-y-6">
      {/* Clip Title */}
      <div className="space-y-1.5">
        <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          Clip Title
        </label>
        <input
          type="text"
          value={clip.title}
          onChange={(e) => onUpdateTitle(e.target.value)}
          className="w-full px-3 py-2 rounded-xl bg-[#0A0B0F] border border-white/10 text-xs text-white focus:outline-none focus:border-violet-500"
        />
      </div>

      {/* Framing Layout */}
      <div className="space-y-2">
        <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400">
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
                    ? "bg-violet-500/15 border-violet-500 text-white"
                    : "bg-[#0A0B0F] border-white/10 text-slate-400 hover:border-white/25 hover:text-slate-200"
                }`}
              >
                <Icon className={`w-4 h-4 ${active ? "text-violet-300" : "text-slate-400"}`} />
                <span className="text-[11px] font-semibold leading-tight">{label}</span>
                <span className="text-[9px] text-slate-500 leading-tight">{desc}</span>
              </button>
            );
          })}
        </div>

        {style.layout === "center_crop" && (
          <div className="pt-2 space-y-1.5">
            <div className="flex justify-between text-[11px] text-slate-400">
              <span>Horizontal Speaker Focus (Pan)</span>
              <span className="font-mono text-slate-200">
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
              className="w-full accent-violet-500"
            />
            <div className="flex justify-between text-[10px] text-slate-500">
              <button type="button" onClick={() => set({ pan_x: -0.6 })} className="hover:text-white">
                Left Speaker
              </button>
              <button type="button" onClick={() => set({ pan_x: 0 })} className="hover:text-white">
                Center
              </button>
              <button type="button" onClick={() => set({ pan_x: 0.6 })} className="hover:text-white">
                Right Speaker
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Caption Presets */}
      <div className="space-y-2.5">
        <div className="flex items-center gap-1.5">
          <Type className="w-3.5 h-3.5 text-cyan-400" />
          <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
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
                    ? "bg-violet-500/15 border-violet-500"
                    : "bg-[#0A0B0F] border-white/10 hover:border-white/25"
                }`}
              >
                <span className={`inline-block text-[10px] font-black px-2 py-0.5 rounded ${p.badge}`}>
                  {p.sample}
                </span>
                <div className="text-[11px] font-medium text-slate-200">{p.name}</div>
              </button>
            );
          })}
        </div>

        {style.caption_style !== "off" && (
          <div className="p-3 rounded-xl bg-[#0A0B0F] border border-white/10 space-y-3">
            {/* Position */}
            <div className="space-y-1">
              <span className="text-[11px] text-slate-400">Vertical Position</span>
              <div className="grid grid-cols-3 gap-1.5">
                {["top", "middle", "bottom"].map((pos) => (
                  <button
                    key={pos}
                    type="button"
                    onClick={() => set({ caption_position: pos })}
                    className={`py-1.5 rounded-lg text-[11px] capitalize font-medium transition ${
                      style.caption_position === pos
                        ? "bg-violet-600 text-white"
                        : "bg-white/5 text-slate-400 hover:text-white"
                    }`}
                  >
                    {pos}
                  </button>
                ))}
              </div>
            </div>

            {/* Font size */}
            <div className="space-y-1">
              <div className="flex justify-between text-[11px] text-slate-400">
                <span>Font Size</span>
                <span className="font-mono text-slate-200">{style.font_size}px</span>
              </div>
              <input
                type="range"
                min="38"
                max="80"
                step="2"
                value={style.font_size || 58}
                onChange={(e) => set({ font_size: parseInt(e.target.value, 10) })}
                className="w-full accent-cyan-400"
              />
            </div>

            {/* Words per line */}
            <div className="space-y-1">
              <div className="flex justify-between text-[11px] text-slate-400">
                <span>Words Per Line</span>
                <span className="font-mono text-slate-200">{style.words_per_line} words</span>
              </div>
              <input
                type="range"
                min="2"
                max="5"
                step="1"
                value={style.words_per_line || 3}
                onChange={(e) => set({ words_per_line: parseInt(e.target.value, 10) })}
                className="w-full accent-violet-500"
              />
            </div>
          </div>
        )}
      </div>

      {/* Top Hook Banner */}
      <div className="space-y-2 p-3 rounded-xl bg-[#0A0B0F] border border-white/10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-xs font-semibold text-slate-200">
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
            <div className="w-8 h-4 bg-slate-700 peer-checked:bg-violet-600 rounded-full relative after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:w-3 after:h-3 after:bg-white after:rounded-full after:transition-all peer-checked:after:translate-x-4" />
          </label>
        </div>

        {style.show_hook_banner && (
          <input
            type="text"
            value={style.hook_banner_text || ""}
            onChange={(e) => set({ hook_banner_text: e.target.value })}
            placeholder="TOP HOOK HEADLINE..."
            className="w-full px-2.5 py-1.5 rounded-lg bg-[#12141D] border border-white/10 text-xs font-semibold text-white placeholder:text-slate-600 focus:outline-none focus:border-violet-500"
          />
        )}
      </div>
    </div>
  );
}
