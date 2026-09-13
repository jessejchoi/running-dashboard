import { describe, it, expect, vi } from 'vitest'
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: { from: vi.fn() } }))
import { decodeCursor, listRuns } from '@/lib/activityLog'
import { quotaResume } from '@/lib/stravaBudget'
import { validateRace } from '@/lib/goalValidation'
import { parseTime, primaryRace } from '@/lib/goals'
import { localDate, weekStart } from '@/lib/calendar'
import { supabaseAdmin } from '@/lib/supabase'
import { createQueryChain } from './helpers/supabase'
describe('archive boundaries', () => {
  it('rejects cursor query injection', () =>
    expect(() =>
      decodeCursor(
        Buffer.from(JSON.stringify({ date: 'bad,or', id: 1 })).toString(
          'base64url',
        ),
      ),
    ).toThrow())
  it('requests only 51 summary rows regardless of requested archive size', async () => {
    const rows = Array.from({ length: 51 }, (_, i) => ({
      id: 10000 - i,
      start_date: '2026-09-01T00:00:00Z',
    }))
    const q = createQueryChain({ data: rows })
    vi.mocked(supabaseAdmin.from).mockReturnValue(q as any)
    const page = await listRuns(1, new URLSearchParams({ limit: '10000' }))
    expect(q.limit).toHaveBeenCalledWith(51)
    expect(page.items).toHaveLength(50)
    expect(decodeCursor(page.nextCursor)).toEqual({
      id: 9951,
      date: '2026-09-01T00:00:00Z',
    })
    expect(q.select.mock.calls[0][0].split(',')).not.toContain('raw')
    expect(q.select.mock.calls[0][0]).not.toContain('streams')
  })
  it('respects both short and daily application quota windows', () => {
    const now = Date.parse('2026-09-13T01:05:00Z')
    const h = new Headers({
      'x-readratelimit-limit': '100,1000',
      'x-readratelimit-usage': '95,990',
    })
    expect(quotaResume(h, now)).toBe(Date.parse('2026-09-14T00:00:01Z'))
  })
})
describe('goal semantics', () => {
  it('does not complete a goal based on its estimate', () =>
    expect(() =>
      validateRace({
        distance_key: '10k',
        label: 'Race',
        target_secs: 3000,
        race_date: '2026-10-01',
        status: 'completed',
      }),
    ).toThrow('actual result'))
  it('whitelists goal fields and rejects malformed clock times', () => {
    const value = validateRace({
      athlete_id: 999,
      distance_key: '10k',
      label: 'Race',
      target_secs: 3000,
      race_date: '2026-10-01',
    })
    expect(value).not.toHaveProperty('athlete_id')
    expect(parseTime('10:99')).toBe(0)
  })
  it('selects an explicit primary event or earliest upcoming race', () => {
    const goals = [
      { race_date: '2026-11-01' },
      { race_date: '2026-10-01' },
      { race_date: '2026-01-01', is_primary: true },
    ]
    expect(primaryRace(goals, '2026-09-13')?.race_date).toBe('2026-10-01')
  })
  it('uses Jakarta calendar weeks at UTC boundaries', () => {
    const d = localDate(new Date('2026-09-13T18:00:00Z'))
    expect(d).toBe('2026-09-14')
    expect(weekStart(d)).toBe(d)
  })
})
