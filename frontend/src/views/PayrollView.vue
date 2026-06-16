<template>
  <div class="payroll-wrap">
    <div
      style="display: flex; align-items: baseline; gap: 16px; flex-wrap: wrap"
    >
      <h2 class="page-title">{{ t("payroll_title") }}</h2>
      <router-link to="/payroll/help" style="font-size: 0.85rem; color: #2563eb"
        >？ 薪資計算說明</router-link
      >
    </div>

    <!-- Month picker -->
    <div class="month-bar">
      <label>
        月份：
        <input type="month" v-model="selectedMonth" @change="loadAll" />
      </label>
      <label class="reveal-label">
        敏感資料：
        <select v-model="sensitiveView" class="reveal-select">
          <option value="hidden">先隱藏</option>
          <option value="all">全部顯示</option>
          <option
            v-for="opt in sensitiveOptions"
            :key="`pv-${opt.empNo}`"
            :value="String(opt.empNo)"
          >
            {{ opt.empNo }} {{ opt.name }}
          </option>
        </select>
      </label>
      <button
        v-if="isManager"
        class="btn-calc"
        :disabled="calculating"
        @click="triggerCalculation"
      >
        {{ calculating ? "計算中…" : "計算薪資" }}
      </button>
      <button
        v-if="isManager"
        class="btn-cleanup"
        @click="cleanupDuplicates"
        title="刪除同一員工的舊格式重複記錄"
      >
        清除重複
      </button>
      <button
        v-if="isManager"
        class="btn-lunch-import"
        :disabled="importingLunch"
        @click="importLunchFromSheets"
        title="從 Google 試算表載入當月便當費"
      >
        {{ importingLunch ? "載入中…" : "載入便當費" }}
      </button>
      <span v-if="isManager" class="btn-remit-group">
        <button class="btn-remit" @click="printRemittance('first')">5日</button>
        <button class="btn-remit" @click="printRemittance('second')">
          10日
        </button>
        <span class="btn-remit-label">匯款明細</span>
      </span>
      <button
        v-if="isManager"
        class="btn-annual"
        @click="openAnnualReport"
        title="年度薪資彙整（報稅扣繳憑單彙整用）"
      >
        年度報表
      </button>
      <span v-if="calcMsg" :class="['calc-msg', calcMsgIsErr ? 'err' : 'ok']">{{
        calcMsg
      }}</span>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="loading-row">{{ t("payroll_loading") }}</div>

    <!-- Staff table -->
    <template v-else>
      <div v-if="displayedRecords.length === 0" class="empty-state">
        尚無薪資資料，請點「計算薪資」產生本月薪資單。
      </div>
      <table v-else class="payroll-table">
        <thead>
          <tr>
            <th>序號</th>
            <th>工號</th>
            <th>姓名</th>
            <th>部門</th>
            <th>底薪</th>
            <th>獎金</th>
            <th>加班費</th>
            <th>伙食費</th>
            <th>請假扣薪</th>
            <th>未上班扣薪</th>
            <th class="lunch-col">便當費</th>
            <th>5日發薪</th>
            <th>10日發薪</th>
            <th>實領合計</th>
            <th>申報所得</th>
            <th>明細</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(r, index) in displayedRecords" :key="r.id">
            <td>{{ index + 1 }}</td>
            <td>{{ r.empNo }}</td>
            <td>{{ r.name }}</td>
            <td>{{ r.dept || "—" }}</td>
            <td class="num">
              {{
                maskSensitive(r, displayBaseSalary(r)?.toLocaleString() || "—")
              }}
            </td>
            <td class="num">
              {{
                maskSensitive(
                  r,
                  r.bonusTotal > 0 ? "+" + r.bonusTotal.toLocaleString() : "—",
                )
              }}
            </td>
            <td class="num ot">
              {{
                maskSensitive(
                  r,
                  r.otPay > 0 ? "+" + r.otPay.toLocaleString() : "—",
                )
              }}
            </td>
            <td class="num meal">
              {{
                maskSensitive(
                  r,
                  r.mealAllowance > 0
                    ? "+" + r.mealAllowance.toLocaleString()
                    : "—",
                )
              }}
            </td>
            <td class="num deduct">
              {{
                maskSensitive(
                  r,
                  r.leaveDeduction > 0
                    ? "−" + r.leaveDeduction.toLocaleString()
                    : "—",
                )
              }}
            </td>
            <td class="num deduct">
              {{
                maskSensitive(
                  r,
                  calcPartialMonthDeduction(r) > 0
                    ? "−" + calcPartialMonthDeduction(r).toLocaleString()
                    : "—",
                )
              }}
            </td>
            <td class="num deduct lunch-col">
              <input
                v-if="isManager && isSensitiveVisible(r)"
                type="number"
                class="lunch-input"
                :value="r.lunchFee || 0"
                min="0"
                @change="saveLunchFee(r, $event.target.value)"
              />
              <span v-else>{{
                maskSensitive(
                  r,
                  (r.lunchFee || 0) > 0
                    ? "−" + (r.lunchFee || 0).toLocaleString()
                    : "—",
                )
              }}</span>
            </td>
            <td class="num gross">
              {{ maskSensitive(r, r.firstPayment?.toLocaleString() ?? "—") }}
            </td>
            <td
              class="num"
              :class="(r.secondPayment ?? 0) < 0 ? 'deduct' : 'gross'"
            >
              {{ maskSensitive(r, r.secondPayment?.toLocaleString() ?? "—") }}
            </td>
            <td class="num gross">
              {{ maskSensitive(r, r.grossPay?.toLocaleString() || "—") }}
            </td>
            <td class="num gross">
              {{ maskSensitive(r, calcReportedIncome(r).toLocaleString()) }}
            </td>
            <td>
              <button
                class="btn-sm btn-detail"
                :disabled="!isSensitiveVisible(r)"
                :title="
                  isSensitiveVisible(r)
                    ? ''
                    : '請先在上方選單選擇個人或全部顯示'
                "
                @click="openDetail(r)"
              >
                {{ t("payroll_detail") }}
              </button>
            </td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <td colspan="10" class="total-label">合計</td>
            <td class="num gross">{{ maskTotal(totalFirst) }}</td>
            <td class="num gross">{{ maskTotal(totalSecond) }}</td>
            <td class="num gross">{{ maskTotal(totalGross) }}</td>
            <td class="num gross">{{ maskTotal(totalReported) }}</td>
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
                v-if="ln.paidInstallments === 0 || isAdmin"
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
                {{ displayBaseSalary(detailRecord)?.toLocaleString() }}
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
              <th>加班費合計（實際）</th>
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
              <tr v-if="mealTotals(detailRecord).lunch > 0" class="sub">
                <th>午餐</th>
                <td class="num meal">
                  +{{ mealTotals(detailRecord).lunch.toLocaleString() }}
                </td>
              </tr>
              <tr v-if="mealTotals(detailRecord).dinner > 0" class="sub">
                <th>晚餐</th>
                <td class="num meal">
                  +{{ mealTotals(detailRecord).dinner.toLocaleString() }}
                </td>
              </tr>
            </template>
            <tr v-if="detailRecord.leaveDeduction > 0">
              <th>請假扣薪合計</th>
              <td class="num deduct">
                −{{ detailRecord.leaveDeduction.toLocaleString() }}
              </td>
            </tr>
            <tr v-if="calcPartialMonthDeduction(detailRecord) > 0">
              <th>
                未上班扣薪（{{ calcPartialMonthNoWorkDays(detailRecord) }}天）
              </th>
              <td class="num deduct">
                −{{ calcPartialMonthDeduction(detailRecord).toLocaleString() }}
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
            <tr v-if="(detailRecord.absentDeduction || 0) > 0">
              <th>曠職扣薪（{{ detailRecord.absentDays }}天）</th>
              <td class="num deduct">
                −{{ detailRecord.absentDeduction.toLocaleString() }}
              </td>
            </tr>
            <tr v-if="(detailRecord.laborInsurance || 0) > 0">
              <th>勞保費</th>
              <td class="num deduct">
                −{{ detailRecord.laborInsurance.toLocaleString() }}
              </td>
            </tr>
            <tr v-if="(detailRecord.healthInsurance || 0) > 0">
              <th>健保費（本人）</th>
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
            <tr v-if="(detailRecord.mutualAid || 0) > 0">
              <th>減項互助金</th>
              <td class="num deduct">
                −{{ detailRecord.mutualAid.toLocaleString() }}
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
            <tr v-if="(detailRecord.otherDeduction || 0) > 0">
              <th>
                其他減項{{
                  detailRecord.otherDeductionNote
                    ? `（${detailRecord.otherDeductionNote}）`
                    : ""
                }}
              </th>
              <td class="num deduct">
                −{{ detailRecord.otherDeduction.toLocaleString() }}
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
            <tr class="sep">
              <th>申報所得（投保薪資-曠職/遲到早退）</th>
              <td class="num">
                {{ calcReportedIncome(detailRecord).toLocaleString() }}
              </td>
            </tr>
            <tr class="sep">
              <th>5日發薪（投保薪資＋申報加班費）</th>
              <td class="num gross">
                {{ (detailRecord.firstPayment ?? 0).toLocaleString() }}
              </td>
            </tr>
            <tr>
              <th>10日發薪（補差額）</th>
              <td
                class="num"
                :class="
                  (detailRecord.secondPayment ?? 0) < 0 ? 'deduct' : 'gross'
                "
              >
                {{ (detailRecord.secondPayment ?? 0).toLocaleString() }}
              </td>
            </tr>
          </tbody>
        </table>
        <div class="modal-actions">
          <button
            class="btn-sm btn-print"
            @click="printSlip(detailRecord, 'first')"
          >
            列印 5日明細
          </button>
          <button
            class="btn-sm btn-print"
            @click="printSlip(detailRecord, 'full')"
          >
            列印全部明細
          </button>
          <button class="btn-sm" @click="detailRecord = null">關閉</button>
        </div>
      </div>
    </div>

    <!-- 年度報表 modal -->
    <div
      v-if="showAnnualReport"
      class="modal-overlay"
      @click.self="closeAnnualReport"
    >
      <div class="modal-box modal-box-wide">
        <h3>年度薪資彙整報告（報稅扣繳憑單彙整用）</h3>

        <div class="annual-form">
          <label class="af-item">
            年度：
            <input
              type="number"
              v-model="annualYear"
              min="2000"
              max="2100"
              class="annual-year-input"
            />
          </label>
          <label class="af-item">
            員工：
            <select v-model="annualEmpNo" class="annual-emp-select">
              <option value="">全部在職員工</option>
              <option value="__ALL__">全部員工（含離職）</option>
              <optgroup label="在職">
                <option
                  v-for="s in allStaffForAnnual.filter(
                    (s) => s.status !== '離職',
                  )"
                  :key="`annual-${s.empNo}`"
                  :value="s.empNo"
                >
                  {{ s.empNo }} {{ s.name }}
                </option>
              </optgroup>
              <optgroup label="離職">
                <option
                  v-for="s in allStaffForAnnual.filter(
                    (s) => s.status === '離職',
                  )"
                  :key="`annual-off-${s.empNo}`"
                  :value="s.empNo"
                >
                  {{ s.empNo }} {{ s.name }}（離職）
                </option>
              </optgroup>
            </select>
          </label>
          <button
            class="btn-query"
            :disabled="annualLoading"
            @click="loadAnnualReport"
          >
            {{ annualLoading ? "查詢中…" : "查詢" }}
          </button>
        </div>

        <fieldset class="annual-cols">
          <legend>欄位選擇</legend>
          <label
            v-for="c in annualColumnDefs"
            :key="`acol-${c.key}`"
            class="annual-col-item"
          >
            <input
              type="checkbox"
              v-model="annualColumns[c.key]"
              :disabled="c.required"
            />
            {{ c.label }}<span v-if="c.required" class="req-tag">（必選）</span>
          </label>
        </fieldset>

        <div v-if="annualResult" class="annual-result">
          <p class="annual-summary">
            {{ annualResult.year }} 年度 —
            <template v-if="annualResult.mode === 'single'">
              {{ annualResult.staff.empNo }} {{ annualResult.staff.name }}（{{
                annualResult.rows.filter((r) => r.exists).length
              }}
              個月有資料）
            </template>
            <template v-else>
              全公司 {{ annualResult.rows.length }} 人
            </template>
          </p>
          <div class="annual-table-wrap">
            <table class="annual-table">
              <thead>
                <tr v-if="annualResult.mode === 'single'">
                  <th>月份</th>
                  <th
                    v-for="c in annualResult.columns"
                    :key="`hs-${c.key}`"
                    class="num"
                  >
                    {{ c.label }}
                  </th>
                </tr>
                <tr v-else>
                  <th>工號</th>
                  <th>姓名</th>
                  <th>部門</th>
                  <th
                    v-for="c in annualResult.columns"
                    :key="`ha-${c.key}`"
                    class="num"
                  >
                    {{ c.label }}
                  </th>
                  <th class="num">月數</th>
                </tr>
              </thead>
              <tbody>
                <template v-if="annualResult.mode === 'single'">
                  <tr
                    v-for="row in annualResult.rows"
                    :key="`as-${row.month}`"
                    :class="row.exists ? '' : 'annual-empty'"
                  >
                    <th>{{ row.monthLabel }}</th>
                    <td
                      v-for="c in annualResult.columns"
                      :key="`as-${row.month}-${c.key}`"
                      class="num"
                    >
                      {{ (row.values[c.key] || 0).toLocaleString() }}
                    </td>
                  </tr>
                </template>
                <template v-else>
                  <tr v-for="row in annualResult.rows" :key="`aa-${row.empNo}`">
                    <th>{{ row.empNo }}</th>
                    <td>{{ row.name }}</td>
                    <td>{{ row.dept || "—" }}</td>
                    <td
                      v-for="c in annualResult.columns"
                      :key="`aa-${row.empNo}-${c.key}`"
                      class="num"
                    >
                      {{ (row.values[c.key] || 0).toLocaleString() }}
                    </td>
                    <td class="num">{{ row.monthCount }}</td>
                  </tr>
                </template>
              </tbody>
              <tfoot>
                <tr v-if="annualResult.mode === 'single'" class="annual-total">
                  <th>年度合計</th>
                  <td
                    v-for="c in annualResult.columns"
                    :key="`ts-${c.key}`"
                    class="num"
                  >
                    {{ (annualResult.totals[c.key] || 0).toLocaleString() }}
                  </td>
                </tr>
                <tr v-else class="annual-total">
                  <th colspan="3">全公司合計</th>
                  <td
                    v-for="c in annualResult.columns"
                    :key="`ta-${c.key}`"
                    class="num"
                  >
                    {{ (annualResult.totals[c.key] || 0).toLocaleString() }}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
        <div v-else-if="!annualLoading" class="annual-hint">
          請選擇年度與員工後按「查詢」。
        </div>

        <div class="modal-actions">
          <button
            v-if="annualResult"
            class="btn-sm btn-print"
            @click="printAnnualReport"
          >
            列印 PDF（彙整表）
          </button>
          <button
            v-if="annualResult"
            class="btn-sm btn-print"
            @click="printAnnualSlipFormat"
          >
            列印薪資表格式
          </button>
          <button v-if="annualResult" class="btn-sm" @click="exportAnnualCSV">
            匯出 CSV
          </button>
          <button class="btn-sm" @click="closeAnnualReport">關閉</button>
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
  deleteDoc,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";

