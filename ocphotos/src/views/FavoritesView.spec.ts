import { describe, expect, it, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import type { Component } from 'vue'
import FavoritesView from './FavoritesView.vue'
import type { Photo } from '../composables/usePhotoLibrary'

const state = vi.hoisted(() => ({
  previews: { value: {} as Record<string, string> },
  fetchFavorites: vi.fn(),
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
      fetchFavorites: state.fetchFavorites,
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

const photo = (id: number, over: Partial<Photo> = {}): Photo => ({
  id,
  path: `/Photos/${id}.jpg`,
  name: `${id}.jpg`,
  mediaType: 'image/jpeg',
  isVideo: false,
  takenAt: 1700000000 + id,
  width: 4000,
  height: 3000,
  size: 2_000_000,
  favorite: true,
  archived: false,
  ...over
})

const mountView = () =>
  mount(FavoritesView as unknown as Component, {
    global: {
      mocks: { $gettext: (message: string) => message },
      stubs: { 'oc-icon': true }
    }
  })

beforeEach(() => {
  state.previews.value = {}
  state.fetchFavorites.mockReset().mockResolvedValue([photo(1), photo(2, { isVideo: true })])
  state.ensurePreview.mockReset().mockResolvedValue('')
  state.ensureOriginal.mockReset().mockResolvedValue('')
})

describe('FavoritesView', () => {
  it('lists the favorites with a count', async () => {
    const wrapper = mountView()
    await flush()

    expect(wrapper.find('.fav-count').text()).toBe('2 items')
    expect(wrapper.findAll('.fav-cell')).toHaveLength(2)
  })

  it('uses the singular label for one favorite', async () => {
    state.fetchFavorites.mockResolvedValue([photo(1)])
    const wrapper = mountView()
    await flush()

    expect(wrapper.find('.fav-count').text()).toBe('1 item')
  })

  it('marks videos with a badge', async () => {
    const wrapper = mountView()
    await flush()

    expect(wrapper.findAll('.fav-video-badge')).toHaveLength(1)
  })

  it('asks for a 400px preview of every favorite', async () => {
    mountView()
    await flush()

    expect(state.ensurePreview).toHaveBeenCalledTimes(2)
    expect(state.ensurePreview).toHaveBeenCalledWith(photo(1), 400)
  })

  it('paints the thumbnails from the preview cache', async () => {
    state.previews.value = { '1|400': 'blob:one' }
    const wrapper = mountView()
    await flush()

    expect(wrapper.find('.fav-cell img').attributes('src')).toBe('blob:one')
  })

  it('says so when there is no favorite yet', async () => {
    state.fetchFavorites.mockResolvedValue([])
    const wrapper = mountView()
    await flush()

    expect(wrapper.text()).toContain('No favorites yet')
    expect(wrapper.findAll('.fav-cell')).toHaveLength(0)
  })

  it('shows the error instead of the empty state when the request fails', async () => {
    state.fetchFavorites.mockRejectedValue(new Error('GET /api/assets -> 500'))
    const wrapper = mountView()
    await flush()

    expect(wrapper.find('.fav-error').text()).toBe('GET /api/assets -> 500')
    expect(wrapper.text()).not.toContain('No favorites yet')
  })

  it('opens the viewer at the clicked position', async () => {
    const wrapper = mountView()
    await flush()

    await wrapper.findAll('.fav-cell')[1].trigger('click')
    await flush()

    const viewer = wrapper.findComponent({ name: 'ViewerOverlay' })
    expect(viewer.props('index')).toBe(1)
    expect(viewer.props('photos')).toHaveLength(2)
  })

  it('dims a thumbnail that fails to load', async () => {
    const wrapper = mountView()
    await flush()

    const img = wrapper.find('.fav-cell img')
    await img.trigger('error')

    expect((img.element as HTMLImageElement).style.opacity).toBe('0.15')
  })
})
