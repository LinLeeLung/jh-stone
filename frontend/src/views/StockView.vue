<template>
  <section class="page-card">
    <div class="page-head">
      <h1>選股工具</h1>
    </div>

    <div>
      <!-- AI 選股分析 ──────────────────────────────────────────── -->
      <div class="ai-screen-wrap">
        <h2 class="section-title" style="margin-top: 24px">🤖 AI 選股分析</h2>
        <p class="muted-text" style="font-size: 0.88rem; margin-bottom: 12px">
          自動檢測：多頭排列（MA5&gt;MA10&gt;MA20&gt;MA60）、AI 產業前景評分
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

        <!-- 大盤警示 -->
        <div
          v-if="marketFilter && !marketFilter.bullish"
          class="market-warning-banner"
        >
          ⚠️ {{ marketFilter.warning }}
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
              <span
                v-if="screenConds.includes('breakout60High')"
                :class="r.techResult.breakout60High ? 'cond-ok' : 'cond-no'"
              >
                {{ r.techResult.breakout60High ? "✅" : "❌" }} 突破60日新高
              </span>
              <span
                v-if="
                  screenConds.includes('breakout60High') && r.techResult.high60
                "
                class="cond-detail"
              >
                現價 {{ r.techResult.latestClose }}／60日高
                {{ r.techResult.high60 }}
              </span>
              <span
                v-if="screenConds.includes('volumeSurge')"
                :class="r.techResult.volumeSurge ? 'cond-ok' : 'cond-no'"
              >
                {{ r.techResult.volumeSurge ? "✅" : "❌" }} 量能持續放大
              </span>
              <span
                v-if="
                  screenConds.includes('volumeSurge') && r.techResult.avgVolume5
                "
                class="cond-detail"
              >
                5日均量 {{ fmtVol(r.techResult.avgVolume5) }}／20日均量
                {{ fmtVol(r.techResult.avgVolume20) }}
              </span>
              <span
                v-if="screenConds.includes('strongMomentum')"
                :class="r.techResult.strongMomentum ? 'cond-ok' : 'cond-no'"
              >
                {{ r.techResult.strongMomentum ? "✅" : "❌" }} 強勢動能
              </span>
              <span
                v-if="
                  screenConds.includes('strongMomentum') &&
                  r.techResult.momentum20Pct != null
                "
                class="cond-detail"
              >
                近20日漲幅 {{ r.techResult.momentum20Pct }}%
              </span>
              <span
                v-if="screenConds.includes('weeklyMaAligned')"
                :class="r.techResult.weeklyMaAligned ? 'cond-ok' : 'cond-no'"
              >
                {{ r.techResult.weeklyMaAligned ? "✅" : "❌" }} 週線多頭
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

            <!-- 記錄選股 -->
            <div class="ai-pick-row">
              <button
                v-if="pickingCardTicker !== r.ticker"
                class="btn-aux btn-sm pick-btn"
                @click="openPickForm(r)"
              >
                📌 記錄選股
              </button>
              <div v-else class="pick-inline-form">
                <div
                  class="field-row"
                  style="
                    gap: 6px;
                    flex-wrap: wrap;
                    align-items: flex-end;
                    margin: 0;
                  "
                >
                  <div class="field-item tight">
                    <label style="font-size: 0.82rem">選入價</label>
                    <input
                      type="number"
                      v-model="pickForm.price"
                      style="width: 86px"
                      min="0"
                      step="0.01"
                    />
                  </div>
                  <div class="field-item" style="flex: 1; min-width: 100px">
                    <label style="font-size: 0.82rem">備註</label>
                    <input
                      v-model="pickForm.note"
                      placeholder="選股理由…"
                      maxlength="100"
                    />
                  </div>
                  <button
                    class="btn-manage btn-sm"
                    :disabled="pickSaving"
                    @click="confirmPick(r)"
                  >
                    {{ pickSaving ? "儲存中…" : "確認" }}
                  </button>
                  <button class="btn-aux btn-sm" @click="cancelPick">
                    取消
                  </button>
                </div>
                <div
                  v-if="pickFormError"
                  class="error-text"
                  style="font-size: 0.82rem; margin-top: 4px"
                >
                  {{ pickFormError }}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 選股回溯 ─────────────────────────────────────────────── -->
      <div class="picks-wrap">
        <div class="picks-header">
          <h2 class="section-title" style="margin: 0">📋 選股回溯</h2>
          <span class="muted-text" style="font-size: 0.85rem">
            共 {{ stockPicks.length }} 筆・一週後回溯買進是否獲利
          </span>
          <button
            class="btn-query"
            :disabled="fetchingCurrentPrices || !stockPicks.length"
            @click="refreshCurrentPrices"
          >
            {{ fetchingCurrentPrices ? "取得現價中…" : "🔄 刷新現價" }}
          </button>
        </div>

        <div v-if="picksLoading" class="muted-text" style="margin-top: 12px">
          載入中…
        </div>
        <div
          v-else-if="!stockPicks.length"
          class="muted-text"
          style="margin-top: 12px"
        >
          尚無選股記錄。在上方 AI 分析結果按「📌 記錄選股」即可加入。
        </div>
        <div v-else class="table-wrap" style="margin-top: 12px">
          <table class="data-table picks-table">
            <thead>
              <tr>
                <th>代號</th>
                <th>名稱</th>
                <th>選入日期</th>
                <th class="num-col">選入價</th>
                <th class="num-col">現價</th>
                <th class="num-col">漲跌幅</th>
                <th class="secondary-col">備註</th>
                <th>動作</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="pick in stockPicks"
                :key="pick.id"
                :class="pickRowClass(pick)"
              >
                <td class="ticker-cell">{{ pick.ticker }}</td>
                <td>{{ pick.name || "—" }}</td>
                <td style="white-space: nowrap">
                  {{ fmtPickDate(pick.pickedAt) }}
                  <span
                    v-if="isWeekOld(pick)"
                    class="week-badge"
                    title="已超過一週，可回溯"
                    >7天+</span
                  >
                </td>
                <td class="num-col">
                  {{
                    pick.pickedPrice != null ? pick.pickedPrice.toFixed(2) : "—"
                  }}
                </td>
                <td class="num-col">
                  <span v-if="pickCurrentPrices[pick.ticker] != null">
                    {{ Number(pickCurrentPrices[pick.ticker]).toFixed(2) }}
                  </span>
                  <span v-else class="muted-text">—</span>
                </td>
                <td class="num-col">
                  <span
                    v-if="pickPnlPct(pick) != null"
                    :class="
                      Number(pickPnlPct(pick)) >= 0 ? 'pnl-up' : 'pnl-down'
                    "
                  >
                    {{ Number(pickPnlPct(pick)) >= 0 ? "+" : ""
                    }}{{ pickPnlPct(pick) }}%
                  </span>
                  <span v-else class="muted-text">—</span>
                </td>
                <td class="secondary-col notes-cell">
                  {{ pick.note || "" }}
                </td>
                <td class="action-cell">
                  <button
                    class="btn-danger btn-sm"
                    :disabled="picksDeletingId === pick.id"
                    @click="deletePickEntry(pick)"
                  >
                    {{ picksDeletingId === pick.id ? "…" : "刪除" }}
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { ref, computed, onMounted } from "vue";
import {
  fetchStocks,
  screenStocksWithAI,
  fetchTwseStockListFromFirestore,
  triggerUpdateTwseStockList,
  addStockPick,
  fetchStockPicks,
  deleteStockPick,
} from "../firebase";

