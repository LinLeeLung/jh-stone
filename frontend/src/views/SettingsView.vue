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
            placeholder="例如 /峻晟/test"
          />
        </div>
      </div>

      <div class="field-row">
        <div class="field-item">
          <label for="nas-order-path">訂單資料夾路徑（完工照存放位置）：</label>
          <input
            id="nas-order-path"
            v-model="form.nasOrderPath"
            placeholder="例如 /峻晟/01-訂單相關檔案/0--客戶訂貨單"
          />
          <small class="muted-text"
            >完工照會上傳到此路徑下符合訂單號碼的資料夾，未設定則使用上方 NAS
            儲存路徑</small
          >
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

      <!-- 新增：訂單號碼查詢 NAS 資料夾 -->
      <div class="field-row" style="margin-top: 24px">
        <div class="field-item">
          <label for="order-nas-query">查詢訂單號碼（NAS 資料夾）：</label>
          <input
            id="order-nas-query"
            v-model="orderNumberQuery"
            placeholder="請輸入訂單號碼"
            style="width: 200px"
          />
        </div>
        <button
          class="btn-query"
          :disabled="queryingOrderFolder || !orderNumberQuery"
          @click="findOrderFolderOnNas"
        >
          查詢 NAS 資料夾
        </button>
        <span
          v-if="queryingOrderFolder"
          class="muted-text"
          style="margin-left: 12px"
          >查詢中…</span
        >
      </div>
      <p v-if="orderFolderResult" class="muted-text">{{ orderFolderResult }}</p>
      <p v-if="orderFolderError" class="error-text">{{ orderFolderError }}</p>
      <p
        v-if="nasQueryElapsed !== null && !queryingOrderFolder"
        class="muted-text"
        style="font-size: 0.85em"
      >
        查詢耗時：{{ nasQueryElapsed }} ms
      </p>

      <!-- 完工照片路徑修復工具 -->
      <div class="toolbar-row" style="margin-top: 28px">
        <h2 style="margin: 0">完工照片路徑修復</h2>
      </div>
      <p class="muted-text" style="font-size: 0.9em">
        當 NAS
        上的訂單資料夾被重新命名後，已上傳照片的路徑可能失效（顯示破圖）。<br />
        先執行「診斷」查看有幾張異常，確認後再執行「修復」更新路徑。
      </p>
      <div class="toolbar-row">
        <button
          class="btn-aux"
          :disabled="repairingPhotoPaths"
          @click="runPhotoPathDiagnose"
        >
          {{
            repairingPhotoPaths && photoPathDryRun
              ? "診斷中…"
              : "① 診斷（不修改）"
          }}
        </button>
        <button
          class="btn-query"
          :disabled="repairingPhotoPaths || !photoPathDiagnoseResult"
          @click="runPhotoPathRepair"
        >
          {{
            repairingPhotoPaths && !photoPathDryRun ? "修復中…" : "② 執行修復"
          }}
        </button>
      </div>
      <div v-if="photoPathDiagnoseResult" style="margin-top: 10px">
        <p class="muted-text">
          已檢查 {{ photoPathDiagnoseResult.checkedPhotos }} 張， 路徑失效
          <strong
            :style="
              photoPathDiagnoseResult.brokenPhotos > 0 ? 'color:#c00' : ''
            "
          >
            {{ photoPathDiagnoseResult.brokenPhotos }} 張
          </strong>
          <template v-if="!photoPathDiagnoseResult.dryRun">
            ，已修復
            <strong style="color: #16a34a"
              >{{ photoPathDiagnoseResult.fixedPhotos }} 張</strong
            >， 找不到
            {{
              photoPathDiagnoseResult.report.filter(
                (r) => r.type === "not_found",
              ).length
            }}
            張
          </template>
        </p>
        <table
          v-if="
            photoPathDiagnoseResult.report.filter((r) => r.type !== 'ok')
              .length > 0
          "
          style="
            font-size: 0.82em;
            border-collapse: collapse;
            width: 100%;
            margin-top: 8px;
          "
        >
          <thead>
            <tr style="background: #f0f0f0">
              <th style="padding: 4px 8px; text-align: left">狀態</th>
              <th style="padding: 4px 8px; text-align: left">訂單號碼</th>
              <th style="padding: 4px 8px; text-align: left">照片 ID</th>
              <th style="padding: 4px 8px; text-align: left">路徑</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in photoPathDiagnoseResult.report.filter(
                (r) => r.type !== 'ok',
              )"
              :key="row.photoId"
              style="border-top: 1px solid #e0e0e0"
            >
              <td
                style="padding: 4px 8px; font-weight: 600"
                :style="
                  row.type === 'fixed'
                    ? 'color:#16a34a'
                    : row.type === 'not_found'
                      ? 'color:#888'
                      : 'color:#c00'
                "
              >
                {{
                  row.type === "fixed"
                    ? "✓ 已修復"
                    : row.type === "not_found"
                      ? "找不到"
                      : "✗ 失效"
                }}
              </td>
              <td style="padding: 4px 8px">{{ row.orderNumber || "-" }}</td>
              <td style="padding: 4px 8px; font-size: 0.78em; color: #888">
                {{ row.photoId }}
              </td>
              <td
                style="
                  padding: 4px 8px;
                  word-break: break-all;
                  font-size: 0.78em;
                "
              >
                {{ row.newNasPath || row.nasPath }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-if="photoPathRepairError" class="error-text">
        {{ photoPathRepairError }}
      </p>

      <!-- 照片搬移工具 -->
      <div class="toolbar-row" style="margin-top: 28px">
        <h2 style="margin: 0">照片搬移工具</h2>
      </div>
      <p class="muted-text" style="font-size: 0.9em">
        將放錯位置的完工照（來源資料夾）搬回正確訂單資料夾，搬移後刪除空資料夾。
      </p>
      <div class="field-row">
        <div class="field-item">
          <label>來源資料夾（放錯的）：</label>
          <input
            v-model="migrateSrcPath"
            placeholder="例如 /峻晟/01-訂單相關檔案/115年3月15日起的訂單"
            style="width: 420px"
          />
        </div>
      </div>
      <div class="field-row">
        <div class="field-item">
          <label
            >目標基底路徑（正確存放位置，同設定中的訂單資料夾路徑）：</label
          >
          <input
            v-model="migrateTargetPath"
            placeholder="例如 /峻晟/01-訂單相關檔案/0--客戶訂貨單"
            style="width: 420px"
          />
        </div>
      </div>
      <div class="toolbar-row">
        <button
          class="btn-aux"
          :disabled="migrating || !migrateSrcPath"
          @click="runMigrateScan"
        >
          {{ migrating && migrateScanMode ? "掃描中…" : "① 掃描來源資料夾" }}
        </button>
        <button
          class="btn-aux"
          :disabled="migrating || !migrateSrcPath || !migrateTargetPath"
          @click="runMigrateDryRun"
        >
          {{
            migrating && migrateDryRun && !migrateScanMode
              ? "查詢中…"
              : "② 預覽（不搬移）"
          }}
        </button>
        <button
          class="btn-query"
          :disabled="
            migrating ||
            !migrateSrcPath ||
            !migrateTargetPath ||
            !migrateHasMatched
          "
          @click="runMigrateActual"
        >
          {{ migrating && !migrateDryRun ? "搬移中…" : "③ 執行搬移" }}
        </button>
      </div>
      <div v-if="migrateResult" style="margin-top: 12px">
        <!-- 掃描模式結果 -->
        <template v-if="migrateResult.scanOnly">
          <p class="muted-text">
            掃描完成，共 {{ migrateResult.total }} 個訂單資料夾。
            <button
              class="btn-aux"
              style="margin-left: 12px; padding: 2px 10px; font-size: 0.85em"
              @click="downloadScanCsv"
            >
              下載 CSV
            </button>
          </p>
          <table
            style="
              font-size: 0.82em;
              border-collapse: collapse;
              width: 100%;
              margin-top: 8px;
            "
          >
            <thead>
              <tr style="background: #f0f0f0">
                <th style="padding: 4px 8px; text-align: left">#</th>
                <th style="padding: 4px 8px; text-align: left">
                  來源資料夾名稱
                </th>
                <th style="padding: 4px 8px; text-align: left">抽出訂單編號</th>
                <th style="padding: 4px 8px; text-align: left">來源路徑</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(row, idx) in migrateResult.report"
                :key="row.srcPath"
                style="border-top: 1px solid #e0e0e0"
              >
                <td style="padding: 4px 8px; color: #888">{{ idx + 1 }}</td>
                <td style="padding: 4px 8px">{{ row.orderFolder }}</td>
                <td
                  style="padding: 4px 8px; font-weight: 600"
                  :style="!row.orderNumber ? 'color:#c00' : ''"
                >
                  {{ row.orderNumber || "（無法辨識）" }}
                </td>
                <td
                  style="padding: 4px 8px; word-break: break-all; color: #888"
                >
                  {{ row.srcPath }}
                </td>
              </tr>
            </tbody>
          </table>
        </template>

        <!-- 預覽/執行結果 -->
        <template v-else>
          <p class="muted-text">
            {{ migrateResult.dryRun ? "[預覽]" : "[已執行]" }}
            來源共 {{ migrateResult.report?.length || 0 }} 個訂單資料夾，
            找到目標
            {{
              migrateResult.report?.filter((r) => r.status !== "not_found")
                .length || 0
            }}
            筆， 找不到目標
            {{
              migrateResult.report?.filter((r) => r.status === "not_found")
                .length || 0
            }}
            筆<span v-if="!migrateResult.dryRun"
              >，移動 {{ migrateResult.movedCount || 0 }} 個檔案，錯誤
              {{ migrateResult.errorCount || 0 }} 筆</span
            >。
          </p>
          <table
            v-if="migrateResult.report?.length"
            style="
              font-size: 0.82em;
              border-collapse: collapse;
              width: 100%;
              margin-top: 8px;
            "
          >
            <thead>
              <tr style="background: #f0f0f0">
                <th style="padding: 4px 8px; text-align: left">來源資料夾</th>
                <th style="padding: 4px 8px; text-align: left">訂單編號</th>
                <th style="padding: 4px 8px; text-align: left">狀態</th>
                <th style="padding: 4px 8px; text-align: left">檔案數</th>
                <th style="padding: 4px 8px; text-align: left">目標路徑</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in migrateResult.report"
                :key="row.srcPath"
                style="border-top: 1px solid #e0e0e0"
              >
                <td style="padding: 4px 8px">{{ row.orderFolder }}</td>
                <td style="padding: 4px 8px; font-weight: 600">
                  {{ row.orderNumber || "-" }}
                </td>
                <td
                  style="padding: 4px 8px"
                  :style="row.status === 'not_found' ? 'color:#c00' : ''"
                >
                  {{
                    row.status === "dry_run"
                      ? "✓ 找到"
                      : row.status === "not_found"
                        ? "✗ 找不到"
                        : row.status
                  }}
                </td>
                <td style="padding: 4px 8px">{{ row.files ?? "-" }}</td>
                <td style="padding: 4px 8px; word-break: break-all">
                  {{ row.destPath || row.error || "-" }}
                </td>
              </tr>
            </tbody>
          </table>
        </template>
      </div>
      <p v-if="migrateError" class="error-text">{{ migrateError }}</p>

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
import { computed, onMounted, ref } from "vue";
import {
  bulkUpsertInventoryColors,
  getSystemSettings,
  listInventoryColors,
  saveSystemSettings,
  testNasWrite,
  testNasUploadPhoto,
  upsertInventoryColor,
  repairCompletionPhotoNasPaths,
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
  nasOrderPath: "",
});

