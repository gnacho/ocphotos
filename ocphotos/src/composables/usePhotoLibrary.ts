import { computed, ref } from 'vue'
import { useClientService, useSpacesStore } from '@opencloud-eu/web-pkg'
import { urlJoin } from '@opencloud-eu/web-client'
import type { Resource, SpaceResource } from '@opencloud-eu/web-client'

export interface Photo {
  path: string
  name: string
  etag: string
  mtime: number // segundos
  size: number
  mime: string
  isVideo: boolean
}

export interface DayBucket {
  key: string // yyyy-mm-dd
  date: Date
  photos: Photo[]
}

const IMAGE_EXT = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.heic', '.heif', '.tiff', '.dng']
const VIDEO_EXT = ['.mp4', '.mov', '.m4v', '.webm', '.3gp']

const ext = (n: string) => {
  const i = n.lastIndexOf('.')
  return i >= 0 ? n.slice(i).toLowerCase() : ''
}

const toPhoto = (r: Resource): Photo | null => {
  const e = ext(r.name)
  const isImage = IMAGE_EXT.includes(e) || (r.mimeType ?? '').startsWith('image/')
  const isVideo = VIDEO_EXT.includes(e) || (r.mimeType ?? '').startsWith('video/')
  if (!isImage && !isVideo) return null
  return {
    path: r.path,
    name: r.name,
    etag: r.etag ?? '',
    mtime: r.mdate ? Math.floor(new Date(r.mdate).getTime() / 1000) : 0,
    size: Number(r.size ?? 0),
    mime: r.mimeType ?? '',
    isVideo
  }
}

// caché en localStorage: lista de fotos + firma del árbol (etag de la raíz).
// En rescans posteriores, si el etag raíz no cambió y no hay cambios profundos,
// el usuario puede forzar rescan. v1: escaneo completo por sesión + caché.
const CACHE_KEY = 'ocphotos.cache.v1'
const CACHE_TTL = 6 * 3600 * 1000

const state = {
  photos: ref<Photo[]>([]),
  loading: ref(false),
  progress: ref(''),
  error: ref<string | null>(null),
  space: ref<SpaceResource | null>(null),
  initialized: false
}

export function usePhotoLibrary() {
  const clientService = useClientService()
  const spacesStore = useSpacesStore()

  const personalSpace = computed<SpaceResource | null>(() => {
    if (state.space.value) return state.space.value
    const spaces = spacesStore.personalSpace ? [spacesStore.personalSpace] : []
    return spaces[0] ?? null
  })

  const loadCache = (): Photo[] | null => {
    try {
      const raw = localStorage.getItem(CACHE_KEY)
      if (!raw) return null
      const { at, photos } = JSON.parse(raw)
      if (Date.now() - at > CACHE_TTL) return null
      return photos
    } catch {
      return null
    }
  }

  const saveCache = (photos: Photo[]) => {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), photos }))
    } catch {
      // localStorage lleno con librerías muy grandes: se omite la caché
    }
  }

  /** Escaneo recursivo WebDAV (depth=1 por carpeta) de la raíz configurada. */
  const scan = async (root: string, force = false) => {
    if (state.loading.value) return
    state.loading.value = true
    state.error.value = null
    try {
      const space = personalSpace.value
      if (!space) throw new Error('Espacio personal no disponible')

      if (!force) {
        const cached = loadCache()
        if (cached) {
          state.photos.value = cached
          state.loading.value = false
          return
        }
      }

      const found: Photo[] = []
      const queue = [root]
      let folders = 0
      while (queue.length) {
        const current = queue.shift()!
        state.progress.value = `${folders} carpetas · ${found.length} fotos`
        let children: Resource[] = []
        try {
          const res = await clientService.webdav.listFiles(space, { path: current })
          children = res.children
        } catch {
          continue // carpeta inaccesible: se omite
        }
        folders++
        for (const c of children) {
          if (c.type === 'folder') queue.push(c.path)
          else {
            const p = toPhoto(c)
            if (p) found.push(p)
          }
        }
      }
      found.sort((a, b) => b.mtime - a.mtime)
      state.photos.value = found
      saveCache(found)
    } catch (e: any) {
      state.error.value = e?.message ?? String(e)
    } finally {
      state.loading.value = false
      state.progress.value = ''
    }
  }

  const init = async (root: string) => {
    if (state.initialized) return
    state.initialized = true
    await scan(root)
  }

  const days = computed<DayBucket[]>(() => {
    const map = new Map<string, Photo[]>()
    for (const p of state.photos.value) {
      const d = new Date(p.mtime * 1000)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(p)
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => (a < b ? 1 : -1))
      .map(([key, photos]) => ({ key, date: new Date(photos[0].mtime * 1000), photos }))
  })

  /** "Un día como hoy" agrupado por año (con fecha de fichero; EXIF llega con el backend). */
  const onThisDay = computed<Map<number, Photo[]>>(() => {
    const now = new Date()
    const groups = new Map<number, Photo[]>()
    for (const p of state.photos.value) {
      const d = new Date(p.mtime * 1000)
      if (d.getMonth() === now.getMonth() && d.getDate() === now.getDate() && d.getFullYear() !== now.getFullYear()) {
        if (!groups.has(d.getFullYear())) groups.set(d.getFullYear(), [])
        groups.get(d.getFullYear())!.push(p)
      }
    }
    return new Map([...groups.entries()].sort(([a], [b]) => b - a))
  })

  /** URL de miniatura servida por OpenCloud (sesión del host, sin tokens). */
  const previewUrl = (p: Photo, size = 400): string => {
    const space = personalSpace.value
    if (!space) return ''
    const base = (space as any).webDavPath ?? urlJoin('/dav/spaces', space.id)
    return urlJoin(base, p.path) + `?x=${size}&y=${size}&processor=thumbnail&scalingup=0`
  }

  /** URL del original vía WebDAV (descarga/visualización en sesión). */
  const fileUrl = (p: Photo): string => {
    const space = personalSpace.value
    if (!space) return ''
    const base = (space as any).webDavPath ?? urlJoin('/dav/spaces', space.id)
    return urlJoin(base, p.path)
  }

  return {
    photos: state.photos,
    loading: state.loading,
    progress: state.progress,
    error: state.error,
    days,
    onThisDay,
    init,
    rescan: (root: string) => scan(root, true),
    previewUrl,
    fileUrl
  }
}
