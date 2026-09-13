<template>
  <div class="explore-view">
    <div class="explore-toolbar">
      <h1 v-text="$gettext('Explore')" />
    </div>

    <div class="explore-body">
      <form class="explore-search" @submit.prevent="runSearch">
        <input
          v-model="query"
          type="search"
          :placeholder="$gettext('Search by file, camera, path…')"
          class="explore-input"
        />
        <button type="submit" class="explore-submit" v-text="$gettext('Search')" />
      </form>

      <div class="explore-links">
        <router-link class="explore-link" to="/ocphotos/timeline">
          <oc-icon name="image" size="small" /> <span v-text="$gettext('Photos')" />
        </router-link>
        <router-link class="explore-link" to="/ocphotos/memories">
          <oc-icon name="calendar" size="small" /> <span v-text="$gettext('On this day')" />
        </router-link>
        <router-link class="explore-link" to="/ocphotos/map">
          <oc-icon name="map-2" size="small" /> <span v-text="$gettext('Places')" />
        </router-link>
        <router-link class="explore-link" to="/ocphotos/favorites">
          <oc-icon name="heart" size="small" /> <span v-text="$gettext('Favorites')" />
        </router-link>
      </div>

      <div v-if="loading" class="explore-note" v-text="$gettext('Searching…')" />
      <div v-else-if="searched && results.length === 0" class="explore-note" v-text="$gettext('No results')" />
      <div v-else-if="results.length" class="explore-grid">
        <button v-for="p in results" :key="p.id" class="explore-cell" @click="open(p)">
          <img :src="thumbSrc(p)" :alt="p.name" loading="lazy" @error="onImgError" />
          <span v-if="p.isVideo" class="explore-badge">▶</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref } from 'vue'
import { usePhotoLibrary, Photo } from '../composables/usePhotoLibrary'

export default defineComponent({
  name: 'ExploreView',
  setup() {
    const { searchAssets, ensurePreview, ensureOriginal, previews, openPreview } = usePhotoLibrary()
    const query = ref('')
    const results = ref<Photo[]>([])
    const loading = ref(false)
    const searched = ref(false)

    const thumbSrc = (p: Photo) => previews.value[`${p.id}|400`]

    const runSearch = async () => {
      const q = query.value.trim()
      if (!q) return
      loading.value = true
      searched.value = true
      try {
        results.value = await searchAssets(q)
        for (const p of results.value) void ensurePreview(p, 400)
      } finally {
        loading.value = false
      }
    }

    const open = (p: Photo) => {
      if (!openPreview(p)) return
    }

    const onImgError = (e: Event) => {
      const el = e.target as HTMLImageElement
      el.style.opacity = '0.15'
      el.onerror = null
    }

    return { query, results, loading, searched, runSearch, open, thumbSrc, onImgError, ensurePreview, ensureOriginal }
  }
})
</script>

<style scoped>
.explore-view { display: flex; flex-direction: column; height: 100%; }
.explore-toolbar {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 16px; border-bottom: 1px solid var(--oc-role-outline-variant, #bfc8cc);
}
.explore-toolbar h1 { font-size: 1.1rem; font-weight: 600; margin: 0; }
.explore-nav { display: flex; gap: 16px; font-size: 0.85rem; }
.explore-body { flex: 1; overflow-y: auto; padding: 16px; }
.explore-search { display: flex; gap: 8px; max-width: 640px; margin-bottom: 20px; }
.explore-input {
  flex: 1; padding: 8px 12px; border-radius: 8px; font-size: 0.9rem;
  border: 1px solid var(--oc-role-outline-variant, #bfc8cc);
  background: var(--oc-role-surface, #fff); color: var(--oc-role-on-surface, #191c1d);
}
.explore-submit {
  padding: 8px 18px; border: 0; border-radius: 8px; cursor: pointer; font-size: 0.9rem;
  background: var(--oc-role-primary, #00677f); color: #fff;
}
.explore-submit:hover { filter: brightness(1.08); }
.explore-links { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 20px; }
.explore-link {
  display: inline-flex; align-items: center; gap: 6px; padding: 8px 12px; font-size: 0.85rem;
  border: 1px solid var(--oc-role-outline-variant, #bfc8cc); border-radius: 10px; text-decoration: none;
}
.explore-note { color: var(--oc-role-on-surface-variant, #40484c); padding: 16px 0; }
.explore-grid { display: grid; gap: 3px; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); }
.explore-cell {
  position: relative; aspect-ratio: 1; padding: 0; border: 0; cursor: pointer;
  background: var(--oc-role-surface-container, #f6f8fa); overflow: hidden;
}
.explore-cell img { width: 100%; height: 100%; object-fit: cover; display: block; }
.explore-badge {
  position: absolute; right: 4px; bottom: 4px; font-size: 0.7rem; color: #fff;
  background: rgba(0, 0, 0, 0.55); border-radius: 4px; padding: 1px 6px;
}
</style>
