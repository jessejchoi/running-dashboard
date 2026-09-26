# TODOS

Deferred work tracked here. One item per entry.

---

## TODO-002: Refactor GroupPageClient.tsx into focused sub-components

**What:** Split `components/GroupPageClient.tsx` (currently 1,524 lines) into 3-4 focused components: `CoachSection`, `FeedSection`, `LeaderboardSection`, each under ~300 lines.

**Why:** 1,524 lines is already hard to navigate. RDCoach v2 will add another 300-500 lines for reactions, streak leaderboard, and enriched coach UI. Do this before v2, not after.

**Pros:** Easier testing, faster iteration, cleaner code ownership per feature.

**Cons:** Refactor risk — should be a dedicated PR with no functional changes. Test manually after extraction.

**Context:** Identified in RDCoach v2 CEO review (2026-03-18). Recommended as a cleanup PR before RDCoach v2 features are added to the file.

**Effort:** M (human: ~1 day) → S (CC+gstack: ~20 min)
**Priority:** P2 — do before v2 features are added
**Depends on:** Nothing — fully independent

---

## ~~TODO-003: Phase 3 — Full AI-generated weekly training plan per athlete~~

**Dropped 2026-09-26.** The personal run plan feature was removed because nobody used it; see `docs/expansion-rollout.md`.

---

## TODO-004: Phase 2 — Social engagement layer

**What:** Emoji reactions on feed runs, share cards for shoutouts, PR detection → group celebration, streak data feeding into coach briefing.

**Why:** Completes the RDCoach v2 CEO vision. The social/stickiness mechanics that turn the app from a personal tool into a group experience.

**Pros:** Higher engagement, shareable moments, group accountability. Streak callouts in briefing give the coach real personality.

**Cons:** Depends on Phase 1 (lib/claude.ts, enriched buildCoachContext, migration Phase 1) being stable first.

**Context:** Explicitly phased out of Phase 1 during Eng Review (2026-03-18) to reduce deploy blast radius. Features: `/api/runs/[id]/react` (POST/DELETE), `run_reactions` table, reaction row in GroupFeed.tsx with optimistic updates, Web Share API on shoutout cards, `athlete_best_estimates` table + PR detection hook in sync pipeline, streak data injected into buildCoachContext for briefing callouts.

**Effort:** M (human: ~3 days) → S (CC+gstack: ~45 min)
**Priority:** P1 — immediately after Phase 1 ships
**Depends on:** Phase 1 DB migration, Phase 1 buildCoachContext enrichment

---

## ~~TODO-005: Route/integration test infrastructure~~

**Done 2026-04-13** (`526422a`). `__tests__/helpers/supabase.ts` provides `createQueryChain` and `queueSupabaseTables`, and 10 test files use it for route-level tests.

---

## TODO-006: Boss Raid v2 follow-ups

**What:** The Boss Raid v2 set from `docs/designs/rhythm-boss-raid.md`:
- The Coach edition writes the battle-report copy.
- A `bosskiller` award for the MVP of the killing blow.
- Weapon icons on `GroupLeaderboard`.
- A trophy wall of slain bosses.
- A boss roster that grows from 3 to 8 (Snooze Hydra, Monsoon Wyrm, Excuse Goblin King, Treadmill Mimic, Rest Day Troll).

**Why:** These make the raid richer once it's proven people actually engage with it. They were deliberately held out of PR1 and PR2 to keep v1 small.

**Pros:** More personality in the weekly report, visible status on the leaderboard, and long-term collection value from slain bosses.

**Cons:** More sprites, more copy, and more Coach prompt surface. Worth it only if the v1 loop actually drives sharing.

**Context:** Decided in office-hours and plan-eng-review (2026-09-26). **Gate:** only build this if a battle report card gets posted in the group WhatsApp without being prompted within the first 2 weeks of PR2 shipping. Where to start:
- `lib/coachMetrics.ts`: add `raid` to the group metrics.
- `lib/awards.ts`: add `bosskiller`.
- `lib/sprites.ts`: add the new bosses.

**Effort:** M (human: ~3 days) → S (CC+gstack: ~45 min)
**Priority:** P3 (gated)
**Depends on:** PR2 (Boss Raid) shipped, plus the sharing gate above

---

## TODO-007: Rhythm stretch goals and a mileage-based target

**What:** Two optional additions to Rhythm's automatic weekly target, which is set from the 6-week average of 15-minute-plus runs, rounding up while fading:
1. **+1 stretch:** a runner opts in to one extra run on top of their target that week, for extra rewards. That could be bonus weapon progress, or bonus damage once Boss Raid exists.
2. **Mileage target:** target weekly distance in place of the number of runs, either as an alternative mode or a second track.

**Why:** Jesse, 2026-09-26: start simple with the automatic run-count target, and add these later.

**Pros:** Gives consistent runners something to push for beyond holding their rhythm. A mileage target suits runners who do fewer, longer runs.

**Cons:** Both reintroduce the user-set state that the simplification removed. A mileage target reopens the junk-miles question and needs its own anti-fade rounding.

**Context:** The target rule lives in `targetFromAverage()` and `foldWeek()` in `lib/rhythm.ts`. The design is in `docs/designs/rhythm-boss-raid.md`, under "Weekly target". The stretch would need an opt-in row per week (like `rhythm_rest_weeks`) and a `stretch` column on `rhythm_weeks`. Bump `RHYTHM_RULES_VERSION` if the fold changes.

**Effort:** M (human: ~2 days) → S (CC+gstack: ~30 min)
**Priority:** P3
**Depends on:** PR1 (Rhythm + Weapon) shipped

---

## TODO-008: Rhythm rest weeks (manual and race)

**What:** Weeks that pause Rhythm entirely. In a rest week your weapon and streak hold, and the week is skipped when computing the 6-week average. Two kinds:
1. **Manual:** a "Rest week" toggle for the current week only, at most 1 in any 4 weeks. Setting it on a Sunday is allowed, like a streak freeze.
2. **Race:** the race week and the week after it, recorded when a race goal is saved, and only if the race week hasn't started yet.

**Why:** Deferred from PR1 (Jesse, 2026-09-26: "no rest week! that can be for later"). Until this ships, a race or taper week counts like any other week and can cost a weapon tier.

**Pros:** Stops a taper or a sick week from hurting your weapon, and adds a strategic lever for the future Boss Raid (resting members neither attack nor block).

**Cons:** Adds a table, an API, goal-route hooks, and edge cases in the fold (redemption across a rest week, rest weeks in the average).

**Context:** The full design lives in `docs/designs/rhythm-boss-raid.md` under the rest-week sections, which are marked deferred. The earlier implementation was removed before PR1 landed:
- the `rhythm_rest_weeks` table
- `app/api/rhythm/rest-week`
- `setManualRestWeek`, `clearManualRestWeek` and `addRaceRestWeeks` in `lib/rhythmLedger.ts`
- a `rest` state in `foldWeek` that carries the level and any pending redemption

Known gaps from the eng review: goals saved before launch need a backfill, and creating then deleting future race goals can hand out extra rest weeks. Bump `RHYTHM_RULES_VERSION` and run the rebuild script when this ships.

**Effort:** M (human: ~2 days) → S (CC+gstack: ~40 min)
**Priority:** P2
**Depends on:** PR1 (Rhythm + Weapon) shipped
