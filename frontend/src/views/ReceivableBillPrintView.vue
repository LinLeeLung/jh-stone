<template>
  <div class="print-root">
    <div class="toolbar no-print">
      <RouterLink class="btn" :to="`/receivable-bills/${route.params.id}`">← 返回帳單</RouterLink>
      <button class="btn btn-primary" @click="doPrint" :disabled="loading">🖨 列印總表</button>
      <span v-if="loading" class="hint">載入中…</span>
      <span v-if="errMsg" class="err">{{ errMsg }}</span>
    </div>

    <div v-if="bill" class="a4-landscape">
      <div class="page-meta-row">
        <div class="page-meta-left">峻晟應收對帳單</div>
        <div class="page-meta-center">{{ formatDateTime(today) }}</div>
        <div class="page-meta-right">第 1 頁</div>
      </div>

      <header class="doc-header">
        <div class="company-title">峻晟實業(股)公司/峻健實業有限公司</div>
        <h1>應收對帳單明細表□客戶聯□已附發票□留底</h1>
      </header>

      <section class="statement-meta">
        <div class="meta-col meta-col-main">
          <div class="meta-line">
            <span class="meta-label">對象編號:</span>
            <span class="meta-value">{{ customerProfile.code || bill.customerId || "—" }}</span>
            <span class="meta-value name-value">{{ customerProfile.name || "—" }}</span>
          </div>
          <div class="meta-line">
            <span class="meta-label">統一編號:</span>
            <span class="meta-value">{{ customerProfile.taxId || "—" }}</span>
          </div>
          <div class="meta-line split-line">
            <div>
              <span class="meta-label">電　　話:</span>
              <span class="meta-value">{{ customerProfile.phone || "—" }}</span>
            </div>
            <div>
              <span class="meta-label">傳　　真:</span>
              <span class="meta-value">{{ customerProfile.fax || "—" }}</span>
            </div>
          </div>
          <div class="meta-line address-line">
            <span class="meta-label">公司地址:</span>
            <span class="meta-value">{{ customerProfile.address || "—" }}</span>
          </div>
          <div class="meta-line">
            <span class="meta-label">結帳日期:</span>
            <span class="meta-value">{{ billingPeriodLabel }}</span>
          </div>
          <div class="meta-line">
            <span class="meta-label">製表日期:</span>
            <span class="meta-value">{{ rocPrintDate }}</span>
          </div>
        </div>
        <div class="meta-col meta-col-side">
          <div class="side-card">
            <div class="side-label">帳單號</div>
            <div class="side-value">{{ bill.billNo || bill.id }}</div>
          </div>
          <div class="side-card">
            <div class="side-label">帳期</div>
            <div class="side-value">{{ bill.billingMonth || "—" }}</div>
          </div>
          <div class="side-card">
            <div class="side-label">發票號</div>
            <div class="side-value">{{ bill.invoiceNo || "—" }}</div>
          </div>
          <div class="side-card">
            <div class="side-label">開票日</div>
            <div class="side-value">{{ formatDate(bill.invoiceIssuedAt) }}</div>
          </div>
          <div class="side-card">
            <div class="side-label">訂單數</div>
            <div class="side-value">{{ bill.orderCount || 0 }}</div>
          </div>
        </div>
      </section>

      <table class="detail-table">
        <thead>
          <tr>
            <th>帳單日期</th>
            <th>訂單號</th>
            <th>品名 / 規格</th>
            <th>數量</th>
            <th>單價</th>
            <th>小計</th>
            <th>合計金額</th>
            <th>安裝地址</th>
          </tr>
        </thead>
        <tbody>
          <template v-for="item in items" :key="item.id">
            <tr v-for="(line, lineIndex) in printableLines(item)" :key="`${item.id}-${line.id || lineIndex}`">
              <td>{{ lineIndex === 0 ? formatDate(item.billingDate || item.sourceOrder?.customerSignedAt || bill.invoiceIssuedAt) : "" }}</td>
              <td>{{ lineIndex === 0 ? (item.sourceOrderNo || item.sourceOrderId) : "" }}</td>
              <td>{{ line.description || "—" }}</td>
              <td>{{ formatLineQty(line) }}</td>
              <td>{{ formatMoney(line.unitPrice) }}</td>
              <td>{{ formatMoney(line.amount) }}</td>
              <td>{{ lineIndex === 0 ? formatMoney(item.amountTotal) : "" }}</td>
              <td>{{ lineIndex === 0 ? orderSiteAddress(item) : "" }}</td>
            </tr>
          </template>
        </tbody>
      </table>

      <section class="totals-section">
        <div class="totals-box">
          <div><span>合計金額：</span><strong>{{ formatMoney(effectiveTotal) }}</strong></div>
          <div><span>已收金額：</span><strong>{{ formatMoney(bill.paidAmount) }}</strong></div>
          <div><span>未收金額：</span><strong>{{ formatMoney(bill.balanceAmount) }}</strong></div>
        </div>
        <div class="totals-box notes-box">
          <div><span>備註：</span>{{ bill.notes || "—" }}</div>
          <div><span>狀態：</span>{{ billStatusLabel(bill.paymentStatus) }}</div>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import { RouterLink, useRoute } from "vue-router";
