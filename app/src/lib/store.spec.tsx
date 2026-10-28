import { describe, expect, it, vi, beforeEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { StoreProvider } from './store'
import { useStore } from '@/hooks/useStore'
import type { PhotoAsset } from './types'

const oc = vi.hoisted(() => ({
  listDrives: vi.fn(),
  listFolder: vi.fn(),
  walk: vi.fn(),
  entriesToAssets: vi.fn(),
}))

vi.mock('./opencloud', () => ({
  OpenCloudClient: class {
    listDrives = oc.listDrives
    listFolder = oc.listFolder
    walk = oc.walk
    thumbUrl = () => ''
    downloadUrl = () => ''
  },
  entriesToAssets: oc.entriesToAssets,
}))

const fetchMock = vi.fn()

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response
}

function serviceAsset(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1,
    path: '/Fotos/playa.jpg',
    filename: 'playa.jpg',
    mediaType: 'image',
    takenAt: 1722796200,
    width: 4032,
    height: 3024,
    size: 2048,
    favorite: false,
    ...over,
  }
}

function photoAsset(over: Partial<PhotoAsset> = {}): PhotoAsset {
  return {
    id: 'a1',
    path: '/Fotos/a1.jpg',
    filename: 'a1.jpg',
    takenAt: new Date('2024-08-04T18:30:00Z'),
    width: 1600,
    height: 1200,
    thumbUrl: '',
    fullUrl: '',
    isVideo: false,
    personIds: [],
    favorite: false,
    ...over,
  }
}

function wrapper({ children }: { children: ReactNode }) {
  return <StoreProvider>{children}</StoreProvider>
}

async function mountStore() {
  const hook = renderHook(() => useStore(), { wrapper })
  await act(async () => {
    await Promise.resolve()
  })
  return hook
}

beforeEach(() => {
  localStorage.clear()
  oc.listDrives.mockReset()
  oc.listFolder.mockReset()
  oc.walk.mockReset()
  oc.entriesToAssets.mockReset()
  fetchMock.mockReset()
  fetchMock.mockResolvedValue(jsonResponse({}, 404))
  vi.stubGlobal('fetch', fetchMock)
})

