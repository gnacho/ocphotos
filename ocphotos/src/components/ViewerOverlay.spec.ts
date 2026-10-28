import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, type Component } from 'vue'
import ViewerOverlay from './ViewerOverlay.vue'

const library = vi.hoisted(() => ({
  toggleFavorite: vi.fn(),
  assetTags: vi.fn(),
  addTag: vi.fn(),
  removeTag: vi.fn(),
  setArchived: vi.fn(),
  videoUrl: vi.fn()
}))

vi.mock('../composables/usePhotoLibrary', () => ({
  usePhotoLibrary: () => library
}))

const photo = (over: Partial<Record<string, unknown>> = {}) => ({
  id: 1,
  path: '/Photos/a.jpg',
  name: 'a.jpg',
  mediaType: 'image',
  isVideo: false,
  takenAt: Math.floor(Date.UTC(2024, 4, 1, 12) / 1000),
  width: 4000,
  height: 3000,
  camera: 'X100V',
  size: 1024,
  favorite: false,
  archived: false,
  ...over
})

const flush = async () => {
  await new Promise((resolve) => setTimeout(resolve, 0))
  await nextTick()
}

const mountViewer = (photos: ReturnType<typeof photo>[], index = 0, over: Record<string, unknown> = {}) => {
  const ensurePreview = vi.fn((p: { id: number }) => Promise.resolve(`blob:preview-${p.id}`))
  const ensureOriginal = vi.fn((p: { id: number }) => Promise.resolve(`blob:original-${p.id}`))
  const wrapper = mount(ViewerOverlay as unknown as Component, {
    props: { photos, index, ensurePreview, ensureOriginal, ...over },
    global: {
      mocks: { $gettext: (msg: string) => msg },
      stubs: { 'oc-icon': true, AlbumPicker: true, PhotoDetailsPanel: true }
    }
  })
  return { wrapper, ensurePreview, ensureOriginal }
}

const key = (k: string) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k }))

