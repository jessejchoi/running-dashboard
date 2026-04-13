import { AWARD_CATEGORIES, isValidAwardKey } from '@/lib/awards'

export interface BriefingContent {
  weekly_summary: string
  shoutouts: Array<{
    athlete_name: string
    award_label: string
    caption: string
    award_key: string
  }>
  group_momentum: 'rising' | 'steady' | 'dipping'
  coach_tip: string
}

function cleanText(value: unknown, maxLen: number): string {
  if (typeof value !== 'string') return ''
  return value.replace(/\s+/g, ' ').trim().slice(0, maxLen)
}

function cleanAthleteName(value: unknown): string {
  const text = cleanText(value, 40)
  const firstToken = text.split(' ')[0] ?? ''
  return firstToken.replace(/[^a-zA-Z'-]/g, '')
}

export function normalizeInsightContent(value: unknown): string | null {
  const text = cleanText(value, 500)
  return text.length > 0 ? text : null
}

export function parseAndSanitizeBriefing(raw: string): BriefingContent | null {
  const text = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return null
  }

  if (!parsed || typeof parsed !== 'object') return null
  const obj = parsed as Record<string, unknown>

  const weeklySummary = cleanText(obj.weekly_summary, 600)
  const coachTip = cleanText(obj.coach_tip, 240)
  if (!weeklySummary || !coachTip) return null

  const momentum = obj.group_momentum
  const groupMomentum: BriefingContent['group_momentum'] =
    momentum === 'rising' || momentum === 'steady' || momentum === 'dipping'
      ? momentum
      : 'steady'

  const rawShoutouts = Array.isArray(obj.shoutouts) ? obj.shoutouts : []
  const seen = new Set<string>()
  const shoutouts = rawShoutouts
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const shoutout = item as Record<string, unknown>
      const athleteName = cleanAthleteName(shoutout.athlete_name)
      const awardKey = cleanText(shoutout.award_key, 64)
      const caption = cleanText(shoutout.caption, 240)
      if (!athleteName || !caption || !isValidAwardKey(awardKey)) return null
      const dedupeKey = `${athleteName.toLowerCase()}::${awardKey}`
      if (seen.has(dedupeKey)) return null
      seen.add(dedupeKey)
      return {
        athlete_name: athleteName,
        award_key: awardKey,
        award_label: AWARD_CATEGORIES[awardKey].label,
        caption,
      }
    })
    .filter((item): item is BriefingContent['shoutouts'][number] => item !== null)
    .slice(0, 4)

  return {
    weekly_summary: weeklySummary,
    shoutouts,
    group_momentum: groupMomentum,
    coach_tip: coachTip,
  }
}
