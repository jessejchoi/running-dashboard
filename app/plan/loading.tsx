import Nav from '@/components/Nav'

export default function Loading() {
  return (
    <>
      <Nav />
      <main className="standalone-main max-w-6xl mx-auto px-4 pt-8 sm:pt-20 pb-24 sm:pb-16 animate-pulse">
        <div className="h-10 w-48 bg-[#1c1c1c] rounded-lg mb-2" />
        <div className="h-4 w-56 bg-[#1c1c1c] rounded mb-8" />
        <div className="grid md:grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => <div key={i} className="h-48 bg-[#1c1c1c] rounded-xl" />)}
        </div>
      </main>
    </>
  )
}
