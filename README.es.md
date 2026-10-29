# ocphotos

Una experiencia de fotos tipo Immich/Memories para [OpenCloud](https://opencloud.eu): timeline,
memories, lugares, caras y álbumes, con OpenCloud como fuente de verdad de los ficheros.

Este repositorio contiene el análisis de viabilidad, una extensión web nativa de OpenCloud
(Etapa 1) y el prototipo del servicio de fotos independiente (Etapa 2).

## Por qué no es una app PHP

OpenCloud no tiene runtime PHP de servidor ni un filecache relacional como el de Nextcloud,
así que portar Memories no es una opción. La arquitectura que funciona es un servicio de fotos
independiente que habla con OpenCloud por WebDAV/Graph/OIDC, la misma forma que ya usa Immich.

## Estructura

| Ruta | Qué es |
|---|---|
| `plan.md` | Plan corto del análisis de viabilidad |
| `analisis-fotos-opencloud.md` | Análisis de viabilidad completo |
| `analisis-fotos-opencloud.docx` | El mismo análisis exportado a documento |
| `ocphotos/` | Extensión web nativa de OpenCloud (Vue 3 + extension-sdk): timeline, visor, recuerdos |
| `app/` | Prototipo PWA independiente: React 19 + TypeScript + Vite + Tailwind + shadcn/ui |
| `deploy/` | Notas de despliegue en una instancia OpenCloud |

## Estado

La extensión nativa es la que se usa a diario: versión 1.6.1, desplegada en
`drive.domatix.cloud`. Cubre timeline por días, recuerdos, explorar, álbumes, lugares, archivo,
duplicados, etiquetas, carpetas, mapa, favoritos y visor a pantalla completa con vídeo y descarga.
Consume la API del servicio de fotos (`/ocphotos-api/...`), así que los metadatos viven en el
servidor.

El servicio que corre en producción está en el repo [ocapps](https://github.com/gnacho/ocapps),
en su módulo `photos`: índice incremental por etag, EXIF por lecturas parciales, miniaturas
propias con HEIC, vídeo HLS, hash perceptual, geocodificación inversa, SQLite en WAL y API REST
con token Bearer. Ese servicio no vive en este repo (aquí hubo una copia que se retiró al
quedarse atrás), así que cualquier cambio del backend se hace allí.

Las etiquetas y los favoritos se escriben como sidecars XMP junto a cada foto, y el escáner
vuelve a leer los que deje otra herramienta, así que la biblioteca no depende del índice.

La PWA de `app/` sigue disponible como alternativa standalone y embebida, y también funciona
sola con datos demo.

## Desarrollo

Extensión nativa:

```bash
cd ocphotos
pnpm install
pnpm build        # pnpm build:w para watch
pnpm check:types
pnpm lint
pnpm test:unit
pnpm test:coverage
```

La suite corre sobre Vitest con happy-dom. `pnpm test:coverage` añade el informe
de cobertura de V8 y falla cuando los totales bajan de los umbrales declarados en
`ocphotos/vitest.config.ts`: 95 % de sentencias, 88 % de ramas, 88 % de funciones
y 96 % de líneas en el global, con suelos más altos para `src/composables/**` y
`src/components/**`.

PWA y servicio independientes (los modos de conexión y cómo servirla, en
`app/README.md`, con el proxy en el apartado 4 de `deploy/README.md`):

```bash
cd app
npm install
npm run dev
npm run lint
npm run test:coverage
```

La suite de la app corre sobre jsdom y cubre el código propio: el cliente de la
API, el store, la agrupación por día y todos los componentes de `src/components/`.
Sus umbrales están en `app/vitest.config.ts`. Los componentes de shadcn en
`src/components/ui/`, los datos de ejemplo y los tipos quedan fuera de la medida.

### Integración continua

`.github/workflows/ci.yml` se ejecuta en cada pull request y en cada push a
`main`, siempre con Node 24. Tiene tres trabajos:

- `Repo (no backend, no Docker)` falla si aparece aquí un fichero Go, un `go.mod`, un
  Dockerfile, un compose o un `.dockerignore`. El servicio vive en
  [ocapps](https://github.com/gnacho/ocapps) y este control impide que vuelva a crecer
  una segunda copia.
- `Extension (overrides, types, lint, tests, coverage, build)` instala con el lockfile
  congelado y luego ejecuta tipos, lint, tests con cobertura y el build.
- `Standalone app (lint, tests, coverage, build)` ejecuta `npm ci` y luego lint,
  tests con cobertura y el build.

Un check en rojo significa que uno de esos pasos ha fallado. La cobertura forma
parte del build, así que añadir código sin tests puede poner el CI en rojo.

## Licencia

GNU Affero General Public License v3.0 (AGPL-3.0-only). Ver [LICENSE](LICENSE).
