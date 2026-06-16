<template>
  <div class="orders-view">
    <header class="page-header">
      <h2>訂單列表</h2>
      <div class="header-actions">
        <RouterLink v-if="canDispatch" class="btn-aux" to="/orders/dispatch"
          >📋 發單作業</RouterLink
        >
        <RouterLink v-if="isAdmin" class="btn-aux" to="/orders/import"
          >匯入</RouterLink
        >
        <RouterLink class="btn-primary" to="/orders/new"
          >＋ 新建訂單</RouterLink
        >
      </div>
    </header>

    <!-- 篩選列 -->
    <div class="filter-bar">
      <input
        v-model="keyword"
        class="search-input"
        placeholder="搜尋客戶名稱 / 訂單號碼 / 地址 / 石材"
        @input="applyFilter"
      />
      <input
        v-model="customerKeyword"
        class="search-input"
        placeholder="客戶關鍵字（精準鎖定客戶）"
        @input="onCustomerKeywordInput"
      />
      <select v-model="exactCustomerName" @change="onExactCustomerChange">
        <option value="">全部客戶</option>
        <option v-for="name in customerCandidates" :key="name" :value="name">
          {{ name }}
        </option>
      </select>
      <button
        v-if="exactCustomerName"
        type="button"
        class="btn-aux"
        @click="clearExactCustomer"
      >
        清除客戶鎖定
      </button>
      <select v-model="statusFilter" @change="applyFilter">
        <option value="">全部狀態</option>
        <option value="draft">草稿</option>
        <option value="pendingSign">待回簽</option>
        <option value="confirmed">已確認</option>
        <option value="inProduction">生產中</option>
        <option value="delivered">已出貨</option>
        <option value="done">完工</option>
        <option value="cancelled">已取消</option>
      </select>
      <select v-model="sinkStatusFilter" @change="applyFilter">
        <option value="">全部水槽狀態</option>
        <option v-for="s in SINK_STATUS_LIST" :key="s.value" :value="s.value">
          {{ s.label }}
        </option>
      </select>
    </div>

    <p class="result-count">
      目前筆數：{{ filtered.length }}
      <span v-if="exactCustomerName">（客戶：{{ exactCustomerName }}）</span>
    </p>
    <p class="result-sales">
      銷售額統計：總計 {{ fmtMoney(salesStats.total) }}，平均
      {{ fmtMoney(salesStats.average) }}
      <span v-if="salesStats.counted !== filtered.length">
        （可計算 {{ salesStats.counted }} / {{ filtered.length }} 筆）
      </span>
    </p>

    <p v-if="loading" class="hint">載入中…</p>
    <p v-else-if="loadingExactCustomer" class="hint">查詢該客戶所有訂單中…</p>
    <p v-else-if="!filtered.length" class="hint">找不到符合的訂單。</p>

    <div v-else class="table-wrap">
      <table class="orders-table">
        <thead>
          <tr>
            <th></th>
            <th class="sortable" @click="setSort('promisedAt')">
              預交日{{ sortIcon("promisedAt") }}
            </th>
            <th class="sortable" @click="setSort('status')">
              訂單狀態{{ sortIcon("status") }}
            </th>
            <th class="sortable" @click="setSort('sinkStatus')">
              水槽狀態{{ sortIcon("sinkStatus") }}
            </th>
            <th class="sortable" @click="setSort('salesAmount')">
              銷售額{{ sortIcon("salesAmount") }}
            </th>
            <th class="sortable" @click="setSort('orderNo')">
              訂單號{{ sortIcon("orderNo") }}
            </th>
            <th class="sortable" @click="setSort('stones')">
              石材{{ sortIcon("stones") }}
            </th>
            <th class="sortable" @click="setSort('customerName')">
              客戶{{ sortIcon("customerName") }}
            </th>
            <th class="sortable" @click="setSort('category')">
              類別{{ sortIcon("category") }}
            </th>
            <th class="sortable" @click="setSort('countertop')">
              台面{{ sortIcon("countertop") }}
            </th>
            <th class="sortable" @click="setSort('siteAddress')">
              施工地址{{ sortIcon("siteAddress") }}
            </th>
            <th>打板</th>
            <th>對圖</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="o in filtered"
            :key="o.id"
            :class="{ 'row-has-drawing': hasDrawing(o) }"
          >
            <td class="col-actions">
              <RouterLink class="btn-mini" :to="`/orders/${o.id}/edit`"
                >編輯</RouterLink
              >
              <RouterLink
                class="btn-mini btn-draw"
                :to="`/orders/${o.id}/drawing`"
                >繪圖</RouterLink
              >
              <RouterLink
                class="btn-mini btn-conf"
                :to="`/orders/${o.id}/confirmation`"
                >確定單</RouterLink
              >
              <RouterLink
                class="btn-mini btn-origin"
                :to="`/orders/${o.id}/original-review`"
                >原圖/註記</RouterLink
              >
            </td>
            <td class="col-date">{{ fmtDate(o.promisedAt) }}</td>
            <td>
              <select
                v-if="isAdmin"
                :value="o.status"
                class="status-select"
                :class="'status-' + o.status"
                @change="onStatusChange(o, $event.target.value)"
              >
                <option
                  v-for="(label, val) in STATUS_LABEL"
                  :key="val"
                  :value="val"
                >
                  {{ label }}
                </option>
              </select>
              <span v-else class="status-chip" :class="'status-' + o.status">
                {{ STATUS_LABEL[o.status] || o.status || "—" }}
              </span>
            </td>
            <td>
              <span
                v-for="sink in sinkBadges(o)"
                :key="sink.label"
                class="sink-badge"
                :style="{ color: sink.color, background: sink.bg }"
                >{{ sink.label }}</span
              >
              <span v-if="!sinkBadges(o).length" class="dim">—</span>
            </td>
            <td class="col-amount">
              <span v-if="getOrderSalesAmount(o) !== null">
                {{ fmtMoney(getOrderSalesAmount(o)) }}
              </span>
              <span v-else class="dim">—</span>
            </td>
            <td class="col-no">
              <span v-if="o.orderNo" class="order-no">{{ o.orderNo }}</span>
              <span v-else class="dim">—</span>
            </td>
            <td class="col-stones">
              <template v-if="o.stones && o.stones.length">
                <div v-for="(s, i) in o.stones" :key="i" class="stone-tag">
                  {{ [s.brand, s.color].filter(Boolean).join(" ") || "—" }}
                </div>
              </template>
              <span v-else class="dim">—</span>
            </td>
            <td class="col-customer">
              <div class="customer-name">{{ o.customerName || "—" }}</div>
              <span v-if="o.isTestData" class="test-badge">測</span>
              <div class="customer-sub">
                {{ o.customerContact?.name || "" }}
              </div>
            </td>
            <td>{{ o.category || "—" }}</td>
            <td>
              {{ o.countertop?.type || "—" }}
              <span v-if="o.countertop?.totalCm" class="cm-tag"
                >{{ o.countertop.totalCm }}cm</span
              >
            </td>
            <td class="col-addr">{{ o.siteAddress || "—" }}</td>
            <td class="col-staff">{{ o.templatingStaff || "—" }}</td>
            <td class="col-staff">{{ o.drawingStaff || "—" }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <p v-if="!loading && rows.length >= loadLimit" class="hint hint-more">
      顯示最近 {{ loadLimit }} 筆，使用上方搜尋縮小範圍。
    </p>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from "vue";
import {
  listSalesOrders,
  listSalesOrdersByCustomerName,
  updateSalesOrder,
  auth,
  getUserByUid,
} from "../firebase";
import { SINK_STATUS_LIST, getSinkStatus } from "../utils/sinkStatus";

const STATUS_LABEL = {
  draft: "草稿",
  pendingSign: "待回簽",
  confirmed: "已確認",
  inProduction: "生產中",
  delivered: "已出貨",
  done: "完工",
  cancelled: "已取消",
};

const loadLimit = 200;
const ORDERS_VIEW_STATE_KEY = "orders-view-state-v1";
const loading = ref(true);
const loadingExactCustomer = ref(false);
const rows = ref([]);
const baseRows = ref([]);
const filtered = ref([]);
const isAdmin = ref(false);
const canDispatch = ref(false);

const keyword = ref("");
const statusFilter = ref("");
const sinkStatusFilter = ref("");
const customerKeyword = ref("");
const exactCustomerName = ref("");
const sortCol = ref("recentEditedAt");
const sortDir = ref(-1); // 1=asc, -1=desc

function saveViewState() {
  try {
    sessionStorage.setItem(
      ORDERS_VIEW_STATE_KEY,
      JSON.stringify({
        keyword: keyword.value,
        customerKeyword: customerKeyword.value,
        exactCustomerName: exactCustomerName.value,
        statusFilter: statusFilter.value,
        sinkStatusFilter: sinkStatusFilter.value,
        sortCol: sortCol.value,
        sortDir: sortDir.value,
      }),
    );
  } catch {
    // ignore storage errors
  }
}

function restoreViewState() {
  try {
    const raw = sessionStorage.getItem(ORDERS_VIEW_STATE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    keyword.value = String(parsed?.keyword || "");
    customerKeyword.value = String(parsed?.customerKeyword || "");
    exactCustomerName.value = String(parsed?.exactCustomerName || "");
    statusFilter.value = String(parsed?.statusFilter || "");
    sinkStatusFilter.value = String(parsed?.sinkStatusFilter || "");
    sortCol.value = String(parsed?.sortCol || "recentEditedAt");
    sortDir.value = Number(parsed?.sortDir) === 1 ? 1 : -1;
  } catch {
    // ignore parse errors
  }
}

const customerCandidates = computed(() => {
  const kw = customerKeyword.value.trim().toLowerCase();
  const names = Array.from(
    new Set(
      baseRows.value
        .map((o) => String(o?.customerName || "").trim())
        .filter(Boolean),
    ),
  ).sort((a, b) => a.localeCompare(b, "zh-Hant"));
  if (!kw) return names;
  return names.filter((name) => name.toLowerCase().includes(kw));
});

const moneyFormatter = new Intl.NumberFormat("zh-TW", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

function toMoneyNumber(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  const raw = String(value).trim();
  if (!raw) return null;
  const normalized = raw.replace(/[^\d.-]/g, "");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function getOrderSalesAmount(order) {
  if (!order || typeof order !== "object") return null;
  const candidates = [
    order.grandTotal,
    order.total,
    order.subtotal,
    order.amount,
    order.totalAmount,
    order.finalAmount,
    order.totalPrice,
    order.orderAmount,
    order.salesAmount,
    order.receivableTotal,
    order.amountTotal,
    order["銷售額"],
    order["金額"],
    order["總金額"],
    order["總價"],
    order["含稅總額"],
    order?.pricing?.grandTotal,
    order?.pricing?.total,
    order?.pricing?.subtotal,
    order?.pricing?.totalAmount,
    order?.quote?.grandTotal,
    order?.quote?.total,
    order?.quote?.totalAmount,
  ];
  for (const candidate of candidates) {
    const amount = toMoneyNumber(candidate);
    if (amount !== null) return amount;
  }
  return null;
}

const salesStats = computed(() => {
  let total = 0;
  let counted = 0;
  for (const order of filtered.value) {
    const amount = getOrderSalesAmount(order);
    if (amount === null) continue;
    total += amount;
    counted += 1;
  }
  return {
    total,
    counted,
    average: counted > 0 ? total / counted : 0,
  };
});

function fmtMoney(value) {
  return moneyFormatter.format(Number(value) || 0);
}

function setSort(col) {
  if (sortCol.value === col) sortDir.value *= -1;
  else {
    sortCol.value = col;
    sortDir.value = 1;
  }
  applyFilter();
}
function sortIcon(col) {
  if (sortCol.value !== col) return " ↕";
  return sortDir.value === 1 ? " ↑" : " ↓";
}

const STATUS_ORDER = [
  "draft",
  "pendingSign",
  "confirmed",
  "inProduction",
  "delivered",
  "done",
  "cancelled",
];

function toEpochMs(val) {
  if (!val) return 0;
  if (val?.toDate) return val.toDate().getTime();
  const n = Number(val);
  if (!Number.isNaN(n) && n > 0 && n < 100000)
    return (n - 25569) * 86400 * 1000;
  if (!Number.isNaN(n) && n >= 1000000000000) return n;
  const t = new Date(String(val).slice(0, 10)).getTime();
  return Number.isNaN(t) ? 0 : t;
}

function recentEditedAt(order) {
  return Math.max(
    toEpochMs(order?.drawingUpdatedAt),
    toEpochMs(order?.updatedAt),
    toEpochMs(order?.createdAt),
  );
}

function sortVal(o, col) {
  switch (col) {
    case "recentEditedAt":
      return recentEditedAt(o);
    case "promisedAt": {
      const v = o.promisedAt;
      if (!v) return Infinity;
      if (v?.toDate) return v.toDate().getTime();
      const n = Number(v);
      if (!isNaN(n) && n > 0 && n < 100000) return (n - 25569) * 86400 * 1000;
      if (!isNaN(n) && n >= 1000000000000) return n;
      return new Date(String(v).slice(0, 10)).getTime();
    }
    case "status":
      return STATUS_ORDER.indexOf(o.status ?? "");
    case "sinkStatus":
      return sinkBadges(o)
        .map((s) => s.label)
        .join(",");
    case "salesAmount":
      return getOrderSalesAmount(o) ?? -1;
    case "orderNo":
      return o.orderNo ?? "";
    case "customerName":
      return o.customerName ?? "";
    case "category":
      return o.category ?? "";
    case "countertop":
      return o.countertop?.type ?? "";
    case "stones": {
      const first = Array.isArray(o.stones) && o.stones[0];
      return first ? [first.brand, first.color].filter(Boolean).join(" ") : "";
    }
    case "siteAddress":
      return o.siteAddress ?? "";
    default:
      return "";
  }
}

onMounted(async () => {
  restoreViewState();
  try {
    const uid = auth.currentUser?.uid;
    if (uid) {
      const u = await getUserByUid(uid);
      isAdmin.value = u?.role === "admin" || u?.role === "管理者";
      canDispatch.value = isAdmin.value || String(u?.dept ?? "").trim() === "1";
    }
    baseRows.value = await listSalesOrders({ limit: loadLimit });
    rows.value = [...baseRows.value];
    if (exactCustomerName.value.trim()) {
      await onExactCustomerChange();
      return;
    }
  } finally {
    loading.value = false;
    applyFilter();
  }
});

function applyFilter() {
  const kw = keyword.value.trim().toLowerCase();
  const st = statusFilter.value;
  const sk = sinkStatusFilter.value;
  const exactCustomer = exactCustomerName.value.trim().toLowerCase();

  let result = rows.value.filter((o) => {
    if (st && o.status !== st) return false;
    if (sk && !hasSinkStatus(o, sk)) return false;
    if (exactCustomer) {
      const currentName = String(o.customerName || "")
        .trim()
        .toLowerCase();
      if (currentName !== exactCustomer) return false;
    }
    if (kw) {
      const stonesText = Array.isArray(o.stones)
        ? o.stones
            .map((s) => [s.brand, s.color].filter(Boolean).join(" "))
            .join(" ")
        : "";
      const hay = [
        o.orderNo,
        o.customerName,
        o.siteAddress,
        o.category,
        stonesText,
      ]
        .join(" ")
        .toLowerCase();
      if (!hay.includes(kw)) return false;
    }
    return true;
  });
  if (sortCol.value) {
    const dir = sortDir.value;
    result = [...result].sort((a, b) => {
      const va = sortVal(a, sortCol.value);
      const vb = sortVal(b, sortCol.value);
      if (va === vb) return 0;
      if (va === Infinity) return 1;
      if (vb === Infinity) return -1;
      return va < vb ? -dir : dir;
    });
  }
  filtered.value = result;
  saveViewState();
}

function onCustomerKeywordInput() {
  const current = exactCustomerName.value;
  if (!current) {
    applyFilter();
    return;
  }
  if (!customerCandidates.value.includes(current)) {
    exactCustomerName.value = "";
    rows.value = [...baseRows.value];
  }
  applyFilter();
}

async function onExactCustomerChange() {
  const selected = exactCustomerName.value.trim();
  if (!selected) {
    rows.value = [...baseRows.value];
    applyFilter();
    return;
  }

  loadingExactCustomer.value = true;
  try {
    rows.value = await listSalesOrdersByCustomerName(selected);
  } catch (e) {
    alert("查詢客戶訂單失敗：" + (e?.message || e));
    rows.value = [];
  } finally {
    loadingExactCustomer.value = false;
    applyFilter();
  }
}

function clearExactCustomer() {
  customerKeyword.value = "";
  exactCustomerName.value = "";
  rows.value = [...baseRows.value];
  applyFilter();
}

async function onStatusChange(order, newStatus) {
  const old = order.status;
  order.status = newStatus; // optimistic update
  try {
    await updateSalesOrder(order.id, { status: newStatus });
  } catch (e) {
    order.status = old; // rollback
    alert("狀態更新失敗：" + (e?.message || e));
  }
}

function hasSinkStatus(order, val) {
  const sinks = Array.isArray(order.sinks) ? order.sinks : [];
  return sinks.some((s) => (s.arrival || "notArrived") === val);
}

function sinkBadges(order) {
  const sinks = Array.isArray(order.sinks) ? order.sinks : [];
  if (!sinks.length) return [];
  // 去重：同狀態只顯示一個徽章
  const seen = new Set();
  return sinks
    .map((s) => getSinkStatus(s.arrival || "notArrived"))
    .filter((st) => {
      if (seen.has(st.value)) return false;
      seen.add(st.value);
      return true;
    });
}

function hasDrawing(order) {
  if (!order || typeof order !== "object") return false;
  if (order.hasDrawings === true) return true;
  return !!order.drawingUpdatedAt;
}

function fmtDate(val) {
  if (!val) return "—";
  let d;
  if (val?.toDate) {
    d = val.toDate();
  } else {
    const n = Number(val);
    if (!isNaN(n) && n > 0 && n < 100000) {
      // Excel 序號（字串或數字皆可）：base = 1899-12-30
      d = new Date((n - 25569) * 86400 * 1000);
    } else if (!isNaN(n) && n >= 1000000000000) {
      d = new Date(n); // Unix ms
    } else {
      d = new Date(String(val).slice(0, 10)); // "2026-05-24"
    }
  }
  if (isNaN(d)) return "—";
  return d.toLocaleDateString("zh-TW");
}
</script>

<style scoped>
.orders-view {
  max-width: none;
  width: 100%;
  margin: 0 auto;
  padding: 12px 8px 40px;
}
.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}
.page-header h2 {
  margin: 0;
  font-size: 1.3rem;
  font-weight: 700;
}
.filter-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 14px;
}
.result-count {
  margin: 0 0 8px;
  font-size: 12px;
  color: #4b5563;
}
.result-sales {
  margin: 0 0 10px;
  font-size: 12px;
  color: #1f2937;
}
.search-input {
  flex: 1 1 200px;
  padding: 7px 10px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 14px;
}
.filter-bar select {
  padding: 7px 10px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 14px;
  background: #fff;
}
.table-wrap {
  overflow-x: auto;
}
.orders-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12.5px;
}
.orders-table th,
.orders-table td {
  padding: 6px 8px;
  text-align: left;
  border-bottom: 1px solid #e5e7eb;
  white-space: nowrap;
}
.orders-table th {
  background: #f9fafb;
  font-size: 12px;
  color: #6b7280;
  font-weight: 600;
}
.orders-table th.sortable {
  cursor: pointer;
  user-select: none;
}
.orders-table th.sortable:hover {
  background: #f0f9ff;
  color: #1d4ed8;
}
.orders-table tbody tr:hover {
  background: #f0f9ff;
}
.orders-table tbody tr.row-has-drawing {
  background: #fff8cc;
}
.orders-table tbody tr.row-has-drawing:hover {
  background: #fef3a8;
}
.col-addr {
  white-space: normal;
  min-width: 140px;
}
.col-no .order-no {
  font-weight: 600;
  color: #1d4ed8;
}
.col-amount {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.col-stones {
  min-width: 90px;
  white-space: nowrap;
}
.stone-tag {
  font-size: 12px;
  color: #374151;
  line-height: 1.5;
}
.col-customer .customer-name {
  font-weight: 500;
}
.col-customer .customer-sub {
  font-size: 12px;
  color: #9ca3af;
}
.cm-tag {
  font-size: 11px;
  color: #6b7280;
  margin-left: 4px;
}
.sink-badge {
  display: inline-block;
  font-size: 11px;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 10px;
  margin-right: 4px;
}
.test-badge {
  display: inline-block;
  font-size: 10px;
  font-weight: 700;
  padding: 1px 5px;
  border-radius: 8px;
  background: #fde68a;
  color: #92400e;
  margin-left: 4px;
  vertical-align: middle;
}
.dim {
  color: #d1d5db;
}
.status-chip {
  display: inline-block;
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 10px;
  background: #e5e7eb;
  color: #374151;
}
.status-select {
  font-size: 12px;
  padding: 2px 4px;
  border-radius: 10px;
  border: 1px solid #d1d5db;
  cursor: pointer;
  outline: none;
}
.status-select.status-draft,
.status-chip.status-draft {
  background: #f3f4f6;
  color: #6b7280;
}
.status-select.status-pendingSign,
.status-chip.status-pendingSign {
  background: #fef3c7;
  color: #b45309;
}
.status-select.status-confirmed,
.status-chip.status-confirmed {
  background: #dbeafe;
  color: #1d4ed8;
}
.status-select.status-inProduction,
.status-chip.status-inProduction {
  background: #fef9c3;
  color: #92400e;
}
.status-select.status-delivered,
.status-chip.status-delivered {
  background: #d1fae5;
  color: #065f46;
}
.status-select.status-done,
.status-chip.status-done {
  background: #dcfce7;
  color: #166534;
}
.status-select.status-cancelled,
.status-chip.status-cancelled {
  background: #fee2e2;
  color: #991b1b;
}
.col-date {
  color: #6b7280;
}
.col-staff {
  white-space: nowrap;
  color: #374151;
}
.col-actions {
  text-align: right;
}
.btn-mini {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 5px;
  border: 1px solid #d1d5db;
  background: #fff;
  cursor: pointer;
  text-decoration: none;
  color: #374151;
}
.btn-mini:hover {
  background: #f3f4f6;
}
.btn-draw {
  color: #1f4bb8;
  border-color: #b6c5ee;
  background: #f0f4ff;
}
.btn-draw:hover {
  background: #dce6ff;
}
.btn-conf {
  color: #065f46;
  border-color: #6ee7b7;
  background: #ecfdf5;
}
.btn-conf:hover {
  background: #d1fae5;
}
.btn-origin {
  color: #7c2d12;
  border-color: #fdba74;
  background: #fff7ed;
}
.btn-origin:hover {
  background: #ffedd5;
}
.header-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}
.btn-aux {
  padding: 7px 14px;
  background: #fff;
  color: #374151;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
  text-decoration: none;
}
.btn-aux:hover {
  background: #f3f4f6;
}
.btn-primary {
  padding: 7px 16px;
  background: #1d4ed8;
  color: #fff;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
  text-decoration: none;
}
.btn-primary:hover {
  background: #1e40af;
}
.hint {
  text-align: center;
  color: #9ca3af;
  padding: 24px 0;
}
.hint-more {
  font-size: 13px;
  padding: 12px 0;
}
</style>
