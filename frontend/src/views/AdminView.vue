<template>
  <section class="page-card">
    <div class="page-head">
      <h1>管理介面</h1>
    </div>

    <div v-if="loading" class="muted-text">讀取中…</div>

    <div v-else>
      <div v-if="!isAdmin">
        <p>您沒有權限存取此頁面。</p>
      </div>

      <div v-else>
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>姓名</th>
                <th class="secondary-col">電郵</th>
                <th>角色</th>
                <th>動作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="u in users" :key="u.id">
                <td>
                  <input class="name-input" v-model="u.displayName" />
                </td>
                <td class="secondary-col">{{ u.email }}</td>
                <td>
                  <select v-model="u.role">
                    <option v-for="r in roles" :key="r" :value="r">
                      {{ r }}
                    </option>
                  </select>
                </td>
                <td>
                  <button
                    class="btn-manage"
                    @click="applyRole(u)"
                    :disabled="!changed(u)"
                  >
                    更新
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!--
          舊照片遷移工具：所有歷史 Storage 照片已遷移完成後隱藏。
          後端 callable function 仍保留，必要時可改為 v-if="true" 重新顯示。
        -->
        <template v-if="showLegacyMigration">
          <div class="toolbar-row" style="margin-top: 20px">
            <h2 style="margin: 0">舊照片遷移（Storage -> NAS）</h2>
            <button
              class="btn-aux"
              :disabled="migrationLoading || migrationPrecheckLoading"
              @click="runLegacyMigrationPrecheck"
            >
              {{ migrationPrecheckLoading ? "檢查中..." : "遷移前檢查" }}
            </button>
            <button
              class="btn-manage"
              :disabled="!canRunMigration"
              @click="runLegacyMigration"
            >
              {{ migrationLoading ? "執行中..." : "執行一批遷移" }}
            </button>
          </div>

          <div class="field-row" style="margin-top: 10px">
            <div class="field-item tight">
              <label>單一訂單（可留空）：</label>
              <input
                v-model.trim="migrationForm.orderId"
                placeholder="orderDocId"
              />
            </div>
            <div class="field-item tight">
              <label>本批筆數：</label>
              <input
                type="number"
                min="1"
                max="100"
                v-model.number="migrationForm.limit"
              />
            </div>
            <label style="display: flex; align-items: center; gap: 6px">
              <input
                type="checkbox"
                v-model="migrationForm.deleteStorageAfterSync"
                style="width: auto; height: auto"
              />
              遷移成功後刪除 Storage 舊檔
            </label>
          </div>

          <div
            v-if="migrationResult"
            class="summary-row"
            style="margin-top: 8px"
          >
            <span>掃描：{{ migrationResult.scanned || 0 }}</span>
            <span>成功：{{ migrationResult.migrated || 0 }}</span>
            <span>失敗：{{ migrationResult.failed || 0 }}</span>
            <span>略過：{{ migrationResult.skipped || 0 }}</span>
          </div>

          <div
            v-if="migrationPrecheckResult"
            class="summary-row"
            style="margin-top: 8px"
          >
            <span>檢查角色：{{ migrationPrecheckResult.role || "-" }}</span>
            <span>
              NAS 路徑：{{ migrationPrecheckResult.normalizedNasPath || "-" }}
            </span>
            <span>掃描：{{ migrationPrecheckResult.scanned || 0 }}</span>
            <span>候選：{{ migrationPrecheckResult.candidates || 0 }}</span>
          </div>

          <p v-if="!canRunMigration" class="muted-text" style="margin-top: 6px">
            需先完成遷移前檢查，且目前條件下有候選資料，才可執行遷移。
          </p>

          <div
            v-if="
              migrationResult &&
              Array.isArray(migrationResult.details) &&
              migrationResult.details.length
            "
            class="table-wrap"
            style="margin-top: 8px"
          >
            <table class="data-table">
              <thead>
                <tr>
                  <th>訂單</th>
                  <th>照片</th>
                  <th>結果</th>
                  <th class="secondary-col">說明</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="(item, idx) in migrationResult.details"
                  :key="`${item.orderId || '-'}-${item.photoId || '-'}-${idx}`"
                >
                  <td>{{ item.orderId || "-" }}</td>
                  <td>{{ item.photoId || "-" }}</td>
                  <td>{{ item.status || "-" }}</td>
                  <td class="secondary-col">
                    {{ item.reason || item.nasPath || "-" }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </template>

        <div class="toolbar-row" style="margin-top: 20px">
          <h2 style="margin: 0">上傳錯誤日誌</h2>
          <button class="btn-manage" @click="loadUploadErrorLogs">
            重新整理
          </button>
        </div>

        <div class="field-row" style="margin-top: 10px">
          <div class="field-item tight">
            <label>時間範圍：</label>
            <select v-model.number="logFilters.days">
              <option :value="1">近 1 天</option>
              <option :value="3">近 3 天</option>
              <option :value="7">近 7 天</option>
              <option :value="30">近 30 天</option>
            </select>
          </div>
          <div class="field-item tight">
            <label>動作：</label>
            <select v-model="logFilters.action">
              <option value="">全部</option>
              <option value="upload-photos">upload-photos</option>
              <option value="replace-photo">replace-photo</option>
              <option value="delete-photo">delete-photo</option>
              <option value="list-photos">list-photos</option>
            </select>
          </div>
          <div class="field-item">
            <label>關鍵字：</label>
            <input
              v-model.trim="logFilters.keyword"
              placeholder="code / 訂單號碼 / email / 檔名"
            />
          </div>
        </div>

        <div class="summary-row" style="margin-top: 8px">
          <span>符合筆數：{{ filteredUploadErrorLogs.length }}</span>
          <span>總筆數：{{ uploadErrorLogs.length }}</span>
        </div>

        <div v-if="logsLoading" class="muted-text">日誌讀取中…</div>
        <div
          v-else-if="filteredUploadErrorLogs.length === 0"
          class="muted-text"
        >
          目前沒有符合條件的上傳錯誤日誌
        </div>
        <div v-else class="table-wrap" style="margin-top: 8px">
          <table class="data-table">
            <thead>
              <tr>
                <th>時間</th>
                <th>動作</th>
                <th>錯誤碼</th>
                <th>訊息</th>
                <th class="secondary-col">員工</th>
                <th class="secondary-col">訂單</th>
                <th class="secondary-col">瀏覽器</th>
                <th class="secondary-col">網路</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in filteredUploadErrorLogs" :key="item.id">
                <td>{{ formatLogTime(item) }}</td>
                <td>{{ item?.context?.action || "-" }}</td>
                <td>{{ item.code || "-" }}</td>
                <td>{{ item.message || "-" }}</td>
                <td class="secondary-col">
                  {{ item.displayName || item.email || "-" }}
                </td>
                <td class="secondary-col">
                  {{
                    item?.context?.orderNumber ||
                    item?.context?.orderDocId ||
                    "-"
                  }}
                </td>
                <td class="secondary-col">
                  {{ parseBrowser(item?.context?.userAgent) }}
                </td>
                <td class="secondary-col">
                  {{ item?.context?.online ? "online" : "offline" }} /
                  {{ item?.context?.platform || "-" }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="toolbar-row" style="margin-top: 20px">
          <h2 style="margin: 0">完工照片資料夾自動新建紀錄</h2>
          <button class="btn-manage" @click="loadFolderCreationLogs">
            重新整理
          </button>
        </div>
        <p class="muted-text" style="margin-top: 4px">
          理論上每張完工照片都應該對應到既有訂單資料夾。當系統找不到該訂單資料夾、改為自動新建時會記錄一筆，請逐筆核對是否需要將檔案搬到正確位置。
        </p>

        <div class="summary-row" style="margin-top: 8px">
          <span>總筆數：{{ folderCreationLogs.length }}</span>
        </div>

        <div v-if="folderCreationsLoading" class="muted-text">日誌讀取中…</div>
        <div v-else-if="folderCreationLogs.length === 0" class="muted-text">
          目前沒有自動新建資料夾的紀錄
        </div>
        <div v-else class="table-wrap" style="margin-top: 8px">
          <table class="data-table">
            <thead>
              <tr>
                <th>時間</th>
                <th>訂單號</th>
                <th>新建資料夾</th>
                <th>原因</th>
                <th class="secondary-col">上層路徑</th>
                <th class="secondary-col">員工</th>
                <th class="secondary-col">建立失敗訊息</th>
                <th>修復</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in folderCreationLogs" :key="item.id">
                <td>{{ formatFolderCreationTime(item) }}</td>
                <td>{{ item.orderNumber || item.orderDocId || "-" }}</td>
                <td>{{ item.newFolderName || "-" }}</td>
                <td>{{ item.reason || "-" }}</td>
                <td class="secondary-col">{{ item.parentPath || "-" }}</td>
                <td class="secondary-col">
                  {{ item.uploadedByEmail || item.uploadedByUid || "-" }}
                </td>
                <td class="secondary-col">
                  {{ item.createFolderError || "-" }}
                </td>
                <td style="min-width: 260px">
                  <span v-if="repairedIds.has(item.id)" style="color: #198754"
                    >✅ 已修復</span
                  >
                  <template v-else>
                    <input
                      v-model="item.correctPathInput"
                      type="text"
                      placeholder="正確路徑(可選)"
                      style="width: 110px; font-size: 13px; margin-right: 4px"
                      @click.stop
                      @keydown.stop
                    />
                    <button
                      class="btn-manage"
                      :disabled="repairingIds.has(item.id)"
                      @click="handleRepairFolder(item, item.correctPathInput)"
                    >
                      {{ repairingIds.has(item.id) ? "修復中…" : "修復" }}
                    </button>
                    <button
                      v-if="!item.suggesting && !item.suggestedPath"
                      class="btn-manage"
                      style="margin-left: 4px; background: #eee; color: #333"
                      @click="suggestFolderPath(item)"
                    >
                      搜尋建議
                    </button>
                    <span
                      v-if="item.suggesting"
                      style="margin-left: 4px; color: #888"
                      >搜尋中…</span
                    >
                    <template v-if="item.suggestedPath">
                      <div
                        style="margin-top: 2px; font-size: 12px; color: #0a0"
                      >
                        建議路徑：<span style="word-break: break-all">{{
                          item.suggestedPath
                        }}</span>
                        <button
                          class="btn-manage"
                          style="margin-left: 4px"
                          :disabled="repairingIds.has(item.id)"
                          @click="handleRepairFolder(item, item.suggestedPath)"
                        >
                          執行搬移
                        </button>
                        <button
                          class="btn-manage"
                          style="
                            margin-left: 2px;
                            background: #eee;
                            color: #333;
                          "
                          @click="item.suggestedPath = ''"
                        >
                          取消
                        </button>
                      </div>
                    </template>
                  </template>
                </td>
                import { findOrderFolderOnNas } from "../firebase"; //
                搜尋建議路徑 async function suggestFolderPath(item) { if (!item
                || !item.orderNumber) return; item.suggesting = true;
                item.suggestedPath = ""; try { const result = await
                findOrderFolderOnNas(item.orderNumber); if (result &&
                result.found && result.folderPath) { item.suggestedPath =
                result.folderPath; } else { alert(result?.message ||
                "查無建議路徑"); } } catch (e) { alert(e?.message || e); }
                finally { item.suggesting = false; } }
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { findOrderFolderOnNas } from "../firebase";

// 搜尋建議路徑
async function suggestFolderPath(item) {
  if (!item || !item.orderNumber) return;
  item.suggesting = true;
  item.suggestedPath = "";
  try {
    const result = await findOrderFolderOnNas(item.orderNumber);
    if (result && result.found && result.folderPath) {
      item.suggestedPath = result.folderPath;
    } else {
      alert(result?.message || "查無建議路徑");
    }
  } catch (e) {
    alert(e?.message || e);
  } finally {
    item.suggesting = false;
  }
}
import { ref, onMounted, computed, watch } from "vue";
import {
  subscribeAuthState,
  fetchAllUsers,
  updateUserDisplayName,
  updateUserRole,
  ROLES,
  listClientUploadErrors,
  listCompletionPhotoFolderCreations,
  migrateLegacyCompletionPhotosToNas,
  precheckLegacyCompletionPhotosToNas,
  repairWrongOrderFolder,
} from "../firebase";
import { getUserByUid } from "../firebase";

const users = ref([]);
const loading = ref(true);
const isAdmin = ref(false);
const currentUid = ref(null);
const logsLoading = ref(false);
const uploadErrorLogs = ref([]);
const folderCreationsLoading = ref(false);
const folderCreationLogs = ref([]);
const repairingIds = ref(new Set());
const repairedIds = ref(new Set());
// 舊照片遷移工具預設隱藏；若日後又有需要可改為 true 暫時打開。
const showLegacyMigration = ref(false);
const logFilters = ref({
  days: 7,
  action: "",
  keyword: "",
});
const migrationLoading = ref(false);
const migrationPrecheckLoading = ref(false);
const migrationForm = ref({
  orderId: "",
  limit: 20,
  deleteStorageAfterSync: false,
});
const migrationResult = ref(null);
const migrationPrecheckResult = ref(null);
const migrationPrecheckKey = ref("");
// 不能修改的超級管理者 email
const adminEmail = "linlilung@gmail.com";

// 可用角色清單
const roles = ROLES;

async function loadUsers() {
  loading.value = true;
  const list = await fetchAllUsers();
  users.value = list.map((u) => ({
    ...u,
    role: u.role || "遊客",
    _origRole: u.role || "遊客",
    _origName: u.displayName || "",
  }));
  loading.value = false;
}

function changed(u) {
  return u.role !== u._origRole || (u.displayName || "") !== u._origName;
}

async function applyRole(u) {
  if (u.role !== u._origRole) {
    if (u.id === currentUid.value) {
      alert("無法變更自己的角色。");
      return;
    }
    if (u.email === adminEmail) {
      alert("此帳號的角色不可變更。");
      return;
    }
    await updateUserRole(u.id, u.role);
  }
  if ((u.displayName || "") !== u._origName) {
    await updateUserDisplayName(u.id, u.displayName || "");
  }
  await loadUsers();
}

async function runLegacyMigration() {
  if (!canRunMigration.value) {
    alert("請先執行遷移前檢查，並確認有可遷移資料後再執行。");
    return;
  }

  migrationLoading.value = true;
  migrationResult.value = null;
  try {
    const result = await migrateLegacyCompletionPhotosToNas({
      orderId: String(migrationForm.value.orderId || "").trim(),
      limit: Number(migrationForm.value.limit || 20),
      deleteStorageAfterSync: Boolean(
        migrationForm.value.deleteStorageAfterSync,
      ),
    });
    if (result && result.ok === false) {
      alert(
        `執行舊照片遷移失敗：${
          result.errorMessage || "未知錯誤"
        }\n錯誤代碼：${result.errorCode || "failed-precondition"}`,
      );
      migrationResult.value = result;
      migrationLoading.value = false;
      return;
    }
    migrationResult.value = result;
  } catch (e) {
    console.error("執行舊照片遷移失敗：", e);
    const code = String(e?.code || "").trim();
    const details =
      e?.details !== undefined && e?.details !== null
        ? `\n細節：${
            typeof e.details === "string"
              ? e.details
              : JSON.stringify(e.details)
          }`
        : "";
    alert(
      `執行舊照片遷移失敗：${e?.message || e}${
        code ? `\n錯誤代碼：${code}` : ""
      }${details}`,
    );
  }
  migrationLoading.value = false;
}

async function runLegacyMigrationPrecheck() {
  migrationPrecheckLoading.value = true;
  migrationPrecheckResult.value = null;
  migrationPrecheckKey.value = "";
  try {
    const result = await precheckLegacyCompletionPhotosToNas({
      orderId: String(migrationForm.value.orderId || "").trim(),
      limit: Number(migrationForm.value.limit || 20),
    });
    if (result && result.ok === false) {
      alert(
        `執行遷移前檢查失敗：${
          result.errorMessage || "未知錯誤"
        }\n錯誤代碼：${result.errorCode || "failed-precondition"}`,
      );
      migrationPrecheckResult.value = result;
      migrationPrecheckLoading.value = false;
      return;
    }
    migrationPrecheckResult.value = result;
    migrationPrecheckKey.value = buildMigrationPrecheckKey();
    if (!Number(result?.candidates || 0)) {
      alert("檢查完成：目前沒有可遷移的舊照片。");
    }
  } catch (e) {
    console.error("執行遷移前檢查失敗：", e);
    const code = String(e?.code || "").trim();
    const details =
      e?.details !== undefined && e?.details !== null
        ? `\n細節：${
            typeof e.details === "string"
              ? e.details
              : JSON.stringify(e.details)
          }`
        : "";
    alert(
      `執行遷移前檢查失敗：${e?.message || e}${
        code ? `\n錯誤代碼：${code}` : ""
      }${details}`,
    );
  }
  migrationPrecheckLoading.value = false;
}

function buildMigrationPrecheckKey() {
  return JSON.stringify({
    orderId: String(migrationForm.value.orderId || "").trim(),
    limit: Number(migrationForm.value.limit || 20),
  });
}

const canRunMigration = computed(() => {
  if (migrationLoading.value || migrationPrecheckLoading.value) return false;
  if (!migrationPrecheckResult.value?.ok) return false;
  if (Number(migrationPrecheckResult.value?.candidates || 0) <= 0) return false;
  return migrationPrecheckKey.value === buildMigrationPrecheckKey();
});

watch(
  () => [migrationForm.value.orderId, migrationForm.value.limit],
  () => {
    migrationPrecheckResult.value = null;
    migrationPrecheckKey.value = "";
  },
);

function toDate(value) {
  if (!value) return null;
  if (typeof value?.toDate === "function") {
    const d = value.toDate();
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatLogTime(item) {
  const createdAt = toDate(item?.createdAt);
  const fallback = toDate(item?.context?.occurredAtClient);
  const d = createdAt || fallback;
  if (!d) return "-";
  return d.toLocaleString("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function includesKeyword(item, keyword) {
  const k = String(keyword || "")
    .trim()
    .toLowerCase();
  if (!k) return true;
  const haystack = [
    item?.code,
    item?.message,
    item?.email,
    item?.displayName,
    item?.context?.orderNumber,
    item?.context?.orderDocId,
    item?.context?.fileName,
  ]
    .map((v) => String(v || "").toLowerCase())
    .join(" ");
  return haystack.includes(k);
}

function parseBrowser(ua) {
  if (!ua) return "-";
  const u = ua;
  // In-app browsers
  if (/SamsungBrowser\/([\d.]+)/i.test(u))
    return `Samsung ${RegExp.$1.split(".")[0]}`;
  if (/Line\/([\d.]+)/i.test(u)) return `LINE ${RegExp.$1.split(".")[0]}`;
  if (/Instagram/i.test(u)) return "Instagram";
  if (/FBAV\/|FBAN\/|FB_IAB/i.test(u)) return "Facebook";
  if (/KakaoTalk/i.test(u)) return "KakaoTalk";
  // Edge
  if (/EdgA\/([\d.]+)/i.test(u)) return `Edge(A) ${RegExp.$1.split(".")[0]}`;
  if (/Edg\/([\d.]+)/i.test(u)) return `Edge ${RegExp.$1.split(".")[0]}`;
  // Chrome on iOS
  if (/CriOS\/([\d.]+)/i.test(u))
    return `Chrome(iOS) ${RegExp.$1.split(".")[0]}`;
  // Firefox on iOS
  if (/FxiOS\/([\d.]+)/i.test(u))
    return `Firefox(iOS) ${RegExp.$1.split(".")[0]}`;
  // Firefox
  if (/Firefox\/([\d.]+)/i.test(u)) return `Firefox ${RegExp.$1.split(".")[0]}`;
  // Chrome
  if (/Chrome\/([\d.]+)/i.test(u)) return `Chrome ${RegExp.$1.split(".")[0]}`;
  // Safari (no Chrome/Chromium in UA)
  if (/Version\/([\d.]+).*Safari/i.test(u))
    return `Safari ${RegExp.$1.split(".")[0]}`;
  if (/Safari/i.test(u)) return "Safari";
  return ua.slice(0, 30);
}

const filteredUploadErrorLogs = computed(() => {
  const now = Date.now();
  const days = Number(logFilters.value.days || 7);
  const action = String(logFilters.value.action || "").trim();
  const keyword = String(logFilters.value.keyword || "").trim();
  const minTimestamp = now - days * 24 * 60 * 60 * 1000;

  return (uploadErrorLogs.value || []).filter((item) => {
    const createdAt =
      toDate(item?.createdAt) || toDate(item?.context?.occurredAtClient);
    if (createdAt && createdAt.getTime() < minTimestamp) return false;
    if (action && String(item?.context?.action || "") !== action) return false;
    return includesKeyword(item, keyword);
  });
});

async function loadUploadErrorLogs() {
  logsLoading.value = true;
  try {
    uploadErrorLogs.value = await listClientUploadErrors(250);
  } catch (e) {
    console.error("讀取上傳錯誤日誌失敗：", e);
    uploadErrorLogs.value = [];
  }
  logsLoading.value = false;
}

async function loadFolderCreationLogs() {
  folderCreationsLoading.value = true;
  try {
    folderCreationLogs.value = await listCompletionPhotoFolderCreations(250);
  } catch (e) {
    console.error("讀取資料夾自動新建紀錄失敗：", e);
    folderCreationLogs.value = [];
  }
  folderCreationsLoading.value = false;
}

function formatFolderCreationTime(item) {
  const d = toDate(item?.createdAt);
  if (!d) return "-";
  return d.toLocaleString("zh-TW", { hour12: false });
}

async function handleRepairFolder(item, userInputCorrectPath = "") {
  const orderNumber = String(
    item?.orderNumber || item?.orderDocId || "",
  ).trim();
  if (!orderNumber) {
    alert("此筆紀錄沒有訂單號碼，無法修復");
    return;
  }
  if (
    !confirm(
      `確定要修復訂單「${orderNumber}」嗎？\n會把錯誤資料夾內的檔案搬到正確資料夾，並刪除空的錯誤資料夾。`,
    )
  )
    return;

  // 觸發 reactivity（Set 直接 add 不會觸發 Vue 重繪）
  repairingIds.value = new Set(repairingIds.value).add(item.id);
  try {
    // 從稽核紀錄組出實際被新建的「錯誤資料夾路徑」，避免修復程式誤判
    let wrongPath = String(item?.fullPath || "").trim();
    if (!wrongPath) {
      const parent = String(item?.parentPath || "").trim();
      const folderName = String(item?.newFolderName || "").trim();
      if (parent && folderName) {
        wrongPath = parent.endsWith("/")
          ? parent + folderName
          : `${parent}/${folderName}`;
      }
    }
    let correctPath = String(userInputCorrectPath || "").trim();
    const result = await repairWrongOrderFolder(
      orderNumber,
      false,
      wrongPath,
      correctPath,
    );
    if (result?.ok) {
      const movedFiles = Number(result?.movedFiles || 0);
      const folderDeleted = Boolean(result?.folderDeleted);
      const updatedDocs = Number(result?.updatedPhotoDocs || 0);
      alert(
        `修復成功：\n搬移檔案 ${movedFiles} 個\n更新照片紀錄 ${updatedDocs} 筆\n錯誤資料夾${folderDeleted ? "已刪除" : "未刪除（可能還有子資料夾）"}\n` +
          `正確路徑：${result.correctPath}`,
      );
      // 修復成功後，從列表移除該筆紀錄
      folderCreationLogs.value = folderCreationLogs.value.filter(
        (row) => row.id !== item.id,
      );
    } else {
      alert(`無法修復：${result?.message || "未知原因"}`);
    }
  } catch (e) {
    console.error("repairWrongOrderFolder failed:", e);
    alert(`修復失敗：${e?.message || e}`);
  } finally {
    const next = new Set(repairingIds.value);
    next.delete(item.id);
    repairingIds.value = next;
  }
}

onMounted(() => {
  subscribeAuthState(async (u) => {
    if (!u) {
      isAdmin.value = false;
      currentUid.value = null;
      return;
    }
    currentUid.value = u.uid;
    const doc = await getUserByUid(u.uid);
    isAdmin.value = doc && (doc.role === "admin" || doc.role === "管理者");
    if (isAdmin.value) {
      await loadUsers();
      await loadUploadErrorLogs();
      await loadFolderCreationLogs();
    }
  });
});
</script>

<style scoped>
.name-input {
  width: 100%;
  max-width: 160px;
  padding: 3px 6px;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: 0.95rem;
}
.name-input:focus {
  outline: none;
  border-color: #4a90e2;
}
</style>
