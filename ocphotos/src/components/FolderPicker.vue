<template>
  <div class="fp-backdrop" @click.self="$emit('close')">
    <div class="fp-modal" role="dialog" aria-modal="true">
      <header class="fp-header">
        <h2 v-text="$gettext('Choose photo folder')" />
        <oc-button appearance="raw" :aria-label="$gettext('Close')" @click="$emit('close')">
          <oc-icon name="close" size="small" />
        </oc-button>
      </header>

      <nav class="fp-breadcrumb">
        <button class="fp-crumb" @click="go('')" v-text="$gettext('Personal space')" />
        <template v-for="(seg, i) in segments" :key="i">
          <span class="fp-sep">/</span>
          <button class="fp-crumb" @click="go(segments.slice(0, i + 1).join('/'))" v-text="seg" />
        </template>
      </nav>

      <div class="fp-list">
        <p v-if="loading" class="fp-note" v-text="$gettext('Loading…')" />
        <p v-else-if="folders.length === 0" class="fp-note" v-text="$gettext('No subfolders here')" />
        <button v-for="f in folders" :key="f.path" class="fp-folder" @click="go(f.path)">
          <oc-icon name="folder" size="small" />
          <span v-text="f.name" />
        </button>
      </div>

      <footer class="fp-footer">
        <span class="fp-current" v-text="cwd || $gettext('Personal space (all)')" />
        <oc-button appearance="filled" color-role="primary" @click="$emit('select', cwd)">
          {{ $gettext('Use this folder') }}
        </oc-button>
      </footer>
    </div>
  </div>
</template>

<script lang="ts">
import { computed, defineComponent, onMounted, ref } from 'vue'
import { usePhotoLibrary } from '../composables/usePhotoLibrary'
import type { Resource } from '@opencloud-eu/web-client'

export default defineComponent({
  name: 'FolderPicker',
  props: { current: { type: String, default: '' } },
  emits: ['select', 'close'],
  setup(props) {
    const { listFolders } = usePhotoLibrary()
    const cwd = ref(props.current || '')
    const folders = ref<Resource[]>([])
    const loading = ref(false)

    const segments = computed(() => cwd.value.split('/').filter(Boolean))

    const load = async (path: string) => {
      cwd.value = path
      loading.value = true
      try {
        folders.value = await listFolders(path)
      } catch {
        folders.value = []
      } finally {
        loading.value = false
      }
    }

    const go = (path: string): void => {
      void load(path)
    }
    onMounted((): void => {
      void load(cwd.value)
    })

    return { cwd, folders, loading, segments, go }
  }
})
</script>

<style scoped>
.fp-backdrop {
  position: fixed; inset: 0; z-index: var(--z-index-modal, 9999);
  display: flex; align-items: center; justify-content: center;
  background: rgba(0, 0, 0, 0.5);
}
.fp-modal {
  display: flex; flex-direction: column; width: min(560px, 92vw); max-height: 80vh;
  background: var(--oc-role-surface, #fff); color: var(--oc-role-on-surface, #191c1d);
  border-radius: 12px; overflow: hidden;
  border: 1px solid var(--oc-role-outline-variant, #bfc8cc);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.35);
}
.fp-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 16px; border-bottom: 1px solid var(--oc-role-outline-variant, #bfc8cc);
}
.fp-header h2 { margin: 0; font-size: 1rem; font-weight: 600; }
.fp-breadcrumb {
  display: flex; flex-wrap: wrap; align-items: center; gap: 2px;
  padding: 8px 16px; font-size: 0.85rem;
}
.fp-crumb { border: 0; background: none; cursor: pointer; color: var(--oc-role-primary, #00677f); padding: 0 2px; }
.fp-sep { color: var(--oc-role-on-surface-variant, #40484c); }
.fp-list { flex: 1; overflow-y: auto; padding: 0 8px; min-height: 180px; }
.fp-note { padding: 16px; color: var(--oc-role-on-surface-variant, #40484c); text-align: center; }
.fp-folder {
  display: flex; align-items: center; gap: 8px; width: 100%;
  padding: 8px; border: 0; border-radius: 6px; cursor: pointer;
  background: none; color: var(--oc-role-on-surface, #191c1d); text-align: left;
}
.fp-folder:hover { background: var(--oc-role-surface-container, #f6f8fa); }
.fp-footer {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  padding: 8px 16px; border-top: 1px solid var(--oc-role-outline-variant, #bfc8cc);
}
.fp-current { font-size: 0.8rem; color: var(--oc-role-on-surface-variant, #40484c); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
