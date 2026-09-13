import { getAthleteId } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { syncActivities } from '@/lib/strava'
import { cookies } from 'next/headers'

export async function POST(request: NextRequest) {
  const cookieStore = cookies()
  const athleteId = await getAthleteId()

  if (!athleteId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  try {
    const count = await syncActivities(Number(athleteId))
    return NextResponse.json({ synced: count })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
