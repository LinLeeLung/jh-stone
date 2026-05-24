<template>
  <div class="import-view">
    <header class="page-header">
      <h2>批次匯入訂單</h2>
      <RouterLink class="btn-secondary" to="/orders">← 返回列表</RouterLink>
    </header>

    <!-- Step 1: Upload -->
    <div v-if="step === 'upload'" class="card">
      <p class="hint-sm">
        支援 Excel (.xlsx / .xls) 或 CSV 格式。請確保第一列為標題列。
      </p>
      <div
        class="drop-zone"
        :class="{ dragging }"
        @dragover.prevent="dragging = true"
        @dragleave="dragging = false"
        @drop.prevent="onDrop"
        @click="fileInput.click()"
      >
        <span>拖曳檔案至此，或點擊選擇</span>
        <input
          ref="fileInput"
          type="file"
          accept=".xlsx,.xls,.csv"
          style="display: none"
          @change="onFileChange"
        />
      </div>
      <p v-if="parseError" class="error">{{ parseError }}</p>
    </div>

    <!-- Step 2: Preview -->
    <div v-if="step === 'preview'" class="card">
      <div class="preview-header">
        <div>
          <strong>偵測到 {{ parsed.length }} 筆</strong>
          <span v-if="skipped.length" class="warn-tag"
            >{{ skipped.length }} 筆將跳過（無訂單號碼）</span
          >
        </div>
        <div class="preview-actions">
          <button class="btn-secondary" @click="reset">重新選擇</button>
          <button class="btn-primary" @click="startImport">
            確認匯入 {{ parsed.length }} 筆
          </button>
        </div>
      </div>

      <div class="table-wrap">
        <table class="preview-table">
          <thead>
            <tr>
              <th>#</th>
              <th>訂單號碼</th>
              <th>客戶名稱</th>
              <th>類別</th>
              <th>安裝地點</th>
              <th>石材品牌/顏色</th>
              <th>預交日</th>
              <th>銷售額</th>
              <th>水槽</th>
              <th>爐子</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(r, i) in previewRows" :key="i">
              <td class="dim">{{ i + 1 }}</td>
              <td>
                <strong>{{ r.customerOrderNo || "—" }}</strong>
              </td>
              <td>{{ r.customerName || "—" }}</td>
              <td>{{ r.category || "—" }}</td>
              <td class="addr-cell">{{ r.siteAddress || "—" }}</td>
              <td>{{ stoneLabel(r) }}</td>
              <td>{{ r.promisedAt || "—" }}</td>
              <td>{{ r.amount ? r.amount.toLocaleString() : "—" }}</td>
              <td>
                {{
                  r.sinks
                    ?.map((s) => s.model)
                    .filter(Boolean)
                    .join(" / ") || "—"
                }}
              </td>
              <td>
                {{
                  r.stoves
                    ?.map((s) => s.model)
                    .filter(Boolean)
                    .join(" / ") || "—"
                }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-if="parsed.length > 10" class="hint-sm">
        僅顯示前 10 筆預覽，共 {{ parsed.length }} 筆將被匯入。
      </p>
    </div>

    <!-- Step 3: Importing -->
    <div v-if="step === 'importing'" class="card center">
      <p class="importing-label">
        匯入中… {{ importDone }} / {{ parsed.length }}
      </p>
      <div class="progress-bar">
        <div class="progress-fill" :style="{ width: progressPct + '%' }"></div>
      </div>
    </div>

    <!-- Step 4: Done -->
    <div v-if="step === 'done'" class="card center">
      <p class="done-label">✓ 成功匯入 {{ importDone }} 筆訂單</p>
      <div class="done-actions">
        <RouterLink class="btn-primary" to="/orders">查看訂單列表</RouterLink>
        <button class="btn-secondary" @click="reset">再次匯入</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from "vue";
import * as XLSX from "xlsx";
import { batchImportSalesOrders } from "../firebase";

const step = ref("upload");
const dragging = ref(false);
const fileInput = ref(null);
const parseError = ref("");
const parsed = ref([]); // valid rows
const skipped = ref([]); // skipped rows
const importDone = ref(0);

const previewRows = computed(() => parsed.value.slice(0, 10));
const progressPct = computed(() =>
  parsed.value.length
    ? Math.round((importDone.value / parsed.value.length) * 100)
    : 0,
);

// ── Column helpers ─────────────────────────────────────────────────────────
function normHeader(h) {
  return String(h ?? "").replace(/[\s\n\r]+/g, "");
}

// Build array of { norm, idx } instead of map, to support startsWith matching
function buildColMap(headerRow) {
  return headerRow.map((h, i) => ({ norm: normHeader(h), idx: i }));
}

// Find column index: normalized header must START WITH the key
// (handles "訂單號碼 093AAB" → norm "訂單號碼093AAB" → startsWith "訂單號碼" ✓)
function findCol(colHeaders, key) {
  return colHeaders.find((c) => c.norm.startsWith(key))?.idx ?? -1;
}

function colVal(row, colHeaders, ...keys) {
  for (const k of keys) {
    const idx = findCol(colHeaders, k);
    if (idx >= 0) {
      const v = String(row[idx] ?? "").trim();
      if (v) return v;
    }
  }
  return "";
}

// ── Parsers ────────────────────────────────────────────────────────────────
function parseNum(str) {
  if (!str) return null;
  const n = parseFloat(String(str).replace(/,/g, "").trim());
  return isNaN(n) ? null : n;
}

function parseHoleSize(str) {
  if (!str) return { w: null, h: null, r: null };
  // "710x368", "670*350*R85"
  const parts = String(str)
    .split(/[xX*×]/)
    .filter(Boolean);
  let w = null,
    h = null,
    r = null;
  for (const p of parts) {
    const clean = p.trim();
    if (/^[Rr]\d/.test(clean)) {
      r = parseFloat(clean.slice(1));
    } else if (w === null) {
      w = parseFloat(clean) || null;
    } else if (h === null) {
      h = parseFloat(clean) || null;
    }
  }
  return { w, h, r };
}

function parseDateStr(val) {
  if (!val) return "";
  // Excel serial number
  if (typeof val === "number") {
    const d = XLSX.SSF.parse_date_code(val);
    return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }
  return String(val).trim();
}

// ── Row → salesOrder ───────────────────────────────────────────────────────
function rowToOrder(row, colMap) {
  const s = (...keys) => colVal(row, colMap, ...keys);

  // Stones (only 1 set of brand/color columns)
  const stones = [];
  const brand = s("石材品牌");
  const color = s("顏色");
  if (brand || color) {
    stones.push({
      brand,
      color,
      modelCode: "",
      materialType: "quartz",
      freeInput: true,
    });
  }

  // Sinks (up to 3)
  const sinks = [];
  for (let i = 1; i <= 3; i++) {
    const model = s(`水槽${i}型號`);
    if (!model) continue;
    sinks.push({
      modelId: "",
      brand: "",
      model,
      bowlCount: 1,
      holeWidthMm: null,
      holeDepthMm: null,
      holeRadiusMm: null,
      method: s(`水槽${i}工法`),
      arrival: "notArrived",
      hasAccessory: false,
      deliveryNote: s(`水槽${i}到貨方式/日期`, `水槽${i}到貨方式`),
    });
  }

  // Stoves (up to 3)
  const stoves = [];
  for (let i = 1; i <= 3; i++) {
    const model = s(`爐子型號${i}`);
    if (!model) continue;
    const hole = parseHoleSize(s(`挖孔尺寸${i}`));
    stoves.push({
      modelId: "",
      brand: "",
      model,
      holeWidthMm: hole.w,
      holeDepthMm: hole.h,
      holeRadiusMm: hole.r,
      method: s(`爐子${i}工法`),
    });
  }

  // Special methods
  const specialStr = s("特殊作法");
  const specialMethods = specialStr
    ? specialStr
        .split(/[,/，、]/)
        .map((x) => x.trim())
        .filter(Boolean)
    : [];

  const cmNum = parseNum(s("台面cm數"));

  return {
    orderDate: parseDateStr(s("下單日")),
    promisedAt: parseDateStr(s("預交日")),
    amount: parseNum(s("銷售額")),
    templatingDate: parseDateStr(s("打板日")),
    templatingPerson: s("打板人"),
    category: s("類別"),
    customerOrderNo: s("訂單號碼"),
    customerId: s("客戶代碼"),
    customerName: s("客戶名稱"),
    customerContact: { name: "", phone: s("客戶電話") },
    owner: { name: s("業主"), phone: s("業主電話") },
    siteAddress: s("安裝地點"),
    countertop: { type: s("檯面型別"), totalCm: cmNum },
    rearTreatment: "flush",
    specialMethods,
    stones,
    sinks,
    stoves,
    warrantyApplyDate: s("保證書申請日期"),
    specialNotes: "",
  };
}

// ── File parsing ───────────────────────────────────────────────────────────
function processWorkbook(wb) {
  parseError.value = "";
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
  if (raw.length < 2) {
    parseError.value = "檔案內容為空或格式不正確。";
    return;
  }

  // Find header row (first row that has "訂單號碼" or "下單日")
  let headerIdx = 0;
  for (let i = 0; i < Math.min(5, raw.length); i++) {
    const norm = raw[i].map(normHeader);
    if (norm.includes("訂單號碼") || norm.includes("下單日")) {
      headerIdx = i;
      break;
    }
  }

  const headerRow = raw[headerIdx].map(normHeader);
  const colMap = buildColMap(raw[headerIdx]);
  const dataRows = raw.slice(headerIdx + 1);

  const good = [];
  const bad = [];
  for (const row of dataRows) {
    // Skip blank rows
    if (row.every((c) => !String(c).trim())) continue;
    const order = rowToOrder(row, colMap);
    if (!order.customerOrderNo && !order.customerName) {
      bad.push(row);
    } else {
      good.push(order);
    }
  }

  parsed.value = good;
  skipped.value = bad;
  step.value = "preview";
}

function onDrop(e) {
  dragging.value = false;
  const file = e.dataTransfer?.files?.[0];
  if (file) readFile(file);
}

function onFileChange(e) {
  const file = e.target.files?.[0];
  if (file) readFile(file);
}

function readFile(file) {
  const reader = new FileReader();
  const isCsv = file.name.toLowerCase().endsWith(".csv");

  reader.onerror = () => {
    parseError.value = "檔案讀取失敗。";
  };

  if (isCsv) {
    // CSV must be read as UTF-8 text; reading as ArrayBuffer loses the encoding
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: "string" });
        processWorkbook(wb);
      } catch (err) {
        parseError.value = "解析失敗：" + (err?.message || err);
      }
    };
    reader.readAsText(file, "UTF-8");
  } else {
    // Excel files (.xlsx / .xls) are binary — use ArrayBuffer
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(new Uint8Array(e.target.result), {
          type: "array",
          cellDates: false,
        });
        processWorkbook(wb);
      } catch (err) {
        parseError.value = "解析失敗：" + (err?.message || err);
      }
    };
    reader.readAsArrayBuffer(file);
  }
}

