import { NextRequest, NextResponse } from 'next/server'
import { getAthleteId } from '@/lib/auth'
import { groupRole } from '@/lib/groupAccess'
import { getBriefing } from '@/lib/groupCoach'
export type { BriefingContent } from '@/lib/coachOutputs'
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const id = await getAthleteId()
  if (!id)
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (!(await groupRole(params.id, Number(id))))
    return NextResponse.json({ error: 'Not a member' }, { status: 403 })
  try {
    return NextResponse.json(await getBriefing(params.id))
  } catch {
    return NextResponse.json(
      { error: 'Coach is taking a rest day.' },
      { status: 503 },
    )
  }
}
