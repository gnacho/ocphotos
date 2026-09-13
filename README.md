# ocphotos

An Immich/Memories-style photo experience for [OpenCloud](https://opencloud.eu): timeline,
memories, places, faces and albums, with OpenCloud as the source of truth for the files.

This repository holds the feasibility study and the first prototype (v0.1).

## Why not a PHP app

OpenCloud has no server-side PHP app runtime and no Nextcloud-style relational filecache,
so porting Memories is not an option. The working architecture is a standalone photo service
that talks to OpenCloud over WebDAV/Graph/OIDC, which is the same shape Immich already uses.

## Layout

| Path | What it is |
|---|---|
| `plan.md` | Short plan for the feasibility analysis |
| `analisis-fotos-opencloud.md` | Full feasibility study (Spanish), including the v0.1 notes |
| `analisis-fotos-opencloud.docx` | Same study as a document export |
| `app/` | PWA prototype: React 19 + TypeScript + Vite + Tailwind + shadcn/ui |
| `app/server-go/` | Go microservice skeleton (OpenCloud Graph/WebDAV client + incremental index) |

## Status

Prototype. The PWA runs against demo data and can talk to a real OpenCloud instance when CORS
is enabled. In the Go service, `internal/dav` and `internal/index` are functional; `internal/store`,
`internal/api` and the workers are pending.

## Development

```bash
cd app
npm install
npm run dev
```

## License

GNU Affero General Public License v3.0 (AGPL-3.0-only). See [LICENSE](LICENSE).
