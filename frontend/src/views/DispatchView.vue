<template>
  <div class="dispatch-view">
    <header class="page-header">
      <h2>📋 發單作業</h2>
      <div class="header-actions">
        <RouterLink class="btn-aux" to="/orders">← 訂單列表</RouterLink>
        <button
          class="btn-primary btn-dispatch"
          :disabled="!selectedIds.size || dispatching"
          @click="onDispatchPrint"
        >
          {{ dispatching ? pdfProgress || "處理中…" : `🖨️ 批次發單並列印（${selectedIds.size} 張）` }}
        </button>
      </div>
    </header>

    <!-- 篩選列 -->
    <div class="filter-bar">
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
      <select v-model="showDispatched" @change="applyFilter">
        <option value="undispatched">未發單</option>
        <option value="all">含已發單</option>
        <option value="dispatched">僅已發單</option>
      </select>
      <input
        v-model="keyword"
        class="search-input"
        placeholder="搜尋訂單號 / 客戶 / 地址"
        @input="applyFilter"
      />
      <button class="btn-aux" @click="selectAll">全選（{{ filtered.length }}）</button>
      <button class="btn-aux" @click="clearSelection">取消全選</button>
    </div>

    <p v-if="loading" class="hint">載入中…</p>
    <p v-else-if="!filtered.length" class="hint">找不到符合的訂單。</p>

    <div v-else class="table-wrap">
      <table class="dispatch-table">
        <thead>
          <tr>
            <th class="col-check">
              <input type="checkbox" :checked="allSelected" :indeterminate.prop="someSelected" @change="toggleAll" />
            </th>
            <th class="sortable" @click="setSort('promisedAt')">預交日{{ sortIcon('promisedAt') }}</th>
            <th class="sortable" @click="setSort('orderNo')">訂單號{{ sortIcon('orderNo') }}</th>
            <th class="sortable" @click="setSort('customerName')">客戶{{ sortIcon('customerName') }}</th>
            <th>施工地址</th>
            <th>石材</th>
            <th>狀態</th>
            <th>確定單</th>
            <th>發單紀錄</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="o in filtered"
            :key="o.id"
            :class="{ 'row-dispatched': o.dispatchedAt, 'row-selected': selectedIds.has(o.id) }"
            @click="toggleSelect(o.id)"
          >
            <td class="col-check" @click.stop>
              <input
                type="checkbox"
                :checked="selectedIds.has(o.id)"
                @change="toggleSelect(o.id)"
              />
            </td>
            <td class="col-date">{{ fmtDate(o.promisedAt) }}</td>
            <td class="col-no">
              <span class="order-no">{{ o.orderNo || "—" }}</span>
            </td>
            <td class="col-customer">{{ o.customerName || "—" }}</td>
            <td class="col-addr">{{ o.siteAddress || "—" }}</td>
            <td>{{ o.countertop?.type || "—" }}</td>
            <td>
              <span class="status-chip" :class="'status-' + o.status">
                {{ STATUS_LABEL[o.status] || o.status || "—" }}
              </span>
            </td>
            <td class="col-pdf" @click.stop>
              <span v-if="o.confirmedPdfUrl" class="pdf-ok">✓ 有PDF</span>
              <span v-else class="pdf-none">✗ 未封存</span>
            </td>
            <td class="col-dispatched" @click.stop>
              <span v-if="o.dispatchedAt" class="dispatched-badge">✓ {{ fmtDate(o.dispatchedAt) }}</span>
              <span v-else class="undispatched-tag">未發單</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- 工站選擇 -->
    <div class="station-bar">
      <span class="station-label">發單關卡：</span>
      <label v-for="s in STATIONS" :key="s" class="station-check">
        <input type="checkbox" v-model="stationMap[s]" />
        {{ s }}
      </label>
    </div>

    <!-- 已選摘要 -->
    <div v-if="selectedIds.size" class="selection-summary">
      已選 <strong>{{ selectedIds.size }}</strong> 張訂單（其中
      <strong>{{ selectedWithPdf }}</strong> 張有確定單PDF）×
      <strong>{{ activeStations.length }}</strong> 關卡 =
      <strong>{{ selectedWithPdf * activeStations.length }}</strong> 頁　
      <span class="station-names">{{ activeStations.join(' / ') || '（未選任何關卡）' }}</span>
      <span v-if="selectedWithPdf < selectedIds.size" class="warn-no-pdf">　⚠️ {{ selectedIds.size - selectedWithPdf }} 張無PDF將略過</span>
    </div>

    <!-- 錯誤訊息 -->
    <div v-if="errorMsg" class="error-box">
      <strong>錯誤：</strong>{{ errorMsg }}
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from "vue";
import { PDFDocument, rgb } from "pdf-lib";
import { listSalesOrders, batchMarkDispatched, downloadConfirmedPdfBytes } from "../firebase";

