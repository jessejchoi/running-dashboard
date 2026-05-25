'use client'
import { useState } from 'react'
import { Plus, Users, ChevronUp, ChevronDown, LogOut, Trash2, X } from 'lucide-react'
import { format } from 'date-fns'
import { useRouter } from 'next/navigation'

interface Group {
  id: string
  name: string
  invite_code: string
  created_at: string
  member_count: number
  my_role: string
}

function CreateGroupModal({ onClose, onCreate }: { onClose: () => void; onCreate: (g: Group) => void }) {
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleCreate() {
    if (!name.trim()) { setError('Enter a group name'); return }
    setSaving(true); setError('')
    try {
      const res = await fetch('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      })
      if (!res.ok) throw new Error(await res.text())
      const group = await res.json()
      onCreate(group)
    } catch (e: any) {
      setError(e.message)
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[9998] flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70" />
      <div className="relative z-[9999] w-full border bg-[#151517] shadow-2xl sm:max-w-md"
        style={{ borderColor: 'var(--hair-2)' }}
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: 'var(--hair-2)' }}>
          <h2 className="font-display text-[28px] font-bold uppercase leading-none">Create Group</h2>
          <button onClick={onClose} className="flex min-h-[44px] min-w-[44px] items-center justify-center border text-[#8B837C] transition-colors hover:text-white" style={{ borderColor: 'var(--hair-2)' }}><X size={18} /></button>
        </div>
        <div className="px-5 py-5 space-y-4">
          <div>
            <label className="mb-1.5 block font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#8B837C]">/ Group Name</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
              placeholder="e.g. Saturday Crew"
              autoFocus
              className="min-h-[44px] w-full border border-[#303037] bg-[#202024] px-3 py-2.5 text-sm text-white outline-none transition-colors focus:border-[#e84d85]"
            />
          </div>
          {error && <p className="text-[#e84d85] text-xs">{error}</p>}
          <button
            onClick={handleCreate}
            disabled={saving}
            className="min-h-[44px] w-full bg-[#e84d85] py-3 font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-black transition-colors hover:bg-[#c23b6b] disabled:opacity-50"
          >
            {saving ? 'Creating…' : 'Create Group'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ConfirmModal({
  group,
  type,
  onConfirm,
  onCancel,
  loading,
  error,
}: {
  group: Group
  type: 'leave' | 'delete'
  onConfirm: () => void
  onCancel: () => void
  loading: boolean
  error: string
}) {
  return (
    <div className="fixed inset-0 z-[9998] flex items-end sm:items-center justify-center" onClick={onCancel}>
      <div className="absolute inset-0 bg-black/70" />
      <div className="relative z-[9999] w-full border bg-[#151517] shadow-2xl sm:max-w-sm"
        style={{ borderColor: 'var(--hair-2)' }}
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: 'var(--hair-2)' }}>
          <h2 className="font-display text-[28px] font-bold uppercase leading-none">
            {type === 'leave' ? 'Leave group?' : 'Delete group?'}
          </h2>
          <button onClick={onCancel} className="flex min-h-[44px] min-w-[44px] items-center justify-center border text-[#8B837C] transition-colors hover:text-white" style={{ borderColor: 'var(--hair-2)' }}><X size={18} /></button>
        </div>
        <div className="px-5 py-5 space-y-4">
          <p className="text-[#9ca3af] text-sm">
            {type === 'leave'
              ? <>Are you sure you want to leave <span className="text-white font-medium">{group.name}</span>?</>
              : <>This will permanently delete <span className="text-white font-medium">{group.name}</span> and remove all members.</>
            }
          </p>
          {error && <p className="text-[#e84d85] text-xs">{error}</p>}
          <div className="flex gap-3">
            <button
              onClick={onCancel}
              className="min-h-[44px] flex-1 border border-[#303037] bg-[#202024] py-2.5 font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-white transition-colors hover:border-[#e84d85]"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              disabled={loading}
              className={`min-h-[44px] flex-1 py-2.5 font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-black transition-colors disabled:opacity-50 ${type === 'delete' ? 'bg-[#e84d85] hover:bg-[#e84d85]' : 'bg-[#e84d85] hover:bg-[#c23b6b]'}`}
            >
              {loading ? '…' : type === 'leave' ? 'Leave' : 'Delete'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function GroupsPageClient({ initialGroups }: { initialGroups: Group[] }) {
  const [groups, setGroups] = useState<Group[]>(initialGroups)
  const [creating, setCreating] = useState(false)
  const [confirm, setConfirm] = useState<{ group: Group; type: 'leave' | 'delete' } | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [actionError, setActionError] = useState('')
  const router = useRouter()

  const atLimit = groups.length >= 3

  function handleCreate(g: Group) {
    const newGroups = [...groups, g]
    setGroups(newGroups)
    setCreating(false)
    saveOrder(newGroups)
    router.push(`/group/${g.id}`)
  }

  async function saveOrder(ordered: Group[]) {
    const res = await fetch('/api/groups/reorder', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order: ordered.map(g => g.id) }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      console.error('Failed to save group order:', body.error ?? res.status)
    }
  }

  function moveGroup(index: number, direction: 'up' | 'down') {
    const swapWith = direction === 'up' ? index - 1 : index + 1
    const newGroups = [...groups]
    ;[newGroups[index], newGroups[swapWith]] = [newGroups[swapWith], newGroups[index]]
    setGroups(newGroups)
    saveOrder(newGroups)
  }

  async function handleConfirm() {
    if (!confirm) return
    setActionLoading(true)
    setActionError('')
    try {
      const { group, type } = confirm
      if (type === 'leave') {
        const res = await fetch(`/api/groups/${group.id}/leave`, { method: 'POST' })
        if (!res.ok) {
          const body = await res.json()
          throw new Error(body.error ?? 'Failed to leave group')
        }
      } else {
        const res = await fetch(`/api/groups/${group.id}`, { method: 'DELETE' })
        if (!res.ok) {
          const body = await res.json()
          throw new Error(body.error ?? 'Failed to delete group')
        }
      }
      const newGroups = groups.filter(g => g.id !== group.id)
      setGroups(newGroups)
      saveOrder(newGroups)
      setConfirm(null)
    } catch (e: any) {
      setActionError(e.message)
    } finally {
      setActionLoading(false)
    }
  }

  return (
    <main className="standalone-main mx-auto max-w-6xl px-3 pt-8 pb-24 sm:px-6 sm:pt-20 sm:pb-16">
      <div
        className="mb-6 grid gap-5 pb-6 fade-up sm:mb-8 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"
        style={{ borderBottom: '2px solid var(--fg-1)' }}
      >
        <div className="min-w-0">
          <h1
            className="font-display font-bold uppercase"
            style={{
              fontSize: 'clamp(56px, 8vw, 96px)',
              letterSpacing: '-0.04em',
              lineHeight: 0.88,
            }}
          >
            Groups<span style={{ color: 'var(--magenta)' }}>.</span>
          </h1>
          <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.18em] sm:text-xs" style={{ color: 'var(--fg-3)' }}>
            / Group system · {groups.length} active · 3 max
          </p>
        </div>
        {!atLimit && (
          <button
            onClick={() => setCreating(true)}
            className="flex min-h-[44px] items-center gap-2 border border-[#e84d85] bg-[#e84d85] px-4 py-2 font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-black transition-colors hover:bg-[#c23b6b] sm:justify-self-end"
          >
            <Plus size={14} /> New Group
          </button>
        )}
      </div>
      {atLimit && (
        <p className="mb-4 border border-[#303037] bg-[#151517] px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[#8B837C]">
          You&apos;ve reached the 3-group limit. Leave a group to join or create a new one.
        </p>
      )}

      {groups.length === 0 ? (
        <div className="card pulse-bar flex flex-col items-center justify-center gap-4 border-dashed text-center fade-up" style={{ paddingTop: 56, paddingBottom: 56 }}>
          <span className="pulse-idx">[01]</span>
          <div className="flex h-14 w-14 items-center justify-center border border-[#e84d85] bg-[#e84d85]/10">
            <Users size={22} className="text-[#e84d85]" />
          </div>
          <div>
            <p className="mb-1 font-display text-[28px] font-bold uppercase leading-none text-white">No Groups Yet</p>
            <p className="text-[#6b7280] text-sm max-w-xs">
              Create a group and invite your training partners to run together.
            </p>
          </div>
          <button
            onClick={() => setCreating(true)}
            className="flex min-h-[44px] items-center gap-2 border border-[#e84d85] bg-[#e84d85] px-5 py-2.5 font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-black transition-colors hover:bg-[#c23b6b]"
          >
            <Plus size={14} /> Create your first group
          </button>
        </div>
      ) : (
        <div className="grid gap-3 fade-up sm:grid-cols-2">
          {groups.map((g, i) => (
            <div
              key={g.id}
              className={`card pulse-bar flex items-center gap-3 ${i % 3 === 1 ? 'acid' : i % 3 === 2 ? 'ice' : ''}`}
            >
              <span className="pulse-idx">[{String(i + 1).padStart(2, '0')}]</span>
              {/* Reorder arrows */}
              {groups.length > 1 && (
                <div className="flex flex-col gap-0.5 shrink-0">
                  <button
                    onClick={() => moveGroup(i, 'up')}
                    disabled={i === 0}
                    className="flex min-h-[24px] min-w-[32px] items-center justify-center border border-[#303037] text-[#4b5563] transition-colors hover:text-white disabled:cursor-not-allowed disabled:opacity-20"
                    title="Move up"
                  >
                    <ChevronUp size={14} />
                  </button>
                  <button
                    onClick={() => moveGroup(i, 'down')}
                    disabled={i === groups.length - 1}
                    className="flex min-h-[24px] min-w-[32px] items-center justify-center border border-[#303037] text-[#4b5563] transition-colors hover:text-white disabled:cursor-not-allowed disabled:opacity-20"
                    title="Move down"
                  >
                    <ChevronDown size={14} />
                  </button>
                </div>
              )}

              {/* Icon */}
              <div className="flex h-10 w-10 shrink-0 items-center justify-center border border-[#e84d85] bg-[#e84d85]/15">
                <Users size={16} className="text-[#e84d85]" />
              </div>

              {/* Info — clicking navigates to group */}
              <a href={`/group/${g.id}`} className="flex-1 min-w-0 no-underline">
                <div className="flex items-center gap-2">
                  <span className="font-bold truncate">{g.name}</span>
                  {g.my_role === 'admin' && (
                    <span className="shrink-0 bg-[#b8d957]/10 px-1.5 py-0.5 text-[10px] font-bold text-[#b8d957]">Admin</span>
                  )}
                </div>
                <p className="text-[#6b7280] text-xs mt-0.5">
                  {g.member_count} member{g.member_count !== 1 ? 's' : ''} · Created {format(new Date(g.created_at), 'MMM d, yyyy')}
                </p>
              </a>

              {/* Leave / Delete */}
              {g.my_role === 'admin' ? (
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => { setActionError(''); setConfirm({ group: g, type: 'leave' }) }}
                    className="flex min-h-[44px] min-w-[44px] items-center justify-center border border-[#303037] text-[#4b5563] transition-colors hover:bg-[#202024] hover:text-[#6b7280]"
                    title="Leave group"
                  >
                    <LogOut size={15} />
                  </button>
                  <button
                    onClick={() => { setActionError(''); setConfirm({ group: g, type: 'delete' }) }}
                    className="flex min-h-[44px] min-w-[44px] items-center justify-center border border-[#303037] text-[#e84d85]/60 transition-colors hover:bg-[#e84d85]/10 hover:text-[#e84d85]"
                    title="Delete group"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => { setActionError(''); setConfirm({ group: g, type: 'leave' }) }}
                  className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center border border-[#303037] text-[#4b5563] transition-colors hover:bg-[#202024] hover:text-[#6b7280]"
                  title="Leave group"
                >
                  <LogOut size={15} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {creating && (
        <CreateGroupModal
          onClose={() => setCreating(false)}
          onCreate={handleCreate}
        />
      )}

      {confirm && (
        <ConfirmModal
          group={confirm.group}
          type={confirm.type}
          onConfirm={handleConfirm}
          onCancel={() => { setConfirm(null); setActionError('') }}
          loading={actionLoading}
          error={actionError}
        />
      )}
    </main>
  )
}
