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

## TODO-005: Route/integration test infrastructure

**What:** Create `__tests__/helpers/supabase.ts` — a Supabase mock helper that stubs `supabaseAdmin` responses so route handlers can be tested without a live DB.

**Why:** Currently impossible to write unit tests for any API route. Every new route (insight, peek, coach-note PATCH, briefing awards) has zero test coverage by default. This is the one-time investment that unlocks route testing for all future work.

**Pros:** Enables route-level unit tests. Catches auth bypass, 403/404 edge cases, cache logic. Pays forward on every future route.

**Cons:** Initial setup cost. Mocks can drift from real Supabase behavior — needs occasional sync.

**Context:** Identified in AI features overhaul eng review (2026-04-04). Vitest is already the test runner (`vitest run`). The pattern from `claude.test.ts` (vi.mock + mockResolvedValue) directly applies. Existing `__tests__/` directory has 2 files; this would be the 3rd.

**Effort:** M (human: ~1 day) → S (CC+gstack: ~20 min)
**Priority:** P2
**Depends on:** Nothing — fully independent
