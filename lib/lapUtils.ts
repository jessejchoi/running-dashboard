import {
  classifyRunSegments,
  segmentTypes,
  type RunSegmentOptions,
  type RunSegmentType,
  type SegmentLike,
} from '@/lib/run-segments'

export type LapType = RunSegmentType

export interface LapSegment {
  startSec: number
  endSec: number
  type: LapType
}

export function categorizeLaps(
  splits: SegmentLike[],
  avgPace: number,
  runType?: string | null,
  options: Omit<RunSegmentOptions, 'avgPace' | 'runType'> = {},
): LapType[] {
  return segmentTypes(splits, { ...options, avgPace, runType })
}

export function buildLapSegments(
  splits: SegmentLike[],
  avgPace: number,
  runType?: string | null,
  options: Omit<RunSegmentOptions, 'avgPace' | 'runType'> = {},
): LapSegment[] {
  return classifyRunSegments(splits, { ...options, avgPace, runType })
    .map(segment => ({
      startSec: segment.startSec,
      endSec: segment.endSec,
      type: segment.type,
    }))
}
