import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import { AssetImage } from './AssetImage'
import { clearImageCache } from '@/lib/images'

const h = vi.hoisted(() => ({ serviceToken: 'tok' }))

vi.mock('@/hooks/useStore', () => ({ useStore: () => ({ serviceToken: h.serviceToken }) }))

beforeEach(() => {
  clearImageCache()
  h.serviceToken = 'tok'
  let created = 0
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    writable: true,
    value: vi.fn(() => `blob:${++created}`),
  })
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, writable: true, value: vi.fn() })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('AssetImage', () => {
  it('pinta las URLs ajenas al servicio tal cual', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    render(<AssetImage src="https://picsum.photos/seed/a/400/400" alt="a.jpg" />)

    expect(screen.getByAltText('a.jpg').getAttribute('src')).toBe('https://picsum.photos/seed/a/400/400')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('descarga la ruta del servicio con el bearer y pinta el blob', async () => {
    const fetchMock = vi.fn(() => Promise.resolve({ ok: true, blob: () => Promise.resolve(new Blob(['x'])) }))
    vi.stubGlobal('fetch', fetchMock)

    render(<AssetImage src="/api/assets/3/thumb?w=400" alt="tres.jpg" />)
    expect(screen.getByAltText('tres.jpg').getAttribute('src')).toBeNull()

    await waitFor(() => expect(screen.getByAltText('tres.jpg').getAttribute('src')).toBe('blob:1'))
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/assets/3/thumb?w=400')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok')
  })

  it('se queda sin src si la descarga falla, sin romper el resto', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: false, status: 401 })))

    render(<AssetImage src="/api/assets/4/thumb?w=400" alt="cuatro.jpg" />)
    await Promise.resolve()
    await Promise.resolve()

    expect(screen.getByAltText('cuatro.jpg').getAttribute('src')).toBeNull()
  })

  it('no pinta el blob de la foto anterior al cambiar de imagen', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, blob: () => Promise.resolve(new Blob(['x'])) })))

    const { rerender } = render(<AssetImage src="/api/assets/1/thumb?w=400" alt="uno.jpg" />)
    await waitFor(() => expect(screen.getByAltText('uno.jpg').getAttribute('src')).toBe('blob:1'))

    rerender(<AssetImage src="/api/assets/2/thumb?w=400" alt="dos.jpg" />)
    await waitFor(() => expect(screen.getByAltText('dos.jpg').getAttribute('src')).toBe('blob:2'))
  })

  it('aplica la clase, el alt y el modo de carga que recibe', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, blob: () => Promise.resolve(new Blob(['x'])) })))

    render(<AssetImage src="/api/assets/5/thumb?w=400" alt="cinco.jpg" className="h-full" loading="lazy" />)
    const img = screen.getByAltText('cinco.jpg')
    expect(img.className).toBe('h-full')
    expect(img.getAttribute('loading')).toBe('lazy')
    await waitFor(() => expect(img.getAttribute('src')).toBe('blob:1'))
  })
})
