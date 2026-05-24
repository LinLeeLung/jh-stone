<template>
  <div class="bg-white p-4 rounded-lg shadow-md w-full min-w-0 max-w-[700px]">
    <div class="flex flex-wrap gap-2 mb-2 items-center text-sm">
      <h2 class="font-semibold text-gray-700">側落腳</h2>

      <label class="whitespace-nowrap">顏色</label>
      <input
        v-model="form.color"
        type="text"
        class="w-[80px] p-1 border rounded-md focus:ring-1 focus:ring-green-500"
        :disabled="!isEnabled"
      />

      <label class="whitespace-nowrap">摘要</label>
      <input
        v-model="form.sumary"
        type="text"
        class="w-[100px] p-1 border rounded-md"
        :disabled="!isEnabled"
      />
    </div>

    <div
      class="text-sm grid grid-cols-6 gap-2 mb-1 text-center font-semibold text-gray-600"
    >
      <span>長度</span>
      <span>深度</span>
      <span>前厚</span>
      <span>後厚</span>
      <span>前倒包</span>
      <span>後倒包</span>
    </div>

    <div class="grid grid-cols-6 gap-2 text-sm mb-2">
      <input
        v-model.number="form.length"
        type="number"
        class="p-1 border rounded-md"
        :disabled="!isEnabled"
      />
      <input
        v-model.number="form.depth"
        type="number"
        class="p-1 border rounded-md"
        :disabled="!isEnabled"
      />
      <input
        v-model.number="form.frontEdge"
        type="number"
        class="p-1 border rounded-md"
        :disabled="!isEnabled"
      />
      <input
        v-model.number="form.backEdge"
        type="number"
        class="p-1 border rounded-md"
        :disabled="!isEnabled"
      />
      <input
        v-model.number="form.wrapFront"
        type="number"
        class="p-1 border rounded-md"
        :disabled="!isEnabled"
      />
      <input
        v-model.number="form.wrapBack"
        type="number"
        class="p-1 border rounded-md"
        :disabled="!isEnabled"
      />
    </div>

    <div class="flex flex-wrap gap-4 mt-4 text-sm">
      <div class="flex items-center space-x-1">
        <label class="whitespace-nowrap">板材極限 (cm)</label>
        <input
          v-model.number="form.limit"
          type="number"
          class="w-[72px] p-1 border rounded-md"
          :disabled="!isEnabled"
          min="60"
        />
      </div>
      <div class="flex items-center space-x-1">
        <label class="whitespace-nowrap">單價</label>
        <input
          v-model.number="form.unitPrice"
          type="number"
          class="w-[80px] p-1 border rounded-md"
          :disabled="!isEnabled"
        />
      </div>
      <div class="flex items-center space-x-1">
        <label class="whitespace-nowrap">備註</label>
        <input
          v-model="form.note"
          type="text"
          class="w-[120px] p-1 border rounded-md"
          :disabled="!isEnabled"
        />
      </div>
    </div>
  </div>
</template>

<script>
import { ref, watch, nextTick } from "vue";

