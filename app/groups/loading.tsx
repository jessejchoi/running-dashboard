import Nav from '@/components/Nav'

export default function Loading() {
  return (
    <>
      <Nav />
      <main className="standalone-main max-w-2xl mx-auto px-4 pt-8 sm:pt-20 pb-24 sm:pb-16 animate-pulse">
        <div className="h-10 w-40 bg-[#1c1c1c] rounded-lg mb-6" />
        <div className="h-48 bg-[#1c1c1c] rounded-xl" />
      </main>
    </>
  )
}
