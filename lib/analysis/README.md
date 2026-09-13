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

`criticalPace.ts` exports `CP_MODEL_VERSION` (`cp-hr40-v2`) and the retained HR
adjustment fraction (0.4). Each eligible effort keeps 40% of its original capped
pace reduction, before duration selection and fitting. Reapplying the adjustment
starts from observed pace, so gains do not compound. The default envelope selects
existing fastest-duration points without synthetic cross-duration transfers.
The asymmetric fitting objective and projector modifiers are unchanged.

`expected.ts` supplies the active version to caches, jobs, snapshots and group
briefings. The optional observed estimator remains independently gated. Historical
evaluation of `cp-today-v1` explicitly requests full HR adjustment and legacy
synthetic transfers; production callers use the new defaults.
