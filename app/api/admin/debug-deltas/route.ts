import { getAthleteId } from '@/lib/auth'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase'
import { fetchDeltas } from '@/lib/estimateSnapshots'

export async function GET() {
  const cookieStore = cookies()
  const athleteId = await getAthleteId()
  if (!athleteId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const id = Number(athleteId)

  // Raw snapshot rows
  const { data: rows, error } = await supabaseAdmin
    .from('estimate_snapshots')
    .select('*')
    .eq('athlete_id', id)
    .order('snapshotted_at', { ascending: false })

  // Current estimates (dummy — just to test fetchDeltas shape)
  const current: Record<string, number | null> = {
    '5k': 1411, '10k': 3014, 'hm': 7293, 'fm': 16746,
  }

  const deltas = await fetchDeltas(id, current)

  return NextResponse.json({ rows, error: error?.message ?? null, deltas })
}
