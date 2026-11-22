import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('next/headers', () => ({ cookies: vi.fn() }))
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: { from: vi.fn() } }))
import { cookies } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase'
import { NextResponse } from 'next/server'
import { getAthleteId, renewSession, sessionHash, SESSION_COOKIE, SESSION_SECONDS } from '@/lib/auth'
import { createQueryChain } from './helpers/supabase'
beforeEach(() => {
  vi.clearAllMocks()
})
describe('server sessions', () => {
  it('never authorizes a plain athlete id', async () => {
    vi.mocked(cookies).mockReturnValue({
      get: (k: string) => (k === 'athlete_id' ? { value: '123' } : undefined),
    } as any)
    expect(await getAthleteId()).toBeUndefined()
    expect(supabaseAdmin.from).not.toHaveBeenCalled()
  })
  it('hashes an opaque session and enforces expiry in the database', async () => {
    const token = 'a'.repeat(64)
    vi.mocked(cookies).mockReturnValue({ get: () => ({ value: token }) } as any)
    const chain = createQueryChain({ data: { athlete_id: 123 }, error: null })
    vi.mocked(supabaseAdmin.from).mockReturnValue(chain as any)
    expect(await getAthleteId()).toBe('123')
    expect(chain.eq).toHaveBeenCalledWith('token_hash', sessionHash(token))
    expect(chain.gt).toHaveBeenCalledWith('expires_at', expect.any(String))
  })
  it('fails closed for missing sessions', async () => {
    vi.mocked(cookies).mockReturnValue({
      get: () => ({ value: 'b'.repeat(64) }),
    } as any)
    vi.mocked(supabaseAdmin.from).mockReturnValue(
      createQueryChain({ data: null }) as any,
    )
    expect(await getAthleteId()).toBeUndefined()
  })
})

describe('session renewal', () => {
  const token = 'c'.repeat(64)
  beforeEach(() => {
    vi.mocked(cookies).mockReturnValue({ get: () => ({ value: token }) } as any)
  })
  it('slides a live session forward and re-issues the cookie', async () => {
    const chain = createQueryChain({ data: [{ token_hash: sessionHash(token) }], error: null })
    vi.mocked(supabaseAdmin.from).mockReturnValue(chain as any)
    const response = NextResponse.json({ ok: true })
    const before = Date.now()
    await renewSession(response)
    const [{ expires_at }] = chain.update.mock.calls[0]
    expect(Date.parse(expires_at)).toBeGreaterThanOrEqual(before + SESSION_SECONDS * 1000)
    expect(chain.eq).toHaveBeenCalledWith('token_hash', sessionHash(token))
    // Only a session that is still valid can be extended.
    expect(chain.gt).toHaveBeenCalledWith('expires_at', expect.any(String))
    expect(response.cookies.get(SESSION_COOKIE)?.value).toBe(token)
  })
  it('leaves the cookie alone when no live session needed renewing', async () => {
    vi.mocked(supabaseAdmin.from).mockReturnValue(createQueryChain({ data: [], error: null }) as any)
    const response = NextResponse.json({ ok: true })
    await renewSession(response)
    expect(response.cookies.get(SESSION_COOKIE)).toBeUndefined()
  })
  it('never touches the database for a malformed cookie', async () => {
    vi.mocked(cookies).mockReturnValue({ get: () => ({ value: '123' }) } as any)
    await renewSession(NextResponse.json({ ok: true }))
    expect(supabaseAdmin.from).not.toHaveBeenCalled()
  })
})

it('issues a fresh uncached OAuth state for each sign-in', async () => {
  const { GET, dynamic } = await import('@/app/api/auth/strava/route')
  const a = await GET(),
    b = await GET()
  expect(dynamic).toBe('force-dynamic')
  expect(a.headers.get('cache-control')).toBe('no-store')
  const stateA = new URL(a.headers.get('location')!).searchParams.get('state')
  const stateB = new URL(b.headers.get('location')!).searchParams.get('state')
  expect(stateA).toBeTruthy()
  expect(stateA).not.toBe(stateB)
  expect(a.cookies.get('strava_state')?.value).toBe(stateA)
})
