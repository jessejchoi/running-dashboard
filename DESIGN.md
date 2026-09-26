# Design System — RunDash

## Product Context
- **What this is:** Personal running performance dashboard connected to Strava
- **Who it's for:** Jesse — training for 3 races in 2026 (5K, 10K, Half Marathon)
- **Space/industry:** Sports performance, personal analytics
- **Project type:** Data-dense web app + PWA (installed to home screen)

---

## Aesthetic Direction
- **Direction:** Industrial / Retro-Futuristic
- **Decoration level:** Intentional — dark surfaces and orange accent carry the atmosphere; subtle grain or razor-thin dividers only; no gradients, no rounded blobs
- **Mood:** Feels like a timing-chip readout or a track coach's analytics terminal. Precise, focused, high-energy. A performance tool — not a wellness app.

---

## Layout
- **Approach:** Bento grid — asymmetric grid where card size signals importance
- **Desktop grid:** 12-column, gap 12px, max content width 1100px
- **Mobile grid:** 2-column (key stats full-width `span 12`, small stats `span 6`), gap 8px, horizontal page padding 12px
- **Card placement examples:** Weekly mileage → large (7 col); race estimates → medium (5 col); pace/load/goals → equal thirds (4 col each)
- **Glass treatment:** Reserved for elements that float above scrolling content only:
  - Desktop nav bar
  - Mobile bottom nav
  - Modals and overlays
  - **NOT** used on regular dashboard cards (solid dark surface only — glass needs content behind it to show)

---

## Color
- **Approach:** Restrained — one accent, full semantic set

| Token | Hex | Usage |
|---|---|---|
| `--bg` | `#080808` | Page background |
| `--surface-1` | `#111111` | Cards (default) |
| `--surface-2` | `#161616` | Elevated / nested cards, est. items |
| `--surface-3` | `#0f0f0f` | Inputs, inner containers |
| `--border` | `#2a2a2a` | Default borders |
| `--border-hover` | `#383838` | Hovered borders |
| `--accent` | `#f97316` | Brand orange — primary interactive |
| `--accent-dim` | `#ea580c` | Accent hover state |
| `--accent-muted` | `rgba(249,115,22,0.10)` | Active nav bg, focus rings |
| `--accent-glow` | `rgba(249,115,22,0.08)` | Key metric card glow |
| `--text-1` | `#f0f0f0` | Primary text |
| `--text-2` | `#a1a1aa` | Secondary text |
| `--text-3` | `#6b7280` | Muted / labels / meta |
| `--success` | `#22c55e` | Easy runs, positive deltas |
| `--warning` | `#eab308` | Tempo/threshold runs, fatigue warnings |
| `--error` | `#ef4444` | Errors, negative deltas |
| `--info` | `#3b82f6` | Long runs, informational |
| `--success-bg` | `rgba(34,197,94,0.08)` | Alert / chip backgrounds |
| `--warning-bg` | `rgba(234,179,8,0.08)` | |
| `--error-bg` | `rgba(239,68,68,0.08)` | |
| `--info-bg` | `rgba(59,130,246,0.08)` | |

**Run type → color mapping:**
- Easy / recovery → success green
- Interval → accent orange
- Long run → info blue
- Tempo / threshold → warning yellow

**Glass layer (nav + modals only):**
```css
background: rgba(17, 17, 17, 0.65);
backdrop-filter: blur(16px) saturate(180%);
border: 1px solid rgba(255, 255, 255, 0.06);
box-shadow: 0 8px 48px rgba(0, 0, 0, 0.6);
```

---

## Typography
- **Display / H1:** Syne 700–800, uppercase, `letter-spacing: -0.02em`, `line-height: 0.95`
- **Body:** DM Sans 400/500/600
- **Data / Tables / Stats:** Space Mono 400/700, `font-variant-numeric: tabular-nums`
- **Loading:** Google Fonts CDN — already configured in `app/layout.tsx`

**Scale:**

| Step | Size | Font | Weight | Usage |
|---|---|---|---|---|
| `display` | `clamp(32px, 8vw, 88px)` | Syne | 800 | Hero headings |
| `h1` | `32px` | Syne | 800 | Page titles |
| `h2` | `24px` | Syne | 700 | Section headings |
| `h3` | `18px` | Syne | 700 | Card headings |
| `body-lg` | `15px` | DM Sans | 400/500 | Default body |
| `body-sm` | `13px` | DM Sans | 400/500 | Secondary body, card content |
| `label` | `11px` | Space Mono | 400 | Eyebrows, meta, uppercase labels |
| `stat-xl` | `42px` (desktop) / `32px` (mobile) | Space Mono | 700 | Big stat numbers |
| `stat-md` | `22px` | Space Mono | 700 | Secondary stats |
| `stat-sm` | `13px` | Space Mono | 700 | Inline data values |

**Mobile type scaling:**
- Stat numbers: `42px → 32px`
- Display headings: `clamp(22px, 6vw, 32px)`
- Body stays at `13–15px`

---

## Spacing
- **Base unit:** 4px
- **Density:** Comfortable

