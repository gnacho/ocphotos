import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useStore } from '@/hooks/useStore'
import { loadImageUrl } from '@/lib/images'
import type { ApiAsset, PhotoAsset } from '@/lib/types'

export default function MapView() {
  const { filteredAssets, openViewer, mode, serviceToken } = useStore()
  const ref = useRef<HTMLDivElement>(null)
  const geoAssets = useGeoAssets(mode, serviceToken, filteredAssets)
  const mapRef = useRef<L.Map | null>(null)
  const layerRef = useRef<L.LayerGroup | null>(null)

  useEffect(() => {
    if (!ref.current || mapRef.current) return
    const map = L.map(ref.current, { center: [35, 0], zoom: 2, zoomControl: true, attributionControl: false })
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map)
    layerRef.current = L.layerGroup().addTo(map)
    mapRef.current = map
    return () => { map.remove(); mapRef.current = null }
  }, [])

  useEffect(() => {
    const layer = layerRef.current
    if (!layer) return
    let alive = true
    layer.clearLayers()
    const withGps = geoAssets.filter((a) => a.lat !== undefined && a.lon !== undefined)
    const bounds: L.LatLngExpression[] = []
    void (async () => {
      for (const a of withGps.slice(0, 600)) {
        // Leaflet pinta el icono como HTML, sin cabeceras, así que la miniatura
        // se descarga con el bearer antes de crear el marcador.
        const thumb = await loadImageUrl(a.thumbUrl, serviceToken)
        if (!alive) return
        const icon = L.divIcon({
          className: '',
          html: `<img src="${thumb}" style="width:44px;height:44px;object-fit:cover;border-radius:8px;border:2px solid white;box-shadow:0 1px 6px rgba(0,0,0,.5)" />`,
          iconSize: [48, 48],
          iconAnchor: [24, 24],
        })
        const marker = L.marker([a.lat!, a.lon!], { icon })
        marker.on('click', () => openViewer(withGps, withGps.indexOf(a)))
        marker.bindTooltip(a.place ?? a.filename, { direction: 'top' })
        layer.addLayer(marker)
        bounds.push([a.lat!, a.lon!])
      }
      if (alive && bounds.length > 1 && mapRef.current) mapRef.current.fitBounds(L.latLngBounds(bounds).pad(0.15))
    })()
    return () => {
      alive = false
    }
  }, [geoAssets, openViewer, serviceToken])

  return (
    <div className="flex h-full flex-col">
      <div ref={ref} className="min-h-0 flex-1" />
      <p className="bg-app px-4 py-2 text-xs text-faint">
        {geoAssets.filter((a) => a.lat !== undefined).length} fotos con ubicación · © OpenStreetMap
      </p>
    </div>
  )
}

/** geo asset del API del servicio (ApiAsset + coordenadas) */
type GeoApiAsset = ApiAsset & { lat?: number; lon?: number; place?: string }

function useGeoAssets(mode: string, token: string, fallback: PhotoAsset[]) {
  const [svc, setSvc] = useState<GeoApiAsset[] | null>(null)

  // reset al cambiar de modo durante el render (patrón "adjust state during render")
  const [prevMode, setPrevMode] = useState(mode)
  if (prevMode !== mode) {
    setPrevMode(mode)
    setSvc(null)
  }

  useEffect(() => {
    if (mode !== 'service') return
    fetch('/api/geo', { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j: { assets?: GeoApiAsset[] }) => setSvc(j.assets ?? []))
      .catch(() => setSvc([]))
  }, [mode, token])
  if (mode === 'service') {
    return (svc ?? []).map((a): PhotoAsset => ({
      id: String(a.id),
      path: a.path,
      filename: a.filename,
      takenAt: new Date(a.takenAt * 1000),
      width: a.width || 1600,
      height: a.height || 1200,
      thumbUrl: `/api/assets/${a.id}/thumb?w=100`,
      fullUrl: `/api/assets/${a.id}/original`,
      personIds: [],
      isVideo: a.mediaType === 'video',
      favorite: a.favorite ?? false,
      lat: a.lat,
      lon: a.lon,
      place: a.place,
    }))
  }
  return fallback
}
