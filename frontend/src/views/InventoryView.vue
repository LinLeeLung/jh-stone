<template>
  <section class="page-card">
    <div class="page-head">
      <h1>庫存查詢</h1>
    </div>

    <div class="toolbar-row">
      <div class="field-item tight">
        <label>品牌：</label>
        <select v-model="selectedBrand" @change="onBrandChange">
          <option value="">請選擇品牌</option>
          <option v-for="brand in brands" :key="brand.name" :value="brand.name">
            {{ brand.name }}
          </option>
        </select>
      </div>

      <div class="field-item tight">
        <label>顏色：</label>
        <select v-model="selectedColorKey" :disabled="!selectedBrand">
          <option value="">請選擇顏色</option>
          <option
            v-for="item in brandColors"
            :key="`${item.sheetId}-${item.gid}-${item.color}`"
            :value="`${item.sheetId}|${item.gid}`"
          >
            {{ item.color }}
          </option>
        </select>
      </div>

      <a
        v-if="selectedOfficialSite"
        class="btn-aux"
        :href="selectedOfficialSite"
        target="_blank"
        rel="noopener noreferrer"
      >
        官網
      </a>

    </div>

    <div class="toolbar-row">
      <label class="check-inline">
        <input type="radio" value="leftover" v-model="inventoryMode" />
        餘料
      </label>
      <label class="check-inline">
        <input type="radio" value="big" v-model="inventoryMode" />
        大板
      </label>
      <label class="check-inline">
        <input type="radio" value="used" v-model="inventoryMode" />
        已使用
      </label>
    </div>

    <div class="toolbar-row">
      <label class="check-inline">
        <input type="checkbox" v-model="sizeConditionEnabled" />
        尺寸條件
      </label>

      <div class="field-item tight size-input">
        <label>長：</label>
        <input type="number" v-model.number="conditionLen" min="0" />
      </div>
      <div class="field-item tight size-input">
        <label>寬：</label>
        <input type="number" v-model.number="conditionWid" min="0" />
      </div>
    </div>

    <div v-if="selectedColor" class="photo-manage-wrap">
      <h3 class="photo-manage-title">石材照片</h3>

      <div v-if="selectedColor.imageUrl" class="preview-wrap">
        <img
          class="color-preview"
          :src="selectedColor.imageUrl"
          alt="石材照片"
        />
      </div>
      <p v-else class="muted-text">目前沒有照片，可用下方方式更新。</p>

      <div v-if="isAdmin" class="toolbar-row photo-edit-row">
        <label class="check-inline">
          <input type="checkbox" v-model="showPhotoEditors" />
          是否顯示
        </label>
      </div>

      <div v-if="isAdmin && showPhotoEditors" class="toolbar-row photo-edit-row">
        <div class="field-item">
          <label>照片網址：</label>
          <input
            v-model.trim="photoUrlInput"
            placeholder="https://junchengstone.synology.me/myphoto/cs/012.jpg"
          />
        </div>
        <button
          class="btn-query"
          :disabled="photoSaving || photoUploading || !canSavePhotoUrl"
          @click="saveSelectedPhotoUrl"
        >
          {{ photoSaving ? "更新中..." : "更新網址" }}
        </button>
      </div>

      <div v-if="isAdmin && showPhotoEditors" class="toolbar-row photo-edit-row">
        <div class="field-item">
          <label>上傳照片：</label>
          <input
            :key="photoFileInputKey"
            type="file"
            accept="image/*"
            @change="onPhotoFileSelected"
          />
        </div>
        <button
          class="btn-query"
          :disabled="photoSaving || photoUploading || !photoFile"
          @click="uploadSelectedPhoto"
        >
          {{ photoUploading ? "上傳中..." : "上傳並更新" }}
        </button>
        <span v-if="photoUploading" class="muted-text">
          上傳進度：{{ uploadProgressText }}
        </span>
      </div>

      <p v-if="!isAdmin" class="muted-text">只有管理者 / admin 登入時才可更新網址與上傳照片。</p>

      <p v-if="photoMessage" class="master-message">{{ photoMessage }}</p>
    </div>

    <p v-if="errorMessage" class="error-text">{{ errorMessage }}</p>
    <p v-if="masterMessage" class="master-message">{{ masterMessage }}</p>

    <p v-if="tableRows.length" class="muted-text">{{ tableTitle }}</p>

    <div v-if="tableRows.length" class="table-wrap">
      <table class="data-table orders-table">
        <thead>
          <tr>
            <th>序號</th>
            <th
              v-for="(h, idx) in displayedHeaders"
              :key="`${h}-${idx}`"
              :class="{ 'sortable-header': isToneHeader(h) }"
              @click="toggleToneSort(h)"
            >
              {{ h }}
              <span v-if="isToneHeader(h) && toneSortOrder === 'asc'">▲</span>
              <span v-if="isToneHeader(h) && toneSortOrder === 'desc'">▼</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(row, index) in displayedTableRows"
            :key="`${index}-${row[0] || ''}`"
          >
            <td>{{ index + 1 }}</td>
            <td v-for="col in displayedColumnIndexes" :key="col">
              {{ row[col] || "" }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<script setup>
import { computed, onMounted, ref, watch } from "vue";
import {
  getUserByUid,
  listInventoryColors,
  subscribeAuthState,
  upsertInventoryColor,
  uploadInventoryColorPhoto,
} from "../firebase";

const BRAND_CSV_URL =
  "https://docs.google.com/spreadsheets/d/10Gkhuq2iwlpQfw0e-uvP_9UuE1efee_5v7iHX4srW8s/export?format=csv&gid=0";
const COLOR_CSV_URL =
  "https://docs.google.com/spreadsheets/d/10Gkhuq2iwlpQfw0e-uvP_9UuE1efee_5v7iHX4srW8s/export?format=csv&gid=494306116";

const OFFICIAL_SITE_MAP = {
  帝通石: "https://silestone.coallmax.com/coallmax2.asp?kind=7",
  耐麗石: "https://www.twneoreach.com/neolith2_4_all.asp?kind=8&kind2=55",
  鈦鋼石: "https://www.enovate.com.tw/products",
  ABK: "https://www.marmotaiwan.com/product-detail/Size/1635x323/",
  晶華石: "https://junchengstone.synology.me/product31.php",
  可樂石: "https://www.a-cornerstone.com/index.php/zh-tw/",
  富佰特s系列: "https://forbetter6.webnode.tw/%E6%9C%8D%E5%8B%99/",
  賽麗石: "https://silestone.coallmax.com/coallmax2.asp?kind=8",
  闊石: "https://qjquartzstone.com.tw/product.php?pid=5",
  杜邦石: "https://www.thecorian.com/colors",
};

const brands = ref([]);
const colorCatalog = ref([]);
const selectedBrand = ref("");
const selectedColorKey = ref("");

const loading = ref(false);
const errorMessage = ref("");
const abkSyncing = ref(false);
const kuoshiSyncing = ref(false);
const kuoshiPreviewing = ref(false);
const kuoshiPreviewRows = ref([]);
const masterMessage = ref("");
const silestoneSyncing = ref(false);
const ditongSyncing = ref(false);
const neolithSyncing = ref(false);
const tigangSyncing = ref(false);
const tigangPreviewing = ref(false);
const tigangPreviewRows = ref([]);

const inventoryMode = ref("leftover");
const sizeConditionEnabled = ref(false);
const conditionLen = ref(null);
const conditionWid = ref(null);

const tableHeaders = ref([]);
const tableRows = ref([]);
const tableTitle = ref("");
const summary = ref(null);
const toneSortOrder = ref("");
const toneSortHeader = ref("");
const photoUrlInput = ref("");
const photoSaving = ref(false);
const photoUploading = ref(false);
const photoMessage = ref("");
const photoFile = ref(null);
const photoUploadProgress = ref(0);
const photoFileInputKey = ref(0);
const showPhotoEditors = ref(false);
const currentUserDoc = ref(null);

const brandColors = computed(() =>
  colorCatalog.value.filter((row) => row.brand === selectedBrand.value),
);

const selectedColor = computed(() => {
  const [sheetId, gid] = String(selectedColorKey.value || "").split("|");
  if (!sheetId || !gid) return null;
  return (
    brandColors.value.find(
      (item) => item.sheetId === sheetId && item.gid === gid,
    ) || null
  );
});

const selectedOfficialSite = computed(() => {
  const brandName = String(selectedBrand.value || "").trim();
  if (!brandName) return "";

  const mappedUrl = OFFICIAL_SITE_MAP[brandName];
  if (mappedUrl) return mappedUrl;

  const row = brands.value.find((item) => item.name === brandName);
  return String(row?.url || "").trim();
});

const isAdmin = computed(() => {
  const role = String(currentUserDoc.value?.role || "").trim();
  const normalizedRole = role.toLowerCase();
  return normalizedRole === "admin" || role === "管理者";
});

const canSavePhotoUrl = computed(() => {
  const current = String(selectedColor.value?.imageUrl || "").trim();
  const next = String(photoUrlInput.value || "").trim();
  if (!selectedColor.value) return false;
  return current !== next;
});

const uploadProgressText = computed(() => {
  const ratio = Number(photoUploadProgress.value || 0);
  const percent = Math.round(Math.min(1, Math.max(0, ratio)) * 100);
  return `${percent}%`;
});

const displayedColumnIndexes = computed(() => {
  if (!tableHeaders.value.length) return [];
  const stopAt = tableHeaders.value.findIndex((header) => {
    const text = String(header || "").trim();
    return text === "面積" || text === "結帳使用日";
  });
  const endIndex =
    stopAt >= 0 ? stopAt : Math.min(15, tableHeaders.value.length);
  return Array.from({ length: Math.max(0, endIndex) }, (_, i) => i);
});

const displayedHeaders = computed(() =>
  displayedColumnIndexes.value.map((index) => tableHeaders.value[index] || ""),
);

const toneSortColumnIndex = computed(() => {
  const preferred = String(toneSortHeader.value || "").trim();
  const aliases = [preferred, "色調", "批號"].filter(Boolean);
  for (const alias of aliases) {
    const index = tableHeaders.value.findIndex(
      (header) => String(header || "").trim() === alias,
    );
    if (index >= 0) return index;
  }
  return -1;
});

const displayedTableRows = computed(() => {
  if (!tableRows.value.length) return [];
  if (!toneSortOrder.value) return tableRows.value;

  const columnIndex = toneSortColumnIndex.value;
  if (columnIndex < 0) return tableRows.value;

  const sorted = [...tableRows.value].sort((left, right) => {
    const a = String(left[columnIndex] || "").trim();
    const b = String(right[columnIndex] || "").trim();
    const result = a.localeCompare(b, "zh-Hant");
    return toneSortOrder.value === "asc" ? result : -result;
  });

  return sorted;
});

function isToneHeader(header = "") {
  const text = String(header || "").trim();
  return text === "色調" || text === "批號";
}

function toggleToneSort(header = "") {
  const text = String(header || "").trim();
  if (!isToneHeader(text)) return;

  if (toneSortHeader.value !== text) {
    toneSortHeader.value = text;
    toneSortOrder.value = "asc";
    return;
  }

  if (!toneSortOrder.value) {
    toneSortOrder.value = "asc";
    return;
  }
  if (toneSortOrder.value === "asc") {
    toneSortOrder.value = "desc";
    return;
  }
  toneSortOrder.value = "";
}

function parseCsv(text = "") {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  const commitField = () => {
    row.push(field);
    field = "";
  };

  const commitRow = () => {
    const hasValue = row.some((col) => String(col || "").trim().length > 0);
    if (hasValue) {
      if (!rows.length && row.length) {
        row[0] = String(row[0] || "").replace(/^\uFEFF/, "");
      }
      rows.push(row);
    }
    row = [];
  };

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const nextChar = text[index + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        field += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      commitField();
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      commitField();
      commitRow();
      if (char === "\r" && nextChar === "\n") {
        index += 1;
      }
      continue;
    }

    field += char;
  }

  if (field.length > 0 || row.length > 0) {
    commitField();
    commitRow();
  }

  return rows;
}

