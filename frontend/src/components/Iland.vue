<template>
  <div class="bg-white p-4 rounded-lg shadow-md w-full min-w-0 max-w-[700px]">
    <!-- 頂部選項列 -->
    <div class="flex flex-wrap gap-2 mb-2 items-center text-sm">
      <h2 class="font-semibold text-gray-700">中島</h2>

      <label class="whitespace-nowrap">顏色</label>
      <input
        v-model="form.color"
        type="text"
        class="w-[80px] p-1 border rounded-md focus:ring-1 focus:ring-green-500"
      />

      <label class="whitespace-nowrap">摘要</label>
      <input
        v-model="form.sumary"
        type="text"
        class="w-[90px] p-1 border rounded-md"
      />

      <label class="whitespace-nowrap">左厚</label>
      <input
        v-model.number="form.leftThick"
        type="text"
        class="w-[30px] p-1 border rounded-md"
      />

      <label class="whitespace-nowrap">右厚</label>
      <input
        v-model.number="form.rightThick"
        type="text"
        class="w-[30px] p-1 border rounded-md"
      />
    </div>

    <!-- Grid 表格 -->
    <div
      class="text-sm grid grid-cols-8 gap-2 mb-1 text-center font-semibold text-gray-600"
    >
      <span>長度</span>
      <span>深度</span>
      <span>前厚</span>
      <span>後厚</span>
      <span>前倒包</span>
      <span>後倒包</span>
      <span>左倒包</span>
      <span>右倒包</span>
    </div>

    <div class="grid grid-cols-8 gap-2 text-sm mb-2">
      <input
        v-model.number="form.length"
        type="number"
        class="p-1 border rounded-md"
      />
      <input
        v-model.number="form.depth"
        type="number"
        class="p-1 border rounded-md"
      />
      <input
        v-model.number="form.frontEdge"
        type="number"
        class="p-1 border rounded-md"
      />
      <input
        v-model.number="form.backEdge"
        type="number"
        class="p-1 border rounded-md"
      />
      <input
        v-model.number="form.wrapFront"
        type="number"
        class="p-1 border rounded-md"
      />
      <input
        v-model.number="form.wrapBack"
        type="number"
        class="p-1 border rounded-md"
      />
      <input
        v-model.number="form.wrapLeft"
        type="number"
        class="p-1 border rounded-md"
      />
      <input
        v-model.number="form.wrapRight"
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
          class="w-[72px] p-1 border rounded-md"
          min="60"
        />
      </div>
      <div class="flex items-center space-x-1">
        <label class="whitespace-nowrap">單價</label>
        <input
          v-model.number="form.unitPrice"
          type="number"
          class="w-[80px] p-1 border rounded-md"
        />
      </div>
      <div class="flex items-center space-x-1">
        <label class="whitespace-nowrap">備註</label>
        <input
          v-model="form.note"
          type="text"
          class="w-[120px] p-1 border rounded-md"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, nextTick } from "vue";

const emit = defineEmits(["update-result"]);
const props = defineProps({
  sepPrice: { type: Number, default: 750 },
  index: { type: [String, Number], required: true },
  initialValue: { type: Object, default: () => ({}) },
  hondimode: { type: Boolean, default: false },
});

