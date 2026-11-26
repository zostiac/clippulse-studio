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
      <div className="grid grid-cols-3 gap-1.5 bg-sunken p-1 rounded-xl border border-line">
        {[
          { id: "youtube", label: "YT Shorts", Icon: Youtube, color: "text-bad" },
          { id: "instagram", label: "IG Reels", Icon: Instagram, color: "text-accent" },
          { id: "tiktok", label: "TikTok", Icon: Music2, color: "text-accent" },
        ].map(({ id, label, Icon, color }) => (
          <button
            key={id}
            onClick={() => setPlatform(id)}
            className={`py-2 px-2 rounded-lg text-[11px] font-semibold flex items-center justify-center gap-1.5 transition ${
              platform === id
                ? "bg-ink/10 text-ink shadow-sm"
                : "text-muted hover:text-ink"
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
              <label className="text-[11px] font-medium text-muted">
                Shorts Title
              </label>
              <button
                onClick={() => copyText("yt_t", meta.youtube_title || "")}
                className="text-[10px] text-accent hover:text-accent-hover flex items-center gap-1"
              >
                {copiedKey === "yt_t" ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                {copiedKey === "yt_t" ? "Copied" : "Copy"}
              </button>
            </div>
            <input
              type="text"
              value={meta.youtube_title || ""}
              onChange={(e) => update({ youtube_title: e.target.value })}
              className="w-full px-3 py-2 rounded-xl bg-sunken border border-line text-xs text-ink focus:outline-none focus:border-accent"
            />
          </div>

          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <label className="text-[11px] font-medium text-muted">
                Description
              </label>
              <button
                onClick={() => copyText("yt_d", meta.youtube_description || "")}
                className="text-[10px] text-accent hover:text-accent-hover flex items-center gap-1"
              >
                {copiedKey === "yt_d" ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                {copiedKey === "yt_d" ? "Copied" : "Copy"}
              </button>
            </div>
            <textarea
              rows={5}
              value={meta.youtube_description || ""}
              onChange={(e) => update({ youtube_description: e.target.value })}
              className="w-full px-3 py-2 rounded-xl bg-sunken border border-line text-xs text-ink focus:outline-none focus:border-accent"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <label className="text-[11px] font-medium text-muted">
                Tags
              </label>
              <button
                onClick={() => copyText("yt_tags", (meta.youtube_tags || []).join(", "))}
                className="text-[10px] text-accent hover:text-accent-hover flex items-center gap-1"
              >
                {copiedKey === "yt_tags" ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                {copiedKey === "yt_tags" ? "Copied" : "Copy All"}
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(meta.youtube_tags || []).map((tag, i) => (
                <span
                  key={i}
                  className="text-[11px] px-2 py-0.5 rounded-md bg-ink/5 border border-line text-muted"
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
              <label className="text-[11px] font-medium text-muted">
                Reels Caption
              </label>
              <button
                onClick={() =>
                  copyText(
                    "ig",
                    `${meta.instagram_caption || ""}\n\n${(meta.instagram_hashtags || []).join(" ")}`
                  )
                }
                className="text-[10px] text-accent hover:text-accent-hover flex items-center gap-1"
              >
                {copiedKey === "ig" ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                {copiedKey === "ig" ? "Copied" : "Copy Caption + Tags"}
              </button>
            </div>
            <textarea
              rows={6}
              value={meta.instagram_caption || ""}
              onChange={(e) => update({ instagram_caption: e.target.value })}
              className="w-full px-3 py-2 rounded-xl bg-sunken border border-line text-xs text-ink focus:outline-none focus:border-accent"
            />
          </div>

          <div className="flex flex-wrap gap-1.5">
            {(meta.instagram_hashtags || []).map((tag, i) => (
              <span
                key={i}
                className="text-[11px] px-2 py-0.5 rounded-md bg-accent/10 border border-accent/25 text-accent"
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
              <label className="text-[11px] font-medium text-muted">
                TikTok Caption
              </label>
              <button
                onClick={() =>
                  copyText(
                    "tt",
                    `${meta.tiktok_caption || ""}\n\n${(meta.tiktok_hashtags || []).join(" ")}`
                  )
                }
                className="text-[10px] text-accent hover:text-accent-hover flex items-center gap-1"
              >
                {copiedKey === "tt" ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                {copiedKey === "tt" ? "Copied" : "Copy Caption + Tags"}
              </button>
            </div>
            <textarea
              rows={4}
              value={meta.tiktok_caption || ""}
              onChange={(e) => update({ tiktok_caption: e.target.value })}
              className="w-full px-3 py-2 rounded-xl bg-sunken border border-line text-xs text-ink focus:outline-none focus:border-accent"
            />
          </div>

          <div className="flex flex-wrap gap-1.5">
            {(meta.tiktok_hashtags || []).map((tag, i) => (
              <span
                key={i}
                className="text-[11px] px-2 py-0.5 rounded-md bg-accent/10 border border-accent/25 text-accent"
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
