'use client'
import { createContext, useContext, useState, type ReactNode } from 'react'
import { type DistanceKey } from '@/lib/goals'

const AnalysisTabContext = createContext<{
  active: DistanceKey
  setActive: (key: DistanceKey) => void
}>({ active: '5k', setActive: () => {} })

export function AnalysisTabProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<DistanceKey>('5k')
  return (
    <AnalysisTabContext.Provider value={{ active, setActive }}>
      {children}
    </AnalysisTabContext.Provider>
  )
}

export function useAnalysisTab() {
  return useContext(AnalysisTabContext)
}