// ── state ─────────────────────────────────────────────────────────────────────
const stocks = ref([]);

async function loadStocks() {
  try {
    stocks.value = await fetchStocks();
  } catch (_) {}
}

onMounted(() => {
  loadStocks();
  loadStockPicks();
});

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
    key: "weeklyMaAligned",
    label: "週線多頭",
    icon: "📅",
    hint: "週MA5>MA10>MA20",
    check: (t) => t?.weeklyMaAligned === true,
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
const marketFilter = ref(null);
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
    const { results, marketFilter: mf } = await screenStocksWithAI(payload, {
      skipAI,
      conditions: screenConds.value,
    });
    aiResults.value = results;
    marketFilter.value = mf;
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
  marketFilter.value = null;
  const BATCH = 20;
  const AI_BATCH = 5; // AI 分析每批上限，避免單次 timeout
  const wantAI = screenConds.value.includes("showAI");
  const passing = [];
  try {
    // 從 Firestore 讀取每日更新的 TWSE 全股清單
    aiScanProgress.value = "從 Firestore 取得股票清單…";
    let scanList = PRESET_STOCKS;
    try {
      const firestoreStocks = await fetchTwseStockListFromFirestore(2000);
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
      const { results, marketFilter: mf } = await screenStocksWithAI(batch, {
        skipAI: true,
        conditions: screenConds.value,
      });
      if (mf && marketFilter.value === null) marketFilter.value = mf;
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
        const { results: aiResults2 } = await screenStocksWithAI(
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
  marketFilter.value = null;
}

// ── 選股記錄 state ────────────────────────────────────────────────────────────
const stockPicks = ref([]);
const picksLoading = ref(false);
const picksDeletingId = ref(null);
const pickCurrentPrices = ref({}); // ticker -> latestClose
const fetchingCurrentPrices = ref(false);
const pickingCardTicker = ref("");
const pickForm = ref({ price: "", note: "" });
const pickSaving = ref(false);
const pickFormError = ref("");

function fmtVol(n) {
  if (n == null) return "—";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(0) + "K";
  return String(n);
}

// ── 選股記錄 methods ──────────────────────────────────────────────────────────
async function loadStockPicks() {
  picksLoading.value = true;
  try {
    stockPicks.value = await fetchStockPicks();
  } catch (e) {
    console.error("載入選股記錄失敗:", e);
  } finally {
    picksLoading.value = false;
  }
}

function openPickForm(r) {
  pickingCardTicker.value = r.ticker;
  pickForm.value = {
    price: r.techResult?.latestClose ?? "",
    note: "",
  };
  pickFormError.value = "";
}

function cancelPick() {
  pickingCardTicker.value = "";
  pickFormError.value = "";
}

async function confirmPick(r) {
  pickFormError.value = "";
  pickSaving.value = true;
  // fallback: look up name/sector from watchlist or preset list when scan result has none
  const resolvedTicker = String(r.ticker || "").toUpperCase();
  let resolvedName = r.name || "";
  let resolvedSector = r.sector || "";
  if (!resolvedName) {
    const wl = stocks.value.find((s) => s.ticker === resolvedTicker);
    const ps = PRESET_STOCKS.find((p) => p.ticker === resolvedTicker);
    resolvedName = wl?.name || ps?.name || "";
    if (!resolvedSector) resolvedSector = wl?.sector || ps?.sector || "";
  }
  try {
    await addStockPick({
      ticker: resolvedTicker,
      name: resolvedName,
      sector: resolvedSector,
      market: String(r.market || "twse"),
      pickedPrice:
        pickForm.value.price !== "" ? Number(pickForm.value.price) : null,
      note: pickForm.value.note,
    });
    pickingCardTicker.value = "";
    await loadStockPicks();
  } catch (e) {
    pickFormError.value = e.message || "儲存失敗";
  } finally {
    pickSaving.value = false;
  }
}

async function deletePickEntry(pick) {
  if (!confirm(`確定刪除 ${pick.ticker} 的選股記錄？`)) return;
  picksDeletingId.value = pick.id;
  try {
    await deleteStockPick(pick.id);
    stockPicks.value = stockPicks.value.filter((p) => p.id !== pick.id);
  } catch (e) {
    alert("刪除失敗：" + (e.message || ""));
  } finally {
    picksDeletingId.value = null;
  }
}

async function refreshCurrentPrices() {
  if (!stockPicks.value.length) return;
  fetchingCurrentPrices.value = true;
  try {
    const tickers = [...new Set(stockPicks.value.map((p) => p.ticker))];
    const payload = tickers.map((t) => {
      const p = stockPicks.value.find((q) => q.ticker === t);
      return {
        ticker: t,
        name: p?.name || "",
        sector: p?.sector || "",
        market: p?.market || "twse",
      };
    });
    const { results } = await screenStocksWithAI(payload, {
      skipAI: true,
      conditions: [],
    });
    const map = {};
    results.forEach((r) => {
      if (r.techResult?.latestClose != null) {
        map[r.ticker] = r.techResult.latestClose;
      }
    });
    pickCurrentPrices.value = map;
  } catch (e) {
    alert("取得現價失敗：" + (e.message || ""));
  } finally {
    fetchingCurrentPrices.value = false;
  }
}

function fmtPickDate(ts) {
  if (!ts) return "—";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function pickPnlPct(pick) {
  const current = pickCurrentPrices.value[pick.ticker];
  if (current == null || pick.pickedPrice == null) return null;
  return (((current - pick.pickedPrice) / pick.pickedPrice) * 100).toFixed(2);
}

function isWeekOld(pick) {
  if (!pick.pickedAt) return false;
  const d = pick.pickedAt.toDate
    ? pick.pickedAt.toDate()
    : new Date(pick.pickedAt);
  return Date.now() - d.getTime() >= 7 * 24 * 60 * 60 * 1000;
}

function pickRowClass(pick) {
  if (!isWeekOld(pick)) return "";
  const pct = pickPnlPct(pick);
  if (pct == null) return "row-pick-old";
  if (Number(pct) <= -5) return "row-pick-stoploss";
  return Number(pct) >= 0 ? "row-pick-profit" : "row-pick-loss";
}
</script>

<style scoped>
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

/* ── 選股記錄 ──────────────────────────────────────────────────── */
.ai-pick-row {
  margin-top: 10px;
  border-top: 1px solid #f1f5f9;
  padding-top: 8px;
}

.pick-btn {
  font-size: 0.82rem;
  padding: 3px 10px;
}

.pick-inline-form {
  font-size: 0.85rem;
}

.picks-wrap {
  margin-top: 28px;
  padding-top: 20px;
  border-top: 1px solid #e5e7eb;
}

.picks-header {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 4px;
}

.week-badge {
  display: inline-block;
  margin-left: 5px;
  padding: 1px 6px;
  background: #e0f2fe;
  color: #0369a1;
  border-radius: 10px;
  font-size: 0.75rem;
  font-weight: 600;
}

.pnl-up {
  color: #16a34a;
  font-weight: 600;
}

.pnl-down {
  color: #dc2626;
  font-weight: 600;
}

.row-pick-old td {
  background: #f8fafc;
}
.row-pick-profit td {
  background: #f0fdf4;
}
.row-pick-loss td {
  background: #fef2f2;
}
.row-pick-stoploss td {
  background: #fce7e7;
  font-weight: 600;
}
.row-pick-stoploss .pnl-down {
  color: #b91c1c;
}
.market-warning-banner {
  background: #fffbeb;
  border: 1px solid #f59e0b;
  border-left: 4px solid #f59e0b;
  border-radius: 8px;
  padding: 10px 14px;
  color: #92400e;
  font-size: 0.88rem;
  margin-bottom: 12px;
}
</style>
