import { describe, expect, it } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useStore } from './useStore'

describe('useStore', () => {
  it('throw when there is no provider above', () => {
    expect(() => renderHook(() => useStore())).toThrow('store missing')
  })
})
