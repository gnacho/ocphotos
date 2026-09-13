import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useStore } from '@/lib/store'

export default function MapView() {
  const { filteredAssets, openViewer } = useStore()
  const ref = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const layerRef = useRef<L.LayerGroup | null>(null)

  useEffect(() => {
    if (!ref.current || mapRef.current) return
    const map = L.map(ref.current, { center: [35, 0], zoom: 2, zoomControl: true, attributionControl: false })
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 19 }).addTo(map)
    layerRef.current = L.layerGroup().addTo(map)
    mapRef.current = map
    return () => { map.remove(); mapRef.current = null }
  }, [])

  useEffect(() => {
    const layer = layerRef.current
    if (!layer) return
    layer.clearLayers()
    const withGps = filteredAssets.filter((a) => a.lat !== undefined && a.lon !== undefined)
    const bounds: L.LatLngExpression[] = []
    for (const a of withGps.slice(0, 600)) {
      const icon = L.divIcon({
        className: '',
        html: `<img src="${a.thumbUrl}" style="width:44px;height:44px;object-fit:cover;border-radius:8px;border:2px solid white;box-shadow:0 1px 6px rgba(0,0,0,.5)" />`,
        iconSize: [48, 48],
        iconAnchor: [24, 24],
      })
      const marker = L.marker([a.lat!, a.lon!], { icon })
      marker.on('click', () => openViewer(withGps, withGps.indexOf(a)))
      marker.bindTooltip(a.place ?? a.filename, { direction: 'top' })
      layer.addLayer(marker)
      bounds.push([a.lat!, a.lon!])
    }
    if (bounds.length > 1 && mapRef.current) mapRef.current.fitBounds(L.latLngBounds(bounds).pad(0.15))
  }, [filteredAssets, openViewer])

  return (
    <div className="flex h-full flex-col">
      <div ref={ref} className="min-h-0 flex-1" />
      <p className="bg-neutral-950 px-4 py-2 text-xs text-neutral-600">
        {filteredAssets.filter((a) => a.lat !== undefined).length} fotos con ubicación · © OpenStreetMap · © CARTO
      </p>
    </div>
  )
}
