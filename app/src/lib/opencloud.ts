import type { PhotoAsset } from './types'

/**
 * Cliente mínimo de OpenCloud (patrón validado por el proyecto PhotoSort):
 *  1. GET /graph/v1.0/me/drives  → descubrir spaces y su webDavUrl
 *  2. PROPFIND sobre el webDavUrl (auth: usuario + app-token en Basic)
 *  3. GET / GET con Range para contenido
 *
 * Limitación conocida en el navegador: CORS. OpenCloud permite configurar
 * CORS para el dominio donde sirvas esta app (OC_CORS_ALLOW_ORIGINS).
 */

const PROPFIND_BODY = `<?xml version="1.0"?>
<d:propfind xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns">
  <d:prop>
    <d:resourcetype/><d:getetag/><d:getlastmodified/>
    <d:getcontentlength/><d:getcontenttype/>
  </d:prop>
</d:propfind>`

const IMAGE_EXT = ['.jpg', '.jpeg', '.png', '.heic', '.heif', '.webp', '.gif', '.tiff', '.raw', '.dng']
const VIDEO_EXT = ['.mp4', '.mov', '.m4v', '.webm', '.3gp']

export interface Drive {
  id: string
  name: string
  driveType: string
  webdavUrl: string
}

export interface DavEntry {
  href: string
  isDir: boolean
  etag: string
  lastModified: string
  size: number
  contentType: string
}

export class OpenCloudClient {
  private baseUrl: string
  private username: string
  private appToken: string

  constructor(baseUrl: string, username: string, appToken: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, '')
    this.username = username
    this.appToken = appToken
  }

  private authHeader() {
    return 'Basic ' + btoa(`${this.username}:${this.appToken}`)
  }

  /** GET /graph/v1.0/me/drives — descubrimiento de espacios */
  async listDrives(): Promise<Drive[]> {
    const res = await fetch(`${this.baseUrl}/graph/v1.0/me/drives`, {
      headers: { Authorization: this.authHeader() },
    })
    if (!res.ok) throw new Error(`Graph API respondió ${res.status}`)
    const json = await res.json()
    if (!Array.isArray(json?.value)) throw new Error('Respuesta inesperada de /me/drives')
    return json.value.map((d: any) => ({
      id: d.id,
      name: d.name,
      driveType: d.driveType,
      webdavUrl: d.root?.webDavUrl,
    }))
  }

  /** PROPFIND depth=1 sobre una carpeta */
  async listFolder(webdavUrl: string, path = ''): Promise<DavEntry[]> {
    const url = path ? `${webdavUrl.replace(/\/+$/, '')}/${path.split('/').map(encodeURIComponent).join('/')}` : webdavUrl
    const res = await fetch(url, {
      method: 'PROPFIND',
      headers: {
        Authorization: this.authHeader(),
        Depth: '1',
        'Content-Type': 'application/xml',
      },
      body: PROPFIND_BODY,
    })
    if (res.status === 404) throw new Error('Carpeta no encontrada')
    if (!res.ok) throw new Error(`PROPFIND respondió ${res.status}`)
    return parseMultistatus(await res.text())
  }

  /** Recorrido recursivo de un árbol (generador) */
  async *walk(webdavUrl: string, rootPath = ''): AsyncGenerator<{ path: string; entry: DavEntry }> {
    const queue: string[] = [rootPath]
    while (queue.length) {
      const current = queue.shift()!
      const entries = await this.listFolder(webdavUrl, current)
      for (const e of entries) {
        const rel = decodeURIComponent(new URL(e.href, this.baseUrl).pathname)
        if (e.isDir) queue.push(rel)
        else yield { path: rel, entry: e }
      }
    }
  }

  thumbUrl(path: string, w = 400, h = 400) {
    // Servicio de thumbnails de OpenCloud: /dav/spaces/{spaceId}/{path}?x=&y=&processor=
    return `${this.baseUrl}${path}?x=${w}&y=${h}&processor=fit&a=${encodeURIComponent(this.appToken)}`
  }

  downloadUrl(path: string) {
    return `${this.baseUrl}${path}?a=${encodeURIComponent(this.appToken)}`
  }
}

function parseMultistatus(xml: string): DavEntry[] {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  const entries: DavEntry[] = []
  for (const resp of Array.from(doc.getElementsByTagNameNS('DAV:', 'response'))) {
    const href = resp.getElementsByTagNameNS('DAV:', 'href')[0]?.textContent ?? ''
    const prop = resp.getElementsByTagNameNS('DAV:', 'propstat')[0]?.getElementsByTagNameNS('DAV:', 'prop')[0]
    if (!prop) continue
    const get = (tag: string) => prop.getElementsByTagNameNS('DAV:', tag)[0]?.textContent ?? ''
    entries.push({
      href,
      isDir: prop.getElementsByTagNameNS('DAV:', 'collection').length > 0,
      etag: get('getetag'),
      lastModified: get('getlastmodified'),
      size: Number(get('getcontentlength') || 0),
      contentType: get('getcontenttype'),
    })
  }
  return entries
}

function ext(name: string) {
  const i = name.lastIndexOf('.')
  return i >= 0 ? name.slice(i).toLowerCase() : ''
}

/** Convierte entradas DAV en assets (fecha provisional = lastmodified; el servicio Go afinará con EXIF) */
export function entriesToAssets(client: OpenCloudClient, items: { path: string; entry: DavEntry }[]): PhotoAsset[] {
  return items
    .filter(({ path }) => {
      const e = ext(path)
      return IMAGE_EXT.includes(e) || VIDEO_EXT.includes(e)
    })
    .map(({ path, entry }, i) => {
      const filename = path.split('/').pop() ?? path
      const isVideo = VIDEO_EXT.includes(ext(path))
      return {
        id: entry.etag || `oc${i}`,
        path,
        filename,
        takenAt: entry.lastModified ? new Date(entry.lastModified) : new Date(),
        width: 1600,
        height: 1200,
        thumbUrl: client.thumbUrl(path),
        fullUrl: client.downloadUrl(path),
        isVideo,
        personIds: [],
        favorite: false,
      }
    })
}
