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
        <button v-if="current" class="viewer-btn" :class="{ 'is-fav': tagsOpen }" :aria-label="$gettext('Add tag')" @click="toggleTags">
          <oc-icon name="price-tag-3" color="#fff" size="medium" />
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

    <div v-if="tagsOpen && current" class="viewer-tags">
      <span v-for="t in tags" :key="t" class="viewer-tag">
        <span v-text="t" />
        <button class="viewer-tag-x" :aria-label="$gettext('Remove')" @click="dropTag(t)">×</button>
      </span>
      <form @submit.prevent="submitTag">
        <input v-model="newTag" class="viewer-tag-input" :placeholder="$gettext('New tag…')" />
      </form>
    </div>

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
    const { toggleFavorite, assetTags, addTag, removeTag } = usePhotoLibrary()
    const root = ref<HTMLElement | null>(null)
    const src = ref('')
    const pickerOpen = ref(false)
    const tagsOpen = ref(false)
    const tags = ref<string[]>([])
    const newTag = ref('')

    const current = computed(() => props.photos[props.index])

    const loadTags = async () => {
      if (!current.value) return
      tags.value = await assetTags(current.value.id)
    }
    const toggleTags = async () => {
      tagsOpen.value = !tagsOpen.value
      if (tagsOpen.value) await loadTags()
    }
    const submitTag = async () => {
      const t = newTag.value.trim()
      if (!t || !current.value) return
      await addTag(current.value.id, t)
      newTag.value = ''
      await loadTags()
    }
    const dropTag = async (t: string) => {
      if (!current.value) return
      await removeTag(current.value.id, t)
      await loadTags()
    }

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
    return { root, current, src, caption, download, onFavorite, pickerOpen, tagsOpen, tags, newTag, toggleTags, submitTag, dropTag }
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
.viewer-tags {
  display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 8px 16px;
  background: rgba(255, 255, 255, 0.06);
}
.viewer-tag {
  display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 999px;
  background: rgba(255, 255, 255, 0.16); color: #fff; font-size: 0.82rem;
}
.viewer-tag-x { border: 0; background: none; color: #fff; cursor: pointer; font-size: 1rem; line-height: 1; }
.viewer-tag-input {
  padding: 5px 10px; border-radius: 8px; font-size: 0.85rem; min-width: 160px;
  border: 1px solid rgba(255, 255, 255, 0.3); background: rgba(0, 0, 0, 0.4); color: #fff;
}
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
