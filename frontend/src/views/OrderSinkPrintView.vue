<template>
  <div class="print-root">
    <div class="toolbar no-print">
      <RouterLink class="btn" :to="`/orders/${route.params.id}/edit`">← 返回訂單</RouterLink>
      <button class="btn btn-primary" @click="doPrint" :disabled="loading || !printRows.length">
        🖨 列印
      </button>
      <span v-if="loading" class="hint">載入中…</span>
      <span v-else-if="!printRows.length" class="hint">此訂單尚未建立水槽資料</span>
      <span v-if="errMsg" class="err">{{ errMsg }}</span>
    </div>

    <div v-if="!loading && !printRows.length && !errMsg" class="empty-card">
      <h2>沒有可列印的水槽資料</h2>
      <p>請先在訂單編輯頁新增至少一個水槽。</p>
    </div>

    <section
      v-for="row in printRows"
      :key="row.key"
      class="print-page"
    >
      <header class="page-header">
        <div class="page-title">水槽安裝單</div>
        <div class="page-subtitle">
          <span>訂單：{{ row.orderNo }}</span>
          <span v-if="printRows.length > 1">第 {{ row.index + 1 }} 個水槽</span>
        </div>
      </header>

      <table class="doc-table">
        <tbody>
          <tr>
            <th>訂單號碼</th>
            <td>{{ row.orderNo }}</td>
            <th>水槽型號</th>
            <td>{{ row.sinkLabel }}</td>
            <th>安裝日期</th>
            <td>{{ row.promisedAt }}</td>
          </tr>
          <tr>
            <th>客戶名稱</th>
            <td>{{ row.customerName }}</td>
            <th>工法</th>
            <td>{{ row.method }}</td>
            <th>槽數</th>
            <td>{{ row.bowlCount }}</td>
          </tr>
          <tr>
            <th>顏色</th>
            <td>{{ row.stoneLabel }}</td>
            <th>開孔尺寸</th>
            <td colspan="3">{{ row.holeLabel }}</td>
          </tr>
          <tr>
            <th>業主名稱</th>
            <td colspan="2">{{ row.ownerLabel }}</td>
            <th>聯絡電話</th>
            <td colspan="2">{{ row.ownerPhone }}</td>
          </tr>
          <tr>
            <th>安裝地點</th>
            <td colspan="5" class="address-cell">{{ row.siteAddress }}</td>
          </tr>
          <tr>
            <th>安裝人員</th>
            <td colspan="5">{{ row.installStaff }}</td>
          </tr>
          <tr>
            <th>備註</th>
            <td colspan="5">{{ row.notes }}</td>
          </tr>
        </tbody>
      </table>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import { getSalesOrder } from "../firebase";

const route = useRoute();
const order = ref(null);
const loading = ref(true);
const errMsg = ref("");

function formatDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return "—";
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) return `${Number(match[1])}/${Number(match[2])}/${Number(match[3])}`;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
}

function buildSinkLabel(sink = {}, index = 0) {
  const label = [sink.brand, sink.model].filter(Boolean).join(" ").trim();
  return label || `水槽${index + 1}`;
}

function buildHoleLabel(sink = {}) {
  const parts = [];
  if (sink.holeWidthMm) parts.push(`長 ${sink.holeWidthMm} mm`);
  if (sink.holeDepthMm) parts.push(`寬 ${sink.holeDepthMm} mm`);
  if (sink.holeRadiusMm) parts.push(`R ${sink.holeRadiusMm}`);
  return parts.join(" / ") || "—";
}

function resolveOrderNo(orderData = {}) {
  const candidates = [
    orderData.orderNo,
    orderData.orderNumber,
    orderData.customerOrderNo,
  ];
  for (const value of candidates) {
    const text = String(value || "").trim();
    if (text) return text;
  }
  return "—";
}

