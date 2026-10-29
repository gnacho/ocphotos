# Deployment: native OpenCloud instance

ocphotos is a native OpenCloud web extension. It is installed on an OpenCloud
instance and served by the OpenCloud web service; it uses the host session, so
it needs no app tokens of its own.

To update an existing deployment, install the zip published with each tag, see
[Install from a release](#install-from-a-release). The steps below build from
source.

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
restart is required after registering the app, after changing `apps.yaml` and
after every deploy that replaces the bundle:

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

### Install from a release

Every tag `ocphotos-v*` publishes `ocphotos-<version>.zip`, which already contains
`ocphotos/` with `manifest.json`, `js/` and `assets/`. The app store consumes that
artefact, so install the released zip instead of a local build:

1. Back up the current directory outside `assets/apps/`, so the module federation
   manifest never sees a stale copy:

   ```bash
   tar czf /root/ocphotos-app.bak-$(date +%Y%m%d).tgz \
     -C /etc/opencloud/web/assets/apps ocphotos
   ```

2. Push the zip into the container and extract it there. Minimal images usually
   have no `unzip`, but they do have Python:

   ```bash
   pct push <ctid> /root/ocphotos-<version>.zip /tmp/ocphotos.zip
   pct exec <ctid> -- python3 -c \
     "import zipfile; zipfile.ZipFile('/tmp/ocphotos.zip').extractall('/tmp/ocphotos-new')"
   ```

3. Swap the directory and leave it owned by the web service user:

   ```bash
   pct exec <ctid> -- sh -c 'rm -rf /etc/opencloud/web/assets/apps/ocphotos'
   pct exec <ctid> -- mkdir -p /etc/opencloud/web/assets/apps/ocphotos
   pct exec <ctid> -- sh -c 'cp -a /tmp/ocphotos-new/ocphotos/. /etc/opencloud/web/assets/apps/ocphotos/'
   pct exec <ctid> -- chown -R 1000:1000 /etc/opencloud/web/assets/apps/ocphotos
   ```

4. Restart the web service and check what the instance serves:

   ```bash
   pct exec <ctid> -- systemctl restart opencloud
   curl -s https://<host>/assets/apps/ocphotos/manifest.json | jq '.version, .entrypoint'
   curl -s -o /dev/null -w '%{http_code}\n' \
     https://<host>/assets/apps/ocphotos/js/<remoteEntry>
   ```

The manifest is a static file, so it reports the new version as soon as the files
are in place. That does not make the restart optional. The remote entry filename
carries a build hash, so `config.json` keeps pointing at the previous file until
OpenCloud restarts, and the browser fails with a 404 on that file and
`failed to load external application ocphotos`. The app stays blank until the
service is restarted. After it, confirm the entry points at the name the new
manifest declares:

```bash
curl -s http://127.0.0.1:9200/config.json | jq '.external_apps[] | select(.id=="ocphotos")'
```

After the deploy, check the browser: the timeline lists photos with thumbnails,
the viewer opens one with its EXIF caption, and "Open with" from the Files context
menu reaches the viewer with the right photo. A 404 on
`/graph/v1.0/users/<id>/photo/$value` is the user avatar, not the extension.

Read the version from `manifest.json`, not from the size of the directory: the
bundle is split into more chunks with every SDK major (41 files and 336 KB with
SDK 7.4, 62 files and 572 KB with SDK 8.2).

To roll back, remove the directory, restore the backup and fix the owner and
service as in the steps above.

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

## 3. Backend

The extension needs the photo service, which lives in
[ocapps](https://github.com/gnacho/ocapps) as the `photos` module. This repo does not
contain it and does not build it: install and upgrade it following the ocapps docs.

What matters from here:

- The reverse proxy routes `/ocphotos-api/` to that service (snippet in the root README).
- The extension sends the host session bearer and the service validates it against
  Graph `/me`, so each user gets their own index.
- HEIC/HEIF thumbnails, EXIF, video posters and the XMP sidecars all come from there.
- OpenCloud's own thumbnail service does not decode HEIC (only png, jpg, gif, tiff and
  bmp), which is why the extension asks the service instead.

If the host still has the old `photos-service` unit (`/usr/local/bin/photos-service`,
port `:8097`), that is the September binary and nothing updates it. Point the proxy at
ocapps and remove the unit, otherwise two indexes drift apart.
