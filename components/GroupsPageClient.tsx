'use client'
import { useState } from 'react'
import { Plus, Users, ChevronRight, X } from 'lucide-react'
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
              className="w-full bg-[#0f0f0f] border border-[#2a2a2a] focus:border-[#f97316] rounded-lg px-3 py-2.5 text-white text-sm outline-none transition-colors"
            />
          </div>
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <button
            onClick={handleCreate}
            disabled={saving}
            className="w-full bg-[#f97316] hover:bg-[#ea580c] disabled:opacity-50 text-white font-bold py-3 rounded-xl transition-colors"
          >
            {saving ? 'Creating…' : 'Create Group'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function GroupsPageClient({ initialGroups }: { initialGroups: Group[] }) {
  const [groups, setGroups] = useState<Group[]>(initialGroups)
  const [creating, setCreating] = useState(false)
  const router = useRouter()

  function handleCreate(g: Group) {
    setGroups(gs => [...gs, g])
    setCreating(false)
    // Navigate to the new group
    router.push(`/group/${g.id}`)
  }

  return (
    <main className="max-w-2xl mx-auto px-4 pt-14 sm:pt-20 pb-16">
      <div className="flex items-center justify-between mb-6 fade-up">
        <div>
          <h1 className="font-display font-extrabold text-3xl">Groups</h1>
          <p className="text-[#6b7280] text-sm mt-1">Train with friends and stay accountable.</p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-1.5 bg-[#f97316] hover:bg-[#ea580c] text-white font-bold text-sm px-4 py-2 rounded-xl transition-colors"
        >
          <Plus size={14} /> New Group
        </button>
      </div>

      {groups.length === 0 ? (
        <div className="card border-dashed border-[#2a2a2a] flex flex-col items-center justify-center pt-14 pb-28 text-center gap-4 fade-up">
          <div className="w-14 h-14 rounded-full bg-[#f97316]/10 flex items-center justify-center">
            <Users size={22} className="text-[#f97316]" />
          </div>
          <div>
            <p className="font-bold text-white mb-1">No groups yet</p>
            <p className="text-[#6b7280] text-sm max-w-xs">
              Create a group and invite your training partners to run together.
            </p>
          </div>
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-2 bg-[#f97316] hover:bg-[#ea580c] text-white font-bold px-5 py-2.5 rounded-xl transition-colors text-sm"
          >
            <Plus size={14} /> Create your first group
          </button>
        </div>
      ) : (
        <div className="space-y-3 fade-up">
          {groups.map(g => (
            <a
              key={g.id}
              href={`/group/${g.id}`}
              className="card flex items-center gap-4 hover:border-[#f97316]/30 transition-colors cursor-pointer no-underline"
            >
              <div className="w-10 h-10 rounded-full bg-[#f97316]/15 flex items-center justify-center shrink-0">
                <Users size={16} className="text-[#f97316]" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-bold truncate">{g.name}</span>
                  {g.my_role === 'admin' && (
                    <span className="text-[10px] text-yellow-400 font-bold bg-yellow-400/10 px-1.5 py-0.5 rounded shrink-0">Admin</span>
                  )}
                </div>
                <p className="text-[#6b7280] text-xs mt-0.5">
                  {g.member_count} member{g.member_count !== 1 ? 's' : ''} · Created {format(new Date(g.created_at), 'MMM d, yyyy')}
                </p>
              </div>
              <ChevronRight size={16} className="text-[#4b5563] shrink-0" />
            </a>
          ))}
        </div>
      )}

      {creating && (
        <CreateGroupModal
          onClose={() => setCreating(false)}
          onCreate={handleCreate}
        />
      )}
    </main>
  )
}