beforeEach(() => {
  vi.clearAllMocks()
  library.toggleFavorite.mockResolvedValue(undefined)
  library.setArchived.mockResolvedValue(undefined)
  library.addTag.mockResolvedValue(undefined)
  library.removeTag.mockResolvedValue(undefined)
  library.assetTags.mockResolvedValue([])
  library.videoUrl.mockResolvedValue('https://signed.example/video.mp4')
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ViewerOverlay', () => {
  it('asks for a 2048 preview of the visible photo and renders it', async () => {
    const { wrapper, ensurePreview } = mountViewer([photo({ id: 7, name: 'seven.jpg' })])
    await flush()

    expect(ensurePreview).toHaveBeenCalledWith(expect.objectContaining({ id: 7 }), 2048)
    const img = wrapper.find('img.viewer-media')
    expect(img.exists()).toBe(true)
    expect(img.attributes('src')).toBe('blob:preview-7')
    expect(img.attributes('alt')).toBe('seven.jpg')
  })

  it('shows a video element and signs the stream url for videos', async () => {
    const { wrapper, ensurePreview } = mountViewer([photo({ id: 3, isVideo: true, mediaType: 'video' })])
    await flush()

    expect(ensurePreview).not.toHaveBeenCalled()
    expect(library.videoUrl).toHaveBeenCalledWith(expect.objectContaining({ id: 3 }))
    expect(wrapper.find('video.viewer-media').exists()).toBe(true)
    expect((wrapper.find('video.viewer-media').element as HTMLVideoElement).src).toBe(
      'https://signed.example/video.mp4'
    )
  })

  it('does not paint a stale preview when the user moves on before it resolves', async () => {
    const resolvers: Record<number, (url: string) => void> = {}
    const ensurePreview = vi.fn(
      (p: { id: number }) => new Promise<string>((resolve) => {
        resolvers[p.id] = resolve
      })
    )
    const { wrapper } = mountViewer([photo({ id: 1 }), photo({ id: 2 })], 0, { ensurePreview })
    await flush()

    await wrapper.setProps({ index: 1 })
    await flush()

    resolvers[1]('blob:stale')
    await flush()
    expect(wrapper.find('img.viewer-media').exists()).toBe(false)

    resolvers[2]('blob:fresh')
    await flush()
    expect(wrapper.find('img.viewer-media').attributes('src')).toBe('blob:fresh')
  })

  it('only offers the arrows that lead somewhere', () => {
    const photos = [photo({ id: 1 }), photo({ id: 2 }), photo({ id: 3 })]

    const first = mountViewer(photos, 0).wrapper
    expect(first.find('.viewer-arrow.left').exists()).toBe(false)
    expect(first.find('.viewer-arrow.right').exists()).toBe(true)

    const middle = mountViewer(photos, 1).wrapper
    expect(middle.find('.viewer-arrow.left').exists()).toBe(true)
    expect(middle.find('.viewer-arrow.right').exists()).toBe(true)

    const last = mountViewer(photos, 2).wrapper
    expect(last.find('.viewer-arrow.left').exists()).toBe(true)
    expect(last.find('.viewer-arrow.right').exists()).toBe(false)
  })

  it('emits navigate with the neighbouring index from the arrows', async () => {
    const { wrapper } = mountViewer([photo({ id: 1 }), photo({ id: 2 }), photo({ id: 3 })], 1)

    await wrapper.find('.viewer-arrow.right').trigger('click')
    await wrapper.find('.viewer-arrow.left').trigger('click')

    expect(wrapper.emitted('navigate')).toEqual([[2], [0]])
  })

  it('bound the keyboard navigation to the available photos', async () => {
    const { wrapper } = mountViewer([photo({ id: 1 }), photo({ id: 2 })], 0)

    key('ArrowLeft')
    key('ArrowRight')
    await nextTick()

    expect(wrapper.emitted('navigate')).toEqual([[1]])
  })

  it('closes on Escape, on the close button and on a click on the backdrop', async () => {
    const { wrapper } = mountViewer([photo()])

    key('Escape')
    await nextTick()
    await wrapper.find('.viewer-close').trigger('click')
    await wrapper.find('.viewer-stage').trigger('click')

    expect(wrapper.emitted('close')).toHaveLength(3)
  })

  it('shows the date and the camera in the caption', async () => {
    const { wrapper } = mountViewer([photo({ camera: 'X100V' })])
    await flush()

    const caption = wrapper.find('.viewer-caption').text()
    expect(caption).toContain('2024')
    expect(caption).toContain('X100V')
  })

  it('toggles the favorite of the visible photo', async () => {
    const photos = [photo({ id: 5 }), photo({ id: 6 })]
    const { wrapper } = mountViewer(photos, 1)

    await wrapper.find('[aria-label="Favorite"]').trigger('click')

    expect(library.toggleFavorite).toHaveBeenCalledWith(expect.objectContaining({ id: 6 }))
  })

  it('archives the visible photo and closes the viewer', async () => {
    const { wrapper } = mountViewer([photo({ id: 9 })])
    await flush()

    await wrapper.find('[aria-label="Archive"]').trigger('click')

    expect(library.setArchived).toHaveBeenCalledWith(9, true)
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('downloads the original, not the preview', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const { wrapper, ensureOriginal } = mountViewer([photo({ id: 4, name: 'four.jpg' })])
    await flush()

    await wrapper.find('[aria-label="Download"]').trigger('click')
    await flush()

    expect(ensureOriginal).toHaveBeenCalledWith(expect.objectContaining({ id: 4 }))
    expect(click).toHaveBeenCalledTimes(1)
  })

  it('lists, adds and removes tags through the library', async () => {
    library.assetTags.mockResolvedValue(['beach'])
    const { wrapper } = mountViewer([photo({ id: 11 })])
    await flush()

    await wrapper.find('[aria-label="Add tag"]').trigger('click')
    await flush()
    expect(library.assetTags).toHaveBeenCalledWith(11)
    expect(wrapper.findAll('.viewer-tag').map((t) => t.text())).toEqual(['beach×'])

    await wrapper.find('.viewer-tag-x').trigger('click')
    await flush()
    expect(library.removeTag).toHaveBeenCalledWith(11, 'beach')

    await wrapper.find('.viewer-tag-input').setValue('  sunset  ')
    await wrapper.find('form').trigger('submit')
    await flush()
    expect(library.addTag).toHaveBeenCalledWith(11, 'sunset')
  })

  it('ignores an empty tag instead of sending it', async () => {
    const { wrapper } = mountViewer([photo({ id: 12 })])
    await flush()

    await wrapper.find('[aria-label="Add tag"]').trigger('click')
    await flush()
    await wrapper.find('.viewer-tag-input').setValue('   ')
    await wrapper.find('form').trigger('submit')
    await flush()

    expect(library.addTag).not.toHaveBeenCalled()
  })
})
