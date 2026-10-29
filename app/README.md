# ocphotos - app standalone (React)

PWA de fotos construida con React 19, TypeScript, Vite 8, Tailwind 4 y shadcn/ui.
Ofrece el mismo producto que la extensión nativa (`ocphotos/`) pero **fuera de
OpenCloud**: se abre en su propio host o embebida por iframe en otra página.

El índice de fotos y las miniaturas los sirve el módulo `photos` de
[ocapps](https://github.com/gnacho/ocapps), el mismo proceso que atiende a la
extensión nativa. Este paquete no contiene backend.

## Modos de conexión

La app arranca en modo demo y cambia de modo desde el diálogo de ajustes (icono de
la barra lateral).

| Modo | Qué necesita | De dónde salen los datos |
|---|---|---|
| Demo | nada | Librería generada en el navegador (`src/lib/demoData.ts`) |
| OpenCloud directo | URL, usuario y app token de OpenCloud, más CORS habilitado en la instancia | WebDAV (`PROPFIND`) y Graph del propio OpenCloud |
| Servicio | El servicio de fotos accesible en `/api/` del mismo origen y un token válido | API de `ocapps` bajo `/ocphotos-api/` |

El modo servicio se autodetecta al arrancar: la app pide `/api/stats` y, si
responde correctamente, se conecta. Sin servicio se queda en demo, y si el
servicio exige token hay que pegarlo en los ajustes.

El modo OpenCloud directo necesita que la instancia permita el origen de la PWA
(`OC_CORS_ALLOW_ORIGINS`). Sin CORS, el propio diálogo muestra esa pista al
fallar la conexión.

## Desarrollo

Requiere Node 24 (la versión que usa la integración continua).

```
npm ci
npm run dev
```

El servidor de desarrollo escucha en el puerto 3000.

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo con recarga en caliente |
| `npm run build` | `tsc -b` y build de producción en `dist/` |
| `npm run lint` | ESLint sobre todo el paquete |
| `npm test` | Suite unitaria (Vitest y jsdom) |
| `npm run test:coverage` | La suite con cobertura y umbrales |

Los umbrales de cobertura viven en `vitest.config.ts` y cubren el código propio:
el cliente de la API, el store, la agrupación por día, los hooks y los
componentes de `src/components/`. Quedan fuera `src/components/ui/` (shadcn
vendorizado), los datos de ejemplo y los tipos.

## Cómo se sirve

El build tiene `base: './'`, así que `dist/` funciona desde cualquier prefijo de
ruta. No hay rutas de cliente (el router se monta pero ninguna vista declara
`<Routes>`), de modo que **no hace falta** reescribir peticiones a `index.html`.

Sirve `dist/` como estático en **su propio host** y proxea `/api/` al servicio:

```
location /api/ {
  proxy_pass http://<servicio>:8096/ocphotos-api/api/;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-Proto $scheme;
}
```

En Nginx Proxy Manager la misma idea se monta como un *custom location* con la
ruta `/api/` y el destino `http://<servicio>:8096/ocphotos-api/api/`.

**No la sirvas desde el host de OpenCloud.** Ahí `/api/*` no llega al servicio:
cae en el respaldo del SPA y responde un 200 con el `index.html` de OpenCloud. La
autodetección de la app sólo mira si la respuesta es correcta, así que daría por
bueno un servicio que no está y fallaría al leer el JSON. En un host propio no
ocurre porque `/api/` sólo existe si el proxy lo pone.

## Miniaturas en modo servicio

La API acepta el token únicamente en la cabecera `Authorization`, y una etiqueta
`<img>` no puede enviarla. Por eso el modo servicio no pone el token en la URL: el
componente `AssetImage` pide la imagen con `fetch` y la cabecera, y pinta el
`blob:` que devuelve. `src/lib/images.ts` cachea una descarga por URL y comparte
la petición si dos vistas piden la misma foto, y `disconnect` libera los blobs.

El modo demo y el modo OpenCloud directo no pasan por ahí porque usan el app token
de OpenCloud, que sí viaja en la URL.

## Comprobación tras desplegar

1. La raíz del host devuelve el `index.html` y el manifiesto de la PWA.
2. Con el servicio levantado, la app entra sola en modo servicio y el contador de
   la cabecera muestra los elementos del índice.
3. Buscar en el timeline devuelve resultados y desplazarse hasta el final carga
   más páginas.
4. Abrir una foto muestra el visor con su pie de fecha y cámara.
5. El mapa dibuja los puntos de las fotos que tienen coordenadas.
