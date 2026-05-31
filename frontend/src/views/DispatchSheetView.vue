<template>
  <div class="dispatch-sheet">
    <header class="page-header">
      <h2>🚚 派車表單</h2>
      <div class="header-actions">
        <RouterLink class="btn-aux" to="/orders">← 訂單列表</RouterLink>
      </div>
    </header>

    <section class="installer-phone-panel">
      <div class="installer-phone-title">安裝人員手機</div>
      <div v-if="installerContacts.length" class="installer-phone-list">
        <a
          v-for="installer in installerContacts"
          :key="installer.id"
          class="installer-phone-chip"
          :href="installer.phone ? `tel:${installer.phone}` : null"
          :aria-disabled="!installer.phone"
        >
          <span class="installer-phone-name">{{ installer.name || installer.id }}</span>
          <span class="installer-phone-number">{{ installer.phone || "未填手機" }}</span>
        </a>
      </div>
      <div v-else class="installer-phone-empty">尚無安裝人員資料</div>
    </section>

    <!-- 日期選擇列 -->
    <div class="date-bar">
      <label class="lbl">日期</label>
      <input v-model="date" type="date" class="date-input" />
      <button class="btn-primary" @click="loadByDate" :disabled="!date || loading">
        {{ loading ? "載入中…" : "📥 一鍵載入" }}
      </button>
      <button class="btn-aux" @click="importToOrders" :disabled="!rows.length || importSaving || loading">
        {{ importSaving ? "匯入中…" : "⬆ 手動匯到 Orders" }}
      </button>
      <button class="btn-aux" @click="setToday">今日</button>
      <button class="btn-aux" @click="setTomorrow">明日</button>
      <span class="hint">
        ※ 將載入該日的「預交日」訂單與「維修日」維修單
      </span>
      <span v-if="importMsg" class="hint">{{ importMsg }}</span>
      <span v-if="errMsg" class="err">{{ errMsg }}</span>
    </div>

    <div v-if="loaded">
      <p v-if="!rows.length" class="empty">當日無資料</p>

      <div v-else class="table-wrap">
        <table class="ds-table">
          <thead>
            <tr>
              <th class="col-kind">類型</th>
              <th class="col-no">訂單號</th>
              <th class="col-cust">客戶</th>
              <th class="col-addr">安裝地址</th>
              <th class="col-stone">石材</th>
              <th class="col-reason">原因</th>
              <th class="col-installer">安1 / 安2 / 安3</th>
              <th class="col-vehicle">車號</th>
              <th class="col-eta">預計到達</th>
              <th class="col-done">完工</th>
              <th class="col-ops">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="r in rows"
              :key="r.entryId"
              :class="{ done: r.completed, orphan: r._orphan }"
            >
              <td>
                <span class="badge" :class="r.kind">
                  {{ r.kind === "install" ? "安裝" : "維修" }}
                </span>
                <span v-if="r._orphan" class="orphan-tag" title="來源已不在當日">遺留</span>
              </td>
              <td class="mono">{{ r.sourceOrderNo || "—" }}</td>
              <td>{{ r.customerName || "—" }}</td>
              <td class="addr">{{ r.siteAddress || "—" }}</td>
              <td class="stone">{{ r.stoneLabel || "—" }}</td>
              <td class="reason">
                <input
                  v-model="r.reason"
                  type="text"
                  class="reason-input"
                  placeholder="輸入原因…"
                />
              </td>
              <td>
                <div class="installer-cell">
                  <div class="installer-slot" v-for="slot in installerSlots" :key="slot.key">
                    <label :for="`installer-${slot.key}-${r.entryId}`" class="installer-label">{{ slot.label }}</label>
                    <select
                      :id="`installer-${slot.key}-${r.entryId}`"
                      :value="getInstallerSlot(r, slot.index)"
                      class="installer-select"
                      @change="setInstallerSlot(r, slot.index, $event.target.value)"
                    >
                      <option value="">未指定</option>
                      <option
                        v-for="s in installers"
                        :key="s.id"
                        :value="s.id"
                      >
                        {{ s.name }}
                      </option>
                    </select>
                  </div>
                  <div v-if="r.installerNames?.length" class="picked">
                    已選:{{ r.installerNames.join("、") }}
                  </div>
                </div>
              </td>
              <td>
                <input
                  v-model="r.vehiclePlate"
                  type="text"
                  class="vehicle-input"
                  placeholder="輸入車號"
                />
              </td>
              <td>
                <input v-model="r.etaTime" type="time" class="eta-input" />
              </td>
              <td class="col-done">
                <label class="ck">
                  <input type="checkbox" v-model="r.completed" />
                  <span>{{ r.completed ? "已完工" : "未完工" }}</span>
                </label>
              </td>
              <td class="col-ops">
                <button class="btn-mini" @click="onSave(r)" :disabled="r._saving">
                  {{ r._saving ? "儲存中…" : "💾 儲存" }}
                </button>
                <button class="btn-mini danger" @click="onDelete(r)">
                  🗑 約不到
                </button>
                <span v-if="r._msg" class="row-msg">{{ r._msg }}</span>
              </td>
            </tr>
          </tbody>
        </table>

        <div class="bulk-actions">
          <button class="btn-primary" @click="saveAll" :disabled="bulkSaving">
            {{ bulkSaving ? "全部儲存中…" : "💾 全部儲存" }}
          </button>
          <span v-if="bulkMsg" class="hint">{{ bulkMsg }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from "vue";
import {
  loadDispatchByDate,
  saveDispatchEntry,
  deleteDispatchEntry,
  listActiveStaff,
  listStaffByDept,
  fetchAllUsers,
  userHasAnyDept,
  importDispatchRowsToOrders,
} from "../firebase";

const date = ref(todayStr());
const rows = ref([]);
const installers = ref([]);
const installerContacts = ref([]);
const loading = ref(false);
const loaded = ref(false);
const errMsg = ref("");
const bulkSaving = ref(false);
const bulkMsg = ref("");
const importSaving = ref(false);
const importMsg = ref("");
const installerContactNameOverrides = new Set([
  "楊家斌",
  "王冠堯",
  "傅子洋",
  "顏呈翰",
]);
const installerSlots = [
  { key: "1", label: "安1", index: 0 },
  { key: "2", label: "安2", index: 1 },
  { key: "3", label: "安3", index: 2 },
];

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function setToday() {
  date.value = todayStr();
}
function setTomorrow() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  date.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function loadInstallers() {
  try {
    const [staffList, allStaff, users] = await Promise.all([
      listStaffByDept("2"),
      listActiveStaff(),
      fetchAllUsers(),
    ]);
    installers.value = staffList;
    installerContacts.value = buildInstallerContacts(allStaff, users);
  } catch (e) {
    console.warn("load installers failed", e);
  }
}

function buildInstallerContacts(staffList, users) {
  const installUsers = (Array.isArray(users) ? users : []).filter((user) =>
    userHasAnyDept(user, ["2"]),
  );
  const emailSet = new Set(
    installUsers
      .map((user) => String(user.email || "").trim().toLowerCase())
      .filter(Boolean),
  );
  const nameSet = new Set(
    installUsers
      .map((user) => normalizeInstallerName(user.displayName || user.name || ""))
      .filter(Boolean),
  );

  return (Array.isArray(staffList) ? staffList : []).filter((staff) => {
    const email = String(staff.email || "").trim().toLowerCase();
    const name = normalizeInstallerName(staff.name || "");
    return (email && emailSet.has(email))
      || (name && nameSet.has(name))
      || installerContactNameOverrides.has(name);
  });
}

function normalizeInstallerName(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/顔/g, "顏");
}

