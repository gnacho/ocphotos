import { computed, ref } from 'vue'
import { useAuthStore } from '@opencloud-eu/web-pkg'
import type { ProcessorType } from '@opencloud-eu/web-pkg'

// backend photos-service (mismo origen, vía NPM). Mantiene el índice (EXIF, geo,
// favoritos) y sirve miniaturas (incluido HEIC) y originales.
const SERVICE_BASE = '/ocphotos-api'
const PAGE_SIZE = 300

export interface Photo {
  id: number
  path: string
  name: string
  mediaType: string
  isVideo: boolean
  takenAt: number // segundos
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
  archived: boolean
}

export interface DayBucket {
  key: string // yyyy-mm-dd
  date: Date
  photos: Photo[]
}

export interface Album {
  id: number
  name: string
  count: number
  coverId?: number
}

export interface Place {
  lat: number
  lon: number
  count: number
  coverId: number
  name?: string
}

export interface Tag {
  name: string
  count: number
}

export interface FolderEntry {
  name: string
  path: string
  count: number
}

export interface FolderListing {
  path: string
  folders: FolderEntry[]
  assets: Photo[]
}

export interface CalendarMonth {
  month: number
  count: number
}

export interface CalendarYear {
  year: number
  count: number
  months: CalendarMonth[]
}

interface ApiAsset {
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
  archived?: boolean
}

const toPhoto = (a: ApiAsset): Photo => ({
  id: a.id,
  path: a.path,
  name: a.filename,
  mediaType: a.mediaType,
  isVideo: a.mediaType === 'video',
  takenAt: a.takenAt,
  width: a.width,
  height: a.height,
  camera: a.camera,
  lens: a.lens,
  iso: a.iso,
  aperture: a.aperture,
  shutter: a.shutter,
  focal: a.focal,
  lat: a.lat,
  lon: a.lon,
  size: a.size,
  favorite: a.favorite,
  archived: !!a.archived
})

const state = {
  photos: ref<Photo[]>([]),
  loading: ref(false),
  error: ref<string | null>(null),
  exhausted: ref(false),
  startAt: ref<number | null>(null), // null = desde ahora (Rewind)
  initialized: false
}

// blob URLs en memoria por sesión (los <img> no pueden llevar el Bearer)
const previews = ref<Record<string, string>>({})
const originals = ref<Record<string, string>>({})