// 新增：訂單號碼查詢相關
const orderNumberQuery = ref("");
const queryingOrderFolder = ref(false);
const orderFolderResult = ref("");
const orderFolderError = ref("");
const nasQueryElapsed = ref(null);

// 完工照片路徑修復
const repairingPhotoPaths = ref(false);
const photoPathDryRun = ref(true);
const photoPathDiagnoseResult = ref(null);
const photoPathRepairError = ref("");

async function runPhotoPathDiagnose() {
  repairingPhotoPaths.value = true;
  photoPathDryRun.value = true;
  photoPathDiagnoseResult.value = null;
  photoPathRepairError.value = "";
  try {
    const result = await repairCompletionPhotoNasPaths({ dryRun: true });
    photoPathDiagnoseResult.value = result;
  } catch (err) {
    photoPathRepairError.value = err?.message || "診斷失敗";
  } finally {
    repairingPhotoPaths.value = false;
  }
}

async function runPhotoPathRepair() {
  if (!photoPathDiagnoseResult.value) return;
  const broken = photoPathDiagnoseResult.value.brokenPhotos || 0;
  if (broken === 0) {
    alert("沒有需要修復的照片");
    return;
  }
  if (
    !confirm(
      `確定要修復 ${broken} 張路徑失效的照片？此操作會更新 Firestore 中的 nasPath，無法復原。`,
    )
  )
    return;
  repairingPhotoPaths.value = true;
  photoPathDryRun.value = false;
  photoPathRepairError.value = "";
  try {
    const result = await repairCompletionPhotoNasPaths({ dryRun: false });
    photoPathDiagnoseResult.value = result;
  } catch (err) {
    photoPathRepairError.value = err?.message || "修復失敗";
  } finally {
    repairingPhotoPaths.value = false;
  }
}

