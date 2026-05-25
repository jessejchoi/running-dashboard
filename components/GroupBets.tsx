'use client'

import { useEffect, useMemo, useState } from 'react'
import { format, formatDistanceToNow } from 'date-fns'
import { Banknote, Check, Clock, ExternalLink, MessageCircle, Plus, Sparkles, Trophy, Trash2, X } from 'lucide-react'
import { useUnit } from '@/lib/unit-context'
import { defaultWeekWindow, metricProgressPercent, metricTargetLabel, type BetMetricType, type BetSide } from '@/lib/groupBets'
import { DISTANCE_OPTIONS, parseTime } from '@/lib/goals'
import { Avatar, type Member } from '@/components/GroupShared'

interface BetPosition {
  id: string
  athlete_id: number
  athlete_name: string
  athlete_profile: string | null
  side: BetSide
  pledge_cents: number
  is_me: boolean
}

interface BetComment {
  id: string
  author_athlete_id: number
  author_name: string
  author_profile: string | null
  content: string
  created_at: string
  is_mine: boolean
}

interface BetEvent {
  id: string
  bet_id: string | null
  actor_athlete_id: number | null
  actor_name: string | null
  actor_profile: string | null
  event_type: 'created' | 'joined' | 'accepted' | 'declined' | 'resolved' | 'voided' | 'deleted' | 'coach_suggested'
  payload: Record<string, unknown>
  created_at: string
}

interface GroupBet {
  id: string
  mode: 'direct' | 'pool'
  creator_athlete_id: number
  creator_name: string
  creator_profile: string | null
  target_athlete_id: number
  target_name: string
  target_profile: string | null
  metric_type: BetMetricType
  comparator: 'gte' | 'lte'
  target_value: number | null
  distance_key: '5k' | '10k' | 'hm' | 'fm' | null
  target_secs: number | null
  window_start: string
  window_end: string
  pledge_cents: number
  currency: string
  creator_side: BetSide
  status: 'open' | 'locked' | 'won' | 'lost' | 'void'
  outcome_achieved: boolean | null
  winning_side: BetSide | null
  resolution: Record<string, unknown>
  best_activity_id?: number | null
  is_creator: boolean
  is_target: boolean
  my_position: BetPosition | null
  positions: BetPosition[]
  comments: BetComment[]
  live_result: {
    achieved: boolean
    currentValue: number
    evidenceLabel: string
    winningSide: BetSide
  }
}

interface ScoreboardMember {
  athlete_id: number
  athlete_name: string
  athlete_profile: string | null
  wins: number
  losses: number
  voids: number
  winRate: number
  totalPledgeCents: number
  openExposureCents: number
  is_me?: boolean
}

interface BetScoreboard {
  members: ScoreboardMember[]
  bestPredictor: ScoreboardMember | null
  mostBackedAthlete: { athlete_id: number; athlete_name: string; athlete_profile: string | null } | null
  mostDoubtedAthlete: { athlete_id: number; athlete_name: string; athlete_profile: string | null } | null
  biggestUpset: { betId: string; winnerCount: number; loserCount: number } | null
  totalPledgedCents: number
}

interface BetSuggestion {
  id: string
  title: string
  reason: string
  template: BetTemplate
}

interface BetTemplate {
  mode?: 'pool' | 'direct'
  target_athlete_id?: number
  metric_type?: BetMetricType
  comparator?: 'gte' | 'lte'
  target_value?: number
  target_value_km?: number
  distance_key?: '5k' | '10k' | 'hm' | 'fm'
  target_time?: string
  target_secs?: number
  window_start?: string
  window_end?: string
  creator_side?: BetSide
  pledge_amount?: number
  config?: Record<string, unknown>
}

interface Props {
  groupId: string
  members: Member[]
  myRole: string
  compact?: boolean
}

const STATUS_STYLE: Record<GroupBet['status'], string> = {
  open: 'text-[#e84d85] bg-[#e84d85]/10 border-[#e84d85]/20',
  locked: 'text-[#6bbfdf] bg-[#6bbfdf]/10 border-[#6bbfdf]/20',
  won: 'text-[#b8d957] bg-[#b8d957]/10 border-[#b8d957]/20',
  lost: 'text-[#e84d85] bg-[#e84d85]/10 border-[#e84d85]/20',
  void: 'text-[#9ca3af] bg-[#202024] border-[#303037]',
}

function money(cents: number) {
  return `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`
}

function displayDateRange(start: string, end: string) {
  return `${format(new Date(`${start}T12:00:00`), 'MMM d')} - ${format(new Date(`${end}T12:00:00`), 'MMM d')}`
}

function sideCopy(side: BetSide) {
  return side === 'for' ? 'They will' : 'They will not'
}

