<template>
  <draggable v-model="entryOrderList" item-key="id" class="grid gap-4 one-card-container" :animation="200">
    <template #item="{ element: id }">
      <div class="relative border border-gray-300 rounded-lg p-2 bg-white">
        <div class="flex justify-between items-center mb-1">
          <span class="font-semibold text-sm text-gray-700">{{ id }}</span>
          <div class="flex gap-2">
            <button
              @click="$emit('toggleCollapse', id)"
              class="text-xs text-blue-600 underline hover:text-blue-800"
            >
              {{ collapseMap[id] ? '展開' : '收起' }}
            </button>
            <button
              @click="removeById(id)"
              class="bg-red-500 text-white text-xs px-2 py-1 rounded hover:bg-red-600"
            >✖</button>
          </div>
        </div>

        <transition name="fade">
          <div v-show="!collapseMap[id]">
            <component
              :is="getCardComponent(id)"
              :sepPrice="sepPrice"
              :index="id"
              :initialValue="resultsProxy[id]"
              @update-result="updateResultWithInitCollapse"
            />
          </div>
        </transition>
      </div>
    </template>
  </draggable>
</template>

<script setup>
import draggable from 'vuedraggable'
import One from './One.vue'
import L from './L.vue'
import M from './M.vue'
import Iland from './Iland.vue'
import Leg from './Leg.vue'
import Wrap from './Wrap.vue'
import DoorFront from './DoorFront.vue'
import Wall from './Wall.vue'

const props = defineProps({
  entryOrderList: Array,
  resultsProxy: Object,
  sepPrice: Number,
  updateResult: Function,
  removeMap: Object,
  collapseMap: Object
})

const emit = defineEmits(['toggleCollapse'])

const getCardComponent = (id) => {
  if (id.startsWith('一字型')) return One
  if (id.startsWith('L')) return L
  if (id.startsWith('M')) return M
  if (id.startsWith('中島')) return Iland
  if (id.startsWith('側落腳')) return Leg
  if (id.startsWith('倒包')) return Wrap
  if (id.startsWith('假腳或門檻')) return DoorFront
  if (id.startsWith('高背')) return Wall
  return null
}

const removeById = (id) => {
  const prefix = Object.keys(props.removeMap).find(type => id.startsWith(type))
  if (prefix) props.removeMap[prefix](id)
}

// 包裝 update-result，確保卡片預設展開
const updateResultWithInitCollapse = (result) => {
  if (!(result.index in props.collapseMap)) {
    props.collapseMap[result.index] = false
  }
  props.updateResult(result)
}
</script>

<style scoped>
:deep(.one-card-container) {
  display: grid;
  grid-template-columns: repeat(1, minmax(0, 1fr));
  gap: 1rem;
}
@media (min-width: 640px) {
  :deep(.one-card-container) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (min-width: 1024px) {
  :deep(.one-card-container) {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
.fade-enter-active, .fade-leave-active {
  transition: opacity 0.3s ease;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}
</style>
