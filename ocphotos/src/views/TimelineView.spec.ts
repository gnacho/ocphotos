import { mount } from '@vue/test-utils'
import { defineComponent, nextTick, ref, type Component, type PropType } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import TimelineView from './TimelineView.vue'
import type { CalendarYear, Photo } from '../composables/usePhotoLibrary'

const $gettext = (message: string, options?: Record<string, unknown>) =>
  options
    ? message.replace(/%\{(\w+)\}/g, (_, key: string) => String(options[key] ?? ''))
    : message

const ctx = vi.hoisted(() => ({ lib: null as unknown as Record<string, unknown> }))

vi.mock('../composables/usePhotoLibrary', () => ({ usePhotoLibrary: () => ctx.lib }))

vi.mock('vue3-gettext', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useGettext: () => ({ $gettext })
}))

const ViewerStub = defineComponent({
  props: {
    photos: { type: Array as PropType<Photo[]>, default: (): Photo[] => [] },
    index: { type: Number, default: 0 }
  },
  emits: ['close', 'navigate'],
  template: '<div class="viewer-stub" :data-count="photos?.length" :data-index="index" />'
})

const PickerStub = defineComponent({
  props: { assetId: { type: Number, default: 0 } },
  emits: ['close'],
  template: '<div class="picker-stub" :data-asset="assetId" />'
})

class ObserverStub {
  static instances: ObserverStub[] = []
  callback: (entries: { isIntersecting: boolean }[]) => void

  constructor(callback: (entries: { isIntersecting: boolean }[]) => void) {
    this.callback = callback
    ObserverStub.instances.push(this)
  }

  observe() {}

  unobserve() {}

  disconnect() {}

  trigger(isIntersecting: boolean) {
    this.callback([{ isIntersecting }])
  }
}

const photo = (over: Partial<Photo> = {}): Photo =>
  ({
    id: 1,
    path: '/Photos/a.jpg',
    name: 'a.jpg',
    mediaType: 'image',
    isVideo: false,
    takenAt: Date.UTC(2024, 4, 17, 10, 0, 0) / 1000,
    width: 3000,
    height: 2000,
    size: 1024,
    favorite: false,
    archived: false,
    ...over
  }) as Photo

const flush = async () => {
  await Promise.resolve()
  await new Promise((resolve) => setTimeout(resolve, 0))
  await nextTick()
}

interface Options {
  photos?: Photo[]
  loading?: boolean
  error?: string | null
  months?: { key: string; label: string; days: { key: string; date: Date; photos: Photo[] }[] }[]
  exhausted?: boolean
  startAt?: number | null
  years?: CalendarYear[]
  highlights?: Photo[]
  calendarFails?: boolean
  highlightsFail?: boolean
}

const makeLib = (over: Options = {}) => {
  const lib = {
    photos: ref<Photo[]>(over.photos ?? []),
    loading: ref(over.loading ?? false),
    error: ref<string | null>(over.error ?? null),
    months: ref(over.months ?? []),
    exhausted: ref(over.exhausted ?? false),
    startAt: ref<number | null>(over.startAt ?? null),
    previews: ref<Record<string, string>>({}),
    init: vi.fn(() => Promise.resolve()),
    loadMore: vi.fn(() => Promise.resolve()),
    jumpTo: vi.fn(() => Promise.resolve()),
    rescan: vi.fn(() => Promise.resolve()),
    startWatching: vi.fn(),
    ensurePreview: vi.fn(() => Promise.resolve()),
    ensureOriginal: vi.fn(() => Promise.resolve()),
    fetchCalendar: vi.fn(() =>
      over.calendarFails ? Promise.reject(new Error('calendar down')) : Promise.resolve(over.years ?? [])
    ),
    fetchHighlights: vi.fn(() =>
      over.highlightsFail
        ? Promise.reject(new Error('highlights down'))
        : Promise.resolve({ scope: 'oldest', photos: over.highlights ?? [] })
    )
  }
  ctx.lib = lib as unknown as Record<string, unknown>
  return lib
}

