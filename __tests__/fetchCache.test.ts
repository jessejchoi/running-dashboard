import { afterEach, describe, expect, it, vi } from 'vitest'

// Next.js 14 caches server-side fetches unless told not to; cron jobs got stale
// database rows and dropped writes that way. Every database and Strava request
// must opt out.
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.resetModules()
})

function stubFetch() {
  const fetch = vi.fn(async () => new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } }))
  vi.stubGlobal('fetch', fetch)
  return fetch
}

describe('Next.js Data Cache opt-out', () => {
  it('sends every Supabase request with cache: no-store', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service')
    const fetch = stubFetch()
    const { supabase, supabaseAdmin } = await import('@/lib/supabase')
    await supabaseAdmin.from('activities').select('id')
    await supabaseAdmin.rpc('next_sync_athletes')
    await supabase.from('groups').select('id')
    expect(fetch).toHaveBeenCalledTimes(3)
    for (const [, init] of fetch.mock.calls as any[]) expect(init.cache).toBe('no-store')
  })

  it('sends every Strava request with cache: no-store', async () => {
    vi.doMock('@/lib/supabase', () => ({ supabaseAdmin: { rpc: vi.fn(async () => ({ error: null })) } }))
    const fetch = stubFetch()
    const { stravaFetch } = await import('@/lib/stravaBudget')
    await stravaFetch('https://www.strava.com/oauth/token', { method: 'POST', body: '{}' })
    expect((fetch.mock.calls[0] as any)[1]).toMatchObject({ method: 'POST', cache: 'no-store' })
  })

  it('runs the cron jobs dynamically', async () => {
    vi.doMock('@/lib/supabase', () => ({ supabaseAdmin: {} }))
    vi.doMock('@/lib/worker', () => ({}))
    vi.doMock('@/lib/history', () => ({}))
    vi.doMock('@/lib/strava', () => ({}))
    expect((await import('@/app/api/cron/sync/route')).dynamic).toBe('force-dynamic')
    expect((await import('@/app/api/cron/generate-challenges/route')).dynamic).toBe('force-dynamic')
  })
})
