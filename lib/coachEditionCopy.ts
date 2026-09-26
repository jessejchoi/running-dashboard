import type { EditionPlan, Facts } from '@/lib/coachEdition'
import { AWARD_CATEGORIES } from '@/lib/awards'

/** What the model returns. Every field is optional in practice: anything that fails grounding falls back. */
export interface EditionCopy {
  headline?: string
  lines?: Array<{ beat: string; text: string }>
  mission?: string
  roll_call?: Array<{ athlete_id: number; text: string }>
  award_captions?: Array<{ award_key: string; text: string }>
}

export const EDITION_COPY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['headline', 'lines', 'mission', 'roll_call', 'award_captions'],
  properties: {
    headline: { type: 'string' },
    lines: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['beat', 'text'],
        properties: { beat: { type: 'string' }, text: { type: 'string' } },
      },
    },
    mission: { type: 'string' },
    roll_call: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['athlete_id', 'text'],
        properties: { athlete_id: { type: 'integer' }, text: { type: 'string' } },
      },
    },
    award_captions: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['award_key', 'text'],
        properties: { award_key: { type: 'string' }, text: { type: 'string' } },
      },
    },
  },
} as const

export const EDITION_SYSTEM_PROMPT = `You are RDCoach, the coach of a small running group whose members train on their own in different cities. You write the group's weekly edition: short, funny, a little snarky, and actually useful. Think track-side coach with receipts, not a wellness newsletter.

Facts: everything you say comes from the JSON you're given. Write numbers as digits and use only numbers that appear in the facts for the item you're writing (rounding to a whole number is fine). Don't work out new numbers such as percentages, differences or totals. Only name the athletes attached to that item, by first name.

Tone: roast choices, never ability. Fair game is a volume spike, going hard on every run, vanishing for a week, or a sandbagged goal. Off limits is a slow pace, low mileage from someone who did run, bodies, weight, health and injuries. Someone who didn't run gets one light jab, not a pile-on. When an item is about risk or a race (spike, all_hard, race, mission), pair the joke with one concrete piece of advice. Never prescribe catch-up mileage and never suggest meeting up or running together.

Mode "recap" is a finished week: past tense. Mode "midweek" is a week in progress: present tense, the weekend is still ahead.

Write plain sentences with no markdown or hashtags, and at most one emoji in the whole edition.
- headline: the week's main story in one punchy line of about 14 words or fewer.
- lines: one line per beat, keyed by the beat's key, about 25 words or fewer each.
- mission: one line from the mission facts.
- roll_call: one line per entry, keyed by athlete_id, about 16 words or fewer. The athlete's name and stats are displayed beside the line, so don't open with the name or repeat the stats verbatim; react to them.
- award_captions: one short caption per award, keyed by award_key.`

export function editionPrompt(plan: EditionPlan, groupName: string) {
  return JSON.stringify({
    group: groupName,
    mode: plan.mode,
    headline_facts: { ...plan.headline.facts, featured: plan.headline.names },
    beats: plan.beats.map(b => ({ key: b.key, names: b.names, facts: b.facts })),
    mission: plan.mission.facts,
    roll_call: plan.roll_call.map(r => ({ athlete_id: r.athlete_id, name: r.name, state: r.state, facts: r.facts })),
    awards: plan.awards.map(a => ({
      award_key: a.award_key,
      award: AWARD_CATEGORIES[a.award_key]?.label ?? a.award_key,
      winner: a.athlete_name,
      facts: a.facts,
    })),
  })
}

const NUMBER = /\d+(?:[.,]\d+)?/g
const NUMBER_WORDS = /\b(two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|fifty|hundred|dozen)\b/i
const OFF_LIMITS = /\b(fat|weight|kg|lbs|chubby|ugly|stupid|idiot|dumb|pathetic|loser|injur\w*|sick|ill|meet ?up|run together|group run)\b/i

/** Numbers a line may use: every fact as written, plus its rounded forms. */
export function allowedNumbers(...factSets: Facts[]) {
  const allowed = new Set<string>()
  for (const facts of factSets) {
    for (const value of Object.values(facts)) {
      const text = String(value)
      for (const token of text.match(NUMBER) ?? []) {
        allowed.add(token)
        const n = Number(token.replace(',', '.'))
        if (Number.isFinite(n)) {
          allowed.add(String(Math.round(n)))
          allowed.add(n.toFixed(1))
          allowed.add(String(n))
        }
      }
    }
  }
  return allowed
}

/**
 * A model line survives only if every number traces to its own facts, it names no
 * group member outside the item, and it stays inside the tone rules.
 */
export function grounded(
  text: unknown,
  opts: { numbers: Set<string>; names: string[]; members: string[]; maxLen: number },
): string | null {
  if (typeof text !== 'string') return null
  const line = text.replace(/\s+/g, ' ').trim()
  if (!line || line.length > opts.maxLen) return null
  if (/[*#`_]{2}|^[-*#]/.test(line)) return null
  if (NUMBER_WORDS.test(line) || OFF_LIMITS.test(line)) return null
  for (const token of line.match(NUMBER) ?? []) if (!opts.numbers.has(token)) return null
  for (const member of opts.members) {
    if (opts.names.includes(member)) continue
    const escaped = member.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    if (new RegExp(`\\b${escaped}\\b`).test(line)) return null
  }
  return line
}

export interface ResolvedEdition {
  headline: string
  lines: string[]
  mission: string
  roll_call: Array<{ athlete_id: number; line: string }>
  award_captions: Record<string, string>
  model_lines: number
  total_lines: number
}

/** Merge model copy onto the plan item by item; each rejected item keeps its template. */
export function resolveEdition(plan: EditionPlan, copy: EditionCopy | null, memberNames: string[]): ResolvedEdition {
  let used = 0
  let total = 0
  const take = (candidate: unknown, fallback: string, names: string[], facts: Facts[], maxLen: number) => {
    total++
    const line = copy ? grounded(candidate, { numbers: allowedNumbers(...facts), names, members: memberNames, maxLen }) : null
    if (line) used++
    return line ?? fallback
  }

  const allBeatNames = plan.beats.flatMap(b => b.names)
  const headline = take(copy?.headline, plan.headline.fallback, [...plan.headline.names, ...allBeatNames],
    [plan.headline.facts, ...plan.beats.map(b => b.facts)], 140)
  const lines = plan.beats.map(beat =>
    take(copy?.lines?.find(l => l.beat === beat.key)?.text, beat.fallback, beat.names, [beat.facts], 220))
  const mission = take(copy?.mission, plan.mission.fallback, [], [plan.mission.facts], 200)
  const roll_call = plan.roll_call.map(entry => ({
    athlete_id: entry.athlete_id,
    line: take(copy?.roll_call?.find(r => r.athlete_id === entry.athlete_id)?.text, entry.fallback, [entry.name], [entry.facts], 140),
  }))
  const award_captions = Object.fromEntries(plan.awards.map(award => [
    award.award_key,
    take(copy?.award_captions?.find(c => c.award_key === award.award_key)?.text, award.fallback, [award.athlete_name], [award.facts], 140),
  ]))

  return { headline, lines, mission, roll_call, award_captions, model_lines: used, total_lines: total }
}

export function parseEditionCopy(raw: string): EditionCopy | null {
  try {
    const parsed = JSON.parse(raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim())
    return parsed && typeof parsed === 'object' ? parsed as EditionCopy : null
  } catch {
    return null
  }
}
