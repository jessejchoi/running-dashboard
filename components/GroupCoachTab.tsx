'use client'
import { useState, useEffect, useRef } from 'react'
import { RefreshCw, Send } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import type { BriefingContent } from '@/app/api/groups/[id]/coach/briefing/route'

interface Member {
  athlete_id: number
  name: string
  profile_pic: string | null
}

interface Props {
  groupId: string
  myRole: string
  members: Member[]
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
  return (
    <div className="bg-[#111] border border-[#2a2a2a] rounded-xl p-4">
      <div className="flex items-center gap-3 mb-2">
        <div className="relative">
          {member && <Avatar name={member.name} pic={member.profile_pic} />}
          <span className="absolute -bottom-1 -right-1 text-base leading-none">{shoutout.award_icon}</span>
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

export default function GroupCoachTab({ groupId, myRole, members }: Props) {
  const [briefing, setBriefing] = useState<BriefingContent | null>(null)
  const [briefingLoading, setBriefingLoading] = useState(false)
  const [briefingError, setBriefingError] = useState(false)
  const [briefingMeta, setBriefingMeta] = useState<{ cached: boolean; generated_at: string } | null>(null)
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [answerStreaming, setAnswerStreaming] = useState(false)
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
      setBriefingMeta({ cached: data.cached, generated_at: data.generated_at })
    } catch {
      setBriefingError(true)
    } finally {
      setBriefingLoading(false)
    }
  }

  useEffect(() => { fetchBriefing() }, [])

  async function askCoach() {
    if (!question.trim() || answerStreaming) return
    setAnswer('')
    setAnswerStreaming(true)
    try {
      const res = await fetch(`/api/groups/${groupId}/coach/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
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
        <div className="animate-pulse bg-[#111] border border-[#2a2a2a] rounded-xl h-16" />
        <div className="animate-pulse bg-[#111] border border-[#2a2a2a] rounded-xl h-20" />
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

  return (
    <div className="space-y-4 fade-up">

      {/* Weekly Briefing */}
      <div className="bg-[#111] border border-[#2a2a2a] rounded-2xl p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-display font-bold text-sm text-white">Weekly Briefing</span>
            <MomentumBadge momentum={briefing.group_momentum} />
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {briefingMeta && (
              <span className="text-[10px] text-[#4b5563]">
                {briefingMeta.cached ? 'Cached · ' : ''}
                {formatDistanceToNow(new Date(briefingMeta.generated_at), { addSuffix: true })}
              </span>
            )}
            {myRole === 'admin' && (
              <button
                onClick={() => fetchBriefing(true)}
                className="text-[#6b7280] hover:text-[#f97316] transition-colors"
                title="Refresh briefing"
              >
                <RefreshCw size={13} />
              </button>
            )}
          </div>
        </div>
        <p className="text-[#d1d5db] text-sm leading-relaxed">{briefing.weekly_summary}</p>
      </div>

      {/* Awards */}
      {briefing.shoutouts.length > 0 && (
        <div>
          <h3 className="text-[10px] font-bold text-[#6b7280] uppercase tracking-widest mb-3">This Week&rsquo;s Awards</h3>
          <div className="grid sm:grid-cols-2 gap-3">
            {briefing.shoutouts.map((s, i) => (
              <ShoutoutCard key={i} shoutout={s} members={members} />
            ))}
          </div>
        </div>
      )}

      {/* Coach Tip */}
      <div className="bg-[#111] border border-[#f97316]/20 rounded-xl p-4">
        <div className="text-[10px] font-bold text-[#f97316] uppercase tracking-widest mb-1">Coach Tip</div>
        <p className="text-sm text-[#d1d5db] leading-relaxed">{briefing.coach_tip}</p>
      </div>

      {/* Ask Coach */}
      <div className="bg-[#111] border border-[#2a2a2a] rounded-2xl p-5">
        <h3 className="font-display font-bold text-sm text-white mb-3">Ask Coach</h3>
        <div className="flex gap-2 mb-3">
          <input
            type="text"
            value={question}
            onChange={e => setQuestion(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') askCoach() }}
            placeholder="e.g. What pace should I target for my long run?"
            maxLength={500}
            className="flex-1 bg-[#0f0f0f] border border-[#2a2a2a] focus:border-[#f97316] rounded-lg px-3 py-2 text-sm outline-none placeholder:text-[#4b5563]"
          />
          <button
            onClick={askCoach}
            disabled={!question.trim() || answerStreaming}
            className="px-3 py-2 bg-[#f97316] hover:bg-[#ea580c] disabled:opacity-40 text-black rounded-lg transition-colors"
          >
            <Send size={14} />
          </button>
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

    </div>
  )
}
