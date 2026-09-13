import { beforeEach, expect, it, vi } from 'vitest'
import { buildWeeklyEdition } from '@/lib/weeklyEdition'
import type { CoachContext } from '@/lib/coachContext'
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: { from: vi.fn(), rpc: vi.fn() } }))
vi.mock('@/lib/coachContext', () => ({ buildCoachContext: vi.fn() }))
vi.mock('@/lib/jobs', () => ({ enqueueJob: vi.fn(), claimJob: vi.fn(), finishJob: vi.fn() }))
vi.mock('@/lib/claude', () => ({ claudeMessage: vi.fn() }))
import { supabaseAdmin } from '@/lib/supabase'
import { buildCoachContext } from '@/lib/coachContext'
import { enqueueJob } from '@/lib/jobs'
import { publicGroupTraining, groupVersion, groupCoachModelVersion, getBriefing } from '@/lib/groupCoach'
import { createQueryChain } from './helpers/supabase'
import { GET, POST, PATCH, DELETE } from '@/app/api/groups/[id]/shared-runs/route'
const ctx = { today: '2026-09-14', members: [
  {athlete_id:1,name:'Jesse',this_week_km:5.5,run_count_this_week:1,rolling_4w_km:160,goals:[{label:'Past',days_to_race:-1},{label:'Upcoming 5K',days_to_race:10}]},
  {athlete_id:2,name:'Tim',this_week_km:0,run_count_this_week:0,rolling_4w_km:240,goals:[]},
] } as unknown as CoachContext
beforeEach(() => { vi.clearAllMocks() })
it('covers every member and excludes rest days, future sessions and other weeks from progress', () => {
  const session={athlete_id:1,plan_date:ctx.today,session_type:'easy',status:'completed'}
  const result=buildWeeklyEdition(ctx,[session,{...session,session_type:'rest'},{...session,plan_date:'2026-09-15'}, {...session,plan_date:'2026-09-13'}])
  expect(result).toMatchObject({week_start:'2026-09-14',total_km:5.5,total_runs:1})
  expect(result.members).toHaveLength(2)
  expect(result.members[0]).toMatchObject({baseline_weekly_km:40,completed:1,planned:1})
  expect(result.members[0].next_focus).toContain('Upcoming 5K: 10 days away')
  expect(result.members[1]).toMatchObject({km:0,runs:0,planned:0})
  expect(JSON.stringify(result)).not.toMatch(/decline|slacking|meet up|shared run/i)
})
it('returns a defined empty edition without inventing participants', () => {
  expect(buildWeeklyEdition({...ctx,members:[]},[])).toMatchObject({total_km:0,total_runs:0,members:[]})
})
it('reads public plan progress without shared events or private workout text', async () => {
  vi.mocked(supabaseAdmin.from).mockImplementation(table=>createQueryChain({data:table==='group_members'?[{athlete_id:1}]:table==='user_plans'?[{session_type:'rest'},{session_type:'easy'}]:null,error:null}) as any)
  expect((await publicGroupTraining('g')).plans).toEqual([{session_type:'easy'}])
  expect(vi.mocked(supabaseAdmin.from).mock.calls.map(c=>c[0])).toEqual(['group_members','user_plans','coach_memory'])
  const planQuery=vi.mocked(supabaseAdmin.from).mock.results[1].value
  expect(planQuery.select.mock.calls[0][0]).not.toMatch(/description|config|constraints/)
})
it('versions briefing jobs independently so an old coordination briefing is invalidated', async () => {
  vi.mocked(supabaseAdmin.rpc).mockResolvedValue({data:'version',error:null} as any)
  expect(await groupVersion('g')).toBe('version')
  expect(supabaseAdmin.rpc).toHaveBeenCalledWith('group_input_version',{p_group:'g',p_model:groupCoachModelVersion()})
  expect(groupCoachModelVersion()).toContain(':weekly-edition-v1')
})
it('rejects all retired shared-run operations for old clients', async () => {
  for(const handler of [GET,POST,PATCH,DELETE])expect(handler().status).toBe(410)
  expect(supabaseAdmin.from).not.toHaveBeenCalled()
})

it('replaces a retired coordination briefing with current deterministic content during refresh', async () => {
  vi.mocked(supabaseAdmin.rpc).mockResolvedValue({data:'current-version',error:null} as any)
  vi.mocked(buildCoachContext).mockResolvedValue({...ctx,signals:[],active_challenges:[]} as any)
  vi.mocked(supabaseAdmin.from).mockImplementation(table=>createQueryChain({data:table==='group_coach_briefings'?{input_version:'old-version',content_json:{weekly_summary:'Next group session: meet in the park.'}}:table==='group_members'?[{athlete_id:1},{athlete_id:2}]:table==='user_plans'?[]:null,error:null}) as any)
  const result=await getBriefing('g')
  expect(result.refreshing).toBe(true)
  expect(result.briefing.weekly_edition.members).toHaveLength(2)
  expect(result.briefing.weekly_summary).not.toContain('meet in the park')
  expect(enqueueJob).toHaveBeenCalledWith('briefing','g','current-version')
})
it('reuses a current edition without another model call or job', async () => {
  vi.mocked(supabaseAdmin.rpc).mockResolvedValue({data:'current-version',error:null} as any)
  const edition=buildWeeklyEdition(ctx,[])
  vi.mocked(supabaseAdmin.from).mockReturnValue(createQueryChain({data:{input_version:'current-version',generated_at:'2026-09-14',content_json:{weekly_edition:edition}},error:null}) as any)
  const result=await getBriefing('g')
  expect(result.refreshing).toBe(false)
  expect(result.briefing.weekly_edition).toEqual(edition)
  expect(enqueueJob).not.toHaveBeenCalled()
  expect(buildCoachContext).not.toHaveBeenCalled()
})