function syncInstallerNames(r) {
  const map = new Map(installers.value.map((s) => [s.id, s.name]));
  r.installerUids = normalizeInstallerUids(r.installerUids);
  r.installerNames = r.installerUids.map((id) => map.get(id) || id);
}

function normalizeInstallerUids(value) {
  return (Array.isArray(value) ? value : [])
    .map((id) => String(id || "").trim())
    .filter(Boolean)
    .filter((id, index, arr) => arr.indexOf(id) === index)
    .slice(0, 3);
}

function getInstallerSlot(r, index) {
  return normalizeInstallerUids(r.installerUids)[index] || "";
}

function setInstallerSlot(r, index, nextValue) {
  const next = normalizeInstallerUids(r.installerUids);
  const value = String(nextValue || "").trim();
  next.splice(index, 1, value);
  r.installerUids = next.filter(Boolean);
  syncInstallerNames(r);
}

async function loadByDate() {
  if (!date.value) return;
  loading.value = true;
  errMsg.value = "";
  try {
    const data = await loadDispatchByDate(date.value);
    rows.value = data;
    loaded.value = true;
  } catch (e) {
    errMsg.value = e?.message || "載入失敗";
  } finally {
    loading.value = false;
  }
}

async function onSave(r) {
  r._saving = true;
  r._msg = "";
  try {
    syncInstallerNames(r);
    await saveDispatchEntry(r);
    r._persisted = true;
    r._msg = "✔ 已儲存";
    setTimeout(() => (r._msg = ""), 1800);
  } catch (e) {
    r._msg = "❌ " + (e?.message || "儲存失敗");
  } finally {
    r._saving = false;
  }
}

