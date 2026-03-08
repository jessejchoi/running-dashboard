export default function Loading() {
  return (
    <main className="max-w-full mx-auto px-6 pt-14 sm:pt-24 pb-16 animate-pulse">
      <div className="h-8 w-40 bg-[#1c1c1c] rounded-lg mb-6" />
      <div className="grid md:grid-cols-2 gap-4">
        {[...Array(4)].map((_, i) => <div key={i} className="h-64 bg-[#1c1c1c] rounded-xl" />)}
      </div>
    </main>
  )
}