const STATIONS = ["裁切", "水刀", "黏合", "水磨", "套板", "驗收"];

const STATUS_LABEL = {
  draft: "草稿",
  pendingSign: "待回簽",
  confirmed: "已確認",
  inProduction: "生產中",
  delivered: "已出貨",
  done: "完工",
  cancelled: "已取消",
};

// Station selection: default all enabled
const stationMap = ref(Object.fromEntries(STATIONS.map(s => [s, true])));
const activeStations = computed(() => STATIONS.filter(s => stationMap.value[s]));

const loading = ref(true);
const rows = ref([]);
const filtered = ref([]);
// Use a reactive object to track selection (Set doesn't trigger Vue reactivity)
const selectedMap = ref({});

const keyword = ref("");
const statusFilter = ref("confirmed");
const showDispatched = ref("undispatched");
const sortCol = ref("promisedAt");
const sortDir = ref(1); // 1=asc (nearest deadline first)
const dispatching = ref(false);
const pdfProgress = ref("");
const errorMsg = ref("");

const selectedIds = computed(() => new Set(Object.keys(selectedMap.value).filter(k => selectedMap.value[k])));

const selectedWithPdf = computed(() => {
  const ids = selectedIds.value;
  return rows.value.filter(o => ids.has(o.id) && o.confirmedPdfUrl).length;
});

const allSelected = computed(() =>
  filtered.value.length > 0 && filtered.value.every(o => selectedMap.value[o.id])
);
const someSelected = computed(() =>
  filtered.value.some(o => selectedMap.value[o.id]) && !allSelected.value
);

function setSort(col) {
  if (sortCol.value === col) sortDir.value *= -1;
  else { sortCol.value = col; sortDir.value = 1; }
  applyFilter();
}

function sortIcon(col) {
  if (sortCol.value !== col) return " ↕";
  return sortDir.value === 1 ? " ↑" : " ↓";
}

function toggleAll(e) {
  if (e.target.checked) selectAll();
  else clearSelection();
}

function selectAll() {
  const m = { ...selectedMap.value };
  for (const o of filtered.value) m[o.id] = true;
  selectedMap.value = m;
}

function clearSelection() {
  selectedMap.value = {};
}

function toggleSelect(id) {
  selectedMap.value = { ...selectedMap.value, [id]: !selectedMap.value[id] };
}

onMounted(async () => {
  try {
    rows.value = await listSalesOrders({ limit: 300 });
  } finally {
    loading.value = false;
    applyFilter();
  }
});

function applyFilter() {
  const kw = keyword.value.trim().toLowerCase();
  let result = rows.value.filter(o => {
    if (statusFilter.value && o.status !== statusFilter.value) return false;
    if (showDispatched.value === "undispatched" && o.dispatchedAt) return false;
    if (showDispatched.value === "dispatched" && !o.dispatchedAt) return false;
    if (kw) {
      const hay = [o.orderNo, o.customerName, o.siteAddress].join(" ").toLowerCase();
      if (!hay.includes(kw)) return false;
    }
    return true;
  });

  const dir = sortDir.value;
  result = [...result].sort((a, b) => {
    const va = sortVal(a, sortCol.value);
    const vb = sortVal(b, sortCol.value);
    if (va === vb) return 0;
    if (va === Infinity) return 1;
    if (vb === Infinity) return -1;
    return va < vb ? -dir : dir;
  });

  filtered.value = result;
}

