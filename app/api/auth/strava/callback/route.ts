import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { syncActivities } from '@/lib/strava'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get('code')
  const error = searchParams.get('error')
  const appUrl = process.env.NEXT_PUBLIC_APP_URL

  if (error || !code) {
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

  // Save tokens to Supabase
  await supabaseAdmin.from('strava_tokens').upsert({
    athlete_id: athlete.id,
    access_token,
    refresh_token,
    expires_at,
    athlete_data: athlete,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'athlete_id' })

  // Kick off initial sync in background
  syncActivities(athlete.id).catch(console.error)

  // Set athlete_id cookie and redirect to dashboard
  const response = NextResponse.redirect(`${appUrl}/?syncing=true`)
  response.cookies.set('athlete_id', String(athlete.id), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365, // 1 year
  })

  return response
}
