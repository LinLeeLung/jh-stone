<template>
  <div class="mb-2">
    <label> 顯示所有項目 (請在此取消選取)</label>
    <input type="checkbox" v-model="showAll" class="mr-1" />
  </div>

  <div class="grid grid-cols-3 gap-2">
    <ItemRow
      v-for="(item, index) in filteredItems"
      :key="`${item.id}-${index}`"
      :item="item"
      @update="onItemUpdate(index, $event)"
    />
  </div>
</template>

<script setup>
import { ref, watch, computed, onBeforeUnmount } from "vue";
import ItemRow from "./ItemRow.vue";

const props = defineProps({ items: Array });
const emit = defineEmits(["update:items"]);

const showAll = ref(false);
const localItems = ref([]);
let prevItems = JSON.stringify([]);
let emitTimer = null;

const isLoading = ref(false);

// ✅ props.items → localItems（深拷貝）
watch(
  () => props.items,
  (val) => {
    if (val) {
      isLoading.value = true;
      localItems.value = JSON.parse(JSON.stringify(val));
      prevItems = JSON.stringify(localItems.value);
      isLoading.value = false;
      // console.log("items:", val);
    }
  },
  { immediate: true, deep: true }
);

// ✅ localItems 改動 → emit 給父層（防抖處理）
watch(
  localItems,
  (val) => {
    if (!isLoading.value) {
      clearTimeout(emitTimer);
      emitTimer = setTimeout(() => {
        const current = JSON.stringify(val);
        if (current !== prevItems) {
          prevItems = current;
          emit("update:items", JSON.parse(current));
        }
      }, 100);
    }
  },
  { deep: true }
);

const filteredItems = computed(() =>
  showAll.value
    ? localItems.value
    : localItems.value.filter((item) => item.checked)
);

const onItemUpdate = (index, updatedItem) => {
  localItems.value[index] = { ...updatedItem };
  console.log("localItems:", localItems.value);
};

onBeforeUnmount(() => {
  clearTimeout(emitTimer);
});
</script>