describe('store in demo mode', () => {
  it('starts with the generated demo library', async () => {
    const { result } = await mountStore()

    expect(result.current.mode).toBe('demo')
    expect(result.current.assets.length).toBeGreaterThan(0)
    expect(result.current.people.length).toBeGreaterThan(0)
    expect(result.current.albums.length).toBeGreaterThan(0)
    expect(result.current.view).toBe('fotos')
    expect(result.current.connection.status).toBe('idle')
    expect(result.current.hasMore).toBe(false)
    expect(result.current.stats).toBeNull()
    expect(result.current.serviceToken).toBe('')
  })

  it('switch view and filter by query and person', async () => {
    const { result } = await mountStore()

    act(() => result.current.setView('mapa'))
    expect(result.current.view).toBe('mapa')

    act(() => result.current.setQuery('zzzz-no-existe'))
    expect(result.current.filteredAssets).toEqual([])
    act(() => result.current.setQuery(''))

    const person = result.current.people[0].id
    act(() => result.current.setPersonFilter(person))
    expect(result.current.filteredAssets.every((a) => a.personIds.includes(person))).toBe(true)
    act(() => result.current.setPersonFilter(null))
    expect(result.current.filteredAssets.length).toBe(result.current.assets.length)
  })

  it('filter locally by filename, camera, place and path', async () => {
    const { result } = await mountStore()
    const withCamera = result.current.assets.find((a) => a.camera && a.camera.length > 3)
    expect(withCamera).toBeDefined()

    act(() => result.current.setQuery(withCamera!.camera!.slice(0, 4).toLowerCase()))
    expect(result.current.filteredAssets.map((a) => a.id)).toContain(withCamera!.id)
  })

  it('group the filtered assets by day, newest first', async () => {
    const { result } = await mountStore()
    const days = result.current.days

    expect(days.length).toBeGreaterThan(0)
    expect(days[0].assets[0].takenAt.getTime()).toBeGreaterThanOrEqual(days[days.length - 1].assets[0].takenAt.getTime())
    for (const day of days) {
      expect(day.key).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })

  it('open and close the viewer', async () => {
    const { result } = await mountStore()
    const list = result.current.assets.slice(0, 3)

    act(() => result.current.openViewer(list, 2))
    expect(result.current.viewerIndex).toBe(2)
    expect(result.current.viewerList).toBe(list)

    act(() => result.current.closeViewer())
    expect(result.current.viewerIndex).toBeNull()
    expect(result.current.viewerList).toEqual([])
  })

  it('toggle a favorite locally, without talking to the API', async () => {
    const { result } = await mountStore()
    const target = result.current.assets[0]

    act(() => result.current.toggleFavorite(target.id))

    expect(result.current.assets[0].favorite).toBe(!target.favorite)
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/favorite'))).toBe(false)
  })

  it('restore the demo library on disconnect', async () => {
    const { result } = await mountStore()
    localStorage.setItem('ocm-connection', '{"mode":"opencloud"}')
    localStorage.setItem('ocm-service-token', 'tok')

    act(() => result.current.disconnect())

    expect(result.current.mode).toBe('demo')
    expect(localStorage.getItem('ocm-connection')).toBeNull()
    expect(localStorage.getItem('ocm-service-token')).toBeNull()
  })
})

describe('store in service mode', () => {
  it('connect to the photos service and map the first page', async () => {
    let serviceUp = false
    fetchMock.mockImplementation((url: string) => {
      if (url === '/api/stats') {
        return Promise.resolve(serviceUp ? jsonResponse({ assets: 2, folders: 1 }) : jsonResponse({}, 404))
      }
      if (String(url).startsWith('/api/assets?')) {
        return Promise.resolve(jsonResponse({ assets: [serviceAsset(), serviceAsset({ id: 2, mediaType: 'video' })] }))
      }
      return Promise.resolve(jsonResponse({}, 404))
    })
    const { result } = await mountStore()
    serviceUp = true

    await act(async () => {
      await result.current.connectService('tok-123')
    })

    expect(result.current.mode).toBe('service')
    expect(result.current.stats).toEqual({ assets: 2, folders: 1 })
    expect(result.current.serviceToken).toBe('tok-123')
    expect(localStorage.getItem('ocm-service-token')).toBe('tok-123')
    expect(result.current.connection.status).toBe('ok')
    expect(result.current.connection.message).toContain('2 fotos indexadas')

    const first = result.current.assets[0]
    expect(first.id).toBe('1')
    expect(first.takenAt.toISOString()).toBe(new Date(1722796200 * 1000).toISOString())
    expect(first.thumbUrl).toBe('/api/assets/1/thumb?w=400&token=tok-123')
    expect(first.fullUrl).toBe('/api/assets/1/original?token=tok-123')
    expect(result.current.assets[1].isVideo).toBe(true)

    const statsCalls = fetchMock.mock.calls.filter(([url]) => url === '/api/stats')
    const statsCall = statsCalls[statsCalls.length - 1]
    expect((statsCall[1] as RequestInit).headers).toMatchObject({ Authorization: 'Bearer tok-123' })
  })

  it('report a failing service connection and stay in demo mode', async () => {
    fetchMock.mockImplementation((url: string) => Promise.resolve(jsonResponse({}, url === '/api/stats' ? 502 : 404)))
    const { result } = await mountStore()

    await act(async () => {
      await result.current.connectService('tok')
    })

    expect(result.current.mode).toBe('demo')
    expect(result.current.connection.status).toBe('error')
    expect(result.current.connection.message).toBe('API respondió 502')
  })

  it('paginate with the keyset cursor of the last asset', async () => {
    const firstPage = Array.from({ length: 600 }, (_, i) =>
      serviceAsset({ id: 1000 - i, takenAt: 1722796200 - i, filename: `f${i}.jpg` }),
    )
    const secondPage = [serviceAsset({ id: 400, takenAt: 1722795600, filename: 'last.jpg' })]
    let call = 0
    let serviceUp = false
    fetchMock.mockImplementation((url: string) => {
      if (url === '/api/stats') return Promise.resolve(serviceUp ? jsonResponse({ assets: 601 }) : jsonResponse({}, 404))
      if (String(url).startsWith('/api/assets?')) {
        call += 1
        return Promise.resolve(jsonResponse({ assets: call === 1 ? firstPage : secondPage }))
      }
      return Promise.resolve(jsonResponse({}, 404))
    })
    const { result } = await mountStore()
    serviceUp = true

    await act(async () => {
      await result.current.connectService('tok')
    })
    expect(result.current.hasMore).toBe(true)
    expect(result.current.assets).toHaveLength(600)

    await act(async () => {
      result.current.loadMore()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(result.current.assets).toHaveLength(601)
    expect(result.current.hasMore).toBe(false)

    const pages = fetchMock.mock.calls.filter(([url]) => String(url).startsWith('/api/assets?'))
    expect(String(pages[1][0])).toContain('before_taken=1722795601')
    expect(String(pages[1][0])).toContain('before_id=401')
  })

  it('send a favorite to the service in service mode', async () => {
    let serviceUp = false
    fetchMock.mockImplementation((url: string) => {
      if (url === '/api/stats') return Promise.resolve(serviceUp ? jsonResponse({ assets: 1 }) : jsonResponse({}, 404))
      if (String(url).startsWith('/api/assets?')) return Promise.resolve(jsonResponse({ assets: [serviceAsset()] }))
      return Promise.resolve(jsonResponse({ ok: true }))
    })
    const { result } = await mountStore()
    serviceUp = true

    await act(async () => {
      await result.current.connectService('tok')
    })
    const target = result.current.assets[0]
    await act(async () => {
      result.current.toggleFavorite(target.id)
      await Promise.resolve()
    })

    const favoriteCall = fetchMock.mock.calls.find(([url]) => String(url).includes('/favorite'))!
    expect(favoriteCall[0]).toBe('/api/assets/1/favorite')
    expect((favoriteCall[1] as RequestInit).method).toBe('POST')
    expect(JSON.parse(String((favoriteCall[1] as RequestInit).body))).toEqual({ favorite: true })
    expect(result.current.assets[0].favorite).toBe(true)
  })

  it('reload the first page when the query changes', async () => {
    let serviceUp = false
    fetchMock.mockImplementation((url: string) => {
      if (url === '/api/stats') return Promise.resolve(serviceUp ? jsonResponse({ assets: 1 }) : jsonResponse({}, 404))
      if (String(url).startsWith('/api/assets?')) return Promise.resolve(jsonResponse({ assets: [serviceAsset()] }))
      return Promise.resolve(jsonResponse({}, 404))
    })
    const { result } = await mountStore()
    serviceUp = true
    await act(async () => {
      await result.current.connectService('tok')
    })
    // the mode switch schedules a reload of its own: let it fire before measuring
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 350))
    })
    fetchMock.mockClear()

    vi.useFakeTimers()
    try {
      act(() => {
        result.current.setQuery('playa')
      })
      await act(async () => {
        await vi.advanceTimersByTimeAsync(320)
      })
    } finally {
      vi.useRealTimers()
    }

    const pages = fetchMock.mock.calls.filter(([url]) => String(url).startsWith('/api/assets?'))
    expect(pages).toHaveLength(1)
    expect(String(pages[0][0])).toContain('q=playa')
    expect(String(pages[0][0])).not.toContain('before_taken')
  })

  it('ignore loadMore when there is nothing more to load', async () => {
    let serviceUp = false
    fetchMock.mockImplementation((url: string) => {
      if (url === '/api/stats') return Promise.resolve(serviceUp ? jsonResponse({ assets: 1 }) : jsonResponse({}, 404))
      return Promise.resolve(jsonResponse({ assets: [serviceAsset()] }))
    })
    const { result } = await mountStore()
    serviceUp = true
    await act(async () => {
      await result.current.connectService('tok')
    })
    const before = fetchMock.mock.calls.length

    await act(async () => {
      result.current.loadMore()
      await Promise.resolve()
    })

    expect(fetchMock.mock.calls.length).toBe(before)
  })
})

