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
        <button class="btn-aux" type="button" @click="openSitePriceModal">
          工地價格
        </button>
        <RouterLink class="btn-primary" to="/orders/new"
          >＋ 新建訂單</RouterLink
        >
      </div>
    </header>

    <!-- 篩選列 -->
    <div class="filter-bar">
      <div class="keyword-picker">
        <input
          v-model="keyword"
          class="search-input"
          placeholder="搜尋客戶名稱 / 訂單號碼 / 地址 / 石材"
          @focus="onKeywordFocus"
          @blur="onKeywordBlur"
          @input="onKeywordInput"
        />
        <div v-if="showCustomerMatchList && customerMatches.length" class="customer-match-list">
          <button
            v-for="customer in customerMatches"
            :key="customer.id"
            type="button"
            class="customer-match-item"
            @mousedown.prevent
            @click="selectCustomerForSearch(customer)"
          >
            <span class="customer-match-code">{{ customer.code || customer.id }}</span>
            <span class="customer-match-name">{{ customer.name }}</span>
          </button>
        </div>
      </div>
      <button
        v-if="selectedCustomerForKeyword"
        type="button"
        class="btn-clear-customer"
        @click="clearSelectedCustomerSearch"
      >
        清除已選客戶
      </button>
      <select v-model="statusFilter" @change="onFilterChange">
        <option value="">全部狀態</option>
        <option value="draft">草稿</option>
        <option value="pendingSign">待回簽</option>
        <option value="confirmed">已確認</option>
        <option value="inProduction">生產中</option>
        <option value="delivered">已驗收</option>
        <option value="done">完工</option>
        <option value="cancelled">已取消</option>
      </select>
      <select v-model="sinkStatusFilter" @change="onFilterChange">
        <option value="">全部水槽狀態</option>
        <option v-for="s in SINK_STATUS_LIST" :key="s.value" :value="s.value">
          {{ s.label }}
        </option>
      </select>
      <span v-if="!loading && !searchingSelectedCustomer" class="result-count">
        查到 {{ filtered.length }} 筆
      </span>
    </div>

    <p v-if="loading" class="hint">載入中…</p>
    <p v-else-if="searchingSelectedCustomer" class="hint">客戶精準查詢中…</p>
    <p v-else-if="!filtered.length" class="hint">找不到符合的訂單。</p>

    <div v-else class="table-wrap">
      <table class="orders-table">
        <thead>
          <tr>
            <th class="col-actions"></th>
            <th class="col-staff">打板</th>
            <th class="col-staff">對圖</th>
            <th class="sortable col-date" @click="setSort('orderedAt')">
              下單日{{ sortIcon("orderedAt") }}
            </th>
            <th class="sortable col-date" @click="setSort('promisedAt')">
              預交日{{ sortIcon("promisedAt") }}
            </th>
            <th class="sortable col-status" @click="setSort('status')">
              訂單狀態{{ sortIcon("status") }}
            </th>
            <th class="sortable col-sink-status" @click="setSort('sinkStatus')">
              水槽狀態{{ sortIcon("sinkStatus") }}
            </th>
            <th class="sortable col-no" @click="setSort('orderNo')">
              訂單號{{ sortIcon("orderNo") }}
            </th>
            <th class="sortable col-stones" @click="setSort('stones')">
              石材{{ sortIcon("stones") }}
            </th>
            <th class="sortable col-customer" @click="setSort('customerName')">
              客戶{{ sortIcon("customerName") }}
            </th>
            <th class="sortable col-category" @click="setSort('category')">
              類別{{ sortIcon("category") }}
            </th>
            <th class="sortable col-countertop" @click="setSort('countertop')">
              台面{{ sortIcon("countertop") }}
            </th>
            <th class="sortable col-price" @click="setSort('total')">
              含稅金額{{ sortIcon("total") }}
            </th>
            <th class="sortable col-addr" @click="setSort('siteAddress')">
              施工地址{{ sortIcon("siteAddress") }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="o in filtered"
            :key="o.id"
            :class="{ 'row-has-drawings': orderHasDrawings(o) }"
          >
            <td class="col-actions">
              <div class="actions-wrap">
                <RouterLink class="btn-mini" :to="`/orders/${o.id}/edit`"
                  >編輯</RouterLink
                >
                <RouterLink
                  class="btn-mini btn-conf"
                  :to="`/orders/${o.id}/confirmation`"
                  >確定單</RouterLink
                >
                <button
                  class="btn-mini btn-origin"
                  type="button"
                  @click="openOriginalDesign(o)"
                >
                  原圖
                </button>
                <RouterLink
                  :class="[
                    'btn-mini',
                    orderHasDrawings(o) ? 'btn-draw-done' : 'btn-draw',
                  ]"
                  :to="`/orders/${o.id}/drawing`"
                  >繪圖</RouterLink
                >
              </div>
            </td>
            <td class="col-staff">{{ fmtStaffWithMonthDay(o.templatingStaff, o.templatingDate) }}</td>
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
            <td
              class="col-stones"
              :title="
                (o.stones || [])
                  .map((s) => [s.brand, s.color].filter(Boolean).join(' '))
                  .filter(Boolean)
                  .join(' / ')
              "
            >
              <template v-if="o.stones && o.stones.length">
                <div v-for="(s, i) in o.stones" :key="i" class="stone-tag">
                  {{ [s.brand, s.color].filter(Boolean).join(" ") || "—" }}
                </div>
              </template>
              <span v-else class="dim">—</span>
            </td>
            <td
              class="col-customer"
              :title="
                [o.customerName, o.customerContact?.name]
                  .filter(Boolean)
                  .join(' / ')
              "
            >
              <div class="customer-name">{{ o.customerName || "—" }}</div>
              <span v-if="o.isTestData" class="test-badge">測</span>
              <div class="customer-sub">
                {{ o.customerContact?.name || "" }}
              </div>
            </td>
            <td class="col-category" :title="o.category || ''">
              {{ o.category || "—" }}
            </td>
            <td
              class="col-countertop"
              :title="
                [
                  o.countertop?.type,
                  o.countertop?.totalCm ? `${o.countertop.totalCm}cm` : '',
                ]
                  .filter(Boolean)
                  .join(' ')
              "
            >
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
            <td class="col-addr" :title="o.siteAddress || ''">
              {{ o.siteAddress || "—" }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <p v-if="!loading && rows.length >= loadLimit" class="hint hint-more">
      顯示最近 {{ loadLimit }} 筆，使用上方搜尋縮小範圍。
    </p>

    <div
      v-if="showSitePriceModal"
      class="site-price-modal"
      role="dialog"
      aria-modal="true"
      aria-label="工地價格輸入"
      @click.self="closeSitePriceModal"
    >
      <div class="site-price-card">
        <h3>工地價格輸入</h3>
        <div class="site-price-grid">
          <label>
            客戶
            <input
              v-model.trim="sitePriceForm.customerName"
              type="text"
              list="site-price-customer-options"
              placeholder="輸入關鍵字找客戶，例如：林、王、企業"
            />
            <datalist id="site-price-customer-options">
              <option
                v-for="name in customerKeywordOptions"
                :key="name"
                :value="name"
              />
            </datalist>
            <span class="site-price-input-tip">可輸入關鍵字快速找客戶名稱</span>
          </label>
          <label>
            案名
            <input v-model.trim="sitePriceForm.projectName" type="text" placeholder="例如：林口A5-10F" />
          </label>
          <label>
            顏色
            <input v-model.trim="sitePriceForm.color" type="text" placeholder="例如：雪白石" />
          </label>
          <label>
            價格
            <input v-model.number="sitePriceForm.price" type="number" min="0" step="1" placeholder="0" />
          </label>
          <label>
            水槽價格
            <input v-model.number="sitePriceForm.sinkPrice" type="number" min="0" step="1" placeholder="0" />
          </label>
          <label>
            火爐價格
            <input v-model.number="sitePriceForm.stovePrice" type="number" min="0" step="1" placeholder="0" />
          </label>
        </div>

        <div class="site-price-list">
          <div class="site-price-list-head">
            <strong>既有工地價格</strong>
            <span class="muted" v-if="sitePriceLoading">載入中...</span>
          </div>
          <p v-if="!sitePriceLoading && !sitePriceRows.length" class="muted small">
            輸入客戶後可查看既有資料
          </p>
          <div v-else class="site-price-list-table">
            <table>
              <thead>
                <tr>
                  <th>案名</th>
                  <th>顏色</th>
                  <th>價格</th>
                  <th>水槽</th>
                  <th>火爐</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="item in sitePriceRows" :key="item.entryKey">
                  <td>{{ item.projectName || "—" }}</td>
                  <td>{{ item.color || "—" }}</td>
                  <td>{{ Number(item.price || 0).toLocaleString() }}</td>
                  <td>{{ Number(item.sinkPrice || 0).toLocaleString() }}</td>
                  <td>{{ Number(item.stovePrice || 0).toLocaleString() }}</td>
                  <td class="site-price-op">
                    <button class="btn-mini" type="button" @click="editSitePriceEntry(item)">修改</button>
                    <button class="btn-mini" type="button" @click="deleteSitePriceEntry(item)">刪除</button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <p v-if="sitePriceMsg" class="site-price-msg">{{ sitePriceMsg }}</p>
        <div class="site-price-actions">
          <button v-if="editingSitePriceKey" class="btn-aux" type="button" @click="cancelSitePriceEdit">取消修改</button>
          <button class="btn-aux" type="button" @click="closeSitePriceModal">關閉</button>
          <button class="btn-primary" type="button" :disabled="sitePriceSaving" @click="saveSitePriceEntry">
            {{ sitePriceSaving ? "儲存中..." : editingSitePriceKey ? "更新" : "儲存" }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, onMounted, watch } from "vue";
import { useRouter } from "vue-router";
import {
  deleteCustomerSitePrice,
  listCustomerSitePrices,
  listCustomers,
  listSalesOrders,
  listSalesOrdersByCustomerId,
  listSalesOrdersByCustomerName,
  listOrderDrawings,
  searchSalesOrdersByKeyword,
  updateSalesOrder,
  auth,
  getUserByUid,
  saveCustomerSitePrice,
  userHasAnyDept,
  userHasAnyRole,
} from "../firebase";
import { SINK_STATUS_LIST, getSinkStatus } from "../utils/sinkStatus";

// 搜尋狀態持久化的 key
const SEARCH_STATE_KEY = "ordersView.searchState";

const STATUS_LABEL = {
  draft: "草稿",
  pendingSign: "待回簽",
  confirmed: "已確認",
  inProduction: "生產中",
  delivered: "已驗收",
  done: "完工",
  cancelled: "已取消",
};

const loadLimit = 1000; // 首頁僅預載最近 salesOrders，搜尋再補查較舊資料
const loading = ref(true);
const rows = ref([]);
const filtered = ref([]);
const searchingSelectedCustomer = ref(false);
const isAdmin = ref(false);
const canDispatch = ref(false);
const router = useRouter();

const keyword = ref("");
const statusFilter = ref("");
const sinkStatusFilter = ref("");
const customerDirectory = ref([]);
const selectedCustomerForKeyword = ref(null);
const showCustomerMatchList = ref(false);
const sortCol = ref("updatedAt");
const sortDir = ref(-1); // 1=asc, -1=desc
const showSitePriceModal = ref(false);
const sitePriceSaving = ref(false);
const sitePriceMsg = ref("");
const sitePriceLoading = ref(false);
const editingSitePriceKey = ref("");
const sitePriceRows = ref([]);
const sitePriceForm = ref({
  customerName: "",
  projectName: "",
  color: "",
  price: 0,
  sinkPrice: 0,
  stovePrice: 0,
});
let latestSitePriceLoad = 0;
const allCustomerNames = ref([]);
const customerMatches = computed(() => {
  if (selectedCustomerForKeyword.value) return [];
  const kw = String(keyword.value || "").trim().toLowerCase();
  if (kw.length < 2) return [];
  return customerDirectory.value
    .filter((customer) => customer.searchText.includes(kw))
    .slice(0, 30);
});
const customerKeywordOptions = computed(() => {
  const source = Array.isArray(allCustomerNames.value) ? allCustomerNames.value : [];
  const kw = String(sitePriceForm.value.customerName || "").trim().toLowerCase();
  if (!kw) return source.slice(0, 30);
  return source.filter((name) => String(name || "").toLowerCase().includes(kw)).slice(0, 30);
});
let latestFilterRun = 0;
let latestDrawingHydration = 0;

const DRAWING_STATUS_BACKFILL_LIMIT = 60;

// 保存搜尋狀態到 sessionStorage
function saveSearchState() {
  try {
    const state = {
      keyword: keyword.value,
      statusFilter: statusFilter.value,
      sinkStatusFilter: sinkStatusFilter.value,
      sortCol: sortCol.value,
      sortDir: sortDir.value,
      selectedCustomerForKeyword: selectedCustomerForKeyword.value,
    };
    sessionStorage.setItem(SEARCH_STATE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn("Failed to save search state:", e);
  }
}

// 從 sessionStorage 恢復搜尋狀態
function restoreSearchState() {
  try {
    const saved = sessionStorage.getItem(SEARCH_STATE_KEY);
    if (saved) {
      const state = JSON.parse(saved);
      keyword.value = state.keyword || "";
      statusFilter.value = state.statusFilter || "";
      sinkStatusFilter.value = state.sinkStatusFilter || "";
      sortCol.value = state.sortCol || "updatedAt";
      sortDir.value = state.sortDir || -1;
      selectedCustomerForKeyword.value = state.selectedCustomerForKeyword || null;
      return true;
    }
  } catch (e) {
    console.warn("Failed to restore search state:", e);
  }
  return false;
}

// 清除搜尋狀態
function clearSearchState() {
  try {
    sessionStorage.removeItem(SEARCH_STATE_KEY);
  } catch (e) {
    console.warn("Failed to clear search state:", e);
  }
}

function setSort(col) {
  if (sortCol.value === col) sortDir.value *= -1;
  else {
    sortCol.value = col;
    sortDir.value = 1;
  }
  saveSearchState();
  applyFilter();
}

function onFilterChange() {
  saveSearchState();
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
    case "updatedAt": {
      const d = parseDateValue(o.confirmationUpdatedAt || o.updatedAt || o.createdAt || o.orderedAt);
      return d ? d.getTime() : 0;
    }
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
    // 恢復之前的搜尋狀態
    restoreSearchState();

    const uid = auth.currentUser?.uid;
    if (uid) {
      const u = await getUserByUid(uid);
      isAdmin.value = userHasAnyRole(u, ["admin", "管理者"]);
      canDispatch.value = isAdmin.value || userHasAnyDept(u, ["1"]);
    }
    const salesOrders = await listSalesOrders({ limit: loadLimit }).catch(() => []);
    rows.value = salesOrders;
    const nameSet = new Set(
      salesOrders
        .map((item) => String(item.customerName || "").trim())
        .filter(Boolean),
    );
    const customerMaster = await listCustomers().catch(() => []);
    for (const customer of customerMaster) {
      const name = String(customer?.name || "").trim();
      if (name) nameSet.add(name);
    }
    customerDirectory.value = customerMaster
      .map((customer) => {
        const code = String(customer?.code || "").trim();
        const docId = String(customer?.id || "").trim();
        const id = String(code || docId).trim();
        const name = String(customer?.name || "").trim();
        if (!id || !name) return null;
        const searchText = [id, name, customer?.phone || ""]
          .join(" ")
          .toLowerCase();
        return {
          id,
          code,
          docId,
          name,
          searchText,
        };
      })
      .filter(Boolean);
    allCustomerNames.value = Array.from(nameSet).sort((a, b) =>
      a.localeCompare(b, "zh-Hant"),
    );
    await hydrateDrawingFlags(salesOrders);
  } finally {
    loading.value = false;
    applyFilter();
  }
});

