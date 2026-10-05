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
import { useRouteParam, useRouteQuery, useRouter } from '@opencloud-eu/web-pkg'
import { usePhotoLibrary, Photo } from '../composables/usePhotoLibrary'
import ViewerOverlay from '../components/ViewerOverlay.vue'

export default defineComponent({
  name: 'FileOpenView',
  components: { ViewerOverlay },
  setup() {
    // los composables de vue-router crudos no resuelven contra la instancia del
    // router del host dentro de la app federada: hay que usar los de web-pkg
    // (E2E drive.domatix.cloud: crash "reading 'params'" con useRoute()).
    const driveAliasAndItem = useRouteParam('driveAliasAndItem', '')
    const fileId = useRouteQuery('fileId', '')
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
      const dai = typeof driveAliasAndItem.value === 'string' ? driveAliasAndItem.value : ''
      const fid = typeof fileId.value === 'string' && fileId.value ? fileId.value : undefined
      try {
        photo.value = await resolveFromFiles(dai, fid)
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
