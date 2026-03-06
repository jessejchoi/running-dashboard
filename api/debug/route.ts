import { NextResponse } from 'next/server'

export async function GET() {
  const clientId = process.env.STRAVA_CLIENT_ID
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  const redirectUri = `${appUrl}/api/auth/strava/callback`

  return NextResponse.json({
    clientId,
    appUrl,
    redirectUri,
  })
}
