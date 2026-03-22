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
          <span>{{ resultSourceLabel }}</span>
          <span v-if="queryElapsed !== null" class="query-elapsed"
            >查詢耗時：{{ queryElapsed }} ms</span
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
                  'photo-col': h === '完工照片',
                  'operator-col':
                    h === '裁切者' || h === '水刀者' || h === '驗收者',
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
                  'photo-col': h === '完工照片',
                  'operator-col':
                    h === '裁切者' || h === '水刀者' || h === '驗收者',
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
                <a
                  v-else-if="h === '訂單號碼' && doc['訂單號碼']"
                  href="#"
                  class="order-pdf-link"
                  @click.prevent="openOrderPdf(doc['訂單號碼'])"
                >
                  {{ doc["訂單號碼"] }}
                </a>
                <button
                  v-else-if="h === '完工照片'"
                  :class="[
                    'btn-photo-manage',
                    hasCompletionPhotos(doc) ? 'btn-query' : 'btn-aux',
                  ]"
                  @click="openPhotoManager(doc)"
                >
                  查看 / 上傳
                </button>
                <span v-else>{{ formatCellValue(h, doc[h]) }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div
      v-if="photoDialogOpen"
      class="photo-modal-mask"
      @click.self="closePhotoManager"
    >
      <div class="photo-modal-card">
        <div class="photo-modal-head">
          <h3>完工照片管理 - 訂單 {{ activePhotoOrder?.orderNumber || "" }}</h3>
          <button class="btn-aux" @click="closePhotoManager">關閉</button>
        </div>

        <div class="photo-upload-row">
          <input
            ref="photoUploadInputRef"
            type="file"
            multiple
            accept="image/*,video/*"
            @change="onNewPhotoFilesSelected"
          />
          <button
            class="btn-query"
            :disabled="photoSaving || newPhotoFiles.length === 0"
            @click="uploadPhotosForActiveOrder"
          >
            上傳照片
          </button>
        </div>

        <div v-if="photoSaving" class="upload-progress-wrap">
          <div class="upload-progress-head">
            <span>{{ photoUploadProgressText }}</span>
            <span>{{ formatPercent(photoUploadProgress) }}</span>
          </div>
          <div class="upload-progress-track">
            <div
              class="upload-progress-fill"
              :style="{ width: formatPercent(photoUploadProgress) }"
            ></div>
          </div>
        </div>

        <div v-if="photoLoading" class="muted-text">照片載入中…</div>
        <div v-else>
          <div v-if="activeOrderPhotos.length === 0" class="muted-text">
            尚未上傳完工照片
          </div>
          <div v-if="activeOrderPhotos.length === 0 && !photoLoading">
            <button
              class="btn-aux"
              :disabled="nasLegacyLoading"
              @click="loadNasLegacyPhotos"
            >
              {{ nasLegacyLoading ? "查詢中…" : "查看原有資料夾照片" }}
            </button>
            <span
              v-if="nasLegacyError"
              class="muted-text"
              style="margin-left: 8px"
              >{{ nasLegacyError }}</span
            >
            <div
              v-if="nasLegacyPhotos.length > 0"
              class="photo-grid"
              style="margin-top: 12px"
            >
              <div
                v-for="file in nasLegacyPhotos"
                :key="file.nasPath"
                class="photo-item"
              >
                <a :href="file.url" target="_blank" rel="noopener noreferrer">
                  <img
                    v-if="!file.isVideo"
                    class="photo-preview"
                    :src="file.url"
                    :alt="file.fileName"
                  />
                  <video
                    v-else
                    class="photo-preview"
                    :src="file.url"
                    controls
                    preload="metadata"
                  ></video>
                </a>
                <div class="photo-meta">{{ file.fileName }}</div>
              </div>
            </div>
          </div>
          <div v-else>
            <div class="photo-share-row">
              <span class="muted-text">已選取 {{ selectedPhotoCount }} 張</span>
              <button
                class="btn-aux"
                :disabled="
                  photoSaving || photoSharing || activeOrderPhotos.length === 0
                "
                @click="toggleSelectAllPhotos"
              >
                {{ isAllSelected ? "取消全選" : "全選" }}
              </button>
              <button
                class="btn-query"
                :disabled="
                  photoSaving || photoSharing || selectedPhotoCount === 0
                "
                @click="shareSelectedPhotosToLine"
              >
                直接分享圖片
              </button>
              <button
                class="btn-aux"
                :disabled="
                  photoSaving || photoSharing || selectedPhotoCount === 0
                "
                @click="shareSelectedPhotosByAlbumLink"
              >
                分享相簿連結(穩定)
              </button>
              <button
                class="btn-aux"
                :disabled="
                  photoSaving || photoSharing || selectedPhotoCount === 0
                "
                @click="clearSelectedPhotos"
              >
                清除勾選
              </button>
            </div>

            <div class="photo-grid">
              <div
                v-for="photo in activeOrderPhotos"
                :key="photo.id"
                class="photo-item"
              >
                <label class="photo-select-row">
                  <input
                    type="checkbox"
                    :checked="isPhotoSelected(photo.id)"
                    :disabled="photoSaving || photoSharing"
                    @change="
                      togglePhotoSelected(photo.id, $event.target.checked)
                    "
                  />
                  <span>選取分享</span>
                </label>

                <a
                  :href="photo.downloadURL"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <img
                    v-if="!isVideoFile(photo)"
                    class="photo-preview"
                    :src="photo.downloadURL"
                    :alt="photo.fileName || '完工檔案'"
                  />
                  <video
                    v-else
                    class="photo-preview"
                    :src="photo.downloadURL"
                    controls
                    preload="metadata"
                  ></video>
                </a>

                <div class="photo-meta">
                  <div>檔名：{{ photo.fileName || "(未命名)" }}</div>
                  <div>
                    上傳：{{
                      photo.uploadedByName || photo.uploadedByEmail || "-"
                    }}
                    /
                    {{ formatDateTime(photo.uploadedAt) }}
                  </div>
                  <div>
                    修改：{{
                      photo.updatedByName || photo.updatedByEmail || "-"
                    }}
                    /
                    {{ formatDateTime(photo.updatedAt) }}
                  </div>
                  <div>NAS 同步：{{ formatNasSync(photo.nasSync) }}</div>
                </div>

                <div class="photo-actions">
                  <input
                    class="replace-file-input"
                    type="file"
                    accept="image/*,video/*"
                    @change="onReplacePhotoSelected(photo.id, $event)"
                  />
                  <button
                    class="btn-query"
                    :disabled="photoSaving || !replacePhotoFiles[photo.id]"
                    @click="replacePhotoForActiveOrder(photo)"
                  >
                    更新照片
                  </button>
                  <button
                    class="btn-aux"
                    :disabled="photoSaving"
                    @click="deletePhotoForActiveOrder(photo)"
                  >
                    刪除
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { ref, onMounted, computed, watch } from "vue";
import {
  queryCollection,
  queryCollectionByDateRange,
  ROLES,
  subscribeAuthState,
  getUserByUid,
  searchOrdersByKeyword,
  searchPendingOrdersByKeyword,
  searchPendingOrdersByKeywords,
  listOrderCompletionPhotos,
  getOrderCompletionPhotoStatus,
  createCompletionPhotoShareAlbum,
  uploadOrderCompletionPhotos,
  replaceOrderCompletionPhoto,
  deleteOrderCompletionPhoto,
  logClientUploadError,
  listNasLegacyPhotos,
  auth,
} from "../firebase";
import { httpsCallable } from "firebase/functions";
import { app, functionsInstance } from "../firebase";

// the app only searches the Orders collection
const COLLECTION_NAME = "Orders";
// Orders always use 安裝日 for date-related queries
const dateField = ref("安裝日");
const conditions = ref([]);
const results = ref([]);
const loading = ref(false);
const queryElapsed = ref(null);
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
  const operatorFields = ["裁切者", "水刀者", "驗收者"];
  const movedFields = [];

  for (const field of operatorFields) {
    const fieldIndex = headers.indexOf(field);
    if (fieldIndex >= 0) {
      movedFields.push(headers[fieldIndex]);
      headers.splice(fieldIndex, 1);
    }
  }

  const cmIndex = headers.indexOf("公分數");
  if (cmIndex >= 0) {
    headers.splice(cmIndex + 1, 0, ...movedFields, "拆料單");
  } else {
    headers.push(...movedFields, "拆料單");
  }

  const orderNoIndex = headers.indexOf("訂單號碼");
  if (orderNoIndex >= 0) {
    headers.splice(orderNoIndex + 1, 0, "完工照片");
  } else {
    headers.push("完工照片");
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

function toOrderViewShape(doc) {
  const raw = doc?.raw || {};
  const fallback = (value, alt = "") => {
    const v = String(value ?? "").trim();
    if (v) return v;
    const a = String(alt ?? "").trim();
    return a;
  };

  // Keep the existing table headers usable when data comes from PendingOrders.
  return {
    ...doc,
    __source: "pending",
    訂單號碼: fallback(doc["訂單號碼"], doc.orderNo || raw["訂單號碼"]),
    客戶名稱: fallback(doc["客戶名稱"], doc.customerName || raw["客戶名稱"]),
    顏色: fallback(doc["顏色"], doc.color || raw["顏色"]),
    銷售額: fallback(doc["銷售額"], doc.salesAmount || raw["銷售額"]),
    公分數: fallback(doc["公分數"], doc.countertopCm || raw["台面 cm數"]),
    安裝地點: fallback(doc["安裝地點"], doc.installAddress || raw["安裝地點"]),
    安裝日:
      normalizeDateToYmd(
        fallback(doc["安裝日"], doc.dueDate || raw["預交日"]),
      ) || fallback(doc["安裝日"], doc.dueDate || raw["預交日"]),
    裁切時間: fallback(
      doc["裁切時間"],
      doc.cutBoardTime || doc["裁板時間"] || raw["裁板時間"],
    ),
    裁切者: fallback(
      doc["裁切者"],
      doc.cutBoardBy || doc["裁板者"] || raw["裁板者"],
    ),
    水刀時間: fallback(doc["水刀時間"], doc.waterjetTime || raw["水刀時間"]),
    水刀者: fallback(
      doc["水刀者"],
      doc.waterjetBy || doc["水刀手"] || raw["水刀手"],
    ),
    驗收時間: fallback(doc["驗收時間"], doc.acceptanceTime || raw["驗收時間"]),
    驗收者: fallback(doc["驗收者"], doc.acceptanceBy || raw["驗收者"]),
    年份: fallback(doc["年份"], String(new Date().getFullYear())),
    是否維修: fallback(doc["是否維修"], "未派車"),
  };
}

function normalizeRowsForTable(docs = []) {
  return (docs || []).map((doc) => toOrderViewShape(doc));
}

async function queryOrdersThenPendingByOrderNo(prefixValue, nextPrefix) {
  const orderConds = [
    { field: "訂單號碼", op: ">=", value: prefixValue },
    { field: "訂單號碼", op: "<", value: nextPrefix },
  ];

  // 同時查 Orders 與 PendingOrders，不讓 Orders 有結果就跳過 PendingOrders
  const [orderRows, byOrderNo, by訂單號碼] = await Promise.all([
    queryCollection(COLLECTION_NAME, orderConds).catch(() => []),
    queryCollection("PendingOrders", [
      { field: "orderNo", op: ">=", value: prefixValue },
      { field: "orderNo", op: "<", value: nextPrefix },
    ]).catch(() => []),
    queryCollection("PendingOrders", [
      { field: "訂單號碼", op: ">=", value: prefixValue },
      { field: "訂單號碼", op: "<", value: nextPrefix },
    ]).catch(() => []),
  ]);

  // 合併 PendingOrders 去重（以 doc.id 為 key）
  const seen = new Set();
  const pendingRows = [];
  for (const doc of [...byOrderNo, ...by訂單號碼]) {
    if (!seen.has(doc.id)) {
      seen.add(doc.id);
      pendingRows.push(doc);
    }
  }
  const normalizedPending = normalizeRowsForTable(pendingRows);

  // Orders 與 PendingOrders 合併，Orders 優先（去重以訂單號碼為 key）
  const combined = [...orderRows];
  const orderNosInOrders = new Set(
    orderRows.map((r) => String(r["訂單號碼"] || "").trim()),
  );
  for (const p of normalizedPending) {
    const pNo = String(p["訂單號碼"] || p.orderNo || "").trim();
    if (pNo && !orderNosInOrders.has(pNo)) {
      combined.push(p);
    }
  }
  return combined;
}
const photoDialogOpen = ref(false);
const photoLoading = ref(false);
const photoSaving = ref(false);
const photoSharing = ref(false);
const photoUploadProgress = ref(0);
const photoUploadProgressText = ref("");
const activePhotoOrder = ref(null);
const activeOrderPhotos = ref([]);
const newPhotoFiles = ref([]);
const replacePhotoFiles = ref({});
const selectedPhotoIds = ref([]);
const photoUploadInputRef = ref(null);
const photoStatusByOrderId = ref({});
const nasLegacyPhotos = ref([]);
const nasLegacyLoading = ref(false);
const nasLegacyError = ref("");
const operatorNameByEmail = {
  "linlilung@gmail.com": "林李龍",
  "go5912j2@gmail.com": "顏呈翰",
  "xtbbkc298143@gmail.com": "梁壹翔",
  "f0915850712@gmail.com": "盧皇文",
  "c0960058503@gmail.com": "顏呈璋",
  "24325990st5@gmail.com": "廖浩然",
  "24325990st3@gmail.com": "公用機",
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

const resultSourceLabel = computed(() => {
  if (!results.value.length) return "";
  const hasPending = results.value.some(
    (d) => d?.__source === "pending" || d?.source === "pending-sheet",
  );
  const hasOrders = results.value.some(
    (d) => !(d?.__source === "pending" || d?.source === "pending-sheet"),
  );
  if (hasPending && hasOrders) return "來源：派車 + 未派車";
  if (hasPending) return "來源：未派車";
  return "來源：派車";
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
  if (
    field === "裁切時間" ||
    field === "水刀時間" ||
    field === "驗收時間" ||
    field === "安裝日"
  ) {
    const ymd = normalizeDateToYmd(value);
    if (ymd) return ymd;
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

async function openOrderPdf(orderNumber) {
  try {
    const user = auth.currentUser;
    if (!user) {
      alert("請先登入");
      return;
    }
    const token = await user.getIdToken();
    const url = `https://asia-east1-jh-stone.cloudfunctions.net/serveOrderPdf?orderNumber=${encodeURIComponent(orderNumber)}&token=${encodeURIComponent(token)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  } catch (e) {
    console.error("openOrderPdf failed", e);
    alert("無法開啟訂單 PDF：" + (e?.message || String(e)));
  }
}

function formatDateTime(value) {
  if (!value) return "-";
  const d =
    typeof value === "object" && typeof value.toDate === "function"
      ? value.toDate()
      : new Date(value);
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatNasSync(nasSync) {
  if (!nasSync || !nasSync.status) return "尚未檢查";
  if (nasSync.status === "success") return "成功";
  if (nasSync.status === "failed") {
    return `失敗：${nasSync.error || "請查看 Functions 日誌"}`;
  }
  if (nasSync.status === "skipped") {
    return `略過：${nasSync.reason || ""}`;
  }
  return nasSync.status;
}

function getOrderDocId(doc) {
  return doc?.id ? String(doc.id) : "";
}

function resolveInstallerName(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return operatorNameByEmail[raw.toLowerCase()] || raw;
}

function getOrderFieldValue(orderDoc, candidates = [], keyword = "") {
  if (!orderDoc || typeof orderDoc !== "object") return "";

  for (const key of candidates) {
    const raw = orderDoc[key];
    if (raw === undefined || raw === null) continue;
    const text = String(raw).trim();
    if (text) return text;
  }

  if (!keyword) return "";
  const normalizedKeyword = String(keyword).replace(/\s+/g, "").trim();
  if (!normalizedKeyword) return "";

  for (const rawKey of Object.keys(orderDoc)) {
    const normalizedKey = String(rawKey).replace(/\s+/g, "").trim();
    if (!normalizedKey.includes(normalizedKeyword)) continue;
    const text = String(orderDoc[rawKey] || "").trim();
    if (text) return text;
  }

  return "";
}

function hasCompletionPhotos(doc) {
  const orderId = getOrderDocId(doc);
  return !!photoStatusByOrderId.value[orderId];
}

async function refreshCompletionPhotoStatusForResults() {
  const orderIds = results.value
    .map((doc) => getOrderDocId(doc))
    .filter(Boolean);
  if (!orderIds.length) {
    photoStatusByOrderId.value = {};
    return;
  }
  try {
    const statusMap = await getOrderCompletionPhotoStatus(orderIds);
    photoStatusByOrderId.value = statusMap;
  } catch (e) {
    console.error("讀取照片狀態失敗：", e);
    photoStatusByOrderId.value = {};
  }
}

function toErrorText(prefix, err) {
  const code = err?.code ? ` (${err.code})` : "";
  const message = err?.message ? `\n${err.message}` : "";
  const raw = `${err?.code || ""} ${err?.message || ""}`.toLowerCase();

  const storageNotReady =
    raw.includes("storage bucket") ||
    raw.includes("bucket does not exist") ||
    raw.includes("project does not exist") ||
    raw.includes("firebasestorage.googleapis.com");

  const unauthorized =
    raw.includes("storage/unauthorized") ||
    raw.includes("permission denied") ||
    raw.includes("missing bearer token") ||
    raw.includes("unauthorized") ||
    raw.includes("請先登入");

  const forbiddenRole =
    raw.includes("僅員工與管理者") ||
    raw.includes("權限不足") ||
    raw.includes("permission-denied");

  const tooLarge =
    raw.includes("檔案過大") ||
    raw.includes("file too large") ||
    raw.includes("http-413") ||
    raw.includes("(413)");

  const nasConfigIssue =
    raw.includes("nas 路徑格式錯誤") ||
    raw.includes("尚未設定 syno_username") ||
    raw.includes("尚未設定 syno_password") ||
    raw.includes("synology");

  const retryable =
    raw.includes("storage/unknown") ||
    raw.includes("storage/retry-limit-exceeded") ||
    raw.includes("storage/network-request-failed") ||
    raw.includes("network-request-failed") ||
    raw.includes("network-timeout") ||
    raw.includes("network-aborted") ||
    raw.includes("failed to fetch") ||
    raw.includes("net::err") ||
    raw.includes("network") ||
    raw.includes("timeout") ||
    raw.includes("cors");

  let hint = "";
  if (storageNotReady) {
    hint =
      "\n\n可能原因：Firebase Storage 設定未完成（或 Bucket 名稱不正確）。請到 Firebase Console > Storage 確認已初始化，並檢查前端設定的 storageBucket。";
  } else if (unauthorized || forbiddenRole) {
    hint =
      "\n\n可能原因：目前登入狀態或權限不足。請重新登入後再試，並確認此帳號屬於 admin/管理者/員工。";
  } else if (tooLarge) {
    hint =
      "\n\n可能原因：檔案超過目前上傳限制。請先壓縮影片或縮短片長後再上傳。";
  } else if (nasConfigIssue) {
    hint =
      "\n\n可能原因：伺服器端 NAS 設定異常（路徑或帳密）。請通知管理者到系統設定頁檢查 NAS 連線。";
  } else if (retryable) {
    hint =
      "\n\n可能原因：網路暫時不穩或瀏覽器連線中斷。請切換網路後重試一次；若僅個別手機發生，先重新整理頁面再上傳。";
  }

  return `${prefix}${code}${message}${hint}`;
}

function formatPercent(progress) {
  const n = Math.max(0, Math.min(1, Number(progress || 0)));
  return `${Math.round(n * 100)}%`;
}

function isSupportedCompletionMedia(file) {
  const type = String(file?.type || "").toLowerCase();
  return type.startsWith("image/") || type.startsWith("video/");
}

const MAX_UPLOAD_BYTES = 120 * 1024 * 1024; // 120 MB，與 Functions 上限一致

function splitSelectedMediaFiles(fileList = []) {
  const files = Array.from(fileList || []);
  const accepted = [];
  const rejected = [];
  const tooLarge = [];

  for (const file of files) {
    if (!isSupportedCompletionMedia(file)) {
      rejected.push(file?.name || "(未命名檔案)");
    } else if (file.size > MAX_UPLOAD_BYTES) {
      tooLarge.push(
        `${file?.name || "(未命名)"} (${(file.size / 1024 / 1024).toFixed(0)} MB)`,
      );
    } else {
      accepted.push(file);
    }
  }

  return { accepted, rejected, tooLarge };
}

function isVideoFile(photo) {
  const contentType = String(photo?.contentType || "").toLowerCase();
  if (contentType.startsWith("video/")) return true;

  const nameOrUrl = `${photo?.fileName || ""} ${photo?.downloadURL || ""}`;
  return /\.(mp4|mov|m4v|webm|ogv|ogg|avi|mkv|3gp|wmv)(\?|$)/i.test(nameOrUrl);
}

function inferShareMediaType(photo, blobType = "") {
  const direct = String(blobType || "").toLowerCase();
  if (direct.startsWith("image/") || direct.startsWith("video/")) {
    return direct;
  }

  const photoType = String(photo?.contentType || "").toLowerCase();
  if (photoType.startsWith("image/") || photoType.startsWith("video/")) {
    return photoType;
  }

  const hint =
    `${photo?.fileName || ""} ${photo?.downloadURL || ""}`.toLowerCase();
  if (/\.(mp4|mov|m4v|webm|ogv|ogg|avi|mkv|3gp|wmv)(\?|$)/i.test(hint)) {
    return "video/mp4";
  }
  if (/\.(jpg|jpeg|png|gif|webp|bmp|heic|heif)(\?|$)/i.test(hint)) {
    return "image/jpeg";
  }

  return isVideoFile(photo) ? "video/mp4" : "image/jpeg";
}

function buildUploadDebugContext(action, extra = {}) {
  const nav = typeof navigator !== "undefined" ? navigator : null;
  const loc = typeof window !== "undefined" ? window.location : null;
  const now = new Date();

  return {
    action,
    route: loc?.pathname || "",
    userAgent: nav?.userAgent || "",
    platform: nav?.platform || "",
    language: nav?.language || "",
    online: Boolean(nav?.onLine),
    timezone:
      Intl.DateTimeFormat?.().resolvedOptions?.().timeZone || "Asia/Taipei",
    occurredAtClient: now.toISOString(),
    ...extra,
  };
}

const selectedPhotoCount = computed(() => selectedPhotoIds.value.length);
const allPhotoIds = computed(() =>
  activeOrderPhotos.value
    .map((photo) => String(photo?.id || "").trim())
    .filter(Boolean),
);
const isAllSelected = computed(() => {
  if (!allPhotoIds.value.length) return false;
  const selectedSet = new Set(selectedPhotoIds.value);
  return allPhotoIds.value.every((id) => selectedSet.has(id));
});

function isPhotoSelected(photoId) {
  return selectedPhotoIds.value.includes(String(photoId || ""));
}

function togglePhotoSelected(photoId, checked) {
  const id = String(photoId || "").trim();
  if (!id) return;
  const set = new Set(selectedPhotoIds.value);
  if (checked) set.add(id);
  else set.delete(id);
  selectedPhotoIds.value = Array.from(set);
}

function clearSelectedPhotos() {
  selectedPhotoIds.value = [];
}

function toggleSelectAllPhotos() {
  if (isAllSelected.value) {
    clearSelectedPhotos();
    return;
  }
  selectedPhotoIds.value = Array.from(allPhotoIds.value);
}

function collectSelectedShareContext() {
  const selectedIds = Array.from(selectedPhotoIds.value);
  if (!selectedIds.length) {
    return null;
  }

  const selected = activeOrderPhotos.value.filter((photo) =>
    selectedIds.includes(String(photo?.id || "")),
  );
  const urls = selected
    .map((photo) => String(photo?.downloadURL || "").trim())
    .filter(Boolean);
  const orderNo = String(activePhotoOrder.value?.orderNumber || "").trim();
  const title = orderNo ? `訂單 ${orderNo} 完工照片` : "完工照片";

  return {
    selectedIds,
    selected,
    urls,
    title,
  };
}

async function shareSelectedPhotosByAlbumLinkInternal(ctx) {
  const { selectedIds, title } = ctx;

  let shareUrl = "";
  try {
    const album = await createCompletionPhotoShareAlbum(
      String(activePhotoOrder.value?.id || "").trim(),
      selectedIds,
      title,
    );
    shareUrl = String(album?.url || "").trim();
  } catch (albumError) {
    console.warn("建立相簿分享連結失敗", albumError);
  }

  if (!shareUrl) {
    throw new Error("album-link-unavailable");
  }

  const text = `${title}\n${shareUrl}`;
  const lineUrl = `https://line.me/R/msg/text/?${encodeURIComponent(text)}`;
  window.open(lineUrl, "_blank", "noopener,noreferrer");
}

async function shareSelectedPhotosByAlbumLink() {
  if (photoSharing.value) return;
  photoSharing.value = true;

  try {
    const ctx = collectSelectedShareContext();
    if (!ctx) {
      alert("請先勾選要分享的照片或影片");
      return;
    }

    if (!ctx.urls.length) {
      alert("已選取的照片沒有可分享連結，請重新載入照片後再試");
      return;
    }

    try {
      await shareSelectedPhotosByAlbumLinkInternal(ctx);
    } catch (_e) {
      alert("建立相簿連結失敗，請稍後再試或重新整理後再分享");
    }
  } finally {
    photoSharing.value = false;
  }
}

async function shareSelectedPhotosToLine() {
  if (photoSharing.value) return;
  photoSharing.value = true;

  try {
    const ctx = collectSelectedShareContext();
    if (!ctx) {
      alert("請先勾選要分享的照片或影片");
      return;
    }
    const { selectedIds, selected, urls, title } = ctx;

    if (activePhotoOrder.value?.id) {
      try {
        const refreshedRows = await listOrderCompletionPhotos(
          activePhotoOrder.value.id,
        );
        activeOrderPhotos.value = refreshedRows;
      } catch (refreshError) {
        console.warn("分享前刷新照片連結失敗，改用現有連結", refreshError);
      }
    }

    if (!urls.length) {
      alert("已選取的照片沒有可分享連結，請重新載入照片後再試");
      return;
    }
    const videoUrls = [];
    const videoPhotoIds = [];
    const MAX_NATIVE_FILES = 3;
    const MAX_NATIVE_TOTAL_BYTES = 25 * 1024 * 1024;

    try {
      if (navigator?.share) {
        const imageItems = [];
        const videoFiles = [];
        for (const [index, photo] of selected.entries()) {
          const response = await fetch(urls[index]);
          if (!response.ok) continue;
          const blob = await response.blob();
          const contentType = inferShareMediaType(photo, blob.type);
          const isImage = contentType.startsWith("image/");
          const isVideo = contentType.startsWith("video/");
          if (!isImage && !isVideo) continue;

          const fallbackName = isVideo
            ? `video-${index + 1}.mp4`
            : `photo-${index + 1}.jpg`;
          const rawName =
            String(photo?.fileName || fallbackName).trim() || fallbackName;
          const file = new File([blob], rawName, {
            type: contentType || (isVideo ? "video/mp4" : "image/jpeg"),
          });
          if (isVideo) {
            videoFiles.push(file);
            videoUrls.push(urls[index]);
            videoPhotoIds.push(String(photo?.id || ""));
          } else {
            imageItems.push({
              id: String(photo?.id || ""),
              file,
            });
          }
        }

        const imageFiles = imageItems.map((item) => item.file);
        const allMediaFiles = [...imageFiles, ...videoFiles];

        async function tryNativeShare(files, reason) {
          if (!files.length) return false;
          if (navigator.canShare && !navigator.canShare({ files })) {
            console.warn(`無法分享檔案組合（${reason}）`);
            return false;
          }
          await navigator.share({ title, text: title, files });
          return true;
        }

        // Mobile share sheets are often unstable with many files or large payloads.
        // Build conservative batches and share sequentially in one flow.
        const imageBatches = [];
        let currentBatch = [];
        let currentBytes = 0;
        for (const item of imageItems) {
          const nextSize = Number(item?.file?.size || 0);
          const wouldExceedCount = currentBatch.length >= MAX_NATIVE_FILES;
          const wouldExceedBytes =
            currentBatch.length > 0 &&
            currentBytes + nextSize > MAX_NATIVE_TOTAL_BYTES;
          if (wouldExceedCount || wouldExceedBytes) {
            imageBatches.push(currentBatch);
            currentBatch = [];
            currentBytes = 0;
          }
          currentBatch.push(item);
          currentBytes += nextSize;
        }
        if (currentBatch.length) imageBatches.push(currentBatch);

        const hasMixedMedia = imageItems.length > 0 && videoFiles.length > 0;
        const hasMultiImageBatches = imageBatches.length > 1;
        if (hasMultiImageBatches) {
          const ok = confirm(
            `偵測到較多圖片，將自動分 ${imageBatches.length} 批分享（每批最多 ${MAX_NATIVE_FILES} 張）。是否開始？`,
          );
          if (!ok) return;
        }

        const sharedImageIds = [];
        async function shareImageBatches() {
          for (let i = 0; i < imageBatches.length; i++) {
            const batch = imageBatches[i];
            const files = batch.map((item) => item.file);
            await navigator.share({
              title,
              text:
                imageBatches.length > 1
                  ? `${title}（第 ${i + 1}/${imageBatches.length} 批）`
                  : title,
              files,
            });
            batch.forEach((item) => sharedImageIds.push(item.id));
          }
        }

        if (hasMixedMedia) {
          const continueMixed = confirm(
            "本次是圖片+影片混合，先嘗試圖片檔分享（較穩定）。是否繼續？",
          );
          if (!continueMixed) return;

          if (imageBatches.length) {
            try {
              await shareImageBatches();
            } catch (batchError) {
              console.warn("圖片分批分享中斷", batchError);
            }
          }

          if (sharedImageIds.length > 0) {
            const remainingImageIds = imageItems
              .map((item) => item.id)
              .filter((id) => !sharedImageIds.includes(id));
            selectedPhotoIds.value = [...remainingImageIds, ...videoPhotoIds];

            if (remainingImageIds.length) {
              alert(
                `已分享 ${sharedImageIds.length} 張，剩餘 ${remainingImageIds.length} 張，已自動保留勾選可再分享。`,
              );
            }

            const shouldShareVideosByLink = confirm(
              "圖片已分享。影片在部分裝置無法與圖片一起直接分享，要改用連結再分享影片嗎？",
            );
            if (shouldShareVideosByLink && videoUrls.length) {
              const videoText = `${title}（影片連結）\n${videoUrls.join("\n")}`;
              const lineUrl = `https://line.me/R/msg/text/?${encodeURIComponent(videoText)}`;
              window.open(lineUrl, "_blank", "noopener,noreferrer");
            }
            return;
          }
        }

        if (await tryNativeShare(allMediaFiles, "all")) return;
        if (imageBatches.length) {
          try {
            await shareImageBatches();
            selectedPhotoIds.value = videoPhotoIds;
            return;
          } catch (batchError) {
            console.warn("圖片分批分享失敗", batchError);
          }
        }

        throw new Error("native share unavailable for selected media");
      }
    } catch (error) {
      console.warn("直接分享照片失敗，改用連結分享", error);
    }

    const shareByLink = confirm(
      "本次無法直接分享圖片檔，將改用連結分享。是否繼續？",
    );
    if (!shareByLink) return;

    try {
      await shareSelectedPhotosByAlbumLinkInternal(ctx);
    } catch (_e) {
      alert("直接分享失敗，且暫時無法建立相簿連結，請稍後再試");
    }
  } finally {
    photoSharing.value = false;
  }
}

async function loadActiveOrderPhotos() {
  if (!activePhotoOrder.value?.id) return;
  photoLoading.value = true;
  try {
    activeOrderPhotos.value = await listOrderCompletionPhotos(
      activePhotoOrder.value.id,
    );
    photoStatusByOrderId.value = {
      ...photoStatusByOrderId.value,
      [activePhotoOrder.value.id]: activeOrderPhotos.value.length > 0,
    };
    selectedPhotoIds.value = [];
  } catch (e) {
    console.error("讀取完工照片失敗：", e);
    if (activePhotoOrder.value?.id) {
      photoStatusByOrderId.value = {
        ...photoStatusByOrderId.value,
        [activePhotoOrder.value.id]: false,
      };
    }
    void logClientUploadError(
      e,
      buildUploadDebugContext("list-photos", {
        orderDocId: String(activePhotoOrder.value?.id || ""),
        orderNumber: String(activePhotoOrder.value?.orderNumber || ""),
      }),
    );
    alert(toErrorText("讀取完工照片失敗", e));
    activeOrderPhotos.value = [];
  }
  photoLoading.value = false;
}

async function openPhotoManager(orderDoc) {
  const orderId = getOrderDocId(orderDoc);
  if (!orderId) {
    alert("找不到訂單識別碼，無法管理照片");
    return;
  }
  activePhotoOrder.value = {
    id: orderId,
    orderNumber:
      getOrderFieldValue(orderDoc, ["訂單號碼", "訂單編號"], "訂單") || orderId,
    customerName: getOrderFieldValue(orderDoc, ["客戶名稱", "客戶"], "客戶"),
    color: getOrderFieldValue(orderDoc, ["顏色", "石材", "石材類型"], "顏色"),
    installAddress: getOrderFieldValue(
      orderDoc,
      ["安裝地點", "安裝地址", "地址"],
      "安裝",
    ),
    installDate: normalizeDateToYmd(
      getOrderFieldValue(orderDoc, ["安裝日"], "安裝日"),
    ),
    installer1: getOrderFieldValue(orderDoc, ["安裝人員1"], "安裝人員1"),
    installer2: getOrderFieldValue(orderDoc, ["安裝人員2"], "安裝人員2"),
    installer3: getOrderFieldValue(orderDoc, ["安裝人員3"], "安裝人員3"),
    carNumber: getOrderFieldValue(orderDoc, ["車號"], "車號"),
  };
  newPhotoFiles.value = [];
  replacePhotoFiles.value = {};
  selectedPhotoIds.value = [];
  nasLegacyPhotos.value = [];
  nasLegacyLoading.value = false;
  nasLegacyError.value = "";
  if (photoUploadInputRef.value) {
    photoUploadInputRef.value.value = "";
  }
  photoDialogOpen.value = true;
  await loadActiveOrderPhotos();
}

function closePhotoManager() {
  photoDialogOpen.value = false;
  activePhotoOrder.value = null;
  activeOrderPhotos.value = [];
  newPhotoFiles.value = [];
  replacePhotoFiles.value = {};
  selectedPhotoIds.value = [];
  nasLegacyPhotos.value = [];
  nasLegacyLoading.value = false;
  nasLegacyError.value = "";
}

async function loadNasLegacyPhotos() {
  if (!activePhotoOrder.value) return;
  nasLegacyLoading.value = true;
  nasLegacyError.value = "";
  nasLegacyPhotos.value = [];
  try {
    const result = await listNasLegacyPhotos({
      orderNumber: activePhotoOrder.value.orderNumber || "",
      customerName: activePhotoOrder.value.customerName || "",
      color: activePhotoOrder.value.color || "",
      installAddress: activePhotoOrder.value.installAddress || "",
    });
    if (result.found && Array.isArray(result.files)) {
      nasLegacyPhotos.value = result.files;
      if (result.files.length === 0) {
        nasLegacyError.value = "資料夾內沒有找到圖片或影片";
      }
    } else {
      nasLegacyError.value = result.message || "找不到 NAS 資料夾";
    }
  } catch (e) {
    nasLegacyError.value = e?.message || "載入失敗";
  } finally {
    nasLegacyLoading.value = false;
  }
}

function onNewPhotoFilesSelected(event) {
  const { accepted, rejected, tooLarge } = splitSelectedMediaFiles(
    event?.target?.files,
  );
  newPhotoFiles.value = accepted;

  const msgs = [];
  if (tooLarge.length)
    msgs.push(
      `以下檔案超過 120 MB 上限，已略過：\n${tooLarge.join("\n")}\n\n請先壓縮影片後再上傳。`,
    );
  if (rejected.length)
    msgs.push(`以下檔案不是圖片或影片，已略過：\n${rejected.join("\n")}`);
  if (msgs.length) alert(msgs.join("\n\n"));
}

async function uploadPhotosForActiveOrder() {
  if (!activePhotoOrder.value?.id) return;
  if (newPhotoFiles.value.length === 0) {
    alert("請先選擇圖片或影片");
    return;
  }

  photoSaving.value = true;
  photoUploadProgress.value = 0;
  photoUploadProgressText.value = "準備上傳…";
  try {
    await uploadOrderCompletionPhotos(
      activePhotoOrder.value.id,
      activePhotoOrder.value.orderNumber,
      newPhotoFiles.value,
      (progress) => {
        photoUploadProgress.value = progress?.overallProgress || 0;
        if (progress?.retryAttempt) {
          photoUploadProgressText.value = `網路不穩，第 ${progress.retryAttempt} 次重試 (${progress?.fileIndex || 0}/${progress?.totalFiles || 0}：${progress?.fileName || ""})`;
        } else {
          photoUploadProgressText.value = `上傳中 ${progress?.fileIndex || 0}/${progress?.totalFiles || 0}：${progress?.fileName || ""}`;
        }
      },
      {
        customerName: activePhotoOrder.value.customerName,
        color: activePhotoOrder.value.color,
        installAddress: activePhotoOrder.value.installAddress,
        installDate: activePhotoOrder.value.installDate,
        installer1: activePhotoOrder.value.installer1,
        installer2: activePhotoOrder.value.installer2,
        installer3: activePhotoOrder.value.installer3,
        carNumber: activePhotoOrder.value.carNumber,
      },
    );
    newPhotoFiles.value = [];
    if (photoUploadInputRef.value) {
      photoUploadInputRef.value.value = "";
    }
    await loadActiveOrderPhotos();
    photoUploadProgress.value = 1;
    photoUploadProgressText.value = "上傳完成";
  } catch (e) {
    console.error("上傳完工照片失敗：", e);
    void logClientUploadError(
      e,
      buildUploadDebugContext("upload-photos", {
        orderDocId: String(activePhotoOrder.value?.id || ""),
        orderNumber: String(activePhotoOrder.value?.orderNumber || ""),
        fileName: newPhotoFiles.value.map((f) => f?.name || "").join(","),
      }),
    );
    alert(toErrorText("上傳完工照片失敗", e));
  }
  photoSaving.value = false;
}

function onReplacePhotoSelected(photoId, event) {
  const nextFile = event?.target?.files?.[0];
  if (!nextFile) return;

  if (!isSupportedCompletionMedia(nextFile)) {
    alert("僅支援圖片或影片檔案");
    if (event?.target) event.target.value = "";
    return;
  }

  replacePhotoFiles.value = {
    ...replacePhotoFiles.value,
    [photoId]: nextFile,
  };
}

async function replacePhotoForActiveOrder(photo) {
  if (!activePhotoOrder.value?.id || !photo?.id) return;
  const nextFile = replacePhotoFiles.value[photo.id];
  if (!nextFile) {
    alert("請先選擇替換檔案");
    return;
  }

  photoSaving.value = true;
  photoUploadProgress.value = 0;
  photoUploadProgressText.value = "更新照片中…";
  try {
    await replaceOrderCompletionPhoto(
      activePhotoOrder.value.id,
      photo.id,
      photo.storagePath,
      nextFile,
      (progress) => {
        photoUploadProgress.value = progress || 0;
        photoUploadProgressText.value = `更新中：${photo.fileName || "照片"}`;
      },
    );
    const nextMap = { ...replacePhotoFiles.value };
    delete nextMap[photo.id];
    replacePhotoFiles.value = nextMap;
    await loadActiveOrderPhotos();
    photoUploadProgress.value = 1;
    photoUploadProgressText.value = "更新完成";
  } catch (e) {
    console.error("替換照片失敗：", e);
    void logClientUploadError(
      e,
      buildUploadDebugContext("replace-photo", {
        orderDocId: String(activePhotoOrder.value?.id || ""),
        orderNumber: String(activePhotoOrder.value?.orderNumber || ""),
        fileName: String(nextFile?.name || photo?.fileName || ""),
      }),
    );
    alert(toErrorText("替換照片失敗", e));
  }
  photoSaving.value = false;
}

async function deletePhotoForActiveOrder(photo) {
  if (!activePhotoOrder.value?.id || !photo?.id) return;
  if (!confirm("確定要刪除這張照片嗎？")) return;

  photoSaving.value = true;
  try {
    await deleteOrderCompletionPhoto(
      activePhotoOrder.value.id,
      photo.id,
      photo.storagePath,
    );
    await loadActiveOrderPhotos();
  } catch (e) {
    console.error("刪除照片失敗：", e);
    void logClientUploadError(
      e,
      buildUploadDebugContext("delete-photo", {
        orderDocId: String(activePhotoOrder.value?.id || ""),
        orderNumber: String(activePhotoOrder.value?.orderNumber || ""),
        fileName: String(photo?.fileName || ""),
      }),
    );
    alert(toErrorText("刪除照片失敗", e));
  }
  photoSaving.value = false;
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
  const t0 = Date.now();
  try {
    results.value = await queryCollection(COLLECTION_NAME, conds);
  } catch (e) {
    console.error("查詢失敗：", e);
    results.value = [];
  }
  queryElapsed.value = Date.now() - t0;
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
    const t0 = Date.now();
    try {
      results.value = await queryCollection(COLLECTION_NAME, [
        { field: dateField.value, op: "==", value: str },
      ]);
    } catch (e) {
      console.error("字串日期查詢失敗：", e);
      results.value = [];
    }
    queryElapsed.value = Date.now() - t0;
    loading.value = false;
    return;
  }
  const { start, end } = getDayRangeForOffset(offset);
  loading.value = true;
  const t1 = Date.now();
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
  queryElapsed.value = Date.now() - t1;
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
  queryElapsed.value = null;
  photoStatusByOrderId.value = {};
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
  // Always use the NUMERIC part as lower bound so that searching "27298" or "27298ACU"
  // both produce the same range ["27298", "27299"), which correctly includes all orders
  // whose 訂單號碼 starts with the same number.
  const rawInput = String(orderNumber.value).trim();
  const nextNum = parseInt(rawInput, 10);
  if (isNaN(nextNum)) {
    alert("訂單號碼必須以數字開頭");
    return;
  }
  const numericPrefix = String(nextNum); // "27298"
  const nextPrefix = String(nextNum + 1); // "27299"

  // Always query by order number range only — no compound query (Firestore needs a
  // composite index for multi-field range queries which is not configured).
  // Filter by the full typed string and date client-side.
  loading.value = true;
  const t0 = Date.now();
  try {
    let rows = await queryOrdersThenPendingByOrderNo(numericPrefix, nextPrefix);
    console.log(
      "[查訂單] range query rows:",
      rows.length,
      rows.map((r) => r["訂單號碼"] || r.orderNo),
    );

    // If the user typed a suffix (letters), narrow client-side to orders that start
    // with the full input string (case-insensitive).
    const inputUpper = rawInput.toUpperCase();
    if (rawInput.length > numericPrefix.length && rows.length) {
      const exact = rows.filter((doc) =>
        String(doc["訂單號碼"] || "")
          .toUpperCase()
          .startsWith(inputUpper),
      );
      if (exact.length) rows = exact;
    }

    // Range query on PendingOrders may silently fail (index issue);
    // always also try keyword search for the numeric prefix to ensure 未派車 orders are found.
    const pendingFromKeyword = await searchPendingOrdersByKeyword(
      numericPrefix,
    ).catch((e) => {
      console.warn("[查訂單] keyword search failed:", e);
      return [];
    });
    console.log(
      "[查訂單] keyword search results:",
      pendingFromKeyword.length,
      pendingFromKeyword.map((r) => r.orderNo || r["訂單號碼"]),
    );
    if (pendingFromKeyword.length) {
      const inputUpper2 = rawInput.toUpperCase();
      const pendingFiltered = normalizeRowsForTable(pendingFromKeyword).filter(
        (doc) => {
          const no = String(doc["訂單號碼"] || doc.orderNo || "").toUpperCase();
          return no.startsWith(inputUpper2) || no.startsWith(numericPrefix);
        },
      );
      // Merge: add any that are not already in rows (by 訂單號碼)
      const existingNos = new Set(
        rows.map((r) => String(r["訂單號碼"] || "").trim()),
      );
      for (const p of pendingFiltered) {
        const pNo = String(p["訂單號碼"] || p.orderNo || "").trim();
        if (pNo && !existingNos.has(pNo)) {
          rows.push(p);
        }
      }
    }
    console.log("[查訂單] final rows:", rows.length);

    // If a date was provided, narrow down client-side by 安裝日 (YYYY-MM-DD comparison).
    if (orderDate.value && rows.length) {
      const targetYmd = orderDate.value; // already "YYYY-MM-DD" from <input type="date">
      const filtered = rows.filter(
        (doc) => normalizeDateToYmd(doc["安裝日"]) === targetYmd,
      );
      // Only apply the filter when it actually narrows results; otherwise show all matches.
      if (filtered.length) rows = filtered;
    }

    results.value = rows;
  } catch (e) {
    console.error("查詢訂單失敗：", e);
    results.value = [];
  }
  queryElapsed.value = Date.now() - t0;
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
  const t0 = Date.now();
  try {
    results.value = await searchOrdersByKeyword(keyword.value);
    if (!results.value.length) {
      const pending = await searchPendingOrdersByKeyword(keyword.value);
      results.value = normalizeRowsForTable(pending);
    }
  } catch (e) {
    console.error("關鍵字查詢失敗：", e);
    results.value = [];
  }
  queryElapsed.value = Date.now() - t0;
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
  const t0 = Date.now();
  try {
    const callable = httpsCallable(functionsInstance, "searchOrdersByKeywords");
    const resp = await callable({ keywords });
    results.value = resp.data || [];
    if (!results.value.length) {
      const pending = await searchPendingOrdersByKeywords(keywords);
      results.value = normalizeRowsForTable(pending);
    }
    updateTableHeaders();
  } catch (e) {
    try {
      const pending = await searchPendingOrdersByKeywords(keywords);
      results.value = normalizeRowsForTable(pending);
      updateTableHeaders();
    } catch (fallbackErr) {
      alert("查詢失敗: " + fallbackErr);
      results.value = [];
    }
  }
  queryElapsed.value = Date.now() - t0;
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
    const t0 = Date.now();
    try {
      results.value = await queryCollection(COLLECTION_NAME, [
        { field: dateField.value, op: "==", value: str },
      ]);
    } catch (e) {
      console.error("指定日期查詢失敗：", e);
      results.value = [];
    }
    queryElapsed.value = Date.now() - t0;
    loading.value = false;
    return;
  }
  const range = parseDateInputToRange(orderDate.value);
  if (!range) return;
  updateTableHeaders();
  loading.value = true;
  const t1 = Date.now();
  try {
    results.value = await queryCollection(COLLECTION_NAME, [
      { field: dateField.value, op: ">=", value: range.start },
      { field: dateField.value, op: "<", value: range.end },
    ]);
  } catch (e) {
    console.error("指定日期查詢失敗：", e);
    results.value = [];
  }
  queryElapsed.value = Date.now() - t1;
  loading.value = false;
}

// 可選：預先檢查是否為員工（路由守衛已做主要檢查）
onMounted(() => {
  // default to orders preset for ease of use
  subscribeAuthState(async (user) => {
    if (!user) return;
    const doc = await getUserByUid(user.uid);
    if (!doc || !["員工", "管理者", "admin"].includes(doc.role)) {
      // 非員工仍可嘗試，但通常路由會阻擋
      console.warn("非員工帳號存取員工頁面");
    }
  });
});

watch(results, () => {
  refreshCompletionPhotoStatusForResults();
});
</script>

<style scoped>
.version-pill {
  font-size: 0.78rem;
  color: #374151;
  background: #f3f4f6;
  border: 1px solid #d1d5db;
  border-radius: 999px;
  padding: 0.2rem 0.55rem;
  white-space: nowrap;
}

.summary-row {
  display: flex;
  gap: 1rem;
  margin: 0.75rem 0;
  font-weight: 600;
}

.query-elapsed {
  color: #6b7280;
  font-weight: 400;
  font-size: 0.85em;
}

.condition-row {
  padding: 0.55rem;
  border: 1px dashed #d1d5db;
  border-radius: 10px;
}

.orders-table th.compact-col,
.orders-table td.compact-col {
  width: auto !important;
  min-width: max-content !important;
  max-width: none !important;
  white-space: nowrap;
}

.orders-table th.sales-col,
.orders-table td.sales-col {
  width: auto !important;
  min-width: max-content !important;
  max-width: none !important;
  white-space: nowrap;
}

.orders-table th.operator-col,
.orders-table td.operator-col {
  width: auto !important;
  min-width: max-content !important;
  max-width: none !important;
  white-space: nowrap;
}

.orders-table th.photo-col,
.orders-table td.photo-col {
  width: auto !important;
  min-width: max-content !important;
  max-width: none !important;
}

.btn-photo-manage {
  padding: 0.3rem 0.45rem;
  font-size: 0.82rem;
  white-space: nowrap;
}

.order-pdf-link {
  color: #2563eb;
  text-decoration: underline;
  cursor: pointer;
  white-space: nowrap;
}
.order-pdf-link:hover {
  color: #1d4ed8;
}

.photo-modal-mask {
  position: fixed;
  inset: 0;
  background: rgba(17, 24, 39, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 25;
  padding: 1rem;
}

.photo-modal-card {
  width: min(1080px, 96vw);
  max-height: 88vh;
  overflow: auto;
  background: #fff;
  border-radius: 12px;
  border: 1px solid #e5e7eb;
  padding: 0.9rem;
}

.photo-modal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.8rem;
  margin-bottom: 0.75rem;
}

.photo-modal-head h3 {
  margin: 0;
  font-size: 1.05rem;
}

.photo-upload-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  align-items: center;
  margin-bottom: 0.85rem;
}

.upload-progress-wrap {
  margin: 0 0 0.85rem;
}

.upload-progress-head {
  display: flex;
  justify-content: space-between;
  font-size: 0.82rem;
  color: #374151;
  margin-bottom: 0.25rem;
}

.upload-progress-track {
  width: 100%;
  height: 8px;
  border-radius: 999px;
  background: #e5e7eb;
  overflow: hidden;
}

.upload-progress-fill {
  height: 100%;
  background: #0d6efd;
  transition: width 0.12s linear;
}

.photo-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
  gap: 0.85rem;
}

.photo-share-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.6rem;
  margin-bottom: 0.65rem;
}

.photo-item {
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 0.55rem;
  background: #f8fafc;
}

.photo-select-row {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.82rem;
  color: #374151;
  margin-bottom: 0.35rem;
}

.photo-preview {
  width: 100%;
  height: 160px;
  object-fit: cover;
  border-radius: 8px;
  background: #fff;
}

.photo-meta {
  margin-top: 0.45rem;
  font-size: 0.82rem;
  color: #374151;
  display: grid;
  gap: 0.2rem;
}

.photo-actions {
  margin-top: 0.5rem;
  display: grid;
  gap: 0.4rem;
}

.replace-file-input {
  height: auto;
  padding: 0;
}
</style>
