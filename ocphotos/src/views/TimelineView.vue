<template>
  <div class="photos-view">
    <div class="photos-toolbar">
      <h1 class="photos-title" v-text="$gettext('Fotos')" />
      <button class="photos-folder" :title="$gettext('Cambiar carpeta')" @click="pickerOpen = true">
        <oc-icon name="folder" size="small" />
        <span v-text="rootLabel" />
      </button>
      <span v-if="loading" class="photos-progress" v-text="progress || $gettext('Indexando…')" />
      <span v-else class="photos-count" v-text="$gettext('%{n} elementos', { n: photos.length })" />
      <oc-button appearance="raw" :aria-label="$gettext('Reescanear')" @click="rescan(root)">
        <oc-icon name="refresh" size="small" />
      </oc-button>
      <router-link to="/ocphotos/memories" class="photos-nav" v-text="$gettext('Recuerdos')" />
    </div>

    <div v-if="error" class="photos-error" v-text="error" />
    <div v-else-if="!loading && photos.length === 0" class="photos-empty">
      <p v-if="rootMissing" v-text="$gettext('La carpeta %{root} no existe en tu espacio', { root: rootLabel })" />
      <p v-else v-text="$gettext('No hay fotos en %{root}', { root: rootLabel })" />
      <oc-button appearance="filled" color-role="primary" @click="pickerOpen = true">
        {{ $gettext('Elegir carpeta') }}
      </oc-button>
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

    <folder-picker
      v-if="pickerOpen"
      :current="root"
      @close="pickerOpen = false"
      @select="onSelectFolder"
    />
  </div>
</template>

<script lang="ts">
import { computed, defineComponent, onMounted, ref, watch } from 'vue'
import { usePhotoLibrary, Photo } from '../composables/usePhotoLibrary'
import ViewerOverlay from '../components/ViewerOverlay.vue'
import FolderPicker from '../components/FolderPicker.vue'

const PAGE_DAYS = 14

export default defineComponent({
  name: 'TimelineView',
  components: { ViewerOverlay, FolderPicker },
  setup() {
    const { photos, loading, progress, error, days, root, rootMissing, init, setRoot, rescan, previews, ensurePreview, ensureOriginal } =
      usePhotoLibrary()

    const rootLabel = computed(() => root.value || '/')
    const pickerOpen = ref(false)
    const onSelectFolder = async (path: string) => {
      pickerOpen.value = false
      await setRoot(path)
    }

    const dayCount = ref(PAGE_DAYS)
    const sentinel = ref<HTMLElement | null>(null)
    const visibleDays = computed(() => days.value.slice(0, dayCount.value))

    const thumbKey = (p: Photo) => `${p.path}|400|thumbnail`
    const thumbSrc = (p: Photo) => previews.value[thumbKey(p)]

    // carga perezosa de miniaturas: solo lo visible (y crece con el scroll)
    watch(
      visibleDays,
      (list) => {
        for (const day of list) for (const p of day.photos) void ensurePreview(p, 400, 'thumbnail')
      },
      { immediate: true }
    )

    const viewerList = ref<Photo[] | null>(null)
    const viewerIndex = ref(0)
    const openViewer = (list: Photo[], p: Photo) => {
      viewerList.value = list
      viewerIndex.value = list.indexOf(p)
    }

    const formatDay = (d: Date) =>
      new Intl.DateTimeFormat('es', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(d)

    const onImgError = (e: Event) => {
      // formatos sin preview (HEIC/RAW/vídeo): placeholder neutro
      const el = e.target as HTMLImageElement
      el.style.opacity = '0.15'
      el.onerror = null
    }

    onMounted(async () => {
      await init()
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
      rescan, root, rootMissing, rootLabel, pickerOpen, onSelectFolder,
      thumbSrc, ensurePreview, ensureOriginal
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
.photos-folder {
  display: inline-flex; align-items: center; gap: 6px; max-width: 40%;
  padding: 2px 8px; border: 1px solid var(--oc-color-border); border-radius: 6px;
  background: none; color: var(--oc-color-text-muted); cursor: pointer; font-size: 0.8rem;
}
.photos-folder span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.photos-folder:hover { background: var(--oc-color-background-muted); }
.photos-progress, .photos-count { font-size: 0.8rem; color: var(--oc-color-text-muted); }
.photos-nav { margin-left: auto; font-size: 0.85rem; }
.photos-error { padding: var(--oc-space-medium); color: var(--oc-color-swatch-danger-default); }
.photos-empty {
  display: flex; flex-direction: column; align-items: center; gap: var(--oc-space-small);
  padding: var(--oc-space-xlarge); text-align: center; color: var(--oc-color-text-muted);
}
.photos-empty p { margin: 0; }
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
