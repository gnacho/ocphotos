/**
 * Las miniaturas y los originales del servicio se piden con la cabecera
 * Authorization, porque la API no acepta el token en la query. Un <img> no
 * puede enviar cabeceras, así que se descarga el blob y se pinta su object URL.
 * La caché vive a nivel de módulo para que el timeline, los recuerdos y el
 * mapa compartan la misma descarga.
 */
const cache = new Map<string, string>()
const inflight = new Map<string, Promise<string>>()

/** Las rutas del servicio son las que empiezan por /api/. */
export function isServiceUrl(url: string): boolean {
  return url.startsWith('/api/')
}

export async function loadImageUrl(url: string, token: string): Promise<string> {
  if (!isServiceUrl(url)) return url
  const cached = cache.get(url)
  if (cached) return cached
  let pending = inflight.get(url)
  if (!pending) {
    pending = fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then((res) => {
        if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`)
        return res.blob()
      })
      .then((blob) => {
        const objectUrl = URL.createObjectURL(blob)
        cache.set(url, objectUrl)
        return objectUrl
      })
      .finally(() => inflight.delete(url))
    inflight.set(url, pending)
  }
  try {
    return await pending
  } catch {
    return ''
  }
}

/** Al desconectar se liberan los blobs para no retener memoria del servicio anterior. */
export function clearImageCache(): void {
  for (const objectUrl of cache.values()) URL.revokeObjectURL(objectUrl)
  cache.clear()
  inflight.clear()
}
