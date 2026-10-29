import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import type { Album, Person, PhotoAsset } from '@/lib/types'

const h = vi.hoisted(() => ({ store: {} as Record<string, unknown> }))

vi.mock('@/hooks/useStore', () => ({ useStore: () => h.store }))

import { Albums, Carpetas, Favoritos, Personas, Recuerdos } from './Views'

function photo(id: string, over: Partial<PhotoAsset> = {}): PhotoAsset {
  return {
    id,
    path: `/Fotos/${id}.jpg`,
    filename: `${id}.jpg`,
    takenAt: new Date('2024-06-15T10:00:00Z'),
    width: 1600,
    height: 1200,
    thumbUrl: `/thumb/${id}`,
    fullUrl: `/full/${id}`,
    isVideo: false,
    personIds: [],
    favorite: false,
    ...over,
  }
}

function person(id: string, name: string | null, count: number): Person {
  return { id, name, faceUrl: `/face/${id}`, count }
}

function album(id: string, name: string, assetIds: string[]): Album {
  return { id, name, assetIds, createdAt: new Date('2024-06-01T00:00:00Z') }
}

function store(over: Record<string, unknown> = {}) {
  return {
    assets: [] as PhotoAsset[],
    albums: [] as Album[],
    people: [] as Person[],
    personFilter: null as string | null,
    setPersonFilter: vi.fn(),
    setView: vi.fn(),
    openViewer: vi.fn(),
    mode: 'demo',
    serviceToken: '',
    connection: { mode: 'demo', status: 'idle' },
    ...over,
  }
}

