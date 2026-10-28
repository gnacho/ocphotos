import { describe, expect, it, vi, beforeEach } from 'vitest'
import { mount, RouterLinkStub } from '@vue/test-utils'
import type { Component } from 'vue'
import ExploreView from './ExploreView.vue'
import type { Photo } from '../composables/usePhotoLibrary'

const state = vi.hoisted(() => ({
  previews: { value: {} as Record<string, string> },
  searchAssets: vi.fn(),
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
      searchAssets: state.searchAssets,
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
  favorite: false,
  archived: false,
  ...over
})

const mountView = () =>
  mount(ExploreView as unknown as Component, {
    global: {
      mocks: { $gettext: (message: string) => message },
      stubs: { 'oc-icon': true, RouterLink: RouterLinkStub }
    }
  })

const search = async (wrapper: ReturnType<typeof mountView>, query: string) => {
  await wrapper.find('.explore-input').setValue(query)
  await wrapper.find('form').trigger('submit')
  await flush()
}

beforeEach(() => {
  state.previews.value = {}
  state.searchAssets.mockReset().mockResolvedValue([photo(1), photo(2, { isVideo: true })])
  state.ensurePreview.mockReset().mockResolvedValue('')
  state.ensureOriginal.mockReset().mockResolvedValue('')
})

describe('ExploreView', () => {
  it('offers the four quick links', () => {
    const wrapper = mountView()
    const links = wrapper.findAllComponents(RouterLinkStub)

    expect(links.map((link) => link.props('to'))).toEqual([
      '/ocphotos/timeline',
      '/ocphotos/memories',
      '/ocphotos/map',
      '/ocphotos/favorites'
    ])
  })

  it('does not search on an empty or blank query', async () => {
    const wrapper = mountView()

    await search(wrapper, '   ')

    expect(state.searchAssets).not.toHaveBeenCalled()
  })

  it('searches with the trimmed text and paints the results', async () => {
    const wrapper = mountView()

    await search(wrapper, '  playa  ')

    expect(state.searchAssets).toHaveBeenCalledWith('playa')
    expect(wrapper.findAll('.explore-cell')).toHaveLength(2)
    expect(wrapper.find('.explore-cell img').attributes('alt')).toBe('1.jpg')
  })

  it('marks videos with a badge', async () => {
    const wrapper = mountView()

    await search(wrapper, 'playa')

    expect(wrapper.findAll('.explore-badge')).toHaveLength(1)
  })

  it('asks for a 400px preview of every result', async () => {
    const wrapper = mountView()

    await search(wrapper, 'playa')

    expect(state.ensurePreview).toHaveBeenCalledTimes(2)
    expect(state.ensurePreview).toHaveBeenCalledWith(photo(1), 400)
  })

  it('says there are no results only after a search', async () => {
    state.searchAssets.mockResolvedValue([])
    const wrapper = mountView()

    expect(wrapper.text()).not.toContain('No results')

    await search(wrapper, 'nada')

    expect(wrapper.text()).toContain('No results')
  })

  it('shows the error and drops the results when the search fails', async () => {
    state.searchAssets.mockRejectedValue(new Error('GET /api/assets -> 500'))
    const wrapper = mountView()

    await search(wrapper, 'playa')

    expect(wrapper.find('.explore-error').text()).toBe('GET /api/assets -> 500')
    expect(wrapper.findAll('.explore-cell')).toHaveLength(0)
  })

  it('opens the viewer at the clicked result', async () => {
    const wrapper = mountView()
    await search(wrapper, 'playa')

    await wrapper.findAll('.explore-cell')[1].trigger('click')
    await flush()

    const viewer = wrapper.findComponent({ name: 'ViewerOverlay' })
    expect(viewer.props('index')).toBe(1)
    expect(viewer.props('photos')).toHaveLength(2)
  })

  it('dims a thumbnail that fails to load', async () => {
    const wrapper = mountView()
    await search(wrapper, 'playa')

    const img = wrapper.find('.explore-cell img')
    await img.trigger('error')

    expect((img.element as HTMLImageElement).style.opacity).toBe('0.15')
  })
})
