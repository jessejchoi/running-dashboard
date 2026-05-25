# Design System — RunDash · PULSE

## Product Context
- **What this is:** Personal running performance dashboard connected to Strava
- **Who it's for:** Jesse — training for 3 races in 2026 (5K, 10K, Half Marathon) + close friends in shared training groups
- **Space/industry:** Sports performance, personal analytics
- **Project type:** Data-dense web app + PWA (installed to home screen)

---

## Aesthetic Direction
- **Direction:** **Pulse** — brutalist club poster meets running app, tuned for low-glare daily use
- **Decoration level:** Loud in structure, restrained in emission — every visual choice is signal, but signal color is rationed. Hard edges, no rounded corners on cards or buttons, ever. Type does the heavy lifting; neon is an accent, not a floodlight.
- **Mood:** A running app with track-club confidence, not arcade glare. Less Strava, more late-night training board. Numbers should feel like signage, but the screen must stay readable in long sessions.
- **What this is not:** wellness, hygge, soft pastels, friendly emoji, motivational poster energy.

---

## Layout
- **Approach:** Bento grid — asymmetric, size = importance — unchanged from previous direction
- **Desktop grid:** 12-column, **gap 14px** (slightly larger to feel less crammed against hard edges), max content width 1280px
- **Mobile grid:** 2-column (key stats `span 12`, small stats `span 6`), gap 10px, page padding 16px
- **Card placement examples:** Weekly mileage → large (7 col); 2×2 stat grid (5 col); race estimates → full width (12 col); goals + group → equal halves (6 col each)
- **Card chrome:** Every metric card has a **3px top stripe** in its semantic accent — magenta (primary), acid (positive), ice (informational). The stripe replaces glow as the way "this matters" is communicated.
- **Card index numbers:** Top-right of every metric card carries a mono index in brackets — `[01]`, `[02]` — like spec sheet entries.
- **Glass:** **Removed.** Pulse is opaque. Top bar uses solid `--ink-1` with a 3px magenta top stripe and 2px white-bone bottom border.

---

## Color
- **Approach:** Low-glare carbon ink + 3 softened signal hues. No tinted page backgrounds; signal is either purposeful or absent.

| Token | Hex | Usage |
|---|---|---|
| `--ink` | `#0D0D0F` | Page background |
| `--ink-1` | `#151517` | Cards (default) |
| `--ink-2` | `#202024` | Raised / hovered cells |
| `--ink-3` | `#29292f` | Inputs, well backgrounds, empty progress tracks |
| `--hair-1` | `rgba(241,237,232,0.10)` | Default hairline borders |
| `--hair-2` | `rgba(241,237,232,0.18)` | Card borders |
| `--hair-3` | `rgba(241,237,232,0.30)` | Strong dividers / focus |
| `--magenta` | `#E84D85` | Primary signal — active, peak, PRs, hot delta |
| `--magenta-d` | `#C23B6B` | Magenta hover |
| `--magenta-s` | `rgba(232,77,133,0.08)` | Magenta wash (chip backgrounds only) |
| `--magenta-shadow` | `rgba(232,77,133,0.58)` | Soft stat offset shadow |
| `--acid` | `#B8D957` | Positive signal — on-target, live, confirmation |
| `--acid-s` | `rgba(184,217,87,0.07)` | Acid wash |
| `--acid-shadow` | `rgba(184,217,87,0.50)` | Soft positive stat offset shadow |
| `--ice` | `#6BBFDF` | Informational signal — long runs, zone 2, secondary stat |
| `--ice-s` | `rgba(107,191,223,0.07)` | Ice wash |
| `--ice-shadow` | `rgba(107,191,223,0.50)` | Soft informational stat offset shadow |
| `--orange` | `#DC8B3A` | Tempo / warn (sparingly — replaces yellow) |
| `--fg-1` | `#F1EDE8` | Primary text |
| `--fg-2` | `#C9C2BA` | Secondary text |
| `--fg-3` | `#8B837C` | Muted text / labels / meta |
| `--fg-4` | `#5D5651` | Disabled / inline ornaments |

