import { useEffect, useState } from 'react'
import { useStore } from '@/hooks/useStore'
import { isServiceUrl, loadImageUrl } from '@/lib/images'

interface Resolved {
  url: string
  src: string
}

/**
 * Devuelve una URL que el navegador puede pintar en un <img>: la misma que
 * recibe si no es del servicio, o el object URL del blob descargado con el
 * bearer. Mientras resuelve devuelve cadena vacía para no pedir nada sin token.
 * El estado guarda también la URL a la que corresponde, así al cambiar de foto
 * no se pinta el blob de la anterior.
 */
export function useImageUrl(url: string): string {
  const { serviceToken } = useStore()
  const fromService = isServiceUrl(url)
  const [resolved, setResolved] = useState<Resolved | null>(null)

  useEffect(() => {
    if (!fromService) return
    let alive = true
    void loadImageUrl(url, serviceToken).then((src) => {
      if (alive) setResolved({ url, src })
    })
    return () => {
      alive = false
    }
  }, [fromService, url, serviceToken])

  if (!fromService) return url
  return resolved && resolved.url === url ? resolved.src : ''
}
