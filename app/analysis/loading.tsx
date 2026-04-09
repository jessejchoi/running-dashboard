export default function Loading() {
  return (
    <main className="max-w-6xl mx-auto px-3 sm:px-6 pt-20 pb-16 animate-pulse">
      <div className="h-10 w-56 bg-[#1c1c1c] rounded-lg mb-2" />
      <div className="h-4 w-96 bg-[#1c1c1c] rounded mb-8" />
      <div className="flex gap-1 mb-6">
        {[...Array(4)].map((_, i) => <div key={i} className="h-10 w-16 bg-[#1c1c1c] rounded-lg" />)}
      </div>
      <div className="h-48 bg-[#1c1c1c] rounded-xl mb-6" />
      <div className="grid md:grid-cols-2 gap-4">
        {[...Array(4)].map((_, i) => <div key={i} className="h-40 bg-[#1c1c1c] rounded-xl" />)}
      </div>
    </main>
  )
}
