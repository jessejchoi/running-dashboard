import Nav from '@/components/Nav'

export default function Loading() {
  return (
    <>
      <Nav />
      <main className="standalone-main max-w-6xl mx-auto px-3 sm:px-6 pt-8 sm:pt-20 pb-24 sm:pb-16 animate-pulse">
        <div className="mb-8">
          <div className="h-10 w-48 bg-[#1c1c1c] rounded-lg mb-2" />
          <div className="h-4 w-24 bg-[#1c1c1c] rounded" />
        </div>
        <div className="card p-0 overflow-hidden">
          <div className="bg-[#1c1c1c] rounded-xl h-[500px]" />
        </div>
      </main>
    </>
  )
}
