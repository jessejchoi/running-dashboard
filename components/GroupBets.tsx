'use client'

import { useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { Banknote, Check, Clock, Plus, Trash2, X } from 'lucide-react'
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
  is_creator: boolean
  is_target: boolean
  my_position: BetPosition | null
  positions: BetPosition[]
  live_result: {
    achieved: boolean
    currentValue: number
    evidenceLabel: string
    winningSide: BetSide
  }
}

interface Props {
  groupId: string
  members: Member[]
  myRole: string
  compact?: boolean
}

const STATUS_STYLE: Record<GroupBet['status'], string> = {
  open: 'text-[#f97316] bg-[#f97316]/10 border-[#f97316]/20',
  locked: 'text-blue-400 bg-blue-400/10 border-blue-400/20',
  won: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
  lost: 'text-red-400 bg-red-400/10 border-red-400/20',
  void: 'text-[#9ca3af] bg-[#1a1a1a] border-[#2a2a2a]',
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

function BetStatusChip({ status }: { status: GroupBet['status'] }) {
  return (
    <span className={`inline-flex items-center border px-1.5 py-0.5 rounded text-[10px] font-mono uppercase ${STATUS_STYLE[status]}`}>
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

  return (
    <div className="bg-[#111111] border border-[#2a2a2a] rounded-xl p-4 transition-colors hover:border-[#383838]">
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
              <span className="text-[#f97316]">{bet.target_name.split(' ')[0]}</span> to hit {targetLabel}
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
          <span className="text-xs font-mono text-[#f97316]">{Math.round(progress)}%</span>
        </div>
        <div className="h-2 bg-[#1c1c1c] rounded-full overflow-hidden">
          <div className="h-full bg-[#f97316] rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {!compact && (
        <div className="grid grid-cols-2 gap-2 mb-3">
          <div className="bg-[#0f0f0f] border border-[#1c1c1c] rounded-lg p-2">
            <div className="text-[10px] text-[#6b7280] uppercase font-mono mb-1">They will</div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-sm font-mono font-bold text-white">{forCount}</span>
              {bet.positions.filter(p => p.side === 'for').slice(0, 4).map(p => (
                <Avatar key={p.id} name={p.athlete_name} pic={p.athlete_profile} size={4} />
              ))}
            </div>
          </div>
          <div className="bg-[#0f0f0f] border border-[#1c1c1c] rounded-lg p-2">
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
        <div className="flex items-center gap-2 text-xs text-[#a1a1aa]">
          <Check size={13} className={bet.winning_side === 'for' ? 'text-emerald-400' : 'text-red-400'} />
          Winning side: {sideCopy(bet.winning_side ?? bet.live_result.winningSide)}
        </div>
      ) : bet.status === 'void' ? (
        <div className="flex items-center gap-2 text-xs text-[#6b7280]">
          <X size={13} />
          Voided
        </div>
      ) : bet.my_position ? (
        <div className="flex items-center gap-2 text-xs text-[#a1a1aa]">
          <Check size={13} className="text-[#f97316]" />
          You are on: <span className="text-white">{sideCopy(bet.my_position.side)}</span>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {canJoinPool && (
            <>
              <button
                onClick={() => mutate('join', { side: 'for' })}
                disabled={busy !== null}
                className="min-h-[36px] px-3 py-2 bg-[#f97316] hover:bg-[#ea580c] text-black rounded-md text-xs font-bold transition-colors disabled:opacity-50"
              >
                Join: will
              </button>
              <button
                onClick={() => mutate('join', { side: 'against' })}
                disabled={busy !== null}
                className="min-h-[36px] px-3 py-2 bg-[#1a1a1a] border border-[#2a2a2a] hover:border-[#f97316] text-[#d1d5db] hover:text-white rounded-md text-xs font-bold transition-colors disabled:opacity-50"
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
                className="min-h-[36px] px-3 py-2 bg-[#f97316] hover:bg-[#ea580c] text-black rounded-md text-xs font-bold transition-colors disabled:opacity-50"
              >
                Accept
              </button>
              <button
                onClick={() => mutate('decline')}
                disabled={busy !== null}
                className="min-h-[36px] px-3 py-2 bg-[#1a1a1a] border border-[#2a2a2a] hover:border-red-400 text-[#d1d5db] hover:text-red-400 rounded-md text-xs font-bold transition-colors disabled:opacity-50"
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
            className="min-h-[32px] px-2 text-[#4b5563] hover:text-red-400 transition-colors disabled:opacity-50"
            title="Delete bet"
          >
            <Trash2 size={14} />
          </button>
        </div>
      )}
    </div>
  )
}

function CreateBetModal({
  groupId,
  members,
  onClose,
  onCreated,
}: {
  groupId: string
  members: Member[]
  onClose: () => void
  onCreated: () => void
}) {
  const { unit } = useUnit()
  const week = useMemo(() => defaultWeekWindow(), [])
  const otherMembers = members.filter(m => !m.is_me)
  const fallbackTarget = otherMembers[0]?.athlete_id ?? members[0]?.athlete_id ?? 0
  const [mode, setMode] = useState<'pool' | 'direct'>('pool')
  const [targetAthleteId, setTargetAthleteId] = useState(fallbackTarget)
  const [metricType, setMetricType] = useState<BetMetricType>('weekly_distance')
  const [creatorSide, setCreatorSide] = useState<BetSide>('against')
  const [targetValue, setTargetValue] = useState('100')
  const [distanceKey, setDistanceKey] = useState<'5k' | '10k' | 'hm' | 'fm'>('10k')
  const [targetTime, setTargetTime] = useState('45:00')
  const [windowStart, setWindowStart] = useState(week.start)
  const [windowEnd, setWindowEnd] = useState(week.end)
  const [pledgeAmount, setPledgeAmount] = useState('20')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (mode === 'direct' && members.find(m => m.athlete_id === targetAthleteId)?.is_me) {
      setTargetAthleteId(otherMembers[0]?.athlete_id ?? 0)
    }
  }, [mode, targetAthleteId, members, otherMembers])

  useEffect(() => {
    if (metricType === 'weekly_distance') {
      setWindowStart(week.start)
      setWindowEnd(week.end)
    }
    if (metricType === 'run_count') setTargetValue('4')
    if (metricType === 'longest_run') setTargetValue(unit === 'miles' ? '12' : '20')
    if (metricType === 'distance' || metricType === 'weekly_distance') setTargetValue(unit === 'miles' ? '62' : '100')
  }, [metricType, unit, week.end, week.start])

  async function createBet() {
    setError('')
    const numericTarget = Number(targetValue)
    const pledge = Number(pledgeAmount)
    const targetSecs = parseTime(targetTime)
    if (!targetAthleteId) { setError('Choose a target member.'); return }
    if (!pledge || pledge <= 0) { setError('Enter a pledge amount.'); return }
    if (metricType === 'race_time' && targetSecs <= 0) { setError('Enter a valid target time.'); return }
    if (metricType !== 'race_time' && (!numericTarget || numericTarget <= 0)) { setError('Enter a valid target.'); return }

    const isDistanceMetric = metricType === 'weekly_distance' || metricType === 'distance' || metricType === 'longest_run'
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
                  className={`min-h-[44px] rounded-md text-xs font-bold border transition-colors ${mode === opt.key ? 'bg-[#f97316] border-[#f97316] text-black' : 'bg-[#0f0f0f] border-[#2a2a2a] text-[#a1a1aa] hover:text-white'}`}
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
              className="w-full bg-[#0f0f0f] border border-[#2a2a2a] focus:border-[#f97316] rounded-lg px-3 py-2 text-sm outline-none min-h-[44px]"
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
              ] as const).map(opt => (
                <button
                  key={opt.key}
                  onClick={() => setMetricType(opt.key)}
                  className={`min-h-[44px] rounded-md px-2 text-xs font-bold border transition-colors ${metricType === opt.key ? 'bg-[#f97316] border-[#f97316] text-black' : 'bg-[#0f0f0f] border-[#2a2a2a] text-[#a1a1aa] hover:text-white'}`}
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
                  className="w-full bg-[#0f0f0f] border border-[#2a2a2a] focus:border-[#f97316] rounded-lg px-3 py-2 text-sm outline-none min-h-[44px]"
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
                  className="w-full bg-[#0f0f0f] border border-[#2a2a2a] focus:border-[#f97316] rounded-lg px-3 py-2 text-sm outline-none min-h-[44px]"
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
                className="w-full bg-[#0f0f0f] border border-[#2a2a2a] focus:border-[#f97316] rounded-lg px-3 py-2 text-sm outline-none min-h-[44px]"
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
                className="w-full bg-[#0f0f0f] border border-[#2a2a2a] focus:border-[#f97316] rounded-lg px-3 py-2 text-sm outline-none min-h-[44px] disabled:opacity-60"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#6b7280] mb-1.5">Window end</label>
              <input
                type="date"
                value={windowEnd}
                onChange={e => setWindowEnd(e.target.value)}
                disabled={metricType === 'weekly_distance'}
                className="w-full bg-[#0f0f0f] border border-[#2a2a2a] focus:border-[#f97316] rounded-lg px-3 py-2 text-sm outline-none min-h-[44px] disabled:opacity-60"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-[#6b7280] mb-1.5">Your side</label>
              <select
                value={creatorSide}
                onChange={e => setCreatorSide(e.target.value as BetSide)}
                className="w-full bg-[#0f0f0f] border border-[#2a2a2a] focus:border-[#f97316] rounded-lg px-3 py-2 text-sm outline-none min-h-[44px]"
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
                className="w-full bg-[#0f0f0f] border border-[#2a2a2a] focus:border-[#f97316] rounded-lg px-3 py-2 text-sm outline-none min-h-[44px]"
              />
            </div>
          </div>

          <div className="bg-[#0f0f0f] border border-[#1c1c1c] rounded-lg p-3 flex items-start gap-2">
            <Banknote size={15} className="text-[#f97316] mt-0.5 shrink-0" />
            <p className="text-xs text-[#6b7280] leading-relaxed">
              Pledge only. RunDash tracks the bet, but any money is settled outside the app.
            </p>
          </div>

          {error && <p className="text-red-400 text-xs">{error}</p>}

          <button
            onClick={createBet}
            disabled={saving}
            className="w-full min-h-[44px] py-2.5 bg-[#f97316] hover:bg-[#ea580c] disabled:opacity-50 text-black font-bold text-sm rounded-md transition-colors"
          >
            {saving ? 'Creating...' : 'Create Bet'}
          </button>
        </div>
      </div>
    </div>
  )
}

export function GroupBetsTab({ groupId, members, myRole }: Props) {
  const [bets, setBets] = useState<GroupBet[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'active' | 'open' | 'resolved'>('active')
  const [showCreate, setShowCreate] = useState(false)

  async function fetchBets() {
    try {
      const res = await fetch(`/api/groups/${groupId}/bets`)
      if (!res.ok) return
      const data = await res.json()
      setBets(data.bets ?? [])
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
    <div className="fade-up">
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
              className={`min-h-[36px] px-3 rounded-full text-xs font-bold transition-colors ${filter === opt.key ? 'bg-[#f97316] text-black' : 'bg-[#1a1a1a] text-[#6b7280] hover:text-white'}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="min-h-[44px] flex items-center justify-center gap-1.5 px-3 py-2 bg-[#f97316] hover:bg-[#ea580c] text-black rounded-md text-xs font-bold transition-colors"
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
          <Clock size={24} className="text-[#2a2a2a] mx-auto mb-2" />
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
          onClose={() => setShowCreate(false)}
          onCreated={fetchBets}
        />
      )}
    </div>
  )
}

export function GroupBetsDashboardCard({ groupId, members, myRole }: Props) {
  const [bets, setBets] = useState<GroupBet[]>([])
  const [loading, setLoading] = useState(true)

  async function fetchBets() {
    try {
      const res = await fetch(`/api/groups/${groupId}/bets`)
      if (!res.ok) return
      const data = await res.json()
      setBets(data.bets ?? [])
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
      <h2 className="font-display font-bold text-base text-[#6b7280] uppercase tracking-widest mb-4">Active Bets</h2>
      <div className="card" style={{ padding: '1.25rem' }}>
        {loading ? (
          <div className="animate-pulse space-y-3">
            <div className="h-4 bg-[#1c1c1c] rounded w-1/3" />
            <div className="h-20 bg-[#1c1c1c] rounded" />
          </div>
        ) : active.length === 0 ? (
          <div className="text-center py-6">
            <Banknote size={22} className="text-[#2a2a2a] mx-auto mb-2" />
            <p className="text-[#6b7280] text-sm">No active bets yet.</p>
            <p className="text-[#4b5563] text-xs mt-1">The group is behaving suspiciously responsibly.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {active.map(bet => (
              <BetCard key={bet.id} bet={bet} groupId={groupId} myRole={myRole} onChanged={fetchBets} compact />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
