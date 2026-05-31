<template>
  <section class="page-card bill-detail-page">
    <header class="page-head sticky-page-head">
      <div>
        <h1>帳單詳情</h1>
        <p class="muted-text">可回填發票號、調整金額與登記收款。</p>
      </div>
      <div class="head-actions">
        <RouterLink class="btn-aux" to="/receivable-bills">返回帳單列表</RouterLink>
        <RouterLink class="btn-aux" :to="`/receivable-bills/${route.params.id}/print`">總表</RouterLink>
        <RouterLink class="btn-aux" :to="`/receivable-bills/${route.params.id}/sign-print`">列印回簽</RouterLink>
        <button class="btn-query" :disabled="saving" @click="saveMeta">{{ saving ? '儲存中…' : '儲存帳單資料' }}</button>
      </div>
    </header>

    <div v-if="loading" class="muted-text">讀取中…</div>
    <div v-else-if="!bill" class="muted-text">找不到帳單。</div>
    <template v-else>
      <section class="summary-grid">
        <div class="summary-card">
          <div class="summary-label">帳單號</div>
          <div class="summary-value mono">{{ bill.billNo || bill.id }}</div>
        </div>
        <div class="summary-card">
          <div class="summary-label">客戶</div>
          <div class="summary-value">{{ bill.customerSnapshot?.name || '—' }}</div>
        </div>
        <div class="summary-card">
          <div class="summary-label">帳期</div>
          <div class="summary-value">{{ bill.billingMonth || '—' }}</div>
        </div>
        <div class="summary-card">
          <div class="summary-label">訂單數</div>
          <div class="summary-value">{{ bill.orderCount || 0 }}</div>
        </div>
        <div class="summary-card">
          <div class="summary-label">原始應收</div>
          <div class="summary-value">{{ formatAmount(bill.amountTotal) }}</div>
        </div>
        <div class="summary-card">
          <div class="summary-label">調整後應收</div>
          <div class="summary-value">{{ formatAmount(effectiveTotal) }}</div>
        </div>
        <div class="summary-card">
          <div class="summary-label">已收</div>
          <div class="summary-value">{{ formatAmount(bill.paidAmount) }}</div>
        </div>
        <div class="summary-card">
          <div class="summary-label">未收</div>
          <div class="summary-value">{{ formatAmount(bill.balanceAmount) }}</div>
        </div>
      </section>

      <section class="card-block">
        <h3>帳單資料</h3>
        <div class="form-grid">
          <label>
            發票號
            <input v-model="form.invoiceNo" type="text" placeholder="例：AB-12345678" />
          </label>
          <label>
            開票日
            <input v-model="form.invoiceIssuedAt" type="date" />
          </label>
          <label>
            狀態
            <select v-model="form.paymentStatus">
              <option value="draft">草稿</option>
              <option value="issued">已出帳</option>
              <option value="partial">部分收款</option>
              <option value="paid">已收清</option>
              <option value="void">作廢</option>
            </select>
            <small v-if="Number(bill?.paidAmount) > 0" class="muted-text">
              已有收款後，狀態會依未收金額自動重算。
            </small>
          </label>
          <label class="checkbox-row">
            <input v-model="form.invoiceRequired" type="checkbox" />
            <span>需要開發票</span>
          </label>
          <label class="span-2">
            備註
            <textarea v-model="form.notes" rows="3"></textarea>
          </label>
        </div>
      </section>

      <section class="card-block two-column">
        <div>
          <div class="section-head-row">
            <h3>金額調整</h3>
            <button class="btn-aux btn-mini" @click="addAdjustment">新增調整</button>
          </div>
          <table class="data-table" v-if="bill.adjustments?.length">
            <thead>
              <tr>
                <th>時間</th>
                <th>類型</th>
                <th>金額</th>
                <th>備註</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(item, index) in bill.adjustments" :key="`adj-${index}`">
                <td>{{ formatDateTime(item.at) }}</td>
                <td>{{ adjustmentTypeLabel(item.type) }}</td>
                <td>{{ formatSignedAmount(item.amount) }}</td>
                <td>{{ item.note || '—' }}</td>
              </tr>
            </tbody>
          </table>
          <div v-else class="muted-text">尚無調整紀錄。</div>
        </div>

        <div>
          <div class="section-head-row">
            <h3>收款紀錄</h3>
            <button class="btn-aux btn-mini" @click="recordPayment">登記收款</button>
          </div>
          <table class="data-table" v-if="bill.payments?.length">
            <thead>
              <tr>
                <th>時間</th>
                <th>方式</th>
                <th>金額</th>
                <th>備註</th>
                <th>動作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(item, index) in bill.payments" :key="`pay-${index}`">
                <td>{{ formatDateTime(item.paidAt) }}</td>
                <td>{{ paymentMethodLabel(item.method) }}</td>
                <td>{{ formatAmount(item.amount) }}</td>
                <td>{{ item.note || item.referenceNo || '—' }}</td>
                <td>
                  <button class="btn-aux btn-mini" @click="editPayment(index)">修改</button>
                  <button class="btn-aux btn-mini btn-danger" @click="removePayment(index)">刪除</button>
                </td>
              </tr>
            </tbody>
          </table>
          <div v-else class="muted-text">尚無收款紀錄。</div>
        </div>
      </section>

      <section class="card-block">
        <h3>帳單明細</h3>
        <div v-if="itemsLoading" class="muted-text">讀取明細中…</div>
        <div v-else-if="!items.length" class="muted-text">尚無帳單明細。</div>
        <div v-else class="bill-item-list">
          <article v-for="item in items" :key="item.id" class="bill-item-card">
            <div class="bill-item-head">
              <div>
                <div class="summary-label">訂單號</div>
                <div class="summary-value mono">{{ item.sourceOrderNo || item.sourceOrderId }}</div>
              </div>
              <div>
                <div class="summary-label">訂單金額</div>
                <div class="summary-value">{{ formatAmount(item.amountTotal) }}</div>
              </div>
              <RouterLink class="btn-aux btn-mini" :to="`/orders/${item.sourceOrderId}/edit`">訂單</RouterLink>
            </div>

            <div class="bill-item-meta-grid">
              <div>
                <div class="summary-label">安裝地址</div>
                <div>{{ orderSiteAddress(item) }}</div>
              </div>
              <div>
                <div class="summary-label">觸發原因</div>
                <div>{{ item.billingEligibleReason || '—' }}</div>
              </div>
            </div>

            <div class="bill-item-sections">
              <section class="detail-block">
                <h4>訂單細項</h4>
                <table class="data-table compact-table">
                  <thead>
                    <tr>
                      <th>項目</th>
                      <th>數量</th>
                      <th>單價</th>
                      <th>小計</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="line in item.lineItems || []" :key="`${item.id}-${line.id || line.description}`">
                      <td>{{ line.description || '—' }}</td>
                      <td>{{ formatLineQty(line) }}</td>
                      <td>{{ formatAmount(line.unitPrice) }}</td>
                      <td>{{ formatAmount(line.amount) }}</td>
                    </tr>
                  </tbody>
                </table>
              </section>

              <section class="detail-block">
                <h4>回簽資料</h4>
                <div class="sign-grid">
                  <div>
                    <div class="summary-label">回簽日期</div>
                    <div>{{ formatDateTime(item.sourceOrder?.customerSignedAt) }}</div>
                  </div>
                  <div>
                    <div class="summary-label">回簽交期</div>
                    <div>{{ formatDateTime(item.sourceOrder?.pendingSignSnapshot?.promisedAt) }}</div>
                  </div>
                  <div>
                    <div class="summary-label">圖面快照</div>
                    <div>{{ signDrawingCountLabel(item.sourceOrder?.pendingSignDrawingVersions) }}</div>
                  </div>
                  <div>
                    <div class="summary-label">簽回檔案</div>
                    <div v-if="latestSignedScan(item.sourceOrder)?.url" class="signed-preview-block">
                      <a
                        :href="latestSignedScan(item.sourceOrder)?.url"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="signed-preview-link"
                      >查看原始檔</a>
                      <img
                        v-if="isImageScan(latestSignedScan(item.sourceOrder))"
                        class="signed-preview-image"
                        :src="latestSignedScan(item.sourceOrder)?.url"
                        alt="回簽縮圖"
                      />
                      <iframe
                        v-else-if="isPdfScan(latestSignedScan(item.sourceOrder))"
                        class="signed-preview-frame"
                        :src="signedScanPreviewUrl(latestSignedScan(item.sourceOrder))"
                        title="回簽預覽"
                      />
                      <div v-else class="muted-text">此檔案格式無法直接預覽，請點上方查看原始檔。</div>
                    </div>
                    <span v-else>—</span>
                  </div>
                </div>
              </section>
            </div>
          </article>
        </div>
      </section>
    </template>
  </section>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import { RouterLink, useRoute } from "vue-router";
