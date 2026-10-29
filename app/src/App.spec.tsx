import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import type { ReactNode } from 'react'
import type { View } from '@/lib/types'

const h = vi.hoisted(() => ({ view: 'fotos' as View }))

vi.mock('@/hooks/useStore', () => ({ useStore: () => h }))
vi.mock('@/lib/store', () => ({ StoreProvider: ({ children }: { children: ReactNode }) => <>{children}</> }))
vi.mock('@/components/Shell', () => ({
  default: ({ children }: { children: ReactNode }) => <div data-testid="shell">{children}</div>,
}))
vi.mock('@/components/Timeline', () => ({ default: () => <div>vista timeline</div> }))
vi.mock('@/components/Viewer', () => ({ default: () => <div>vista visor</div> }))
vi.mock('@/components/MapView', () => ({ default: () => <div>vista mapa</div> }))
vi.mock('@/components/Views', () => ({
  Recuerdos: () => <div>vista recuerdos</div>,
  Personas: () => <div>vista personas</div>,
  Albums: () => <div>vista albums</div>,
  Carpetas: () => <div>vista carpetas</div>,
  Favoritos: () => <div>vista favoritos</div>,
}))

import App from './App'

beforeEach(() => {
  h.view = 'fotos'
})

afterEach(() => {
  cleanup()
})

describe('App', () => {
  it('monta el shell con el visor siempre disponible', () => {
    const { container } = render(<App />)
    expect(container.querySelector('[data-testid="shell"]')).toBeTruthy()
    expect(container.textContent).toContain('vista visor')
  })

  const cases: [View, string][] = [
    ['fotos', 'vista timeline'],
    ['recuerdos', 'vista recuerdos'],
    ['personas', 'vista personas'],
    ['albums', 'vista albums'],
    ['mapa', 'vista mapa'],
    ['carpetas', 'vista carpetas'],
    ['favoritos', 'vista favoritos'],
  ]

  for (const [view, expected] of cases) {
    it(`pinta ${expected} cuando la vista es ${view}`, () => {
      h.view = view
      const { container } = render(<App />)
      expect(container.textContent).toContain(expected)
      const others = cases.filter(([v]) => v !== view).map(([, e]) => e)
      for (const other of others) expect(container.textContent).not.toContain(other)
    })
  }

  it('no pinta ninguna vista de contenido cuando la vista no la tiene', () => {
    h.view = 'archivo'
    const { container } = render(<App />)
    for (const [, expected] of cases) expect(container.textContent).not.toContain(expected)
    expect(container.textContent).toContain('vista visor')
  })
})
