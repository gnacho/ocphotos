<template>
  <div class="places-view">
    <div class="places-toolbar">
      <template v-if="!selected">
        <h1 v-text="$gettext('Places')" />
        <span class="places-count" v-text="placesLabel" />
      </template>
      <template v-else>
        <button class="places-icon-btn" :aria-label="$gettext('Back')" @click="closePlace">‹</button>
        <h1 v-text="selected.name || coords(selected)" />
        <span class="places-count" v-text="itemsLabel" />
      </template>
    </div>

    <div v-if="loading" class="places-note" v-text="$gettext('Loading…')" />

    <div v-else-if="selected" class="places-scroll">
      <div class="places-grid">
        <button v-for="p in selectedAssets" :key="p.id" class="places-photo" @click="openPhoto(selectedAssets, p)">
          <img :src="thumbSrc(p)" :alt="p.name" loading="lazy" @error="onImgError" />
        </button>
      </div>
    </div>

    <div v-else class="places-scroll">
      <div v-if="places.length === 0" class="places-note" v-text="$gettext('No photos with location data')" />
      <div v-else class="places-grid">
        <button v-for="pl in places" :key="`${pl.lat},${pl.lon}`" class="places-card" @click="openPlace(pl)">
          <img v-if="pl.coverId" :src="coverSrc(pl.coverId)" alt="" loading="lazy" @error="onImgError" />
          <span class="places-card-name" v-text="pl.name || coords(pl)" />
          <span class="places-card-count" v-text="String(pl.count)" />
        </button>
      </div>
    </div>

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
import { computed, defineComponent, onMounted, ref } from 'vue'
import { useGettext } from 'vue3-gettext'
import { usePhotoLibrary, Place, Photo } from '../composables/usePhotoLibrary'
import ViewerOverlay from '../components/ViewerOverlay.vue'

export default defineComponent({
  name: 'PlacesView',
  components: { ViewerOverlay },
  setup() {
    const { $gettext } = useGettext()
    const { fetchPlaces, placeAssets, ensurePreview, ensureOriginal, previews } = usePhotoLibrary()

    const placesLabel = computed(() => `${places.value.length} ${$gettext(places.value.length === 1 ? 'place' : 'places')}`)
    const itemsLabel = computed(() => `${selectedAssets.value.length} ${$gettext(selectedAssets.value.length === 1 ? 'item' : 'items')}`)

    const places = ref<Place[]>([])
    const loading = ref(true)
    const selected = ref<Place | null>(null)
    const selectedAssets = ref<Photo[]>([])
    const viewerList = ref<Photo[] | null>(null)
    const viewerIndex = ref(0)

    const thumbSrc = (p: Photo) => previews.value[`${p.id}|400`]
    const coverSrc = (id: number) => previews.value[`${id}|400`]
    const coords = (pl: Place) => `${pl.lat.toFixed(2)}, ${pl.lon.toFixed(2)}`

    const load = async () => {
      loading.value = true
      try {
        places.value = await fetchPlaces()
        for (const pl of places.value) if (pl.coverId) void ensurePreview({ id: pl.coverId } as Photo, 400)
      } finally {
        loading.value = false
      }
    }

    const openPlace = async (pl: Place) => {
      selected.value = pl
      selectedAssets.value = await placeAssets(pl.lat, pl.lon)
      for (const p of selectedAssets.value) void ensurePreview(p, 400)
    }

    const closePlace = () => {
      selected.value = null
      selectedAssets.value = []
    }

    const openPhoto = (list: Photo[], p: Photo) => {
      viewerList.value = list
      viewerIndex.value = list.indexOf(p)
    }

    const onImgError = (e: Event) => {
      const el = e.target as HTMLImageElement
      el.style.opacity = '0.15'
      el.onerror = null
    }

    onMounted(load)

    return {
      places, placesLabel, itemsLabel, loading, selected, selectedAssets, viewerList, viewerIndex,
      thumbSrc, coverSrc, coords, openPlace, closePlace, openPhoto, onImgError,
      ensurePreview, ensureOriginal
    }
  }
})
</script>

<style scoped>
.places-view { display: flex; flex-direction: column; height: 100%; }
.places-toolbar {
  display: flex; align-items: center; gap: 12px;
  padding: 8px 16px; border-bottom: 1px solid var(--oc-role-outline-variant, #bfc8cc);
}
.places-toolbar h1 { font-size: 1.1rem; font-weight: 600; margin: 0; }
.places-count { font-size: 0.8rem; color: var(--oc-role-on-surface-variant, #40484c); }
.places-icon-btn { border: 0; background: none; cursor: pointer; font-size: 1.4rem; line-height: 1; color: var(--oc-role-on-surface, #191c1d); }
.places-note { padding: 32px; text-align: center; color: var(--oc-role-on-surface-variant, #40484c); }
.places-scroll { flex: 1; overflow-y: auto; padding: 12px 16px; }
.places-grid { display: grid; gap: 10px; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); }
.places-card {
  position: relative; aspect-ratio: 1; padding: 0; border: 0; border-radius: 10px; cursor: pointer;
  overflow: hidden; background: var(--oc-role-surface-container, #f6f8fa);
}
.places-card img { width: 100%; height: 100%; object-fit: cover; display: block; }
.places-card-name {
  position: absolute; left: 8px; bottom: 20px; color: #fff; font-weight: 600; font-size: 0.9rem;
  text-shadow: 0 1px 5px rgba(0, 0, 0, 0.75);
}
.places-card-count {
  position: absolute; left: 8px; bottom: 5px; color: #ddd; font-size: 0.75rem;
  text-shadow: 0 1px 5px rgba(0, 0, 0, 0.75);
}
.places-photo { aspect-ratio: 1; padding: 0; border: 0; cursor: pointer; overflow: hidden; background: var(--oc-role-surface-container, #f6f8fa); }
.places-photo img { width: 100%; height: 100%; object-fit: cover; display: block; }
</style>
