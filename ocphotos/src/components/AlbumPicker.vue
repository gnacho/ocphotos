<template>
  <div class="ap-backdrop" @click.self="$emit('close')">
    <div class="ap-modal" role="dialog" aria-modal="true">
      <header class="ap-header">
        <h2 v-text="$gettext('Add to album')" />
        <button class="ap-x" :aria-label="$gettext('Close')" @click="$emit('close')">×</button>
      </header>

      <div class="ap-list">
        <p v-if="albums.length === 0" class="ap-note" v-text="$gettext('No albums yet')" />
        <button
          v-for="a in albums"
          :key="a.id"
          class="ap-item"
          :class="{ sel: selected === a.id }"
          @click="selected = a.id"
        >
          <span v-text="a.name" />
          <span class="ap-item-count" v-text="String(a.count)" />
        </button>
      </div>

      <form class="ap-new" @submit.prevent="createAndAdd">
        <input v-model="newName" class="ap-input" :placeholder="$gettext('New album')" />
        <button type="submit" class="ap-btn" v-text="$gettext('Create')" />
      </form>

      <footer class="ap-footer">
        <button class="ap-btn ap-btn-primary" :disabled="!selected" @click="add" v-text="$gettext('Add')" />
      </footer>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, onMounted, ref } from 'vue'
import { usePhotoLibrary, Album } from '../composables/usePhotoLibrary'

export default defineComponent({
  name: 'AlbumPicker',
  props: {
    assetId: { type: Number, required: true }
  },
  emits: ['close', 'added'],
  setup(props, { emit }) {
    const { fetchAlbums, createAlbum, addToAlbum } = usePhotoLibrary()
    const albums = ref<Album[]>([])
    const selected = ref<number | null>(null)
    const newName = ref('')

    onMounted(async () => {
      albums.value = await fetchAlbums()
    })

    const add = async () => {
      if (!selected.value) return
      await addToAlbum(selected.value, [props.assetId])
      emit('added')
      emit('close')
    }

    const createAndAdd = async () => {
      const name = newName.value.trim()
      if (!name) return
      const id = await createAlbum(name)
      newName.value = ''
      await addToAlbum(id, [props.assetId])
      emit('added')
      emit('close')
    }

    return { albums, selected, newName, add, createAndAdd }
  }
})
</script>

<style scoped>
.ap-backdrop {
  position: fixed; inset: 0; z-index: var(--z-index-modal, 9999);
  display: flex; align-items: center; justify-content: center; background: rgba(0, 0, 0, 0.5);
}
.ap-modal {
  display: flex; flex-direction: column; width: min(460px, 92vw); max-height: 80vh;
  background: var(--oc-role-surface, #fff); color: var(--oc-role-on-surface, #191c1d);
  border-radius: 12px; overflow: hidden; border: 1px solid var(--oc-role-outline-variant, #bfc8cc);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.35);
}
.ap-header { display: flex; align-items: center; justify-content: space-between; padding: 10px 16px; border-bottom: 1px solid var(--oc-role-outline-variant, #bfc8cc); }
.ap-header h2 { margin: 0; font-size: 1rem; font-weight: 600; }
.ap-x { border: 0; background: none; font-size: 1.4rem; line-height: 1; cursor: pointer; color: inherit; }
.ap-list { flex: 1; overflow-y: auto; padding: 6px 8px; min-height: 120px; }
.ap-note { color: var(--oc-role-on-surface-variant, #40484c); text-align: center; padding: 16px; }
.ap-item {
  display: flex; justify-content: space-between; gap: 10px; width: 100%; padding: 9px 10px;
  border: 0; border-radius: 8px; cursor: pointer; text-align: left; background: none; color: inherit; font-size: 0.9rem;
}
.ap-item:hover { background: var(--oc-role-surface-container, #f6f8fa); }
.ap-item.sel { background: var(--oc-role-primary, #00677f); color: #fff; }
.ap-item-count { color: var(--oc-role-on-surface-variant, #40484c); }
.ap-item.sel .ap-item-count { color: #fff; }
.ap-new { display: flex; gap: 8px; padding: 8px 16px; border-top: 1px solid var(--oc-role-outline-variant, #bfc8cc); }
.ap-input {
  flex: 1; padding: 7px 10px; border-radius: 8px; font-size: 0.9rem;
  border: 1px solid var(--oc-role-outline-variant, #bfc8cc);
  background: var(--oc-role-surface, #fff); color: var(--oc-role-on-surface, #191c1d);
}
.ap-footer { display: flex; justify-content: flex-end; padding: 8px 16px 12px; }
.ap-btn {
  padding: 7px 14px; border-radius: 8px; cursor: pointer; font-size: 0.9rem;
  border: 1px solid var(--oc-role-outline-variant, #bfc8cc);
  background: var(--oc-role-surface, #fff); color: var(--oc-role-on-surface, #191c1d);
}
.ap-btn-primary { background: var(--oc-role-primary, #00677f); color: #fff; border-color: transparent; }
.ap-btn:disabled { opacity: 0.5; cursor: default; }
</style>
