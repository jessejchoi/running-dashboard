import { NextRequest, NextResponse } from 'next/server'
import { syncActivityDetails } from '@/lib/strava'
import { cookies } from 'next/headers'

export async function POST(request: NextRequest) {
  const cookieStore = cookies()
  const athleteId = cookieStore.get('athlete_id')?.value

  if (!athleteId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const limit = body.limit ?? 50

  try {
    const count = await syncActivityDetails(Number(athleteId), limit)
    return NextResponse.json({ synced: count })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
