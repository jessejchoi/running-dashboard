# Analysis Architecture

Race prediction is split into source-specific engine modules plus one app
service layer:

- `engine.ts` orchestrates the pure analyzers. It accepts already-fetched run data and returns race estimates, contributors, confidence, and source details.
- `intervals.ts`, `threshold.ts`, `longRuns.ts`, `easyRuns.ts`, and `races.ts` contain source-specific prediction logic.
- `combine.ts` contains source weighting, recency weighting, direct-race handling, and final 5K/10K/HM/FM blending.
- `types.ts`, `formatting.ts`, `riegel.ts`, `physiology.ts`, `steadyWindows.ts`, and `laps.ts` contain shared pure helpers.
- `service.ts` contains app infrastructure around the engine: Supabase queries, goal/max-HR lookup, safe engine execution, JSON-safe combined estimates, and common estimate summaries.

Keep prediction math and source-specific analysis pure whenever possible. Pages,
API routes, snapshots, and group batching should use the service layer or shared
constants instead of duplicating run-type buckets and query shapes.

The public import path for engine helpers remains:

```ts
import { analyzeAllAndCombine, formatTime } from '@/lib/analysis'
```

Use submodules for infrastructure:

```ts
import { getAthleteAnalysis } from '@/lib/analysis/service'
import { ANALYSIS_RUN_TYPES } from '@/lib/analysis/constants'
```

## Current CP calibration

`criticalPace.ts` exports `CP_MODEL_VERSION` (`cp-weatherdrift-v4`) and the retained HR
adjustment fraction (0.4). Each eligible effort keeps 40% of its original capped
pace reduction, before duration selection and fitting. Reapplying the adjustment
starts from observed pace, so gains do not compound. The default envelope selects
existing fastest-duration points without synthetic cross-duration transfers.
The asymmetric fitting objective remains unchanged.

`projector-service.ts` uses six calendar months of performance evidence. Queries
page 500 summaries/efforts at a time, with stable ordering, an upper as-of bound,
and excluded/orphaned effort filtering. It does not enrich the archive. Training
features still use 60 days (form uses 7/28 days), so extending race evidence does
not dilute current training load with six-month averages.

Observed effort heat is removed before fitting; target heat is applied once
in `projector.ts`. The existing distance-dependent WBGT heuristic is shared by
source normalization. Normalizing time and pace preserves distance. Unknown
weather earns no credit. One point per original duration is selected after
normalization to keep overlapping efforts from multiplying fit contributions.

Race constraints prefer a saved official result. Otherwise, a verified complete
elapsed-clock stream can provide a measured canonical-distance effort; without
it, the full elapsed result is used. A measured effort remains distinct from an
official result and never overwrites it. Constraints apply after endurance,
drift and form modifiers, in the same target conditions as the curve. All race
candidates are compared after normalization, rather than selecting the fastest
raw clock first. Evidence records retain activity, date and timing source.

For race constraints with a complete road-like grade profile, both climbs and
descents contribute to a distance-weighted Minetti energy-cost approximation
(https://doi.org/10.1152/japplphysiol.01177.2001). Translating energy cost to time
assumes equal metabolic power; it is not a validated athlete-specific time
saving. Missing/invalid profiles, grades over 15%, or aggregate corrections
outside 0.95–1.05 get no terrain correction. Ordinary cached workout segments
still lack terrain normalization. No bonus is invented for reported submaximal
effort. Six-month race constraints assume maintained capability; older evidence
is not proof of unchanged fitness after illness, injury or detraining.

`expected.ts` supplies the active version to caches, jobs, snapshots and group
briefings. The optional observed estimator remains independently gated. Historical
evaluation of `cp-today-v1` explicitly requests full HR adjustment and legacy
synthetic transfers; production callers use the new defaults.


## Weather-qualified drift and personal calibration

`qualifiedDrift.ts` keeps the original raw/excess HR drift for context. Finish-time
penalties require at least three easy/steady outdoor runs with known WBGT ≤18°C,
consistent pacing and recorded mild terrain. The median eligible excess drift
feeds the existing distance-specific penalty. Hot, indoor, unknown-weather,
variable-pace and unsupported-terrain readings do not become cool-condition
endurance penalties. With insufficient eligible readings the central drift
multiplier is 1, but uncertainty increases (at least ±8% HM / ±15% marathon),
and long-distance confidence is low. This is missing evidence, not proof of
excellent endurance. Thresholds and intervals are heuristics, not calibrated
probabilities; the algorithm cannot identify dehydration from run summaries.

The regular training-feature loader pages summaries/splits over 98 days to cover
12 complete Jakarta weeks, then restricts aerobic/form/drift features back to
60 days. It never enriches archive streams. `cpCorpus.ts` is the shared pure fit
used by both live estimates and exclusive pre-race replays. Historical legacy
evaluation still calls the unchanged raw `extractDrift` directly.

`RACE_CALIBRATION_ENABLED=true` adds `-race1` to the model/cache version. The
calibration loader reads at most 12 months of cached summaries, splits and effort
rows in bounded pages, then replays at most 12 recent qualifying races locally.
Each prediction sees only earlier activities. Personal residuals are specific to
each race distance, deduplicated by activity, recency-weighted (90-day half-life),
robustly combined and shrunk toward neutral using four pseudo-observations. Log
residuals are capped at ±0.10. Official/full elapsed results are equality labels
only when recorded Strava perceived exertion is 9–10; unknown/lower effort can
only demonstrate faster capability. Missing weather or unsupported course
profiles are excluded from calibration. Measured fastest-distance segments stay
demonstrated-performance constraints and never become equality calibration labels.
The calibration uses a pre-constraint core prediction and applies its correction
before the current demonstrated-race constraint. For marathon calibration the
pre-race replay includes the half-marathon correction known at that time.

`MARATHON_ENDURANCE_ENABLED=true` adds `-marathon1`. Its candidate model starts
from the projected half-marathon and estimates additional distance-related
fatigue using 12 complete local weeks: average distance, consistent weeks,
repeated 90/120-minute runs, 25/30-km runs, and late-run pace fade from at least three comparable cool, steady, flat runs of 90+ minutes. Missing pace-fade evidence widens uncertainty rather than inventing a pace penalty. Separate runs on the same date are
never merged into a long run. Missing weeks remain zeros; insufficient history
returns no candidate. Marathon drift/form/longest-run penalties are not stacked
on this second model. The explicit fatigue-exponent coefficients are hypotheses
requiring held-out validation; they are not published Vickers coefficients.
The research motivates evaluating volume plus prior performance, not those exact
weights: https://doi.org/10.1186/s13102-016-0052-y.

Both new switches default off and remain off after the September 13 evaluation:
seven recorded races yielded insufficient qualified historical prediction pairs.
Run `npm run evaluate:personalization -- corpus.json report.json` to reevaluate.
The report separates chronological training/held-out data, distance, evidence
quality and optimistic/absolute error. No athlete targets are training labels.
The weather bug fix is deployed independently. Estimate bundle persistence,
existing leased estimate workers and data-version checks also cover calibration;
there is no extra schema, per-race network loop or new Strava request.
