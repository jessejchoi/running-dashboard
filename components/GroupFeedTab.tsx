'use client'
import { useState, useRef, useEffect } from 'react'
import { format } from 'date-fns'
import { ChevronDown, Check } from 'lucide-react'
import { speedToPace, formatDuration, formatDistanceShort, paceUnitLabel } from '@/lib/utils'
import { runWallTime } from '@/lib/calendar'
import { useUnit } from '@/lib/unit-context'
import { Avatar, RunTypeDot, StatusTag, type Run, type Member } from '@/components/GroupShared'

interface Props {
  groupId: string
  recentRuns: Run[]
  members: Member[]
  myAthleteId: number
}

function FilterDropdown({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: { value: string | number; label: string }[]
  value: string | number
  onChange: (v: string | number) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const selected = options.find(o => o.value === value)

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#2a2a2a] bg-[#1c1c1c] text-xs font-medium text-[#9ca3af] hover:text-white hover:border-[#3a3a3a] transition-colors"
      >
        <span>{selected?.label ?? label}</span>
        <ChevronDown size={11} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1.5 z-50 bg-[#1c1c1c] border border-[#2a2a2a] rounded-xl shadow-2xl py-1 min-w-[140px]">
          {options.map(opt => (
            <button
              key={opt.value}
              onClick={() => { onChange(opt.value); setOpen(false) }}
              className="w-full text-left px-3 py-2 text-xs hover:bg-[#242424] flex items-center justify-between gap-3 transition-colors text-[#9ca3af] hover:text-white"
            >
              <span>{opt.label}</span>
              {value === opt.value && <Check size={10} className="text-[#f97316] shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function GroupFeedTab({ groupId, recentRuns, members, myAthleteId }: Props) {
  const { unit } = useUnit()
  const [allFeedRuns, setAllFeedRuns] = useState<Run[]>(recentRuns)
  const [hasMore, setHasMore] = useState(recentRuns.length === 100)
  const [loadingMore, setLoadingMore] = useState(false)
  const [feedMember, setFeedMember] = useState<number | 'all'>('all')
  const [feedType, setFeedType] = useState<string | 'all'>('all')

  const memberMap = Object.fromEntries(members.map(m => [m.athlete_id, m]))
  const presentTypes = Array.from(new Set(allFeedRuns.map(r => r.run_type ?? 'run'))).sort()
  const filteredFeed = allFeedRuns.filter(r => {
    if (feedMember !== 'all' && r.athlete_id !== feedMember) return false
    if (feedType !== 'all' && (r.run_type ?? 'run') !== feedType) return false
    return true
  })

  const memberOptions = [
    { value: 'all' as const, label: 'All members' },
    ...members.map(m => ({ value: m.athlete_id, label: m.is_me ? 'You' : m.name.split(' ')[0] })),
  ]
  const typeOptions = [
    { value: 'all' as const, label: 'All types' },
    ...presentTypes.map(t => ({ value: t, label: t.replace(/_/g, ' ') })),
  ]

  async function loadMoreRuns() {
    setLoadingMore(true)
    const oldest = allFeedRuns[allFeedRuns.length - 1]?.start_date
    const res = await fetch(`/api/groups/${groupId}/runs?before=${oldest}&limit=30`)
    const { runs } = await res.json()
    setAllFeedRuns(prev => [...prev, ...(runs ?? [])])
    setHasMore((runs ?? []).length === 30)
    setLoadingMore(false)
  }

  return (
    <div className="fade-up">
      {/* Filters */}
      {allFeedRuns.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          <FilterDropdown
            label="All members"
            options={memberOptions}
            value={feedMember}
            onChange={v => setFeedMember(v as number | 'all')}
          />
          {presentTypes.length > 1 && (
            <FilterDropdown
              label="All types"
              options={typeOptions}
              value={feedType}
              onChange={v => setFeedType(v as string)}
            />
          )}
        </div>
      )}

      <div className="space-y-3">
        {filteredFeed.length === 0 ? (
          <div className="card text-center py-10">
            <p className="text-[#6b7280] text-sm">No runs match these filters.</p>
          </div>
        ) : filteredFeed.map(run => {
          const member = memberMap[run.athlete_id]
          const isMe = run.athlete_id === myAthleteId
          return (
            <div key={run.id} className="card hover:border-[#2a2a2a] transition-colors">
              <div className="flex items-start gap-3">
                <Avatar name={member?.name ?? '?'} pic={member?.profile_pic ?? null} size={8} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-bold text-sm">{member?.name ?? `Athlete ${run.athlete_id}`}</span>
                    {isMe && <span className="text-[10px] text-[#f97316] font-bold bg-[#f97316]/10 px-1.5 py-0.5 rounded">You</span>}
                    {member?.status_tag && <StatusTag tag={member.status_tag} />}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-[#6b7280] mb-2">
                    <RunTypeDot type={run.run_type} />
                    <span>{run.run_type?.replace(/_/g, ' ') ?? 'run'}</span>
                    <span>·</span>
                    <span>{format(runWallTime(run), 'EEE MMM d, h:mm a')}</span>
                  </div>
                  <a href={`/runs/${run.id}?from=group/${groupId}`} className="font-medium text-sm text-white hover:text-[#f97316] transition-colors block truncate mb-2">
                    {run.name}
                  </a>
                  <div className="flex gap-4 text-xs font-mono">
                    <span className="text-[#f97316] font-bold">{formatDistanceShort(run.distance, unit)}</span>
                    <span className="text-white">{speedToPace(run.average_speed, unit)}{paceUnitLabel(unit)}</span>
                    <span className="text-[#6b7280]">{formatDuration(run.moving_time)}</span>
                    {run.average_heartrate && (
                      <span className="text-[#6b7280]">{Math.round(run.average_heartrate)} bpm</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {hasMore && (
        <div className="mt-4 text-center">
          <button
            onClick={loadMoreRuns}
            disabled={loadingMore}
            className="px-4 py-2 text-xs font-bold border border-[#2a2a2a] hover:border-[#f97316] text-[#6b7280] hover:text-[#f97316] rounded-lg transition-colors disabled:opacity-50"
          >
            {loadingMore ? 'Loading…' : 'Load older runs'}
          </button>
        </div>
      )}
    </div>
  )
}
