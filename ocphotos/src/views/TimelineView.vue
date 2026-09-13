<template>
  <div class="photos-view">
    <div class="photos-toolbar">
      <h1 class="photos-title" v-text="$gettext('Photos')" />
      <span v-if="loading" class="photos-progress" v-text="$gettext('Loading…')" />
      <span v-else class="photos-count" v-text="$gettext('%{n} items', { n: photos.length })" />
      <oc-button appearance="raw" :aria-label="$gettext('Rescan')" @click="rescan">
        <oc-icon name="refresh" size="small" />
      </oc-button>
      <nav class="photos-nav">
        <router-link to="/ocphotos/memories" v-text="$gettext('Memories')" />
        <router-link to="/ocphotos/map" v-text="$gettext('Map')" />
        <router-link to="/ocphotos/favorites" v-text="$gettext('Favorites')" />
      </nav>
    </div>

    <div v-if="error" class="photos-error" v-text="error" />
    <div v-else-if="!loading && photos.length === 0" class="photos-empty">
      <p v-text="$gettext('No photos yet')" />
    </div>

    <div v-else class="photos-scroll">
      <section v-for="day in visibleDays" :key="day.key" class="photos-day">
        <h3 class="photos-day-header">{{ formatDay(day.date) }} <span>{{ day.photos.length }}</span></h3>
        <div class="photos-grid">
          <button
            v-for="p in day.photos"
            :key="p.id"
            class="photos-cell"
            @click="openViewer(day.photos, p)"
          >
            <img :src="thumbSrc(p)" :alt="p.name" loading="lazy" @error="onImgError" />
            <span v-if="p.isVideo" class="photos-video-badge">▶</span>
          </button>
        </div>
      </section>
      <div ref="sentinel" class="photos-sentinel" />
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
import { computed, defineComponent, onMounted, ref, watch } from 'vue'
import { usePhotoLibrary, Photo } from '../composables/usePhotoLibrary'
import ViewerOverlay from '../components/ViewerOverlay.vue'

export default defineComponent({
  name: 'TimelineView',
  components: { ViewerOverlay },
  setup() {
    const { photos, loading, error, days, exhausted, init, loadMore, rescan, previews, ensurePreview, ensureOriginal, openPreview } =
      usePhotoLibrary()

    const sentinel = ref<HTMLElement | null>(null)
    const visibleDays = computed(() => days.value)

    const thumbSrc = (p: Photo) => previews.value[`${p.id}|400`]

    watch(
      visibleDays,
      (list) => {
        for (const day of list) for (const p of day.photos) void ensurePreview(p, 400)
      },
      { immediate: true }
    )

    const viewerList = ref<Photo[] | null>(null)
    const viewerIndex = ref(0)
    // formatos que el host sabe previsualizar -> visor nativo; HEIC/RAW -> el propio
    const openViewer = (list: Photo[], p: Photo) => {
      if (openPreview(p)) return
      viewerList.value = list
      viewerIndex.value = list.indexOf(p)
    }

    const formatDay = (d: Date) =>
      new Intl.DateTimeFormat(navigator.language || 'en', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(d)

    const onImgError = (e: Event) => {
      const el = e.target as HTMLImageElement
      el.style.opacity = '0.15'
      el.onerror = null
    }

    onMounted(async () => {
      await init()
      const obs = new IntersectionObserver(
        (entries) => {
          if (entries[0].isIntersecting && !exhausted.value) void loadMore()
        },
        { rootMargin: '1500px' }
      )
      if (sentinel.value) obs.observe(sentinel.value)
    })

    return {
      photos, loading, error, visibleDays, sentinel,
      viewerList, viewerIndex, openViewer, formatDay, onImgError,
      rescan, thumbSrc, ensurePreview, ensureOriginal
    }
  }
})
</script>

<style scoped>
.photos-view { display: flex; flex-direction: column; height: 100%; }
.photos-toolbar {
  display: flex; align-items: center; gap: 16px;
  padding: 8px 16px; border-bottom: 1px solid var(--oc-role-outline-variant, #bfc8cc);
}
.photos-title { font-size: 1.1rem; font-weight: 600; margin: 0; }
.photos-progress, .photos-count { font-size: 0.8rem; color: var(--oc-role-on-surface-variant, #40484c); }
.photos-nav { margin-left: auto; display: flex; gap: 16px; font-size: 0.85rem; }
.photos-error { padding: 16px; color: var(--oc-role-error, #ba1a1a); }
.photos-empty {
  display: flex; flex-direction: column; align-items: center; gap: 8px;
  padding: 32px; text-align: center; color: var(--oc-role-on-surface-variant, #40484c);
}
.photos-empty p { margin: 0; }
.photos-scroll { flex: 1; overflow-y: auto; padding: 0 8px; }
.photos-day-header {
  position: sticky; top: 0; z-index: 1; margin: 0; padding: 8px 0;
  font-size: 0.8rem; font-weight: 500; text-transform: capitalize;
  background: var(--oc-role-surface, #fff);
}
.photos-day-header span { color: var(--oc-role-on-surface-variant, #40484c); margin-left: 0.5em; }
.photos-grid {
  display: grid; gap: 3px;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
}
.photos-cell {
  position: relative; aspect-ratio: 1; padding: 0; border: 0; cursor: pointer;
  background: var(--oc-role-surface-container, #f6f8fa); overflow: hidden;
}
.photos-cell img { width: 100%; height: 100%; object-fit: cover; display: block; }
.photos-video-badge {
  position: absolute; right: 4px; bottom: 4px; font-size: 0.7rem; color: #fff;
  background: rgba(0, 0, 0, 0.55); border-radius: 4px; padding: 1px 6px;
}
.photos-sentinel { height: 1px; }
</style>
