# photos-service (OpenCloud Memories — backend)

Microservicio Go que acompaña a la PWA. OpenCloud sigue siendo la fuente de
verdad de los ficheros; este servicio mantiene el índice de metadatos.

## Piezas

| Paquete | Estado | Qué hace |
|---|---|---|
| `internal/dav` | ✅ funcional (esqueleto completo) | Cliente Graph + WebDAV de OpenCloud: descubrimiento de espacios, PROPFIND, Range GET |
| `internal/index` | ✅ lógica de scan | Walk incremental por etag, soft-delete de desaparecidos |
| `internal/store` | ⬜ pendiente | Postgres (pgx). Esquema en `schema.sql` |
| `internal/api` | ⬜ pendiente | REST para la PWA (timeline, memories, geo, álbumes) |
| workers (River) | ⬜ pendiente | EXIF vía Range+cabecera, thumbnails libvips, (fase 3) ML |

## Decisiones clave (del análisis del proyecto)

- **Sin portar código PHP de Memories**: solo se porta su diseño de producto.
- **EXIF barato**: `GetRange` de los primeros ~128 KB cubre el EXIF de la
  mayoría de JPEG/HEIC sin descargar el fichero (truco de PhotoSort).
- **Mover ficheros**: el índice usa (user_id, path) como clave; un movimiento
  se procesa como delete+insert. Los metadatos de app que deban sobrevivir
  (favoritos, descripciones) se escribirán además en **sidecar XMP** (patrón
  Immich) en una fase posterior.
- **Thumbnails**: en MVP, proxy al servicio de thumbnails de OpenCloud;
  propios con libvips cuando haga falta control fino (faces, recortes).
- **Auth**: JWT OIDC del mismo issuer que OpenCloud (la PWA usa PKCE).
- **ML (fase 3)**: microservicio Python aparte con InsightFace + CLIP en ONNX
  (o reutilizar `immich-machine-learning` por HTTP).

## Arranque (cuando esté implementado el store)

```bash
createdb photos && psql photos -f schema.sql
go run ./cmd/photos-service   # LISTEN_ADDR=:9210
```
