import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@opencloud-eu/web-pkg', () => ({
  useAuthStore: () => ({ accessToken: 'test-token' })
}))

// El stream de avisos se sustituye por un doble: aquí se prueba la reacción a
// sus eventos, no el transporte (useLiveUpdates.spec.ts cubre el transporte).
const live = vi.hoisted(() => {
  const state = {
    started: [] as { path: string; getToken: () => string; onChange: (e: unknown) => void; onReconnect?: () => void }[],
    stopped: 0
  }
  return {
    state,
    start: vi.fn((options: (typeof state.started)[number]) => {
      state.started.push(options)
      return () => {
        state.stopped += 1
      }
    })
  }
})

vi.mock('./useLiveUpdates', () => ({
  CLIENT_ID: 'this-tab',
  CLIENT_HEADER: 'X-Ocapps-Client',
  startLiveUpdates: live.start
}))

const response = (body: unknown, ok = true, status = 200) =>
  ({ ok, status, json: () => Promise.resolve(body) }) as unknown as Response

const blobResponse = (size: number) =>
  ({ ok: true, status: 200, blob: () => Promise.resolve({ size, type: 'image/jpeg' }) }) as unknown as Response

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

const photo = (over: Record<string, unknown> = {}) => ({
  id: 1,
  path: '/photos/a.jpg',
  name: 'a.jpg',
  mediaType: 'image',
  isVideo: false,
  takenAt: 1700000000,
  width: 4000,
  height: 3000,
  size: 1234,
  favorite: false,
  archived: false,
  ...over
})

