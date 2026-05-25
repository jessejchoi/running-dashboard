'use client'

import { Check, Copy, Pencil, Users, X } from 'lucide-react'
import { format } from 'date-fns'
import type { RefObject } from 'react'

interface GroupOption {
  id: string
  name: string
}

interface Props {
  allGroups: GroupOption[]
  copied: boolean
  copyInvite: () => void
  groupCreatedAt: string
  groupId: string
  groupName: string
  inviteUrl: string
  localMemberCount: number
  myRole: string
  onRenameChange: (value: string) => void
  onSaveGroupName: () => void
  renameLoading: boolean
  renameValue: string
  renamingGroup: boolean
  setRenamingGroup: (value: boolean) => void
  setRenameValue: (value: string) => void
  setSwitcherOpen: (value: boolean | ((prev: boolean) => boolean)) => void
  switcherOpen: boolean
  switcherRef: RefObject<HTMLDivElement>
}

export default function GroupPageHeader({
  allGroups,
  copied,
  copyInvite,
  groupCreatedAt,
  groupId,
  groupName,
  inviteUrl,
  localMemberCount,
  myRole,
  onRenameChange,
  onSaveGroupName,
  renameLoading,
  renameValue,
  renamingGroup,
  setRenamingGroup,
  setRenameValue,
  setSwitcherOpen,
  switcherOpen,
  switcherRef,
}: Props) {
  return (
    <>
      <div
        className="mb-6 grid gap-5 pb-6 fade-up sm:mb-8 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"
        style={{ borderBottom: '2px solid var(--fg-1)' }}
      >
        <div className="min-w-0">
          {renamingGroup ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <input
                value={renameValue}
                onChange={e => onRenameChange(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') onSaveGroupName()
                  if (e.key === 'Escape') setRenamingGroup(false)
                }}
                autoFocus
                className="w-full bg-transparent font-display font-bold uppercase outline-none"
                style={{
                  borderBottom: '2px solid var(--magenta)',
                  color: 'var(--fg-1)',
                  fontSize: 'clamp(48px, 8vw, 96px)',
                  letterSpacing: '-0.04em',
                  lineHeight: 0.88,
                }}
              />
              <div className="flex gap-2">
                <button
                  onClick={onSaveGroupName}
                  disabled={renameLoading}
                  className="min-h-[44px] border px-4 font-mono text-[11px] font-bold uppercase tracking-[0.18em] disabled:opacity-50"
                  style={{ borderColor: 'var(--magenta)', color: 'var(--magenta)' }}
                >
                  {renameLoading ? 'Saving' : 'Save'}
                </button>
                <button
                  onClick={() => setRenamingGroup(false)}
                  className="flex min-h-[44px] min-w-[44px] items-center justify-center border transition-colors"
                  style={{ borderColor: 'var(--hair-2)', color: 'var(--fg-3)' }}
                  title="Cancel rename"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
          ) : (
            <div className="flex min-w-0 items-start gap-3">
              <h1
                className="min-w-0 break-words font-display font-bold uppercase"
                style={{
                  fontSize: 'clamp(48px, 8vw, 96px)',
                  letterSpacing: '-0.04em',
                  lineHeight: 0.88,
                }}
              >
                {groupName}
                <span style={{ color: 'var(--magenta)' }}>.</span>
              </h1>
              {myRole === 'admin' && (
                <button
                  onClick={() => { setRenameValue(groupName); setRenamingGroup(true) }}
                  className="mt-1 flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center border transition-colors hover:text-[var(--magenta)]"
                  style={{ borderColor: 'var(--hair-2)', color: 'var(--fg-3)' }}
                  title="Rename group"
                >
                  <Pencil size={15} />
                </button>
              )}
            </div>
          )}
          <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.18em] sm:text-xs" style={{ color: 'var(--fg-3)' }}>
            {localMemberCount} member{localMemberCount !== 1 ? 's' : ''} tracked · since {format(new Date(groupCreatedAt), 'MMM d, yyyy')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          {allGroups.length > 1 && (
            <div className="relative" ref={switcherRef}>
              <button
                onClick={() => setSwitcherOpen((open) => !open)}
                className="flex min-h-[44px] items-center gap-2 border px-3 py-2 font-mono text-[11px] font-bold uppercase tracking-[0.16em] transition-colors hover:text-[var(--fg-1)]"
                style={{ borderColor: 'var(--hair-2)', color: 'var(--fg-3)' }}
              >
                <Users size={12} />
                Switch
              </button>
              {switcherOpen && (
                <div
                  className="absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden border py-1 shadow-2xl"
                  style={{ background: 'var(--ink-1)', borderColor: 'var(--hair-2)' }}
                >
                  {allGroups.map((group) => (
                    <a
                      key={group.id}
                      href={`/group/${group.id}`}
                      className="flex min-h-[44px] items-center gap-2.5 px-3 py-2.5 text-sm no-underline transition-colors hover:bg-[var(--ink-2)]"
                      style={{ color: group.id === groupId ? 'var(--magenta)' : 'var(--fg-2)' }}
                    >
                      <div className="h-1.5 w-1.5 shrink-0" style={{ background: group.id === groupId ? 'var(--magenta)' : 'var(--fg-4)' }} />
                      <span className="truncate">{group.name}</span>
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}
          <button
            onClick={copyInvite}
            className="flex min-h-[44px] items-center gap-2 border px-3 py-2 font-mono text-[11px] font-bold uppercase tracking-[0.16em] transition-colors hover:border-[var(--magenta)] hover:text-[var(--magenta)]"
            style={{ borderColor: 'var(--hair-2)', color: 'var(--fg-3)' }}
          >
            {copied ? <Check size={12} className="text-[#b8d957]" /> : <Copy size={12} />}
            {copied ? 'Copied!' : 'Invite link'}
          </button>
        </div>
      </div>

      {localMemberCount < 2 && (
        <div className="card pulse-bar ice mb-6 border-dashed fade-up p-[18px] sm:p-6">
          <span className="pulse-idx">[00]</span>
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center border" style={{ borderColor: 'var(--ice)', color: 'var(--ice)', background: 'var(--ice-s)' }}>
              <Users size={14} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="mb-1 font-display text-[18px] font-bold uppercase leading-none">Invite your training partners</p>
              <p className="mb-3 text-xs" style={{ color: 'var(--fg-3)' }}>Share this link so they can join the group.</p>
              <div className="flex items-center gap-2 border px-3 py-2" style={{ background: 'var(--ink-3)', borderColor: 'var(--hair-1)' }}>
                <span className="flex-1 truncate font-mono text-xs" style={{ color: 'var(--fg-3)' }}>{inviteUrl}</span>
                <button onClick={copyInvite} className="min-h-[44px] shrink-0 font-mono text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: 'var(--magenta)' }}>
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