function sortVal(o, col) {
  switch (col) {
    case "promisedAt": {
      const v = o.promisedAt;
      if (!v) return Infinity;
      if (v?.toDate) return v.toDate().getTime();
      const n = Number(v);
      if (!isNaN(n) && n > 0 && n < 100000) return (n - 25569) * 86400 * 1000;
      if (!isNaN(n) && n >= 1000000000000) return n;
      return new Date(String(v).slice(0, 10)).getTime();
    }
    case "orderNo": return o.orderNo ?? "";
    case "customerName": return o.customerName ?? "";
    default: return "";
  }
}

function fmtDate(val) {
  if (!val) return "—";
  let d;
  if (val?.toDate) {
    d = val.toDate();
  } else {
    const n = Number(val);
    if (!isNaN(n) && n > 0 && n < 100000) d = new Date((n - 25569) * 86400 * 1000);
    else if (!isNaN(n) && n >= 1000000000000) d = new Date(n);
    else d = new Date(String(val).slice(0, 10));
  }
  if (isNaN(d)) return "—";
  return d.toLocaleDateString("zh-TW");
}

async function onDispatchPrint() {
  const ids = [...selectedIds.value];
  if (!ids.length) return;
  errorMsg.value = "";

  if (!activeStations.value.length) {
    errorMsg.value = "請至少選擇一個發單關卡。";
    return;
  }

  const selectedOrders = rows.value.filter(o => ids.includes(o.id));
  // Sort by promisedAt ascending (nearest deadline first)
  const sorted = [...selectedOrders].sort((a, b) => {
    const va = sortVal(a, "promisedAt");
    const vb = sortVal(b, "promisedAt");
    if (va === Infinity) return 1;
    if (vb === Infinity) return -1;
    return va - vb;
  });

  const ordersWithPdf = sorted.filter(o => o.confirmedPdfUrl);
  if (ordersWithPdf.length === 0) {
    errorMsg.value = "選取的訂單都尚未封存確定單PDF，請先到各訂單的「確定單」頁面按「封存PDF」後再發單。";
    return;
  }

  const missing = sorted.filter(o => !o.confirmedPdfUrl);
  let confirmMsg = `確定要對 ${ids.length} 張訂單執行發單作業？\n` +
    sorted.map(o => `  • ${o.orderNo || "—"} ${o.customerName || ""} (${fmtDate(o.promisedAt)})${!o.confirmedPdfUrl ? " ⚠️無PDF" : ""}`).join("\n");
  if (missing.length) {
    confirmMsg += `\n\n⚠️ ${missing.length} 張無確定單PDF，將略過。`;
  }
  confirmMsg += `\n\n系統將標記「生產中」並產生 ${ordersWithPdf.length * activeStations.value.length} 頁合併PDF（${activeStations.value.join('、')}）。`;

  if (!confirm(confirmMsg)) return;

  dispatching.value = true;
  try {
    // 1. Mark dispatched in Firestore
    pdfProgress.value = "標記發單中…";
    await batchMarkDispatched(ids);

    // 2. Update local row state
    const now = new Date();
    for (const o of rows.value) {
      if (ids.includes(o.id)) {
        o.dispatchedAt = now;
        o.status = "inProduction";
      }
    }

    // 3. Build merged PDF via pdfjs → canvas → jsPDF
    pdfProgress.value = `產生PDF中… (0 / ${ordersWithPdf.length * STATIONS.length})`;
    const blob = await buildDispatchPdf(ordersWithPdf, activeStations.value);

    // 4. Open blob URL
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");

    // 5. Clear selection
    selectedMap.value = {};
    applyFilter();
  } catch (e) {
    console.error(e);
    errorMsg.value = "發單失敗：" + (e?.message || e);
  } finally {
    dispatching.value = false;
    pdfProgress.value = "";
  }
}

