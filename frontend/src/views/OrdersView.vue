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
        <RouterLink class="btn-aux" to="/orders/repair">🔧 維修單</RouterLink>
        <RouterLink class="btn-aux" to="/dispatch-sheet"
          >🚚 派車表單</RouterLink
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
      <select v-model="statusFilter" @change="applyFilter">
        <option value="">全部狀態</option>
        <option value="draft">草稿</option>
        <option value="pendingSign">待回簽</option>
        <option value="confirmed">已確認</option>
        <option value="inProduction">生產中</option>
        <option value="delivered">已驗收</option>
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

    <p v-if="loading" class="hint">載入中…</p>
    <p v-else-if="!filtered.length" class="hint">找不到符合的訂單。</p>

    <div v-else class="table-wrap">
      <table class="orders-table">
        <thead>
          <tr>
            <th></th>
            <th>打板</th>
            <th>對圖</th>
            <th class="sortable" @click="setSort('orderedAt')">
              下單日{{ sortIcon("orderedAt") }}
            </th>
            <th class="sortable" @click="setSort('promisedAt')">
              預交日{{ sortIcon("promisedAt") }}
            </th>
            <th class="sortable" @click="setSort('status')">
              訂單狀態{{ sortIcon("status") }}
            </th>
            <th class="sortable" @click="setSort('sinkStatus')">
              水槽狀態{{ sortIcon("sinkStatus") }}
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
            <th class="sortable" @click="setSort('total')">
              含稅金額{{ sortIcon("total") }}
            </th>
            <th class="sortable" @click="setSort('siteAddress')">
              施工地址{{ sortIcon("siteAddress") }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="o in filtered" :key="o.id">
            <td class="col-actions">
              <template v-if="o._source !== 'Orders'">
                <RouterLink class="btn-mini" :to="`/orders/${o.id}/edit`"
                  >編輯</RouterLink
                >
                <RouterLink
                  class="btn-mini btn-conf"
                  :to="`/orders/${o.id}/confirmation`"
                  >確定單</RouterLink
                >
                <RouterLink
                  class="btn-mini btn-draw"
                  :to="`/orders/${o.id}/drawing`"
                  >繪圖</RouterLink
                >
              </template>
              <span
                v-else
                class="dim"
                title="此為派車表匯入的舊訂單,僅供瀏覽;新流程訂單才支援編輯/繪圖"
                >舊單</span
              >
            </td>
            <td class="col-staff">{{ o.templatingStaff || "—" }}</td>
            <td class="col-staff">{{ o.drawingStaff || "—" }}</td>
            <td class="col-date">{{ fmtDate(o.orderedAt) }}</td>
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
            <td class="col-price">
              <span v-if="o.total" class="price-tag">{{
                Math.round(o.total * 1.05).toLocaleString()
              }}</span>
              <span v-else class="dim">—</span>
            </td>
            <td class="col-addr">{{ o.siteAddress || "—" }}</td>
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
import { ref, onMounted } from "vue";
import {
  listSalesOrders,
  listOrders,
  updateSalesOrder,
  auth,
  getUserByUid,
  userHasAnyDept,
  userHasAnyRole,
} from "../firebase";
import { SINK_STATUS_LIST, getSinkStatus } from "../utils/sinkStatus";

const STATUS_LABEL = {
  draft: "草稿",
  pendingSign: "待回簽",
  confirmed: "已確認",
  inProduction: "生產中",
  delivered: "已驗收",
  done: "完工",
  cancelled: "已取消",
};

const loadLimit = 1000; // 拉大以避免被 legacy 鏡像佔滿前 N 名後過濾掉
const loading = ref(true);
const rows = ref([]);
const filtered = ref([]);
const isAdmin = ref(false);
const canDispatch = ref(false);

const keyword = ref("");
const statusFilter = ref("");
const sinkStatusFilter = ref("");
const sortCol = ref("");
const sortDir = ref(1); // 1=asc, -1=desc

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

function sortVal(o, col) {
  switch (col) {
    case "orderedAt": {
      const v = o.orderedAt;
      if (!v) return Infinity;
      if (v?.toDate) return v.toDate().getTime();
      const n = Number(v);
      if (!isNaN(n) && n > 0 && n < 100000) return (n - 25569) * 86400 * 1000;
      if (!isNaN(n) && n >= 1000000000000) return n;
      return new Date(String(v).slice(0, 10)).getTime();
    }
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
  try {
    const uid = auth.currentUser?.uid;
    if (uid) {
      const u = await getUserByUid(uid);
      isAdmin.value = userHasAnyRole(u, ["admin", "管理者"]);
      canDispatch.value = isAdmin.value || userHasAnyDept(u, ["1"]);
    }
    const [so, lo] = await Promise.all([
      listSalesOrders({ limit: loadLimit }).catch(() => []),
      listOrders({ limit: loadLimit }).catch(() => []),
    ]);
    // 合併:salesOrders 在前 (ERP 新訂單), Orders 在後 (legacy);
    // 以 orderNo 去重,同一訂單號以 salesOrders 為主
    const seenNo = new Set();
    const merged = [];
    for (const o of so) {
      if (o.orderNo) seenNo.add(String(o.orderNo));
      merged.push(o);
    }
    for (const o of lo) {
      if (o.orderNo && seenNo.has(String(o.orderNo))) continue;
      merged.push(o);
    }
    rows.value = merged;
  } finally {
    loading.value = false;
    applyFilter();
  }
});

function applyFilter() {
  const kw = keyword.value.trim().toLowerCase();
  const st = statusFilter.value;
  const sk = sinkStatusFilter.value;

  let result = rows.value.filter((o) => {
    if (st && o.status !== st) return false;
    if (sk && !hasSinkStatus(o, sk)) return false;
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
}

async function onStatusChange(order, newStatus) {
  if (order._source === "Orders") {
    alert("此為派車表匯入的舊訂單,無法在此修改狀態。請至原系統調整。");
    return;
  }
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
  width: 100%;
  max-width: none;
  margin: 0;
  padding: 20px 8px 60px;
  box-sizing: border-box;
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
  width: 100%;
  overflow-x: auto;
}
.orders-table {
  width: max-content;
  min-width: 100%;
  border-collapse: collapse;
  font-size: 13.5px;
}
.orders-table th,
.orders-table td {
  padding: 8px 10px;
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
.col-addr {
  white-space: normal;
  min-width: 140px;
}
.col-no .order-no {
  font-weight: 600;
  color: #1d4ed8;
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
.col-price {
  text-align: right;
  white-space: nowrap;
}
.price-tag {
  font-weight: 600;
  color: #1565c0;
  font-size: 13px;
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
  font-size: 12px;
  padding: 3px 10px;
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

@media (min-width: 1200px) {
  .orders-view {
    width: calc(100vw - 24px);
    margin-left: calc(50% - 50vw + 12px);
    padding-left: 12px;
    padding-right: 12px;
  }
}
</style>
