<template>
  <div class="viewer" @keydown.esc="$emit('close')" tabindex="0" ref="root">
    <div class="viewer-top">
      <oc-button appearance="raw" :aria-label="$gettext('Cerrar')" @click="$emit('close')">
        <oc-icon name="close" color="#fff" />
      </oc-button>
      <span class="viewer-name">{{ current?.name }}</span>
      <oc-button appearance="raw" :aria-label="$gettext('Descargar')" @click="download">
        <oc-icon name="file-download" color="#fff" />
      </oc-button>
    </div>
    <button v-if="index > 0" class="viewer-arrow left" @click="$emit('navigate', index - 1)">‹</button>
    <div class="viewer-stage" @click.self="$emit('close')">
      <video v-if="current?.isVideo" :src="src" controls autoplay class="viewer-media" />
      <img v-else-if="current && src" :src="src" :alt="current.name" class="viewer-media" />
      <span v-else-if="current" class="viewer-loading" v-text="$gettext('Cargando…')" />
    </div>
    <button v-if="index < photos.length - 1" class="viewer-arrow right" @click="$emit('navigate', index + 1)">›</button>
  </div>
</template>

<script lang="ts">
import { computed, defineComponent, onMounted, onUnmounted, PropType, ref, watch } from 'vue'
import type { ProcessorType } from '@opencloud-eu/web-pkg'
import { Photo } from '../composables/usePhotoLibrary'

export default defineComponent({
  name: 'ViewerOverlay',
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
    const root = ref<HTMLElement | null>(null)
    const src = ref('')
    const current = computed(() => props.photos[props.index])

    // el host exige la sesión (Bearer), así que las imágenes se piden por la API
    // autenticada y se muestran como blob URL; los vídeos van por el original.
    watch(
      current,
      async (p) => {
        src.value = ''
        if (!p) return
        const url = p.isVideo ? await props.ensureOriginal(p) : await props.ensurePreview(p, 2560, 'fit')
        if (current.value === p) src.value = url
      },
      { immediate: true }
    )

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
    return { root, current, src, download }
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
.viewer-stage { flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center; }
.viewer-media { max-width: 100%; max-height: 100%; object-fit: contain; }
.viewer-loading { color: #aaa; font-size: 0.85rem; }
.viewer-arrow {
  position: absolute; top: 50%; transform: translateY(-50%); z-index: 101;
  font-size: 2.5rem; color: #fff; background: rgba(0, 0, 0, 0.4); border: 0;
  border-radius: 50%; width: 52px; height: 52px; cursor: pointer; line-height: 1;
}
.viewer-arrow.left { left: 12px; }
.viewer-arrow.right { right: 12px; }
</style>
