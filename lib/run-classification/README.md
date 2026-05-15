# Run Classification

This module owns the logic that turns raw activity data into a run type.

- `classifier.ts` contains the core automatic classifier.
- `raceDetection.ts` contains race-specific detection and matched-distance logic.
- `buckets.ts` maps run types into analysis buckets.
- `service.ts` contains persistence-oriented helpers for manual overrides and race fields.
- `types.ts` contains shared lightweight activity shapes used by the classifier.

Analysis code can consume the buckets and race detection helpers from here, but should keep
prediction math in `lib/analysis`.
