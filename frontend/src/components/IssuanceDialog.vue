<template>
  <div class="id-overlay" @click.self="emit('close')">
    <div class="id-modal">

      <div class="id-header">
        <h3>發單確認</h3>
        <div class="id-orderno-wrap">
          <label class="id-orderno-lbl">訂單號碼</label>
          <input
            class="id-orderno-input"
            :value="orderNoInput"
            @input="onOrderNoInput"
            placeholder="載入中…"
            :disabled="!counterLoaded"
          />
          <span v-if="autoMode" class="id-orderno-tag auto">自動</span>
          <span v-else class="id-orderno-tag manual">手動</span>
          <button v-if="!autoMode" class="id-orderno-reset" @click="orderNoInput = autoGenOrderNo; autoMode = true" title="恢復自動">↺</button>
        </div>
        <div v-if="suggestedOrderNo" class="id-orderno-hint">
          同地址已有正式單，若本次為追加，建議使用 {{ suggestedOrderNo }}
        </div>
        <button class="id-close" @click="emit('close')">✕</button>
      </div>

      <div class="id-body">

        <!-- ── 左：上傳簽回確定單 ── -->
        <div class="id-scan-col">
          <h4>① 簽回確定單</h4>
          <div
            class="scan-drop"
            :class="{ 'has-file': scanPreviewUrl }"
            tabindex="0"
            @click="scanInputRef.click()"
            @paste="onScanPaste"
            @dragover.prevent
            @drop.prevent="onScanDrop"
          >
            <template v-if="scanPreviewUrl">
              <img v-if="scanIsImage" :src="scanPreviewUrl" class="scan-img" />
              <div v-else class="scan-pdf-icon">📄 {{ scanFileName }}</div>
              <button class="scan-clear" @click.stop="clearScan">✕</button>
            </template>
            <div v-else class="scan-hint">
              <span>點此選擇 / 拖放 / Ctrl+V 貼上</span>
              <span class="scan-sub">PNG、JPG、PDF</span>
            </div>
          </div>
          <input
            ref="scanInputRef"
            type="file"
            accept="image/*,.pdf"
            style="display:none"
            @change="onScanFile"
          />
          <p v-if="scanUploading" class="hint">上傳中…</p>
        </div>

        <!-- ── 右：比對表格 ── -->
        <div class="id-diff-col">
          <h4>② 比對結果
            <span v-if="changedCount" class="diff-badge">{{ changedCount }} 項差異</span>
            <span v-else class="diff-ok">✓ 資料一致</span>
          </h4>

          <div class="diff-scroll">
            <table class="diff-table">
              <thead>
                <tr>
                  <th style="width:90px">欄位</th>
                  <th>傳出確定單時</th>
                  <th>目前系統</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in diffRows" :key="row.key" :class="{ 'row-changed': row.changed, 'row-same': !row.changed }">
                  <td class="df-label">{{ row.label }}</td>
                  <td class="df-old" :class="{ 'val-diff': row.changed }">{{ row.oldVal || '—' }}</td>
                  <td class="df-new" :class="{ 'val-diff': row.changed }">{{ row.newVal || '—' }}</td>
                </tr>
                <!-- 圖面版本比對 -->
                <tr :class="drawingChanged ? 'row-changed' : 'row-same'">
                  <td class="df-label">圖面</td>
                  <td class="df-old" :class="{ 'val-diff': drawingChanged }">
                    <span v-if="drawingCheckDone">
                      {{ drawingChanged ? '傳出時版本' : '—' }}
                    </span>
                    <span v-else class="checking">檢查中…</span>
                  </td>
                  <td class="df-new" :class="{ 'val-diff': drawingChanged }">
                    <span v-if="drawingCheckDone">
                      {{ drawingChanged ? '圖面已在傳確定單後修改' : '未變更' }}
                    </span>
                    <span v-else class="checking">檢查中…</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <p v-if="!props.snapshot" class="warn">⚠️ 尚無快照（未曾點「傳確定單」），仍可發單但無比對依據。</p>          <p v-if="drawingChanged" class="warn">⚠️ 圖面已在傳確定單後有修改，建議確認圖面版本は否與客戶確認。</p>        </div>

      </div><!-- /id-body -->

      <div class="id-footer">
        <button class="btn-secondary" @click="emit('close')" :disabled="issuing">取消</button>
        <button class="btn-primary" :disabled="issuing" @click="doIssue">
          {{ issuing ? '發單中…' : '✅ 確認發單' }}
        </button>
      </div>

    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from "vue";
import { uploadSignedScan, issueOrder, listOrderDrawings, getOrderCounter } from "../firebase";

