import { describe, expect, it } from 'vitest'
import { getBestChallengeEffort } from '@/lib/challengeUtils'

describe('getBestChallengeEffort', () => {
  it('prefers the faster manual lap over the best 1 km split', () => {
    const effort = getBestChallengeEffort({
      id: 101,
      laps: [
        { distance: 400, moving_time: 100, average_speed: 4.0 },
        { distance: 600, moving_time: 120, average_speed: 5.0 },
      ],
      splits: [
        { distance: 1000, moving_time: 250, average_speed: 4.0 },
      ],
    })

    expect(effort?.source).toBe('lap')
    expect(effort?.activityId).toBe(101)
    expect(effort?.paceSecPerKm).toBeCloseTo(200)
  })

  it('falls back to the fastest 1 km split when no valid user laps exist', () => {
    const effort = getBestChallengeEffort({
      id: 202,
      laps: [
        { distance: 1000, moving_time: 240, average_speed: 4.1667 },
      ],
      splits: [
        { distance: 1000, moving_time: 235, average_speed: 4.2553 },
        { distance: 1000, moving_time: 245, average_speed: 4.0816 },
      ],
    })

    expect(effort?.source).toBe('split_1km')
    expect(effort?.activityId).toBe(202)
    expect(effort?.paceSecPerKm).toBeCloseTo(235, 1)
  })

  it('accepts a single valid lap when split data is absent', () => {
    const effort = getBestChallengeEffort({
      id: 303,
      laps: [
        { distance: 5000, moving_time: 1200, average_speed: 4.1667 },
      ],
      splits: [],
    })

    expect(effort?.source).toBe('lap')
    expect(effort?.activityId).toBe(303)
    expect(effort?.paceSecPerKm).toBeCloseTo(240, 1)
  })
})
