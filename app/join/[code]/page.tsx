import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export default async function JoinPage({ params }: { params: { code: string } }) {
  const athleteId = cookies().get('athlete_id')?.value

  // Look up group by invite code
  const { data: group } = await supabaseAdmin
    .from('groups')
    .select('id, name')
    .eq('invite_code', params.code)
    .maybeSingle()

  // Not logged in → send to home (Strava login), then come back
  if (!athleteId) {
    redirect(`/?next=/join/${params.code}`)
  }

  // Group not found
  if (!group) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="text-4xl mb-2">🤔</div>
        <h1 className="font-display font-bold text-2xl">Invite not found</h1>
        <p className="text-[#6b7280] text-sm max-w-xs">
          This invite link is invalid or has expired. Ask your group admin for a new link.
        </p>
        <a href="/" className="text-[#f97316] text-sm hover:underline">Back to dashboard</a>
      </div>
    )
  }

  // Already a member?
  const { data: existing } = await supabaseAdmin
    .from('group_members')
    .select('id')
    .eq('group_id', group.id)
    .eq('athlete_id', parseInt(athleteId))
    .maybeSingle()

  if (!existing) {
    // Join the group
    await supabaseAdmin
      .from('group_members')
      .insert({ group_id: group.id, athlete_id: parseInt(athleteId), role: 'member' })
  }

  // Redirect to the group page
  redirect(`/group/${group.id}`)
}
