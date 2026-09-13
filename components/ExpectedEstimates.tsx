import Link from 'next/link'
import { type ExpectedEstimate } from '@/lib/analysis/expected'
import { formatGoalTime, distanceLabel } from '@/lib/goals'
export default function ExpectedEstimates({
  estimates,
}: {
  estimates: ExpectedEstimate[]
}) {
  return (
    <section className="card">
      <h2 className="font-display text-lg font-bold mb-2">
        Expected race today
      </h2>
      <p className="text-sm text-[var(--text-2)] mb-4">
        Current fitness in usual conditions. Ideal conditions are shown
        separately.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {estimates.map((e) => (
          <div
            key={e.distanceKey}
            className="p-4 rounded-lg border border-[var(--border)] bg-[var(--surface-2)]"
          >
            <h3 className="font-mono text-xs uppercase">
              {distanceLabel(e.distanceKey)}
            </h3>
            <p className="font-mono text-2xl my-2">
              {e.expectedSecs == null
                ? 'More evidence needed'
                : formatGoalTime(e.expectedSecs)}
            </p>
            {e.expectedSecs != null && (
              <>
                <p className="font-mono text-xs text-[var(--text-2)]">
                  {formatGoalTime(e.lowSecs!)}–{formatGoalTime(e.highSecs!)} ·{' '}
                  {e.confidence} confidence
                </p>
                <p className="font-mono text-xs text-[var(--text-3)] mt-2">
                  Ideal: {formatGoalTime(e.idealSecs!)}
                </p>
              </>
            )}
            <p className="text-sm text-[var(--text-2)] mt-3">{e.explanation}</p>
            {e.evidence.length > 0 && (
              <details className="text-sm mt-3">
                <summary className="cursor-pointer py-2">
                  Supporting runs ({e.evidence.length})
                </summary>
                {e.evidence.slice(0, 8).map((r) => (
                  <Link
                    className="block py-2 text-[var(--accent)]"
                    key={r.activityId}
                    href={`/runs/${r.activityId}`}
                  >
                    {r.date.slice(0, 10)} · {r.kind}
                  </Link>
                ))}
              </details>
            )}
            <p className="font-mono text-[10px] text-[var(--text-3)] mt-3">
              Updated {e.asOf.slice(0, 10)}
              {e.freshness?.ageDays != null
                ? ` · latest evidence ${e.freshness.ageDays}d old`
                : ''}{' '}
              · {e.modelVersion}
            </p>
          </div>
        ))}
      </div>
      <Link
        className="block mt-4 text-sm text-[var(--accent)]"
        href="/analysis/sources"
      >
        Explore analysis sources
      </Link>
      <p className="text-xs text-[var(--text-3)] mt-4">
        Model changes start a new comparison history; they are not counted as
        fitness improvements.
      </p>
    </section>
  )
}
