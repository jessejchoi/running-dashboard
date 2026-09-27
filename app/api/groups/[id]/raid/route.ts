import { NextRequest, NextResponse } from 'next/server'
import { getAthleteId } from '@/lib/auth'
import { groupRole } from '@/lib/groupAccess'
import { validDate } from '@/lib/calendar'
import { loadRaidState } from '@/lib/raidData'

export const dynamic = 'force-dynamic'

/**
 * Local development only: `?at=YYYY-MM-DD` shows the raid as of that day
 * (midday UTC), to check future weeks. It never freezes rows.
 */
function simulatedNow(req: NextRequest): Date | null {
  if (process.env.NODE_ENV !== 'development') return null
  const at = req.nextUrl.searchParams.get('at')
  return at && validDate(at) ? new Date(`${at}T12:00:00Z`) : null
}

/** The Raid tab's data: boss, attack, roster, raid history and last week's report. */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const athleteId = await getAthleteId()
  if (!athleteId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (!(await groupRole(params.id, parseInt(athleteId)))) {
    return NextResponse.json({ error: 'Not a member' }, { status: 403 })
  }
  const at = simulatedNow(req)
  const view = at ? await loadRaidState(params.id, at, { freeze: false }) : await loadRaidState(params.id)
  if (!view) return NextResponse.json({ enabled: false })
  return NextResponse.json({ enabled: true, view })
}
