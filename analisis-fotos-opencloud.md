# Análisis de viabilidad: App de fotos tipo Immich/Memories para OpenCloud

**Fecha:** 2026-09-13
**Contexto:** Migración personal desde Nextcloud a OpenCloud. El único bloqueo es la gestión de fotos (timeline, "memories", caras, ubicaciones). Se evalúan tres caminos: (A) portar Memories de Nextcloud, (B) construir un "clon de Immich" sobre OpenCloud, (C) arquitectura híbrida recomendada.

---

## 1. Veredicto rápido

**Sí, tiene sentido, pero NO como "app de OpenCloud" al estilo Nextcloud.** La conclusión más importante del análisis es que el modelo mental que traes de Nextcloud (apps PHP que se instalan *dentro* del servidor) **no existe en OpenCloud**. Esto, que parece un obstáculo, en realidad te empuja hacia la arquitectura correcta: la que ya usa Immich.

- **Portar Memories: inviable** (ver §3). No es cuestión de esfuerzo, es que no hay runtime PHP ni APIs equivalentes en OpenCloud.
- **Clon de Immich: viable y es el camino correcto**, con la salvedad de que **no necesitas clonar el ML**: el servicio de machine learning de Immich es un microservicio Python independiente (FastAPI + ONNX) que puedes **reutilizar tal cual** o imitar con tu propio servicio Python. El "refactor a Go" solo aplica a la capa de API/metadatos.
- **Android/iOS: viable sin Mac** usando Flutter + CI (Codemagic / GitHub Actions con runners macOS), exactamente como hace el propio Immich.

---

## 2. Qué es realmente OpenCloud (y qué no)

OpenCloud (fork comunitario de oCIS tras la compra de ownCloud por Kiteworks) es:

- **Backend 100% Go**, arquitectura de microservicios.
- APIs: **WebDAV (con TUS para subidas resumibles), Microsoft Graph API, OCS, OCM, gRPC, OIDC, SSE, KQL** (Keyword Query Language para búsqueda) y WOPI.
- Frontend web en **Vue.js + TypeScript**, con un **sistema de extensiones de apps web** bien definido: una "app" de OpenCloud es un paquete JS/Vue que se monta en el frontend (ej. `web-app-maps`, `web-app-json-viewer`, skeleton oficial `web-app-skeleton`). Se cargan como volumen en el contenedor.
- **No hay concepto de app server-side con lógica propia** como en Nextcloud. Si quieres lógica de servidor, la montas como **microservicio externo** que habla con OpenCloud por WebDAV/Graph/gRPC/OIDC.

### Implicación clave
Tu "app de fotos" será, inevitablemente, **tres cosas**:

1. **Una app web OpenCloud** (Vue/TS) que se instala como extensión del frontend: timeline, mapa, vistas de caras, álbumes.
2. **Un microservicio backend propio** (el "photos-service"): indexa ficheros vía WebDAV/Graph, extrae EXIF, genera thumbnails, guarda metadatos en su propia BBDD, sirve API propia.
3. **Un microservicio ML** (Python): detección de caras, clustering, embeddings CLIP para búsqueda semántica, detección de objetos.

Esto **es exactamente la arquitectura de Immich** (server NestJS + immich-machine-learning Python + Postgres + Redis), solo que usando OpenCloud como capa de almacenamiento/autenticación en lugar de almacenamiento propio.

---

## 3. Opción A: Portar Memories — descartada

Memories (pulsejet/memories) es una app PHP que depende de:

- El **filecache de Nextcloud** (acceso directo a la tabla de ficheros indexados), su sistema de **preview providers** (generación de miniaturas), **OCS API**, sus **background jobs** (cron.php), sus apps hermanas **Recognize** (Node.js + TensorFlow.js ejecutado desde PHP) o **Face Recognition** (dlib).
- Su timeline rápido existe porque Nextcloud mantiene un índice de ficheros en MySQL/Postgres y Memories mete sus propias tablas.

En OpenCloud no existe nada de eso en PHP: el filecache no es una BBDD relacional consultable igual, las previews se generan por un servicio Go (thumbnails service), y no hay forma de "instalar" PHP. Portar Memories = **reescreibir el 100%**. Y la app Android de Memories no es reusable: es un cliente que habla con los endpoints PHP de la app Memories en tu Nextcloud; sin ese backend, no sirve. Aprovechar la app Android oficial de Nextcloud tampoco encaja: habla WebDAV/OCS con Nextcloud (parcialmente compatible vía OCS en OpenCloud para shares, pero no para nada de fotos).

