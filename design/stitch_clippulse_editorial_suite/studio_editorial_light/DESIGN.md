---
name: Studio Editorial Light
colors:
  surface: '#faf8ff'
  surface-dim: '#d2d9f4'
  surface-bright: '#faf8ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f2f3ff'
  surface-container: '#eaedff'
  surface-container-high: '#e2e7ff'
  surface-container-highest: '#dae2fd'
  on-surface: '#131b2e'
  on-surface-variant: '#564338'
  inverse-surface: '#283044'
  inverse-on-surface: '#eef0ff'
  outline: '#897267'
  outline-variant: '#ddc1b3'
  surface-tint: '#9b4500'
  primary: '#903f00'
  on-primary: '#ffffff'
  primary-container: '#b45309'
  on-primary-container: '#fff1eb'
  inverse-primary: '#ffb68e'
  secondary: '#4b41e1'
  on-secondary: '#ffffff'
  secondary-container: '#645efb'
  on-secondary-container: '#fffbff'
  tertiary: '#00625a'
  on-tertiary: '#ffffff'
  tertiary-container: '#007d73'
  on-tertiary-container: '#c5fff5'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#ffdbca'
  primary-fixed-dim: '#ffb68e'
  on-primary-fixed: '#331200'
  on-primary-fixed-variant: '#763300'
  secondary-fixed: '#e2dfff'
  secondary-fixed-dim: '#c3c0ff'
  on-secondary-fixed: '#0f0069'
  on-secondary-fixed-variant: '#3323cc'
  tertiary-fixed: '#89f5e7'
  tertiary-fixed-dim: '#6bd8cb'
  on-tertiary-fixed: '#00201d'
  on-tertiary-fixed-variant: '#005049'
  background: '#faf8ff'
  on-background: '#131b2e'
  surface-variant: '#dae2fd'
typography:
  display-lg:
    fontFamily: Playfair Display
    fontSize: 48px
    fontWeight: '600'
    lineHeight: 56px
    letterSpacing: -0.02em
  display-lg-mobile:
    fontFamily: Playfair Display
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-lg:
    fontFamily: Playfair Display
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Playfair Display
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  headline-md:
    fontFamily: Playfair Display
    fontSize: 24px
    fontWeight: '500'
    lineHeight: 32px
  headline-sm:
    fontFamily: Playfair Display
    fontSize: 20px
    fontWeight: '500'
    lineHeight: 28px
  body-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 26px
  body-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 22px
  body-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 18px
  label-lg:
    fontFamily: JetBrains Mono
    fontSize: 13px
    fontWeight: '500'
    lineHeight: 18px
    letterSpacing: -0.01em
  label-md:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.02em
  label-sm:
    fontFamily: JetBrains Mono
    fontSize: 10px
    fontWeight: '500'
    lineHeight: 14px
    letterSpacing: 0.04em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-lg: 1.5rem
  margin: 1.5rem
  margin-sm: 1rem
  margin-lg: 2.5rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2.5rem
---

## Brand & Style
This design system defines an elite, luminous SaaS environment tailored for professional video directors, editorial essayists, and creative technologists. It bridges high-culture editorial publishing with precision production tooling. 

The aesthetic is Modern Editorial Tactile: pristine gallery light, hyper-sharp hairline segmentation, warm porcelain ground planes, and typographic tension between literary serifs and technical monospace metrics. The UI prioritizes visual silence so rich media takes primary focus, punctuated only by deliberate amber playhead accents and electric indigo state indicators.

## Colors
The palette balances classical publishing warmth with technical studio rigor.

- **Primary (`#B45309` - Burnished Amber):** Represents timeline needles, active curation states, keyframes, and primary call-to-actions.
- **Secondary (`#4F46E5` - Electric Indigo):** Reserved for video render operations, playback tags, clip markers, and focused metadata inputs.
- **Tertiary (`#0D9488` - Deep Teal):** Used strictly for verified exports, audio channel health, and published status indicators.
- **Neutral (`#0F172A` - Ink Slate):** Provides high-contrast typography across crisp off-white containers.

### Surface Tiers & Hairline Hierarchy
- Canvas Ground: `#F8F9FA` (Warm Alabaster)
- Panel & Container Surfaces: `#FFFFFF` (Pristine White) and `#F1F3F5` (Cool Mist)
- Recessed Inspector/Track Wells: `#E9ECEF`
- Hairline Boundaries: `#E2E8F0` for interior element dividers; `#CBD5E1` for major window docking viewports.
- Body Copy & Muted Meta: `#1E293B` for high-clarity reading; `#64748B` for timecodes, secondary labels, and dormant metadata.

## Typography
Typographic rhythm sets the intellectual baseline of the studio suite. 

- **Headlines & Article Curations:** Rendered in **Playfair Display**. Headings embody literary stature, long-form editorial gravitas, and project titling.
- **Narrative Copy & Standard Controls:** Rendered in **Plus Jakarta Sans**. Balanced, highly legible geometry prevents eye fatigue across expansive script panels and metadata sidebars.
- **Metrics, Timecodes & Timeline Ticks:** Rendered in **JetBrains Mono**. All frame indices (`00:04:12:08`), sample rates, file specs, and shortcut cues must utilize tabular numbers and strictly fixed glyph widths.

