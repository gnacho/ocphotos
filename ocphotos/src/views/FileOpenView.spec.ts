import { flushPromises, mount } from '@vue/test-utils'
import { ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import FileOpenView from './FileOpenView.vue'

const host = vi.hoisted(() => ({
  back: vi.fn(),
  resolveFromFiles: vi.fn(),
  ensurePreview: vi.fn(),
  ensureOriginal: vi.fn(),
  useRouteParam: vi.fn(),
  useRouteQuery: vi.fn(),
  useRouter: vi.fn()
}))

const routeParams: Record<string, string> = {}
const routeQuery: Record<string, string> = {}

vi.mock('@opencloud-eu/web-pkg', () => ({
  useRouteParam: (name: string, fallback: string) => {
    host.useRouteParam(name, fallback)
    return ref(routeParams[name] ?? fallback)
  },
  useRouteQuery: (name: string, fallback: string) => {
    host.useRouteQuery(name, fallback)
    return ref(routeQuery[name] ?? fallback)
  },
  useRouter: () => {
    host.useRouter()
    return { back: host.back }
  }
}))

vi.mock('../composables/usePhotoLibrary', () => ({
  usePhotoLibrary: () => ({
    resolveFromFiles: host.resolveFromFiles,
    ensurePreview: host.ensurePreview,
    ensureOriginal: host.ensureOriginal
  })
}))

const photo = { id: 7, name: 'IMG_0007.jpg', path: '/Fotos/IMG_0007.jpg', isVideo: false }

const ViewerStub = {
  name: 'ViewerOverlay',
  props: ['photos', 'index', 'ensurePreview', 'ensureOriginal'],
  template: '<button class="viewer-stub" :data-count="photos.length" @click="$emit(\'close\')" />'
}

const mountView = async () => {
  const wrapper = mount(FileOpenView, {
    global: {
      mocks: { $gettext: (text: string) => text },
      stubs: { ViewerOverlay: ViewerStub }
    }
  })
  await flushPromises()
  return wrapper
}

describe('FileOpenView', () => {
  beforeEach(() => {
    for (const key of Object.keys(routeParams)) delete routeParams[key]
    for (const key of Object.keys(routeQuery)) delete routeQuery[key]
    routeParams.driveAliasAndItem = 'personal/Fotos/IMG_0007.jpg'
    routeQuery.fileId = 'file-7'
    host.back.mockReset()
    host.resolveFromFiles.mockReset().mockResolvedValue(photo)
    host.ensurePreview.mockReset()
    host.ensureOriginal.mockReset()
    host.useRouteParam.mockReset()
    host.useRouteQuery.mockReset()
    host.useRouter.mockReset()
  })

  it('reads the open-with context through the host router composables', async () => {
    await mountView()

    expect(host.useRouteParam).toHaveBeenCalledWith('driveAliasAndItem', '')
    expect(host.useRouteQuery).toHaveBeenCalledWith('fileId', '')
    expect(host.resolveFromFiles).toHaveBeenCalledWith('personal/Fotos/IMG_0007.jpg', 'file-7')
  })

  it('renders the resolved photo as a single-item viewer', async () => {
    const wrapper = await mountView()

    expect(wrapper.find('.viewer-stub').attributes('data-count')).toBe('1')
    expect(wrapper.text()).not.toContain('Photo not found')
  })

  it('omits the file id when the query parameter is empty', async () => {
    routeQuery.fileId = ''

    await mountView()

    expect(host.resolveFromFiles).toHaveBeenCalledWith('personal/Fotos/IMG_0007.jpg', undefined)
  })

  it('shows the empty state when the asset is not indexed', async () => {
    host.resolveFromFiles.mockResolvedValue(null)

    const wrapper = await mountView()

    expect(wrapper.text()).toContain('Photo not found')
    expect(wrapper.find('.viewer-stub').exists()).toBe(false)
  })

  it('leaves the loading state even when resolution fails', async () => {
    host.resolveFromFiles.mockRejectedValue(new Error('boom'))

    const wrapper = await mountView()

    expect(wrapper.text()).not.toContain('Loading')
  })

  it('goes back to the host router when the viewer closes', async () => {
    const wrapper = await mountView()

    await wrapper.find('.viewer-stub').trigger('click')

    expect(host.back).toHaveBeenCalledTimes(1)
  })
})
