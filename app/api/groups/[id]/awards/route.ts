import { getAthleteId } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase'
import { AWARD_CATEGORIES, isValidAwardKey } from '@/lib/awards'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const athleteId = await getAthleteId()
  if (!athleteId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: membership } = await supabaseAdmin
    .from('group_members')
    .select('role')
    .eq('group_id', params.id)
    .eq('athlete_id', parseInt(athleteId))
    .maybeSingle()

  if (!membership) return NextResponse.json({ error: 'Not a member' }, { status: 403 })

  const weeks = Math.min(12, parseInt(req.nextUrl.searchParams.get('weeks') ?? '4'))
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - weeks * 7)
  const cutoffDate = cutoff.toISOString().split('T')[0]

  const { data: awards } = await supabaseAdmin
    .from('group_member_awards')
    .select('id, athlete_id, award_key, award_label, week_start, caption')
    .eq('group_id', params.id)
    .gte('week_start', cutoffDate)
    .order('week_start', { ascending: false })

  const athleteIds = Array.from(new Set((awards ?? []).map(a => a.athlete_id)))
  let tokenMap: Record<number, { name: string; profile_pic: string | null }> = {}

  if (athleteIds.length > 0) {
    const { data: tokens } = await supabaseAdmin
      .from('strava_tokens')
      .select('athlete_id, athlete_name, athlete_profile')
      .in('athlete_id', athleteIds)

    tokenMap = Object.fromEntries(
      (tokens ?? []).map(t => [t.athlete_id, { name: t.athlete_name, profile_pic: t.athlete_profile ?? null }])
    )
  }

  const result = (awards ?? []).map(a => ({
    id: a.id,
    athlete_id: a.athlete_id,
    athlete_name: tokenMap[a.athlete_id]?.name ?? `Athlete ${a.athlete_id}`,
    athlete_profile: tokenMap[a.athlete_id]?.profile_pic ?? null,
    award_key: a.award_key,
    award_label: a.award_label,
    emoji: isValidAwardKey(a.award_key) ? AWARD_CATEGORIES[a.award_key].emoji : '🏆',
    week_start: a.week_start,
    caption: a.caption,
  }))

  return NextResponse.json({ awards: result })
}