## Layout & Spacing
The layout model employs a fluid multi-dock grid engineered for high-density production work.

- **Desktop (>=1280px):** 12-column dynamic workbench with modular dockable sidebars (fixed 320px inspector, fluid canvas/preview stage, and variable-height timeline dock spanning 100% viewport width). Gutters maintain `1rem` rhythm to conserve editing surface.
- **Tablet (768px - 1279px):** Inspector transitions into an off-canvas drawer; timeline locks to horizontal scroll with fixed 64px audio/video track heads.
- **Mobile (<768px):** Single-column stacked preview and transport controls; timecode bars adhere to safe-area bottoms with touch targets optimized to 44px minimum.
- Spacing follows an absolute 4px/8px modular base. Compact gaps (`space-xs`, `space-sm`) define inspector controls and transport clusters, while editorial long-reads take `space-xl` margins.

## Elevation & Depth
This design system avoids dark or muddy drop-shadows. Depth is articulated through pristine surface stacking, ultra-fine hairline dividers, and ambient micro-glows:

- **Level 0 (Recessed/Tracks):** `#E9ECEF` surface with a 1px inner hairline `inset 0 1px 2px rgba(15, 23, 42, 0.05)`.
- **Level 1 (Base Viewport Canvas):** `#F8F9FA` base with clean zero-shadow plane separation.
- **Level 2 (Active Studio Cards & Floating Palettes):** `#FFFFFF` surface bordered with 1px `#E2E8F0` and an ambient diffuse shadow: `0 4px 20px -2px rgba(15, 23, 42, 0.04), 0 2px 6px -1px rgba(15, 23, 42, 0.02)`.
- **Level 3 (Modals, Playhead Overlays & Context Menus):** Pristine white backed by a subtle slate glaze (`rgba(248, 249, 250, 0.85)` backdrop blur of 12px), bordered with `#CBD5E1`, elevated via `0 20px 32px -8px rgba(15, 23, 42, 0.08), 0 8px 16px -4px rgba(15, 23, 42, 0.04)`.

## Shapes
A disciplined, architectural shape scale (`roundedness: 1`) preserves technical precision:

- **Core Elements (Inputs, Buttons, Cells):** `0.25rem` (4px). Matches the sharp precision of cutting desks and hardware consoles.
- **Panels & Timeline Frames:** `rounded-lg` (`0.5rem` / 8px) for primary preview windows and container blocks.
- **Floating Modals & Flyout Sheets:** `rounded-xl` (`0.75rem` / 12px).
- **Video Scrubbers & Status Badges:** Fully circular (`rounded-full`) only for scrub handles, record heads, and presence indicators.

## Components

### Buttons
- **Primary Studio Action:** Deep burnished amber (`#B45309`) background with crisp white typography. Hover transitions to `#92400E` with micro 1px translateY compression.
- **Secondary / Studio Tool:** `#FFFFFF` background, 1px `#E2E8F0` border, `#0F172A` label. Hover brings a border shift to `#CBD5E1` and subtle tint `#F1F3F5`.
- **Transport / Ghost:** Unbordered with muted slate icons (`#64748B`), brightening to `#0F172A` on hover with a 4px soft mist highlight.

### Chips & Metadata Badges
- **Timecode & Frame Chips:** Fixed JetBrains Mono `label-md` inside `#F1F3F5` base, 1px `#E2E8F0` border, `#1E293B` text.
- **Marker Tags (Video Markers):** 
  - Indigo Marker: Soft indigo tint `#EEF2FF` with `#4F46E5` hairline border and text.
  - Amber Marker: Soft ochre tint `#FEF3C7` with `#B45309` hairline border and text.

### Form Inputs & Timecode Fields
- **Input Fields:** Crisp `#FFFFFF` surface, 1px `#CBD5E1` border, `0.25rem` radius. Placeholder text in `#94A3B8`. Focus state shifts the border to `#4F46E5` with an ultra-thin 2px ring at 15% opacity (`rgba(79, 70, 229, 0.15)`).
- **Scrubbable Numeric Fields:** Monospace numeric readout with cursor horizontal-resize indicators and subtle drag highlight.

### Selection Controls (Checkbox & Radio)
- Square-profile checkboxes (4px radius) and circular radio points. Inactive state has `#CBD5E1` 1.5px border on white. Active state triggers solid `#0F172A` or `#B45309` fill with an optical white check/dot.

### Cards & Track Assets
- **Media Asset Card:** Surface `#FFFFFF` encased in a 1px `#E2E8F0` border. Poster frame image bounded by a sharp `0.25rem` radius with bottom timecode overlay chip. Active selection displays a solid 2px outline in burnished amber (`#B45309`).
- **Timeline Strip:** Recessed `#F1F3F5` lane with `#E2E8F0` track dividers, rendered waveform graphics in `#64748B`, and interactive slice cuts denoted by 1px white incisions.

### Transport Bar & Playhead
- Precision transport bar containing centered play/pause, step-frame forwards/backwards, and audio decibel meters. The scrubber playhead is anchored by a vertical 1px needle in `#B45309` topped with an inverted pentagon indicator.