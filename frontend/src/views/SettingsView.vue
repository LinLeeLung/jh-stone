<template>
  <section class="page-card">
    <div class="page-head">
      <h1>系統設定</h1>
      <p class="muted-text">僅管理者可調整參數</p>
    </div>

    <div v-if="loading" class="muted-text">讀取設定中…</div>

    <div v-else class="settings-wrap">
      <div class="field-row">
        <div class="field-item">
          <label for="nas-path">NAS 儲存路徑：</label>
          <input
            id="nas-path"
            v-model="form.nasStoragePath"
            placeholder="例如 /岱晨/test"
          />
        </div>
      </div>

      <div class="toolbar-row">
        <button class="btn-query" :disabled="saving" @click="save">儲存</button>
        <button class="btn-aux" :disabled="saving" @click="reload">
          重新載入
        </button>
        <button
          class="btn-aux"
          :disabled="testingNas || saving"
          @click="runNasTest"
        >
          測試 NAS 寫入
        </button>
      </div>

      <div class="field-row">
        <div class="field-item">
          <label for="nas-test-photo">測試照片：</label>
          <input
            id="nas-test-photo"
            type="file"
            accept="image/*"
            @change="onTestPhotoSelected"
          />
        </div>
        <button
          class="btn-query"
          :disabled="testingPhotoUpload || saving || testingNas"
          @click="uploadTestPhotoToNas"
        >
          上傳測試照片到 NAS
        </button>
      </div>

      <p v-if="message" class="muted-text">{{ message }}</p>
      <p v-if="errorMessage" class="error-text">{{ errorMessage }}</p>

      <div class="toolbar-row" style="margin-top: 20px">
        <h2 style="margin: 0">庫存顏色維護</h2>
      </div>

      <div class="toolbar-row">
        <button
          class="btn-aux"
          :disabled="masterSyncing || repairSyncing"
          @click="syncMasterToFirestore"
        >
          {{ masterSyncing ? "同步中..." : "同步現有顏色到 Firestore" }}
        </button>

        <button
          class="btn-aux"
          :disabled="repairSyncing || masterSyncing"
          @click="repairMissingImagesOnly"
        >
          {{ repairSyncing ? "修復中..." : "修復缺失照片（保留現有）" }}
        </button>
      </div>

      <p v-if="masterMessage" class="muted-text">{{ masterMessage }}</p>
    </div>
  </section>
</template>

<script setup>
import { onMounted, ref } from "vue";
import {
  bulkUpsertInventoryColors,
  getSystemSettings,
  listInventoryColors,
  saveSystemSettings,
  testNasWrite,
  testNasUploadPhoto,
  upsertInventoryColor,
} from "../firebase";

const COLOR_CSV_URL =
  "https://docs.google.com/spreadsheets/d/10Gkhuq2iwlpQfw0e-uvP_9UuE1efee_5v7iHX4srW8s/export?format=csv&gid=494306116";

const loading = ref(true);
const saving = ref(false);
const testingNas = ref(false);
const testingPhotoUpload = ref(false);
const testPhotoFile = ref(null);
const message = ref("");
const errorMessage = ref("");
const masterSyncing = ref(false);
const repairSyncing = ref(false);
const masterMessage = ref("");

const form = ref({
  nasStoragePath: "",
});

async function loadSettings() {
  loading.value = true;
  message.value = "";
  errorMessage.value = "";

  try {
    const data = await getSystemSettings();
    form.value.nasStoragePath = data.nasStoragePath || "";
  } catch (error) {
    console.error("讀取系統設定失敗:", error);
    errorMessage.value = "讀取設定失敗，請稍後再試。";
  } finally {
    loading.value = false;
  }
}

async function save() {
  saving.value = true;
  message.value = "";
  errorMessage.value = "";

  try {
    await saveSystemSettings(form.value);
    message.value = "設定已儲存。";
  } catch (error) {
    console.error("儲存系統設定失敗:", error);
    errorMessage.value = "儲存失敗，請確認權限或稍後重試。";
  } finally {
    saving.value = false;
  }
}

