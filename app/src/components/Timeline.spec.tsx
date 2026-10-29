import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import type { DayBucket, PhotoAsset } from '@/lib/types'

const h = vi.hoisted(() => ({ store: {} as Record<string, unknown> }))

vi.mock('@/hooks/useStore', () => ({ useStore: () => h.store }))

import Timeline from './Timeline'

function photo(id: string, over: Partial<PhotoAsset> = {}): PhotoAsset {
  return {
    id,
    path: `/Fotos/${id}.jpg`,
    filename: `${id}.jpg`,
    takenAt: new Date('2024-06-15T10:00:00Z'),
    width: 1600,
    height: 1200,
    thumbUrl: `/thumb/${id}`,
    fullUrl: `/full/${id}`,
    isVideo: false,
    personIds: [],
    favorite: false,
    ...over,
  }
}

function bucket(key: string, assets: PhotoAsset[]): DayBucket {
  return { key, date: new Date(`${key}T12:00:00Z`), assets }
}

function store(over: Record<string, unknown> = {}) {
  return {
    days: [] as DayBucket[],
    query: '',
    personFilter: null,
    mode: 'demo',
    hasMore: false,
    loadMore: vi.fn(),
    loadingMore: false,
    stats: null,
    openViewer: vi.fn(),
    ...over,
  }
}

beforeEach(() => {
  h.store = store()
  // jsdom no trae IntersectionObserver y el componente lo usa en modo servicio
  vi.stubGlobal('IntersectionObserver', class {
    observe() {}
    disconnect() {}
  })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('Timeline', () => {
  it('invita a conectar cuando no hay días ni filtros', () => {
    render(<Timeline />)
    expect(screen.getByText('Sin resultados')).toBeTruthy()
    expect(screen.getByText('Conecta tu OpenCloud para ver tus fotos')).toBeTruthy()
  })

  it('sugiere otra búsqueda cuando hay texto', () => {
    h.store = store({ query: 'playa' })
    render(<Timeline />)
    expect(screen.getByText('Prueba con otra búsqueda')).toBeTruthy()
  })

  it('sugiere otra búsqueda cuando hay filtro de persona', () => {
    h.store = store({ personFilter: 'p1' })
    render(<Timeline />)
    expect(screen.getByText('Prueba con otra búsqueda')).toBeTruthy()
  })

  it('pinta la cabecera del día con su recuento', () => {
    h.store = store({ days: [bucket('2024-06-15', [photo('a'), photo('b')])] })
    const { container } = render(<Timeline />)
    const heading = container.querySelector('h3')
    expect(heading?.textContent).toContain('15 de junio de 2024')
    expect(heading?.textContent).toContain('2')
  })

  it('cuenta los elementos cargados', () => {
    h.store = store({
      days: [bucket('2024-06-15', [photo('a'), photo('b')]), bucket('2024-06-14', [photo('c')])],
    })
    render(<Timeline />)
    expect(screen.getByText('3 elementos')).toBeTruthy()
  })

  it('suma el total del índice cuando hay estadísticas del servicio', () => {
    h.store = store({
      mode: 'service',
      stats: { assets: 12 },
      days: [bucket('2024-06-15', [photo('a'), photo('b')])],
    })
    render(<Timeline />)
    expect(screen.getByText('12 elementos en el índice · 2 cargados')).toBeTruthy()
  })

  it('abre el visor con la lista del día y la posición pulsada', () => {
    const openViewer = vi.fn()
    h.store = store({ days: [bucket('2024-06-15', [photo('a'), photo('b')])], openViewer })
    render(<Timeline />)
    fireEvent.click(screen.getByAltText('b.jpg'))
    expect(openViewer).toHaveBeenCalledTimes(1)
    const [list, index] = openViewer.mock.calls[0]
    expect(list).toHaveLength(2)
    expect(list[1].id).toBe('b')
    expect(index).toBe(1)
  })

  it('marca los vídeos con su duración', () => {
    h.store = store({
      days: [bucket('2024-06-15', [photo('v', { isVideo: true, duration: '0:12' })])],
    })
    render(<Timeline />)
    expect(screen.getByText('0:12')).toBeTruthy()
  })

  it('marca las fotos favoritas', () => {
    h.store = store({
      days: [bucket('2024-06-15', [photo('a', { favorite: true }), photo('b')])],
    })
    const { container } = render(<Timeline />)
    expect(container.querySelectorAll('svg.fill-rose-500')).toHaveLength(1)
  })

  it('pide más elementos al acercarse al centinela en modo servicio', () => {
    const loadMore = vi.fn()
    const observed: Element[] = []
    let fire: (() => void) | null = null
    vi.stubGlobal('IntersectionObserver', class {
      constructor(cb: (entries: { isIntersecting: boolean }[]) => void, opts: { rootMargin: string }) {
        expect(opts.rootMargin).toBe('1200px')
        fire = () => cb([{ isIntersecting: true }])
      }
      observe(el: Element) {
        observed.push(el)
      }
      disconnect() {}
    })
    h.store = store({ mode: 'service', loadMore, days: [bucket('2024-06-15', [photo('a')])] })
    render(<Timeline />)
    expect(observed).toHaveLength(1)
    fire!()
    expect(loadMore).toHaveBeenCalledTimes(1)
  })

  it('no observa el centinela fuera del modo servicio', () => {
    let constructed = false
    vi.stubGlobal('IntersectionObserver', class {
      constructor() {
        constructed = true
      }
      observe() {}
      disconnect() {}
    })
    h.store = store({ days: [bucket('2024-06-15', [photo('a')])] })
    render(<Timeline />)
    expect(constructed).toBe(false)
  })

  it('anuncia la carga y el final de la librería', () => {
    h.store = store({
      mode: 'service',
      hasMore: true,
      loadingMore: true,
      days: [bucket('2024-06-15', [photo('a')])],
    })
    const { rerender } = render(<Timeline />)
    expect(screen.getByText('Cargando…')).toBeTruthy()

    h.store = store({ mode: 'service', hasMore: false, days: [bucket('2024-06-15', [photo('a')])] })
    rerender(<Timeline />)
    expect(screen.getByText('Fin de la librería')).toBeTruthy()
  })
})
