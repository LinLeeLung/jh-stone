<template>
  <div class="repair-list-view">
    <header class="page-header">
      <h2>維修單列表</h2>
      <div class="header-actions">
        <RouterLink class="btn-aux" to="/orders">← 訂單列表</RouterLink>
        <RouterLink class="btn-primary" to="/orders/repair/new"
          >＋ 新建維修單</RouterLink
        >
      </div>
    </header>

    <div class="filter-bar">
      <input
        v-model="keyword"
        class="search-input"
        placeholder="搜尋訂單號 / 客戶 / 原因"
      />
      <select v-model="statusFilter">
        <option value="">全部狀態</option>
        <option value="open">處理中</option>
        <option value="convertedToOrder">已轉訂單</option>
        <option value="done">已完成</option>
      </select>
      <span class="hint">共 {{ filtered.length }} 筆</span>
    </div>

    <div v-if="loading" class="empty">載入中…</div>
    <div v-else-if="!filtered.length" class="empty">尚無維修單</div>

    <table v-else class="list-table">
      <thead>
        <tr>
          <th>建立時間</th>
          <th>維修日</th>
          <th>來源訂單</th>
          <th>客戶</th>
          <th>原因</th>
          <th>收費</th>
          <th>狀態</th>
          <th>新訂單</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="t in filtered" :key="t.id">
          <td>{{ fmtTime(t.createdAt) }}</td>
          <td>{{ t.repairDate || "—" }}</td>
          <td>{{ t.sourceOrderNo || "—" }}</td>
          <td>{{ t.sourceCustomerName || "—" }}</td>
          <td class="reason-cell">{{ t.reason || "" }}</td>
          <td>{{ t.chargeable ? "是" : "否" }}</td>
          <td>
            <span :class="['status-pill', 'st-' + (t.status || 'open')]">
              {{ statusLabel(t.status) }}
            </span>
          </td>
          <td>
            <RouterLink
              v-if="t.newOrderId"
              :to="`/orders/${t.newOrderId}/edit`"
              class="btn-link"
              >前往</RouterLink
            >
            <span v-else class="muted">—</span>
          </td>
          <td>
            <RouterLink :to="`/orders/repair/${t.id}`" class="btn-link"
              >編輯</RouterLink
            >
            <RouterLink
              :to="`/orders/repair/${t.id}/print`"
              target="_blank"
              class="btn-link"
              >列印</RouterLink
            >
            <button class="btn-link danger" @click="onDelete(t)">刪除</button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from "vue";
import { listRepairTickets, deleteRepairTicket } from "../firebase";

const tickets = ref([]);
const loading = ref(false);
const keyword = ref("");
const statusFilter = ref("");

async function load() {
  loading.value = true;
  try {
    tickets.value = await listRepairTickets({ limit: 500 });
  } finally {
    loading.value = false;
  }
}

onMounted(load);

const filtered = computed(() => {
  const kw = keyword.value.trim().toLowerCase();
  return tickets.value.filter((t) => {
    if (statusFilter.value && t.status !== statusFilter.value) return false;
    if (!kw) return true;
    return (
      (t.sourceOrderNo || "").toLowerCase().includes(kw) ||
      (t.sourceCustomerName || "").toLowerCase().includes(kw) ||
      (t.reason || "").toLowerCase().includes(kw)
    );
  });
});

function statusLabel(s) {
  if (s === "convertedToOrder") return "已轉訂單";
  if (s === "done") return "已完成";
  return "處理中";
}

function fmtTime(ts) {
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

async function onDelete(t) {
  if (!confirm(`確定刪除維修單(${t.sourceOrderNo || t.id})?`)) return;
  await deleteRepairTicket(t.id);
  await load();
}
</script>

<style scoped>
.repair-list-view {
  padding: 16px;
  max-width: 1200px;
  margin: 0 auto;
}
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}
.header-actions {
  display: flex;
  gap: 8px;
}
.btn-aux,
.btn-primary,
.btn-link {
  padding: 6px 12px;
  border-radius: 6px;
  text-decoration: none;
  border: 1px solid #ccc;
  background: #f5f5f5;
  color: #333;
  cursor: pointer;
  font-size: 14px;
}
.btn-primary {
  background: #2563eb;
  color: #fff;
  border-color: #2563eb;
}
.btn-link {
  background: transparent;
  border: none;
  color: #2563eb;
  text-decoration: underline;
  padding: 2px 6px;
}
.btn-link.danger {
  color: #b91c1c;
}
.filter-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}
.search-input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid #ccc;
  border-radius: 6px;
}
.hint {
  color: #6b7280;
  font-size: 13px;
}
.list-table {
  width: 100%;
  border-collapse: collapse;
  background: #fff;
  border: 1px solid #e5e7eb;
  font-size: 14px;
}
.list-table th,
.list-table td {
  padding: 8px 10px;
  border-bottom: 1px solid #f0f0f0;
  text-align: left;
  vertical-align: top;
}
.list-table th {
  background: #f9fafb;
  font-weight: 600;
  color: #374151;
}
.reason-cell {
  max-width: 280px;
  white-space: pre-wrap;
  word-break: break-word;
}
.status-pill {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 12px;
}
.st-open {
  background: #fef3c7;
  color: #92400e;
}
.st-convertedToOrder {
  background: #dbeafe;
  color: #1e40af;
}
.st-done {
  background: #d1fae5;
  color: #065f46;
}
.muted {
  color: #9ca3af;
}
.empty {
  padding: 32px;
  text-align: center;
  color: #6b7280;
}
</style>