async function hydrateDrawingFlags(list) {
  const candidates = list
    .filter(
      (order) =>
        !order.hasDrawings &&
        !Object.keys(order.pendingSignDrawingVersions || {}).length,
    )
    .slice(0, DRAWING_STATUS_BACKFILL_LIMIT);

  if (!candidates.length) return;

  const hydrationId = ++latestDrawingHydration;
  const results = await Promise.all(
    candidates.map(async (order) => {
      try {
        const drawings = await listOrderDrawings(order.id);
        return { id: order.id, hasDrawings: drawings.length > 0 };
      } catch (_) {
        return null;
      }
    }),
  );

  if (hydrationId !== latestDrawingHydration) return;

  const drawingMap = new Map(
    results
      .filter((result) => result && result.hasDrawings)
      .map((result) => [result.id, result.hasDrawings]),
  );

  if (!drawingMap.size) return;

  rows.value = rows.value.map((order) =>
    drawingMap.has(order.id)
      ? { ...order, _hasDrawings: drawingMap.get(order.id) }
      : order,
  );
}

function matchesKeyword(order, kw) {
  if (!kw) return true;
  const stonesText = Array.isArray(order.stones)
    ? order.stones
        .map((stone) => [stone.brand, stone.color].filter(Boolean).join(" "))
        .join(" ")
    : "";
  const hay = [
    order.orderNo,
    order.customerName,
    order.siteAddress,
    order.searchableAddress,
    order.category,
    stonesText,
  ]
    .join(" ")
    .toLowerCase();
  return hay.includes(kw);
}

