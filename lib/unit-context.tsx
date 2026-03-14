'use client'
import { createContext, useContext, useState, type ReactNode } from 'react'
import type { DistanceUnit } from './utils'

interface UnitContextValue {
  unit: DistanceUnit
  setUnit: (unit: DistanceUnit) => void
}

const UnitContext = createContext<UnitContextValue>({ unit: 'km', setUnit: () => {} })

export function UnitProvider({ unit: initial, children }: { unit: DistanceUnit; children: ReactNode }) {
  const [unit, setUnit] = useState<DistanceUnit>(initial)
  return <UnitContext.Provider value={{ unit, setUnit }}>{children}</UnitContext.Provider>
}

export function useUnit(): UnitContextValue {
  return useContext(UnitContext)
}
