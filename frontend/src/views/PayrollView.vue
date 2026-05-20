<template>
  <div class="payroll-wrap">
    <h2 class="page-title">{{ t("payroll_title") }}</h2>

    <!-- Month picker -->
    <div class="month-bar">
      <label>
        月份：
        <input type="month" v-model="selectedMonth" @change="loadAll" />
      </label>
      <button
        v-if="isManager"
        class="btn-calc"
        :disabled="calculating"
        @click="triggerCalculation"
      >
        {{ calculating ? "計算中…" : "計算薪資" }}
      </button>
      <span v-if="calcMsg" :class="['calc-msg', calcMsgIsErr ? 'err' : 'ok']">{{
        calcMsg
      }}</span>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="loading-row">{{ t("payroll_loading") }}</div>

    <!-- Staff table -->
    <template v-else>
      <div v-if="allRecords.length === 0" class="empty-state">
        尚無薪資資料，請點「計算薪資」產生本月薪資單。
      </div>
      <table v-else class="payroll-table">
        <thead>
          <tr>
            <th>工號</th>
            <th>姓名</th>
            <th>部門</th>
            <th>底薪</th>
            <th>獎金</th>
            <th>加班費</th>
            <th>伙食費</th>
            <th>請假扣薪</th>
            <th>便當費</th>
            <th>實領薪資</th>
            <th>明細</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in allRecords" :key="r.id">
            <td>{{ r.empNo }}</td>
            <td>{{ r.name }}</td>
            <td>{{ r.dept || "—" }}</td>
            <td class="num">{{ r.baseSalary?.toLocaleString() }}</td>
            <td class="num">
              {{ r.bonusTotal > 0 ? "+" + r.bonusTotal.toLocaleString() : "—" }}
            </td>
            <td class="num ot">
              {{ r.otPay > 0 ? "+" + r.otPay.toLocaleString() : "—" }}
            </td>
            <td class="num meal">
              {{
                r.mealAllowance > 0
                  ? "+" + r.mealAllowance.toLocaleString()
                  : "—"
              }}
            </td>
            <td class="num deduct">
              {{
                r.leaveDeduction > 0
                  ? "−" + r.leaveDeduction.toLocaleString()
                  : "—"
              }}
            </td>
            <td class="num deduct">
              <input
                v-if="isManager"
                type="number"
                class="lunch-input"
                :value="r.lunchFee || 0"
                min="0"
                @change="saveLunchFee(r, $event.target.value)"
              />
              <span v-else>{{
                (r.lunchFee || 0) > 0
                  ? "−" + (r.lunchFee || 0).toLocaleString()
                  : "—"
              }}</span>
            </td>
            <td class="num gross">{{ r.grossPay?.toLocaleString() }}</td>
            <td>
              <button class="btn-sm btn-detail" @click="openDetail(r)">
                {{ t("payroll_detail") }}
              </button>
            </td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <td colspan="9" class="total-label">合計</td>
            <td class="num gross">{{ totalGross.toLocaleString() }}</td>
            <td></td>
          </tr>
        </tfoot>
      </table>
      <p class="hint-text">
        ※ 便當費欄位可直接輸入修改，計算薪資時會自動帶入已輸入的金額。
      </p>
    </template>

    <!-- ── Loan management ──────────────────────────────────────────────── -->
    <div v-if="isManager" class="loan-section">
      <h3 class="loan-section-title">借款管理</h3>

      <!-- Add loan form -->
      <div class="loan-form">
        <h4 class="loan-form-title">新增借款</h4>
        <div class="loan-form-row">
          <label class="lf-item">
            員工
            <select v-model="loanForm.empNo">
              <option value="">（選擇員工）</option>
              <option v-for="s in staffList" :key="s.empNo" :value="s.empNo">
                {{ s.empNo }} {{ s.name }}
              </option>
            </select>
          </label>
          <label class="lf-item">
            借款金額（元）
            <input
              type="number"
              v-model.number="loanForm.principal"
              min="1"
              class="lf-num"
            />
          </label>
          <label class="lf-item">
            分期數（月）
            <input
              type="number"
              v-model.number="loanForm.installments"
              min="1"
              max="120"
              class="lf-short"
            />
          </label>
          <label class="lf-item">
            開始扣款月份
            <input type="month" v-model="loanForm.startMonth" />
          </label>
          <button
            class="btn-query"
            :disabled="creatingLoan || !loanForm.empNo || !loanForm.principal"
            @click="addLoan"
          >
            {{ creatingLoan ? "建立中…" : "建立借款" }}
          </button>
        </div>
        <p v-if="loanMsg" :class="['calc-msg', loanMsgIsErr ? 'err' : 'ok']">
          {{ loanMsg }}
        </p>
      </div>

      <!-- Loans table -->
      <div v-if="loadingLoans" class="loading-row">載入借款資料…</div>
      <div v-else-if="allLoans.length === 0" class="empty-state">
        目前無借款記錄。
      </div>
      <table v-else class="loan-table">
        <thead>
          <tr>
            <th>員工</th>
            <th>借款金額</th>
            <th>期數</th>
            <th>已還期數</th>
            <th>剩餘金額</th>
            <th>月還本金（估）</th>
            <th>年利率</th>
            <th>開始月份</th>
            <th>狀態</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="ln in allLoans"
            :key="ln.id"
            :class="ln.status === 'paid' ? 'loan-paid' : ''"
          >
            <td>{{ ln.empNo }} {{ ln.name }}</td>
            <td class="num">{{ ln.principal?.toLocaleString() }}</td>
            <td class="num">{{ ln.installments }}</td>
            <td class="num">{{ ln.paidInstallments }}</td>
            <td class="num" :class="ln.status !== 'paid' ? 'deduct' : ''">
              {{ ln.remainingBalance?.toLocaleString() }}
            </td>
            <td class="num">
              {{ Math.round(ln.principal / ln.installments).toLocaleString() }}
            </td>
            <td class="num">
              {{ ((ln.interestRate || 0) * 100).toFixed(1) }}%
            </td>
            <td>{{ ln.startMonth }}</td>
            <td>
              <span
                :class="[
                  'status-badge',
                  ln.status === 'paid' ? 'badge-paid' : 'badge-active',
                ]"
              >
                {{ ln.status === "paid" ? "已還清" : "還款中" }}
              </span>
            </td>
            <td>
              <button
                v-if="ln.paidInstallments === 0"
                class="btn-sm btn-del"
                @click="removeLoan(ln)"
              >
                刪除
              </button>
              <span v-else class="muted">—</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- ── Payroll guide ──────────────────────────────────────────────── -->
    <div v-if="isManager" class="loan-section payroll-guide">
      <h3
        class="loan-section-title"
        style="cursor: pointer"
        @click="guideOpen = !guideOpen"
      >
        薪資計算說明
        <span style="font-size: 0.85em; font-weight: normal">{{
          guideOpen ? "▲ 收合" : "▼ 展開"
        }}</span>
      </h3>
      <div v-show="guideOpen">
        <h4>一、加班費（勞基法第24條）</h4>
        <p>
          來源：<code>overtimeRequests</code>
          已雙層簽核（approved2）的當月申請。員工需有系統帳號。
        </p>
        <p>時薪 ＝ 月薪 ÷ 240（30天×8小時）</p>
        <table class="guide-table">
          <thead>
            <tr>
              <th>加班時數</th>
              <th>費率</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>前 2 小時</td>
              <td>時薪 × 4/3</td>
            </tr>
            <tr>
              <td>第 3 小時起</td>
              <td>時薪 × 5/3</td>
            </tr>
          </tbody>
        </table>

        <h4>二、請假扣薪</h4>
        <p>
          來源：<code>leaveRequests</code>
          已雙層簽核的當月申請。「天」單位自動換算 × 8 小時。
        </p>
        <table class="guide-table">
          <thead>
            <tr>
              <th>假別</th>
              <th>扣薪</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>年假（特休）</td>
              <td>不扣</td>
            </tr>
            <tr>
              <td>病假</td>
              <td>半薪（× 0.5）</td>
            </tr>
            <tr>
              <td>事假、其他</td>
              <td>全扣（× 1.0）</td>
            </tr>
          </tbody>
        </table>
        <p>
          另有<strong>遲到 / 早退扣薪</strong>（獨立計算），規則可於「系統設定 →
          差勤規則」調整。
        </p>

        <h4>三、新進員工未滿月計薪（月薪制）</h4>
        <p>當月底薪 ＝ 月薪 × 到職日至月底天數 ÷ 當月總天數</p>
        <p class="guide-example">
          範例：5/15 到職，月薪 40,000 → 40,000 × 17/31 ≈ 21,935 元
        </p>
        <p>時薪制、日薪制不受影響；次月起恢復全額。</p>

        <h4>四、實領薪資公式</h4>
        <p class="guide-formula">
          底薪 ＋ 獎金 ＋ 加班費 ＋ 伙食費<br />
          － 請假扣薪 － 遲到早退扣薪<br />
          － 勞保費 － 健保費 － 眷屬健保費 － 便當費<br />
          － 房租（外勞）－ 水費 － 電費 － 體檢費（外勞）－ 服務費（外勞）<br />
          － 借款本金 － 借款利息<br />
          <strong>最小值 0（不會出現負數）</strong>
        </p>
      </div>
    </div>

    <!-- Detail modal -->
    <div
      v-if="detailRecord"
      class="modal-overlay"
      @click.self="detailRecord = null"
    >
      <div class="modal-box">
        <h3>
          {{ detailRecord.name }}（{{ detailRecord.empNo }}）—
          {{ detailRecord.monthLabel }}
        </h3>
        <table class="slip-table">
          <tbody>
            <tr>
              <th>薪資類型</th>
              <td>{{ detailRecord.salaryType }}</td>
            </tr>
            <tr class="sep">
              <th>底薪</th>
              <td class="num">
                {{ detailRecord.baseSalary?.toLocaleString() }}
              </td>
            </tr>
            <tr v-if="detailRecord.bonusTotal > 0">
              <th>固定獎金合計</th>
              <td class="num">
                +{{ detailRecord.bonusTotal.toLocaleString() }}
              </td>
            </tr>
            <tr
              v-for="(b, i) in bonusList(detailRecord)"
              :key="'db' + i"
              class="sub"
            >
              <th>獎金({{ i + 1 }})</th>
              <td class="num">+{{ b.toLocaleString() }}</td>
            </tr>
            <tr v-if="detailRecord.otPay > 0">
              <th>加班費合計</th>
              <td class="num ot">+{{ detailRecord.otPay.toLocaleString() }}</td>
            </tr>
            <template
              v-if="detailRecord.otDetail && detailRecord.otDetail.length"
            >
              <tr
                v-for="(ot, i) in detailRecord.otDetail"
                :key="'dot' + i"
                class="sub"
              >
                <th>{{ ot.date }}（{{ ot.hours }}h）</th>
                <td class="num ot">+{{ ot.pay?.toLocaleString() }}</td>
              </tr>
            </template>
            <tr v-if="detailRecord.mealAllowance > 0">
              <th>伙食費合計</th>
              <td class="num meal">
                +{{ detailRecord.mealAllowance.toLocaleString() }}
              </td>
            </tr>
            <template
              v-if="detailRecord.mealDetail && detailRecord.mealDetail.length"
            >
              <tr
                v-for="(ml, i) in detailRecord.mealDetail"
                :key="'dml' + i"
                class="sub"
              >
                <th>{{ ml.date }}（{{ ml.punchIn }}~{{ ml.punchOut }}）</th>
                <td class="num meal">+{{ ml.meal?.toLocaleString() }}</td>
              </tr>
            </template>
            <tr v-if="detailRecord.leaveDeduction > 0">
              <th>請假扣薪合計</th>
              <td class="num deduct">
                −{{ detailRecord.leaveDeduction.toLocaleString() }}
              </td>
            </tr>
            <template
              v-if="detailRecord.leaveDetail && detailRecord.leaveDetail.length"
            >
              <tr
                v-for="(lv, i) in detailRecord.leaveDetail"
                :key="'dlv' + i"
                class="sub"
              >
                <th>
                  {{ lv.type }}（{{
                    lv.unit === "小時" ? lv.hours + "h" : lv.days + "天"
                  }}）
                </th>
                <td class="num deduct">
                  −{{ lv.deduction?.toLocaleString() }}
                </td>
              </tr>
            </template>
            <tr v-if="detailRecord.lateEarlyDeduction > 0">
              <th>遲到/早退扣薪</th>
              <td class="num deduct">
                −{{ detailRecord.lateEarlyDeduction.toLocaleString() }}
              </td>
            </tr>
            <template
              v-if="
                detailRecord.lateEarlyDetail &&
                detailRecord.lateEarlyDetail.length
              "
            >
              <tr
                v-for="(le, i) in detailRecord.lateEarlyDetail"
                :key="'dle' + i"
                class="sub"
              >
                <th>
                  {{ le.date }}
                  <span v-if="le.lateMins > 0">遲到{{ le.lateMins }}分</span>
                  <span v-if="le.earlyMins > 0">早退{{ le.earlyMins }}分</span>
                </th>
                <td class="num deduct">
                  −{{ le.deduction?.toLocaleString() }}
                </td>
              </tr>
            </template>
            <tr v-if="(detailRecord.laborInsurance || 0) > 0">
              <th>勞保費</th>
              <td class="num deduct">
                −{{ detailRecord.laborInsurance.toLocaleString() }}
              </td>
            </tr>
            <tr v-if="(detailRecord.healthInsurance || 0) > 0">
              <th>健保費</th>
              <td class="num deduct">
                −{{ detailRecord.healthInsurance.toLocaleString() }}
              </td>
            </tr>
            <tr v-if="(detailRecord.dependentHealth || 0) > 0">
              <th>眷屬健保費</th>
              <td class="num deduct">
                −{{ detailRecord.dependentHealth.toLocaleString() }}
              </td>
            </tr>
            <tr v-if="(detailRecord.foreignRent || 0) > 0">
              <th>房租-外勞</th>
              <td class="num deduct">
                −{{ detailRecord.foreignRent.toLocaleString() }}
              </td>
            </tr>
            <tr v-if="(detailRecord.waterFee || 0) > 0">
              <th>水費</th>
              <td class="num deduct">
                −{{ detailRecord.waterFee.toLocaleString() }}
              </td>
            </tr>
            <tr v-if="(detailRecord.electricFee || 0) > 0">
              <th>電費</th>
              <td class="num deduct">
                −{{ detailRecord.electricFee.toLocaleString() }}
              </td>
            </tr>
            <tr v-if="(detailRecord.foreignMedical || 0) > 0">
              <th>體檢費-外勞</th>
              <td class="num deduct">
                −{{ detailRecord.foreignMedical.toLocaleString() }}
              </td>
            </tr>
            <tr v-if="(detailRecord.foreignService || 0) > 0">
              <th>服務費-外勞</th>
              <td class="num deduct">
                −{{ detailRecord.foreignService.toLocaleString() }}
              </td>
            </tr>
            <tr v-if="(detailRecord.lunchFee || 0) > 0">
              <th>便當費</th>
              <td class="num deduct">
                −{{ detailRecord.lunchFee.toLocaleString() }}
              </td>
            </tr>
            <tr v-if="(detailRecord.loanPrincipal || 0) > 0">
              <th>借款本金</th>
              <td class="num deduct">
                −{{ detailRecord.loanPrincipal.toLocaleString() }}
              </td>
            </tr>
            <tr v-if="(detailRecord.loanInterest || 0) > 0">
              <th>借款利息</th>
              <td class="num deduct">
                −{{ detailRecord.loanInterest.toLocaleString() }}
              </td>
            </tr>
            <tr class="total-row">
              <th>實領薪資</th>
              <td class="num gross">
                {{ detailRecord.grossPay?.toLocaleString() }}
              </td>
            </tr>
          </tbody>
        </table>
        <div class="modal-actions">
          <button class="btn-sm" @click="detailRecord = null">關閉</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from "vue";