// ── Import ─────────────────────────────────────────────────────────────────
async function startImport() {
  step.value = "importing";
  importDone.value = 0;
  try {
    await batchImportSalesOrders(parsed.value, (done) => {
      importDone.value = done;
    });
    step.value = "done";
  } catch (err) {
    parseError.value = "匯入失敗：" + (err?.message || err);
    step.value = "preview";
  }
}

function reset() {
  step.value = "upload";
  parsed.value = [];
  skipped.value = [];
  importDone.value = 0;
  parseError.value = "";
  if (fileInput.value) fileInput.value.value = "";
}

// ── Display helpers ────────────────────────────────────────────────────────
function stoneLabel(r) {
  return r.stones?.[0]
    ? [r.stones[0].brand, r.stones[0].color].filter(Boolean).join(" / ")
    : "—";
}
</script>

<style scoped>
.import-view {
  max-width: 1100px;
  margin: 0 auto;
  padding: 20px 16px 60px;
}
.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}
.page-header h2 {
  margin: 0;
  font-size: 1.3rem;
  font-weight: 700;
}
.card {
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 20px;
  background: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  margin-bottom: 20px;
}
.card.center {
  text-align: center;
  padding: 40px 20px;
}
.drop-zone {
  border: 2px dashed #d1d5db;
  border-radius: 8px;
  padding: 48px 20px;
  text-align: center;
  cursor: pointer;
  color: #6b7280;
  font-size: 15px;
  transition:
    border-color 0.15s,
    background 0.15s;
  margin-top: 12px;
}
.drop-zone.dragging {
  border-color: #1d4ed8;
  background: #eff6ff;
  color: #1d4ed8;
}
.drop-zone:hover {
  border-color: #9ca3af;
}
.hint-sm {
  font-size: 13px;
  color: #9ca3af;
  margin: 0 0 4px;
}
.preview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 14px;
}
.preview-actions {
  display: flex;
  gap: 8px;
}
.warn-tag {
  display: inline-block;
  background: #fef3c7;
  color: #92400e;
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 10px;
  margin-left: 10px;
}
.table-wrap {
  overflow-x: auto;
}
.preview-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.preview-table th,
.preview-table td {
  padding: 7px 10px;
  border-bottom: 1px solid #e5e7eb;
  white-space: nowrap;
  text-align: left;
}
.preview-table th {
  background: #f9fafb;
  font-size: 12px;
  color: #6b7280;
  font-weight: 600;
}
.addr-cell {
  white-space: normal;
  min-width: 160px;
  max-width: 240px;
}
.dim {
  color: #d1d5db;
}
.importing-label {
  font-size: 1.1rem;
  color: #374151;
  margin-bottom: 16px;
}
.progress-bar {
  width: 100%;
  max-width: 400px;
  margin: 0 auto;
  height: 10px;
  background: #e5e7eb;
  border-radius: 6px;
  overflow: hidden;
}
.progress-fill {
  height: 100%;
  background: #1d4ed8;
  transition: width 0.3s;
}
.done-label {
  font-size: 1.3rem;
  font-weight: 600;
  color: #16a34a;
  margin-bottom: 20px;
}
.done-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
}
.error {
  color: #dc2626;
  font-size: 13px;
  margin-top: 10px;
}
.btn-primary {
  padding: 8px 18px;
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
.btn-secondary {
  padding: 8px 14px;
  background: #fff;
  color: #374151;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
  text-decoration: none;
}
.btn-secondary:hover {
  background: #f3f4f6;
}
</style>
