<template>
  <div class="photos-view">
    <div class="photos-toolbar">
      <h1 class="photos-title" v-text="$gettext('Fotos')" />
      <span v-if="loading" class="photos-progress" v-text="progress || $gettext('Indexando…')" />
      <span v-else class="photos-count" v-text="$gettext('%{n} elementos', { n: photos.length })" />
      <oc-button appearance="raw" :aria-label="$gettext('Reescanear')" @click="rescan(rootPath)">
        <oc-icon name="refresh" size="small" />
      </oc-button>
      <router-link :to="{ name: 'photos-memories' }" class="photos-nav" v-text="$gettext('Recuerdos')" />
    </div>

    <div v-if="error" class="photos-error" v-text="error" />
    <div v-else-if="!loading && photos.length === 0" class="photos-empty">
      <p v-text="$gettext('No se han encontrado fotos en %{root}', { root: rootPath })" />
      <p class="photos-empty-hint" v-text="$gettext('Configura SCAN_ROOT cambiando rootPath en TimelineView.vue')" />
    </div>

    <div v-else class="photos-scroll">
      <section v-for="day in visibleDays" :key="day.key" class="photos-day">
        <h3 class="photos-day-header">{{ formatDay(day.date) }} <span>{{ day.photos.length }}</span></h3>
        <div class="photos-grid">
          <button
            v-for="p in day.photos"
            :key="p.path"
            class="photos-cell"
            @click="openViewer(day.photos, p)"
          >
            <img :src="previewUrl(p, 400)" :alt="p.name" loading="lazy" @error="onImgError" />
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
      :preview-url="previewUrl"
      :file-url="fileUrl"
      @close="viewerList = null"
      @navigate="viewerIndex = $event"
    />
  </div>
</template>

<script lang="ts">
import { computed, defineComponent, onMounted, ref } from 'vue'
import { usePhotoLibrary, Photo } from '../composables/usePhotoLibrary'
import ViewerOverlay from '../components/ViewerOverlay.vue'

const PAGE_DAYS = 14

export default defineComponent({
  name: 'TimelineView',
  components: { ViewerOverlay },
  setup() {
    const { photos, loading, progress, error, days, init, rescan, previewUrl, fileUrl } = usePhotoLibrary()
    // carpeta raíz dentro del espacio personal (equivale a SCAN_ROOT del backend)
    const rootPath = '/Fotos'

    const dayCount = ref(PAGE_DAYS)
    const sentinel = ref<HTMLElement | null>(null)
    const visibleDays = computed(() => days.value.slice(0, dayCount.value))

    const viewerList = ref<Photo[] | null>(null)
    const viewerIndex = ref(0)
    const openViewer = (list: Photo[], p: Photo) => {
      viewerList.value = list
      viewerIndex.value = list.indexOf(p)
    }

    const formatDay = (d: Date) =>
      new Intl.DateTimeFormat('es', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(d)

    const onImgError = (e: Event) => {
      // formatos sin preview (HEIC/RAW): placeholder neutro
      const el = e.target as HTMLImageElement
      el.style.opacity = '0.15'
      el.onerror = null
    }

    onMounted(async () => {
      await init(rootPath)
      const obs = new IntersectionObserver(
        (entries) => {
          if (entries[0].isIntersecting && dayCount.value < days.value.length) dayCount.value += PAGE_DAYS
        },
        { rootMargin: '1500px' }
      )
      if (sentinel.value) obs.observe(sentinel.value)
    })

    return {
      photos, loading, progress, error, visibleDays, sentinel,
      viewerList, viewerIndex, openViewer, formatDay, onImgError,
      rescan, rootPath, previewUrl, fileUrl
    }
  }
})
</script>

<style scoped>
.photos-view { display: flex; flex-direction: column; height: 100%; }
.photos-toolbar {
  display: flex; align-items: center; gap: var(--oc-space-medium);
  padding: var(--oc-space-small) var(--oc-space-medium);
  border-bottom: 1px solid var(--oc-color-border);
}
.photos-title { font-size: 1.1rem; font-weight: 600; margin: 0; }
.photos-progress, .photos-count { font-size: 0.8rem; color: var(--oc-color-text-muted); }
.photos-nav { margin-left: auto; font-size: 0.85rem; }
.photos-error { padding: var(--oc-space-medium); color: var(--oc-color-swatch-danger-default); }
.photos-empty { padding: var(--oc-space-xlarge); text-align: center; color: var(--oc-color-text-muted); }
.photos-empty-hint { font-size: 0.75rem; }
.photos-scroll { flex: 1; overflow-y: auto; padding: 0 var(--oc-space-small); }
.photos-day-header {
  position: sticky; top: 0; z-index: 1; margin: 0; padding: var(--oc-space-small) 0;
  font-size: 0.8rem; font-weight: 500; text-transform: capitalize;
  background: var(--oc-color-background-default);
}
.photos-day-header span { color: var(--oc-color-text-muted); margin-left: 0.5em; }
.photos-grid {
  display: grid; gap: 2px;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
}
.photos-cell {
  position: relative; aspect-ratio: 1; padding: 0; border: 0; cursor: pointer;
  background: var(--oc-color-background-muted); overflow: hidden;
}
.photos-cell img { width: 100%; height: 100%; object-fit: cover; display: block; }
.photos-video-badge {
  position: absolute; right: 4px; bottom: 4px; font-size: 0.7rem; color: #fff;
  background: rgba(0, 0, 0, 0.55); border-radius: 4px; padding: 1px 6px;
}
.photos-sentinel { height: 1px; }
</style>
