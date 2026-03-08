import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase'
import Nav from '@/components/Nav'
import GroupsPageClient from '@/components/GroupsPageClient'

export const revalidate = 60

export default async function GroupsPage() {
  const athleteId = cookies().get('athlete_id')?.value
  if (!athleteId) redirect('/')

  // Fetch groups this athlete belongs to
  const { data: memberships } = await supabaseAdmin
    .from('group_members')
    .select('group_id, role')
    .eq('athlete_id', parseInt(athleteId))

  const groupIds = (memberships ?? []).map(m => m.group_id)

  let groups: any[] = []
  if (groupIds.length > 0) {
    const { data } = await supabaseAdmin
      .from('groups')
      .select('*')
      .in('id', groupIds)
      .order('created_at', { ascending: true })
    groups = data ?? []

    // Fetch member counts
    const { data: allMembers } = await supabaseAdmin
      .from('group_members')
      .select('group_id, athlete_id')
      .in('group_id', groupIds)

    for (const g of groups) {
      g.member_count = (allMembers ?? []).filter(m => m.group_id === g.id).length
      g.my_role = memberships?.find(m => m.group_id === g.id)?.role ?? 'member'
    }
  }

  return (
    <div className="min-h-screen">
      <Nav />
      <GroupsPageClient initialGroups={groups} />
    </div>
  )
}
