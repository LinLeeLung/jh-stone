<template>
  <div>
    <div mt-2>
      <h3 class="text-lg font-semibold text-gray-700 mb-2 center">計價結果</h3>
      <div class="t16 flex justify-between">
        估價日期：{{ currentDate }} PS:報價有效期間一個月
        石材庫存以代理商現貨為主
      </div>
    </div>

    <div class="overflow-x-auto w-full max-w-full">
      <table class="w-full table-fixed border-collapse border border-gray-400">
        <!-- ✅ 使用 colgroup 控制欄寬 -->
        <colgroup>
          <col
            v-for="(width, index) in localColumnWidths"
            :key="'col-' + index"
            :style="{ width: width + 'px' }"
          />
        </colgroup>
        <thead>
          <tr>
            <th
              v-for="(header, index) in headers"
              :key="index"
              :style="{
                width: localColumnWidths[index] + 'px',
                position: 'relative',
              }"
              class="border p-2 bg-gray-200 text-left min-w-[40px] group resize-x"
            >
              {{ header }}
              <!-- ✅ 只出現在 th 裡的 resize-handle -->
              <div
                class="resize-handle"
                @mousedown.prevent="startResize($event, index)"
              ></div>
            </th>
          </tr>
        </thead>
        <tbody>
          <!-- Shape Results -->
          <template v-for="(result, index) in filteredResults" :key="index">
            <template v-if="result.detail">
              <tr>
                <td class="border p-2" :rowspan="result.detail.side3 ? 3 : 2">
                  {{
                    (index.startsWith("L")
                      ? "L型"
                      : index.startsWith("M")
                      ? "M型"
                      : "") + index.replace(/^[A-Z]/, "")
                  }}
                </td>
                <td class="border p-2">{{ result.detail.side1.frontEdge }}</td>
                <td class="border p-2">{{ result.detail.side1.backWall }}</td>
                <td class="border p-2">
                  {{
                    result.detail.side1.wrapBack
                      ? result.detail.side1.wrapBack
                      : ""
                  }}
                </td>
                <td
                  class="border p-2 sumary text-left"
                  :rowspan="result.detail.side3 ? 3 : 2"
                >
                  {{ result.sumary }}
                </td>
                <td class="border p-2" :rowspan="result.detail.side3 ? 3 : 2">
                  {{ result.color }}
                </td>
                <td class="border p-2">{{ result.detail.side1.length }}</td>
                <td class="border p-2">{{ result.detail.side1.depth }}</td>
                <td class="border p-2" :rowspan="result.detail.side3 ? 3 : 2">
                  {{ result.roundedCentimeters }}
                </td>
                <td class="border p-2" :rowspan="result.detail.side3 ? 3 : 2">
                  cm
                </td>
                <td class="border p-2" :rowspan="result.detail.side3 ? 3 : 2">
                  {{ result.unitPrice }}
                </td>
                <td class="border p-2" :rowspan="result.detail.side3 ? 3 : 2">
                  {{ result.subtotal.toLocaleString() }}
                </td>
                <td
                  class="border p-2 text-left whitespace-pre-line"
                  :rowspan="result.detail.side3 ? 3 : 2"
                >
                  {{ result.calculationSteps }}
                </td>
                <td
                  class="note border p-2 whitespace-pre-line text-left"
                  :rowspan="result.detail.side3 ? 3 : 2"
                >
                  {{ result.note }}
                </td>
              </tr>
              <tr>
                <td class="border p-2">{{ result.detail.side2.frontEdge }}</td>
                <td class="border p-2">{{ result.detail.side2.backWall }}</td>
                <td class="border p-2">
                  {{
                    result.detail.side2.wrapBack
                      ? result.detail.side2.wrapBack
                      : ""
                  }}
                </td>
                <td class="border p-2">{{ result.detail.side2.length }}</td>
                <td class="border p-2">{{ result.detail.side2.depth }}</td>
              </tr>
              <tr v-if="result.detail.side3">
                <td class="border p-2">{{ result.detail.side3.frontEdge }}</td>
                <td class="border p-2">
                  {{
                    result.detail.side3.backWall
                      ? result.detail.side3.backWall
                      : ""
                  }}
                </td>
                <td class="border p-2">
                  {{
                    result.detail.side3.wrapBack
                      ? result.detail.side3.wrapBack
                      : ""
                  }}
                </td>
                <td class="border p-2">{{ result.detail.side3.length }}</td>
                <td class="border p-2">{{ result.detail.side3.depth }}</td>
              </tr>
            </template>
            <template v-else>
              <tr>
                <td class="border p-2">{{ index }}</td>
                <td class="border p-2">{{ result.frontEdge }}</td>
                <td class="border p-2">
                  {{ result.backWall || result.backEdge }}
                </td>
                <td class="border p-2">
                  {{ formatWrapDetails(index, result) }}
                </td>
                <td class="border p-2 sumary text-left">{{ result.sumary }}</td>
                <td class="border p-2">{{ result.color }}</td>
                <td class="border p-2">{{ result.length }}</td>
                <td class="border p-2">{{ result.depth }}</td>
                <td class="border p-2">{{ result.roundedCentimeters }}</td>
                <td class="border p-2">cm</td>
                <td class="border p-2">{{ result.unitPrice }}</td>
                <td class="border p-2">
                  {{ result.subtotal.toLocaleString() }}
                </td>
                <td class="border p-2 text-left">
                  {{ result.calculationSteps }}
                </td>
                <td class="border p-2 whitespace-pre-line text-left note">
                  {{
                    !result.note && result.index.includes("倒包")
                      ? "台面下倒包" + result.color
                      : result.note
                  }}
                </td>
              </tr>
            </template>
          </template>
          <!-- Item Results -->
          <tr v-for="(item, idx) in filteredItems" :key="'item-' + idx">
            <td class="border p-2">{{ item.name }}</td>
            <td class="border p-2"></td>
            <td class="border p-2"></td>
            <td class="border p-2"></td>
            <td class="border p-2"></td>
            <td class="border p-2"></td>
            <td class="border p-2"></td>
            <td class="border p-2"></td>
            <td class="border p-2">{{ item.amount }}</td>
            <td class="border p-2">{{ item.unit }}</td>
            <td class="border p-2">{{ item.price }}</td>
            <td class="border p-2">
              {{ (item.price * item.amount).toLocaleString() }}
            </td>
            <td class="border p-2"></td>
            <td class="border p-2 text-left">{{ item.note }}</td>
          </tr>
          <!-- Total -->
          <tr>
            <td colspan="10" class="border p-2 text-right">總計:</td>
            <td colspan="2" class="border p-2">
              {{ totalSubtotal.toLocaleString() }} (未稅)
            </td>
            <td colspan="2" class="border p-2">
              {{ Math.round(totalSubtotal * 1.05).toLocaleString() }} (含稅)
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
<script setup>
import { ref, onMounted, watch, computed } from "vue";
const currentDate = computed(() => new Date().toISOString().split("T")[0]);
const emit = defineEmits(["update:columnWidths"]);

