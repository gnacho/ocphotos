import { describe, expect, it, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import type { Component } from 'vue'
import MapView from './MapView.vue'
import type { Photo, Place } from '../composables/usePhotoLibrary'

type Marker = { title: string; html: string; click: (() => Promise<void>) | null }

type MarkerChain = {
  addTo: () => MarkerChain
  on: (event: string, handler: () => Promise<void>) => MarkerChain
}

const leaflet = vi.hoisted(() => {
  const markers: Marker[] = []
  const mapInstance = { fitBounds: vi.fn(), setView: vi.fn(), remove: vi.fn() }

  const marker = (
    ll: { lat: number; lng: number },
    opts: { title: string; icon: { html: string } }
  ): MarkerChain => {
    const entry: Marker = { title: opts.title, html: opts.icon.html, click: null }
    markers.push(entry)
    const chain: MarkerChain = {
      addTo: () => chain,
      on: (event: string, handler: () => Promise<void>): MarkerChain => {
        if (event === 'click') entry.click = handler
        return chain
      }
    }
    void ll
    return chain
  }

  const bounds = (initial: unknown[]) => {
    void initial
    let valid = false
    return {
      extend: (ll: { lat: number; lng: number }): void => {
        if (Number.isFinite(ll.lat) && Number.isFinite(ll.lng)) valid = true
        return undefined
      },
      isValid: () => valid
    }
  }

  const L = {
    map: vi.fn(() => mapInstance),
    tileLayer: vi.fn(() => ({ addTo: (): undefined => undefined })),
    latLngBounds: vi.fn(bounds),
    latLng: vi.fn((lat: number, lng: number) => ({ lat, lng })),
    divIcon: vi.fn((opts: { html: string }) => ({ html: opts.html })),
    marker: vi.fn(marker)
  }

  return { L, markers, mapInstance }
})

vi.mock('leaflet', () => ({ default: leaflet.L }))

const state = vi.hoisted(() => ({
  previews: { value: {} as Record<string, string> },
  fetchPlaces: vi.fn(),
  placeAssets: vi.fn(),
  ensurePreview: vi.fn(),
  ensureOriginal: vi.fn(),
  toggleFavorite: vi.fn(),
  assetTags: vi.fn(),
  addTag: vi.fn(),
  removeTag: vi.fn(),
  setArchived: vi.fn(),
  videoUrl: vi.fn()
}))

vi.mock('../composables/usePhotoLibrary', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../composables/usePhotoLibrary')>()
  return {
    ...actual,
    usePhotoLibrary: () => ({
      previews: state.previews,
      fetchPlaces: state.fetchPlaces,
      placeAssets: state.placeAssets,
      ensurePreview: state.ensurePreview,
      ensureOriginal: state.ensureOriginal,
      toggleFavorite: state.toggleFavorite,
      assetTags: state.assetTags,
      addTag: state.addTag,
      removeTag: state.removeTag,
      setArchived: state.setArchived,
      videoUrl: state.videoUrl
    })
  }
})

vi.mock('vue3-gettext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue3-gettext')>()
  return { ...actual, useGettext: () => ({ $gettext: (message: string) => message }) }
})

const flush = async () => {
  await Promise.resolve()
  await new Promise((resolve) => setTimeout(resolve, 0))
}

const photo = (id: number): Photo => ({
  id,
  path: `/Photos/${id}.jpg`,
  name: `${id}.jpg`,
  mediaType: 'image/jpeg',
  isVideo: false,
  takenAt: 1700000000 + id,
  width: 4000,
  height: 3000,
  size: 2_000_000,
  favorite: false,
  archived: false
})

const place = (lat: number, lon: number, count: number, name?: string, coverId = 0): Place => ({
  lat,
  lon,
  count,
  coverId,
  name
})

const mountView = () =>
  mount(MapView as unknown as Component, {
    global: {
      mocks: { $gettext: (message: string) => message },
      stubs: { 'oc-icon': true }
    }
  })

