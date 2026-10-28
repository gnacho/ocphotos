import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@opencloud-eu/web-pkg', () => ({
  useAuthStore: () => ({ accessToken: 'test-token' })
}))

const PAGE_SIZE = 300

const response = (body: unknown, ok = true, status = 200) =>
  ({ ok, status, json: () => Promise.resolve(body) }) as unknown as Response

const asset = (over: Record<string, unknown> = {}) => ({
  id: 1,
  path: '/photos/a.jpg',
  filename: 'a.jpg',
  mediaType: 'image',
  takenAt: 1700000000,
  width: 4000,
  height: 3000,
  size: 1234,
  favorite: false,
  ...over
})

const page = (count: number, base: Record<string, unknown> = {}) =>
  Array.from({ length: count }, (_, i) => asset({ id: i + 1, takenAt: 1700000000 + i, ...base }))

const tsOf = (y: number, m: number, d: number, h = 12) => Math.floor(new Date(y, m - 1, d, h).getTime() / 1000)

describe('usePhotoLibrary', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.resetModules()
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const load = async () => {
    const mod = await import('../composables/usePhotoLibrary')
    return mod.usePhotoLibrary()
  }

  it('maps API assets to photos and flags videos', async () => {
    fetchMock.mockResolvedValue(response({ assets: [asset({ mediaType: 'video', archived: true })] }))
    const lib = await load()

    await lib.init()

    expect(lib.photos.value).toHaveLength(1)
    expect(lib.photos.value[0]).toMatchObject({
      id: 1,
      name: 'a.jpg',
      path: '/photos/a.jpg',
      mediaType: 'video',
      isVideo: true,
      archived: true
    })
  })

  it('requests the first page with the page size and the bearer token', async () => {
    fetchMock.mockResolvedValue(response({ assets: [asset()] }))
    const lib = await load()

    await lib.init()

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(`/ocphotos-api/api/assets?limit=${PAGE_SIZE}`)
    expect(init.headers.Authorization).toBe('Bearer test-token')
  })

  it('uses the last loaded photo as keyset cursor on the next page', async () => {
    fetchMock
      .mockResolvedValueOnce(response({ assets: page(PAGE_SIZE) }))
      .mockResolvedValueOnce(response({ assets: page(1) }))
    const lib = await load()

    await lib.init()
    expect(lib.exhausted.value).toBe(false)

    await lib.loadMore()

    const url = fetchMock.mock.calls[1][0] as string
    expect(url).toContain(`before_taken=${1700000000 + PAGE_SIZE - 1}`)
    expect(url).toContain(`before_id=${PAGE_SIZE}`)
  })

  it('marks the timeline as exhausted when a page is short', async () => {
    fetchMock.mockResolvedValue(response({ assets: page(PAGE_SIZE - 1) }))
    const lib = await load()

    await lib.init()

    expect(lib.exhausted.value).toBe(true)
  })

  it('rewinds to just before the requested timestamp', async () => {
    fetchMock.mockResolvedValue(response({ assets: page(1) }))
    const lib = await load()

    await lib.jumpTo(1600000000)

    const url = fetchMock.mock.calls[0][0] as string
    expect(url).toContain('before_taken=1600000001')
    expect(url).toContain(`before_id=${2 ** 62 - 1}`)
    expect(lib.startAt.value).toBe(1600000000)
  })

  it('records the error and stops loading when the service fails', async () => {
    fetchMock.mockResolvedValue(response({}, false, 500))
    const lib = await load()

    await lib.init()

    expect(lib.error.value).toBe('/api/assets?limit=300 -> 500')
    expect(lib.loading.value).toBe(false)
  })

  it('groups photos by local day, newest day first', async () => {
    fetchMock.mockResolvedValue(
      response({
        assets: [
          asset({ id: 1, takenAt: tsOf(2024, 5, 10) }),
          asset({ id: 2, takenAt: tsOf(2024, 5, 12) }),
          asset({ id: 3, takenAt: tsOf(2024, 5, 12, 18) })
        ]
      })
    )
    const lib = await load()

    await lib.init()

    expect(lib.days.value.map((d) => d.key)).toEqual(['2024-05-12', '2024-05-10'])
    expect(lib.days.value[0].photos.map((p) => p.id)).toEqual([2, 3])
    expect(lib.days.value[0].date).toBeInstanceOf(Date)
  })

  it('groups days by month with a year label', async () => {
    fetchMock.mockResolvedValue(
      response({
        assets: [asset({ id: 1, takenAt: tsOf(2024, 5, 10) }), asset({ id: 2, takenAt: tsOf(2024, 6, 1) })]
      })
    )
    const lib = await load()

    await lib.init()

    expect(lib.months.value.map((m) => m.key)).toEqual(['2024-06', '2024-05'])
    expect(lib.months.value[0].label).toContain('2024')
    expect(lib.months.value[0].days[0].key).toBe('2024-06-01')
  })

  it('resolves an open-with target from the files context', async () => {
    fetchMock.mockResolvedValue(response({ asset: asset({ id: 5 }) }))
    const lib = await load()

    const photo = await lib.resolveFromFiles('personal/Fotos/IMG.jpg', 'file-9')

    expect(photo).toMatchObject({ id: 5 })
    const url = fetchMock.mock.calls[0][0] as string
    expect(url).toContain('driveAliasAndItem=personal%2FFotos%2FIMG.jpg')
    expect(url).toContain('fileId=file-9')
  })

  it('returns null when the open-with target is not indexed', async () => {
    fetchMock.mockResolvedValue(response({}, false, 404))
    const lib = await load()

    await expect(lib.resolveFromFiles('personal/Fotos/IMG.jpg')).resolves.toBeNull()
  })
})
