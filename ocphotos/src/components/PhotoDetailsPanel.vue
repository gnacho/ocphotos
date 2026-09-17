<template>
  <aside class="details" :aria-label="$gettext('Details')">
    <header class="details-header">
      <h2 class="details-title" v-text="$gettext('Details')" />
      <button class="details-close" :aria-label="$gettext('Close')" @click="$emit('close')">
        <oc-icon name="close" color="#fff" size="medium" />
      </button>
    </header>

    <div class="details-body">
      <section class="details-section">
        <h3 class="details-h" v-text="$gettext('General')" />
        <dl class="details-dl">
          <template v-if="photo.name">
            <dt v-text="$gettext('Name')" />
            <dd v-text="photo.name" />
          </template>
          <template v-if="date">
            <dt v-text="$gettext('Date taken')" />
            <dd v-text="date" />
          </template>
          <template v-if="dimensions">
            <dt v-text="$gettext('Dimensions')" />
            <dd v-text="dimensions" />
          </template>
          <template v-if="sizeLabel">
            <dt v-text="$gettext('Size')" />
            <dd v-text="sizeLabel" />
          </template>
          <dt v-text="$gettext('Type')" />
          <dd v-text="photo.isVideo ? $gettext('Video') : $gettext('Photo')" />
        </dl>
      </section>

      <section v-if="photo.camera || photo.lens" class="details-section">
        <h3 class="details-h" v-text="$gettext('Camera')" />
        <dl class="details-dl">
          <template v-if="photo.camera">
            <dt v-text="$gettext('Camera')" />
            <dd v-text="photo.camera" />
          </template>
          <template v-if="photo.lens">
            <dt v-text="$gettext('Lens')" />
            <dd v-text="photo.lens" />
          </template>
        </dl>
      </section>

      <section v-if="photo.iso || photo.aperture || photo.shutter || photo.focal" class="details-section">
        <h3 class="details-h" v-text="$gettext('Exposure')" />
        <dl class="details-dl">
          <template v-if="photo.iso">
            <dt v-text="$gettext('ISO')" />
            <dd v-text="String(photo.iso)" />
          </template>
          <template v-if="photo.aperture">
            <dt v-text="$gettext('Aperture')" />
            <dd v-text="photo.aperture" />
          </template>
          <template v-if="photo.shutter">
            <dt v-text="$gettext('Shutter')" />
            <dd v-text="photo.shutter" />
          </template>
          <template v-if="photo.focal">
            <dt v-text="$gettext('Focal length')" />
            <dd v-text="photo.focal" />
          </template>
        </dl>
      </section>

      <section v-if="photo.lat != null && photo.lon != null" class="details-section">
        <h3 class="details-h" v-text="$gettext('Location')" />
        <p class="details-coords">{{ photo.lat.toFixed(5) }}, {{ photo.lon.toFixed(5) }}</p>
      </section>

      <section class="details-section">
        <h3 class="details-h" v-text="$gettext('Tags')" />
        <div v-if="tags.length" class="details-chips">
          <span v-for="t in tags" :key="t" class="details-chip" v-text="t" />
        </div>
        <p v-else class="details-empty" v-text="$gettext('No tags')" />
      </section>

      <section class="details-section">
        <h3 class="details-h" v-text="$gettext('Albums')" />
        <ul v-if="albums.length" class="details-list">
          <li v-for="a in albums" :key="a.id" v-text="a.name" />
        </ul>
        <p v-else class="details-empty" v-text="$gettext('No albums')" />
      </section>
    </div>
  </aside>
</template>

<script lang="ts">
import { computed, defineComponent, PropType, ref, watch } from 'vue'
import { usePhotoLibrary, Photo, Album } from '../composables/usePhotoLibrary'

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${kb.toFixed(1)} KB`
  const mb = kb / 1024
  if (mb < 1024) return `${mb.toFixed(1)} MB`
  return `${(mb / 1024).toFixed(1)} GB`
}

export default defineComponent({
  name: 'PhotoDetailsPanel',
  props: {
    photo: { type: Object as PropType<Photo>, required: true }
  },
  emits: ['close'],
  setup(props) {
    const { assetTags, albumsOfAsset } = usePhotoLibrary()
    const tags = ref<string[]>([])
    const albums = ref<Album[]>([])

    const load = async () => {
      const id = props.photo.id
      const [t, al] = await Promise.all([
        assetTags(id).catch(() => [] as string[]),
        albumsOfAsset(id).catch(() => [] as Album[])
      ])
      if (props.photo.id === id) {
        tags.value = t
        albums.value = al
      }
    }

    watch(() => props.photo.id, load, { immediate: true })

    const date = computed(() => {
      if (!props.photo.takenAt) return ''
      return new Intl.DateTimeFormat(navigator.language || 'en', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }).format(new Date(props.photo.takenAt * 1000))
    })

    const dimensions = computed(() =>
      props.photo.width && props.photo.height ? `${props.photo.width} × ${props.photo.height}` : ''
    )

    const sizeLabel = computed(() => (props.photo.size ? formatSize(props.photo.size) : ''))

    return { tags, albums, date, dimensions, sizeLabel }
  }
})
</script>

<style scoped>
.details {
  position: absolute; top: 0; right: 0; bottom: 0; width: 320px; max-width: 92vw;
  z-index: 102; display: flex; flex-direction: column;
  background: rgba(22, 22, 24, 0.98); color: #e6e6e6;
  border-left: 1px solid rgba(255, 255, 255, 0.14);
}
.details-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 16px; border-bottom: 1px solid rgba(255, 255, 255, 0.12);
}
.details-title { margin: 0; font-size: 1rem; font-weight: 600; color: #fff; }
.details-close {
  display: inline-flex; align-items: center; justify-content: center;
  width: 40px; height: 40px; border: 0; border-radius: 50%; cursor: pointer; background: none;
}
.details-close:hover { background: rgba(255, 255, 255, 0.14); }
.details-body { flex: 1; overflow-y: auto; padding: 12px 16px; }
.details-section { margin-bottom: 16px; }
.details-h {
  margin: 0 0 6px; font-size: 0.72rem; font-weight: 600; text-transform: uppercase;
  letter-spacing: 0.05em; color: #9aa0a6;
}
.details-dl { margin: 0; display: grid; grid-template-columns: 96px 1fr; gap: 4px 10px; }
.details-dl dt { color: #9aa0a6; font-size: 0.82rem; }
.details-dl dd { margin: 0; color: #eee; font-size: 0.82rem; overflow-wrap: anywhere; }
.details-coords { margin: 0; font-size: 0.82rem; color: #eee; overflow-wrap: anywhere; }
.details-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.details-chip {
  display: inline-flex; padding: 4px 10px; border-radius: 999px;
  background: rgba(255, 255, 255, 0.16); color: #fff; font-size: 0.8rem;
}
.details-list { margin: 0; padding-left: 18px; font-size: 0.82rem; color: #eee; }
.details-empty { margin: 0; font-size: 0.82rem; color: #9aa0a6; }
</style>