import { t } from "../locale";
import {
  db,
  auth,
  authReadyPromise,
  functionsInstance,
  createLoan,
  getAllLoans,
  deleteLoan,
  updatePayrollLunchFee,
  getSystemSettings,
} from "../firebase";
import {
  collection,
  query,
  where,
  getDocs,
  getDoc,
  doc,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";

// ── State ──────────────────────────────────────────────────────────────────
const currentUser = ref(null);
const userRole = ref(null);

const isManager = computed(
  () => userRole.value === "admin" || userRole.value === "管理者",
);

function todayYYYYMM() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
const selectedMonth = ref(todayYYYYMM());

const loading = ref(false);
const allRecords = ref([]);
const detailRecord = ref(null);

const calculating = ref(false);
const calcMsg = ref("");
const calcMsgIsErr = ref(false);

// Loan state
const allLoans = ref([]);
const loadingLoans = ref(false);
const creatingLoan = ref(false);
const loanMsg = ref("");
const loanMsgIsErr = ref(false);
const loanInterestRate = ref(0.02);

const loanForm = ref({
  empNo: "",
  principal: null,
  installments: 12,
  startMonth: todayYYYYMM(),
});

const staffList = ref([]);
const guideOpen = ref(false);

const totalGross = computed(() =>
  allRecords.value.reduce((sum, r) => sum + (r.grossPay || 0), 0),
);

// ── Init ───────────────────────────────────────────────────────────────────
onMounted(async () => {
  await authReadyPromise;
  currentUser.value = auth.currentUser;
  if (!currentUser.value) return;
  const snap = await getDoc(doc(db, "Users", currentUser.value.uid));
  if (snap.exists()) userRole.value = snap.data().role;
  await loadPayroll();
  if (isManager.value) {
    await Promise.all([loadStaff(), loadLoans(), loadLoanRate()]);
  }
});

async function loadAll() {
  await loadPayroll();
}

// ── Payroll ────────────────────────────────────────────────────────────────
async function loadPayroll() {
  if (!currentUser.value) return;
  loading.value = true;
  const yyyyMM = selectedMonth.value.replace("-", "");
  try {
    const snap = await getDocs(
      query(collection(db, "payroll"), where("yyyyMM", "==", yyyyMM)),
    );
    allRecords.value = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) =>
        String(a.empNo ?? "").localeCompare(String(b.empNo ?? "")),
      );
  } finally {
    loading.value = false;
  }
}

