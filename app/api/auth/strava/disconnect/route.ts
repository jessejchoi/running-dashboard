import { getAthleteId, SESSION_COOKIE } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  const athleteIdCookie = await getAthleteId()
  if (!athleteIdCookie) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const athleteId = Number(athleteIdCookie)

  // Fetch current token so we can revoke it with Strava
  const { data: tokenRow } = await supabaseAdmin
    .from('strava_tokens')
    .select('access_token')
    .eq('athlete_id', athleteId)
    .maybeSingle()

  // Best-effort token revocation with Strava — don't fail if this errors
  if (tokenRow?.access_token) {
    try {
      await fetch('https://www.strava.com/oauth/deauthorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_token: tokenRow.access_token }),
      })
    } catch {
      // Ignore revocation errors — proceed with local disconnect
    }
  }

  // Delete strava_tokens row (user_profiles and activities are preserved)
  await supabaseAdmin
    .from('strava_tokens')
    .delete()
    .eq('athlete_id', athleteId)

  const { error: sessionError } = await supabaseAdmin.from('app_sessions').delete().eq('athlete_id', athleteId)
  if (sessionError) return NextResponse.json({ error: 'Could not revoke sessions' }, { status: 503 })

  // Clear auth cookies
  const response = NextResponse.json({ ok: true })
  response.cookies.set(SESSION_COOKIE, '', { maxAge: 0, path: '/' })
  response.cookies.set('athlete_id', '', { maxAge: 0, path: '/' })
  response.cookies.set('unit_pref', '', { maxAge: 0, path: '/' })
  return response
}