async function saveAll() {
  bulkSaving.value = true;
  bulkMsg.value = "";
  let ok = 0, fail = 0;
  for (const r of rows.value) {
    try {
      syncInstallerNames(r);
      await saveDispatchEntry(r);
      r._persisted = true;
      ok++;
    } catch (e) {
      console.error("save failed", r.entryId, e);
      fail++;
    }
  }
  bulkSaving.value = false;
  bulkMsg.value = `成功 ${ok} 筆${fail ? `,失敗 ${fail} 筆` : ""}`;
  setTimeout(() => (bulkMsg.value = ""), 3000);
}

async function importToOrders() {
  const targetRows = rows.value.filter((row) => !row._orphan && row.sourceOrderNo);
  if (!targetRows.length) {
    importMsg.value = "沒有可匯入的資料";
    setTimeout(() => (importMsg.value = ""), 3000);
    return;
  }
  if (!confirm(`確定要把 ${targetRows.length} 筆 ${date.value} 派車資料手動匯入 Orders？\n\n相同文件 id 會以 merge 方式更新。`)) {
    return;
  }

  importSaving.value = true;
  importMsg.value = "";
  try {
    const result = await importDispatchRowsToOrders(targetRows);
    importMsg.value = `已匯入 ${result.imported} 筆${result.skipped ? `，略過 ${result.skipped} 筆` : ""}`;
  } catch (e) {
    importMsg.value = `匯入失敗：${e?.message || e}`;
  } finally {
    importSaving.value = false;
    setTimeout(() => (importMsg.value = ""), 4000);
  }
}

async function onDelete(r) {
  if (
    !confirm(
      `約不到客人,將刪除此派車紀錄。\n` +
      `是否同時清除來源${r.kind === "install" ? "訂單" : "維修單"}的日期,並開啟編輯頁讓您改期?\n\n` +
      `[確定] = 刪除並開啟編輯頁\n[取消] = 不刪除`
    )
  ) {
    return;
  }
  try {
    await deleteDispatchEntry(r.entryId, {
      clearSourceDate: true,
      sourceCollection: r.sourceCollection,
      sourceId: r.sourceId,
    });
    // 從表格移除
    rows.value = rows.value.filter((x) => x.entryId !== r.entryId);
    // 自動開啟來源編輯頁
    if (r.sourceCollection === "salesOrders" && r.sourceId) {
      window.open(`/orders/${r.sourceId}/edit`, "_blank");
    } else if (r.sourceCollection === "repairTickets" && r.sourceId) {
      window.open(`/orders/repair/${r.sourceId}`, "_blank");
    }
  } catch (e) {
    alert("刪除失敗:" + (e?.message || e));
  }
}

onMounted(async () => {
  await loadInstallers();
  // 預設載入今日
  await loadByDate();
});
</script>

