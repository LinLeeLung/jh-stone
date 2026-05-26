<template>
  <div class="install-tasks-view">
    <header class="page-header">
      <h2>📋 派車調度</h2>
      <div class="actions">
        <button class="btn-secondary" @click="reload">🔄 重新整理</button>
        <button class="btn-primary" @click="openCreate">＋ 新增任務</button>
      </div>
    </header>

    <div class="filters">
      <label>
        日期
        <input v-model="filter.date" type="date" />
      </label>
      <label>
        任務類型
        <select v-model="filter.kind">
          <option value="">全部</option>
          <option value="install">安裝</option>
          <option value="repair">維修</option>
          <option value="remeasure">複測</option>
          <option value="site_visit">現勘</option>
        </select>
      </label>
      <label>
        關鍵字
        <input v-model="filter.keyword" placeholder="客戶名稱/地址/單號" />
      </label>
    </div>

    <div class="board">
      <!-- 待派 -->
      <section class="lane">
        <h3>待派 <span class="count">{{ pendingTasks.length }}</span></h3>
        <div class="lane-body">
          <article
            v-for="t in pendingTasks"
            :key="t.id"
            class="task-card pending"
            :class="{ urgent: t.priority === 'urgent', high: t.priority === 'high' }"
          >
            <div class="task-header">
              <strong>{{ t.taskNo }}</strong>
              <span class="kind-badge">{{ kindLabel(t.kind) }}</span>
            </div>
            <div class="customer">{{ t.customerName || '—' }}</div>
            <div class="addr">{{ t.siteAddress || '無地址' }}</div>
            <div class="due">預定：{{ t.dueDate || '未定' }}</div>
            <button class="btn-mini" @click="schedule(t)">排程派車</button>
          </article>
          <p v-if="!pendingTasks.length" class="empty">沒有待派任務</p>
        </div>
      </section>

      <!-- 已派／執行中 -->
      <section class="lane">
        <h3>已派／執行中 <span class="count">{{ activeTasks.length }}</span></h3>
        <div class="lane-body">
          <article
            v-for="t in activeTasks"
            :key="t.id"
            class="task-card active"
            :class="{ urgent: t.priority === 'urgent', high: t.priority === 'high' }"
          >
            <div class="task-header">
              <strong>{{ t.taskNo }}</strong>
              <span class="kind-badge">{{ kindLabel(t.kind) }}</span>
              <span class="status-badge">{{ statusLabel(t.status) }}</span>
            </div>
            <div class="customer">{{ t.customerName || '—' }}</div>
            <div class="addr">{{ t.siteAddress || '無地址' }}</div>
            <div class="crew">人員：{{ crewName(t.assignedCrew) }}</div>
            <div class="assigned">排定：{{ t.assignedDate || '—' }}</div>
          </article>
          <p v-if="!activeTasks.length" class="empty">無進行中任務</p>
        </div>
      </section>

      <!-- 待覆核（已回報完工） -->
      <section class="lane">
        <h3>待覆核 <span class="count">{{ reviewTasks.length }}</span></h3>
        <div class="lane-body">
          <article
            v-for="t in reviewTasks"
            :key="t.id"
            class="task-card review"
          >
            <div class="task-header">
              <strong>{{ t.taskNo }}</strong>
              <span class="kind-badge">{{ kindLabel(t.kind) }}</span>
              <span class="status-badge">{{ statusLabel(t.status) }}</span>
            </div>
            <div class="customer">{{ t.customerName || '—' }}</div>
            <div class="completed">完工：{{ fmtTime(t.completedAt) }}</div>
            <div v-if="t.chargeable" class="chargeable">⚠️ 有償維修</div>
          </article>
          <p v-if="!reviewTasks.length" class="empty">無待覆核任務</p>
        </div>
      </section>
    </div>

    <p v-if="loading" class="loading">載入中…</p>
    <p v-if="error" class="error">{{ error }}</p>

    <ScheduleDispatchDialog
      :open="dispatchDialogOpen"
      :task="dispatchTarget"
      @close="closeDispatch"
      @saved="onDispatched"
    />

    <CreateTaskDialog
      :open="createDialogOpen"
      @close="createDialogOpen = false"
      @created="onCreated"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functionsInstance } from '../firebase';
import ScheduleDispatchDialog from '../components/ScheduleDispatchDialog.vue';
import CreateTaskDialog from '../components/CreateTaskDialog.vue';

const tasks = ref([]);
const loading = ref(false);
const error = ref('');
const filter = ref({ date: '', kind: '', keyword: '' });

const dispatchDialogOpen = ref(false);
const dispatchTarget = ref(null);
const createDialogOpen = ref(false);

let unsubscribe = null;

