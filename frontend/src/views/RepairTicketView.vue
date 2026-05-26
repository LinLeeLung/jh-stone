<template>
  <div class="repair-view">
    <header class="page-header">
      <h2>{{ isEdit ? "編輯維修單" : "新建維修單" }}</h2>
      <div class="header-actions">
        <RouterLink class="btn-aux" to="/orders/repair">← 維修單列表</RouterLink>
        <RouterLink
          v-if="isEdit"
          class="btn-aux"
          :to="`/orders/repair/${$route.params.id}/print`"
          target="_blank"
          >🖨 列印</RouterLink
        >
      </div>
    </header>

    <section class="card">
      <h3>1. 挑選要維修的訂單</h3>
      <div class="picker">
        <input
          v-model="keyword"
          class="search-input"
          placeholder="輸入訂單號 / 客戶名稱 / 地址 搜尋"
          @input="onSearchInput"
        />
        <span v-if="loadingList" class="hint">載入中…</span>
        <span v-else-if="results.length" class="hint">{{ results.length }} 筆結果</span>
      </div>

      <div v-if="!selected" class="result-list">
        <div
          v-for="o in results"
          :key="o.source + '/' + o.id"
          class="result-row"
          @click="pickOrder(o)"
        >
          <div class="r-no">{{ o.orderNo || "(無訂單號)" }}</div>
          <div class="r-cust">{{ o.customerName || "—" }}</div>
          <div class="r-addr">{{ o.siteAddress || "" }}</div>
          <div class="r-src">{{ o.source === "Orders" ? "舊系統" : "新系統" }}</div>
        </div>
        <div v-if="!loadingList && !results.length && keyword" class="empty">
          找不到符合的訂單
        </div>
      </div>

      <div v-if="selected" class="selected-box">
        <div>
          <strong>已選:</strong>
          {{ selected.orderNo || "(無訂單號)" }} ／
          {{ selected.customerName || "—" }}
          <span class="r-addr">{{ selected.siteAddress || "" }}</span>
        </div>
        <button class="btn-link" @click="selected = null">重選</button>
      </div>
    </section>

    <section class="card" v-if="selected">
      <h3>2. 維修資訊</h3>
      <div class="form-row">
        <label>維修日</label>
        <input v-model="repairDate" type="date" />
      </div>
      <div class="form-row">
        <label>原因</label>
        <textarea v-model="reason" rows="4" placeholder="維修內容、損壞情形…"></textarea>
      </div>
      <div class="form-row">
        <label>是否收費</label>
        <label class="inline">
          <input type="checkbox" v-model="chargeable" />
          收費(將自動建立新訂單)
        </label>
      </div>

      <div class="actions">
        <button class="btn-primary" :disabled="submitting" @click="submit">
          {{ submitting ? "送出中…" : isEdit ? "儲存變更" : chargeable ? "建立維修單並轉新訂單" : "建立維修單" }}
        </button>
      </div>

      <div v-if="errMsg" class="err">{{ errMsg }}</div>
      <div v-if="okMsg" class="ok">
        {{ okMsg }}
        <RouterLink v-if="newOrderId" :to="`/orders/${newOrderId}/edit`" class="btn-link">
          前往編輯新訂單 →
        </RouterLink>
      </div>
    </section>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  listSalesOrders,
  listOrders,
  createRepairTicket,
  getRepairTicket,
  updateRepairTicket,
} from "../firebase";

const route = useRoute();
const router = useRouter();
const isEdit = computed(() => !!route.params.id);

const allOrders = ref([]);
const loadingList = ref(false);
const keyword = ref("");
const selected = ref(null);

const repairDate = ref(new Date().toISOString().slice(0, 10));
const reason = ref("");
const chargeable = ref(false);

const submitting = ref(false);
const errMsg = ref("");
const okMsg = ref("");
const newOrderId = ref(null);

async function ensureLoaded() {
  if (allOrders.value.length || loadingList.value) return;
  loadingList.value = true;
  try {
    const [a, b] = await Promise.all([
      listSalesOrders({ limit: 1000 }).catch(() => []),
      listOrders({ limit: 1000 }).catch(() => []),
    ]);
    const merged = [];
    const seen = new Set();
    for (const o of a) {
      const key = o.orderNo || `sa:${o.id}`;
      seen.add(key);
      merged.push({
        id: o.id,
        source: "salesOrders",
        orderNo: o.orderNo || "",
        customerName: o.customerName || "",
        siteAddress: o.siteAddress || "",
      });
    }
    for (const o of b) {
      const key = o.orderNo || `or:${o.id}`;
      if (seen.has(key)) continue;
      merged.push({
        id: o.id,
        source: "Orders",
        orderNo: o.orderNo || "",
        customerName: o.customerName || "",
        siteAddress: o.siteAddress || "",
      });
    }
    allOrders.value = merged;
  } finally {
    loadingList.value = false;
  }
}

