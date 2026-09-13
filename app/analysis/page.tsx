import Link from 'next/link'
import { getAthleteId } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Nav from '@/components/Nav'
import ExpectedEstimates from '@/components/ExpectedEstimates'
import { loadEstimates } from '@/lib/estimates'
export default async function AnalysisPage() {
  const id = await getAthleteId()
  if (!id) redirect('/')
  const bundle = await loadEstimates(Number(id))
  return (
    <>
      <Nav />
      <main className="max-w-6xl mx-auto px-3 sm:px-6 pt-8 sm:pt-20 pb-24">
        <h1 className="font-display uppercase text-3xl font-bold mb-6">
          Race analysis
        </h1>
        <ExpectedEstimates estimates={bundle.estimates} />
        <Link
          className="rd-button inline-flex items-center mt-4"
          href="/analysis/sources"
        >
          Workout source analysis →
        </Link>
      </main>
    </>
  )
}
