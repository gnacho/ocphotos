# ocphotos

Una experiencia de fotos tipo Immich/Memories para [OpenCloud](https://opencloud.eu): timeline,
memories, lugares, caras y álbumes, con OpenCloud como fuente de verdad de los ficheros.

Este repositorio contiene el análisis de viabilidad y el primer prototipo (v0.1).

## Por qué no es una app PHP

OpenCloud no tiene runtime PHP de servidor ni un filecache relacional como el de Nextcloud,
así que portar Memories no es una opción. La arquitectura que funciona es un servicio de fotos
independiente que habla con OpenCloud por WebDAV/Graph/OIDC, la misma forma que ya usa Immich.

## Estructura

| Ruta | Qué es |
|---|---|
| `plan.md` | Plan corto del análisis de viabilidad |
| `analisis-fotos-opencloud.md` | Análisis de viabilidad completo, con las notas de la v0.1 |
| `analisis-fotos-opencloud.docx` | El mismo análisis exportado a documento |
| `app/` | Prototipo PWA: React 19 + TypeScript + Vite + Tailwind + shadcn/ui |
| `app/server-go/` | Esqueleto del microservicio Go (cliente Graph/WebDAV de OpenCloud + índice incremental) |

## Estado

Prototipo. La PWA funciona con datos demo y puede hablar con una instancia real de OpenCloud
si el CORS está habilitado. En el servicio Go, `internal/dav` e `internal/index` son funcionales;
`internal/store`, `internal/api` y los workers están pendientes.

## Desarrollo

```bash
cd app
npm install
npm run dev
```

## Licencia

GNU Affero General Public License v3.0 (AGPL-3.0-only). Ver [LICENSE](LICENSE).