const props = defineProps({
  filteredResults: { type: Object, default: () => ({}) },
  filteredItems: { type: Array, default: () => [] },
  totalSubtotal: { type: Number, default: 0 },
  columnWidths: { type: Array, default: () => [] },
});

const headers = [
  "項目",
  "前沿",
  "背牆/後厚",
  "倒包",
  "摘要",
  "顏色",
  "長",
  "深",
  "公分數/數量",
  "單位",
  "單價",
  "未稅價",
  "計算過程",
  "備註",
];

const localColumnWidths = ref([]);

// ✅ 初始化與監聽 props.columnWidths 的變化
watch(
  () => props.columnWidths,
  (newVal) => {
    if (Array.isArray(newVal) && newVal.length > 0) {
      localColumnWidths.value = [...newVal];
    }
  },
  { immediate: true, deep: true }
);

// ✅ 使用者手動調整欄寬時回傳給父元件
watch(
  localColumnWidths,
  (val) => {
    emit("update:columnWidths", val);
  },
  { deep: true }
);

function startResize(e, index) {
  const startX = e.clientX;
  const startWidth = localColumnWidths.value[index];

  const onMouseMove = (moveEvent) => {
    const delta = moveEvent.clientX - startX;
    localColumnWidths.value[index] = Math.max(40, startWidth + delta);
  };

  const onMouseUp = () => {
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("mouseup", onMouseUp);
  };

  window.addEventListener("mousemove", onMouseMove);
  window.addEventListener("mouseup", onMouseUp);
}

function formatWrapDetails(index, result) {
  const parts = [];
  const isValid = (val) =>
    val !== undefined && val !== null && val !== "" && val !== 0;
  if (index.includes("中島")) {
    if (isValid(result.wrapFront)) parts.push(`前:${result.wrapFront}`);
    if (isValid(result.wrapBack)) parts.push(`後:${result.wrapBack}`);
    if (isValid(result.wrapLeft)) parts.push(`左:${result.wrapLeft}`);
    if (isValid(result.wrapRight)) parts.push(`右:${result.wrapRight}`);
    return parts.join(" ");
  }
  if (index.includes("腳")) {
    if (isValid(result.wrapFront)) parts.push(`前:${result.wrapFront}`);
    if (isValid(result.wrapBack)) parts.push(`後:${result.wrapBack}`);
    return parts.join(" ");
  }
  return isValid(result.wrapBack) ? result.wrapBack : "";
}
</script>

<style scoped>
.table-fixed th,
.table-fixed td {
  overflow-x: hidden;
  white-space: nowrap;
  position: relative;
  user-select: text; /* ✅ 開啟可選文字 */
}

.resize-handle {
  position: absolute;
  top: 0;
  right: -2px;
  width: 6px;
  height: 100%;
  cursor: col-resize;
  z-index: 10;
  background-color: transparent;
  user-select: none; /* ✅ 僅限拖曳手柄不可選取 */
}
</style>
