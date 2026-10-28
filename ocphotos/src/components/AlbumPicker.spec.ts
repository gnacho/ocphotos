import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import type { Component } from 'vue'
import AlbumPicker from './AlbumPicker.vue'

const library = vi.hoisted(() => ({
  fetchAlbums: vi.fn(),
  createAlbum: vi.fn(),
  addToAlbum: vi.fn()
}))

vi.mock('../composables/usePhotoLibrary', () => ({ usePhotoLibrary: () => library }))

function mountPicker(assetId = 7) {
  return mount(AlbumPicker as unknown as Component, {
    props: { assetId },
    global: { mocks: { $gettext: (m: string) => m } }
  })
}

async function flush() {
  await Promise.resolve()
  await new Promise((resolve) => setTimeout(resolve, 0))
}

beforeEach(() => {
  library.fetchAlbums.mockReset().mockResolvedValue([])
  library.createAlbum.mockReset().mockResolvedValue(9)
  library.addToAlbum.mockReset().mockResolvedValue(undefined)
})

describe('AlbumPicker', () => {
  it('lists the available albums with their asset counts', async () => {
    library.fetchAlbums.mockResolvedValue([
      { id: 2, name: 'Summer', count: 12 },
      { id: 5, name: 'Work', count: 0 }
    ])
    const wrapper = mountPicker()
    await flush()

    const items = wrapper.findAll('.ap-item')
    expect(items.map((i) => i.text())).toEqual(['Summer12', 'Work0'])
    expect(wrapper.text()).not.toContain('No albums yet')
  })

  it('shows a note when there are no albums yet', async () => {
    const wrapper = mountPicker()
    await flush()
    expect(wrapper.text()).toContain('No albums yet')
  })

  it('keeps the add button disabled until an album is selected', async () => {
    library.fetchAlbums.mockResolvedValue([{ id: 2, name: 'Summer', count: 1 }])
    const wrapper = mountPicker()
    await flush()

    const add = wrapper.find('.ap-btn-primary')
    expect(add.attributes('disabled')).toBeDefined()

    await wrapper.find('.ap-item').trigger('click')
    expect(wrapper.find('.ap-btn-primary').attributes('disabled')).toBeUndefined()
  })

  it('adds the asset to the selected album and closes', async () => {
    library.fetchAlbums.mockResolvedValue([
      { id: 2, name: 'Summer', count: 1 },
      { id: 3, name: 'Work', count: 4 }
    ])
    const wrapper = mountPicker(7)
    await flush()

    await wrapper.findAll('.ap-item')[1].trigger('click')
    await wrapper.find('.ap-btn-primary').trigger('click')
    await flush()

    expect(library.addToAlbum).toHaveBeenCalledWith(3, [7])
    expect(wrapper.emitted('added')).toHaveLength(1)
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('creates a trimmed album and adds the asset to it', async () => {
    const wrapper = mountPicker(7)
    await flush()

    await wrapper.find('.ap-input').setValue('  Trip  ')
    await wrapper.find('form').trigger('submit')
    await flush()

    expect(library.createAlbum).toHaveBeenCalledWith('Trip')
    expect(library.addToAlbum).toHaveBeenCalledWith(9, [7])
    expect(wrapper.emitted('added')).toHaveLength(1)
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('ignores an empty album name', async () => {
    const wrapper = mountPicker()
    await flush()

    await wrapper.find('.ap-input').setValue('   ')
    await wrapper.find('form').trigger('submit')
    await flush()

    expect(library.createAlbum).not.toHaveBeenCalled()
    expect(library.addToAlbum).not.toHaveBeenCalled()
  })

  it('does nothing when add is triggered without a selection', async () => {
    const wrapper = mountPicker()
    await flush()

    await wrapper.find('.ap-btn-primary').trigger('click')
    await flush()

    expect(library.addToAlbum).not.toHaveBeenCalled()
    expect(wrapper.emitted('added')).toBeUndefined()
  })

  it('closes with the close button and with a click on the backdrop', async () => {
    const wrapper = mountPicker()
    await flush()

    await wrapper.find('.ap-x').trigger('click')
    await wrapper.find('.ap-backdrop').trigger('click')
    await flush()

    expect(wrapper.emitted('close')).toHaveLength(2)
  })

  it('survives a failed album listing and keeps the dialog usable', async () => {
    library.fetchAlbums.mockRejectedValue(new Error('500'))
    const wrapper = mountPicker()
    await flush()

    expect(wrapper.text()).toContain('No albums yet')
    expect(wrapper.find('.ap-x').exists()).toBe(true)
  })

  it('stays open when adding to an album fails', async () => {
    library.fetchAlbums.mockResolvedValue([{ id: 2, name: 'Summer', count: 1 }])
    library.addToAlbum.mockRejectedValue(new Error('409'))
    const wrapper = mountPicker(7)
    await flush()

    await wrapper.find('.ap-item').trigger('click')
    await wrapper.find('.ap-btn-primary').trigger('click')
    await flush()

    expect(wrapper.emitted('added')).toBeUndefined()
    expect(wrapper.emitted('close')).toBeUndefined()
  })

  it('stays open when creating the album fails', async () => {
    library.createAlbum.mockRejectedValue(new Error('500'))
    const wrapper = mountPicker(7)
    await flush()

    await wrapper.find('.ap-input').setValue('Trip')
    await wrapper.find('form').trigger('submit')
    await flush()

    expect(library.addToAlbum).not.toHaveBeenCalled()
    expect(wrapper.emitted('close')).toBeUndefined()
  })
})
