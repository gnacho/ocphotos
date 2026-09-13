<template>
  <div class="dup-view">
    <div class="dup-toolbar">
      <h1 v-text="$gettext('Duplicates')" />
      <span class="dup-count" v-text="groupsLabel" />
      <button class="dup-btn" @click="scan" :disabled="loading" v-text="$gettext('Scan')" />
      <span v-if="pending > 0" class="dup-pending" v-text="$gettext('%{n} pending', { n: pending })" />
    </div>

    <div v-if="loading" class="dup-note" v-text="$gettext('Analyzing…')" />
    <div v-else-if="groups.length === 0" class="dup-note" v-text="$gettext('No duplicates found')" />

    <div v-else class="dup-scroll">
      <section v-for="(group, gi) in groups" :key="gi" class="dup-group">
        <div class="dup-grid">
          <div v-for="p in group" :key="p.id" class="dup-cell">
            <button class="dup-photo" @click="openViewer(group, p)">
              <img :src="thumbSrc(p)" :alt="p.name" loading="lazy" @error="onImgError" />
            </button>
            <button class="dup-arch" :title="$gettext('Archive')" @click="archive(p, gi)">⌦</button>
          </div>
        </div>
      </section>
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
import { usePhotoLibrary, Photo } from '../composables/usePhotoLibrary'
import ViewerOverlay from '../components/ViewerOverlay.vue'

export default defineComponent({
  name: 'DuplicatesView',
  components: { ViewerOverlay },
  setup() {
    const { $gettext } = useGettext()
    const { fetchDuplicates, setArchived, ensurePreview, ensureOriginal, previews } = usePhotoLibrary()
    const loading = ref(true)
    const groups = ref<Photo[][]>([])
    const pending = ref(0)
    const viewerList = ref<Photo[] | null>(null)
    const viewerIndex = ref(0)

    const groupsLabel = computed(() => `${groups.value.length} ${$gettext(groups.value.length === 1 ? 'group' : 'groups')}`)
    const thumbSrc = (p: Photo) => previews.value[`${p.id}|400`]

    const scan = async () => {
      loading.value = true
      try {
        const res = await fetchDuplicates()
        groups.value = res.groups
        pending.value = res.pending
        for (const g of groups.value) for (const p of g) void ensurePreview(p, 400)
      } finally {
        loading.value = false
      }
    }

    const archive = async (p: Photo, gi: number) => {
      await setArchived(p.id, true)
      const group = groups.value[gi].filter((x) => x.id !== p.id)
      groups.value = group.length > 1 ? groups.value.map((g, i) => (i === gi ? group : g)) : groups.value.filter((_, i) => i !== gi)
    }

    const openViewer = (list: Photo[], p: Photo) => {
      viewerList.value = list
      viewerIndex.value = list.indexOf(p)
    }

    const onImgError = (e: Event) => {
      const el = e.target as HTMLImageElement
      el.style.opacity = '0.15'
      el.onerror = null
    }

    onMounted(scan)

    return { loading, groups, groupsLabel, pending, viewerList, viewerIndex, thumbSrc, scan, archive, openViewer, onImgError, ensurePreview, ensureOriginal }
  }
})
</script>

<style scoped>
.dup-view { display: flex; flex-direction: column; height: 100%; }
.dup-toolbar { display: flex; align-items: center; gap: 16px; padding: 8px 16px; border-bottom: 1px solid var(--oc-role-outline-variant, #bfc8cc); }
.dup-toolbar h1 { font-size: 1.1rem; font-weight: 600; margin: 0; }
.dup-count, .dup-pending { font-size: 0.8rem; color: var(--oc-role-on-surface-variant, #40484c); }
.dup-btn {
  margin-left: auto; padding: 6px 12px; border-radius: 8px; cursor: pointer; font-size: 0.85rem;
  border: 1px solid var(--oc-role-outline-variant, #bfc8cc); background: var(--oc-role-surface, #fff); color: var(--oc-role-on-surface, #191c1d);
}
.dup-btn:disabled { opacity: 0.5; cursor: default; }
.dup-note { padding: 32px; text-align: center; color: var(--oc-role-on-surface-variant, #40484c); }
.dup-scroll { flex: 1; overflow-y: auto; padding: 12px 16px; }
.dup-group { margin-bottom: 18px; }
.dup-grid { display: grid; gap: 3px; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); }
.dup-cell { position: relative; aspect-ratio: 1; }
.dup-photo { width: 100%; height: 100%; padding: 0; border: 0; cursor: pointer; overflow: hidden; background: var(--oc-role-surface-container, #f6f8fa); }
.dup-photo img { width: 100%; height: 100%; object-fit: cover; display: block; }
.dup-arch {
  position: absolute; top: 4px; right: 4px; width: 26px; height: 26px; border: 0; border-radius: 50%;
  cursor: pointer; background: rgba(0, 0, 0, 0.55); color: #fff; font-size: 0.9rem; line-height: 1;
}
</style>
