import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import type { Album, ConnectionState, DayBucket, Person, PhotoAsset, View } from './types'
import { generateDemoData } from './demoData'
import { OpenCloudClient, entriesToAssets } from './opencloud'

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
  disconnect: () => void
  filteredAssets: PhotoAsset[]
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

export function StoreProvider({ children }: { children: ReactNode }) {
  const demo = useMemo(() => generateDemoData(), [])
  const [assets, setAssets] = useState<PhotoAsset[]>(demo.assets)
  const [people] = useState<Person[]>(demo.people)
  const [albums] = useState<Album[]>(demo.albums)
  const [view, setView] = useState<View>('fotos')
  const [query, setQuery] = useState('')
  const [personFilter, setPersonFilter] = useState<string | null>(null)
  const [viewer, setViewer] = useState<{ list: PhotoAsset[]; index: number } | null>(null)
  const [connection, setConnection] = useState<ConnectionState>(() => {
    try {
      const raw = localStorage.getItem(STORED)
      if (raw) return { ...JSON.parse(raw), status: 'idle' as const }
    } catch { /* noop */ }
    return { mode: 'demo', baseUrl: '', username: '', appToken: '', status: 'idle' }
  })

  const filteredAssets = useMemo(() => {
    let list = assets
    if (personFilter) list = list.filter((a) => a.personIds.includes(personFilter))
    if (query.trim()) {
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
  }, [assets, query, personFilter])

  const days = useMemo(() => groupByDay(filteredAssets), [filteredAssets])

  const openViewer = useCallback((list: PhotoAsset[], index: number) => setViewer({ list, index }), [])
  const closeViewer = useCallback(() => setViewer(null), [])

  const toggleFavorite = useCallback((id: string) => {
    setAssets((prev) => prev.map((a) => (a.id === id ? { ...a, favorite: !a.favorite } : a)))
  }, [])

  const connect = useCallback(async (baseUrl: string, username: string, appToken: string) => {
    setConnection((c) => ({ ...c, baseUrl, username, appToken, status: 'connecting', message: undefined }))
    try {
      const client = new OpenCloudClient(baseUrl, username, appToken)
      const drives = await client.listDrives()
      const personal = drives.find((d) => d.driveType === 'personal') ?? drives[0]
      if (!personal) throw new Error('No se encontró ningún espacio')
      const items: { path: string; entry: any }[] = []
      // intenta /Fotos y si no, raíz (limitado a 500 para la preview web)
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
    setConnection({ mode: 'demo', baseUrl: '', username: '', appToken: '', status: 'idle' })
    setAssets(demo.assets)
  }, [demo])

  const store: Store = {
    assets, people, albums, days, view, setView,
    viewerIndex: viewer?.index ?? null,
    viewerList: viewer?.list ?? [],
    openViewer, closeViewer, toggleFavorite,
    query, setQuery, personFilter, setPersonFilter,
    connection, connect, disconnect, filteredAssets,
  }

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>
}
