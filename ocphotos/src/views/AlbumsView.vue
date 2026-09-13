<template>
  <div class="albums-view">
    <div class="albums-toolbar">
      <template v-if="!selected">
        <h1 v-text="$gettext('Albums')" />
        <span class="albums-count" v-text="$gettext('%{n} albums', { n: albums.length })" />
        <button class="albums-btn" @click="startCreate" v-text="$gettext('New album')" />
      </template>
      <template v-else>
        <button class="albums-icon-btn" :aria-label="$gettext('Back')" @click="closeAlbum">‹</button>
        <h1 v-text="selected.name" />
        <span class="albums-count" v-text="$gettext('%{n} items', { n: selectedAssets.length })" />
        <button class="albums-btn" @click="startRename" v-text="$gettext('Rename')" />
        <button class="albums-btn" @click="doDelete" v-text="$gettext('Delete')" />
      </template>
    </div>

    <form v-if="dialog" class="albums-dialog" @submit.prevent="confirmDialog">
      <input v-model="dialogName" class="albums-input" :placeholder="$gettext('Album name')" />
      <button type="submit" class="albums-btn albums-btn-primary" v-text="$gettext('Save')" />
      <button type="button" class="albums-btn" @click="dialog = null" v-text="$gettext('Cancel')" />
    </form>

    <div v-if="loading" class="albums-note" v-text="$gettext('Loading…')" />

    <div v-else-if="selected" class="albums-scroll">
      <div v-if="selectedAssets.length === 0" class="albums-note" v-text="$gettext('This album is empty')" />
      <div v-else class="albums-grid">
        <div v-for="p in selectedAssets" :key="p.id" class="albums-cell">
          <button class="albums-photo" @click="openPhoto(selectedAssets, p)">
            <img :src="thumbSrc(p)" :alt="p.name" loading="lazy" @error="onImgError" />
          </button>
          <button class="albums-remove" :title="$gettext('Remove from album')" @click="remove(p)">×</button>
        </div>
      </div>
    </div>

    <div v-else class="albums-scroll">
      <div v-if="albums.length === 0" class="albums-note" v-text="$gettext('No albums yet')" />
      <div v-else class="albums-grid">
        <button v-for="a in albums" :key="a.id" class="albums-card" @click="openAlbum(a)">
          <img v-if="a.coverId" :src="coverSrc(a.coverId)" alt="" loading="lazy" @error="onImgError" />
          <span class="albums-card-name" v-text="a.name" />
          <span class="albums-card-count" v-text="String(a.count)" />
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
import { defineComponent, onMounted, ref } from 'vue'
import { usePhotoLibrary, Album, Photo } from '../composables/usePhotoLibrary'
import ViewerOverlay from '../components/ViewerOverlay.vue'

export default defineComponent({
  name: 'AlbumsView',
  components: { ViewerOverlay },
  setup() {
    const { fetchAlbums, createAlbum, renameAlbum, deleteAlbum, albumAssets, removeFromAlbum, ensurePreview, ensureOriginal, previews } =
      usePhotoLibrary()

    const albums = ref<Album[]>([])
    const loading = ref(true)
    const selected = ref<Album | null>(null)
    const selectedAssets = ref<Photo[]>([])
    const dialog = ref<'create' | 'rename' | null>(null)
    const dialogName = ref('')
    const viewerList = ref<Photo[] | null>(null)
    const viewerIndex = ref(0)

    const thumbSrc = (p: Photo) => previews.value[`${p.id}|400`]
    const coverSrc = (id: number) => previews.value[`${id}|400`]

    const load = async () => {
      loading.value = true
      try {
        albums.value = await fetchAlbums()
        for (const a of albums.value) if (a.coverId) void ensurePreview({ id: a.coverId } as Photo, 400)
      } finally {
        loading.value = false
      }
    }

    const openAlbum = async (a: Album) => {
      selected.value = a
      selectedAssets.value = await albumAssets(a.id)
      for (const p of selectedAssets.value) void ensurePreview(p, 400)
    }

    const closeAlbum = () => {
      selected.value = null
      selectedAssets.value = []
      void load()
    }

    const startCreate = () => {
      dialogName.value = ''
      dialog.value = 'create'
    }
    const startRename = () => {
      dialogName.value = selected.value?.name ?? ''
      dialog.value = 'rename'
    }
    const confirmDialog = async () => {
      const name = dialogName.value.trim()
      if (!name) return
      if (dialog.value === 'create') {
        const id = await createAlbum(name)
        dialog.value = null
        await load()
        const a = albums.value.find((x) => x.id === id)
        if (a) await openAlbum(a)
      } else if (dialog.value === 'rename' && selected.value) {
        await renameAlbum(selected.value.id, name)
        selected.value.name = name
        dialog.value = null
      }
    }

    const doDelete = async () => {
      if (!selected.value) return
      await deleteAlbum(selected.value.id)
      closeAlbum()
    }

    const remove = async (p: Photo) => {
      if (!selected.value) return
      await removeFromAlbum(selected.value.id, p.id)
      selectedAssets.value = selectedAssets.value.filter((x) => x.id !== p.id)
      if (selected.value) selected.value.count = selectedAssets.value.length
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
      albums, loading, selected, selectedAssets, dialog, dialogName,
      viewerList, viewerIndex, thumbSrc, coverSrc,
      openAlbum, closeAlbum, startCreate, startRename, confirmDialog, doDelete, remove, openPhoto, onImgError,
      ensurePreview, ensureOriginal
    }
  }
})
</script>

