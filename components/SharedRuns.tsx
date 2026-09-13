'use client'
import { useEffect, useState } from 'react'
import { zonedDateTime, eventLocalTime } from '@/lib/calendar'
export default function SharedRuns({ groupId }: { groupId: string }) {
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [editing, setEditing] = useState<any>(null),
    [title, setTitle] = useState(''),
    [time, setTime] = useState(''),
    [zone, setZone] = useState('Asia/Jakarta'),
    [place, setPlace] = useState(''),
    [description, setDescription] = useState(''),
    [options, setOptions] = useState([
      { label: 'Easy group', distance_km: 5, pace: 'Conversational' },
    ])
  useEffect(() => {
    fetch(`/api/groups/${groupId}/shared-runs`)
      .then(async (r) => {
        const b = await r.json()
        if (!r.ok) throw new Error(b.error)
        setData(b)
      })
      .catch((e) => setError(String(e)))
  }, [groupId])
  async function send(body: any) {
    setBusy(true)
    setError('')
    try {
      const r = await fetch(`/api/groups/${groupId}/shared-runs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const b = await r.json()
      if (!r.ok) throw new Error(b.error)
      setData(b)
      return true
    } catch (e) {
      setError(String(e))
      return false
    } finally {
      setBusy(false)
    }
  }
  async function save() {
    let starts_at: string
    try {
      starts_at = zonedDateTime(time, zone)
    } catch (e) {
      setError(String(e))
      return
    }
    if (
      await send({
        action: editing?.id ? 'edit' : 'create',
        id: editing?.id,
        version: editing?.version,
        title,
        starts_at,
        timezone: zone,
        meeting_point: place,
        description,
        options,
      })
    ) {
      setEditing(null)
      setTitle('')
    }
  }
  function edit(e: any) {
    setEditing(e)
    setTitle(e.title)
    setTime(eventLocalTime(e.starts_at, e.timezone))
    setZone(e.timezone)
    setPlace(e.meeting_point)
    setDescription(e.description)
    setOptions(e.options)
  }
  return (
    <section className="card space-y-4">
      <div className="flex justify-between gap-3">
        <h2 className="font-display font-bold text-xl">Run together</h2>
        <button
          className="rd-button"
          onClick={() => {
            setEditing({})
            setTitle('')
            setTime('')
            setPlace('')
            setDescription('')
          }}
        >
          Organize a run
        </button>
      </div>
      {error && (
        <p role="alert" className="text-[var(--error)] text-sm">
          {error}
        </p>
      )}
      {!data ? (
        <p>Loading group runs…</p>
      ) : data.events.length === 0 ? (
        <p className="text-sm text-[var(--text-2)]">
          Pick a session, choose a pace group, and meet at the start.
        </p>
      ) : (
        data.events.map((e: any) => {
          const mine = data.rsvps.find(
            (r: any) => r.run_id === e.id && r.athlete_id === data.athleteId,
          )
          const linked = data.linked?.find((p: any) => p.shared_run_id === e.id)
          const canEdit =
            e.creator_id === data.athleteId ||
            ['admin', 'owner'].includes(data.role)
          return (
            <article
              className="border-t border-[var(--border)] pt-4 space-y-2"
              key={e.id}
            >
              <h3 className="font-bold">
                {e.title} {e.status === 'cancelled' ? '· Cancelled' : ''}
              </h3>
              <p className="text-sm text-[var(--text-2)]">
                {new Date(e.starts_at).toLocaleString(undefined, {
                  timeZone: e.timezone,
                })}{' '}
                · {e.timezone} · {e.meeting_point}
              </p>
              <p className="text-sm">{e.description}</p>
              {linked?.event_changed && (
                <p className="text-sm text-[var(--warning)]">
                  Your plan still has the previous event details. Accept the
                  update or remove the linked session below.
                </p>
              )}
              <p className="font-mono text-xs">
                {data.rsvps.filter((r: any) => r.run_id === e.id).length}{' '}
                joining
              </p>
              {e.status === 'scheduled' &&
                e.options.map((o: any, i: number) => (
                  <div className="flex flex-wrap items-center gap-2" key={i}>
                    <span className="text-sm">
                      {o.label} · {o.distance_km} km · {o.pace}
                    </span>
                    <button
                      className="rd-button"
                      disabled={busy}
                      onClick={() =>
                        send({
                          action: 'rsvp',
                          id: e.id,
                          version: e.version,
                          option: i,
                          join: true,
                        })
                      }
                    >
                      {mine?.option_index === i ? 'Joined' : 'Join'}
                    </button>
                    <button
                      className="rd-button"
                      disabled={busy}
                      onClick={() =>
                        send({
                          action: 'rsvp',
                          id: e.id,
                          version: e.version,
                          option: i,
                          join: true,
                          add_plan: true,
                          accept_change: true,
                          plan_version: data.planVersion,
                        })
                      }
                    >
                      {linked
                        ? 'Accept update in my plan'
                        : 'Join and add to my plan'}
                    </button>
                  </div>
                ))}
              {mine && (
                <button
                  className="rd-button"
                  disabled={busy}
                  onClick={() =>
                    send({
                      action: 'rsvp',
                      id: e.id,
                      version: e.version,
                      option: mine.option_index,
                      join: false,
                    })
                  }
                >
                  Leave run
                </button>
              )}
              {linked && (
                <button
                  className="rd-button"
                  disabled={busy}
                  onClick={() =>
                    send({
                      action: 'rsvp',
                      id: e.id,
                      version: e.version,
                      join: false,
                      accept_change: true,
                      plan_version: data.planVersion,
                    })
                  }
                >
                  Remove linked plan session
                </button>
              )}
              {canEdit && e.status === 'scheduled' && (
                <div className="flex gap-2">
                  <button
                    className="rd-button"
                    disabled={busy}
                    onClick={() => edit(e)}
                  >
                    Edit event
                  </button>
                  <button
                    className="rd-button"
                    disabled={busy}
                    onClick={() => {
                      if (confirm('Cancel this group run?'))
                        void send({
                          action: 'cancel',
                          id: e.id,
                          version: e.version,
                        })
                    }}
                  >
                    Cancel event
                  </button>
                </div>
              )}
            </article>
          )
        })
      )}
      {editing && (
        <div className="border-t border-[var(--border)] pt-4 space-y-3">
          <label className="block text-sm">
            Title
            <input
              className="rd-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            Date and time
            <input
              type="datetime-local"
              className="rd-input"
              value={time}
              onChange={(e) => setTime(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            Event timezone
            <input
              className="rd-input"
              value={zone}
              onChange={(e) => setZone(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            Meeting point
            <input
              className="rd-input"
              value={place}
              onChange={(e) => setPlace(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            Description
            <textarea
              className="rd-input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          {options.map((o, i) => (
            <div className="grid sm:grid-cols-3 gap-2" key={i}>
              <input
                aria-label="Pace group name"
                className="rd-input"
                value={o.label}
                onChange={(e) =>
                  setOptions(
                    options.map((v, j) =>
                      i === j ? { ...v, label: e.target.value } : v,
                    ),
                  )
                }
              />
              <input
                aria-label="Distance km"
                type="number"
                className="rd-input"
                value={o.distance_km}
                onChange={(e) =>
                  setOptions(
                    options.map((v, j) =>
                      i === j
                        ? { ...v, distance_km: Number(e.target.value) }
                        : v,
                    ),
                  )
                }
              />
              <input
                aria-label="Pace or effort"
                className="rd-input"
                value={o.pace}
                onChange={(e) =>
                  setOptions(
                    options.map((v, j) =>
                      i === j ? { ...v, pace: e.target.value } : v,
                    ),
                  )
                }
              />
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <button
              className="rd-button"
              disabled={options.length >= 6}
              onClick={() =>
                setOptions([
                  ...options,
                  { label: 'Another group', distance_km: 5, pace: 'Easy' },
                ])
              }
            >
              Add pace / distance option
            </button>
            <button className="rd-button" disabled={busy} onClick={save}>
              Save event
            </button>
            <button className="rd-button" onClick={() => setEditing(null)}>
              Close
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
