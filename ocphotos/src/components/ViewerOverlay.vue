<template>
  <div class="viewer" @keydown.esc="$emit('close')" tabindex="0" ref="root">
    <div class="viewer-top">
      <div class="viewer-meta">
        <span class="viewer-name">{{ current?.name }}</span>
        <span v-if="caption" class="viewer-caption" v-text="caption" />
      </div>
      <div class="viewer-actions">
        <button
          v-if="current"
          class="viewer-btn"
          :class="{ 'is-fav': current.favorite }"
          :aria-label="$gettext('Favorite')"
          @click="onFavorite"
        >
          <oc-icon :name="current.favorite ? 'heart' : 'heart-3'" color="#fff" size="medium" />
        </button>
        <button v-if="current" class="viewer-btn" :aria-label="$gettext('Add to album')" @click="pickerOpen = true">
          <oc-icon name="album" color="#fff" size="medium" />
        </button>
        <button class="viewer-btn" :aria-label="$gettext('Download')" @click="download">
          <oc-icon name="file-download" color="#fff" size="medium" />
        </button>
        <button class="viewer-btn viewer-close" :aria-label="$gettext('Close')" @click="$emit('close')">
          <oc-icon name="close" color="#fff" size="medium" />
        </button>
      </div>
    </div>

    <button v-if="index > 0" class="viewer-arrow left" @click="$emit('navigate', index - 1)">‹</button>
    <div class="viewer-stage" @click.self="$emit('close')">
      <video v-if="current?.isVideo" :src="src" controls autoplay class="viewer-media" />
      <img v-else-if="current && src" :src="src" :alt="current.name" class="viewer-media" />
      <span v-else-if="current" class="viewer-loading" v-text="$gettext('Loading…')" />
    </div>
    <button v-if="index < photos.length - 1" class="viewer-arrow right" @click="$emit('navigate', index + 1)">›</button>

    <album-picker v-if="pickerOpen && current" :asset-id="current.id" @close="pickerOpen = false" />
  </div>
</template>

<script lang="ts">
import { computed, defineComponent, onMounted, onUnmounted, PropType, ref, watch } from 'vue'
import type { ProcessorType } from '@opencloud-eu/web-pkg'
import { usePhotoLibrary, Photo } from '../composables/usePhotoLibrary'
import AlbumPicker from './AlbumPicker.vue'

export default defineComponent({
  name: 'ViewerOverlay',
  components: { AlbumPicker },
  props: {
    photos: { type: Array as PropType<Photo[]>, required: true },
    index: { type: Number, required: true },
    ensurePreview: {
      type: Function as PropType<(p: Photo, size?: number, processor?: ProcessorType) => Promise<string>>,
      required: true
    },
    ensureOriginal: {
      type: Function as PropType<(p: Photo) => Promise<string>>,
      required: true
    }
  },
  emits: ['close', 'navigate'],
  setup(props, { emit }) {
    const { toggleFavorite } = usePhotoLibrary()
    const root = ref<HTMLElement | null>(null)
    const src = ref('')
    const pickerOpen = ref(false)
    const current = computed(() => props.photos[props.index])

    const caption = computed(() => {
      const p = current.value
      if (!p) return ''
      const date = new Intl.DateTimeFormat(navigator.language || 'en', {
        day: 'numeric', month: 'long', year: 'numeric'
      }).format(new Date(p.takenAt * 1000))
      return [date, p.camera].filter(Boolean).join(' · ')
    })

    // el host exige la sesión (Bearer), así que las imágenes se piden por la API
    // autenticada y se muestran como blob URL; los vídeos van por el original.
    watch(
      current,
      async (p) => {
        src.value = ''
        if (!p) return
        const url = p.isVideo ? await props.ensureOriginal(p) : await props.ensurePreview(p, 2048)
        if (current.value === p) src.value = url
      },
      { immediate: true }
    )

    const onFavorite = async () => {
      const p = current.value
      if (p) await toggleFavorite(p)
    }

    const download = async () => {
      const p = current.value
      if (!p) return
      const url = await props.ensureOriginal(p)
      if (!url) return
      const a = document.createElement('a')
      a.href = url
      a.download = p.name
      document.body.appendChild(a)
      a.click()
      a.remove()
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') emit('close')
      if (e.key === 'ArrowRight' && props.index < props.photos.length - 1) emit('navigate', props.index + 1)
      if (e.key === 'ArrowLeft' && props.index > 0) emit('navigate', props.index - 1)
    }
    onMounted(() => window.addEventListener('keydown', onKey))
    onUnmounted(() => window.removeEventListener('keydown', onKey))
    return { root, current, src, caption, download, onFavorite, pickerOpen }
  }
})
</script>

<style scoped>
.viewer {
  position: fixed; inset: 0; z-index: 100; display: flex; flex-direction: column;
  background: rgba(0, 0, 0, 0.96);
}
.viewer-top {
  display: flex; align-items: flex-start; justify-content: space-between; gap: 16px;
  padding: 10px 16px;
}
.viewer-meta { display: flex; flex-direction: column; min-width: 0; }
.viewer-name { color: #eee; font-size: 0.9rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.viewer-caption { color: #9aa0a6; font-size: 0.78rem; }
.viewer-actions { display: flex; align-items: center; gap: 10px; flex: 0 0 auto; }
.viewer-btn {
  display: inline-flex; align-items: center; justify-content: center;
  width: 44px; height: 44px; border: 0; border-radius: 50%; cursor: pointer;
  background: rgba(255, 255, 255, 0.14); color: #fff;
}
.viewer-btn:hover { background: rgba(255, 255, 255, 0.26); }
.viewer-btn.is-fav { background: rgba(224, 49, 49, 0.75); }
.viewer-close { background: rgba(255, 255, 255, 0.2); }
.viewer-close:hover { background: rgba(255, 255, 255, 0.34); }
.viewer-stage { flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center; padding: 0 8px 8px; }
.viewer-media { max-width: 100%; max-height: 100%; width: auto; height: auto; object-fit: contain; }
.viewer-loading { color: #aaa; font-size: 0.85rem; }
.viewer-arrow {
  position: absolute; top: 50%; transform: translateY(-50%); z-index: 101;
  font-size: 2.5rem; color: #fff; background: rgba(0, 0, 0, 0.45); border: 0;
  border-radius: 50%; width: 56px; height: 56px; cursor: pointer; line-height: 1;
}
.viewer-arrow.left { left: 12px; }
.viewer-arrow.right { right: 12px; }
</style>
