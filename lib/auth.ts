import { createHash, randomBytes } from 'node:crypto'
import { cookies } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase'

export const SESSION_COOKIE = 'rundash_session'
export const SESSION_SECONDS = 60 * 60 * 24 * 30
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