**Conclusión: olvídate de portar; cualquier esfuerzo aquí es mejor invertirlo en la opción B/C.**

---

## 4. Opción B: Clon de Immich sobre OpenCloud — el camino

### 4.1 Qué puedes aprender/copiar de Immich

Immich (v3.x en 2026) es un monorepo con:

| Componente | Stack | ¿Reusable para tu proyecto? |
|---|---|---|
| `server` (API REST) | Node.js, NestJS, Kysely | Referencia de diseño de API (OpenAPI autogenera SDKs de cliente). Lo reescribirías en Go. |
| `machine-learning` | Python, FastAPI, modelos ONNX (InsightFace para caras, CLIP para búsqueda semántica, OCR) | **Reusable casi tal cual**: es un microservicio HTTP independiente. Puedes ejecutarlo contra tu backend o replicarlo (los modelos ONNX son públicos). |
| `postgres` + VectorChord/pgvecto.rs | Postgres con extensión vectorial | Necesitarás Postgres con búsqueda vectorial (VectorChord o pgvector) para embeddings de caras/CLIP. |
| `redis` (Valkey) | Cola de trabajos (BullMQ) | En Go: cola propia (NATS, Redis Streams, River sobre Postgres, Asynq...). |
| `web` | SvelteKit | Tú usarás Vue (para integrarte como app OpenCloud) o Svelte/React si prefieres app standalone embebida. |
| `mobile` | Flutter (Riverpod, Isar) | **Referencia directa**: Immich demuestra que Flutter funciona bien para esto (galería fluida, subida en background). |

### 4.2 La gran decisión de diseño: ¿dónde viven las fotos?

Dos sub-opciones:

**B1. OpenCloud como storage (files-on-disk).** Las fotos siguen siendo ficheros normales en OpenCloud (el usuario las sube con el cliente de escritorio o móvil de OpenCloud). Tu servicio:
- Escucha cambios (SSE / polling de WebDAV / `PROPFIND` incremental por mtime-etag),
- indexa EXIF (fecha, GPS, cámara),
- genera thumbnails propios o pide los del servicio de thumbnails de OpenCloud,
- corre ML sobre ellos y guarda resultados en **tu Postgres** (tablas: assets, exif, faces, persons, albums, embeddings).
- Vista: app web OpenCloud que consume tu API + renderiza miniaturas.

*Ventajas:* las fotos siguen siendo "ficheros de verdad" — sincronizables, accesibles por WebDAV, sin lock-in. Es la filosofía Memories.
*Inconvenientes:* subida móvil depende de la app de OpenCloud (hoy no tiene auto-upload de fotos tan pulido como Nextcloud/Immich); deduplicación y "backup desde el móvil" requieren app propia a largo plazo; dos fuentes de verdad (filesystem + tu índice) que hay que reconciliar.

**B2. Storage gestionado por tu servicio (modelo Immich puro).** Tu app móvil/web sube a tu API; tu servicio guarda los binarios donde quiera (incluso en OpenCloud vía WebDAV, o en S3).
*Ventajas:* control total (dedup, hashing, cola de subida fiable), experiencia Immich.
*Inconvenientes:* te alejas de "los ficheros del usuario", más código, y entonces la pregunta honesta es: *¿por qué no usar Immich directamente y ya?*

**Recomendación: B1**, porque tu motivación es dejar Nextcloud sin perder la integración con tu nube de ficheros, y es lo que ningún producto existente ofrece hoy para OpenCloud. Es el hueco real.

### 4.3 Stack propuesto

