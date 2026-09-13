import { supabaseAdmin } from '@/lib/supabase'

export async function groupRole(groupId: string, athleteId: number) {
  const { data, error } = await supabaseAdmin
    .from('group_members')
    .select('role')
    .eq('group_id', groupId)
    .eq('athlete_id', athleteId)
    .maybeSingle()
  if (error) throw error
  return data?.role as string | undefined
}