<style scoped>
.dispatch-sheet {
  padding: 16px 20px;
  max-width: 1500px;
  margin: 0 auto;
}
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.page-header h2 {
  margin: 0;
  font-size: 20px;
}
.header-actions {
  display: flex;
  gap: 8px;
}
.installer-phone-panel {
  margin-bottom: 14px;
  padding: 14px 16px;
  border: 1px solid #dbe4f0;
  border-radius: 10px;
  background: linear-gradient(135deg, #f8fbff 0%, #eef4ff 100%);
}
.installer-phone-title {
  margin-bottom: 10px;
  font-size: 14px;
  font-weight: 700;
  color: #1e3a8a;
}
.installer-phone-list {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.installer-phone-chip {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 180px;
  padding: 8px 12px;
  border: 1px solid #bfdbfe;
  border-radius: 999px;
  background: #fff;
  color: #0f172a;
  text-decoration: none;
}
.installer-phone-chip[aria-disabled="true"] {
  cursor: default;
}
.installer-phone-name {
  font-weight: 600;
}
.installer-phone-number {
  color: #475569;
  font-family: ui-monospace, Menlo, Consolas, monospace;
}
.installer-phone-empty {
  color: #64748b;
  font-size: 13px;
}

/* 日期列 */
.date-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  background: #f3f4f6;
  padding: 12px 14px;
  border-radius: 6px;
  margin-bottom: 14px;
}
.lbl {
  font-weight: 600;
}
.date-input {
  font-size: 15px;
  padding: 5px 8px;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
}
.hint {
  color: #64748b;
  font-size: 12px;
}
.err {
  color: #b91c1c;
  font-size: 13px;
}

/* 按鈕 */
.btn-primary,
.btn-aux,
.btn-mini {
  border: 1px solid transparent;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  text-decoration: none;
}
.btn-primary {
  background: #2563eb;
  color: #fff;
  padding: 6px 14px;
}
.btn-primary:disabled {
  background: #94a3b8;
  cursor: not-allowed;
}
.btn-aux {
  background: #fff;
  color: #1e293b;
  border-color: #cbd5e1;
  padding: 6px 12px;
}
.btn-mini {
  background: #e0e7ff;
  color: #1e3a8a;
  padding: 4px 8px;
  margin: 0 2px;
}
.btn-mini.danger {
  background: #fee2e2;
  color: #991b1b;
}

/* 表 */
.empty {
  text-align: center;
  color: #6b7280;
  padding: 30px;
}
.table-wrap {
  overflow-x: auto;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  background: #fff;
}
.ds-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.ds-table th,
.ds-table td {
  border-bottom: 1px solid #e5e7eb;
  padding: 6px 8px;
  vertical-align: top;
}
.ds-table thead th {
  background: #f8fafc;
  text-align: left;
  font-weight: 600;
  position: sticky;
  top: 0;
}
.ds-table tr.done {
  background: #f0fdf4;
}
.ds-table tr.orphan {
  background: #fef2f2;
}
.col-no {
  white-space: nowrap;
}
.mono {
  font-family: ui-monospace, Menlo, Consolas, monospace;
}
.addr {
  max-width: 260px;
}
.stone {
  max-width: 160px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.reason {
  max-width: 200px;
}
.reason-input {
  width: 100%;
  padding: 4px 6px;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  font-size: 13px;
  color: #7c2d12;
}
.reason-input:focus {
  outline: none;
  border-color: #2563eb;
  box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.15);
}

/* badge */
.badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 99px;
  font-size: 11px;
  color: #fff;
}
.badge.install {
  background: #2563eb;
}
.badge.repair {
  background: #d97706;
}
.orphan-tag {
  margin-left: 6px;
  font-size: 10px;
  color: #b91c1c;
  background: #fee2e2;
  padding: 1px 6px;
  border-radius: 99px;
}

/* installer */
.installer-cell {
  min-width: 160px;
}
.installer-slot {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
}
.installer-label {
  width: 26px;
  font-size: 12px;
  color: #475569;
}
.installer-select {
  width: 100%;
  font-size: 12px;
  padding: 4px 6px;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
}
.picked {
  font-size: 11px;
  color: #1e40af;
  margin-top: 2px;
}

.vehicle-input,
.eta-input {
  width: 100%;
  padding: 3px 6px;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
  font-size: 13px;
}

.ck {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  cursor: pointer;
  user-select: none;
}

.row-msg {
  font-size: 11px;
  color: #16a34a;
  margin-left: 6px;
}

.bulk-actions {
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 10px 14px;
  background: #f8fafc;
  border-top: 1px solid #e5e7eb;
}
</style>