const mountView = (lib: ReturnType<typeof makeLib>) => {
  ctx.lib = lib as unknown as Record<string, unknown>
  return mount(TimelineView as unknown as Component, {
    global: {
      mocks: { $gettext },
      stubs: { 'oc-button': true, 'oc-icon': true, ViewerOverlay: ViewerStub, AlbumPicker: PickerStub }
    }
  })
}

const month = (key: string, label: string, date: Date, photos: Photo[]) => ({
  key,
  label,
  days: [{ key: `${key}-d`, date, photos }]
})

let width = 0

beforeEach(() => {
  ObserverStub.instances = []
  width = 0
  vi.stubGlobal('IntersectionObserver', ObserverStub)
  vi.stubGlobal('ResizeObserver', ObserverStub)
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get: () => width
  })
})

describe('TimelineView', () => {
  it('loads the page and starts watching on mount', async () => {
    const lib = makeLib()
    mountView(lib)
    await flush()
    expect(lib.init).toHaveBeenCalledTimes(1)
    expect(lib.startWatching).toHaveBeenCalledTimes(1)
  })

  it('renders the month and day headers with the photo count', async () => {
    const a = photo({ id: 1, name: 'a.jpg' })
    const b = photo({ id: 2, name: 'b.jpg' })
    const lib = makeLib({
      photos: [a, b],
      months: [month('2024-05', 'May 2024', new Date(2024, 4, 17), [a, b])]
    })
    const wrapper = mountView(lib)
    await flush()

    expect(wrapper.find('.photos-month-header').text()).toBe('May 2024')
    expect(wrapper.find('.photos-day-header').text()).toContain('2')
    expect(wrapper.findAll('.photos-item')).toHaveLength(2)
    expect(wrapper.findAll('.photos-item img')[0].attributes('alt')).toBe('a.jpg')
  })

  it('shows the item count, in singular and plural', async () => {
    const lib = makeLib({ photos: [photo()] })
    const wrapper = mountView(lib)
    await flush()
    expect(wrapper.find('.photos-count').text()).toBe('1 item')

    lib.photos.value = [photo(), photo({ id: 2 })]
    await nextTick()
    expect(wrapper.find('.photos-count').text()).toBe('2 items')
  })

  it('shows the loading progress instead of the count while loading', async () => {
    const lib = makeLib({ loading: true, photos: [photo()] })
    const wrapper = mountView(lib)
    await flush()
    expect(wrapper.find('.photos-progress').text()).toBe('Loading…')
    expect(wrapper.find('.photos-count').exists()).toBe(false)
  })

  it('shows the error message and hides the empty state', async () => {
    const lib = makeLib({ error: 'GET /api/assets -> 500' })
    const wrapper = mountView(lib)
    await flush()
    expect(wrapper.find('.photos-error').text()).toBe('GET /api/assets -> 500')
    expect(wrapper.find('.photos-empty').exists()).toBe(false)
    expect(wrapper.find('.photos-body').exists()).toBe(false)
  })

  it('shows the empty state when there are no photos', async () => {
    const lib = makeLib()
    const wrapper = mountView(lib)
    await flush()
    expect(wrapper.find('.photos-empty').text()).toBe('No photos yet')
    expect(wrapper.find('.photos-body').exists()).toBe(false)
  })

  it('lays rows out with a fixed height and keeps the aspect ratio', async () => {
    width = 916
    const wide = photo({ id: 1, width: 3000, height: 2000 })
    const lib = makeLib({
      photos: [wide],
      months: [month('2024-05', 'May 2024', new Date(2024, 4, 17), [wide])]
    })
    const wrapper = mountView(lib)
    await flush()

    const item = wrapper.find('.photos-item')
    expect(item.attributes('style')).toContain('width: 480px')
    expect(item.attributes('style')).toContain('height: 320px')
  })

  it('falls back to a sane width when the container reports no width', async () => {
    width = 0
    const photos = [photo({ id: 1, width: 3000, height: 2000 }), photo({ id: 2, width: 2000, height: 3000 })]
    const lib = makeLib({
      photos,
      months: [month('2024-05', 'May 2024', new Date(2024, 4, 17), photos)]
    })
    const wrapper = mountView(lib)
    await flush()

    expect(wrapper.findAll('.photos-row')).toHaveLength(1)
    const widths = wrapper.findAll('.photos-item').map((item) => {
      const match = item.attributes('style')?.match(/width: (-?\d+)px/)
      return Number(match?.[1] ?? 0)
    })
    expect(widths).toHaveLength(2)
    for (const w of widths) expect(w).toBeGreaterThan(0)
  })

  it('lists the on-this-day strip from the highlights, one card per year', async () => {
    const older = photo({ id: 7, takenAt: Date.UTC(2020, 4, 17) / 1000 })
    const newer = photo({ id: 8, takenAt: Date.UTC(2022, 4, 17) / 1000 })
    const lib = makeLib({ photos: [older], highlights: [older, newer] })
    const wrapper = mountView(lib)
    await flush()

    expect(wrapper.find('.otd-title').text()).toBe('On this day')
    const cards = wrapper.findAll('.otd-card')
    expect(cards).toHaveLength(2)
    expect(cards[0].find('.otd-label').text()).toBe('4 years ago')
    expect(cards[1].find('.otd-label').text()).toBe('6 years ago')
    expect(lib.ensurePreview).toHaveBeenCalledWith(newer, 400)
  })

  it('jumps to the photo of an on-this-day card', async () => {
    const older = photo({ id: 7, takenAt: Date.UTC(2020, 4, 17) / 1000 })
    const lib = makeLib({ photos: [older], highlights: [older] })
    const wrapper = mountView(lib)
    await flush()

    await wrapper.find('.otd-card').trigger('click')
    expect(lib.jumpTo).toHaveBeenCalledWith(older.takenAt)
  })

  it('toggles the months of a year in the rewind and jumps to a month', async () => {
    const lib = makeLib({
      photos: [photo()],
      years: [{ year: 2024, count: 9, months: [{ month: 3, count: 4 }] }]
    })
    const wrapper = mountView(lib)
    await flush()

    const yearButton = wrapper.findAll('.rewind-item').find((b) => b.text() === '2024')
    expect(yearButton).toBeDefined()
    expect(wrapper.findAll('.rewind-month')).toHaveLength(0)

    await yearButton!.trigger('click')
    const months = wrapper.findAll('.rewind-month')
    expect(months).toHaveLength(1)

    await months[0].trigger('click')
    expect(lib.jumpTo).toHaveBeenCalledWith(Math.floor(Date.UTC(2024, 3, 0, 23, 59, 59) / 1000))

    await yearButton!.trigger('click')
    expect(wrapper.findAll('.rewind-month')).toHaveLength(0)
  })

  it('marks the current position in the rewind and returns to now', async () => {
    const lib = makeLib({
      photos: [photo({ takenAt: Date.UTC(2024, 4, 17) / 1000 })],
      years: [{ year: 2024, count: 1, months: [] }]
    })
    const wrapper = mountView(lib)
    await flush()

    expect(wrapper.find('.rewind-now').classes()).toContain('active')
    const yearButton = wrapper.findAll('.rewind-item').find((b) => b.text() === '2024')
    expect(yearButton!.classes()).toContain('active')

    lib.startAt.value = 123
    await nextTick()
    await wrapper.find('.rewind-now').trigger('click')
    expect(lib.jumpTo).toHaveBeenCalledWith(null)
  })

  it('asks for the next page when the sentinel becomes visible', async () => {
    const lib = makeLib({ photos: [photo()] })
    mountView(lib)
    await flush()

    const observer = ObserverStub.instances.at(-1)
    expect(observer).toBeDefined()
    observer!.trigger(true)
    expect(lib.loadMore).toHaveBeenCalledTimes(1)

    lib.exhausted.value = true
    await nextTick()
    observer!.trigger(true)
    expect(lib.loadMore).toHaveBeenCalledTimes(1)
  })

  it('opens the viewer on the clicked photo and follows its navigation', async () => {
    const a = photo({ id: 1, name: 'a.jpg' })
    const b = photo({ id: 2, name: 'b.jpg' })
    const lib = makeLib({
      photos: [a, b],
      months: [month('2024-05', 'May 2024', new Date(2024, 4, 17), [a, b])]
    })
    const wrapper = mountView(lib)
    await flush()

    await wrapper.findAll('.photos-item')[1].trigger('click')
    const viewer = wrapper.findComponent(ViewerStub)
    expect(viewer.exists()).toBe(true)
    expect(viewer.attributes('data-count')).toBe('2')
    expect(viewer.attributes('data-index')).toBe('1')

    await viewer.vm.$emit('navigate', 0)
    await nextTick()
    expect(wrapper.findComponent(ViewerStub).attributes('data-index')).toBe('0')
  })

  it('opens the album picker from the shortcut without opening the viewer', async () => {
    const a = photo({ id: 42 })
    const lib = makeLib({
      photos: [a],
      months: [month('2024-05', 'May 2024', new Date(2024, 4, 17), [a])]
    })
    const wrapper = mountView(lib)
    await flush()

    await wrapper.find('.photos-add').trigger('click')
    expect(wrapper.findComponent(PickerStub).attributes('data-asset')).toBe('42')
    expect(wrapper.findComponent(ViewerStub).exists()).toBe(false)
  })

  it('marks a thumbnail that fails to load', async () => {
    const a = photo({ id: 1 })
    const lib = makeLib({
      photos: [a],
      months: [month('2024-05', 'May 2024', new Date(2024, 4, 17), [a])]
    })
    const wrapper = mountView(lib)
    await flush()

    const img = wrapper.find('.photos-item img')
    await img.trigger('error')
    expect((img.element as HTMLImageElement).style.opacity).toBe('0.15')
  })

  it('keeps rendering the timeline when the calendar and highlights requests fail', async () => {
    const a = photo({ id: 1 })
    const lib = makeLib({
      photos: [a],
      months: [month('2024-05', 'May 2024', new Date(2024, 4, 17), [a])],
      calendarFails: true,
      highlightsFail: true
    })
    const wrapper = mountView(lib)
    await flush()

    expect(wrapper.findAll('.photos-item')).toHaveLength(1)
    expect(wrapper.find('.rewind').exists()).toBe(false)
    expect(wrapper.find('.otd-block').exists()).toBe(false)
  })

  it('triggers a rescan from the toolbar', async () => {
    const lib = makeLib({ photos: [photo()] })
    const wrapper = mountView(lib)
    await flush()

    await wrapper.find('oc-button-stub').trigger('click')
    expect(lib.rescan).toHaveBeenCalledTimes(1)
  })

  it('asks for a 400 preview for every rendered photo', async () => {
    const a = photo({ id: 1 })
    const b = photo({ id: 2 })
    const lib = makeLib({
      photos: [a, b],
      months: [month('2024-05', 'May 2024', new Date(2024, 4, 17), [a, b])]
    })
    mountView(lib)
    await flush()

    expect(lib.ensurePreview).toHaveBeenCalledWith(a, 400)
    expect(lib.ensurePreview).toHaveBeenCalledWith(b, 400)
  })

  it('paints the thumbnail from the preview cache', async () => {
    const a = photo({ id: 5 })
    const lib = makeLib({
      photos: [a],
      months: [month('2024-05', 'May 2024', new Date(2024, 4, 17), [a])]
    })
    const wrapper = mountView(lib)
    await flush()

    expect(wrapper.find('.photos-item img').attributes('src')).toBeUndefined()
    lib.previews.value = { '5|400': 'https://example.test/5.jpg' }
    await nextTick()
    expect(wrapper.find('.photos-item img').attributes('src')).toBe('https://example.test/5.jpg')
  })
})
