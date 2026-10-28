import { describe, expect, it, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import type { Component } from 'vue'
import TagsView from './TagsView.vue'
import type { Photo } from '../composables/usePhotoLibrary'

const state = vi.hoisted(() => ({
  previews: { value: {} as Record<string, string> },
  fetchTags: vi.fn(),
  tagAssets: vi.fn(),
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
      fetchTags: state.fetchTags,
      tagAssets: state.tagAssets,
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

const mountView = () =>
  mount(TagsView as unknown as Component, {
    global: {
      mocks: { $gettext: (message: string) => message },
      stubs: { 'oc-icon': true }
    }
  })

beforeEach(() => {
  state.previews.value = {}
  state.fetchTags.mockReset().mockResolvedValue([
    { name: 'playa', count: 7 },
    { name: 'viaje', count: 1 }
  ])
  state.tagAssets.mockReset().mockResolvedValue([photo(1), photo(2)])
  state.ensurePreview.mockReset().mockResolvedValue('')
  state.ensureOriginal.mockReset().mockResolvedValue('')
})

describe('TagsView', () => {
  it('lists the tags with their counts', async () => {
    const wrapper = mountView()
    await flush()

    const chips = wrapper.findAll('.tags-chip')
    expect(chips).toHaveLength(2)
    expect(chips[0].find('span').text()).toBe('playa')
    expect(chips[0].find('.tags-chip-count').text()).toBe('7')
    expect(wrapper.find('.tags-count').text()).toBe('2 tags')
  })

  it('uses the singular label for a single tag', async () => {
    state.fetchTags.mockResolvedValue([{ name: 'playa', count: 3 }])
    const wrapper = mountView()
    await flush()

    expect(wrapper.find('.tags-count').text()).toBe('1 tag')
  })

  it('says so when there is no tag yet', async () => {
    state.fetchTags.mockResolvedValue([])
    const wrapper = mountView()
    await flush()

    expect(wrapper.text()).toContain('No tags yet')
  })

  it('shows the error when the tag list fails', async () => {
    state.fetchTags.mockRejectedValue(new Error('GET /api/tags -> 500'))
    const wrapper = mountView()
    await flush()

    expect(wrapper.find('.tags-error').text()).toBe('GET /api/tags -> 500')
  })

  it('opens a tag and shows its photos', async () => {
    const wrapper = mountView()
    await flush()

    await wrapper.findAll('.tags-chip')[0].trigger('click')
    await flush()

    expect(state.tagAssets).toHaveBeenCalledWith('playa')
    expect(wrapper.find('.tags-toolbar h1').text()).toBe('playa')
    expect(wrapper.find('.tags-count').text()).toBe('2 items')
    expect(wrapper.findAll('.tags-photo')).toHaveLength(2)
  })

  it('asks for a 400px preview of the photos of the opened tag', async () => {
    const wrapper = mountView()
    await flush()

    await wrapper.findAll('.tags-chip')[1].trigger('click')
    await flush()

    expect(state.ensurePreview).toHaveBeenCalledTimes(2)
    expect(state.ensurePreview).toHaveBeenCalledWith(photo(1), 400)
  })

  it('goes back to the list of tags', async () => {
    const wrapper = mountView()
    await flush()
    await wrapper.findAll('.tags-chip')[0].trigger('click')
    await flush()

    await wrapper.find('.tags-icon-btn').trigger('click')
    await flush()

    expect(wrapper.find('.tags-toolbar h1').text()).toBe('Tags')
    expect(wrapper.findAll('.tags-chip')).toHaveLength(2)
    expect(wrapper.findAll('.tags-photo')).toHaveLength(0)
  })

  it('keeps the tag selected and reports the error when its photos fail', async () => {
    state.tagAssets.mockRejectedValue(new Error('GET /api/tags/playa/assets -> 500'))
    const wrapper = mountView()
    await flush()

    await wrapper.findAll('.tags-chip')[0].trigger('click')
    await flush()

    expect(wrapper.find('.tags-error').text()).toBe('GET /api/tags/playa/assets -> 500')
    expect(wrapper.find('.tags-toolbar h1').text()).toBe('playa')
    expect(wrapper.findAll('.tags-photo')).toHaveLength(0)
  })

  it('opens the viewer at the clicked photo', async () => {
    const wrapper = mountView()
    await flush()
    await wrapper.findAll('.tags-chip')[0].trigger('click')
    await flush()

    await wrapper.findAll('.tags-photo')[1].trigger('click')
    await flush()

    const viewer = wrapper.findComponent({ name: 'ViewerOverlay' })
    expect(viewer.props('index')).toBe(1)
    expect(viewer.props('photos')).toHaveLength(2)
  })

  it('dims a thumbnail that fails to load', async () => {
    const wrapper = mountView()
    await flush()
    await wrapper.findAll('.tags-chip')[0].trigger('click')
    await flush()

    const img = wrapper.find('.tags-photo img')
    await img.trigger('error')

    expect((img.element as HTMLImageElement).style.opacity).toBe('0.15')
  })
})
