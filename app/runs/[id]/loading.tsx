import Nav from '@/components/Nav'

export default function Loading() {
  return (
    <>
      <Nav />
      <main className="standalone-main max-w-4xl mx-auto px-6 pt-8 sm:pt-20 pb-24 sm:pb-16 animate-pulse">
        <div className="h-4 w-20 bg-[#1c1c1c] rounded mb-6" />
        <div className="mb-8">
          <div className="h-10 w-64 bg-[#1c1c1c] rounded-lg mb-2" />
          <div className="h-4 w-40 bg-[#1c1c1c] rounded" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-20 bg-[#1c1c1c] rounded-xl" />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3 mb-8">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="h-20 bg-[#1c1c1c] rounded-xl" />
          ))}
        </div>
        <div className="h-64 bg-[#1c1c1c] rounded-xl mb-6" />
        <div className="h-64 bg-[#1c1c1c] rounded-xl" />
      </main>
    </>
  )
}
