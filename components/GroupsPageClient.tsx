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
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative bg-[#111] border border-[#2a2a2a] rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md z-[9999] shadow-2xl"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#1c1c1c]">
          <h2 className="font-display font-bold text-lg">Create Group</h2>
          <button onClick={onClose} className="text-[#6b7280] hover:text-white"><X size={18} /></button>
        </div>
        <div className="px-5 py-5 space-y-4">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-[#6b7280] mb-1.5 block">Group Name</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
              placeholder="e.g. Saturday Crew"
              autoFocus
              className="w-full bg-[#0f0f0f] border border-[#2a2a2a] focus:border-[#ff1d6c] rounded-lg px-3 py-2.5 text-white text-sm outline-none transition-colors"
            />
          </div>
          {error && <p className="text-[#ff1d6c] text-xs">{error}</p>}
          <button
            onClick={handleCreate}
            disabled={saving}
            className="w-full bg-[#ff1d6c] hover:bg-[#d4185a] disabled:opacity-50 text-white font-bold py-3 rounded-xl transition-colors"
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
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative bg-[#111] border border-[#2a2a2a] rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm z-[9999] shadow-2xl"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#1c1c1c]">
          <h2 className="font-display font-bold text-lg">
            {type === 'leave' ? 'Leave group?' : 'Delete group?'}
          </h2>
          <button onClick={onCancel} className="text-[#6b7280] hover:text-white"><X size={18} /></button>
        </div>
        <div className="px-5 py-5 space-y-4">
          <p className="text-[#9ca3af] text-sm">
            {type === 'leave'
              ? <>Are you sure you want to leave <span className="text-white font-medium">{group.name}</span>?</>
              : <>This will permanently delete <span className="text-white font-medium">{group.name}</span> and remove all members.</>
            }
          </p>
          {error && <p className="text-[#ff1d6c] text-xs">{error}</p>}
          <div className="flex gap-3">
            <button
              onClick={onCancel}
              className="flex-1 bg-[#1a1a1a] hover:bg-[#222] text-white font-bold py-2.5 rounded-xl transition-colors text-sm"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              disabled={loading}
              className={`flex-1 disabled:opacity-50 text-white font-bold py-2.5 rounded-xl transition-colors text-sm ${type === 'delete' ? 'bg-[#ff1d6c] hover:bg-[#ff1d6c]' : 'bg-[#ff1d6c] hover:bg-[#d4185a]'}`}
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
    <main className="max-w-2xl mx-auto px-4 pt-8 sm:pt-20 pb-16">
      <div className="flex items-center justify-between mb-6 fade-up">
        <div>
          <h1 className="font-display font-extrabold text-4xl">Groups</h1>
          <p className="text-[#6b7280] text-sm mt-1">Train with friends and stay accountable.</p>
        </div>
        {!atLimit && (
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-1.5 bg-[#ff1d6c] hover:bg-[#d4185a] text-white font-bold text-sm px-4 py-2 rounded-xl transition-colors whitespace-nowrap"
          >
            <Plus size={14} /> New Group
          </button>
        )}
      </div>
      {atLimit && (
        <p className="text-[#6b7280] text-xs mb-4">You&apos;ve reached the 3-group limit. Leave a group to join or create a new one.</p>
      )}

      {groups.length === 0 ? (
        <div className="card border-dashed border-[#2a2a2a] flex flex-col items-center justify-center text-center gap-4 fade-up" style={{ paddingTop: 56, paddingBottom: 56 }}>
          <div className="w-14 h-14 rounded-full bg-[#ff1d6c]/10 flex items-center justify-center">
            <Users size={22} className="text-[#ff1d6c]" />
          </div>
          <div>
            <p className="font-bold text-white mb-1">No groups yet</p>
            <p className="text-[#6b7280] text-sm max-w-xs">
              Create a group and invite your training partners to run together.
            </p>
          </div>
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-2 bg-[#ff1d6c] hover:bg-[#d4185a] text-white font-bold px-5 py-2.5 rounded-xl transition-colors text-sm"
          >
            <Plus size={14} /> Create your first group
          </button>
        </div>
      ) : (
        <div className="space-y-3 fade-up">
          {groups.map((g, i) => (
            <div
              key={g.id}
              className="card flex items-center gap-3"
            >
              {/* Reorder arrows */}
              {groups.length > 1 && (
                <div className="flex flex-col gap-0.5 shrink-0">
                  <button
                    onClick={() => moveGroup(i, 'up')}
                    disabled={i === 0}
                    className="text-[#4b5563] hover:text-white disabled:opacity-20 disabled:cursor-not-allowed p-0.5 transition-colors"
                    title="Move up"
                  >
                    <ChevronUp size={14} />
                  </button>
                  <button
                    onClick={() => moveGroup(i, 'down')}
                    disabled={i === groups.length - 1}
                    className="text-[#4b5563] hover:text-white disabled:opacity-20 disabled:cursor-not-allowed p-0.5 transition-colors"
                    title="Move down"
                  >
                    <ChevronDown size={14} />
                  </button>
                </div>
              )}

              {/* Icon */}
              <div className="w-10 h-10 rounded-full bg-[#ff1d6c]/15 flex items-center justify-center shrink-0">
                <Users size={16} className="text-[#ff1d6c]" />
              </div>

              {/* Info — clicking navigates to group */}
              <a href={`/group/${g.id}`} className="flex-1 min-w-0 no-underline">
                <div className="flex items-center gap-2">
                  <span className="font-bold truncate">{g.name}</span>
                  {g.my_role === 'admin' && (
                    <span className="text-[10px] text-[#d9ff36] font-bold bg-[#d9ff36]/10 px-1.5 py-0.5 rounded shrink-0">Admin</span>
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
                    className="p-2 rounded-lg transition-colors text-[#4b5563] hover:text-[#6b7280] hover:bg-[#1a1a1a]"
                    title="Leave group"
                  >
                    <LogOut size={15} />
                  </button>
                  <button
                    onClick={() => { setActionError(''); setConfirm({ group: g, type: 'delete' }) }}
                    className="p-2 rounded-lg transition-colors text-[#ff1d6c]/60 hover:text-[#ff1d6c] hover:bg-[#ff1d6c]/10"
                    title="Delete group"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => { setActionError(''); setConfirm({ group: g, type: 'leave' }) }}
                  className="shrink-0 p-2 rounded-lg transition-colors text-[#4b5563] hover:text-[#6b7280] hover:bg-[#1a1a1a]"
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
