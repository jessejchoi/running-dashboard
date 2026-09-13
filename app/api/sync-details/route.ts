import { getAthleteId } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { syncActivityDetails } from '@/lib/strava'
import { cookies } from 'next/headers'

export async function POST(request: NextRequest) {
  const cookieStore = cookies()
  const athleteId = await getAthleteId()

  if (!athleteId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const limit = Math.min(2,Math.max(1,Number(body.limit)||1))

  try {
    const count = await syncActivityDetails(Number(athleteId), limit)
    return NextResponse.json({ synced: count })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export const maxDuration = 60