// 照片搬移工具
const migrateSrcPath = ref("");
const migrateTargetPath = ref("");
const migrating = ref(false);
const migrateDryRun = ref(true);
const migrateScanMode = ref(false);
const migrateResult = ref(null);
const migrateError = ref("");
// 是否有預覽結果且存在可搬移的項目（需先預覽才能執行）
const migrateHasMatched = computed(
  () =>
    !!(
      migrateResult.value?.dryRun &&
      migrateResult.value.report?.some((r) => r.status !== "not_found")
    ),
);

async function findOrderFolderOnNas() {
  if (!orderNumberQuery.value) return;
  queryingOrderFolder.value = true;
  orderFolderResult.value = "";
  orderFolderError.value = "";
  nasQueryElapsed.value = null;
  const t0 = Date.now();
  try {
    // 假設 findOrderFolderOnNas 為 firebase.js 的 API
    const result = await (
      await import("../firebase")
    ).findOrderFolderOnNas(orderNumberQuery.value);
    orderFolderResult.value = result?.message || "查詢完成";
  } catch (err) {
    orderFolderError.value = err?.message || "查詢失敗";
  } finally {
    nasQueryElapsed.value = Date.now() - t0;
    queryingOrderFolder.value = false;
  }
}

async function runMigrate(dryRun, scanOnly = false) {
  if (!migrateSrcPath.value) return;
  if (!scanOnly && !migrateTargetPath.value) return;
  migrating.value = true;
  migrateDryRun.value = dryRun;
  migrateScanMode.value = scanOnly;
  migrateResult.value = null;
  migrateError.value = "";
  try {
    const { getFunctions, httpsCallable } = await import("firebase/functions");
    const { app } = await import("../firebase");
    const fns = getFunctions(app, "asia-east1");
    const callable = httpsCallable(fns, "migrateMisplacedOrderPhotos", {
      timeout: 3300000,
    }); // 55 分鐘
    const resp = await callable({
      sourceFolderPath: migrateSrcPath.value.trim(),
      targetBasePath: migrateTargetPath.value.trim(),
      dryRun,
      scanOnly,
    });
    migrateResult.value = resp.data;
  } catch (err) {
    migrateError.value = err?.message || "失敗";
  } finally {
    migrating.value = false;
  }
}

