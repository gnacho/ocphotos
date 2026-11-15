import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readStream, startLiveUpdates, type LiveEvent } from './useLiveUpdates'

/** Cuerpo de stream a partir de trozos de texto: cada `read()` devuelve uno. */
const streamOf = (chunks: string[]) => {
  let i = 0
  const encoder = new TextEncoder()
  return {
    getReader: () => ({
      read: () => {
        if (i < chunks.length) return Promise.resolve({ value: encoder.encode(chunks[i++]), done: false })
        return Promise.resolve({ value: undefined, done: true })
      },
      releaseLock: () => {}
    })
  } as unknown as ReadableStream<Uint8Array>
}

/** Stream que no termina nunca (simula la conexión viva). */
const endlessStream = () => {
  let resolveRead: (() => void) | null = null
  return {
    getReader: () => ({
      read: () =>
        new Promise((resolve) => {
          resolveRead = () => resolve({ value: undefined, done: true })
        }),
      releaseLock: () => {},
      _end: () => resolveRead?.()
    })
  } as unknown as ReadableStream<Uint8Array>
}

describe('readStream', () => {
  const collect = async (chunks: string[]): Promise<LiveEvent[]> => {
    const events: LiveEvent[] = []
    await readStream(streamOf(chunks), (e) => events.push(e))
    return events
  }

  it('emits one event per frame and skips heartbeats and retry hints', async () => {
    const events = await collect([
      'retry: 3000\n: connected\n\n',
      'data: {"topic":"photos"}\n\n',
      ': ping\n\n',
      'data: {"topic":"albums","client":"tab-1"}\n\n'
    ])
    expect(events).toEqual([{ topic: 'photos' }, { topic: 'albums', client: 'tab-1' }])
  })

  it('reassembles frames split across reads', async () => {
    const events = await collect(['data: {"to', 'pic":"pho', 'tos"}\n', '\n'])
    expect(events).toEqual([{ topic: 'photos' }])
  })

  it('handles CRLF frames and several events in one chunk', async () => {
    const events = await collect(['data: {"topic":"photos"}\r\n\r\ndata: {"topic":"albums"}\r\n\r\n'])
    expect(events.map((e) => e.topic)).toEqual(['photos', 'albums'])
  })

  it('ignores frames without data and unparseable ones', async () => {
    expect(await collect([': solo comentario\n\n', 'data: {no es json}\n\n', 'data: {"nada":1}\n\n'])).toEqual([])
  })

  it('joins multi-line data and exposes it to the callback', async () => {
    const events = await collect(['data: {"topic":\ndata: "photos"}\n\n'])
    expect(events).toEqual([{ topic: 'photos' }])
  })
})

describe('startLiveUpdates', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  const ok = (body: unknown) => ({ ok: true, status: 200, body }) as unknown as Response

  beforeEach(() => {
    vi.useFakeTimers()
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('opens the stream with the bearer token and forwards events', async () => {
    const events: LiveEvent[] = []
    fetchMock.mockResolvedValueOnce(ok(streamOf(['data: {"topic":"photos"}\n\n'])))
    const stop = startLiveUpdates({
      path: '/ocphotos-api/api/stream',
      getToken: () => 'tok-1',
      onChange: (e) => events.push(e)
    })
    await vi.advanceTimersByTimeAsync(0)
    stop()

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/ocphotos-api/api/stream')
    const headers = (init as RequestInit).headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer tok-1')
    expect(headers.Accept).toBe('text/event-stream')
    expect(events).toEqual([{ topic: 'photos' }])
  })

  it('reconnects with a fresh token and reports the gap once', async () => {
    const events: LiveEvent[] = []
    const onReconnect = vi.fn()
    let call = 0
    fetchMock.mockImplementation(() => {
      call += 1
      return Promise.resolve(ok(streamOf([`data: {"topic":"photos","client":"c${call}"}\n\n`])))
    })
    const stop = startLiveUpdates({
      path: '/stream',
      getToken: () => `tok-${call + 1}`,
      onChange: (e) => events.push(e),
      onReconnect
    })

    await vi.advanceTimersByTimeAsync(0)
    expect(onReconnect).not.toHaveBeenCalled()

    // El primer stream terminó: tras la espera vuelve a abrir.
    await vi.advanceTimersByTimeAsync(1000)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(onReconnect).toHaveBeenCalledTimes(1)
    expect(events.map((e) => e.client)).toEqual(['c1', 'c2'])
    expect(((fetchMock.mock.calls[1][1] as RequestInit).headers as Record<string, string>).Authorization).toBe(
      'Bearer tok-2'
    )
    stop()
  })

  it('keeps retrying after failures, backing off, and stops when asked', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401 } as unknown as Response)
    const stop = startLiveUpdates({ path: '/stream', getToken: () => 't', onChange: () => {} })

    await vi.advanceTimersByTimeAsync(0)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(1000)
    expect(fetchMock).toHaveBeenCalledTimes(2)

    await vi.advanceTimersByTimeAsync(2000)
    expect(fetchMock).toHaveBeenCalledTimes(3)

    stop()
    await vi.advanceTimersByTimeAsync(60000)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('gives up when the backend does not have the stream endpoint', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404 } as unknown as Response)
    startLiveUpdates({ path: '/stream', getToken: () => 't', onChange: () => {} })

    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(60000)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('retries when the response has no body', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, body: null } as unknown as Response)
    const stop = startLiveUpdates({ path: '/stream', getToken: () => 't', onChange: () => {} })

    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(1000)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    stop()
  })

  it('does not deliver events after being stopped', async () => {
    const body = endlessStream()
    const events: LiveEvent[] = []
    fetchMock.mockResolvedValueOnce(ok(body))
    const stop = startLiveUpdates({
      path: '/stream',
      getToken: () => 't',
      onChange: (e) => events.push(e)
    })

    stop()
    await vi.advanceTimersByTimeAsync(0)
    expect(events).toEqual([])
  })
})
