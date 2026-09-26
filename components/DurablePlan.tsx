'use client'
import { useEffect, useState } from 'react'
import BackgroundWork from './BackgroundWork'
import PlanSessionModal, {
  defaultConfig,
  type SessionConfig,
} from './PlanSessionModal'
import { localDate, addDays, browserTimezone, DEFAULT_TIMEZONE } from '@/lib/calendar'
import { type PlanSession, type TrainingPreferences } from '@/lib/planning'
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DEFAULTS: TrainingPreferences = {
  days: [1, 3, 5, 0],
  maxMinutes: 60,
  longRunDay: 0,
  timezone: DEFAULT_TIMEZONE,
  easyOnly: false,
  startingWeeklyKm: 0,
  autoAdapt: true,
}
export default function DurablePlan({ initial }: { initial: any }) {
  const [plan, setPlan] = useState(initial),
    [prefs, setPrefs] = useState<TrainingPreferences>(
      initial.preferences ?? DEFAULTS,
    ),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [edit, setEdit] = useState<{
      date: string
      session?: PlanSession
      config?: SessionConfig
      draftKey?: string
      draftIndex?: number
    } | null>(null),
    [drafts, setDrafts] = useState<
      { key: string; date: string; configs: SessionConfig[] }[]
    >([])
  // A first plan defaults to where this browser is; set after mount so SSR markup matches.
  useEffect(() => {
    if (!initial.preferences) setPrefs(p => ({ ...p, timezone: browserTimezone() }))
  }, [initial.preferences])
  useEffect(() => {
    const found: { key: string; date: string; configs: SessionConfig[] }[] = []
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)!
        if (/^plan_sessions_v3_\d{4}-\d\d-\d\d$/.test(key)) {
          const configs = JSON.parse(localStorage.getItem(key)!)
          if (Array.isArray(configs) && configs.length)
            found.push({ key, date: key.slice(-10), configs })
        } else if (
          /^plan_rest_v1_\d{4}-\d\d-\d\d$/.test(key) &&
          JSON.parse(localStorage.getItem(key)!)
        ) {
          found.push({
            key,
            date: key.slice(-10),
            configs: [
              { ...defaultConfig(), sessionType: 'rest', name: 'Rest day' },
            ],
          })
        } else if (
          /^plan_v2_\d{4}-\d\d-\d\d$/.test(key) &&
          !localStorage.getItem(`plan_sessions_v3_${key.slice(-10)}`)
        ) {
          found.push({
            key,
            date: key.slice(-10),
            configs: [JSON.parse(localStorage.getItem(key)!)],
          })
        }
      }
    } catch {}
    setDrafts(found)
  }, [])
  useEffect(() => {
    if (edit || busy) return
    let active = true
    const refresh = () => {
      fetch('/api/plans')
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (active && d) setPlan(d)
        })
        .catch(() => {})
    }
    window.addEventListener('rundash:refresh', refresh)
    return () => {
      active = false
      window.removeEventListener('rundash:refresh', refresh)
    }
  }, [edit, busy])
  async function mutate(body: any, method = 'POST') {
    setBusy(true)
    setError('')
    try {
      const r = await fetch('/api/plans', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, version: plan.version }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error)
      setPlan(data)
      return true
    } catch (e) {
      setError(String(e))
      return false
    } finally {
      setBusy(false)
    }
  }
  async function save(config: SessionConfig) {
    if (!edit) return
    if (await mutate({ id: edit.session?.id, date: edit.date, config })) {
      if (edit.draftKey) {
        const draft = drafts.find((d) => d.key === edit.draftKey)
        const remaining =
          draft?.configs.filter((_, i) => i !== edit.draftIndex) ?? []
        if (remaining.length)
          localStorage.setItem(edit.draftKey, JSON.stringify(remaining))
        else localStorage.removeItem(edit.draftKey)
        setDrafts((d) =>
          d.flatMap((x) =>
            x.key !== edit.draftKey
              ? [x]
              : remaining.length
                ? [{ ...x, configs: remaining }]
                : [],
          ),
        )
      }
      setEdit(null)
      return true
    }
    return false
  }
  const today = localDate(new Date(), prefs.timezone),
    days = Array.from({ length: 28 }, (_, i) => addDays(today, i))
  return (
    <div className="space-y-6">
      <BackgroundWork />
      <section className="card space-y-4">
        <h2 className="font-display text-xl font-bold">Coach plan setup</h2>
        <p className="text-sm text-[var(--text-2)]">
          Seven detailed days, adapted to recorded training and your primary
          race. Manual and locked workouts stay yours.
        </p>
        <div className="flex flex-wrap gap-2">
          {DAY_NAMES.map((d, i) => (
            <button
              className="rd-button"
              style={{
                borderColor: prefs.days.includes(i)
                  ? 'var(--accent)'
                  : undefined,
              }}
              aria-pressed={prefs.days.includes(i)}
              key={d}
              onClick={() =>
                setPrefs({
                  ...prefs,
                  days: prefs.days.includes(i)
                    ? prefs.days.filter((n) => n !== i)
                    : [...prefs.days, i],
                })
              }
            >
              {d}
            </button>
          ))}
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="text-sm">
            Minutes per session
            <input
              type="number"
              min="15"
              max="180"
              className="rd-input"
              value={prefs.maxMinutes}
              onChange={(e) =>
                setPrefs({ ...prefs, maxMinutes: Number(e.target.value) })
              }
            />
          </label>
          <label className="text-sm">
            Long-run day
            <select
              className="rd-input"
              value={prefs.longRunDay}
              onChange={(e) =>
                setPrefs({ ...prefs, longRunDay: Number(e.target.value) })
              }
            >
              {DAY_NAMES.map((d, i) => (
                <option key={d} value={i}>
                  {d}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Current weekly km (if history is missing)
            <input
              className="rd-input"
              type="number"
              value={prefs.startingWeeklyKm}
              onChange={(e) =>
                setPrefs({ ...prefs, startingWeeklyKm: Number(e.target.value) })
              }
            />
          </label>
          <label className="text-sm">
            Timezone
            <input
              className="rd-input"
              value={prefs.timezone}
              onChange={(e) => setPrefs({ ...prefs, timezone: e.target.value })}
            />
          </label>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="text-sm">
            Primary goal
            <select
              className="rd-input"
              value={prefs.primaryGoalId ?? ''}
              onChange={(e) =>
                setPrefs({ ...prefs, primaryGoalId: e.target.value || null })
              }
            >
              <option value="">Use primary / earliest upcoming race</option>
              {(plan.goals ?? [])
                .filter(
                  (g: any) =>
                    (g.status ?? 'active') === 'active' && g.race_date >= today,
                )
                .map((g: any) => (
                  <option value={g.id} key={g.id}>
                    {g.label} · {g.race_date}
                  </option>
                ))}
            </select>
          </label>
          <label className="text-sm">
            Weekly distance cap (optional)
            <input
              type="number"
              className="rd-input"
              value={prefs.maxWeeklyKm ?? ''}
              onChange={(e) =>
                setPrefs({
                  ...prefs,
                  maxWeeklyKm: e.target.value ? Number(e.target.value) : null,
                })
              }
            />
          </label>
        </div>
        <label className="flex gap-3 items-center min-h-[44px]">
          <input
            type="checkbox"
            checked={prefs.avoidConsecutiveDays ?? false}
            onChange={(e) =>
              setPrefs({ ...prefs, avoidConsecutiveDays: e.target.checked })
            }
          />
          Keep a rest day between runs
        </label>
        <label className="block text-sm">
          Private notes for coach conversations
          <textarea
            className="rd-input"
            maxLength={1000}
            value={prefs.constraints ?? ''}
            onChange={(e) =>
              setPrefs({ ...prefs, constraints: e.target.value })
            }
          />
          <span className="text-xs text-[var(--text-3)]">
            Automatic scheduling follows the limits above. Notes are context for
            your personal chat.
          </span>
        </label>
        <label className="flex gap-3 items-center min-h-[44px]">
          <input
            type="checkbox"
            checked={prefs.easyOnly}
            onChange={(e) => setPrefs({ ...prefs, easyOnly: e.target.checked })}
          />
          Easy running only; no quality sessions
        </label>
        <label className="flex gap-3 items-center min-h-[44px]">
          <input
            type="checkbox"
            checked={prefs.autoAdapt}
            onChange={(e) =>
              setPrefs({ ...prefs, autoAdapt: e.target.checked })
            }
          />
          Automatically adapt future coach workouts
        </label>
        {!plan.autoAdaptEnabled && (
          <p className="text-xs text-[var(--text-3)]">
            Automatic adaptation is awaiting rollout validation. You can
            generate a week on request.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <button
            className="rd-button"
            disabled={busy}
            onClick={() => mutate({ action: 'preferences', config: prefs })}
          >
            Save preferences
          </button>
          <button
            className="rd-button"
            disabled={busy || !plan.preferences}
            onClick={() => mutate({ action: 'generate' })}
          >
            Generate / refresh week
          </button>
        </div>
      </section>
      {error && (
        <p role="alert" className="text-[var(--error)]">
          {error}
        </p>
      )}
      {plan.progression?.length > 0 && (
        <section className="card space-y-3">
          <h2 className="font-display font-bold text-xl">
            Progression toward your goal
          </h2>
          <p className="text-xs text-[var(--text-3)]">
            A training outline, not a prediction of future fitness. Each
            detailed week is checked against actual training.
          </p>
          {plan.progression.map((phase: any) => (
            <div key={phase.start + phase.focus}>
              <p className="font-mono text-xs">
                {phase.start} → {phase.end}
              </p>
              <p className="text-sm text-[var(--text-2)]">{phase.focus}</p>
            </div>
          ))}
        </section>
      )}
      {plan.revisions[0] && (
        <section className="card">
          <h2 className="font-bold mb-2">Latest plan change</h2>
          <p className="text-sm text-[var(--text-2)]">
            {plan.revisions[0].reason}
          </p>
          {plan.revisions[0].version === plan.version &&
            plan.revisions[0].reason.includes('based on') && (
              <button
                className="rd-button mt-3"
                disabled={busy}
                onClick={() => mutate({ action: 'undo' })}
              >
                Undo coach revision
              </button>
            )}
        </section>
      )}
      {drafts.length > 0 && (
        <section className="card">
          <h2 className="font-bold">Recover workouts from this browser</h2>
          <p className="text-sm text-[var(--text-2)] my-2">
            These old drafts have no account owner. Open only workouts that
            belong to you; saving creates a manual session and preserves
            existing plans.
          </p>
          {drafts.map((d) => (
            <div key={d.key} className="flex flex-wrap gap-2 my-2">
              {d.configs.map((c, i) => (
                <button
                  className="rd-button"
                  key={i}
                  onClick={() =>
                    setEdit({
                      date: d.date,
                      config: c,
                      draftKey: d.key,
                      draftIndex: i,
                    })
                  }
                >
                  This is my workout — review {d.date}:{' '}
                  {c.name || c.sessionType}
                </button>
              ))}
            </div>
          ))}
        </section>
      )}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {days.map((date) => (
          <div className="card" key={date}>
            <h3 className="font-mono text-sm mb-3">
              {date}
              {date === today ? ' · Today' : ''}
            </h3>
            {(plan.sessions as PlanSession[])
              .filter((s) => s.plan_date === date)
              .map((s) => (
                <div
                  className="py-3 border-t border-[var(--border)] space-y-2"
                  key={s.id}
                >
                  <p className="font-bold text-sm">
                    {s.description || s.session_type}
                  </p>
                  <p className="font-mono text-xs text-[var(--text-3)]">
                    {s.target_distance_meters
                      ? `${(s.target_distance_meters / 1000).toFixed(1)} km · `
                      : ''}
                    {s.status} · {s.source}
                    {s.locked ? ' · locked' : ''}
                  </p>
                  {s.source === 'shared' && (
                    <p className="text-[var(--warning)] text-xs">
                      This workout came from a retired shared event. Edit or
                      delete it here to manage your own schedule.
                    </p>
                  )}
                  <button
                    className="rd-button"
                    disabled={busy}
                    onClick={() => setEdit({ date, session: s })}
                  >
                    Edit
                  </button>
                  {s.status === 'planned' && (
                    <>
                      <button
                        className="rd-button"
                        disabled={busy}
                        onClick={() => mutate({ action: 'skip', id: s.id })}
                      >
                        Skip
                      </button>
                      <select
                        aria-label="Link recorded run"
                        className="rd-input text-xs"
                        value=""
                        onChange={(e) =>
                          e.target.value &&
                          mutate({
                            action: 'link',
                            id: s.id,
                            activity_id: Number(e.target.value),
                          })
                        }
                      >
                        <option value="">Link recorded run…</option>
                        {plan.runs.map((r: any) => (
                          <option key={r.id} value={r.id}>
                            {r.start_date.slice(0, 10)} · {r.name}
                          </option>
                        ))}
                      </select>
                    </>
                  )}
                  {s.activity_id && (
                    <button
                      className="rd-button"
                      disabled={busy}
                      onClick={() => mutate({ action: 'unlink', id: s.id })}
                    >
                      Unlink run
                    </button>
                  )}
                </div>
              ))}
            {!plan.sessions.some((s: PlanSession) => s.plan_date === date) && (
              <p className="text-xs text-[var(--text-3)]">
                Rest / no scheduled training
              </p>
            )}
            <button
              className="rd-button mt-3"
              disabled={busy}
              onClick={() => setEdit({ date })}
            >
              Add workout
            </button>
          </div>
        ))}
      </section>
      {edit && (
        <PlanSessionModal
          displayDate={edit.date}
          initialConfig={
            edit.config ??
            edit.session?.config ??
            (edit.session
              ? {
                  ...defaultConfig(),
                  name: edit.session.description ?? '',
                  sessionType: edit.session.session_type,
                  blocks: edit.session.target_distance_meters
                    ? [
                        {
                          id: 'legacy-distance',
                          kind: 'continuous',
                          label: 'Run',
                          mode: 'distance',
                          distanceM: edit.session.target_distance_meters,
                          durationMin: 0,
                          targetPace: '',
                        },
                      ]
                    : [],
                }
              : null)
          }
          onClose={() => setEdit(null)}
          onSave={save}
          onDelete={
            edit.session
              ? async () => {
                  if (await mutate({ id: edit.session!.id }, 'DELETE'))
                    setEdit(null)
                }
              : undefined
          }
        />
      )}
    </div>
  )
}
