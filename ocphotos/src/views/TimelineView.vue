<template>
  <div class="photos-view">
    <div class="photos-toolbar">
      <h1 class="photos-title" v-text="$gettext('Photos')" />
      <button class="photos-folder" :title="$gettext('Change folder')" @click="pickerOpen = true">
        <oc-icon name="folder" size="small" />
        <span v-text="rootLabel" />
      </button>
      <span v-if="loading" class="photos-progress" v-text="progress || $gettext('Indexing…')" />
      <span v-else class="photos-count" v-text="$gettext('%{n} items', { n: photos.length })" />
      <oc-button appearance="raw" :aria-label="$gettext('Rescan')" @click="rescan(root)">
        <oc-icon name="refresh" size="small" />
      </oc-button>
      <router-link to="/ocphotos/memories" class="photos-nav" v-text="$gettext('Memories')" />
    </div>

    <div v-if="fallbackFrom && !loading" class="photos-banner">
      <span v-text="$gettext('Folder %{root} does not exist; showing the whole personal space.', { root: fallbackFrom })" />
      <oc-button appearance="raw" @click="pickerOpen = true">{{ $gettext('Choose folder') }}</oc-button>
    </div>

    <div v-if="error" class="photos-error" v-text="error" />
    <div v-else-if="!loading && photos.length === 0" class="photos-empty">
      <p v-if="rootMissing" v-text="$gettext('Folder %{root} does not exist in your space', { root: rootLabel })" />
      <p v-else v-text="$gettext('No photos in %{root}', { root: rootLabel })" />
      <oc-button appearance="filled" color-role="primary" @click="pickerOpen = true">
        {{ $gettext('Choose folder') }}
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
import { useGettext } from 'vue3-gettext'
import { usePhotoLibrary, Photo } from '../composables/usePhotoLibrary'
import ViewerOverlay from '../components/ViewerOverlay.vue'
import FolderPicker from '../components/FolderPicker.vue'

const PAGE_DAYS = 14

export default defineComponent({
  name: 'TimelineView',
  components: { ViewerOverlay, FolderPicker },
  setup() {
    const { $gettext } = useGettext()
    const { photos, loading, progress, error, days, root, rootMissing, fallbackFrom, init, setRoot, rescan, previews, ensurePreview, ensureOriginal } =
      usePhotoLibrary()

    const rootLabel = computed(() => root.value || $gettext('whole space'))
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
      new Intl.DateTimeFormat(navigator.language || 'en', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(d)

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
      rescan, root, rootMissing, fallbackFrom, rootLabel, pickerOpen, onSelectFolder,
      thumbSrc, ensurePreview, ensureOriginal
    }
  }
})
</script>

<style scoped>
.photos-view { display: flex; flex-direction: column; height: 100%; }
.photos-toolbar {
  display: flex; align-items: center; gap: 16px;
  padding: 8px 16px;
  border-bottom: 1px solid var(--oc-role-outline-variant, #bfc8cc);
}
.photos-title { font-size: 1.1rem; font-weight: 600; margin: 0; }
.photos-folder {
  display: inline-flex; align-items: center; gap: 6px; max-width: 40%;
  padding: 2px 8px; border: 1px solid var(--oc-role-outline-variant, #bfc8cc); border-radius: 6px;
  background: none; color: var(--oc-role-on-surface-variant, #40484c); cursor: pointer; font-size: 0.8rem;
}
.photos-folder span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.photos-folder:hover { background: var(--oc-role-surface-container, #f6f8fa); }
.photos-progress, .photos-count { font-size: 0.8rem; color: var(--oc-role-on-surface-variant, #40484c); }
.photos-nav { margin-left: auto; font-size: 0.85rem; }
.photos-banner {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  padding: 8px 16px; font-size: 0.85rem;
  background: var(--oc-role-surface-container, #f6f8fa); color: var(--oc-role-on-surface-variant, #40484c);
}
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
  display: grid; gap: 2px;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
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
