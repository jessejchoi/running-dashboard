import { describe, expect, it } from 'vitest'
import { categorizeLaps } from '@/lib/lapUtils'

function split(paceSecPerKm: number, moving_time: number = 300) {
  return { average_speed: 1000 / paceSecPerKm, moving_time, distance: 1000 }
}

describe('categorizeLaps', () => {
  it('detects warmup, reps, recoveries, and cooldown for intervals', () => {
    const splits = [360, 330, 250, 345, 248, 350, 365].map(p => split(p))
    expect(categorizeLaps(splits, 321, 'intervals')).toEqual([
      'warmup', 'warmup', 'interval', 'recovery', 'interval', 'recovery', 'cooldown',
    ])
  })

  it('detects a continuous threshold block with warmup and cooldown', () => {
    const splits = [360, 320, 318, 321, 355].map(p => split(p))
    expect(categorizeLaps(splits, 335, 'threshold')).toEqual([
      'warmup', 'interval', 'interval', 'interval', 'cooldown',
    ])
  })

  it('detects structured threshold reps and recoveries', () => {
    const splits = [365, 322, 350, 320, 360].map(p => split(p))
    expect(categorizeLaps(splits, 343, 'tempo')).toEqual([
      'warmup', 'interval', 'recovery', 'interval', 'cooldown',
    ])
  })

  it('treats long steady runs as warmup, steady middle, cooldown', () => {
    const splits = [380, 365, 362, 366, 382].map(p => split(p))
    expect(categorizeLaps(splits, 371, 'long_steady')).toEqual([
      'warmup', 'steady', 'steady', 'steady', 'cooldown',
    ])
  })

  it('detects faster blocks inside long runs with speed', () => {
    const splits = [380, 368, 345, 342, 367, 381].map(p => split(p))
    expect(categorizeLaps(splits, 364, 'long_progressive')).toEqual([
      'warmup', 'steady', 'interval', 'interval', 'steady', 'cooldown',
    ])
  })

  it('detects strides and their recoveries inside easy stride runs', () => {
    const splits = [
      split(370, 300),
      split(220, 25),
      split(390, 60),
      split(225, 25),
      split(380, 300),
    ]
    expect(categorizeLaps(splits, 325, 'easy_strides')).toEqual([
      'steady', 'interval', 'recovery', 'interval', 'cooldown',
    ])
  })

  it('keeps plain easy and recovery runs steady unless there are clear outliers', () => {
    const splits = [372, 368, 374, 370].map(p => split(p))
    expect(categorizeLaps(splits, 371, 'easy')).toEqual([
      'steady', 'steady', 'steady', 'steady',
    ])
  })
})
