# RunDash · Pulse — drop-in re-skin

This bundle replaces the RunDash visual system with **Pulse**: brutalist black,
magenta + acid + ice signals, Archivo Narrow / Archivo / JetBrains Mono.
Drop the files into your project at the paths shown below and the app reskins.

## What's in the box

```
pulse-drop-in/
├── DESIGN.md                              ← replaces /DESIGN.md
├── tailwind.config.js                     ← replaces /tailwind.config.js
├── app/
│   ├── globals.css                        ← replaces /app/globals.css
│   ├── layout.tsx                         ← replaces /app/layout.tsx
│   ├── page.tsx                           ← replaces /app/page.tsx (Dashboard)
│   ├── runs/page.tsx                      ← replaces /app/runs/page.tsx
│   ├── analysis/page.tsx                  ← replaces /app/analysis/page.tsx
│   ├── goals/page.tsx                     ← replaces /app/goals/page.tsx
│   └── plan/page.tsx                      ← replaces /app/plan/page.tsx
├── components/
│   ├── Nav.tsx                            ← replaces /components/Nav.tsx
│   ├── RunDashWordmark.tsx                ← replaces /components/RunDashWordmark.tsx
│   ├── RunTypeBadge.tsx                   ← replaces /components/RunTypeBadge.tsx
│   ├── RunRow.tsx                         ← replaces /components/RunRow.tsx
│   ├── GoalCard.tsx                       ← replaces /components/GoalCard.tsx
│   ├── WeeklyMileageChart.tsx             ← replaces /components/WeeklyMileageChart.tsx
│   ├── TrainingLoadChart.tsx              ← replaces /components/TrainingLoadChart.tsx
│   └── FiveKTrendChart.tsx                ← replaces /components/FiveKTrendChart.tsx
└── lib/
    └── run-classification/
        └── types.ts                       ← replaces /lib/run-classification/types.ts
```

## How to deploy

1. **Copy files** — preserve the relative paths above. Easiest:
   ```bash
   cp -r pulse-drop-in/* ./
   ```
   (run from your project root)

2. **No package changes needed.** Pulse uses `Archivo_Narrow`, `Archivo`, and
   `JetBrains_Mono` from `next/font/google`, which is already in your stack via
   Next 14. No new npm dependencies.

3. **Commit, push, deploy.** Vercel will pick it up.

4. **Browser refresh.** Hard-reload to bust the font cache.

## What changed at a glance

### Token system
- `globals.css` redefines **all CSS variables** and adds Pulse-only ones
  (`--ink`, `--magenta`, `--acid`, `--ice`, `--fg-1..4`).
- **Legacy aliases** are kept: `--orange`, `--surface`, `--text-1`, etc. now
  point to the new tokens. Any code reading `var(--orange)` automatically
  becomes magenta. Charts that hardcode `#f97316` won't auto-skin — that's why
  the chart files are explicitly replaced.

### Typography
- `layout.tsx` swaps `Syne / DM Sans / Space Mono` → `Archivo Narrow / Archivo / JetBrains Mono`.
- The CSS variable names (`--font-display`, `--font-body`, `--font-mono`) are
  preserved, so every existing `font-display` / `font-mono` className just works.

### Tailwind config
- New named colors: `ink-{1,2,3}`, `magenta`, `acid`, `ice`, `bone`.
- `brand-500` now equals `#ff1d6c` (was `#f97316`).
- `borderRadius.*` is set to `0` across the board — Pulse is square.
  `rounded-full` (avatars, dots) still works because `full: 9999px` is kept.
  If you've used `rounded-lg`, `rounded-xl`, etc. anywhere — they will now
  render square. That's intentional. If you want a soft corner back somewhere,
  use an inline `style={{ borderRadius: 8 }}` instead.

### RUN_TYPES color mapping
`lib/run-classification/types.ts` re-maps every run-type chip to the Pulse
palette while preserving the semantic logic (easy = quiet, intervals = peak):

| Type            | Was            | Now (Pulse) |
|-----------------|----------------|-------------|
| `recovery`      | emerald-400    | `--fg-3` (muted) |
| `easy`          | emerald-300    | `--fg-2` (neutral) |
| `easy_strides`  | teal-300       | `--fg-2` |
| `tempo`         | rose-400       | `--acid` (lime) |
| `threshold`     | orange-400     | `--acid` (lime) |
| `long_easy`     | sky-400        | `--ice` (cyan) |
| `long_steady`   | cyan-400       | `--ice` |
| `long_progressive` | blue-400    | `--ice` |
| `intervals`     | red-400        | `--magenta` |
| `treadmill`     | zinc-400       | `--fg-3` (muted) |
| `race`          | amber-400      | `--magenta` inverted (filled background, ink text) |

### Pages
Header treatment changes on every page:
- `font-display` h1 → uppercase, `clamp(40px, 7vw, 72px)`, `-0.04em` tracking
- 2px bone-white border-bottom under header
- Magenta `.` at end of title
- Mono uppercase subtitle with `/ ` prefix

Cards now use `.pulse-bar` to get a 3px top stripe in the section's accent
(magenta / acid / ice). The `[NN]` corner index uses `.pulse-idx`. Both are
defined in `globals.css`.

## Files I did NOT touch

These weren't refactored because they don't carry strong visual identity, OR
they auto-reskin through the new token values. You may want to revisit later:

- `components/SettingsDrawer.tsx`
- `components/OnboardingPage.tsx` (see the design canvas for a Pulse onboarding
  design — translate when ready)
- `components/Group*.tsx` — group dashboard, feed, leaderboard. These will
  partially restyle via tokens but have hardcoded Tailwind colors in places.
  The Pulse design canvas has the full group screen design — use that as a
  reference if you want to refactor.
- `components/PlanSessionModal.tsx`, `GoalSetupModal.tsx` — modals will look
  mostly correct through tokens; tweak background opacity and corners if
  desired.
- `components/HRChart.tsx`, `PaceTrendChart.tsx`, `SplitsChart.tsx`,
  `LongRunChart.tsx`, `AerobicEfficiencyChart.tsx` — Recharts components with
  hardcoded `#f97316`. Quick fix: find/replace `#f97316` → `#ff1d6c`,
  `#60a5fa` → `#d9ff36` (or `#5ad7ff`), `#a78bfa` → `#5ad7ff` in each file.
- `components/CombinedEstimateCard.tsx`, `RunTypeSelector.tsx`,
  `AnalysisDistanceSection.tsx`, `SourceCard.tsx`, and the various badge
  components (`RunEstimateBadge`, `SourceEstimateBadge`) — these will look
  OK through tokens but will reach Pulse fidelity with similar small swaps.

A clean way to find the rest of the hardcoded colors:
```bash
rg -n '#f97316|#60a5fa|#a78bfa|#f472b6|text-orange-|text-blue-|text-purple-|text-pink-|text-emerald-|text-rose-' components/
```
Anything that comes back is a candidate for a follow-up commit.

## Rolling back

```bash
git diff HEAD~ --stat
git checkout HEAD~ -- app/ components/ lib/run-classification/ tailwind.config.js DESIGN.md
```

## Reference

Open `RunDash Pulse.html` (the design system doc) and
`RunDash Pulse — Pages.html` (the screen mockups) for the full visual reference.
