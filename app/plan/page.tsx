import { getAthleteId } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Nav from '@/components/Nav'
import DurablePlan from '@/components/DurablePlan'
import { loadPlan } from '@/lib/planService'
export default async function PlanPage() {
  const id = await getAthleteId()
  if (!id) redirect('/')
  return (
    <>
      <Nav />
      <main className="max-w-6xl mx-auto px-3 sm:px-6 pt-8 sm:pt-20 pb-24">
        <h1 className="font-display uppercase text-3xl font-bold mb-6">
          Your training plan
        </h1>
        <DurablePlan initial={await loadPlan(Number(id))} />
      </main>
    </>
  )
}
