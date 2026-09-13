import { NextResponse } from 'next/server'
import { getAthleteId } from '@/lib/auth'
import { queueAthleteWork, runWorker } from '@/lib/worker'
export async function POST() {
  const id = await getAthleteId()
  if (!id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    await queueAthleteWork(Number(id))
    await runWorker({ athleteId: Number(id), budgetMs: 15000 })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json(
      { error: 'Background work will retry.' },
      { status: 503 },
    )
  }
}

export const maxDuration = 60
