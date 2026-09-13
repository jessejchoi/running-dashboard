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

`criticalPace.ts` exports `CP_MODEL_VERSION` (`cp-evidence6m-v3`) and the retained HR
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