import {
  addReceivableBillAdjustment,
  deleteReceivablePayment,
  getReceivableBill,
  getSalesOrder,
  listReceivableItemsByBill,
  recordReceivablePayment,
  updateReceivablePayment,
  updateReceivableBill,
} from "../firebase";

const route = useRoute();
const loading = ref(true);
const itemsLoading = ref(true);
const saving = ref(false);
const bill = ref(null);
const items = ref([]);
const form = ref({
  invoiceNo: "",
  invoiceIssuedAt: "",
  notes: "",
  invoiceRequired: true,
  paymentStatus: "draft",
});

const effectiveTotal = computed(() => {
  if (!bill.value) return 0;
  return Number(bill.value.adjustedAmountTotal) || Number(bill.value.amountTotal) || 0;
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

function toDateInput(value) {
  const date = coerceDate(value);
  if (!date) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatDateTime(value) {
  const date = coerceDate(value);
  if (!date) return "—";
  return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}`;
}

function formatAmount(value) {
  const amount = Number(value) || 0;
  return `${amount.toLocaleString()} 元`;
}

function formatSignedAmount(value) {
  const amount = Number(value) || 0;
  return `${amount > 0 ? "+" : ""}${amount.toLocaleString()} 元`;
}

function adjustmentTypeLabel(value) {
  return {
    manualAdd: "人工加項",
    manualDeduct: "人工扣減",
    writeOff: "沖銷",
    discount: "折讓",
  }[value] || value || "—";
}

function paymentMethodLabel(value) {
  return {
    transfer: "匯款",
    check: "支票",
    cutTicketDeduction: "切口票扣款",
  }[value] || value || "—";
}

function formatLineQty(line = {}) {
  const qty = Number(line.qty) || 0;
  return `${qty}${line.unit ? ` ${line.unit}` : ""}`.trim() || "—";
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

function signDrawingCountLabel(versions = {}) {
  const count = Object.keys(versions || {}).length;
  return count ? `${count} 張圖面快照` : "—";
}

function latestSignedScan(order = {}) {
  const signedScans = Array.isArray(order?.signedScans)
    ? order.signedScans.filter((item) => item?.url)
    : [];

  if (signedScans.length) {
    return [...signedScans].sort((a, b) => {
      const timeA = coerceDate(a?.uploadedAt)?.getTime() || 0;
      const timeB = coerceDate(b?.uploadedAt)?.getTime() || 0;
      return timeB - timeA;
    })[0];
  }

  return order?.signedScanUrl
    ? {
        url: order.signedScanUrl,
        uploadedAt: order.customerSignedAt || null,
      }
    : null;
}

function signedScanUrlExtension(scan = {}) {
  const rawUrl = String(scan?.url || "").trim();
  if (!rawUrl) return "";
  try {
    const parsed = new URL(rawUrl);
    const fileName = decodeURIComponent(parsed.pathname.split("/").pop() || "");
    const match = fileName.match(/\.([a-zA-Z0-9]+)$/);
    return String(match?.[1] || "").toLowerCase();
  } catch {
    const cleanUrl = rawUrl.split("?")[0];
    const match = cleanUrl.match(/\.([a-zA-Z0-9]+)$/);
    return String(match?.[1] || "").toLowerCase();
  }
}

function isPdfScan(scan = {}) {
  return signedScanUrlExtension(scan) === "pdf";
}

function isImageScan(scan = {}) {
  return ["png", "jpg", "jpeg", "webp", "gif"].includes(
    signedScanUrlExtension(scan),
  );
}

function signedScanPreviewUrl(scan = {}) {
  const rawUrl = String(scan?.url || "").trim();
  if (!rawUrl) return "";
  return isPdfScan(scan)
    ? `${rawUrl}${rawUrl.includes("#") ? "" : "#toolbar=0&navpanes=0&scrollbar=0&view=FitH"}`
    : rawUrl;
}

async function loadBill() {
  loading.value = true;
  try {
    bill.value = await getReceivableBill(route.params.id);
    if (bill.value) {
      form.value = {
        invoiceNo: bill.value.invoiceNo || "",
        invoiceIssuedAt: toDateInput(bill.value.invoiceIssuedAt),
        notes: bill.value.notes || "",
        invoiceRequired: bill.value.invoiceRequired === true,
        paymentStatus: bill.value.paymentStatus || "draft",
      };
    }
  } finally {
    loading.value = false;
  }
}

async function loadItems() {
  itemsLoading.value = true;
  try {
    const rows = await listReceivableItemsByBill(route.params.id);
    items.value = await Promise.all(
      rows.map(async (item) => ({
        ...item,
        sourceOrder: item.sourceOrderId ? await getSalesOrder(item.sourceOrderId) : null,
      })),
    );
  } finally {
    itemsLoading.value = false;
  }
}

async function reloadAll() {
  await Promise.all([loadBill(), loadItems()]);
}

async function saveMeta() {
  saving.value = true;
  try {
    await updateReceivableBill(route.params.id, {
      invoiceNo: form.value.invoiceNo,
      invoiceIssuedAt: form.value.invoiceIssuedAt || null,
      notes: form.value.notes,
      invoiceRequired: form.value.invoiceRequired,
      paymentStatus: form.value.paymentStatus,
    });
    await loadBill();
    alert("帳單資料已更新。");
  } catch (error) {
    alert(`儲存失敗：${error?.message || error}`);
  } finally {
    saving.value = false;
  }
}

async function addAdjustment() {
  const rawAmount = prompt("請輸入調整金額，增加輸入正數，扣減輸入負數", "0");
  if (rawAmount == null) return;
  const amount = Number(rawAmount);
  if (!amount) {
    alert("調整金額不可為 0");
    return;
  }
  const typeDefault = amount > 0 ? "manualAdd" : "manualDeduct";
  const type = prompt("請輸入調整類型：manualAdd / manualDeduct / writeOff / discount", typeDefault) || typeDefault;
  const note = prompt("請輸入調整原因", "") || "";
  try {
    await addReceivableBillAdjustment(route.params.id, { amount, type, note });
    await loadBill();
    alert("已新增調整。");
  } catch (error) {
    alert(`新增調整失敗：${error?.message || error}`);
  }
}

async function recordPayment() {
  if (!bill.value) return;
  const rawAmount = prompt(`請輸入 ${bill.value.billNo} 的收款金額`, String(bill.value.balanceAmount || ""));
  if (rawAmount == null) return;
  const amount = Number(rawAmount);
  if (!(amount > 0)) {
    alert("收款金額必須大於 0");
    return;
  }
  const method = prompt("請輸入收款方式：transfer / check / cutTicketDeduction", "transfer") || "transfer";
  const referenceNo = prompt("請輸入參考號碼（可留空）", "") || "";
  const note = prompt("收款備註（可留空）", "") || "";
  try {
    await recordReceivablePayment(route.params.id, { amount, method, referenceNo, note });
    await loadBill();
    alert("已登記收款。");
  } catch (error) {
    alert(`收款登記失敗：${error?.message || error}`);
  }
}

async function editPayment(index) {
  const payment = bill.value?.payments?.[index];
  if (!payment) return;
  const rawAmount = prompt("請輸入收款金額", String(payment.amount || ""));
  if (rawAmount == null) return;
  const amount = Number(rawAmount);
  if (!(amount > 0)) {
    alert("收款金額必須大於 0");
    return;
  }
  const method = prompt(
    "請輸入收款方式：transfer / check / cutTicketDeduction",
    payment.method || "transfer",
  ) || payment.method || "transfer";
  const paidAt = prompt(
    "請輸入收款日期（YYYY-MM-DD）",
    toDateInput(payment.paidAt) || "",
  );
  if (paidAt == null) return;
  const referenceNo = prompt("請輸入參考號碼（可留空）", payment.referenceNo || "") || "";
  const note = prompt("收款備註（可留空）", payment.note || "") || "";
  try {
    await updateReceivablePayment(route.params.id, index, {
      amount,
      method,
      paidAt: paidAt || null,
      referenceNo,
      note,
    });
    await loadBill();
    alert("收款紀錄已更新。");
  } catch (error) {
    alert(`修改收款失敗：${error?.message || error}`);
  }
}

async function removePayment(index) {
  if (!bill.value?.payments?.[index]) return;
  if (!confirm("確定要刪除這筆收款紀錄？")) return;
  try {
    await deleteReceivablePayment(route.params.id, index);
    await loadBill();
    alert("收款紀錄已刪除。");
  } catch (error) {
    alert(`刪除收款失敗：${error?.message || error}`);
  }
}

onMounted(reloadAll);
</script>

<style scoped>
.bill-detail-page {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.head-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 10px;
}

.summary-card,
.card-block {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 14px;
}

.summary-label {
  font-size: 0.82rem;
  color: #6b7280;
}

.summary-value {
  margin-top: 4px;
  font-size: 1.05rem;
  font-weight: 600;
  color: #111827;
}

.mono {
  font-family: Consolas, Monaco, monospace;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px 16px;
}

.form-grid label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 0.92rem;
}

.form-grid input,
.form-grid select,
.form-grid textarea {
  border: 1px solid #d1d5db;
  border-radius: 8px;
  padding: 8px 10px;
  font: inherit;
}

.span-2 {
  grid-column: 1 / -1;
}

.checkbox-row {
  flex-direction: row !important;
  align-items: center;
  gap: 8px !important;
  padding-top: 28px;
}

.section-head-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.two-column {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.bill-item-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.bill-item-card {
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.bill-item-head,
.bill-item-meta-grid,
.bill-item-sections,
.sign-grid {
  display: grid;
  gap: 12px;
}

.bill-item-head {
  grid-template-columns: repeat(3, minmax(0, auto));
  align-items: center;
  justify-content: space-between;
}

.bill-item-meta-grid,
.bill-item-sections,
.sign-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.detail-block {
  border: 1px solid #eef2f7;
  border-radius: 10px;
  padding: 12px;
  background: #fbfdff;
}

.detail-block h4 {
  margin: 0 0 10px;
  font-size: 0.95rem;
}

.signed-preview-block {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.signed-preview-link {
  width: fit-content;
}

.btn-danger {
  margin-left: 6px;
  color: #b91c1c;
  border-color: #fecaca;
  background: #fff5f5;
}

.signed-preview-image,
.signed-preview-frame {
  width: 100%;
  min-height: 220px;
  max-height: 320px;
  border: 1px solid #dbe3ee;
  border-radius: 10px;
  background: #fff;
}

.signed-preview-image {
  object-fit: contain;
  padding: 8px;
}

.signed-preview-frame {
  overflow: hidden;
}

.compact-table th,
.compact-table td {
  padding: 8px 10px;
}

@media (max-width: 960px) {
  .form-grid,
  .two-column,
  .bill-item-meta-grid,
  .bill-item-sections,
  .sign-grid {
    grid-template-columns: 1fr;
  }

  .bill-item-head {
    grid-template-columns: 1fr;
    justify-content: stretch;
  }
}
</style>