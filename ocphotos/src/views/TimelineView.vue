<template>
  <div class="photos-view">
    <div class="photos-toolbar">
      <h1 class="photos-title" v-text="$gettext('Photos')" />
      <span v-if="loading" class="photos-progress" v-text="$gettext('Loading…')" />
      <span v-else class="photos-count" v-text="$gettext('%{n} items', { n: photos.length })" />
      <oc-button appearance="raw" :aria-label="$gettext('Rescan')" @click="rescan">
        <oc-icon name="refresh" size="small" />
      </oc-button>
    </div>

    <div v-if="error" class="photos-error" v-text="error" />
    <div v-else-if="!loading && photos.length === 0" class="photos-empty">
      <p v-text="$gettext('No photos yet')" />
    </div>

    <div v-else class="photos-body">
      <div class="photos-scroll">
        <!-- On this day: "hace X años" (como Memories); si no hay de hoy, highlights -->
        <div v-if="onThisDay.length" class="otd-block">
          <h2 class="otd-title" v-text="otdTitle" />
          <div class="otd">
            <button v-for="y in onThisDay" :key="y.year" class="otd-card" @click="jumpToPhoto(y.photo)">
              <img :src="thumbSrc(y.photo)" :alt="y.label" loading="lazy" @error="onImgError" />
              <span class="otd-label" v-text="y.label" />
            </button>
          </div>
        </div>

        <section v-for="m in months" :key="m.key" class="photos-month">
          <h2 class="photos-month-header">{{ m.label }}</h2>
          <section v-for="day in m.days" :key="day.key" class="photos-day">
            <h3 class="photos-day-header">{{ formatDay(day.date) }} <span>{{ day.photos.length }}</span></h3>
            <div class="photos-grid">
              <button
                v-for="p in day.photos"
                :key="p.id"
                class="photos-cell"
                @click="openViewer(day.photos, p)"
              >
                <img :src="thumbSrc(p)" :alt="p.name" loading="lazy" @error="onImgError" />
                <span v-if="p.isVideo" class="photos-video-badge">▶</span>
              </button>
            </div>
          </section>
        </section>
        <div ref="sentinel" class="photos-sentinel" />
      </div>

      <!-- Rewind: saltar a cualquier año -->
      <aside v-if="years.length" class="rewind">
        <button
          class="rewind-item rewind-now"
          :class="{ active: startAt === null }"
          :title="$gettext('Now')"
          @click="jumpTo(null)"
        >•</button>
        <button
          v-for="y in years"
          :key="y.year"
          class="rewind-item"
          :class="{ active: topYear === y.year }"
          :title="$gettext('%{n} items', { n: y.count })"
          @click="jumpToYear(y.year)"
        >{{ y.year }}</button>
      </aside>
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
  name: 'TimelineView',
  components: { ViewerOverlay },
  setup() {
    const { $gettext } = useGettext()
    const {
      photos, loading, error, months, exhausted, startAt,
      init, loadMore, jumpTo, fetchCalendar, fetchHighlights, rescan, previews, ensurePreview, ensureOriginal, openPreview, startWatching
    } = usePhotoLibrary()

    const sentinel = ref<HTMLElement | null>(null)
    const years = ref<{ year: number; count: number }[]>([])

    // On this day: una tarjeta por año (la foto más reciente de ese año)
    const otdPhotos = ref<Photo[]>([])
    const currentYear = new Date().getFullYear()
    const onThisDay = computed(() => {
      const byYear = new Map<number, Photo>()
      for (const p of otdPhotos.value) {
        const y = new Date(p.takenAt * 1000).getFullYear()
        if (!byYear.has(y)) byYear.set(y, p)
      }
      return [...byYear.entries()]
        .sort(([a], [b]) => b - a)
        .map(([year, photo]) => ({ year, photo, label: $gettext('%{n} years ago', { n: currentYear - year }) }))
    })
    const jumpToPhoto = (p: Photo): void => {
      void jumpTo(p.takenAt)
    }

    const otdScope = ref('day')
    const otdTitle = computed(() => {
      if (otdScope.value === 'day') return $gettext('On this day')
      if (otdScope.value === 'month') {
        const month = new Intl.DateTimeFormat(navigator.language || 'en', { month: 'long' }).format(new Date())
        return $gettext('%{month} in previous years', { month })
      }
      return $gettext('Older')
    })

    const topYear = computed(() => (photos.value[0] ? new Date(photos.value[0].takenAt * 1000).getFullYear() : null))

    const thumbSrc = (p: Photo) => previews.value[`${p.id}|400`]

    watch(
      months,
      (list) => {
        for (const m of list) for (const day of m.days) for (const p of day.photos) void ensurePreview(p, 400)
      },
      { immediate: true }
    )

    const viewerList = ref<Photo[] | null>(null)
    const viewerIndex = ref(0)
    // formatos que el host sabe previsualizar -> visor nativo; HEIC/RAW -> el propio
    const openViewer = (list: Photo[], p: Photo) => {
      if (openPreview(p)) return
      viewerList.value = list
      viewerIndex.value = list.indexOf(p)
    }

    const formatDay = (d: Date) =>
      new Intl.DateTimeFormat(navigator.language || 'en', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(d)

    const onImgError = (e: Event) => {
      const el = e.target as HTMLImageElement
      el.style.opacity = '0.15'
      el.onerror = null
    }

    const jumpToYear = (year: number) => {
      // fin de ese año: el timeline arranca ahí y va hacia atrás
      const ts = Math.floor(Date.UTC(year, 11, 31, 23, 59, 59) / 1000)
      void jumpTo(ts)
    }

    onMounted(async () => {
      await init()
      startWatching()
      try {
        years.value = await fetchCalendar()
      } catch {
        /* sin scrubber si falla */
      }
      try {
        const h = await fetchHighlights()
        otdScope.value = h.scope
        otdPhotos.value = h.photos
        for (const p of otdPhotos.value.slice(0, 12)) void ensurePreview(p, 400)
      } catch {
        /* sin tira de highlights si falla */
      }
      const obs = new IntersectionObserver(
        (entries) => {
          if (entries[0].isIntersecting && !exhausted.value) void loadMore()
        },
        { rootMargin: '1500px' }
      )
      if (sentinel.value) obs.observe(sentinel.value)
    })

    return {
      photos, loading, error, months, years, topYear, startAt, sentinel, onThisDay, otdTitle, jumpToPhoto,
      viewerList, viewerIndex, openViewer, formatDay, onImgError, jumpTo, jumpToYear,
      rescan, thumbSrc, ensurePreview, ensureOriginal
    }
  }
})
</script>

