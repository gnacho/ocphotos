import { describe, expect, it, vi, beforeEach } from 'vitest'
import { OpenCloudClient, entriesToAssets, type DavEntry } from './opencloud'

const BASE = 'https://cloud.example.org'

function xmlResponse(xml: string, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(xml),
  } as unknown as Response
}

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response
}

function multistatus(entries: string) {
  return `<?xml version="1.0"?>
<d:multistatus xmlns:d="DAV:">
${entries}
</d:multistatus>`
}

const FOLDER = `
  <d:response>
    <d:href>/dav/spaces/space/Fotos/2024/</d:href>
    <d:propstat>
      <d:prop>
        <d:resourcetype><d:collection/></d:resourcetype>
        <d:getetag>"folder-etag"</d:getetag>
        <d:getlastmodified>Mon, 01 Jan 2024 10:00:00 GMT</d:getlastmodified>
      </d:prop>
    </d:propstat>
  </d:response>`

const PHOTO = `
  <d:response>
    <d:href>/dav/spaces/space/Fotos/2024/playa.jpg</d:href>
    <d:propstat>
      <d:prop>
        <d:resourcetype/>
        <d:getetag>"photo-etag"</d:getetag>
        <d:getlastmodified>Sun, 04 Aug 2024 18:30:00 GMT</d:getlastmodified>
        <d:getcontentlength>2048</d:getcontentlength>
        <d:getcontenttype>image/jpeg</d:getcontenttype>
      </d:prop>
    </d:propstat>
  </d:response>`

const NO_PROP = `
  <d:response>
    <d:href>/dav/spaces/space/Fotos/sin-prop</d:href>
  </d:response>`

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

describe('OpenCloudClient', () => {
  it('discover drives and map the webdav url', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        value: [
          { id: 'a', name: 'Personal', driveType: 'personal', root: { webDavUrl: 'https://cloud.example.org/dav/spaces/a' } },
          { id: 'b', name: 'Team', driveType: 'project' },
        ],
      }),
    )
    const client = new OpenCloudClient(`${BASE}///`, 'nacho', 'tok en')
    const drives = await client.listDrives()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://cloud.example.org/graph/v1.0/me/drives')
    expect((init.headers as Record<string, string>).Authorization).toBe(`Basic ${btoa('nacho:tok en')}`)
    expect(drives).toEqual([
      { id: 'a', name: 'Personal', driveType: 'personal', webdavUrl: 'https://cloud.example.org/dav/spaces/a' },
      { id: 'b', name: 'Team', driveType: 'project', webdavUrl: '' },
    ])
  })

  it('fail on a graph error and on an unexpected payload', async () => {
    const client = new OpenCloudClient(BASE, 'u', 't')
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 500))
    await expect(client.listDrives()).rejects.toThrow('Graph API respondió 500')

    fetchMock.mockResolvedValueOnce(jsonResponse({ value: 'nope' }))
    await expect(client.listDrives()).rejects.toThrow('Respuesta inesperada de /me/drives')
  })

  it('parse a PROPFIND multistatus into dav entries', async () => {
    fetchMock.mockResolvedValueOnce(xmlResponse(multistatus(FOLDER + PHOTO + NO_PROP)))
    const client = new OpenCloudClient(BASE, 'u', 't')
    const entries = await client.listFolder('https://cloud.example.org/dav/spaces/a')

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://cloud.example.org/dav/spaces/a')
    expect(init.method).toBe('PROPFIND')
    expect((init.headers as Record<string, string>).Depth).toBe('1')
    expect(String(init.body)).toContain('<d:propfind')

    expect(entries).toHaveLength(2)
    expect(entries[0]).toEqual({
      href: '/dav/spaces/space/Fotos/2024/',
      isDir: true,
      etag: '"folder-etag"',
      lastModified: 'Mon, 01 Jan 2024 10:00:00 GMT',
      size: 0,
      contentType: '',
    })
    expect(entries[1]).toEqual({
      href: '/dav/spaces/space/Fotos/2024/playa.jpg',
      isDir: false,
      etag: '"photo-etag"',
      lastModified: 'Sun, 04 Aug 2024 18:30:00 GMT',
      size: 2048,
      contentType: 'image/jpeg',
    })
  })

  it('encode every segment of the folder path', async () => {
    fetchMock.mockResolvedValueOnce(xmlResponse(multistatus('')))
    const client = new OpenCloudClient(BASE, 'u', 't')
    await client.listFolder('https://cloud.example.org/dav/spaces/a/', 'Fotos/Año 2024')

    const [url] = fetchMock.mock.calls[0] as [string]
    expect(url).toBe('https://cloud.example.org/dav/spaces/a/Fotos/A%C3%B1o%202024')
  })

  it('report a missing folder and other propfind failures', async () => {
    const client = new OpenCloudClient(BASE, 'u', 't')
    fetchMock.mockResolvedValueOnce(xmlResponse('', 404))
    await expect(client.listFolder('https://cloud.example.org/dav/spaces/a')).rejects.toThrow('Carpeta no encontrada')

    fetchMock.mockResolvedValueOnce(xmlResponse('', 507))
    await expect(client.listFolder('https://cloud.example.org/dav/spaces/a')).rejects.toThrow('PROPFIND respondió 507')
  })

  it('walk the tree depth first and yield only files', async () => {
    const root = multistatus(`
      <d:response>
        <d:href>/dav/spaces/a/Fotos/sub/</d:href>
        <d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop></d:propstat>
      </d:response>
      <d:response>
        <d:href>/dav/spaces/a/Fotos/uno.jpg</d:href>
        <d:propstat><d:prop><d:resourcetype/><d:getetag>"1"</d:getetag></d:prop></d:propstat>
      </d:response>`)
    const sub = multistatus(`
      <d:response>
        <d:href>/dav/spaces/a/Fotos/sub/dos%20copias.png</d:href>
        <d:propstat><d:prop><d:resourcetype/><d:getetag>"2"</d:getetag></d:prop></d:propstat>
      </d:response>`)
    fetchMock.mockImplementation((url: string) =>
      Promise.resolve(xmlResponse(url.endsWith('/Fotos') ? root : sub)),
    )

    const client = new OpenCloudClient(BASE, 'u', 't')
    const found: string[] = []
    for await (const item of client.walk('https://cloud.example.org/dav/spaces/a', 'Fotos')) {
      found.push(item.path)
    }

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(found).toEqual(['/dav/spaces/a/Fotos/uno.jpg', '/dav/spaces/a/Fotos/sub/dos copias.png'])
  })

  it('build thumbnail and download urls with the token', async () => {
    const client = new OpenCloudClient(BASE, 'u', 'tok en')
    expect(client.thumbUrl('/dav/spaces/a/f.jpg')).toBe(
      'https://cloud.example.org/dav/spaces/a/f.jpg?x=400&y=400&processor=fit&a=tok%20en',
    )
    expect(client.thumbUrl('/dav/spaces/a/f.jpg', 1280, 720)).toBe(
      'https://cloud.example.org/dav/spaces/a/f.jpg?x=1280&y=720&processor=fit&a=tok%20en',
    )
    expect(client.downloadUrl('/dav/spaces/a/f.jpg')).toBe('https://cloud.example.org/dav/spaces/a/f.jpg?a=tok%20en')
  })
})

