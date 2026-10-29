import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import type { Person } from '@/lib/types'

const h = vi.hoisted(() => ({ store: {} as Record<string, unknown> }))

vi.mock('@/hooks/useStore', () => ({ useStore: () => h.store }))

import Shell from './Shell'

function person(id: string, name: string | null): Person {
  return { id, name, faceUrl: `/face/${id}`, count: 3 }
}

function store(over: Record<string, unknown> = {}) {
  return {
    view: 'fotos',
    setView: vi.fn(),
    query: '',
    setQuery: vi.fn(),
    personFilter: null as string | null,
    setPersonFilter: vi.fn(),
    people: [] as Person[],
    mode: 'demo',
    connection: { mode: 'demo', baseUrl: 'https://cloud.ejemplo.es', username: '', appToken: '', status: 'idle' },
    connect: vi.fn(),
    connectService: vi.fn(),
    disconnect: vi.fn(),
    ...over,
  }
}

function stubMatchMedia(dark: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: dark, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  )
}

beforeEach(() => {
  h.store = store()
  localStorage.clear()
  document.documentElement.className = ''
  stubMatchMedia(false)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Shell', () => {
  it('pinta la cabecera, el buscador y el contenido', () => {
    render(
      <Shell>
        <p>contenido</p>
      </Shell>,
    )
    expect(screen.getByText('OpenCloud Memories')).toBeTruthy()
    expect(screen.getByPlaceholderText('Buscar por lugar, cámara, archivo…')).toBeTruthy()
    expect(screen.getByText('contenido')).toBeTruthy()
  })

  it('lista las siete vistas y cambia con ellas', () => {
    const setView = vi.fn()
    h.store = store({ setView })
    render(<Shell>contenido</Shell>)
    for (const label of ['Fotos', 'Recuerdos', 'Personas', 'Álbumes', 'Mapa', 'Carpetas', 'Favoritos']) {
      expect(screen.getByText(label)).toBeTruthy()
    }
    fireEvent.click(screen.getByText('Mapa'))
    expect(setView).toHaveBeenCalledWith('mapa')
  })

  it('marca la vista activa', () => {
    h.store = store({ view: 'mapa' })
    const { container } = render(<Shell>contenido</Shell>)
    const active = container.querySelector('nav button.bg-raised')
    expect(active?.textContent).toContain('Mapa')
  })

  it('traslada lo que se escribe al filtro de búsqueda', () => {
    const setQuery = vi.fn()
    h.store = store({ setQuery })
    render(<Shell>contenido</Shell>)
    fireEvent.change(screen.getByPlaceholderText('Buscar por lugar, cámara, archivo…'), { target: { value: 'vigo' } })
    expect(setQuery).toHaveBeenCalledWith('vigo')
  })

  it('alterna el tema y lo recuerda', () => {
    const events: string[] = []
    window.addEventListener('ocm-theme', (e) => events.push((e as CustomEvent).detail))
    render(<Shell>contenido</Shell>)
    fireEvent.click(screen.getByLabelText('Cambiar tema'))
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(document.documentElement.style.colorScheme).toBe('dark')
    expect(localStorage.getItem('ocm-theme')).toBe('dark')
    expect(events).toContain('dark')

    fireEvent.click(screen.getByLabelText('Cambiar tema'))
    expect(document.documentElement.classList.contains('dark')).toBe(false)
    expect(localStorage.getItem('ocm-theme')).toBe('light')
  })

  it('arranca en oscuro si el sistema lo pide', () => {
    stubMatchMedia(true)
    render(<Shell>contenido</Shell>)
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('respeta el tema guardado frente al del sistema', () => {
    localStorage.setItem('ocm-theme', 'light')
    stubMatchMedia(true)
    render(<Shell>contenido</Shell>)
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('ignora un tema guardado desconocido', () => {
    localStorage.setItem('ocm-theme', 'morado')
    render(<Shell>contenido</Shell>)
    expect(localStorage.getItem('ocm-theme')).toBe('light')
  })

  it('marca en verde el indicador de ajustes al estar conectado', () => {
    h.store = store({ connection: { ...store().connection, mode: 'opencloud', status: 'ok' } })
    const { container } = render(<Shell>contenido</Shell>)
    expect(container.querySelector('span.bg-emerald-400')).toBeTruthy()
  })

  it('muestra la persona por la que se filtra y permite quitarla', () => {
    const setPersonFilter = vi.fn()
    h.store = store({ people: [person('p1', 'Ana')], personFilter: 'p1', setPersonFilter })
    const { container } = render(<Shell>contenido</Shell>)
    expect(container.textContent).toContain('Filtrando por')
    expect(screen.getByText('Ana')).toBeTruthy()
    fireEvent.click(container.querySelector('.bg-sky-950\\/40 button')!)
    expect(setPersonFilter).toHaveBeenCalledWith(null)
  })

  it('describe el modo en el pie de la barra lateral', () => {
    const { container } = render(<Shell>contenido</Shell>)
    expect(container.textContent).toContain('v0.1 · datos demo · Sin ML aún')

    h.store = store({ mode: 'service', connection: { ...store().connection, mode: 'opencloud' } })
    const second = render(<Shell>contenido</Shell>)
    expect(second.container.textContent).toContain('v0.1 · OpenCloud · Sin ML aún')
  })
})

describe('Shell · embebida en el shell de OpenCloud', () => {
  let originalTop: PropertyDescriptor | undefined

  beforeEach(() => {
    originalTop = Object.getOwnPropertyDescriptor(window, 'top')
    Object.defineProperty(window, 'top', { configurable: true, get: () => ({}) })
  })

  afterEach(() => {
    if (originalTop) Object.defineProperty(window, 'top', originalTop)
  })

  it('oculta el chrome propio y deja la barra compacta', () => {
    render(<Shell>contenido</Shell>)
    expect(screen.queryByText('OpenCloud Memories')).toBeNull()
    expect(screen.queryByPlaceholderText('Buscar por lugar, cámara, archivo…')).toBeNull()
    expect(screen.getByPlaceholderText('Buscar…')).toBeTruthy()
    expect(screen.getByText('contenido')).toBeTruthy()
  })

  it('navega con los iconos de la barra compacta', () => {
    const setView = vi.fn()
    h.store = store({ setView })
    const { container } = render(<Shell>contenido</Shell>)
    const buttons = container.querySelectorAll('nav button[title]')
    expect(buttons).toHaveLength(7)
    fireEvent.click(buttons[3])
    expect(setView).toHaveBeenCalledWith('albums')
  })

  it('mantiene la búsqueda, el tema y los ajustes', () => {
    const setQuery = vi.fn()
    h.store = store({ setQuery })
    render(<Shell>contenido</Shell>)
    fireEvent.change(screen.getByPlaceholderText('Buscar…'), { target: { value: 'mar' } })
    expect(setQuery).toHaveBeenCalledWith('mar')

    fireEvent.click(screen.getByLabelText('Cambiar tema'))
    expect(document.documentElement.classList.contains('dark')).toBe(true)

    fireEvent.click(screen.getByLabelText('Ajustes'))
    expect(screen.getByText('Conexión OpenCloud')).toBeTruthy()
  })
})

describe('Shell · ajustes', () => {
  function openSettings() {
    fireEvent.click(screen.getByLabelText('Ajustes'))
    return screen.getByText('Conexión OpenCloud')
  }

  function dialog() {
    return document.querySelector('.max-w-md') as HTMLElement
  }

  it('abre y cierra el diálogo', () => {
    const { container } = render(<Shell>contenido</Shell>)
    expect(openSettings()).toBeTruthy()
    fireEvent.click(container.querySelector('button.rounded-full.p-1\\.5')!)
    expect(screen.queryByText('Conexión OpenCloud')).toBeNull()
  })

  it('conecta al servicio con el token introducido', () => {
    const connectService = vi.fn()
    h.store = store({ connectService })
    render(<Shell>contenido</Shell>)
    openSettings()
    const input = dialog().querySelector('form input[type="password"]')!
    fireEvent.change(input, { target: { value: 'secreto' } })
    fireEvent.click(screen.getByText('Conectar al servicio (mismo origen)'))
    expect(connectService).toHaveBeenCalledWith('secreto')
  })

  it('conecta a OpenCloud con los tres datos del formulario', () => {
    const connect = vi.fn()
    h.store = store({ connect })
    render(<Shell>contenido</Shell>)
    openSettings()
    const inputs = dialog().querySelectorAll('form input[required]')
    expect(inputs).toHaveLength(3)
    fireEvent.change(inputs[0], { target: { value: 'https://nube.es' } })
    fireEvent.change(inputs[1], { target: { value: 'nacho' } })
    fireEvent.change(inputs[2], { target: { value: 'tok' } })
    fireEvent.click(screen.getByText('Conectar e indexar'))
    expect(connect).toHaveBeenCalledWith('https://nube.es', 'nacho', 'tok')
  })

  it('muestra el error de conexión y deja reintentar', () => {
    h.store = store({
      connection: { ...store().connection, status: 'error', message: '¿CORS habilitado?' },
    })
    render(<Shell>contenido</Shell>)
    openSettings()
    expect(screen.getByText('¿CORS habilitado?')).toBeTruthy()
    expect(screen.getByText('Conectar e indexar')).toBeTruthy()
  })

  it('bloquea el botón mientras conecta', () => {
    h.store = store({ connection: { ...store().connection, status: 'connecting' } })
    render(<Shell>contenido</Shell>)
    openSettings()
    const button = screen.getByText('Conectando e indexando…') as HTMLButtonElement
    expect(button.disabled).toBe(true)
  })

  it('resume la conexión y permite desconectar', () => {
    const disconnect = vi.fn()
    h.store = store({
      disconnect,
      connection: {
        mode: 'opencloud',
        baseUrl: 'https://nube.es',
        username: 'nacho',
        appToken: '',
        status: 'ok',
        message: 'photos-service: 12 fotos indexadas',
      },
    })
    render(<Shell>contenido</Shell>)
    openSettings()
    expect(screen.getByText('photos-service: 12 fotos indexadas')).toBeTruthy()
    expect(screen.getByText('Conectado a https://nube.es como nacho')).toBeTruthy()
    fireEvent.click(screen.getByText('Desconectar (volver a demo)'))
    expect(disconnect).toHaveBeenCalledTimes(1)
  })

  it('explica los requisitos de CORS en modo demo', () => {
    render(<Shell>contenido</Shell>)
    openSettings()
    expect(screen.getByText(/OC_CORS_ALLOW_ORIGINS/)).toBeTruthy()
  })
})
