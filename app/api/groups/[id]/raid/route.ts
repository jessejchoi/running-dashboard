import { NextRequest, NextResponse } from 'next/server'
import { getAthleteId } from '@/lib/auth'
import { groupRole } from '@/lib/groupAccess'
import { loadRaidState } from '@/lib/raidData'

export const dynamic = 'force-dynamic'

/** The Raid tab's data: boss, attack, roster and last week's report. */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const athleteId = await getAthleteId()
  if (!athleteId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (!(await groupRole(params.id, parseInt(athleteId)))) {
    return NextResponse.json({ error: 'Not a member' }, { status: 403 })
  }
  const view = await loadRaidState(params.id)
  if (!view) return NextResponse.json({ enabled: false })
  return NextResponse.json({ enabled: true, view })
}