async function runNasTest() {
  testingNas.value = true;
  message.value = "";
  errorMessage.value = "";

  try {
    const result = await testNasWrite();
    message.value = `NAS 測試成功：${result.testFilePath || "已寫入測試檔"}`;
  } catch (error) {
    console.error("NAS 測試失敗:", error);
    errorMessage.value =
      error?.message || "NAS 測試失敗，請檢查設定與 Functions 日誌。";
  } finally {
    testingNas.value = false;
  }
}

function onTestPhotoSelected(event) {
  const nextFile = event?.target?.files?.[0] || null;
  testPhotoFile.value = nextFile;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result || "");
    reader.onerror = () => reject(new Error("讀取圖片失敗"));
    reader.readAsDataURL(file);
  });
}

async function uploadTestPhotoToNas() {
  if (!testPhotoFile.value) {
    errorMessage.value = "請先選擇測試照片。";
    return;
  }

  testingPhotoUpload.value = true;
  message.value = "";
  errorMessage.value = "";

  try {
    const dataUrl = await readFileAsDataUrl(testPhotoFile.value);
    const result = await testNasUploadPhoto({
      fileName: testPhotoFile.value.name || "test-photo.jpg",
      dataUrl,
    });
    message.value = `測試照片已上傳到 NAS：${result.targetPath || "成功"}`;
  } catch (error) {
    console.error("測試照片上傳失敗:", error);
    errorMessage.value =
      error?.message || "測試照片上傳失敗，請檢查設定與 Functions 日誌。";
  } finally {
    testingPhotoUpload.value = false;
  }
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

function normalizeMappingKey(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s\-_/｜|()（）·•.,:：'"`]/g, "");
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

function toPermissionMessage(error, fallback = "操作失敗") {
  const code = String(error?.code || "").toLowerCase();
  const messageText = String(error?.message || "").toLowerCase();

  if (code.includes("permission-denied") || messageText.includes("insufficient permissions")) {
    return "Firestore 權限不足：請確認目前帳號角色為 管理者/admin";
  }
  return String(error?.message || fallback);
}

async function fetchCsv(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`讀取失敗：${response.status}`);
  }
  return parseCsv(await response.text());
}

async function loadSilestoneImageMap() {
  const mappingPath = "/silestone-image-mapping.csv";
  const response = await fetch(mappingPath, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`讀取賽麗石對照檔失敗（${mappingPath}）：HTTP ${response.status}`);
  }

  const rows = parseCsv(await response.text());
  if (!rows.length) return new Map();

  const header = rows[0] || [];
  const map = buildHeaderIndexMap(header);
  const codeIndex = getIndexByAliases(map, ["color", "色號", "code"], 1);
  const urlIndex = getIndexByAliases(map, ["imageurl", "圖片網址", "圖片位址", "url"], 2);

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