function eventCopy(event: BetEvent) {
  const actor = event.actor_name?.split(' ')[0] ?? 'RunDash'
  const side = typeof event.payload.side === 'string' ? sideCopy(event.payload.side as BetSide).toLowerCase() : ''
  if (event.event_type === 'created') return `${actor} created a bet`
  if (event.event_type === 'joined') return `${actor} joined ${side}`
  if (event.event_type === 'accepted') return `${actor} accepted the direct bet`
  if (event.event_type === 'declined') return `${actor} declined the direct bet`
  if (event.event_type === 'resolved') return `Resolved: ${event.payload.evidence_label ?? 'result posted'}`
  if (event.event_type === 'voided') return 'Bet voided'
  if (event.event_type === 'deleted') return `${actor} deleted a bet`
  return 'Coach suggested a bet'
}

function valueLabel(bet: GroupBet, value: number) {
  if (bet.metric_type === 'race_time') {
    const min = Math.floor(value / 60)
    const sec = Math.round(value % 60)
    return `${min}:${String(sec).padStart(2, '0')}`
  }
  if (bet.metric_type === 'run_count') return `${Math.round(value)} runs`
  return `${(value / 1000).toFixed(1)} km`
}

function BetStatusChip({ status }: { status: GroupBet['status'] }) {
  return (
    <span className={`inline-flex items-center border px-1.5 py-0.5 text-[10px] font-mono uppercase ${STATUS_STYLE[status]}`}>
      {status}
    </span>
  )
}