// ── State ──────────────────────────────────────────────────────────────────
const currentUser = ref(null);
const userRole = ref(null);

const isManager = computed(
  () => userRole.value === "admin" || userRole.value === "管理者",
);
const isAdmin = computed(() => userRole.value === "admin");

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
const allStaffForAnnual = ref([]);
const staffBankMap = ref(new Map());
const sensitiveView = ref("hidden");
const lunchSheetUrl = ref("");
const importingLunch = ref(false);

const sensitiveOptions = computed(() => {
  const activeEmpNos = new Set(
    staffList.value
      .filter((s) => String(s.status || "") !== "離職")
      .map((s) => String(s.empNo ?? "")),
  );
  return allRecords.value
    .map((r) => ({
      empNo: String(r.empNo ?? ""),
      name: String(r.name ?? ""),
    }))
    .filter((r) => r.empNo && activeEmpNos.has(r.empNo))
    .sort((a, b) => {
      const aNum = Number(a.empNo);
      const bNum = Number(b.empNo);
      if (Number.isFinite(aNum) && Number.isFinite(bNum)) return aNum - bNum;
      return a.empNo.localeCompare(b.empNo, "zh-Hant", { numeric: true });
    });
});

function toMonthKey(ymLike) {
  const raw = String(ymLike || "").trim();
  if (!raw) return "";
  if (/^\d{6}$/.test(raw)) return `${raw.slice(0, 4)}-${raw.slice(4, 6)}`;
  if (/^\d{4}-\d{2}/.test(raw)) return raw.slice(0, 7);
  return "";
}

