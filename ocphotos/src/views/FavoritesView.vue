<template>
  <div class="fav-view">
    <div class="fav-toolbar">
      <h1 v-text="$gettext('Favorites')" />
      <span class="fav-count" v-text="$gettext('%{n} items', { n: photos.length })" />
      <nav class="fav-nav">
        <router-link to="/ocphotos/timeline" v-text="$gettext('Photos')" />
        <router-link to="/ocphotos/memories" v-text="$gettext('Memories')" />
        <router-link to="/ocphotos/map" v-text="$gettext('Map')" />
      </nav>
    </div>

    <div v-if="loading" class="fav-note" v-text="$gettext('Loading…')" />
    <div v-else-if="photos.length === 0" class="fav-note" v-text="$gettext('No favorites yet')" />

    <div v-else class="fav-scroll">
      <div class="fav-grid">
        <button v-for="(p, i) in photos" :key="p.id" class="fav-cell" @click="openViewer(i)">
          <img :src="thumbSrc(p)" :alt="p.name" loading="lazy" @error="onImgError" />
          <span v-if="p.isVideo" class="fav-video-badge">▶</span>
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
import { defineComponent, onMounted, ref, watch } from 'vue'
import { usePhotoLibrary, Photo } from '../composables/usePhotoLibrary'
import ViewerOverlay from '../components/ViewerOverlay.vue'

export default defineComponent({
  name: 'FavoritesView',
  components: { ViewerOverlay },
  setup() {
    const { fetchFavorites, ensurePreview, ensureOriginal, previews, openPreview } = usePhotoLibrary()
    const loading = ref(true)
    const photos = ref<Photo[]>([])
    const viewerList = ref<Photo[] | null>(null)
    const viewerIndex = ref(0)

    const thumbSrc = (p: Photo) => previews.value[`${p.id}|400`]

    const openViewer = (i: number) => {
      if (openPreview(photos.value[i])) return
      viewerList.value = photos.value
      viewerIndex.value = i
    }

    watch(
      photos,
      (list) => {
        for (const p of list) void ensurePreview(p, 400)
      },
      { immediate: true }
    )

    const onImgError = (e: Event) => {
      const el = e.target as HTMLImageElement
      el.style.opacity = '0.15'
      el.onerror = null
    }

    onMounted(async () => {
      try {
        photos.value = await fetchFavorites()
      } finally {
        loading.value = false
      }
    })

    return { loading, photos, viewerList, viewerIndex, openViewer, thumbSrc, onImgError, ensurePreview, ensureOriginal }
  }
})
</script>

<style scoped>
.fav-view { display: flex; flex-direction: column; height: 100%; }
.fav-toolbar {
  display: flex; align-items: center; gap: 16px;
  padding: 8px 16px; border-bottom: 1px solid var(--oc-role-outline-variant, #bfc8cc);
}
.fav-toolbar h1 { font-size: 1.1rem; font-weight: 600; margin: 0; }
.fav-count { font-size: 0.8rem; color: var(--oc-role-on-surface-variant, #40484c); }
.fav-nav { margin-left: auto; display: flex; gap: 16px; font-size: 0.85rem; }
.fav-note { padding: 32px; text-align: center; color: var(--oc-role-on-surface-variant, #40484c); }
.fav-scroll { flex: 1; overflow-y: auto; padding: 0 8px; }
.fav-grid { display: grid; gap: 3px; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); }
.fav-cell {
  position: relative; aspect-ratio: 1; padding: 0; border: 0; cursor: pointer;
  background: var(--oc-role-surface-container, #f6f8fa); overflow: hidden;
}
.fav-cell img { width: 100%; height: 100%; object-fit: cover; display: block; }
.fav-video-badge {
  position: absolute; right: 4px; bottom: 4px; font-size: 0.7rem; color: #fff;
  background: rgba(0, 0, 0, 0.55); border-radius: 4px; padding: 1px 6px;
}
</style>
