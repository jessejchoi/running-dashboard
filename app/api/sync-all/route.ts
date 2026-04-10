import { NextRequest, NextResponse } from 'next/server'
import { syncActivities, syncActivityDetails } from '@/lib/strava'
import { updateLatestEstimates } from '@/lib/latestEstimates'
import { cookies } from 'next/headers'

/**
 * Sync all recent runs in one shot:
 * 1. Fetch new activities from Strava (stops as soon as it hits already-known IDs)
 * 2. Fetch lap + HR details for any run that doesn't have them yet
 */
export async function POST(request: NextRequest) {
  const cookieStore = cookies()
  const athleteId = cookieStore.get('athlete_id')?.value
  if (!athleteId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  try {
    const newRuns = await syncActivities(Number(athleteId))
    const detailsSynced = await syncActivityDetails(Number(athleteId), 30)
    // Re-run analysis whenever new runs were synced (after detail sync so run_type is set)
    if (newRuns > 0) await updateLatestEstimates(Number(athleteId))
    return NextResponse.json({ newRuns, detailsSynced })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
