<template>
  <div class="viewer" @keydown.esc="$emit('close')" tabindex="0" ref="root">
    <div class="viewer-top">
      <oc-button appearance="raw" :aria-label="$gettext('Cerrar')" @click="$emit('close')">
        <oc-icon name="close" color="#fff" />
      </oc-button>
      <span class="viewer-name">{{ current?.name }}</span>
      <a class="viewer-download" :href="current ? fileUrl(current) : '#'" :download="current?.name">
        <oc-icon name="file-download" color="#fff" />
      </a>
    </div>
    <button v-if="index > 0" class="viewer-arrow left" @click="$emit('navigate', index - 1)">‹</button>
    <div class="viewer-stage" @click.self="$emit('close')">
      <video v-if="current?.isVideo" :src="fileUrl(current)" controls autoplay class="viewer-media" />
      <img v-else-if="current" :src="fileUrl(current)" :alt="current.name" class="viewer-media" />
    </div>
    <button v-if="index < photos.length - 1" class="viewer-arrow right" @click="$emit('navigate', index + 1)">›</button>
  </div>
</template>

<script lang="ts">
import { computed, defineComponent, onMounted, onUnmounted, PropType, ref } from 'vue'
import { Photo } from '../composables/usePhotoLibrary'

export default defineComponent({
  name: 'ViewerOverlay',
  props: {
    photos: { type: Array as PropType<Photo[]>, required: true },
    index: { type: Number, required: true },
    previewUrl: { type: Function as PropType<(p: Photo, size?: number) => string>, required: true },
    fileUrl: { type: Function as PropType<(p: Photo) => string>, required: true }
  },
  emits: ['close', 'navigate'],
  setup(props, { emit }) {
    const root = ref<HTMLElement | null>(null)
    const current = computed(() => props.photos[props.index])
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') emit('close')
      if (e.key === 'ArrowRight' && props.index < props.photos.length - 1) emit('navigate', props.index + 1)
      if (e.key === 'ArrowLeft' && props.index > 0) emit('navigate', props.index - 1)
    }
    onMounted(() => window.addEventListener('keydown', onKey))
    onUnmounted(() => window.removeEventListener('keydown', onKey))
    return { root, current }
  }
})
</script>

<style scoped>
.viewer {
  position: fixed; inset: 0; z-index: 100; display: flex; flex-direction: column;
  background: rgba(0, 0, 0, 0.93);
}
.viewer-top {
  display: flex; align-items: center; justify-content: space-between;
  padding: var(--oc-space-small) var(--oc-space-medium);
}
.viewer-name { color: #ddd; font-size: 0.85rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.viewer-download { padding: 4px; }
.viewer-stage { flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center; }
.viewer-media { max-width: 100%; max-height: 100%; object-fit: contain; }
.viewer-arrow {
  position: absolute; top: 50%; transform: translateY(-50%); z-index: 101;
  font-size: 2.5rem; color: #fff; background: rgba(0, 0, 0, 0.4); border: 0;
  border-radius: 50%; width: 52px; height: 52px; cursor: pointer; line-height: 1;
}
.viewer-arrow.left { left: 12px; }
.viewer-arrow.right { right: 12px; }
</style>
