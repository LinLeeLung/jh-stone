<script setup>
import { useEstimateStore } from "@/store/futureEstimate";
import { onMounted, computed, ref, watch } from "vue";

const store = useEstimateStore();
const keyword = ref("大");

// ✅ 自動抓資料
onMounted(() => {
  store.fetchData();
});

// ✅ 自動計算每公分報價（即時反應）
watch(
  () => [store.slabCount, store.unitStonePrice, store.wagePerCm, store.totalCm],
  () => {
    store.calculatePricePerCm();
  }
);

// ✅ 搜尋石材清單
const filterStoneList = computed(() =>
  store.stoneList.filter(
    (item) =>
      typeof item.name === "string" &&
      item.name.toLowerCase().includes(keyword.value.toLowerCase())
  )
);

// ✅ 切換石材時更新單價
function onStoneSelect(e) {
  store.selectStone(e.target.value);
}
</script>

<template>
  <div class="p-4 space-y-2">
    <h2 class="text-lg font-bold">每公分報價計算</h2>

    <div>
      <input v-model="keyword" placeholder="搜尋石材" class="border mb-2" />
      <label>選擇石材：</label>
      <select
        v-model="store.selectedStone"
        @change="onStoneSelect"
        class="border"
      >
        <option disabled value="">請選擇</option>
        <option
          v-for="stone in filterStoneList"
          :key="stone.name"
          :value="stone.name"
        >
          {{ stone.name }}（{{ stone.price }} 元/片）
        </option>
        <option v-if="filterStoneList.length === 0" disabled>
          查無符合石材
        </option>
      </select>
    </div>
    <div>
      <label>大板價格：</label>
      <input
        v-model.number="store.unitStonePrice"
        type="number"
        class="border"
      />
    </div>
    <div>
      <label>大板數量：</label>
      <input v-model.number="store.slabCount" type="number" class="border" />
    </div>

    <div>
      <label>總公分數：</label>
      <input v-model.number="store.totalCm" type="number" class="border" />
    </div>

    <div>
      <label>每公分加工工資：</label>
      <input v-model.number="store.wagePerCm" type="number" class="border" />
    </div>

    <div class="mt-3 space-y-1">
      <p>石材單價：{{ store.unitStonePrice }} 元/片</p>
      <p class="text-blue-700">
        每公分報價：
        <strong>{{ store.pricePerCm.toFixed(2) }}</strong> 元/cm
      </p>
    </div>
    <p>
      毛利率：<strong
        >{{ ((store.wagePerCm / store.pricePerCm) * 100).toFixed(2) }} % ({{
          store.wagePerCm
        }}
        / {{ store.pricePerCm }})</strong
      >
    </p>
    <p>
      總估價金額：<strong>{{ store.totalEstimate.toFixed(0) }}</strong> 元
    </p>
    <pre class="bg-gray-100 p-2 rounded text-sm whitespace-pre-wrap"
      >{{ store.calcSteps }}
  </pre
    >
  </div>
</template>