async function triggerCalculation() {
  const yyyyMM = selectedMonth.value.replace("-", "");
  if (
    !confirm(
      `確定計算 ${selectedMonth.value} 的薪資？\n（會覆蓋已存在的同月份資料）`,
    )
  )
    return;
  calculating.value = true;
  calcMsg.value = "";
  try {
    const fn = httpsCallable(functionsInstance, "calculatePayroll", {
      timeout: 120000,
    });
    const res = await fn({ yyyyMM });
    calcMsg.value = `計算完成，共 ${res.data.count} 位員工`;
    calcMsgIsErr.value = false;
    await loadPayroll();
    await loadLoans();
  } catch (e) {
    calcMsg.value = "計算失敗：" + (e.message || e.code);
    calcMsgIsErr.value = true;
  } finally {
    calculating.value = false;
  }
}

async function saveLunchFee(record, value) {
  const fee = Math.max(0, Number(value) || 0);
  try {
    await updatePayrollLunchFee(record.id, fee);
    record.lunchFee = fee;
  } catch (e) {
    alert("儲存便當費失敗：" + e.message);
  }
}

// ── Loans ──────────────────────────────────────────────────────────────────
async function loadLoanRate() {
  try {
    const cfg = await getSystemSettings();
    loanInterestRate.value = (cfg.loanInterestRate || 2) / 100;
  } catch (_) {}
}

