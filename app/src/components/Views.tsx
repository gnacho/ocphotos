import { useEffect, useMemo, useState } from 'react'
import { CalendarClock, FolderOpen, Heart, Sparkles, Users } from 'lucide-react'
import { useStore } from '@/lib/store'
import type { PhotoAsset } from '@/lib/types'

function Grid({ assets, empty }: { assets: PhotoAsset[]; empty: string }) {
  const { openViewer } = useStore()
  if (assets.length === 0)
    return <div className="flex h-64 items-center justify-center text-dim">{empty}</div>
  return (
    <div className="grid grid-cols-3 gap-[3px] p-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
      {assets.map((a, i) => (
        <button key={a.id} onClick={() => openViewer(assets, i)} className="group relative aspect-square overflow-hidden bg-raised">
          <img src={a.thumbUrl} loading="lazy" alt={a.filename} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
        </button>
      ))}
    </div>
  )
}

export function Recuerdos() {
  const { assets, openViewer, mode, serviceToken } = useStore()
  const [svcAssets, setSvcAssets] = useState<PhotoAsset[] | null>(null)

  useEffect(() => {
    if (mode !== 'service') { setSvcAssets(null); return }
    fetch('/api/memories/on-this-day', { headers: serviceToken ? { Authorization: `Bearer ${serviceToken}` } : {} })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j) => setSvcAssets((j.assets ?? []).map((a: any) => ({
        id: String(a.id), path: a.path, filename: a.filename,
        takenAt: new Date(a.takenAt * 1000), width: a.width || 1600, height: a.height || 1200,
        thumbUrl: `/api/assets/${a.id}/thumb?w=400${serviceToken ? `?token=${encodeURIComponent(serviceToken)}` : ''}`,
        fullUrl: `/api/assets/${a.id}/original${serviceToken ? `?token=${encodeURIComponent(serviceToken)}` : ''}`,
        isVideo: a.mediaType === 'video', personIds: [], favorite: a.favorite,
      }))))
      .catch(() => setSvcAssets([]))
  }, [mode, serviceToken])

  const source = mode === 'service' ? (svcAssets ?? []) : assets
  const memories = useMemo(() => {
    const now = new Date()
    const groups = new Map<number, PhotoAsset[]>()
    for (const a of source) {
      if (a.takenAt.getMonth() === now.getMonth() && a.takenAt.getDate() === now.getDate() && a.takenAt.getFullYear() !== now.getFullYear()) {
        const y = a.takenAt.getFullYear()
        if (!groups.has(y)) groups.set(y, [])
        groups.get(y)!.push(a)
      }
    }
    return Array.from(groups.entries()).sort(([a], [b]) => b - a)
  }, [source])

  if (memories.length === 0)
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3 text-dim">
        <CalendarClock size={40} strokeWidth={1.2} />
        <p>Hoy no hay recuerdos de años anteriores</p>
      </div>
    )

  return (
    <div className="space-y-8 p-4 pb-24">
      <h2 className="flex items-center gap-2 px-1 text-lg font-medium text-main">
        <Sparkles size={18} className="text-amber-400" /> Un día como hoy…
      </h2>
      {memories.map(([year, list]) => {
        const years = new Date().getFullYear() - year
        return (
          <section key={year}>
            <button
              onClick={() => openViewer(list, 0)}
              className="group relative mb-3 block h-52 w-full overflow-hidden rounded-xl"
            >
              <img src={list[0].fullUrl} alt="" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
              <div className="absolute bottom-4 left-4 text-left">
                <p className="text-2xl font-semibold text-white">Hace {years} {years === 1 ? 'año' : 'años'}</p>
                <p className="text-sm text-main">{list.length} {list.length === 1 ? 'foto' : 'fotos'}{list[0].place ? ` · ${list[0].place}` : ''}</p>
              </div>
            </button>
            <div className="grid grid-cols-4 gap-[3px] md:grid-cols-8">
              {list.slice(1, 9).map((a, i) => (
                <button key={a.id} onClick={() => openViewer(list, i + 1)} className="aspect-square overflow-hidden rounded-md bg-raised">
                  <img src={a.thumbUrl} loading="lazy" alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}

export function Personas() {
  const { people, personFilter, setPersonFilter, setView, connection } = useStore()
  const named = people.filter((p) => p.count > 0)
  return (
    <div className="p-4 pb-24">
      <div className="mb-4 flex items-center justify-between px-1">
        <h2 className="flex items-center gap-2 text-lg font-medium text-main"><Users size={18} /> Personas</h2>
        {connection.mode === 'opencloud' && (
          <span className="rounded-full bg-amber-500/10 px-3 py-1 text-xs text-amber-400">
            Reconocimiento facial pendiente del servicio ML (fase 3)
          </span>
        )}
      </div>
      <div className="grid grid-cols-3 gap-4 sm:grid-cols-5 md:grid-cols-7 lg:grid-cols-9">
        {named.map((p) => (
          <button
            key={p.id}
            onClick={() => { setPersonFilter(personFilter === p.id ? null : p.id); setView('fotos') }}
            className="group flex flex-col items-center gap-2"
          >
            <img
              src={p.faceUrl}
              alt={p.name ?? ''}
              className={`h-20 w-20 rounded-full object-cover ring-2 transition ${personFilter === p.id ? 'ring-sky-400' : 'ring-transparent group-hover:ring-neutral-600'}`}
            />
            <div className="text-center">
              <p className="text-sm text-main">{p.name}</p>
              <p className="text-xs text-faint">{p.count}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

export function Albums() {
  const { albums, assets, openViewer, mode } = useStore()
  if (mode === 'service')
    return (
      <div className="flex h-64 items-center justify-center text-dim">
        Los álbumes llegan en la v0.2 del servicio (tabla ya creada en el esquema)
      </div>
    )
  return (
    <div className="grid grid-cols-2 gap-5 p-4 pb-24 md:grid-cols-3 lg:grid-cols-4">
      {albums.map((al) => {
        const list = al.assetIds.map((id) => assets.find((a) => a.id === id)).filter(Boolean) as PhotoAsset[]
        if (list.length === 0) return null
        return (
          <button key={al.id} onClick={() => openViewer(list, 0)} className="group text-left">
            <div className="relative mb-2 aspect-square overflow-hidden rounded-xl bg-raised">
              <img src={list[0].thumbUrl} alt="" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
              <div className="absolute bottom-2 right-2 rounded bg-black/60 px-2 py-0.5 text-xs text-white">{list.length}</div>
            </div>
            <p className="font-medium text-main">{al.name}</p>
            <p className="text-xs text-faint">{new Intl.DateTimeFormat('es', { month: 'long', year: 'numeric' }).format(al.createdAt)}</p>
          </button>
        )
      })}
    </div>
  )
}

export function Carpetas() {
  const { assets, openViewer } = useStore()
  const folders = useMemo(() => {
    const map = new Map<string, PhotoAsset[]>()
    for (const a of assets) {
      const dir = a.path.split('/').slice(0, -1).join('/')
      if (!map.has(dir)) map.set(dir, [])
      map.get(dir)!.push(a)
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b))
  }, [assets])

  return (
    <div className="grid grid-cols-2 gap-5 p-4 pb-24 md:grid-cols-3 lg:grid-cols-4">
      {folders.map(([dir, list]) => (
        <button key={dir} onClick={() => openViewer(list, 0)} className="group text-left">
          <div className="relative mb-2 aspect-[4/3] overflow-hidden rounded-xl bg-raised">
            <img src={list[0].thumbUrl} alt="" className="h-full w-full object-cover opacity-80 transition-transform duration-500 group-hover:scale-105" />
            <FolderOpen size={22} className="absolute bottom-2 left-2 text-white drop-shadow" />
          </div>
          <p className="truncate font-medium text-main">{dir.replace(/^\//, '')}</p>
          <p className="text-xs text-faint">{list.length} elementos</p>
        </button>
      ))}
    </div>
  )
}

export function Favoritos() {
  const { assets } = useStore()
  const favs = assets.filter((a) => a.favorite)
  return (
    <div>
      <h2 className="flex items-center gap-2 p-4 pb-0 text-lg font-medium text-main">
        <Heart size={18} className="text-rose-500" /> Favoritos
      </h2>
      <Grid assets={favs} empty="Aún no has marcado favoritos" />
    </div>
  )
}
