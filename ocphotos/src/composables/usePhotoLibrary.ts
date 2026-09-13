import { computed, ref } from 'vue'
import { useClientService, usePreviewService, useSpacesStore } from '@opencloud-eu/web-pkg'
import type { ProcessorType } from '@opencloud-eu/web-pkg'
import type { Resource, SpaceResource } from '@opencloud-eu/web-client'

export interface Photo {
  id: string
  path: string
  webDavPath: string
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
    id: r.id ?? '',
    path: r.path,
    webDavPath: (r as any).webDavPath ?? '',
    name: r.name,
    etag: r.etag ?? '',
    mtime: r.mdate ? Math.floor(new Date(r.mdate).getTime() / 1000) : 0,
    size: Number(r.size ?? 0),
    mime: r.mimeType ?? '',
    isVideo
  }
}

// caché en localStorage: lista de fotos. v3 incluye id/webDavPath (necesarios para
// pedir miniaturas autenticadas al servidor) y la raíz escaneada. La caché de
// previews vive en memoria (blob URLs), no se serializa.
const CACHE_KEY = 'ocphotos.cache.v3'
const CACHE_TTL = 6 * 3600 * 1000
const STORED_ROOT = 'ocphotos.root'
const FALLBACK_ROOT = '/Fotos'

// raíz por defecto, configurable desde apps.yaml (ocphotos.config.rootPath). La
// elección del usuario en la UI (localStorage) tiene prioridad sobre el default.
let configuredRoot = FALLBACK_ROOT
export function setConfiguredRoot(path?: string) {
  if (path && typeof path === 'string' && path.trim()) configuredRoot = path.trim()
}

const state = {
  photos: ref<Photo[]>([]),
  loading: ref(false),
  progress: ref(''),
  error: ref<string | null>(null),
  root: ref<string>(''),
  rootMissing: ref(false),
  space: ref<SpaceResource | null>(null),
  initialized: false
}

// blob URLs de previews y originales, indexados por clave; en memoria por sesión
const previews = ref<Record<string, string>>({})
const originals = ref<Record<string, string>>({})

const previewKey = (p: Photo, size: number, processor: ProcessorType) => `${p.path}|${size}|${processor}`
const originalKey = (p: Photo) => `${p.path}|original`

export function usePhotoLibrary() {
  const clientService = useClientService()
  const previewService = usePreviewService()
  const spacesStore = useSpacesStore()

  const personalSpace = computed<SpaceResource | null>(() => {
    if (state.space.value) return state.space.value
    const spaces = spacesStore.personalSpace ? [spacesStore.personalSpace] : []
    return spaces[0] ?? null
  })

  const loadCache = (root: string): Photo[] | null => {
    try {
      const raw = localStorage.getItem(CACHE_KEY)
      if (!raw) return null
      const { at, root: cachedRoot, photos } = JSON.parse(raw)
      if (cachedRoot !== root) return null
      if (Date.now() - at > CACHE_TTL) return null
      return photos
    } catch {
      return null
    }
  }

  const saveCache = (root: string, photos: Photo[]) => {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), root, photos }))
    } catch {
      // localStorage lleno con librerías muy grandes: se omite la caché
    }
  }

  /** Escaneo recursivo WebDAV (depth=1 por carpeta) de la raíz configurada. */
  const scan = async (root: string, force = false) => {
    if (state.loading.value) return
    state.loading.value = true
    state.error.value = null
    state.rootMissing.value = false
    try {
      const space = personalSpace.value
      if (!space) throw new Error('Espacio personal no disponible')

      if (!force) {
        const cached = loadCache(root)
        if (cached) {
          state.photos.value = cached
          state.root.value = root
          state.loading.value = false
          return
        }
      }

      const found: Photo[] = []
      const queue = [root]
      let folders = 0
      let first = true
      while (queue.length) {
        const current = queue.shift()!
        state.progress.value = `${folders} carpetas · ${found.length} fotos`
        let children: Resource[] = []
        try {
          const res = await clientService.webdav.listFiles(space, { path: current })
          children = res.children
        } catch {
          // una raíz inaccesible se distingue de una raíz vacía para la UI
          if (first) state.rootMissing.value = true
          first = false
          continue
        }
        first = false
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
      state.root.value = root
      saveCache(root, found)
    } catch (e: any) {
      state.error.value = e?.message ?? String(e)
    } finally {
      state.loading.value = false
      state.progress.value = ''
    }
  }

  const init = async (root?: string) => {
    if (state.initialized) return
    state.initialized = true
    const stored = localStorage.getItem(STORED_ROOT)
    await scan(root ?? stored ?? configuredRoot)
  }

  /** Cambia la raíz escaneada (elección del usuario) y reescanea. */
  const setRoot = async (root: string) => {
    try {
      localStorage.setItem(STORED_ROOT, root)
    } catch {
      // sin persistencia: se aplica solo en esta sesión
    }
    await scan(root, true)
  }

  /** Subcarpetas de una ruta, para el selector de carpeta. */
  const listFolders = async (path: string): Promise<Resource[]> => {
    const space = personalSpace.value
    if (!space) return []
    const res = await clientService.webdav.listFiles(space, { path })
    return res.children.filter((c) => c.type === 'folder')
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

  // Resource mínimo para la API de previews: solo necesita id/etag/webDavPath y
  // los métodos de capacidad, así que sirve tanto para fotos recién escaneadas
  // como para las que vienen de la caché de localStorage.
  const asResource = (p: Photo): Resource =>
    ({
      id: p.id,
      etag: p.etag,
      webDavPath: p.webDavPath,
      mimeType: p.mime,
      canDownload: () => true,
      hasPreview: () => !p.isVideo
    }) as unknown as Resource

  /** Pide (y cachea) una preview autenticada al servidor; devuelve un blob URL. */
  const ensurePreview = async (p: Photo, size = 400, processor: ProcessorType = 'thumbnail'): Promise<string> => {
    const key = previewKey(p, size, processor)
    if (previews.value[key]) return previews.value[key]
    const space = personalSpace.value
    if (!space || !p.id || !p.webDavPath) return ''
    try {
      const url = await previewService.loadPreview({
        space,
        resource: asResource(p),
        dimensions: [size, size],
        processor
      })
      if (url) previews.value[key] = url
      return url ?? ''
    } catch {
      return ''
    }
  }

  /** Descarga el fichero original con la sesión del host; devuelve un blob URL. */
  const ensureOriginal = async (p: Photo): Promise<string> => {
    const key = originalKey(p)
    if (originals.value[key]) return originals.value[key]
    const space = personalSpace.value
    if (!space) return ''
    try {
      const { body } = await clientService.webdav.getFileContents(
        space,
        { path: p.path },
        { responseType: 'blob', noCache: true }
      )
      const url = window.URL.createObjectURL(body)
      originals.value[key] = url
      return url
    } catch {
      return ''
    }
  }

  return {
    photos: state.photos,
    loading: state.loading,
    progress: state.progress,
    error: state.error,
    root: state.root,
    rootMissing: state.rootMissing,
    days,
    onThisDay,
    init,
    setRoot,
    listFolders,
    rescan: (root: string) => scan(root, true),
    previews,
    originals,
    ensurePreview,
    ensureOriginal
  }
}