beforeEach(() => {
  leaflet.markers.length = 0
  leaflet.L.map.mockClear()
  leaflet.L.marker.mockClear()
  leaflet.L.tileLayer.mockClear()
  leaflet.mapInstance.fitBounds.mockClear()
  leaflet.mapInstance.setView.mockClear()
  leaflet.mapInstance.remove.mockClear()
  state.previews.value = {}
  state.fetchPlaces.mockReset().mockResolvedValue([
    place(43.301, -8.099, 9, 'A Coruña', 5),
    place(43.4, -8.2, 1)
  ])
  state.placeAssets.mockReset().mockResolvedValue([photo(5), photo(6)])
  state.ensurePreview.mockReset().mockResolvedValue('')
  state.ensureOriginal.mockReset().mockResolvedValue('')
})

describe('MapView', () => {
  it('counts the places in the toolbar', async () => {
    const wrapper = mountView()
    await flush()

    expect(wrapper.find('.map-count').text()).toBe('2 places')
  })

  it('says so when no photo has a location', async () => {
    state.fetchPlaces.mockResolvedValue([])
    const wrapper = mountView()
    await flush()

    expect(wrapper.text()).toContain('No photos with location data')
    expect(leaflet.L.map).not.toHaveBeenCalled()
  })

  it('creates the map and the tile layer', async () => {
    mountView()
    await flush()

    expect(leaflet.L.map).toHaveBeenCalledTimes(1)
    expect(leaflet.L.tileLayer).toHaveBeenCalledWith(
      'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      expect.objectContaining({ maxZoom: 19 })
    )
  })

  it('builds a marker per place with its title and the count badge', async () => {
    mountView()
    await flush()

    expect(leaflet.markers).toHaveLength(2)
    expect(leaflet.markers[0].title).toBe('A Coruña')
    expect(leaflet.markers[1].title).toBe('43.40, -8.20')
    expect(leaflet.markers[0].html).toContain('map-pin-count')
    expect(leaflet.markers[0].html).toContain('9')
    expect(leaflet.markers[1].html).not.toContain('map-pin-count')
  })

  it('puts the cover thumbnail inside the pin', async () => {
    state.previews.value = { '5|400': 'blob:cover' }
    mountView()
    await flush()

    expect(leaflet.markers[0].html).toContain('blob:cover')
    expect(leaflet.markers[1].html).not.toContain('<img')
  })

  it('waits for the covers before drawing the markers', async () => {
    mountView()
    await flush()

    expect(state.ensurePreview).toHaveBeenCalledWith({ id: 5 }, 400)
  })

  it('fits the bounds of the places', async () => {
    mountView()
    await flush()

    expect(leaflet.mapInstance.fitBounds).toHaveBeenCalledTimes(1)
    expect(leaflet.mapInstance.setView).not.toHaveBeenCalled()
  })

  it('falls back to a world view when the coordinates are unusable', async () => {
    state.fetchPlaces.mockResolvedValue([place(Number.NaN, Number.NaN, 1, 'Rota')])
    mountView()
    await flush()

    expect(leaflet.mapInstance.setView).toHaveBeenCalledWith([40.4, -3.7], 5)
    expect(leaflet.mapInstance.fitBounds).not.toHaveBeenCalled()
  })

  it('opens the viewer when a marker is clicked', async () => {
    const wrapper = mountView()
    await flush()

    const click = leaflet.markers[0].click
    expect(typeof click).toBe('function')
    await click!()
    await flush()

    expect(state.placeAssets).toHaveBeenCalledWith(43.301, -8.099)
    const viewer = wrapper.findComponent({ name: 'ViewerOverlay' })
    expect(viewer.props('photos')).toHaveLength(2)
    expect(viewer.props('index')).toBe(0)
  })

  it('does not open the viewer when the place has no photos', async () => {
    state.placeAssets.mockResolvedValue([])
    const wrapper = mountView()
    await flush()

    await leaflet.markers[0].click!()
    await flush()

    expect(wrapper.findComponent({ name: 'ViewerOverlay' }).exists()).toBe(false)
  })

  it('reports a failure when the place cannot be loaded', async () => {
    state.placeAssets.mockRejectedValue(new Error('GET /api/assets -> 500'))
    const wrapper = mountView()
    await flush()

    await leaflet.markers[0].click!()
    await flush()

    expect(wrapper.find('.map-error').text()).toBe('GET /api/assets -> 500')
  })

  it('removes the map when the view goes away', async () => {
    const wrapper = mountView()
    await flush()

    wrapper.unmount()

    expect(leaflet.mapInstance.remove).toHaveBeenCalledTimes(1)
  })
})
