import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import type { PhotoAsset } from '@/lib/types'

const h = vi.hoisted(() => ({ store: {} as Record<string, unknown> }))

vi.mock('@/hooks/useStore', () => ({ useStore: () => h.store }))

interface MarkerStub {
  latlng: number[]
  iconHtml?: string
  tooltip?: string
  click?: () => void
  on(_event: string, cb: () => void): MarkerStub
  bindTooltip(text: string): MarkerStub
}

const L = vi.hoisted(() => {
  const state = {
    maps: [] as { options: Record<string, unknown>; fitBounds: (b: unknown) => void; remove: () => void }[],
    tiles: [] as { url: string; removed: boolean }[],
    markers: [] as MarkerStub[],
    layerClears: 0,
  }

  function marker(latlng: number[], opts: { icon: { html: string } }): MarkerStub {
    const m: MarkerStub = {
      latlng,
      iconHtml: opts.icon.html,
      on(_event, cb) {
        m.click = cb
        return m
      },
      bindTooltip(text) {
        m.tooltip = text
        return m
      },
    }
    state.markers.push(m)
    return m
  }

  const api = {
    map(_el: HTMLElement, options: Record<string, unknown>) {
      const instance = {
        options,
        fitBounds: vi.fn(),
        remove: vi.fn(),
      }
      state.maps.push(instance)
      return instance
    },
    tileLayer(url: string) {
      const layer = {
        url,
        removed: false,
        addTo() {
          return layer
        },
        remove() {
          layer.removed = true
        },
      }
      state.tiles.push(layer)
      return layer
    },
    layerGroup() {
      const group = {
        addTo() {
          return group
        },
        clearLayers: vi.fn(() => {
          state.layerClears += 1
        }),
        addLayer: vi.fn(),
      }
      return group
    },
    marker,
    divIcon(opts: { html: string }) {
      return opts
    },
    latLngBounds(bounds: number[][]) {
      return {
        bounds,
        pad() {
          return this
        },
      }
    },
  }

  return { api, state }
})

vi.mock('leaflet', () => ({ default: L.api }))

import MapView from './MapView'

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

function store(over: Record<string, unknown> = {}) {
  return {
    filteredAssets: [] as PhotoAsset[],
    openViewer: vi.fn(),
    mode: 'demo',
    serviceToken: '',
    ...over,
  }
}

