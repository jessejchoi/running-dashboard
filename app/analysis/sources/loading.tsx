export default function Loading() {
  return (
    <main className="max-w-6xl mx-auto px-3 sm:px-6 pt-8 sm:pt-20 pb-24 sm:pb-16 animate-pulse">
      <div className="flex items-center gap-3 mb-6">
        <div className="h-5 w-5 bg-[#1c1c1c] rounded" />
        <div>
          <div className="h-8 w-64 bg-[#1c1c1c] rounded-lg mb-2" />
          <div className="h-4 w-48 bg-[#1c1c1c] rounded" />
        </div>
      </div>
      <div className="flex gap-1 mb-6">
        {[...Array(4)].map((_, i) => <div key={i} className="h-10 w-16 bg-[#1c1c1c] rounded-lg" />)}
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        {[...Array(5)].map((_, i) => <div key={i} className="h-40 bg-[#1c1c1c] rounded-xl" />)}
      </div>
    </main>
  )
}
