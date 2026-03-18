# TODOS

Deferred work tracked here. One item per entry.

---

## TODO-001: Centralized Claude wrapper (lib/claude.ts)

**What:** Create `lib/claude.ts` with `createMessage()` and `createStream()` helpers that wrap the Anthropic SDK with retry logic (429/529), timeout handling, and structured logging.

**Why:** Every AI route currently instantiates Anthropic ad hoc with no shared retry or error handling. Multiple CRITICAL GAPs in error handling (JSON.SyntaxError, 429/529, timeout) all need the same fix — DRY it in one wrapper.

**Pros:** Fixes all Claude error handling in one place. Future AI routes get safety for free.

**Cons:** One more abstraction file — must stay thin (no business logic).

**Context:** Identified in RDCoach v2 CEO review (2026-03-18). Current gaps: `briefing/route.ts` has bare `JSON.parse()` with no catch; no retry on 429/529 anywhere in the codebase. The wrapper should handle: 2 retries with exponential backoff on 429/529, 30s timeout, log raw response on parse error.

**Effort:** S (human: ~2h) → S (CC+gstack: ~15 min)
**Priority:** P1 — unblocks all other error handling fixes
**Depends on:** Nothing — can be done standalone

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

## TODO-003: Phase 3 — Full AI-generated weekly training plan per athlete

**What:** `POST /api/coach/plan` generates a full 7-day training plan per athlete (Monday–Sunday, specific sessions with run type, distance, target pace, notes). New UI: `WeeklyPlanCard` component on `/plan` page or dashboard.

**Why:** The apex of actionable coaching — athlete doesn't need to think, just follows the plan. Natural evolution from P3 (today's workout generator).

**Pros:** Highest-value feature for serious training. Differentiates RunDash from passive analytics tools.

**Cons:** Requires RDCoach v2 shipped first (needs memory, workout context, DB tables). Significant new UI surface.

**Context:** Identified in RDCoach v2 CEO review (2026-03-18). Claude Sonnet generates the plan using: race dates, current estimates from analysis.ts, training load trend, and conversation history (P1). Renders as a calendar-style card.

**Effort:** L (human: ~1 week) → M (CC+gstack: ~1 hour)
**Priority:** P1 — after v2 ships
**Depends on:** RDCoach v2 (P1 memory, P3 workout generator, new DB tables)

---

## TODO-004: Phase 2 — Social engagement layer

**What:** Emoji reactions on feed runs, share cards for shoutouts, PR detection → group celebration, streak data feeding into coach briefing.

**Why:** Completes the RDCoach v2 CEO vision. The social/stickiness mechanics that turn the app from a personal tool into a group experience.

**Pros:** Higher engagement, shareable moments, group accountability. Streak callouts in briefing give the coach real personality.

**Cons:** Depends on Phase 1 (lib/claude.ts, enriched buildCoachContext, migration Phase 1) being stable first.

**Context:** Explicitly phased out of Phase 1 during Eng Review (2026-03-18) to reduce deploy blast radius. Features: `/api/runs/[id]/react` (POST/DELETE), `run_reactions` table, reaction row in GroupFeed.tsx with optimistic updates, Web Share API on shoutout cards, `athlete_best_estimates` table + PR detection hook in sync pipeline, streak data injected into buildCoachContext for briefing callouts.

**Effort:** M (human: ~3 days) → S (CC+gstack: ~45 min)
**Priority:** P1 — immediately after Phase 1 ships
**Depends on:** TODO-001 (lib/claude.ts), Phase 1 DB migration, Phase 1 buildCoachContext enrichment
