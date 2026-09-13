<template>
  <div class="map-view">
    <div class="map-toolbar">
      <h1 v-text="$gettext('Map')" />
      <span class="map-count" v-text="$gettext('%{n} located', { n: photos.length })" />
      <nav class="map-nav">
        <router-link to="/ocphotos/timeline" v-text="$gettext('Photos')" />
        <router-link to="/ocphotos/memories" v-text="$gettext('Memories')" />
        <router-link to="/ocphotos/favorites" v-text="$gettext('Favorites')" />
      </nav>
    </div>

    <div v-if="loading" class="map-note" v-text="$gettext('Loading…')" />
    <div v-else-if="photos.length === 0" class="map-note" v-text="$gettext('No photos with location data')" />
    <div v-show="photos.length > 0" ref="mapEl" class="map-canvas" />

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
import { defineComponent, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { usePhotoLibrary, Photo } from '../composables/usePhotoLibrary'
import ViewerOverlay from '../components/ViewerOverlay.vue'

export default defineComponent({
  name: 'MapView',
  components: { ViewerOverlay },
  setup() {
    const { fetchGeo, ensurePreview, ensureOriginal, openPreview } = usePhotoLibrary()
    const loading = ref(true)
    const photos = ref<Photo[]>([])
    const mapEl = ref<HTMLElement | null>(null)
    let map: L.Map | null = null

    const viewerList = ref<Photo[] | null>(null)
    const viewerIndex = ref(0)

    const render = async () => {
      await nextTick()
      if (!mapEl.value || photos.value.length === 0) return
      map = L.map(mapEl.value, { worldCopyJump: true })
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap'
      }).addTo(map)

      const bounds = L.latLngBounds([])
      photos.value.forEach((p, i) => {
        if (p.lat == null || p.lon == null) return
        const ll = L.latLng(p.lat, p.lon)
        bounds.extend(ll)
        L.circleMarker(ll, {
          radius: 6,
          color: '#00677f',
          weight: 2,
          fillColor: '#0ea5e9',
          fillOpacity: 0.85
        })
          .addTo(map!)
          .on('click', () => {
            const p = photos.value[i]
            if (openPreview(p)) return
            viewerList.value = photos.value
            viewerIndex.value = i
          })
          .bindTooltip(p.name)
      })
      if (bounds.isValid()) map.fitBounds(bounds, { maxZoom: 12, padding: [40, 40] })
      else map.setView([40.4, -3.7], 5)
    }

    onMounted(async () => {
      try {
        photos.value = await fetchGeo()
      } finally {
        loading.value = false
      }
      await render()
    })

    onBeforeUnmount(() => {
      map?.remove()
      map = null
    })

    return { loading, photos, mapEl, viewerList, viewerIndex, ensurePreview, ensureOriginal }
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
.map-nav { margin-left: auto; display: flex; gap: 16px; font-size: 0.85rem; }
.map-note { padding: 32px; text-align: center; color: var(--oc-role-on-surface-variant, #40484c); }
.map-canvas { flex: 1; min-height: 0; }
</style>