<style scoped>
.photos-view { display: flex; flex-direction: column; height: 100%; }
.photos-toolbar {
  display: flex; align-items: center; gap: 16px;
  padding: 8px 16px; border-bottom: 1px solid var(--oc-role-outline-variant, #bfc8cc);
}
.photos-title { font-size: 1.1rem; font-weight: 600; margin: 0; }
.photos-progress, .photos-count { font-size: 0.8rem; color: var(--oc-role-on-surface-variant, #40484c); }
.photos-error { padding: 16px; color: var(--oc-role-error, #ba1a1a); }
.photos-empty {
  display: flex; flex-direction: column; align-items: center; gap: 8px;
  padding: 32px; text-align: center; color: var(--oc-role-on-surface-variant, #40484c);
}
.photos-body { flex: 1; min-height: 0; display: flex; }
.photos-scroll { flex: 1; overflow-y: auto; padding: 0 8px; }
/* On this day */
.otd-block { padding: 8px 4px 4px; }
.otd-title { margin: 0 0 6px; font-size: 0.95rem; font-weight: 700; }
.otd { display: flex; gap: 8px; overflow-x: auto; padding: 0 0 6px; }
.otd-card {
  position: relative; flex: 0 0 auto; width: 150px; height: 110px; padding: 0; border: 0;
  border-radius: 10px; overflow: hidden; cursor: pointer; background: var(--oc-role-surface-container, #f6f8fa);
}
.otd-card img { width: 100%; height: 100%; object-fit: cover; display: block; }
.otd-label {
  position: absolute; left: 6px; bottom: 6px; color: #fff; font-size: 0.78rem; font-weight: 600;
  text-shadow: 0 1px 5px rgba(0, 0, 0, 0.75);
}
.photos-month-header {
  position: sticky; top: 0; z-index: 2; margin: 0; padding: 10px 4px 6px;
  font-size: 1rem; font-weight: 700; text-transform: capitalize;
  background: var(--oc-role-surface, #fff);
}
.photos-day-header {
  position: sticky; top: 36px; z-index: 1; margin: 0; padding: 6px 0;
  font-size: 0.8rem; font-weight: 500; text-transform: capitalize;
  background: var(--oc-role-surface, #fff);
}
.photos-day-header span { color: var(--oc-role-on-surface-variant, #40484c); margin-left: 0.5em; }
.photos-grid {
  display: grid; gap: 3px;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
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

/* Rewind */
.rewind {
  flex: 0 0 44px; display: flex; flex-direction: column; align-items: center; gap: 2px;
  padding: 8px 0; overflow-y: auto; border-left: 1px solid var(--oc-role-outline-variant, #bfc8cc);
}
.rewind-item {
  border: 0; background: none; cursor: pointer; font-size: 0.72rem; font-weight: 600;
  color: var(--oc-role-on-surface-variant, #40484c); padding: 2px 6px; border-radius: 10px;
}
.rewind-item:hover { background: var(--oc-role-surface-container, #f6f8fa); }
.rewind-item.active { background: var(--oc-role-primary, #00677f); color: #fff; }
.rewind-now { font-size: 1rem; }
</style>