const props = defineProps({
  orderId:        { type: String, required: true },
  snapshot:       { type: Object, default: null },   // pendingSignSnapshot
  drawingVersions: { type: Object, default: () => ({}) }, // pendingSignDrawingVersions
  current:        { type: Object, required: true },  // current toPayload() data
  suggestedOrderNo: { type: String, default: "" },
});
const emit = defineEmits(["close", "issued"]);

// ── 訂單號 ────────────────────────────────────────────────────────────
const counterLoaded  = ref(false);
const counterSeq     = ref(0);   // 目前計數器値
const autoGenOrderNo = ref("");   // 自動產生的號碼
const orderNoInput   = ref("");   // 用戶实際使用的欄位內容
const autoMode       = ref(true); // true=自動產生，false=手動

function buildAutoNo(seq) {
  const rawCode = String(props.current?.customerId || "").trim();
  const alpha3 = (rawCode.match(/[A-Za-z]+/) || [""])[0].slice(0, 3).toUpperCase();
  return `${String(seq + 1).padStart(3, "0")}${alpha3}`;
}

function onOrderNoInput(e) {
  orderNoInput.value = e.target.value;
  // 如果使用者修改了內容，自動切成手動模式
  autoMode.value = orderNoInput.value === autoGenOrderNo.value;
}

// ── 掃描檔 ──────────────────────────────────────────────────────────────────
const scanInputRef  = ref(null);
const scanFile      = ref(null);
const scanFileName  = ref("");
const scanPreviewUrl = ref("");
const scanIsImage   = ref(false);
const scanUploading = ref(false);

function loadScanFile(file) {
  if (!file) return;
  scanFile.value = file;
  scanFileName.value = file.name;
  scanIsImage.value = file.type.startsWith("image/");
  if (scanIsImage.value) {
    const reader = new FileReader();
    reader.onload = (e) => (scanPreviewUrl.value = e.target.result);
    reader.readAsDataURL(file);
  } else {
    scanPreviewUrl.value = "pdf";
  }
}
function onScanFile(e) { loadScanFile(e.target.files[0]); e.target.value = ""; }
function onScanDrop(e) {
  const file = e.dataTransfer.files[0];
  if (file) loadScanFile(file);
}
function onScanPaste(e) {
  for (const item of (e.clipboardData?.items || [])) {
    if (item.type.startsWith("image/")) { loadScanFile(item.getAsFile()); e.preventDefault(); return; }
  }
}
function onWindowPaste(e) { onScanPaste(e); }
function clearScan() { scanFile.value = null; scanFileName.value = ""; scanPreviewUrl.value = ""; }

// ── 圖面版本比對 ────────────────────────────────────────────────────────────
const drawingCheckDone = ref(false);
const drawingChanged   = ref(false);

onMounted(async () => {
  window.addEventListener("paste", onWindowPaste);
  // 載入訂單流水號計數器
  try {
    counterSeq.value = await getOrderCounter();
    autoGenOrderNo.value = buildAutoNo(counterSeq.value);
    if (props.suggestedOrderNo) {
      orderNoInput.value = props.suggestedOrderNo;
      autoMode.value = false;
    } else {
      orderNoInput.value = autoGenOrderNo.value;
    }
  } catch (e) {
    console.warn("訂單號載入失敗", e);
  } finally {
    counterLoaded.value = true;
  }
  // 比對圖面版本
  try {
    const drawings = await listOrderDrawings(props.orderId);
    const versions = props.drawingVersions || {};
    if (Object.keys(versions).length === 0) {
      // 傳確定單時沒有圖面，或舊資料沒有版本記錄 → 無法比對
      drawingChanged.value = false;
    } else {
      drawingChanged.value = drawings.some((d) => {
        const snapshotSec = versions[d.id] ?? null;
        if (snapshotSec === null) return true;  // 新增的圖面
        const currentSec = d.updatedAt ? (d.updatedAt.seconds ?? 0) : 0;
        return currentSec > snapshotSec;
      });
    }
  } catch (e) {
    console.warn("圖面版本比對失敗", e);
  } finally {
    drawingCheckDone.value = true;
  }
});
onUnmounted(() => window.removeEventListener("paste", onWindowPaste));

// ── 比對邏輯 ────────────────────────────────────────────────────────────────
const REAR_LABEL = { flush: "套平", drop16: "下降1.6cm", none: "平版(無套板)", other: "其他" };

