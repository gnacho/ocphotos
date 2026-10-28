import { describe, expect, it, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import type { Component } from 'vue'
import AlbumsView from './AlbumsView.vue'
import type { Album, Photo } from '../composables/usePhotoLibrary'

const state = vi.hoisted(() => ({
  previews: { value: {} as Record<string, string> },
  fetchAlbums: vi.fn(),
  createAlbum: vi.fn(),
  renameAlbum: vi.fn(),
  deleteAlbum: vi.fn(),
  albumAssets: vi.fn(),
  removeFromAlbum: vi.fn(),
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
      fetchAlbums: state.fetchAlbums,
      createAlbum: state.createAlbum,
      renameAlbum: state.renameAlbum,
      deleteAlbum: state.deleteAlbum,
      albumAssets: state.albumAssets,
      removeFromAlbum: state.removeFromAlbum,
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

const album = (id: number, name: string, count: number, coverId?: number): Album => ({
  id,
  name,
  count,
  coverId
})

const mountView = () =>
  mount(AlbumsView as unknown as Component, {
    global: {
      mocks: { $gettext: (message: string) => message },
      stubs: { 'oc-icon': true }
    }
  })

const button = (wrapper: ReturnType<typeof mountView>, label: string) => {
  const found = wrapper.findAll('button').find((b) => b.text() === label)
  if (!found) throw new Error(`no button labelled ${label}`)
  return found
}

beforeEach(() => {
  state.previews.value = {}
  state.fetchAlbums.mockReset().mockResolvedValue([album(1, 'Viajes', 12, 7), album(2, 'Casa', 3)])
  state.createAlbum.mockReset().mockResolvedValue(9)
  state.renameAlbum.mockReset().mockResolvedValue(undefined)
  state.deleteAlbum.mockReset().mockResolvedValue(undefined)
  state.albumAssets.mockReset().mockResolvedValue([photo(7), photo(8)])
  state.removeFromAlbum.mockReset().mockResolvedValue(undefined)
  state.ensurePreview.mockReset().mockResolvedValue('')
  state.ensureOriginal.mockReset().mockResolvedValue('')
})

describe('AlbumsView', () => {
  it('lists the albums with their name and count', async () => {
    const wrapper = mountView()
    await flush()

    expect(wrapper.find('.albums-count').text()).toBe('2 albums')
    const cards = wrapper.findAll('.albums-card')
    expect(cards).toHaveLength(2)
    expect(cards[0].find('.albums-card-name').text()).toBe('Viajes')
    expect(cards[0].find('.albums-card-count').text()).toBe('12')
    expect(cards[1].text()).toContain('Casa')
  })

  it('asks for a cover thumbnail when the album has one', async () => {
    mountView()
    await flush()

    expect(state.ensurePreview).toHaveBeenCalledTimes(1)
    expect(state.ensurePreview).toHaveBeenCalledWith({ id: 7 }, 400)
  })

  it('paints the cover from the preview cache', async () => {
    state.previews.value = { '7|400': 'blob:cover' }
    const wrapper = mountView()
    await flush()

    expect(wrapper.find('.albums-card img').attributes('src')).toBe('blob:cover')
  })

  it('says so when there are no albums', async () => {
    state.fetchAlbums.mockResolvedValue([])
    const wrapper = mountView()
    await flush()

    expect(wrapper.text()).toContain('No albums yet')
    expect(wrapper.find('.albums-count').text()).toBe('0 albums')
  })

  it('opens an album and shows its photos', async () => {
    const wrapper = mountView()
    await flush()

    await wrapper.findAll('.albums-card')[0].trigger('click')
    await flush()

    expect(state.albumAssets).toHaveBeenCalledWith(1)
    expect(wrapper.find('.albums-toolbar h1').text()).toBe('Viajes')
    expect(wrapper.find('.albums-count').text()).toBe('2 items')
    expect(wrapper.findAll('.albums-cell')).toHaveLength(2)
    expect(state.ensurePreview).toHaveBeenCalledWith(photo(7), 400)
  })

  it('says an album is empty when it has no photos', async () => {
    state.albumAssets.mockResolvedValue([])
    const wrapper = mountView()
    await flush()

    await wrapper.findAll('.albums-card')[0].trigger('click')
    await flush()

    expect(wrapper.text()).toContain('This album is empty')
  })

  it('goes back to the list and reloads it', async () => {
    const wrapper = mountView()
    await flush()
    await wrapper.findAll('.albums-card')[0].trigger('click')
    await flush()
    state.fetchAlbums.mockClear()

    await wrapper.find('.albums-icon-btn').trigger('click')
    await flush()

    expect(wrapper.find('.albums-toolbar h1').text()).toBe('Albums')
    expect(state.fetchAlbums).toHaveBeenCalledTimes(1)
  })

  it('creates an album and opens it', async () => {
    const wrapper = mountView()
    await flush()
    state.fetchAlbums.mockResolvedValue([album(9, 'Nuevo', 0)])
    state.albumAssets.mockResolvedValue([])

    await button(wrapper, 'New album').trigger('click')
    await wrapper.find('.albums-input').setValue('  Nuevo  ')
    await wrapper.find('.albums-dialog').trigger('submit')
    await flush()

    expect(state.createAlbum).toHaveBeenCalledWith('Nuevo')
    expect(wrapper.find('.albums-toolbar h1').text()).toBe('Nuevo')
  })

  it('ignores a blank album name', async () => {
    const wrapper = mountView()
    await flush()

    await button(wrapper, 'New album').trigger('click')
    await wrapper.find('.albums-input').setValue('   ')
    await wrapper.find('.albums-dialog').trigger('submit')
    await flush()

    expect(state.createAlbum).not.toHaveBeenCalled()
    expect(wrapper.find('.albums-dialog').exists()).toBe(true)
  })

  it('keeps the dialog and reports when creating fails', async () => {
    state.createAlbum.mockRejectedValue(new Error('POST /api/albums -> 500'))
    const wrapper = mountView()
    await flush()

    await button(wrapper, 'New album').trigger('click')
    await wrapper.find('.albums-input').setValue('Nuevo')
    await wrapper.find('.albums-dialog').trigger('submit')
    await flush()

    expect(wrapper.find('.albums-error').text()).toBe('POST /api/albums -> 500')
    expect(wrapper.find('.albums-dialog').exists()).toBe(true)
  })

  it('renames the open album', async () => {
    const wrapper = mountView()
    await flush()
    await wrapper.findAll('.albums-card')[0].trigger('click')
    await flush()

    await button(wrapper, 'Rename').trigger('click')
    expect((wrapper.find('.albums-input').element as HTMLInputElement).value).toBe('Viajes')
    await wrapper.find('.albums-input').setValue('Escapadas')
    await wrapper.find('.albums-dialog').trigger('submit')
    await flush()

    expect(state.renameAlbum).toHaveBeenCalledWith(1, 'Escapadas')
    expect(wrapper.find('.albums-toolbar h1').text()).toBe('Escapadas')
    expect(wrapper.find('.albums-dialog').exists()).toBe(false)
  })

  it('cancels the dialog without touching anything', async () => {
    const wrapper = mountView()
    await flush()

    await button(wrapper, 'New album').trigger('click')
    await button(wrapper, 'Cancel').trigger('click')

    expect(wrapper.find('.albums-dialog').exists()).toBe(false)
    expect(state.createAlbum).not.toHaveBeenCalled()
  })

  it('deletes the open album and returns to the list', async () => {
    const wrapper = mountView()
    await flush()
    await wrapper.findAll('.albums-card')[0].trigger('click')
    await flush()

    await button(wrapper, 'Delete').trigger('click')
    await flush()

    expect(state.deleteAlbum).toHaveBeenCalledWith(1)
    expect(wrapper.find('.albums-toolbar h1').text()).toBe('Albums')
  })

  it('stays in the album when deleting fails', async () => {
    state.deleteAlbum.mockRejectedValue(new Error('DELETE /api/albums/1 -> 500'))
    const wrapper = mountView()
    await flush()
    await wrapper.findAll('.albums-card')[0].trigger('click')
    await flush()

    await button(wrapper, 'Delete').trigger('click')
    await flush()

    expect(wrapper.find('.albums-error').text()).toBe('DELETE /api/albums/1 -> 500')
    expect(wrapper.find('.albums-toolbar h1').text()).toBe('Viajes')
  })

  it('removes a photo from the album and updates the count', async () => {
    const wrapper = mountView()
    await flush()
    await wrapper.findAll('.albums-card')[0].trigger('click')
    await flush()

    await wrapper.findAll('.albums-remove')[0].trigger('click')
    await flush()

    expect(state.removeFromAlbum).toHaveBeenCalledWith(1, 7)
    expect(wrapper.findAll('.albums-cell')).toHaveLength(1)
    expect(wrapper.find('.albums-count').text()).toBe('1 item')
  })

  it('keeps the photo when removing it fails', async () => {
    state.removeFromAlbum.mockRejectedValue(new Error('DELETE -> 500'))
    const wrapper = mountView()
    await flush()
    await wrapper.findAll('.albums-card')[0].trigger('click')
    await flush()

    await wrapper.findAll('.albums-remove')[0].trigger('click')
    await flush()

    expect(wrapper.find('.albums-error').text()).toBe('DELETE -> 500')
    expect(wrapper.find('.albums-toolbar h1').text()).toBe('Viajes')
  })

  it('opens the viewer at the clicked photo', async () => {
    const wrapper = mountView()
    await flush()
    await wrapper.findAll('.albums-card')[0].trigger('click')
    await flush()

    await wrapper.findAll('.albums-photo')[1].trigger('click')
    await flush()

    const viewer = wrapper.findComponent({ name: 'ViewerOverlay' })
    expect(viewer.props('index')).toBe(1)
    expect(viewer.props('photos')).toHaveLength(2)
  })

  it('dims a thumbnail that fails to load', async () => {
    const wrapper = mountView()
    await flush()
    await wrapper.findAll('.albums-card')[0].trigger('click')
    await flush()

    const img = wrapper.find('.albums-photo img')
    await img.trigger('error')

    expect((img.element as HTMLImageElement).style.opacity).toBe('0.15')
  })
})
