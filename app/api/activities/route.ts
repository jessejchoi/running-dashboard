import { NextRequest, NextResponse } from 'next/server'
import { getAthleteId } from '@/lib/auth'
import { listRuns, SUMMARY_COLUMNS } from '@/lib/activityLog'
import { supabaseAdmin } from '@/lib/supabase'
export async function GET(req: NextRequest) {
  const id = await getAthleteId()
  if (!id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    if (req.nextUrl.searchParams.get('paged') === '1')
      return NextResponse.json(
        await listRuns(Number(id), req.nextUrl.searchParams),
      )
    const limit = Math.min(
      50,
      Math.max(1, Number(req.nextUrl.searchParams.get('limit') ?? 50) || 50),
    )
    const { data, error } = await supabaseAdmin
      .from('activities')
      .select(SUMMARY_COLUMNS)
      .eq('athlete_id', id)
      .eq('type', 'Run')
      .order('start_date', { ascending: false })
      .order('id', { ascending: false })
      .limit(limit)
    if (error) throw error
    return NextResponse.json(data ?? [])
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Unable to load activities' },
      { status: 400 },
    )
  }
}
