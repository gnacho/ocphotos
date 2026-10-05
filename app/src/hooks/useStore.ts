import { createContext, useContext } from 'react'
import type { Store } from '@/lib/store'

export const StoreCtx = createContext<Store | null>(null)

export function useStore() {
  const s = useContext(StoreCtx)
  if (!s) throw new Error('store missing')
  return s
}
