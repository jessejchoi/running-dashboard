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
      'warmup', 'threshold', 'threshold', 'threshold', 'cooldown',
    ])
  })

  it('detects structured threshold reps and recoveries', () => {
    const splits = [365, 322, 350, 320, 360].map(p => split(p))
    expect(categorizeLaps(splits, 343, 'tempo')).toEqual([
      'warmup', 'tempo', 'recovery', 'tempo', 'cooldown',
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
      'warmup', 'steady', 'tempo', 'tempo', 'steady', 'cooldown',
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
      'easy', 'stride', 'recovery', 'stride', 'cooldown',
    ])
  })

  it('keeps plain easy and recovery runs steady unless there are clear outliers', () => {
    const splits = [372, 368, 374, 370].map(p => split(p))
    expect(categorizeLaps(splits, 371, 'easy')).toEqual([
      'easy', 'easy', 'easy', 'easy',
    ])
  })

  it('uses pace zones to classify workout intensity independent of run average', () => {
    const zones = {
      intervalMaxPace: 250,
      thresholdMaxPace: 300,
      tempoMaxPace: 325,
      easyMaxPace: 380,
      longRunThresholdKm: 14,
      source: 'training' as const,
    }
    const splits = [370, 318, 296, 245, 395].map(p => split(p))

    expect(categorizeLaps(splits, 345, 'tempo', { paceZones: zones })).toEqual([
      'warmup', 'tempo', 'threshold', 'interval', 'cooldown',
    ])
  })

  it('can use high HR to avoid treating hard steady work as easy', () => {
    const zones = {
      intervalMaxPace: 250,
      thresholdMaxPace: 300,
      tempoMaxPace: 325,
      easyMaxPace: 380,
      longRunThresholdKm: 14,
      source: 'training' as const,
    }
    const splits = [
      { ...split(350), average_heartrate: 172 },
      { ...split(348), average_heartrate: 174 },
      { ...split(352), average_heartrate: 176 },
    ]

    expect(categorizeLaps(splits, 350, 'easy', { paceZones: zones, maxHr: 190 })).toEqual([
      'tempo', 'tempo', 'tempo',
    ])
  })
})
