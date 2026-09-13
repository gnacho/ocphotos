<template>
  <div class="map-view">
    <div class="map-toolbar">
      <h1 v-text="$gettext('Map')" />
      <span class="map-count" v-text="placesLabel" />
    </div>

    <div v-if="loading" class="map-note" v-text="$gettext('Loading…')" />
    <div v-else-if="places.length === 0" class="map-note" v-text="$gettext('No photos with location data')" />
    <div v-show="places.length > 0" ref="mapEl" class="map-canvas" />

    <viewer-overlay
      v-if="viewerList"
      :photos="viewerList"
      :index="viewerIndex"
      :ensure-preview="ensurePreview"
      :ensure-original="ensureOriginal"
      @close="viewerList = null"
      @navigate="viewerIndex = $event"
    />
  </div>
</template>

<script lang="ts">
import { computed, defineComponent, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useGettext } from 'vue3-gettext'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { usePhotoLibrary, Place, Photo } from '../composables/usePhotoLibrary'
import ViewerOverlay from '../components/ViewerOverlay.vue'

export default defineComponent({
  name: 'MapView',
  components: { ViewerOverlay },
  setup() {
    const { $gettext } = useGettext()
    const { fetchPlaces, placeAssets, ensurePreview, ensureOriginal, previews } = usePhotoLibrary()
    const placesLabel = computed(() => `${places.value.length} ${$gettext(places.value.length === 1 ? 'place' : 'places')}`)
    const loading = ref(true)
    const places = ref<Place[]>([])
    const mapEl = ref<HTMLElement | null>(null)
    let map: L.Map | null = null

    const viewerList = ref<Photo[] | null>(null)
    const viewerIndex = ref(0)

    const coverSrc = (id: number) => previews.value[`${id}|400`] ?? ''

    const render = async () => {
      await nextTick()
      if (!mapEl.value || places.value.length === 0) return

      map = L.map(mapEl.value, { worldCopyJump: true })
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap'
      }).addTo(map)

      const bounds = L.latLngBounds([])
      for (const pl of places.value) {
        const ll = L.latLng(pl.lat, pl.lon)
        bounds.extend(ll)

        const src = coverSrc(pl.coverId)
        const count = pl.count > 1 ? `<span class="map-pin-count">${pl.count}</span>` : ''
        const html = `<div class="map-pin">${src ? `<img src="${src}" alt="" />` : ''}${count}</div>`

        L.marker(ll, {
          icon: L.divIcon({ className: 'map-pin-wrap', html, iconSize: [48, 48], iconAnchor: [24, 24] }),
          title: pl.name || `${pl.lat.toFixed(2)}, ${pl.lon.toFixed(2)}`
        })
          .addTo(map!)
          .on('click', async () => {
            const list = await placeAssets(pl.lat, pl.lon)
            if (!list.length) return
            viewerList.value = list
            viewerIndex.value = 0
          })
      }
      if (bounds.isValid()) map.fitBounds(bounds, { maxZoom: 13, padding: [50, 50] })
      else map.setView([40.4, -3.7], 5)
    }

    onMounted(async () => {
      try {
        places.value = await fetchPlaces()
        // miniaturas de portada antes de pintar los marcadores
        for (const pl of places.value) if (pl.coverId) await ensurePreview({ id: pl.coverId } as Photo, 400)
      } finally {
        loading.value = false
      }
      await render()
    })

    onBeforeUnmount(() => {
      map?.remove()
      map = null
    })

    return { loading, places, placesLabel, mapEl, viewerList, viewerIndex, ensurePreview, ensureOriginal }
  }
})
</script>

<style scoped>
.map-view { display: flex; flex-direction: column; height: 100%; }
.map-toolbar {
  display: flex; align-items: center; gap: 16px;
  padding: 8px 16px; border-bottom: 1px solid var(--oc-role-outline-variant, #bfc8cc);
}
.map-toolbar h1 { font-size: 1.1rem; font-weight: 600; margin: 0; }
.map-count { font-size: 0.8rem; color: var(--oc-role-on-surface-variant, #40484c); }
.map-note { padding: 32px; text-align: center; color: var(--oc-role-on-surface-variant, #40484c); }
.map-canvas { flex: 1; min-height: 0; }
</style>

<!-- estilos de los marcadores (HTML creado por Leaflet: no lleva el scope) -->
<style>
.map-pin-wrap { background: none; border: 0; }
.map-pin {
  position: relative; width: 48px; height: 48px;
  background-color: rgba(0, 0, 0, 0.3); border-radius: 5px;
  box-shadow: 0 0 3px rgba(0, 0, 0, 0.2);
}
.map-pin:hover { box-shadow: 0 0 3px var(--oc-role-primary, #00677f); }
.map-pin img { width: 100%; height: 100%; object-fit: cover; border-radius: 5px; cursor: pointer; display: block; }
.map-pin-count {
  position: absolute; right: -4px; bottom: -4px;
  background-color: var(--oc-role-primary, #00677f); color: #fff;
  padding: 0 4px; border-radius: 5px; font-size: 0.8em; line-height: 1.4;
}
</style>