function matchesFilters(order, kw, st, sk) {
  if (st && order.status !== st) return false;
  if (sk && !hasSinkStatus(order, sk)) return false;
  return matchesKeyword(order, kw);
}

function shouldRemoteKeywordLookup(rawKeyword) {
  const clean = String(rawKeyword || "").trim();
  if (clean.length < 2) return false;
  if (/^[A-Za-z0-9-]+$/.test(clean)) return clean.length >= 3;
  return true;
}

function normalizeCustomerKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[-_]/g, "");
}

function orderMatchesSelectedCustomer(order, selectedCustomer = {}) {
  const idSet = new Set(
    (selectedCustomer.ids || [])
      .map((id) => normalizeCustomerKey(id))
      .filter(Boolean),
  );
  const orderCustomerId = normalizeCustomerKey(order?.customerId);
  if (orderCustomerId && idSet.has(orderCustomerId)) return true;

  const targetName = normalizeCustomerKey(selectedCustomer.name);
  const targetCode = normalizeCustomerKey(selectedCustomer.code || selectedCustomer.id);
  const orderCustomerName = normalizeCustomerKey(order?.customerName);
  if (!orderCustomerName) return false;

  if (targetName && orderCustomerName.includes(targetName)) return true;
  if (targetCode && orderCustomerName.includes(targetCode)) return true;
  return false;
}

