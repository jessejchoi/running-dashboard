'use client'
import { useState, useEffect, useRef } from 'react'
import { Send, X, ChevronDown } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { Avatar } from '@/components/GroupShared'

interface SimpleMember {
  athlete_id: number
  name: string
  profile_pic: string | null
  is_me: boolean
}

interface Message {
  id: string
  from_athlete_id: number
  from_name: string
  from_pic: string | null
  to_athlete_id: number | null
  to_name: string | null
  content: string
  created_at: string
  is_mine: boolean
}

interface Props {
  groupId: string
  members: SimpleMember[]
  myRole?: string
}

export default function GroupMessageBoard({ groupId, members, myRole = 'member' }: Props) {
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [content, setContent] = useState('')
  const [toAthleteId, setToAthleteId] = useState<number | null>(null)
  const [sending, setSending] = useState(false)
  const [showToDropdown, setShowToDropdown] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const otherMembers = members.filter(m => !m.is_me)
  const selectedTo = otherMembers.find(m => m.athlete_id === toAthleteId) ?? null

  async function fetchMessages() {
    try {
      const res = await fetch(`/api/groups/${groupId}/messages`)
      if (!res.ok) return
      const data = await res.json()
      setMessages(data.messages ?? [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchMessages()
    // Poll every 30s
    const interval = setInterval(fetchMessages, 30_000)
    return () => clearInterval(interval)
  }, [groupId])

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowToDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  async function handleSend() {
    const trimmed = content.trim()
    if (!trimmed || sending) return
    setSending(true)
    try {
      const res = await fetch(`/api/groups/${groupId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: trimmed, to_athlete_id: toAthleteId }),
      })
      if (!res.ok) return
      setContent('')
      setToAthleteId(null)
      await fetchMessages()
    } finally {
      setSending(false)
    }
  }

  async function handleDelete(messageId: string) {
    const res = await fetch(`/api/groups/${groupId}/messages?messageId=${messageId}`, { method: 'DELETE' })
    if (res.ok) setMessages(prev => prev.filter(m => m.id !== messageId))
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // Displayed in newest-first order from API; reverse to show oldest-first in feed
  const displayMessages = [...messages].reverse()

  return (
    <div className="card" style={{ padding: '1.25rem' }}>
      {/* Message feed */}
      <div
        className="mb-3 space-y-3 overflow-y-auto"
        style={{ maxHeight: 280, minHeight: loading || messages.length === 0 ? 0 : undefined }}
      >
        {loading ? (
          <p className="text-xs text-center py-4" style={{ color: 'var(--text-muted)' }}>Loading…</p>
        ) : displayMessages.length === 0 ? (
          <p className="text-xs text-center py-4" style={{ color: 'var(--text-muted)' }}>
            No messages yet — say something!
          </p>
        ) : (
          displayMessages.map(msg => (
            <MessageRow
              key={msg.id}
              msg={msg}
              myRole={myRole}
              onDelete={handleDelete}
            />
          ))
        )}
      </div>

      {/* Compose */}
      <div className="flex flex-col gap-2">
        {/* "To" selector — only show if there are other members */}
        {otherMembers.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-widest shrink-0" style={{ color: 'var(--text-muted)' }}>To</span>
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setShowToDropdown(v => !v)}
                className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md transition-colors"
                style={{
                  background: 'var(--surface-2)',
                  border: '1px solid var(--border)',
                  color: selectedTo ? 'var(--text-1)' : 'var(--text-muted)',
                }}
              >
                {selectedTo ? (
                  <>
                    <Avatar name={selectedTo.name} pic={selectedTo.profile_pic} size={4} />
                    <span>{selectedTo.name.split(' ')[0]}</span>
                  </>
                ) : (
                  <span>Everyone</span>
                )}
                <ChevronDown size={12} />
              </button>

              {showToDropdown && (
                <div
                  className="absolute left-0 top-full mt-1 z-50 rounded-lg overflow-hidden min-w-[140px]"
                  style={{ background: '#1a1a1a', border: '1px solid var(--border)', boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}
                >
                  <button
                    onClick={() => { setToAthleteId(null); setShowToDropdown(false) }}
                    className="w-full text-left text-xs px-3 py-2 transition-colors hover:bg-white/5"
                    style={{ color: toAthleteId === null ? '#f97316' : 'var(--text-1)' }}
                  >
                    Everyone
                  </button>
                  {otherMembers.map(m => (
                    <button
                      key={m.athlete_id}
                      onClick={() => { setToAthleteId(m.athlete_id); setShowToDropdown(false) }}
                      className="w-full text-left text-xs px-3 py-2 flex items-center gap-2 transition-colors hover:bg-white/5"
                      style={{ color: toAthleteId === m.athlete_id ? '#f97316' : 'var(--text-1)' }}
                    >
                      <Avatar name={m.name} pic={m.profile_pic} size={4} />
                      {m.name.split(' ')[0]}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {selectedTo && (
              <button
                onClick={() => setToAthleteId(null)}
                className="text-[10px] transition-colors"
                style={{ color: 'var(--text-muted)' }}
                title="Clear recipient"
              >
                <X size={12} />
              </button>
            )}
          </div>
        )}

        {/* Text input + send */}
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={content}
            onChange={e => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            maxLength={500}
            placeholder={selectedTo ? `Message to ${selectedTo.name.split(' ')[0]}…` : 'Say something to the group…'}
            className="flex-1 text-sm resize-none rounded-lg px-3 py-2 outline-none transition-colors"
            style={{
              background: '#0f0f0f',
              border: '1px solid var(--border)',
              color: 'var(--text-1)',
              minHeight: 38,
              maxHeight: 96,
              lineHeight: '1.5',
            }}
            onFocus={e => { e.currentTarget.style.borderColor = '#f97316' }}
            onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)' }}
            onInput={e => {
              const el = e.currentTarget
              el.style.height = 'auto'
              el.style.height = Math.min(el.scrollHeight, 96) + 'px'
            }}
          />
          <button
            onClick={handleSend}
            disabled={!content.trim() || sending}
            className="flex items-center justify-center rounded-lg transition-colors shrink-0"
            style={{
              width: 38,
              height: 38,
              background: content.trim() && !sending ? '#f97316' : 'var(--surface-2)',
              color: content.trim() && !sending ? '#fff' : 'var(--text-muted)',
              border: '1px solid var(--border)',
            }}
          >
            <Send size={15} />
          </button>
        </div>
        <p className="font-mono text-[10px]" style={{ color: 'var(--text-muted)' }}>
          Enter to send · Shift+Enter for new line
        </p>
      </div>
    </div>
  )
}

function MessageRow({ msg, myRole, onDelete }: { msg: Message; myRole: string; onDelete: (id: string) => void }) {
  const [hovered, setHovered] = useState(false)
  const canDelete = msg.is_mine || myRole === 'admin'

  const timeAgo = formatDistanceToNow(new Date(msg.created_at), { addSuffix: true })

  return (
    <div
      className="flex items-start gap-2.5 group"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="shrink-0 mt-0.5">
        <Avatar name={msg.from_name} pic={msg.from_pic} size={7} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-1.5 flex-wrap">
          <span className="text-xs font-semibold text-white">{msg.from_name.split(' ')[0]}</span>
          {msg.to_name && (
            <>
              <span className="font-mono text-[10px]" style={{ color: 'var(--text-muted)' }}>→</span>
              <span className="text-xs font-semibold" style={{ color: '#f97316' }}>{msg.to_name.split(' ')[0]}</span>
            </>
          )}
          <span className="font-mono text-[10px]" style={{ color: 'var(--text-muted)' }}>{timeAgo}</span>
        </div>
        <p className="text-sm mt-0.5 break-words leading-relaxed" style={{ color: 'var(--text-2)' }}>
          {msg.content}
        </p>
      </div>
      {canDelete && hovered && (
        <button
          onClick={() => onDelete(msg.id)}
          className="shrink-0 mt-0.5 opacity-60 hover:opacity-100 transition-opacity"
          style={{ color: 'var(--text-muted)' }}
          title="Delete message"
        >
          <X size={13} />
        </button>
      )}
    </div>
  )
}