export function usePhotoLibrary() {
  const authStore = useAuthStore()

  const api = async (path: string, init?: RequestInit): Promise<Response> => {
    const token = authStore.accessToken
    const res = await fetch(`${SERVICE_BASE}${path}`, {
      ...init,
      headers: { ...(init?.headers as Record<string, string> | undefined), Authorization: `Bearer ${token}` }
    })
    if (!res.ok) throw new Error(`${path} -> ${res.status}`)
    return res
  }

  const loadPage = async (reset = false) => {
    if (state.loading.value) return
    state.loading.value = true
    state.error.value = null
    try {
      const q = new URLSearchParams({ limit: String(PAGE_SIZE) })
      const last = state.photos.value[state.photos.value.length - 1]
      if (!reset && last) {
        q.set('before_taken', String(last.takenAt))
        q.set('before_id', String(last.id))
      } else if (reset && state.startAt.value) {
        // Rewind: empezar en (o antes de) la fecha elegida
        q.set('before_taken', String(state.startAt.value + 1))
        q.set('before_id', String(2 ** 62 - 1))
      }
      const res = await api(`/api/assets?${q.toString()}`)
      const json = (await res.json()) as { assets?: ApiAsset[] }
      const list = (json.assets ?? []).map(toPhoto)
      state.photos.value = reset ? list : [...state.photos.value, ...list]
      state.exhausted.value = list.length < PAGE_SIZE
    } catch (e: any) {
      state.error.value = e?.message ?? String(e)
    } finally {
      state.loading.value = false
    }
  }

  const init = async () => {
    if (state.initialized) return
    state.initialized = true
    await loadPage(true)
  }

  const loadMore = () => (state.exhausted.value ? Promise.resolve() : loadPage(false))

  const rescan = async () => {
    try {
      await api('/api/admin/rescan', { method: 'POST' })
    } catch {
      /* el scan corre en segundo plano */
    }
    state.exhausted.value = false
    await loadPage(true)
  }

  /** Rewind: salta a una fecha (segundos) y recarga el timeline desde ahí. */
  const jumpTo = async (ts: number | null) => {
    state.startAt.value = ts
    state.exhausted.value = false
    await loadPage(true)
  }

  // --- sincronización automática: recoge fotos subidas a OpenCloud ---
  let lastTotal: number | null = null
  let watching = false

  /** Pide un rescan al backend y recarga el timeline si cambió el número de fotos. */
  const syncNow = async (triggerScan = true) => {
    if (state.loading.value) return
    try {
      if (triggerScan) await api('/api/admin/rescan', { method: 'POST' })
      const res = await api('/api/stats')
      const st = (await res.json()) as { assets?: number }
      const total = st.assets ?? 0
      if (lastTotal === null) {
        lastTotal = total
        return
      }
      if (total !== lastTotal) {
        lastTotal = total
        state.exhausted.value = false
        await loadPage(true)
      }
    } catch {
      /* sin conexión con el servicio: se reintenta en el siguiente tick */
    }
  }

  /** Arranca el watcher: al abrir/enfocar y cada 30 s mientras la pestaña está visible. */
  const startWatching = () => {
    if (watching) return
    watching = true
    void syncNow(true)
    window.setInterval(() => {
      if (document.visibilityState === 'visible') void syncNow(true)
    }, 30000)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void syncNow(true)
    })
  }

  const fetchCalendar = async (): Promise<CalendarYear[]> => {
    const res = await api('/api/timeline/calendar')
    const json = (await res.json()) as { years?: CalendarYear[] }
    return json.years ?? []
  }

  const setArchived = async (id: number, archived: boolean): Promise<void> => {
    await api(`/api/assets/${id}/archive`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archived })
    })
  }

  const fetchArchived = async (): Promise<Photo[]> => {
    const res = await api('/api/assets?archived=1&limit=2000')
    const json = (await res.json()) as { assets?: ApiAsset[] }
    return (json.assets ?? []).map(toPhoto)
  }

  const fetchDuplicates = async (): Promise<{ groups: Photo[][]; pending: number }> => {
    const res = await api('/api/duplicates')
    const json = (await res.json()) as { groups?: ApiAsset[][]; pending?: number }
    return { groups: (json.groups ?? []).map((g) => g.map(toPhoto)), pending: json.pending ?? 0 }
  }

  const days = computed<DayBucket[]>(() => {
    const map = new Map<string, Photo[]>()
    for (const p of state.photos.value) {
      const d = new Date(p.takenAt * 1000)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(p)
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => (a < b ? 1 : -1))
      .map(([key, photos]) => ({ key, date: new Date(photos[0].takenAt * 1000), photos }))
  })

  /** Timeline agrupado por mes (para las cabeceras mes/año de Memories). */
  const months = computed(() => {
    const byMonth = new Map<string, DayBucket[]>()
    for (const d of days.value) {
      const key = d.key.slice(0, 7)
      if (!byMonth.has(key)) byMonth.set(key, [])
      byMonth.get(key)!.push(d)
    }
    return Array.from(byMonth.entries())
      .sort(([a], [b]) => (a < b ? 1 : -1))
      .map(([key, list]) => ({
        key,
        label: new Intl.DateTimeFormat(navigator.language || 'en', { month: 'long', year: 'numeric' }).format(list[0].date),
        days: list
      }))
  })

  /** Miniatura del backend (decodifica HEIC/HEIF). Devuelve un blob URL. */
  const ensurePreview = async (p: Photo, size = 400, _processor?: ProcessorType): Promise<string> => {
    const key = `${p.id}|${size}`
    if (previews.value[key]) return previews.value[key]
    try {
      const res = await api(`/api/assets/${p.id}/thumb?w=${size}`)
      const blob = await res.blob()
      if (!blob.size) return ''
      const url = URL.createObjectURL(blob)
      previews.value[key] = url
      return url
    } catch {
      return ''
    }
  }

  /** URL firmada de streaming progresivo para un vídeo (Range, mismo origen). */
  const videoUrl = async (p: Photo): Promise<string> => {
    const res = await api(`/api/assets/${p.id}/video-url`, { method: 'POST' })
    const json = (await res.json()) as { url?: string }
    return json.url ?? ''
  }

  /** Original (o vídeo) del backend, como blob URL. */
  const ensureOriginal = async (p: Photo): Promise<string> => {
    const key = `o${p.id}`
    if (originals.value[key]) return originals.value[key]
    try {
      const res = await api(`/api/assets/${p.id}/original`)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      originals.value[key] = url
      return url
    } catch {
      return ''
    }
  }

  const toggleFavorite = async (p: Photo): Promise<void> => {
    const next = !p.favorite
    await api(`/api/assets/${p.id}/favorite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ favorite: next })
    })
    p.favorite = next
  }

  const fetchGeo = async (): Promise<Photo[]> => {
    const res = await api('/api/geo')
    const json = (await res.json()) as { assets?: ApiAsset[] }
    return (json.assets ?? []).map(toPhoto)
  }

  const fetchOnThisDay = async (days = 3): Promise<Photo[]> => {
    const res = await api(`/api/memories/on-this-day?days=${days}`)
    const json = (await res.json()) as { assets?: ApiAsset[] }
    return (json.assets ?? []).map(toPhoto)
  }

  // --- Álbumes ---
  const fetchAlbums = async (): Promise<Album[]> => {
    const res = await api('/api/albums')
    const json = (await res.json()) as { albums?: Album[] }
    return json.albums ?? []
  }

  const createAlbum = async (name: string): Promise<number> => {
    const res = await api('/api/albums', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    })
    const json = (await res.json()) as { id: number }
    return json.id
  }

  const renameAlbum = async (id: number, name: string): Promise<void> => {
    await api(`/api/albums/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    })
  }

  const deleteAlbum = async (id: number): Promise<void> => {
    await api(`/api/albums/${id}`, { method: 'DELETE' })
  }

  const albumAssets = async (id: number): Promise<Photo[]> => {
    const res = await api(`/api/albums/${id}/assets`)
    const json = (await res.json()) as { assets?: ApiAsset[] }
    return (json.assets ?? []).map(toPhoto)
  }

  const addToAlbum = async (albumId: number, assetIds: number[]): Promise<void> => {
    await api(`/api/albums/${albumId}/assets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assetIds })
    })
  }

  const removeFromAlbum = async (albumId: number, assetId: number): Promise<void> => {
    await api(`/api/albums/${albumId}/assets/${assetId}`, { method: 'DELETE' })
  }

  // --- Etiquetas ---
  const fetchTags = async (): Promise<Tag[]> => {
    const res = await api('/api/tags')
    const json = (await res.json()) as { tags?: Tag[] }
    return json.tags ?? []
  }

  const tagAssets = async (tag: string): Promise<Photo[]> => {
    const res = await api(`/api/tags/${encodeURIComponent(tag)}/assets`)
    const json = (await res.json()) as { assets?: ApiAsset[] }
    return (json.assets ?? []).map(toPhoto)
  }

  const assetTags = async (id: number): Promise<string[]> => {
    const res = await api(`/api/assets/${id}/tags`)
    const json = (await res.json()) as { tags?: string[] }
    return json.tags ?? []
  }

  const addTag = async (id: number, tag: string): Promise<void> => {
    await api(`/api/assets/${id}/tags`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tag })
    })
  }

  const removeTag = async (id: number, tag: string): Promise<void> => {
    await api(`/api/assets/${id}/tags/${encodeURIComponent(tag)}`, { method: 'DELETE' })
  }

  // --- Carpetas ---
  const fetchFolder = async (path = ''): Promise<FolderListing> => {
    const res = await api(`/api/folders?path=${encodeURIComponent(path)}`)
    const json = (await res.json()) as { path?: string; folders?: FolderEntry[]; assets?: ApiAsset[] }
    return { path: json.path ?? '', folders: json.folders ?? [], assets: (json.assets ?? []).map(toPhoto) }
  }

  // --- Lugares ---
  const fetchPlaces = async (): Promise<Place[]> => {
    const res = await api('/api/places')
    const json = (await res.json()) as { places?: Place[] }
    return json.places ?? []
  }

  const placeAssets = async (lat: number, lon: number): Promise<Photo[]> => {
    const res = await api(`/api/assets?limit=2000`)
    const json = (await res.json()) as { assets?: ApiAsset[] }
    const all = (json.assets ?? []).map(toPhoto)
    const r = (v: number) => Math.round(v * 100) / 100
    return all.filter((p) => p.lat != null && p.lon != null && r(p.lat) === r(lat) && r(p.lon) === r(lon))
  }

  /** Highlights de "On this day": mismo día -> mismo mes -> más antiguas. */
  const fetchHighlights = async (): Promise<{ scope: string; photos: Photo[] }> => {
    const res = await api('/api/memories/highlights')
    const json = (await res.json()) as { scope?: string; assets?: ApiAsset[] }
    return { scope: json.scope ?? 'oldest', photos: (json.assets ?? []).map(toPhoto) }
  }

  const searchAssets = async (q: string): Promise<Photo[]> => {
    const res = await api(`/api/assets?limit=500&q=${encodeURIComponent(q)}`)
    const json = (await res.json()) as { assets?: ApiAsset[] }
    return (json.assets ?? []).map(toPhoto)
  }

  const fetchFavorites = async (): Promise<Photo[]> => {
    const res = await api('/api/assets?favorites=1&limit=2000')
    const json = (await res.json()) as { assets?: ApiAsset[] }
    return (json.assets ?? []).map(toPhoto)
  }

  return {
    photos: state.photos,
    loading: state.loading,
    error: state.error,
    exhausted: state.exhausted,
    startAt: state.startAt,
    days,
    months,
    init,
    loadMore,
    jumpTo,
    fetchCalendar,
    startWatching,
    syncNow,
    rescan,
    ensurePreview,
    ensureOriginal,
    videoUrl,
    toggleFavorite,
    fetchGeo,
    fetchOnThisDay,
    fetchHighlights,
    fetchFavorites,
    fetchAlbums,
    createAlbum,
    renameAlbum,
    deleteAlbum,
    albumAssets,
    addToAlbum,
    removeFromAlbum,
    fetchPlaces,
    placeAssets,
    fetchTags,
    tagAssets,
    assetTags,
    addTag,
    removeTag,
    fetchFolder,
    setArchived,
    fetchArchived,
    fetchDuplicates,
    searchAssets,
    previews
  }
}
