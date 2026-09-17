<template>
  <div class="file-open-view">
    <div v-if="loading" class="file-open-note" v-text="$gettext('Loading…')" />
    <div v-else-if="!photo" class="file-open-note" v-text="$gettext('Photo not found')" />
    <viewer-overlay
      v-else
      :photos="photos"
      :index="0"
      :ensure-preview="ensurePreview"
      :ensure-original="ensureOriginal"
      @close="close"
    />
  </div>
</template>

<script lang="ts">
import { computed, defineComponent, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { usePhotoLibrary, Photo } from '../composables/usePhotoLibrary'
import ViewerOverlay from '../components/ViewerOverlay.vue'

export default defineComponent({
  name: 'FileOpenView',
  components: { ViewerOverlay },
  setup() {
    const route = useRoute()
    const router = useRouter()
    const { resolveFromFiles, ensurePreview, ensureOriginal } = usePhotoLibrary()

    const loading = ref(true)
    const photo = ref<Photo | null>(null)

    // el visor espera una lista; con "Abrir con" solo hay un fichero
    const photos = computed(() => (photo.value ? [photo.value] : []))

    const close = () => {
      // vuelve a Files (o a donde se estuviera antes de "Abrir con")
      router.back()
    }

    onMounted(async () => {
      const driveAliasAndItem =
        typeof route.params.driveAliasAndItem === 'string' ? route.params.driveAliasAndItem : ''
      const fileId = typeof route.query.fileId === 'string' ? route.query.fileId : undefined
      try {
        photo.value = await resolveFromFiles(driveAliasAndItem, fileId)
      } finally {
        loading.value = false
      }
    })

    return { loading, photo, photos, ensurePreview, ensureOriginal, close }
  }
})
</script>

<style scoped>
.file-open-view { height: 100%; }
.file-open-note {
  display: flex; align-items: center; justify-content: center;
  height: 100%; padding: 32px; color: var(--oc-role-on-surface-variant, #40484c);
}
</style>
