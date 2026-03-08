'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Activity, List, RefreshCw, BarChart2, Calendar, Users } from 'lucide-react'
import { useState } from 'react'

const navItems = [
  { href: '/',            label: 'Dashboard', icon: Activity },
  { href: '/runs',        label: 'Runs',      icon: List },
  { href: '/analysis/5k', label: 'Analysis',  icon: BarChart2 },
  { href: '/plan',        label: 'Plan',      icon: Calendar },
  { href: '/groups',      label: 'Groups',    icon: Users },
]

export default function Nav() {
  const path = usePathname()
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState<string | null>(null)

  async function handleSync() {
    setSyncing(true)
    setSyncMsg(null)
    try {
      const res = await fetch('/api/sync-all', { method: 'POST' })
      const data = await res.json()
      const n = (data.newRuns ?? 0) + (data.detailsSynced ?? 0)
      const msg = n > 0 ? `${n} synced` : 'Up to date'
      setSyncMsg(msg)
      setSyncing(false)
      setTimeout(() => { window.location.reload() }, 1800)
    } catch {
      setSyncMsg('Error')
      setSyncing(false)
      setTimeout(() => setSyncMsg(null), 3000)
    }
  }

  return (
    <>
      {/* ── Desktop top nav ───────────────────────────────────── */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-[#2a2a2a] bg-[#0a0a0a]/90 backdrop-blur-sm hidden sm:block">
        <div className="max-w-6xl mx-auto px-6 flex items-center justify-between h-14">
          <span className="font-display font-bold text-lg tracking-tight">
            <span className="text-[#f97316]">RUN</span>
            <span className="text-white/60">DASH</span>
          </span>
          <div className="flex items-center gap-1">
            {navItems.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  path === href || (href !== '/' && path.startsWith(href))
                    ? 'bg-[#1c1c1c] text-white'
                    : 'text-[#6b7280] hover:text-white hover:bg-[#1a1a1a]'
                }`}
              >
                <Icon size={14} />
                {label}
              </Link>
            ))}
          </div>
          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-2 px-3 py-2 text-xs text-[#6b7280] hover:text-white border border-[#2a2a2a] hover:border-[#3a3a3a] rounded-lg transition-all disabled:opacity-50"
          >
            <RefreshCw size={12} className={syncing ? 'animate-spin' : ''} />
            {syncing ? 'Syncing…' : syncMsg ? (
              <span className={syncMsg === 'Up to date' || syncMsg.includes('synced') ? 'text-emerald-400' : 'text-red-400'}>
                {syncMsg}
              </span>
            ) : 'Sync Strava'}
          </button>
        </div>
      </nav>

      {/* ── Mobile top bar: logo + sync only ─────────────────── */}
      <div className="sm:hidden fixed top-0 left-0 right-0 z-50 h-12 border-b border-[#2a2a2a] bg-[#0a0a0a]/90 backdrop-blur-sm flex items-center justify-between px-4">
        <span className="font-display font-bold text-base tracking-tight">
          <span className="text-[#f97316]">RUN</span>
          <span className="text-white/60">DASH</span>
        </span>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-[#2a2a2a] rounded-lg transition-all disabled:opacity-50"
          style={{ color: syncMsg && !syncing ? '#34d399' : '#6b7280' }}
        >
          <RefreshCw size={11} className={syncing ? 'animate-spin' : ''} />
          {syncing ? 'Syncing…' : syncMsg ?? 'Sync'}
        </button>
      </div>

      {/* ── Mobile bottom tab bar ─────────────────────────────── */}
      <div className="sm:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-[#2a2a2a] bg-[#0a0a0a]/95 backdrop-blur-sm flex items-center justify-around h-16 px-2 pb-safe">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = path === href || (href !== '/' && path.startsWith(href))
          return (
            <Link
              key={href}
              href={href}
              className="flex flex-col items-center gap-1 flex-1 py-2"
              style={{ color: active ? '#f97316' : '#6b7280' }}
            >
              <Icon size={20} />
              <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.03em' }}>{label}</span>
            </Link>
          )
        })}
      </div>

      {/* Mobile bottom spacer so content isn't hidden behind tab bar */}
      <div className="sm:hidden h-16" />
    </>
  )
}
