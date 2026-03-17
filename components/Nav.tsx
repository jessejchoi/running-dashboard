'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Activity, List, RefreshCw, BarChart2, Calendar, Users, Settings } from 'lucide-react'
import { useState, useTransition } from 'react'
import SettingsDrawer from './SettingsDrawer'

const navItems = [
  { href: '/',            label: 'Dashboard', icon: Activity },
  { href: '/runs',        label: 'Runs',      icon: List },
  { href: '/analysis', label: 'Analysis',  icon: BarChart2 },
  { href: '/plan',        label: 'Plan',      icon: Calendar },
  { href: '/groups',      label: 'Groups',    icon: Users },
]

export default function Nav() {
  const path = usePathname()
  const router = useRouter()
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [pendingHref, setPendingHref] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)

  function handleNavClick(href: string) {
    if (href === path) return
    setPendingHref(href)
    startTransition(() => {})
  }

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
      setTimeout(() => router.refresh(), 800)
    } catch {
      setSyncMsg('Error')
      setSyncing(false)
      setTimeout(() => setSyncMsg(null), 3000)
    }
  }

  return (
    <>
      {/* ── Desktop top nav ───────────────────────────────────── */}
      <nav className="fixed top-0 left-0 right-0 z-50 hidden sm:block" style={{ background: 'rgba(8,8,8,0.85)', backdropFilter: 'blur(16px) saturate(180%)', WebkitBackdropFilter: 'blur(16px) saturate(180%)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <div className="max-w-6xl mx-auto px-6 flex items-center justify-between h-14">
          <span className="font-display font-bold text-lg uppercase tracking-tight">
            <span style={{ color: 'var(--orange)' }}>RUN</span>
            <span className="text-white/50">DASH</span>
          </span>
          <div className="flex items-center gap-1">
            {navItems.map(({ href, label, icon: Icon }) => {
              const active = path === href || (href !== '/' && path.startsWith(href))
              const loading = pendingHref === href && isPending
              return (
                <Link
                  key={href}
                  href={href}
                  prefetch={true}
                  onClick={() => handleNavClick(href)}
                  className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all duration-150"
                  style={{
                    color: active || loading ? 'var(--orange)' : 'var(--text-muted)',
                    background: active || loading ? 'var(--accent-muted)' : 'transparent',
                    opacity: loading ? 0.75 : 1,
                    WebkitTapHighlightColor: 'transparent',
                    touchAction: 'manipulation',
                  }}
                >
                  <Icon size={14} />
                  {label}
                </Link>
              )
            })}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSync}
              disabled={syncing}
              className="flex items-center gap-2 px-3 py-2 text-xs rounded-md transition-all disabled:opacity-50"
              style={{ color: syncMsg && !syncing ? 'var(--success)' : 'var(--text-muted)', border: '1px solid var(--border)' }}
            >
              <RefreshCw size={12} className={syncing ? 'animate-spin' : ''} />
              {syncing ? 'Syncing…' : syncMsg ?? 'Sync Strava'}
            </button>
            <button
              onClick={() => setSettingsOpen(true)}
              className="p-2 rounded-md transition-all"
              style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}
              title="Settings"
            >
              <Settings size={14} />
            </button>
          </div>
        </div>
        {isPending && (
          <div className="absolute bottom-0 left-0 h-[2px] animate-pulse" style={{ width: '40%', background: 'var(--orange)' }} />
        )}
      </nav>

      {/* ── Mobile top bar: logo + sync only ─────────────────── */}
      <div className="mobile-top-bar sm:hidden fixed top-0 left-0 right-0 z-50 h-12 flex items-center justify-between px-4" style={{ background: 'rgba(8,8,8,0.9)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <span className="font-display font-bold text-lg uppercase tracking-tight">
          <span style={{ color: 'var(--orange)' }}>RUN</span>
          <span className="text-white/50">DASH</span>
        </span>
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md transition-all disabled:opacity-50"
            style={{ color: syncMsg && !syncing ? 'var(--success)' : 'var(--text-muted)', border: '1px solid var(--border)' }}
          >
            <RefreshCw size={11} className={syncing ? 'animate-spin' : ''} />
            {syncing ? 'Syncing…' : syncMsg ?? 'Sync'}
          </button>
          <button
            onClick={() => setSettingsOpen(true)}
            className="p-1.5 rounded-md transition-all"
            style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}
          >
            <Settings size={14} />
          </button>
        </div>
        {isPending && (
          <div className="absolute bottom-0 left-0 h-[2px] animate-pulse" style={{ width: '40%', background: 'var(--orange)' }} />
        )}
      </div>

      {/* ── Mobile bottom tab bar ─────────────────────────────── */}
      <div className="mobile-nav sm:hidden fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around px-1" style={{ background: 'rgba(8,8,8,0.9)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = path === href || (href !== '/' && path.startsWith(href))
          const loading = pendingHref === href && isPending
          return (
            <Link
              key={href}
              href={href}
              prefetch={true}
              onClick={() => handleNavClick(href)}
              className="flex flex-col items-center gap-0.5 flex-1 transition-opacity duration-75"
              style={{
                paddingTop: 6,
                paddingBottom: 2,
                color: active || loading ? 'var(--orange)' : 'var(--text-muted)',
                opacity: loading ? 0.7 : 1,
                WebkitTapHighlightColor: 'transparent',
                touchAction: 'manipulation',
              }}
            >
              <Icon size={19} />
              <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.03em' }}>{label}</span>
            </Link>
          )
        })}
      </div>

      {/* Mobile bottom spacer */}
      <div className="mobile-nav-spacer sm:hidden" />

      {/* Settings drawer */}
      <SettingsDrawer open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  )
}
