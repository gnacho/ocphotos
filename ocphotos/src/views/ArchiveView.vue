<template>
  <div class="arch-view">
    <div class="arch-toolbar">
      <h1 v-text="$gettext('Archive')" />
      <span class="arch-count" v-text="itemsLabel" />
    </div>

    <div v-if="loading" class="arch-note" v-text="$gettext('Loading…')" />
    <div v-else-if="photos.length === 0" class="arch-note" v-text="$gettext('Nothing archived')" />

    <div v-else class="arch-scroll">
      <div class="arch-grid">
        <div v-for="p in photos" :key="p.id" class="arch-cell">
          <button class="arch-photo" @click="openViewer(p)">
            <img :src="thumbSrc(p)" :alt="p.name" loading="lazy" @error="onImgError" />
          </button>
          <button class="arch-restore" :title="$gettext('Unarchive')" @click="unarchive(p)">↩</button>
        </div>
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
import { computed, defineComponent, onMounted, ref, watch } from 'vue'
import { useGettext } from 'vue3-gettext'
import { usePhotoLibrary, Photo } from '../composables/usePhotoLibrary'
import ViewerOverlay from '../components/ViewerOverlay.vue'

export default defineComponent({
  name: 'ArchiveView',
  components: { ViewerOverlay },
  setup() {
    const { $gettext } = useGettext()
    const { fetchArchived, setArchived, ensurePreview, ensureOriginal, previews } = usePhotoLibrary()
    const loading = ref(true)
    const photos = ref<Photo[]>([])
    const viewerList = ref<Photo[] | null>(null)
    const viewerIndex = ref(0)

    const itemsLabel = computed(() => `${photos.value.length} ${$gettext(photos.value.length === 1 ? 'item' : 'items')}`)
    const thumbSrc = (p: Photo) => previews.value[`${p.id}|400`]

    const load = async () => {
      loading.value = true
      try {
        photos.value = await fetchArchived()
      } finally {
        loading.value = false
      }
    }

    const unarchive = async (p: Photo) => {
      await setArchived(p.id, false)
      photos.value = photos.value.filter((x) => x.id !== p.id)
    }

    const openViewer = (p: Photo) => {
      viewerList.value = photos.value
      viewerIndex.value = photos.value.indexOf(p)
    }

    const onImgError = (e: Event) => {
      const el = e.target as HTMLImageElement
      el.style.opacity = '0.15'
      el.onerror = null
    }

    watch(photos, (list) => {
      for (const p of list) void ensurePreview(p, 400)
    }, { immediate: true })

    onMounted(load)

    return { loading, photos, itemsLabel, viewerList, viewerIndex, thumbSrc, unarchive, openViewer, onImgError, ensurePreview, ensureOriginal }
  }
})
</script>

<style scoped>
.arch-view { display: flex; flex-direction: column; height: 100%; }
.arch-toolbar { display: flex; align-items: center; gap: 16px; padding: 8px 16px; border-bottom: 1px solid var(--oc-role-outline-variant, #bfc8cc); }
.arch-toolbar h1 { font-size: 1.1rem; font-weight: 600; margin: 0; }
.arch-count { font-size: 0.8rem; color: var(--oc-role-on-surface-variant, #40484c); }
.arch-note { padding: 32px; text-align: center; color: var(--oc-role-on-surface-variant, #40484c); }
.arch-scroll { flex: 1; overflow-y: auto; padding: 12px 16px; }
.arch-grid { display: grid; gap: 3px; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); }
.arch-cell { position: relative; aspect-ratio: 1; }
.arch-photo { width: 100%; height: 100%; padding: 0; border: 0; cursor: pointer; overflow: hidden; background: var(--oc-role-surface-container, #f6f8fa); }
.arch-photo img { width: 100%; height: 100%; object-fit: cover; display: block; }
.arch-restore {
  position: absolute; top: 4px; right: 4px; width: 26px; height: 26px; border: 0; border-radius: 50%;
  cursor: pointer; background: rgba(0, 0, 0, 0.55); color: #fff; font-size: 0.9rem; line-height: 1;
}
</style>