import { getCustomerById, getReceivableBill, getSalesOrder, listReceivableItemsByBill } from "../firebase";

const route = useRoute();
const loading = ref(true);
const errMsg = ref("");
const bill = ref(null);
const items = ref([]);
const customer = ref(null);
const today = new Date();

const effectiveTotal = computed(() => {
  if (!bill.value) return 0;
  const adjusted = Number(bill.value.adjustedAmountTotal);
  return Number.isFinite(adjusted) && adjusted >= 0
    ? adjusted
    : Number(bill.value.amountTotal) || 0;
});

const billingPeriodLabel = computed(() => {
  const start = formatRocDate(bill.value?.billingPeriodStart);
  const end = formatRocDate(bill.value?.billingPeriodEnd);
  if (start === "—" && end === "—") return "—";
  if (start === end) return start;
  return `${start} 到 ${end}`;
});
const rocPrintDate = computed(() => formatRocDate(today));

const customerProfile = computed(() => {
  const snapshot = bill.value?.customerSnapshot || {};
  const master = customer.value || {};
  return {
    code: master.code || snapshot.code || master.id || snapshot.id || "",
    name: master.name || snapshot.name || bill.value?.customerName || "",
    taxId: master.taxId || snapshot.taxId || "",
    phone: master.phone || snapshot.phone || "",
    fax: master.fax || snapshot.fax || "",
    address: master.address || snapshot.address || "",
  };
});

