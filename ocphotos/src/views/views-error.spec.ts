import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import type { Component } from 'vue'
import { errorMessage, type Photo } from '../composables/usePhotoLibrary'
import AlbumsView from './AlbumsView.vue'
import ArchiveView from './ArchiveView.vue'
import DuplicatesView from './DuplicatesView.vue'
import ExploreView from './ExploreView.vue'
import FavoritesView from './FavoritesView.vue'
import FoldersView from './FoldersView.vue'
import MapView from './MapView.vue'
import MemoriesView from './MemoriesView.vue'
import PlacesView from './PlacesView.vue'
import TagsView from './TagsView.vue'

const FAILURE = 'GET /api/assets -> 500'

const library = vi.hoisted(() => {
  const boom = () => Promise.reject(new Error('GET /api/assets -> 500'))
  const failing = () => vi.fn<(...args: unknown[]) => Promise<unknown>>(boom)
  return {
    previews: { value: {} },
    fetchTags: failing(),
    fetchAlbums: failing(),
    fetchArchived: failing(),
    fetchFavorites: failing(),
    fetchDuplicates: failing(),
    fetchFolder: failing(),
    fetchPlaces: failing(),
    fetchOnThisDay: failing(),
    searchAssets: failing(),
    tagAssets: failing(),
    albumAssets: failing(),
    createAlbum: failing(),
    renameAlbum: failing(),
    deleteAlbum: failing(),
    removeFromAlbum: failing(),
    setArchived: failing(),
    ensurePreview: vi.fn(() => Promise.resolve()),
    ensureOriginal: vi.fn(() => Promise.resolve())
  }
})

vi.mock('../composables/usePhotoLibrary', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../composables/usePhotoLibrary')>()
  return {
    ...actual,
    usePhotoLibrary: () => library as unknown as ReturnType<typeof actual.usePhotoLibrary>
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

const mountView = (component: Component) =>
  mount(component, {
    global: {
      mocks: { $gettext: (message: string) => message },
      stubs: { RouterLink: true, 'oc-icon': true, ViewerOverlay: true }
    }
  })

describe('views when the initial load fails', () => {
  it('shows the failure in the albums view instead of the empty state', async () => {
    const wrapper = mountView(AlbumsView)
    await flush()
    expect(wrapper.find('.albums-error').text()).toBe(FAILURE)
    expect(wrapper.text()).not.toContain('No albums yet')
  })

  it('shows the failure in the archive view instead of the empty state', async () => {
    const wrapper = mountView(ArchiveView)
    await flush()
    expect(wrapper.find('.arch-error').text()).toBe(FAILURE)
    expect(wrapper.text()).not.toContain('Nothing archived')
  })

  it('shows the failure in the duplicates view instead of the empty state', async () => {
    const wrapper = mountView(DuplicatesView)
    await flush()
    expect(wrapper.find('.dup-error').text()).toBe(FAILURE)
    expect(wrapper.text()).not.toContain('No duplicates found')
  })

  it('shows the failure in the favorites view instead of the empty state', async () => {
    const wrapper = mountView(FavoritesView)
    await flush()
    expect(wrapper.find('.fav-error').text()).toBe(FAILURE)
    expect(wrapper.text()).not.toContain('No favorites yet')
  })

  it('shows the failure in the folders view instead of an empty folder', async () => {
    const wrapper = mountView(FoldersView)
    await flush()
    expect(wrapper.find('.folders-error').text()).toBe(FAILURE)
    expect(wrapper.text()).not.toContain('No photos in this folder')
  })

  it('shows the failure in the map view instead of the empty state', async () => {
    const wrapper = mountView(MapView)
    await flush()
    expect(wrapper.find('.map-error').text()).toBe(FAILURE)
    expect(wrapper.text()).not.toContain('No photos with location data')
  })

  it('shows the failure in the memories view instead of the empty state', async () => {
    const wrapper = mountView(MemoriesView)
    await flush()
    expect(wrapper.find('.memories-error').text()).toBe(FAILURE)
    expect(wrapper.text()).not.toContain('No memories from previous years today')
  })

  it('shows the failure in the places view instead of the empty state', async () => {
    const wrapper = mountView(PlacesView)
    await flush()
    expect(wrapper.find('.places-error').text()).toBe(FAILURE)
  })

  it('shows the failure in the tags view instead of the empty state', async () => {
    const wrapper = mountView(TagsView)
    await flush()
    expect(wrapper.find('.tags-error').text()).toBe(FAILURE)
    expect(wrapper.text()).not.toContain('No tags yet')
  })

  it('shows the failure in the explore view when a search fails', async () => {
    const wrapper = mountView(ExploreView)
    await wrapper.find('input').setValue('playa')
    await wrapper.find('form').trigger('submit')
    await flush()
    expect(wrapper.find('.explore-error').text()).toBe(FAILURE)
    expect(wrapper.text()).not.toContain('No results')
  })
})

describe('views when a follow-up action fails', () => {
  it('keeps the list and reports the failure when opening a tag fails', async () => {
    library.fetchTags.mockResolvedValueOnce([{ name: 'beach', count: 2 }])
    library.tagAssets.mockRejectedValueOnce(new Error('GET /api/tags/beach/assets -> 500'))
    const wrapper = mountView(TagsView)
    await flush()
    await wrapper.find('.tags-chip').trigger('click')
    await flush()
    expect(wrapper.find('.tags-error').text()).toBe('GET /api/tags/beach/assets -> 500')
  })

  it('reports the failure when unarchiving fails', async () => {
    library.fetchArchived.mockResolvedValueOnce([photo(1)])
    library.setArchived.mockRejectedValueOnce(new Error('PATCH /api/assets/1 -> 500'))
    const wrapper = mountView(ArchiveView)
    await flush()
    await wrapper.find('.arch-restore').trigger('click')
    await flush()
    expect(wrapper.find('.arch-error').text()).toBe('PATCH /api/assets/1 -> 500')
  })

  it('reports the failure when opening an album fails', async () => {
    library.fetchAlbums.mockResolvedValueOnce([{ id: 3, name: 'Trips', count: 4 }])
    library.albumAssets.mockRejectedValueOnce(new Error('GET /api/albums/3/assets -> 500'))
    const wrapper = mountView(AlbumsView)
    await flush()
    await wrapper.find('.albums-card').trigger('click')
    await flush()
    expect(wrapper.find('.albums-error').text()).toBe('GET /api/albums/3/assets -> 500')
  })

  it('reports the failure when archiving a duplicate fails', async () => {
    library.fetchDuplicates.mockResolvedValueOnce({ groups: [[photo(1), photo(2)]], pending: 0 })
    library.setArchived.mockRejectedValueOnce(new Error('PATCH /api/assets/1 -> 500'))
    const wrapper = mountView(DuplicatesView)
    await flush()
    await wrapper.find('.dup-arch').trigger('click')
    await flush()
    expect(wrapper.find('.dup-error').text()).toBe('PATCH /api/assets/1 -> 500')
  })
})

describe('errorMessage', () => {
  it('uses the message of an Error', () => {
    expect(errorMessage(new Error(FAILURE))).toBe(FAILURE)
  })

  it('falls back to the string form of anything else', () => {
    expect(errorMessage('plain failure')).toBe('plain failure')
    expect(errorMessage(null)).toBe('null')
  })
})