- **photos-service (Go):** chi/net-http o Connect-RPC; indexador WebDAV; EXIF con `goexif` o mejor: invocar **ExifTool** (igual que Immich — evita años de edge-cases); thumbnails con libvips (bimg) o `disintegration/imaging` para empezar; ffmpeg para vídeo.
- **Postgres + VectorChord/pgvector** para embeddings; tablas de assets/personas/álbumes. Migraciones con goose/atlas.
- **Cola de trabajos:** River (Postgres-based) o Asynq (Redis) — procesa: index → exif → thumbnail → ML.
- **ml-service (Python):** ONNX Runtime + InsightFace (detección + embeddings faciales, clustering con DBSCAN como hace Immich) + CLIP (búsqueda semántica "fotos de perros en la playa") + opcional: detección de objetos y OCR. Pragmáticamente: **arranca reutilizando `immich-machine-learning`** (es un servicio HTTP con contrato claro) y decide después si lo sustituyes.
- **App web OpenCloud (Vue 3 + TS + vite, sobre `extension-sdk`/`web-pkg`):** timeline virtualizado por fecha (la parte más delicada; estudia la implementación de Immich/Memories), mapa (MapLibre + clustering — ya existe `web-app-maps` como referencia), vista Personas, álbumes, búsqueda.
- **App móvil (Flutter):** fase 2. Android primero; iOS vía CI (ver §6).

### 4.4 Limitaciones de ML a asumir (y que ya asume Immich)

- Sin GPU, el procesado inicial de una librería de ~50k fotos tarda **días en CPU** (Immich: InsightFace + CLIP en CPU ≈ 1–3 imágenes/s). Nextcloud Recognize recomienda 10–20 cores sin GPU. Es un coste one-shot por librería, luego incremental.
- La calidad de caras/clustering de InsightFace es buena pero no Google Photos; espera merges/splits manuales de personas.
- Búsqueda semántica CLIP: sorprendentemente útil; OCR y "landmarks" son cherries.
- Todo esto funciona **on-premise con modelos ONNX públicos** — no necesitas entrenar nada. La "limitación de ML" que temes es en realidad el punto fuerte del enfoque: el trabajo pesado (modelos) ya está hecho.

---

## 5. Hoja de ruta realista (una persona, tiempo parcial)

| Fase | Entregable | Esfuerzo est. |
|---|---|---|
| 0 | Spike: app web "skeleton" instalada en tu OpenCloud + servicio Go que lista fotos por WebDAV | 1–2 semanas |
| 1 | Indexador EXIF + thumbnails + timeline web funcional (scroll virtual) | 1–2 meses |
| 2 | Mapa (EXIF GPS), álbumes, "On this day" (la feature *Memories* es trivial una vez tienes el índice por fecha) | 3–4 semanas |
| 3 | Integración ML: caras + personas (reusando immich-ml o propio) | 1–2 meses |
| 4 | Búsqueda semántica CLIP | 2–3 semanas |
| 5 | App Android (Flutter): galería + auto-upload | 2–3 meses |
| 6 | Build iOS vía CI + ajustes | 2–4 semanas |

Con agentes de código (que es el mundo en 2026) las fases 1–4 son muy paralelizables. El riesgo no es técnico, es de **mantenimiento a largo plazo**: serás upstream de nada; sigue a OpenCloud (que mueve rápido) de cerca.

---

## 6. iOS sin Mac — resuelto

- Desarrolla en Flutter (Android) desde Linux/Windows normalmente.
- **Build iOS en CI**: Codemagic (tiene tier gratuito, acceso VNC/SSH a la Mac de build para inicializar el proyecto iOS) o **GitHub Actions con runner `macos-latest`** + `codemagic-cli-tools` para firma. Es un flujo documentado y habitual.
- Costes inevitables: **Apple Developer Program (~99 $/año)** y, idealmente, algún iPhone real para smoke tests. El debugging fino en simulador iOS sin Mac es el único punto doloroso real; se mitiga con buena cobertura en Android (mismo código Dart) y TestFlight con testers.

---

## 7. Riesgos y alternativas honestas

1. **"¿Y si simplemente uso Immich al lado de OpenCloud?"** Es la opción sensata a corto plazo. Pero no integra tus ficheros, duplica storage si quieres las fotos en la nube, y no resuelve tu "quiero dejar Nextcloud atrás" si valoras la unificación. Tu proyecto responde a un hueco que existe (la comunidad OpenCloud/oCIS no tiene nada de fotos decente hoy; solo el visor básico).
2. **Madurez de OpenCloud:** es joven (2025+). Las APIs de extensiones web están vivas; ancla tu integración a WebDAV/Graph/OIDC (estables) y trata el SDK de extensiones como capa fina sustituible.
3. **Compatibilidad OCS:** no construyas nada sobre OCS pensando en "reusar clientes Nextcloud"; la compatibilidad es parcial y trampa.
4. **Escala personal vs producto:** para tu uso (1–10 usuarios, <100k fotos) el diseño propuesto va sobrado incluso en una Raspberry Pi 5 / N100 (OpenCloud está diseñado para ello; el ML será lo que pida RAM: ~2–4 GB).