// ── PDF generation: pdf-lib 直接複製頁面（不走 canvas 渲染，避免掃描PDF空白問題）────

/**
 * 用 canvas 產生站別浮水印 PNG（只畫文字，不涉及跨域，canvas 不會被汙染）
 */
async function createStationWatermarkPng(station) {
  const W = 400, H = 160;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, W, H);
  ctx.save();
  ctx.font = `bold 72px "標楷體", "DFKai-SB", "BiauKai", serif`;
  ctx.fillStyle = "rgba(0, 0, 200, 0.30)";
  ctx.textAlign = "right";
  ctx.translate(W - 30, H - 30);
  ctx.rotate(-Math.PI / 18);
  ctx.fillText(station, 0, 0);
  ctx.restore();
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

let _pdfDone = 0;
let _pdfTotal = 0;

async function buildDispatchPdf(orders, stations) {
  _pdfDone = 0;
  _pdfTotal = orders.length * stations.length;

  const mergedDoc = await PDFDocument.create();

  // 預先為每個站別產生浮水印 PNG，嵌入 mergedDoc
  const watermarkImages = {};
  for (const station of stations) {
    const blob = await createStationWatermarkPng(station);
    const buf = await blob.arrayBuffer();
    watermarkImages[station] = await mergedDoc.embedPng(new Uint8Array(buf));
  }

  let pageCount = 0;

  for (const station of stations) {
    for (const order of orders) {
      pdfProgress.value = `產生PDF中… (${_pdfDone + 1} / ${_pdfTotal})`;

      let srcBytes;
      try {
        srcBytes = await downloadConfirmedPdfBytes(order.id);
      } catch (e) {
        console.error(`無法取得 ${order.orderNo} 的PDF:`, e);
        errorMsg.value = (errorMsg.value ? errorMsg.value + "\n" : "") +
          `${order.orderNo || order.id}: 下載失敗 — ${e?.message || e}`;
        _pdfDone++;
        continue;
      }

      let srcDoc;
      try {
        srcDoc = await PDFDocument.load(srcBytes, { ignoreEncryption: true });
      } catch (e) {
        console.error(`無法解析 ${order.orderNo} 的PDF:`, e);
        errorMsg.value = (errorMsg.value ? errorMsg.value + "\n" : "") +
          `${order.orderNo || order.id}: 解析失敗 — ${e?.message || e}`;
        _pdfDone++;
        continue;
      }

      const pageIndices = srcDoc.getPageIndices();
      const copiedPages = await mergedDoc.copyPages(srcDoc, pageIndices);

      for (const page of copiedPages) {
        mergedDoc.addPage(page);
        const { width, height } = page.getSize();

        // 1. 遮蓋價格區域（白色矩形，pdf-lib 座標原點在左下）
        page.drawRectangle({
          x: 0.20 * width,
          y: 0.04 * height,
          width: 0.45 * width,
          height: 0.13 * height,
          color: rgb(1, 1, 1),
          opacity: 1,
          borderWidth: 0,
        });

        // 2. 站別浮水印圖片（右下角）
        const wImg = watermarkImages[station];
        const wW = width * 0.22;
        const wH = wW * (160 / 400);
        page.drawImage(wImg, {
          x: width - wW - 15,
          y: 15,
          width: wW,
          height: wH,
          opacity: 0.85,
        });

        pageCount++;
      }

      _pdfDone++;
    }
  }

  if (pageCount === 0) {
    throw new Error("所有確定單PDF均無法下載，請檢查網路連線或重新登入後再試。");
  }

  const bytes = await mergedDoc.save();
  return new Blob([bytes], { type: "application/pdf" });
}
</script>