function mergeUniqueOrders(...groups) {
  const merged = [];
  const seen = new Set();
  for (const group of groups) {
    for (const order of group) {
      const key = String(order.id || "");
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(order);
    }
  }
  return merged;
}

function sortOrders(list) {
  if (!sortCol.value) return list;
  const dir = sortDir.value;
  return [...list].sort((a, b) => {
    const va = sortVal(a, sortCol.value);
    const vb = sortVal(b, sortCol.value);
    if (va === vb) return 0;
    if (va === Infinity) return 1;
    if (vb === Infinity) return -1;
    return va < vb ? -dir : dir;
  });
}

async function applyFilter() {
  const filterRunId = ++latestFilterRun;
  const rawKeyword = keyword.value.trim();
  const kw = keyword.value.trim().toLowerCase();
  const st = statusFilter.value;
  const sk = sinkStatusFilter.value;

  searchingSelectedCustomer.value = false;

  if (selectedCustomerForKeyword.value?.ids?.length || selectedCustomerForKeyword.value?.name) {
    searchingSelectedCustomer.value = true;
    filtered.value = [];

    const ids = Array.isArray(selectedCustomerForKeyword.value?.ids)
      ? Array.from(
          new Set(
            selectedCustomerForKeyword.value.ids
              .map((id) => String(id || "").trim())
              .filter(Boolean),
          ),
        )
      : [];

    const tasks = [
      ...ids.map((id) => listSalesOrdersByCustomerId(id).catch(() => [])),
    ];
    if (selectedCustomerForKeyword.value?.name) {
      tasks.push(
        listSalesOrdersByCustomerName(selectedCustomerForKeyword.value.name).catch(
          () => [],
        ),
      );
    }

    const scopedGroups = await Promise.all(tasks).catch((error) => {
      console.warn("OrdersView: customer scoped lookup failed", error);
      return [];
    });
    let scoped = mergeUniqueOrders(...scopedGroups);

    // 舊資料常有 customerId 與 customerName 混用，回補全量掃描避免漏單。
    const allOrders = await listSalesOrders({ limit: 0 }).catch(() => []);
    const fallbackMatches = allOrders.filter((order) =>
      orderMatchesSelectedCustomer(order, selectedCustomerForKeyword.value),
    );
    scoped = mergeUniqueOrders(scoped, fallbackMatches);

    if (filterRunId !== latestFilterRun) return;
    filtered.value = sortOrders(
      scoped.filter((order) => {
        if (st && order.status !== st) return false;
        if (sk && !hasSinkStatus(order, sk)) return false;
        return true;
      }),
    );
    searchingSelectedCustomer.value = false;
    return;
  }

  let result = rows.value.filter((order) => matchesFilters(order, kw, st, sk));

  if (shouldRemoteKeywordLookup(rawKeyword)) {
    const remoteMatches = await searchSalesOrdersByKeyword(rawKeyword, {
        limit: 20,
      }).catch((error) => {
        console.warn("OrdersView: remote keyword lookup failed", error);
        return [];
      });
    if (filterRunId !== latestFilterRun) return;
    const filteredRemote = remoteMatches.filter((order) =>
      matchesFilters(order, kw, st, sk),
    );
    result = mergeUniqueOrders(result, filteredRemote);
  }

  if (filterRunId !== latestFilterRun) return;
  filtered.value = sortOrders(result);
}

