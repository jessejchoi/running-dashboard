import { beforeEach, expect, it, vi } from 'vitest'
import { createQueryChain } from './helpers/supabase'
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: { from: vi.fn() } }))
vi.mock('@/lib/strava', () => ({ syncActivities: vi.fn(), syncActivityDetails: vi.fn() }))
vi.mock('@/lib/history', () => ({ runHistoryJob: vi.fn() }))
vi.mock('@/lib/groupCoach', () => ({ runBriefingJob: vi.fn(), groupVersion: vi.fn() }))
vi.mock('@/lib/planService', () => ({ adaptPlan: vi.fn() }))
vi.mock('@/lib/estimates', () => ({ loadEstimates: vi.fn() }))
vi.mock('@/lib/jobs', () => ({ enqueueJob: vi.fn(), claimJob: vi.fn(), finishJob: vi.fn() }))
vi.mock('@/lib/stravaWebhook', () => ({ runStravaWebhookJob: vi.fn() }))
vi.mock('@/lib/stravaBudget', () => ({ importMayRun: vi.fn() }))
import { supabaseAdmin } from '@/lib/supabase'
import { syncActivityDetails } from '@/lib/strava'
import { runHistoryJob } from '@/lib/history'
import { claimJob, finishJob, enqueueJob } from '@/lib/jobs'
import { importMayRun } from '@/lib/stravaBudget'
import { runWorker, queueAthleteWork } from '@/lib/worker'
const job = { id: 'detail', kind: 'details', scope: '1', input_version: '123:9', payload: {}, lease_token: 'lease', attempts: 1 }
beforeEach(() => {
 vi.resetAllMocks()
 vi.mocked(claimJob).mockResolvedValue(job)
 const backlog=createQueryChain({data:Array.from({length:20},(_,i)=>({id:String(i),kind:'history',scope:'1'}))})
 backlog.neq.mockReturnValue(createQueryChain({data:[{id:'detail',kind:'details',scope:'1'}]}))
 vi.mocked(supabaseAdmin.from).mockReturnValue(backlog as any)
})
it('selects current work before a full archive backlog and decodes versioned detail jobs', async () => {
 await runWorker()
 expect(syncActivityDetails).toHaveBeenCalledWith(1,1,123)
 expect(runHistoryJob).not.toHaveBeenCalled()
})
it('defers detail requests during an application-wide quota pause', async () => {
 vi.mocked(importMayRun).mockResolvedValue('2026-09-14T00:00:00Z')
 await runWorker()
 expect(syncActivityDetails).not.toHaveBeenCalled()
 expect(finishJob).toHaveBeenCalledWith(job,'Waiting for Strava quota','2026-09-14T00:00:00Z')
})
it('allows refreshed details to be queued again after an activity changes', async () => {
 vi.mocked(supabaseAdmin.from).mockImplementation(table=>createQueryChain({data:table==='athlete_state'?{data_version:9}:table==='activities'?[{id:123}]:[]}) as any)
 await queueAthleteWork(1)
 expect(enqueueJob).toHaveBeenCalledWith('details','1','123:9')
})
