<template>
  <section class="page-card">
    <div class="page-head">
      <h1>選股工具</h1>
    </div>

    <div v-if="loading" class="muted-text">讀取中…</div>

    <div v-else>
      <!-- 新增 / 編輯表單 -->
      <div class="stock-form-wrap">
        <h2 class="section-title">{{ editingId ? "編輯股票" : "新增股票" }}</h2>
        <div class="field-row">
          <div class="field-item tight">
            <label>股票代號 <span class="req">*</span></label>
            <input
              v-model.trim="form.ticker"
              placeholder="例：2330"
              maxlength="10"
            />
          </div>
          <div class="field-item tight">
            <label>名稱</label>
            <input
              v-model.trim="form.name"
              placeholder="例：台積電"
              maxlength="40"
            />
          </div>
          <div class="field-item tight">
            <label>產業</label>
            <input
              v-model.trim="form.sector"
              placeholder="例：半導體"
              list="sector-options"
              maxlength="30"
            />
            <datalist id="sector-options">
              <option v-for="s in allSectors" :key="s" :value="s" />
            </datalist>
          </div>
          <div class="field-item tight">
            <label>狀態</label>
            <select v-model="form.status">
              <option v-for="st in statuses" :key="st" :value="st">
                {{ st }}
              </option>
            </select>
          </div>
        </div>
        <div class="field-row">
          <div class="field-item tight">
            <label>現價</label>
            <input
              type="number"
              v-model="form.price"
              placeholder="0.00"
              min="0"
              step="0.01"
            />
          </div>
          <div class="field-item tight">
            <label>本益比 (PE)</label>
            <input
              type="number"
              v-model="form.pe"
              placeholder="0.0"
              min="0"
              step="0.1"
            />
          </div>
          <div class="field-item tight">
            <label>股價淨值比 (PB)</label>
            <input
              type="number"
              v-model="form.pb"
              placeholder="0.0"
              min="0"
              step="0.1"
            />
          </div>
          <div class="field-item tight">
            <label>殖利率 (%)</label>
            <input
              type="number"
              v-model="form.dividendYield"
              placeholder="0.00"
              min="0"
              step="0.01"
            />
          </div>
        </div>
        <div class="field-row">
          <div class="field-item" style="flex: 1">
            <label>備註</label>
            <input
              v-model.trim="form.notes"
              placeholder="觀察重點、買賣理由…"
              maxlength="200"
            />
          </div>
        </div>
        <div class="toolbar-row" style="margin-top: 8px">
          <button class="btn-manage" :disabled="saving" @click="submitForm">
            {{ saving ? "儲存中…" : editingId ? "更新" : "新增" }}
          </button>
          <button v-if="editingId" class="btn-aux" @click="cancelEdit">
            取消
          </button>
          <span v-if="formError" class="error-text">{{ formError }}</span>
        </div>
      </div>

      <!-- 篩選列 -->
      <div class="toolbar-row" style="margin-top: 20px">
        <div class="field-item tight">
          <label>搜尋：</label>
          <input
            v-model.trim="filterKeyword"
            placeholder="代號 / 名稱"
            style="width: 130px"
          />
        </div>
        <div class="field-item tight">
          <label>狀態：</label>
          <select v-model="filterStatus">
            <option value="">全部</option>
            <option v-for="st in statuses" :key="st" :value="st">
              {{ st }}
            </option>
          </select>
        </div>
        <div class="field-item tight">
          <label>產業：</label>
          <select v-model="filterSector">
            <option value="">全部</option>
            <option v-for="s in allSectors" :key="s" :value="s">{{ s }}</option>
          </select>
        </div>
        <button class="btn-aux" @click="clearFilters">清除篩選</button>
        <span class="muted-text" style="margin-left: auto"
          >共 {{ filteredStocks.length }} 筆</span
        >
      </div>

      <!-- 資料表 -->
      <div
        v-if="filteredStocks.length === 0"
        class="muted-text"
        style="margin-top: 16px"
      >
        目前沒有符合條件的股票。
      </div>
      <div v-else class="table-wrap" style="margin-top: 12px">
        <table class="data-table stock-table">
          <thead>
            <tr>
              <th class="sortable" @click="toggleSort('ticker')">
                代號 <SortIcon field="ticker" :sort="sort" />
              </th>
              <th>名稱</th>
              <th class="secondary-col">產業</th>
              <th class="sortable num-col" @click="toggleSort('price')">
                現價 <SortIcon field="price" :sort="sort" />
              </th>
              <th class="sortable num-col" @click="toggleSort('pe')">
                PE <SortIcon field="pe" :sort="sort" />
              </th>
              <th
                class="sortable num-col secondary-col"
                @click="toggleSort('pb')"
              >
                PB <SortIcon field="pb" :sort="sort" />
              </th>
              <th class="sortable num-col" @click="toggleSort('dividendYield')">
                殖利率% <SortIcon field="dividendYield" :sort="sort" />
              </th>
              <th>狀態</th>
              <th class="secondary-col">備註</th>
              <th>動作</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="s in filteredStocks"
              :key="s.id"
              :class="statusClass(s.status)"
            >
              <td class="ticker-cell">{{ s.ticker }}</td>
              <td>{{ s.name || "—" }}</td>
              <td class="secondary-col">{{ s.sector || "—" }}</td>
              <td class="num-col">{{ fmt(s.price) }}</td>
              <td class="num-col">{{ fmt(s.pe) }}</td>
              <td class="num-col secondary-col">{{ fmt(s.pb) }}</td>
              <td class="num-col">{{ fmt(s.dividendYield, 2) }}</td>
              <td>
                <span :class="['status-badge', statusBadgeClass(s.status)]">{{
                  s.status
                }}</span>
              </td>
              <td class="secondary-col notes-cell">{{ s.notes || "" }}</td>
              <td class="action-cell">
                <button class="btn-aux btn-sm" @click="startEdit(s)">
                  編輯
                </button>
                <button
                  class="btn-danger btn-sm"
                  :disabled="deleting === s.id"
                  @click="confirmDelete(s)"
                >
                  {{ deleting === s.id ? "…" : "刪除" }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- AI 選股分析 ──────────────────────────────────────────── -->
      <div class="ai-screen-wrap">
        <h2 class="section-title" style="margin-top: 24px">🤖 AI 選股分析</h2>
        <p class="muted-text" style="font-size: 0.88rem; margin-bottom: 12px">
          自動檢測：多頭排列（MA5&gt;MA10&gt;MA20&gt;MA60）、低點爆大量（&gt;均量3×）、AI
          產業前景評分
        </p>

        <!-- ── 篩選條件勾選 ────────────────────────────────────── -->
        <div class="cond-panel">
          <span class="field-label" style="white-space: nowrap"
            >篩選條件：</span
          >
          <label
            v-for="c in SCREEN_CONDITIONS"
            :key="c.key"
            class="ai-check-label cond-item"
          >
            <input type="checkbox" v-model="screenConds" :value="c.key" />
            <span class="cond-tag">{{ c.icon }} {{ c.label }}</span>
            <span class="muted-text" style="font-size: 0.78rem">{{
              c.hint
            }}</span>
          </label>
        </div>

        <!-- 觀察名單快選 -->
        <div
          v-if="stocks.length"
          class="field-row"
          style="
            flex-wrap: wrap;
            gap: 6px 10px;
            align-items: flex-start;
            margin-bottom: 8px;
          "
        >
          <span class="field-label" style="min-width: 80px">觀察名單：</span>
          <label v-for="s in stocks" :key="s.id" class="ai-check-label">
            <input type="checkbox" :value="s.ticker" v-model="aiTickers" />
            {{ s.ticker }}{{ s.name ? ` ${s.name}` : "" }}
          </label>
        </div>

        <!-- 自動掃描 -->
        <div
          class="field-row"
          style="
            align-items: center;
            flex-wrap: wrap;
            gap: 8px;
            margin-bottom: 8px;
          "
        >
          <button class="btn-query" :disabled="aiLoading" @click="runAutoScan">
            {{
              aiLoading && autoScanning
                ? `掃描中… ${aiScanProgress}`
                : `🔍 一鍵掃描全台股`
            }}
          </button>
          <button
            class="btn-secondary"
            :disabled="updatingTwseList"
            style="font-size: 0.82rem; padding: 4px 10px"
            @click="doUpdateTwseList"
          >
            {{ updatingTwseList ? "更新中…" : "🔄 更新股票清單" }}
          </button>
          <span class="muted-text" style="font-size: 0.82rem">
            篩選條件：{{ screenCondLabels || "（未選）顯示全部" }}，共掃描
            {{ twseScanCount > 0 ? twseScanCount : PRESET_STOCKS.length }} 支
          </span>
        </div>

        <!-- 手動輸入 + 按鈕 -->
        <div
          class="field-row"
          style="
            align-items: center;
            flex-wrap: wrap;
            gap: 8px;
            margin-bottom: 8px;
          "
        >
          <input
            v-model.trim="aiManualTickers"
            class="form-field"
            placeholder="手動輸入代號（逗號分隔，如 2330,2454）"
            style="max-width: 320px; flex: 1"
          />
          <button
            class="btn-query"
            :disabled="aiLoading || aiAllTickers.length === 0"
            @click="runAIScreen"
          >
            {{
              aiLoading && !autoScanning
                ? "分析中…"
                : `執行 AI 分析（${aiAllTickers.length} 支）`
            }}
          </button>
          <button
            v-if="aiResults.length"
            class="btn-aux"
            @click="clearAIResults"
          >
            清除結果
          </button>
        </div>
        <div v-if="aiError" class="error-text" style="margin-bottom: 8px">
          {{ aiError }}
        </div>

        <!-- 分析結果 -->
        <div v-if="aiResults.length" class="ai-results-grid">
          <div
            v-for="r in aiResults"
            :key="r.ticker"
            class="ai-result-card"
            :class="passesScreenConds(r) ? 'ai-card-pass' : 'ai-card-other'"
          >
            <div class="ai-card-head">
              <span class="ai-ticker-label">{{ r.ticker }}</span>
              <span v-if="r.name" class="ai-name-label">{{ r.name }}</span>
              <span v-if="passesScreenConds(r)" class="ai-badge ai-badge-pass"
                >✅ 條件全符</span
              >
              <span
                v-else-if="r.techResult?.error"
                class="ai-badge ai-badge-warn"
                >⚠ 資料錯誤</span
              >
              <span v-else class="ai-badge ai-badge-fail">❌ 未符</span>
            </div>

            <!-- 技術面資料錯誤 -->
            <div v-if="r.techResult?.error" class="muted-text ai-tech-error">
              {{ r.techResult.error }}
            </div>

            <!-- 技術面結果 -->
            <div v-else class="ai-tech-row">
              <span :class="r.techResult.maAligned ? 'cond-ok' : 'cond-no'">
                {{ r.techResult.maAligned ? "✅" : "❌" }} 多頭排列
              </span>
              <span v-if="r.techResult.maAligned" class="cond-detail">
                {{ r.techResult.ma5 }} › {{ r.techResult.ma10 }} ›
                {{ r.techResult.ma20 }} › {{ r.techResult.ma60 }}
              </span>
              <span :class="r.techResult.volumeSpike ? 'cond-ok' : 'cond-no'">
                {{ r.techResult.volumeSpike ? "✅" : "❌" }} 低點爆大量
              </span>
              <span v-if="r.techResult.spikeDay" class="cond-detail">
                {{ r.techResult.spikeDay.date }}
                量 {{ fmtVol(r.techResult.spikeDay.volume) }}（均
                {{ fmtVol(r.techResult.avgVolume20) }}，×{{
                  r.techResult.spikeDay.ratio
                }}）
              </span>
              <span v-if="screenConds.includes('breakout60High')" :class="r.techResult.breakout60High ? 'cond-ok' : 'cond-no'">
                {{ r.techResult.breakout60High ? "✅" : "❌" }} 突破60日新高
              </span>
              <span v-if="screenConds.includes('breakout60High') && r.techResult.high60" class="cond-detail">
                現價 {{ r.techResult.latestClose }}／60日高 {{ r.techResult.high60 }}
              </span>
              <span v-if="screenConds.includes('volumeSurge')" :class="r.techResult.volumeSurge ? 'cond-ok' : 'cond-no'">
                {{ r.techResult.volumeSurge ? "✅" : "❌" }} 量能持續放大
              </span>
              <span v-if="screenConds.includes('volumeSurge') && r.techResult.avgVolume5" class="cond-detail">
                5日均量 {{ fmtVol(r.techResult.avgVolume5) }}／20日均量 {{ fmtVol(r.techResult.avgVolume20) }}
              </span>
              <span v-if="screenConds.includes('strongMomentum')" :class="r.techResult.strongMomentum ? 'cond-ok' : 'cond-no'">
                {{ r.techResult.strongMomentum ? "✅" : "❌" }} 強勢動能
              </span>
              <span v-if="screenConds.includes('strongMomentum') && r.techResult.momentum20Pct != null" class="cond-detail">
                近20日漲幅 {{ r.techResult.momentum20Pct }}%
              </span>
            </div>

            <!-- AI 分析文字 -->
            <pre
              v-if="screenConds.includes('showAI') && r.aiResult?.analysis"
              class="ai-analysis"
              >{{ r.aiResult.analysis }}</pre
            >
            <div
              v-if="
                screenConds.includes('showAI') &&
                r.aiResult?.error &&
                r.aiResult?.analysis
              "
              class="muted-text ai-tech-error"
              style="font-size: 0.78em; color: #c00; margin-top: 2px"
            >
              錯誤：{{ r.aiResult.error }}
            </div>
            <div
              v-else-if="
                screenConds.includes('showAI') &&
                r.aiResult?.error &&
                !r.aiResult?.analysis
              "
              class="muted-text ai-tech-error"
            >
              {{ r.aiResult.error }}
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { ref, computed, onMounted } from "vue";
import {
  fetchStocks,
  addStock,
  updateStock,
  deleteStock,
  STOCK_STATUSES,
  screenStocksWithAI,
  fetchTwseStockListFromFirestore,
  triggerUpdateTwseStockList,
} from "../firebase";

// ── sort icon component (inline) ─────────────────────────────────────────────
const SortIcon = {
  props: ["field", "sort"],
  template: `<span class="sort-icon">{{ sort.field === field ? (sort.asc ? "▲" : "▼") : "⇅" }}</span>`,
};

// ── state ─────────────────────────────────────────────────────────────────────
const stocks = ref([]);
const loading = ref(true);
const saving = ref(false);
const deleting = ref(null);
const editingId = ref(null);
const formError = ref("");

const statuses = STOCK_STATUSES;

const emptyForm = () => ({
  ticker: "",
  name: "",
  sector: "",
  status: "觀察中",
  price: "",
  pe: "",
  pb: "",
  dividendYield: "",
  notes: "",
});

const form = ref(emptyForm());

// ── filters ───────────────────────────────────────────────────────────────────
const filterKeyword = ref("");
const filterStatus = ref("");
const filterSector = ref("");

// ── sort ──────────────────────────────────────────────────────────────────────
const sort = ref({ field: "ticker", asc: true });

function toggleSort(field) {
  if (sort.value.field === field) {
    sort.value.asc = !sort.value.asc;
  } else {
    sort.value.field = field;
    sort.value.asc = true;
  }
}

// ── computed ──────────────────────────────────────────────────────────────────
const allSectors = computed(() => {
  const set = new Set(stocks.value.map((s) => s.sector).filter(Boolean));
  return [...set].sort((a, b) => a.localeCompare(b, "zh-Hant"));
});

const filteredStocks = computed(() => {
  let list = stocks.value;
  const kw = filterKeyword.value.toLowerCase();
  if (kw) {
    list = list.filter(
      (s) =>
        s.ticker.toLowerCase().includes(kw) ||
        (s.name || "").toLowerCase().includes(kw),
    );
  }
  if (filterStatus.value) {
    list = list.filter((s) => s.status === filterStatus.value);
  }
  if (filterSector.value) {
    list = list.filter((s) => s.sector === filterSector.value);
  }

  const { field, asc } = sort.value;
  list = [...list].sort((a, b) => {
    let va = a[field];
    let vb = b[field];
    if (va == null) va = asc ? Infinity : -Infinity;
    if (vb == null) vb = asc ? Infinity : -Infinity;
    if (typeof va === "string")
      return asc
        ? va.localeCompare(vb, "zh-Hant")
        : vb.localeCompare(va, "zh-Hant");
    return asc ? va - vb : vb - va;
  });

  return list;
});

// ── helpers ───────────────────────────────────────────────────────────────────
function fmt(val, decimals = 2) {
  if (val == null || val === "") return "—";
  return Number(val).toFixed(decimals);
}

function statusClass(status) {
  if (status === "已買入") return "row-bought";
  if (status === "已賣出") return "row-sold";
  return "";
}

function statusBadgeClass(status) {
  if (status === "已買入") return "badge-bought";
  if (status === "已賣出") return "badge-sold";
  return "badge-watch";
}

function clearFilters() {
  filterKeyword.value = "";
  filterStatus.value = "";
  filterSector.value = "";
}

// ── CRUD ──────────────────────────────────────────────────────────────────────
async function loadStocks() {
  loading.value = true;
  try {
    stocks.value = await fetchStocks();
  } finally {
    loading.value = false;
  }
}

async function submitForm() {
  formError.value = "";
  if (!form.value.ticker) {
    formError.value = "請輸入股票代號";
    return;
  }
  saving.value = true;
  try {
    if (editingId.value) {
      await updateStock(editingId.value, form.value);
    } else {
      await addStock(form.value);
    }
    form.value = emptyForm();
    editingId.value = null;
    await loadStocks();
  } catch (e) {
    formError.value = e.message || "儲存失敗";
  } finally {
    saving.value = false;
  }
}

function startEdit(stock) {
  editingId.value = stock.id;
  form.value = {
    ticker: stock.ticker || "",
    name: stock.name || "",
    sector: stock.sector || "",
    status: stock.status || "觀察中",
    price: stock.price != null ? stock.price : "",
    pe: stock.pe != null ? stock.pe : "",
    pb: stock.pb != null ? stock.pb : "",
    dividendYield: stock.dividendYield != null ? stock.dividendYield : "",
    notes: stock.notes || "",
  };
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function cancelEdit() {
  editingId.value = null;
  form.value = emptyForm();
  formError.value = "";
}

async function confirmDelete(stock) {
  if (!confirm(`確定要刪除「${stock.ticker} ${stock.name || ""}」嗎？`)) return;
  deleting.value = stock.id;
  try {
    await deleteStock(stock.id);
    stocks.value = stocks.value.filter((s) => s.id !== stock.id);
  } catch (e) {
    alert("刪除失敗：" + (e.message || "未知錯誤"));
  } finally {
    deleting.value = null;
  }
}

onMounted(loadStocks);

// ── 熱門台股預設清單（用於自動掃描）──────────────────────────────────────────
const PRESET_STOCKS = [
  { ticker: "2330", name: "台積電", sector: "半導體" },
  { ticker: "2454", name: "聯發科", sector: "半導體" },
  { ticker: "2303", name: "聯電", sector: "半導體" },
  { ticker: "3034", name: "聯詠", sector: "半導體" },
  { ticker: "2379", name: "瑞昱", sector: "半導體" },
  { ticker: "2344", name: "華邦電", sector: "半導體" },
  { ticker: "3711", name: "日月光投控", sector: "半導體封測" },
  { ticker: "2308", name: "台達電", sector: "電子零組件" },
  { ticker: "2317", name: "鴻海", sector: "電子製造" },
  { ticker: "2382", name: "廣達", sector: "電子製造" },
  { ticker: "2357", name: "華碩", sector: "電腦硬體" },
  { ticker: "2376", name: "技嘉", sector: "電腦硬體" },
  { ticker: "2353", name: "宏碁", sector: "電腦硬體" },
  { ticker: "3008", name: "大立光", sector: "光學元件" },
  { ticker: "2395", name: "研華", sector: "工業電腦" },
  { ticker: "6770", name: "力積電", sector: "半導體" },
  { ticker: "2408", name: "南亞科", sector: "記憶體" },
  { ticker: "2301", name: "光寶科", sector: "電子零組件" },
  { ticker: "2882", name: "國泰金", sector: "金融" },
  { ticker: "2886", name: "兆豐金", sector: "金融" },
  { ticker: "2891", name: "中信金", sector: "金融" },
  { ticker: "2884", name: "玉山金", sector: "金融" },
  { ticker: "2892", name: "第一金", sector: "金融" },
  { ticker: "1301", name: "台塑", sector: "塑化" },
  { ticker: "1303", name: "南亞", sector: "塑化" },
  { ticker: "2002", name: "中鋼", sector: "鋼鐵" },
  { ticker: "2207", name: "和泰車", sector: "汽車" },
  { ticker: "2912", name: "統一超", sector: "零售" },
  { ticker: "9910", name: "豐泰", sector: "運動用品" },
  { ticker: "6505", name: "台塑化", sector: "石油化工" },
  { ticker: "2412", name: "中華電", sector: "電信" },
  { ticker: "3045", name: "台灣大", sector: "電信" },
  { ticker: "4904", name: "遠傳", sector: "電信" },
  { ticker: "2609", name: "陽明", sector: "航運" },
  { ticker: "2615", name: "萬海", sector: "航運" },
  { ticker: "2603", name: "長榮", sector: "航運" },
  { ticker: "2618", name: "長榮航", sector: "航空" },
  { ticker: "2474", name: "可成", sector: "機殼" },
  { ticker: "2345", name: "智邦", sector: "通信網路" },
  { ticker: "6669", name: "緯穎", sector: "伺服器" },
];

// ── 篩選條件定義表（單一真相來源）──────────────────────────────────────────────
// 新增條件只需在此加一筆並在 Cloud Function techResult 回傳對應欄位。例：
//   { key: "rsiOversold", label: "RSI 超賣", icon: "🟦", hint: "RSI<30",
//     check: (t) => t.rsiOversold === true }
const SCREEN_CONDITIONS = [
  {
    key: "maAligned",
    label: "多頭排列",
    icon: "📊",
    hint: "MA5>MA10>MA20>MA60",
    check: (t) => t?.maAligned === true,
  },
  {
    key: "volumeSpike",
    label: "低點爆大量",
    icon: "🔥",
    hint: "近20日低點，量>均量×3",
    check: (t) => t?.volumeSpike === true,
  },
  {
    key: "breakout60High",
    label: "突破60日新高",
    icon: "🚀",
    hint: "收盤價≥近60日最高價",
    check: (t) => t?.breakout60High === true,
  },
  {
    key: "volumeSurge",
    label: "量能持續放大",
    icon: "📈",
    hint: "近5日均量>20日均量×1.5",
    check: (t) => t?.volumeSurge === true,
  },
  {
    key: "strongMomentum",
    label: "強勢動能",
    icon: "⚡",
    hint: "近20日漲幅>10%",
    check: (t) => t?.strongMomentum === true,
  },
  {
    key: "showAI",
    label: "AI 產業分析",
    icon: "🤖",
    hint: "Gemini 前景評分",
    isMeta: true,
  },
];

// ── AI 選股 state ──────────────────────────────────────────────────────────────
const aiTickers = ref([]); // checkboxes (from watchlist)
const aiManualTickers = ref(""); // free-text input
const aiLoading = ref(false);
const aiResults = ref([]);
const aiError = ref("");
const autoScanning = ref(false);
const aiScanProgress = ref("");

// 預設選取全部條件
const screenConds = ref(SCREEN_CONDITIONS.map((c) => c.key));

// 選中的過濾條件中文名稱（排除 isMeta）
const screenCondLabels = computed(() =>
  SCREEN_CONDITIONS.filter(
    (c) => !c.isMeta && screenConds.value.includes(c.key),
  )
    .map((c) => c.label)
    .join(" + "),
);

/** 依選中條件判斷某支結果是否通過（isMeta 條件不參與過濾） */
function passesScreenConds(r) {
  if (!r.techResult || r.techResult.error) return false;
  return SCREEN_CONDITIONS.filter(
    (c) => !c.isMeta && screenConds.value.includes(c.key),
  ).every((c) => c.check(r.techResult));
}

// deduplicated tickers from both sources
const aiAllTickers = computed(() => {
  const checked = aiTickers.value.map((t) => t.toUpperCase());
  const manual = aiManualTickers.value
    .split(",")
    .map((t) => t.trim().toUpperCase())
    .filter(Boolean);
  return [...new Set([...checked, ...manual])].slice(0, 50);
});

async function runAIScreen() {
  const tickerList = aiAllTickers.value;
  if (!tickerList.length) return;
  aiLoading.value = true;
  autoScanning.value = false;
  aiError.value = "";
  aiResults.value = [];
  const stockMap = Object.fromEntries(
    stocks.value.map((s) => [s.ticker.toUpperCase(), s]),
  );
  const payload = tickerList.map((t) => {
    const s = stockMap[t];
    return { ticker: t, name: s?.name || "", sector: s?.sector || "" };
  });
  const skipAI = !screenConds.value.includes("showAI");
  try {
    aiResults.value = await screenStocksWithAI(payload, {
      skipAI,
      conditions: screenConds.value,
    });
  } catch (e) {
    aiError.value = "分析失敗：" + (e.message || "未知錯誤");
  } finally {
    aiLoading.value = false;
  }
}

const twseScanCount = ref(0);
const updatingTwseList = ref(false);

async function doUpdateTwseList() {
  updatingTwseList.value = true;
  try {
    await triggerUpdateTwseStockList();
    aiError.value = "";
    alert("股票清單更新完成！");
  } catch (e) {
    aiError.value = "更新失敗：" + (e.message || "未知錯誤");
  } finally {
    updatingTwseList.value = false;
  }
}

// 自動掃描：動態從 TWSE 取清單，分批掃技術面，全部通過的依序顯示；再對通過者補 AI
async function runAutoScan() {
  aiLoading.value = true;
  autoScanning.value = true;
  aiError.value = "";
  aiResults.value = [];
  const BATCH = 20;
  const AI_BATCH = 5; // AI 分析每批上限，避免單次 timeout
  const wantAI = screenConds.value.includes("showAI");
  const passing = [];
  try {
    // 從 Firestore 讀取每日更新的 TWSE 全股清單
    aiScanProgress.value = "從 Firestore 取得股票清單…";
    let scanList = PRESET_STOCKS;
    try {
      const firestoreStocks = await fetchTwseStockListFromFirestore(1000);
      if (firestoreStocks.length > 0) {
        scanList = firestoreStocks;
        twseScanCount.value = firestoreStocks.length;
      }
    } catch (_) {
      // 取得失敗，fallback 到 PRESET_STOCKS
    }
    // 階段一：掃全部，每批結果即時呈現給使用者
    for (let i = 0; i < scanList.length; i += BATCH) {
      const batch = scanList.slice(i, i + BATCH);
      aiScanProgress.value = `技術面掃描 ${i + 1}–${Math.min(i + BATCH, scanList.length)} / ${scanList.length}（已符合 ${passing.length} 支）`;
      const results = await screenStocksWithAI(batch, {
        skipAI: true,
        conditions: screenConds.value,
      });
      const newPassing = results.filter((r) => passesScreenConds(r));
      passing.push(...newPassing);
      // 即時更新畫面，使用者不用等掃完才看到結果
      if (newPassing.length > 0) {
        aiResults.value = [...passing];
      }
    }
    // 階段二：若有勾選 AI 分析，對所有通過的股票分批補 AI
    if (wantAI && passing.length > 0) {
      for (let i = 0; i < passing.length; i += AI_BATCH) {
        const aiBatch = passing.slice(i, i + AI_BATCH);
        aiScanProgress.value = `AI 分析中 ${i + 1}–${Math.min(i + AI_BATCH, passing.length)} / ${passing.length} 支…`;
        const aiResults2 = await screenStocksWithAI(
          aiBatch.map((r) => ({
            ticker: r.ticker,
            name: r.name,
            sector: r.sector,
          })),
          { skipAI: false, conditions: screenConds.value },
        );
        const aiMap = Object.fromEntries(
          aiResults2.map((r) => [r.ticker, r.aiResult]),
        );
        aiBatch.forEach((r) => {
          if (aiMap[r.ticker]) r.aiResult = aiMap[r.ticker];
        });
        // 每批 AI 完成後重新觸發畫面更新
        aiResults.value = [...passing];
      }
    }
    if (aiResults.value.length === 0) {
      const condStr = screenCondLabels.value || "所選";
      aiError.value = `目前沒有股票符合「${condStr}」條件。`;
    }
  } catch (e) {
    aiError.value = "掃描失敗：" + (e.message || "未知錯誤");
  } finally {
    aiLoading.value = false;
    autoScanning.value = false;
    aiScanProgress.value = "";
  }
}

function clearAIResults() {
  aiResults.value = [];
  aiError.value = "";
}

function fmtVol(n) {
  if (n == null) return "—";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(0) + "K";
  return String(n);
}
</script>

<style scoped>
.stock-form-wrap {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 16px 20px;
  margin-bottom: 4px;
}

.section-title {
  font-size: 1rem;
  font-weight: 600;
  margin: 0 0 12px;
  color: #374151;
}

.req {
  color: #ef4444;
}

.stock-table th.sortable {
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
}
.stock-table th.sortable:hover {
  background: #f0f4ff;
}

.sort-icon {
  font-size: 0.75rem;
  margin-left: 3px;
  color: #9ca3af;
}

.num-col {
  text-align: right;
}

.ticker-cell {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
}

.notes-cell {
  max-width: 200px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 0.88rem;
  color: #6b7280;
}

.action-cell {
  white-space: nowrap;
  display: flex;
  gap: 6px;
}

.btn-sm {
  padding: 0.3rem 0.65rem;
  font-size: 0.85rem;
}

.btn-danger {
  background-color: #fff;
  border-color: #fca5a5;
  color: #dc2626;
}
.btn-danger:hover:not(:disabled) {
  background-color: #fef2f2;
  border-color: #ef4444;
}

.error-text {
  color: #dc2626;
  font-size: 0.9rem;
}

/* row tints */
.row-bought td {
  background: #f0fdf4;
}
.row-sold td {
  background: #f9fafb;
  color: #9ca3af;
}

/* status badges */
.status-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 0.82rem;
  font-weight: 500;
}
.badge-watch {
  background: #fef9c3;
  color: #92400e;
}
.badge-bought {
  background: #dcfce7;
  color: #166534;
}
.badge-sold {
  background: #f1f5f9;
  color: #64748b;
}

/* ── AI 選股分析 panel ────────────────────────────────────────── */
.ai-screen-wrap {
  padding-top: 20px;
  border-top: 1px solid #e5e7eb;
}
.ai-check-label {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 0.86rem;
  cursor: pointer;
  white-space: nowrap;
}
.ai-results-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: 14px;
  margin-top: 16px;
}
.ai-result-card {
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 14px 16px;
  background: #fff;
}
.ai-card-pass {
  border-left: 4px solid #22c55e;
}
.ai-card-other {
  border-left: 4px solid #cbd5e1;
}
.ai-card-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  flex-wrap: wrap;
}
.ai-ticker-label {
  font-weight: 700;
  font-size: 1rem;
  color: #1e40af;
}
.ai-name-label {
  font-size: 0.86rem;
  color: #6b7280;
}
.ai-badge {
  margin-left: auto;
  padding: 2px 9px;
  border-radius: 12px;
  font-size: 0.8rem;
  font-weight: 600;
}
.ai-badge-pass {
  background: #dcfce7;
  color: #166534;
}
.ai-badge-fail {
  background: #fee2e2;
  color: #991b1b;
}
.ai-badge-warn {
  background: #fef9c3;
  color: #92400e;
}
.ai-tech-row {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 14px;
  font-size: 0.84rem;
  margin-bottom: 10px;
}
.cond-ok {
  color: #166534;
  font-weight: 500;
}
.cond-no {
  color: #9ca3af;
}
.cond-detail {
  color: #6b7280;
  font-size: 0.8rem;
}
.ai-tech-error {
  font-size: 0.82rem;
  margin-bottom: 8px;
}
.ai-analysis {
  font-size: 0.84rem;
  line-height: 1.65;
  color: #374151;
  white-space: pre-wrap;
  word-break: break-word;
  margin: 0;
  padding: 8px 10px;
  background: #f8fafc;
  border-radius: 6px;
  border: 1px solid #f1f5f9;
  font-family: inherit;
}
/* ── 條件勾選區（新增條件只需在 SCREEN_CONDITIONS 加一筆）── */
.cond-panel {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 20px;
  padding: 10px 14px;
  background: #f8fafc;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  margin-bottom: 12px;
}
.cond-item {
  gap: 5px;
  cursor: pointer;
}
.cond-tag {
  font-size: 0.86rem;
  font-weight: 500;
  color: #1e3a5f;
}
</style>
