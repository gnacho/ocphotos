import { describe, expect, it, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import type { Component } from 'vue'
import MemoriesView from './MemoriesView.vue'
import type { Photo } from '../composables/usePhotoLibrary'

const state = vi.hoisted(() => ({
  previews: { value: {} as Record<string, string> },
  fetchOnThisDay: vi.fn(),
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
      fetchOnThisDay: state.fetchOnThisDay,
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

const gettext = (message: string, options?: Record<string, unknown>) =>
  options
    ? message.replace(/%\{(\w+)\}/g, (_, key: string) => String(options[key]))
    : message

vi.mock('vue3-gettext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue3-gettext')>()
  return { ...actual, useGettext: () => ({ $gettext: gettext }) }
})

const flush = async () => {
  await Promise.resolve()
  await new Promise((resolve) => setTimeout(resolve, 0))
}

const yearsBack = (n: number): number => {
  const date = new Date()
  date.setFullYear(date.getFullYear() - n)
  return Math.floor(date.getTime() / 1000)
}

const photo = (id: number, age: number): Photo => ({
  id,
  path: `/Photos/${id}.jpg`,
  name: `${id}.jpg`,
  mediaType: 'image/jpeg',
  isVideo: false,
  takenAt: yearsBack(age),
  width: 4000,
  height: 3000,
  size: 2_000_000,
  favorite: false,
  archived: false
})

const mountView = () =>
  mount(MemoriesView as unknown as Component, {
    global: {
      mocks: { $gettext: gettext },
      stubs: { 'oc-icon': true }
    }
  })

beforeEach(() => {
  state.previews.value = {}
  state.fetchOnThisDay.mockReset().mockResolvedValue([photo(1, 2), photo(2, 2), photo(3, 1)])
  state.ensurePreview.mockReset().mockResolvedValue('')
  state.ensureOriginal.mockReset().mockResolvedValue('')
})

describe('MemoriesView', () => {
  it('groups the photos by year, newest first', async () => {
    const wrapper = mountView()
    await flush()

    const sections = wrapper.findAll('.memories-year')
    expect(sections).toHaveLength(2)
    expect(sections[0].find('.memories-hero img').attributes('alt')).toBe(String(new Date().getFullYear() - 1))
    expect(sections[1].find('.memories-hero img').attributes('alt')).toBe(String(new Date().getFullYear() - 2))
  })

  it('labels each year with how long ago it was and how many photos it has', async () => {
    const wrapper = mountView()
    await flush()

    const labels = wrapper.findAll('.memories-hero-label').map((label) => label.text())
    expect(labels[0]).toBe('1 year ago · 1')
    expect(labels[1]).toBe('2 years ago · 2')
  })

  it('renders the rest of each year as a strip, leaving the hero out', async () => {
    state.fetchOnThisDay.mockResolvedValue([photo(1, 1), photo(2, 1), photo(3, 1)])
    const wrapper = mountView()
    await flush()

    expect(wrapper.findAll('.memories-thumb')).toHaveLength(2)
  })

  it('caps the strip at eight thumbnails', async () => {
    state.fetchOnThisDay.mockResolvedValue(Array.from({ length: 12 }, (_, i) => photo(i + 1, 1)))
    const wrapper = mountView()
    await flush()

    expect(wrapper.findAll('.memories-thumb')).toHaveLength(8)
  })

  it('asks for an 800px preview only for the first nine photos of each year', async () => {
    state.fetchOnThisDay.mockResolvedValue(Array.from({ length: 12 }, (_, i) => photo(i + 1, 1)))
    mountView()
    await flush()

    expect(state.ensurePreview).toHaveBeenCalledTimes(9)
    expect(state.ensurePreview).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }), 800)
    expect(state.ensurePreview).not.toHaveBeenCalledWith(expect.objectContaining({ id: 12 }), 800)
  })

  it('opens the viewer on the hero at the first photo', async () => {
    const wrapper = mountView()
    await flush()

    await wrapper.findAll('.memories-hero')[0].trigger('click')
    await flush()

    const viewer = wrapper.findComponent({ name: 'ViewerOverlay' })
    expect(viewer.props('index')).toBe(0)
    expect(viewer.props('photos')).toHaveLength(1)
  })

  it('opens the viewer on the clicked thumbnail with the position inside the year', async () => {
    state.fetchOnThisDay.mockResolvedValue([photo(1, 1), photo(2, 1), photo(3, 1)])
    const wrapper = mountView()
    await flush()

    await wrapper.findAll('.memories-thumb')[1].trigger('click')
    await flush()

    const viewer = wrapper.findComponent({ name: 'ViewerOverlay' })
    expect(viewer.props('index')).toBe(2)
  })

  it('paints the thumbnails from the preview cache', async () => {
    state.previews.value = { '3|800': 'blob:hero', '2|200': 'blob:thumb' }
    const wrapper = mountView()
    await flush()

    expect(wrapper.find('.memories-hero img').attributes('src')).toBe('blob:hero')
    expect(wrapper.find('.memories-thumb img').attributes('src')).toBe('blob:thumb')
  })

  it('says so when there is nothing from previous years', async () => {
    state.fetchOnThisDay.mockResolvedValue([])
    const wrapper = mountView()
    await flush()

    expect(wrapper.text()).toContain('No memories from previous years today')
    expect(wrapper.findAll('.memories-year')).toHaveLength(0)
  })

  it('shows the error instead of the empty state when the request fails', async () => {
    state.fetchOnThisDay.mockRejectedValue(new Error('GET /api/on-this-day -> 500'))
    const wrapper = mountView()
    await flush()

    expect(wrapper.find('.memories-error').text()).toBe('GET /api/on-this-day -> 500')
    expect(wrapper.text()).not.toContain('No memories from previous years today')
  })
})