function subscribe() {
  loading.value = true;
  const q = query(collection(db, 'installTasks'), orderBy('createdAt', 'desc'));
  unsubscribe = onSnapshot(
    q,
    (snap) => {
      tasks.value = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      loading.value = false;
    },
    (err) => {
      error.value = err?.message || String(err);
      loading.value = false;
    },
  );
}

onMounted(subscribe);

function filtered(arr) {
  const kw = filter.value.keyword.trim().toLowerCase();
  return arr.filter((t) => {
    if (filter.value.kind && t.kind !== filter.value.kind) return false;
    if (kw) {
      const blob = `${t.customerName || ''} ${t.siteAddress || ''} ${t.taskNo || ''} ${t.salesOrderNo || ''}`.toLowerCase();
      if (!blob.includes(kw)) return false;
    }
    return true;
  });
}

const pendingTasks = computed(() => filtered(tasks.value.filter((t) => t.status === 'pending')));
const activeTasks = computed(() =>
  filtered(tasks.value.filter((t) => ['scheduled', 'dispatched', 'in_progress'].includes(t.status))),
);
const reviewTasks = computed(() =>
  filtered(tasks.value.filter((t) => ['completed', 'partial'].includes(t.status))),
);

function kindLabel(k) {
  return { install: '安裝', repair: '維修', remeasure: '複測', site_visit: '現勘' }[k] || k;
}
function statusLabel(s) {
  return {
    pending: '待派',
    scheduled: '已排程',
    dispatched: '已派車',
    in_progress: '執行中',
    completed: '已完工',
    partial: '部分完工',
    cancelled: '已取消',
  }[s] || s;
}
function crewName(arr) {
  if (!Array.isArray(arr) || !arr.length) return '未指派';
  return `${arr.length} 人`;
}
function fmtTime(ts) {
  if (!ts) return '—';
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleString('zh-TW', { hour12: false });
}

function reload() {
  if (unsubscribe) unsubscribe();
  subscribe();
}

async function openCreate() {
  createDialogOpen.value = true;
}

function onCreated(payload) {
  if (payload?.taskNo) {
    // 即時 snapshot 會自動推送 — 這裡只顯示提示
    console.log('任務已建立', payload);
  }
}

function schedule(t) {
  dispatchTarget.value = t;
  dispatchDialogOpen.value = true;
}

function closeDispatch() {
  dispatchDialogOpen.value = false;
  dispatchTarget.value = null;
}

function onDispatched(_payload) {
  // 即時更新來自 snapshot，不需手動 reload
}
</script>

<style scoped>
.install-tasks-view { padding: 16px; max-width: 1400px; margin: 0 auto; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.actions { display: flex; gap: 8px; }
.btn-primary { background: #2563eb; color: #fff; border: 0; padding: 6px 12px; border-radius: 4px; cursor: pointer; }
.btn-secondary { background: #f3f4f6; border: 1px solid #d1d5db; padding: 6px 12px; border-radius: 4px; cursor: pointer; }
.btn-mini { background: #2563eb; color: #fff; border: 0; padding: 4px 10px; border-radius: 3px; cursor: pointer; font-size: 12px; margin-top: 6px; }

.filters { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 16px; padding: 12px; background: #f9fafb; border-radius: 6px; }
.filters label { display: flex; flex-direction: column; font-size: 12px; color: #4b5563; }
.filters input, .filters select { padding: 4px 6px; border: 1px solid #d1d5db; border-radius: 3px; }

.board { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
.lane { background: #f3f4f6; border-radius: 6px; padding: 10px; min-height: 60vh; }
.lane h3 { margin: 0 0 8px; display: flex; justify-content: space-between; align-items: center; font-size: 14px; }
.lane .count { background: #6b7280; color: #fff; border-radius: 999px; padding: 2px 8px; font-size: 12px; }
.lane-body { display: flex; flex-direction: column; gap: 8px; }

.task-card { background: #fff; border: 1px solid #e5e7eb; border-radius: 4px; padding: 10px; box-shadow: 0 1px 2px rgba(0,0,0,0.05); }
.task-card.urgent { border-left: 4px solid #dc2626; }
.task-card.high { border-left: 4px solid #f59e0b; }
.task-header { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; margin-bottom: 4px; }
.kind-badge, .status-badge { font-size: 11px; padding: 2px 6px; border-radius: 3px; background: #e5e7eb; }
.status-badge { background: #dbeafe; color: #1e40af; }
.customer { font-weight: 600; }
.addr, .due, .crew, .assigned, .completed { font-size: 12px; color: #4b5563; }
.chargeable { font-size: 12px; color: #dc2626; font-weight: 600; }
.empty { color: #9ca3af; font-size: 12px; text-align: center; padding: 12px; }
.loading, .error { margin-top: 12px; }
.error { color: #dc2626; }
</style>
