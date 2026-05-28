<template>
  <div class="production-view">
    <header class="page-header">
      <h2>🏭 生產流程</h2>
      <div class="header-actions">
        <button v-if="isAdmin" class="btn-aux" :disabled="backfilling" @click="onBackfill">
          {{ backfilling ? `補建中 ${backfillDone}/${backfillTotal}…` : '⬇ 同步現有訂單' }}
        </button>
        <button class="btn-aux" @click="reload">↻ 重新整理</button>
      </div>
    </header>

    <!-- ── 工序 Tabs ── -->
    <div class="stage-tabs">
      <button
        v-for="s in STAGES"
        :key="s.key"
        class="stage-tab"
        :class="{ active: activeStage === s.key }"
        @click="activeStage = s.key"
      >
        {{ s.label }}
        <span v-if="pendingCount(s.key)" class="tab-badge">{{ pendingCount(s.key) }}</span>
      </button>
    </div>

    <!-- ── 統計列 ── -->
    <div class="stats-row">
      <div class="stat-card stat-pending">
        <div class="stat-label">待{{ stageName }}</div>
        <div class="stat-value">{{ pendingJobs.length }} 件</div>
        <div class="stat-sub" v-if="pendingAmount">{{ fmtMoney(pendingAmount) }}</div>
      </div>
      <div class="stat-card stat-porcelain">
        <div class="stat-label">陶板剩餘</div>
        <div class="stat-value">{{ porcelainJobs.length }} 件</div>
        <div class="stat-sub" v-if="porcelainAmount">{{ fmtMoney(porcelainAmount) }}</div>
      </div>
      <div class="stat-card stat-quartz">
        <div class="stat-label">石英石剩餘</div>
        <div class="stat-value">{{ quartzJobs.length }} 件</div>
        <div class="stat-sub" v-if="quartzAmount">{{ fmtMoney(quartzAmount) }}</div>
      </div>
      <div class="stat-card stat-today">
        <div class="stat-label">今日完成</div>
        <div class="stat-value">{{ todayDoneJobs.length }} 件</div>
        <div class="stat-sub" v-if="todayDoneAmount">{{ fmtMoney(todayDoneAmount) }}</div>
      </div>
    </div>

    <!-- ── 三欄摘要 ── -->
    <div v-if="!loading" class="summary-panels">
      <!-- 全部（含今日完成） -->
      <div class="panel">
        <h4>📋 全部</h4>
        <div
          v-for="[date, grp] in allByDate"
          :key="date"
          class="date-row"
          :class="{ today: isDateToday(date), overdue: isDateOverdue(date) }"
        >
          <span class="date-lbl">{{ fmtDateShort(date) }}:</span>
          <span class="date-cnt">{{ grp.length }}件</span>
          <span v-if="sumMoney(grp)" class="date-amt">{{ fmtMoney(sumMoney(grp)) }}</span>
        </div>
        <p v-if="!allByDate.length" class="panel-empty">—</p>
      </div>
      <!-- 未完成 -->
      <div class="panel">
        <h4>⏳ 未完成</h4>
        <div
          v-for="[date, grp] in pendingByDate"
          :key="date"
          class="date-row"
          :class="{ today: isDateToday(date), overdue: isDateOverdue(date) }"
        >
          <span class="date-lbl">{{ fmtDateShort(date) }}:</span>
          <span class="date-cnt">{{ grp.length }}件</span>
          <span v-if="sumMoney(grp)" class="date-amt">{{ fmtMoney(sumMoney(grp)) }}</span>
        </div>
        <p v-if="!pendingByDate.length" class="panel-empty">—</p>
      </div>
      <!-- 今日完成 -->
      <div class="panel panel-today-done">
        <h4>🏆 今日完成戰績</h4>
        <div v-if="todayDoneJobs.length">
          <div
            v-for="job in todayDoneJobs"
            :key="job.id"
            class="today-row"
          >
            <button
              type="button"
              class="order-link order-link-btn"
              @click="openOrderPdf(job)"
            >
              {{ job.orderNo || job.id.slice(0, 8) }}
            </button>
            <span class="today-name">{{ job.customerName }}</span>
            <span v-if="job.total" class="today-amt">{{ fmtMoney(job.total) }}</span>
            <button class="btn-reset-small" title="退回工序" @click="openReject(job)">↩</button>
          </div>
        </div>
        <p v-else class="panel-empty">今日尚無完成</p>
      </div>
    </div>

    <!-- ── 搜尋 + 排序 ── -->
    <div class="filter-bar">
      <input
        v-model="keyword"
        class="search-input"
        placeholder="搜尋訂單號 / 客戶 / 地址 / 石材"
      />
      <button
        v-for="opt in SORT_OPTS"
        :key="opt.val"
        class="btn-sort"
        :class="{ active: sortBy === opt.val }"
        @click="sortBy = opt.val"
      >
        {{ opt.label }}
      </button>
    </div>

    <div v-if="completedSearchJobs.length" class="completed-search-panel">
      <div class="completed-search-head">
        <h3>已完成工單搜尋結果</h3>
        <span>共 {{ completedSearchJobs.length }} 筆，可直接退回</span>
      </div>
      <div class="table-wrap">
        <table class="jobs-table completed-table">
          <thead>
            <tr>
              <th>完成日期</th>
              <th>訂單號</th>
              <th>客戶</th>
              <th>施工地址</th>
              <th>石材</th>
              <th>金額</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="job in completedSearchJobs" :key="job.id">
              <td class="col-date">
                <span class="date-badge badge-completed">
                  {{ fmtStageDoneDate(job.stages?.qc?.doneAt) || '—' }}
                </span>
              </td>
              <td class="col-no">
                <button
                  type="button"
                  class="order-link order-link-btn"
                  @click="openOrderPdf(job)"
                >
                  {{ job.orderNo || '—' }}
                </button>
              </td>
              <td class="col-customer">{{ job.customerName || '—' }}</td>
              <td class="col-addr">{{ job.siteAddress || '—' }}</td>
              <td class="col-stone">
                <button
                  v-for="(s, i) in job.stones"
                  :key="i"
                  type="button"
                  class="stone-tag stone-link"
                  :class="'mat-' + s.materialType"
                  :disabled="!canOpenStoneInventory(s)"
                  @click="openStoneInventory(s)"
                >
                  {{ s.color || s.brand || s.materialType }}
                </button>
              </td>
              <td class="col-money">{{ job.total ? fmtMoney(job.total) : '—' }}</td>
              <td class="col-actions">
                <button class="btn-reject" @click="openReject(job)">
                  ↩ 退回
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <p v-if="loading" class="hint">載入中…</p>
    <p v-else-if="!filteredJobs.length" class="hint">目前無待{{ stageName }}訂單。</p>

    <!-- ── 訂單列表 ── -->
    <div v-else class="table-wrap">
      <table class="jobs-table">
        <thead>
          <tr>
            <th>預交日</th>
            <th>訂單號</th>
            <th>客戶</th>
            <th>施工地址</th>
            <th>石材</th>
            <th>金額</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="job in filteredJobs"
            :key="job.id"
            :class="{ 'row-overdue': isDateOverdue(job.promisedAt) }"
          >
            <td class="col-date">
              <span class="date-badge" :class="dateBadgeClass(job.promisedAt)">
                {{ fmtDateMd(job.promisedAt) || '—' }}
              </span>
            </td>
            <td class="col-no">
              <button
                type="button"
                class="order-link order-link-btn"
                @click="openOrderPdf(job)"
              >
                {{ job.orderNo || '—' }}
              </button>
            </td>
            <td class="col-customer">{{ job.customerName || '—' }}</td>
            <td class="col-addr">{{ job.siteAddress || '—' }}</td>
            <td class="col-stone">
              <button
                v-for="(s, i) in job.stones"
                :key="i"
                type="button"
                class="stone-tag stone-link"
                :class="'mat-' + s.materialType"
                :disabled="!canOpenStoneInventory(s)"
                @click="openStoneInventory(s)"
              >
                {{ s.color || s.brand || s.materialType }}
              </button>
            </td>
            <td class="col-money">{{ job.total ? fmtMoney(job.total) : '—' }}</td>
            <td class="col-actions">
              <button class="btn-done" :disabled="advancing === job.id" @click="onDone(job)">
                {{ advancing === job.id ? '…' : '✅ 完成' }}
              </button>
              <button
                class="btn-reject"
                :disabled="advancing === job.id"
                @click="openReject(job)"
              >
                ↩ 退回
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- ── QC 退回 Dialog ── -->
    <div v-if="rejectTarget" class="overlay" @click.self="rejectTarget = null">
      <div class="reject-modal">
        <h3>退回工序</h3>
        <p class="reject-order">訂單：<strong>{{ rejectTarget.orderNo || rejectTarget.id }}</strong>　{{ rejectTarget.customerName }}</p>
        <div class="reject-row">
          <label>退回至：</label>
          <select v-model="rejectToStage">
            <option v-for="s in STAGES.slice(0, -1)" :key="s.key" :value="s.key">{{ s.label }}</option>
          </select>
        </div>
        <div class="reject-row">
          <label>原因：</label>
          <textarea v-model="rejectNotes" rows="3" placeholder="退回原因（選填）"></textarea>
        </div>
        <div class="modal-actions">
          <button class="btn-secondary" @click="rejectTarget = null">取消</button>
          <button class="btn-danger" :disabled="rejecting" @click="confirmReject">
            {{ rejecting ? '處理中…' : '確認退回' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from "vue";
import { PRODUCTION_STAGES, listProductionJobs, advanceProductionStage, rejectProductionQc, resetProductionJob, backfillProductionJobs, backfillLegacyOrderProductionFields, getUserByUid, refreshConfirmedPdfDownloadUrl, userHasAnyRole } from "../firebase";
import { auth } from "../firebase";

const STAGES = PRODUCTION_STAGES;
const SORT_OPTS = [
  { val: "date",      label: "純日期排序" },
  { val: "porcelain", label: "陶板優先" },
  { val: "quartz",    label: "石英石優先" },
  { val: "total",     label: "金額大到小" },
];

const activeStage = ref("cut");
const loading     = ref(true);
const allJobs     = ref([]);
const keyword     = ref("");
const sortBy      = ref("date");
const advancing    = ref(null);   // jobId currently being advanced
const isAdmin      = ref(false);
const backfilling  = ref(false);
const backfillDone  = ref(0);
const backfillTotal = ref(0);
const rejectTarget = ref(null);
const rejectToStage = ref("cut");
const rejectNotes = ref("");
const rejecting   = ref(false);

// ── helpers ──────────────────────────────────────────────────────────

function fmtMoney(n) {
  if (n == null) return "";
  return "$" + Number(n).toLocaleString("zh-TW");
}

function fmtDateShort(d) {
  if (!d) return "—";
  const s = String(d).slice(5); // "MM-DD"
  return s.replace("-", "/");
}

function fmtDateMd(d) {
  if (!d) return null;
  return String(d).slice(5).replace("-", "/");
}

function tsToDate(ts) {
  if (!ts) return null;
  if (ts.toDate) return ts.toDate();
  return new Date(ts);
}

function isToday(ts) {
  const d = tsToDate(ts);
  if (!d) return false;
  const now = new Date();
  return d.getFullYear() === now.getFullYear() &&
         d.getMonth()    === now.getMonth() &&
         d.getDate()     === now.getDate();
}

function matchJobKeyword(job, kw) {
  if (!kw) return true;
  return (
    (job.orderNo || "").toLowerCase().includes(kw) ||
    (job.customerName || "").toLowerCase().includes(kw) ||
    (job.siteAddress || "").toLowerCase().includes(kw) ||
    (job.stones || []).some(
      (s) =>
        (s.color || "").toLowerCase().includes(kw) ||
        (s.brand || "").toLowerCase().includes(kw),
    )
  );
}

function fmtStageDoneDate(value) {
  const d = tsToDate(value);
  if (!d) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function canOpenStoneInventory(stone) {
  return Boolean(String(stone?.color || "").trim());
}

async function openOrderPdf(job) {
  const orderId = String(job?.orderId || "").trim();
  const orderNumber = String(job?.orderNo || "").trim();
  if (!orderId) return;
  try {
    const url = await refreshConfirmedPdfDownloadUrl(orderId);
    window.open(url, "_blank", "noopener,noreferrer");
  } catch (e) {
    console.error("openOrderPdf failed", e);
    alert(`找不到${orderNumber ? `訂單 ${orderNumber} 的` : ""}確定單 PDF：` + (e?.message || String(e)));
  }
}

function openStoneInventory(stone) {
  const color = String(stone?.color || "").trim();
  if (!color) return;
  const url = `/inventory?color=${encodeURIComponent(color)}`;
  window.open(url, "_blank", "noopener,noreferrer");
}

function isDateToday(dateStr) {
  if (!dateStr) return false;
  const today = new Date();
  const ymd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  return dateStr === ymd;
}

function isDateOverdue(dateStr) {
  if (!dateStr) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(dateStr) < today;
}

function dateBadgeClass(dateStr) {
  if (!dateStr) return "";
  if (isDateToday(dateStr)) return "badge-today";
  if (isDateOverdue(dateStr)) return "badge-overdue";
  return "";
}

function sumMoney(jobs) {
  return jobs.reduce((acc, j) => acc + (j.total || 0), 0);
}

function groupByDate(jobs) {
  const map = new Map();
  for (const j of jobs) {
    const key = j.promisedAt || "未定";
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(j);
  }
  return Array.from(map.entries()).sort((a, b) => {
    if (a[0] === "未定") return 1;
    if (b[0] === "未定") return -1;
    return a[0].localeCompare(b[0]);
  });
}

// ── computed ─────────────────────────────────────────────────────────

const stageName = computed(() => STAGES.find((s) => s.key === activeStage.value)?.label || "");

function pendingCount(stageKey) {
  return allJobs.value.filter((j) => j.currentStage === stageKey).length;
}

const pendingJobs = computed(() =>
  allJobs.value.filter((j) => j.currentStage === activeStage.value)
);

const porcelainJobs = computed(() =>
  pendingJobs.value.filter((j) => j.primaryMaterial === "porcelain")
);
const quartzJobs = computed(() =>
  pendingJobs.value.filter((j) => j.primaryMaterial === "quartz")
);

const pendingAmount  = computed(() => sumMoney(pendingJobs.value));
const porcelainAmount = computed(() => sumMoney(porcelainJobs.value));
const quartzAmount   = computed(() => sumMoney(quartzJobs.value));

const todayDoneJobs = computed(() =>
  allJobs.value.filter((j) => {
    const stage = j.stages?.[activeStage.value];
    return stage?.status === "done" && isToday(stage.doneAt);
  })
);
const todayDoneAmount = computed(() => sumMoney(todayDoneJobs.value));

const allByDate = computed(() =>
  groupByDate([...pendingJobs.value, ...todayDoneJobs.value])
);
const pendingByDate = computed(() => groupByDate(pendingJobs.value));

const completedSearchJobs = computed(() => {
  const kw = keyword.value.trim().toLowerCase();
  if (!kw) return [];
  return allJobs.value
    .filter((j) => j.currentStage === "done" && matchJobKeyword(j, kw))
    .sort((a, b) => {
      const aTs = tsToDate(a.stages?.qc?.doneAt)?.getTime() || 0;
      const bTs = tsToDate(b.stages?.qc?.doneAt)?.getTime() || 0;
      return bTs - aTs;
    })
    .slice(0, 20);
});

const filteredJobs = computed(() => {
  let jobs = [...pendingJobs.value];
  const kw = keyword.value.trim().toLowerCase();
  if (kw) jobs = jobs.filter((j) => matchJobKeyword(j, kw));
  // sort
  jobs = [...jobs].sort((a, b) => {
    const da = a.promisedAt || "9999";
    const db_ = b.promisedAt || "9999";
    const dateCompare = da.localeCompare(db_);
    if (sortBy.value === "date") return dateCompare;
    if (sortBy.value === "total") return (b.total || 0) - (a.total || 0);
    if (sortBy.value === "porcelain") {
      const ap = a.primaryMaterial === "porcelain" ? 0 : 1;
      const bp = b.primaryMaterial === "porcelain" ? 0 : 1;
      return ap !== bp ? ap - bp : dateCompare;
    }
    if (sortBy.value === "quartz") {
      const aq = a.primaryMaterial === "quartz" ? 0 : 1;
      const bq = b.primaryMaterial === "quartz" ? 0 : 1;
      return aq !== bq ? aq - bq : dateCompare;
    }
    return dateCompare;
  });
  return jobs;
});

// ── actions ──────────────────────────────────────────────────────────

async function reload() {
  loading.value = true;
  try {
    allJobs.value = await listProductionJobs();
  } catch (e) {
    console.error(e);
    alert("載入失敗：" + (e?.message || e));
  } finally {
    loading.value = false;
  }
}

async function onDone(job) {
  const name = auth.currentUser?.displayName || auth.currentUser?.email || "";
  advancing.value = job.id;
  try {
    await advanceProductionStage(job.id, activeStage.value, name);
    allJobs.value = await listProductionJobs();
  } catch (e) {
    console.error(e);
    alert("操作失敗：" + (e?.message || e));
  } finally {
    advancing.value = null;
  }
}

function openReject(job) {
  rejectTarget.value = job;
  rejectToStage.value = "cut";
  rejectNotes.value = "";
}

async function confirmReject() {
  if (!rejectTarget.value) return;
  rejecting.value = true;
  try {
    await resetProductionJob(rejectTarget.value.id, rejectToStage.value, rejectNotes.value);
    allJobs.value = await listProductionJobs();
    rejectTarget.value = null;
  } catch (e) {
    console.error(e);
    alert("退回失敗：" + (e?.message || e));
  } finally {
    rejecting.value = false;
  }
}

async function onBackfill() {
  if (!confirm("將為所有「已確認」和「生產中」的訂單補建生產工單，並回填員工查詢的裁切/水刀/驗收欄位，是否繼續？")) return;
  backfilling.value = true;
  backfillDone.value = 0;
  backfillTotal.value = 0;
  try {
    const { total, done } = await backfillProductionJobs((d, t) => {
      backfillDone.value = d;
      backfillTotal.value = t;
    });
    backfillDone.value = 0;
    backfillTotal.value = 0;
    const productionSync = await backfillLegacyOrderProductionFields((d, t) => {
      backfillDone.value = d;
      backfillTotal.value = t;
    });
    alert(`補建完成：工單 ${done}/${total} 筆，Orders 欄位回填 ${productionSync.done}/${productionSync.total} 筆`);
    await reload();
  } catch (e) {
    console.error(e);
    alert("補建失敗：" + (e?.message || e));
  } finally {
    backfilling.value = false;
  }
}

onMounted(async () => {
  const uid = auth.currentUser?.uid;
  if (uid) {
    const u = await getUserByUid(uid);
    isAdmin.value = userHasAnyRole(u, ["admin", "管理者"]);
  }
  await reload();
});
</script>

<style scoped>
.production-view {
  padding: 16px;
  max-width: 1400px;
  margin: 0 auto;
}
.page-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}
.page-header h2 { margin: 0; flex: 1; font-size: 1.3rem; }

/* ── Stage tabs ── */
.stage-tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 16px;
  border-bottom: 2px solid #e0e0e0;
}
.stage-tab {
  position: relative;
  padding: 8px 28px;
  border: none;
  border-bottom: 3px solid transparent;
  background: transparent;
  font-size: 1rem;
  font-weight: 600;
  color: #666;
  cursor: pointer;
  transition: all .15s;
}
.stage-tab:hover { color: #333; background: #f5f5f5; }
.stage-tab.active {
  color: #1976d2;
  border-bottom-color: #1976d2;
  background: #e3f2fd;
  border-radius: 4px 4px 0 0;
}
.tab-badge {
  position: absolute;
  top: 4px;
  right: 6px;
  background: #e53935;
  color: #fff;
  border-radius: 10px;
  font-size: .68rem;
  padding: 1px 5px;
  min-width: 16px;
  text-align: center;
}

/* ── Stats row ── */
.stats-row {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}
.stat-card {
  flex: 1;
  min-width: 130px;
.stone-link {
  border: none;
  cursor: pointer;
}
.stone-link:disabled {
  cursor: default;
}
.stone-link:not(:disabled):hover {
  filter: brightness(0.96);
}
  border-radius: 10px;
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.stat-label { font-size: .78rem; color: #888; }
.stat-value { font-size: 1.5rem; font-weight: 700; }
.stat-sub   { font-size: .85rem; color: #666; }
.order-link-btn {
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
}

.stat-pending   { background: #fff3e0; }
.stat-pending .stat-value { color: #e65100; }
.stat-porcelain { background: #fce4ec; }
.stat-porcelain .stat-value { color: #c62828; }
.stat-quartz    { background: #e8f5e9; }
.stat-quartz .stat-value   { color: #2e7d32; }
.stat-today     { background: #e8eaf6; }
.stat-today .stat-value    { color: #283593; }

/* ── Summary panels ── */
.summary-panels {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  margin-bottom: 16px;
}
.panel {
  background: #fafafa;
  border: 1px solid #e8e8e8;
  border-radius: 8px;
  padding: 12px 14px;
  max-height: 220px;
  overflow-y: auto;
}
.panel h4 { margin: 0 0 8px; font-size: .92rem; color: #444; }
.panel-today-done { background: #fffde7; border-color: #f9a825; }
.panel-empty { font-size: .82rem; color: #aaa; margin: 0; }

.date-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 0;
  font-size: .84rem;
  border-radius: 4px;
}
.date-row.today  { font-weight: 700; color: #e65100; background: #fff3e0; padding: 2px 4px; }
.date-row.overdue { color: #b71c1c; }
.date-lbl { min-width: 40px; }
.date-cnt { min-width: 30px; }
.date-amt { color: #555; font-size: .8rem; }

.today-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 0;
  font-size: .84rem;
}
.today-name { flex: 1; color: #555; }
.today-amt  { color: #2e7d32; font-weight: 600; }
.btn-reset-small {
  background: none;
  border: 1px solid #bbb;
  border-radius: 4px;
  color: #888;
  cursor: pointer;
  font-size: .8rem;
  padding: 1px 5px;
  line-height: 1.4;
}
.btn-reset-small:hover { border-color: #e67e22; color: #e67e22; }

/* ── Filter bar ── */
.filter-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}
.search-input {
  flex: 1;
  min-width: 160px;
  max-width: 320px;
  padding: 6px 10px;
  border: 1px solid #ccc;
  border-radius: 6px;
  font-size: .9rem;
}
.btn-sort {
  padding: 6px 12px;
  border: 1px solid #ccc;
  border-radius: 6px;
  background: #fff;
  font-size: .82rem;
  cursor: pointer;
  color: #555;
  transition: all .15s;
}
.btn-sort:hover  { background: #f0f0f0; }
.btn-sort.active { background: #1976d2; color: #fff; border-color: #1976d2; }

.completed-search-panel {
  margin-bottom: 14px;
  padding: 12px;
  background: #f8fafc;
  border: 1px solid #dbe4ee;
  border-radius: 10px;
}
.completed-search-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}
.completed-search-head h3 {
  margin: 0;
  font-size: .95rem;
  color: #334155;
}
.completed-search-head span {
  font-size: .82rem;
  color: #64748b;
}
.completed-table {
  background: #fff;
}

/* ── Table ── */
.table-wrap { overflow-x: auto; }
.jobs-table {
  width: 100%;
  border-collapse: collapse;
  font-size: .9rem;
}
.jobs-table th,
.jobs-table td {
  padding: 8px 10px;
  border-bottom: 1px solid #eee;
  text-align: left;
  vertical-align: middle;
}
.jobs-table th { background: #f5f5f5; font-weight: 600; color: #444; }
.jobs-table tr:hover td { background: #fafafa; }
.row-overdue td { background: #fff5f5; }
.row-overdue:hover td { background: #ffe5e5; }

.col-date    { width: 80px; white-space: nowrap; }
.col-no      { width: 110px; }
.col-addr    { max-width: 180px; font-size: .82rem; color: #666; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.col-stone   { min-width: 100px; }
.col-money   { width: 100px; text-align: right; font-weight: 600; color: #2e7d32; }
.col-actions { width: 140px; white-space: nowrap; }

.date-badge {
  display: inline-block;
  padding: 3px 8px;
  border-radius: 12px;
  font-size: .8rem;
  font-weight: 600;
  background: #e8eaf6;
  color: #3949ab;
}
.date-badge.badge-today   { background: #ff6f00; color: #fff; }
.date-badge.badge-overdue { background: #b71c1c; color: #fff; }
.date-badge.badge-completed { background: #455a64; color: #fff; }

.stone-tag {
  display: inline-block;
  padding: 2px 7px;
  border-radius: 10px;
  font-size: .76rem;
  margin: 2px 2px 2px 0;
  background: #e0e0e0;
  color: #333;
}
.mat-porcelain { background: #fce4ec; color: #880e4f; }
.mat-quartz    { background: #e8f5e9; color: #1b5e20; }
.mat-granite   { background: #fff3e0; color: #bf360c; }

.order-link {
  color: #1565c0;
  font-weight: 600;
  text-decoration: none;
}
.order-link:hover { text-decoration: underline; }

.btn-done {
  padding: 5px 12px;
  background: #43a047;
  color: #fff;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: .84rem;
  font-weight: 600;
  transition: background .15s;
}
.btn-done:hover:not(:disabled) { background: #2e7d32; }
.btn-done:disabled { opacity: .5; cursor: not-allowed; }

.btn-reject {
  padding: 5px 10px;
  background: #e53935;
  color: #fff;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: .84rem;
  margin-left: 6px;
  transition: background .15s;
}
.btn-reject:hover:not(:disabled) { background: #b71c1c; }
.btn-reject:disabled { opacity: .5; cursor: not-allowed; }

/* ── Reject dialog ── */
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,.45);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
}
.reject-modal {
  background: #fff;
  border-radius: 12px;
  padding: 28px 32px;
  width: 400px;
  max-width: 96vw;
  box-shadow: 0 8px 32px rgba(0,0,0,.18);
}
.reject-modal h3 { margin: 0 0 12px; }
.reject-order { color: #555; font-size: .9rem; margin-bottom: 16px; }
.reject-row { display: flex; flex-direction: column; gap: 4px; margin-bottom: 14px; }
.reject-row label { font-size: .88rem; font-weight: 600; color: #444; }
.reject-row select,
.reject-row textarea {
  padding: 7px 10px;
  border: 1px solid #ccc;
  border-radius: 6px;
  font-size: .9rem;
  resize: vertical;
}
.modal-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 8px; }
.btn-secondary {
  padding: 7px 18px;
  border: 1px solid #ccc;
  background: #fff;
  border-radius: 6px;
  cursor: pointer;
  font-size: .9rem;
}
.btn-danger {
  padding: 7px 18px;
  background: #e53935;
  color: #fff;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: .9rem;
  font-weight: 600;
}
.btn-danger:disabled { opacity: .5; cursor: not-allowed; }
.btn-aux {
  padding: 6px 14px;
  border: 1px solid #ccc;
  background: #f5f5f5;
  border-radius: 6px;
  cursor: pointer;
  font-size: .88rem;
}
.btn-aux:hover { background: #e0e0e0; }

.hint { color: #888; padding: 20px 0; text-align: center; }

@media (max-width: 768px) {
  .summary-panels { grid-template-columns: 1fr; }
  .stats-row { gap: 8px; }
  .stat-card { min-width: 100px; }
}
</style>
