import { StoreProvider, useStore } from '@/lib/store'
import Shell from '@/components/Shell'
import Timeline from '@/components/Timeline'
import Viewer from '@/components/Viewer'
import MapView from '@/components/MapView'
import { Albums, Carpetas, Favoritos, Personas, Recuerdos } from '@/components/Views'

function Main() {
  const { view } = useStore()
  return (
    <Shell>
      {view === 'fotos' && <Timeline />}
      {view === 'recuerdos' && <Recuerdos />}
      {view === 'personas' && <Personas />}
      {view === 'albums' && <Albums />}
      {view === 'mapa' && <MapView />}
      {view === 'carpetas' && <Carpetas />}
      {view === 'favoritos' && <Favoritos />}
      <Viewer />
    </Shell>
  )
}

export default function App() {
  return (
    <StoreProvider>
      <Main />
    </StoreProvider>
  )
}
