<template>
  <div class="memories-view">
    <div class="memories-toolbar">
      <h1 v-text="$gettext('On this day…')" />
    </div>

    <div v-if="loading" class="memories-note" v-text="$gettext('Loading…')" />
    <div v-else-if="years.length === 0" class="memories-note" v-text="$gettext('No memories from previous years today')" />

    <div v-else class="memories-scroll">
      <section v-for="[year, list] in years" :key="year" class="memories-year">
        <button class="memories-hero" @click="openViewer(list, 0)">
          <img :src="thumbSrc(list[0], 800)" :alt="String(year)" />
          <span class="memories-hero-label">
            {{ $gettext('%{n} years ago', { n: currentYear - year }) }} · {{ list.length }}
          </span>
        </button>
        <div class="memories-strip">
          <button v-for="(p, i) in list.slice(1, 9)" :key="p.id" class="memories-thumb" @click="openViewer(list, i + 1)">
            <img :src="thumbSrc(p, 200)" :alt="p.name" loading="lazy" />
          </button>
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
import { computed, defineComponent, onMounted, ref, watch } from 'vue'
import { usePhotoLibrary, Photo } from '../composables/usePhotoLibrary'
import ViewerOverlay from '../components/ViewerOverlay.vue'

export default defineComponent({
  name: 'MemoriesView',
  components: { ViewerOverlay },
  setup() {
    const { fetchOnThisDay, ensurePreview, ensureOriginal, previews } = usePhotoLibrary()
    const loading = ref(true)
    const photos = ref<Photo[]>([])
    const currentYear = new Date().getFullYear()

    const years = computed(() => {
      const map = new Map<number, Photo[]>()
      for (const p of photos.value) {
        const y = new Date(p.takenAt * 1000).getFullYear()
        if (!map.has(y)) map.set(y, [])
        map.get(y)!.push(p)
      }
      return [...map.entries()].sort(([a], [b]) => b - a)
    })

    const thumbSrc = (p: Photo, size: number) => previews.value[`${p.id}|${size}`]

    watch(
      years,
      (list) => {
        for (const [, items] of list) for (const p of items.slice(0, 9)) void ensurePreview(p, 800)
      },
      { immediate: true }
    )

    const viewerList = ref<Photo[] | null>(null)
    const viewerIndex = ref(0)
    const openViewer = (list: Photo[], i: number) => {
      viewerList.value = list
      viewerIndex.value = i
    }

    onMounted(async () => {
      try {
        photos.value = await fetchOnThisDay()
      } finally {
        loading.value = false
      }
    })

    return { loading, years, currentYear, viewerList, viewerIndex, openViewer, thumbSrc, ensurePreview, ensureOriginal }
  }
})
</script>

<style scoped>
.memories-view { display: flex; flex-direction: column; height: 100%; }
.memories-toolbar {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 16px; border-bottom: 1px solid var(--oc-role-outline-variant, #bfc8cc);
}
.memories-toolbar h1 { font-size: 1.1rem; font-weight: 600; margin: 0; }
.memories-nav { display: flex; gap: 16px; font-size: 0.85rem; }
.memories-note { padding: 32px; text-align: center; color: var(--oc-role-on-surface-variant, #40484c); }
.memories-scroll { flex: 1; overflow-y: auto; padding: 16px; }
.memories-year { margin-bottom: 24px; }
.memories-hero {
  position: relative; display: block; width: 100%; height: 260px; padding: 0; border: 0;
  border-radius: 12px; overflow: hidden; cursor: pointer; margin-bottom: 4px;
}
.memories-hero img { width: 100%; height: 100%; object-fit: cover; }
.memories-hero-label {
  position: absolute; left: 16px; bottom: 12px; color: #fff; font-weight: 600; font-size: 1.1rem;
  text-shadow: 0 1px 6px rgba(0, 0, 0, 0.7);
}
.memories-strip { display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap: 3px; }
.memories-thumb { aspect-ratio: 1; padding: 0; border: 0; border-radius: 6px; overflow: hidden; cursor: pointer; background: var(--oc-role-surface-container, #f6f8fa); }
.memories-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
</style>
