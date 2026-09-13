import { useEffect, useState } from 'react'
import {
  CalendarClock, FolderOpen, HardDrive, Heart, Images, Map as MapIcon,
  Moon, Search, Settings, Sun, Users, X,
} from 'lucide-react'

type Theme = 'light' | 'dark'

function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(() => {
    const stored = localStorage.getItem('ocm-theme')
    if (stored === 'light' || stored === 'dark') return stored
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  })
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    document.documentElement.style.colorScheme = theme
    localStorage.setItem('ocm-theme', theme)
    window.dispatchEvent(new CustomEvent('ocm-theme', { detail: theme }))
  }, [theme])
  return [theme, () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))]
}
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
  const { connection, connect, connectService, disconnect, mode } = useStore()
  const [baseUrl, setBaseUrl] = useState(connection.baseUrl || 'https://cloud.midominio.es')
  const [username, setUsername] = useState(connection.username)
  const [appToken, setAppToken] = useState(connection.appToken)
  const [svcToken, setSvcToken] = useState('')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-app bg-surface p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-lg font-medium text-main">Conexión OpenCloud</h3>
          <button onClick={onClose} className="rounded-full p-1.5 text-dim hover:bg-raised"><X size={18} /></button>
        </div>

        {mode === 'demo' && (
          <form
            className="mb-5 space-y-3 rounded-xl border border-app p-4"
            onSubmit={(e) => { e.preventDefault(); connectService(svcToken) }}
          >
            <p className="text-sm font-medium text-main">Modo producción (photos-service)</p>
            <div>
              <label className="mb-1 block text-xs text-dim">Token del servicio (MEMORIES_TOKEN; vacío si no lo definiste)</label>
              <input value={svcToken} onChange={(e) => setSvcToken(e.target.value)} type="password"
                className="w-full rounded-lg border border-app bg-surface px-3 py-2 text-sm text-main outline-none focus:border-sky-600" />
            </div>
            <button type="submit" disabled={connection.status === 'connecting'}
              className="w-full rounded-lg bg-emerald-700 py-2 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-50">
              Conectar al servicio (mismo origen)
            </button>
          </form>
        )}

        {connection.mode === 'opencloud' && connection.status === 'ok' ? (
          <div className="space-y-4">
            <p className="rounded-lg bg-emerald-500/10 p-3 text-sm text-emerald-400">{connection.message}</p>
            <p className="text-xs text-dim">Conectado a {connection.baseUrl} como {connection.username}</p>
            <button onClick={disconnect} className="w-full rounded-lg border border-app py-2 text-sm text-main hover:bg-raised">
              Desconectar (volver a demo)
            </button>
          </div>
        ) : (
          <form
            className="space-y-3"
            onSubmit={(e) => { e.preventDefault(); connect(baseUrl, username, appToken) }}
          >
            <div>
              <label className="mb-1 block text-xs text-dim">URL de tu instancia</label>
              <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} required
                className="w-full rounded-lg border border-app bg-surface px-3 py-2 text-sm text-main outline-none focus:border-sky-600" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-dim">Usuario</label>
              <input value={username} onChange={(e) => setUsername(e.target.value)} required
                className="w-full rounded-lg border border-app bg-surface px-3 py-2 text-sm text-main outline-none focus:border-sky-600" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-dim">App-token (Ajustes → Seguridad en OpenCloud)</label>
              <input value={appToken} onChange={(e) => setAppToken(e.target.value)} required type="password"
                className="w-full rounded-lg border border-app bg-surface px-3 py-2 text-sm text-main outline-none focus:border-sky-600" />
            </div>
            {connection.status === 'error' && (
              <p className="rounded-lg bg-rose-500/10 p-3 text-xs text-rose-400">{connection.message}</p>
            )}
            <button type="submit" disabled={connection.status === 'connecting'}
              className="w-full rounded-lg bg-sky-600 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-50">
              {connection.status === 'connecting' ? 'Conectando e indexando…' : 'Conectar e indexar'}
            </button>
            <p className="text-[11px] leading-relaxed text-faint">
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
  const [theme, toggleTheme] = useTheme()
  // embebida como app externa de OpenCloud (iframe en el app-switcher):
  // ocultamos el chrome propio — el shell de OpenCloud ya aporta cabecera
  const embedded = typeof window !== 'undefined' && window.self !== window.top
  const activePerson = people.find((p) => p.id === personFilter)

  return (
    <div className="flex h-screen flex-col bg-app text-main">
      {/* topbar (oculta cuando va embebida en el shell de OpenCloud) */}
      {!embedded && (
      <header className="flex items-center gap-3 border-b border-app px-4 py-2.5">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-indigo-600">
            <Images size={15} className="text-white" />
          </div>
          <span className="hidden font-semibold text-main sm:block">OpenCloud Memories</span>
        </div>
        <div className="relative mx-auto w-full max-w-xl">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por lugar, cámara, archivo…"
            className="w-full rounded-full border border-app bg-surface py-2 pl-9 pr-4 text-sm outline-none placeholder:text-faint focus:border-sky-600"
          />
        </div>
        <button onClick={toggleTheme} className="rounded-full p-2 hover:bg-raised" aria-label="Cambiar tema">
          {theme === 'dark' ? <Sun size={19} /> : <Moon size={19} />}
        </button>
        <button onClick={() => setSettingsOpen(true)} className="relative rounded-full p-2 hover:bg-raised" aria-label="Ajustes">
          <Settings size={19} />
          <span className={`absolute right-1.5 top-1.5 h-2 w-2 rounded-full ${connection.mode === 'opencloud' ? 'bg-emerald-400' : 'bg-neutral-600'}`} />
        </button>
      </header>
      )}

      {/* en modo embebido: barra compacta con búsqueda y acciones esenciales */}
      {embedded && (
        <div className="flex items-center gap-2 border-b border-app px-3 py-1.5">
          <nav className="flex items-center gap-0.5 overflow-x-auto">
            {NAV.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setView(id)}
                title={label}
                className={`rounded-lg p-2 transition ${view === id ? 'bg-raised text-main' : 'text-dim hover:bg-surface'}`}
              >
                <Icon size={16} />
              </button>
            ))}
          </nav>
          <div className="relative ml-auto w-full max-w-sm">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar…"
              className="w-full rounded-full border border-app bg-surface py-1.5 pl-9 pr-3 text-sm text-main outline-none placeholder-faint focus:border-sky-600"
            />
          </div>
          <button onClick={toggleTheme} className="rounded-full p-1.5 hover:bg-raised" aria-label="Cambiar tema">
            {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
          </button>
          <button onClick={() => setSettingsOpen(true)} className="rounded-full p-1.5 hover:bg-raised" aria-label="Ajustes">
            <Settings size={17} />
          </button>
        </div>
      )}

      {activePerson && (
        <div className="flex items-center gap-2 border-b border-app bg-sky-950/40 px-4 py-1.5 text-sm">
          <img src={activePerson.faceUrl} className="h-5 w-5 rounded-full" alt="" />
          Filtrando por <b>{activePerson.name}</b>
          <button onClick={() => setPersonFilter(null)} className="ml-1 rounded-full p-0.5 hover:bg-raised"><X size={14} /></button>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {/* sidebar (solo en modo standalone; embebida usa la barra compacta) */}
        {!embedded && (
        <nav className="flex w-14 flex-col gap-1 border-r border-app p-2 md:w-52">
          {NAV.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setView(id)}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
                view === id ? 'bg-raised font-medium text-main' : 'text-dim hover:bg-surface hover:text-main'
              }`}
            >
              <Icon size={17} />
              <span className="hidden md:block">{label}</span>
            </button>
          ))}
          <div className="mt-auto hidden px-3 py-2 text-[10px] leading-relaxed text-faint md:block">
            v0.1 · {connection.mode === 'demo' ? 'datos demo' : 'OpenCloud'} · Sin ML aún
          </div>
        </nav>
        )}

        {/* contenido */}
        <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>
      </div>

      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
    </div>
  )
}
