# ocphotos

A Memories-style photo experience for [OpenCloud](https://opencloud.eu): a date timeline,
"on this day", places, albums, tags, folders, a map and duplicates, with OpenCloud as the
source of truth for the files.

It is a **native OpenCloud web extension** (Vue 3 + extension-sdk, session-based, no iframe)
plus a **Go photo service** (part of [ocapps](https://github.com/gnacho/ocapps)) that keeps
the metadata index (EXIF, GPS, tags, albums, hashes) and generates thumbnails, including HEIC.

## Screenshots

| Timeline (justified, month/day headers, Rewind) | On this day |
|---|---|
| ![Timeline](docs/screenshots/timeline.webp) | ![On this day](docs/screenshots/on-this-day.webp) |

| Explore (search hub) | Albums |
|---|---|
| ![Explore](docs/screenshots/explore.webp) | ![Albums](docs/screenshots/albums.webp) |

| Places (reverse geocoded) | Tags |
|---|---|
| ![Places](docs/screenshots/places.webp) | ![Tags](docs/screenshots/tags.webp) |

| Folders (OpenCloud tree) | Map (thumbnail markers) |
|---|---|
| ![Folders](docs/screenshots/folders.webp) | ![Map](docs/screenshots/map.webp) |

| Duplicates (perceptual hash) | Archive |
|---|---|
| ![Duplicates](docs/screenshots/duplicates.webp) | ![Archive](docs/screenshots/archive.webp) |

| Favorites | Viewer |
|---|---|
| ![Favorites](docs/screenshots/favorites.webp) | ![Viewer](docs/screenshots/viewer.webp) |

## Features

- **Timeline** grouped by month and day, with EXIF capture dates, a justified layout
  (fixed-height rows, widths by aspect ratio), infinite scroll and **Rewind** (year/month
  scrubber to jump to any date).
- **On this day**: highlights strip with "N years ago" cards; falls back to the same month of
  previous years, then to the oldest photos, so it is never empty.
- **Explore**: hub with metadata search (file, camera, path) and quick links.
- **Albums**: create, rename, delete, add/remove photos (from the viewer or the grid).
- **Places**: GPS photos clustered by area (~1 km) with **reverse geocoding** (Nominatim,
  cached in SQLite).
- **Tags**: manual tags, added from the viewer; tag list with counts.
- **Folders**: browse the real OpenCloud folder tree (derived from the index) with breadcrumbs.
- **Map**: photo **thumbnail markers** with count badges, grouped by place; click opens the photos.
- **Duplicates**: perceptual hashes (dHash) to find near-identical photos.
- **Archive**: hide photos from the timeline and keep them in their own view.
- **Videos**: posters generated with ffmpeg (the timeline shows a real frame) and playback
  via a **signed same-origin URL with HTTP Range** streaming.
- **Favorites**, **auto-sync** (new photos show up on their own) and **HEIC/HEIF** support
  (pure-Go decoder in the service).
- **Native navigation**: the sections live in OpenCloud's left sidebar (`navItems`), and the
  UI is translated to Spanish (`l10n/translations.json`, follows the host language).
- **Multi-user**: each OpenCloud account has its own photo library. The first time a user
  opens the app, their photos are indexed on demand. Background scanning is supported via
  app-tokens (see [ocapps](https://github.com/gnacho/ocapps) docs).

## Architecture

```
OpenCloud (source of truth: files in each user's personal space)
    |  WebDAV + Graph + OIDC session (per user)
    v
ocapps backend (Go, SQLite)  --  index per user (EXIF, GPS, tags, albums, pHash), thumbnails, REST API
    ^  /ocphotos-api/ (same origin, reverse proxy)
    |
ocphotos extension (Vue 3)  --  timeline, on this day, explore, albums, places, tags,
                                folders, map, duplicates, archive, favorites, viewer
```

The extension never stores credentials: it calls the service with the host session bearer,
and the service validates it against OpenCloud's Graph `/me`. Each user gets their own
isolated index (scoped by `oc_id`).

## Install

### The easy way (OpenCloud App Store)

Download the latest release zip from the [releases page](https://github.com/gnacho/ocphotos/releases):

```bash
# Download ocphotos-X.Y.Z.zip and extract to your OpenCloud apps folder
# (commonly /var/lib/opencloud/web/assets/apps or /etc/opencloud/web/assets/apps)
```

Add to `/etc/opencloud/apps.yaml`:

```yaml
ocphotos:
  config: {}
```

Restart OpenCloud. The ocphotos app appears in the app switcher.

### Build from source

```bash
cd ocphotos
pnpm install && pnpm build
```

Copy `dist/` to the OpenCloud apps folder as `ocphotos/`.

### Backend (ocapps)

The backend lives in the [ocapps](https://github.com/gnacho/ocapps) repo.
See its `deploy/README.md` for the full installation guide (systemd,
environment variables, reverse proxy snippets).

Quick reference for the proxy:

```nginx
location /ocphotos-api/ {
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_pass http://127.0.0.1:8096;
}
```

## Development

```bash
# native extension
cd ocphotos
pnpm install
pnpm build        # pnpm build:w to watch
pnpm check:types
```

## License

GNU Affero General Public License v3.0 (AGPL-3.0-only). See [LICENSE](LICENSE).
