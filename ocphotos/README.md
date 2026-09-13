# ocphotos — app nativa de fotos para OpenCloud (Etapa 1)

Extensión web **nativa** de OpenCloud (Vue 3 + `@opencloud-eu/web-pkg`), construida
sobre el skeleton oficial. Sin iframe, sin tokens propios: usa la **sesión del host**.

## Qué hace (Etapa 1, sin backend)

- **Timeline** por días con headers sticky, scroll infinito por páginas de días,
  miniaturas servidas por el propio OpenCloud (`?x=&y=&processor=thumbnail`).
- **Visor** a pantalla completa con navegación por teclado, vídeo y descarga.
- **HEIC/HEIF**: si el preview del host falla (OpenCloud no decodifica HEIC), la
  extensión pide la miniatura al photos-service (`/ocphotos-api/api/thumb`), que
  la decodifica en servidor.
- **Recuerdos** ("Un día como hoy…") agrupados por año.
- Indexado por **WebDAV con la sesión del usuario** (PROPFIND recursivo desde una
  carpeta raíz). La raíz por defecto es `/Fotos` y se cambia desde el **selector
  de carpeta** de la propia app (se recuerda por navegador en localStorage) o con
  `ocphotos.config.rootPath` en `apps.yaml`. Si la raíz no existe, escanea todo el
  espacio personal y lo avisa con un banner.
- Caché de la lista en localStorage (6 h). Al abrir, muestra la caché al instante
  y refresca en segundo plano; las cachés vacías se ignoran. Botón de rescan.
- Registrada en el **conmutador de aplicaciones** (appMenuItem).

Limitaciones conocidas de esta etapa (resueltas por el photos-service en Etapa 2):
fecha = mtime del fichero (no EXIF de captura), sin mapa/GPS, sin favoritos/álbumes
persistentes, escaneo en navegador (adecuado hasta ~decenas de miles de fotos;
para 70k el primer escaneo tarda minutos y luego usa caché).

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

- **Etapa 2**: photos-service Go (EXIF por Range, GPS/mapa, álbumes, favoritos,
  indexado incremental por etag, SQLite) — ya existe como proyecto hermano
  (`app/server-go` del workspace), la extensión consumirá su API.
- **Etapa 3**: caras/CLIP (microservicio Python ONNX o immich-machine-learning),
  posters/transcoding de vídeo, sidecars XMP para metadatos que sobrevivan reubicaciones.