function getPrevMonthKey(yyyyMm) {
  const key = toMonthKey(yyyyMm);
  if (!key) return "";
  const [yStr, mStr] = key.split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  if (!Number.isFinite(y) || !Number.isFinite(m)) return "";
  const d = new Date(y, m - 1, 1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function normalizeDateStr(v) {
  const raw = String(v || "").trim();
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  if (/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(raw)) {
    const [y, m, d] = raw.split("/").map((n) => Number(n));
    if (Number.isFinite(y) && Number.isFinite(m) && Number.isFinite(d)) {
      return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    }
  }
  const dt = new Date(raw);
  if (!Number.isNaN(dt.getTime())) {
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
  }
  return "";
}

function resolveResignDate(staff, record) {
  const fromStaff =
    staff?.endDate ||
    staff?.leaveDate ||
    staff?.resignDate ||
    staff?.terminationDate ||
    "";
  const fromRecord =
    record?.employmentEnd ||
    record?.endDate ||
    record?.leaveDate ||
    record?.resignDate ||
    record?.terminationDate ||
    "";
  return normalizeDateStr(fromStaff || fromRecord);
}

const displayedRecords = computed(() => {
  const prevMonthKey = getPrevMonthKey(selectedMonth.value);
  return allRecords.value.filter((r) => {
    const empNo = String(r.empNo ?? "").trim();
    const staff = staffBankMap.value.get(empNo) || null;
    const status = String(staff?.status || r.status || "").trim();
    if (status !== "離職") return true;
    const resignDate = resolveResignDate(staff, r);
    if (!resignDate) return false;
    return toMonthKey(resignDate) === prevMonthKey;
  });
});

const visibleSensitiveRecords = computed(() =>
  displayedRecords.value.filter((r) => isSensitiveVisible(r)),
);

const totalGross = computed(() =>
  visibleSensitiveRecords.value.reduce((sum, r) => sum + (r.grossPay || 0), 0),
);
const totalFirst = computed(() =>
  visibleSensitiveRecords.value.reduce(
    (sum, r) => sum + (r.firstPayment || 0),
    0,
  ),
);
const totalSecond = computed(() =>
  visibleSensitiveRecords.value.reduce(
    (sum, r) => sum + (r.secondPayment || 0),
    0,
  ),
);
const totalReported = computed(() =>
  visibleSensitiveRecords.value.reduce(
    (sum, r) => sum + calcReportedIncome(r),
    0,
  ),
);

function isSensitiveVisible(r) {
  if (!r) return false;
  if (sensitiveView.value === "all") return true;
  if (sensitiveView.value === "hidden") return false;
  return String(r.empNo ?? "") === String(sensitiveView.value);
}

function maskSensitive(r, value) {
  return isSensitiveVisible(r) ? value : "＊＊＊";
}

function maskTotal(value) {
  return sensitiveView.value === "hidden" ? "＊＊＊" : value.toLocaleString();
}

function calcFirstPaymentFixedDeductions(r) {
  if (!r) return 0;
  return (
    (Number(r.laborInsurance) || 0) +
    (Number(r.healthInsurance) || 0) +
    (Number(r.dependentHealth) || 0) +
    (Number(r.mutualAid) || 0) +
    (Number(r.lunchFee) || 0) +
    (Number(r.foreignRent) || 0) +
    (Number(r.waterFee) || 0) +
    (Number(r.electricFee) || 0) +
    (Number(r.foreignMedical) || 0) +
    (Number(r.foreignService) || 0) +
    (Number(r.otherDeduction) || 0) +
    (Number(r.loanPrincipal) || 0) +
    (Number(r.loanInterest) || 0)
  );
}

function calcLaborInsuranceSalaryBase(r) {
  if (!r) return 0;
  if (r.laborInsuranceSalaryBase != null) {
    return Math.max(0, Number(r.laborInsuranceSalaryBase) || 0);
  }
  return Math.max(
    0,
    (Number(r.firstPayment) || 0) -
      (Number(r.otPayOfficial) || 0) +
      calcFirstPaymentFixedDeductions(r) +
      (Number(r.absentDeduction) || 0),
  );
}

function calcReportedIncome(r) {
  if (!r) return 0;
  if (r.laborInsuranceSalaryBase != null) {
    return Math.max(
      0,
      calcLaborInsuranceSalaryBase(r) -
        (Number(r.absentDeduction) || 0) -
        (Number(r.lateEarlyDeduction) || 0),
    );
  }
  if (r.reportedIncome != null)
    return Math.max(0, Number(r.reportedIncome) || 0);
  return Math.max(
    0,
    calcLaborInsuranceSalaryBase(r) -
      (Number(r.absentDeduction) || 0) -
      (Number(r.lateEarlyDeduction) || 0),
  );
}

function displayBaseSalary(r) {
  if (!r) return 0;
  if (String(r.salaryType || "") === "月薪") {
    return Number(r.baseSalaryFull ?? r.baseSalary) || 0;
  }
  return Number(r.baseSalary) || 0;
}

function calcPartialMonthDeduction(r) {
  if (!r || String(r.salaryType || "") !== "月薪") return 0;

  const explicit = Number(r.partialMonthDeduction);
  if (Number.isFinite(explicit) && explicit > 0) {
    return Math.round(explicit);
  }

  const fullBase = Number(r.baseSalaryFull);
  const actualBase = Number(r.baseSalary);
  if (
    Number.isFinite(fullBase) &&
    fullBase > 0 &&
    Number.isFinite(actualBase) &&
    actualBase >= 0 &&
    actualBase < fullBase
  ) {
    return Math.round(fullBase - actualBase);
  }

  return 0;
}

function calcFirstPaymentPartialMonthDeduction(r) {
  if (!r || String(r.salaryType || "") !== "月薪") return 0;

  const explicit = Number(r.partialMonthDeductionFirst);
  if (Number.isFinite(explicit) && explicit > 0) {
    return Math.round(explicit);
  }

  const noWorkDays = Number(r.partialMonthNoWorkDays);
  const laborBase = Number(r.laborInsuranceSalaryBase);
  if (
    Number.isFinite(noWorkDays) &&
    noWorkDays > 0 &&
    Number.isFinite(laborBase) &&
    laborBase > 0
  ) {
    return Math.round((laborBase / 30) * noWorkDays);
  }

  return calcPartialMonthDeduction(r);
}

function calcPartialMonthNoWorkDays(r) {
  if (!r || String(r.salaryType || "") !== "月薪") return 0;

  const explicitDays = Number(r.partialMonthNoWorkDays);
  if (Number.isFinite(explicitDays) && explicitDays > 0) {
    return Math.round(explicitDays);
  }

  const deduction = calcPartialMonthDeduction(r);
  const fullBase = Number(r.baseSalaryFull);
  if (deduction > 0 && Number.isFinite(fullBase) && fullBase > 0) {
    return Math.max(0, Math.round((deduction * 30) / fullBase));
  }

  return 0;
}

// ── 年度報表 (報稅彙整用) ──────────────────────────────────────────────────
const annualColumnDefs = [
  { key: "reportedIncome", label: "申報所得", required: true },
  { key: "laborInsuranceSalaryBase", label: "投保薪資" },
  { key: "otPayOfficial", label: "加班費(申報)" },
  { key: "otPay", label: "加班費(實際)" },
  { key: "bonusTotal", label: "獎金" },
  { key: "mealAllowance", label: "伙食津貼" },
  { key: "laborInsurance", label: "勞保自付" },
  { key: "healthInsurance", label: "健保費（本人）" },
  { key: "dependentHealth", label: "健保費（眷屬）" },
  { key: "mutualAid", label: "減項互助金" },
  { key: "lunchFee", label: "便當費" },
  { key: "otherDeduction", label: "其他減項" },
  { key: "loanPrincipal", label: "借款本金" },
  { key: "loanInterest", label: "借款利息" },
  { key: "leaveDeduction", label: "請假扣薪" },
  { key: "absentDeduction", label: "曠職扣薪" },
  { key: "lateEarlyDeduction", label: "遲到/早退扣薪" },
  { key: "grossPay", label: "實領合計" },
  { key: "firstPayment", label: "5日發薪" },
  { key: "secondPayment", label: "10日發薪" },
];
const DEFAULT_ANNUAL_CHECKED = new Set([
  "reportedIncome",
  "otPayOfficial",
  "laborInsurance",
  "healthInsurance",
  "dependentHealth",
]);

const showAnnualReport = ref(false);
const annualYear = ref(String(new Date().getFullYear()));
const annualEmpNo = ref("");
const annualColumns = ref(
  Object.fromEntries(
    annualColumnDefs.map((c) => [
      c.key,
      DEFAULT_ANNUAL_CHECKED.has(c.key) || !!c.required,
    ]),
  ),
);
const annualLoading = ref(false);
const annualResult = ref(null);

function openAnnualReport() {
  showAnnualReport.value = true;
  annualResult.value = null;
}
function closeAnnualReport() {
  showAnnualReport.value = false;
}

function getAnnualFieldValue(r, key) {
  if (!r) return 0;
  if (key === "reportedIncome") return calcReportedIncome(r);
  return Number(r[key]) || 0;
}

async function loadAnnualReport() {
  const year = String(annualYear.value || "").trim();
  if (!/^\d{4}$/.test(year)) {
    alert("請輸入正確的年份（4位數）");
    return;
  }
  const selectedCols = annualColumnDefs.filter(
    (c) => annualColumns.value[c.key],
  );
  if (!selectedCols.length) {
    alert("請至少選擇一個欄位");
    return;
  }
  annualLoading.value = true;
  annualResult.value = null;
  try {
    const start = year + "01";
    const end = year + "12";
    const snap = await getDocs(
      query(
        collection(db, "payroll"),
        where("yyyyMM", ">=", start),
        where("yyyyMM", "<=", end),
      ),
    );
    const raw = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    // 去重：同一 (empNo, yyyyMM) 優先保留新格式 (uid-based) 文件
    const dedup = new Map();
    for (const r of raw) {
      const key = `${String(r.empNo ?? "")}|${r.yyyyMM}`;
      const existing = dedup.get(key);
      if (!existing) {
        dedup.set(key, r);
      } else {
        const existingIsOld =
          existing.id.startsWith("empNo_") || /^\d+_/.test(existing.id);
        const newIsOld = r.id.startsWith("empNo_") || /^\d+_/.test(r.id);
        if (existingIsOld && !newIsOld) dedup.set(key, r);
      }
    }

    // 排除離職員工 (staffList 已過濾 status === '離職')
    const activeSet = new Set(staffList.value.map((s) => String(s.empNo)));
    const targetEmpNo = String(annualEmpNo.value || "").trim();
    const includeAll = targetEmpNo === "__ALL__";

    const records = Array.from(dedup.values()).filter((r) => {
      const en = String(r.empNo ?? "");
      if (includeAll) return true;
      if (targetEmpNo) return en === targetEmpNo;
      if (!activeSet.has(en)) return false;
      return true;
    });

    if (targetEmpNo && !includeAll) {
      const staff = allStaffForAnnual.value.find(
        (s) => String(s.empNo) === targetEmpNo,
      ) || {
        empNo: targetEmpNo,
        name: "",
      };
      const rows = [];
      const totals = Object.fromEntries(selectedCols.map((c) => [c.key, 0]));
      for (let m = 1; m <= 12; m++) {
        const mm = String(m).padStart(2, "0");
        const rec = records.find((r) => r.yyyyMM === year + mm);
        const values = {};
        for (const c of selectedCols) {
          const v = getAnnualFieldValue(rec, c.key);
          values[c.key] = v;
          totals[c.key] += v;
        }
        rows.push({
          month: m,
          monthLabel: `${year}/${mm}`,
          exists: !!rec,
          values,
        });
      }
      annualResult.value = {
        mode: "single",
        year,
        columns: selectedCols,
        staff,
        rows,
        totals,
      };
    } else {
      const byEmp = new Map();
      for (const r of records) {
        const en = String(r.empNo ?? "");
        if (!byEmp.has(en)) byEmp.set(en, []);
        byEmp.get(en).push(r);
      }
      const empNos = Array.from(byEmp.keys()).sort((a, b) => {
        const an = Number(a);
        const bn = Number(b);
        if (Number.isFinite(an) && Number.isFinite(bn)) return an - bn;
        return a.localeCompare(b, "zh-Hant", { numeric: true });
      });
      const rows = [];
      const totals = Object.fromEntries(selectedCols.map((c) => [c.key, 0]));
      for (const en of empNos) {
        const recs = byEmp.get(en);
        const staff = allStaffForAnnual.value.find(
          (s) => String(s.empNo) === en,
        );
        const sample = recs[0] || {};
        const values = {};
        for (const c of selectedCols) {
          const sum = recs.reduce(
            (s, r) => s + getAnnualFieldValue(r, c.key),
            0,
          );
          values[c.key] = sum;
          totals[c.key] += sum;
        }
        const monthlyData = {};
        for (let m = 1; m <= 12; m++) {
          const mm = String(m).padStart(2, "0");
          const rec = recs.find((r) => r.yyyyMM === year + mm);
          monthlyData[mm] = rec
            ? getAnnualFieldValue(rec, "reportedIncome")
            : 0;
        }
        rows.push({
          empNo: en,
          name: staff?.name || sample.name || "",
          dept: sample.dept || "",
          monthCount: recs.length,
          values,
          monthlyData,
        });
      }
      annualResult.value = {
        mode: "all",
        year,
        columns: selectedCols,
        rows,
        totals,
      };
    }
  } catch (e) {
    alert("查詢失敗：" + (e.message || e.code));
  } finally {
    annualLoading.value = false;
  }
}

function printAnnualReport() {
  if (!annualResult.value) return;
  const R = annualResult.value;
  const cols = R.columns;
  const fmt = (v) => (Number(v) || 0).toLocaleString();

  let head;
  let bodyRows;
  let footer;
  if (R.mode === "single") {
    head = `<tr><th>月份</th>${cols
      .map((c) => `<th class="num">${c.label}</th>`)
      .join("")}</tr>`;
    bodyRows = R.rows
      .map(
        (row) =>
          `<tr class="${row.exists ? "" : "empty"}"><th>${row.monthLabel}</th>${cols
            .map((c) => `<td class="num">${fmt(row.values[c.key])}</td>`)
            .join("")}</tr>`,
      )
      .join("");
    footer = `<tr class="total-row"><th>年度合計</th>${cols
      .map((c) => `<td class="num">${fmt(R.totals[c.key])}</td>`)
      .join("")}</tr>`;
  } else {
    head = `<tr><th>工號</th><th>姓名</th><th>部門</th>${cols
      .map((c) => `<th class="num">${c.label}</th>`)
      .join("")}<th class="num">月數</th></tr>`;
    bodyRows = R.rows
      .map(
        (row) =>
          `<tr><th>${row.empNo}</th><td>${row.name}</td><td>${row.dept || "—"}</td>${cols
            .map((c) => `<td class="num">${fmt(row.values[c.key])}</td>`)
            .join("")}<td class="num">${row.monthCount}</td></tr>`,
      )
      .join("");
    footer = `<tr class="total-row"><th colspan="3">全公司合計</th>${cols
      .map((c) => `<td class="num">${fmt(R.totals[c.key])}</td>`)
      .join("")}<td></td></tr>`;
  }

  const title =
    R.mode === "single"
      ? `${R.year} 年度薪資彙整（${R.staff.empNo} ${R.staff.name}）`
      : `${R.year} 年度薪資彙整（全公司，扣繳憑單彙整用）`;

  const html = `<!DOCTYPE html><html lang="zh-Hant"><head><meta charset="UTF-8"><title>${title}</title>
<style>
body { font-family: 'Noto Sans TC', Arial, sans-serif; font-size: 12px; margin: 16px; color: #222; }
h2 { font-size: 1.1rem; margin: 0 0 4px; }
p.sub { color: #666; margin: 2px 0 12px; font-size: 11px; }
table { width: 100%; border-collapse: collapse; }
th, td { border: 1px solid #999; padding: 4px 6px; text-align: left; vertical-align: middle; font-size: 11px; }
th { background: #f0f0f0; white-space: nowrap; }
td.num, th.num { text-align: right; white-space: nowrap; }
tr.empty td { color: #bbb; }
tr.total-row th, tr.total-row td { font-weight: bold; background: #fff7d6; }
@media print { @page { size: A4 landscape; margin: 1cm; } }
</style></head><body>
<h2>${title}</h2>
<p class="sub">列印時間：${new Date().toLocaleString("zh-TW")}　欄位：${cols
    .map((c) => c.label)
    .join("、")}</p>
<table><thead>${head}</thead><tbody>${bodyRows}</tbody><tfoot>${footer}</tfoot></table>
</body></html>`;

  const win = window.open("", "_blank", "width=1200,height=820");
  win.document.write(html);
  win.document.close();
  win.focus();
  win.onload = () => {
    win.print();
    win.onafterprint = () => win.close();
  };
}

function printAnnualSlipFormat() {
  if (!annualResult.value) return;
  const R = annualResult.value;
  const year = String(R.year);
  const rocYear = Number(year) - 1911;
  const fmt = (v) => (Number(v) || 0).toLocaleString();
  const esc = (s) =>
    String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

  const empBlocks = [];
  if (R.mode === "single") {
    const staffInfo = allStaffForAnnual.value.find(
      (s) => String(s.empNo) === String(R.staff.empNo),
    ) || { ...R.staff, idNo: "", address: "", spouse: "", numDependents: "" };
    const monthlyValues = [];
    let total = 0;
    for (let m = 1; m <= 12; m++) {
      const row = R.rows.find((r) => r.month === m);
      const v = row ? row.values["reportedIncome"] || 0 : 0;
      monthlyValues.push(v);
      total += v;
    }
    empBlocks.push({ staff: staffInfo, monthlyValues, total });
  } else {
    for (const row of R.rows) {
      const staffInfo = allStaffForAnnual.value.find(
        (s) => String(s.empNo) === String(row.empNo),
      ) || {
        empNo: row.empNo,
        name: row.name,
        idNo: "",
        address: "",
        spouse: "",
        numDependents: "",
      };
      const monthlyValues = [];
      let total = 0;
      for (let m = 1; m <= 12; m++) {
        const mm = String(m).padStart(2, "0");
        const v = row.monthlyData ? row.monthlyData[mm] || 0 : 0;
        monthlyValues.push(v);
        total += v;
      }
      empBlocks.push({ staff: staffInfo, monthlyValues, total });
    }
  }

  function buildEmpHtml(block) {
    const { staff, monthlyValues, total } = block;
    const mHeaders = Array.from(
      { length: 12 },
      (_, i) => `<th class="th-m">${i + 1}月份</th>`,
    ).join("");
    const mTds = monthlyValues
      .map((v) => `<td class="num">${fmt(v)}</td>`)
      .join("");
    const emptyM = '<td colspan="12" class="empty-m"></td>';
    return `<div class="page-hd">
  <span class="co-name">公司名稱：峻晟實業股份有限公司</span>
  <span class="yr-title">${rocYear}&ensp;年&ensp;度&ensp;薪&ensp;資&ensp;表</span>
</div>
<table class="slip">
  <thead>
    <tr>
      <th class="th-name">姓名</th>
      <th class="th-sp">配偶</th>
      <th class="th-dep">扶養<br>人數</th>
      <th class="th-total">合計</th>
      <th class="th-lbl">月份</th>
      ${mHeaders}
    </tr>
  </thead>
  <tbody>
    <tr>
      <td rowspan="7" class="td-name">${esc(staff.name)}</td>
      <td rowspan="2" class="td-sp">${esc(staff.spouse)}</td>
      <td rowspan="2" class="td-dep">${esc(staff.numDependents)}</td>
      <td class="num">${fmt(total)}</td>
      <td class="td-lbl">給付額</td>
      ${mTds}
    </tr>
    <tr>
      <td></td><td class="td-lbl">扣繳額</td>${emptyM}
    </tr>
    <tr>
      <td colspan="2" class="td-id-lbl">身份證統一編號</td>
      <td></td><td class="td-lbl">伙食費</td>${emptyM}
    </tr>
    <tr>
      <td colspan="2" class="td-id-val">${esc(staff.idNo)}</td>
      <td></td><td class="td-lbl">獎金</td>${emptyM}
    </tr>
    <tr>
      <td rowspan="3" colspan="2" class="td-addr">${esc(staff.address)}</td>
      <td></td><td class="td-lbl">健保投保額</td>${emptyM}
    </tr>
    <tr>
      <td></td><td class="td-lbl td-lbl-sm">每月二代健保費*2%</td>${emptyM}
    </tr>
    <tr>
      <td></td><td class="td-lbl">蓋章</td>
      ${'<td class="td-seal"></td>'.repeat(12)}
    </tr>
  </tbody>
</table>`;
  }

  const blocksHtml = empBlocks
    .map(
      (b, i) =>
        `<div class="emp-blk${i % 2 === 1 ? " brk" : ""}">${buildEmpHtml(b)}</div>`,
    )
    .join("");

  const css = [
    'body{font-family:"Noto Sans TC",Arial,sans-serif;font-size:13px;margin:6mm;color:#000;}',
    ".emp-blk{margin-bottom:8mm;}",
    ".emp-blk.brk{page-break-after:always;margin-bottom:0;}",
    ".emp-blk:last-child{page-break-after:avoid;}",
    ".page-hd{display:flex;align-items:baseline;margin-bottom:3px;}",
    ".co-name{font-size:13px;white-space:nowrap;}",
    ".yr-title{flex:1;text-align:center;font-size:18px;font-weight:bold;letter-spacing:6px;}",
    ".slip{width:100%;border-collapse:collapse;table-layout:fixed;}",
    ".slip th,.slip td{border:1px solid #000;padding:3px 4px;text-align:center;vertical-align:middle;font-size:12px;word-break:break-all;}",
    ".th-name{width:7%;}.th-sp{width:4%;}.th-dep{width:4%;}.th-total{width:8%;}.th-lbl{width:11%;}.th-m{width:5.5%;}",
    ".td-name{font-size:18px;font-weight:bold;}",
    ".td-id-lbl{font-size:11px;line-height:1.4;text-align:center;vertical-align:middle;}",
    ".td-id-val{font-size:11px;text-align:center;vertical-align:middle;letter-spacing:1px;}",
    ".td-lbl-sm{font-size:9.5px !important;white-space:nowrap;}",
    ".td-addr{font-size:11px;text-align:center;vertical-align:middle;padding:4px;}",
    ".td-lbl{text-align:left;white-space:nowrap;padding-left:6px;font-size:12px;}",
    ".td-seal{height:42px;}",
    ".num{text-align:right;}",
    "@media print{@page{size:A4 landscape;margin:6mm;}body{margin:0;}}",
  ].join("");

  const html = `<!DOCTYPE html><html lang="zh-Hant"><head><meta charset="UTF-8"><title>${rocYear} 年度薪資表</title><style>${css}</style></head><body>${blocksHtml}</body></html>`;

  const win = window.open("", "_blank", "width=1400,height=900");
  win.document.write(html);
  win.document.close();
  win.focus();
  win.onload = () => {
    win.print();
    win.onafterprint = () => win.close();
  };
}

function csvCell(v) {
  const s = String(v ?? "");
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function exportAnnualCSV() {
  if (!annualResult.value) return;
  const R = annualResult.value;
  const cols = R.columns;
  const lines = [];
  if (R.mode === "single") {
    lines.push(["月份", ...cols.map((c) => c.label)].map(csvCell).join(","));
    for (const row of R.rows) {
      lines.push(
        [row.monthLabel, ...cols.map((c) => row.values[c.key] || 0)]
          .map(csvCell)
          .join(","),
      );
    }
    lines.push(
      ["年度合計", ...cols.map((c) => R.totals[c.key] || 0)]
        .map(csvCell)
        .join(","),
    );
  } else {
    lines.push(
      ["工號", "姓名", "部門", ...cols.map((c) => c.label), "月數"]
        .map(csvCell)
        .join(","),
    );
    for (const row of R.rows) {
      lines.push(
        [
          row.empNo,
          row.name,
          row.dept || "",
          ...cols.map((c) => row.values[c.key] || 0),
          row.monthCount,
        ]
          .map(csvCell)
          .join(","),
      );
    }
    lines.push(
      ["", "", "全公司合計", ...cols.map((c) => R.totals[c.key] || 0), ""]
        .map(csvCell)
        .join(","),
    );
  }
  const bom = "\uFEFF";
  const blob = new Blob([bom + lines.join("\r\n")], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const tag =
    R.mode === "single" ? `${R.staff.empNo}_${R.staff.name}` : "全公司";
  a.download = `${R.year}年度薪資彙整_${tag}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

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
    try {
      const cfg = await getSystemSettings();
      lunchSheetUrl.value = cfg.lunchSheetCsvUrl || "";
    } catch (_) {}
  }
});

async function loadAll() {
  await loadPayroll();
}

// ── 便當費匯入 ──────────────────────────────────────────────────────────────
function parseCSV(text) {
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const row = [];
    let inQuote = false;
    let cell = "";
    for (const ch of line) {
      if (ch === '"') {
        inQuote = !inQuote;
      } else if (ch === "," && !inQuote) {
        row.push(cell.trim());
        cell = "";
      } else {
        cell += ch;
      }
    }
    row.push(cell.trim());
    rows.push(row);
  }
  return rows;
}

async function importLunchFromSheets() {
  if (!lunchSheetUrl.value) {
    calcMsg.value = "請先至「系統設定」儲存便當費試算表 CSV 網址";
    calcMsgIsErr.value = true;
    setTimeout(() => {
      calcMsg.value = "";
    }, 5000);
    return;
  }
  if (!allRecords.value.length) {
    calcMsg.value = "尚無薪資資料，請先計算薪資";
    calcMsgIsErr.value = true;
    setTimeout(() => {
      calcMsg.value = "";
    }, 5000);
    return;
  }
  importingLunch.value = true;
  calcMsg.value = "";
  try {
    const resp = await fetch(lunchSheetUrl.value);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    // 去掉 BOM，正規化各種空白
    const raw = (await resp.text()).replace(/^\uFEFF/, "");
    const rows = parseCSV(raw);

    // 找表頭列（含「月份」的那行，放寬比對）
    const normalize = (s) => s.replace(/\s/g, "");
    let headerRowIdx = -1;
    let monthColIdx = -1;
    for (let i = 0; i < rows.length; i++) {
      const idx = rows[i].findIndex((c) => normalize(c).includes("月份"));
      if (idx >= 0) {
        headerRowIdx = i;
        monthColIdx = idx;
        break;
      }
    }
    if (headerRowIdx < 0) {
      // 顯示診斷資訊
      const preview = rows
        .slice(0, 6)
        .map((r, i) => `第${i + 1}列: [${r.slice(0, 8).join(" | ")}]`)
        .join("\n");
      alert(`找不到含「月份」的表頭列。CSV 前6列內容：\n\n${preview}`);
      throw new Error("找不到含「月份」的表頭列（詳見彈出視窗）");
    }

    const headerRow = rows[headerRowIdx];
    const empNames = headerRow.slice(monthColIdx + 1);

    // 找員工編號列（H欄含「員工編號」）
    let empNoRow = null;
    for (let i = headerRowIdx + 1; i < rows.length; i++) {
      if (normalize(rows[i][monthColIdx] || "").includes("員工編號")) {
        empNoRow = rows[i];
        break;
      }
    }

    // 找當月資料列（H欄數字 = 當月月份）
    const currentMonth = Number(selectedMonth.value.split("-")[1]);
    const dataRow = rows.find(
      (r, i) => i > headerRowIdx && Number(r[monthColIdx]) === currentMonth,
    );
    if (!dataRow) throw new Error(`找不到第 ${currentMonth} 月的資料列`);

    // 建立對照表：員工編號 → 金額（主要）、姓名 → 金額（備用）
    const empNoMap = {};
    const nameMap = {};
    for (let i = 0; i < empNames.length; i++) {
      const amount = Number(dataRow[monthColIdx + 1 + i]) || 0;
      if (amount <= 0) continue;
      const name = (empNames[i] || "").trim();
      const empNo = empNoRow
        ? String(Number(empNoRow[monthColIdx + 1 + i]) || "")
        : "";
      if (empNo) empNoMap[empNo] = amount;
      if (name) nameMap[name] = amount;
    }

    // 更新薪資記錄（優先用員工編號比對，再試姓名）
    let updated = 0;
    for (const record of allRecords.value) {
      const empNoKey = String(record.empNo ?? "").trim();
      const amount = empNoMap[empNoKey] ?? nameMap[(record.name || "").trim()];
      if (amount !== undefined) {
        await updatePayrollLunchFee(record.id, amount);
        record.lunchFee = amount;
        updated++;
      }
    }
    calcMsg.value = `已載入 ${currentMonth} 月便當費，更新 ${updated} 人`;
    calcMsgIsErr.value = false;
    setTimeout(() => {
      calcMsg.value = "";
    }, 5000);
  } catch (e) {
    calcMsg.value = "載入失敗：" + e.message;
    calcMsgIsErr.value = true;
    setTimeout(() => {
      calcMsg.value = "";
    }, 15000);
  } finally {
    importingLunch.value = false;
  }
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
    const raw = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    // Deduplicate by empNo: if same empNo has multiple docs (old empNo_-keyed + new uid-keyed),
    // prefer the uid-based one (id does NOT start with "empNo_").
    const byEmpNo = {};
    for (const r of raw) {
      const key = String(r.empNo ?? r.id);
      if (!byEmpNo[key]) {
        byEmpNo[key] = r;
      } else {
        const existingIsOld =
          byEmpNo[key].id.startsWith("empNo_") || /^\d+_/.test(byEmpNo[key].id);
        const newIsOld = r.id.startsWith("empNo_") || /^\d+_/.test(r.id);
        if (existingIsOld && !newIsOld) {
          byEmpNo[key] = r; // 新格式優先於舊格式
        } else if (!existingIsOld && !newIsOld) {
          // 兩個都是 uid 格式（換帳號後舊/新 uid 各有一筆），保留 updatedAt 較新的
          const existingMs = byEmpNo[key].updatedAt?.toMillis?.() || 0;
          const newMs = r.updatedAt?.toMillis?.() || 0;
          if (newMs > existingMs) byEmpNo[key] = r;
        }
      }
    }
    allRecords.value = Object.values(byEmpNo).sort((a, b) => {
      const aEmpNo = String(a.empNo ?? "").trim();
      const bEmpNo = String(b.empNo ?? "").trim();
      const aNum = Number(aEmpNo);
      const bNum = Number(bEmpNo);
      const bothNumeric = Number.isFinite(aNum) && Number.isFinite(bNum);
      if (bothNumeric) return aNum - bNum;
      return aEmpNo.localeCompare(bEmpNo, "zh-Hant", { numeric: true });
    });
  } finally {
    loading.value = false;
  }
}

async function cleanupDuplicates() {
  const yyyyMM = selectedMonth.value.replace("-", "");
  if (
    !confirm(
      `清除 ${selectedMonth.value} 的重複舊薪資記錄？\n（保留UID格式，刪除empNo格式的舊資料）`,
    )
  )
    return;
  const snap = await getDocs(
    query(collection(db, "payroll"), where("yyyyMM", "==", yyyyMM)),
  );
  const raw = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  // Find empNo that appear more than once
  const empCount = {};
  for (const r of raw) {
    const key = String(r.empNo ?? r.id);
    empCount[key] = (empCount[key] || 0) + 1;
  }
  const toDelete = raw.filter((r) => {
    const key = String(r.empNo ?? r.id);
    return (
      empCount[key] > 1 && (r.id.startsWith("empNo_") || /^\d+_/.test(r.id))
    );
  });
  if (!toDelete.length) {
    alert("沒有找到重複記錄。");
    return;
  }
  for (const r of toDelete) {
    await deleteDoc(doc(db, "payroll", r.id));
  }
  alert(`已刪除 ${toDelete.length} 筆重複舊記錄。`);
  await loadPayroll();
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
  const all = snap.docs.map((d) => ({
    empNo: String(d.data().empNo || d.id),
    name: d.data().name || "",
    status: d.data().status || "",
    endDate:
      d.data().endDate ||
      d.data().leaveDate ||
      d.data().resignDate ||
      d.data().terminationDate ||
      "",
    idNo: d.data().idNo || "",
    address: d.data().address || "",
    spouse: d.data().spouse || "",
    numDependents: d.data().numDependents ?? "",
    bankName: d.data().bankName || "",
    bankAccount: d.data().bankAccount || "",
  }));
  staffBankMap.value = new Map(all.map((s) => [s.empNo, s]));
  allStaffForAnnual.value = all
    .filter((s) => s.name)
    .sort((a, b) => String(a.empNo).localeCompare(String(b.empNo)));
  staffList.value = all
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

// ── Print ─────────────────────────────────────────────────────────────────
function n(v) {
  return (Number(v) || 0).toLocaleString();
}

function buildAttendanceRows(r, mode) {
  const byDate = new Map();
  const add = (date, text) => {
    const d = String(date || "").trim();
    if (!d || !text) return;
    if (!byDate.has(d)) byDate.set(d, []);
    byDate.get(d).push(text);
  };

  const otRows = mode === "first" ? r.otDetailOfficial || [] : r.otDetail || [];
  for (const ot of otRows) {
    add(ot.date, `加班 ${ot.hours || 0}h`);
  }
  for (const me of r.mealDetail || []) {
    add(me.date, `打卡 ${me.punchIn || "--:--"}~${me.punchOut || "--:--"}`);
  }
  for (const le of r.lateEarlyDetail || []) {
    const parts = [];
    if ((le.lateMins || 0) > 0) parts.push(`遲到${le.lateMins}分`);
    if ((le.earlyMins || 0) > 0) parts.push(`早退${le.earlyMins}分`);
    add(le.date, parts.join("/"));
  }
  for (const d of r.absentDetail || []) {
    add(d, "曠職");
  }

  const dates = Array.from(byDate.keys()).sort((a, b) => a.localeCompare(b));
  if (!dates.length) {
    return "<tr><th>—</th><td>本期無出勤明細</td></tr>";
  }
  return dates
    .map((date) => {
      const text = byDate.get(date).filter(Boolean).join("、");
      return `<tr><th>${date}</th><td>${text}</td></tr>`;
    })
    .join("");
}

function printRemittance(mode) {
  const sorted = [...allRecords.value].sort((a, b) => {
    const aNum = Number(a.empNo);
    const bNum = Number(b.empNo);
    if (Number.isFinite(aNum) && Number.isFinite(bNum)) return aNum - bNum;
    return String(a.empNo).localeCompare(String(b.empNo), "zh-Hant", {
      numeric: true,
    });
  });

  const label = mode === "first" ? "5日" : "10日";
  const title = `${selectedMonth.value} ${label}匯款明細`;

  const rows = sorted
    .map((r, i) => {
      const seq = String(i + 1).padStart(6, "0");
      const s = staffBankMap.value.get(String(r.empNo)) || {};
      const bankAccount = s.bankAccount || "—";
      const amount =
        mode === "first" ? r.firstPayment || 0 : r.secondPayment || 0;
      return `<tr>
      <td>${seq}</td>
      <td>${r.empNo || ""}</td>
      <td>${r.name || ""}</td>
      <td>${bankAccount}</td>
      <td class="num">${Number(amount).toLocaleString()}</td>
    </tr>`;
    })
    .join("");

  const total = sorted.reduce(
    (sum, r) =>
      sum +
      Number(mode === "first" ? r.firstPayment || 0 : r.secondPayment || 0),
    0,
  );

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>${title}</title>
<style>
body { font-family: 'Arial', sans-serif; font-size: 12px; margin: 20px; }
h2 { text-align: center; margin-bottom: 12px; }
table { width: 100%; border-collapse: collapse; }
th, td { border: 1px solid #999; padding: 5px 8px; text-align: left; vertical-align: middle; }
th { background: #f0f0f0; white-space: nowrap; }
.num { text-align: right; white-space: nowrap; }
.sub { font-size: 11px; color: #555; }
.total-row td { font-weight: bold; border-top: 2px solid #333; }
@media print { body { margin: 10px; } }
</style></head><body>
<h2>${title}</h2>
<table>
<thead><tr>
  <th>序號</th><th>員工編號</th><th>員工姓名</th>
  <th>收款帳號</th><th>金額</th>
</tr></thead>
<tbody>${rows}</tbody>
<tfoot><tr class="total-row">
  <td colspan="4" class="num">合計</td>
  <td class="num">${Number(total).toLocaleString()}</td>
</tr></tfoot>
</table>
</body></html>`;

  const win = window.open("", "_blank", "width=960,height=820");
  win.document.write(html);
  win.document.close();
  win.focus();
  win.onload = () => {
    win.print();
    win.onafterprint = () => win.close();
  };
}

function printSlip(r, mode) {
  const title =
    mode === "first"
      ? `${r.name}（${r.empNo}）${r.monthLabel} 5日薪資單`
      : `${r.name}（${r.empNo}）${r.monthLabel} 完整薪資單`;

  const deductRow = (label, val) =>
    val > 0
      ? `<tr><th>${label}</th><td class="deduct">−${Number(val).toLocaleString()}</td></tr>`
      : "";

  let bodyRows = "";

  if (mode === "first") {
    const base = calcLaborInsuranceSalaryBase(r);
    const otOffRows = (r.otDetailOfficial || [])
      .map(
        (ot) =>
          `<tr class="sub"><th>${ot.date}（${ot.hours}h）</th><td class="ot">+${n(ot.pay)}</td></tr>`,
      )
      .join("");
    bodyRows = `
      <tr class="sep"><th>投保薪資</th><td>${n(base)}</td></tr>
      ${(r.otPayOfficial || 0) > 0 ? `<tr><th>加班費（申報，${r.otHoursOfficial || 0}h）</th><td class="ot">+${n(r.otPayOfficial)}</td></tr>${otOffRows}` : ""}
      ${deductRow("勞保費", r.laborInsurance)}
      ${deductRow("健保費（本人）", r.healthInsurance)}
      ${deductRow("健保費（眷屬）", r.dependentHealth)}
      ${deductRow("減項互助金", r.mutualAid)}
      ${deductRow("便當費", r.lunchFee)}
      ${deductRow("房租（外勞）", r.foreignRent)}
      ${deductRow("水費", r.waterFee)}
      ${deductRow("電費", r.electricFee)}
      ${deductRow("體檢費（外勞）", r.foreignMedical)}
      ${deductRow("服務費（外勞）", r.foreignService)}
      ${deductRow(r.otherDeductionNote ? `其他減項（${r.otherDeductionNote}）` : "其他減項", r.otherDeduction)}
      ${calcFirstPaymentPartialMonthDeduction(r) > 0 ? `<tr><th>未上班扣薪（${calcPartialMonthNoWorkDays(r)}天）</th><td class="deduct">−${n(calcFirstPaymentPartialMonthDeduction(r))}</td></tr>` : ""}
      ${(r.absentDeduction || 0) > 0 ? `<tr><th>曠職扣薪（${r.absentDays || 0}天）</th><td class="deduct">−${n(r.absentDeduction)}</td></tr>` : ""}
      ${deductRow("借款本金", r.loanPrincipal)}
      ${deductRow("借款利息", r.loanInterest)}
      <tr class="total-row"><th>5日實發</th><td class="gross">${n(r.firstPayment)}</td></tr>
      <tr><th>申報所得（投保薪資-曠職/遲到早退）</th><td class="gross">${n(calcReportedIncome(r))}</td></tr>
    `;
  } else {
    const bonuses = [r.bonus1, r.bonus2, r.bonus3, r.bonus4, r.bonus5]
      .filter((b) => b && b > 0)
      .map(
        (b, i) =>
          `<tr class="sub"><th>獎金(${i + 1})</th><td>+${Number(b).toLocaleString()}</td></tr>`,
      )
      .join("");

    const otRows = (r.otDetail || [])
      .map(
        (ot) =>
          `<tr class="sub"><th>${ot.date}（${ot.hours}h）</th><td class="ot">+${n(ot.pay)}</td></tr>`,
      )
      .join("");

    let lunchTotal = 0;
    let dinnerTotal = 0;
    for (const ml of r.mealDetail || []) {
      const inT =
        String(ml.punchIn).length <= 5
          ? ml.punchIn + ":00"
          : String(ml.punchIn);
      const outT =
        String(ml.punchOut).length <= 5
          ? ml.punchOut + ":00"
          : String(ml.punchOut);
      if (inT < "14:00:00" && outT > "11:00:00") lunchTotal += 100;
      if (inT < "18:30:00" && outT > "17:30:00") dinnerTotal += 100;
    }
    const mealRows =
      (lunchTotal > 0
        ? `<tr class="sub"><th>午餐</th><td class="meal">+${lunchTotal.toLocaleString()}</td></tr>`
        : "") +
      (dinnerTotal > 0
        ? `<tr class="sub"><th>晚餐</th><td class="meal">+${dinnerTotal.toLocaleString()}</td></tr>`
        : "");

    const leaveRows = (r.leaveDetail || [])
      .map((lv) => {
        const unit = lv.unit === "小時" ? `${lv.hours}h` : `${lv.days}天`;
        return `<tr class="sub"><th>${lv.type}（${unit}）</th><td class="deduct">−${n(lv.deduction)}</td></tr>`;
      })
      .join("");

    const lateRows = (r.lateEarlyDetail || [])
      .map((le) => {
        const parts = [];
        if (le.lateMins > 0) parts.push(`遲到${le.lateMins}分`);
        if (le.earlyMins > 0) parts.push(`早退${le.earlyMins}分`);
        return `<tr class="sub"><th>${le.date} ${parts.join("/")}</th><td class="deduct">−${n(le.deduction)}</td></tr>`;
      })
      .join("");

    bodyRows = `
      <tr><th>薪資類型</th><td>${r.salaryType || ""}</td></tr>
      <tr class="sep"><th>底薪</th><td>${n(displayBaseSalary(r))}</td></tr>
      ${r.bonusTotal > 0 ? `<tr><th>固定獎金合計</th><td>+${n(r.bonusTotal)}</td></tr>${bonuses}` : ""}
      ${r.otPay > 0 ? `<tr><th>加班費合計（實際，${r.otHours || 0}h）</th><td class="ot">+${n(r.otPay)}</td></tr>${otRows}` : ""}
      ${r.otPayOfficial != null && r.otPayOfficial !== r.otPay ? `<tr><th>加班費（申報，${r.otHoursOfficial || 0}h）</th><td class="ot">+${n(r.otPayOfficial)}</td></tr>` : ""}
      ${r.mealAllowance > 0 ? `<tr><th>伙食費合計</th><td class="meal">+${n(r.mealAllowance)}</td></tr>${mealRows}` : ""}
      ${r.leaveDeduction > 0 ? `<tr><th>請假扣薪合計</th><td class="deduct">−${n(r.leaveDeduction)}</td></tr>${leaveRows}` : ""}
      ${calcPartialMonthDeduction(r) > 0 ? `<tr><th>未上班扣薪（${calcPartialMonthNoWorkDays(r)}天）</th><td class="deduct">−${n(calcPartialMonthDeduction(r))}</td></tr>` : ""}
      ${r.lateEarlyDeduction > 0 ? `<tr><th>遲到/早退扣薪</th><td class="deduct">−${n(r.lateEarlyDeduction)}</td></tr>${lateRows}` : ""}
      ${r.absentDeduction > 0 ? `<tr><th>曠職扣薪（${r.absentDays}天）</th><td class="deduct">−${n(r.absentDeduction)}</td></tr>` : ""}
      ${deductRow("勞保費", r.laborInsurance)}
      ${deductRow("健保費（本人）", r.healthInsurance)}
      ${deductRow("健保費（眷屬）", r.dependentHealth)}
      ${deductRow("減項互助金", r.mutualAid)}
      ${deductRow("便當費", r.lunchFee)}
      ${deductRow("房租（外勞）", r.foreignRent)}
      ${deductRow("水費", r.waterFee)}
      ${deductRow("電費", r.electricFee)}
      ${deductRow("體檢費（外勞）", r.foreignMedical)}
      ${deductRow("服務費（外勞）", r.foreignService)}
      ${deductRow(r.otherDeductionNote ? `其他減項（${r.otherDeductionNote}）` : "其他減項", r.otherDeduction)}
      ${deductRow("借款本金", r.loanPrincipal)}
      ${deductRow("借款利息", r.loanInterest)}
      <tr class="total-row"><th>實領薪資</th><td class="gross">${n(r.grossPay)}</td></tr>
      <tr class="sep"><th>申報所得（投保薪資-曠職/遲到早退）</th><td class="gross">${n(calcReportedIncome(r))}</td></tr>
      <tr class="sep"><th>5日發薪（投保薪資＋申報加班費）</th><td class="gross">${n(r.firstPayment)}</td></tr>
      <tr><th>10日發薪（補差額）</th><td class="${(r.secondPayment ?? 0) < 0 ? "deduct" : "gross"}">${n(r.secondPayment)}</td></tr>
    `;
  }

  const attendanceRows = buildAttendanceRows(r, mode);

  const html = `<!DOCTYPE html><html lang="zh-Hant"><head>
    <meta charset="UTF-8"><title>${title}</title>
    <style>
      body { font-family: 'Noto Sans TC', Arial, sans-serif; font-size: 13px; margin: 24px; color: #222; }
      h2 { font-size: 1.1rem; margin-bottom: 4px; }
      p.sub { color: #555; margin: 2px 0 14px; font-size: 12px; }
      .slip-layout { display: grid; grid-template-columns: 420px 1fr; gap: 22px; align-items: start; }
      table { width: 100%; border-collapse: collapse; margin-top: 8px; }
      th, td { padding: 5px 8px; border-bottom: 1px solid #ddd; }
      th { text-align: left; white-space: nowrap; padding-right: 2rem; font-weight: 500; color: #444; }
      td { text-align: right; min-width: 80px; }
      .att-wrap { border: 1px solid #d9d9d9; border-radius: 8px; padding: 10px 12px; }
      .att-title { font-weight: 700; margin: 0 0 6px; color: #1f2937; }
      .att-table th, .att-table td { font-size: 12px; padding: 4px 6px; border-bottom: 1px dashed #ddd; }
      .att-table th { width: 118px; padding-right: 8px; }
      .att-table td { text-align: left; min-width: 0; }
      tr.sep th, tr.sep td { border-top: 2px solid #aaa; }
      tr.sub th, tr.sub td { font-size: 11px; color: #888; padding-left: 18px; }
      tr.total-row th, tr.total-row td { border-top: 2px solid #555; font-weight: 700; font-size: 1.05em; }
      .deduct { color: #b71c1c; }
      .gross { color: #1a237e; font-weight: 700; }
      .ot { color: #2e7d32; }
      .meal { color: #e65100; }
      @media print {
        @page { margin: 1.2cm; }
        .slip-layout { grid-template-columns: 53% 47%; gap: 14px; }
      }
    </style>
  </head><body>
    <h2>${title}</h2>
    <p class="sub">列印時間：${new Date().toLocaleString("zh-TW")}</p>
    <div class="slip-layout">
      <table><tbody>${bodyRows}</tbody></table>
      <section class="att-wrap">
        <p class="att-title">出勤記錄</p>
        <table class="att-table"><tbody>${attendanceRows}</tbody></table>
      </section>
    </div>
  </body></html>`;

  const win = window.open("", "_blank", "width=960,height=820");
  win.document.write(html);
  win.document.close();
  win.focus();
  win.onload = () => {
    win.print();
    win.onafterprint = () => win.close();
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────
function bonusList(r) {
  return [r.bonus1, r.bonus2, r.bonus3, r.bonus4, r.bonus5].filter(
    (b) => b && b > 0,
  );
}

function openDetail(r) {
  if (!isSensitiveVisible(r)) return;
  detailRecord.value = r;
}

function mealTotals(r) {
  let lunch = 0,
    dinner = 0;
  for (const ml of r.mealDetail || []) {
    const inT =
      String(ml.punchIn).length <= 5 ? ml.punchIn + ":00" : String(ml.punchIn);
    const outT =
      String(ml.punchOut).length <= 5
        ? ml.punchOut + ":00"
        : String(ml.punchOut);
    if (inT < "14:00:00" && outT > "11:00:00") lunch += 100;
    if (inT < "18:30:00" && outT > "17:30:00") dinner += 100;
  }
  return { lunch, dinner };
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
.reveal-label {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  font-size: 0.92rem;
}
.reveal-select {
  border: 1px solid #ccc;
  border-radius: 6px;
  padding: 0.35rem 0.55rem;
  font-size: 0.9rem;
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
.btn-cleanup {
  background: #c0392b;
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 0.4rem 1rem;
  cursor: pointer;
  font-size: 0.9rem;
  margin-left: 6px;
}
.btn-cleanup:hover {
  background: #96281b;
}
.btn-lunch-import {
  background: #2e7d32;
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 0.4rem 0.85rem;
  cursor: pointer;
  font-size: 0.9rem;
  margin-left: 6px;
}
.btn-lunch-import:hover:not(:disabled) {
  background: #1b5e20;
}
.btn-lunch-import:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.btn-remit-group {
  display: inline-flex;
  align-items: center;
  margin-left: 6px;
  border: 1px solid #1565c0;
  border-radius: 6px;
  overflow: hidden;
}
.btn-remit {
  background: #1565c0;
  color: #fff;
  border: none;
  padding: 0.4rem 0.85rem;
  cursor: pointer;
  font-size: 0.9rem;
}
.btn-remit + .btn-remit {
  border-left: 1px solid #0d47a1;
}
.btn-remit:hover {
  background: #0d47a1;
}
.btn-remit-label {
  background: #e3f2fd;
  color: #1565c0;
  font-size: 0.85rem;
  padding: 0 0.6rem;
  font-weight: 600;
  white-space: nowrap;
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
.payroll-table .lunch-col {
  min-width: 118px;
  white-space: nowrap;
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
.btn-detail:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.lunch-input {
  display: block;
  width: 100%;
  min-width: 96px;
  max-width: 118px;
  margin-left: auto;
  box-sizing: border-box;
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
  gap: 0.5rem;
  flex-wrap: wrap;
}
.btn-print {
  background: #e8f5e9;
  border-color: #a5d6a7;
  color: #1b5e20;
}
.btn-sm {
  padding: 0.3rem 0.8rem;
  border: 1px solid #bbb;
  border-radius: 6px;
  background: #fff;
  cursor: pointer;
  font-size: 0.85rem;
}

/* 年度報表 */
.btn-annual {
  background: #6a1b9a;
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 0.4rem 0.85rem;
  cursor: pointer;
  font-size: 0.9rem;
  margin-left: 6px;
}
.btn-annual:hover {
  background: #4a148c;
}
.modal-box-wide {
  max-width: 95vw;
  width: 1100px;
  max-height: 90vh;
  overflow: auto;
}
.annual-form {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 0.8rem;
  margin-bottom: 0.8rem;
}
.af-item {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.88rem;
  color: #444;
}
.annual-year-input {
  width: 90px;
  border: 1px solid #ccc;
  border-radius: 4px;
  padding: 0.3rem 0.5rem;
  font-size: 0.9rem;
}
.annual-emp-select {
  min-width: 200px;
  border: 1px solid #ccc;
  border-radius: 4px;
  padding: 0.3rem 0.5rem;
  font-size: 0.9rem;
}
.annual-cols {
  border: 1px solid #dde;
  border-radius: 6px;
  padding: 0.5rem 0.8rem 0.6rem;
  margin-bottom: 0.8rem;
}
.annual-cols legend {
  font-size: 0.85rem;
  color: #555;
  padding: 0 0.4rem;
}
.annual-col-item {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.85rem;
  margin: 0.15rem 0.9rem 0.15rem 0;
  cursor: pointer;
}
.annual-col-item .req-tag {
  color: #c62828;
  font-size: 0.75rem;
}
.annual-hint {
  color: #888;
  padding: 1rem 0;
  font-size: 0.9rem;
}
.annual-summary {
  font-size: 0.95rem;
  color: #333;
  margin: 0.4rem 0;
}
.annual-table-wrap {
  overflow-x: auto;
  border: 1px solid #dde;
  border-radius: 6px;
}
.annual-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}
.annual-table th,
.annual-table td {
  padding: 0.35rem 0.55rem;
  border: 1px solid #e6e6ef;
  text-align: left;
  white-space: nowrap;
}
.annual-table thead th {
  background: #f0f4ff;
  font-weight: 600;
  position: sticky;
  top: 0;
}
.annual-table td.num,
.annual-table th.num {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.annual-table tr.annual-empty td {
  color: #c0c0c8;
  background: #fafafa;
}
.annual-table tr.annual-total th,
.annual-table tr.annual-total td {
  background: #fff7d6;
  font-weight: 700;
}
</style>
