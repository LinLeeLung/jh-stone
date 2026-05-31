<template>
  <section class="page-card receivable-page">
    <header class="page-head sticky-page-head">
      <div>
        <h1>應收明細</h1>
        <p class="muted-text">從符合請款條件的訂單建立應收明細，供後續彙整月帳單。</p>
      </div>
      <div class="head-actions">
        <RouterLink class="btn-aux" to="/receivable/help">📖 功能說明</RouterLink>
        <RouterLink class="btn-aux" to="/receivable-bills">查看帳單</RouterLink>
        <button class="btn-query" :disabled="generating" @click="onGenerateItems">
          {{ generating ? "建立中…" : "建立可請款明細" }}
        </button>
      </div>
    </header>

    <div class="toolbar-row">
      <input v-model="keyword" class="search-input" placeholder="搜尋訂單號 / 客戶 / 地址" />
      <input v-model="billingMonth" type="month" style="width: 160px" />
      <select v-model="statusFilter" style="width: 160px">
        <option value="">全部狀態</option>
        <option value="pending">待併帳</option>
        <option value="grouped">已併帳</option>
        <option value="void">作廢</option>
      </select>
      <select v-model="reviewFilter" style="width: 160px">
        <option value="">全部審核</option>
        <option value="pending">待審核</option>
        <option value="reviewed">已審核</option>
      </select>
      <span class="muted-text">共 {{ filtered.length }} 筆</span>
    </div>

    <div class="stats-row">
      <span>待併帳：{{ pendingCount }}</span>
      <span>已併帳：{{ groupedCount }}</span>
      <span>待審核：{{ reviewPendingCount }}</span>
      <span>已審核：{{ reviewDoneCount }}</span>
      <span>今日新單待審核：{{ todayPendingReviewCount }}</span>
      <span>總金額：{{ formatAmount(totalAmount) }}</span>
    </div>

    <section v-if="todayPendingReviews.length" class="review-panel">
      <div class="review-head">
        <strong>今日新單待審核</strong>
        <span class="muted-text">{{ todayPendingReviews.length }} 筆</span>
      </div>
      <div class="review-list">
        <article v-for="item in todayPendingReviews.slice(0, 8)" :key="`review-${item.id}`" class="review-item">
          <div>
            <div class="review-title">{{ item.sourceOrderNo || item.sourceOrderId }}</div>
            <div class="muted-text">{{ item.customerName || item.customerSnapshot?.name || "—" }}</div>
            <div class="muted-text small">{{ item.orderSnapshot?.siteAddress || "" }}</div>
          </div>
          <div class="review-actions">
            <span class="review-amount">{{ formatAmount(item.amountTotal) }}</span>
            <button class="btn-aux btn-mini" :disabled="reviewingId === item.id" @click="onTogglePricingReview(item)">
              {{ reviewingId === item.id ? "處理中…" : "審核完成" }}
            </button>
          </div>
        </article>
      </div>
    </section>

    <section v-if="notifications.length" class="notification-panel">
      <div class="notification-head">
        <strong>會計通知</strong>
        <span class="muted-text">未讀 {{ unreadNotificationCount }} 筆</span>
      </div>
      <div class="notification-list">
        <article
          v-for="item in notifications"
          :key="item.id"
          class="notification-item"
          :class="{ unread: item.status !== 'read' }"
        >
          <div class="notification-main">
            <div class="notification-title">{{ item.title || '通知' }}</div>
            <div class="notification-message">{{ item.message || '—' }}</div>
            <div class="notification-meta">
              <span>{{ item.customerName || '—' }}</span>
              <span>{{ item.salesOrderNo || item.salesOrderId || '—' }}</span>
              <span>{{ formatAmount(item.amountTotal) }}</span>
            </div>
          </div>
          <div class="notification-actions">
            <RouterLink class="btn-aux btn-mini" :to="`/orders/${item.salesOrderId}/edit`">訂單</RouterLink>
            <button
              v-if="item.status !== 'read'"
              class="btn-aux btn-mini"
              @click="onMarkNotificationRead(item.id)"
            >已讀</button>
          </div>
        </article>
      </div>
    </section>

    <div v-if="loading" class="muted-text">讀取中…</div>
    <div v-else-if="filtered.length === 0" class="muted-text">目前沒有符合條件的應收明細。</div>
    <div v-else class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>訂單號</th>
            <th>客戶</th>
            <th>帳期</th>
            <th>觸發原因</th>
            <th>金額</th>
            <th>狀態</th>
            <th>計價審核</th>
            <th>動作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in filtered" :key="item.id">
            <td class="mono">{{ item.sourceOrderNo || item.sourceOrderId }}</td>
            <td>
              <div>{{ item.customerName || item.customerSnapshot?.name || "—" }}</div>
              <div class="muted-text small">{{ item.orderSnapshot?.siteAddress || "" }}</div>
            </td>
            <td>{{ item.billingMonth || "—" }}</td>
            <td>{{ triggerLabel(item) }}</td>
            <td>{{ formatAmount(item.amountTotal) }}</td>
            <td>
              <span class="status-chip" :class="`status-${item.itemStatus || 'pending'}`">
                {{ itemStatusLabel(item.itemStatus) }}
              </span>
            </td>
            <td>
              <div class="review-status-wrap">
                <span class="status-chip" :class="`review-${item.pricingReviewStatus || 'pending'}`">
                  {{ reviewStatusLabel(item.pricingReviewStatus) }}
                </span>
                <div v-if="item.pricingReviewedAt" class="muted-text small">
                  {{ formatDateTime(item.pricingReviewedAt) }}
                </div>
              </div>
            </td>
            <td>
              <RouterLink class="btn-aux btn-mini" :to="`/orders/${item.sourceOrderId}/edit`">訂單</RouterLink>
              <RouterLink
                v-if="item.billId"
                class="btn-aux btn-mini"
                to="/receivable-bills"
              >帳單</RouterLink>
              <button class="btn-aux btn-mini" :disabled="reviewingId === item.id" @click="onTogglePricingReview(item)">
                {{ reviewingId === item.id ? "處理中…" : item.pricingReviewStatus === 'reviewed' ? '取消審核' : '審核完成' }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import { RouterLink } from "vue-router";
import {
  generateReceivableItemsFromEligibleOrders,
  listAccountingNotifications,
  listReceivableItems,
  markReceivableItemPricingReviewed,
  markAccountingNotificationRead,
} from "../firebase";

const loading = ref(true);
const generating = ref(false);
const keyword = ref("");
const billingMonth = ref("");
const statusFilter = ref("");
const reviewFilter = ref("");
const items = ref([]);
const notifications = ref([]);
const reviewingId = ref("");

function toJsDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value?.toDate === "function") {
    const converted = value.toDate();
    return Number.isNaN(converted?.getTime?.()) ? null : converted;
  }
  const converted = new Date(value);
  return Number.isNaN(converted.getTime()) ? null : converted;
}

