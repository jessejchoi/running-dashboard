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

/** The level badges on the leaderboard, as { first name: level }. */
function levels(memberRhythm: MemberRhythm | null) {
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
  // Each member's row starts at their name; look for a level badge before the next row.
  const rows = html.split('text-xs font-bold truncate').slice(1)
  for (const row of rows) {
    const name = row.match(/">(\w+)<\/span>/)?.[1]
    const level = row.match(/Lv (?:<!-- -->)?(\d+)/)?.[1]
    if (name && level) found[name] = Number(level)
  }
  return found
}

describe('group leaderboard level badge', () => {
  it('shows each member\'s weapon level in place of the old streak flame', () => {
    expect(levels({ tiers: { 1: 'stick', 2: 'sword', 3: 'unarmed' } })).toEqual({ Ana: 2, Ben: 4, Cy: 1 })
    // Before launch week a member has no tier yet, and while Rhythm is off there's nothing to show.
    expect(levels({ tiers: { 2: 'legendary' } })).toEqual({ Ben: 6 })
    expect(levels(null)).toEqual({})
  })
})
