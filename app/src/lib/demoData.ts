import type { Album, Person, PhotoAsset } from './types'

// PRNG determinista para que la demo sea estable entre cargas
function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const CAMERAS = [
  { make: 'Sony α7 III', lens: 'FE 35mm f/1.8' },
  { make: 'Fujifilm X-T4', lens: 'XF 23mm f/2' },
  { make: 'Canon EOS R6', lens: 'RF 50mm f/1.2L' },
  { make: 'Pixel 8 Pro', lens: '—' },
  { make: 'iPhone 15 Pro', lens: '—' },
  { make: 'Nikon Z6 II', lens: 'Z 24-70mm f/4 S' },
]

const PLACES: { name: string; lat: number; lon: number }[] = [
  { name: 'Madrid, España', lat: 40.4168, lon: -3.7038 },
  { name: 'Costa Rica', lat: 9.9281, lon: -84.0907 },
  { name: 'Alpes, Suiza', lat: 46.5598, lon: 8.5618 },
  { name: 'Kioto, Japón', lat: 35.0116, lon: 135.7681 },
  { name: 'Islandia', lat: 64.9631, lon: -19.0208 },
  { name: 'Lisboa, Portugal', lat: 38.7223, lon: -9.1393 },
  { name: 'Nueva York, EE. UU.', lat: 40.7128, lon: -74.006 },
  { name: 'Patagonia, Argentina', lat: -50.5, lon: -73.0 },
]

const PEOPLE_NAMES = [
  'María', 'Carlos', 'Lucía', 'Diego', 'Ana', 'Pablo',
  'Sofía', 'Martín', 'Elena', 'Jorge', 'Carmen', 'Andrés',
]

const FOLDERS = ['Cámara', 'Viajes/2024', 'Viajes/2025', 'Familia', 'Eventos', 'Archivo', 'Móvil']

export function generateDemoData(): { assets: PhotoAsset[]; people: Person[]; albums: Album[] } {
  const rnd = mulberry32(20260913)
  const people: Person[] = PEOPLE_NAMES.map((name, i) => ({
    id: `p${i}`,
    name,
    faceUrl: `https://i.pravatar.cc/150?img=${(i * 7) % 70 + 1}`,
    count: 0,
  }))

  const assets: PhotoAsset[] = []
  const now = new Date()
  const N = 1400

  for (let i = 0; i < N; i++) {
    // fechas repartidas en ~6 años, con estacionalidad (más fotos en verano y diciembre)
    const yearsBack = Math.floor(rnd() * 6)
    const monthBias = rnd()
    const month = monthBias < 0.3 ? 6 + Math.floor(rnd() * 2) : monthBias < 0.4 ? 11 : Math.floor(rnd() * 12)
    const day = 1 + Math.floor(rnd() * 28)
    const takenAt = new Date(now.getFullYear() - yearsBack, month, day, Math.floor(rnd() * 14) + 8, Math.floor(rnd() * 60))
    if (takenAt > now) continue

    const landscape = rnd() > 0.35
    const w = landscape ? 1600 : 1200
    const h = landscape ? Math.round(1600 / (1.2 + rnd() * 0.4)) : Math.round(1200 / (0.66 + rnd() * 0.2))
    const cam = CAMERAS[Math.floor(rnd() * CAMERAS.length)]
    const place = rnd() < 0.62 ? PLACES[Math.floor(rnd() * PLACES.length)] : undefined
    const folder = FOLDERS[Math.floor(rnd() * FOLDERS.length)]
    const isVideo = rnd() < 0.06
    const personIds: string[] = []
    const nPeople = rnd()
    if (nPeople < 0.25) personIds.push(people[Math.floor(rnd() * people.length)].id)
    if (nPeople < 0.08) personIds.push(people[Math.floor(rnd() * people.length)].id)

    const id = `a${i}`
    assets.push({
      id,
      path: `/Fotos/${folder}/IMG_${String(1000 + i)}.jpg`,
      filename: `IMG_${String(1000 + i)}.jpg`,
      takenAt,
      width: w,
      height: h,
      thumbUrl: `https://picsum.photos/seed/ocm${i}/400/400`,
      fullUrl: `https://picsum.photos/seed/ocm${i}/${w}/${h}`,
      camera: cam.make,
      lens: cam.lens,
      iso: [100, 200, 400, 800, 1600][Math.floor(rnd() * 5)],
      aperture: `f/${[1.8, 2.8, 4, 5.6, 8][Math.floor(rnd() * 5)]}`,
      shutter: `1/${[60, 125, 250, 500, 1000][Math.floor(rnd() * 5)]}`,
      focal: `${[23, 35, 50, 85][Math.floor(rnd() * 4)]} mm`,
      lat: place ? place.lat + (rnd() - 0.5) * 1.2 : undefined,
      lon: place ? place.lon + (rnd() - 0.5) * 1.2 : undefined,
      place: place?.name,
      isVideo,
      duration: isVideo ? `0:${String(10 + Math.floor(rnd() * 49))}` : undefined,
      personIds: [...new Set(personIds)],
      favorite: rnd() < 0.08,
    })
  }

  for (const a of assets) for (const pid of a.personIds) {
    const p = people.find((x) => x.id === pid)
    if (p) p.count++
  }

  assets.sort((a, b) => b.takenAt.getTime() - a.takenAt.getTime())

  const pick = (n: number, offset: number) =>
    assets.slice(offset, offset + n).map((a) => a.id)

  const albums: Album[] = [
    { id: 'al1', name: 'Costa Rica 2025', assetIds: pick(18, 40), createdAt: new Date(now.getFullYear() - 1, 2, 10) },
    { id: 'al2', name: 'Familia — mejores momentos', assetIds: assets.filter((a) => a.personIds.length > 0).slice(0, 24).map((a) => a.id), createdAt: new Date(now.getFullYear() - 2, 6, 1) },
    { id: 'al3', name: 'Islandia roadtrip', assetIds: pick(20, 300), createdAt: new Date(now.getFullYear() - 3, 8, 20) },
    { id: 'al4', name: 'Selección para imprimir', assetIds: assets.filter((a) => a.favorite).slice(0, 12).map((a) => a.id), createdAt: new Date(now.getFullYear() - 1, 11, 5) },
  ]

  return { assets, people, albums }
}
