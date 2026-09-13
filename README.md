# ocphotos

An Immich/Memories-style photo experience for [OpenCloud](https://opencloud.eu): timeline,
memories, places, faces and albums, with OpenCloud as the source of truth for the files.

This repository holds the feasibility study, a native OpenCloud web extension (stage 1) and
the standalone photo service prototype (stage 2).

## Why not a PHP app

OpenCloud has no server-side PHP app runtime and no Nextcloud-style relational filecache,
so porting Memories is not an option. The working architecture is a standalone photo service
that talks to OpenCloud over WebDAV/Graph/OIDC, which is the same shape Immich already uses.

## Layout

| Path | What it is |
|---|---|
| `plan.md` | Short plan for the feasibility analysis |
| `analisis-fotos-opencloud.md` | Full feasibility study (Spanish) |
| `analisis-fotos-opencloud.docx` | Same study as a document export |
| `ocphotos/` | Native OpenCloud web extension (Vue 3 + extension-sdk): timeline, viewer, memories |
| `app/` | Standalone PWA prototype: React 19 + TypeScript + Vite + Tailwind + shadcn/ui |
| `app/server-go/` | Go photo service: WebDAV/Graph client, incremental index, EXIF, thumbnails, SQLite, REST API |
| `deploy/` | Deployment notes for cloud.example.com |

## Status

Stage 1 (native extension) is built and type-checks clean. It indexes the personal space over
WebDAV using the host session, so it needs no app tokens, and registers itself in the app
switcher. Dates come from file mtime; EXIF, GPS and persistent favourites/albums belong to
stage 2.

The standalone service in `app/server-go/` implements the backend (incremental index, EXIF via
range reads, own thumbnails, SQLite, REST API with its own bearer token). The PWA consumes it
and also runs standalone against demo data.

## Development

Native extension:

```bash
cd ocphotos
pnpm install
pnpm build        # pnpm build:w to watch
pnpm check:types
```

Standalone PWA and service:

```bash
cd app
npm install
npm run dev
```

## License

GNU Affero General Public License v3.0 (AGPL-3.0-only). See [LICENSE](LICENSE).
