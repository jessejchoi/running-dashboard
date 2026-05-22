'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { RefreshCw, Settings } from 'lucide-react'
import { useState, useEffect } from 'react'
import SettingsDrawer from './SettingsDrawer'
import RunDashWordmark from './RunDashWordmark'

const navItems = [
  { href: '/',       label: 'Dashboard' },
  { href: '/runs',     label: 'Runs' },
  { href: '/analysis', label: 'Analysis' },
  { href: '/plan',     label: 'Plan' },
  { href: '/groups',   label: 'Group' },
]

const mobileNavItems = [
  navItems[0],
  navItems[4],
]

// ── PULSE nav ──────────────────────────────────────────────────────────
// Opaque ink-1, 2px bone bottom border, 3px magenta top stripe.
// Active items are solid magenta blocks with ink text — no fade, no glow.
// Bottom mobile pill is square (was rounded), magenta active state.

export default function Nav() {
  const path = usePathname()
  const router = useRouter()
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState<string | null>(null)
  const [pendingHref, setPendingHref] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)

  useEffect(() => { setPendingHref(null) }, [path])

  const isPending = pendingHref !== null && pendingHref !== path

  function handleNavClick(href: string) {
    if (href === path) return
    setPendingHref(href)
  }

  async function handleSync() {
    setSyncing(true); setSyncMsg(null)
    try {
      const res = await fetch('/api/sync-all', { method: 'POST' })
      const data = await res.json()
      const n = data.newRuns ?? 0
      setSyncMsg(n > 0 ? `${n} synced` : 'Up to date')
      setSyncing(false)
      setTimeout(() => router.refresh(), 800)
    } catch {
      setSyncMsg('Error'); setSyncing(false)
      setTimeout(() => setSyncMsg(null), 3000)
    }
  }

  const isActive = (href: string) =>
    path === href ||
    (href !== '/' && path.startsWith(href)) ||
    (href === '/groups' && path.startsWith('/group/'))

  return (
    <>
      {/* ── DESKTOP TOP BAR ─────────────────────────────────────────── */}
      <nav
        className="fixed top-0 left-0 right-0 z-50 hidden sm:block"
        style={{
          background: 'var(--ink-1)',
          borderBottom: '2px solid var(--fg-1)',
        }}
      >
        {/* 3px magenta stripe */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'var(--magenta)' }} />
        <div className="max-w-6xl mx-auto px-6 flex items-center justify-between h-14">
          <RunDashWordmark markClassName="h-6 w-auto" textClassName="text-lg" />
          <div className="flex items-center gap-1">
            {navItems.map(({ href, label }) => {
              const active = isActive(href)
              const loading = pendingHref === href && isPending
              return (
                <Link
                  key={href}
                  href={href}
                  prefetch={true}
                  onClick={() => handleNavClick(href)}
                  className="font-mono text-[10.5px] font-bold uppercase tracking-[0.18em] px-3.5 py-2 transition-colors"
                  style={{
                    color: active || loading ? 'var(--ink)' : 'var(--fg-3)',
                    background: active || loading ? 'var(--magenta)' : 'transparent',
                    opacity: loading ? 0.75 : 1,
                    WebkitTapHighlightColor: 'transparent',
                  }}
                >
                  {label}
                </Link>
              )
            })}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSync}
              disabled={syncing}
              className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] flex items-center gap-2 px-3 py-2 disabled:opacity-50 transition-colors"
              style={{
                color: syncMsg && !syncing ? 'var(--acid)' : 'var(--fg-2)',
                border: `1px solid ${syncMsg && !syncing ? 'var(--acid)' : 'var(--hair-2)'}`,
              }}
            >
              <RefreshCw size={11} className={syncing ? 'animate-spin' : ''} />
              {syncing ? 'Syncing' : syncMsg ?? 'Sync'}
            </button>
            <button
              onClick={() => setSettingsOpen(true)}
              className="p-2 flex items-center justify-center transition-colors"
              style={{ color: 'var(--fg-2)', border: '1px solid var(--hair-2)' }}
              title="Settings"
            >
              <Settings size={14} />
            </button>
          </div>
        </div>
        {isPending && (
          <div className="absolute bottom-0 left-0 h-[2px]" style={{ width: '40%', background: 'var(--magenta)' }} />
        )}
      </nav>

      {/* ── MOBILE TOP BAR ──────────────────────────────────────────── */}
      <div
        className="mobile-top-bar sm:hidden fixed top-0 left-0 right-0 z-50 h-12 flex items-center justify-between px-4"
        style={{ background: 'var(--ink-1)', borderBottom: '2px solid var(--fg-1)' }}
      >
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'var(--magenta)' }} />
        <RunDashWordmark markClassName="h-5 w-auto" textClassName="text-base" />
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleSync}
            disabled={syncing}
            className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] flex items-center gap-1.5 px-2.5 py-1.5 disabled:opacity-50"
            style={{
              color: syncMsg && !syncing ? 'var(--acid)' : 'var(--fg-2)',
              border: `1px solid ${syncMsg && !syncing ? 'var(--acid)' : 'var(--hair-2)'}`,
            }}
          >
            <RefreshCw size={10} className={syncing ? 'animate-spin' : ''} />
            {syncing ? '...' : syncMsg ?? 'Sync'}
          </button>
          <button
            onClick={() => setSettingsOpen(true)}
            className="p-1.5 flex items-center justify-center"
            style={{ color: 'var(--fg-2)', border: '1px solid var(--hair-2)' }}
          >
            <Settings size={13} />
          </button>
        </div>
        {isPending && (
          <div className="absolute bottom-0 left-0 h-[2px]" style={{ width: '40%', background: 'var(--magenta)' }} />
        )}
      </div>

      {/* ── MOBILE FLOATING NAV PILL ────────────────────────────────── */}
      <div
        className="nav-pill sm:hidden fixed left-1/2 z-50 flex items-center p-1"
        style={{
          transform: 'translateX(-50%)',
          background: 'var(--ink-1)',
          border: '1px solid var(--fg-1)',
          boxShadow: '0 4px 24px rgba(0,0,0,0.7)',
        }}
      >
        {mobileNavItems.map(({ href, label }) => {
          const active = isActive(href)
          const loading = pendingHref === href && isPending
          return (
            <Link
              key={href}
              href={href}
              prefetch={true}
              onClick={() => handleNavClick(href)}
              className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] px-3.5 py-2 transition-colors"
              style={{
                color: active || loading ? 'var(--ink)' : 'var(--fg-3)',
                background: active || loading ? 'var(--magenta)' : 'transparent',
                opacity: loading ? 0.7 : 1,
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              {label}
            </Link>
          )
        })}
      </div>

      <SettingsDrawer open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  )
}
