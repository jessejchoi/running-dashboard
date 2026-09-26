import Link from 'next/link'
import { type ExpectedEstimate } from '@/lib/analysis/expected'
import { formatGoalTime } from '@/lib/goals'
import Eyebrow from './Eyebrow'
const LABELS = { '5k': '5K', '10k': '10K', hm: 'Half', fm: 'Full' }
export default function ExpectedEstimates({ estimates, deltas, n }: {
  estimates: ExpectedEstimate[]
  deltas?: Partial<Record<string, { month: number | null }>>
  n?: string
}) {
  return (
    <section className="panel grid-cols-2 sm:grid-cols-4 mt-3 mb-3 fade-up">
      <div className="cell col-span-full" style={{ paddingBottom: 6 }}>
        <Eyebrow n={n} label="Race estimates" right={<Link href="/analysis" className="inline-flex items-center min-h-[32px]">Full analysis →</Link>} className="!mb-0" />
      </div>
      {estimates.map(e => {
        const delta = deltas?.[e.distanceKey]?.month
        return (
          <div key={e.distanceKey} className="cell">
            <h3 className="font-display font-extrabold text-lg leading-none mb-3">{LABELS[e.distanceKey]}</h3>
            <p className="stat-num text-xl sm:text-[22px] font-bold leading-none">{e.expectedSecs == null ? '—' : formatGoalTime(e.expectedSecs)}</p>
            <p className="font-mono text-[10px] mt-2 uppercase tracking-[0.1em] text-[var(--text-3)]">{e.expectedSecs == null ? 'More evidence needed' : 'usual conditions'}</p>
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
      <div className="cell col-span-full" style={{ paddingTop: 4, paddingBottom: 4 }}>
        <details>
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