describe('usePhotoLibrary API client', () => {
  let fetchMock: ReturnType<typeof vi.fn>
  let created: number

  beforeEach(() => {
    vi.resetModules()
    live.state.started.length = 0
    live.state.stopped = 0
    live.start.mockClear()
    fetchMock = vi.fn()
    created = 0
    vi.stubGlobal('fetch', fetchMock)
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      writable: true,
      value: vi.fn(() => `blob:${++created}`)
    })
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  const load = async () => {
    const mod = await import('../composables/usePhotoLibrary')
    return mod.usePhotoLibrary()
  }

  const urls = () => fetchMock.mock.calls.map((call) => String(call[0]))
  const initOf = (call: number) => (fetchMock.mock.calls[call]?.[1] ?? {}) as RequestInit
  const bodyOf = (call: number) => JSON.parse(String(initOf(call).body))

  it('prefixes the service base, sends the bearer token and reports non-2xx failures', async () => {
    fetchMock.mockResolvedValueOnce(response({ tags: [] }))
    fetchMock.mockResolvedValueOnce(response({}, false, 503))
    const lib = await load()

    await lib.fetchTags()
    await expect(lib.fetchTags()).rejects.toThrow('/api/tags -> 503')

    expect(urls()[0]).toBe('/ocphotos-api/api/tags')
    expect((initOf(0).headers as Record<string, string>).Authorization).toBe('Bearer test-token')
  })

  it('posts the archive flag', async () => {
    fetchMock.mockResolvedValue(response({}))
    const lib = await load()

    await lib.setArchived(9, true)

    expect(urls()[0]).toBe('/ocphotos-api/api/assets/9/archive')
    expect(initOf(0).method).toBe('POST')
    expect(bodyOf(0)).toEqual({ archived: true })
  })

  it('flips the favorite flag locally and persists the new value', async () => {
    fetchMock.mockResolvedValue(response({}))
    const lib = await load()
    const item = photo({ favorite: false })

    await lib.toggleFavorite(item)

    expect(bodyOf(0)).toEqual({ favorite: true })
    expect(item.favorite).toBe(true)
  })

  it('lists archived photos with the archived filter', async () => {
    fetchMock.mockResolvedValue(response({ assets: [asset({ archived: true })] }))
    const lib = await load()

    const list = await lib.fetchArchived()

    expect(urls()[0]).toBe('/ocphotos-api/api/assets?archived=1&limit=2000')
    expect(list[0].archived).toBe(true)
  })

  it('lists favorites with the favorites filter', async () => {
    fetchMock.mockResolvedValue(response({ assets: [asset({ favorite: true })] }))
    const lib = await load()

    const list = await lib.fetchFavorites()

    expect(urls()[0]).toBe('/ocphotos-api/api/assets?favorites=1&limit=2000')
    expect(list[0].favorite).toBe(true)
  })

  it('maps duplicate groups and defaults the pending count', async () => {
    fetchMock.mockResolvedValueOnce(response({ groups: [[asset({ id: 1 }), asset({ id: 2 })]] }))
    const lib = await load()

    const result = await lib.fetchDuplicates()

    expect(result.groups).toHaveLength(1)
    expect(result.groups[0].map((p) => p.id)).toEqual([1, 2])
    expect(result.pending).toBe(0)
  })

  it('returns the calendar years, or an empty list when the payload has none', async () => {
    fetchMock.mockResolvedValueOnce(response({ years: [{ year: 2024, count: 3, months: [] }] }))
    fetchMock.mockResolvedValueOnce(response({}))
    const lib = await load()

    expect(await lib.fetchCalendar()).toEqual([{ year: 2024, count: 3, months: [] }])
    expect(await lib.fetchCalendar()).toEqual([])
    expect(urls()[0]).toBe('/ocphotos-api/api/timeline/calendar')
  })

  it('maps the geo feed', async () => {
    fetchMock.mockResolvedValue(response({ assets: [asset({ lat: 43.3, lon: -8.1 })] }))
    const lib = await load()

    const list = await lib.fetchGeo()

    expect(list[0]).toMatchObject({ lat: 43.3, lon: -8.1 })
  })

  it('asks for on-this-day photos with the requested window', async () => {
    fetchMock.mockResolvedValue(response({ assets: [asset()] }))
    const lib = await load()

    await lib.fetchOnThisDay(5)

    expect(urls()[0]).toBe('/ocphotos-api/api/memories/on-this-day?days=5')
  })

  it('reads highlights and defaults the scope to oldest', async () => {
    fetchMock.mockResolvedValueOnce(response({ assets: [asset()] }))
    fetchMock.mockResolvedValueOnce(response({ scope: 'same-day', assets: [] }))
    const lib = await load()

    expect((await lib.fetchHighlights()).scope).toBe('oldest')
    expect((await lib.fetchHighlights()).scope).toBe('same-day')
  })

  it('encodes the search query', async () => {
    fetchMock.mockResolvedValue(response({ assets: [asset()] }))
    const lib = await load()

    await lib.searchAssets('playa de día')

    expect(urls()[0]).toBe('/ocphotos-api/api/assets?limit=500&q=playa%20de%20d%C3%ADa')
  })

  it('lists albums and tolerates a payload without albums', async () => {
    fetchMock.mockResolvedValueOnce(response({ albums: [{ id: 3, name: 'Trip', count: 2 }] }))
    fetchMock.mockResolvedValueOnce(response({}))
    const lib = await load()

    expect(await lib.fetchAlbums()).toEqual([{ id: 3, name: 'Trip', count: 2 }])
    expect(await lib.fetchAlbums()).toEqual([])
  })

  it('creates an album and returns the new id', async () => {
    fetchMock.mockResolvedValue(response({ id: 42 }))
    const lib = await load()

    const id = await lib.createAlbum('Summer')

    expect(urls()[0]).toBe('/ocphotos-api/api/albums')
    expect(initOf(0).method).toBe('POST')
    expect(bodyOf(0)).toEqual({ name: 'Summer' })
    expect(id).toBe(42)
  })

  it('renames an album with a patch', async () => {
    fetchMock.mockResolvedValue(response({}))
    const lib = await load()

    await lib.renameAlbum(7, 'Winter')

    expect(urls()[0]).toBe('/ocphotos-api/api/albums/7')
    expect(initOf(0).method).toBe('PATCH')
    expect(bodyOf(0)).toEqual({ name: 'Winter' })
  })

  it('deletes an album', async () => {
    fetchMock.mockResolvedValue(response({}))
    const lib = await load()

    await lib.deleteAlbum(7)

    expect(urls()[0]).toBe('/ocphotos-api/api/albums/7')
    expect(initOf(0).method).toBe('DELETE')
  })

  it('lists the assets of an album', async () => {
    fetchMock.mockResolvedValue(response({ assets: [asset()] }))
    const lib = await load()

    const list = await lib.albumAssets(7)

    expect(urls()[0]).toBe('/ocphotos-api/api/albums/7/assets')
    expect(list).toHaveLength(1)
  })

  it('adds assets to an album', async () => {
    fetchMock.mockResolvedValue(response({}))
    const lib = await load()

    await lib.addToAlbum(7, [1, 2])

    expect(initOf(0).method).toBe('POST')
    expect(bodyOf(0)).toEqual({ assetIds: [1, 2] })
  })

  it('removes one asset from an album', async () => {
    fetchMock.mockResolvedValue(response({}))
    const lib = await load()

    await lib.removeFromAlbum(7, 4)

    expect(urls()[0]).toBe('/ocphotos-api/api/albums/7/assets/4')
    expect(initOf(0).method).toBe('DELETE')
  })

  it('crosses albums and their assets to find the memberships of one photo', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (String(url).endsWith('/api/albums')) {
        return Promise.resolve(
          response({
            albums: [
              { id: 1, name: 'One', count: 1 },
              { id: 2, name: 'Two', count: 1 }
            ]
          })
        )
      }
      const id = String(url).includes('/albums/1/') ? 1 : 2
      return Promise.resolve(response({ assets: [asset({ id: id === 1 ? 5 : 6 })] }))
    })
    const lib = await load()

    const albums = await lib.albumsOfAsset(5)

    expect(albums).toEqual([{ id: 1, name: 'One', count: 1 }])
  })

  it('lists tags and the photos of a tag, encoding its name', async () => {
    fetchMock.mockResolvedValueOnce(response({ tags: [{ name: 'beach', count: 2 }] }))
    fetchMock.mockResolvedValueOnce(response({ assets: [asset()] }))
    const lib = await load()

    expect(await lib.fetchTags()).toEqual([{ name: 'beach', count: 2 }])
    expect(await lib.tagAssets('dos palabras')).toHaveLength(1)
    expect(urls()[1]).toBe('/ocphotos-api/api/tags/dos%20palabras/assets')
  })

  it('reads, adds and removes the tags of one photo', async () => {
    fetchMock.mockResolvedValueOnce(response({ tags: ['beach'] }))
    fetchMock.mockResolvedValueOnce(response({}))
    fetchMock.mockResolvedValueOnce(response({}))
    const lib = await load()

    expect(await lib.assetTags(9)).toEqual(['beach'])
    await lib.addTag(9, 'sunset')
    await lib.removeTag(9, 'two words')

    expect(bodyOf(1)).toEqual({ tag: 'sunset' })
    expect(urls()[2]).toBe('/ocphotos-api/api/assets/9/tags/two%20words')
    expect(initOf(2).method).toBe('DELETE')
  })

  it('defaults the tags of a photo to an empty list', async () => {
    fetchMock.mockResolvedValue(response({}))
    const lib = await load()

    expect(await lib.assetTags(9)).toEqual([])
  })

  it('lists a folder, encoding its path', async () => {
    fetchMock.mockResolvedValueOnce(response({ path: 'Fotos/2024', folders: [{ name: 'a', path: 'a', count: 1 }], assets: [asset()] }))
    fetchMock.mockResolvedValueOnce(response({}))
    const lib = await load()

    const listing = await lib.fetchFolder('Fotos/2024')
    const empty = await lib.fetchFolder()

    expect(urls()[0]).toBe('/ocphotos-api/api/folders?path=Fotos%2F2024')
    expect(listing.path).toBe('Fotos/2024')
    expect(listing.folders).toHaveLength(1)
    expect(listing.assets).toHaveLength(1)
    expect(empty).toEqual({ path: '', folders: [], assets: [] })
  })

  it('lists places and narrows the assets of one place by rounded coordinates', async () => {
    fetchMock.mockResolvedValueOnce(response({ places: [{ lat: 43.3, lon: -8.1, count: 1, coverId: 1 }] }))
    fetchMock.mockResolvedValueOnce(
      response({
        assets: [
          asset({ id: 1, lat: 43.301, lon: -8.099 }),
          asset({ id: 2, lat: 43.4, lon: -8.1 }),
          asset({ id: 3 })
        ]
      })
    )
    const lib = await load()

    expect(await lib.fetchPlaces()).toHaveLength(1)
    const near = await lib.placeAssets(43.3, -8.1)
    expect(near.map((p) => p.id)).toEqual([1])
  })

  it('caches previews per photo and size', async () => {
    fetchMock.mockResolvedValue(blobResponse(2048))
    const lib = await load()
    const item = photo({ id: 3 })

    const first = await lib.ensurePreview(item, 400)
    const second = await lib.ensurePreview(item, 400)
    const other = await lib.ensurePreview(item, 2048)

    expect(first).toBe('blob:1')
    expect(second).toBe('blob:1')
    expect(other).toBe('blob:2')
    expect(urls()).toEqual([
      '/ocphotos-api/api/assets/3/thumb?w=400',
      '/ocphotos-api/api/assets/3/thumb?w=2048'
    ])
  })

  it('treats an empty thumbnail as a miss and does not cache it', async () => {
    fetchMock.mockResolvedValueOnce(blobResponse(0))
    fetchMock.mockResolvedValueOnce(blobResponse(10))
    const lib = await load()

    expect(await lib.ensurePreview(photo({ id: 3 }), 400)).toBe('')
    expect(await lib.ensurePreview(photo({ id: 3 }), 400)).toBe('blob:1')
  })

  it('returns an empty string when a thumbnail cannot be fetched', async () => {
    fetchMock.mockResolvedValue(response({}, false, 500))
    const lib = await load()

    expect(await lib.ensurePreview(photo({ id: 3 }), 400)).toBe('')
    expect(await lib.ensureOriginal(photo({ id: 3 }))).toBe('')
  })

  it('caches originals per photo', async () => {
    fetchMock.mockResolvedValue(blobResponse(4096))
    const lib = await load()

    const first = await lib.ensureOriginal(photo({ id: 8 }))
    const second = await lib.ensureOriginal(photo({ id: 8 }))

    expect(first).toBe('blob:1')
    expect(second).toBe('blob:1')
    expect(urls()).toEqual(['/ocphotos-api/api/assets/8/original'])
  })

  it('returns the signed video url, or an empty string when missing', async () => {
    fetchMock.mockResolvedValueOnce(response({ url: 'https://v/1.mp4' }))
    fetchMock.mockResolvedValueOnce(response({}))
    const lib = await load()

    expect(await lib.videoUrl(photo({ id: 1 }))).toBe('https://v/1.mp4')
    expect(await lib.videoUrl(photo({ id: 1 }))).toBe('')
    expect(initOf(0).method).toBe('POST')
  })

  it('rescans and reloads even when the scan request fails', async () => {
    fetchMock.mockResolvedValueOnce(response({}, false, 500))
    fetchMock.mockResolvedValueOnce(response({ assets: [asset()] }))
    const lib = await load()
    lib.exhausted.value = true

    await lib.rescan()

    expect(urls()[0]).toBe('/ocphotos-api/api/admin/rescan')
    expect(lib.exhausted.value).toBe(true)
    expect(lib.photos.value).toHaveLength(1)
  })

  it('syncs without a scan when asked, reloading the timeline', async () => {
    fetchMock.mockResolvedValue(response({ assets: [asset()] }))
    const lib = await load()

    await lib.syncNow(false)

    expect(urls()).toEqual(['/ocphotos-api/api/assets?limit=300'])
    expect(lib.photos.value).toHaveLength(1)
  })

  it('scans before syncing, at most once every ten minutes', async () => {
    fetchMock.mockResolvedValue(response({ assets: [asset()] }))
    const lib = await load()

    await lib.syncNow(true)
    expect(urls()[0]).toBe('/ocphotos-api/api/admin/rescan')

    fetchMock.mockClear()
    await lib.syncNow(true)
    expect(urls()).not.toContain('/ocphotos-api/api/admin/rescan')
  })

  it('skips a sync while a page is loading and swallows scan failures', async () => {
    fetchMock.mockRejectedValueOnce(new Error('offline'))
    fetchMock.mockResolvedValue(response({ assets: [] }))
    const lib = await load()

    await expect(lib.syncNow(true)).resolves.toBeUndefined()

    fetchMock.mockClear()
    lib.loading.value = true
    await lib.syncNow(true)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('starts the watcher once: one scan and one live stream, no polling', async () => {
    vi.useFakeTimers()
    fetchMock.mockResolvedValue(response({ assets: [] }))
    const lib = await load()

    lib.startWatching()
    lib.startWatching()
    await vi.advanceTimersByTimeAsync(0)

    expect(live.start).toHaveBeenCalledTimes(1)
    expect(live.state.started[0].path).toBe('/ocphotos-api/api/stream')
    expect(urls()).toEqual(['/ocphotos-api/api/admin/rescan', '/ocphotos-api/api/assets?limit=300'])

    // Ya no hay temporizador: sin avisos no hay tráfico.
    fetchMock.mockClear()
    await vi.advanceTimersByTimeAsync(30000)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('reloads the timeline when the server announces new photos', async () => {
    vi.useFakeTimers()
    fetchMock.mockResolvedValue(response({ assets: [asset()] }))
    const lib = await load()
    lib.startWatching()
    await vi.advanceTimersByTimeAsync(0)

    fetchMock.mockClear()
    live.state.started[0].onChange({ topic: 'photos', client: 'other-tab' })
    await vi.advanceTimersByTimeAsync(600)

    expect(urls()).toEqual(['/ocphotos-api/api/assets?limit=300'])
    expect(lib.photos.value).toHaveLength(1)
  })

  it('ignores its own events, other topics and event bursts', async () => {
    vi.useFakeTimers()
    fetchMock.mockResolvedValue(response({ assets: [] }))
    const lib = await load()
    lib.startWatching()
    await vi.advanceTimersByTimeAsync(0)

    fetchMock.mockClear()
    live.state.started[0].onChange({ topic: 'photos', client: 'this-tab' })
    live.state.started[0].onChange({ topic: 'albums' })
    await vi.advanceTimersByTimeAsync(600)
    expect(fetchMock).not.toHaveBeenCalled()

    // Varios avisos seguidos en la misma ventana = una sola recarga.
    live.state.started[0].onChange({ topic: 'photos' })
    live.state.started[0].onChange({ topic: 'photos' })
    live.state.started[0].onChange({ topic: 'photos' })
    await vi.advanceTimersByTimeAsync(600)
    expect(urls()).toEqual(['/ocphotos-api/api/assets?limit=300'])
  })

  it('syncs again when the stream comes back after a break', async () => {
    vi.useFakeTimers()
    fetchMock.mockResolvedValue(response({ assets: [] }))
    const lib = await load()
    lib.startWatching()
    await vi.advanceTimersByTimeAsync(0)

    fetchMock.mockClear()
    live.state.started[0].onReconnect?.()
    await vi.advanceTimersByTimeAsync(0)

    // El rescan va acotado a 10 minutos: aquí solo recarga.
    expect(urls()).toEqual(['/ocphotos-api/api/assets?limit=300'])
  })

  it('closes the stream and the pending reload when the view goes away', async () => {
    vi.useFakeTimers()
    fetchMock.mockResolvedValue(response({ assets: [] }))
    const lib = await load()
    lib.startWatching()
    await vi.advanceTimersByTimeAsync(0)

    lib.stopWatching()
    expect(live.state.stopped).toBe(1)

    fetchMock.mockClear()
    live.state.started[0].onChange({ topic: 'photos' })
    await vi.advanceTimersByTimeAsync(1000)
    expect(fetchMock).not.toHaveBeenCalled()

    // Y se puede volver a arrancar (al remontar la vista).
    lib.startWatching()
    expect(live.start).toHaveBeenCalledTimes(2)
  })

  it('loads more only while the timeline is not exhausted', async () => {
    fetchMock.mockResolvedValue(response({ assets: [] }))
    const lib = await load()

    await lib.loadMore()
    const calls = fetchMock.mock.calls.length
    lib.exhausted.value = true
    await lib.loadMore()

    expect(fetchMock.mock.calls.length).toBe(calls)
  })

  it('ignores a second init', async () => {
    fetchMock.mockResolvedValue(response({ assets: [asset()] }))
    const lib = await load()

    await lib.init()
    await lib.init()

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
