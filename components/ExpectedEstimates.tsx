import Link from 'next/link'
import { type ExpectedEstimate } from '@/lib/analysis/expected'
import { formatGoalTime } from '@/lib/goals'
const LABELS = { '5k': '5K', '10k': '10K', hm: 'Half', fm: 'Full' }
export default function ExpectedEstimates({ estimates, deltas }: {
  estimates: ExpectedEstimate[]
  deltas?: Partial<Record<string, { month: number | null }>>
}) {
  return (
    <section className="mt-6 mb-3">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 className="font-display font-bold text-base text-[var(--text-3)] uppercase tracking-widest">Race Estimates</h2>
        <Link href="/analysis" className="font-mono text-xs text-[var(--accent)] min-h-[44px] inline-flex items-center">Full analysis →</Link>
      </div>
      <div className="card fade-up">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {estimates.map(e => {
            const delta = deltas?.[e.distanceKey]?.month
            return (
              <div key={e.distanceKey} className="min-w-0 rounded-lg p-3.5 border border-[var(--border)] bg-[var(--surface-2)]">
                <h3 className="font-mono text-xs uppercase tracking-widest mb-1.5 text-[var(--text-3)]">{LABELS[e.distanceKey]}</h3>
                <p className="stat-num text-xl font-bold leading-none text-[var(--text-1)]">{e.expectedSecs == null ? '—' : formatGoalTime(e.expectedSecs)}</p>
                <p className="font-mono text-[10px] mt-1.5 text-[var(--text-3)]">{e.expectedSecs == null ? 'More evidence needed' : 'usual conditions'}</p>
                {e.expectedSecs != null && e.idealSecs != null && Math.abs(e.expectedSecs - e.idealSecs) > 5 && (
                  <p className="font-mono text-[10px] mt-1.5 text-[var(--text-3)]">ideal <span className="text-[var(--text-2)]">{formatGoalTime(e.idealSecs)}</span></p>
                )}
                {delta != null && (
                  <p className="font-mono text-[10px] mt-1.5" style={{ color: delta < 0 ? 'var(--success)' : delta > 0 ? 'var(--error)' : 'var(--text-3)' }}>
                    {delta < 0 ? '▼' : delta > 0 ? '▲' : '—'} {delta !== 0 && formatGoalTime(Math.abs(delta))} <span className="text-[var(--text-3)]">vs 1mo</span>
                  </p>
                )}
              </div>
            )
          })}
        </div>
        <details className="mt-3">
          <summary className="font-mono text-[11px] text-[var(--text-3)] cursor-pointer min-h-[44px] py-3">Ranges & supporting runs</summary>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            {estimates.map(e => (
              <div key={e.distanceKey} className="text-sm text-[var(--text-2)] space-y-2 min-w-0">
                <p className="font-mono text-xs">{LABELS[e.distanceKey]} · {e.confidence} confidence</p>
                {e.lowSecs != null && e.highSecs != null && <p className="font-mono text-xs">Estimated range {formatGoalTime(e.lowSecs)}–{formatGoalTime(e.highSecs)}</p>}
                <p>{e.explanation}</p>
                {e.evidence.slice(0, 8).map(r => <Link key={r.activityId} className="block py-2 text-[var(--accent)]" href={`/runs/${r.activityId}`}>{r.date.slice(0, 10)} · {r.kind}</Link>)}
                <p className="font-mono text-[10px] text-[var(--text-3)] break-words">Updated {e.asOf.slice(0, 10)}{e.freshness?.ageDays != null ? ` · latest evidence ${e.freshness.ageDays}d old` : ''} · {e.modelVersion}</p>
              </div>
            ))}
          </div>
          <Link className="inline-flex items-center min-h-[44px] text-sm text-[var(--accent)] mt-2" href="/analysis/sources">Explore analysis sources →</Link>
          <p className="text-xs text-[var(--text-3)]">Model changes start a new comparison history; they are not counted as fitness improvements.</p>
        </details>
      </div>
    </section>
  )
}
