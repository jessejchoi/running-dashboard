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

  async function handleSync() {
    setSyncing(true)
    await fetch('/api/sync-all', { method: 'POST' })
    setSyncing(false)
    window.location.reload()
  }

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-[#2a2a2a] bg-[#0a0a0a]/90 backdrop-blur-sm">
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
          {syncing ? 'Syncing…' : 'Sync Strava'}
        </button>
      </div>
    </nav>
  )
}