function isSameLocalDay(left, right) {
  return left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate();
}

const filtered = computed(() => {
  const kw = keyword.value.trim().toLowerCase();
  return items.value.filter((item) => {
    if (billingMonth.value && item.billingMonth !== billingMonth.value) return false;
    if (statusFilter.value && item.itemStatus !== statusFilter.value) return false;
    if (reviewFilter.value && (item.pricingReviewStatus || "pending") !== reviewFilter.value) return false;
    if (!kw) return true;
    return [
      item.sourceOrderNo,
      item.customerName,
      item.customerSnapshot?.name,
      item.orderSnapshot?.siteAddress,
      item.billingEligibleReason,
    ]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(kw));
  });
});

const pendingCount = computed(
  () => filtered.value.filter((item) => item.itemStatus === "pending").length,
);
const groupedCount = computed(
  () => filtered.value.filter((item) => item.itemStatus === "grouped").length,
);
const reviewPendingCount = computed(
  () => filtered.value.filter((item) => (item.pricingReviewStatus || "pending") !== "reviewed").length,
);
const reviewDoneCount = computed(
  () => filtered.value.filter((item) => item.pricingReviewStatus === "reviewed").length,
);
const totalAmount = computed(() =>
  filtered.value.reduce((sum, item) => sum + (Number(item.amountTotal) || 0), 0),
);
const unreadNotificationCount = computed(
  () => notifications.value.filter((item) => item.status !== "read").length,
);
const todayPendingReviews = computed(() => {
  const today = new Date();
  return items.value.filter((item) => {
    if ((item.pricingReviewStatus || "pending") === "reviewed") return false;
    const createdAt = toJsDate(item.createdAt);
    return createdAt ? isSameLocalDay(createdAt, today) : false;
  });
});
const todayPendingReviewCount = computed(() => todayPendingReviews.value.length);

