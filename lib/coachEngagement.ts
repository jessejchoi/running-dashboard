import type { CoachContext } from '@/lib/coachContext'

export interface CoachStoryline {
  key: string
  label: string
  angle: string
  evidence: string
}

export interface CoachAwardCandidate {
  athlete_name: string
  award_key: string
  evidence: string
}

export interface CoachEngagementPlan {
  storylines: CoachStoryline[]
  award_candidates: CoachAwardCandidate[]
  ask_prompts: string[]
  team_focus: string
  challenge_nudge: string
  risks: string[]
}

function firstName(name: string) {
  return name.split(' ')[0] || name
}

function formatChallengeProgress(challenge: CoachContext['active_challenges'][number]) {
  if (challenge.progress_unit === 'meters_elevation') {
    return `${challenge.progress_value}m of ${challenge.target_value ?? 0}m climbed`
  }
  if (challenge.progress_unit === 'runs') {
    return `${challenge.progress_value} of ${challenge.target_value ?? 0} runs logged`
  }
  if (challenge.progress_unit === 'member_weeks') {
    return `${challenge.completed_member_weeks ?? challenge.progress_value} of ${challenge.elapsed_member_weeks ?? challenge.target_value ?? 0} member-weeks complete`
  }
  if (challenge.progress_unit === 'efforts') {
    return `${challenge.source_count} qualifying runs logged`
  }
  return `${challenge.total_km}km of ${challenge.target_km ?? 0}km`
}

function topBy<T>(items: T[], score: (item: T) => number) {
  return items.reduce<T | null>((best, item) => {
    if (!best) return item
    return score(item) > score(best) ? item : best
  }, null)
}

export function buildGroupEngagement(ctx: CoachContext): CoachEngagementPlan {
  const members = ctx.members ?? []
  const activeChallenges = ctx.active_challenges ?? []
  const storylines: CoachStoryline[] = []
  const awardCandidates: CoachAwardCandidate[] = []
  const risks: string[] = []

  const topWeek = topBy(members, m => m.this_week_km)
  const topYtd = topBy(members, m => m.ytd_km)
  const inactive = members.filter(m => m.run_count_this_week === 0)
  const activeChallenge = activeChallenges[0]

  if (activeChallenge) {
    const progress = formatChallengeProgress(activeChallenge)
    storylines.push({
      key: 'challenge_pressure',
      label: 'Challenge pressure',
      angle: `${activeChallenge.name} is ${activeChallenge.pct}% complete. The scoreboard is not exactly trembling yet.`,
      evidence: progress,
    })
  }

  if (topWeek && topWeek.this_week_km > 0) {
    storylines.push({
      key: 'weekly_leader',
      label: 'Weekly leader',
      angle: `${firstName(topWeek.name)} is carrying the week with ${topWeek.this_week_km}km.`,
      evidence: `${topWeek.run_count_this_week} runs this week`,
    })
    awardCandidates.push({
      athlete_name: firstName(topWeek.name),
      award_key: 'mileage_monster',
      evidence: `${topWeek.this_week_km}km this week`,
    })
  }

  if (topYtd && topYtd.ytd_km > 0 && topYtd.athlete_id !== topWeek?.athlete_id) {
    storylines.push({
      key: 'season_engine',
      label: 'Season engine',
      angle: `${firstName(topYtd.name)} still owns the year-to-date grind at ${topYtd.ytd_km}km.`,
      evidence: `${topYtd.ytd_km}km YTD`,
    })
    awardCandidates.push({
      athlete_name: firstName(topYtd.name),
      award_key: 'consistency_crown',
      evidence: `${topYtd.ytd_km}km YTD`,
    })
  }

  if (inactive.length > 0) {
    const names = inactive.map(m => firstName(m.name)).slice(0, 3).join(', ')
    storylines.push({
      key: 'nudge_list',
      label: 'Nudge list',
      angle: `${names} have logged 0 runs this week. The shoes are not going to emotionally support themselves.`,
      evidence: `${inactive.length} inactive member${inactive.length === 1 ? '' : 's'} this week`,
    })
  }

  for (const signal of ctx.signals ?? []) {
    if (signal.severity !== 'warning') continue
    risks.push(signal.evidence)
  }

  const focus = activeChallenge
    ? `Move ${activeChallenge.name} from ${activeChallenge.pct}% to ${Math.min(activeChallenge.pct + 10, 100)}% before the next check-in.`
    : topWeek
      ? `Make ${topWeek.this_week_km.toFixed(1)}km the number to beat this week.`
      : 'Get at least one honest run on the board before RDCoach starts using air quotes.'

  const challengeNudge = activeChallenge
    ? `${activeChallenge.name}: ${formatChallengeProgress(activeChallenge)} (${activeChallenge.pct}%). Somebody needs to make this less decorative.`
    : 'No active challenge. Suspiciously peaceful.'

  const askPrompts = [
    activeChallenge ? `How do we finish ${activeChallenge.name}?` : 'Give us a 48-hour mission',
    inactive.length > 0 ? 'Who needs a nudge today?' : 'Who is carrying the group?',
    'Roast the leaderboard',
    'What is the group focus?',
  ]

  return {
    storylines: storylines.slice(0, 4),
    award_candidates: awardCandidates.slice(0, 4),
    ask_prompts: askPrompts,
    team_focus: focus,
    challenge_nudge: challengeNudge,
    risks: risks.slice(0, 3),
  }
}
