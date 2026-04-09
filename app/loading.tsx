export default function Loading() {
  return (
    <main className="max-w-6xl mx-auto px-6 pt-20 pb-16 animate-pulse">
      <div className="h-10 w-48 bg-[#1c1c1c] rounded-lg mb-2" />
      <div className="h-4 w-64 bg-[#1c1c1c] rounded mb-8" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        {[...Array(4)].map((_, i) => <div key={i} className="h-16 bg-[#1c1c1c] rounded-xl" />)}
      </div>
      <div className="grid md:grid-cols-2 gap-4 mb-8">
        <div className="h-[300px] bg-[#1c1c1c] rounded-xl" />
        <div className="h-[300px] bg-[#1c1c1c] rounded-xl" />
      </div>
      <div className="grid md:grid-cols-3 gap-4">
        {[...Array(3)].map((_, i) => <div key={i} className="h-48 bg-[#1c1c1c] rounded-xl" />)}
      </div>
    </main>
  )
}
