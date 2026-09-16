# photos-service (OpenCloud Memories — backend)

Microservicio Go **single-tenant** (una instancia = un usuario OpenCloud) con
**SQLite embebido**. OpenCloud sigue siendo la fuente de verdad de los ficheros;
este servicio mantiene el índice de metadatos y sirve la PWA.

## Estado: v1.0 — listo para producción

| Pieza | Estado |
|---|---|
| Cliente Graph + WebDAV (`internal/dav`) | ✅ probado end-to-end (descubrimiento, PROPFIND, Range, descarga) |
| Scanner incremental por etag (`internal/index`) | ✅ probado (upsert por cambio, soft-delete de desaparecidos) |
| Store SQLite (`internal/store`) | ✅ tests verdes (paginación por cursor, favoritos, on-this-day, geo, soft-delete) |
| Worker EXIF (`internal/exif`) | ✅ Range request de 256 KB → fecha/cámara/GPS sin descargar la foto |
| Thumbnails (`internal/thumb`) | ✅ generación propia JPEG/PNG/WebP/GIF, caché en disco por etag |
| API REST (`internal/api`) | ✅ probada (assets, thumbs, original, favoritos, on-this-day, geo, rescan) |
| PWA servida por el mismo binario | ✅ (SPA fallback en `main.go`) |
| Álbumes API | ⬜ v0.2 (esquema listo en el store) |
| ML (caras/CLIP) | ⬜ fase 3 — microservicio Python aparte (InsightFace/CLIP ONNX o `immich-machine-learning`) |
| Vídeo (posters/transcoding) | ⬜ fase posterior (ffmpeg, patrón go-vod) |
| HEIC/HEIF | ✅ decodificador HEVC en Go puro (`gen2brain/h265`, sin CGo ni libvips); registra el formato en `image.Decode` |
| RAW | ⚠️ sin decodificador: se sirve el original |

## Endpoint sin estado para HEIC

`GET /api/thumb?path=<ruta>&w=<n>[&etag=<e>]` genera la miniatura de un fichero
por su ruta dentro del espacio, sin depender del índice. Lo usa la extensión
OpenCloud como **fallback** cuando el preview del host falla (HEIC). Auth: el
Bearer de la sesión web (validado contra Graph `/me`) o el `MEMORIES_TOKEN`.
El servicio es **single-tenant**: solo atiende a la sesión de su usuario.

## Despliegue en una instancia OpenCloud (systemd)

Binario estático (`CGO_ENABLED=0`), usuario `ocphotos`, `/var/lib/ocphotos`,
env `/etc/ocphotos/env`, unit `ocphotos.service`, puerto **:8097**. Se expone
bajo `/ocphotos-api/` en el proxy inverso (`proxy_pass .../` para quitar el
prefijo). Ver `deploy/README.md`.

## Despliegue (Docker, alternativa)

```bash
# en la raíz del proyecto (un nivel por encima de server-go/)
cp docker-compose.yml .env.example .env   # rellena OC_BASE_URL, OC_USER, OC_APP_TOKEN, MEMORIES_TOKEN
docker compose up -d --build
```

- App-token: OpenCloud → Ajustes del usuario → Seguridad → App tokens.
- `MEMORIES_TOKEN`: token propio que la PWA te pedirá al entrar (evita dejar tu
  librería abierta si expones el puerto).
- Datos: volumen `memories-data` → `/data/memories.db` + `/data/thumbs/`.
  **Backup = copiar el fichero .db** (con el servicio parado o `sqlite3 .backup`).

## Sin Docker

```bash
cd server-go && go build ./cmd/photos-service
OC_BASE_URL=https://cloud.midominio.es OC_USER=yo OC_APP_TOKEN=xxx \
MEMORIES_TOKEN=secreto DATA_DIR=./data WEB_DIR=../dist ./photos-service
```

## Rendimiento esperado (70k fotos)

- **Primer scan**: minutos (un PROPFIND por carpeta; ~n_carpetas peticiones).
- **EXIF inicial**: horas en background (Range de 256 KB/foto, ~1-3 fotos/s
  según red; no descarga los originales).
- **Rescans incrementales**: mismas peticiones PROPFIND, pero upserts ≈ 0 →
  barato. `SCAN_EVERY=30m` es razonable.
- **Thumbnails**: se generan bajo demanda al hacer scroll (lado largo 400px,
  calidad 80); el primer paseo por el timeline calienta la caché.
- SQLite con 70k-500k assets: consultas del timeline en ms.

## Decisiones clave

- **SQLite > Postgres** a esta escala: cero contenedores extra, backups triviales.
- **EXIF por Range** (truco de PhotoSort): no se descargan 70k originales.
- **Mover ficheros** = delete+insert por ruta (el favorito se pierde; los
  sidecars XMP para persistir metadatos de app están en el roadmap).
- **Sin Redis**: worker EXIF interno con polling a la tabla (`exif_done=0`).
- **Auth**: app-token de OpenCloud solo vive en el servidor; la PWA usa
  `MEMORIES_TOKEN` propio. OIDC multiusuario queda para si se publica como app.
