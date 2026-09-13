# RunDash expansion rollout

## Deployment order

1. Apply `supabase/migration_021.sql` to a staging copy with migrations 001–020 already installed. It is additive and repeatable, preserves manual sessions and race goals, removes the old same-distance goal uniqueness, and leaves betting tables untouched. Snapshot history is separated by model version; old rows remain `legacy-unversioned`.
2. Deploy the app with `EXPECTED_ESTIMATOR_ENABLED=false` and `AUTO_ADAPT_ENABLED=false`, plus `CRON_SECRET`. Verify the existing `/api/cron/sync` schedule and a server runtime supporting 60-second requests. Use an external scheduler if the hosting tier cannot run the configured worker. No archive work runs during server rendering.
3. Existing users reconnect Strava once. Only a hashed, opaque 30-day `rundash_session` authenticates pages/APIs; the old athlete-ID cookie grants no access. Reconnecting reuses the athlete ID and stored data, and resumes revoked archive jobs at their saved cursor.
4. Verify real-account goals, recent sync, archive progress, personal plans, and group permissions on staging. The integration suite is isolated PostgreSQL; UI fixture checks do not substitute for real OAuth/Strava checks.
5. Enable each flag separately only after its gate passes. Roll back a flag independently if estimates or adaptations regress. Disable adaptation first if reverting application code; the migration need not be reversed.

No production migration, reconnect, feature flag change, or deployment is performed by the implementation tests.

## Estimator meaning and gate

The default `cp-weatherdrift-v4-race1` compatibility path publishes the projector's `todaySecs`. It removes synthetic cross-duration effort adjustments and retains 40% of each eligible effort's final capped HR pace reduction. It uses six calendar months of performance evidence, normalizes source heat before fitting, and constrains projections with official or measured elapsed race evidence. Grade-profile corrections on race constraints are modest energy-cost approximations. Recent training features retain their 60-day window; the asymmetric fitting rule is unchanged. This is the explicitly selected CP calibration, separate from enabling the observed estimator. The gated `expected-observed-v1` path uses observed sustained efforts, balanced Huber fitting, per-activity weights, and official/full elapsed race results. It excludes easy-run HR speed conversions and synthetic capability points. A recent same-distance confirmed race is calibration evidence, not a license to choose the faster model. Endurance evidence and uncertainty are distance-specific. The gated observed estimator retains its previous 60-day window; the selected CP path now uses six months as requested. Historical capability is not proof of maintained fitness after detraining.

The expected time describes current ability in usual recent conditions. Ideal conditions are secondary. Ranges are heuristic estimates, not statistically calibrated probabilities. Missing weather applies no inferred heat benefit. Sparse marathon evidence returns insufficient evidence. Numbers, explanations, cache keys, and snapshots carry the active model version; model changes never count as training improvement.

Run offline evaluation with:

```sh
npm run export:evaluation -- /tmp/rundash-evaluation-corpus.json
npm run evaluate:estimates -- /tmp/rundash-evaluation-corpus.json /tmp/rundash-estimate-evaluation.json
```

The first command reads connected athletes with server credentials; it does not mutate the database. Keep the corpus outside git. The evaluator admits only activity dated before each race and limits fitness evidence to 60 days. It splits by calendar date, ranks calibration candidates by training-partition error, and reports a separate held-out partition. Current labels and the baseline comparator’s current max-HR setting are used because their historical edits were not recorded; this is a retrospective evaluation, not a fully prospective trial. The comparator reconstructs the legacy HR-adjusted CP projector without weather, with the same missing-weather limitation for the new model.

Gate: at least 10 training and 10 held-out races, with at least 3 paired held-out predictions per distance; no distance may worsen mean absolute error or optimistic error, and overall optimistic error must decrease. Evidence-quality breakdowns and missing predictions remain visible. Reusing the held-out races to tune parameters invalidates this gate; collect a fresh holdout before release if model behavior is changed in response to those outcomes.

### Local evaluation, 2026-09-13

Six athletes supplied only five qualifying confirmed races: three chronological training races (two paired predictions), two held-out races. Defaults were retained because calibration data were insufficient.

| Held-out distance | Paired races | Legacy absolute error | New absolute error | Result |
| --- | ---: | ---: | ---: | --- |
| 5K | 1 | 121.9 s | 255.9 s | Worse |
| 10K | 0 | — | — | Insufficient |
| Half marathon | 1 | 1177.0 s | 352.4 s | Better |
| Marathon | 0 | — | — | Insufficient |
| Combined | 2 | 649.5 s | 304.2 s | Insufficient validation |

Mean optimistic error fell from 649.5 seconds to zero across the two paired held-out races, but only one actual result fell inside its estimated range. The 5K regression and missing-distance evidence fail the rollout gate. **Keep the observed estimator disabled.** The full aggregate report, including evidence-quality breakdowns, is in `estimate-evaluation.json`. Individual activity data are not included.

## Durable plans and adaptation

