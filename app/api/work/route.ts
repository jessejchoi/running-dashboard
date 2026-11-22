import { NextResponse } from 'next/server'
import { getAthleteId, renewSession } from '@/lib/auth'
import { queueAthleteWork, runWorker } from '@/lib/worker'
export async function POST() {
  const id = await getAthleteId()
  if (!id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let response: NextResponse
  try {
    const groupIds = await queueAthleteWork(Number(id))
    const ran = await runWorker({
      athleteId: Number(id),
      groupIds,
      budgetMs: 15000,
    })
    response = NextResponse.json({ ok: true, ran })
  } catch {
    response = NextResponse.json(
      { error: 'Background work will retry.' },
      { status: 503 },
    )
  }
  // The open app polls this every minute, so a runner who uses it stays signed in.
  await renewSession(response)
  return response
}

export const maxDuration = 60
