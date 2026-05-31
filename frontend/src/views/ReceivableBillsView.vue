<template>
  <section class="page-card receivable-page">
    <header class="page-head sticky-page-head">
      <div>
        <h1>應收帳單</h1>
        <p class="muted-text">依客戶與帳期彙整待併帳明細，供會計請款與收款登錄。</p>
      </div>
      <div class="head-actions">
        <RouterLink class="btn-aux" to="/receivable/help">📖 功能說明</RouterLink>
        <RouterLink class="btn-aux" to="/receivable-items">查看明細</RouterLink>
        <button class="btn-query" :disabled="generating" @click="onGenerateBills">
          {{ generating ? "生成中…" : "生成帳單" }}
        </button>
      </div>
    </header>

    <div class="toolbar-row">
      <input v-model="keyword" class="search-input" placeholder="搜尋帳單號 / 客戶 / 發票號" />
      <input v-model="billingMonth" type="month" style="width: 160px" />
      <select v-model="statusFilter" style="width: 160px">
        <option value="">全部狀態</option>
        <option value="draft">草稿</option>
        <option value="issued">已出帳</option>
        <option value="partial">部分收款</option>
        <option value="paid">已收清</option>
        <option value="void">作廢</option>
      </select>
      <span class="muted-text">共 {{ filtered.length }} 筆</span>
    </div>

    <div class="stats-row">
      <span>應收總額：{{ formatAmount(totalAmount) }}</span>
      <span>已收：{{ formatAmount(totalPaid) }}</span>
      <span>未收：{{ formatAmount(totalBalance) }}</span>
    </div>

    <div v-if="loading" class="muted-text">讀取中…</div>
    <div v-else-if="filtered.length === 0" class="muted-text">目前沒有帳單。</div>
    <div v-else class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>帳單號</th>
            <th>客戶</th>
            <th>帳期</th>
            <th>訂單數</th>
            <th>應收</th>
            <th>已收</th>
            <th>未收</th>
            <th>發票號</th>
            <th>狀態</th>
            <th>動作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="bill in filtered" :key="bill.id">
            <td class="mono">
              <RouterLink :to="`/receivable-bills/${bill.id}`">{{ bill.billNo || bill.id }}</RouterLink>
            </td>
            <td>{{ bill.customerSnapshot?.name || "—" }}</td>
            <td>{{ bill.billingMonth || "—" }}</td>
            <td>{{ bill.orderCount || 0 }}</td>
            <td>{{ formatAmount(effectiveBillTotal(bill)) }}</td>
            <td>{{ formatAmount(bill.paidAmount) }}</td>
            <td>{{ formatAmount(bill.balanceAmount) }}</td>
            <td>{{ bill.invoiceNo || "—" }}</td>
            <td>
              <span class="status-chip" :class="`status-${bill.paymentStatus || 'draft'}`">
                {{ billStatusLabel(bill.paymentStatus) }}
              </span>
            </td>
            <td>
              <RouterLink class="btn-aux btn-mini" :to="`/receivable-bills/${bill.id}`">詳情</RouterLink>
              <RouterLink class="btn-aux btn-mini" :to="`/receivable-bills/${bill.id}/print`">總表</RouterLink>
              <button
                v-if="bill.paymentStatus !== 'void' && bill.balanceAmount > 0"
                class="btn-aux btn-mini"
                @click="onRecordPayment(bill)"
              >收款</button>
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
  generateReceivableBills,
  listReceivableBills,
  recordReceivablePayment,
} from "../firebase";

const loading = ref(true);
const generating = ref(false);
const keyword = ref("");
const billingMonth = ref("");
const statusFilter = ref("");
const bills = ref([]);

const filtered = computed(() => {
  const kw = keyword.value.trim().toLowerCase();
  return bills.value.filter((bill) => {
    if (billingMonth.value && bill.billingMonth !== billingMonth.value) return false;
    if (statusFilter.value && bill.paymentStatus !== statusFilter.value) return false;
    if (!kw) return true;
    return [bill.billNo, bill.customerSnapshot?.name, bill.invoiceNo]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(kw));
  });
});

const totalAmount = computed(() =>
  filtered.value.reduce((sum, bill) => sum + effectiveBillTotal(bill), 0),
);
const totalPaid = computed(() =>
  filtered.value.reduce((sum, bill) => sum + (Number(bill.paidAmount) || 0), 0),
);
const totalBalance = computed(() =>
  filtered.value.reduce((sum, bill) => sum + (Number(bill.balanceAmount) || 0), 0),
);

function formatAmount(value) {
  const amount = Number(value) || 0;
  return `${amount.toLocaleString()} 元`;
}

function effectiveBillTotal(bill = {}) {
  const adjusted = Number(bill.adjustedAmountTotal);
  if (Number.isFinite(adjusted) && adjusted >= 0) {
    return adjusted;
  }
  return Number(bill.amountTotal) || 0;
}

function billStatusLabel(status) {
  return {
    draft: "草稿",
    issued: "已出帳",
    partial: "部分收款",
    paid: "已收清",
    void: "作廢",
  }[status] || status || "—";
}

async function loadBills() {
  loading.value = true;
  try {
    bills.value = await listReceivableBills({ limit: 1000 });
  } finally {
    loading.value = false;
  }
}

async function onGenerateBills() {
  generating.value = true;
  try {
    const result = await generateReceivableBills({ billingMonth: billingMonth.value });
    await loadBills();
    alert(`已建立 ${result.created} 張帳單，略過 ${result.skipped} 筆明細。`);
  } catch (error) {
    alert(`生成失敗：${error?.message || error}`);
  } finally {
    generating.value = false;
  }
}

async function onRecordPayment(bill) {
  const amountRaw = prompt(`請輸入 ${bill.billNo} 的收款金額`, String(bill.balanceAmount || ""));
  if (amountRaw == null) return;
  const amount = Number(amountRaw);
  if (!(amount > 0)) {
    alert("收款金額必須大於 0");
    return;
  }
  const method =
    prompt("請輸入收款方式：transfer / check / cutTicketDeduction", "transfer") || "transfer";
  const note = prompt("收款備註（可留空）", "") || "";
  try {
    await recordReceivablePayment(bill.id, { amount, method, note });
    await loadBills();
    alert("已登記收款。");
  } catch (error) {
    alert(`收款登記失敗：${error?.message || error}`);
  }
}

onMounted(loadBills);
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

.mono {
  font-family: Consolas, Monaco, monospace;
}

.status-chip {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  padding: 2px 8px;
  font-size: 0.82rem;
}

.status-draft {
  background: #f3f4f6;
  color: #4b5563;
}

.status-issued {
  background: #eff6ff;
  color: #1d4ed8;
}

.status-partial {
  background: #fff7ed;
  color: #c2410c;
}

.status-paid {
  background: #dcfce7;
  color: #15803d;
}

.status-void {
  background: #f3f4f6;
  color: #6b7280;
}
</style>