<style scoped>
.dispatch-view {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px 16px 80px;
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
.header-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}
.filter-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 14px;
  align-items: center;
}
.search-input {
  flex: 1 1 180px;
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
.dispatch-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13.5px;
}
.dispatch-table th,
.dispatch-table td {
  padding: 8px 10px;
  text-align: left;
  border-bottom: 1px solid #e5e7eb;
  white-space: nowrap;
}
.dispatch-table th {
  background: #f9fafb;
  font-size: 12px;
  color: #6b7280;
  font-weight: 600;
}
.dispatch-table th.sortable {
  cursor: pointer;
  user-select: none;
}
.dispatch-table th.sortable:hover {
  background: #f0f9ff;
  color: #1d4ed8;
}
.dispatch-table tbody tr {
  cursor: pointer;
}
.dispatch-table tbody tr:hover {
  background: #f0f9ff;
}
.row-selected {
  background: #eff6ff !important;
}
.row-dispatched {
  color: #9ca3af;
}
.col-check {
  width: 36px;
  text-align: center;
}
.col-date {
  white-space: nowrap;
}
.col-no .order-no {
  font-weight: 600;
  color: #1d4ed8;
}
.col-addr {
  white-space: normal;
  min-width: 120px;
  max-width: 200px;
}
.dispatched-badge {
  color: #16a34a;
  font-weight: 600;
  font-size: 12px;
}
.undispatched-tag {
  color: #9ca3af;
  font-size: 12px;
}
.pdf-ok {
  color: #16a34a;
  font-size: 12px;
  font-weight: 600;
}
.pdf-none {
  color: #dc2626;
  font-size: 12px;
}
.warn-no-pdf {
  color: #b45309;
  font-size: 13px;
}
.error-box {
  margin-top: 12px;
  padding: 10px 16px;
  background: #fef2f2;
  border: 1px solid #fca5a5;
  border-radius: 8px;
  font-size: 14px;
  color: #991b1b;
}
.selection-summary {
  margin-top: 16px;
  padding: 10px 16px;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  border-radius: 8px;
  font-size: 14px;
  color: #1e40af;
}
.btn-primary {
  background: #2563eb;
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 8px 16px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
}
.btn-primary:hover:not(:disabled) {
  background: #1d4ed8;
}
.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.btn-dispatch {
  padding: 8px 20px;
  font-size: 14px;
}
.btn-aux {
  background: #f3f4f6;
  color: #374151;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  padding: 7px 12px;
  font-size: 13px;
  cursor: pointer;
  text-decoration: none;
  display: inline-block;
}
.btn-aux:hover {
  background: #e5e7eb;
}
.station-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 12px;
  margin-bottom: 12px;
  padding: 8px 12px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  font-size: 13.5px;
}
.station-label {
  color: #374151;
  font-weight: 600;
  margin-right: 4px;
}
.station-check {
  display: flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  user-select: none;
  color: #1f2937;
}
.station-check input[type="checkbox"] {
  width: 15px;
  height: 15px;
  cursor: pointer;
}
.station-names {
  color: #374151;
}
.hint {
  color: #6b7280;
  padding: 24px 0;
  text-align: center;
  font-size: 14px;
}

/* Status chips */
.status-chip {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11.5px;
  font-weight: 600;
  white-space: nowrap;
}
.status-chip.status-draft { background: #f3f4f6; color: #6b7280; }
.status-chip.status-pendingSign { background: #fef9c3; color: #a16207; }
.status-chip.status-confirmed { background: #dcfce7; color: #166534; }
.status-chip.status-inProduction { background: #dbeafe; color: #1e40af; }
.status-chip.status-delivered { background: #f0fdf4; color: #15803d; }
.status-chip.status-done { background: #e0e7ff; color: #3730a3; }
.status-chip.status-cancelled { background: #fee2e2; color: #991b1b; }
</style>
