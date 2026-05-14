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
