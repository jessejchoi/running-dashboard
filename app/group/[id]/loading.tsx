import Nav from '@/components/Nav'

export default function Loading() {
  return (
    <>
      <Nav />
      <main className="standalone-main max-w-6xl mx-auto px-3 sm:px-6 pt-8 sm:pt-20 pb-24 sm:pb-16 animate-pulse">
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="h-10 w-48 bg-[#1c1c1c] rounded-lg mb-2" />
            <div className="h-4 w-40 bg-[#1c1c1c] rounded" />
          </div>
          <div className="h-9 w-24 bg-[#1c1c1c] rounded-lg" />
        </div>

        <div className="flex gap-1 mb-6 border-b border-[#1c1c1c]">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-9 w-20 bg-[#1c1c1c] rounded-t-lg" />
          ))}
        </div>

        <div className="bg-[#111] border border-[#1c1c1c] rounded-xl p-5 mb-4">
          <div className="h-4 w-24 bg-[#1c1c1c] rounded mb-4" />
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-full bg-[#1c1c1c] shrink-0" />
                <div className="flex-1 h-4 bg-[#1c1c1c] rounded" />
                <div className="w-16 h-4 bg-[#1c1c1c] rounded" />
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-[#111] border border-[#1c1c1c] rounded-xl p-5">
            <div className="h-4 w-28 bg-[#1c1c1c] rounded mb-4" />
            <div className="grid grid-cols-2 gap-2">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-16 bg-[#1c1c1c] rounded-lg" />
              ))}
            </div>
          </div>
          <div className="bg-[#111] border border-[#1c1c1c] rounded-xl p-5">
            <div className="h-4 w-20 bg-[#1c1c1c] rounded mb-4" />
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-[#1c1c1c] shrink-0" />
                  <div className="flex-1">
                    <div className="h-3.5 w-28 bg-[#1c1c1c] rounded mb-1.5" />
                    <div className="h-3 w-20 bg-[#1c1c1c] rounded" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </>
  )
}