async function loadLoans() {
  loadingLoans.value = true;
  try {
    allLoans.value = await getAllLoans();
  } finally {
    loadingLoans.value = false;
  }
}

async function loadStaff() {
  const snap = await getDocs(collection(db, "staff"));
  staffList.value = snap.docs
    .map((d) => ({
      empNo: d.data().empNo || d.id,
      name: d.data().name || "",
      status: d.data().status || "",
    }))
    .filter((s) => s.name && s.status !== "離職")
    .sort((a, b) => String(a.empNo).localeCompare(String(b.empNo)));
}

async function addLoan() {
  if (!loanForm.value.empNo || !loanForm.value.principal) return;
  const staff = staffList.value.find((s) => s.empNo === loanForm.value.empNo);
  creatingLoan.value = true;
  loanMsg.value = "";
  try {
    await createLoan({
      uid: null,
      empNo: loanForm.value.empNo,
      name: staff ? staff.name : "",
      principal: loanForm.value.principal,
      installments: loanForm.value.installments || 1,
      interestRate: loanInterestRate.value,
      startMonth: loanForm.value.startMonth,
    });
    loanMsg.value = `借款已建立（${loanForm.value.empNo} ${staff?.name || ""}）`;
    loanMsgIsErr.value = false;
    loanForm.value = {
      empNo: "",
      principal: null,
      installments: 12,
      startMonth: todayYYYYMM(),
    };
    await loadLoans();
  } catch (e) {
    loanMsg.value = "建立失敗：" + e.message;
    loanMsgIsErr.value = true;
  } finally {
    creatingLoan.value = false;
  }
}

