<template>
  <div class="memories-view">
    <div class="memories-toolbar">
      <h1 v-text="$gettext('Un día como hoy…')" />
      <router-link :to="{ name: 'photos-timeline' }" v-text="$gettext('Timeline')" />
    </div>

    <div v-if="loading" class="memories-note" v-text="$gettext('Indexando…')" />
    <div v-else-if="years.length === 0" class="memories-note" v-text="$gettext('Hoy no hay recuerdos de años anteriores')" />

    <div v-else class="memories-scroll">
      <section v-for="[year, list] in years" :key="year" class="memories-year">
        <button class="memories-hero" @click="openViewer(list, 0)">
          <img :src="previewUrl(list[0], 800)" :alt="String(year)" />
          <span class="memories-hero-label">
            {{ $gettext('Hace %{n} años', { n: currentYear - year }) }} · {{ list.length }}
          </span>
        </button>
        <div class="memories-strip">
          <button v-for="(p, i) in list.slice(1, 9)" :key="p.path" class="memories-thumb" @click="openViewer(list, i + 1)">
            <img :src="previewUrl(p, 200)" :alt="p.name" loading="lazy" />
          </button>
        </div>
      </section>
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

export default defineComponent({
  name: 'MemoriesView',
  components: { ViewerOverlay },
  setup() {
    const { loading, onThisDay, init, previewUrl, fileUrl } = usePhotoLibrary()
    const currentYear = new Date().getFullYear()
    const years = computed(() => [...onThisDay.value.entries()])

    const viewerList = ref<Photo[] | null>(null)
    const viewerIndex = ref(0)
    const openViewer = (list: Photo[], i: number) => {
      viewerList.value = list
      viewerIndex.value = i
    }

    onMounted(() => init('/Fotos'))
    return { loading, years, currentYear, viewerList, viewerIndex, openViewer, previewUrl, fileUrl }
  }
})
</script>

<style scoped>
.memories-view { display: flex; flex-direction: column; height: 100%; }
.memories-toolbar {
  display: flex; align-items: center; justify-content: space-between;
  padding: var(--oc-space-small) var(--oc-space-medium);
  border-bottom: 1px solid var(--oc-color-border);
}
.memories-toolbar h1 { font-size: 1.1rem; font-weight: 600; margin: 0; }
.memories-note { padding: var(--oc-space-xlarge); text-align: center; color: var(--oc-color-text-muted); }
.memories-scroll { flex: 1; overflow-y: auto; padding: var(--oc-space-medium); }
.memories-year { margin-bottom: var(--oc-space-large); }
.memories-hero {
  position: relative; display: block; width: 100%; height: 220px; padding: 0; border: 0;
  border-radius: 12px; overflow: hidden; cursor: pointer; margin-bottom: 4px;
}
.memories-hero img { width: 100%; height: 100%; object-fit: cover; }
.memories-hero-label {
  position: absolute; left: 16px; bottom: 12px; color: #fff; font-weight: 600; font-size: 1.1rem;
  text-shadow: 0 1px 6px rgba(0, 0, 0, 0.7);
}
.memories-strip { display: grid; grid-template-columns: repeat(auto-fill, minmax(90px, 1fr)); gap: 3px; }
.memories-thumb { aspect-ratio: 1; padding: 0; border: 0; border-radius: 6px; overflow: hidden; cursor: pointer; background: var(--oc-color-background-muted); }
.memories-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
</style>
