<template>
  <div class="w-full min-w-0 flex flex-wrap items-center gap-1 bg-white p-2 border rounded-md text-sm break-words">
    <input
      type="checkbox"
      v-model="localItem.checked"
      @change="emitUpdate"
      :disabled="localItem.readonly"
      class="h-4 w-4 text-green-500 border-gray-300 rounded"
    />
    <span class="w-[60px] truncate">{{ localItem.name }}</span>

    <span class="text-gray-500">單價</span>
    <input
      type="number"
      v-model.number="localItem.price"
      @change="emitUpdate"
      class="w-[60px] p-1 border rounded-md"
     :disabled="localItem.readonly"
    />

    <span class="text-gray-500">數量</span>
    <input
      type="number"
      v-model.number="localItem.amount"
      @change="emitUpdate"
      class="w-[40px] p-1 border rounded-md"
      :disabled="localItem.readonly"
    />

    <span class="text-gray-500">備註</span>
    <input
      type="text"
      v-model="localItem.note"
      @change="emitUpdate"
      class="w-[80px] p-1 border rounded-md"
      :disabled="localItem.readonly"
    />

    <span class="text-gray-500">單位</span>
    <input
      type="text"
      v-model="localItem.unit"
      @change="emitUpdate"
      class="w-[30px] p-1 border rounded-md"
      :disabled="localItem.readonly"
    />
  </div>
</template>

<script setup>
import { reactive } from 'vue';

const props = defineProps({
  item: {
    type: Object,
    required: true,
  },
});

const emit = defineEmits(['update']);
const localItem = reactive({ ...props.item });

const emitUpdate = () => {
  emit('update', { ...localItem });
};
</script>