describe('store in opencloud mode', () => {
  it('index the personal space through the browser', async () => {
    oc.listDrives.mockResolvedValue([{ id: 'a', name: 'Personal', driveType: 'personal', webdavUrl: 'https://x/dav/a' }])
    oc.listFolder.mockResolvedValue([])
    oc.walk.mockImplementation(async function* () {
      yield { path: '/Fotos/a.jpg', entry: {} }
    })
    oc.entriesToAssets.mockReturnValue([photoAsset()])
    const { result } = await mountStore()

    await act(async () => {
      await result.current.connect('https://x', 'nacho', 'tok')
    })

    expect(result.current.mode).toBe('opencloud')
    expect(result.current.connection.status).toBe('ok')
    expect(result.current.connection.message).toBe('1 fotos indexadas desde Personal')
    expect(result.current.assets).toEqual([photoAsset()])
    expect(JSON.parse(localStorage.getItem('ocm-connection')!)).toMatchObject({
      mode: 'opencloud',
      baseUrl: 'https://x',
      username: 'nacho',
    })
  })

  it('fall back to the space root when there is no Fotos folder', async () => {
    oc.listDrives.mockResolvedValue([{ id: 'a', name: 'Personal', driveType: 'personal', webdavUrl: 'https://x/dav/a' }])
    oc.listFolder.mockRejectedValueOnce(new Error('Carpeta no encontrada'))
    oc.listFolder.mockResolvedValueOnce([])
    oc.walk.mockImplementation(async function* () {
      yield { path: '/a.jpg', entry: {} }
    })
    oc.entriesToAssets.mockReturnValue([photoAsset()])
    const { result } = await mountStore()

    await act(async () => {
      await result.current.connect('https://x', 'nacho', 'tok')
    })

    expect(oc.listFolder).toHaveBeenCalledTimes(1)
    expect(oc.listFolder).toHaveBeenCalledWith('https://x/dav/a', 'Fotos')
    expect(oc.walk).toHaveBeenCalledWith('https://x/dav/a', '')
    expect(result.current.mode).toBe('opencloud')
  })

  it('explain a failed connection with the CORS hint', async () => {
    oc.listDrives.mockRejectedValue(new Error('Graph API respondió 401'))
    const { result } = await mountStore()

    await act(async () => {
      await result.current.connect('https://x', 'nacho', 'tok')
    })

    expect(result.current.mode).toBe('demo')
    expect(result.current.connection.status).toBe('error')
    expect(result.current.connection.message).toContain('Graph API respondió 401')
    expect(result.current.connection.message).toContain('OC_CORS_ALLOW_ORIGINS')
  })

  it('report an empty space', async () => {
    oc.listDrives.mockResolvedValue([{ id: 'a', name: 'Personal', driveType: 'personal', webdavUrl: 'https://x/dav/a' }])
    oc.listFolder.mockResolvedValue([])
    oc.walk.mockImplementation(async function* () {
      // sin elementos
    })
    const { result } = await mountStore()

    await act(async () => {
      await result.current.connect('https://x', 'nacho', 'tok')
    })

    expect(result.current.connection.message).toContain('No se encontraron fotos en el espacio')
  })
})
