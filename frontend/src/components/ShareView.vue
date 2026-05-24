<template>
  <div class="p-4">
    <h1 class="text-xl font-bold text-green-600 mb-4">
      報價單預覽：{{ filename }}
    </h1>

    <QuotationHeader
      :customer="customer"
      :tel="tel"
      :fax="fax"
      :contacter="contacter"
      :add="add"
    />
    <QuotationTable
      v-if="!isSep"
      :filteredResults="orderedFilteredResults"
      :filteredItems="filteredItems"
      :totalSubtotal="totalSubtotal"
      :columnWidths="columnWidths"
    />
    <WMSTable
      v-if="isSep"
      :sepPrice="sepPrice"
      :filteredResults="filteredResults"
      :filteredItems="filteredItems"
      :totalSubtotal2="totalSubtotal"
    />
    <div v-if="uploadedImageUrl" class="mt-6 flex justify-center">
      <div class="flex justify-center border rounded p-4 bg-white-50">
        <img
          :src="uploadedImageUrl"
          alt="估價圖片預覽"
          class="mx-auto border rounded shadow-md"
          :style="{
            width: picRatio + '%',
            height: 'auto',
            objectFit: 'contain',
          }"
        />
      </div>
    </div>
    <div class="mt-6 text-right">
      <button
        @click="handleShare"
        class="bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700"
        :disabled="!shareFilename"
      >
        複製分享連結
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from "vue";
import { useRoute } from "vue-router";
import { getDocs, query, where, collection } from "firebase/firestore";
import { db } from "@/firebase";

import QuotationHeader from "./QuotationHeader.vue";
import QuotationTable from "./QuotationTable.vue";
import WMSTable from "./WMSTable.vue";

const route = useRoute();
const filename = ref(route.query.filename || "all.json");
const shareFilename = ref(filename.value);
const uploadedImageUrl = ref("");
const customer = ref("");
const tel = ref("");
const fax = ref("");
const contacter = ref("");
const add = ref("");
const filteredResults = ref({});
const itemList = ref([]);
const isSep = ref(false);
const sepPrice = ref(750);
const totalSubtotal = ref(0);
const cuskeyword = ref("");
const selectedCustomer = ref("");
const picRatio = ref(null);
const hondimode = ref(false);
const columnWidths = ref([
  60, 60, 60, 60, 100, 60, 50, 50, 60, 40, 60, 60, 90, 90,
]);
const cardOrderList = ref([]);
const customItems = ref([]);
const loading = ref(true);
const error = ref("");

const filteredItems = computed(() => [
  ...itemList.value.filter((item) => item.checked),
  ...customItems.value.filter((item) => item.name),
]);

const orderedFilteredResults = computed(() => {
  return Object.fromEntries(
    cardOrderList.value
      .map(({ id }) => [id, filteredResults.value[id]])
      .filter(([_, r]) => r?.isEnabled) //  isEnabled
  );
});

const detectTypeFromId = (id) => {
  const knownTypes = [
    "一字型",
    "L",
    "LP",
    "M",
    "中島",
    "側落腳",
    "倒包",
    "假腳或門檻",
    "高背",
    "美背",
    "圓弧造型",
  ];
  return knownTypes.find((type) => id.startsWith(type)) || "一字型";
};

async function getFileMetaByFilename(filename) {
  const q = query(collection(db, "quotes"), where("filename", "==", filename));
  const snapshot = await getDocs(q);
  const doc = snapshot.docs[0];
  return doc ? { id: doc.id, ...doc.data() } : null;
}

async function loadFileFromFirebase(fileMeta) {
  if (!fileMeta || !fileMeta.downloadURL) throw new Error("❌ 無效檔案");
  const res = await fetch(fileMeta.downloadURL, { mode: "cors" });
  if (!res.ok) throw new Error("❌ 載入失敗");
  return await res.json();
}

onMounted(async () => {
  try {
    const meta = await getFileMetaByFilename(filename.value);
    const data = await loadFileFromFirebase(meta);
    // console.log("data....", data.uploadedImageUrl);
    // ✅ 套用資料
    filteredResults.value = data.results || {};
    itemList.value = data.itemList || [];
    customItems.value = data.customItems || [];
    isSep.value = data.isSep || false;
    cardOrderList.value = data.cardOrderList || [];
    sepPrice.value = data.sepPrice || 750;

    isSep.value = data.isSep || false;
    customer.value = data.customer || "";
    tel.value = data.tel || "";
    fax.value = data.fax || "";
    contacter.value = data.contacter || "";
    add.value = data.add || "";
    cuskeyword.value = data.cuskeyword || "";
    selectedCustomer.value = data.selectedCustomer || "";
    uploadedImageUrl.value = data.uploadedImageUrl || "";
    console.log("uploadimageurl:", uploadedImageUrl.value);
    picRatio.value = data.picRatio ?? 50;
    hondimode.value = data.hondimode || false;
    totalSubtotal.value =
      Object.values(filteredResults.value).reduce(
        (sum, r) =>
          sum + (parseFloat(isSep.value ? r?.subtotal2 : r?.subtotal) || 0),
        0
      ) + filteredItems.value.reduce((sum, i) => sum + i.amount * i.price, 0);

    columnWidths.value = data.localColumnWidths || columnWidths.value;
    console.log("orderedFilteredResults", orderedFilteredResults);
    // if (data.cardOrderList) {
    //   cardOrderList.value = data.cardOrderList.map((c) => ({
    //     ...c,
    //     isEnabled: c.isEnabled !== false,
    //   }));
    // } else {
    //   cardOrderList.value = Object.keys(filteredResults.value).map((id) => ({
    //     id,
    //     type: detectTypeFromId(id),
    //     isEnabled: true,
    //   }));
    // }
    loading.value = false;
    // console.log("cardorderlist....", cardOrderList.value);
  } catch (err) {
    console.error(err);
    error.value = "載入分享資料失敗";
    loading.value = false;
  }
});

const handleShare = async () => {
  if (!shareFilename.value) return alert("請先儲存檔案");
  const url = `${window.location.origin}/share?filename=${encodeURIComponent(
    shareFilename.value
  )}`;
  try {
    await navigator.clipboard.writeText(url);
    showMessage(`連結已複製：${url}`);
  } catch (err) {
    showMessage("複製失敗，請手動複製：" + url);
  }
};

function showMessage(message, type = "info", duration = 3000) {
  const container =
    document.getElementById("notification-container") || document.body;
  const div = document.createElement("div");
  div.textContent = message;
  div.className = `notification ${type}`;
  container.appendChild(div);
  setTimeout(() => div.remove(), duration);
}
</script>

<style src="../assets/style.css"></style>