function normalizeHeader(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
}

function buildHeaderIndexMap(headerRow = []) {
  const map = new Map();
  headerRow.forEach((header, index) => {
    map.set(normalizeHeader(header), index);
  });
  return map;
}

function getIndexByAliases(indexMap, aliases = [], fallback = -1) {
  for (const alias of aliases) {
    const key = normalizeHeader(alias);
    if (indexMap.has(key)) {
      return indexMap.get(key);
    }
  }
  return fallback;
}

function getCell(row = [], index = -1) {
  if (index < 0) return "";
  return String(row[index] || "").trim();
}

function existsFlag(value = "") {
  const text = String(value || "");
  return !(text.includes("n") || text.includes("N") || text.includes("Ｎ"));
}

function hasText(value = "") {
  return String(value || "").trim().length > 0;
}

function hasSizeInput(value) {
  if (value === null || value === undefined || value === "") return false;
  return !Number.isNaN(Number(value));
}

function normalizeMappingKey(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s\-_/｜|()（）·•.,:：'"`]/g, "");
}

function toPermissionMessage(error, fallback = "操作失敗") {
  const code = String(error?.code || "").toLowerCase();
  const message = String(error?.message || "").toLowerCase();

  if (
    code.startsWith("storage/") ||
    code.includes("storage") ||
    message.includes("firebase storage") ||
    message.includes("storage/") ||
    message.includes("does not have permission")
  ) {
    return "Storage 權限不足：請確認已部署最新 Storage 規則，且目前帳號角色為 員工/管理者/admin";
  }

  if (
    code.includes("permission-denied") ||
    message.includes("insufficient permissions")
  ) {
    return "Firestore 權限不足：請確認已部署最新 Firestore 規則，且目前帳號角色為 員工/管理者/admin";
  }
  return String(error?.message || fallback);
}