| Token | Value | Usage |
|---|---|---|
| `xs` | 4px | Icon gaps, tight inline spacing |
| `sm` | 8px | Internal card gaps, chip padding |
| `md` | 16px | Card internal sections |
| `lg` | 24px | Card padding (desktop) |
| `xl` | 32px | Between sections |
| `2xl` | 48px | Page-level vertical rhythm |
| `3xl` | 64px | Major section breaks |

**Card padding:**
- Desktop: `24px`
- Mobile: `14px`

**Bento gap:**
- Desktop: `12px`
- Mobile: `8px`

---

## Border Radius
Hierarchical — not uniform. Smaller elements are sharper; larger containers are softer.

| Element | Radius |
|---|---|
| Chips / badges | `4px` |
| Buttons | `6px` |
| Inputs | `8px` |
| Cards | `12px` |
| Modals / glass | `16px` |

---

## Motion
- **Approach:** Minimal-functional — only transitions that aid comprehension

| Name | Duration | Easing | Usage |
|---|---|---|---|
| micro | 50ms | ease-out | Icon swaps, active dot states |
| short | 150ms | ease-out | Hover effects, tab switches, border color |
| medium | 300ms | ease-out | Card entrances (fadeUp), modal open |
| long | 500ms | ease-in-out | Chart animations |

**Easing:**
- Enter: `cubic-bezier(0.0, 0.0, 0.2, 1)` (ease-out — fast in, slow settle)
- Exit: `cubic-bezier(0.4, 0.0, 1, 1)` (ease-in — slow out, fast away)

**fadeUp keyframe (card entrance):**
```css
@keyframes fadeUp {
  from { opacity: 0; transform: translateY(12px); }
  to   { opacity: 1; transform: translateY(0); }
}
/* duration: 300ms (was 400ms — tighter feels snappier) */
```

---

## Mobile & PWA

**Bottom nav:**
- Glass treatment: `backdrop-filter: blur(16px) saturate(160%)`
- Border: `1px solid rgba(255,255,255,0.05)` top only
- Active item: orange icon + text + `background: rgba(249,115,22,0.10)` pill

**Touch targets:**
- Minimum 44×44px for all interactive elements
- Use padding to reach target size without affecting visual appearance

**Safe area insets:**
```css
/* Regular Safari: no env() — nav is exactly content height */
/* PWA standalone (html.standalone): */
padding-bottom: calc(8px + env(safe-area-inset-bottom));
padding-top: calc(14px + env(safe-area-inset-top));
```

**Theme color:** `#080808` (set in `<meta name="theme-color">`)

---

## Component Conventions

**Stat card (key metric):**
```
eyebrow    — Space Mono 10px uppercase, text-3
big number — Space Mono 42px/32px, text-1, tabular-nums
delta chip — Space Mono 11px, success/error bg, border-radius 4px
chart      — bars or sparkline, accent for current week
box-shadow — 0 0 40px var(--accent-glow)  ← glow-orange class
```

**Run type badge:**
```
font-family: Space Mono, 10px, 700, uppercase, letter-spacing 0.08em
padding: 4px 8px, border-radius 4px
easy       → success-bg / success text
interval   → accent-muted / accent text
long       → info-bg / info text
tempo      → warning-bg / warning text
recovery   → rgba(161,161,170,0.10) / text-2
```

**Glass modal:**
```
bg: rgba(17,17,17,0.65), backdrop-filter: blur(20px) saturate(180%)
border: 1px solid rgba(255,255,255,0.06)
border-radius: 16px
box-shadow: 0 8px 48px rgba(0,0,0,0.6)
inner stats: surface-2 bg, rgba(255,255,255,0.05) border
```

---

## Decisions Log

| Date | Decision | Rationale |
|---|---|---|
| 2026-03-17 | Bento grid layout | Size = importance; modern, futuristic, works for data-dense dashboard |
| 2026-03-17 | Glass on nav + modals only | Solid dark bg (#080808) has nothing to blur through — glass only where content scrolls behind it |
| 2026-03-17 | Keep Syne + DM Sans + Space Mono | Already loaded, work well together — Syne for energy, DM Sans for readability, Space Mono for data terminal feel |
| 2026-03-17 | 4px base unit | Finer control for data-dense layouts without going to 8px rigidity |
| 2026-03-17 | Single orange accent | Restrained palette — orange is high-energy, athletic, distinctive; second accent would dilute it |
| 2026-03-17 | fadeUp 300ms (from 400ms) | Tighter animation feels snappier in a performance context |
| 2026-09-26 | Pixel-art weapon sprites for Rhythm | 16×16 upright grids in orange `#f97316` and steel `#a1a1aa` / `#52525b` on dark surfaces, drawn with `shape-rendering: crispEdges` (`lib/sprites.ts`, `components/WeaponSprite.tsx`). Retro timing-chip feel, and a collectible look for the weapon tiers. Approved by Jesse. |
| 2026-09-26 | Boss sprites and share cards for Boss Raid | Six 16×16 bosses in the same orange/steel palette as the weapons (`lib/sprites.ts`, `BossSprite` in `components/WeaponSprite.tsx`). Share cards are 1080×1350 PNGs from `next/og` using Syne + Space Mono (`lib/og-fonts/`); DM Sans isn't embedded, so body copy on cards is Space Mono. |
