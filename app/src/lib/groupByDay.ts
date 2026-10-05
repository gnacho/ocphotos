import type { DayBucket, PhotoAsset } from './types'

/** agrupa assets por día (clave YYYY-MM-DD), más reciente primero */
export function groupByDay(assets: PhotoAsset[]): DayBucket[] {
  const map = new Map<string, PhotoAsset[]>()
  for (const a of assets) {
    const key = `${a.takenAt.getFullYear()}-${String(a.takenAt.getMonth() + 1).padStart(2, '0')}-${String(a.takenAt.getDate()).padStart(2, '0')}`
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(a)
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([key, list]) => ({ key, date: list[0].takenAt, assets: list }))
}
