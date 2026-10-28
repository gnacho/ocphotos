import { describe, expect, it, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import type { Component } from 'vue'
import FoldersView from './FoldersView.vue'
import type { FolderListing, Photo } from '../composables/usePhotoLibrary'

const state = vi.hoisted(() => ({
  previews: { value: {} as Record<string, string> },
  fetchFolder: vi.fn(),
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
      fetchFolder: state.fetchFolder,
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

const photo = (id: number, isVideo = false): Photo => ({
  id,
  path: `/Photos/${id}${isVideo ? '.mp4' : '.jpg'}`,
  name: `${id}${isVideo ? '.mp4' : '.jpg'}`,
  mediaType: isVideo ? 'video/mp4' : 'image/jpeg',
  isVideo,
  takenAt: 1700000000 + id,
  width: 4000,
  height: 3000,
  size: 2_000_000,
  favorite: false,
  archived: false
})

const listing = (path: string, folders: FolderListing['folders'], assets: Photo[]): FolderListing => ({
  path,
  folders,
  assets
})

const mountView = () =>
  mount(FoldersView as unknown as Component, {
    global: {
      mocks: { $gettext: (message: string) => message },
      stubs: { 'oc-icon': true }
    }
  })

beforeEach(() => {
  state.previews.value = {}
  state.fetchFolder.mockReset().mockResolvedValue(
    listing('', [{ name: 'Fotos', path: 'Fotos', count: 12 }], [photo(1), photo(2, true)])
  )
  state.ensurePreview.mockReset().mockResolvedValue('')
  state.ensureOriginal.mockReset().mockResolvedValue('')
})

describe('FoldersView', () => {
  it('starts at the personal space with the root listing', async () => {
    const wrapper = mountView()
    await flush()

    expect(state.fetchFolder).toHaveBeenCalledWith('')
    expect(wrapper.find('.folders-crumb').text()).toBe('Personal space')
    expect(wrapper.findAll('.folders-crumb')).toHaveLength(1)
  })

  it('shows the subfolders with their name and count', async () => {
    const wrapper = mountView()
    await flush()

    const cards = wrapper.findAll('.folders-card')
    expect(cards).toHaveLength(1)
    expect(cards[0].find('.folders-card-name').text()).toBe('Fotos')
    expect(cards[0].find('.folders-card-count').text()).toBe('12')
    expect(wrapper.text()).toContain('Subfolders')
  })

  it('shows the photos of the folder and marks the videos', async () => {
    const wrapper = mountView()
    await flush()

    expect(wrapper.findAll('.folders-photo')).toHaveLength(2)
    expect(wrapper.findAll('.folders-badge')).toHaveLength(1)
    expect(wrapper.findAll('.folders-photo')[0].find('img').attributes('alt')).toBe('1.jpg')
  })

  it('paints a thumbnail from the preview cache', async () => {
    state.previews.value = { '1|400': 'blob:one' }
    const wrapper = mountView()
    await flush()

    expect(wrapper.find('.folders-photo img').attributes('src')).toBe('blob:one')
  })

  it('asks for the thumbnail of every photo', async () => {
    mountView()
    await flush()

    expect(state.ensurePreview).toHaveBeenCalledTimes(2)
    expect(state.ensurePreview).toHaveBeenCalledWith(photo(1), 400)
  })

  it('navigates into a subfolder and builds the breadcrumbs', async () => {
    state.fetchFolder.mockImplementation((path: string) =>
      Promise.resolve(
        path === ''
          ? listing('', [{ name: 'Fotos', path: 'Fotos', count: 12 }], [])
          : listing(path, [{ name: 'Verano', path: 'Fotos/2024/Verano', count: 3 }], [photo(3)])
      )
    )
    const wrapper = mountView()
    await flush()

    await wrapper.find('.folders-card').trigger('click')
    await flush()

    expect(state.fetchFolder).toHaveBeenLastCalledWith('Fotos')
    const crumbs = wrapper.findAll('.folders-crumb')
    expect(crumbs.map((c) => c.text())).toEqual(['Personal space', 'Fotos'])
    expect(wrapper.find('.folders-card-name').text()).toBe('Verano')
  })

  it('goes back to the personal space from a crumb', async () => {
    const wrapper = mountView()
    await flush()
    await wrapper.find('.folders-card').trigger('click')
    await flush()
    state.fetchFolder.mockClear()

    await wrapper.findAll('.folders-crumb')[0].trigger('click')
    await flush()

    expect(state.fetchFolder).toHaveBeenCalledWith('')
    expect(wrapper.findAll('.folders-crumb')).toHaveLength(1)
  })

  it('jumps to an ancestor from an intermediate crumb', async () => {
    const tree: Record<string, FolderListing> = {
      '': listing('', [{ name: 'Fotos', path: 'Fotos', count: 12 }], []),
      Fotos: listing('Fotos', [{ name: '2024', path: 'Fotos/2024', count: 5 }], []),
      'Fotos/2024': listing('Fotos/2024', [], [photo(4)])
    }
    state.fetchFolder.mockImplementation((path: string) => Promise.resolve(tree[path]))
    const wrapper = mountView()
    await flush()

    await wrapper.find('.folders-card').trigger('click')
    await flush()
    await wrapper.find('.folders-card').trigger('click')
    await flush()
    expect(wrapper.findAll('.folders-crumb')).toHaveLength(3)
    state.fetchFolder.mockClear()

    await wrapper.findAll('.folders-crumb')[1].trigger('click')
    await flush()

    expect(state.fetchFolder).toHaveBeenCalledWith('Fotos')
    expect(wrapper.findAll('.folders-crumb')).toHaveLength(2)
  })

  it('says a folder is empty', async () => {
    state.fetchFolder.mockResolvedValue(listing('', [], []))
    const wrapper = mountView()
    await flush()

    expect(wrapper.text()).toContain('No photos in this folder')
  })

  it('opens the viewer at the clicked photo', async () => {
    const wrapper = mountView()
    await flush()

    await wrapper.findAll('.folders-photo')[1].trigger('click')
    await flush()

    const viewer = wrapper.findComponent({ name: 'ViewerOverlay' })
    expect(viewer.props('index')).toBe(1)
    expect(viewer.props('photos')).toHaveLength(2)
  })

  it('dims a thumbnail that fails to load', async () => {
    const wrapper = mountView()
    await flush()

    const img = wrapper.find('.folders-photo img')
    await img.trigger('error')

    expect((img.element as HTMLImageElement).style.opacity).toBe('0.15')
  })
})