beforeEach(() => {
  h.store = store()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('Favoritos', () => {
  it('avisa cuando no hay favoritos', () => {
    h.store = store({ assets: [photo('a')] })
    render(<Favoritos />)
    expect(screen.getByText('Aún no has marcado favoritos')).toBeTruthy()
  })

  it('pinta solo los favoritos y abre el visor en el pulsado', () => {
    const openViewer = vi.fn()
    h.store = store({
      assets: [photo('a', { favorite: true }), photo('b'), photo('c', { favorite: true })],
      openViewer,
    })
    render(<Favoritos />)
    expect(screen.getAllByRole('img')).toHaveLength(2)
    fireEvent.click(screen.getByAltText('c.jpg'))
    const [list, index] = openViewer.mock.calls[0]
    expect(list.map((p: PhotoAsset) => p.id)).toEqual(['a', 'c'])
    expect(index).toBe(1)
  })
})

describe('Personas', () => {
  it('oculta las personas sin fotos', () => {
    h.store = store({ people: [person('p1', 'Ana', 4), person('p2', 'Luis', 0)] })
    render(<Personas />)
    expect(screen.getByText('Ana')).toBeTruthy()
    expect(screen.queryByText('Luis')).toBeNull()
  })

  it('avisa de que el reconocimiento facial está pendiente', () => {
    h.store = store({ connection: { mode: 'opencloud', status: 'ok' }, people: [person('p1', 'Ana', 2)] })
    render(<Personas />)
    expect(screen.getByText(/Reconocimiento facial pendiente/)).toBeTruthy()
  })

  it('filtra por la persona pulsada y vuelve a la vista de fotos', () => {
    const setPersonFilter = vi.fn()
    const setView = vi.fn()
    h.store = store({ people: [person('p1', 'Ana', 2)], setPersonFilter, setView })
    render(<Personas />)
    fireEvent.click(screen.getByText('Ana'))
    expect(setPersonFilter).toHaveBeenCalledWith('p1')
    expect(setView).toHaveBeenCalledWith('fotos')
  })

  it('quita el filtro al volver a pulsar la persona activa', () => {
    const setPersonFilter = vi.fn()
    h.store = store({ people: [person('p1', 'Ana', 2)], personFilter: 'p1', setPersonFilter })
    render(<Personas />)
    fireEvent.click(screen.getByText('Ana'))
    expect(setPersonFilter).toHaveBeenCalledWith(null)
  })
})

describe('Albums', () => {
  it('explica que en modo servicio aún no hay álbumes', () => {
    h.store = store({ mode: 'service' })
    render(<Albums />)
    expect(screen.getByText(/Los álbumes llegan en la v0.2/)).toBeTruthy()
  })

  it('pinta cada álbum con su portada, recuento y fecha', () => {
    h.store = store({
      assets: [photo('a'), photo('b')],
      albums: [album('al1', 'Verano', ['a', 'b'])],
    })
    const { container } = render(<Albums />)
    expect(screen.getByText('Verano')).toBeTruthy()
    expect(screen.getByText('2')).toBeTruthy()
    expect(container.textContent).toContain('junio de 2024')
  })

  it('omite los álbumes sin fotos disponibles', () => {
    h.store = store({
      assets: [photo('a')],
      albums: [album('al1', 'Vacío', ['zzz']), album('al2', 'Con foto', ['a'])],
    })
    render(<Albums />)
    expect(screen.queryByText('Vacío')).toBeNull()
    expect(screen.getByText('Con foto')).toBeTruthy()
  })

  it('abre el visor con las fotos del álbum', () => {
    const openViewer = vi.fn()
    h.store = store({
      assets: [photo('a'), photo('b')],
      albums: [album('al1', 'Verano', ['b', 'a'])],
      openViewer,
    })
    render(<Albums />)
    fireEvent.click(screen.getByText('Verano'))
    const [list, index] = openViewer.mock.calls[0]
    expect(list.map((p: PhotoAsset) => p.id)).toEqual(['b', 'a'])
    expect(index).toBe(0)
  })
})

describe('Carpetas', () => {
  it('agrupa por directorio y ordena por ruta', () => {
    h.store = store({
      assets: [
        photo('a', { path: '/Fotos/2024/a.jpg' }),
        photo('b', { path: '/Fotos/2023/b.jpg' }),
        photo('c', { path: '/Fotos/2024/c.jpg' }),
      ],
    })
    render(<Carpetas />)
    const titles = screen.getAllByText(/Fotos\//).map((n) => n.textContent)
    expect(titles).toEqual(['Fotos/2023', 'Fotos/2024'])
    expect(screen.getByText('2 elementos')).toBeTruthy()
    expect(screen.getByText('1 elementos')).toBeTruthy()
  })

  it('abre el visor con las fotos de la carpeta', () => {
    const openViewer = vi.fn()
    h.store = store({
      assets: [photo('a', { path: '/Fotos/2024/a.jpg' }), photo('b', { path: '/Fotos/2024/b.jpg' })],
      openViewer,
    })
    render(<Carpetas />)
    fireEvent.click(screen.getByText('Fotos/2024'))
    const [list, index] = openViewer.mock.calls[0]
    expect(list).toHaveLength(2)
    expect(index).toBe(0)
  })
})

describe('Recuerdos', () => {
  function todayInYearsAgo(years: number, over: Partial<PhotoAsset> = {}) {
    const d = new Date()
    d.setFullYear(d.getFullYear() - years)
    const id = (over.id as string) ?? `y${years}`
    return photo(id, { takenAt: d, ...over })
  }

  it('avisa cuando no hay recuerdos de otros años', () => {
    h.store = store({ assets: [photo('a', { takenAt: new Date() })] })
    render(<Recuerdos />)
    expect(screen.getByText('Hoy no hay recuerdos de años anteriores')).toBeTruthy()
  })

  it('agrupa por año de más reciente a más antiguo', () => {
    h.store = store({
      assets: [todayInYearsAgo(3), todayInYearsAgo(1), todayInYearsAgo(2)],
    })
    render(<Recuerdos />)
    const labels = screen.getAllByText(/^Hace \d+ años?$/).map((n) => n.textContent)
    expect(labels).toEqual(['Hace 1 año', 'Hace 2 años', 'Hace 3 años'])
  })

  it('ignora las fotos de otros días y del año en curso', () => {
    const other = new Date()
    other.setDate(other.getDate() - 5)
    h.store = store({
      assets: [
        photo('hoy', { takenAt: new Date() }),
        photo('otro', { takenAt: other }),
        todayInYearsAgo(2),
        todayInYearsAgo(2, { id: 'y2b' }),
      ],
    })
    const { container } = render(<Recuerdos />)
    const srcs = Array.from(container.querySelectorAll('img')).map((n) => n.getAttribute('src'))
    expect(srcs).toContain('/thumb/y2b')
    expect(srcs.some((s) => s?.includes('hoy'))).toBe(false)
    expect(srcs.some((s) => s?.includes('otro'))).toBe(false)
  })

  it('cuenta las fotos del año y añade el lugar', () => {
    h.store = store({
      assets: [todayInYearsAgo(2, { place: 'Vigo' }), todayInYearsAgo(2, { place: undefined })],
    })
    render(<Recuerdos />)
    expect(screen.getByText('2 fotos · Vigo')).toBeTruthy()
  })

  it('usa el singular con una sola foto', () => {
    h.store = store({ assets: [todayInYearsAgo(1)] })
    render(<Recuerdos />)
    expect(screen.getByText('Hace 1 año')).toBeTruthy()
    expect(screen.getByText('1 foto')).toBeTruthy()
  })

  it('abre el visor desde la portada y desde cada miniatura', () => {
    const openViewer = vi.fn()
    const list = [todayInYearsAgo(2), ...Array.from({ length: 3 }, (_, i) => photo(`t${i}`, { takenAt: todayInYearsAgo(2).takenAt }))]
    h.store = store({ assets: list, openViewer })
    const { container } = render(<Recuerdos />)

    fireEvent.click(screen.getByText('Hace 2 años'))
    expect(openViewer.mock.calls[0][1]).toBe(0)

    const thumbs = container.querySelectorAll('section .grid button')
    expect(thumbs).toHaveLength(3)
    fireEvent.click(thumbs[2])
    expect(openViewer.mock.calls[1][1]).toBe(3)
  })

  it('limita la tira a las ocho miniaturas siguientes', () => {
    const base = todayInYearsAgo(2).takenAt
    const list = Array.from({ length: 12 }, (_, i) => photo(`t${i}`, { takenAt: base }))
    h.store = store({ assets: list })
    const { container } = render(<Recuerdos />)
    expect(container.querySelectorAll('section .grid button')).toHaveLength(8)
  })

  it('pide los recuerdos al servicio en modo producción', async () => {
    const lastYear = new Date()
    lastYear.setFullYear(lastYear.getFullYear() - 1)
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            assets: [
              {
                id: 7,
                path: '/Fotos/s.jpg',
                filename: 's.jpg',
                takenAt: Math.floor(lastYear.getTime() / 1000),
                width: 800,
                height: 600,
              },
            ],
          }),
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    h.store = store({ mode: 'service', serviceToken: 'tok' })
    render(<Recuerdos />)

    await waitFor(() => expect(screen.getByText('Hace 1 año')).toBeTruthy())
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/memories/on-this-day')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok')
  })

  it('se queda sin recuerdos si el servicio falla', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: false })))
    h.store = store({ mode: 'service' })
    render(<Recuerdos />)
    await waitFor(() => expect(screen.getByText('Hoy no hay recuerdos de años anteriores')).toBeTruthy())
  })

  it('descarta los recuerdos del servicio al volver a los datos locales', async () => {
    const lastYear = new Date()
    lastYear.setFullYear(lastYear.getFullYear() - 1)
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              assets: [{ id: 7, path: '/s.jpg', filename: 's.jpg', takenAt: Math.floor(lastYear.getTime() / 1000) }],
            }),
        }),
      ),
    )
    h.store = store({ mode: 'service' })
    const { rerender } = render(<Recuerdos />)
    await waitFor(() => expect(screen.getByText('1 foto')).toBeTruthy())

    h.store = store({ mode: 'demo', assets: [todayInYearsAgo(1, { place: 'Vigo' })] })
    rerender(<Recuerdos />)
    await waitFor(() => expect(screen.getByText('1 foto · Vigo')).toBeTruthy())
  })
})