async function removeLoan(ln) {
  if (!confirm(`確定刪除 ${ln.empNo} ${ln.name} 的借款記錄？`)) return;
  try {
    await deleteLoan(ln.id);
    await loadLoans();
  } catch (e) {
    alert("刪除失敗：" + e.message);
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────
function bonusList(r) {
  return [r.bonus1, r.bonus2, r.bonus3, r.bonus4, r.bonus5].filter(
    (b) => b && b > 0,
  );
}

function openDetail(r) {
  detailRecord.value = r;
}
</script>

<style scoped>
.payroll-wrap {
  max-width: 1000px;
  margin: 0 auto;
  padding: 1.5rem 1rem;
}
.page-title {
  margin-bottom: 1.2rem;
  font-size: 1.4rem;
}

.month-bar {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1.2rem;
  flex-wrap: wrap;
}
.month-bar input[type="month"] {
  border: 1px solid #ccc;
  border-radius: 6px;
  padding: 0.35rem 0.6rem;
  font-size: 0.95rem;
}
.btn-calc {
  background: #4a6fa5;
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 0.4rem 1rem;
  cursor: pointer;
  font-size: 0.9rem;
}
.btn-calc:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.calc-msg {
  font-size: 0.9rem;
}
.calc-msg.ok {
  color: #2e7d32;
}
.calc-msg.err {
  color: #c62828;
}

.loading-row {
  color: #888;
  padding: 2rem 0;
}
.empty-state {
  color: #888;
  padding: 2rem 0;
}

/* Admin table */
.payroll-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
}
.payroll-table th,
.payroll-table td {
  padding: 0.45rem 0.6rem;
  border: 1px solid #dde;
  text-align: left;
}
.payroll-table thead th {
  background: #f0f4ff;
  font-weight: 600;
}
.payroll-table tfoot td {
  background: #f9f9f9;
  font-weight: 600;
}
.num {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.ot {
  color: #2e7d32;
}
.meal {
  color: #e65100;
}
.deduct {
  color: #c62828;
}
.gross {
  font-weight: 700;
  color: #1a237e;
}
.total-label {
  text-align: right;
}

.btn-detail {
  padding: 0.25rem 0.6rem;
  background: #e8f0fe;
  border: 1px solid #aec;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.82rem;
  color: #1a237e;
}
.lunch-input {
  width: 70px;
  text-align: right;
  border: 1px solid #ccc;
  border-radius: 4px;
  padding: 0.2rem 0.3rem;
  font-size: 0.85rem;
}
.hint-text {
  color: #888;
  font-size: 0.82rem;
  margin-top: 0.5rem;
}

/* Payroll guide */
.payroll-guide h4 {
  margin: 16px 0 6px;
  font-size: 0.97rem;
}
.guide-table {
  width: auto;
  min-width: 260px;
  border-collapse: collapse;
  margin: 6px 0 10px;
  font-size: 13px;
}
.guide-table th,
.guide-table td {
  border: 1px solid #ddd;
  padding: 5px 12px;
}
.guide-table th {
  background: #f4f4f4;
}
.guide-example {
  background: #fff8e1;
  border-left: 3px solid #ffc107;
  padding: 6px 10px;
  margin: 4px 0 10px;
  font-size: 13px;
}
.guide-formula {
  background: #f0f4ff;
  border-left: 3px solid #2563eb;
  padding: 8px 14px;
  font-size: 13px;
  line-height: 1.9;
}
/* Loan section */
.loan-section {
  margin-top: 2.5rem;
  border-top: 2px solid #e0e4ef;
  padding-top: 1.5rem;
}
.loan-section-title {
  font-size: 1.15rem;
  margin-bottom: 1rem;
}
.loan-form {
  background: #f8f9ff;
  border: 1px solid #dde;
  border-radius: 8px;
  padding: 1rem 1.2rem;
  margin-bottom: 1.2rem;
}
.loan-form-title {
  margin-bottom: 0.8rem;
  font-size: 0.95rem;
  color: #333;
}
.loan-form-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.8rem;
  align-items: flex-end;
}
.lf-item {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.88rem;
  color: #444;
}
.lf-item select,
.lf-item input[type="month"] {
  border: 1px solid #ccc;
  border-radius: 4px;
  padding: 0.3rem 0.5rem;
  font-size: 0.9rem;
}
.lf-num {
  width: 110px;
  border: 1px solid #ccc;
  border-radius: 4px;
  padding: 0.3rem 0.5rem;
  font-size: 0.9rem;
}
.lf-short {
  width: 65px;
  border: 1px solid #ccc;
  border-radius: 4px;
  padding: 0.3rem 0.5rem;
  font-size: 0.9rem;
}
.loan-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.88rem;
}
.loan-table th,
.loan-table td {
  padding: 0.4rem 0.6rem;
  border: 1px solid #dde;
  text-align: left;
}
.loan-table thead th {
  background: #f0f4ff;
  font-weight: 600;
}
.loan-table tr.loan-paid td {
  color: #aaa;
}
.status-badge {
  padding: 0.15rem 0.5rem;
  border-radius: 10px;
  font-size: 0.8rem;
  font-weight: 600;
}
.badge-active {
  background: #fff3e0;
  color: #e65100;
}
.badge-paid {
  background: #e8f5e9;
  color: #2e7d32;
}
.muted {
  color: #bbb;
}
.btn-query {
  background: #4a6fa5;
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 0.4rem 1rem;
  cursor: pointer;
  font-size: 0.88rem;
}
.btn-query:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.btn-del {
  background: #fce4e4;
  border: 1px solid #e9a;
  color: #c00;
  padding: 0.2rem 0.5rem;
  font-size: 0.82rem;
  border-radius: 4px;
  cursor: pointer;
}

