import { supabaseAdmin } from '@/lib/supabase'
import { localDate, weekStart, addDays } from '@/lib/calendar'
export async function trainingGoals(athleteId: number) {
  const { data, error } = await supabaseAdmin
    .from('training_goals')
    .select('*')
    .eq('athlete_id', athleteId)
  if (error) throw error
  return Promise.all(
    (data ?? []).map(async (g) => {
      const start = weekStart(localDate(new Date(), g.timezone))
      const end = addDays(start, 7)
      const { data: days, error } = await supabaseAdmin.rpc(
        'run_daily_totals',
        {
          p_athletes: [athleteId],
          p_from: addDays(start, -1),
          p_to: addDays(end, 1),
          p_timezone: g.timezone,
        },
      )
      if (error) throw error
      const progress = (days ?? [])
        .filter((d: any) => d.day >= start && d.day < end)
        .reduce(
          (s: number, d: any) =>
            s + Number(g.metric === 'distance' ? d.distance : d.runs),
          0,
        )
      return { ...g, progress, week_start: start }
    }),
  )
}
