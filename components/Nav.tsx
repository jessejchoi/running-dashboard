'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Activity, RefreshCw, Users, Settings } from 'lucide-react'
import { useState, useEffect } from 'react'
import SettingsDrawer from './SettingsDrawer'
import RunDashWordmark from './RunDashWordmark'

const navItems = [
  { href: '/',       label: 'Dashboard', icon: Activity },
  { href: '/groups', label: 'Group',     icon: Users },
]

export default function Nav() {
  const path = usePathname()
  const router = useRouter()
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState<string | null>(null)
  const [pendingHref, setPendingHref] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)

  // Clear pending state once navigation completes
  useEffect(() => { setPendingHref(null) }, [path])

  // isPending: clicked a nav item but haven't arrived yet
  const isPending = pendingHref !== null && pendingHref !== path

  function handleNavClick(href: string) {
    if (href === path) return
    setPendingHref(href)
    // No e.preventDefault() — let <Link> navigate natively so loading.tsx
    // shows immediately. startTransition suppresses loading skeletons.
  }

  async function handleSync() {
    setSyncing(true)
    setSyncMsg(null)
    try {
      const res = await fetch('/api/sync-all', { method: 'POST' })
      const data = await res.json()
      const n = data.newRuns ?? 0
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
          <RunDashWordmark markClassName="h-7 w-auto" textClassName="text-xl" />
          <div className="flex items-center gap-1">
            {navItems.map(({ href, label, icon: Icon }) => {
              const active = path === href || (href !== '/' && path.startsWith(href)) || (href === '/groups' && path.startsWith('/group/'))
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
              className="p-2 flex items-center justify-center rounded-md transition-all"
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

      {/* ── Mobile top bar: logo + actions ───────────────────── */}
      <div className="mobile-top-bar sm:hidden fixed top-0 left-0 right-0 z-50 h-12 flex items-center justify-between px-4" style={{ background: 'rgba(8,8,8,0.9)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <RunDashWordmark markClassName="h-7 w-auto" textClassName="text-xl" />
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
            className="p-1.5 flex items-center justify-center rounded-md transition-all"
            style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}
          >
            <Settings size={14} />
          </button>
        </div>
        {isPending && (
          <div className="absolute bottom-0 left-0 h-[2px] animate-pulse" style={{ width: '40%', background: 'var(--orange)' }} />
        )}
      </div>

      {/* ── Mobile floating nav pill ──────────────────────────── */}
      <div
        className="nav-pill sm:hidden fixed left-1/2 z-50 flex items-center rounded-full p-1"
        style={{
          transform: 'translateX(-50%)',
          background: 'rgba(0,0,0,0.10)',
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
          border: '1px solid rgba(255,255,255,0.18)',
          boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
        }}
      >
        {navItems.map(({ href, label }) => {
          const active = path === href || (href !== '/' && path.startsWith(href)) || (href === '/groups' && path.startsWith('/group/'))
          const loading = pendingHref === href && isPending
          return (
            <Link
              key={href}
              href={href}
              prefetch={true}
              onClick={() => handleNavClick(href)}
              className="px-6 py-2 rounded-full text-xs font-semibold tracking-wide transition-all duration-150"
              style={{
                color: active || loading ? 'var(--orange)' : 'var(--text-muted)',
                background: active || loading ? 'rgba(249,115,22,0.12)' : 'transparent',
                opacity: loading ? 0.7 : 1,
                WebkitTapHighlightColor: 'transparent',
                touchAction: 'manipulation',
              }}
            >
              {label}
            </Link>
          )
        })}
      </div>

      {/* Settings drawer */}
      <SettingsDrawer open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  )
}
