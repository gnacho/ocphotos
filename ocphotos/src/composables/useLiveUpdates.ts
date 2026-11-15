/**
 * Canal de avisos de cambio del backend (Server-Sent Events).
 *
 * El servidor mantiene este stream abierto por usuario y manda un mensaje
 * pequeño cuando cambia algo de lo suyo; la app recarga entonces ESE dato con la
 * API normal. Así no hace falta preguntar cada N segundos: no hay peticiones
 * mientras no pasa nada y el cambio se ve al instante.
 *
 * Se lee con fetch y no con EventSource porque EventSource no permite mandar la
 * cabecera Authorization, y la auth de ocapps va por ahí (Bearer del host).
 */

export type LiveTopic = 'photos' | 'albums'

export interface LiveEvent {
  topic: LiveTopic
  client?: string
}

export interface LiveOptions {
  path: string // ruta del stream (ej. /ocphotos-api/api/stream)
  getToken: () => string
  onChange: (event: LiveEvent) => void
  /** Se llama al recuperar el stream tras un corte: se pudo perder algún aviso. */
  onReconnect?: () => void
}

/** Id de este cliente (una pestaña = un id). Viaja en cada escritura para que
 * el servidor devuelva sus propios eventos marcados y no recargue lo que ya
 * tiene en pantalla. */
export const CLIENT_ID =
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`

/** Cabecera con la que el backend identifica al cliente que escribe. */
export const CLIENT_HEADER = 'X-Ocapps-Client'

// Esperas entre reintentos (la última se repite). Cortas al principio para que
// un corte de red momentáneo no deje la vista congelada, largas al final para no
// martillear un servidor caído.
const RETRY_MS = [1000, 2000, 5000, 10000, 30000]

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/** Trocea el cuerpo del stream en eventos. Los `:` son comentarios (heartbeat)
 * y `retry:` lo ignoramos: los reintentos los gobierna este módulo. */
const emitFrame = (frame: string, onChange: (event: LiveEvent) => void) => {
  const data = frame
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trimStart())
    .join('\n')
  if (!data) return
  try {
    const event = JSON.parse(data) as LiveEvent
    if (event && typeof event.topic === 'string') onChange(event)
  } catch {
    /* evento ilegible: se ignora, el siguiente vendrá bien */
  }
}

/** Lee el cuerpo hasta que se cierre (o hasta que `read` falle al abortar). */
export const readStream = async (
  body: ReadableStream<Uint8Array>,
  onChange: (event: LiveEvent) => void
): Promise<void> => {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) return
      buffer += decoder.decode(value, { stream: true })
      buffer = buffer.replace(/\r\n/g, '\n')
      for (let idx = buffer.indexOf('\n\n'); idx >= 0; idx = buffer.indexOf('\n\n')) {
        emitFrame(buffer.slice(0, idx), onChange)
        buffer = buffer.slice(idx + 2)
      }
    }
  } finally {
    try {
      reader.releaseLock()
    } catch {
      /* ya liberado */
    }
  }
}

/**
 * Abre el stream y lo mantiene abierto. Devuelve la función para cerrarlo.
 * Nunca lanza: si el stream no está disponible la app sigue funcionando, solo
 * sin avisos en vivo (una recarga manual lo recoge todo).
 */
export const startLiveUpdates = (options: LiveOptions): (() => void) => {
  let stopped = false
  let controller: AbortController | null = null
  let attempt = 0
  let openedOnce = false

  const run = async () => {
    while (!stopped) {
      controller = new AbortController()
      try {
        const res = await fetch(options.path, {
          headers: {
            Authorization: `Bearer ${options.getToken()}`,
            Accept: 'text/event-stream'
          },
          signal: controller.signal
        })
        if (res.status === 404) {
          // Backend sin stream (versión anterior a ocapps#41): no insistir.
          stopped = true
          return
        }
        if (!res.ok || !res.body) throw new Error(`stream -> ${res.status}`)
        attempt = 0
        if (openedOnce) options.onReconnect?.()
        openedOnce = true
        await readStream(res.body, (event) => {
          if (!stopped) options.onChange(event)
        })
      } catch {
        /* corte, 401 o red caída: se reintenta abajo */
      }
      if (stopped) return
      const delay = RETRY_MS[Math.min(attempt, RETRY_MS.length - 1)]
      attempt += 1
      await wait(delay)
    }
  }

  void run()
  return () => {
    stopped = true
    controller?.abort()
  }
}
