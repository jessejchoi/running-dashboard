export interface CoachEdition {
  mode: 'recap' | 'midweek'
  week_start: string
  week_end: string
  as_of: string
  total_km: number
  total_runs: number
  /** Group totals for the current week while a recap covers the previous one. */
  ticker: { km: number; runs: number } | null
  headline: string
  lines: string[]
  mission: string
  roll_call: Array<{
    athlete_id: number
    name: string
    km: number
    runs: number
    line: string
  }>
  /** 'model' when every line came from the model, 'mixed' when some were templated. */
  voice: 'model' | 'mixed' | 'template'
}

export interface BriefingContent {
  weekly_summary: string
  edition?: CoachEdition
  ask_prompts?: string[]
  shoutouts: Array<{
    athlete_id?: number
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

export function normalizeInsightContent(value: unknown): string | null {
  const text = cleanText(value, 500)
  return text.length > 0 ? text : null
}
