import { describe, expect, it, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import type { Component } from 'vue'
import ArchiveView from './ArchiveView.vue'
import type { Photo } from '../composables/usePhotoLibrary'

const state = vi.hoisted(() => ({
  previews: { value: {} as Record<string, string> },
  fetchArchived: vi.fn(),
  setArchived: vi.fn(),
  ensurePreview: vi.fn(),
  ensureOriginal: vi.fn(),
  toggleFavorite: vi.fn(),
  assetTags: vi.fn(),
  addTag: vi.fn(),
  removeTag: vi.fn(),
  videoUrl: vi.fn()
}))

vi.mock('../composables/usePhotoLibrary', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../composables/usePhotoLibrary')>()
  return {
    ...actual,
    usePhotoLibrary: () => ({
      previews: state.previews,
      fetchArchived: state.fetchArchived,
      setArchived: state.setArchived,
      ensurePreview: state.ensurePreview,
      ensureOriginal: state.ensureOriginal,
      toggleFavorite: state.toggleFavorite,
      assetTags: state.assetTags,
      addTag: state.addTag,
      removeTag: state.removeTag,
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
  archived: true
})

const mountView = () =>
  mount(ArchiveView as unknown as Component, {
    global: {
      mocks: { $gettext: (message: string) => message },
      stubs: { 'oc-icon': true }
    }
  })

beforeEach(() => {
  state.previews.value = {}
  state.fetchArchived.mockReset().mockResolvedValue([photo(1), photo(2)])
  state.setArchived.mockReset().mockResolvedValue(undefined)
  state.ensurePreview.mockReset().mockResolvedValue('')
  state.ensureOriginal.mockReset().mockResolvedValue('')
})

describe('ArchiveView', () => {
  it('lists the archived photos with a count', async () => {
    const wrapper = mountView()
    await flush()

    expect(wrapper.find('.arch-count').text()).toBe('2 items')
    expect(wrapper.findAll('.arch-cell')).toHaveLength(2)
  })

  it('uses the singular label for a single photo', async () => {
    state.fetchArchived.mockResolvedValue([photo(1)])
    const wrapper = mountView()
    await flush()

    expect(wrapper.find('.arch-count').text()).toBe('1 item')
  })

  it('asks for a 400px preview of every archived photo', async () => {
    mountView()
    await flush()

    expect(state.ensurePreview).toHaveBeenCalledTimes(2)
    expect(state.ensurePreview).toHaveBeenCalledWith(photo(2), 400)
  })

  it('says so when nothing is archived', async () => {
    state.fetchArchived.mockResolvedValue([])
    const wrapper = mountView()
    await flush()

    expect(wrapper.text()).toContain('Nothing archived')
  })

  it('shows the error instead of the empty state when the load fails', async () => {
    state.fetchArchived.mockRejectedValue(new Error('GET /api/assets -> 500'))
    const wrapper = mountView()
    await flush()

    expect(wrapper.find('.arch-error').text()).toBe('GET /api/assets -> 500')
    expect(wrapper.text()).not.toContain('Nothing archived')
  })

  it('restores a photo and drops it from the list', async () => {
    const wrapper = mountView()
    await flush()

    await wrapper.findAll('.arch-restore')[0].trigger('click')
    await flush()

    expect(state.setArchived).toHaveBeenCalledWith(1, false)
    expect(wrapper.findAll('.arch-cell')).toHaveLength(1)
    expect(wrapper.find('.arch-count').text()).toBe('1 item')
  })

  it('keeps the photo and reports the error when restoring fails', async () => {
    state.setArchived.mockRejectedValue(new Error('POST /api/assets/1/archive -> 500'))
    const wrapper = mountView()
    await flush()

    await wrapper.findAll('.arch-restore')[0].trigger('click')
    await flush()

    expect(wrapper.find('.arch-error').text()).toBe('POST /api/assets/1/archive -> 500')
    expect(wrapper.find('.arch-count').text()).toBe('2 items')
  })

  it('opens the viewer at the clicked photo', async () => {
    const wrapper = mountView()
    await flush()

    await wrapper.findAll('.arch-photo')[1].trigger('click')
    await flush()

    const viewer = wrapper.findComponent({ name: 'ViewerOverlay' })
    expect(viewer.props('index')).toBe(1)
    expect(viewer.props('photos')).toHaveLength(2)
  })

  it('dims a thumbnail that fails to load', async () => {
    const wrapper = mountView()
    await flush()

    const img = wrapper.find('.arch-photo img')
    await img.trigger('error')

    expect((img.element as HTMLImageElement).style.opacity).toBe('0.15')
  })
})