---

## 8. Conclusión

- **¿Tiene sentido? Sí.** Es ambicioso pero cada pieza tiene precedente directo y open source: arquitectura (Immich), modelo de integración de ficheros (Memories), sistema de apps web (OpenCloud), móvil sin Mac (Flutter + CI).
- **No portes nada de Nextcloud**; reescribe en Go una capa fina y roba sin pudor el diseño de Immich, incluido (al principio) su microservicio ML.
- **MVP recomendado:** indexador WebDAV + timeline + "On this day" + mapa dentro de una app web OpenCloud. Con eso ya cubres el 80 % de lo que echas de menos de Memories, sin ML.
- El ML (caras, búsqueda semántica) es la fase 3, no el prerrequisito: las limitaciones de ML que temías son, en 2026, un problema resuelto y empaquetado en ONNX.

---

## 9. Actualización: estado del ecosistema y "OpenCloud como fuente de verdad + Immich como motor"

### 9.1 Qué existe en repos (búsqueda 2026-09-13)

| Repo / proyecto | Qué es | Utilidad para ti |
|---|---|---|
| **immich-app/immich** | El estándar de facto; ya incluye **Memories ("x years ago")**, caras+clustering, mapa global, búsqueda CLIP, álbumes, compartir, storage templates (rutas legibles) | El motor completo que no quieres reescribir |
| **simulot/immich-go** | CLI en Go para subir masivamente (carpetas, takeouts, otro Immich); dedup, álbumes desde estructura de carpetas | Pieza ideal para un "puente" OpenCloud→Immich |
| **PersistentCloud/immich-webdav-wrapper** | Wrapper para exponer Immich vía WebDAV | Dirección contraria a la que necesitas, pero referencia |
| **Demian98/immich-sftp-server** | SFTP sobre la API de Immich | Referencia de integración por API |
| **TheRealKoller/photosort** | PWA pequeña con **integración OpenCloud** (login, lectura de fotos) + scoring con IA | **Prueba de concepto de que la integración OpenCloud-app externa funciona**; proyecto personal, no una base sólida |
| Apps fotos para OpenCloud | **No existe nada** en el ecosistema OpenCloud/oCIS comparable (solo el visor básico integrado) | El hueco sigue ahí |

Conclusión del barrido: **no hay ninguna base madura** que haga de puente OpenCloud↔Immich ni ninguna app de fotos para OpenCloud. Todo lo que existe orbita alrededor de Immich por API o por filesystem.

### 9.2 El detalle que lo cambia todo: DecomposedFS

En Nextcloud los ficheros viven "tal cual" en disco (`/data/usuario/files/Fotos/...`), por eso el patrón "montar la carpeta de Nextcloud como External Library de Immich" funciona. **En OpenCloud no**: usa DecomposedFS — los blobs se guardan con **nombre UUID sin extensión** y los metadatos (nombre real, ruta, mime) van en *extended attributes* del filesystem. Montar `/var/lib/opencloud/storage/users` en Immich es inútil: vería ficheros UUID sin nombre ni extensión. Olvida el acceso por filesystem directo.

### 9.3 Opciones reales para "OpenCloud = verdad, Immich = motor"

**Opción 1 — rclone mount WebDAV → External Library (ro) de Immich.**
OpenCloud expone WebDAV; montas con rclone (`--vfs-cache-mode=full`, `--dir-cache-time` alto, `--poll-interval`) y lo registras como librería externa de Immich en solo lectura.
- ✅ Cero código, cero duplicación de storage, OpenCloud sigue siendo la verdad.
- ⚠️ Escaneos lentos (un PROPFIND por carpeta en cada rescan); **WebDAV no notifica cambios** (el file-watching experimental de Immich no funciona en mounts de red → rescans programados); lecturas por red para thumbnails/ML (túnel de latencia en librerías grandes); los metadatos creados en Immich (álbumes, descripciones) viven solo en Immich y **se pierden si mueves/renombras el fichero en OpenCloud** (limitación documentada de las external libraries).
- Veredicto: funciona para librerías pequeñas/medianas y es el piloto perfecto, pero es el punto más frágil de la cadena.

