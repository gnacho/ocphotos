export interface PhotoAsset {
  id: string
  /** remote path in OpenCloud (demo: generated) */
  path: string
  filename: string
  takenAt: Date
  width: number
  height: number
  thumbUrl: string
  fullUrl: string
  camera?: string
  lens?: string
  iso?: number
  aperture?: string
  shutter?: string
  focal?: string
  lat?: number
  lon?: number
  place?: string
  isVideo: boolean
  duration?: string
  personIds: string[]
  favorite: boolean
}

export interface Person {
  id: string
  name: string | null
  faceUrl: string
  count: number
}

export interface Album {
  id: string
  name: string
  assetIds: string[]
  createdAt: Date
}

export interface DayBucket {
  key: string // yyyy-mm-dd
  date: Date
  assets: PhotoAsset[]
}

export type View =
  | 'fotos'
  | 'recuerdos'
  | 'personas'
  | 'albums'
  | 'carpetas'
  | 'mapa'
  | 'favoritos'
  | 'archivo'

export interface ConnectionState {
  mode: 'demo' | 'opencloud'
  baseUrl: string
  username: string
  appToken: string
  status: 'idle' | 'connecting' | 'ok' | 'error'
  message?: string
}
