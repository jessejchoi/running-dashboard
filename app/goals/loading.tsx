import Nav from '@/components/Nav'

export default function GoalsLoading() {
  return (
    <>
      <Nav />
      <main className="standalone-main max-w-6xl mx-auto px-3 sm:px-6 pt-20 pb-16">
        {/* Header skeleton */}
        <div className="mb-8 animate-pulse">
          <div className="h-10 w-48 rounded" style={{ background: 'var(--surface-2)' }} />
          <div className="h-3 w-32 rounded mt-3" style={{ background: 'var(--surface-2)' }} />
        </div>

        {/* Goal cards skeleton */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 animate-pulse">
          {[1, 2, 3].map(i => (
            <div key={i} className="card p-5 space-y-4">
              {/* Badge + title row */}
              <div className="flex items-center justify-between">
                <div className="h-5 w-16 rounded" style={{ background: 'var(--surface-2)' }} />
                <div className="h-5 w-20 rounded" style={{ background: 'var(--surface-2)' }} />
              </div>
              {/* Big stat */}
              <div className="h-10 w-32 rounded" style={{ background: 'var(--surface-2)' }} />
              {/* Progress bar */}
              <div className="h-2 w-full rounded-full" style={{ background: 'var(--surface-2)' }} />
              {/* Meta row */}
              <div className="flex gap-3">
                <div className="h-3 w-24 rounded" style={{ background: 'var(--surface-2)' }} />
                <div className="h-3 w-20 rounded" style={{ background: 'var(--surface-2)' }} />
              </div>
            </div>
          ))}
        </div>
      </main>
    </>
  )
}
