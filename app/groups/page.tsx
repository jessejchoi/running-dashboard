import { getAthleteId } from '@/lib/auth'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase'
import Nav from '@/components/Nav'
import GroupsPageClient from '@/components/GroupsPageClient'

export const dynamic = 'force-dynamic'

export default async function GroupsPage() {
  const athleteId = await getAthleteId()
  if (!athleteId) redirect('/')

  // Fetch groups this athlete belongs to + their primary group preference
  const [{ data: memberships }, { data: userProfile }] = await Promise.all([
    supabaseAdmin.from('group_members').select('group_id, role').eq('athlete_id', parseInt(athleteId)),
    supabaseAdmin.from('user_profiles').select('primary_group_id').eq('athlete_id', parseInt(athleteId)).maybeSingle(),
  ])

  const groupIds = (memberships ?? []).map(m => m.group_id)

  // If user is in any groups, redirect to their primary group (or first group)
  if (groupIds.length > 0) {
    const primaryGroupId = userProfile?.primary_group_id
    const targetId = groupIds.includes(primaryGroupId ?? '') ? primaryGroupId! : groupIds[0]
    redirect(`/group/${targetId}`)
  }

  // No groups — show empty state + create flow
  return (
    <div className="min-h-screen">
      <Nav />
      <GroupsPageClient initialGroups={[]} />
    </div>
  )
}
