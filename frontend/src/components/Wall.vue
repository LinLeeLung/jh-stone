<template>
  <div class="bg-white p-4 rounded-lg shadow-md w-full min-w-0 max-w-[700px]">
    <div class="flex flex-wrap gap-2 mb-2 items-center text-sm">
      
      <h2 class="font-semibold text-gray-700">高背</h2>

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

    <div class="text-sm grid grid-cols-2 gap-2 mb-1 text-center font-semibold text-gray-600">
      <span>長度</span>
      <span>高度</span>
    </div>

    <div class="grid grid-cols-2 gap-2 text-sm mb-2">
      <input v-model.number="form.length" type="number" class="p-1 border rounded-md" :disabled="!isEnabled" />
      <input v-model.number="form.depth" type="number" class="p-1 border rounded-md" :disabled="!isEnabled" />
    </div>

    <div class="flex flex-wrap gap-4 mt-4 text-sm">
      <div class="flex items-center space-x-1">
        <label class="whitespace-nowrap">板材極限 (cm)</label>
        <input v-model.number="form.limit" type="number" class="w-[80px] p-1 border rounded-md" :disabled="!isEnabled" min="60" />
      </div>
      <div class="flex items-center space-x-1">
        <label class="whitespace-nowrap">單價</label>
        <input v-model.number="form.unitPrice" type="number" class="w-[80px] p-1 border rounded-md" :disabled="!isEnabled" />
      </div>
      <div class="flex items-center space-x-1">
        <label class="whitespace-nowrap">備註</label>
        <input v-model="form.note" type="text" class="w-[120px] p-1 border rounded-md" :disabled="!isEnabled" />
      </div>
    </div>
  </div>
</template>

  <script>
import { ref, watch } from 'vue';

export default {
  name: 'Wall',
  props: {
    sepPrice: { type: Number, default: 750 },
    index: { type: [String, Number], required: true },
    initialValue: { type: Object, default: () => ({}) }
  },
  emits: ['update-result'],
  setup(props, { emit }) {
    const form = ref({
      length: 100,
      depth: 60,
      unitPrice: 120,
      color: 'CS-201',
      limit: 68,
      sumary: '',
      note: ''
    });

    const isEnabled = ref(false);
    let isLoading = false;

    // ✅ 修正：提前定義 calculate
    const calculate = () => {
      if (isLoading) return;

      if (!isEnabled.value) {
        emit('update-result', {
          index: props.index,
          isEnabled: false
        });
        return;
      }

      const f = form.value;
      const { cmValue, calcSteps, area, calcSteps2, frontEdgeLength } = calcOneSide(
        f.length,
        f.depth,
        f.limit
      );

      const roundedValue = cmValue;
      const subtotal = roundedValue * f.unitPrice;
      const subtotal2 = area * props.sepPrice;

      emit('update-result', {
        index: props.index,
        isEnabled: true,
        ...f,
        roundedCentimeters: roundedValue,
        subtotal: Math.round(subtotal),
        calculationSteps: calcSteps.trim(),
        calculationSteps2: calcSteps2.trim(),
        area,
        subtotal2: Math.round(subtotal2),
        frontEdgeLength
      });
    };

    const calcOneSide = (length, depth, limit) => {
      const thickness = depth;
      let calcSteps = '';
      let cmValue = 0;
      const area = Math.round((length * depth) / 900);
      const calcSteps2 = `${length} * ${depth} / 900 = ${area}平方尺`;
      let frontEdgeLength = 0;

      if (depth < 40) {
        cmValue = Math.round(length * 0.85);
        calcSteps = `${length} * 0.85 = ${cmValue} 公分`;
      } else if (thickness > limit) {
        cmValue = Math.round((depth / 60) * length);
        calcSteps = `${length} * ${depth} / 60 = ${cmValue} 公分`;
      } else {
        cmValue = Math.round(length);
        calcSteps = `${length} = ${cmValue} 公分`;
      }

      return { cmValue, calcSteps, area, calcSteps2, frontEdgeLength };
    };

    // 初始資料載入
    watch(() => props.initialValue, (val) => {
      if (val) {
        isLoading = true;
        Object.keys(form.value).forEach((key) => {
          if (val.hasOwnProperty(key)) {
            form.value[key] = val[key];
          }
        });
        isEnabled.value = val.isEnabled ?? false;
        isLoading = false;

        if (isEnabled.value) {
          calculate();
        }
      }
    }, { immediate: true, deep: true });

    // 勾選改變時
    watch(isEnabled, (val) => {
      if (!isLoading) {
        calculate();
      } else if (!val) {
        emit('update-result', {
          index: props.index,
          isEnabled: false
        });
      }
    });

    // 表單更新時
    watch(form, () => {
      if (isEnabled.value && !isLoading) {
        calculate();
      }
    }, { deep: true });

    return {
      form,
      isEnabled,
      calculate,
      isLoading
    };
  }
};
</script>

  