/* Payslip card */
.payslip-card {
  background: #fff;
  border: 1px solid #dde;
  border-radius: 10px;
  padding: 1.5rem;
  max-width: 500px;
}
.payslip-card h3 {
  margin-bottom: 1rem;
  font-size: 1.1rem;
}

.slip-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
}
.slip-table th,
.slip-table td {
  padding: 0.4rem 0.6rem;
  border-bottom: 1px solid #eee;
}
.slip-table th {
  text-align: left;
  width: 45%;
  color: #555;
  font-weight: 500;
}
.slip-table td {
  text-align: right;
}
.slip-table tr.sep th,
.slip-table tr.sep td {
  border-top: 2px solid #ccd;
}
.slip-table tr.sub th,
.slip-table tr.sub td {
  font-size: 0.82rem;
  color: #888;
  padding-left: 1.5rem;
}
.slip-table tr.total-row th,
.slip-table tr.total-row td {
  border-top: 2px solid #999;
  font-weight: 700;
  font-size: 1.05rem;
}

/* Modal */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
}
.modal-box {
  background: #fff;
  border-radius: 12px;
  padding: 1.8rem;
  width: min(520px, 95vw);
  max-height: 90vh;
  overflow-y: auto;
}
.modal-box h3 {
  margin-bottom: 1rem;
  font-size: 1.05rem;
}
.modal-actions {
  margin-top: 1.2rem;
  display: flex;
  justify-content: flex-end;
}
.btn-sm {
  padding: 0.3rem 0.8rem;
  border: 1px solid #bbb;
  border-radius: 6px;
  background: #fff;
  cursor: pointer;
  font-size: 0.85rem;
}
</style>
