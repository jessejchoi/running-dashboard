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
      <div className="flex items-start justify-between mb-3 sm:mb-6 fade-up">
        <div>
          {renamingGroup ? (
            <div className="flex items-center gap-2">
              <input
                value={renameValue}
                onChange={e => onRenameChange(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') onSaveGroupName()
                  if (e.key === 'Escape') setRenamingGroup(false)
                }}
                autoFocus
                className="font-display font-extrabold uppercase bg-transparent border-b-2 border-[#ff1d6c] outline-none text-white w-full"
                style={{ fontSize: 'clamp(28px, 6vw, 48px)', letterSpacing: '-0.02em' }}
              />
              <button
                onClick={onSaveGroupName}
                disabled={renameLoading}
                className="text-xs font-bold text-[#ff1d6c] hover:text-[#d4185a] disabled:opacity-50 shrink-0"
              >
                {renameLoading ? '…' : 'Save'}
              </button>
              <button onClick={() => setRenamingGroup(false)} className="text-[#4b5563] hover:text-white shrink-0">
                <X size={16} />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <h1 className="font-display font-extrabold uppercase" style={{ fontSize: 'clamp(28px, 6vw, 48px)', letterSpacing: '-0.02em' }}>{groupName}</h1>
              {myRole === 'admin' && (
                <button
                  onClick={() => { setRenameValue(groupName); setRenamingGroup(true) }}
                  className="text-[#4b5563] hover:text-white mt-1"
                  title="Rename group"
                >
                  <Pencil size={15} />
                </button>
              )}
            </div>
          )}
          <p className="text-[#6b7280] text-sm mt-1">
            {localMemberCount} member{localMemberCount !== 1 ? 's' : ''} · Created {format(new Date(groupCreatedAt), 'MMM d, yyyy')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {allGroups.length > 1 && (
            <div className="relative" ref={switcherRef}>
              <button
                onClick={() => setSwitcherOpen((open) => !open)}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold border border-[#2a2a2a] hover:border-[#3a3a3a] text-[#6b7280] hover:text-white rounded-lg transition-colors"
              >
                <Users size={12} />
                Switch
              </button>
              {switcherOpen && (
                <div className="absolute right-0 top-full mt-1.5 w-48 bg-[#141414] border border-[#2a2a2a] rounded-xl shadow-2xl z-50 py-1 overflow-hidden">
                  {allGroups.map((group) => (
                    <a
                      key={group.id}
                      href={`/group/${group.id}`}
                      className={`flex items-center gap-2.5 px-3 py-2.5 text-sm transition-colors no-underline ${
                        group.id === groupId
                          ? 'text-[#ff1d6c] bg-[#ff1d6c]/10'
                          : 'text-[#9ca3af] hover:text-white hover:bg-[#1c1c1c]'
                      }`}
                    >
                      <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${group.id === groupId ? 'bg-[#ff1d6c]' : 'bg-[#3a3a3a]'}`} />
                      <span className="truncate">{group.name}</span>
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}
          <button
            onClick={copyInvite}
            className="flex items-center gap-2 px-3 py-2 text-xs font-bold border border-[#2a2a2a] hover:border-[#ff1d6c] text-[#6b7280] hover:text-[#ff1d6c] rounded-lg transition-colors"
          >
            {copied ? <Check size={12} className="text-[#d9ff36]" /> : <Copy size={12} />}
            {copied ? 'Copied!' : 'Invite link'}
          </button>
        </div>
      </div>

      {localMemberCount < 2 && (
        <div className="card border-dashed border-[#2a2a2a] mb-6 fade-up">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-[#ff1d6c]/10 flex items-center justify-center shrink-0 mt-0.5">
              <Users size={14} className="text-[#ff1d6c]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sm mb-1">Invite your training partners</p>
              <p className="text-[#6b7280] text-xs mb-3">Share this link so they can join the group.</p>
              <div className="flex items-center gap-2 bg-[#0f0f0f] border border-[#2a2a2a] rounded-lg px-3 py-2">
                <span className="text-[#6b7280] text-xs font-mono truncate flex-1">{inviteUrl}</span>
                <button onClick={copyInvite} className="text-[#ff1d6c] text-xs font-bold shrink-0 hover:underline">
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
