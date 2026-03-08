'use client'
import Nav from '@/components/Nav'
import PlanSessionModal from '@/components/PlanSessionModal'
import { useState } from 'react'
import { isoWeek } from '@/lib/utils'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

interface Session {
  label: string
  sub?: string
  highlight?: boolean
}

interface Week {
  week: number
  dates: string[]
  sessions: (Session | null)[]
  totalKm: number
}

const PLAN: Week[] = [
  {
    week: 4,
    dates: ['Mar 9', 'Mar 10', 'Mar 11', 'Mar 12', 'Mar 13', 'Mar 14', 'Mar 15'],
    sessions: [
      null,
      { label: '6×4min (90s jog)', sub: '5k pace' },
      { label: '40min easy' },
      { label: '25min threshold' },
      { label: '45min easy' },
      { label: '55min easy + strides' },
      { label: '85min long run' },
    ],
    totalKm: 50.0,
  },
  {
    week: 5,
    dates: ['Mar 16', 'Mar 17', 'Mar 18', 'Mar 19', 'Mar 20', 'Mar 21', 'Mar 22'],
    sessions: [
      null,
      { label: '5×1k (90s jog)', sub: '5k pace' },
      { label: '40min easy' },
      { label: '2×16min (180s jog)', sub: 'threshold' },
      { label: '45min easy' },
      { label: '55min easy + strides' },
      { label: '90min', sub: '65min easy + 25min steady' },
    ],
    totalKm: 52.7,
  },
  {
    week: 6,
    dates: ['Mar 23', 'Mar 24', 'Mar 25', 'Mar 26', 'Mar 27', 'Mar 28', 'Mar 29'],
    sessions: [
      null,
      { label: '5×1k (60s jog)', sub: '5k pace' },
      { label: '40min easy' },
      { label: '3×12min (150s jog)', sub: 'threshold' },
      { label: '45min easy' },
      { label: '55min easy + strides' },
      { label: '85min long run' },
    ],
    totalKm: 52.2,
  },
  {
    week: 7,
    dates: ['Mar 30', 'Mar 31', 'Apr 1', 'Apr 2', 'Apr 3', 'Apr 4', 'Apr 5'],
    sessions: [
      null,
      { label: '3×1.6k (90s jog)', sub: '5k pace' },
      { label: '30min easy' },
      { label: '20min threshold' },
      { label: '30min easy' },
      { label: '45min easy + strides' },
      { label: '80min long run' },
    ],
    totalKm: 42.5,
  },
  {
    week: 8,
    dates: ['Apr 6', 'Apr 7', 'Apr 8', 'Apr 9', 'Apr 10', 'Apr 11', 'Apr 12'],
    sessions: [
      null,
      { label: '4×1k (60s walk)', sub: '5k pace' },
      { label: '30min easy' },
      { label: '30min easy + strides' },
      null,
      { label: '5K TRIAL', highlight: true },
      { label: '40min very easy' },
    ],
    totalKm: 28.7,
  },
]

interface ModalTarget { session: Session; weekNum: number; dayIdx: number }

function sessionBg(s: Session | null) {
  if (!s) return ''
  if (s.highlight) return 'bg-pink-500 text-white font-bold'
  return 'bg-[#1a1a1a] text-white'
}

export default function PlanPage() {
  const [modal, setModal] = useState<ModalTarget | null>(null)

  return (
    <>
      <Nav />
      <main className="standalone-main max-w-6xl mx-auto px-4 pt-14 sm:pt-20 pb-16" style={{ paddingTop: "var(--main-pt)" }}>
        <div className="mb-8 fade-up">
          <h1 className="font-display font-extrabold text-3xl leading-normal pb-1 mb-1">Training Plan</h1>
          <p className="text-[#6b7280] text-sm">5K target — Apr 15, 2026</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-[#6b7280] text-xs uppercase tracking-wider">
                <th className="text-left py-3 px-3 w-16">Week</th>
                {DAYS.map(d => (
                  <th key={d} className="text-center py-3 px-2 font-medium">{d}</th>
                ))}
                <th className="text-right py-3 px-3 w-16">km</th>
              </tr>
            </thead>
            <tbody>
              {PLAN.map((week) => (
                <>
                  <tr key={`dates-${week.week}`} className="border-t border-[#1c1c1c]">
                    <td className="py-2 px-3">
                      <div className="bg-[#f97316] text-white text-xs font-bold text-center rounded px-2 py-1 w-12">
                        W{week.week}
                      </div>
                    </td>
                    {week.dates.map((d, i) => (
                      <td key={i} className="py-2 px-2 text-center text-[#6b7280] text-xs">{d}</td>
                    ))}
                    <td />
                  </tr>
                  <tr key={`sessions-${week.week}`}>
                    <td className="pb-4 px-3" />
                    {week.sessions.map((s, i) => (
                      <td key={i} className="pb-4 px-1 align-top">
                        {s ? (
                          <button
                            onClick={() => setModal({ session: s, weekNum: week.week, dayIdx: i })}
                            className={`w-full rounded-lg px-2 py-2 text-center text-xs leading-tight transition-all hover:ring-1 hover:ring-[#f97316]/50 hover:brightness-110 ${sessionBg(s)}`}
                          >
                            <div className="font-medium">{s.label}</div>
                            {s.sub && <div className="text-[#9ca3af] mt-0.5 text-[10px]">{s.sub}</div>}
                          </button>
                        ) : (
                          <div className="rounded-lg px-2 py-2 text-center text-xs text-[#4b5563]">Rest</div>
                        )}
                      </td>
                    ))}
                    <td className="pb-4 px-3 text-right font-mono font-bold text-[#f97316] text-sm align-middle">
                      {week.totalKm}
                    </td>
                  </tr>
                </>
              ))}
            </tbody>
          </table>
        </div>
      </main>

      {modal && (
        <PlanSessionModal
          session={modal.session}
          weekNum={modal.weekNum}
          dayIdx={modal.dayIdx}
          onClose={() => setModal(null)}
        />
      )}
    </>
  )
}