function meetsSizeCondition(row) {
  if (!sizeConditionEnabled.value) return true;

  const len = Number(conditionLen.value);
  const wid = Number(conditionWid.value);
  if (Number.isNaN(len) || Number.isNaN(wid) || len <= 0 || wid <= 0) {
    return true;
  }

  const rowLen = Number(row[7]);
  const rowWid = Number(row[8]);
  if (Number.isNaN(rowLen) || Number.isNaN(rowWid)) return false;

  return (rowLen >= len && rowWid >= wid) || (rowWid >= len && rowLen >= wid);
}

function sortByAreaAsc(rows = []) {
  return [...rows].sort(
    (left, right) => Number(left[15] || 0) - Number(right[15] || 0),
  );
}

async function fetchCsv(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`讀取失敗：${response.status}`);
  }
  return parseCsv(await response.text());
}

async function loadMasterData() {
  const [brandRows, colorRows] = await Promise.all([
    fetchCsv(BRAND_CSV_URL),
    fetchCsv(COLOR_CSV_URL),
  ]);

  const brandHasHeader = ["品牌", "brand"].includes(
    normalizeHeader(brandRows[0]?.[0] || ""),
  );
  const brandDataRows = brandHasHeader ? brandRows.slice(1) : brandRows;

  brands.value = brandDataRows
    .map((row) => ({
      name: String(row[0] || "").trim(),
      url: String(row[1] || "").trim(),
    }))
    .filter((row) => row.name);

  const colorHeaderRow = colorRows[0] || [];
  const colorHeaderMap = buildHeaderIndexMap(colorHeaderRow);
  const headerHitCount = ["品牌", "色號", "id", "gid", "圖片網址", "status"]
    .map((name) => normalizeHeader(name))
    .filter((key) => colorHeaderMap.has(key)).length;
  const colorHasHeader = headerHitCount >= 2;
  const colorDataRows = colorHasHeader ? colorRows.slice(1) : colorRows;

  const brandIndex = colorHasHeader
    ? getIndexByAliases(colorHeaderMap, ["品牌", "brand"], 0)
    : 0;
  const colorIndex = colorHasHeader
    ? getIndexByAliases(colorHeaderMap, ["色號", "顏色", "color"], 1)
    : 1;
  const sheetIdIndex = colorHasHeader
    ? getIndexByAliases(colorHeaderMap, ["id", "sheetid"], 2)
    : 2;
  const gidIndex = colorHasHeader
    ? getIndexByAliases(colorHeaderMap, ["gid"], 3)
    : 3;
  const imageUrlIndex = colorHasHeader
    ? getIndexByAliases(
        colorHeaderMap,
        ["圖片網址", "圖片url", "url", "imageurl"],
        4,
      )
    : 4;
  const statusIndex = colorHasHeader
    ? getIndexByAliases(colorHeaderMap, ["status", "狀態"], 5)
    : 5;

  const csvColors = colorDataRows
    .map((row) => ({
      brand: getCell(row, brandIndex),
      color: getCell(row, colorIndex),
      sheetId: getCell(row, sheetIdIndex),
      gid: getCell(row, gidIndex),
      imageUrl: getCell(row, imageUrlIndex),
      status: getCell(row, statusIndex),
    }))
    .filter((row) => row.brand && row.color && row.sheetId && row.gid);

  try {
    const firestoreColors = await listInventoryColors();
    const normalizedFirestoreColors = firestoreColors
      .map((row) => ({
        brand: String(row.brand || "").trim(),
        color: String(row.color || "").trim(),
        sheetId: String(row.sheetId || "").trim(),
        gid: String(row.gid || "").trim(),
        imageUrl: String(row.imageUrl || "").trim(),
        status: String(row.status || "").trim(),
      }))
      .filter((row) => row.brand && row.color && row.sheetId && row.gid);

    if (!normalizedFirestoreColors.length) {
      colorCatalog.value = csvColors;
      return;
    }

    const keyOf = (row) => `${row.sheetId}|${row.gid}`;
    const firestoreMap = new Map(
      normalizedFirestoreColors.map((row) => [keyOf(row), row]),
    );
    const csvKeys = new Set(csvColors.map((row) => keyOf(row)));

    const merged = csvColors.map((row) => firestoreMap.get(keyOf(row)) || row);
    normalizedFirestoreColors.forEach((row) => {
      if (!csvKeys.has(keyOf(row))) {
        merged.push(row);
      }
    });

    colorCatalog.value = merged.sort((left, right) => {
      const a = `${String(left.brand || "")}|${String(left.color || "")}`;
      const b = `${String(right.brand || "")}|${String(right.color || "")}`;
      return a.localeCompare(b, "zh-Hant");
    });
  } catch (error) {
    console.warn("讀取 Firestore 顏色主檔失敗，改用 CSV：", error);
    masterMessage.value = toPermissionMessage(
      error,
      "讀取 Firestore 失敗，已改用 CSV",
    );
    colorCatalog.value = csvColors;
  }
}

function extractColorCode(value = "") {
  const text = String(value || "").toUpperCase();
  const normalized = text.replace(/\s+/g, "");

  const dtMatch = normalized.match(/DT[-_]?([0-9]{2,4})/);
  if (dtMatch) {
    return `DT-${dtMatch[1]}`;
  }

  const csMatch = normalized.match(/CS[-_]?([0-9]{3,4})/);
  if (csMatch) {
    return `CS${csMatch[1]}`;
  }

  return "";
}

