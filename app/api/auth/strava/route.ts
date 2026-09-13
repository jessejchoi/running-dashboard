import { NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'

export async function GET() {
  const clientId = process.env.STRAVA_CLIENT_ID
  const appUrl = process.env.NEXT_PUBLIC_APP_URL

  const redirectUri = `${appUrl}/api/auth/strava/callback`
  const scope = 'read,activity:read_all'

  // Generate a random state value for CSRF protection
  const state = crypto.randomUUID()

  const stravaAuthUrl = new URL('https://www.strava.com/oauth/authorize')
  stravaAuthUrl.searchParams.set('client_id', clientId!)
  stravaAuthUrl.searchParams.set('redirect_uri', redirectUri)
  stravaAuthUrl.searchParams.set('response_type', 'code')
  stravaAuthUrl.searchParams.set('approval_prompt', 'auto')
  stravaAuthUrl.searchParams.set('scope', scope)
  stravaAuthUrl.searchParams.set('state', state)

  const response = NextResponse.redirect(stravaAuthUrl.toString())
  response.headers.set('Cache-Control', 'no-store')
  response.cookies.set('strava_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600, // 10 minutes
    path: '/',
  })
  return response
}