const printRows = computed(() => {
  if (!order.value) return [];
  const sinks = Array.isArray(order.value.sinks) ? order.value.sinks : [];
  const stoneLabel = (order.value.stones || [])
    .map((stone) => [stone.brand, stone.color].filter(Boolean).join(" ").trim())
    .filter(Boolean)
    .join("、") || "—";
  const installStaff = Array.isArray(order.value.installStaff)
    ? order.value.installStaff.filter(Boolean).join("、")
    : String(order.value.installStaff || "").trim();

  return sinks.map((sink, index) => ({
    key: `${order.value.id || route.params.id}-${index}`,
    index,
    orderNo: resolveOrderNo(order.value),
    sinkLabel: buildSinkLabel(sink, index),
    promisedAt: formatDate(order.value.promisedAt),
    customerName: String(order.value.customerName || "—"),
    method: String(sink.method || "—"),
    bowlCount: sink.bowlCount || "—",
    stoneLabel,
    holeLabel: buildHoleLabel(sink),
    ownerLabel: String(order.value.owner?.name || order.value.customerContact?.name || "—"),
    ownerPhone: String(order.value.owner?.phone || order.value.customerContact?.phone || "—"),
    siteAddress: String(order.value.siteAddress || "—"),
    installStaff: installStaff || "—",
    notes: String(order.value.specialNotes || sink.deliveryNote || "—"),
  }));
});

async function load() {
  loading.value = true;
  errMsg.value = "";
  try {
    const data = await getSalesOrder(route.params.id);
    if (!data) {
      errMsg.value = "找不到此訂單";
      return;
    }
    order.value = data;
  } catch (error) {
    errMsg.value = error?.message || "載入失敗";
  } finally {
    loading.value = false;
  }
}

function doPrint() {
  window.print();
}

onMounted(async () => {
  await load();
  if (!errMsg.value && printRows.value.length) {
    setTimeout(() => window.print(), 500);
  }
});
</script>

<style scoped>
.print-root {
  min-height: 100vh;
  background: #e5e7eb;
  padding: 16px 0 24px;
}

.toolbar {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  gap: 12px;
  align-items: center;
  margin-bottom: 16px;
  padding: 8px 16px;
  background: #1e293b;
  color: #fff;
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 6px 14px;
  border: none;
  border-radius: 6px;
  background: #475569;
  color: #fff;
  text-decoration: none;
  cursor: pointer;
  font-size: 14px;
}

.btn-primary {
  background: #2563eb;
}

.btn-primary:disabled {
  background: #64748b;
  cursor: not-allowed;
}

.hint {
  color: #cbd5e1;
  font-size: 14px;
}

.err {
  color: #fecaca;
  font-size: 14px;
}

.empty-card,
.print-page {
  width: 1050px;
  margin: 0 auto 16px;
  background: #fff;
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.08);
}

.empty-card {
  padding: 32px;
}

.empty-card h2 {
  margin: 0 0 12px;
}

.empty-card p {
  margin: 0;
  color: #475569;
}

.print-page {
  padding: 24px 28px;
  break-after: page;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  margin-bottom: 18px;
}

.page-title {
  font-size: 22px;
  font-weight: 700;
  letter-spacing: 2px;
}

.page-subtitle {
  display: flex;
  gap: 18px;
  color: #475569;
  font-size: 12px;
}

.doc-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  font-size: 16px;
}

.doc-table th,
.doc-table td {
  border: 2px solid #1f2937;
  padding: 10px 8px;
  vertical-align: middle;
  word-break: break-word;
  overflow-wrap: anywhere;
  line-height: 1.35;
}

.doc-table th {
  width: 12%;
  text-align: center;
  font-weight: 600;
  white-space: nowrap;
}

.address-cell {
  min-height: 88px;
}

@media print {
  .print-root {
    background: #fff;
    padding: 0;
  }

  .print-page,
  .empty-card {
    width: auto;
    margin: 0;
    box-shadow: none;
  }

  .no-print {
    display: none !important;
  }

  @page {
    size: A4 landscape;
    margin: 10mm;
  }
}
</style>