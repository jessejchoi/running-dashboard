'use client'
import Link from 'next/link'
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

interface BriefingMeta {
  cached: boolean
  generated_at: string
}

interface Props {
  groupId: string
  myRole: string
  members: Member[]
  /** When true, hides Ask Coach (used on the home page) */
  minimal?: boolean
  initialBriefing?: BriefingContent | null
  initialBriefingMeta?: BriefingMeta | null
}


function Avatar({ name, pic }: { name: string; pic: string | null }) {
  if (pic) {
    return <img src={pic} alt={name} className="w-8 h-8 rounded-full object-cover" />
  }
  const initials = name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
  return (
    <div className="w-8 h-8 rounded-full bg-[#f97316]/20 flex items-center justify-center text-[#f97316] font-bold text-xs">
      {initials}
    </div>
  )
}

function MomentumBadge({ momentum }: { momentum: 'rising' | 'steady' | 'dipping' }) {
  const config = {
    rising:  { label: 'Rising',  color: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20' },
    steady:  { label: 'Steady',  color: 'text-sky-400 bg-sky-400/10 border-sky-400/20' },
    dipping: { label: 'Dipping', color: 'text-amber-400 bg-amber-400/10 border-amber-400/20' },
  }
  const c = config[momentum]
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${c.color}`}>
      {c.label}
    </span>
  )
}

function ShoutoutCard({ shoutout, members }: { shoutout: BriefingContent['shoutouts'][0]; members: Member[] }) {
  const firstName = shoutout.athlete_name.split(' ')[0]
  const member = members.find(m => m.name.split(' ')[0].toLowerCase() === firstName.toLowerCase())
  const emoji = isValidAwardKey(shoutout.award_key) ? AWARD_CATEGORIES[shoutout.award_key].emoji : '🏆'
  return (
    <div className="bg-[#111] border border-[#2a2a2a] rounded-xl p-4">
      <div className="flex items-center gap-3 mb-2">
        <div className="relative">
          {member && <Avatar name={member.name} pic={member.profile_pic} />}
          <span className="absolute -bottom-1 -right-1 text-base leading-none">{emoji}</span>
        </div>
        <div>
          <div className="font-bold text-sm text-white">{shoutout.athlete_name}</div>
          <div className="text-[10px] font-bold text-[#f97316] uppercase tracking-wide">{shoutout.award_label}</div>
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

export default function GroupCoachTab({ groupId, myRole, members, minimal = false, initialBriefing, initialBriefingMeta }: Props) {
  const [briefing, setBriefing] = useState<BriefingContent | null>(initialBriefing?.weekly_edition ? initialBriefing : null)
  const [briefingLoading, setBriefingLoading] = useState(false)
  const [briefingError, setBriefingError] = useState(false)
  const [briefingMeta, setBriefingMeta] = useState<BriefingMeta | null>(initialBriefingMeta ?? null)
  const [answer, setAnswer] = useState('')
  const [answerStreaming, setAnswerStreaming] = useState(false)
  const [activeChip, setActiveChip] = useState<string | null>(null)
  const answerRef = useRef<HTMLDivElement>(null)

  async function fetchBriefing(force = false) {
    if(!briefing) setBriefingLoading(true)
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

  useEffect(() => {
    fetchBriefing()
    const refresh=()=>{void fetchBriefing()}
    window.addEventListener('rundash:refresh',refresh)
    return()=>window.removeEventListener('rundash:refresh',refresh)
  }, [groupId])

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
        <div className="animate-pulse bg-[#111] border border-[#2a2a2a] rounded-2xl h-32" />
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="animate-pulse bg-[#111] border border-[#2a2a2a] rounded-xl h-24" />
          <div className="animate-pulse bg-[#111] border border-[#2a2a2a] rounded-xl h-24" />
        </div>
        {!minimal && <div className="animate-pulse bg-[#111] border border-[#2a2a2a] rounded-xl h-16" />}
      </div>
    )
  }

  if (briefingError) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4 fade-up">
        <p className="text-[#6b7280] text-sm">RDCoach is taking a rest day.</p>
        <button
          onClick={() => fetchBriefing()}
          className="flex items-center gap-2 px-4 py-2 bg-[#1a1a1a] border border-[#2a2a2a] hover:border-[#f97316] text-sm font-medium rounded-lg transition-colors"
        >
          <RefreshCw size={14} /> Retry
        </button>
      </div>
    )
  }

  if (!briefing) return null

  const coachChips = briefing.ask_prompts?.length ? briefing.ask_prompts : COACH_CHIPS

  return (
    <div className="space-y-4 fade-up">

      {/* Coach Briefing */}
      <div className="card overflow-visible">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-display font-bold text-lg text-[var(--text-1)]">Coach · Weekly edition</span>
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
              className="min-h-[44px] min-w-[44px] flex items-center justify-center text-[var(--text-3)] hover:text-[var(--accent)] transition-colors"
              title="Refresh weekly edition"
              aria-label="Refresh weekly edition"
            >
              <RefreshCw size={13} />
            </button>
          </div>
        </div>
        {briefing.weekly_edition && (
          <p className="font-mono text-[11px] text-[var(--text-3)] mb-3">
            Week of {briefing.weekly_edition.week_start} · Through {briefing.weekly_edition.as_of} · Jakarta week
          </p>
        )}
        <p className="text-[var(--text-2)] text-[13px] leading-6 break-words overflow-visible pb-0.5">
          {briefing.weekly_summary}
        </p>
        {!minimal && briefing.weekly_edition && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
            {briefing.weekly_edition.members.map(member => (
              <article key={member.athlete_id} className="min-w-0 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
                <h3 className="font-display text-lg font-bold break-words">{member.name}</h3>
                <p className="font-mono text-sm mt-2">{member.km.toFixed(1)} km · {member.runs} runs this week</p>
                <p className="text-xs text-[var(--text-3)] mt-2">4-week average: {member.baseline_weekly_km.toFixed(1)} km/week</p>
                <p className="text-sm text-[var(--text-2)] mt-2">
                  {member.planned ? `${member.completed} of ${member.planned} workouts through today completed.` : 'No workouts scheduled through today.'}
                </p>
                <p className="text-sm text-[var(--text-2)] mt-2">{member.next_focus}</p>
              </article>
            ))}
          </div>
        )}
        {!minimal && briefing.challenge_nudge && <p className="text-sm text-[var(--text-2)] mt-4">{briefing.challenge_nudge}</p>}
        {!minimal && briefing.risks?.map((risk, i) => <p key={i} className="text-sm text-[var(--warning)] mt-2">{risk}</p>)}
        {!minimal && <Link href="/plan" className="rd-button inline-flex items-center mt-4">Build your personal week →</Link>}
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
        <div className="bg-[#111] border border-[#2a2a2a] rounded-2xl p-5">
          <h3 className="font-display font-bold text-sm text-white mb-3">Ask Coach</h3>
          <div className="flex flex-wrap gap-2 mb-3">
            {coachChips.map(chip => (
              <button
                key={chip}
                onClick={() => askCoach(chip)}
                disabled={answerStreaming}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors disabled:opacity-50 ${
                  activeChip === chip
                    ? 'bg-[#f97316] border-[#f97316] text-black'
                    : 'bg-[#1a1a1a] border-[#2a2a2a] text-[#9ca3af] hover:text-white hover:border-[#3a3a3a]'
                }`}
              >
                {chip}
              </button>
            ))}
          </div>
          {(answer || answerStreaming) && (
            <div ref={answerRef} className="text-sm text-[#d1d5db] leading-relaxed bg-[#0f0f0f] rounded-xl p-4 border border-[#2a2a2a]">
              {answer}
              {answerStreaming && (
                <span className="inline-block w-2 h-3.5 bg-[#f97316] animate-pulse ml-0.5 align-middle" />
              )}
            </div>
          )}
        </div>
      )}

    </div>
  )
}
