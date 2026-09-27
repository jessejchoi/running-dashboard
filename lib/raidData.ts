import { supabaseAdmin } from '@/lib/supabase'
import { addDays, commonTimezone, localDate } from '@/lib/calendar'
import { RUN_LOOKBACK_WEEKS, countRuns, firstOpenWeek, foldTimeline, type RhythmInputs } from '@/lib/rhythm'
import { loadRhythmInputs, rhythmLaunchWeek } from '@/lib/rhythmData'
import { freezeLoadedWeeks } from '@/lib/rhythmLedger'
import {
  DORMANT_WEEKS,
  RAID_LOOKBACK,
  RAID_WEEKS,
  computeRaid,
  type RaidMemberInput,
  type RaidState,
  type RaidSummary,
  type RaidWeekResult,
} from '@/lib/raid'
import { bossTaunt, shameList, situation, type ShameList } from '@/lib/raidCopy'

/** Frozen rows the raid needs: every raid in the lookback, the week before each, and the dormant window. */
const LEDGER_WEEKS = RAID_LOOKBACK * RAID_WEEKS + DORMANT_WEEKS + 2

export interface RaidReport {
  raid: RaidSummary
  week: RaidWeekResult
  /** 1-based week of the raid that `week` was. */
  raidWeek: number
  shame: ShameList
  /** The boss's parting line when it escaped. */
  taunt: string | null
}

export interface RaidView {
  groupId: string
  groupName: string
  zone: string
  state: RaidState
  members: Record<number, { name: string; pic: string | null }>
  /** The short line at the top of the tab. */
  summary: string
  /** Last week's battle report, when last week was a raid week. */
  report: RaidReport | null
}

/** Runs per week before launch, for weeks the loaded runs fully cover. */
function earlyWeeks(input: RhythmInputs, launchWeek: string): Record<string, number> {
  const covered = addDays(firstOpenWeek(input.ledger, launchWeek), -RUN_LOOKBACK_WEEKS * 7)
  const weeks: Record<string, number> = {}
  for (let i = 1; i <= DORMANT_WEEKS; i++) {
    const week = addDays(launchWeek, -i * 7)
    if (week >= covered) weeks[week] = countRuns(input.runs, week, input.zone)
  }
  return weeks
}

/**
 * Everything the Raid tab and the share card show, from one load. Returns
 * null while Rhythm is off (unset launch week, or migration 024 missing).
 */
export async function loadRaidState(groupId: string, now = new Date()): Promise<RaidView | null> {
  const launchWeek = rhythmLaunchWeek()
  if (!launchWeek) return null

  const [{ data: group, error: groupError }, { data: memberRows, error: membersError }] = await Promise.all([
    supabaseAdmin.from('groups').select('id, name, created_at').eq('id', groupId).maybeSingle(),
    supabaseAdmin.from('group_members').select('athlete_id, joined_at').eq('group_id', groupId),
  ])
  if (groupError) throw groupError
  if (membersError) throw membersError
  if (!group) return null
  const ids = (memberRows ?? []).map(m => m.athlete_id as number)

  const [{ data: tokens, error: tokensError }, inputs] = await Promise.all([
    supabaseAdmin.from('strava_tokens').select('athlete_id, athlete_name, athlete_profile').in('athlete_id', ids),
    loadRhythmInputs(ids, launchWeek, now, { ledgerWeeks: LEDGER_WEEKS }),
  ])
  if (tokensError) throw tokensError
  if (!inputs) return null

  const zone = commonTimezone(ids.map(id => inputs[id]?.zone))
  const members: RaidView['members'] = {}
  for (const id of ids) {
    const token = tokens?.find(t => t.athlete_id === id)
    // Strava's placeholder is a relative path ("avatar/athlete/large.png"): show initials instead.
    const pic = token?.athlete_profile?.startsWith('https://') ? token.athlete_profile : null
    members[id] = { name: token?.athlete_name ?? `Athlete ${id}`, pic }
  }

  const raidMembers: RaidMemberInput[] = []
  for (const row of memberRows ?? []) {
    const input = inputs[row.athlete_id]
    const timeline = input && foldTimeline(input, launchWeek, now)
    if (!timeline) continue // their zone hasn't reached launch week yet
    raidMembers.push({
      athlete_id: row.athlete_id,
      name: members[row.athlete_id].name,
      joinedDay: localDate(new Date(row.joined_at), zone),
      history: timeline.history,
      current: timeline.current,
      frozenThrough: input.ledger[input.ledger.length - 1]?.week_start ?? null,
      earlyWeeks: earlyWeeks(input, launchWeek),
    })
  }

  const state = computeRaid({
    members: raidMembers,
    groupZone: zone,
    createdDay: localDate(new Date(group.created_at), zone),
    rhythmLaunchWeek: launchWeek,
    now,
  })

  // Safety net for the daily freeze: members who stopped opening the app are frozen here.
  await freezeLoadedWeeks(inputs, launchWeek, now)
    .catch(error => console.error('[raid] Rhythm freeze failed', error))

  return { groupId, groupName: group.name, zone, state, members, summary: situation(state), report: report(state, groupId) }
}

function report(state: RaidState, groupId: string): RaidReport | null {
  const week = state.lastWeek
  const raid = state.previous ?? state.raid
  if (!week || !raid) return null
  const onThisWeek = new Set(state.roster.filter(r => r.on).map(r => r.athlete_id))
  return {
    raid,
    week,
    raidWeek: raid.weeks.findIndex(w => w.week === week.week) + 1,
    shame: shameList(state.recentWeeks, groupId, raid.boss, onThisWeek),
    taunt: raid.status === 'escaped' ? bossTaunt(raid.boss, groupId, raid.index) : null,
  }
}