async function loadDitongImageMap() {
  const mappingPath = "/ditong-image-mapping.csv";
  const response = await fetch(mappingPath, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`讀取帝通石對照檔失敗（${mappingPath}）：HTTP ${response.status}`);
  }

  const rows = parseCsv(await response.text());
  if (!rows.length) return new Map();

  const header = rows[0] || [];
  const map = buildHeaderIndexMap(header);
  const codeIndex = getIndexByAliases(map, ["color", "色號", "code"], 1);
  const urlIndex = getIndexByAliases(map, ["imageurl", "圖片網址", "圖片位址", "url"], 2);

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
  const response = await fetch(mappingPath, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`讀取耐麗石對照檔失敗（${mappingPath}）：HTTP ${response.status}`);
  }

  const rows = parseCsv(await response.text());
  if (!rows.length) return new Map();

  const header = rows[0] || [];
  const map = buildHeaderIndexMap(header);
  const codeIndex = getIndexByAliases(map, ["color", "色號", "code"], 1);
  const urlIndex = getIndexByAliases(map, ["imageurl", "圖片網址", "圖片位址", "url"], 2);

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
  const response = await fetch(mappingPath, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`讀取鈦鋼石對照檔失敗（${mappingPath}）：HTTP ${response.status}`);
  }

  const rows = parseCsv(await response.text());
  if (!rows.length) return new Map();

  const header = rows[0] || [];
  const map = buildHeaderIndexMap(header);
  const codeIndex = getIndexByAliases(map, ["color", "色號", "code"], 1);
  const urlIndex = getIndexByAliases(map, ["imageurl", "圖片網址", "圖片位址", "url"], 2);

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
  const response = await fetch(mappingPath, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`讀取 ABK 對照檔失敗（${mappingPath}）：HTTP ${response.status}`);
  }

  const rows = parseCsv(await response.text());
  if (!rows.length) return new Map();

  const header = rows[0] || [];
  const map = buildHeaderIndexMap(header);
  const colorIndex = getIndexByAliases(map, ["color", "色號", "顏色", "code"], 1);
  const urlIndex = getIndexByAliases(map, ["imageurl", "圖片網址", "圖片位址", "url"], 2);

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
  const response = await fetch(mappingPath, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`讀取闊石對照檔失敗（${mappingPath}）：HTTP ${response.status}`);
  }

  const rows = parseCsv(await response.text());
  if (!rows.length) return new Map();

  const header = rows[0] || [];
  const map = buildHeaderIndexMap(header);
  const colorIndex = getIndexByAliases(map, ["color", "色號", "顏色", "code"], 1);
  const urlIndex = getIndexByAliases(map, ["imageurl", "圖片網址", "圖片位址", "url"], 2);

  const imageMap = new Map();
  rows.slice(1).forEach((row) => {
    const code = normalizeKuoshiCode(getCell(row, colorIndex));
    const imageUrl = getCell(row, urlIndex);
    if (!code || !imageUrl || imageMap.has(code)) return;
    imageMap.set(code, imageUrl);
  });

  return imageMap;
}

async function loadInventoryColorCatalog() {
  const rows = await fetchCsv(COLOR_CSV_URL);
  const headerRow = rows[0] || [];
  const headerMap = buildHeaderIndexMap(headerRow);
  const hit = ["品牌", "色號", "id", "gid", "圖片網址", "status"]
    .map((name) => normalizeHeader(name))
    .filter((key) => headerMap.has(key)).length;
  const hasHeader = hit >= 2;
  const dataRows = hasHeader ? rows.slice(1) : rows;

  const brandIndex = hasHeader
    ? getIndexByAliases(headerMap, ["品牌", "brand"], 0)
    : 0;
  const colorIndex = hasHeader
    ? getIndexByAliases(headerMap, ["色號", "顏色", "color"], 1)
    : 1;
  const sheetIdIndex = hasHeader
    ? getIndexByAliases(headerMap, ["id", "sheetid"], 2)
    : 2;
  const gidIndex = hasHeader ? getIndexByAliases(headerMap, ["gid"], 3) : 3;
  const imageUrlIndex = hasHeader
    ? getIndexByAliases(headerMap, ["圖片網址", "圖片url", "url", "imageurl"], 4)
    : 4;
  const statusIndex = hasHeader
    ? getIndexByAliases(headerMap, ["status", "狀態"], 5)
    : 5;

  const csvColors = dataRows
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
      return csvColors;
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

    return merged;
  } catch (error) {
    console.warn("讀取 Firestore 顏色主檔失敗，改用 CSV：", error);
    return csvColors;
  }
}