**Run type → color mapping (kept semantically aligned with the previous system):**
- Easy → `--fg-2` neutral
- Tempo / threshold → `--acid` (was warning yellow)
- Intervals → `--magenta` (was accent orange)
- Long → `--ice` (was info blue)
- Race → `--magenta` inverted (chip fills magenta with ink text — race day stands apart)
- Recovery → `--fg-3` muted

**Removed semantic tokens:** `--success`, `--warning`, `--info`, `--error` are folded into `--acid`, `--orange`, `--ice`, `--magenta` respectively. Backgrounds (`--success-bg` etc.) are also gone — Pulse doesn't tint backgrounds.

**No-glass rule:** removed entirely. If something needs to feel "above" — increase border weight, not opacity.

---

## Typography
- **Display:** Archivo Narrow 700 — **UPPERCASE** for headings, with a 2px softened signal offset shadow on hero stat numbers
- **Block body / labels:** Archivo 500/700 — for paragraph copy and Big Stats that aren't display
- **Mono / Data / Tables:** JetBrains Mono 400/500/700, `font-variant-numeric: tabular-nums`
- **Loading:** Google Fonts CDN — replace Syne, DM Sans, Space Mono in `app/layout.tsx` with Archivo Narrow + Archivo + JetBrains Mono

**Scale:**

| Step | Size | Font | Weight | Usage |
|---|---|---|---|---|
| `hero` | `clamp(56px, 8vw, 96px)` | Archivo Narrow | 700 | Page title (`h1.font-display`) |
| `disp` | `48px` | Archivo Narrow | 700 | Section open |
| `h2` | `28px` | Archivo Narrow | 700 | Card heading |
| `h3` | `18px` | Archivo Narrow | 700 | Sub-card title |
| `stat-xl` | `80px` (desktop) / `56px` (mobile) | Archivo Narrow | 700 | Hero stat — **with 2px softened signal text-shadow** |
| `stat-md` | `40px` | Archivo Narrow | 700 | Secondary stat — no shadow |
| `stat-sm` | `22px` | Archivo Narrow | 700 | Inline data values |
| `body-lg` | `15px` | Archivo | 500 | Default body |
| `body-sm` | `13px` | Archivo | 500 | Secondary body |
| `tele` | `13–16px` | JetBrains Mono | 500 | Telemetry / table cells |
| `label` | `11px` | JetBrains Mono | 500 | UPPERCASE labels, +0.18em tracking, `/` prefix |

**Casing:** All display-level type is **UPPERCASE**. Body copy stays sentence case. Mono labels are uppercase with `letter-spacing: 0.18em` and a leading `/ ` prefix (the signature mark).

**Tracking & line-height:** Hero `letter-spacing: -0.035em` / `line-height: 0.9`. Body `1.55`. Mono `1.6`. No exceptions.

**Stat shadow:** `text-shadow: 2px 2px 0 var(--magenta-shadow)`. Reserved for the **largest stat per card** and the page title period (`Jesse.`). Variants: `.acid` shadow for positive metrics, `.ice` shadow for informational. Never combined. Do not use fully saturated solid shadows.

**Mobile type scaling:** Stat numbers `80px → 56px`. Hero `96px → 56px`. Body untouched.

---

## Spacing
- **Base unit:** 4px
- **Density:** Comfortable — Pulse's loudness needs breathing room

| Token | Value | Usage |
|---|---|---|
| `xs` | 4px | Icon gaps, chip internals |
| `sm` | 8px | Internal card gaps |
| `md` | 14px | Card internal sections (was 16) |
| `lg` | 24px | Card padding (desktop) |
| `xl` | 32px | Between sections within a screen |
| `2xl` | 56px | Page-level vertical rhythm |
| `3xl` | 96px | Major section breaks (system doc only) |

**Card padding:**
- Desktop: `24px`
- Mobile: `18px`

**Bento gap:**
- Desktop: `14px`
- Mobile: `10px`

---