Full workout JSON, stable IDs, source, ownership, locks, recorded-run links, and complete before/after revisions live in PostgreSQL. Every plan write compares the athlete's plan version under a row lock; automatic writes also compare their input data version. Generated sessions are constrained by availability, minutes per session, current training volume, optional weekly distance cap, weekly distance/frequency goals, rest spacing, and easy-only mode. Private free-text notes are chat context, not executable scheduling constraints. Future fitness gains are never assumed. The dated progression is an outline; each detailed week uses fresh observed training.

Automatic edits preserve today, completed/skipped workouts, manual sessions, shared sessions, and locked workouts. Editing manually locks the session. Run matching requires a unique compatible session and distance on the same local date; ambiguous matches remain for confirmation. Explicit unlinking disables automatic rematching of that session. Undo applies only to the latest coach revision at the current plan version and locks restored workouts so later edits cannot be overwritten.

Legacy server rows default to manual/locked. Date-only browser drafts are offered for explicit ownership confirmation and saved as new manual sessions. They are not assigned based on whoever happens to sign in.

Keep `AUTO_ADAPT_ENABLED=false` until staging confirms sync-triggered revision, preference/goal changes, ambiguous matches, undo, and shared-event protections across two signed-in accounts. On-demand weekly generation remains available.

## Background processing and history

Archive jobs save a fixed upper date, page, progress, retries, and completion state per athlete. Inserts ignore duplicate IDs to preserve classifications and exclusions. Incremental sync runs first and creates bounded continuations for gaps larger than two pages; archive jobs cannot prevent new-run sync. Only recent 60-day runs or an explicit detail request fetch expensive details/streams. Background enrichment handles one run per leased job; manual detail batches are capped at two. Missing optional streams do not cause endless archive retries. List responses contain at most 50 run summaries plus an opaque `(date, id)` cursor; raw JSON and streams are omitted. Date filters default to Jakarta and accept an explicit timezone.

