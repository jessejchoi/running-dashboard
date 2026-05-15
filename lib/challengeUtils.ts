type SegmentLike = {
  average_speed?: number | null
  distance?: number | null
  moving_time?: number | null
  elapsed_time?: number | null
}

export interface ChallengeEffort {
  activityId: number
  averageSpeed: number
  paceSecPerKm: number
  distanceMeters: number
  durationSecs: number
  source: 'lap' | 'split_1km'
}

type ChallengeEffortCandidate = Omit<ChallengeEffort, 'activityId'>

function paceFrom(segment: SegmentLike) {
  const speed = segment.average_speed ?? 0
  if (!(speed > 0)) return null
  return {
    averageSpeed: speed,
    paceSecPerKm: 1000 / speed,
    distanceMeters: segment.distance ?? 0,
    durationSecs: segment.moving_time ?? segment.elapsed_time ?? 0,
  }
}

function bestKmSplit(splits: SegmentLike[]): ChallengeEffortCandidate | null {
  const candidates = splits
    .filter(sp => {
      const dist = sp.distance ?? 0
      return dist >= 800 && dist <= 1200 && (sp.average_speed ?? 0) > 0
    })
    .map(sp => paceFrom(sp))
    .filter((sp): sp is NonNullable<typeof sp> => sp !== null)

  if (candidates.length === 0) return null

  const best = candidates.reduce((fastest, cur) =>
    cur.averageSpeed > fastest.averageSpeed ? cur : fastest
  )

  return { ...best, source: 'split_1km' }
}

function bestUserLap(laps: SegmentLike[]): ChallengeEffortCandidate | null {
  const candidates = laps
    .filter(lap => {
      const dist = lap.distance ?? 0
      const dur = lap.moving_time ?? lap.elapsed_time ?? 0
      return dist >= 200 && dur >= 20 && (lap.average_speed ?? 0) > 0
    })
    .map(lap => paceFrom(lap))
    .filter((lap): lap is NonNullable<typeof lap> => lap !== null)

  if (candidates.length === 0) return null

  const best = candidates.reduce((fastest, cur) =>
    cur.averageSpeed > fastest.averageSpeed ? cur : fastest
  )

  return { ...best, source: 'lap' }
}

export function getBestChallengeEffort(activity: { id: number; laps?: SegmentLike[] | null; splits?: SegmentLike[] | null }) {
  const bestLap = bestUserLap(activity.laps ?? [])
  const bestKm = bestKmSplit(activity.splits ?? [])
  const best = !bestLap ? bestKm : !bestKm ? bestLap : (bestLap.averageSpeed >= bestKm.averageSpeed ? bestLap : bestKm)

  return best ? { activityId: activity.id, ...best } : null
}
