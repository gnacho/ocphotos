import { useImageUrl } from '@/hooks/useImageUrl'

interface Props {
  src: string
  alt: string
  className?: string
  loading?: 'lazy' | 'eager'
}

/** <img> que resuelve las rutas del servicio con la cabecera Authorization. */
export function AssetImage({ src, alt, className, loading }: Props) {
  const resolved = useImageUrl(src)
  return <img src={resolved || undefined} alt={alt} className={className} loading={loading} />
}

export default AssetImage
