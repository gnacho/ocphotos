import { useCallback, useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Download, Heart, Info, MapPin, X } from 'lucide-react'
import { useStore } from '@/lib/store'

export default function Viewer() {
  const { viewerList, viewerIndex, closeViewer, openViewer, toggleFavorite, people } = useStore()
  const [showInfo, setShowInfo] = useState(false)
  const asset = viewerIndex !== null ? viewerList[viewerIndex] : null

  const next = useCallback(() => {
    if (viewerIndex !== null && viewerIndex < viewerList.length - 1) openViewer(viewerList, viewerIndex + 1)
  }, [viewerIndex, viewerList, openViewer])
  const prev = useCallback(() => {
    if (viewerIndex !== null && viewerIndex > 0) openViewer(viewerList, viewerIndex - 1)
  }, [viewerIndex, viewerList, openViewer])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeViewer()
      if (e.key === 'ArrowRight') next()
      if (e.key === 'ArrowLeft') prev()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [next, prev, closeViewer])

  if (!asset) return null
  const assetPeople = people.filter((p) => asset.personIds.includes(p.id))

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/95 backdrop-blur">
      {/* barra superior */}
      <div className="flex items-center justify-between p-3 text-neutral-300">
        <button onClick={closeViewer} className="rounded-full p-2 hover:bg-white/10" aria-label="Cerrar">
          <X size={20} />
        </button>
        <div className="flex items-center gap-1">
          <button onClick={() => toggleFavorite(asset.id)} className="rounded-full p-2 hover:bg-white/10" aria-label="Favorito">
            <Heart size={20} className={asset.favorite ? 'fill-rose-500 text-rose-500' : ''} />
          </button>
          <a href={asset.fullUrl} download={asset.filename} className="rounded-full p-2 hover:bg-white/10" aria-label="Descargar">
            <Download size={20} />
          </a>
          <button onClick={() => setShowInfo((s) => !s)} className="rounded-full p-2 hover:bg-white/10" aria-label="Información">
            <Info size={20} className={showInfo ? 'text-sky-400' : ''} />
          </button>
        </div>
      </div>

      {/* imagen */}
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-12">
        {viewerIndex! > 0 && (
          <button onClick={prev} className="absolute left-2 rounded-full bg-black/50 p-2 text-white hover:bg-black/80" aria-label="Anterior">
            <ChevronLeft size={26} />
          </button>
        )}
        <img src={asset.fullUrl} alt={asset.filename} className="max-h-full max-w-full object-contain" />
        {viewerIndex! < viewerList.length - 1 && (
          <button onClick={next} className="absolute right-2 rounded-full bg-black/50 p-2 text-white hover:bg-black/80" aria-label="Siguiente">
            <ChevronRight size={26} />
          </button>
        )}
      </div>

      {/* panel info */}
      {showInfo && (
        <aside className="absolute right-0 top-14 h-[calc(100%-3.5rem)] w-80 overflow-y-auto border-l border-neutral-800 bg-neutral-950 p-5 text-sm text-neutral-300">
          <h4 className="mb-1 font-medium text-white">{asset.filename}</h4>
          <p className="mb-4 text-xs capitalize text-neutral-500">
            {new Intl.DateTimeFormat('es', { dateStyle: 'full', timeStyle: 'short' }).format(asset.takenAt)}
          </p>
          {asset.place && (
            <p className="mb-4 flex items-center gap-2 text-neutral-400">
              <MapPin size={14} /> {asset.place}
            </p>
          )}
          {assetPeople.length > 0 && (
            <div className="mb-4">
              <p className="mb-2 text-xs uppercase tracking-wide text-neutral-600">Personas</p>
              <div className="flex flex-wrap gap-2">
                {assetPeople.map((p) => (
                  <span key={p.id} className="flex items-center gap-1.5 rounded-full bg-neutral-800 py-1 pl-1 pr-3 text-xs">
                    <img src={p.faceUrl} className="h-5 w-5 rounded-full" alt="" /> {p.name}
                  </span>
                ))}
              </div>
            </div>
          )}
          {asset.camera && (
            <div className="mb-4">
              <p className="mb-2 text-xs uppercase tracking-wide text-neutral-600">EXIF</p>
              <dl className="space-y-1 text-xs">
                <div className="flex justify-between"><dt className="text-neutral-500">Cámara</dt><dd>{asset.camera}</dd></div>
                <div className="flex justify-between"><dt className="text-neutral-500">Objetivo</dt><dd>{asset.lens}</dd></div>
                <div className="flex justify-between"><dt className="text-neutral-500">Apertura</dt><dd>{asset.aperture}</dd></div>
                <div className="flex justify-between"><dt className="text-neutral-500">Obturación</dt><dd>{asset.shutter}</dd></div>
                <div className="flex justify-between"><dt className="text-neutral-500">ISO</dt><dd>{asset.iso}</dd></div>
                <div className="flex justify-between"><dt className="text-neutral-500">Focal</dt><dd>{asset.focal}</dd></div>
                <div className="flex justify-between"><dt className="text-neutral-500">Dimensiones</dt><dd>{asset.width} × {asset.height}</dd></div>
              </dl>
            </div>
          )}
          <div>
            <p className="mb-1 text-xs uppercase tracking-wide text-neutral-600">Ruta en OpenCloud</p>
            <p className="break-all font-mono text-xs text-neutral-500">{asset.path}</p>
          </div>
        </aside>
      )}
    </div>
  )
}
