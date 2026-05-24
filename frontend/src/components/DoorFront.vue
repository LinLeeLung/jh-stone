<template>
  <div class="bg-white p-4 rounded-lg shadow-md w-full min-w-0 max-w-[700px]">
    <div class="flex flex-wrap gap-2 mb-2 items-center text-sm">
      
      <h2 class="font-semibold text-gray-700">門檻或假腳</h2>
        
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

    <div class="text-sm grid grid-cols-3 gap-2 mb-1 text-center font-semibold text-gray-600">
      <span>長度</span>
      <span>展開深度</span>
      <span>基本工資</span>
    </div>

    <div class="grid grid-cols-3 gap-2 text-sm mb-2">
      <input v-model.number="form.length" type="number" class="p-1 border rounded-md" :disabled="!isEnabled" />
      <input v-model.number="form.depth" type="number" class="p-1 border rounded-md" :disabled="!isEnabled" />
      <input v-model.number="form.baseWage" type="number" class="p-1 border rounded-md" :disabled="!isEnabled" />
    </div>

    <div class="flex flex-wrap gap-4 mt-4 text-sm">
      <div class="flex items-center space-x-1">
        <label class="whitespace-nowrap">石材單價</label>
        <input v-model.number="form.stonePrice" type="number" class="w-[80px] p-1 border rounded-md" :disabled="!isEnabled" />
      </div>
      <div class="flex items-center space-x-1">
        <label class="whitespace-nowrap">假腳單價</label>
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
import { ref, watch ,nextTick} from 'vue';

export default {
  name: 'DoorFront',
  props: {
    sepPrice: { type: Number, default: 750 },
    index: { type: [String, Number], required: true },
    initialValue: { type: Object, default: () => ({}) }
  },
  emits: ['update-result'],
  setup(props, { emit }) {
    const form = ref({
      length: 100,
      depth: 16,
      baseWage: 25,
      stonePrice: 120,
      unitPrice: 57,
      color: 'CS-201',
      limit: 68,
      sumary: '',
      note: '',
      
    });
    
    const isEnabled = ref(true);
    const isLoading = ref(false);
    const calculate = () => {
       if (isLoading.value) {
        return;
       }

     // ✅ 如果未勾選，僅通知父層
     if (!isEnabled.value) {
      emit('update-result', {
      index: props.index,
      isEnabled: true
      });
      return;
     }

        const f = form.value;
        f.unitPrice = Math.round(f.baseWage+ f.stonePrice*f.depth/60)

        const roundedValue = Math.round(f.length);
        const subtotal = roundedValue * f.unitPrice;
        const area = Math.round(f.length * f.depth / 900);
        const subtotal2 = area * props.sepPrice;
        
        const calcSteps = `${f.unitPrice} * ${f.length} = ${subtotal}`;
        const calcSteps2 = `${f.unitPrice} * ${area} = ${subtotal2}`;
        
        emit('update-result', {
          index: props.index,
          isEnabled: true,
          ...f,
          roundedCentimeters: roundedValue,
          subtotal: Math.round(subtotal),
          calculationSteps: calcSteps.trim(),
          calculationSteps2: calcSteps2.trim(),
          area:area,
          subtotal2:Math.round(subtotal2),  
          frontEdgeLength: f.length,

        });
   };
   const setInitialValue = (val) => {
  if (Object.prototype.toString.call(val) !== '[object Object]') {
    console.warn('[DoorFront] initialValue 傳入不合法：', val);
    return;
  }

  isLoading.value = true;

  const newForm = { ...form.value, ...val };
  const newIsEnabled = val.isEnabled ?? true;

  const same = JSON.stringify({ ...form.value, isEnabled: isEnabled.value }) ===
               JSON.stringify({ ...newForm, isEnabled: newIsEnabled });

  if (!same) {
    if (val.forceUpdate) {
      form.value.unitPrice = val.unitPrice;
    }
    form.value = newForm;
    isEnabled.value = newIsEnabled;
  }

  isLoading.value = false;
};



watch(() => props.initialValue, (val) => {
  if (!val || typeof val !== 'object') return;

  isLoading.value = true;

  if (val.forceUpdate) form.value.unitPrice = val.unitPrice;
  form.value = { ...form.value, ...val };
  isEnabled.value = val.isEnabled ?? true;

  nextTick(() => {
    isLoading.value = false;
    calculate();
  });
}, { immediate: true, deep: true });






// ✅ 當 isEnabled 變更時，觸發計算或 emit
watch(isEnabled, (val) => {
  if (!isLoading.value) {
    calculate(); // ✅ 勾選變更時觸發計算
  } else if (!val) {
    // ✅ 如果取消勾選，回傳 isEnabled: false
    emit('update-result', {
      index: props.index,
      isEnabled: false
    });
  }
});


    // ✅ 只在使用者操作時觸發 emit（calculate）
    watch(
      form,
      () => {
        if (isEnabled.value && !isLoading.value) {
          calculate();
        }
      },
      { deep: true }
    );

    

   

    return {
      form,
      isEnabled,
      calculate,
      isLoading
    };
  }
};
</script>