beforeEach(() => {
  h.store = store()
  L.state.maps.length = 0
  L.state.tiles.length = 0
  L.state.markers.length = 0
  L.state.layerClears = 0
  document.documentElement.className = ''
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('MapView', () => {
  it('crea el mapa y carga las teselas claras por defecto', () => {
    render(<MapView />)
    expect(L.state.maps).toHaveLength(1)
    expect(L.state.maps[0].options).toMatchObject({ center: [35, 0], zoom: 2 })
    expect(L.state.tiles[0].url).toContain('light_all')
  })

  it('usa las teselas oscuras si el documento está en modo oscuro', () => {
    document.documentElement.classList.add('dark')
    render(<MapView />)
    expect(L.state.tiles[0].url).toContain('dark_all')
  })

  it('cambia las teselas cuando cambia el tema', () => {
    render(<MapView />)
    window.dispatchEvent(new CustomEvent('ocm-theme', { detail: 'dark' }))
    expect(L.state.tiles).toHaveLength(2)
    expect(L.state.tiles[0].removed).toBe(true)
    expect(L.state.tiles[1].url).toContain('dark_all')
  })

  it('cuenta las fotos con ubicación', () => {
    h.store = store({
      filteredAssets: [photo('a', { lat: 42.2, lon: -8.7 }), photo('b'), photo('c', { lat: 43.3, lon: -8.1 })],
    })
    render(<MapView />)
    expect(screen.getByText(/2 fotos con ubicación/)).toBeTruthy()
  })

  it('pone un marcador por foto con coordenadas, con su miniatura y su tooltip', () => {
    h.store = store({
      filteredAssets: [photo('a', { lat: 42.2, lon: -8.7, place: 'Vigo' }), photo('b', { lat: 43.3, lon: -8.1 })],
    })
    render(<MapView />)
    expect(L.state.markers).toHaveLength(2)
    expect(L.state.markers[0].latlng).toEqual([42.2, -8.7])
    expect(L.state.markers[0].tooltip).toBe('Vigo')
    expect(L.state.markers[1].tooltip).toBe('b.jpg')
    expect(L.state.markers[0].iconHtml).toContain('/thumb/a')
  })

  it('no pone marcador para las fotos sin coordenadas', () => {
    h.store = store({ filteredAssets: [photo('a'), photo('b')] })
    render(<MapView />)
    expect(L.state.markers).toHaveLength(0)
  })

  it('abre el visor al pulsar un marcador', () => {
    const openViewer = vi.fn()
    h.store = store({
      openViewer,
      filteredAssets: [photo('a', { lat: 42.2, lon: -8.7 }), photo('b'), photo('c', { lat: 43.3, lon: -8.1 })],
    })
    render(<MapView />)
    L.state.markers[1].click!()
    const [list, index] = openViewer.mock.calls[0]
    expect(list.map((p: PhotoAsset) => p.id)).toEqual(['a', 'c'])
    expect(index).toBe(1)
  })

  it('ajusta la vista solo cuando hay más de una coordenada', () => {
    h.store = store({ filteredAssets: [photo('a', { lat: 42.2, lon: -8.7 })] })
    const single = render(<MapView />)
    expect(L.state.maps[0].fitBounds).not.toHaveBeenCalled()
    single.unmount()

    h.store = store({
      filteredAssets: [photo('a', { lat: 42.2, lon: -8.7 }), photo('b', { lat: 43.3, lon: -8.1 })],
    })
    render(<MapView />)
    expect(L.state.maps[1].fitBounds).toHaveBeenCalledTimes(1)
  })

  it('pide las coordenadas al servicio en modo producción', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            assets: [{ id: 5, path: '/Fotos/g.jpg', filename: 'g.jpg', takenAt: 1700000000, lat: 42.5, lon: -8.9, place: 'Santiago' }],
          }),
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    h.store = store({ mode: 'service', serviceToken: 'tok' })
    render(<MapView />)

    await waitFor(() => expect(L.state.markers).toHaveLength(1))
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/geo')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok')
    expect(L.state.markers[0].tooltip).toBe('Santiago')
    expect(L.state.markers[0].iconHtml).toContain('/api/assets/5/thumb?w=100?token=tok')
  })

  it('destruye el mapa y deja de escuchar el tema al desmontarse', () => {
    const { unmount } = render(<MapView />)
    unmount()
    expect(L.state.maps[0].remove).toHaveBeenCalledTimes(1)

    window.dispatchEvent(new CustomEvent('ocm-theme', { detail: 'dark' }))
    expect(L.state.tiles).toHaveLength(1)
  })

  it('limpia las capas antes de repintar los marcadores', () => {
    h.store = store({ filteredAssets: [photo('a', { lat: 42.2, lon: -8.7 })] })
    render(<MapView />)
    expect(L.state.layerClears).toBeGreaterThanOrEqual(1)
  })

  it('se queda sin marcadores si el servicio falla', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: false })))
    h.store = store({ mode: 'service' })
    render(<MapView />)
    await waitFor(() => expect(screen.getByText(/0 fotos con ubicación/)).toBeTruthy())
    expect(L.state.markers).toHaveLength(0)
  })

  it('vuelve a los assets locales al salir del modo servicio', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ assets: [{ id: 5, path: '/g.jpg', filename: 'g.jpg', takenAt: 1, lat: 1, lon: 1 }] }),
        }),
      ),
    )
    h.store = store({ mode: 'service' })
    const { rerender } = render(<MapView />)
    await waitFor(() => expect(L.state.markers).toHaveLength(1))

    h.store = store({ mode: 'demo', filteredAssets: [photo('local', { lat: 42.2, lon: -8.7 })] })
    rerender(<MapView />)
    await waitFor(() => expect(L.state.markers).toHaveLength(2))
    expect(L.state.markers[1].tooltip).toBe('local.jpg')
  })
})