function BetCard({
  bet,
  groupId,
  myRole,
  onChanged,
  compact = false,
}: {
  bet: GroupBet
  groupId: string
  myRole: string
  onChanged: () => void
  compact?: boolean
}) {
  const [busy, setBusy] = useState<string | null>(null)
  const [comment, setComment] = useState('')
  const targetLabel = metricTargetLabel(bet)
  const progress = metricProgressPercent(bet, bet.live_result.currentValue)
  const forCount = bet.positions.filter(p => p.side === 'for').length
  const againstCount = bet.positions.filter(p => p.side === 'against').length
  const canJoinPool = bet.mode === 'pool' && bet.status === 'open' && !bet.my_position
  const canAcceptDirect = bet.mode === 'direct' && bet.status === 'open' && bet.is_target && !bet.my_position
  const canDelete = myRole === 'admin' || bet.is_creator

  async function mutate(action: string, body: Record<string, unknown> = {}) {
    setBusy(action)
    try {
      const res = await fetch(`/api/groups/${groupId}/bets`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, bet_id: bet.id, ...body }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        alert(data.error ?? 'Bet action failed.')
        return
      }
      onChanged()
    } finally {
      setBusy(null)
    }
  }

  async function deleteBet() {
    if (!confirm('Delete this bet?')) return
    setBusy('delete')
    try {
      const res = await fetch(`/api/groups/${groupId}/bets?betId=${bet.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        alert(data.error ?? 'Could not delete this bet.')
        return
      }
      onChanged()
    } finally {
      setBusy(null)
    }
  }

  async function sendComment() {
    const trimmed = comment.trim()
    if (!trimmed) return
    setBusy('comment')
    try {
      const res = await fetch(`/api/groups/${groupId}/bets/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bet_id: bet.id, content: trimmed }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        alert(data.error ?? 'Could not add comment.')
        return
      }
      setComment('')
      onChanged()
    } finally {
      setBusy(null)
    }
  }

  async function deleteComment(commentId: string) {
    setBusy(`comment-${commentId}`)
    try {
      const res = await fetch(`/api/groups/${groupId}/bets/comments?commentId=${commentId}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        alert(data.error ?? 'Could not delete comment.')
        return
      }
      onChanged()
    } finally {
      setBusy(null)
    }
  }

  const attempts = Array.isArray(bet.resolution?.attempts) ? bet.resolution.attempts as Array<{ activityId: number; label: string; value: number; isBest: boolean }> : []
  const contributing = Array.isArray(bet.resolution?.contributing_activities)
    ? bet.resolution.contributing_activities as Array<{ activityId: number; label: string; value: number }>
    : []
  const winningPositions = bet.positions.filter(p => p.side === (bet.winning_side ?? bet.live_result.winningSide))

  return (
    <div className="border border-[#303037] bg-[#151517] p-4 transition-colors hover:border-[#383838]">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <BetStatusChip status={bet.status} />
            <span className="text-[10px] font-mono uppercase text-[#6b7280]">{bet.mode === 'direct' ? 'Direct' : 'Open pool'}</span>
            <span className="text-[10px] font-mono text-[#6b7280]">{displayDateRange(bet.window_start, bet.window_end)}</span>
          </div>
          <div className="flex items-center gap-2 mb-2">
            <Avatar name={bet.target_name} pic={bet.target_profile} size={6} />
            <p className="text-sm font-bold text-white leading-snug">
              <span className="text-[#e84d85]">{bet.target_name.split(' ')[0]}</span> to hit {targetLabel}
            </p>
          </div>
          <p className="text-xs text-[#6b7280]">
            {bet.creator_name.split(' ')[0]} says <span className="text-white">{sideCopy(bet.creator_side).toLowerCase()}</span>.
          </p>
        </div>
        <div className="text-right shrink-0">
          <div className="font-mono text-lg font-bold text-white">{money(bet.pledge_cents)}</div>
          <div className="text-[10px] text-[#6b7280]">pledge</div>
        </div>
      </div>

      <div className="mb-3">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs text-[#6b7280]">{bet.live_result.evidenceLabel}</span>
          <span className="text-xs font-mono text-[#e84d85]">{Math.round(progress)}%</span>
        </div>
        <div className="h-2 overflow-hidden bg-[#1c1c1c]">
          <div className="h-full bg-[#e84d85] transition-all duration-500" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {!compact && (
        <div className="grid grid-cols-2 gap-2 mb-3">
          <div className="border border-[#1c1c1c] bg-[#151517] p-2">
            <div className="text-[10px] text-[#6b7280] uppercase font-mono mb-1">They will</div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-sm font-mono font-bold text-white">{forCount}</span>
              {bet.positions.filter(p => p.side === 'for').slice(0, 4).map(p => (
                <Avatar key={p.id} name={p.athlete_name} pic={p.athlete_profile} size={4} />
              ))}
            </div>
          </div>
          <div className="border border-[#1c1c1c] bg-[#151517] p-2">
            <div className="text-[10px] text-[#6b7280] uppercase font-mono mb-1">They will not</div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-sm font-mono font-bold text-white">{againstCount}</span>
              {bet.positions.filter(p => p.side === 'against').slice(0, 4).map(p => (
                <Avatar key={p.id} name={p.athlete_name} pic={p.athlete_profile} size={4} />
              ))}
            </div>
          </div>
        </div>
      )}

      {bet.status === 'won' || bet.status === 'lost' ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs text-[#a1a1aa]">
            <Check size={13} className={bet.winning_side === 'for' ? 'text-[#b8d957]' : 'text-[#e84d85]'} />
            Winning side: {sideCopy(bet.winning_side ?? bet.live_result.winningSide)}
          </div>
          {!compact && (
            <div className="space-y-2 border border-[#1c1c1c] bg-[#151517] p-2.5">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[10px] font-mono uppercase text-[#6b7280]">Final evidence</span>
                <span className="text-xs font-mono text-white">{valueLabel(bet, Number(bet.resolution?.current_value ?? bet.live_result.currentValue))}</span>
              </div>
              {bet.best_activity_id && (
                <a href={`/runs/${bet.best_activity_id}?from=group/${groupId}`} className="inline-flex items-center gap-1 text-xs text-[#e84d85] hover:text-[#ff7a9d] transition-colors">
                  Decisive run <ExternalLink size={11} />
                </a>
              )}
              {attempts.length > 0 && (
                <div className="space-y-1">
                  {attempts.slice(0, 4).map(attempt => (
                    <a
                      key={attempt.activityId}
                      href={`/runs/${attempt.activityId}?from=group/${groupId}`}
                      className={`flex items-center justify-between gap-2 px-2 py-1 text-xs ${attempt.isBest ? 'bg-[#e84d85]/10 text-[#e84d85]' : 'text-[#9ca3af] hover:text-white'}`}
                    >
                      <span>{attempt.label}</span>
                      {attempt.isBest && <span className="font-mono">best</span>}
                    </a>
                  ))}
                </div>
              )}
              {attempts.length === 0 && contributing.length > 0 && (
                <div className="space-y-1">
                  {contributing.slice(0, 3).map(activity => (
                    <a key={activity.activityId} href={`/runs/${activity.activityId}?from=group/${groupId}`} className="flex items-center justify-between gap-2 px-2 py-1 text-xs text-[#9ca3af] hover:text-white">
                      <span className="truncate">{activity.label}</span>
                      <span className="font-mono shrink-0">{valueLabel(bet, activity.value)}</span>
                    </a>
                  ))}
                </div>
              )}
              {winningPositions.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap pt-1">
                  <span className="text-[10px] text-[#6b7280] font-mono uppercase">Winners</span>
                  {winningPositions.map(p => (
                    <Avatar key={p.id} name={p.athlete_name} pic={p.athlete_profile} size={4} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      ) : bet.status === 'void' ? (
        <div className="flex items-center gap-2 text-xs text-[#6b7280]">
          <X size={13} />
          Voided
        </div>
      ) : bet.my_position ? (
        <div className="flex items-center gap-2 text-xs text-[#a1a1aa]">
          <Check size={13} className="text-[#e84d85]" />
          You are on: <span className="text-white">{sideCopy(bet.my_position.side)}</span>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {canJoinPool && (
            <>
              <button
                onClick={() => mutate('join', { side: 'for' })}
                disabled={busy !== null}
                className="min-h-[44px] bg-[#e84d85] px-3 py-2 text-xs font-bold text-black transition-colors hover:bg-[#c23b6b] disabled:opacity-50"
              >
                Join: will
              </button>
              <button
                onClick={() => mutate('join', { side: 'against' })}
                disabled={busy !== null}
                className="min-h-[44px] border border-[#303037] bg-[#202024] px-3 py-2 text-xs font-bold text-[#d1d5db] transition-colors hover:border-[#e84d85] hover:text-white disabled:opacity-50"
              >
                Join: will not
              </button>
            </>
          )}
          {canAcceptDirect && (
            <>
              <button
                onClick={() => mutate('accept')}
                disabled={busy !== null}
                className="min-h-[44px] bg-[#e84d85] px-3 py-2 text-xs font-bold text-black transition-colors hover:bg-[#c23b6b] disabled:opacity-50"
              >
                Accept
              </button>
              <button
                onClick={() => mutate('decline')}
                disabled={busy !== null}
                className="min-h-[44px] border border-[#303037] bg-[#202024] px-3 py-2 text-xs font-bold text-[#d1d5db] transition-colors hover:border-[#e84d85] hover:text-[#e84d85] disabled:opacity-50"
              >
                Decline
              </button>
            </>
          )}
        </div>
      )}

      {canDelete && !compact && (
        <div className="mt-3 pt-3 border-t border-[#1c1c1c] flex items-center justify-between gap-3">
          <p className="text-[10px] text-[#6b7280]">Pledge only. Settled outside RunDash.</p>
          <button
            onClick={deleteBet}
            disabled={busy !== null}
            className="min-h-[32px] px-2 text-[#4b5563] hover:text-[#e84d85] transition-colors disabled:opacity-50"
            title="Delete bet"
          >
            <Trash2 size={14} />
          </button>
        </div>
      )}

      {!compact && (
        <div className="mt-3 pt-3 border-t border-[#1c1c1c]">
          <div className="flex items-center gap-1.5 mb-2">
            <MessageCircle size={12} className="text-[#6b7280]" />
            <span className="text-[10px] font-mono uppercase text-[#6b7280]">Trash talk</span>
          </div>
          {bet.comments.length > 0 && (
            <div className="space-y-2 mb-2">
              {bet.comments.slice(-4).map(c => (
                <div key={c.id} className="flex items-start gap-2 text-xs">
                  <Avatar name={c.author_name} pic={c.author_profile} size={4} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-[#d1d5db]">{c.is_mine ? 'You' : c.author_name.split(' ')[0]}</span>
                      <span className="font-mono text-[10px] text-[#4b5563]">{formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}</span>
                      {(c.is_mine || myRole === 'admin') && (
                        <button onClick={() => deleteComment(c.id)} className="text-[#4b5563] hover:text-[#e84d85] transition-colors">
                          <X size={10} />
                        </button>
                      )}
                    </div>
                    <p className="text-[#9ca3af] break-words">{c.content}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <input
              value={comment}
              onChange={e => setComment(e.target.value)}
              maxLength={280}
              placeholder="Add a comment..."
              className="min-h-[44px] flex-1 border border-[#303037] bg-[#151517] px-3 text-xs outline-none focus:border-[#e84d85]"
            />
            <button
              onClick={sendComment}
              disabled={!comment.trim() || busy !== null}
              className="min-h-[44px] border border-[#303037] bg-[#202024] px-3 text-xs font-bold text-[#d1d5db] transition-colors hover:border-[#e84d85] hover:text-white disabled:opacity-50"
            >
              Send
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function CreateBetModal({
  groupId,
  members,
  initialTemplate,
  onClose,
  onCreated,
}: {
  groupId: string
  members: Member[]
  initialTemplate?: BetTemplate | null
  onClose: () => void
  onCreated: () => void
}) {
  const { unit } = useUnit()
  const week = useMemo(() => defaultWeekWindow(), [])
  const otherMembers = useMemo(() => members.filter(m => !m.is_me), [members])
  const fallbackTarget = otherMembers[0]?.athlete_id ?? members[0]?.athlete_id ?? 0
  const [mode, setMode] = useState<'pool' | 'direct'>(initialTemplate?.mode ?? 'pool')
  const [targetAthleteId, setTargetAthleteId] = useState(initialTemplate?.target_athlete_id ?? fallbackTarget)
  const [metricType, setMetricType] = useState<BetMetricType>(initialTemplate?.metric_type ?? 'weekly_distance')
  const [creatorSide, setCreatorSide] = useState<BetSide>(initialTemplate?.creator_side ?? 'against')
  const [targetValue, setTargetValue] = useState(String(initialTemplate?.target_value_km ?? initialTemplate?.target_value ?? 100))
  const [distanceKey, setDistanceKey] = useState<'5k' | '10k' | 'hm' | 'fm'>(initialTemplate?.distance_key ?? '10k')
  const [targetTime, setTargetTime] = useState(initialTemplate?.target_time ?? '45:00')
  const [windowStart, setWindowStart] = useState(initialTemplate?.window_start ?? week.start)
  const [windowEnd, setWindowEnd] = useState(initialTemplate?.window_end ?? week.end)
  const [pledgeAmount, setPledgeAmount] = useState(String(initialTemplate?.pledge_amount ?? 20))
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (mode === 'direct' && members.find(m => m.athlete_id === targetAthleteId)?.is_me) {
      setTargetAthleteId(otherMembers[0]?.athlete_id ?? 0)
    }
  }, [mode, targetAthleteId, members, otherMembers])

  useEffect(() => {
    if (initialTemplate) return
    if (metricType === 'weekly_distance') {
      setWindowStart(week.start)
      setWindowEnd(week.end)
    }
    if (metricType === 'run_count') setTargetValue('4')
    if (metricType === 'longest_run') setTargetValue(unit === 'miles' ? '12' : '20')
    if (metricType === 'planned_session') setTargetValue(unit === 'miles' ? '6' : '10')
    if (metricType === 'distance' || metricType === 'weekly_distance') setTargetValue(unit === 'miles' ? '62' : '100')
  }, [initialTemplate, metricType, unit, week.end, week.start])

  async function createBet() {
    setError('')
    const numericTarget = Number(targetValue)
    const pledge = Number(pledgeAmount)
    const targetSecs = parseTime(targetTime)
    if (!targetAthleteId) { setError('Choose a target member.'); return }
    if (!pledge || pledge <= 0) { setError('Enter a pledge amount.'); return }
    if (metricType === 'race_time' && targetSecs <= 0) { setError('Enter a valid target time.'); return }
    if (metricType !== 'race_time' && (!numericTarget || numericTarget <= 0)) { setError('Enter a valid target.'); return }

    const isDistanceMetric = metricType === 'weekly_distance' || metricType === 'distance' || metricType === 'longest_run' || metricType === 'planned_session'
    const meters = isDistanceMetric
      ? unit === 'miles' ? numericTarget * 1609.344 : numericTarget * 1000
      : numericTarget

    setSaving(true)
    try {
      const res = await fetch(`/api/groups/${groupId}/bets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          target_athlete_id: targetAthleteId,
          metric_type: metricType,
          comparator: metricType === 'race_time' ? 'lte' : 'gte',
          target_value: metricType === 'race_time' ? null : meters,
          distance_key: metricType === 'race_time' ? distanceKey : null,
          target_secs: metricType === 'race_time' ? targetSecs : null,
          window_start: windowStart,
          window_end: windowEnd,
          pledge_amount: pledge,
          creator_side: creatorSide,
          config: initialTemplate?.config ?? {},
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error ?? 'Could not create bet.')
        return
      }
      onCreated()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const targetUnit = unit === 'miles' ? 'mi' : 'km'

  return (
    <div className="fixed inset-0 z-[9998] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="glass rounded-2xl w-full max-w-lg p-5 sm:p-6 z-[9999] max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-display font-bold text-lg">New Bet</h2>
          <button onClick={onClose} className="min-h-[44px] min-w-[44px] flex items-center justify-center text-[#6b7280] hover:text-white">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4">
          {!initialTemplate && (
            <div>
              <label className="block text-xs font-bold text-[#6b7280] mb-1.5">Template</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {([
                  { key: 'weekly_distance', label: 'Weekly' },
                  { key: 'longest_run', label: 'Long run' },
                  { key: 'race_time', label: 'Race time' },
                  { key: 'planned_session', label: 'Plan' },
                  { key: 'run_count', label: 'Streak' },
                  { key: 'distance', label: 'Custom' },
                ] as const).map(opt => (
                  <button
                    key={opt.key}
                    onClick={() => setMetricType(opt.key)}
                    className={`min-h-[44px] rounded-md px-2 text-xs font-bold border transition-colors ${metricType === opt.key ? 'bg-[#e84d85] border-[#e84d85] text-black' : 'bg-[#151517] border-[#303037] text-[#a1a1aa] hover:text-white'}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-[#6b7280] mb-1.5">Mode</label>
            <div className="grid grid-cols-2 gap-2">
              {([
                { key: 'pool', label: 'Open Pool' },
                { key: 'direct', label: 'Direct' },
              ] as const).map(opt => (
                <button
                  key={opt.key}
                  onClick={() => setMode(opt.key)}
                  className={`min-h-[44px] rounded-md text-xs font-bold border transition-colors ${mode === opt.key ? 'bg-[#e84d85] border-[#e84d85] text-black' : 'bg-[#151517] border-[#303037] text-[#a1a1aa] hover:text-white'}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-[#6b7280] mb-1.5">Target member</label>
            <select
              value={targetAthleteId}
              onChange={e => setTargetAthleteId(Number(e.target.value))}
              className="w-full bg-[#151517] border border-[#303037] focus:border-[#e84d85] rounded-lg px-3 py-2 text-sm outline-none min-h-[44px]"
            >
              {members.filter(m => mode === 'pool' || !m.is_me).map(m => (
                <option key={m.athlete_id} value={m.athlete_id}>{m.is_me ? 'You' : m.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-[#6b7280] mb-1.5">Metric</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {([
                { key: 'weekly_distance', label: 'Weekly distance' },
                { key: 'distance', label: 'Window distance' },
                { key: 'run_count', label: 'Run count' },
                { key: 'longest_run', label: 'Longest run' },
                { key: 'race_time', label: 'Race time' },
                { key: 'planned_session', label: 'Planned session' },
              ] as const).map(opt => (
                <button
                  key={opt.key}
                  onClick={() => setMetricType(opt.key)}
                  className={`min-h-[44px] rounded-md px-2 text-xs font-bold border transition-colors ${metricType === opt.key ? 'bg-[#e84d85] border-[#e84d85] text-black' : 'bg-[#151517] border-[#303037] text-[#a1a1aa] hover:text-white'}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {metricType === 'race_time' ? (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-[#6b7280] mb-1.5">Distance</label>
                <select
                  value={distanceKey}
                  onChange={e => setDistanceKey(e.target.value as typeof distanceKey)}
                  className="w-full bg-[#151517] border border-[#303037] focus:border-[#e84d85] rounded-lg px-3 py-2 text-sm outline-none min-h-[44px]"
                >
                  {DISTANCE_OPTIONS.map(d => <option key={d.key} value={d.key}>{d.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-[#6b7280] mb-1.5">Target time</label>
                <input
                  value={targetTime}
                  onChange={e => setTargetTime(e.target.value)}
                  placeholder="45:00"
                  className="w-full bg-[#151517] border border-[#303037] focus:border-[#e84d85] rounded-lg px-3 py-2 text-sm outline-none min-h-[44px]"
                />
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-xs font-bold text-[#6b7280] mb-1.5">
                Target {metricType === 'run_count' ? '(runs)' : `(${targetUnit})`}
              </label>
              <input
                type="number"
                min="1"
                value={targetValue}
                onChange={e => setTargetValue(e.target.value)}
                className="w-full bg-[#151517] border border-[#303037] focus:border-[#e84d85] rounded-lg px-3 py-2 text-sm outline-none min-h-[44px]"
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-[#6b7280] mb-1.5">Window start</label>
              <input
                type="date"
                value={windowStart}
                onChange={e => setWindowStart(e.target.value)}
                disabled={metricType === 'weekly_distance'}
                className="w-full bg-[#151517] border border-[#303037] focus:border-[#e84d85] rounded-lg px-3 py-2 text-sm outline-none min-h-[44px] disabled:opacity-60"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#6b7280] mb-1.5">Window end</label>
              <input
                type="date"
                value={windowEnd}
                onChange={e => setWindowEnd(e.target.value)}
                disabled={metricType === 'weekly_distance'}
                className="w-full bg-[#151517] border border-[#303037] focus:border-[#e84d85] rounded-lg px-3 py-2 text-sm outline-none min-h-[44px] disabled:opacity-60"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-[#6b7280] mb-1.5">Your side</label>
              <select
                value={creatorSide}
                onChange={e => setCreatorSide(e.target.value as BetSide)}
                className="w-full bg-[#151517] border border-[#303037] focus:border-[#e84d85] rounded-lg px-3 py-2 text-sm outline-none min-h-[44px]"
              >
                <option value="for">They will</option>
                <option value="against">They will not</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-[#6b7280] mb-1.5">Pledge</label>
              <input
                type="number"
                min="1"
                value={pledgeAmount}
                onChange={e => setPledgeAmount(e.target.value)}
                className="w-full bg-[#151517] border border-[#303037] focus:border-[#e84d85] rounded-lg px-3 py-2 text-sm outline-none min-h-[44px]"
              />
            </div>
          </div>

          <div className="bg-[#151517] border border-[#1c1c1c] rounded-lg p-3 flex items-start gap-2">
            <Banknote size={15} className="text-[#e84d85] mt-0.5 shrink-0" />
            <p className="text-xs text-[#6b7280] leading-relaxed">
              Pledge only. RunDash tracks the bet, but any money is settled outside the app.
            </p>
          </div>

          {error && <p className="text-[#e84d85] text-xs">{error}</p>}

          <button
            onClick={createBet}
            disabled={saving}
            className="w-full min-h-[44px] py-2.5 bg-[#e84d85] hover:bg-[#c23b6b] disabled:opacity-50 text-black font-bold text-sm rounded-md transition-colors"
          >
            {saving ? 'Creating...' : 'Create Bet'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ScoreboardPanel({ scoreboard }: { scoreboard: BetScoreboard | null }) {
  if (!scoreboard || scoreboard.members.length === 0) {
    return (
      <div className="card py-5">
        <div className="flex items-center gap-2 text-[#6b7280] text-sm">
          <Trophy size={16} />
          No resolved bets yet. The scoreboard is waiting for receipts.
        </div>
      </div>
    )
  }

  const stat = (label: string, value: string) => (
    <div className="bg-[#151517] border border-[#1c1c1c] rounded-lg p-3">
      <div className="text-[10px] font-mono uppercase text-[#6b7280] mb-1">{label}</div>
      <div className="font-mono font-bold text-white">{value}</div>
    </div>
  )

  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-display font-bold text-sm text-white">Betting Board</h3>
        <span className="text-[10px] font-mono text-[#6b7280]">{money(scoreboard.totalPledgedCents)} pledged</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {stat('Best predictor', scoreboard.bestPredictor?.athlete_name?.split(' ')[0] ?? '-')}
        {stat('Most backed', scoreboard.mostBackedAthlete?.athlete_name?.split(' ')[0] ?? '-')}
        {stat('Most doubted', scoreboard.mostDoubtedAthlete?.athlete_name?.split(' ')[0] ?? '-')}
        {stat('Biggest upset', scoreboard.biggestUpset ? `${scoreboard.biggestUpset.winnerCount}/${scoreboard.biggestUpset.loserCount}` : '-')}
      </div>
      <div className="divide-y divide-[#1c1c1c]">
        {scoreboard.members.slice(0, 6).map(member => (
          <div key={member.athlete_id} className="flex items-center gap-3 py-2.5">
            <Avatar name={member.athlete_name} pic={member.athlete_profile} size={6} />
            <div className="flex-1 min-w-0">
              <div className="text-xs font-bold text-white truncate">{member.is_me ? 'You' : member.athlete_name}</div>
              <div className="text-[10px] text-[#6b7280] font-mono">
                {member.wins}W {member.losses}L {member.voids}V
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs font-mono text-[#e84d85]">{Math.round(member.winRate * 100)}%</div>
              <div className="text-[10px] text-[#6b7280]">{money(member.openExposureCents)} open</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function CoachPicks({
  suggestions,
  onUse,
}: {
  suggestions: BetSuggestion[]
  onUse: (template: BetTemplate) => void
}) {
  if (suggestions.length === 0) return null
  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles size={15} className="text-[#e84d85]" />
        <h3 className="font-display font-bold text-sm text-white">Coach Picks</h3>
      </div>
      <div className="grid sm:grid-cols-2 gap-2">
        {suggestions.slice(0, 4).map(suggestion => (
          <div key={suggestion.id} className="bg-[#151517] border border-[#1c1c1c] rounded-lg p-3">
            <div className="text-sm font-bold text-white mb-1">{suggestion.title}</div>
            <p className="text-xs text-[#6b7280] leading-relaxed mb-3">{suggestion.reason}</p>
            <button
              onClick={() => onUse(suggestion.template)}
              className="min-h-[36px] px-3 bg-[#202024] border border-[#303037] hover:border-[#e84d85] text-[#d1d5db] hover:text-white rounded-md text-xs font-bold transition-colors"
            >
              Use template
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

function BetEventFeed({ events }: { events: BetEvent[] }) {
  if (events.length === 0) return null
  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-3">
        <Clock size={15} className="text-[#e84d85]" />
        <h3 className="font-display font-bold text-sm text-white">Bet Feed</h3>
      </div>
      <div className="space-y-2">
        {events.slice(0, 8).map(event => (
          <div key={event.id} className="flex items-center gap-3 border-l-2 border-[#e84d85]/40 pl-3 py-1.5">
            {event.actor_name && <Avatar name={event.actor_name} pic={event.actor_profile} size={5} />}
            <div className="flex-1 min-w-0">
              <p className="text-xs text-[#d1d5db]">{eventCopy(event)}</p>
              <p className="text-[10px] font-mono text-[#4b5563]">{formatDistanceToNow(new Date(event.created_at), { addSuffix: true })}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function GroupBetsTab({ groupId, members, myRole }: Props) {
  const [bets, setBets] = useState<GroupBet[]>([])
  const [events, setEvents] = useState<BetEvent[]>([])
  const [scoreboard, setScoreboard] = useState<BetScoreboard | null>(null)
  const [suggestions, setSuggestions] = useState<BetSuggestion[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'active' | 'open' | 'resolved'>('active')
  const [showCreate, setShowCreate] = useState(false)
  const [createTemplate, setCreateTemplate] = useState<BetTemplate | null>(null)

  async function fetchBets() {
    try {
      const [betsRes, scoreboardRes, suggestionsRes] = await Promise.all([
        fetch(`/api/groups/${groupId}/bets`),
        fetch(`/api/groups/${groupId}/bets/scoreboard`),
        fetch(`/api/groups/${groupId}/bets/suggestions`),
      ])
      if (betsRes.ok) {
        const data = await betsRes.json()
        setBets(data.bets ?? [])
        setEvents(data.events ?? [])
      }
      if (scoreboardRes.ok) setScoreboard(await scoreboardRes.json())
      if (suggestionsRes.ok) {
        const data = await suggestionsRes.json()
        setSuggestions(data.suggestions ?? [])
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchBets()
  }, [groupId])

  const visible = bets.filter(bet => {
    if (filter === 'open') return bet.status === 'open'
    if (filter === 'resolved') return ['won', 'lost', 'void'].includes(bet.status)
    return ['open', 'locked'].includes(bet.status)
  })

  return (
    <div className="fade-up space-y-4">
      <ScoreboardPanel scoreboard={scoreboard} />
      <CoachPicks
        suggestions={suggestions}
        onUse={template => {
          setCreateTemplate(template)
          setShowCreate(true)
        }}
      />
      <BetEventFeed events={events} />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div className="flex gap-1.5">
          {([
            { key: 'active', label: 'Active' },
            { key: 'open', label: 'Open' },
            { key: 'resolved', label: 'Resolved' },
          ] as const).map(opt => (
            <button
              key={opt.key}
              onClick={() => setFilter(opt.key)}
              className={`min-h-[36px] px-3 rounded-full text-xs font-bold transition-colors ${filter === opt.key ? 'bg-[#e84d85] text-black' : 'bg-[#202024] text-[#6b7280] hover:text-white'}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => { setCreateTemplate(null); setShowCreate(true) }}
          className="min-h-[44px] flex items-center justify-center gap-1.5 px-3 py-2 bg-[#e84d85] hover:bg-[#c23b6b] text-black rounded-md text-xs font-bold transition-colors"
        >
          <Plus size={14} />
          New Bet
        </button>
      </div>

      {loading ? (
        <div className="card animate-pulse">
          <div className="h-5 bg-[#1c1c1c] rounded w-1/3 mb-4" />
          <div className="h-24 bg-[#1c1c1c] rounded" />
        </div>
      ) : visible.length === 0 ? (
        <div className="card text-center py-10">
          <Clock size={24} className="text-[#303037] mx-auto mb-2" />
          <p className="text-[#6b7280] text-sm">No bets in this lane.</p>
          <p className="text-[#4b5563] text-xs mt-1">Create one and make the weekly mileage suddenly very personal.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map(bet => (
            <BetCard key={bet.id} bet={bet} groupId={groupId} myRole={myRole} onChanged={fetchBets} />
          ))}
        </div>
      )}

      {showCreate && (
        <CreateBetModal
          groupId={groupId}
          members={members}
          initialTemplate={createTemplate}
          onClose={() => setShowCreate(false)}
          onCreated={fetchBets}
        />
      )}
    </div>
  )
}

export function GroupBetsDashboardCard({ groupId, members, myRole }: Props) {
  const [bets, setBets] = useState<GroupBet[]>([])
  const [scoreboard, setScoreboard] = useState<BetScoreboard | null>(null)
  const [loading, setLoading] = useState(true)

  async function fetchBets() {
    try {
      const [betsRes, boardRes] = await Promise.all([
        fetch(`/api/groups/${groupId}/bets`),
        fetch(`/api/groups/${groupId}/bets/scoreboard`),
      ])
      if (betsRes.ok) {
        const data = await betsRes.json()
        setBets(data.bets ?? [])
      }
      if (boardRes.ok) setScoreboard(await boardRes.json())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchBets()
  }, [groupId])

  const active = bets.filter(b => ['open', 'locked'].includes(b.status)).slice(0, 2)

  return (
    <div>
      <h2 className="mb-4 font-display text-[28px] font-bold uppercase leading-none text-[#F1EDE8]">Active Bets</h2>
      <div className="card pulse-bar acid" style={{ padding: '1.25rem' }}>
        <span className="pulse-idx">[02]</span>
        {loading ? (
          <div className="animate-pulse space-y-3">
            <div className="h-4 w-1/3 bg-[#1c1c1c]" />
            <div className="h-20 bg-[#1c1c1c]" />
          </div>
        ) : active.length === 0 ? (
          <div className="text-center py-6">
            <Banknote size={22} className="text-[#303037] mx-auto mb-2" />
            <p className="text-[#6b7280] text-sm">No active bets yet.</p>
            <p className="text-[#4b5563] text-xs mt-1">The group is behaving suspiciously responsibly.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {scoreboard?.bestPredictor && (
              <div className="flex items-center justify-between gap-3 border border-[#1c1c1c] bg-[#151517] p-2.5">
                <span className="text-[10px] font-mono uppercase text-[#6b7280]">Best predictor</span>
                <span className="text-xs font-bold text-white">
                  {scoreboard.bestPredictor.athlete_name.split(' ')[0]} · {scoreboard.bestPredictor.wins}W
                </span>
              </div>
            )}
            {active.map(bet => (
              <BetCard key={bet.id} bet={bet} groupId={groupId} myRole={myRole} onChanged={fetchBets} compact />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
