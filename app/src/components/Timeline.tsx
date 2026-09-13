import { useMemo } from 'react'
import { Heart, Play } from 'lucide-react'
import type { DayBucket, PhotoAsset } from '@/lib/types'
import { useStore } from '@/lib/store'

const fmtDay = new Intl.DateTimeFormat('es', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

function Thumb({ asset, onClick }: { asset: PhotoAsset; onClick: () => void }) {
  const ar = asset.width / asset.height
  return (
    <button
      onClick={onClick}
      className="group relative m-[1.5px] block grow overflow-hidden bg-neutral-800 focus:outline-none"
      style={{ aspectRatio: `${asset.width}/${asset.height}`, flexGrow: ar * 100, flexBasis: ar * 140 }}
    >
      <img
        src={asset.thumbUrl}
        alt={asset.filename}
        loading="lazy"
        className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
      />
      {asset.isVideo && (
        <span className="absolute bottom-1 right-1 flex items-center gap-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
          <Play size={10} /> {asset.duration}
        </span>
      )}
      {asset.favorite && <Heart size={13} className="absolute right-1.5 top-1.5 fill-rose-500 text-rose-500" />}
    </button>
  )
}

function DaySection({ day }: { day: DayBucket }) {
  const { openViewer } = useStore()
  return (
    <section style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 400px' }}>
      <h3 className="sticky top-0 z-10 -mx-1 bg-neutral-950/90 px-1 pb-2 pt-4 text-[13px] font-medium capitalize text-neutral-300 backdrop-blur">
        {fmtDay.format(day.date)}
        <span className="ml-2 text-neutral-600">{day.assets.length}</span>
      </h3>
      <div className="flex flex-wrap">
        {day.assets.map((a, i) => (
          <Thumb key={a.id} asset={a} onClick={() => openViewer(day.assets, i)} />
        ))}
      </div>
    </section>
  )
}

export default function Timeline() {
  const { days, query, personFilter } = useStore()
  const total = useMemo(() => days.reduce((n, d) => n + d.assets.length, 0), [days])

  if (days.length === 0) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2 text-neutral-500">
        <p className="text-lg">Sin resultados</p>
        <p className="text-sm">{query || personFilter ? 'Prueba con otra búsqueda' : 'Conecta tu OpenCloud para ver tus fotos'}</p>
      </div>
    )
  }

  return (
    <div className="px-2 pb-24 md:px-4">
      <p className="px-1 pt-3 text-xs text-neutral-600">{total.toLocaleString('es')} elementos</p>
      {days.map((d) => (
        <DaySection key={d.key} day={d} />
      ))}
    </div>
  )
}
