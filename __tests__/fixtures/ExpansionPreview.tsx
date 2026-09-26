'use client'
import { useEffect, useState } from 'react'
import ExpectedEstimates from '@/components/ExpectedEstimates'
import GoalsSection from '@/components/GoalsSection'
import TrainingGoals from '@/components/TrainingGoals'
import GroupCoachTab from '@/components/GroupCoachTab'
import ActivityLog from '@/components/ActivityLog'
const goals: any[] = [
  {
    id: '10000000-0000-0000-0000-000000000001',
    athlete_id: 1,
    distance_key: 'hm',
    label: 'Jakarta Half Marathon',
    target_secs: 6300,
    current_secs: null,
    race_date: '2026-11-01',
    status: 'active',
    is_primary: true,
    timezone: 'Asia/Jakarta',
  },
]
const estimates: any[] = ['5k', '10k', 'hm', 'fm'].map((distanceKey, i) => ({
  distanceKey,
  expectedSecs: i === 3 ? null : [1500, 3150, 6980][i],
  idealSecs: i === 3 ? null : [1470, 3080, 6770][i],
  lowSecs: [1400, 2950, 6650, null][i],
  highSecs: [1620, 3400, 7380, null][i],
  confidence: i < 2 ? 'medium' : 'low',
  status: i === 3 ? 'insufficient_evidence' : 'ready',
  evidence:
    i === 3
      ? []
      : [{ activityId: 100, date: '2026-09-12', kind: 'confirmed race' }],
  asOf: '2026-09-13T01:00:00Z',
  modelVersion: 'expected-observed-v1',
  freshness: { ageDays: 1 },
  explanation:
    i === 3
      ? 'More sustained quality efforts or a confirmed race are needed at this distance.'
      : 'Observed efforts in usual conditions. Range is an estimate, not a calibrated probability.',
}))
const coachMembers = ['Alex Rivera', 'Morgan Lee', 'Sam Chen', 'Taylor Kim'].map((name, i) => ({ athlete_id: i + 1, name, profile_pic: null }))
const briefing = {
  weekly_summary: 'Alex ran 54.0 km. Everyone else combined: 114.0. Discuss.',
  edition: {
    mode: 'recap' as const, week_start: '2026-09-07', week_end: '2026-09-13', as_of: '2026-09-13',
    total_km: 168, total_runs: 16, ticker: { km: 12.4, runs: 3 },
    headline: 'Alex ran 54.0 km. Everyone else combined: 114.0. Discuss.',
    lines: [
      'Alex is at 54.0 km against a usual 30.0. Bold. The hamstrings have been notified. Easy week next.',
      'Morgan edged Sam by 0.6 km. Revenge is being planned as we speak.',
      'Taylor: Autumn half marathon in 28 days. Last real block. Nail the long run, keep the easy days easy.',
    ],
    mission: "This week's number to beat: 168.0 km as a group. Easy runs count. Hero runs count less than you think.",
    roll_call: coachMembers.map((m, i) => ({ athlete_id: m.athlete_id, name: m.name, km: [54, 38.6, 38, 37.4][i], runs: 4, line: ['Top of the board. Act like you\'ve been here before.', 'Above the usual 32.0. Quietly building.', '4 runs, no drama. Coach approves.', 'Autumn half marathon in 28 days. Protect the legs.'][i] })),
    voice: 'template' as const,
  },
  shoutouts: [
    { athlete_id: 1, athlete_name: 'Alex', award_key: 'mileage_monster', award_label: 'Mileage Monster', caption: '54.0 km. Ran the group\'s homework and then some.' },
    { athlete_id: 3, athlete_name: 'Sam', award_key: 'consistency_crown', award_label: 'Consistency Crown', caption: 'Showed up on 5 different days. Dull, repeatable, undefeated.' },
  ],
  group_momentum: 'rising' as const,
  coach_tip: "This week's number to beat: 168.0 km as a group.",
  ask_prompts: ['Give us a 48-hour mission', 'Roast the leaderboard'],
}
const runs = Array.from({ length: 50 }, (_, i) => ({
  id: 100 + i,
  name: 'Morning easy run',
  distance: 5000,
  moving_time: 1800,
  average_speed: 2.78,
  average_heartrate: 140,
  start_date: new Date(
    Date.parse('2026-09-13T00:00:00Z') - i * 86400000,
  ).toISOString(),
  run_type: 'easy',
}))
export default function Preview() {
  const [ready, setReady] = useState(false),
    [tab, setTab] = useState('goals')
  useEffect(() => {
    const original = window.fetch
    window.fetch = async (input, init) => {
      const url = String(input)
      const b = init?.body ? JSON.parse(String(init.body)) : {}
      let data: any = { ok: true }
      if (url.includes('/coach/briefing')) data = { briefing, cached: true, generated_at: new Date().toISOString() }
      else if (url.includes('/history'))
        data = { status: 'queued', imported: 9950, page: 100 }
      else if (url.includes('/activities'))
        data = { items: runs, nextCursor: null }
      else if (url.includes('/goals')) data = { ...goals[0], ...b }
      else if (!url.startsWith('/api/')) return original(input, init)
      return new Response(JSON.stringify(data), {
        headers: { 'content-type': 'application/json' },
      })
    }
    setReady(true)
    return () => {
      window.fetch = original
    }
  }, [])
  return (
    <main className="max-w-[1100px] mx-auto p-3 sm:p-6 space-y-6">
      <nav className="flex gap-2">
        {['goals', 'coach', 'history'].map((t) => (
          <button className="rd-button" key={t} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </nav>
      {ready &&
        (tab === 'goals' ? (
          <>
            <GoalsSection
              initialGoals={goals}
              estimates={{ hm: 6980 }}
              bundle={{
                estimates,
                updatedAt: '2026-09-13',
                modelVersion: 'expected-observed-v1',
                dataVersion: 10,
              }}
            />
            <TrainingGoals
              initial={[
                {
                  id: 'a',
                  metric: 'distance',
                  target: 30000,
                  progress: 22500,
                  active: true,
                  week_start: '2026-09-07',
                },
              ]}
            />
            <ExpectedEstimates estimates={estimates} />
          </>
        ) : tab === 'coach' ? (
          <GroupCoachTab groupId="fixture" myRole="member" members={coachMembers} initialBriefing={briefing} />
        ) : (
          <ActivityLog
            initial={{ items: runs, nextCursor: 'older' }}
            unit="km"
          />
        ))}
    </main>
  )
}