function extractNeolithCode(value = "") {
  const text = String(value || "")
    .toUpperCase()
    .replace(/\s+/g, "");
  const match = text.match(/(\d{3}-(?:\d{2}[A-Z]?|[A-Z]\d{2}[A-Z]?))/);
  if (!match) return "";
  return match[1];
}

function extractTiGangCode(value = "") {
  const text = String(value || "")
    .toUpperCase()
    .replace(/\s+/g, "");
  const match = text.match(/([A-Z]{2}[-_]?\d{2})/);
  if (!match) return "";
  return match[1].replace(/[-_]/g, "");
}

function isNonPriorityNeolithColor(value = "") {
  const text = String(value || "");
  return (
    text.includes("停產") || text.includes("期貨") || text.includes("售完為止")
  );
}

function buildNeolithCodeCandidates(value = "") {
  const text = String(value || "")
    .toUpperCase()
    .replace(/\s+/g, "");
  const candidates = [];

  const pushCandidate = (code = "") => {
    const normalized = String(code || "").trim();
    if (!normalized) return;
    if (!candidates.includes(normalized)) {
      candidates.push(normalized);
    }
  };

  const primary = extractNeolithCode(text);
  pushCandidate(primary);

  const trailingLetterCode = primary.match(/^(\d{3})-(\d{2}|[A-Z]\d{2})[A-Z]$/);
  if (trailingLetterCode) {
    pushCandidate(`${trailingLetterCode[1]}-${trailingLetterCode[2]}`);
  }

  const segmentedCode = text.match(/(\d{3})-(\d{2})-[A-Z0-9]+/);
  if (segmentedCode) {
    pushCandidate(`${segmentedCode[1]}-${segmentedCode[2]}`);
  }

  const genericBaseCode = text.match(/(\d{3})-(\d{2})[A-Z0-9]*/);
  if (genericBaseCode) {
    pushCandidate(`${genericBaseCode[1]}-${genericBaseCode[2]}`);
  }

  return candidates;
}

function findNeolithImageUrl(imageMap, colorValue = "") {
  const candidates = buildNeolithCodeCandidates(colorValue);
  for (const code of candidates) {
    if (imageMap.has(code)) {
      return imageMap.get(code);
    }
  }
  return "";
}

