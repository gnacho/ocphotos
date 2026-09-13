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
}

export interface DayBucket {
  key: string // yyyy-mm-dd
  date: Date
  photos: Photo[]
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
  favorite: a.favorite
})

const state = {
  photos: ref<Photo[]>([]),
  loading: ref(false),
  error: ref<string | null>(null),
  exhausted: ref(false),
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

  const fetchOnThisDay = async (): Promise<Photo[]> => {
    const res = await api('/api/memories/on-this-day')
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
    days,
    init,
    loadMore,
    rescan,
    ensurePreview,
    ensureOriginal,
    toggleFavorite,
    fetchGeo,
    fetchOnThisDay,
    fetchFavorites,
    previews
  }
}
