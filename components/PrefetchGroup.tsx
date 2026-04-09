'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/** Silently warms the router cache for the group page on dashboard mount. */
export default function PrefetchGroup({ groupId }: { groupId: string }) {
  const router = useRouter()
  useEffect(() => {
    router.prefetch(`/group/${groupId}`)
  }, [groupId, router])
  return null
}
