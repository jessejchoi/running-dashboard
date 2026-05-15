import { type RunType } from './types'

export const RUN_TYPE_BUCKETS = {
  intervals: ['intervals', 'interval_5k', 'interval_10k'],
  threshold: ['threshold', 'tempo'],
  // long_easy is intentionally analyzed through the easy bucket only, so it
  // does not contribute twice as both a long-run and aerobic-efficiency signal.
  long: ['long', 'long_steady', 'long_progressive'],
  easy: ['easy', 'easy_strides', 'long_easy', 'recovery'],
} as const

export type AnalysisRunTypeBucket = keyof typeof RUN_TYPE_BUCKETS

export function runTypesForBucket(bucket: AnalysisRunTypeBucket): readonly string[] {
  return RUN_TYPE_BUCKETS[bucket]
}

export function isManualRunType(value: unknown): value is RunType {
  return typeof value === 'string' && value in RUN_TYPE_LABEL_LOOKUP
}

const RUN_TYPE_LABEL_LOOKUP: Record<RunType, true> = {
  recovery: true,
  easy: true,
  easy_strides: true,
  tempo: true,
  threshold: true,
  long_easy: true,
  long_steady: true,
  long_progressive: true,
  intervals: true,
  treadmill: true,
  race: true,
}
