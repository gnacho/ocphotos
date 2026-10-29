import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { clearImageCache, isServiceUrl, loadImageUrl } from './images'

function ok(blob = new Blob(['x'])) {
  return { ok: true, blob: () => Promise.resolve(blob) }
}

beforeEach(() => {
  clearImageCache()
  let created = 0
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    writable: true,
    value: vi.fn(() => `blob:${++created}`),
  })
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, writable: true, value: vi.fn() })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('images', () => {
  it('solo considera del servicio las rutas que empiezan por /api/', () => {
    expect(isServiceUrl('/api/assets/1/thumb?w=400')).toBe(true)
    expect(isServiceUrl('/api/assets/1/original')).toBe(true)
    expect(isServiceUrl('https://picsum.photos/seed/x/400/400')).toBe(false)
    expect(isServiceUrl('/assets/apps/ocphotos/js/x.mjs')).toBe(false)
  })

  it('devuelve tal cual las URLs que no son del servicio, sin pedir nada', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await expect(loadImageUrl('https://example.test/a.jpg', 'tok')).resolves.toBe('https://example.test/a.jpg')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('descarga la ruta del servicio con el bearer y devuelve el object URL', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(ok()))
    vi.stubGlobal('fetch', fetchMock)

    await expect(loadImageUrl('/api/assets/7/thumb?w=400', 'tok-1')).resolves.toBe('blob:1')

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/assets/7/thumb?w=400')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok-1')
  })

  it('no manda la cabecera cuando no hay token', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(ok()))
    vi.stubGlobal('fetch', fetchMock)

    await loadImageUrl('/api/assets/7/thumb?w=400', '')

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(init.headers).toEqual({})
  })

  it('devuelve cadena vacía cuando el servicio responde con error', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: false, status: 401 })))
    await expect(loadImageUrl('/api/assets/7/thumb?w=400', 'tok')).resolves.toBe('')
  })

  it('devuelve cadena vacía si la descarga falla de red', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))))
    await expect(loadImageUrl('/api/assets/7/thumb?w=400', 'tok')).resolves.toBe('')
  })

  it('cachea por URL: la segunda llamada no vuelve a pedir', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(ok()))
    vi.stubGlobal('fetch', fetchMock)

    const first = await loadImageUrl('/api/assets/7/thumb?w=400', 'tok')
    const second = await loadImageUrl('/api/assets/7/thumb?w=400', 'tok')
    const other = await loadImageUrl('/api/assets/7/thumb?w=100', 'tok')

    expect(first).toBe(second)
    expect(other).not.toBe(first)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('comparte la misma descarga cuando dos componentes piden a la vez', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(ok()))
    vi.stubGlobal('fetch', fetchMock)

    const [a, b] = await Promise.all([
      loadImageUrl('/api/assets/9/thumb?w=400', 'tok'),
      loadImageUrl('/api/assets/9/thumb?w=400', 'tok'),
    ])

    expect(a).toBe(b)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('al limpiar la caché revoca los blobs y vuelve a descargar', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(ok()))
    vi.stubGlobal('fetch', fetchMock)

    await loadImageUrl('/api/assets/7/thumb?w=400', 'tok')
    clearImageCache()
    await loadImageUrl('/api/assets/7/thumb?w=400', 'tok')

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:1')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('no cachea el fallo, así que el siguiente intento reintenta', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce(ok())
    vi.stubGlobal('fetch', fetchMock)

    await expect(loadImageUrl('/api/assets/7/thumb?w=400', 'tok')).resolves.toBe('')
    await expect(loadImageUrl('/api/assets/7/thumb?w=400', 'tok')).resolves.toBe('blob:1')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
