<template>
  <div class="bg-white p-1 rounded-lg shadow-md w-full min-w-0">
    <!-- 頂部選項列 -->
    <div class="flex flex-wrap gap-2 mb-2 items-center text-sm">
      <!-- <input type="checkbox" v-model="isEnabled" class="h-4 w-4 text-green-500 focus:ring-green-500 border-gray-300 rounded" /> -->
      <h2 class="font-semibold text-gray-700">圓弧造型</h2>

      <label class="whitespace-nowrap">顏色</label>
      <input
        v-model="form.color"
        type="text"
        class="w-[64px] p-1 border rounded-md focus:ring-1 focus:ring-green-500"
      />

      <label class="whitespace-nowrap">摘要</label>
      <input
        v-model="form.sumary"
        type="text"
        class="w-[80px] p-1 border rounded-md"
      />
    </div>

    <!-- 表格改為 Grid -->
    <div class="grid grid-cols-2 gap-2 text-sm">
      <label class="text-gray-600 text-center">圓弧半徑</label>
      <label class="text-gray-600 text-center">堆疊片數</label>

      <input
        v-model.number="form.radius"
        type="number"
        class="p-1 border rounded-md"
      />
      <input
        v-model.number="form.piece"
        type="number"
        class="p-1 border rounded-md"
      />
    </div>

    <!-- 下方選項列 -->
    <div class="flex flex-wrap gap-4 mt-4 text-sm">
      <div class="flex items-center space-x-1">
        <label class="whitespace-nowrap">板材極限 (cm)</label>
        <input
          v-model.number="form.limit"
          type="number"
          class="w-[60px] p-1 border rounded-md"
          min="60"
        />
      </div>
      <div class="flex items-center space-x-1">
        <label class="whitespace-nowrap">單價</label>
        <input
          v-model.number="form.unitPrice"
          type="number"
          class="w-[72px] p-1 border rounded-md"
        />
      </div>
      <div class="flex items-center space-x-1">
        <label class="whitespace-nowrap">備註</label>
        <input
          v-model="form.note"
          type="text"
          class="w-[100px] p-1 border rounded-md"
        />
      </div>
    </div>
  </div>
</template>

<script>
const wages = ref({});

function getRadiusCategory(radius) {
  if (radius >= 75) return "75";
  if (radius >= 60) return "60";
  if (radius >= 45) return "45";
  if (radius >= 30) return "30";
  if (radius >= 20) return "20";
  if (radius >= 10) return "10";
  if (radius >= 2) return "2";
  return null;
}
import { ref, watch, onMounted } from "vue";

export default {
  name: "Arc",
  props: {
    sepPrice: { type: Number, default: 750 },
    index: { type: [String, Number], required: true },
    initialValue: { type: Object, default: () => ({}) },
  },
  emits: ["update-result", "update-wage"],
  setup(props, { emit }) {
    const form = ref({
      radius: 15,
      piece: 3,

      unitPrice: 120,
      color: "CS-201",
      limit: 68,
      sumary: "",
      note: "",
    });

    const isEnabled = ref(true);
    let isLoading = false;

    const calcOneSide = (radius, piece) => {
      const category = getRadiusCategory(radius);
      const wage = wages.value?.[category]?.[piece - 1] ?? 0;
      // console.log("wage=", wage);

      let area = Math.round((radius * radius * piece) / 900);
      let calcSteps2 = `${radius} * ${radius} * ${piece} / 900 = ${area}平方尺`;

      let frontEdgeLength = 0; // 修正這裡
      let cmValue = Math.round((radius * radius * piece) / 60);
      let calcSteps = `${radius}*${radius}*${piece}/60 = ${cmValue} 公分`;

      return { cmValue, calcSteps, area, calcSteps2, frontEdgeLength, wage };
    };

    const calculate = () => {
      if (isLoading) return;

      if (!isEnabled.value) {
        emit("update-result", {
          index: props.index,
          isEnabled: false,
        });
        return;
      }

      const f = form.value;
      const { cmValue, calcSteps, area, calcSteps2, frontEdgeLength, wage } =
        calcOneSide(f.radius, f.piece);

      const roundedValue = Math.round(cmValue);
      const subtotal = roundedValue * f.unitPrice;
      const subtotal2 = area * props.sepPrice;

      emit("update-result", {
        index: props.index,
        isEnabled: true,
        ...f,
        wage,
        roundedCentimeters: roundedValue,
        subtotal: Math.round(subtotal),
        calculationSteps: calcSteps.trim(),
        calculationSteps2: calcSteps2.trim(),
        area,
        subtotal2: Math.round(subtotal2),
        frontEdgeLength,
      });

      // ✅ 工資 emit 放這裡就對了
      emit("update-wage", {
        id: props.index + "-arc-wage",
        name: "圓弧加工費",
        price: wage ?? 0,
        amount: 1,
        checked: true,
        unit: "式",
        detail: `${f.radius}cm×${f.piece}片=${wage ?? 0}`,
        source: props.index,
      });
    };
    // ✅ 當初始值有變動時載入資料
    watch(
      () => props.initialValue,
      (val) => {
        if (val) {
          isLoading = true;
          Object.keys(form.value).forEach((key) => {
            if (val.hasOwnProperty(key)) {
              form.value[key] = val[key];
            }
          });
          isEnabled.value = val.isEnabled ?? false;
          isLoading = false;

          if (isEnabled.value) calculate();
        }
      },
      { immediate: true, deep: true }
    );

    // ✅ 勾選狀態變更時也要計算
    watch(isEnabled, (val) => {
      if (!isLoading) {
        calculate();
      } else if (!val) {
        emit("update-result", {
          index: props.index,
          isEnabled: false,
        });
      }
    });

    // ✅ 表單資料變更時執行計算
    watch(
      form,
      () => {
        if (isEnabled.value && !isLoading) {
          calculate();
        }
      },
      { deep: true }
    );

    // 🟢 自動載入 wages
    onMounted(async () => {
      try {
        const res = await fetch(
          "https://script.google.com/macros/s/AKfycbxCPD91t8jCZlvy66yywhChW5S5ggFleCPQ6xikE1szxVSz1duwWE6dktsYmWB_ludq/exec"
        );
        wages.value = await res.json();
        calculate();
      } catch (err) {
        console.error("載入圓弧工資失敗", err);
      }
    });

    return {
      form,
      isEnabled,
      calculate,
      isLoading,
    };
  },
};
</script>

<style scoped>
:deep(.one-card-container) {
  display: grid;
  grid-template-columns: repeat(1, minmax(0, 1fr));
  gap: 1rem;
}

@media (min-width: 768px) {
  :deep(.one-card-container) {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
</style>