Strava request wrappers persist application-wide overall and non-upload quota headers. Archive imports pause before exhausting the quota and resume at the reported reset boundaries. These are natural 15-minute boundaries and midnight UTC, as documented by [Strava](https://developers.strava.com/docs/rate-limits/). Database leases and cursor comparisons make interrupted and duplicate jobs resumable. `/api/work` provides authenticated, bounded continuations while the dashboard, plan, or group is open. The scheduled worker handles idle users; expired leases are claimable again. Mutations coalesce pending athlete recomputations. Archive status labels the number of summaries processed, which can include previously imported records.

Long-range totals use indexed SQL aggregates. Group history sends daily totals and one cached best effort per member/day, instead of full activities, laps, or streams. Detailed challenge efforts are computed when details change. The activity list remains independent of total archive size; a 10,000-run fixture is covered by SQL aggregate and pagination tests.

## Coaching and shared runs

Briefings cache by group membership, training/plan versions, challenge changes, shared events, day, and model. Readers get the previous briefing while a leased job regenerates. Jobs validate input version and lease before committing. Facts and awards come from deterministic evidence; optional model-generated style is restricted to a reviewed closing, so it cannot invent facts. Prior focus and completion counts persist for follow-through. Personal conversation history and private constraints never enter group briefing context.

Members can create shared runs and RSVP. Creators and current admins manage events. Optional personal-plan copies are locked and versioned. Event edits/cancellation flag those copies; only explicit acceptance moves or removes them. Completed sessions remain preserved. Membership removal deletes RSVP access, flags retained personal sessions, and leaves event management with current admins. Updates stay in the app; this release sends no notifications outside it.

## Validation checklist

- Unit and PostgreSQL integration suite: 143 tests passed.
- Independent TypeScript check (`npm run typecheck`), since the existing Next build skips TypeScript/lint validation.
- Production build (`npm run build`).
- Mobile and desktop fixture checks for goals/results, plans/editor, shared runs/RSVP, and 50-row history.
- Staging OAuth reconnect, real Strava quota interruption/resume, and two-account permissions before production enablement.

### Local UI checks

Fixture previews were exercised at 375×812 and 1440×1000. Checked race editing/result inputs, saved workout structure, preferences and progression layout, shared-run join state, and history pagination. History rendered exactly 50 rows before and after the older-page action; the page width stayed within 375px. Fixed missing accent/surface CSS aliases and an unlabeled race-editor close control. A first-load development chunk timeout cleared after recompilation/reload; no subsequent runtime errors were observed in the exercised screens. These fixture checks use mocked API responses and are not production OAuth or database end-to-end tests.

Private API responses use no-store. Client navigation does not retain five-minute copies of mutable goals and plans; expensive estimator results remain cached by data/model version in PostgreSQL. The OAuth entry route is forced dynamic and tested for unique state values.

The “What changed?” recap and a dedicated progress-beyond-pace feature remain follow-ups, as scoped in the approved plan.

## Group estimate refresh and Strava notifications

Group Goals now refreshes missing or invalidated member estimates lazily, in batches of at most two analyses. Refresh jobs use database leases and the model/data version. A cache awaiting recomputation is labeled as updating, separately from a completed calculation with insufficient evidence. Existing group members do not need to sign in individually to populate their estimates.

Strava activity notifications provide updates shortly after uploads, edits, and deletions, with the existing daily cron retained as a recovery path. The callback acknowledges after saving an idempotent job; Vercel's `waitUntil` continues processing after the response. Jobs respect Strava quota pauses and resume through the existing worker. New work is selected ahead of archive jobs before the database row limit. Event reconciliation fetches the current Strava activity, verifies its owner, preserves manual classifications/exclusions, and handles out-of-order delivery. Revocation events cannot remove credentials from a later reconnect.

After deploying, register the callback once with:

```sh
npx vite-node --config vitest.config.ts scripts/register-strava-webhook.ts https://running-dashboard-three.vercel.app
```

The command uses the configured Strava app credentials, verifies the live callback, and leaves any different existing subscription untouched. Callback and verification tokens are separately derived from the server-only Strava client secret; do not share the full callback URL. Rotating that secret requires replacing the subscription through Strava. No database migration or more frequent Vercel cron plan is required. Failed deliveries remain durable jobs; retries can be delayed by quota limits or until the next worker invocation.

## CP calibration revision, 2026-09-13

`cp-hr40-v2` supersedes `cp-today-v1`. Model-version changes invalidate estimate
bundles, group estimate reads, worker keys and group briefings. Snapshots remain
separated by version, so this recalibration is not presented as fitness regression.
Older snapshot rows are retained. No SQL migration or environment change is needed.
The estimate explanation names both calibration changes.

The historical evaluation comparator remains explicitly pinned to full HR
adjustment plus synthetic transfers (`cp-today-v1`), preserving the previously
reported gate results. The new CP calibration is user-selected; it has not passed
a new independent multi-distance evaluation. Keep `EXPECTED_ESTIMATOR_ENABLED`
and `AUTO_ADAPT_ENABLED` disabled as before. On release, refresh connected
athletes' estimate bundles in bounded sequential work so group members do not
need to sign in themselves.


## Six-month evidence and conditions correction, 2026-09-13

`cp-evidence6m-v3` supersedes `cp-hr40-v2`, invalidating the same caches and
separating snapshot deltas. No migration or environment change is required.
The performance window is six calendar months; recent training load remains
60 days. Paginated evidence reads exclude manually excluded activities and
avoid transferring full raw payloads or archive streams. Only canonical race
streams are read in batches of ten for elapsed-distance/terrain checks.

Source heat is removed before fitting; usual-condition heat is applied once.
Ideal race constraints remove observed heat and, when usable, net terrain cost
from the measured profile. Same-condition constraints survive later endurance,
drift and form penalties. A hotter target can still be slower than a historical
race; an ideal-condition time should be faster than heat/hill-affected evidence.
Official results take precedence; GPS-distance efforts are explicitly labeled.

Terrain energy-to-time conversion and six-month maintained-capability assumptions
are not independently validated. These are user-requested CP corrections, not
a passing chronological-validation result. The historical evaluator and both
feature gates remain unchanged. See `lib/analysis/README.md` for limitations.


## Weather-qualified drift and gated personalization, 2026-09-13

`cp-weatherdrift-v4` keeps HR at 40%, the six-month performance window, and no
synthetic transfers. It removes unsupported finish-time penalties from hot or
unknown-condition HR drift and widens long-distance uncertainty instead. Raw
drift remains available to explanations. Cool, flat, steady, repeated evidence
can still support a penalty. Model-version invalidation prevents this correction
from appearing as a fitness improvement. No SQL migration is needed.

New, independent switches: `RACE_CALIBRATION_ENABLED` and
`MARATHON_ENDURANCE_ENABLED`. Both initially shipped off. Following the
owner’s explicit request after the four-member comparison, race calibration
now defaults **on**; marathon endurance remains **off**. The active version is
`cp-weatherdrift-v4-race1`. An explicit `RACE_CALIBRATION_ENABLED=false` rolls
calibration back. Version suffixes invalidate snapshots, jobs, briefs and caches.
The former learns modest per-distance residuals from exclusive pre-race replays;
the latter models marathon durability from half-marathon capability and 12
complete training weeks. These hypotheses have not passed the validation gate.

The local retrospective corpus contains seven recorded races and insufficient
usable pre-race pairs to establish held-out accuracy. Race calibration is an
explicit owner-authorized override of this gate, not a validated model. It has
no effect without qualifying personal pairs; self-assessed target times do not
enter the fit. Marathon endurance stays disabled pending validation. Use
`npm run evaluate:personalization -- /private/path/corpus.json /private/path/report.json`.
Corpora contain personal activity data and must remain outside git. Entries
contain `runs`, `efforts`, `maxHr`, and an array of `conditions` keyed by
`activity_id`. `loadCalibrationCorpus` provides the bounded read-only exporter
input; serialize its conditions Map to an array.

The gate requires at least ten training and ten held-out predictions, at least
three held-out predictions at each relevant distance and five maximal-effort
labels, with non-worsening absolute error and reduced optimistic bias. Missing
conditions/course/effort labels are not fabricated. Current profile/classification
edits were not historically versioned, so retrospective results have that limit.
