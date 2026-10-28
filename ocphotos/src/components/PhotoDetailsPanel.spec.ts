import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import type { Component } from 'vue'
import PhotoDetailsPanel from './PhotoDetailsPanel.vue'
import type { Photo } from '../composables/usePhotoLibrary'

const library = vi.hoisted(() => ({
  assetTags: vi.fn(),
  albumsOfAsset: vi.fn()
}))

vi.mock('../composables/usePhotoLibrary', () => ({ usePhotoLibrary: () => library }))

function photo(over: Partial<Photo> = {}): Photo {
  return {
    id: 1,
    path: 'photos/a.jpg',
    name: 'a.jpg',
    mediaType: 'image',
    isVideo: false,
    takenAt: new Date(2024, 4, 17, 10, 30).getTime() / 1000,
    width: 4000,
    height: 3000,
    size: 2048,
    favorite: false,
    archived: false,
    ...over
  }
}

function mountPanel(p: Photo) {
  return mount(PhotoDetailsPanel as unknown as Component, {
    props: { photo: p },
    global: { mocks: { $gettext: (m: string) => m } }
  })
}

async function flush() {
  await Promise.resolve()
  await new Promise((resolve) => setTimeout(resolve, 0))
}

function deferredTags() {
  let resolve!: (v: string[]) => void
  const promise = new Promise<string[]>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

function chipLabels(wrapper: ReturnType<typeof mountPanel>): string[] {
  return wrapper.findAll('.details-chip').map((c) => c.text())
}

beforeEach(() => {
  library.assetTags.mockReset().mockResolvedValue([])
  library.albumsOfAsset.mockReset().mockResolvedValue([])
})

describe('PhotoDetailsPanel', () => {
  it('renders the general metadata of a photo', async () => {
    const wrapper = mountPanel(photo())
    await flush()
    const text = wrapper.text()
    expect(text).toContain('a.jpg')
    expect(text).toContain('4000 × 3000')
    expect(text).toContain('2.0 KB')
    expect(text).toContain('Photo')
    expect(text).toContain('2024')
  })

  it('labels videos as such', async () => {
    const wrapper = mountPanel(photo({ isVideo: true, mediaType: 'video' }))
    await flush()
    expect(wrapper.text()).toContain('Video')
  })

  it('formats the size with the unit that matches its magnitude', async () => {
    const cases: Array<[number, string]> = [
      [512, '512 B'],
      [2048, '2.0 KB'],
      [3 * 1024 * 1024, '3.0 MB'],
      [2.5 * 1024 * 1024 * 1024, '2.5 GB']
    ]
    for (const [size, label] of cases) {
      const wrapper = mountPanel(photo({ size }))
      await flush()
      expect(wrapper.text()).toContain(label)
      wrapper.unmount()
    }
  })

  it('omits the rows it has no data for', async () => {
    const wrapper = mountPanel(photo({ takenAt: 0, width: 0, height: 0, size: 0 }))
    await flush()
    const text = wrapper.text()
    expect(text).not.toContain('Date taken')
    expect(text).not.toContain('Dimensions')
    expect(text).not.toContain('Size')
    expect(text).toContain('Name')
  })

  it('renders camera, exposure and location sections when present', async () => {
    const wrapper = mountPanel(
      photo({
        camera: 'Fujifilm X-T5',
        lens: 'XF 23mm',
        iso: 400,
        aperture: 'f/2',
        shutter: '1/250',
        focal: '23mm',
        lat: 40.4167754,
        lon: -3.7037902
      })
    )
    await flush()
    const text = wrapper.text()
    expect(text).toContain('Fujifilm X-T5')
    expect(text).toContain('XF 23mm')
    expect(text).toContain('400')
    expect(text).toContain('f/2')
    expect(text).toContain('1/250')
    expect(text).toContain('23mm')
    expect(text).toContain('40.41678')
    expect(text).toContain('-3.70379')
  })

  it('hides the camera and exposure sections when empty', async () => {
    const wrapper = mountPanel(photo())
    await flush()
    const text = wrapper.text()
    expect(text).not.toContain('Camera')
    expect(text).not.toContain('Exposure')
    expect(text).not.toContain('Location')
  })

  it('lists the tags of the asset', async () => {
    library.assetTags.mockResolvedValue(['beach', 'sunset'])
    const wrapper = mountPanel(photo({ id: 9 }))
    await flush()
    expect(library.assetTags).toHaveBeenCalledWith(9)
    expect(chipLabels(wrapper)).toEqual(['beach', 'sunset'])
    expect(wrapper.text()).not.toContain('No tags')
  })

  it('shows empty states without tags or albums', async () => {
    const wrapper = mountPanel(photo())
    await flush()
    expect(wrapper.text()).toContain('No tags')
    expect(wrapper.text()).toContain('No albums')
  })

  it('lists the albums the asset belongs to', async () => {
    library.albumsOfAsset.mockResolvedValue([
      { id: 3, name: 'Summer', count: 12 },
      { id: 4, name: 'Family', count: 2 }
    ])
    const wrapper = mountPanel(photo({ id: 9 }))
    await flush()
    const items = wrapper.findAll('.details-list li').map((li) => li.text())
    expect(items).toEqual(['Summer', 'Family'])
  })

  it('discards the tags and albums of a photo that is no longer shown', async () => {
    const first = deferredTags()
    library.assetTags.mockReturnValueOnce(first.promise)
    const wrapper = mountPanel(photo({ id: 1 }))
    await flush()

    library.assetTags.mockResolvedValueOnce(['second'])
    await wrapper.setProps({ photo: photo({ id: 2 }) })
    await flush()

    first.resolve(['first'])
    await flush()

    expect(chipLabels(wrapper)).toEqual(['second'])
  })

  it('falls back to empty states when the lookups fail', async () => {
    library.assetTags.mockRejectedValue(new Error('500'))
    library.albumsOfAsset.mockRejectedValue(new Error('500'))
    const wrapper = mountPanel(photo())
    await flush()
    expect(wrapper.text()).toContain('No tags')
    expect(wrapper.text()).toContain('No albums')
  })

  it('emits close when the close button is used', async () => {
    const wrapper = mountPanel(photo())
    await flush()
    await wrapper.find('.details-close').trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
  })
})
