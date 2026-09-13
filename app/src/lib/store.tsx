import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Album, ConnectionState, DayBucket, Person, PhotoAsset, View } from './types'
import { generateDemoData } from './demoData'
import { OpenCloudClient, entriesToAssets } from './opencloud'

/**
 * Tres modos de datos:
 *  - service: el photos-service (Go) sirve API + PWA en el mismo origen → PRODUCCIÓN
 *  - opencloud: indexado directo desde el navegador (demo contra instancia real, máx 500)
 *  - demo: datos sintéticos
 */
type Mode = 'demo' | 'opencloud' | 'service'

interface ServiceAsset {
  id: number
  path: string
  filename: string
  mediaType: string
  takenAt: number
  width: number
  height: number
  camera?: string
  lens?: string
  iso?: number
  aperture?: string
  shutter?: string
  focal?: string
  lat?: number
  lon?: number
  size: number
  favorite: boolean
}

function svcToAsset(a: ServiceAsset, token: string): PhotoAsset {
  const t = token ? `?token=${encodeURIComponent(token)}` : ''
  return {
    id: String(a.id),
    path: a.path,
    filename: a.filename,
    takenAt: new Date(a.takenAt * 1000),
    width: a.width || 1600,
    height: a.height || 1200,
    thumbUrl: `/api/assets/${a.id}/thumb?w=400${token ? `&token=${encodeURIComponent(token)}` : ''}`,
    fullUrl: `/api/assets/${a.id}/original${t}`,
    camera: a.camera,
    lens: a.lens,
    iso: a.iso,
    aperture: a.aperture,
    shutter: a.shutter,
    focal: a.focal,
    lat: a.lat,
    lon: a.lon,
    isVideo: a.mediaType === 'video',
    personIds: [],
    favorite: a.favorite,
  }
}

interface Store {
  assets: PhotoAsset[]
  people: Person[]
  albums: Album[]
  days: DayBucket[]
  view: View
  setView: (v: View) => void
  viewerIndex: number | null
  viewerList: PhotoAsset[]
  openViewer: (list: PhotoAsset[], index: number) => void
  closeViewer: () => void
  toggleFavorite: (id: string) => void
  query: string
  setQuery: (q: string) => void
  personFilter: string | null
  setPersonFilter: (p: string | null) => void
  connection: ConnectionState
  connect: (baseUrl: string, username: string, appToken: string) => Promise<void>
  connectService: (token: string) => Promise<void>
  disconnect: () => void
  filteredAssets: PhotoAsset[]
  mode: Mode
  hasMore: boolean
  loadMore: () => void
  loadingMore: boolean
  stats: Record<string, number> | null
  serviceToken: string
}

const Ctx = createContext<Store | null>(null)

export function useStore() {
  const s = useContext(Ctx)
  if (!s) throw new Error('store missing')
  return s
}

export function groupByDay(assets: PhotoAsset[]): DayBucket[] {
  const map = new Map<string, PhotoAsset[]>()
  for (const a of assets) {
    const key = `${a.takenAt.getFullYear()}-${String(a.takenAt.getMonth() + 1).padStart(2, '0')}-${String(a.takenAt.getDate()).padStart(2, '0')}`
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(a)
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([key, list]) => ({ key, date: list[0].takenAt, assets: list }))
}

const STORED = 'ocm-connection'
const SVC_TOKEN = 'ocm-service-token'