function coerceDate(value) {
  if (!value) return null;
  if (typeof value?.toDate === "function") return value.toDate();
  if (value instanceof Date) return value;
  if (typeof value === "object" && Number.isFinite(Number(value.seconds))) {
    return new Date(Number(value.seconds) * 1000);
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(value) {
  const date = coerceDate(value);
  if (!date) return "—";
  return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}`;
}

function formatRocDate(value) {
  const date = coerceDate(value);
  if (!date) return "—";
  const rocYear = String(date.getFullYear() - 1911).padStart(4, "0");
  return `${rocYear}/${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}`;
}

function formatDateTime(value) {
  const date = coerceDate(value);
  if (!date) return "—";
  const hour = date.getHours();
  const period = hour >= 12 ? "下午" : "上午";
  const displayHour = hour % 12 || 12;
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")} ${period} ${displayHour}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function formatMoney(value) {
  const amount = Number(value) || 0;
  return amount.toLocaleString();
}

function formatLineQty(line = {}) {
  const qty = Number(line.qty) || 0;
  return `${qty}${line.unit ? ` ${line.unit}` : ""}`.trim() || "—";
}

function printableLines(item = {}) {
  return Array.isArray(item.lineItems) && item.lineItems.length
    ? item.lineItems
    : [{ id: "main", description: item.sourceOrderNo || item.sourceOrderId || "訂單金額", qty: 1, unit: "式", unitPrice: item.amountTotal, amount: item.amountTotal }];
}

function orderSiteAddress(item = {}) {
  return (
    item.sourceOrder?.pendingSignSnapshot?.installAddress ||
    item.sourceOrder?.pendingSignSnapshot?.siteAddress ||
    item.sourceOrder?.installAddress ||
    item.sourceOrder?.siteAddress ||
    item.orderSnapshot?.installAddress ||
    item.orderSnapshot?.siteAddress ||
    "—"
  );
}

function billStatusLabel(status) {
  return {
    draft: "草稿",
    issued: "已出帳",
    partial: "部分收款",
    paid: "已收清",
    void: "作廢",
  }[status] || status || "—";
}

async function load() {
  loading.value = true;
  errMsg.value = "";
  try {
    bill.value = await getReceivableBill(route.params.id);
    if (!bill.value) {
      errMsg.value = "找不到帳單";
      return;
    }
    customer.value = bill.value.customerId ? await getCustomerById(bill.value.customerId) : null;
    const rows = await listReceivableItemsByBill(route.params.id);
    items.value = await Promise.all(
      rows.map(async (item) => ({
        ...item,
        sourceOrder: item.sourceOrderId ? await getSalesOrder(item.sourceOrderId) : null,
      })),
    );
  } catch (error) {
    errMsg.value = error?.message || String(error);
  } finally {
    loading.value = false;
  }
}

function doPrint() {
  window.print();
}

onMounted(load);
</script>

<style scoped>
.print-root {
  background: #e5e7eb;
  min-height: 100vh;
  padding: 16px 0;
}

.toolbar {
  position: sticky;
  top: 0;
  z-index: 100;
  background: #1e293b;
  color: #fff;
  padding: 8px 16px;
  display: flex;
  gap: 12px;
  align-items: center;
  margin-bottom: 16px;
}

.btn {
  padding: 6px 14px;
  border-radius: 6px;
  background: #475569;
  color: #fff;
  border: none;
  text-decoration: none;
  cursor: pointer;
  font-size: 14px;
}

.btn-primary {
  background: #2563eb;
}

.hint {
  color: #cbd5e1;
  font-size: 13px;
}

.err {
  color: #fca5a5;
  font-size: 13px;
}

.a4-landscape {
  width: 297mm;
  min-height: 210mm;
  background: #fff;
  margin: 0 auto;
  padding: 6mm 7mm;
  box-sizing: border-box;
  box-shadow: 0 4px 18px rgba(0, 0, 0, 0.35);
  font-family: "微軟正黑體", "Microsoft JhengHei", Arial, sans-serif;
  color: #111;
  font-size: 9pt;
}

.page-meta-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  color: #6b7280;
  font-size: 7.5pt;
  margin-bottom: 2.5mm;
}

.page-meta-center {
  flex: 1;
  text-align: center;
}

.page-meta-right {
  min-width: 70px;
  text-align: right;
}

.doc-header {
  text-align: center;
  padding-bottom: 2px;
  margin-bottom: 4px;
}

.company-title {
  font-size: 17pt;
  letter-spacing: 1px;
  line-height: 1.1;
}

.doc-header h1 {
  margin: 2px 0 0;
  font-size: 19pt;
  letter-spacing: 1px;
  font-weight: 400;
}

.statement-meta {
  display: grid;
  grid-template-columns: minmax(0, 1.7fr) minmax(240px, 0.9fr);
  gap: 12px;
  margin-bottom: 8px;
}

.meta-col-main {
  padding-top: 1px;
}

.meta-line {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 2px;
  font-size: 10.5pt;
  line-height: 1.2;
}

.meta-label {
  min-width: 74px;
  letter-spacing: 1px;
}

.meta-value {
  word-break: break-word;
}

.name-value {
  margin-left: 2px;
}

.split-line {
  justify-content: space-between;
  gap: 12px;
}

.split-line > div {
  flex: 1;
}

.address-line {
  align-items: flex-start;
}

.meta-col-side {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 5px;
  align-content: start;
}

.side-card {
  border: 1px solid #111;
  min-height: 40px;
  padding: 4px 6px;
}

.side-label {
  font-size: 7pt;
  color: #4b5563;
  margin-bottom: 2px;
}

.side-value {
  font-size: 9pt;
  font-weight: 600;
  word-break: break-word;
}

.detail-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  font-size: 7.8pt;
}

.detail-table th,
.detail-table td {
  border: 1px solid #222;
  padding: 2px 4px;
  vertical-align: top;
}

.detail-table thead th {
  background: #f8fafc;
  font-weight: 600;
  text-align: left;
}

.detail-table th:nth-child(1),
.detail-table td:nth-child(1) { width: 9%; }
.detail-table th:nth-child(2),
.detail-table td:nth-child(2) { width: 7%; }
.detail-table th:nth-child(3),
.detail-table td:nth-child(3) { width: 31%; }
.detail-table th:nth-child(4),
.detail-table td:nth-child(4) { width: 6%; }
.detail-table th:nth-child(5),
.detail-table td:nth-child(5) { width: 5%; }
.detail-table th:nth-child(6),
.detail-table td:nth-child(6) { width: 6%; }
.detail-table th:nth-child(7),
.detail-table td:nth-child(7) { width: 7%; }
.detail-table th:nth-child(8),
.detail-table td:nth-child(8) { width: 29%; }

.totals-section {
  display: grid;
  grid-template-columns: 1.2fr 1fr;
  gap: 8px;
  margin-top: 7px;
}

.totals-box {
  border: 1px solid #cbd5e1;
  padding: 6px 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 8.3pt;
}

.notes-box {
  white-space: pre-wrap;
}

@media print {
  @page { size: A4 landscape; margin: 6mm; }
  .no-print { display: none !important; }
  .print-root { background: #fff; padding: 0; }
  .a4-landscape {
    width: auto;
    min-height: auto;
    margin: 0;
    box-shadow: none;
    padding: 0;
  }
}
</style>