**Opción 2 — Réplica local sincronizada → External Library.**
`rclone sync` (o el cliente de escritorio de OpenCloud) mantiene una copia local `/srv/photos` que Immich indexa como external library.
- ✅ Escaneos rápidos en disco local, ML rápido, setup robusto y aburrido (lo que quieres para mantenimiento).
- ❌ **Duplicas el storage** de las fotos. Para muchos es inaceptable; si el volumen es razonable (<1–2 TB) es la opción más fiable.
- Borrados: al rescan, Immich manda a papelera lo que desapareció — comportamiento correcto con sync unidireccional.

**Opción 3 — Invertir la verdad: Immich = verdad para fotos, OpenCloud = verdad para el resto** (recomendada si priorizas mantenimiento cero).
Subes desde el móvil directamente con la app de Immich (auto-backup maduro, background, dedup); con **storage templates** los ficheros quedan legibles (`library/admin/2025/09/IMG_1234.jpg`); y si quieres las fotos visibles en OpenCloud, un `rclone sync` nocturno Immich→OpenCloud `/Fotos` te da navegación WebDAV y backup.
- ✅ Cero código, cero integración frágil, todo el tooling (immich-go, CLI oficial) aplica, actualizaciones de Immich sin dolor.
- ❌ Renuncias a "fotos = ficheros de mi nube" como principio; son dos apps para dos dominios. En la práctica es como la gente usa Nextcloud+Immich hoy.

**Opción 4 — Puente propio en Go (immich-bridge).**
Servicio pequeño: escucha cambios en OpenCloud (SSE/WebDAV polling) y empuja nuevos assets a Immich vía API (patrón immich-go). Mantiene OpenCloud como verdad sin duplicar storage ni mounts FUSE.
- ✅ Arquitectura "correcta", reactiva, sin duplicación.
- ❌ Es código tuyo para siempre: ~lo que querías evitar. Aun así, acotado (300–800 líneas), es el máximo de "proyecto propio" compatible con bajo mantenimiento.

### 9.4 Recomendación final actualizada

1. **Empieza hoy con Opción 1 o 3** (según tolerancia a duplicar/latencia). Resuelves el 95 % de lo que echas de menos de Nextcloud (timeline, memories, caras, mapa, app móvil excelente) **sin escribir código**.
2. Si con el tiempo la fricción de la external library te molesta (metadatos que no persisten al mover ficheros, rescans), el siguiente paso **no** es construir el clon completo del primer análisis, sino la **Opción 4**: un puente Go finito. Mantenimiento bajo, alcance pequeño, y te posiciona para la app web OpenCloud si algún día quieres la integración visual.
3. El "clon de Immich" del análisis anterior queda como plan C: solo tiene sentido si decides convertir esto en proyecto/producto para la comunidad OpenCloud (donde el hueco existe de verdad), no para uso personal.

---

## 10. Primera implementación (v0.1, 2026-09-13)

Se ha construido el primer esfuerzo funcional de "Memories para OpenCloud":

- **PWA React/TS** (`/app`): timeline justificado por días con headers sticky, Recuerdos ("Un día como hoy…"), Personas (demo; ML pendiente), Álbumes, Mapa (Leaflet + CARTO dark), Carpetas, Favoritos, búsqueda por texto/lugar/cámara, visor a pantalla completa con navegación por teclado, panel EXIF y favoritos.
- **Cliente OpenCloud real** en el navegador (`src/lib/opencloud.ts`): descubrimiento de espacios vía `GET /graph/v1.0/me/drives`, PROPFIND recursivo sobre `/Fotos`, auth con app-token. Funciona contra una instancia real con CORS habilitado; si no, la app arranca con 1.343 fotos demo generadas (seed determinista).
- **`server-go/`**: esqueleto del photos-service — cliente DAV completo en Go, scanner incremental por etag con soft-delete, esquema Postgres (assets, day_buckets materializado, persons/faces, álbumes), main con config por entorno y TODOs marcados (store pgx, API REST, workers River, OIDC).
- Decisiones aplicadas del análisis: sin código PHP portado, EXIF por Range request, sidecar XMP planificado para sobrevivir reubicaciones, ML diferido a microservicio Python (fase 3).
