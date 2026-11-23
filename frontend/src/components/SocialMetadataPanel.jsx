import React, { useState } from "react";
import { Copy, Check, Youtube, Instagram, Music2 } from "lucide-react";

export default function SocialMetadataPanel({ clip, onUpdateMeta }) {
  const [platform, setPlatform] = useState("youtube"); // youtube | instagram | tiktok
  const [copiedKey, setCopiedKey] = useState(null);

  if (!clip) return null;
  const meta = clip.platform_meta || {};

  function copyText(key, text) {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1500);
  }

  const update = (patch) => onUpdateMeta({ ...meta, ...patch });

  return (
    <div className="space-y-4">
      {/* Platform Selector */}
      <div className="grid grid-cols-3 gap-1.5 bg-[#0A0B0F] p-1 rounded-xl border border-white/10">
        {[
          { id: "youtube", label: "YT Shorts", Icon: Youtube, color: "text-rose-400" },
          { id: "instagram", label: "IG Reels", Icon: Instagram, color: "text-fuchsia-400" },
          { id: "tiktok", label: "TikTok", Icon: Music2, color: "text-cyan-400" },
        ].map(({ id, label, Icon, color }) => (
          <button
            key={id}
            onClick={() => setPlatform(id)}
            className={`py-2 px-2 rounded-lg text-[11px] font-semibold flex items-center justify-center gap-1.5 transition ${
              platform === id
                ? "bg-white/10 text-white shadow-sm"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Icon className={`w-3.5 h-3.5 ${color}`} />
            <span>{label}</span>
          </button>
        ))}
      </div>

      {platform === "youtube" && (
        <div className="space-y-3">
          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <label className="text-[11px] font-medium text-slate-400">
                Shorts Title
              </label>
              <button
                onClick={() => copyText("yt_t", meta.youtube_title || "")}
                className="text-[10px] text-cyan-300 hover:text-cyan-200 flex items-center gap-1"
              >
                {copiedKey === "yt_t" ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                {copiedKey === "yt_t" ? "Copied" : "Copy"}
              </button>
            </div>
            <input
              type="text"
              value={meta.youtube_title || ""}
              onChange={(e) => update({ youtube_title: e.target.value })}
              className="w-full px-3 py-2 rounded-xl bg-[#0A0B0F] border border-white/10 text-xs text-white focus:outline-none focus:border-violet-500"
            />
          </div>

          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <label className="text-[11px] font-medium text-slate-400">
                Description
              </label>
              <button
                onClick={() => copyText("yt_d", meta.youtube_description || "")}
                className="text-[10px] text-cyan-300 hover:text-cyan-200 flex items-center gap-1"
              >
                {copiedKey === "yt_d" ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                {copiedKey === "yt_d" ? "Copied" : "Copy"}
              </button>
            </div>
            <textarea
              rows={5}
              value={meta.youtube_description || ""}
              onChange={(e) => update({ youtube_description: e.target.value })}
              className="w-full px-3 py-2 rounded-xl bg-[#0A0B0F] border border-white/10 text-xs text-slate-200 focus:outline-none focus:border-violet-500"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <label className="text-[11px] font-medium text-slate-400">
                Tags
              </label>
              <button
                onClick={() => copyText("yt_tags", (meta.youtube_tags || []).join(", "))}
                className="text-[10px] text-cyan-300 hover:text-cyan-200 flex items-center gap-1"
              >
                {copiedKey === "yt_tags" ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                {copiedKey === "yt_tags" ? "Copied" : "Copy All"}
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(meta.youtube_tags || []).map((tag, i) => (
                <span
                  key={i}
                  className="text-[11px] px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-slate-300"
                >
                  #{tag}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {platform === "instagram" && (
        <div className="space-y-3">
          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <label className="text-[11px] font-medium text-slate-400">
                Reels Caption
              </label>
              <button
                onClick={() =>
                  copyText(
                    "ig",
                    `${meta.instagram_caption || ""}\n\n${(meta.instagram_hashtags || []).join(" ")}`
                  )
                }
                className="text-[10px] text-cyan-300 hover:text-cyan-200 flex items-center gap-1"
              >
                {copiedKey === "ig" ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                {copiedKey === "ig" ? "Copied" : "Copy Caption + Tags"}
              </button>
            </div>
            <textarea
              rows={6}
              value={meta.instagram_caption || ""}
              onChange={(e) => update({ instagram_caption: e.target.value })}
              className="w-full px-3 py-2 rounded-xl bg-[#0A0B0F] border border-white/10 text-xs text-slate-200 focus:outline-none focus:border-fuchsia-500"
            />
          </div>

          <div className="flex flex-wrap gap-1.5">
            {(meta.instagram_hashtags || []).map((tag, i) => (
              <span
                key={i}
                className="text-[11px] px-2 py-0.5 rounded-md bg-fuchsia-500/10 border border-fuchsia-500/25 text-fuchsia-300"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}

      {platform === "tiktok" && (
        <div className="space-y-3">
          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <label className="text-[11px] font-medium text-slate-400">
                TikTok Caption
              </label>
              <button
                onClick={() =>
                  copyText(
                    "tt",
                    `${meta.tiktok_caption || ""}\n\n${(meta.tiktok_hashtags || []).join(" ")}`
                  )
                }
                className="text-[10px] text-cyan-300 hover:text-cyan-200 flex items-center gap-1"
              >
                {copiedKey === "tt" ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                {copiedKey === "tt" ? "Copied" : "Copy Caption + Tags"}
              </button>
            </div>
            <textarea
              rows={4}
              value={meta.tiktok_caption || ""}
              onChange={(e) => update({ tiktok_caption: e.target.value })}
              className="w-full px-3 py-2 rounded-xl bg-[#0A0B0F] border border-white/10 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
            />
          </div>

          <div className="flex flex-wrap gap-1.5">
            {(meta.tiktok_hashtags || []).map((tag, i) => (
              <span
                key={i}
                className="text-[11px] px-2 py-0.5 rounded-md bg-cyan-500/10 border border-cyan-500/25 text-cyan-300"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
