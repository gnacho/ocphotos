import { useState } from 'react'
import {
  CalendarClock, FolderOpen, HardDrive, Heart, Images, Map as MapIcon,
  Search, Settings, Users, X,
} from 'lucide-react'
import { useStore } from '@/lib/store'
import type { View } from '@/lib/types'

const NAV: { id: View; label: string; icon: typeof Images }[] = [
  { id: 'fotos', label: 'Fotos', icon: Images },
  { id: 'recuerdos', label: 'Recuerdos', icon: CalendarClock },
  { id: 'personas', label: 'Personas', icon: Users },
  { id: 'albums', label: 'Álbumes', icon: FolderOpen },
  { id: 'mapa', label: 'Mapa', icon: MapIcon },
  { id: 'carpetas', label: 'Carpetas', icon: HardDrive },
  { id: 'favoritos', label: 'Favoritos', icon: Heart },
]

function SettingsDialog({ onClose }: { onClose: () => void }) {
  const { connection, connect, disconnect } = useStore()
  const [baseUrl, setBaseUrl] = useState(connection.baseUrl || 'https://cloud.midominio.es')
  const [username, setUsername] = useState(connection.username)
  const [appToken, setAppToken] = useState(connection.appToken)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-950 p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-lg font-medium text-white">Conexión OpenCloud</h3>
          <button onClick={onClose} className="rounded-full p-1.5 text-neutral-400 hover:bg-neutral-800"><X size={18} /></button>
        </div>

        {connection.mode === 'opencloud' && connection.status === 'ok' ? (
          <div className="space-y-4">
            <p className="rounded-lg bg-emerald-500/10 p-3 text-sm text-emerald-400">{connection.message}</p>
            <p className="text-xs text-neutral-500">Conectado a {connection.baseUrl} como {connection.username}</p>
            <button onClick={disconnect} className="w-full rounded-lg border border-neutral-700 py-2 text-sm text-neutral-300 hover:bg-neutral-800">
              Desconectar (volver a demo)
            </button>
          </div>
        ) : (
          <form
            className="space-y-3"
            onSubmit={(e) => { e.preventDefault(); connect(baseUrl, username, appToken) }}
          >
            <div>
              <label className="mb-1 block text-xs text-neutral-500">URL de tu instancia</label>
              <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} required
                className="w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-white outline-none focus:border-sky-600" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-neutral-500">Usuario</label>
              <input value={username} onChange={(e) => setUsername(e.target.value)} required
                className="w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-white outline-none focus:border-sky-600" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-neutral-500">App-token (Ajustes → Seguridad en OpenCloud)</label>
              <input value={appToken} onChange={(e) => setAppToken(e.target.value)} required type="password"
                className="w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-white outline-none focus:border-sky-600" />
            </div>
            {connection.status === 'error' && (
              <p className="rounded-lg bg-rose-500/10 p-3 text-xs text-rose-400">{connection.message}</p>
            )}
            <button type="submit" disabled={connection.status === 'connecting'}
              className="w-full rounded-lg bg-sky-600 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-50">
              {connection.status === 'connecting' ? 'Conectando e indexando…' : 'Conectar e indexar'}
            </button>
            <p className="text-[11px] leading-relaxed text-neutral-600">
              La app descubre tus espacios vía Graph API y recorre /Fotos por WebDAV (máx. 500 en esta preview).
              Requiere CORS habilitado en tu servidor (OC_CORS_ALLOW_ORIGINS). En producción la indexación la hace
              el servicio Go en servidor, no el navegador.
            </p>
          </form>
        )}
      </div>
    </div>
  )
}

export default function Shell({ children }: { children: React.ReactNode }) {
  const { view, setView, query, setQuery, personFilter, setPersonFilter, people, connection } = useStore()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const activePerson = people.find((p) => p.id === personFilter)

  return (
    <div className="flex h-screen flex-col bg-neutral-950 text-neutral-200">
      {/* topbar */}
      <header className="flex items-center gap-3 border-b border-neutral-900 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-indigo-600">
            <Images size={15} className="text-white" />
          </div>
          <span className="hidden font-semibold text-white sm:block">OpenCloud Memories</span>
        </div>
        <div className="relative mx-auto w-full max-w-xl">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-600" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por lugar, cámara, archivo…"
            className="w-full rounded-full border border-neutral-800 bg-neutral-900 py-2 pl-9 pr-4 text-sm outline-none placeholder:text-neutral-600 focus:border-sky-600"
          />
        </div>
        <button onClick={() => setSettingsOpen(true)} className="relative rounded-full p-2 hover:bg-neutral-800" aria-label="Ajustes">
          <Settings size={19} />
          <span className={`absolute right-1.5 top-1.5 h-2 w-2 rounded-full ${connection.mode === 'opencloud' ? 'bg-emerald-400' : 'bg-neutral-600'}`} />
        </button>
      </header>

      {activePerson && (
        <div className="flex items-center gap-2 border-b border-neutral-900 bg-sky-950/40 px-4 py-1.5 text-sm">
          <img src={activePerson.faceUrl} className="h-5 w-5 rounded-full" alt="" />
          Filtrando por <b>{activePerson.name}</b>
          <button onClick={() => setPersonFilter(null)} className="ml-1 rounded-full p-0.5 hover:bg-neutral-800"><X size={14} /></button>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {/* sidebar */}
        <nav className="flex w-14 flex-col gap-1 border-r border-neutral-900 p-2 md:w-52">
          {NAV.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setView(id)}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
                view === id ? 'bg-neutral-800 font-medium text-white' : 'text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200'
              }`}
            >
              <Icon size={17} />
              <span className="hidden md:block">{label}</span>
            </button>
          ))}
          <div className="mt-auto hidden px-3 py-2 text-[10px] leading-relaxed text-neutral-700 md:block">
            v0.1 · {connection.mode === 'demo' ? 'datos demo' : 'OpenCloud'} · Sin ML aún
          </div>
        </nav>

        {/* contenido */}
        <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>
      </div>

      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
    </div>
  )
}