## Border Radius
**Brutal flat.** Almost everything is square. Radius is reserved for the very few elements where a circle is the natural shape (avatars, dots, gauge rings).

| Element | Radius |
|---|---|
| Cards | `0` |
| Buttons | `0` |
| Inputs | `0` |
| Chips / pills | `0` (was rounded — now square) |
| Modals | `0` |
| Avatars | `50%` |
| Status / gauge dots | `50%` |

---

## Motion
- **Approach:** Three primitives. Punch, sweep, blink. **Nothing eases gently — it hits.**

| Name | Duration | Easing | Usage |
|---|---|---|---|
| punch | 180ms | `cubic-bezier(0.2, 0.9, 0.25, 1)` | Button hover — offset −1px/−1px with 2px softened magenta shadow |
| sweep | 700ms | same | Progress bar / gauge fill / bar chart bars entering |
| blink | 1.4s steps(2) | — | Live-status indicators only (sync, recording) |
| fade-up | 240ms | ease-out | Card mount (kept, shortened from 300ms) |

**Removed motion:** the previous `long 500ms ease-in-out` chart animation is gone — charts use `sweep` instead. No spring, no overshoot, no bounce.

**Easing:**
- Default: `cubic-bezier(0.2, 0.9, 0.25, 1)` (strong front-loaded)

**Punch keyframe (button hover):**
```css
.btn:hover {
  transform: translate(-1px, -1px);
  box-shadow: 2px 2px 0 var(--magenta-shadow);
  border-color: var(--magenta);
  color: var(--magenta);
}
```

**Blink keyframe (status):**
```css
@keyframes blink { 50% { opacity: 0.2; } }
.status::before { animation: blink 1.4s steps(2) infinite; }
```

---

## Mobile & PWA

**Top bar:**
- Solid `--ink-1` with **3px magenta top stripe** + 2px `--fg-1` bottom border
- No backdrop-filter

**Bottom nav (mobile):**
- Solid `--ink` with 2px `--fg-1` top border
- Active item: `--ink` text on `--magenta` background pill (square corners, padding 8px 14px)
- No glass, no opacity

**Touch targets:**
- Minimum 44×44px — unchanged
- Padding to reach target without affecting visual

**Safe area insets:**
```css
/* PWA standalone (html.standalone): */
padding-bottom: calc(8px + env(safe-area-inset-bottom));
padding-top:    calc(14px + env(safe-area-inset-top));
```

**Theme color:** `#0D0D0F` (set in `<meta name="theme-color">`)

---

## Component Conventions

**Hero stat card (key metric):**
```
3px top stripe in semantic accent — magenta (default) / acid / ice
[NN] index — top-right, JetBrains Mono 10px, color: --fg-4
label — JetBrains Mono 11px UPPERCASE, +0.18em, leading "/" prefix
big number — Archivo Narrow 80px (mobile 56), 2px softened signal text-shadow
delta chip — flat acid background, ink text, 3×7 padding, no border
chart — bars in --ink-2 (#303037), current week in magenta, average line at magenta 45% opacity
```

**Run type chip:**
```
font-family: JetBrains Mono, 10.5px, 700, UPPERCASE, +0.16em
padding: 4px 9px, border: 1px solid currentColor (square)
dot: 6×6 currentColor square (not circle)
easy   → fg-2 / hair-2 border
tempo  → acid / acid border / acid-s bg
intv   → magenta / magenta border / magenta-s bg
long   → ice / ice border / ice-s bg
race   → ink / magenta bg / magenta border (inverted)
recov  → fg-3 / hair-1 border
```

**Button:**
```
font-family: JetBrains Mono, 11px, 700, UPPERCASE, +0.18em
padding: 12×18, square, border 1px hair-2, bg ink
hover: translate(-1px, -1px), shadow 2px 2px 0 magenta-shadow, color/border magenta
primary: bg magenta, color ink
acid:    bg acid, color ink
ghost:   border hair-1, color fg-2
icon:    padding 12, no text
```

