'use client'
import Link from 'next/link'
import { ChevronRight, Flame } from 'lucide-react'

interface Member {
  athlete_id: number
  name: string
  profile_pic: string | null
  weekKm: number
  streak: number
  lastRunDaysAgo: number | null
  is_me: boolean
}

interface Props {
  members: Member[]
  groupId: string
  groupName: string
}

function Avatar({ name, pic }: { name: string; pic: string | null }) {
  if (pic) return <img src={pic} alt={name} className="w-7 h-7 rounded-full object-cover shrink-0" />
  const initials = name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
  return (
    <div className="w-7 h-7 rounded-full bg-[#f97316]/20 flex items-center justify-center text-[#f97316] font-bold text-[10px] shrink-0">
      {initials}
    </div>
  )
}

export default function GroupLeaderboard({ members, groupId, groupName }: Props) {
  const maxKm = Math.max(...members.map(m => m.weekKm), 1)
  const sorted = [...members].sort((a, b) => b.weekKm - a.weekKm)

  return (
    <div className="card fade-up" style={{ display: 'flex', flexDirection: 'column', paddingBottom: '2rem' }}>
      <div className="flex items-center justify-between mb-4" style={{ flexShrink: 0 }}>
        <div>
          <h2 className="font-display font-bold text-sm text-[#6b7280] uppercase tracking-widest">
            Mileage Leaderboard
          </h2>
          <p className="text-[#4b5563] text-xs mt-0.5">{groupName} · this week</p>
        </div>
        <Link
          href={`/group/${groupId}`}
          className="flex items-center gap-1 text-xs text-[#f97316] hover:underline"
          prefetch
        >
          Group <ChevronRight size={12} />
        </Link>
      </div>

      <div className="space-y-3 overflow-y-auto" style={{ flex: 1, minHeight: 0 }}>
        {sorted.map((m, i) => (
          <div key={m.athlete_id} className="flex items-center gap-3">
            <span className="w-4 shrink-0 flex items-center justify-center">
              {i === 0 ? <span title="1st">🥇</span>
               : i === 1 ? <span title="2nd">🥈</span>
               : i === 2 ? <span title="3rd">🥉</span>
               : <span className="text-xs font-mono text-[#4b5563]">{i + 1}</span>}
            </span>
            <Avatar name={m.name} pic={m.profile_pic} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className={`text-xs font-bold truncate ${m.is_me ? 'text-white' : 'text-[#d1d5db]'}`}>
                    {m.is_me ? 'You' : m.name.split(' ')[0]}
                  </span>
                  {m.streak >= 3 && (
                    <span className="flex items-center gap-0.5 text-orange-400 text-[10px] font-bold shrink-0">
                      <Flame size={10} />{m.streak}
                    </span>
                  )}
                  {m.lastRunDaysAgo !== null && m.lastRunDaysAgo >= 3 && (
                    <span className="text-[#4b5563] text-[10px] shrink-0">
                      {m.lastRunDaysAgo}d ago
                    </span>
                  )}
                </div>
                <span className={`text-xs font-mono font-bold shrink-0 ml-2 ${m.is_me ? 'text-[#f97316]' : 'text-[#9ca3af]'}`}>
                  {m.weekKm.toFixed(1)} km
                </span>
              </div>
              <div className="h-1 bg-[#1c1c1c] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${(m.weekKm / maxKm) * 100}%`,
                    background: m.is_me ? '#f97316' : '#3a3a3a',
                  }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
