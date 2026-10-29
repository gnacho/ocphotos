import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import type { Person, PhotoAsset } from '@/lib/types'

const h = vi.hoisted(() => ({ store: {} as Record<string, unknown> }))

vi.mock('@/hooks/useStore', () => ({ useStore: () => h.store }))

import Viewer from './Viewer'

function photo(id: string, over: Partial<PhotoAsset> = {}): PhotoAsset {
  return {
    id,
    path: `/Fotos/2024/${id}.jpg`,
    filename: `${id}.jpg`,
    takenAt: new Date('2024-06-15T10:30:00Z'),
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

function person(id: string, name: string | null): Person {
  return { id, name, faceUrl: `/face/${id}`, count: 3 }
}

function store(over: Record<string, unknown> = {}) {
  return {
    viewerList: [photo('a'), photo('b'), photo('c')] as PhotoAsset[],
    viewerIndex: 1 as number | null,
    closeViewer: vi.fn(),
    openViewer: vi.fn(),
    toggleFavorite: vi.fn(),
    people: [] as Person[],
    ...over,
  }
}

beforeEach(() => {
  h.store = store()
})

afterEach(() => {
  cleanup()
})

describe('Viewer', () => {
  it('no pinta nada si no hay visor abierto', () => {
    h.store = store({ viewerIndex: null })
    const { container } = render(<Viewer />)
    expect(container.firstChild).toBeNull()
  })

  it('no pinta nada si el índice se sale de la lista', () => {
    h.store = store({ viewerIndex: 9 })
    const { container } = render(<Viewer />)
    expect(container.firstChild).toBeNull()
  })

  it('pinta la foto visible con su nombre', () => {
    render(<Viewer />)
    const img = screen.getByAltText('b.jpg') as HTMLImageElement
    expect(img.getAttribute('src')).toBe('/full/b')
  })

  it('cierra con el botón', () => {
    const closeViewer = vi.fn()
    h.store = store({ closeViewer })
    render(<Viewer />)
    fireEvent.click(screen.getByLabelText('Cerrar'))
    expect(closeViewer).toHaveBeenCalledTimes(1)
  })

  it('marca la foto visible como favorita', () => {
    const toggleFavorite = vi.fn()
    h.store = store({ toggleFavorite })
    render(<Viewer />)
    fireEvent.click(screen.getByLabelText('Favorito'))
    expect(toggleFavorite).toHaveBeenCalledWith('b')
  })

  it('pinta el corazón relleno cuando la foto ya es favorita', () => {
    h.store = store({ viewerList: [photo('a', { favorite: true })], viewerIndex: 0 })
    const { container } = render(<Viewer />)
    expect(container.querySelector('svg.fill-rose-500')).toBeTruthy()
  })

  it('ofrece la descarga con el nombre del fichero', () => {
    render(<Viewer />)
    const link = screen.getByLabelText('Descargar') as HTMLAnchorElement
    expect(link.getAttribute('href')).toBe('/full/b')
    expect(link.getAttribute('download')).toBe('b.jpg')
  })

  it('no capitaliza cada palabra de la fecha', () => {
    render(<Viewer />)
    fireEvent.click(screen.getByLabelText('Información'))
    const date = screen.getByText(/junio de 2024/)
    expect(date.className).toContain('first-letter:uppercase')
    expect(date.className).not.toContain('capitalize')
  })

  it('oculta el panel de información hasta que se pide', () => {
    const { container } = render(<Viewer />)
    expect(container.querySelector('aside')).toBeNull()
    fireEvent.click(screen.getByLabelText('Información'))
    expect(container.querySelector('aside')).toBeTruthy()
    fireEvent.click(screen.getByLabelText('Información'))
    expect(container.querySelector('aside')).toBeNull()
  })

  it('muestra lugar, ruta y datos EXIF en el panel', () => {
    h.store = store({
      viewerList: [
        photo('a', {
          place: 'Vigo',
          camera: 'iPhone 16 Pro',
          lens: '24 mm',
          aperture: 'f/1.8',
          shutter: '1/120',
          iso: 64,
          focal: '24 mm',
        }),
      ],
      viewerIndex: 0,
    })
    const { container } = render(<Viewer />)
    fireEvent.click(screen.getByLabelText('Información'))
    const aside = container.querySelector('aside')!
    expect(aside.textContent).toContain('Vigo')
    expect(aside.textContent).toContain('/Fotos/2024/a.jpg')
    expect(aside.textContent).toContain('iPhone 16 Pro')
    expect(aside.textContent).toContain('f/1.8')
    expect(aside.textContent).toContain('1/120')
    expect(aside.textContent).toContain('64')
    expect(aside.textContent).toContain('1600 × 1200')
  })

  it('lista solo las personas de la foto visible', () => {
    h.store = store({
      viewerList: [photo('a', { personIds: ['p1'] })],
      viewerIndex: 0,
      people: [person('p1', 'Ana'), person('p2', 'Luis')],
    })
    const { container } = render(<Viewer />)
    fireEvent.click(screen.getByLabelText('Información'))
    const aside = container.querySelector('aside')!
    expect(aside.textContent).toContain('Ana')
    expect(aside.textContent).not.toContain('Luis')
  })

  it('oculta la flecha anterior en la primera foto y la siguiente en la última', () => {
    h.store = store({ viewerIndex: 0 })
    const { rerender } = render(<Viewer />)
    expect(screen.queryByLabelText('Anterior')).toBeNull()
    expect(screen.getByLabelText('Siguiente')).toBeTruthy()

    h.store = store({ viewerIndex: 2 })
    rerender(<Viewer />)
    expect(screen.getByLabelText('Anterior')).toBeTruthy()
    expect(screen.queryByLabelText('Siguiente')).toBeNull()
  })

  it('navega con las flechas de la barra lateral', () => {
    const openViewer = vi.fn()
    h.store = store({ openViewer })
    render(<Viewer />)
    fireEvent.click(screen.getByLabelText('Siguiente'))
    expect(openViewer.mock.calls[0][1]).toBe(2)
    fireEvent.click(screen.getByLabelText('Anterior'))
    expect(openViewer.mock.calls[1][1]).toBe(0)
  })

  it('responde al teclado sin salirse de la lista', () => {
    const closeViewer = vi.fn()
    const openViewer = vi.fn()
    h.store = store({ viewerIndex: 0, closeViewer, openViewer })
    render(<Viewer />)

    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    expect(openViewer).not.toHaveBeenCalled()

    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(openViewer.mock.calls[0][1]).toBe(1)

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(closeViewer).toHaveBeenCalledTimes(1)
  })

  it('deja de escuchar el teclado al desmontarse', () => {
    const closeViewer = vi.fn()
    h.store = store({ closeViewer })
    const { unmount } = render(<Viewer />)
    unmount()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(closeViewer).not.toHaveBeenCalled()
  })
})