export function StoreProvider({ children }: { children: ReactNode }) {
  const demo = useMemo(() => generateDemoData(), [])
  const [mode, setMode] = useState<Mode>('demo')
  const [assets, setAssets] = useState<PhotoAsset[]>(demo.assets)
  const [people] = useState<Person[]>(demo.people)
  const [albums] = useState<Album[]>(demo.albums)
  const [view, setView] = useState<View>('fotos')
  const [query, setQuery] = useState('')
  const [personFilter, setPersonFilter] = useState<string | null>(null)
  const [viewer, setViewer] = useState<{ list: PhotoAsset[]; index: number } | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [stats, setStats] = useState<Record<string, number> | null>(null)
  const [serviceToken, setServiceToken] = useState(() => localStorage.getItem(SVC_TOKEN) ?? '')
  const cursorRef = useRef<{ taken: number; id: number } | null>(null)
  const queryRef = useRef('')
  queryRef.current = query
  const [connection, setConnection] = useState<ConnectionState>(() => {
    try {
      const raw = localStorage.getItem(STORED)
      if (raw) return { ...JSON.parse(raw), status: 'idle' as const }
    } catch { /* noop */ }
    return { mode: 'demo', baseUrl: '', username: '', appToken: '', status: 'idle' }
  })

  // --- modo servicio (producción) ---
  const svcFetch = useCallback(async (path: string, token: string, init?: RequestInit) => {
    const res = await fetch(path, {
      ...init,
      headers: { ...(init?.headers ?? {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    })
    if (!res.ok) throw new Error(`API respondió ${res.status}`)
    return res
  }, [])

  const loadPage = useCallback(async (token: string, reset: boolean) => {
    if (loadingMore) return
    setLoadingMore(true)
    try {
      const cur = reset ? null : cursorRef.current
      const params = new URLSearchParams({ limit: '600' })
      if (cur) {
        params.set('before_taken', String(cur.taken))
        params.set('before_id', String(cur.id))
      }
      if (queryRef.current.trim()) params.set('q', queryRef.current.trim())
      const res = await svcFetch(`/api/assets?${params}`, token)
      const json = (await res.json()) as { assets: ServiceAsset[] }
      const mapped = json.assets.map((a) => svcToAsset(a, token))
      setAssets((prev) => (reset ? mapped : [...prev, ...mapped]))
      if (json.assets.length > 0) {
        const last = json.assets[json.assets.length - 1]
        cursorRef.current = { taken: last.takenAt, id: last.id }
      }
      setHasMore(json.assets.length === 600)
    } finally {
      setLoadingMore(false)
    }
  }, [loadingMore, svcFetch])

  const connectService = useCallback(async (token: string) => {
    setConnection((c) => ({ ...c, status: 'connecting', message: undefined }))
    try {
      const res = await svcFetch('/api/stats', token)
      const st = await res.json()
      setStats(st)
      setServiceToken(token)
      localStorage.setItem(SVC_TOKEN, token)
      setMode('service')
      cursorRef.current = null
      await loadPage(token, true)
      setConnection({ mode: 'opencloud', baseUrl: window.location.origin, username: '', appToken: '', status: 'ok', message: `photos-service: ${st.assets} fotos indexadas` })
    } catch (e: any) {
      setConnection((c) => ({ ...c, status: 'error', message: e?.message ?? 'No se pudo conectar con el servicio' }))
    }
  }, [svcFetch, loadPage])

  // auto-detección: si la PWA la sirve el propio servicio, /api/stats responde
  useEffect(() => {
    const token = localStorage.getItem(SVC_TOKEN) ?? ''
    fetch('/api/stats', { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then((r) => (r.ok ? r.json() : null))
      .then((st) => { if (st) connectService(token) })
      .catch(() => { /* sin servicio: modo demo */ })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // recargar página al cambiar la búsqueda en modo servicio
  useEffect(() => {
    if (mode !== 'service') return
    const t = setTimeout(() => { cursorRef.current = null; loadPage(serviceToken, true) }, 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, mode])

  const loadMore = useCallback(() => {
    if (mode === 'service' && hasMore && !loadingMore) loadPage(serviceToken, false)
  }, [mode, hasMore, loadingMore, loadPage, serviceToken])

  const filteredAssets = useMemo(() => {
    let list = assets
    if (personFilter) list = list.filter((a) => a.personIds.includes(personFilter))
    if (query.trim() && mode !== 'service') {
      const q = query.toLowerCase()
      list = list.filter(
        (a) =>
          a.filename.toLowerCase().includes(q) ||
          a.camera?.toLowerCase().includes(q) ||
          a.place?.toLowerCase().includes(q) ||
          a.path.toLowerCase().includes(q),
      )
    }
    return list
  }, [assets, query, personFilter, mode])

  const days = useMemo(() => groupByDay(filteredAssets), [filteredAssets])

  const openViewer = useCallback((list: PhotoAsset[], index: number) => setViewer({ list, index }), [])
  const closeViewer = useCallback(() => setViewer(null), [])

  const toggleFavorite = useCallback((id: string) => {
    setAssets((prev) => {
      const asset = prev.find((a) => a.id === id)
      if (mode === 'service' && asset) {
        svcFetch(`/api/assets/${id}/favorite`, serviceToken, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ favorite: !asset.favorite }),
        }).catch(() => { /* optimistic */ })
      }
      return prev.map((a) => (a.id === id ? { ...a, favorite: !a.favorite } : a))
    })
  }, [mode, serviceToken, svcFetch])

  // --- modo navegador-directo (demo contra instancia real) ---
  const connect = useCallback(async (baseUrl: string, username: string, appToken: string) => {
    setConnection((c) => ({ ...c, baseUrl, username, appToken, status: 'connecting', message: undefined }))
    try {
      const client = new OpenCloudClient(baseUrl, username, appToken)
      const drives = await client.listDrives()
      const personal = drives.find((d) => d.driveType === 'personal') ?? drives[0]
      if (!personal) throw new Error('No se encontró ningún espacio')
      const items: { path: string; entry: any }[] = []
      let root = 'Fotos'
      try {
        await client.listFolder(personal.webdavUrl, root)
      } catch {
        root = ''
      }
      for await (const item of client.walk(personal.webdavUrl, root)) {
        items.push(item)
        if (items.length >= 500) break
      }
      if (items.length === 0) throw new Error('No se encontraron fotos en el espacio')
      const real = entriesToAssets(client, items)
      setAssets(real)
      setMode('opencloud')
      const next: ConnectionState = { mode: 'opencloud', baseUrl, username, appToken, status: 'ok', message: `${real.length} fotos indexadas desde ${personal.name}` }
      setConnection(next)
      localStorage.setItem(STORED, JSON.stringify({ mode: 'opencloud', baseUrl, username, appToken }))
    } catch (e: any) {
      setConnection((c) => ({
        ...c,
        status: 'error',
        message: `${e?.message ?? 'Error de conexión'} — ¿CORS habilitado en OpenCloud? (OC_CORS_ALLOW_ORIGINS)`,
      }))
    }
  }, [])

  const disconnect = useCallback(() => {
    localStorage.removeItem(STORED)
    localStorage.removeItem(SVC_TOKEN)
    setConnection({ mode: 'demo', baseUrl: '', username: '', appToken: '', status: 'idle' })
    setAssets(demo.assets)
    setMode('demo')
    setStats(null)
  }, [demo])

  const store: Store = {
    assets, people, albums, days, view, setView,
    viewerIndex: viewer?.index ?? null,
    viewerList: viewer?.list ?? [],
    openViewer, closeViewer, toggleFavorite,
    query, setQuery, personFilter, setPersonFilter,
    connection, connect, connectService, disconnect, filteredAssets,
    mode, hasMore, loadMore, loadingMore, stats, serviceToken,
  }

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>
}
