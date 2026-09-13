<template>
  <div class="folders-view">
    <div class="folders-toolbar">
      <h1 v-text="$gettext('Folders')" />
      <nav class="folders-crumbs">
        <button class="folders-crumb" @click="go('')" v-text="$gettext('Personal space')" />
        <template v-for="(seg, i) in segments" :key="i">
          <span class="folders-sep">/</span>
          <button class="folders-crumb" @click="go(segments.slice(0, i + 1).join('/'))" v-text="seg" />
        </template>
      </nav>
    </div>

    <div v-if="loading" class="folders-note" v-text="$gettext('Loading…')" />

    <div v-else class="folders-scroll">
      <div v-if="folders.length" class="folders-sub">
        <h2 class="folders-subtitle" v-text="$gettext('Subfolders')" />
        <div class="folders-cards">
          <button v-for="f in folders" :key="f.path" class="folders-card" @click="go(f.path)">
            <oc-icon name="folder" size="medium" />
            <span class="folders-card-name" v-text="f.name" />
            <span class="folders-card-count" v-text="String(f.count)" />
          </button>
        </div>
      </div>

      <div v-if="assets.length" class="folders-grid">
        <button v-for="p in assets" :key="p.id" class="folders-photo" @click="openPhoto(p)">
          <img :src="thumbSrc(p)" :alt="p.name" loading="lazy" @error="onImgError" />
          <span v-if="p.isVideo" class="folders-badge">▶</span>
        </button>
      </div>

      <p v-if="!folders.length && !assets.length" class="folders-note" v-text="$gettext('No photos in this folder')" />
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
import { usePhotoLibrary, FolderEntry, Photo } from '../composables/usePhotoLibrary'
import ViewerOverlay from '../components/ViewerOverlay.vue'

export default defineComponent({
  name: 'FoldersView',
  components: { ViewerOverlay },
  setup() {
    const { fetchFolder, ensurePreview, ensureOriginal, previews } = usePhotoLibrary()

    const loading = ref(true)
    const cwd = ref('')
    const folders = ref<FolderEntry[]>([])
    const assets = ref<Photo[]>([])
    const viewerList = ref<Photo[] | null>(null)
    const viewerIndex = ref(0)

    const segments = computed(() => cwd.value.split('/').filter(Boolean))
    const thumbSrc = (p: Photo) => previews.value[`${p.id}|400`]

    const load = async (path: string) => {
      loading.value = true
      cwd.value = path
      try {
        const listing = await fetchFolder(path)
        folders.value = listing.folders
        assets.value = listing.assets
        for (const p of assets.value) void ensurePreview(p, 400)
      } finally {
        loading.value = false
      }
    }

    const go = (path: string): void => {
      void load(path)
    }

    const openPhoto = (p: Photo) => {
      viewerList.value = assets.value
      viewerIndex.value = assets.value.indexOf(p)
    }

    const onImgError = (e: Event) => {
      const el = e.target as HTMLImageElement
      el.style.opacity = '0.15'
      el.onerror = null
    }

    onMounted((): void => {
      void load('')
    })

    return {
      loading, folders, assets, segments, viewerList, viewerIndex,
      thumbSrc, go, openPhoto, onImgError, ensurePreview, ensureOriginal
    }
  }
})
</script>

<style scoped>
.folders-view { display: flex; flex-direction: column; height: 100%; }
.folders-toolbar {
  display: flex; align-items: center; gap: 16px; flex-wrap: wrap;
  padding: 8px 16px; border-bottom: 1px solid var(--oc-role-outline-variant, #bfc8cc);
}
.folders-toolbar h1 { font-size: 1.1rem; font-weight: 600; margin: 0; }
.folders-crumbs { display: flex; align-items: center; gap: 2px; font-size: 0.85rem; }
.folders-crumb { border: 0; background: none; cursor: pointer; color: var(--oc-role-primary, #00677f); padding: 0 2px; }
.folders-sep { color: var(--oc-role-on-surface-variant, #40484c); }
.folders-note { padding: 32px; text-align: center; color: var(--oc-role-on-surface-variant, #40484c); }
.folders-scroll { flex: 1; overflow-y: auto; padding: 12px 16px; }
.folders-subtitle { margin: 0 0 8px; font-size: 0.9rem; font-weight: 600; }
.folders-cards { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 16px; }
.folders-card {
  display: inline-flex; align-items: center; gap: 8px; padding: 10px 14px; cursor: pointer;
  border-radius: 10px; font-size: 0.9rem;
  border: 1px solid var(--oc-role-outline-variant, #bfc8cc);
  background: var(--oc-role-surface, #fff); color: var(--oc-role-on-surface, #191c1d);
}
.folders-card:hover { background: var(--oc-role-surface-container, #f6f8fa); }
.folders-card-count { color: var(--oc-role-on-surface-variant, #40484c); font-size: 0.8rem; }
.folders-grid { display: grid; gap: 3px; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); }
.folders-photo { position: relative; aspect-ratio: 1; padding: 0; border: 0; cursor: pointer; overflow: hidden; background: var(--oc-role-surface-container, #f6f8fa); }
.folders-photo img { width: 100%; height: 100%; object-fit: cover; display: block; }
.folders-badge {
  position: absolute; right: 4px; bottom: 4px; font-size: 0.7rem; color: #fff;
  background: rgba(0, 0, 0, 0.55); border-radius: 4px; padding: 1px 6px;
}
</style>
