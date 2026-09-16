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
| `app/server-go/` | Servicio de fotos Go: cliente WebDAV/Graph, índice incremental, EXIF, miniaturas, SQLite, API REST |
| `deploy/` | Notas de despliegue en una instancia OpenCloud |

## Estado

La Etapa 1 (extensión nativa) compila y pasa el type-check. Indexa el espacio personal por
WebDAV con la sesión del host, así que no necesita app tokens, y se registra en el conmutador
de aplicaciones. Las fechas salen del mtime del fichero; EXIF, GPS y favoritos/álbumes
persistentes son de la Etapa 2.

El servicio de `app/server-go/` implementa el backend (índice incremental, EXIF por lecturas
parciales, miniaturas propias, SQLite, API REST con su propio token Bearer). La PWA lo consume
y también funciona sola con datos demo.

## Desarrollo

Extensión nativa:

```bash
cd ocphotos
pnpm install
pnpm build        # pnpm build:w para watch
pnpm check:types
```

PWA y servicio independientes:

```bash
cd app
npm install
npm run dev
```

## Licencia

GNU Affero General Public License v3.0 (AGPL-3.0-only). Ver [LICENSE](LICENSE).