function runMigrateScan() {
  return runMigrate(true, true);
}

function runMigrateDryRun() {
  return runMigrate(true);
}
function runMigrateActual() {
  if (
    !confirm("確定要搬移？此操作會在 NAS 上移動檔案並刪除空資料夾，無法復原。")
  )
    return;
  return runMigrate(false);
}

function downloadScanCsv() {
  const rows = migrateResult.value?.report || [];
  const header = "序號,來源資料夾名稱,訂單編號,來源路徑";
  const lines = rows.map((r, i) =>
    [i + 1, `"${r.orderFolder}"`, r.orderNumber || "", `"${r.srcPath}"`].join(
      ",",
    ),
  );
  const csv = "\uFEFF" + [header, ...lines].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "migrate-scan.csv";
  a.click();
  URL.revokeObjectURL(url);
}

async function loadSettings() {
  loading.value = true;
  message.value = "";
  errorMessage.value = "";

  try {
    const data = await getSystemSettings();
    form.value.nasStoragePath = data.nasStoragePath || "";
    form.value.nasOrderPath = data.nasOrderPath || "";
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

  if (
    code.includes("permission-denied") ||
    messageText.includes("insufficient permissions")
  ) {
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

async function loadDitongImageMap() {
  const mappingPath = "/ditong-image-mapping.csv";
  const response = await fetch(mappingPath, { cache: "no-store" });
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
  const response = await fetch(mappingPath, { cache: "no-store" });
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
  const response = await fetch(mappingPath, { cache: "no-store" });
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
  const response = await fetch(mappingPath, { cache: "no-store" });
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
  const response = await fetch(mappingPath, { cache: "no-store" });
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
    ? getIndexByAliases(
        headerMap,
        ["圖片網址", "圖片url", "url", "imageurl"],
        4,
      )
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
      ? getIndexByAliases(
          headerMap,
          ["圖片網址", "圖片url", "url", "imageurl"],
          4,
        )
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
