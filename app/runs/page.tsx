import { getAthleteId } from '@/lib/auth'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import Nav from '@/components/Nav'
import ActivityLog from '@/components/ActivityLog'
import { listRuns } from '@/lib/activityLog'
import { type DistanceUnit } from '@/lib/utils'
export default async function RunsPage() {
  const id = await getAthleteId()
  if (!id) redirect('/')
  const initial = await listRuns(Number(id), new URLSearchParams())
  return (
    <>
      <Nav />
      <main className="max-w-6xl mx-auto px-3 sm:px-6 pt-8 sm:pt-20 pb-24">
        <h1 className="font-display font-bold uppercase text-3xl mb-6">
          Activity log
        </h1>
        <ActivityLog
          initial={initial}
          unit={(cookies().get('unit_pref')?.value ?? 'km') as DistanceUnit}
        />
      </main>
    </>
  )
}