async function loadSilestoneImageMap() {
  const mappingPath = "/silestone-image-mapping.csv";
  const response = await fetch(mappingPath, {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(
      `讀取賽麗石對照檔失敗（${mappingPath}）：HTTP ${response.status}`,
    );
  }

  const rows = parseCsv(await response.text());
  if (!rows.length) return new Map();

  const header = rows[0] || [];
  const map = buildHeaderIndexMap(header);
  const codeIndex = getIndexByAliases(map, ["color", "色號", "code"], 1);
  const urlIndex = getIndexByAliases(
    map,
    ["imageurl", "圖片網址", "圖片位址", "url"],
    2,
  );

  return new Map(
    rows
      .slice(1)
      .map((row) => ({
        code: extractColorCode(getCell(row, codeIndex)),
        imageUrl: getCell(row, urlIndex),
      }))
      .filter((row) => row.code && row.imageUrl)
      .map((row) => [row.code, row.imageUrl]),
  );
}

async function applySilestoneImageUrls() {
  silestoneSyncing.value = true;
  masterMessage.value = "";
  try {
    const imageMap = await loadSilestoneImageMap();
    if (!imageMap.size) {
      throw new Error("賽麗石對照檔沒有可用資料");
    }

    const silestoneRows = colorCatalog.value.filter((row) => {
      const brand = String(row.brand || "").trim();
      return brand.startsWith("賽麗石");
    });

    const rowsWithCode = silestoneRows.filter((row) => {
      const code = extractColorCode(row.color);
      return Boolean(code);
    });

    const targets = rowsWithCode.filter((row) => {
      const code = extractColorCode(row.color);
      if (!imageMap.has(code)) return false;
      const currentUrl = String(row.imageUrl || "").trim();
      return !currentUrl;
    });

    if (!targets.length) {
      masterMessage.value = `賽麗石目前沒有可回填項目（品牌 ${silestoneRows.length} 筆、可辨識代碼 ${rowsWithCode.length} 筆、官網對照 ${imageMap.size} 筆）`;
      return;
    }

    let updated = 0;
    for (const row of targets) {
      const code = extractColorCode(row.color);
      const imageUrl = imageMap.get(code);
      if (!imageUrl) continue;

      await upsertInventoryColor({
        brand: row.brand,
        color: row.color,
        sheetId: row.sheetId,
        gid: row.gid,
        imageUrl,
        status: row.status || "active",
      });
      updated += 1;
    }

    await loadMasterData();
    masterMessage.value = `已回填賽麗石照片 ${updated} 筆（品牌 ${silestoneRows.length} 筆、可辨識代碼 ${rowsWithCode.length} 筆、符合對照且缺圖 ${targets.length} 筆）`;
  } catch (error) {
    console.error("回填賽麗石照片失敗:", error);
    masterMessage.value = toPermissionMessage(error, "回填賽麗石照片失敗");
  } finally {
    silestoneSyncing.value = false;
  }
}

async function loadDitongImageMap() {
  const mappingPath = "/ditong-image-mapping.csv";
  const response = await fetch(mappingPath, {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(
      `讀取帝通石對照檔失敗（${mappingPath}）：HTTP ${response.status}`,
    );
  }

  const rows = parseCsv(await response.text());
  if (!rows.length) return new Map();

  const header = rows[0] || [];
  const map = buildHeaderIndexMap(header);
  const codeIndex = getIndexByAliases(map, ["color", "色號", "code"], 1);
  const urlIndex = getIndexByAliases(
    map,
    ["imageurl", "圖片網址", "圖片位址", "url"],
    2,
  );

  return new Map(
    rows
      .slice(1)
      .map((row) => ({
        code: extractColorCode(getCell(row, codeIndex)),
        imageUrl: getCell(row, urlIndex),
      }))
      .filter((row) => row.code && row.imageUrl)
      .map((row) => [row.code, row.imageUrl]),
  );
}

async function loadNeolithImageMap() {
  const mappingPath = "/neolith-image-mapping.csv";
  const response = await fetch(mappingPath, {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(
      `讀取耐麗石對照檔失敗（${mappingPath}）：HTTP ${response.status}`,
    );
  }

  const rows = parseCsv(await response.text());
  if (!rows.length) return new Map();

  const header = rows[0] || [];
  const map = buildHeaderIndexMap(header);
  const codeIndex = getIndexByAliases(map, ["color", "色號", "code"], 1);
  const urlIndex = getIndexByAliases(
    map,
    ["imageurl", "圖片網址", "圖片位址", "url"],
    2,
  );

  const imageMap = new Map();
  rows.slice(1).forEach((row) => {
    const codeText = getCell(row, codeIndex);
    const imageUrl = getCell(row, urlIndex);
    if (!imageUrl) return;

    const candidates = buildNeolithCodeCandidates(codeText);
    candidates.forEach((code) => {
      if (!code || imageMap.has(code)) return;
      imageMap.set(code, imageUrl);
    });
  });

  return imageMap;
}

async function loadTiGangImageMap() {
  const mappingPath = "/tigang-image-mapping.csv";
  const response = await fetch(mappingPath, {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(
      `讀取鈦鋼石對照檔失敗（${mappingPath}）：HTTP ${response.status}`,
    );
  }

  const rows = parseCsv(await response.text());
  if (!rows.length) return new Map();

  const header = rows[0] || [];
  const map = buildHeaderIndexMap(header);
  const codeIndex = getIndexByAliases(map, ["color", "色號", "code"], 1);
  const urlIndex = getIndexByAliases(
    map,
    ["imageurl", "圖片網址", "圖片位址", "url"],
    2,
  );

  return new Map(
    rows
      .slice(1)
      .map((row) => ({
        code: extractTiGangCode(getCell(row, codeIndex)),
        imageUrl: getCell(row, urlIndex),
      }))
      .filter((row) => row.code && row.imageUrl)
      .map((row) => [row.code, row.imageUrl]),
  );
}

async function loadAbkImageMap() {
  const mappingPath = "/abk-image-mapping.csv";
  const response = await fetch(mappingPath, {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(
      `讀取 ABK 對照檔失敗（${mappingPath}）：HTTP ${response.status}`,
    );
  }

  const rows = parseCsv(await response.text());
  if (!rows.length) return new Map();

  const header = rows[0] || [];
  const map = buildHeaderIndexMap(header);
  const colorIndex = getIndexByAliases(
    map,
    ["color", "色號", "顏色", "code"],
    1,
  );
  const urlIndex = getIndexByAliases(
    map,
    ["imageurl", "圖片網址", "圖片位址", "url"],
    2,
  );

  const imageMap = new Map();
  rows.slice(1).forEach((row) => {
    const key = normalizeMappingKey(getCell(row, colorIndex));
    const imageUrl = getCell(row, urlIndex);
    if (!key || !imageUrl || imageMap.has(key)) return;
    imageMap.set(key, imageUrl);
  });

  return imageMap;
}

async function loadKuoshiImageMap() {
  const mappingPath = "/kuoshi-image-mapping.csv";
  const response = await fetch(mappingPath, {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(
      `讀取闊石對照檔失敗（${mappingPath}）：HTTP ${response.status}`,
    );
  }

  const rows = parseCsv(await response.text());
  if (!rows.length) return new Map();

  const header = rows[0] || [];
  const map = buildHeaderIndexMap(header);
  const colorIndex = getIndexByAliases(
    map,
    ["color", "色號", "顏色", "code"],
    1,
  );
  const urlIndex = getIndexByAliases(
    map,
    ["imageurl", "圖片網址", "圖片位址", "url"],
    2,
  );

  const imageMap = new Map();
  rows.slice(1).forEach((row) => {
    const code = normalizeKuoshiCode(getCell(row, colorIndex));
    const imageUrl = getCell(row, urlIndex);
    if (!code || !imageUrl || imageMap.has(code)) return;
    imageMap.set(code, imageUrl);
  });

  return imageMap;
}

function findAbkImageUrl(imageMap, colorValue = "") {
  const key = normalizeMappingKey(colorValue);
  if (!key) return "";

  if (imageMap.has(key)) {
    return imageMap.get(key);
  }

  for (const [candidate, imageUrl] of imageMap.entries()) {
    if (!candidate) continue;
    if (key.includes(candidate) || candidate.includes(key)) {
      return imageUrl;
    }
  }

  return "";
}

function normalizeKuoshiCode(value = "") {
  const upper = String(value || "")
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/_/g, "-");
  const match = upper.match(/^(QJ|MQ|EG)-?([A-Z0-9]+)/);
  if (!match) return "";
  return `${match[1]}-${match[2]}`;
}

function buildKuoshiCodeCandidates(value = "") {
  const text = String(value || "")
    .toUpperCase()
    .replace(/\s+/g, "");

  const candidates = [];
  const pushCandidate = (code = "") => {
    const normalized = normalizeKuoshiCode(code);
    if (!normalized) return;
    if (!candidates.includes(normalized)) {
      candidates.push(normalized);
    }
  };

  const matches = text.match(/(?:QJ|MQ|EG)-?[A-Z0-9]+/g) || [];
  matches.forEach((token) => {
    pushCandidate(token);
    const normalized = normalizeKuoshiCode(token);
    const qjExpanded = normalized.match(/^QJ-2([0-9A-Z]{3,})$/);
    if (qjExpanded) {
      pushCandidate(`QJ-${qjExpanded[1]}`);
    }
  });

  return candidates;
}

function findKuoshiImageUrl(imageMap, colorValue = "") {
  const candidates = buildKuoshiCodeCandidates(colorValue);
  for (const code of candidates) {
    if (imageMap.has(code)) {
      return imageMap.get(code);
    }
  }
  return "";
}

function buildKuoshiBackfillContext(imageMap) {
  const kuoshiRows = colorCatalog.value.filter((row) => {
    const brand = String(row.brand || "").trim();
    return brand.includes("闊石");
  });

  const targets = kuoshiRows.filter((row) => {
    const imageUrl = findKuoshiImageUrl(imageMap, row.color);
    if (!imageUrl) return false;
    const currentUrl = String(row.imageUrl || "").trim();
    return !currentUrl || currentUrl !== imageUrl;
  });

  return {
    kuoshiRows,
    targets,
  };
}

function buildTiGangBackfillContext(imageMap) {
  const tigangRows = colorCatalog.value.filter((row) => {
    const brand = String(row.brand || "").trim();
    return brand.startsWith("鈦鋼石");
  });

  const rowsWithCode = tigangRows.filter((row) => {
    const code = extractTiGangCode(row.color);
    return Boolean(code);
  });

  const targets = rowsWithCode.filter((row) => {
    const code = extractTiGangCode(row.color);
    if (!imageMap.has(code)) return false;
    const currentUrl = String(row.imageUrl || "").trim();
    return !currentUrl;
  });

  return {
    tigangRows,
    rowsWithCode,
    targets,
  };
}

async function previewTiGangImageUrls() {
  tigangPreviewing.value = true;
  masterMessage.value = "";
  try {
    const imageMap = await loadTiGangImageMap();
    if (!imageMap.size) {
      throw new Error("鈦鋼石對照檔沒有可用資料");
    }

    const { tigangRows, rowsWithCode, targets } =
      buildTiGangBackfillContext(imageMap);

    tigangPreviewRows.value = targets.slice(0, 30).map((row) => {
      const code = extractTiGangCode(row.color);
      return {
        ...row,
        code,
        imageUrl: imageMap.get(code) || "",
      };
    });

    masterMessage.value = `鈦鋼石回填預覽完成（品牌 ${tigangRows.length} 筆、可辨識代碼 ${rowsWithCode.length} 筆、符合對照且缺圖 ${targets.length} 筆）`;
  } catch (error) {
    console.error("預覽鈦鋼石回填失敗:", error);
    masterMessage.value = toPermissionMessage(error, "預覽鈦鋼石回填失敗");
    tigangPreviewRows.value = [];
  } finally {
    tigangPreviewing.value = false;
  }
}

async function previewKuoshiImageUrls() {
  kuoshiPreviewing.value = true;
  masterMessage.value = "";
  try {
    const imageMap = await loadKuoshiImageMap();
    if (!imageMap.size) {
      throw new Error("闊石對照檔沒有可用資料");
    }

    const { kuoshiRows, targets } = buildKuoshiBackfillContext(imageMap);

    kuoshiPreviewRows.value = targets.slice(0, 30).map((row) => ({
      ...row,
      codeCandidates: buildKuoshiCodeCandidates(row.color),
      imageUrl: findKuoshiImageUrl(imageMap, row.color) || "",
    }));

    masterMessage.value = `闊石回填預覽完成（品牌 ${kuoshiRows.length} 筆、符合對照且需更新 ${targets.length} 筆）`;
  } catch (error) {
    console.error("預覽闊石回填失敗:", error);
    masterMessage.value = toPermissionMessage(error, "預覽闊石回填失敗");
    kuoshiPreviewRows.value = [];
  } finally {
    kuoshiPreviewing.value = false;
  }
}

async function applyDitongImageUrls() {
  ditongSyncing.value = true;
  masterMessage.value = "";
  try {
    const imageMap = await loadDitongImageMap();
    if (!imageMap.size) {
      throw new Error("帝通石對照檔沒有可用資料");
    }

    const ditongRows = colorCatalog.value.filter((row) => {
      const brand = String(row.brand || "").trim();
      return brand.startsWith("帝通石");
    });

    const rowsWithCode = ditongRows.filter((row) => {
      const code = extractColorCode(row.color);
      return Boolean(code);
    });

    const targets = rowsWithCode.filter((row) => {
      const code = extractColorCode(row.color);
      if (!imageMap.has(code)) return false;
      const currentUrl = String(row.imageUrl || "").trim();
      return !currentUrl;
    });

    if (!targets.length) {
      masterMessage.value = `帝通石目前沒有可回填項目（品牌 ${ditongRows.length} 筆、可辨識代碼 ${rowsWithCode.length} 筆、官網對照 ${imageMap.size} 筆）`;
      return;
    }

    let updated = 0;
    for (const row of targets) {
      const code = extractColorCode(row.color);
      const imageUrl = imageMap.get(code);
      if (!imageUrl) continue;

      await upsertInventoryColor({
        brand: row.brand,
        color: row.color,
        sheetId: row.sheetId,
        gid: row.gid,
        imageUrl,
        status: row.status || "active",
      });
      updated += 1;
    }

    await loadMasterData();
    masterMessage.value = `已回填帝通石照片 ${updated} 筆（品牌 ${ditongRows.length} 筆、可辨識代碼 ${rowsWithCode.length} 筆、符合對照且缺圖 ${targets.length} 筆）`;
  } catch (error) {
    console.error("回填帝通石照片失敗:", error);
    masterMessage.value = toPermissionMessage(error, "回填帝通石照片失敗");
  } finally {
    ditongSyncing.value = false;
  }
}

async function applyNeolithImageUrls() {
  neolithSyncing.value = true;
  masterMessage.value = "";
  try {
    const imageMap = await loadNeolithImageMap();
    if (!imageMap.size) {
      throw new Error("耐麗石對照檔沒有可用資料");
    }

    const neolithRows = colorCatalog.value.filter((row) => {
      const brand = String(row.brand || "").trim();
      return brand.startsWith("耐麗石");
    });

    const activeNeolithRows = neolithRows.filter(
      (row) => !isNonPriorityNeolithColor(row.color),
    );

    const rowsWithCode = activeNeolithRows.filter((row) => {
      const code = extractNeolithCode(row.color);
      return Boolean(code);
    });

    const targets = rowsWithCode.filter((row) => {
      const imageUrl = findNeolithImageUrl(imageMap, row.color);
      if (!imageUrl) return false;
      const currentUrl = String(row.imageUrl || "").trim();
      return !currentUrl;
    });

    if (!targets.length) {
      const ignoredCount = neolithRows.length - activeNeolithRows.length;
      masterMessage.value = `耐麗石目前沒有可回填項目（品牌 ${neolithRows.length} 筆、已排除停產/期貨 ${ignoredCount} 筆、可辨識代碼 ${rowsWithCode.length} 筆、官網對照 ${imageMap.size} 筆）`;
      return;
    }

    let updated = 0;
    for (const row of targets) {
      const imageUrl = findNeolithImageUrl(imageMap, row.color);
      if (!imageUrl) continue;

      await upsertInventoryColor({
        brand: row.brand,
        color: row.color,
        sheetId: row.sheetId,
        gid: row.gid,
        imageUrl,
        status: row.status || "active",
      });
      updated += 1;
    }

    await loadMasterData();
    const ignoredCount = neolithRows.length - activeNeolithRows.length;
    masterMessage.value = `已回填耐麗石照片 ${updated} 筆（品牌 ${neolithRows.length} 筆、已排除停產/期貨 ${ignoredCount} 筆、可辨識代碼 ${rowsWithCode.length} 筆、符合對照且缺圖 ${targets.length} 筆）`;
  } catch (error) {
    console.error("回填耐麗石照片失敗:", error);
    masterMessage.value = toPermissionMessage(error, "回填耐麗石照片失敗");
  } finally {
    neolithSyncing.value = false;
  }
}

async function applyTiGangImageUrls() {
  tigangSyncing.value = true;
  masterMessage.value = "";
  try {
    const imageMap = await loadTiGangImageMap();
    if (!imageMap.size) {
      throw new Error("鈦鋼石對照檔沒有可用資料");
    }

    const { tigangRows, rowsWithCode, targets } =
      buildTiGangBackfillContext(imageMap);

    if (!targets.length) {
      masterMessage.value = `鈦鋼石目前沒有可回填項目（品牌 ${tigangRows.length} 筆、可辨識代碼 ${rowsWithCode.length} 筆、官網對照 ${imageMap.size} 筆）`;
      return;
    }

    let updated = 0;
    for (const row of targets) {
      const code = extractTiGangCode(row.color);
      const imageUrl = imageMap.get(code);
      if (!imageUrl) continue;

      await upsertInventoryColor({
        brand: row.brand,
        color: row.color,
        sheetId: row.sheetId,
        gid: row.gid,
        imageUrl,
        status: row.status || "active",
      });
      updated += 1;
    }

    await loadMasterData();
    tigangPreviewRows.value = [];
    masterMessage.value = `已回填鈦鋼石照片 ${updated} 筆（品牌 ${tigangRows.length} 筆、可辨識代碼 ${rowsWithCode.length} 筆、符合對照且缺圖 ${targets.length} 筆）`;
  } catch (error) {
    console.error("回填鈦鋼石照片失敗:", error);
    masterMessage.value = toPermissionMessage(error, "回填鈦鋼石照片失敗");
  } finally {
    tigangSyncing.value = false;
  }
}

async function applyAbkImageUrls() {
  abkSyncing.value = true;
  masterMessage.value = "";
  try {
    const imageMap = await loadAbkImageMap();
    if (!imageMap.size) {
      throw new Error("ABK 對照檔沒有可用資料");
    }

    const abkRows = colorCatalog.value.filter((row) => {
      const brand = String(row.brand || "").trim();
      return brand.includes("ABK");
    });

    const targets = abkRows.filter((row) => {
      const imageUrl = findAbkImageUrl(imageMap, row.color);
      if (!imageUrl) return false;
      const currentUrl = String(row.imageUrl || "").trim();
      return !currentUrl || currentUrl !== imageUrl;
    });

    if (!targets.length) {
      masterMessage.value = `ABK 目前沒有可更新項目（品牌 ${abkRows.length} 筆、官網對照 ${imageMap.size} 筆）`;
      return;
    }

    let updated = 0;
    for (const row of targets) {
      const imageUrl = findAbkImageUrl(imageMap, row.color);
      if (!imageUrl) continue;

      await upsertInventoryColor({
        brand: row.brand,
        color: row.color,
        sheetId: row.sheetId,
        gid: row.gid,
        imageUrl,
        status: row.status || "active",
      });
      updated += 1;
    }

    await loadMasterData();
    masterMessage.value = `已回填 ABK 照片 ${updated} 筆（品牌 ${abkRows.length} 筆、符合對照且需更新 ${targets.length} 筆）`;
  } catch (error) {
    console.error("回填 ABK 照片失敗:", error);
    masterMessage.value = toPermissionMessage(error, "回填 ABK 照片失敗");
  } finally {
    abkSyncing.value = false;
  }
}

async function applyKuoshiImageUrls() {
  kuoshiSyncing.value = true;
  masterMessage.value = "";
  try {
    const imageMap = await loadKuoshiImageMap();
    if (!imageMap.size) {
      throw new Error("闊石對照檔沒有可用資料");
    }

    const { kuoshiRows, targets } = buildKuoshiBackfillContext(imageMap);

    if (!targets.length) {
      masterMessage.value = `闊石目前沒有可更新項目（品牌 ${kuoshiRows.length} 筆、官網對照 ${imageMap.size} 筆）`;
      return;
    }

    let updated = 0;
    for (const row of targets) {
      const imageUrl = findKuoshiImageUrl(imageMap, row.color);
      if (!imageUrl) continue;

      await upsertInventoryColor({
        brand: row.brand,
        color: row.color,
        sheetId: row.sheetId,
        gid: row.gid,
        imageUrl,
        status: row.status || "active",
      });
      updated += 1;
    }

    await loadMasterData();
    kuoshiPreviewRows.value = [];
    masterMessage.value = `已回填闊石照片 ${updated} 筆（品牌 ${kuoshiRows.length} 筆、符合對照且需更新 ${targets.length} 筆）`;
  } catch (error) {
    console.error("回填闊石照片失敗:", error);
    masterMessage.value = toPermissionMessage(error, "回填闊石照片失敗");
  } finally {
    kuoshiSyncing.value = false;
  }
}

async function saveSelectedPhotoUrl() {
  if (!isAdmin.value) {
    photoMessage.value = "僅管理者可更新照片網址";
    return;
  }
  if (!selectedColor.value) return;

  photoSaving.value = true;
  photoMessage.value = "";
  try {
    await upsertInventoryColor({
      brand: selectedColor.value.brand,
      color: selectedColor.value.color,
      sheetId: selectedColor.value.sheetId,
      gid: selectedColor.value.gid,
      imageUrl: String(photoUrlInput.value || "").trim(),
      status: selectedColor.value.status || "active",
    });
    photoMessage.value = "照片網址已更新";
    await loadMasterData();
  } catch (error) {
    console.error("更新照片網址失敗:", error);
    photoMessage.value = toPermissionMessage(error, "更新照片網址失敗");
  } finally {
    photoSaving.value = false;
  }
}

function onPhotoFileSelected(event) {
  const file = event?.target?.files?.[0] || null;
  photoFile.value = file;
  photoUploadProgress.value = 0;
}

async function uploadSelectedPhoto() {
  if (!isAdmin.value) {
    photoMessage.value = "僅管理者可上傳照片";
    return;
  }
  if (!selectedColor.value || !photoFile.value) return;

  photoUploading.value = true;
  photoMessage.value = "";
  photoUploadProgress.value = 0;
  try {
    const result = await uploadInventoryColorPhoto(
      {
        brand: selectedColor.value.brand,
        color: selectedColor.value.color,
        sheetId: selectedColor.value.sheetId,
        gid: selectedColor.value.gid,
        status: selectedColor.value.status || "active",
      },
      photoFile.value,
      (progress) => {
        photoUploadProgress.value = Number(progress || 0);
      },
    );

    photoMessage.value = "照片已上傳並更新";
    photoUrlInput.value = String(result?.imageUrl || "").trim();
    photoFile.value = null;
    photoFileInputKey.value += 1;
    await loadMasterData();
  } catch (error) {
    console.error("上傳照片失敗:", error);
    photoMessage.value = toPermissionMessage(error, "上傳照片失敗");
  } finally {
    photoUploading.value = false;
  }
}

function onBrandChange() {
  selectedColorKey.value = "";
  tableRows.value = [];
  tableHeaders.value = [];
  summary.value = null;
  tableTitle.value = "";
  toneSortOrder.value = "";
  toneSortHeader.value = "";
}

async function loadInventory() {
  errorMessage.value = "";
  tableRows.value = [];
  summary.value = null;

  const currentColor = selectedColor.value;
  if (!selectedBrand.value || !currentColor) {
    errorMessage.value = "請先選擇品牌與顏色";
    return;
  }

  loading.value = true;
  try {
    const inventoryUrl = `https://docs.google.com/spreadsheets/d/${currentColor.sheetId}/export?format=csv&gid=${currentColor.gid}`;
    const rows = await fetchCsv(inventoryUrl);
    if (!rows.length) {
      tableHeaders.value = [];
      tableRows.value = [];
      summary.value = null;
      return;
    }

    const [headerRow, ...bodyRows] = rows;
    tableHeaders.value = headerRow;

    const rowsWithDate = bodyRows;

    const bigRows = rowsWithDate.filter((row) => {
      const isExisting = existsFlag(row[14]);
      const hasInDate = Boolean(String(row[0] || "").trim());
      const isBig = String(row[5] || "").trim() === "";
      return isExisting && hasInDate && isBig;
    });

    const leftRows = sortByAreaAsc(
      rowsWithDate.filter((row) => {
        const isExisting = existsFlag(row[14]);
        const hasInDate = Boolean(String(row[0] || "").trim());
        const isLeft = String(row[5] || "").trim() !== "";
        return isExisting && hasInDate && isLeft && meetsSizeCondition(row);
      }),
    );

    const usedRows = rowsWithDate.filter((row) => {
      const isExisting = existsFlag(row[14]);
      const hasInDate = Boolean(String(row[0] || "").trim());
      return !isExisting && hasInDate;
    });

    const inRows = rowsWithDate.filter((row) => {
      const batch = String(row[6] || "");
      const isBig = String(row[5] || "").trim() === "";
      const notW = !(batch.includes("工") || batch.includes("砷"));
      const hasInDate = hasText(row[0]);
      return hasInDate && isBig && notW;
    });

    const outRows = rowsWithDate.filter((row) => {
      const batch = String(row[6] || "");
      const isBig = String(row[5] || "").trim() === "";
      const notW = !(batch.includes("工") || batch.includes("砷"));
      const hasUsedDate = hasText(row[11]);
      return hasUsedDate && isBig && notW;
    });

    const checkDiff = bigRows.length - (inRows.length - outRows.length);
    summary.value = {
      inCount: inRows.length,
      outCount: outRows.length,
      stockCount: bigRows.length,
      checkLabel: checkDiff === 0 ? "是" : String(checkDiff),
    };

    if (inventoryMode.value === "big") {
      tableRows.value = bigRows.map((row) => row.slice(0, 15));
      tableTitle.value = `共有 ${bigRows.length} 片大板`;
    } else if (inventoryMode.value === "used") {
      tableRows.value = usedRows.map((row) => row.slice(0, 15));
      tableTitle.value = `共有 ${usedRows.length} 筆已使用`;
    } else {
      tableRows.value = leftRows.map((row) => row.slice(0, 15));
      tableTitle.value = `共有 ${leftRows.length} 片餘料（小到大排序）`;
    }
  } catch (error) {
    console.error("讀取庫存失敗:", error);
    errorMessage.value = String(error?.message || "查詢失敗，請稍後再試");
  } finally {
    loading.value = false;
  }
}

onMounted(async () => {
  try {
    subscribeAuthState(async (currentUser) => {
      if (currentUser) {
        currentUserDoc.value = await getUserByUid(currentUser.uid);
      } else {
        currentUserDoc.value = null;
      }
    });

    await loadMasterData();
  } catch (error) {
    console.error("讀取主資料失敗:", error);
    errorMessage.value = "品牌/顏色主檔讀取失敗";
  }
});

watch(selectedColorKey, async (value) => {
  if (!value) {
    tableRows.value = [];
    tableHeaders.value = [];
    summary.value = null;
    tableTitle.value = "";
    toneSortOrder.value = "";
    toneSortHeader.value = "";
    return;
  }
  toneSortOrder.value = "";
  toneSortHeader.value = "";
  await loadInventory();
});

watch(selectedColor, (value) => {
  photoUrlInput.value = String(value?.imageUrl || "").trim();
  photoFile.value = null;
  photoUploadProgress.value = 0;
  photoFileInputKey.value += 1;
  showPhotoEditors.value = false;
});

watch(inventoryMode, async () => {
  if (!selectedColor.value) return;
  await loadInventory();
});

watch([conditionLen, conditionWid], ([len, wid]) => {
  if (!sizeConditionEnabled.value && (hasSizeInput(len) || hasSizeInput(wid))) {
    sizeConditionEnabled.value = true;
  }
});

watch([sizeConditionEnabled, conditionLen, conditionWid], async () => {
  if (!selectedColor.value) return;
  await loadInventory();
});
</script>

<style scoped>
.check-inline {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
}

.check-inline input {
  width: auto;
  height: auto;
}

.size-input {
  max-width: 140px;
}

.preview-wrap {
  margin: 0.5rem 0;
}

.photo-manage-wrap {
  margin: 0.75rem 0;
  padding: 0.55rem;
  border: 1px solid #dbeafe;
  border-radius: 10px;
  background: #f8fbff;
}

.photo-manage-title {
  margin: 0;
  font-size: 1rem;
}

.photo-edit-row {
  align-items: center;
}

.color-preview {
  max-width: min(860px, 100%);
  width: 100%;
  max-height: 280px;
  object-fit: contain;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  background: #fff;
}

.error-text {
  color: #dc2626;
  margin-top: 0.5rem;
}

.master-message {
  color: #0f5132;
  margin-top: 0.5rem;
}

.sortable-header {
  cursor: pointer;
  user-select: none;
}
</style>
