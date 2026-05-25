'use client'
import { useState, useEffect, useRef } from 'react'
import { RefreshCw } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import type { BriefingContent } from '@/app/api/groups/[id]/coach/briefing/route'
import { AWARD_CATEGORIES, isValidAwardKey } from '@/lib/awards'

interface Member {
  athlete_id: number
  name: string
  profile_pic: string | null
}

interface Award {
  id: string
  athlete_id: number
  athlete_name: string
  athlete_profile: string | null
  award_key: string
  award_label: string
  emoji: string
  week_start: string
  caption: string | null
}

interface BriefingMeta {
  cached: boolean
  generated_at: string
}

interface Props {
  groupId: string
  myRole: string
  members: Member[]
  /** When true, hides Ask Coach and Trophy Case (used on the home page) */
  minimal?: boolean
  initialBriefing?: BriefingContent | null
  initialBriefingMeta?: BriefingMeta | null
  initialAwards?: Award[]
}


function Avatar({ name, pic }: { name: string; pic: string | null }) {
  if (pic) {
    return <img src={pic} alt={name} className="w-8 h-8 rounded-full object-cover" />
  }
  const initials = name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
  return (
    <div className="w-8 h-8 rounded-full bg-[#e84d85]/20 flex items-center justify-center text-[#e84d85] font-bold text-xs">
      {initials}
    </div>
  )
}

function MomentumBadge({ momentum }: { momentum: 'rising' | 'steady' | 'dipping' }) {
  const config = {
    rising:  { label: 'Rising',  color: 'text-[#b8d957] bg-[#b8d957]/10 border-[#b8d957]/20' },
    steady:  { label: 'Steady',  color: 'text-[#6bbfdf] bg-[#6bbfdf]/10 border-sky-400/20' },
    dipping: { label: 'Dipping', color: 'text-[#dc8b3a] bg-[#dc8b3a]/10 border-amber-400/20' },
  }
  const c = config[momentum]
  return (
    <span className={`border px-2 py-0.5 text-[10px] font-bold ${c.color}`}>
      {c.label}
    </span>
  )
}

function ShoutoutCard({ shoutout, members }: { shoutout: BriefingContent['shoutouts'][0]; members: Member[] }) {
  const firstName = shoutout.athlete_name.split(' ')[0]
  const member = members.find(m => m.name.split(' ')[0].toLowerCase() === firstName.toLowerCase())
  const emoji = isValidAwardKey(shoutout.award_key) ? AWARD_CATEGORIES[shoutout.award_key].emoji : '🏆'
  return (
    <div className="border border-[#303037] bg-[#151517] p-4">
      <div className="flex items-center gap-3 mb-2">
        <div className="relative">
          {member && <Avatar name={member.name} pic={member.profile_pic} />}
          <span className="absolute -bottom-1 -right-1 text-base leading-none">{emoji}</span>
        </div>
        <div>
          <div className="font-bold text-sm text-white">{shoutout.athlete_name}</div>
          <div className="text-[10px] font-bold text-[#e84d85] uppercase tracking-wide">{shoutout.award_label}</div>
        </div>
      </div>
      <p className="text-[#9ca3af] text-xs leading-relaxed">{shoutout.caption}</p>
    </div>
  )
}

const COACH_CHIPS = [
  "Give us a 48-hour mission",
  "Who's slacking?",
  "Roast the leaderboard",
  "Who is carrying the group?",
  "What should we focus on?",
]