describe('entriesToAssets', () => {
  const client = new OpenCloudClient(BASE, 'u', 't')

  function entry(over: Partial<DavEntry> = {}): DavEntry {
    return { href: '', isDir: false, etag: '"e"', lastModified: '', size: 0, contentType: '', ...over }
  }

  it('keep images and videos, dropping everything else', () => {
    const assets = entriesToAssets(client, [
      { path: '/Fotos/playa.JPG', entry: entry({ etag: '"1"' }) },
      { path: '/Fotos/clip.MOV', entry: entry({ etag: '"2"' }) },
      { path: '/Fotos/notas.md', entry: entry({ etag: '"3"' }) },
      { path: '/Fotos/sin-extension', entry: entry({ etag: '"4"' }) },
    ])

    expect(assets.map((a) => a.filename)).toEqual(['playa.JPG', 'clip.MOV'])
    expect(assets.map((a) => a.isVideo)).toEqual([false, true])
  })

  it('map etag, date, size and urls of each asset', () => {
    const [asset] = entriesToAssets(client, [
      { path: '/Fotos/2024/playa.jpg', entry: entry({ etag: '"photo"', lastModified: 'Sun, 04 Aug 2024 18:30:00 GMT' }) },
    ])

    expect(asset.id).toBe('"photo"')
    expect(asset.path).toBe('/Fotos/2024/playa.jpg')
    expect(asset.takenAt.toISOString()).toBe('2024-08-04T18:30:00.000Z')
    expect(asset.width).toBe(1600)
    expect(asset.height).toBe(1200)
    expect(asset.thumbUrl).toBe('https://cloud.example.org/Fotos/2024/playa.jpg?x=400&y=400&processor=fit&a=t')
    expect(asset.fullUrl).toBe('https://cloud.example.org/Fotos/2024/playa.jpg?a=t')
    expect(asset.favorite).toBe(false)
    expect(asset.personIds).toEqual([])
  })

  it('fall back to a generated id and to now when the dav entry has no data', () => {
    const before = Date.now()
    const [asset] = entriesToAssets(client, [{ path: '/Fotos/a.png', entry: entry({ etag: '', lastModified: '' }) }])

    expect(asset.id).toBe('oc0')
    expect(asset.takenAt.getTime()).toBeGreaterThanOrEqual(before)
  })
})
