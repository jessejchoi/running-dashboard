import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/headers', () => ({ cookies: vi.fn(() => ({ get: () => undefined })) }))
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: { from: vi.fn(), rpc: vi.fn() } }))
vi.mock('@/lib/worker', () => ({ queueAthleteWork: vi.fn(), runWorker: vi.fn() }))
vi.mock('@/lib/history', () => ({ startHistory: vi.fn() }))
vi.mock('@/lib/strava', () => ({ syncActivities: vi.fn() }))
vi.mock('@/lib/coachContext', () => ({ buildCoachContext: vi.fn() }))
vi.mock('@/lib/claude', () => ({ claudeMessage: vi.fn() }))
vi.mock('@/lib/coachMetrics', () => ({ persistCoachAuditEvent: vi.fn() }))

import { NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { isCronRequest } from '@/lib/auth'
import { GET as syncCron } from '@/app/api/cron/sync/route'
import { GET as challengesCron } from '@/app/api/cron/generate-challenges/route'
import { POST as generateChallenge } from '@/app/api/groups/[id]/challenges/generate/route'

const request = (url: string, auth?: string, method = 'GET') =>
  new NextRequest(url, { method, headers: auth ? { authorization: auth } : {} })

const savedSecret = process.env.CRON_SECRET
afterEach(() => {
  vi.unstubAllEnvs()
  vi.clearAllMocks()
  if (savedSecret === undefined) delete process.env.CRON_SECRET
  else process.env.CRON_SECRET = savedSecret
})

/** CRON_SECRET missing entirely: `Bearer ${process.env.CRON_SECRET}` is then "Bearer undefined". */
function unsetSecret() {
  delete process.env.CRON_SECRET
}

describe('isCronRequest', () => {
  it('accepts only the exact secret', () => {
    vi.stubEnv('CRON_SECRET', 'secret')
    expect(isCronRequest(request('http://x/', 'Bearer secret'))).toBe(true)
    expect(isCronRequest(request('http://x/', 'Bearer nope'))).toBe(false)
    expect(isCronRequest(request('http://x/'))).toBe(false)
  })

  it('rejects everything while CRON_SECRET is missing or empty, including "Bearer undefined"', () => {
    for (const clear of [unsetSecret, () => vi.stubEnv('CRON_SECRET', '')]) {
      clear()
      for (const auth of ['Bearer undefined', 'Bearer ', 'Bearer', undefined]) {
        expect(isCronRequest(request('http://x/', auth))).toBe(false)
      }
    }
  })
})

describe('cron routes', () => {
  const unsetCases = ['Bearer undefined', 'Bearer ']

  it('sync and generate-challenges refuse callers without the secret, before touching the database', async () => {
    vi.stubEnv('CRON_SECRET', 'secret')
    for (const handler of [syncCron, challengesCron]) {
      expect((await handler(request('http://x/api/cron', 'Bearer nope'))).status).toBe(401)
      expect((await handler(request('http://x/api/cron'))).status).toBe(401)
    }
    for (const clear of [unsetSecret, () => vi.stubEnv('CRON_SECRET', '')]) {
      clear()
      for (const handler of [syncCron, challengesCron]) {
        for (const auth of unsetCases) expect((await handler(request('http://x/api/cron', auth))).status).toBe(401)
      }
    }
    expect(supabaseAdmin.from).not.toHaveBeenCalled()
    expect(supabaseAdmin.rpc).not.toHaveBeenCalled()
  })

  it('challenge generation never treats "Bearer undefined" as the cron, so a signed-out caller is refused', async () => {
    unsetSecret()
    for (const auth of unsetCases) {
      const res = await generateChallenge(request('http://x/api/groups/g1/challenges/generate', auth, 'POST'), { params: { id: 'g1' } })
      expect(res.status).toBe(401)
    }
    expect(supabaseAdmin.from).not.toHaveBeenCalled()
  })
})