function getVal(obj, path) {
  if (!obj) return undefined;
  return path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

function serializeStones(arr) {
  if (!Array.isArray(arr) || !arr.length) return "—";
  return arr.map((s) => [
    s.brand || "",
    s.color || "",
    s.modelCode || "",
    s.finish || "",
  ].filter(Boolean).join(" ")).join(" / ");
}
function serializeSinks(arr) {
  if (!Array.isArray(arr) || !arr.length) return "—";
  return arr.map((s, i) => {
    const name = [s.brand, s.model].filter(Boolean).join(" ") || `水槽${i + 1}`;
    return `${name} ${s.holeWidthMm || "?"}×${s.holeDepthMm || "?"}mm R${s.holeRadiusMm || 0} ${s.method || ""} ${s.bowlCount ? s.bowlCount + "槽" : ""}`.trim();
  }).join(" | ");
}
function serializeStoves(arr) {
  if (!Array.isArray(arr) || !arr.length) return "—";
  return arr.map((s, i) => {
    const name = [s.brand, s.model].filter(Boolean).join(" ") || `爐子${i + 1}`;
    return `${name} ${s.holeWidthMm || "?"}×${s.holeDepthMm || "?"}mm`;
  }).join(" | ");
}
function serializeArr(arr) {
  if (!Array.isArray(arr) || !arr.length) return "—";
  return arr.join("、");
}

const DIFF_FIELDS = [
  { key: "siteAddress",        label: "安裝地點",   fmt: (v) => v || "—" },
  { key: "promisedAt",         label: "預計交貨",   fmt: (v) => v ? String(v).slice(0, 10) : "—" },
  { key: "stones",             label: "石材",       fmt: serializeStones },
  { key: "countertop.type",    label: "台面型別",   fmt: (v) => v || "—" },
  { key: "countertop.totalCm", label: "台面長(cm)", fmt: (v) => v != null ? String(v) : "—" },
  { key: "rearTreatment",      label: "後緣處理",   fmt: (v) => REAR_LABEL[v] || v || "—" },
  { key: "specialMethods",     label: "特殊作法",   fmt: serializeArr },
  { key: "sinks",              label: "水槽",       fmt: serializeSinks },
  { key: "stoves",             label: "爐子",       fmt: serializeStoves },
  { key: "templatingDate",     label: "打板日",     fmt: (v) => v ? String(v).slice(0, 10) : "—" },
  { key: "templatingStaff",    label: "打板人員",   fmt: (v) => v || "—" },
  { key: "drawingStaff",       label: "對圖人員",   fmt: (v) => v || "—" },
  { key: "specialNotes",       label: "特殊備註",   fmt: (v) => v || "—" },
];

const diffRows = computed(() =>
  DIFF_FIELDS.map((f) => {
    const oldRaw = getVal(props.snapshot, f.key);
    const newRaw = getVal(props.current,  f.key);
    const oldVal = f.fmt(oldRaw);
    const newVal = f.fmt(newRaw);
    return { key: f.key, label: f.label, oldVal, newVal, changed: props.snapshot ? oldVal !== newVal : false };
  })
);

const changedCount = computed(() => {
  const formDiff = diffRows.value.filter((r) => r.changed).length;
  const drawDiff = drawingCheckDone.value && drawingChanged.value ? 1 : 0;
  return formDiff + drawDiff;
});

// ── 發單 ────────────────────────────────────────────────────────────────────
const issuing = ref(false);

async function doIssue() {
  const finalOrderNo = orderNoInput.value.trim();
  if (!finalOrderNo) {
    alert("請輸入訂單號碼");
    return;
  }
  issuing.value = true;
  try {
    let signedScanUrl = null;
    if (scanFile.value) {
      scanUploading.value = true;
      const result = await uploadSignedScan(props.orderId, scanFile.value);
      signedScanUrl = result.url;
      scanUploading.value = false;
    }
    const orderNo = await issueOrder(
      props.orderId,
      props.current,
      signedScanUrl,
      autoMode.value ? "" : finalOrderNo,  // 手動時傳入號碼
      autoMode.value,                       // 自動時 autoIncrement=true
    );
    emit("issued", orderNo);
  } catch (e) {
    console.error(e);
    alert("發單失敗：" + (e?.message || e));
  } finally {
    issuing.value = false;
  }
}
</script>

<style scoped>
.id-overlay {
  position: fixed; inset: 0;
  background: rgba(0,0,0,.55);
  display: flex; align-items: center; justify-content: center;
  z-index: 9000;
}
.id-modal {
  background: #1e293b;
  border-radius: 10px;
  width: min(95vw, 1000px);
  max-height: 90vh;
  display: flex; flex-direction: column;
  box-shadow: 0 8px 40px rgba(0,0,0,.6);
  color: #e2e8f0;
}
.id-header {
  display: flex; align-items: center; gap: 12px;
  padding: 14px 18px;
  border-bottom: 1px solid #334155;
  flex-wrap: wrap;
}
.id-orderno-hint {
  width: 100%;
  font-size: 12px;
  color: #fbbf24;
}
.id-header h3 { margin: 0; font-size: 1.1rem; font-weight: 700; flex-shrink: 0; }
.id-orderno-wrap {
  display: flex; align-items: center; gap: 6px;
  margin-left: auto; margin-right: 8px;
}
.id-orderno-lbl { font-size: .8rem; color: #94a3b8; white-space: nowrap; }
.id-orderno-input {
  background: #0f172a; border: 1px solid #475569; border-radius: 5px;
  color: #e2e8f0; padding: 4px 8px; font-size: .9rem; width: 160px;
}
.id-orderno-input:focus { outline: none; border-color: #60a5fa; }
.id-orderno-tag {
  font-size: .72rem; font-weight: 700; padding: 2px 7px;
  border-radius: 10px; white-space: nowrap;
}
.id-orderno-tag.auto { background: #0f4c2a; color: #34d399; }
.id-orderno-tag.manual { background: #7c2d12; color: #fb923c; }
.id-orderno-reset {
  background: none; border: none; color: #94a3b8; cursor: pointer;
  font-size: 1rem; padding: 2px 5px;
}
.id-orderno-reset:hover { color: #60a5fa; }
.id-close { background: none; border: none; color: #94a3b8; font-size: 1.1rem; cursor: pointer; padding: 4px; flex-shrink: 0; }

.id-body {
  display: flex; gap: 0; flex: 1; overflow: hidden; min-height: 0;
}

/* ── 掃描區 ── */
.id-scan-col {
  width: 280px; min-width: 200px;
  padding: 14px;
  border-right: 1px solid #334155;
  display: flex; flex-direction: column; gap: 10px;
}
.id-scan-col h4 { margin: 0; font-size: .9rem; color: #cbd5e1; }
.scan-drop {
  flex: 1;
  border: 2px dashed #475569;
  border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; position: relative; min-height: 200px;
  overflow: hidden;
  transition: border-color .2s;
}
.scan-drop:hover, .scan-drop:focus { border-color: #60a5fa; outline: none; }
.scan-drop.has-file { border-style: solid; border-color: #3b82f6; }
.scan-hint { display: flex; flex-direction: column; align-items: center; gap: 6px; color: #64748b; font-size: .82rem; text-align: center; }
.scan-sub { font-size: .75rem; color: #475569; }
.scan-img { max-width: 100%; max-height: 100%; object-fit: contain; }
.scan-pdf-icon { font-size: 2rem; text-align: center; color: #60a5fa; }
.scan-clear {
  position: absolute; top: 6px; right: 6px;
  background: rgba(0,0,0,.6); border: none; color: #fff;
  border-radius: 50%; width: 22px; height: 22px; cursor: pointer; font-size: .8rem;
}

/* ── 比對區 ── */
.id-diff-col {
  flex: 1; padding: 14px; display: flex; flex-direction: column; gap: 10px; overflow: hidden;
}
.id-diff-col h4 { margin: 0; font-size: .9rem; color: #cbd5e1; display: flex; align-items: center; gap: 8px; }
.diff-badge { background: #f59e0b; color: #1e293b; font-size: .75rem; font-weight: 700; padding: 2px 8px; border-radius: 10px; }
.diff-ok { color: #34d399; font-size: .8rem; }
.diff-scroll { flex: 1; overflow-y: auto; }
.diff-table { width: 100%; border-collapse: collapse; font-size: .82rem; }
.diff-table th { background: #0f172a; color: #94a3b8; padding: 6px 8px; text-align: left; position: sticky; top: 0; font-weight: 600; }
.diff-table td { padding: 5px 8px; border-bottom: 1px solid #1e293b; vertical-align: top; }
.df-label { color: #94a3b8; font-weight: 600; white-space: nowrap; }
.row-changed { background: rgba(245,158,11,.08); }
.val-diff { color: #fbbf24; }
.row-same .df-old, .row-same .df-new { color: #64748b; }
.warn { color: #f59e0b; font-size: .8rem; margin: 4px 0 0; }

/* ── Footer ── */
.id-footer {
  padding: 12px 18px;
  border-top: 1px solid #334155;
  display: flex; justify-content: flex-end; gap: 8px;
}
.btn-primary { background: #2563eb; color: #fff; border: none; padding: 8px 20px; border-radius: 6px; cursor: pointer; font-weight: 600; }
.btn-primary:disabled { opacity: .5; cursor: not-allowed; }
.btn-secondary { background: #334155; color: #cbd5e1; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; }
.hint { color: #94a3b8; font-size: .8rem; }
.checking { color: #64748b; font-style: italic; font-size: .8rem; }
</style>
