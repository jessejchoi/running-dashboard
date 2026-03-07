'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Activity, List, RefreshCw, BarChart2, Calendar } from 'lucide-react'
import { useState } from 'react'

const navItems = [
  { href: '/',              label: 'Dashboard', icon: Activity },
  { href: '/runs',          label: 'Runs',      icon: List },
  { href: '/analysis/5k',   label: 'Analysis',  icon: BarChart2 },
  { href: '/plan',          label: 'Plan',      icon: Calendar },
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
      // Reload after a beat so the message is visible
      setTimeout(() => { window.location.reload() }, 1800)
    } catch {
      setSyncMsg('Error')
      setSyncing(false)
      setTimeout(() => setSyncMsg(null), 3000)
    }
  }

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-[#2a2a2a] bg-[#0a0a0a]/90 backdrop-blur-sm">
      {/* Desktop */}
      <div className="hidden sm:flex max-w-6xl mx-auto px-6 items-center justify-between h-14">
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

      {/* Mobile */}
      <div className="sm:hidden flex items-center justify-between px-2 h-14">
        <span className="font-display font-bold text-base tracking-tight">
          <span className="text-[#f97316]">RUN</span>
          <span className="text-white/60">DASH</span>
        </span>
        <div className="flex items-center gap-1">
          {navItems.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg transition-all ${
                path === href || (href !== '/' && path.startsWith(href))
                  ? 'text-white'
                  : 'text-[#6b7280]'
              }`}
            >
              <Icon size={18} />
              <span className="text-[9px] font-medium">{label}</span>
            </Link>
          ))}
          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg text-[#6b7280] disabled:opacity-50"
          >
            <RefreshCw size={18} className={syncing ? 'animate-spin' : ''} />
            <span className={`text-[9px] font-medium ${syncMsg && !syncing ? 'text-emerald-400' : ''}`}>
              {syncing ? '…' : syncMsg ?? 'Sync'}
            </span>
          </button>
        </div>
      </div>
    </nav>
  )
}