<style scoped>
.albums-view { display: flex; flex-direction: column; height: 100%; }
.albums-toolbar {
  display: flex; align-items: center; gap: 12px;
  padding: 8px 16px; border-bottom: 1px solid var(--oc-role-outline-variant, #bfc8cc);
}
.albums-toolbar h1 { font-size: 1.1rem; font-weight: 600; margin: 0; }
.albums-count { font-size: 0.8rem; color: var(--oc-role-on-surface-variant, #40484c); }
.albums-btn {
  margin-left: auto; padding: 6px 12px; border-radius: 8px; cursor: pointer; font-size: 0.85rem;
  border: 1px solid var(--oc-role-outline-variant, #bfc8cc);
  background: var(--oc-role-surface, #fff); color: var(--oc-role-on-surface, #191c1d);
}
.albums-btn + .albums-btn { margin-left: 0; }
.albums-btn:hover { background: var(--oc-role-surface-container, #f6f8fa); }
.albums-btn-primary { background: var(--oc-role-primary, #00677f); color: #fff; border-color: transparent; }
.albums-icon-btn {
  border: 0; background: none; cursor: pointer; font-size: 1.4rem; line-height: 1;
  color: var(--oc-role-on-surface, #191c1d);
}
.albums-dialog { display: flex; gap: 8px; padding: 10px 16px; }
.albums-input {
  flex: 1; max-width: 320px; padding: 7px 10px; border-radius: 8px; font-size: 0.9rem;
  border: 1px solid var(--oc-role-outline-variant, #bfc8cc);
  background: var(--oc-role-surface, #fff); color: var(--oc-role-on-surface, #191c1d);
}
.albums-note { padding: 32px; text-align: center; color: var(--oc-role-on-surface-variant, #40484c); }
.albums-scroll { flex: 1; overflow-y: auto; padding: 12px 16px; }
.albums-grid { display: grid; gap: 10px; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); }
.albums-card {
  position: relative; aspect-ratio: 1; padding: 0; border: 0; border-radius: 10px; cursor: pointer;
  overflow: hidden; background: var(--oc-role-surface-container, #f6f8fa);
}
.albums-card img { width: 100%; height: 100%; object-fit: cover; display: block; }
.albums-card-name {
  position: absolute; left: 8px; bottom: 20px; color: #fff; font-weight: 600; font-size: 0.9rem;
  text-shadow: 0 1px 5px rgba(0, 0, 0, 0.75);
}
.albums-card-count {
  position: absolute; left: 8px; bottom: 5px; color: #ddd; font-size: 0.75rem;
  text-shadow: 0 1px 5px rgba(0, 0, 0, 0.75);
}
.albums-cell { position: relative; aspect-ratio: 1; }
.albums-photo { width: 100%; height: 100%; padding: 0; border: 0; cursor: pointer; overflow: hidden; background: var(--oc-role-surface-container, #f6f8fa); }
.albums-photo img { width: 100%; height: 100%; object-fit: cover; display: block; }
.albums-remove {
  position: absolute; top: 4px; right: 4px; width: 26px; height: 26px; border: 0; border-radius: 50%;
  cursor: pointer; background: rgba(0, 0, 0, 0.55); color: #fff; font-size: 1rem; line-height: 1;
}
</style>
