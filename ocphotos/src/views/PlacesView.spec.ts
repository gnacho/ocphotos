import { describe, expect, it, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import type { Component } from 'vue'
import PlacesView from './PlacesView.vue'
import type { Photo, Place } from '../composables/usePhotoLibrary'

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
  mount(PlacesView as unknown as Component, {
    global: {
      mocks: { $gettext: (message: string) => message },
      stubs: { 'oc-icon': true }
    }
  })

beforeEach(() => {
  state.previews.value = {}
  state.fetchPlaces.mockReset().mockResolvedValue([
    place(43.301, -8.099, 9, 'A Coruña', 5),
    place(43.4, -8.2, 1)
  ])
  state.placeAssets.mockReset().mockResolvedValue([photo(5), photo(6)])
  state.ensurePreview.mockReset().mockResolvedValue('')
  state.ensureOriginal.mockReset().mockResolvedValue('')
})

describe('PlacesView', () => {
  it('lists the places with name, count and a fallback to coordinates', async () => {
    const wrapper = mountView()
    await flush()

    expect(wrapper.find('.places-count').text()).toBe('2 places')
    const cards = wrapper.findAll('.places-card')
    expect(cards).toHaveLength(2)
    expect(cards[0].text()).toContain('A Coruña')
    expect(cards[0].text()).toContain('9')
    expect(cards[1].text()).toContain('43.40, -8.20')
  })

  it('uses the singular label for a single place', async () => {
    state.fetchPlaces.mockResolvedValue([place(43.3, -8.1, 2, 'Casa')])
    const wrapper = mountView()
    await flush()

    expect(wrapper.find('.places-count').text()).toBe('1 place')
  })

  it('asks for the cover thumbnail of the places that have one', async () => {
    mountView()
    await flush()

    expect(state.ensurePreview).toHaveBeenCalledTimes(1)
    expect(state.ensurePreview).toHaveBeenCalledWith({ id: 5 }, 400)
  })

  it('says so when no photo has a location', async () => {
    state.fetchPlaces.mockResolvedValue([])
    const wrapper = mountView()
    await flush()

    expect(wrapper.text()).toContain('No photos with location data')
  })

  it('opens a place and shows its photos', async () => {
    const wrapper = mountView()
    await flush()

    await wrapper.findAll('.places-card')[0].trigger('click')
    await flush()

    expect(state.placeAssets).toHaveBeenCalledWith(43.301, -8.099)
    expect(wrapper.find('.places-toolbar h1').text()).toBe('A Coruña')
    expect(wrapper.find('.places-count').text()).toBe('2 items')
    expect(wrapper.findAll('.places-photo')).toHaveLength(2)
    expect(state.ensurePreview).toHaveBeenCalledWith(photo(5), 400)
  })

  it('titles an unnamed place with its coordinates', async () => {
    const wrapper = mountView()
    await flush()

    await wrapper.findAll('.places-card')[1].trigger('click')
    await flush()

    expect(wrapper.find('.places-toolbar h1').text()).toBe('43.40, -8.20')
  })

  it('goes back to the list of places', async () => {
    const wrapper = mountView()
    await flush()
    await wrapper.findAll('.places-card')[0].trigger('click')
    await flush()

    await wrapper.find('.places-icon-btn').trigger('click')
    await flush()

    expect(wrapper.find('.places-toolbar h1').text()).toBe('Places')
    expect(wrapper.findAll('.places-card')).toHaveLength(2)
  })

  it('opens the viewer at the clicked photo', async () => {
    const wrapper = mountView()
    await flush()
    await wrapper.findAll('.places-card')[0].trigger('click')
    await flush()

    await wrapper.findAll('.places-photo')[1].trigger('click')
    await flush()

    const viewer = wrapper.findComponent({ name: 'ViewerOverlay' })
    expect(viewer.props('index')).toBe(1)
    expect(viewer.props('photos')).toHaveLength(2)
  })

  it('dims a thumbnail that fails to load', async () => {
    const wrapper = mountView()
    await flush()

    const img = wrapper.find('.places-card img')
    await img.trigger('error')

    expect((img.element as HTMLImageElement).style.opacity).toBe('0.15')
  })
})
