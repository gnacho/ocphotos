import { describe, expect, it, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import type { Component } from 'vue'
import DuplicatesView from './DuplicatesView.vue'
import type { Photo } from '../composables/usePhotoLibrary'

const state = vi.hoisted(() => ({
  previews: { value: {} as Record<string, string> },
  fetchDuplicates: vi.fn(),
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
      fetchDuplicates: state.fetchDuplicates,
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

const mountView = () =>
  mount(DuplicatesView as unknown as Component, {
    global: {
      mocks: { $gettext: gettext },
      stubs: { 'oc-icon': true }
    }
  })

beforeEach(() => {
  state.previews.value = {}
  state.fetchDuplicates.mockReset().mockResolvedValue({
    groups: [
      [photo(1), photo(2)],
      [photo(3), photo(4), photo(5)]
    ],
    pending: 6
  })
  state.setArchived.mockReset().mockResolvedValue(undefined)
  state.ensurePreview.mockReset().mockResolvedValue('')
  state.ensureOriginal.mockReset().mockResolvedValue('')
})

describe('DuplicatesView', () => {
  it('renders the groups with a count and the pending analysis', async () => {
    const wrapper = mountView()
    await flush()

    expect(wrapper.findAll('.dup-group')).toHaveLength(2)
    expect(wrapper.findAll('.dup-cell')).toHaveLength(5)
    expect(wrapper.find('.dup-count').text()).toBe('2 groups')
    expect(wrapper.find('.dup-pending').text()).toBe('6 pending')
  })

  it('uses the singular label for a single group', async () => {
    state.fetchDuplicates.mockResolvedValue({ groups: [[photo(1), photo(2)]], pending: 0 })
    const wrapper = mountView()
    await flush()

    expect(wrapper.find('.dup-count').text()).toBe('1 group')
  })

  it('hides the pending note when there is nothing left to analyze', async () => {
    state.fetchDuplicates.mockResolvedValue({ groups: [[photo(1), photo(2)]], pending: 0 })
    const wrapper = mountView()
    await flush()

    expect(wrapper.find('.dup-pending').exists()).toBe(false)
  })

  it('says so when there is no duplicate', async () => {
    state.fetchDuplicates.mockResolvedValue({ groups: [], pending: 0 })
    const wrapper = mountView()
    await flush()

    expect(wrapper.text()).toContain('No duplicates found')
  })

  it('shows the error when the scan fails', async () => {
    state.fetchDuplicates.mockRejectedValue(new Error('GET /api/duplicates -> 500'))
    const wrapper = mountView()
    await flush()

    expect(wrapper.find('.dup-error').text()).toBe('GET /api/duplicates -> 500')
    expect(wrapper.text()).not.toContain('No duplicates found')
  })

  it('asks for a 400px preview of every photo in the groups', async () => {
    mountView()
    await flush()

    expect(state.ensurePreview).toHaveBeenCalledTimes(5)
    expect(state.ensurePreview).toHaveBeenCalledWith(photo(5), 400)
  })

  it('archives a photo and leaves the rest of its group', async () => {
    const wrapper = mountView()
    await flush()

    await wrapper.findAll('.dup-arch')[3].trigger('click')
    await flush()

    expect(state.setArchived).toHaveBeenCalledWith(4, true)
    expect(wrapper.findAll('.dup-cell')).toHaveLength(4)
    expect(wrapper.findAll('.dup-group')).toHaveLength(2)
  })

  it('drops the group when only one photo would remain', async () => {
    const wrapper = mountView()
    await flush()

    await wrapper.findAll('.dup-arch')[0].trigger('click')
    await flush()

    expect(wrapper.findAll('.dup-group')).toHaveLength(1)
    expect(wrapper.findAll('.dup-cell')).toHaveLength(3)
    expect(wrapper.find('.dup-count').text()).toBe('1 group')
  })

  it('keeps the groups and reports the error when archiving fails', async () => {
    state.setArchived.mockRejectedValue(new Error('POST /api/assets/1/archive -> 500'))
    const wrapper = mountView()
    await flush()

    await wrapper.findAll('.dup-arch')[0].trigger('click')
    await flush()

    expect(wrapper.find('.dup-error').text()).toBe('POST /api/assets/1/archive -> 500')
    expect(wrapper.find('.dup-count').text()).toBe('2 groups')
  })

  it('rescans on demand', async () => {
    const wrapper = mountView()
    await flush()
    state.fetchDuplicates.mockClear()

    await wrapper.find('.dup-btn').trigger('click')
    await flush()

    expect(state.fetchDuplicates).toHaveBeenCalledTimes(1)
  })

  it('opens the viewer at the clicked photo inside its group', async () => {
    const wrapper = mountView()
    await flush()

    await wrapper.findAll('.dup-photo')[3].trigger('click')
    await flush()

    const viewer = wrapper.findComponent({ name: 'ViewerOverlay' })
    expect(viewer.props('index')).toBe(1)
    expect(viewer.props('photos')).toHaveLength(3)
  })

  it('dims a thumbnail that fails to load', async () => {
    const wrapper = mountView()
    await flush()

    const img = wrapper.find('.dup-photo img')
    await img.trigger('error')

    expect((img.element as HTMLImageElement).style.opacity).toBe('0.15')
  })
})
