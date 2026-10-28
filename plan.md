# Plan: app de fotos tipo Immich/Memories para OpenCloud

## Estado a 28 de octubre de 2026

- El análisis de viabilidad está entregado en `analisis-fotos-opencloud.md`, con el estado real del proyecto en §13.
- El producto vivo es la extensión nativa `ocphotos` (v1.5.0), servida por el photos-service Go y desplegada en `drive.domatix.cloud`.
- Hay red de seguridad: 132 tests en la extensión y 30 en la PWA, umbrales de cobertura e integración continua en cada pull request. Las releases salen de un tag y producen el zip instalable.

## Siguientes frentes

1. **Personas (reconocimiento facial)**. Es el único frente grande que queda. Necesita microservicio de ML aparte, tablas de caras en el servicio, endpoints de personas y la integración en la interfaz, que hoy usa datos demo.
2. **Sidecars XMP**. Escribir los metadatos editados junto a la foto para que sobrevivan a que el fichero se mueva fuera del índice.
3. **Cobertura de las vistas**. Las pantallas menos cubiertas están entre el 42 % y el 60 %. Subirlas permite después elevar los umbrales de CI sin que el margen se vuelva frágil.