function formatAmount(value) {
  const amount = Number(value) || 0;
  return `${amount.toLocaleString()} 元`;
}

function itemStatusLabel(status) {
  return {
    pending: "待併帳",
    grouped: "已併帳",
    void: "作廢",
  }[status] || status || "—";
}

function triggerLabel(item) {
  return (
    item.billingEligibleReason ||
    {
      installed: "完工可請款",
      staleUninstalled: "逾期未安裝可請款",
      manual: "人工建立",
    }[item.billingTriggerType] ||
    "—"
  );
}

function reviewStatusLabel(status) {
  return status === "reviewed" ? "已審核" : "待審核";
}

function formatDateTime(value) {
  const date = toJsDate(value);
  if (!date) return "";
  return new Intl.DateTimeFormat("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

async function loadItems() {
  loading.value = true;
  try {
    const [itemList, notificationList] = await Promise.all([
      listReceivableItems({ limit: 1000 }),
      listAccountingNotifications({ limit: 20 }),
    ]);
    items.value = itemList;
    notifications.value = notificationList;
  } finally {
    loading.value = false;
  }
}

async function onMarkNotificationRead(notificationId) {
  try {
    await markAccountingNotificationRead(notificationId);
    await loadItems();
  } catch (error) {
    alert(`通知更新失敗：${error?.message || error}`);
  }
}

async function onTogglePricingReview(item) {
  reviewingId.value = item.id;
  try {
    const nextReviewed = item.pricingReviewStatus !== "reviewed";
    await markReceivableItemPricingReviewed(item.id, nextReviewed);
    await loadItems();
  } catch (error) {
    alert(`審核更新失敗：${error?.message || error}`);
  } finally {
    reviewingId.value = "";
  }
}

async function onGenerateItems() {
  generating.value = true;
  try {
    const result = await generateReceivableItemsFromEligibleOrders({
      billingMonth: billingMonth.value,
    });
    await loadItems();
    alert(`已建立 ${result.created} 筆，略過 ${result.skipped} 筆。`);
  } catch (error) {
    alert(`建立失敗：${error?.message || error}`);
  } finally {
    generating.value = false;
  }
}

onMounted(loadItems);
</script>

<style scoped>
.receivable-page {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.head-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.stats-row {
  display: flex;
  gap: 18px;
  color: #4b5563;
  font-size: 0.92rem;
}

.review-panel {
  border: 1px solid #bfdbfe;
  background: #eff6ff;
  border-radius: 12px;
  padding: 12px;
}

.review-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.review-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.review-item {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  border: 1px solid #c7d2fe;
  background: #ffffff;
  border-radius: 10px;
  padding: 10px 12px;
}

.review-title {
  font-weight: 700;
  color: #1e3a8a;
}

.review-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.review-amount {
  color: #1e40af;
  font-weight: 600;
}

.notification-panel {
  border: 1px solid #fde68a;
  background: #fffbeb;
  border-radius: 12px;
  padding: 12px;
}

.notification-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.notification-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.notification-item {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  border: 1px solid #f3e8b3;
  background: #fffdf7;
  border-radius: 10px;
  padding: 10px 12px;
}

.notification-item.unread {
  border-color: #f59e0b;
}

.notification-main {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.notification-title {
  font-weight: 700;
  color: #92400e;
}

.notification-message {
  color: #78350f;
}

.notification-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  color: #6b7280;
  font-size: 0.82rem;
}

.notification-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.mono {
  font-family: Consolas, Monaco, monospace;
}

.small {
  font-size: 0.82rem;
}

.status-chip {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  padding: 2px 8px;
  font-size: 0.82rem;
}

.status-pending {
  background: #fff7ed;
  color: #c2410c;
}

.status-grouped {
  background: #eff6ff;
  color: #1d4ed8;
}

.status-void {
  background: #f3f4f6;
  color: #6b7280;
}

.review-status-wrap {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.review-pending {
  background: #fff7ed;
  color: #c2410c;
}

.review-reviewed {
  background: #ecfdf5;
  color: #047857;
}
</style>