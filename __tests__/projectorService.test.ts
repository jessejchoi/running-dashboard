import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createQueryChain } from './helpers/supabase'
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: { from: vi.fn() } }))
vi.mock('@/lib/analysis/criticalPace', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/analysis/criticalPace')>()
  return { ...actual, fitCriticalPace: vi.fn(() => null) }
})
import { supabaseAdmin } from '@/lib/supabase'
import { fitCriticalPace } from '@/lib/analysis/criticalPace'
import { fitForAthlete, loadRecentRaceAnchors } from '@/lib/analysis/projector-service'

let tables: Record<string, any[]>, queries: { table: string; chain: ReturnType<typeof createQueryChain> }[]
beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers().setSystemTime(new Date('2026-09-13T12:00:00Z'))
  tables = {}; queries = []
  vi.mocked(supabaseAdmin.from).mockImplementation(table => {
    const chain = createQueryChain({ data: table === 'user_profiles' ? { max_hr: 195 } : [], error: null })
    chain.then.mockImplementation((resolve: any) => {
      const [first, last] = chain.range.mock.calls[0] ?? [0, Infinity]
      return Promise.resolve({ data: (tables[table] ?? []).slice(first, last + 1), error: null }).then(resolve)
    })
    queries.push({ table, chain })
    return chain as any
  })
})
afterEach(() => { vi.useRealTimers() })

it('pages beyond 1,000 cached efforts, filters excluded/orphaned rows, and uses six-month bounds', async () => {
  tables.activities = Array.from({ length: 501 }, (_, i) => ({ id: i + 1, start_date: '2026-05-24', distance: 1000, moving_time: 600, excluded_from_analysis: i === 0 }))
  tables.activity_best_efforts = Array.from({ length: 1201 }, (_, i) => ({ activity_id: 2, duration_secs: 180 + i, best_pace_sec_per_km: 300, avg_hr: null, activity_start_date: '2026-05-24' }))
  tables.activity_best_efforts.push({ activity_id: 1, duration_secs: 9999, best_pace_sec_per_km: 100, activity_start_date: '2026-05-24' }, { activity_id: 999, duration_secs: 8888, best_pace_sec_per_km: 100, activity_start_date: '2026-05-24' })
  await fitForAthlete(7)
  const points = vi.mocked(fitCriticalPace).mock.calls[0][0]
  expect(points).toHaveLength(1201)
  expect(points.every(p => p.activityId === 2)).toBe(true)
  const effortQueries = queries.filter(q => q.table === 'activity_best_efforts')
  expect(effortQueries.map(q => q.chain.range.mock.calls[0])).toEqual([[0, 499], [500, 999], [1000, 1499]])
  expect(effortQueries[0].chain.gte).toHaveBeenCalledWith('activity_start_date', '2026-03-13T12:00:00.000Z')
  expect(effortQueries[0].chain.lte).toHaveBeenCalledWith('activity_start_date', '2026-09-13T12:00:00.000Z')
  expect(effortQueries[0].chain.order.mock.calls).toEqual([['activity_id'], ['duration_secs']])
  expect(queries.filter(q => q.table === 'activity_conditions')).toHaveLength(3)
})

it('normalizes source heat in both time and pace without losing the correction at envelope selection', async () => {
  tables.activities = [{ id: 2, start_date: '2026-08-23', distance: 5000, moving_time: 2000 }]
  tables.activity_best_efforts = [{ activity_id: 2, duration_secs: 1500, best_pace_sec_per_km: 300, avg_hr: null, activity_start_date: '2026-08-23' }]
  tables.activity_conditions = [{ activity_id: 2, wbgt_approx_c: 25 }]
  await fitForAthlete(7)
  const point = vi.mocked(fitCriticalPace).mock.calls[0][0][0]
  expect(point.durationSecs).toBeCloseTo(1500 / 1.0105)
  expect(point.paceSecPerKm).toBeCloseTo(300 / 1.0105)
  expect(point.adjustedPaceSecPerKm).toBe(point.paceSecPerKm)
  expect(point.durationSecs / point.paceSecPerKm).toBeCloseTo(5)
})

it('uses full elapsed race time when no official result or usable stream exists', async () => {
  tables.activities = [{ id: 2, start_date: '2026-05-24', distance: 10072, elapsed_time: 2991, moving_time: 2700 }]
  const anchors = await loadRecentRaceAnchors(7)
  expect(anchors).toMatchObject([{ observedSecs: 2991, source: 'full_elapsed', activityId: 2 }])
  const streamQuery = queries.find(q => q.chain.select.mock.calls[0][0].includes('streams->'))!
  expect(streamQuery.chain.select.mock.calls[0][0]).not.toContain('latlng')
  expect(streamQuery.chain.eq).toHaveBeenCalledWith('athlete_id', 7)
})
