# Deployment: cloud.example.com

ocphotos is served on the drive instance in two layers.

## 1. Static PWA

The Vite build (`app/dist`) is served same-origin at
`https://cloud.example.com/ocphotos/` by Nginx Proxy Manager (the vhost on the proxy host,
the proxy container). Static files live at `/data/ocphotos` on that host.

See `nginx-ocphotos.conf` for the `location` block. Because the PWA is served from
the same origin as OpenCloud, its Graph/WebDAV calls need no CORS configuration.

Build and publish:

```bash
cd app
npm ci
npm run build
tar czf /tmp/ocphotos-dist.tgz -C dist .
scp -P 2222 /tmp/ocphotos-dist.tgz root@<node4>:/tmp/
# on node4: pct push 4020 /tmp/ocphotos-dist.tgz /tmp/ocphotos-dist.tgz
# in the proxy container: rm -rf /data/ocphotos/* && tar xzf /tmp/ocphotos-dist.tgz -C /data/ocphotos
#             chown -R www-data:www-data /data/ocphotos
# then reload openresty (see nginx-ocphotos.conf)
```

## 2. OpenCloud app menu entry

To appear as a regular app in the OpenCloud app switcher, the instance runs the
official `web-app-external-sites` app configured with ocphotos as an `embedded`
site (an iframe pointing at the same-origin PWA).

- App artifact: `external-sites-2.1.0.zip` from
  https://github.com/opencloud-eu/web-extensions/releases (verify the sha256).
- Installed at `/etc/opencloud/web/assets/apps/external-sites/` on the OpenCloud
  host (the OpenCloud container).
- Config in `/etc/opencloud/apps.yaml`:

```yaml
external-sites:
  config:
    sites:
      - name: ocphotos
        url: https://cloud.example.com/ocphotos/
        target: embedded
        color: '#0ea5e9'
        icon: images
        priority: 40
```

- Restart OpenCloud after installing the app or changing the config: the app
  registry (`external_apps` in `config.json`) is rebuilt at startup.

The iframe needs no CSP change: OpenCloud's `frame-src 'self'` already allows the
same-origin URL, and the static `location` sends no `X-Frame-Options`.