**Status pill (live indicator):**
```
font-family: JetBrains Mono, 10.5px, 500, UPPERCASE, +0.16em
border 1px solid currentColor, padding 6×10, square
leading 6×6 square dot, blink keyframe
live → acid · warn → orange · peak → magenta
```

**Tabs:**
```
border-bottom: 2px solid fg-1 (white-bone)
tab padding 14×18, JetBrains Mono 11px 700 UPPERCASE +0.2em
tab-id span: fg-4 (color), shown before label
active: bg magenta, color ink (solid block, no underline)
inactive: color fg-3, hover fg-1
```

**Telemetry row:**
```
grid: 38px (idx) · 1fr (name+meta) · auto (chip) · auto (num) · auto (num)
padding 14×14, top border hair-1
hover: bg ink-2 with left 3px magenta stripe
idx: JetBrains Mono 10px, fg-4
name: Archivo Narrow 16px 700 UPPERCASE
meta: JetBrains Mono 10px UPPERCASE +0.14em, fg-3
num: JetBrains Mono 13px tnum, fg-1
num.mag → magenta · num.acid → acid · num.dim → fg-3
```

**Modal:**
```
bg: --ink-1, border: 1px solid --hair-2 (square)
3px magenta top stripe
no backdrop blur, backdrop = rgba(0,0,0,0.8) solid scrim
inner stats: --ink-3 bg, no border
```

---

## Iconography
- **Style:** Wireframe, **1.8px stroke**, **square line caps & joins** (`stroke-linecap="square"`, `stroke-linejoin="miter"`)
- **Size:** 24×24 default, 14×14 in buttons
- **Color:** inherits from text — never coloured by default. Magenta only on hover or in active states.
- **No filled icons.** No emoji.

---

## Decisions Log

| Date | Decision | Rationale |
|---|---|---|
| 2026-05-22 | Pulse direction adopted | Existing "industrial / retro-futuristic" was directionally right but too quiet. Pulse pushes the same instinct further — louder, more confident, distinct from any other running app. |
| 2026-05-22 | Magenta replaces orange as primary signal | Orange reads "athletic" but everyone uses it (Strava, Nike, ASICS). Magenta is unclaimed in the category, distinctive, and harder to use poorly — it forces restraint. |
| 2026-05-22 | All corners square | Round corners read as "consumer/wellness." Square reads as "tool / poster / signage." The radius hierarchy in the old system added complexity without adding meaning. |
| 2026-05-22 | Archivo Narrow + Archivo + JetBrains Mono | Syne is good but generic-display. Archivo Narrow at 700 has track-club poster energy and pairs sharply with mono. DM Sans → Archivo for slightly stronger letterforms in body. Space Mono → JetBrains Mono for crisper tabular figures. |
| 2026-05-24 | Low-glare Pulse tuning | The first neon pass reduced legibility. Signals are now softer, neutral text is brighter, `text-white` resolves to bone, and stat shadows use translucent 2px offsets. |
| 2026-05-22 | 4px magenta text-shadow on hero stats | Superseded by the 2026-05-24 low-glare tuning. The signature move remains, but with a softer 2px offset. |
| 2026-05-22 | Removed glass entirely | Glass was reserved for nav + modals before, but Pulse's flat-opaque aesthetic does the same job with less complexity. A 3px magenta stripe communicates "above" better than blur. |
| 2026-05-22 | Run-type semantic mapping preserved | Easy/tempo/intervals/long/race conventions are load-bearing across the app — only the colours change. easy→fg-2, tempo→acid, intervals→magenta, long→ice, race→inverted magenta. |
| 2026-05-22 | Card index `[NN]` brackets | Borrowed from technical drawings & spec sheets. Cheap, distinctive, makes screens scannable by reference. |
| 2026-05-22 | Three motion primitives only | The old four-tier system (micro/short/medium/long) over-specified motion for a tool. Punch/sweep/blink covers every real case. |
| 2026-05-22 | Removed `--success` / `--warning` / `--info` / `--error` semantic tokens | Pulse has 3 signals — acid (positive), orange (warn), magenta (peak/error). Mapping 4 semantic states onto 3 hues forces clarity. |
