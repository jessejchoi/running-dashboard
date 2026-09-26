import { describe, expect, it, vi } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

// The app's tsconfig preserves JSX for Next; under vitest it compiles to React.createElement.
;(globalThis as any).React = React

vi.mock('@/components/GroupCoachTab', () => ({ default: () => null }))
vi.mock('@/components/GroupMessageBoard', () => ({ default: () => null }))

import GroupDashboardTab from '@/components/GroupDashboardTab'
import type { LeaderboardRun, Member, MemberRhythm } from '@/components/GroupShared'

const TODAY = '2026-10-14'

const member = (athlete_id: number, name: string): Member => ({
  athlete_id, role: 'member', joined_at: '2026-01-01', name, profile_pic: null, gender: null, goals: [], is_me: false, status_tag: null,
})
const members = [member(1, 'Ana One'), member(2, 'Ben Two'), member(3, 'Cy Three')]
const runs: LeaderboardRun[] = members.map(m => ({
  id: m.athlete_id, athlete_id: m.athlete_id, distance: 5000 * m.athlete_id, moving_time: 1800,
  start_date: `${TODAY}T00:00:00Z`, start_date_local: `${TODAY}T07:00:00`,
}))

/** The streak badges on the leaderboard, as { first name: weeks }. */
function flames(memberRhythm: MemberRhythm | null) {
  const html = renderToStaticMarkup(
    <GroupDashboardTab
      group={{ id: 'g', name: 'Crew', invite_code: 'x', created_by: 1, created_at: '2026-01-01' }}
      leaderboardRuns={runs}
      members={members}
      memberTrainingLoads={{}}
      myRole="member"
      myAthleteId={99}
      initialChallenges={[]}
      onKickMember={async () => {}}
      onUpdateMemberRole={async () => {}}
      memberRhythm={memberRhythm}
      today={TODAY}
    />,
  )
  const found: Record<string, number> = {}
  const pattern = /text-\[#d1d5db\]">(\w+)<\/span>(?:<span class="flex items-center gap-0.5 text-orange-400[^>]*><svg[\s\S]*?<\/svg>(\d+)w<\/span>)?/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(html))) if (match[2]) found[match[1]] = Number(match[2])
  return found
}

describe('group leaderboard Rhythm flame', () => {
  it('shows 1-week streaks in the first month, needs 2+ after, and hides flames while Rhythm is off', () => {
    const streaks = { 1: 1, 2: 2, 3: 0 }
    expect(flames({ streaks, seasonWeek: 4 })).toEqual({ Ana: 1, Ben: 2 })
    expect(flames({ streaks, seasonWeek: 5 })).toEqual({ Ben: 2 })
    // Off: no streak data, so nobody gets a flame (the old run-count streak is gone).
    expect(flames(null)).toEqual({})
    // A member missing from the Rhythm map reads as 0.
    expect(flames({ streaks: { 2: 3 }, seasonWeek: 1 })).toEqual({ Ben: 3 })
  })
})
