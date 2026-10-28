# Plan: app de fotos tipo Immich/Memories para OpenCloud

## Estado a 28 de octubre de 2026

- El análisis de viabilidad está entregado en `analisis-fotos-opencloud.md`, con el estado real del proyecto en §13.
- El producto vivo es la extensión nativa `ocphotos` (v1.6.0), desplegada en `drive.domatix.cloud` y servida por la API del módulo de fotos de `ocapps`, que es el proceso que corre en producción (contenedor 4125).
- Los metadatos ya no viven solo en la base de datos: las etiquetas y los favoritos se escriben como sidecars XMP junto a cada foto y el escáner vuelve a leer los que deje cualquier otra herramienta, de modo que la biblioteca sobrevive a reindexar o a mover ficheros.
- Hay red de seguridad: 241 tests en la extensión y 30 en la PWA, umbrales de cobertura e integración continua en cada pull request. Las releases salen de un tag y producen el zip instalable.

## Siguientes frentes

1. **Personas (reconocimiento facial)**. Es el único frente grande que queda. Necesita microservicio de ML aparte, tablas de caras en el servicio, endpoints de personas y la integración en la interfaz, que hoy usa datos demo.
2. **Cobertura de las vistas**. Las pantallas menos cubiertas están entre el 42 % y el 60 %. Subirlas permite después elevar los umbrales de CI sin que el margen se vuelva frágil.
3. **Nada pendiente aquí del servicio.** La copia de `app/server-go`, su Dockerfile y la imagen todo en uno se retiraron el 28 de octubre, así que el backend se desarrolla solo en `ocapps`. Este repo se queda con la extensión y la PWA.