export default {
  name: "Leg",
  emits: ["update-result"],
  props: {
    sepPrice: { type: Number, default: 750 },
    index: {
      type: [String, Number],
      required: true,
    },
    initialValue: {
      type: Object,
      default: () => ({}),
    },
    hondimode: {
      type: Boolean,
      default: false,
    },
  },
  setup(props, { emit }) {
    const isLoading = ref(false);
    // ✅ 表單數據
    const form = ref({
      length: 92,
      depth: 90,
      frontEdge: 4,
      backEdge: 4,
      wrapBack: 30,
      wrapFront: 12,

      unitPrice: 120,
      color: "CS-201",
      limit: 68,
      sumary: "",
      note: "",
    });

    const isEnabled = ref(true);
    //const hondimode = ref(false);
    // ✅ 初始資料載入：只套用值，不觸發 emit
    watch(
      () => props.initialValue,
      (val) => {
        if (val) {
          isLoading.value = true; // ✅ 防止載入時觸發計算

          // ✅ 如果有 forceUpdate，強制更新 unitPrice
          if (val.forceUpdate) {
            form.value.unitPrice = val.unitPrice;
          }

          // ✅ 正常更新表單數據
          form.value = { ...form.value, ...val };
          isEnabled.value = val.isEnabled ?? false;
          form.value.hondimode = props.hondimode;
          isLoading.value = false;
        }
      },
      { immediate: true, deep: true },
    );

    const calcOneSide = (
      length,
      depth,
      frontEdge,
      backEdge,
      wrapBack,
      wrapFront,
      limit,
      hondimode,
    ) => {
      let values = [depth, frontEdge, backEdge, wrapBack, wrapFront];
      let thickness = values.reduce(
        (sum, val) => sum + parseFloat(val || 0),
        0,
      );

      let calcSteps = "";
      let cmValue = 0;
      const area = Math.round((length * thickness) / 900);
      const calcSteps2 = `${length} * (${depth} + ${frontEdge} + ${backEdge} + ${wrapBack} + ${wrapFront}) / 900 = ${area}平方尺`;

      // ✅ 先準備好通用的字串片段
      const wrapFrontStr = wrapFront > 0 ? ` + ${wrapFront}` : "";
      const wrapBackStr = wrapBack > 0 ? ` + ${wrapBack}` : "";

      if (hondimode) {
        // 弘第模式
        if (thickness < 48 && depth < 40) {
          cmValue = Math.round(length * 0.85);
          calcSteps = `${length} * 0.85 = ${cmValue} 公分\n`;
        } else if (thickness < limit) {
          cmValue = Math.round(length);
          calcSteps = `${length} = ${cmValue} 公分\n`;
        } else {
          const adjusted = thickness / 60;
          cmValue = Math.round(length * adjusted);
          calcSteps = `${length} * (${depth} + ${frontEdge} + ${backEdge}${wrapBackStr}${wrapFrontStr}) / 60 = ${cmValue} 公分\n`;
        }
      } else {
        // 非弘第模式
        if (thickness < 48 && depth < 40) {
          cmValue = Math.round(length * 0.85);
          calcSteps = `${length} * 0.85 = ${cmValue} 公分\n`;
        } else if (thickness < limit) {
          cmValue = Math.round(length);
          calcSteps = `${length} = ${cmValue} 公分\n`;
        } else {
          // 超過極限值 (thickness >= limit)
          if (frontEdge + backEdge >= 8) {
            // 還 8 邏輯
            const deduction = limit - 60 > 0 ? limit - 60 : 0;
            const adjusted = (thickness - deduction) / 60;
            cmValue = Math.round(length * adjusted);

            // ✅ deduction 在這裡定義後才使用 minusStr 的邏輯
            const minusStr = deduction > 0 ? ` - ${deduction}` : "";
            calcSteps = `${length} * (${depth} + ${frontEdge} + ${backEdge}${wrapBackStr}${wrapFrontStr}${minusStr}) / 60 = ${cmValue} 公分\n`;
          } else {
            // 不還 8 邏輯
            values = [depth, wrapBack, wrapFront];

            thickness = values.reduce(
              (sum, val) => sum + parseFloat(val || 0),
              0,
            );
            const adjusted = thickness / 60;
            cmValue = Math.round(length * adjusted);
            calcSteps = `${length} * (${depth}  ${wrapBackStr}${wrapFrontStr}) / 60 = ${cmValue} 公分\n`;
          }
        }
      }

      // ✅ 確保 return 在函式最後面，不論什麼模式都會回傳
      return { cmValue, calcSteps, area, calcSteps2 };
    };
    const calculate = () => {
      if (!isEnabled.value) {
        emit("update-result", { index: props.index, isEnabled: false });
        return;
      }

      const f = form.value;
      const {
        length,
        depth,
        frontEdge,
        backEdge,
        wrapBack,
        wrapFront,
        wrapLeft,
        wrapRight,
        limit,
      } = f;

      const { cmValue, calcSteps, area, calcSteps2 } = calcOneSide(
        f.length,
        f.depth,
        f.frontEdge,
        f.backEdge,
        f.wrapBack,
        f.wrapFront,
        f.limit,
        f.hondimode,
      );
      const roundedValue = Math.round(cmValue);
      const subtotal = roundedValue * f.unitPrice;
      const subtotal2 = area * props.sepPrice;
      emit("update-result", {
        index: props.index,
        isEnabled: true,
        length,
        depth,
        frontEdge,
        backEdge,
        wrapBack,
        wrapFront,
        wrapLeft,
        wrapRight,
        color: f.color,
        sumary: f.sumary,
        note: f.note,
        limit,
        roundedCentimeters: roundedValue,
        subtotal,
        subtotal2,
        area,
        unitPrice: f.unitPrice,
        calculationSteps: calcSteps.trim(),
        calculationSteps2: calcSteps2.trim(),
      });
    };

    watch(form, calculate, { deep: true });
    watch(isEnabled, calculate);
    watch(
      () => props.initialValue,
      (val) => {
        if (val) {
          isLoading.value = true;
          if (val.forceUpdate) {
            form.value.unitPrice = val.unitPrice;
          }
          form.value = { ...form.value, ...val };
          isEnabled.value = val.isEnabled ?? true;

          nextTick(() => {
            isLoading.value = false;
            calculate(); // 🟢 確保 DOM 完整後才觸發
          });
        }
      },
      { immediate: true, deep: true },
    );
    watch(
      () => props.hondimode,
      (newVal) => {
        form.value.hondimode = newVal;
        if (isEnabled.value && !isLoading.value) {
          calculate();
        }
      },
      { immediate: true },
    );

    return {
      form,
      isEnabled,
      calculate,
    };
  },
};
</script>

<style scoped></style>
