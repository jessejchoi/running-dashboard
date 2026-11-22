import { createHash, randomBytes } from 'node:crypto'
import { cookies } from 'next/headers'
import type { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export const SESSION_COOKIE = 'rundash_session'
// How long a session survives without the app being opened; renewSession slides it forward.
export const SESSION_SECONDS = 60 * 60 * 24 * 90
// Renew at most once a day so the per-minute background poll rarely writes.
const RENEW_AFTER_SECONDS = 60 * 60 * 24
export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  maxAge: SESSION_SECONDS,
  path: '/',
}
export function sessionHash(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/** Only an opaque server-issued session can authorize access. Legacy IDs never do. */
export async function getAthleteId(): Promise<string | undefined> {
  const token = cookies().get(SESSION_COOKIE)?.value
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return undefined
  const { data, error } = await supabaseAdmin
    .from('app_sessions')
    .select('athlete_id')
    .eq('token_hash', sessionHash(token))
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()
  return !error && data ? String(data.athlete_id) : undefined
}

export async function createSession(athleteId: number): Promise<string> {
  const token = randomBytes(32).toString('hex')
  const { error } = await supabaseAdmin.from('app_sessions').insert({
    token_hash: sessionHash(token),
    athlete_id: athleteId,
    expires_at: new Date(Date.now() + SESSION_SECONDS * 1000).toISOString(),
  })
  if (error) throw new Error('Could not create session')
  return token
}

/**
 * Extends the caller's live session to a full SESSION_SECONDS from now, so a
 * runner who keeps opening the app stays signed in. Expired or revoked
 * sessions are never revived: only a row that is still valid is extended.
 */
export async function renewSession(response: NextResponse): Promise<void> {
  const token = cookies().get(SESSION_COOKIE)?.value
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return
  const now = Date.now()
  const { data, error } = await supabaseAdmin
    .from('app_sessions')
    .update({ expires_at: new Date(now + SESSION_SECONDS * 1000).toISOString() })
    .eq('token_hash', sessionHash(token))
    .gt('expires_at', new Date(now).toISOString())
    .lt('expires_at', new Date(now + (SESSION_SECONDS - RENEW_AFTER_SECONDS) * 1000).toISOString())
    .select('token_hash')
  if (error || !data?.length) return
  response.cookies.set(SESSION_COOKIE, token, SESSION_COOKIE_OPTIONS)
}