function onKeywordFocus() {
  showCustomerMatchList.value = true;
}

function onKeywordBlur() {
  window.setTimeout(() => {
    showCustomerMatchList.value = false;
  }, 120);
}

function onKeywordInput() {
  if (
    selectedCustomerForKeyword.value &&
    String(keyword.value || "").trim() !== selectedCustomerForKeyword.value.label
  ) {
    selectedCustomerForKeyword.value = null;
  }
  showCustomerMatchList.value = true;
  saveSearchState();
  void applyFilter();
}

function selectCustomerForSearch(customer) {
  const label = `${customer.code || customer.id} ${customer.name}`.trim();
  const ids = Array.from(
    new Set(
      [customer.id, customer.code, customer.docId]
        .map((id) => String(id || "").trim())
        .filter(Boolean),
    ),
  );
  selectedCustomerForKeyword.value = {
    id: customer.id,
    ids,
    name: customer.name,
    code: customer.code,
    label,
  };
  keyword.value = label;
  showCustomerMatchList.value = false;
  saveSearchState();
  void applyFilter();
}

function clearSelectedCustomerSearch() {
  selectedCustomerForKeyword.value = null;
  keyword.value = "";
  showCustomerMatchList.value = false;
  saveSearchState();
  void applyFilter();
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

async function openOriginalDesign(order) {
  if (!order?.id) {
    alert("此訂單不支援查看原圖檔。");
    return;
  }
  router.push(`/orders/${order.id}/original-review`);
}

function hasSinkStatus(order, val) {
  const sinks = Array.isArray(order.sinks) ? order.sinks : [];
  return sinks.some((s) => (s.arrival || "notArrived") === val);
}

function orderHasDrawings(order) {
  return !!(
    order?.hasDrawings ||
    order?._hasDrawings ||
    Object.keys(order?.pendingSignDrawingVersions || {}).length > 0
  );
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

function parseDateValue(val) {
  if (!val) return null;
  if (val?.toDate) return val.toDate();
  const n = Number(val);
  if (!isNaN(n) && n > 0 && n < 100000) return new Date((n - 25569) * 86400 * 1000);
  if (!isNaN(n) && n >= 1000000000000) return new Date(n);
  return new Date(String(val).slice(0, 10));
}

function fmtDate(val) {
  const d = parseDateValue(val);
  return !d || isNaN(d) ? "" : d.toLocaleDateString("zh-TW");
}

function fmtMonthDay(val) {
  const d = parseDateValue(val);
  return !d || isNaN(d) ? "" : `${d.getMonth() + 1}/${d.getDate()}`;
}

function fmtStaffWithMonthDay(staff, dateVal) {
  const parts = [staff || "", fmtMonthDay(dateVal)].filter(Boolean);
  return parts.join(" ") || "—";
}

function resetSitePriceForm() {
  sitePriceForm.value = {
    customerName: "",
    projectName: "",
    color: "",
    price: 0,
    sinkPrice: 0,
    stovePrice: 0,
  };
}

async function loadSitePriceRows() {
  const customerName = String(sitePriceForm.value.customerName || "").trim();
  if (!customerName) {
    sitePriceRows.value = [];
    return;
  }
  const runId = ++latestSitePriceLoad;
  sitePriceLoading.value = true;
  try {
    const rows = await listCustomerSitePrices(customerName);
    if (runId !== latestSitePriceLoad) return;
    sitePriceRows.value = Array.isArray(rows) ? rows : [];
  } catch (error) {
    if (runId !== latestSitePriceLoad) return;
    sitePriceRows.value = [];
    sitePriceMsg.value = `讀取歷史資料失敗：${error?.message || error}`;
  } finally {
    if (runId === latestSitePriceLoad) sitePriceLoading.value = false;
  }
}

function editSitePriceEntry(item) {
  editingSitePriceKey.value = String(item?.entryKey || "");
  sitePriceForm.value = {
    customerName: String(item?.customerName || sitePriceForm.value.customerName || "").trim(),
    projectName: String(item?.projectName || "").trim(),
    color: String(item?.color || "").trim(),
    price: Number(item?.price || 0),
    sinkPrice: Number(item?.sinkPrice || 0),
    stovePrice: Number(item?.stovePrice || 0),
  };
  sitePriceMsg.value = "已載入資料，修改後按更新";
}

function cancelSitePriceEdit() {
  editingSitePriceKey.value = "";
  sitePriceMsg.value = "";
  resetSitePriceForm();
}

async function deleteSitePriceEntry(item) {
  const customerName = String(sitePriceForm.value.customerName || item?.customerName || "").trim();
  const entryKey = String(item?.entryKey || "").trim();
  if (!customerName || !entryKey) return;
  if (!confirm(`確定刪除工地案「${item?.projectName || ""} / ${item?.color || ""}」嗎？`)) return;

  sitePriceSaving.value = true;
  sitePriceMsg.value = "";
  try {
    await deleteCustomerSitePrice({ customerName, entryKey });
    if (editingSitePriceKey.value === entryKey) {
      cancelSitePriceEdit();
      sitePriceForm.value.customerName = customerName;
    }
    await loadSitePriceRows();
    sitePriceMsg.value = "已刪除工地價格";
  } catch (error) {
    sitePriceMsg.value = `刪除失敗：${error?.message || error}`;
  } finally {
    sitePriceSaving.value = false;
  }
}

function openSitePriceModal() {
  sitePriceMsg.value = "";
  showSitePriceModal.value = true;
  void loadSitePriceRows();
}

function closeSitePriceModal() {
  showSitePriceModal.value = false;
  sitePriceSaving.value = false;
  sitePriceLoading.value = false;
  editingSitePriceKey.value = "";
}

async function saveSitePriceEntry() {
  const payload = {
    customerName: String(sitePriceForm.value.customerName || "").trim(),
    projectName: String(sitePriceForm.value.projectName || "").trim(),
    color: String(sitePriceForm.value.color || "").trim(),
    price: Number(sitePriceForm.value.price || 0),
    sinkPrice: Number(sitePriceForm.value.sinkPrice || 0),
    stovePrice: Number(sitePriceForm.value.stovePrice || 0),
  };

  if (!payload.customerName || !payload.projectName || !payload.color) {
    sitePriceMsg.value = "請填寫客戶、案名、顏色";
    return;
  }

  sitePriceSaving.value = true;
  sitePriceMsg.value = "";
  try {
    await saveCustomerSitePrice({
      ...payload,
      entryKey: editingSitePriceKey.value || undefined,
    });
    sitePriceMsg.value = editingSitePriceKey.value ? "已更新工地價格" : "已儲存工地價格";
    const keepCustomerName = payload.customerName;
    editingSitePriceKey.value = "";
    resetSitePriceForm();
    sitePriceForm.value.customerName = keepCustomerName;
    await loadSitePriceRows();
  } catch (error) {
    sitePriceMsg.value = `儲存失敗：${error?.message || error}`;
  } finally {
    sitePriceSaving.value = false;
  }
}

watch(
  () => String(sitePriceForm.value.customerName || "").trim(),
  () => {
    if (!showSitePriceModal.value) return;
    editingSitePriceKey.value = "";
    sitePriceMsg.value = "";
    void loadSitePriceRows();
  },
);
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
  align-items: center;
}
.result-count {
  margin-left: auto;
  color: #334155;
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
}
.keyword-picker {
  position: relative;
  flex: 1 1 200px;
}
.search-input {
  width: 100%;
  padding: 7px 10px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 14px;
}
.customer-match-list {
  position: absolute;
  z-index: 10;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  max-height: 260px;
  overflow: auto;
  background: #fff;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.12);
}
.customer-match-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border: 0;
  border-bottom: 1px solid #f1f5f9;
  background: #fff;
  text-align: left;
  cursor: pointer;
}
.customer-match-item:last-child {
  border-bottom: 0;
}
.customer-match-item:hover {
  background: #f8fafc;
}
.customer-match-code {
  color: #64748b;
  font-size: 12px;
  min-width: 70px;
}
.customer-match-name {
  color: #0f172a;
  font-size: 13px;
  font-weight: 600;
}
.btn-clear-customer {
  padding: 7px 12px;
  border: 1px solid #f5c2c7;
  border-radius: 6px;
  background: #fff5f5;
  color: #b42318;
  font-size: 13px;
  cursor: pointer;
}
.btn-clear-customer:hover {
  background: #ffe3e3;
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
  width: max(1860px, 100%);
  min-width: 1860px;
  border-collapse: collapse;
  table-layout: fixed;
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
.orders-table tbody tr.row-has-drawings {
  background: #fff8c5;
}
.orders-table tbody tr.row-has-drawings:hover {
  background: #fff1a8;
}
.col-addr {
  width: 360px;
  min-width: 360px;
  max-width: 360px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.col-no .order-no {
  font-weight: 600;
  color: #1d4ed8;
}
.col-stones {
  width: 120px;
  min-width: 120px;
  max-width: 120px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.stone-tag {
  display: block;
  font-size: 12px;
  color: #374151;
  line-height: 1.35;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.col-customer {
  width: 150px;
  min-width: 150px;
  max-width: 150px;
  overflow: hidden;
}
.col-customer .customer-name {
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.col-customer .customer-sub {
  font-size: 12px;
  color: #9ca3af;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.col-category {
  width: 86px;
  min-width: 86px;
  max-width: 86px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.col-countertop {
  width: 88px;
  min-width: 88px;
  max-width: 88px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cm-tag {
  font-size: 11px;
  color: #6b7280;
  margin-left: 0;
}
.col-price {
  text-align: right;
  white-space: nowrap;
  width: 92px;
  min-width: 92px;
  max-width: 92px;
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
  width: 76px;
  min-width: 76px;
  max-width: 76px;
}
.col-staff {
  white-space: normal;
  color: #374151;
  width: 88px;
  min-width: 88px;
  max-width: 88px;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.35;
  word-break: break-word;
}
.col-status {
  width: 70px;
  min-width: 70px;
  max-width: 70px;
}
.col-sink-status {
  width: 92px;
  min-width: 92px;
  max-width: 92px;
}
.col-no {
  width: 110px;
  min-width: 110px;
  max-width: 110px;
}
.col-actions {
  text-align: right;
  width: 172px;
  min-width: 172px;
  max-width: 172px;
  white-space: normal;
}
.actions-wrap {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  justify-content: flex-end;
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
.btn-draw-done {
  color: #166534;
  border-color: #86efac;
  background: #dcfce7;
}
.btn-draw-done:hover {
  background: #bbf7d0;
}
.btn-origin {
  color: #92400e;
  border-color: #fcd34d;
  background: #fffbeb;
}
.btn-origin:hover {
  background: #fef3c7;
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

.site-price-modal {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.36);
  display: grid;
  place-items: center;
  z-index: 90;
  padding: 16px;
}

.site-price-card {
  width: min(760px, 100%);
  background: #fff;
  border-radius: 10px;
  border: 1px solid #dbe1e8;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.12);
  padding: 16px;
}

.site-price-card h3 {
  margin: 0 0 12px;
}

.site-price-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.site-price-grid label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
  color: #374151;
}

.site-price-grid input {
  border: 1px solid #d1d5db;
  border-radius: 6px;
  padding: 7px 9px;
  font-size: 14px;
}

.site-price-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 14px;
}

.site-price-msg {
  margin: 10px 0 0;
  color: #1f2937;
  font-size: 13px;
}

.site-price-list {
  margin-top: 12px;
  border-top: 1px dashed #dbe1e8;
  padding-top: 10px;
}

.site-price-list-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.site-price-list-table {
  max-height: 220px;
  overflow: auto;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
}

.site-price-list-table table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.site-price-list-table th,
.site-price-list-table td {
  border-bottom: 1px solid #f1f5f9;
  padding: 6px 8px;
  text-align: left;
  white-space: nowrap;
}

.site-price-list-table th {
  position: sticky;
  top: 0;
  background: #f8fafc;
  z-index: 1;
}

.site-price-op {
  display: flex;
  gap: 6px;
  justify-content: flex-end;
}

.site-price-input-tip {
  font-size: 12px;
  color: #6b7280;
}

@media (min-width: 1200px) {
  .orders-view {
    width: calc(100vw - 24px);
    margin-left: calc(50% - 50vw + 12px);
    padding-left: 12px;
    padding-right: 12px;
  }
}

@media (max-width: 900px) {
  .site-price-grid {
    grid-template-columns: 1fr;
  }
}
</style>