const results = computed(() => {
  const kw = keyword.value.trim().toLowerCase();
  if (!kw) return [];
  return allOrders.value
    .filter((o) => {
      return (
        (o.orderNo || "").toLowerCase().includes(kw) ||
        (o.customerName || "").toLowerCase().includes(kw) ||
        (o.siteAddress || "").toLowerCase().includes(kw)
      );
    })
    .slice(0, 50);
});

function onSearchInput() {
  ensureLoaded();
}

function pickOrder(o) {
  selected.value = o;
  errMsg.value = "";
  okMsg.value = "";
  newOrderId.value = null;
}

onMounted(async () => {
  if (isEdit.value) {
    const t = await getRepairTicket(route.params.id);
    if (t) {
      selected.value = {
        id: t.sourceOrderId,
        source: t.sourceCollection || "salesOrders",
        orderNo: t.sourceOrderNo,
        customerName: t.sourceCustomerName,
        siteAddress: t.sourceSiteAddress || "",
      };
      repairDate.value = t.repairDate || repairDate.value;
      reason.value = t.reason || "";
      chargeable.value = !!t.chargeable;
      newOrderId.value = t.newOrderId || null;
    } else {
      errMsg.value = "找不到此維修單";
    }
  }
});

async function submit() {
  errMsg.value = "";
  okMsg.value = "";
  if (!selected.value) {
    errMsg.value = "請先挑選來源訂單";
    return;
  }
  if (!repairDate.value) {
    errMsg.value = "請選擇維修日";
    return;
  }
  submitting.value = true;
  try {
    if (isEdit.value) {
      await updateRepairTicket(route.params.id, {
        repairDate: repairDate.value,
        reason: reason.value,
        chargeable: chargeable.value,
      });
      okMsg.value = "已更新";
      setTimeout(() => router.push("/orders/repair"), 600);
    } else {
      const res = await createRepairTicket({
        source: selected.value,
        repairDate: repairDate.value,
        reason: reason.value,
        chargeable: chargeable.value,
      });
      okMsg.value = chargeable.value
        ? `已建立維修單,並產生新訂單(草稿)`
        : `已建立維修單`;
      newOrderId.value = res.newOrderId || null;
      selected.value = null;
      reason.value = "";
      chargeable.value = false;
    }
  } catch (e) {
    errMsg.value = e?.message || "送出失敗";
  } finally {
    submitting.value = false;
  }
}
</script>

<style scoped>
.repair-view {
  padding: 16px;
  max-width: 960px;
  margin: 0 auto;
}
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}
.header-actions {
  display: flex;
  gap: 8px;
}
.btn-aux,
.btn-primary,
.btn-link {
  padding: 6px 12px;
  border-radius: 6px;
  text-decoration: none;
  border: 1px solid #ccc;
  background: #f5f5f5;
  color: #333;
  cursor: pointer;
}
.btn-primary {
  background: #2563eb;
  color: #fff;
  border-color: #2563eb;
}
.btn-primary[disabled] {
  opacity: 0.6;
  cursor: not-allowed;
}
.btn-link {
  background: transparent;
  border: none;
  color: #2563eb;
  text-decoration: underline;
}
.card {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 16px;
}
.card h3 {
  margin: 0 0 12px;
  font-size: 16px;
}
.picker {
  display: flex;
  align-items: center;
  gap: 12px;
}
.search-input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid #ccc;
  border-radius: 6px;
  font-size: 14px;
}
.hint {
  color: #6b7280;
  font-size: 13px;
}
.result-list {
  margin-top: 12px;
  max-height: 320px;
  overflow-y: auto;
  border: 1px solid #eee;
  border-radius: 6px;
}
.result-row {
  display: grid;
  grid-template-columns: 140px 1fr 1.5fr 80px;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid #f0f0f0;
  cursor: pointer;
  font-size: 14px;
}
.result-row:hover {
  background: #f9fafb;
}
.r-no {
  font-weight: 600;
  color: #111;
}
.r-addr {
  color: #6b7280;
  font-size: 13px;
}
.r-src {
  color: #6b7280;
  font-size: 12px;
  text-align: right;
}
.empty {
  padding: 16px;
  color: #9ca3af;
  text-align: center;
}
.selected-box {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  background: #f0f9ff;
  border: 1px solid #bae6fd;
  border-radius: 6px;
}
.form-row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 12px;
}
.form-row > label:first-child {
  width: 90px;
  padding-top: 6px;
  color: #374151;
  font-size: 14px;
}
.form-row input[type="date"],
.form-row textarea {
  flex: 1;
  padding: 8px 10px;
  border: 1px solid #ccc;
  border-radius: 6px;
  font-size: 14px;
  font-family: inherit;
}
.form-row .inline {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  color: #374151;
}
.actions {
  margin-top: 8px;
}
.err {
  margin-top: 12px;
  padding: 8px 12px;
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 6px;
  color: #b91c1c;
  font-size: 14px;
}
.ok {
  margin-top: 12px;
  padding: 8px 12px;
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  border-radius: 6px;
  color: #166534;
  font-size: 14px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
</style>
