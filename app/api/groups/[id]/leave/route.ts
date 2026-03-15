import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { cookies } from 'next/headers'

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const athleteId = cookies().get('athlete_id')?.value
  if (!athleteId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  // Check membership
  const { data: membership } = await supabaseAdmin
    .from('group_members')
    .select('role')
    .eq('group_id', params.id)
    .eq('athlete_id', parseInt(athleteId))
    .maybeSingle()

  if (!membership) return NextResponse.json({ error: 'Not a member of this group' }, { status: 404 })
  if (membership.role === 'admin') {
    return NextResponse.json({ error: 'Admins cannot leave — delete the group instead' }, { status: 400 })
  }

  const { error } = await supabaseAdmin
    .from('group_members')
    .delete()
    .eq('group_id', params.id)
    .eq('athlete_id', parseInt(athleteId))

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