export default function GroupCoachTab({ groupId, myRole, members, minimal = false, initialBriefing, initialBriefingMeta, initialAwards }: Props) {
  const [briefing, setBriefing] = useState<BriefingContent | null>(initialBriefing ?? null)
  const [briefingLoading, setBriefingLoading] = useState(false)
  const [briefingError, setBriefingError] = useState(false)
  const [briefingMeta, setBriefingMeta] = useState<BriefingMeta | null>(initialBriefingMeta ?? null)
  const [answer, setAnswer] = useState('')
  const [answerStreaming, setAnswerStreaming] = useState(false)
  const [activeChip, setActiveChip] = useState<string | null>(null)
  const [awards, setAwards] = useState<Award[]>(initialAwards ?? [])
  const answerRef = useRef<HTMLDivElement>(null)

  async function fetchBriefing(force = false) {
    setBriefingLoading(true)
    setBriefingError(false)
    try {
      const url = `/api/groups/${groupId}/coach/briefing${force ? '?force=true' : ''}`
      const res = await fetch(url)
      if (!res.ok) throw new Error('failed')
      const data = await res.json()
      setBriefing(data.briefing)
      setBriefingMeta({
        cached: data.cached,
        generated_at: data.generated_at,
      })
    } catch {
      setBriefingError(true)
    } finally {
      setBriefingLoading(false)
    }
  }

  async function fetchAwards() {
    if (minimal) return
    try {
      const res = await fetch(`/api/groups/${groupId}/awards?weeks=4`)
      if (!res.ok) return
      const data = await res.json()
      setAwards(data.awards ?? [])
    } catch {
      // silent — Trophy Case is non-critical
    }
  }

  useEffect(() => {
    if (!initialBriefing) fetchBriefing()
    if (!initialAwards?.length && !minimal) fetchAwards()
  }, [])

  async function askCoach(chipText: string) {
    if (answerStreaming) return
    setActiveChip(chipText)
    setAnswer('')
    setAnswerStreaming(true)
    try {
      const res = await fetch(`/api/groups/${groupId}/coach/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: chipText }),
      })
      if (!res.ok || !res.body) throw new Error('failed')
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        setAnswer(prev => prev + decoder.decode(value, { stream: true }))
        answerRef.current?.scrollIntoView({ behavior: 'smooth' })
      }
    } catch {
      setAnswer('Coach is unavailable right now. Try again later.')
    } finally {
      setAnswerStreaming(false)
    }
  }

  if (briefingLoading) {
    return (
      <div className="space-y-4 fade-up">
        <div className="h-32 animate-pulse border border-[#303037] bg-[#111]" />
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="h-24 animate-pulse border border-[#303037] bg-[#111]" />
          <div className="h-24 animate-pulse border border-[#303037] bg-[#111]" />
        </div>
        {!minimal && <div className="h-16 animate-pulse border border-[#303037] bg-[#111]" />}
        {!minimal && <div className="h-20 animate-pulse border border-[#303037] bg-[#111]" />}
      </div>
    )
  }

  if (briefingError) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4 fade-up">
        <p className="text-[#6b7280] text-sm">RDCoach is taking a rest day.</p>
        <button
          onClick={() => fetchBriefing()}
          className="flex min-h-[44px] items-center gap-2 border border-[#303037] bg-[#202024] px-4 py-2 text-sm font-bold transition-colors hover:border-[#e84d85]"
        >
          <RefreshCw size={14} /> Retry
        </button>
      </div>
    )
  }

  if (!briefing) return null

  // Current week start (Monday) in local time — exclude from Trophy Case since it's shown above
  const todayStr = new Date().toISOString().split('T')[0]
  const todayDate = new Date(todayStr + 'T12:00:00')
  const dayOfWeek = todayDate.getDay() // 0=Sun
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1
  const currentWeekStart = new Date(todayDate)
  currentWeekStart.setDate(todayDate.getDate() - daysToMonday)
  const currentWeekStr = currentWeekStart.toISOString().split('T')[0]

  // Group awards by week for Trophy Case (past weeks only)
  const awardWeeks = awards.reduce<Record<string, Award[]>>((acc, a) => {
    if (a.week_start >= currentWeekStr) return acc // skip current week
    acc[a.week_start] = acc[a.week_start] ?? []
    acc[a.week_start].push(a)
    return acc
  }, {})
  const sortedWeeks = Object.keys(awardWeeks).sort((a, b) => b.localeCompare(a))
  const coachChips = briefing.ask_prompts?.length ? briefing.ask_prompts : COACH_CHIPS

  return (
    <div className="space-y-4 fade-up">

      {/* Coach Briefing */}
      <div className="card pulse-bar ice overflow-visible p-5">
        <span className="pulse-idx">[03]</span>
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-display font-bold text-sm text-white">Coach Briefing</span>
            <MomentumBadge momentum={briefing.group_momentum} />
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {briefingMeta && (
              <span className="text-[10px] text-[#4b5563]">
                {briefingMeta.cached ? 'Cached · ' : ''}
                {formatDistanceToNow(new Date(briefingMeta.generated_at), { addSuffix: true })}
              </span>
            )}
            <button
              onClick={() => fetchBriefing(true)}
              className="text-[#6b7280] hover:text-[#e84d85] transition-colors"
              title="Refresh briefing"
            >
              <RefreshCw size={13} />
            </button>
          </div>
        </div>
        <p className="text-[#d1d5db] text-[13px] leading-6 break-words overflow-visible pb-0.5">
          {briefing.weekly_summary}
        </p>
      </div>

      {/* This Week's Awards */}
      {briefing.shoutouts.length > 0 && (
        <div>
          <h3 className="font-mono text-[10px] uppercase tracking-widest mb-3" style={{ color: 'var(--text-muted)' }}>This Week&rsquo;s Awards</h3>
          <div className="grid sm:grid-cols-2 gap-3">
            {briefing.shoutouts.map((s, i) => (
              <ShoutoutCard key={i} shoutout={s} members={members} />
            ))}
          </div>
        </div>
      )}

      {/* Ask Coach — chip buttons (group page only) */}
      {!minimal && (
        <div className="border border-[#303037] bg-[#111] p-5">
          <h3 className="font-display font-bold text-sm text-white mb-3">Ask Coach</h3>
          <div className="flex flex-wrap gap-2 mb-3">
            {coachChips.map(chip => (
              <button
                key={chip}
                onClick={() => askCoach(chip)}
                disabled={answerStreaming}
                className={`min-h-[44px] border px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.14em] transition-colors disabled:opacity-50 ${
                  activeChip === chip
                    ? 'bg-[#e84d85] border-[#e84d85] text-black'
                    : 'bg-[#202024] border-[#303037] text-[#9ca3af] hover:text-white hover:border-[#44413d]'
                }`}
              >
                {chip}
              </button>
            ))}
          </div>
          {(answer || answerStreaming) && (
            <div ref={answerRef} className="border border-[#303037] bg-[#151517] p-4 text-sm leading-relaxed text-[#d1d5db]">
              {answer}
              {answerStreaming && (
                <span className="inline-block w-2 h-3.5 bg-[#e84d85] animate-pulse ml-0.5 align-middle" />
              )}
            </div>
          )}
        </div>
      )}

      {/* Trophy Case — past weeks (group page only) */}
      {!minimal && (
        <div>
          <h3 className="font-mono text-[10px] uppercase tracking-widest mb-3" style={{ color: 'var(--text-muted)' }}>Trophy Case</h3>
          {sortedWeeks.length === 0 ? (
            <p className="text-[10px] text-[#4b5563] font-mono">
              Awards will appear here after the next briefing refresh.
            </p>
          ) : (
            <div className="space-y-4">
              {sortedWeeks.map(week => (
                <div key={week}>
                  <p className="text-[10px] font-mono text-[#4b5563] mb-2">
                    Week of {new Date(week + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </p>
                  <div className="grid sm:grid-cols-2 gap-2">
                    {awardWeeks[week].map(a => (
                      <div key={a.id} className="flex items-center gap-3 border border-[#1c1c1c] bg-[#151517] px-3 py-2.5">
                        <div className="relative shrink-0">
                          {a.athlete_profile ? (
                            <img src={a.athlete_profile} alt={a.athlete_name} className="w-7 h-7 rounded-full object-cover" />
                          ) : (
                            <div className="w-7 h-7 rounded-full bg-[#e84d85]/20 flex items-center justify-center text-[#e84d85] font-bold text-[10px]">
                              {a.athlete_name.slice(0, 2).toUpperCase()}
                            </div>
                          )}
                          <span className="absolute -bottom-0.5 -right-1 text-sm leading-none">{a.emoji}</span>
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-white truncate">{a.athlete_name.split(' ')[0]}</div>
                          <div className="text-[10px] text-[#6b7280] truncate">{a.award_label}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

    </div>
  )
}
