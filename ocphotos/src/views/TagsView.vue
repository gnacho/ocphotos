<template>
  <div class="tags-view">
    <div class="tags-toolbar">
      <template v-if="!selected">
        <h1 v-text="$gettext('Tags')" />
        <span class="tags-count" v-text="tagsLabel" />
      </template>
      <template v-else>
        <button class="tags-icon-btn" :aria-label="$gettext('Back')" @click="close">‹</button>
        <h1 v-text="selected" />
        <span class="tags-count" v-text="itemsLabel" />
      </template>
    </div>

    <div v-if="loading" class="tags-note" v-text="$gettext('Loading…')" />

    <div v-else-if="selected" class="tags-scroll">
      <div class="tags-grid">
        <button v-for="p in selectedAssets" :key="p.id" class="tags-photo" @click="openPhoto(selectedAssets, p)">
          <img :src="thumbSrc(p)" :alt="p.name" loading="lazy" @error="onImgError" />
        </button>
      </div>
    </div>

    <div v-else class="tags-scroll">
      <p v-if="tags.length === 0" class="tags-note" v-text="$gettext('No tags yet')" />
      <div v-else class="tags-chips">
        <button v-for="t in tags" :key="t.name" class="tags-chip" @click="openTag(t)">
          <span v-text="t.name" />
          <span class="tags-chip-count" v-text="String(t.count)" />
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
import { usePhotoLibrary, Tag, Photo } from '../composables/usePhotoLibrary'
import ViewerOverlay from '../components/ViewerOverlay.vue'

export default defineComponent({
  name: 'TagsView',
  components: { ViewerOverlay },
  setup() {
    const { $gettext } = useGettext()
    const { fetchTags, tagAssets, ensurePreview, ensureOriginal, previews } = usePhotoLibrary()

    const tags = ref<Tag[]>([])
    const loading = ref(true)
    const selected = ref<string | null>(null)
    const selectedAssets = ref<Photo[]>([])
    const viewerList = ref<Photo[] | null>(null)
    const viewerIndex = ref(0)

    const tagsLabel = computed(() => `${tags.value.length} ${$gettext(tags.value.length === 1 ? 'tag' : 'tags')}`)
    const itemsLabel = computed(() => `${selectedAssets.value.length} ${$gettext(selectedAssets.value.length === 1 ? 'item' : 'items')}`)
    const thumbSrc = (p: Photo) => previews.value[`${p.id}|400`]

    const load = async () => {
      loading.value = true
      try {
        tags.value = await fetchTags()
      } finally {
        loading.value = false
      }
    }

    const openTag = async (t: Tag) => {
      selected.value = t.name
      selectedAssets.value = await tagAssets(t.name)
      for (const p of selectedAssets.value) void ensurePreview(p, 400)
    }

    const close = () => {
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
      tags, tagsLabel, itemsLabel, loading, selected, selectedAssets, viewerList, viewerIndex,
      thumbSrc, openTag, close, openPhoto, onImgError, ensurePreview, ensureOriginal
    }
  }
})
</script>

<style scoped>
.tags-view { display: flex; flex-direction: column; height: 100%; }
.tags-toolbar {
  display: flex; align-items: center; gap: 12px;
  padding: 8px 16px; border-bottom: 1px solid var(--oc-role-outline-variant, #bfc8cc);
}
.tags-toolbar h1 { font-size: 1.1rem; font-weight: 600; margin: 0; }
.tags-count { font-size: 0.8rem; color: var(--oc-role-on-surface-variant, #40484c); }
.tags-icon-btn { border: 0; background: none; cursor: pointer; font-size: 1.4rem; line-height: 1; color: var(--oc-role-on-surface, #191c1d); }
.tags-note { padding: 32px; text-align: center; color: var(--oc-role-on-surface-variant, #40484c); }
.tags-scroll { flex: 1; overflow-y: auto; padding: 16px; }
.tags-chips { display: flex; flex-wrap: wrap; gap: 10px; }
.tags-chip {
  display: inline-flex; align-items: center; gap: 8px; padding: 8px 14px; cursor: pointer;
  border-radius: 999px; font-size: 0.9rem;
  border: 1px solid var(--oc-role-outline-variant, #bfc8cc);
  background: var(--oc-role-surface, #fff); color: var(--oc-role-on-surface, #191c1d);
}
.tags-chip:hover { background: var(--oc-role-surface-container, #f6f8fa); }
.tags-chip-count {
  background: var(--oc-role-primary, #00677f); color: #fff; border-radius: 999px;
  padding: 0 8px; font-size: 0.75rem;
}
.tags-grid { display: grid; gap: 3px; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); }
.tags-photo { aspect-ratio: 1; padding: 0; border: 0; cursor: pointer; overflow: hidden; background: var(--oc-role-surface-container, #f6f8fa); }
.tags-photo img { width: 100%; height: 100%; object-fit: cover; display: block; }
</style>