const isLoading = ref(false);
const isEnabled = ref(true);
const form = ref({
  length: 100,
  depth: 60,
  frontEdge: 4,
  backEdge: 4,
  wrapBack: 0,
  wrapFront: 0,
  wrapLeft: 0,
  wrapRight: 0,
  unitPrice: 120,
  color: "CS-201",
  limit: 68,
  sumary: "",
  note: "",
  hondimode: false,
  leftThick: 4,
  rightThick: 4,
});
const toNumber = (v) => parseFloat(v) || 0;
const calcOneSide = (
  length,
  depth,
  frontEdge,
  backEdge,
  wrapBack,
  wrapFront,
  wrapRight,
  wrapLeft,
  limit,
  hondimode,
  leftThick,
  rightThick,
) => {
  console.log(
    `length,
    depth,
    frontEdge,
    backEdge,
    wrapBack,
    wrapFront,
    wrapRight,
    wrapLeft,
    limit,
    hondimode,
    leftThick,
    rightThick`,
    length,
    depth,
    frontEdge,
    backEdge,
    wrapBack,
    wrapFront,
    wrapRight,
    wrapLeft,
    limit,
    hondimode,
    leftThick,
    rightThick,
  );
  length = toNumber(length);
  depth = toNumber(depth);
  frontEdge = toNumber(frontEdge);
  backEdge = toNumber(backEdge);
  wrapBack = toNumber(wrapBack);
  wrapFront = toNumber(wrapFront);
  wrapRight = toNumber(wrapRight);
  wrapLeft = toNumber(wrapLeft);
  leftThick = toNumber(leftThick);
  rightThick = toNumber(rightThick);
  const thickness = depth + frontEdge + backEdge + wrapBack + wrapFront;
  const frontEdgeLength = (depth + length) * 2;
  let calcSteps = "";
  let cmValue = 0;
  let area = Math.round((length * thickness) / 900);

  let calcSteps2 = `${length}*(${depth}+${frontEdge}+${backEdge}+${wrapBack}+${wrapFront})/900=${area}平方尺\n`;
  const addthick =
    leftThick + rightThick > 0
      ? `+${[rightThick, leftThick].filter((thick) => thick > 0).join("+")}`
      : "";
  console.log("addthick", addthick);
  if (hondimode) {
    if (thickness < 48 && depth < 40) {
      cmValue = Math.round((length + leftThick + rightThick) * 0.85);

      calcSteps = `(${length}${addthick})*0.85=${cmValue}公分\n`;
    } else if (thickness < limit) {
      cmValue = Math.round(length + leftThick + rightThick);
      calcSteps = `(${length}${addthick})=${cmValue}公分\n`;
    } else {
      cmValue = Math.round(
        ((length + leftThick + rightThick) * thickness) / 60,
      );
      const wrapStr = [wrapBack, wrapFront]
        .filter((w) => w > 0)
        .map((w) => ` + ${w}`)
        .join("");

      calcSteps = `(${length}${addthick})*(${depth}+${frontEdge}+${backEdge}${wrapStr})/60=${cmValue}公分\n`;
    }

    if (wrapRight || wrapLeft) {
      const cmDaubo = Math.round(((wrapRight + wrapLeft) * depth) / 60);
      calcSteps += `倒包: (${wrapRight}+${wrapLeft})*${depth}/60 = ${cmDaubo}公分\n${cmValue}+${cmDaubo}=${
        cmValue + cmDaubo
      }公分\n`;
      cmValue += cmDaubo;
    }
  } else {
    console.log("honedimode off", { thickness, depth, limit });
    if (thickness < 48 && depth < 40) {
      //超出40 *.85
      cmValue = Math.round((length + leftThick + rightThick) * 0.85);

      calcSteps = `(${length}${addthick})*0.85=${cmValue}公分\n`;
    } else if (
      thickness < limit //未超出limit
    ) {
      cmValue = Math.round(length + leftThick + rightThick);
      calcSteps = `(${length}${addthick})=${cmValue}公分\n`;
    } else if (frontEdge + backEdge >= 8) {
      //還8
      //超出limit
      cmValue = Math.round(
        ((length + leftThick + rightThick) * (thickness - 8)) / 60,
      );
      const wrapStr = [wrapBack, wrapFront]
        .filter((w) => w > 0)
        .map((w) => ` + ${w}`)
        .join("");

      calcSteps = `(${length}${addthick})*(${depth}+${frontEdge}+${backEdge}${wrapStr}-8)/60=${cmValue}公分\n`;
    } else {
      //未還8 前後沿

      cmValue = Math.round(
        ((length + leftThick + rightThick) *
          (thickness - frontEdge - backEdge)) /
          60,
      );
      const wrapStr = [wrapBack, wrapFront]
        .filter((w) => w > 0)
        .map((w) => ` + ${w}`)
        .join("");

      calcSteps = `(${length}${addthick})*(${depth}${wrapStr})/60=${cmValue}公分\n`;
    }

    if (wrapRight || wrapLeft) {
      const cmDaubo = Math.round(((wrapRight + wrapLeft) * depth) / 60);
      calcSteps += `倒包: (${wrapRight}+${wrapLeft})*${depth}/60=${cmDaubo}公分\n${cmValue}+${cmDaubo}=${
        cmValue + cmDaubo
      }公分\n`;
      cmValue += cmDaubo;
    }
  }
  return { cmValue, calcSteps, area, calcSteps2, frontEdgeLength };
};

const calculate = () => {
  if (!isEnabled.value) {
    emit("update-result", { index: props.index, isEnabled: false });
    return;
  }
  const f = form.value;
  const { cmValue, calcSteps, area, calcSteps2, frontEdgeLength } = calcOneSide(
    f.length,
    f.depth,
    f.frontEdge,
    f.backEdge,
    f.wrapBack,
    f.wrapFront,
    f.wrapRight,
    f.wrapLeft,
    f.limit,
    f.hondimode,
    f.leftThick,
    f.rightThick,
  );
  const rounded = Math.round(cmValue);
  const subtotal = rounded * f.unitPrice;
  const subtotal2 = area * props.sepPrice;

  emit("update-result", {
    index: props.index,
    isEnabled: true,
    ...f,
    roundedCentimeters: rounded,
    subtotal,
    subtotal2,
    area,
    calculationSteps: calcSteps.trim(),
    calculationSteps2: calcSteps2.trim(),
    frontEdgeLength: Math.round(frontEdgeLength),
  });
};

watch(
  () => props.initialValue,
  (val) => {
    if (val) {
      isLoading.value = true;
      if (val.forceUpdate) form.value.unitPrice = val.unitPrice;
      form.value = {
        ...form.value,
        ...val,
        hondimode: props.hondimode, // ✅ 在 merge 一起加進來，不會被蓋掉
      };
      isEnabled.value = val.isEnabled ?? true;
      nextTick(() => {
        isLoading.value = false;
        calculate();
      });
    }
  },
  { immediate: true, deep: true },
);

watch(
  form,
  () => {
    if (!isLoading.value) calculate();
  },
  { deep: true },
);
watch(isEnabled, (v) => {
  if (!isLoading.value) calculate();
});
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
</script>

<style scoped></style>
