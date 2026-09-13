# ocphotos — app nativa de fotos para OpenCloud (Etapa 2)

Extensión web **nativa** de OpenCloud (Vue 3 + `@opencloud-eu/web-pkg`), construida
sobre el skeleton oficial. Sin iframe ni tokens propios: usa la **sesión del host**.
El índice y las miniaturas los sirve el **photos-service** (`app/server-go`),
expuesto en el mismo origen como `/ocphotos-api/`.

## Qué hace (Etapa 2, con backend)

- **Timeline** por **mes y día** (fecha **EXIF de captura**, no mtime) con headers
  sticky y scroll infinito por paginación keyset; miniaturas generadas por el
  backend (incluye **HEIC/HEIF**, que OpenCloud no decodifica).
- **Rewind**: scrubber de años para saltar a cualquier fecha (`/api/timeline/calendar`).
- **Auto-sync**: al abrir/enfocar y cada 30 s pide un rescan al backend y recarga el
  timeline si cambió el número de fotos (las subidas aparecen solas).
- **Explore**: hub con buscador por fichero/cámara/ruta y accesos rápidos.
- **Mapa**: marcadores de las fotos con GPS (`/api/geo`) sobre OpenStreetMap.
- **Favoritos**: marcar/desmarcar desde el visor y listado propio.
- **"Un día como hoy"**: tira superior en el Timeline con tarjetas "hace X años"
  (rango ±3 días, como Memories) que saltan a esa fecha, más página propia agrupada
  por año.
- **Visor**: para los formatos que cubre la app nativa de OpenCloud
  (jpg/png/gif/tiff/bmp/webp/svg y vídeo) se **delega en su visor nativo**
  (`/preview/...`, con zoom y controles). HEIC/HEIF y RAW, que el nativo no
  soporta, usan el visor propio (preview del backend a 2048, favorito, descarga y
  datos de captura). Nota: la navegación siguiente/anterior del nativo es por
  carpeta, no por el timeline.
- Registrada en el **conmutador de aplicaciones** (appMenuItem).

Pendiente de la Etapa 3: caras/CLIP (microservicio ML), álbumes, posters de vídeo.

## Desarrollo

```bash
pnpm install && pnpm build:w     # watch
docker compose up                # OpenCloud dev en https://host.docker.internal:9200 (admin/admin)
```

## Build e instalación en tu instancia

```bash
pnpm build    # genera dist/ (module federation: manifest.json + js/)
```

Despliegue: servir `dist/` como estático y registrar la app en la configuración
de OpenCloud Web (`apps.yaml` / config del servicio `web`, sección `external_apps`
o apps cargadas por volumen — igual que `web-app-skeleton` en `dev/docker/opencloud/apps.yaml`).
El tipo-check pasa limpio (`pnpm check:types`).

## Roadmap

- **Etapa 3**: caras/CLIP (microservicio Python ONNX o immich-machine-learning),
  álbumes (tabla + API en el backend), posters/transcoding de vídeo, sidecars XMP
  para metadatos que sobrevivan a reubicaciones.
