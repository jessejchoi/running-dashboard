'use client'
import { useState } from 'react'
import { format } from 'date-fns'
import { toJakartaDate, speedToPace, formatDuration, formatDistanceShort, paceUnitLabel } from '@/lib/utils'
import { useUnit } from '@/lib/unit-context'
import { Avatar, RunTypeDot, StatusTag, type Run, type Member } from '@/components/GroupShared'

interface Props {
  groupId: string
  recentRuns: Run[]
  members: Member[]
  myAthleteId: number
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
          {/* Member filter */}
          <div className="flex flex-wrap gap-1">
            <button
              onClick={() => setFeedMember('all')}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                feedMember === 'all' ? 'bg-[#f97316] text-black' : 'bg-[#1c1c1c] text-[#6b7280] hover:text-white'
              }`}
            >
              All
            </button>
            {members.map(m => (
              <button
                key={m.athlete_id}
                onClick={() => setFeedMember(feedMember === m.athlete_id ? 'all' : m.athlete_id)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                  feedMember === m.athlete_id ? 'bg-[#f97316] text-black' : 'bg-[#1c1c1c] text-[#6b7280] hover:text-white'
                }`}
              >
                {m.is_me ? 'You' : m.name.split(' ')[0]}
              </button>
            ))}
          </div>
          {/* Run type filter */}
          {presentTypes.length > 1 && (
            <div className="flex flex-wrap gap-1">
              <button
                onClick={() => setFeedType('all')}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                  feedType === 'all' ? 'bg-[#2a2a2a] text-white' : 'bg-[#1a1a1a] text-[#6b7280] hover:text-white'
                }`}
              >
                All types
              </button>
              {presentTypes.map(t => (
                <button
                  key={t}
                  onClick={() => setFeedType(feedType === t ? 'all' : t)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                    feedType === t ? 'bg-[#2a2a2a] text-white' : 'bg-[#1a1a1a] text-[#6b7280] hover:text-white'
                  }`}
                >
                  {t.replace(/_/g, ' ')}
                </button>
              ))}
            </div>
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
                    {member?.gender && <span className="text-[10px] text-[#4b5563] font-mono">{member.gender === 'M' ? '♂' : '♀'}</span>}
                    {member?.status_tag && <StatusTag tag={member.status_tag} />}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-[#6b7280] mb-2">
                    <RunTypeDot type={run.run_type} />
                    <span>{run.run_type?.replace(/_/g, ' ') ?? 'run'}</span>
                    <span>·</span>
                    <span>{format(toJakartaDate(run.start_date), 'EEE MMM d, h:mm a')}</span>
                  </div>
                  <a href={`/runs/${run.id}`} className="font-medium text-sm text-white hover:text-[#f97316] transition-colors block truncate mb-2">
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
