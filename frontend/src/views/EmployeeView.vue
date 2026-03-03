<template>
  <section class="page-card">
    <div class="page-head sticky-page-head">
      <h1>員工專區 — 資料查詢</h1>
    </div>

    <div>
      <div class="toolbar-row">
        <button class="btn-aux" @click="addCondition">新增條件</button>
        <button class="btn-query" @click="search">查詢</button>
        <button class="btn-aux" @click="clear">清除</button>
      </div>

      <div class="toolbar-row">
        <!-- date field is fixed to 安裝日 for Orders, no need for user input -->
        <span class="muted-text">日期欄位：{{ dateField }}</span>

        <button class="btn-date" @click="searchDay(-1)">昨天</button>
        <button class="btn-date" @click="searchDay(0)">今天</button>
        <button class="btn-date" @click="searchDay(1)">明天</button>
      </div>
      <div class="field-row">
        <div class="field-item tight">
          <label>訂單號碼：</label>
          <input v-model="orderNumber" placeholder="訂單號碼" />
        </div>
        <div class="field-item tight">
          <label>日期：</label>
          <input type="date" v-model="orderDate" />
        </div>
        <button class="btn-query" @click="searchOrderByNumberAndDate">
          查詢訂單
        </button>
        <button class="btn-query" @click="searchSpecificDate">
          查指定安裝日
        </button>
      </div>
      <div class="field-row">
        <div class="field-item">
          <label>關鍵字 (包含)：</label>
          <input v-model="keyword" placeholder="例如 DT、MS、地址片段" />
        </div>
        <button class="btn-query" @click="searchByKeyword">關鍵字查詢</button>
      </div>
      <div class="field-row keyword-group-row">
        <div class="field-item tight">
          <label>石材類型片段：</label>
          <input v-model="colorKeyword" placeholder="如 dt" />
        </div>
        <div class="field-item tight">
          <label>客戶名稱片段：</label>
          <input v-model="customerKeyword" placeholder="如 王" />
        </div>
        <div class="field-item tight">
          <label>地址片段：</label>
          <input v-model="addressKeyword" placeholder="如 新竹" />
        </div>
        <button class="btn-query" @click="searchByKeywords">
          多條件片段查詢
        </button>
      </div>

      <div
        v-for="(c, idx) in conditions"
        :key="idx"
        class="field-row condition-row"
      >
        <div class="field-item tight">
          <label>欄位：</label>
          <select v-model="c.field">
            <option v-for="f in availableFields" :key="f" :value="f">
              {{ f }}
            </option>
          </select>
        </div>
        <div class="field-item tight">
          <label>運算：</label>
          <select v-model="c.op">
            <option value="==">==</option>
            <option value=">">&gt;</option>
            <option value=">=">&gt;=</option>
            <option value="<">&lt;</option>
            <option value="<=">&lt;=</option>
            <option value="!=">!=</option>
            <option value="array-contains">array-contains</option>
          </select>
        </div>
        <div class="field-item tight">
          <label>值：</label>
          <input v-model="c.value" placeholder="值" />
        </div>
        <button class="btn-aux" @click="removeCondition(idx)">移除</button>
      </div>
    </div>

    <div v-if="loading" class="muted-text">查詢中…</div>

    <div v-else>
      <div v-if="results.length === 0">沒有資料</div>
      <div v-else>
        <div class="summary-row">
          <span>總金額：{{ formatAmount(resultStats.totalAmount) }}</span>
          <span>件數：{{ resultStats.count }}</span>
          <span
            >平均金額/件數：{{ formatAmount(resultStats.averageAmount) }}</span
          >
        </div>
      </div>
      <div v-if="results.length > 0" class="table-wrap">
        <table class="data-table orders-table">
          <thead>
            <tr>
              <th
                v-for="(h, idx) in tableHeaders"
                :key="h"
                :class="{
                  'secondary-col': idx > 3,
                  'sales-col': h === '銷售額',
                  'compact-col': h === '公分數',
                }"
              >
                {{ h }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="doc in results" :key="doc.id">
              <td
                v-for="(h, idx) in tableHeaders"
                :key="h"
                :class="{
                  'secondary-col': idx > 3,
                  'sales-col': h === '銷售額',
                  'compact-col': h === '公分數',
                }"
              >
                <a
                  v-if="h === '拆料單' && getCuttingSheetUrl(doc)"
                  :href="getCuttingSheetUrl(doc)"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  拆料單
                </a>
                <span v-else>{{ formatCellValue(h, doc[h]) }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>
</template>

<script setup>
import { ref, onMounted, computed } from "vue";
import {
  queryCollection,
  queryCollectionByDateRange,
  ROLES,
  subscribeAuthState,
  getUserByUid,
  searchOrdersByKeyword,
} from "../firebase";
import { getFunctions, httpsCallable } from "firebase/functions";
import { app } from "../firebase";

// the app only searches the Orders collection
const COLLECTION_NAME = "Orders";
// Orders always use 安裝日 for date-related queries
const dateField = ref("安裝日");
const conditions = ref([]);
const results = ref([]);
const loading = ref(false);
const roles = ROLES;
const availableFields = ref([
  "安裝日",
  "訂單號碼",
  "客戶名稱",
  "顏色",
  "銷售額",
  "公分數",
  "安裝地點",
  "搬運樓層",
  "車號",
  "是否維修",
  "安裝人員1",
  "安裝人員2",
  "安裝人員3",
  "裁切時間",
  "水刀時間",
  "驗收時間",
  "裁切者",
  "水刀者",
  "驗收者",
  "年份",
]);

function buildTableHeaders() {
  const headers = availableFields.value.slice();
  const cmIndex = headers.indexOf("公分數");
  if (cmIndex >= 0) {
    headers.splice(cmIndex + 1, 0, "拆料單");
  }
  return headers;
}

const tableHeaders = ref(buildTableHeaders());
const orderNumber = ref("");
const orderDate = ref("");
const keyword = ref("");
const colorKeyword = ref("");
const customerKeyword = ref("");
const addressKeyword = ref("");
const operatorNameByEmail = {
  "linlilung@gmail.com": "林李龍",
  "go5912j2@gmail.com": "顏呈翰",
  "xtbbkc298143@gmail.com": "梁壹翔",
  "f0915850712@gmail.com": "盧皇文",
  "c0960058503@gmail.com": "顏呈璋",
  "24325990st5@gmail.com": "廖浩然",
};

function parseAmount(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (value === null || value === undefined) return 0;
  const normalized = String(value).replace(/[^\d.-]/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

const resultStats = computed(() => {
  const count = results.value.length;
  const totalAmount = results.value.reduce(
    (sum, doc) => sum + parseAmount(doc["銷售額"]),
    0,
  );
  const averageAmount = count > 0 ? totalAmount / count : 0;
  return { count, totalAmount, averageAmount };
});

function formatAmount(value) {
  return Math.round(Number(value || 0)).toLocaleString("zh-TW");
}

function formatCellValue(field, value) {
  if (field === "銷售額" || field === "公分數") {
    if (value === null || value === undefined || String(value).trim() === "") {
      return "";
    }
    return Math.round(parseAmount(value)).toLocaleString("zh-TW");
  }
  if (typeof value === "string") {
    let formatted = value;
    Object.entries(operatorNameByEmail).forEach(([email, name]) => {
      const emailPattern = new RegExp(
        email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
        "gi",
      );
      formatted = formatted.replace(emailPattern, name);
    });
    return formatted;
  }
  return value;
}

function normalizeDateToYmd(value) {
  if (!value) return "";
  if (typeof value === "object" && typeof value.toDate === "function") {
    const d = value.toDate();
    if (!(d instanceof Date) || Number.isNaN(d.getTime())) return "";
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }
  const raw = String(value).trim();
  const m = raw.match(/(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})/);
  if (m) {
    const yyyy = m[1];
    const mm = String(Number(m[2])).padStart(2, "0");
    const dd = String(Number(m[3])).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function getCuttingSheetUrl(doc) {
  const ymd = normalizeDateToYmd(doc?.["裁切時間"]);
  if (!ymd) return "";
  return `https://junchengstone.synology.me/upload/pic/?date=${ymd}`;
}

async function search() {
  loading.value = true;
  const conds = [];
  for (const c of conditions.value) {
    if (!c.field || !c.op) continue;
    // skip empty values
    if (
      c.value === undefined ||
      c.value === null ||
      String(c.value).trim() === ""
    )
      continue;
    conds.push({ field: c.field, op: c.op, value: c.value });
  }
  if (conds.length === 0) {
    loading.value = false;
    alert("請先新增至少一個查詢條件");
    return;
  }
  try {
    results.value = await queryCollection(COLLECTION_NAME, conds);
  } catch (e) {
    console.error("查詢失敗：", e);
    results.value = [];
  }
  loading.value = false;
}

function getDayRangeForOffset(offsetDays = 0) {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  d.setDate(d.getDate() + offsetDays);
  const start = new Date(d);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

async function searchDay(offset) {
  // dateField is pre-set to 安裝日, so no prompt needed
  updateTableHeaders();

  // handle string-format 安裝日 in Orders
  if (dateField.value === "安裝日") {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    const str = `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
    loading.value = true;
    try {
      results.value = await queryCollection(COLLECTION_NAME, [
        { field: dateField.value, op: "==", value: str },
      ]);
    } catch (e) {
      console.error("字串日期查詢失敗：", e);
      results.value = [];
    }
    loading.value = false;
    return;
  }
  const { start, end } = getDayRangeForOffset(offset);
  loading.value = true;
  try {
    results.value = await queryCollectionByDateRange(
      COLLECTION_NAME,
      dateField.value,
      start,
      end,
    );
  } catch (e) {
    console.error("日期查詢失敗：", e);
    results.value = [];
  }
  loading.value = false;
}

function addCondition() {
  const f = availableFields.value.length ? availableFields.value[0] : "";
  conditions.value.push({ field: f, op: "==", value: "" });
}

function removeCondition(i) {
  conditions.value.splice(i, 1);
}

function clear() {
  conditions.value = [];
  results.value = [];
}

function updateTableHeaders() {
  // only Orders is supported, so the headers simply mirror availableFields
  tableHeaders.value = buildTableHeaders();
}

function parseDateInputToRange(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr + "T00:00:00");
  const start = new Date(d);
  const end = new Date(d);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

async function searchOrderByNumberAndDate() {
  if (!orderNumber.value) {
    alert("請輸入訂單號碼");
    return;
  }
  // headers are always Orders
  updateTableHeaders();

  // Build range query for prefix match: e.g. "12345" matches "12345ABC", "12345XYZ", etc.
  const nextValue = String(orderNumber.value);
  const nextNum = parseInt(nextValue, 10);
  if (isNaN(nextNum)) {
    alert("訂單號碼必須以數字開頭");
    return;
  }
  const nextPrefix = String(nextNum + 1);
  const conds = [
    { field: "訂單號碼", op: ">=", value: nextValue },
    { field: "訂單號碼", op: "<", value: nextPrefix },
  ];

  // if orderDate provided, perform server-side compound query (order number + date range)
  if (orderDate.value) {
    const range = parseDateInputToRange(orderDate.value);
    if (range) {
      const condsWithDate = [
        { field: "訂單號碼", op: ">=", value: nextValue },
        { field: "訂單號碼", op: "<", value: nextPrefix },
        { field: dateField.value, op: ">=", value: range.start },
        { field: dateField.value, op: "<", value: range.end },
      ];
      loading.value = true;
      try {
        results.value = await queryCollection(COLLECTION_NAME, condsWithDate);
      } catch (e) {
        console.error("查詢訂單失敗（Server-side）：", e);
        results.value = [];
      }
      loading.value = false;
      return;
    }
  }

  // otherwise query by order number server-side
  loading.value = true;
  try {
    results.value = await queryCollection(COLLECTION_NAME, conds);
  } catch (e) {
    console.error("查詢訂單失敗：", e);
    results.value = [];
  }
  loading.value = false;
}

// 將使用者輸入的關鍵字送到雲端函式搜尋
async function searchByKeyword() {
  if (!keyword.value) {
    alert("請輸入關鍵字");
    return;
  }
  updateTableHeaders();
  loading.value = true;
  try {
    results.value = await searchOrdersByKeyword(keyword.value);
  } catch (e) {
    console.error("關鍵字查詢失敗：", e);
    results.value = [];
  }
  loading.value = false;
}

async function searchByKeywords() {
  const keywords = [
    colorKeyword.value,
    customerKeyword.value,
    addressKeyword.value,
  ]
    .map((k) => k.trim().toLowerCase())
    .filter((k) => !!k);
  if (!keywords.length) {
    alert("請輸入至少一個條件");
    return;
  }
  loading.value = true;
  try {
    const functions = getFunctions(app);
    const callable = httpsCallable(functions, "searchOrdersByKeywords");
    const resp = await callable({ keywords });
    results.value = resp.data || [];
    updateTableHeaders();
  } catch (e) {
    alert("查詢失敗: " + e);
  }
  loading.value = false;
}

async function searchSpecificDate() {
  if (!orderDate.value) {
    alert("請選擇日期");
    return;
  }
  // if Orders/安裝日 string, convert
  if (dateField.value === "安裝日") {
    const parts = orderDate.value.split("-");
    const d = new Date(orderDate.value);
    const str = `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
    updateTableHeaders();
    loading.value = true;
    try {
      results.value = await queryCollection(COLLECTION_NAME, [
        { field: dateField.value, op: "==", value: str },
      ]);
    } catch (e) {
      console.error("指定日期查詢失敗：", e);
      results.value = [];
    }
    loading.value = false;
    return;
  }
  const range = parseDateInputToRange(orderDate.value);
  if (!range) return;
  updateTableHeaders();
  loading.value = true;
  try {
    results.value = await queryCollection(COLLECTION_NAME, [
      { field: dateField.value, op: ">=", value: range.start },
      { field: dateField.value, op: "<", value: range.end },
    ]);
  } catch (e) {
    console.error("指定日期查詢失敗：", e);
    results.value = [];
  }
  loading.value = false;
}

// 可選：預先檢查是否為員工（路由守衛已做主要檢查）
onMounted(() => {
  // default to orders preset for ease of use
  subscribeAuthState(async (user) => {
    if (!user) return;
    const doc = await getUserByUid(user.uid);
    if (!doc || doc.role !== "員工") {
      // 非員工仍可嘗試，但通常路由會阻擋
      console.warn("非員工帳號存取員工頁面");
    }
  });
});
</script>

<style scoped>
.summary-row {
  display: flex;
  gap: 1rem;
  margin: 0.75rem 0;
  font-weight: 600;
}

.condition-row {
  padding: 0.55rem;
  border: 1px dashed #d1d5db;
  border-radius: 10px;
}

.orders-table th.compact-col,
.orders-table td.compact-col {
  width: 56px !important;
  min-width: 56px !important;
  max-width: 56px !important;
  white-space: nowrap;
}

.orders-table th.sales-col,
.orders-table td.sales-col {
  width: 88px !important;
  min-width: 88px !important;
  max-width: 88px !important;
  white-space: nowrap;
}
</style>
