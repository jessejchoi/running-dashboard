import { createSession, SESSION_COOKIE, SESSION_COOKIE_OPTIONS } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { startHistory } from '@/lib/history'
import { queueAthleteWork } from '@/lib/worker'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get('code')
  const error = searchParams.get('error')
  const state = searchParams.get('state')
  const appUrl = process.env.NEXT_PUBLIC_APP_URL

  if (error || !code) {
    return NextResponse.redirect(`${appUrl}/?error=strava_denied`)
  }

  // Validate state to prevent CSRF and detect cross-context OAuth (e.g. Android CCT issues)
  const expectedState = request.cookies.get('strava_state')?.value
  if (!expectedState || state !== expectedState) {
    return NextResponse.redirect(`${appUrl}/?error=strava_denied`)
  }

  // Exchange code for tokens
  const tokenRes = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      code,
      grant_type: 'authorization_code',
    }),
  })

  if (!tokenRes.ok) {
    return NextResponse.redirect(`${appUrl}/?error=token_exchange_failed`)
  }

  const tokenData = await tokenRes.json()
  const { athlete, access_token, refresh_token, expires_at } = tokenData

  let existingProfile: { athlete_id: number; unit: string } | null = null
  let stravaUnit: 'km' | 'miles' = 'km'

  try {
    // Save tokens to Supabase
    await supabaseAdmin.from('strava_tokens').upsert({
      athlete_id: athlete.id,
      access_token,
      refresh_token,
      expires_at,
      athlete_data: athlete,
      athlete_name: [athlete.firstname, athlete.lastname].filter(Boolean).join(' '),
      athlete_profile: athlete.profile_medium ?? athlete.profile ?? null,
      athlete_gender: athlete.sex ?? null,  // 'M' or 'F'
      updated_at: new Date().toISOString(),
    }, { onConflict: 'athlete_id' })

    // Seed or update user_profiles
    const pendingProfile = request.cookies.get('pending_profile')?.value
    const { data: existing } = await supabaseAdmin
      .from('user_profiles')
      .select('athlete_id, unit')
      .eq('athlete_id', athlete.id)
      .maybeSingle()

    existingProfile = existing
    stravaUnit = athlete.measurement_preference === 'feet' ? 'miles' : 'km'

    if (!existingProfile) {
      // New user — seed profile from Strava data
      const initialProfile: Record<string, unknown> = {
        athlete_id: athlete.id,
        display_name: [athlete.firstname, athlete.lastname].filter(Boolean).join(' ') || null,
        gender: athlete.sex ?? null,
        weight_kg: athlete.weight ? Number(athlete.weight) : null,
        unit: stravaUnit,
        updated_at: new Date().toISOString(),
      }
      // Merge onboarding fields on top (user-entered data takes precedence)
      if (pendingProfile) {
        try {
          const pending = JSON.parse(pendingProfile)
          if (pending.display_name) initialProfile.display_name = pending.display_name
          if (pending.age != null) initialProfile.age = pending.age
          if (pending.gender) initialProfile.gender = pending.gender
        } catch (e) {
          console.error('Failed to parse pending profile:', e)
        }
      }
      await supabaseAdmin.from('user_profiles').insert(initialProfile)
    } else if (pendingProfile) {
      // Existing user reconnecting — only apply onboarding overrides if present
      try {
        const pending = JSON.parse(pendingProfile)
        await supabaseAdmin.from('user_profiles').update({
          ...(pending.display_name && { display_name: pending.display_name }),
          ...(pending.age != null && { age: pending.age }),
          ...(pending.gender && { gender: pending.gender }),
          updated_at: new Date().toISOString(),
        }).eq('athlete_id', athlete.id)
      } catch (e) {
        console.error('Failed to save pending profile:', e)
      }
    }
  } catch (e) {
    console.error('Strava callback DB error:', e)
    return NextResponse.redirect(`${appUrl}/?error=sync_failed`)
  }

  // Kick off initial sync in background
  await supabaseAdmin.rpc('reconnect_history',{p_athlete:athlete.id})
  await startHistory(athlete.id)
  await queueAthleteWork(athlete.id)

  // Issue an opaque server session and retire the legacy identity cookie
  const response = NextResponse.redirect(`${appUrl}/?syncing=true`)
  // Clear the pending profile and state cookies
  response.cookies.set('pending_profile', '', { maxAge: 0, path: '/' })
  response.cookies.set('strava_state', '', { maxAge: 0, path: '/' })
  response.cookies.set('athlete_id', '', { maxAge: 0, path: '/' })
  response.cookies.set(SESSION_COOKIE, await createSession(athlete.id), SESSION_COOKIE_OPTIONS)
  // Set unit_pref for new users so units work immediately without visiting settings
  if (!existingProfile) {
    response.cookies.set('unit_pref', stravaUnit, {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 365,
      path: '/',
    })
  }

  return response
}
