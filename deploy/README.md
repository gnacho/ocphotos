# Deployment: native OpenCloud instance

ocphotos is a native OpenCloud web extension. It is installed on an OpenCloud
instance and served by the OpenCloud web service; it uses the host session, so
it needs no app tokens of its own.

## Build

```bash
cd ocphotos
pnpm install
pnpm build        # emits dist/ (module federation: manifest.json + js/ + assets/)
pnpm check:types
```

## Install

The web service loads extensions from `WEB_ASSET_APPS_PATH`
(`/etc/opencloud/web/assets/apps`). Copy the built `dist/` into
`/etc/opencloud/web/assets/apps/ocphotos/` and register the app in
`/etc/opencloud/apps.yaml`:

```yaml
ocphotos:
  config: {}
```

OpenCloud rebuilds the `external_apps` list in `config.json` at startup, so a
restart is required after installing or replacing the app:

```bash
rm -rf /etc/opencloud/web/assets/apps/ocphotos
mkdir -p /etc/opencloud/web/assets/apps/ocphotos
tar xzf /tmp/ocphotos-dist.tgz -C /etc/opencloud/web/assets/apps/ocphotos
chown -R 1000:1000 /etc/opencloud/web/assets/apps/ocphotos
systemctl restart opencloud
curl -s http://127.0.0.1:9200/config.json | jq '.external_apps'
```

`external_apps` must list `ocphotos` with the current `remoteEntry-*.mjs` from
`manifest.json`. Remove the old app directory before the restart: stale chunks
break the module federation manifest. Backups go outside `assets/apps/`
(e.g. `/root/ocphotos.bak-<date>`).

## URL routing

The extension is served under `/ocphotos` by the OpenCloud single-page app.
Do not add a reverse-proxy `location` for `/ocphotos`: the proxy must forward
everything to the OpenCloud web service, which resolves the app route. A static
PWA location would shadow the native app route, so keep it out of the vhost.

The app registers itself in the app switcher as `app.ocphotos.menuItem`.

## Notes

- Thumbnails and originals are fetched through the host session (Bearer token)
  with the preview service (`usePreviewService().loadPreview`) and rendered as
  blob URLs. A plain `<img src>` cannot carry the token, so raw WebDAV URLs do
  not authenticate.
- Route links must use paths, not names: the host prefixes app route names
  (`photos-timeline` becomes `ocphotos-photos-timeline`).
- The extension indexes a folder in the personal space over WebDAV. The default
  root is `/Fotos`; users can change it from the in-app folder picker (remembered
  per browser in localStorage), or an admin can set the default in `apps.yaml`:

  ```yaml
  ocphotos:
    config:
      rootPath: /Fotos
  ```

  Restart OpenCloud after changing `apps.yaml`. A user's pick in the UI takes
  precedence over the configured default.

## 3. photos-service (HEIC thumbnails + EXIF backend)

OpenCloud's thumbnails service does not decode HEIC (only png/jpg/gif/tiff/bmp),
so the extension falls back to the `photos-service`, which decodes HEIC/HEIF with
a pure-Go decoder (`gen2brain/h265`, no CGo, no libvips).

- Host: static binary at `/usr/local/bin/photos-service`, system user
  `ocphotos`, data in `/var/lib/ocphotos`, env in `/etc/ocphotos/env` (640),
  unit `ocphotos.service`, port `:8097`.
- Env: `OC_BASE_URL=http://127.0.0.1:9200`, `OC_USER`, `OC_APP_TOKEN`,
  `MEMORIES_TOKEN`, `SCAN_ROOT=Fotos`, `SCAN_EVERY=30m`, `DATA_DIR`.
- Exposed by the reverse proxy as `/ocphotos-api/` ->
  `http://<service-host>:8097/` (trailing slash strips the prefix).
- The extension calls `/ocphotos-api/api/thumb?path=/Fotos/x.heic&w=400&etag=...`
  with the host session Bearer. The service validates it against Graph `/me` and
  only answers for its own user (single-tenant).

Deploy the binary:

```bash
cd app/server-go
CGO_ENABLED=0 go build -trimpath -ldflags "-s -w" -o /tmp/photos-service ./cmd/photos-service
# stop the service first: pushing over a running binary fails with "Text file busy"
systemctl stop ocphotos
# copy /tmp/photos-service to /usr/local/bin/photos-service (0755), then:
systemctl start ocphotos
```