async function syncMasterToFirestore() {
  masterSyncing.value = true;
  masterMessage.value = "";
  try {
    const rows = await fetchCsv(COLOR_CSV_URL);
    const headerRow = rows[0] || [];
    const headerMap = buildHeaderIndexMap(headerRow);
    const hit = ["品牌", "色號", "id", "gid"]
      .map((name) => normalizeHeader(name))
      .filter((key) => headerMap.has(key)).length;
    const hasHeader = hit >= 2;
    const dataRows = hasHeader ? rows.slice(1) : rows;

    const brandIndex = hasHeader
      ? getIndexByAliases(headerMap, ["品牌", "brand"], 0)
      : 0;
    const colorIndex = hasHeader
      ? getIndexByAliases(headerMap, ["色號", "顏色", "color"], 1)
      : 1;
    const sheetIdIndex = hasHeader
      ? getIndexByAliases(headerMap, ["id", "sheetid"], 2)
      : 2;
    const gidIndex = hasHeader ? getIndexByAliases(headerMap, ["gid"], 3) : 3;
    const imageUrlIndex = hasHeader
      ? getIndexByAliases(headerMap, ["圖片網址", "圖片url", "url", "imageurl"], 4)
      : 4;
    const statusIndex = hasHeader
      ? getIndexByAliases(headerMap, ["status", "狀態"], 5)
      : 5;

    const payload = dataRows
      .map((row) => ({
        brand: getCell(row, brandIndex),
        color: getCell(row, colorIndex),
        sheetId: getCell(row, sheetIdIndex),
        gid: getCell(row, gidIndex),
        imageUrl: getCell(row, imageUrlIndex),
        status: getCell(row, statusIndex),
      }))
      .filter((row) => row.brand && row.color && row.sheetId && row.gid);

    const result = await bulkUpsertInventoryColors(payload);
    masterMessage.value = `已同步 ${result.written || 0} 筆顏色至 Firestore`;
  } catch (error) {
    console.error("同步顏色主檔失敗:", error);
    masterMessage.value = toPermissionMessage(error, "同步失敗");
  } finally {
    masterSyncing.value = false;
  }
}

async function repairMissingImagesOnly() {
  repairSyncing.value = true;
  masterMessage.value = "";
  try {
    const safeLoadMap = async (loader) => {
      try {
        return await loader();
      } catch (error) {
        console.warn("修復缺失照片：讀取對照檔失敗", error);
        return new Map();
      }
    };

    const colorCatalog = await loadInventoryColorCatalog();
    const [silestoneMap, ditongMap, neolithMap, tigangMap, abkMap, kuoshiMap] =
      await Promise.all([
        safeLoadMap(loadSilestoneImageMap),
        safeLoadMap(loadDitongImageMap),
        safeLoadMap(loadNeolithImageMap),
        safeLoadMap(loadTiGangImageMap),
        safeLoadMap(loadAbkImageMap),
        safeLoadMap(loadKuoshiImageMap),
      ]);

    const missingRows = colorCatalog.filter(
      (row) => !String(row.imageUrl || "").trim(),
    );

    const updates = [];
    missingRows.forEach((row) => {
      const brand = String(row.brand || "").trim();
      let imageUrl = "";

      if (brand.startsWith("賽麗石")) {
        const code = extractColorCode(row.color);
        imageUrl = silestoneMap.get(code) || "";
      } else if (brand.startsWith("帝通石")) {
        const code = extractColorCode(row.color);
        imageUrl = ditongMap.get(code) || "";
      } else if (brand.startsWith("耐麗石")) {
        if (!isNonPriorityNeolithColor(row.color)) {
          imageUrl = findNeolithImageUrl(neolithMap, row.color);
        }
      } else if (brand.startsWith("鈦鋼石")) {
        const code = extractTiGangCode(row.color);
        imageUrl = tigangMap.get(code) || "";
      } else if (brand.includes("ABK")) {
        imageUrl = findAbkImageUrl(abkMap, row.color);
      } else if (brand.includes("闊石")) {
        imageUrl = findKuoshiImageUrl(kuoshiMap, row.color);
      }

      if (!imageUrl) return;

      updates.push({
        ...row,
        imageUrl,
      });
    });

    if (!updates.length) {
      masterMessage.value = `沒有可修復的缺失照片（缺圖 ${missingRows.length} 筆）`;
      return;
    }

    let updated = 0;
    for (const row of updates) {
      await upsertInventoryColor({
        brand: row.brand,
        color: row.color,
        sheetId: row.sheetId,
        gid: row.gid,
        imageUrl: row.imageUrl,
        status: row.status || "active",
      });
      updated += 1;
    }

    masterMessage.value = `已修復缺失照片 ${updated} 筆（原缺圖 ${missingRows.length} 筆）`;
  } catch (error) {
    console.error("修復缺失照片失敗:", error);
    masterMessage.value = toPermissionMessage(error, "修復缺失照片失敗");
  } finally {
    repairSyncing.value = false;
  }
}

function reload() {
  loadSettings();
}

onMounted(() => {
  loadSettings();
});
</script>

<style scoped>
.settings-wrap {
  max-width: 860px;
}

.error-text {
  color: #dc2626;
}
</style>
