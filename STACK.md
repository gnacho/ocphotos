# Stack

What this repository uses, piece by piece, plus the dependency update status.
Pinned versions below are the ones in the `package.json` ranges, and the lockfiles
carry the exact resolved versions.

## Repository layout

| Path | What it is | Status |
|---|---|---|
| `ocphotos/` | Native OpenCloud web extension (Vue 3, session-based, no iframe). This is the product. | active |
| `app/` | Standalone PWA (React), earlier variant with the same features. It talks to the same backend. | maintenance |
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
- `pnpm check:types`, `pnpm lint`, `pnpm build`, `pnpm test:unit` (Vitest) and
  `pnpm test:coverage`. The suite runs on happy-dom and the coverage thresholds
  (95 / 88 / 88 / 96 overall, stricter for `src/composables/**` and
  `src/components/**`) live in `vitest.config.ts`.

## Companion backend (gnacho/ocapps, not in this repo)

- **Go 1.26** (module `go 1.26.10`), single binary, no CGO.
- **modernc.org/sqlite** (embedded SQLite, `go 1.26` toolchain): one isolated
  index per user (`oc_id`), cursor pagination, soft-deletes.
- **rwcarlsen/goexif**: EXIF extraction (date, camera, GPS) via a vendored fork
  (`third_party/goexif`), because upstream is unmaintained.
- **gen2brain/h265**: pure-Go HEVC decode so HEIC/HEIF thumbnails work without
  CGo or libvips; registered in `image.Decode`.
- **golang.org/x/image, x/crypto, x/sync**.
- Reverse geocoding: **Nominatim** (HTTP, cached in SQLite).
- Video posters: **ffmpeg** (external binary, called by the service).

## Standalone variant (`app/`)

- **React 19** + **TypeScript 5.9** + **Vite 8** + **Tailwind CSS 4**.
- Tooling: **Vitest 5** + **jsdom** + **Testing Library**. `npm run test` and
  `npm run test:coverage` cover the app's own code (the API client, the store, the
  day grouping and every component under `src/components/`), with thresholds in
  `vitest.config.ts`. The vendored shadcn components under `src/components/ui/`,
  the demo data and the types are excluded from the measure.
- **Radix UI** primitives (`@radix-ui/react-*`) with class-variance-authority,
  tailwind-merge, clsx, cmdk, vaul, sonner, next-themes.
- **react-router 7**, **react-hook-form 7** + **zod 4** + `@hookform/resolvers`,
  **recharts 2**, **date-fns 4**, **embla-carousel-react**, **leaflet 1.9**,
  **lucide-react 0.x**.
- Backend: **Go 1.26.4**, same storage/EXIF/thumbnail approach as ocapps but
  single-tenant, plus a PWA served by the same binary (SPA fallback).

## Dependency update status (checked 2026-10-28)

Dependabot is enabled with groups per ecosystem (`.github/dependabot.yml`): minor and
patch bumps arrive as a single PR, majors arrive one at a time. Security alerts come
from the GitHub setting, not from the config.

### Extension (`ocphotos/`)

- On the OpenCloud 8 line: all six `@opencloud-eu/*` packages at `^8.2.1`
  (`web-pkg`, `web-client`, `extension-sdk`, `eslint-config`, `prettier-config`,
  `tsconfig`). Moving from 7.4 to 8.2 needed no source changes, only the version bump.
- Tooling: vue 3.5.44, vite 8.3.5, eslint 10.13.0, prettier 3.9.10, vue-tsc 3.3.13,
  `@vue/test-utils` 2.5.1, vitest 4.1.12 (the 4.1.12 floor is required by the
  `@vitest/mocker` security alerts).
- Blocked: TypeScript stays below 7 (`^6.0.0` in the extension, `~5.9.3` in the PWA)
  because `typescript-eslint` declares a peer range that ends before 6.1, so a 7.x
  bump fails the install. Dependabot reopens it when the linter widens the range.
- Known and not actionable: `deepmerge` 4.3.1 is the last published version and the
  advisory covers it. It arrives through `@opencloud-eu/web-pkg`.

Guard rail: `pnpm check:overrides` fails the CI job when `pnpm-lock.yaml` stops pinning
the `pnpm.overrides` of `package.json`, which is what Dependabot does when it
regenerates that lockfile.

### Companion backend (ocapps)

The service that runs in production is the `photos` module of
[ocapps](https://github.com/gnacho/ocapps), on Go 1.26.10 with `golang.org/x/net`
0.62.0 (that floor closes GO-2026-6617 and GO-2026-6866). It is the only copy: this repo
used to keep a second one under `app/server-go` and it was removed because it had already
diverged from what runs.

### Standalone variant (`app/`)

Migrated to current majors on 2026-10-05: Tailwind CSS 4 (via
`@tailwindcss/vite`, no PostCSS), Vite 8, react-router 8, recharts 3,
lucide-react 1.x, react-day-picker 10, ESLint 10, `@types/node` 26, and the
latest patch lines of zod, react-hook-form, react-resizable-panels and
embla-carousel.

Held back: TypeScript 5.9.3, because typescript-eslint 8.71 peer-requires
`typescript < 6.1`. Revisit when typescript-eslint adds TS 7 support.

The Tailwind 4 migration also removed the whole Tailwind 3 toolchain chain,
which is the only fix for the braces stack-exhaustion advisory
(GHSA-vfj7-8cjw-p6xm, no patched release): `npm audit` in `app/` now reports
zero vulnerabilities.

## Continuous integration

`.github/workflows/ci.yml` runs on every pull request, on pushes to `main` and
on manual dispatch, with Node 24 in both jobs. Coverage is enforced inside the
build, so a change that adds untested code can turn the CI red.

| Job | What it runs |
|---|---|
| `Repo (no backend, no Docker)` | fails if the tree contains Go files, `go.mod`, a Dockerfile, a compose file or a `.dockerignore` |
| `Extension (overrides, types, lint, tests, coverage, build)` | `pnpm install --frozen-lockfile`, `check:overrides`, `check:types`, `lint`, `test:coverage`, `build` |
| `Standalone app (lint, tests, coverage, build)` | `npm ci`, `lint`, `test:coverage`, `build` |

Releases are separate: `.github/workflows/release.yml` builds the extension zip
when a `ocphotos-v*` tag is pushed.

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

Resolved by the Tailwind 4 migration (#11): the Tailwind 3 toolchain is
gone from `app/`, so the `braces` advisory chain no longer applies and
`npm audit` in `app/` reports zero vulnerabilities.

## License

GNU Affero General Public License v3.0 (AGPL-3.0-only). See [LICENSE](LICENSE).
