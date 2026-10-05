# Stack

What this repository uses, piece by piece, plus the dependency update status.
Pinned versions below are the ones in `package.json` ranges and `go.mod`;
the lockfiles carry the exact resolved versions.

## Repository layout

| Path | What it is | Status |
|---|---|---|
| `ocphotos/` | Native OpenCloud web extension (Vue 3, session-based, no iframe). This is the product. | active |
| `app/` | Standalone single-tenant PWA (React) served by its own Go binary. Earlier variant, same features. | maintenance |
| `app/server-go/` | Go backend for the standalone PWA (`photos-service`, single-tenant, embedded SQLite). | maintenance |
| [gnacho/ocapps](https://github.com/gnacho/ocapps) | Companion Go backend for the extension (multi-tenant, one isolated index per user). Not in this repo. | active |

The extension never stores credentials: it calls the service with the host
session bearer and the service validates it against OpenCloud's Graph `/me`.

## OpenCloud extension (`ocphotos/`)

- **Vue 3.5** + **TypeScript 6** + **Vite 8**, built as a native OpenCloud
  extension (no iframe) with the OpenCloud left sidebar (`navItems`).
- **OpenCloud extension-sdk 7** (`@opencloud-eu/extension-sdk`, `web-client`,
  `web-pkg`, plus the matching `eslint-config`, `prettier-config`, `tsconfig`).
  Built against the OpenCloud 7 host line; the SDK 8 line targets OpenCloud 8.
- **Tailwind CSS 4**, **vue-router 5**, **vue3-gettext 4** (Spanish `l10n/`
  translations ship with the app and follow the host language).
- **Leaflet 1.9.4** (`@types/leaflet`): the map view. This is the only runtime
  dependency; the OpenCloud packages are build-time peers provided by the host.
- Tooling: **pnpm 10** (workspace), **Vitest 4** + `@vue/test-utils` +
  `happy-dom`, **vue-tsc 3**, **ESLint 10** with `@opencloud-eu/eslint-config`,
  **Prettier 3**.
- `pnpm check:types`, `pnpm lint`, `pnpm build`, `pnpm test:unit` (Vitest).

## Companion backend (gnacho/ocapps, not in this repo)

- **Go 1.26** (module `go 1.26.8`), single binary, no CGO.
- **modernc.org/sqlite** (embedded SQLite, `go 1.26` toolchain): one isolated
  index per user (`oc_id`), cursor pagination, soft-deletes.
- **rwcarlsen/goexif**: EXIF extraction (date, camera, GPS) via a vendored fork
  (`third_party/goexif`), because upstream is unmaintained.
- **gen2brain/h265**: pure-Go HEVC decode so HEIC/HEIF thumbnails work without
  CGo or libvips; registered in `image.Decode`.
- **golang.org/x/image, x/crypto, x/sync**.
- Reverse geocoding: **Nominatim** (HTTP, cached in SQLite).
- Video posters: **ffmpeg** (external binary, called by the service).

## Standalone variant (`app/` + `app/server-go/`)

- **React 19** + **TypeScript 5.9** + **Vite 7** + **Tailwind CSS 3**.
- **Radix UI** primitives (`@radix-ui/react-*`) with class-variance-authority,
  tailwind-merge, clsx, cmdk, vaul, sonner, next-themes.
- **react-router 7**, **react-hook-form 7** + **zod 4** + `@hookform/resolvers`,
  **recharts 2**, **date-fns 4**, **embla-carousel-react**, **leaflet 1.9**,
  **lucide-react 0.x**.
- Backend: **Go 1.26.4**, same storage/EXIF/thumbnail approach as ocapps but
  single-tenant, plus a PWA served by the same binary (SPA fallback).

## Dependency update status (checked 2026-10-05)

Dependabot is enabled security-only; version bumps land as PRs.

### Extension (`ocphotos/`)

Up to date except for routine bumps:

- Patch/minor available: vue 3.5.43, vite 8.3.2, eslint 10.12, prettier 3.9.9,
  vue-tsc 3.3.12, `@vue/test-utils` 2.5.1, vitest 4.1.x line.
- Majors to evaluate deliberately:
  - `@opencloud-eu/*` 7.4 -> 8.0: follows the OpenCloud 8 host line
    (extension-sdk already has an 8.1.0-alpha). Move when the host moves.
  - TypeScript 6 -> 7, Vitest 4 -> 5: toolchain majors, no rush.

### Companion backend (ocapps)

Mostly current. Available: goquery 1.13.0, cascadia 1.3.5, gofeed 1.5.0,
h265 0.2.3, x/crypto 0.57.0, x/sync 0.23.0, modernc.org/sqlite 1.60.1,
testify 1.12.1.
Watch item: `go-shiori/go-readability` is deprecated upstream (used by the
ocnews side of ocapps); plan a replacement when it bites.

### Standalone variant (`app/`)

Held back on several majors (maintenance mode): Tailwind 3 -> 4,
react-router 7 -> 8, Vite 7 -> 8, recharts 2 -> 3, ESLint 9 -> 10,
lucide-react 0.x -> 1.x, react-day-picker 9 -> 10, `@types/node` 24 -> 26.
Backend (`app/server-go/`): modernc.org/sqlite 1.38 -> 1.60, x/image 0.30 ->
0.46, h265 0.2.2 -> 0.2.3, x/sys, x/text, x/exp.

## Security notes (Dependabot)

All former alerts on this repo were development-scope and came from
`@module-federation/dts-plugin` (a build-time type-generation plugin in the
extension SDK toolchain), which pins `axios 1.13.5` and `adm-zip 0.5.18`.
Resolved 2026-10-05 (now zero open alerts):

- `axios 1.13.5`: prototype-pollution / proxy-leak advisories. Fixed via pnpm
  overrides (`axios ^1.20.0`), the lockfile now carries a single clean copy.
- `adm-zip 0.5.18`: extraction advisories, fixed in 0.6.1. Fixed via pnpm
  overrides (`adm-zip ^0.6.1`).
- `brace-expansion 5.0.9`: quadratic-time expansion DoS, fixed in 5.0.12.
  Bumped in both lockfiles (`app/` via npm audit fix, extension via override).
- `ws`: alert covered `ws < 5.2.5` but the lockfile only has 8.x copies;
  dismissed as not used.
- `golang.org/x/image 0.30.0` in `app/server-go`: bumped to 0.41.0 (#7).

Known, not fixable without a migration: the Tailwind 3 chain in `app/`
(chokidar, fast-glob, micromatch) pulls `braces`, which has a stack-exhaustion
DoS advisory (GHSA-vfj7-8cjw-p6xm) with **no patched release** (latest 3.0.3 is
still in the vulnerable `*` range). Dependabot does not flag it for that
reason; `npm audit` in `app/` does. Only cure is migrating `app/` to Tailwind
4, which is deferred while the standalone variant stays in maintenance mode.

## License

GNU Affero General Public License v3.0 (AGPL-3.0-only). See [LICENSE](LICENSE).
