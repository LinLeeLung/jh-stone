<template>
  <div class="leave-wrap">
    <h2 class="page-title">{{ t("leave_title") }}</h2>

    <!-- Tab nav -->
    <div class="tab-nav">
      <button
        :class="['tab-btn', { active: tab === 'leave' }]"
        @click="tab = 'leave'"
      >
        {{ t("tab_leave") }}
      </button>
      <button
        :class="['tab-btn', { active: tab === 'ot' }]"
        @click="tab = 'ot'"
      >
        {{ t("tab_ot") }}
      </button>
      <button
        :class="['tab-btn', { active: tab === 'mine' }]"
        @click="switchMine"
      >
        {{ t("tab_mine") }}
      </button>
      <button
        v-if="isApprover"
        :class="['tab-btn', { active: tab === 'approve' }]"
        @click="switchApprove"
      >
        {{ t("tab_approve") }}
      </button>
      <button
        v-if="isManager"
        :class="['tab-btn', { active: tab === 'quota' }]"
        @click="switchQuota"
      >
        {{ t("tab_quota") }}
      </button>
      <button
        v-if="isManager"
        :class="['tab-btn', { active: tab === 'otreport' }]"
        @click="switchOTReport"
      >
        加班申報
      </button>
    </div>

    <!-- ─── 申請假單 ────────────────────────────────── -->
    <div v-if="tab === 'leave'" class="tab-content">
      <h3>{{ t("tab_leave") }}</h3>

      <div v-if="myQuota" class="quota-bar">
        <span v-for="(v, k) in QUOTA_TYPES" :key="k" class="quota-item">
          {{ v.label }}：{{ t("quota_remain") }} <b>{{ quotaRemain(k) }}</b> /
          {{ myQuota[k]?.total ?? 0 }} 天
        </span>
      </div>

      <form @submit.prevent="submitLeave" class="req-form">
        <div class="field-row">
          <label>{{ t("leave_type") }}</label>
          <select v-model="lf.type" required>
            <option v-for="ltype in LEAVE_TYPES" :key="ltype" :value="ltype">
              {{ tLeaveType(ltype) }}
            </option>
          </select>
        </div>
        <div class="field-row">
          <label>{{ t("leave_unit") }}</label>
          <label class="radio-label"
            ><input type="radio" v-model="lf.unit" value="天" />{{
              t("leave_unit_day")
            }}</label
          >
          <label class="radio-label"
            ><input type="radio" v-model="lf.unit" value="小時" />{{
              t("leave_unit_hour")
            }}</label
          >
        </div>
        <div class="field-row">
          <label>{{
            lf.unit === "小時" ? t("leave_date") : t("leave_start")
          }}</label>
          <input type="date" v-model="lf.startDate" required />
        </div>
        <div class="field-row" v-if="lf.unit === '天'">
          <label>{{ t("leave_end") }}</label>
          <input type="date" v-model="lf.endDate" required />
        </div>
        <template v-if="lf.unit === '小時'">
          <div class="field-row">
            <label>{{ t("leave_start_time") }}</label>
            <input type="time" v-model="lf.startTime" required />
          </div>
          <div class="field-row">
            <label>{{ t("leave_end_time") }}</label>
            <input type="time" v-model="lf.endTime" required />
          </div>
        </template>
        <div
          class="field-row"
          v-if="
            lf.unit === '天' &&
            lf.startDate &&
            lf.endDate &&
            lf.startDate === lf.endDate
          "
        >
          <label>{{ t("leave_half") }}</label>
          <label class="radio-label"
            ><input type="radio" v-model="lf.halfDay" value="" />{{
              t("leave_half_full")
            }}</label
          >
          <label class="radio-label"
            ><input type="radio" v-model="lf.halfDay" value="AM" />{{
              t("leave_half_am")
            }}</label
          >
          <label class="radio-label"
            ><input type="radio" v-model="lf.halfDay" value="PM" />{{
              t("leave_half_pm")
            }}</label
          >
        </div>
        <div class="field-row">
          <label>{{
            lf.unit === "小時" ? t("leave_hours") : t("leave_days")
          }}</label>
          <span class="days-display">{{
            lf.unit === "小時"
              ? lf.hours + " " + t("leave_unit_hour")
              : lf.days + " " + t("leave_unit_day")
          }}</span>
        </div>
        <div class="field-row">
          <label>{{ t("leave_reason") }}</label>
          <textarea
            v-model="lf.reason"
            rows="2"
            :placeholder="t('leave_reason_ph')"
          ></textarea>
        </div>
        <div
          v-if="DOC_REQUIRED.includes(lf.type)"
          class="field-row doc-upload-row"
        >
          <label
            >{{ t("leave_doc")
            }}<span class="doc-req-hint">{{ t("leave_doc_req") }}</span></label
          >
          <div class="doc-upload-area">
            <input
              ref="docFileInput"
              type="file"
              accept="image/*,.pdf"
              style="display: none"
              @change="onDocFileChange"
            />
            <button type="button" class="btn-aux" @click="docFileInput.click()">
              {{ t("leave_doc_btn") }}
            </button>
            <span v-if="docFile" class="doc-filename">{{ docFile.name }}</span>
            <button
              v-if="docFile"
              type="button"
              class="btn-sm btn-danger"
              @click="clearDocFile"
            >
              ✕
            </button>
            <a
              v-if="docPreviewUrl && docFile?.type?.startsWith('image')"
              :href="docPreviewUrl"
              target="_blank"
              class="doc-preview-link"
              >{{ t("leave_doc_preview") }}</a
            >
          </div>
        </div>
        <div class="field-actions">
          <button type="submit" class="btn-primary" :disabled="submittingLeave">
            {{ submittingLeave ? t("leave_submitting") : t("leave_submit") }}
          </button>
        </div>
        <p v-if="leaveMsg" :class="['msg', { error: leaveMsgIsErr }]">
          {{ leaveMsg }}
        </p>
      </form>
    </div>

    <!-- ─── 申請加班 ────────────────────────────────── -->
    <div v-if="tab === 'ot'" class="tab-content">
      <h3>{{ t("tab_ot") }}</h3>
      <form @submit.prevent="submitOT" class="req-form">
        <div class="field-row">
          <label>{{ t("ot_date") }}</label>
          <input type="date" v-model="otf.date" required />
        </div>
        <div class="field-row">
          <label>{{ t("ot_start") }}</label>
          <input type="time" v-model="otf.startTime" required />
        </div>
        <div class="field-row">
          <label>{{ t("ot_end") }}</label>
          <input type="time" v-model="otf.endTime" required />
        </div>
        <div class="field-row">
          <label>{{ t("ot_hours") }}</label>
          <span class="days-display">{{ otf.hours }} {{ t("hr_unit") }}</span>
        </div>
        <div class="field-row">
          <label>{{ t("ot_reason") }}</label>
          <textarea
            v-model="otf.reason"
            rows="2"
            :placeholder="t('ot_reason_ph')"
          ></textarea>
        </div>
        <div class="field-actions">
          <button type="submit" class="btn-primary" :disabled="submittingOT">
            {{ submittingOT ? t("ot_submitting") : t("ot_submit") }}
          </button>
        </div>
        <p v-if="otMsg" :class="['msg', { error: otMsgIsErr }]">{{ otMsg }}</p>
      </form>
    </div>

    <!-- ─── 我的紀錄 ────────────────────────────────── -->
    <div v-if="tab === 'mine'" class="tab-content">
      <h3>{{ t("tab_mine") }}</h3>
      <div class="filter-bar">
        <label
          >{{ t("mine_filter_type") }}
          <select v-model="mineFilter">
            <option value="all">{{ t("mine_all") }}</option>
            <option value="leave">{{ t("mine_leave") }}</option>
            <option value="ot">{{ t("mine_ot") }}</option>
          </select>
        </label>
        <label
          >{{ t("mine_filter_status") }}
          <select v-model="mineStatus">
            <option value="all">{{ t("mine_all") }}</option>
            <option value="pending">{{ t("status_pending") }}</option>
            <option value="approved1">{{ t("status_approved1") }}</option>
            <option value="approved2">{{ t("status_approved2") }}</option>
            <option value="rejected">{{ t("status_rejected") }}</option>
          </select>
        </label>
      </div>
      <p v-if="loadingMine" class="loading">{{ t("loading") }}</p>
      <table v-else class="rec-table">
        <thead>
          <tr>
            <th>{{ t("col_type") }}</th>
            <th>{{ t("col_reason") }}</th>
            <th>{{ t("col_datetime") }}</th>
            <th>{{ t("col_duration") }}</th>
            <th>{{ t("col_status") }}</th>
            <th>{{ t("col_action") }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in filteredMine" :key="r.id + r._col">
            <td>
              {{ r._col === "leaveRequests" ? t("mine_leave") : t("mine_ot") }}
            </td>
            <td>
              {{
                r._col === "leaveRequests"
                  ? tLeaveType(r.type)
                  : t("ot_record_label")
              }}
            </td>
            <td>
              {{
                r._col === "leaveRequests"
                  ? r.unit === "小時"
                    ? `${r.startDate} ${r.startTime}–${r.endTime}`
                    : `${r.startDate}${r.startDate !== r.endDate ? " ~ " + r.endDate : ""}${r.halfDay ? "（" + r.halfDay + "）" : ""}`
                  : `${r.date}  ${r.startTime}–${r.endTime}`
              }}
            </td>
            <td>
              {{
                r._col === "leaveRequests"
                  ? r.unit === "小時"
                    ? r.hours + " " + t("hr_unit")
                    : r.days + " " + t("leave_unit_day")
                  : r.hours + " " + t("hr_unit")
              }}
            </td>
            <td>
              <span :class="['status-badge', statusClass(r.status)]">{{
                statusLabel(r.status)
              }}</span>
            </td>
            <td>
              <button
                v-if="r.status === 'pending'"
                class="btn-sm btn-danger"
                @click="cancelRequest(r)"
              >
                {{ t("cancel") }}
              </button>
              <span
                v-if="r.status === 'rejected' && r.rejectReason"
                class="reject-hint"
                :title="t('reject_reason') + r.rejectReason"
                >⚠ {{ r.rejectReason }}</span
              >
            </td>
          </tr>
          <tr v-if="!filteredMine.length">
            <td colspan="6" class="empty">{{ t("mine_empty") }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- ─── 審核作業 ────────────────────────────────── -->
    <div v-if="tab === 'approve' && isApprover" class="tab-content">
      <h3>{{ t("approve_title") }}</h3>
      <div class="approve-tabs">
        <button
          :class="['tab-btn-sm', { active: approveSubTab === 'leave' }]"
          @click="approveSubTab = 'leave'"
        >
          {{ t("approve_leave") }}
        </button>
        <button
          :class="['tab-btn-sm', { active: approveSubTab === 'ot' }]"
          @click="approveSubTab = 'ot'"
        >
          {{ t("approve_ot") }}
        </button>
        <button
          :class="['tab-btn-sm', { active: approveSubTab === 'approved' }]"
          @click="switchApproved"
        >
          {{ t("approved_records") }}
        </button>
      </div>

      <p v-if="loadingPending" class="loading">{{ t("loading") }}</p>
      <template v-else>
        <!-- Stage 1 -->
        <h4>{{ t("pending_stage1") }}</h4>
        <table class="rec-table">
          <thead>
            <tr>
              <th>{{ t("col_employee") }}</th>
              <template v-if="approveSubTab === 'leave'">
                <th>{{ t("col_dept") }}</th>
                <th>{{ t("col_leave_type") }}</th>
                <th>{{ t("col_date") }}</th>
                <th>{{ t("col_days") }}</th>
              </template>
              <template v-else>
                <th>{{ t("col_dept") }}</th>
                <th>{{ t("col_ot_date") }}</th>
                <th>{{ t("col_time") }}</th>
                <th>{{ t("col_hours") }}</th>
              </template>
              <th>{{ t("leave_reason") }}</th>
              <th>{{ t("col_attach") }}</th>
              <th>{{ t("col_actions") }}</th>
            </tr>
          </thead>
          <tbody>
            <template v-if="approveSubTab === 'leave'">
              <tr v-for="r in pendingLeave1" :key="r.id">
                <td>{{ r.name }}</td>
                <td>{{ deptLabel(r.dept) }}</td>
                <td>{{ r.type }}</td>
                <td>
                  {{
                    r.unit === "小時"
                      ? `${r.startDate} ${r.startTime}–${r.endTime}`
                      : `${r.startDate}${r.startDate !== r.endDate ? " ~ " + r.endDate : ""}`
                  }}
                </td>
                <td>
                  {{
                    r.unit === "小時"
                      ? r.hours + " 小時"
                      : r.days +
                        " 天" +
                        (r.halfDay ? "（" + r.halfDay + "）" : "")
                  }}
                </td>
                <td>{{ r.reason || "—" }}</td>
                <td>
                  <a
                    v-if="r.docUrl"
                    :href="r.docUrl"
                    target="_blank"
                    class="doc-view-link"
                    >{{ t("view_attach") }}</a
                  >
                  <span v-else class="doc-none">—</span>
                </td>
                <td class="action-cell">
                  <button class="btn-sm btn-ok" @click="approveLeave(r, 1)">
                    {{ t("btn_approve") }}
                  </button>
                  <button
                    class="btn-sm btn-danger"
                    @click="openReject(r, 'leave', 1)"
                  >
                    {{ t("btn_reject") }}
                  </button>
                </td>
              </tr>
              <tr v-if="!pendingLeave1.length">
                <td colspan="9" class="empty">{{ t("empty_leave") }}</td>
              </tr>
            </template>
            <template v-else>
              <tr v-for="r in pendingOT1" :key="r.id">
                <td>{{ r.name }}</td>
                <td>{{ deptLabel(r.dept) }}</td>
                <td>{{ r.date }}</td>
                <td>{{ r.startTime }} – {{ r.endTime }}</td>
                <td>{{ r.hours }} 時</td>
                <td>{{ r.reason || "—" }}</td>
                <td class="action-cell">
                  <button class="btn-sm btn-ok" @click="approveOT(r, 1)">
                    {{ t("btn_approve") }}
                  </button>
                  <button
                    class="btn-sm btn-danger"
                    @click="openReject(r, 'ot', 1)"
                  >
                    {{ t("btn_reject") }}
                  </button>
                </td>
              </tr>
              <tr v-if="!pendingOT1.length">
                <td colspan="8" class="empty">{{ t("empty_ot") }}</td>
              </tr>
            </template>
          </tbody>
        </table>

        <!-- Stage 2 -->
        <h4 style="margin-top: 24px">{{ t("pending_stage2") }}</h4>
        <table class="rec-table">
          <thead>
            <tr>
              <th>{{ t("col_employee") }}</th>
              <template v-if="approveSubTab === 'leave'">
                <th>{{ t("col_dept") }}</th>
                <th>{{ t("col_leave_type") }}</th>
                <th>{{ t("col_date") }}</th>
                <th>{{ t("col_days") }}</th>
              </template>
              <template v-else>
                <th>{{ t("col_dept") }}</th>
                <th>{{ t("col_ot_date") }}</th>
                <th>{{ t("col_time") }}</th>
                <th>{{ t("col_hours") }}</th>
              </template>
              <th>{{ t("leave_reason") }}</th>
              <th>{{ t("col_attach") }}</th>
              <th>{{ t("col_reviewer1") }}</th>
              <th>{{ t("col_actions") }}</th>
            </tr>
          </thead>
          <tbody>
            <template v-if="approveSubTab === 'leave'">
              <tr v-for="r in pendingLeave2" :key="r.id">
                <td>{{ r.name }}</td>
                <td>{{ deptLabel(r.dept) }}</td>
                <td>{{ r.type }}</td>
                <td>
                  {{
                    r.unit === "小時"
                      ? `${r.startDate} ${r.startTime}–${r.endTime}`
                      : `${r.startDate}${r.startDate !== r.endDate ? " ~ " + r.endDate : ""}`
                  }}
                </td>
                <td>
                  {{
                    r.unit === "小時"
                      ? r.hours + " 小時"
                      : r.days +
                        " 天" +
                        (r.halfDay ? "（" + r.halfDay + "）" : "")
                  }}
                </td>
                <td>{{ r.reason || "—" }}</td>
                <td>
                  <a
                    v-if="r.docUrl"
                    :href="r.docUrl"
                    target="_blank"
                    class="doc-view-link"
                    >{{ t("view_attach") }}</a
                  >
                  <span v-else class="doc-none">—</span>
                </td>
                <td>{{ r.reviewer1Name || "—" }}</td>
                <td class="action-cell">
                  <button class="btn-sm btn-ok" @click="approveLeave(r, 2)">
                    {{ t("btn_approve") }}
                  </button>
                  <button
                    class="btn-sm btn-danger"
                    @click="openReject(r, 'leave', 2)"
                  >
                    {{ t("btn_reject") }}
                  </button>
                </td>
              </tr>
              <tr v-if="!pendingLeave2.length">
                <td colspan="9" class="empty">{{ t("empty_leave") }}</td>
              </tr>
            </template>
            <template v-else>
              <tr v-for="r in pendingOT2" :key="r.id">
                <td>{{ r.name }}</td>
                <td>{{ deptLabel(r.dept) }}</td>
                <td>{{ r.date }}</td>
                <td>{{ r.startTime }} – {{ r.endTime }}</td>
                <td>{{ r.hours }} 時</td>
                <td>{{ r.reason || "—" }}</td>
                <td>{{ r.reviewer1Name || "—" }}</td>
                <td class="action-cell">
                  <button class="btn-sm btn-ok" @click="approveOT(r, 2)">
                    {{ t("btn_approve") }}
                  </button>
                  <button
                    class="btn-sm btn-danger"
                    @click="openReject(r, 'ot', 2)"
                  >
                    {{ t("btn_reject") }}
                  </button>
                </td>
              </tr>
              <tr v-if="!pendingOT2.length">
                <td colspan="8" class="empty">{{ t("empty_ot") }}</td>
              </tr>
            </template>
          </tbody>
        </table>
      </template>

      <!-- 已批准記錄 -->
      <template v-if="approveSubTab === 'approved'">
        <div style="display:flex; align-items:center; gap:10px; margin-bottom:14px; flex-wrap:wrap">
          <label style="font-weight:500">{{ t("month_label") }}</label>
          <input type="month" v-model="approvedMonth"
            style="padding:4px 8px; border:1px solid #ccc; border-radius:5px" />
          <button class="btn-sm btn-ok" @click="loadMyApproved">{{ t("btn_query") }}</button>
          <span v-if="loadingApproved" class="muted-text" style="font-size:.85rem">{{ t("loading") }}</span>
        </div>

        <h4>{{ t("approved_leave_count")(approvedLeaveByMe.length) }}</h4>
        <table class="rec-table">
          <thead>
            <tr>
              <th>{{ t("col_employee") }}</th><th>{{ t("col_leave_type") }}</th><th>{{ t("col_date") }}</th><th>{{ t("col_days") }}/{{ t("col_hours") }}</th>
              <th>{{ t("col_status") }}</th><th>{{ t("col_my_role") }}</th><th>{{ t("col_approved_at") }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in approvedLeaveByMe" :key="r.id">
              <td>{{ r.name }}</td>
              <td>{{ r.type }}</td>
              <td>{{ r.startDate }}{{ r.startDate !== r.endDate ? ' ~ ' + r.endDate : '' }}</td>
              <td>{{ r.unit === '小時' ? (r.hours + ' ' + t("hr_unit")) : (r.days + ' ' + t("leave_unit_day")) }}</td>
              <td><span :class="['status-badge', statusClass(r.status)]">{{ statusLabel(r.status) }}</span></td>
              <td>{{ r.reviewer1Uid === currentUser.uid ? t("role_stage1") : t("role_stage2") }}</td>
              <td>{{ fmtTs(r.reviewer1Uid === currentUser.uid ? r.reviewedAt1 : r.reviewedAt2) }}</td>
            </tr>
            <tr v-if="!approvedLeaveByMe.length">
              <td colspan="7" class="empty">{{ loadingApproved ? t("loading") : t("empty_approved_leave") }}</td>
            </tr>
          </tbody>
        </table>

        <h4 style="margin-top:24px">{{ t("approved_ot_count")(approvedOTByMe.length) }}</h4>
        <table class="rec-table">
          <thead>
            <tr>
              <th>{{ t("col_employee") }}</th><th>{{ t("col_ot_date") }}</th><th>{{ t("col_time") }}</th><th>{{ t("col_hours") }}</th>
              <th>{{ t("col_status") }}</th><th>{{ t("col_my_role") }}</th><th>{{ t("col_approved_at") }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in approvedOTByMe" :key="r.id">
              <td>{{ r.name }}</td>
              <td>{{ r.date }}</td>
              <td>{{ r.startTime }} – {{ r.endTime }}</td>
              <td>{{ r.hours }} {{ t("hr_unit") }}</td>
              <td><span :class="['status-badge', statusClass(r.status)]">{{ statusLabel(r.status) }}</span></td>
              <td>{{ r.reviewer1Uid === currentUser.uid ? t("role_stage1") : t("role_stage2") }}</td>
              <td>{{ fmtTs(r.reviewer1Uid === currentUser.uid ? r.reviewedAt1 : r.reviewedAt2) }}</td>
            </tr>
            <tr v-if="!approvedOTByMe.length">
              <td colspan="7" class="empty">{{ loadingApproved ? t("loading") : t("empty_approved_ot") }}</td>
            </tr>
          </tbody>
        </table>
      </template>
    </div>

    <!-- ─── 假別配額 ────────────────────────────────── -->
    <div v-if="tab === 'quota' && isManager" class="tab-content">
      <h3>假別配額管理</h3>
      <p class="hint">
        設定每位員工的年度請假配額（天數）。假單最終核准時自動扣除已用天數。
      </p>
      <p v-if="loadingQuota" class="loading">載入中…</p>
      <table v-else class="rec-table quota-table">
        <thead>
          <tr>
            <th>員工</th>
            <th v-for="(v, k) in QUOTA_TYPES" :key="k">{{ v.label }}（天）</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="q in quotaList" :key="q.uid">
            <td>{{ q.name }}</td>
            <td v-for="(v, k) in QUOTA_TYPES" :key="k">
              <input
                type="number"
                min="0"
                v-model.number="q[k].total"
                class="quota-input"
              />
              <small>（已用 {{ q[k]?.used ?? 0 }}）</small>
            </td>
            <td>
              <button class="btn-sm btn-ok" @click="saveQuota(q)">儲存</button>
            </td>
          </tr>
          <tr v-if="!quotaList.length">
            <td :colspan="2 + Object.keys(QUOTA_TYPES).length" class="empty">
              尚無配額資料，請點「為所有員工建立配額」
            </td>
          </tr>
        </tbody>
      </table>
      <div style="margin-top: 12px; display: flex; gap: 8px; flex-wrap: wrap">
        <button class="btn-aux" @click="initQuotaForAll">
          為所有員工建立配額
        </button>
        <button class="btn-aux" @click="recalcAnnualLeave">
          依年資重算特休
        </button>
      </div>
    </div>

    <!-- ─── 加班申報（官方時數） ──────────────────────── -->
    <div v-if="tab === 'otreport' && isManager" class="tab-content">
      <h3>加班申報時數管理</h3>
      <p class="hint">
        設定每筆已核准加班的「申報時數」（供5日薪資單及勞動局申報用，每月合計上限46小時）。不填則沿用實際時數。
      </p>
      <div class="filter-bar" style="margin-bottom: 12px">
        <label
          >月份
          <input type="month" v-model="otReportMonth" @change="loadOTReport" />
        </label>
      </div>
      <div
        v-if="otReportByPerson.length"
        style="margin-bottom: 10px; display: flex; flex-wrap: wrap; gap: 8px"
      >
        <span
          v-for="p in otReportByPerson"
          :key="p.name"
          :style="
            p.official > 46 ? 'color:#b71c1c;font-weight:700' : 'color:#555'
          "
          style="
            font-size: 13px;
            padding: 2px 10px;
            border: 1px solid #ddd;
            border-radius: 4px;
          "
        >
          {{ p.name }}：實際 {{ p.actual }}h ／ 申報 {{ p.official }}h
          <span v-if="p.official > 46"> ⚠ 超過46h</span>
        </span>
      </div>
      <p v-if="loadingOTReport" class="loading">載入中…</p>
      <table v-else class="rec-table">
        <thead>
          <tr>
            <th>員工</th>
            <th>部門</th>
            <th>加班日</th>
            <th>時間</th>
            <th>實際時數</th>
            <th>申報時數</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in otReportList" :key="r.id">
            <td>{{ r.name }}</td>
            <td>{{ deptLabel(r.dept) }}</td>
            <td>{{ r.date }}</td>
            <td>{{ r.startTime }} – {{ r.endTime }}</td>
            <td>{{ r.hours }} h</td>
            <td>
              <input
                type="number"
                min="0"
                :max="r.hours"
                step="0.5"
                v-model.number="r._officialHours"
                class="quota-input"
                style="width: 70px"
              />
            </td>
            <td>
              <button class="btn-sm btn-ok" @click="saveOfficialHours(r)">
                儲存
              </button>
            </td>
          </tr>
          <tr v-if="!otReportList.length">
            <td colspan="7" class="empty">該月無已核准加班記錄</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- ─── 拒絕 Dialog ─────────────────────────────── -->
    <div
      v-if="rejectDialog.show"
      class="dialog-backdrop"
      @click.self="rejectDialog.show = false"
    >
      <div class="dialog">
        <h4>拒絕申請</h4>
        <textarea
          v-model="rejectDialog.reason"
          rows="3"
          placeholder="拒絕原因（可選，員工可見）"
          class="reject-textarea"
        ></textarea>
        <div class="dialog-actions">
          <button class="btn-danger" @click="confirmReject">確認拒絕</button>
          <button class="btn-aux" @click="rejectDialog.show = false">
            取消
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, reactive, onMounted, watch } from "vue";
import {
  collection,
  addDoc,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  serverTimestamp,
} from "firebase/firestore";
import { db, auth, authReadyPromise, storage } from "../firebase";
import {
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
} from "firebase/storage";
import { t, tLeaveType } from "../locale";
import { useRoute } from "vue-router";

const route = useRoute();

// ── Constants ──────────────────────────────────────────────────────────────
const DOC_REQUIRED = ["病假", "喪假", "公假"];
const LEAVE_TYPES = [
  "事假",
  "病假",
  "生理假",
  "無薪假",
  "特休",
  "婚假",
  "喪假",
  "產假",
  "公假",
];

const QUOTA_TYPES = {
  personal: { label: "事假" },
  sick: { label: "病假" },
  annual: { label: "特休" },
  maternity: { label: "產假" },
  menstrual: { label: "生理假" },
};

// Map leave type → quota key (only tracked types)
const QUOTA_KEY = {
  事假: "personal",
  病假: "sick",
  "年假（特休）": "annual",
  特休: "annual",
  產假: "maternity",
  生理假: "menstrual",
};

// ── Auth & user state ──────────────────────────────────────────────────────
const currentUser = ref(null);
const userRole = ref(null);
const myEmpNo = ref("");
const myName = ref("");
const myDept = ref("");
const myStaffRole = ref(""); // 員工 / 主管 / HR
const deptMap = { "1": "辦公室", "2": "安裝", "3": "廠內", "4": "外勞" };
function deptLabel(v) { return deptMap[String(v)] || v || "—"; }
const myQuota = ref(null);

const isManager = computed(
  () => userRole.value === "admin" || userRole.value === "管理者",
);
// 主管 or HR (from staff collection) or admin/管理者 (from Users)
const isApprover = computed(
  () =>
    isManager.value ||
    myStaffRole.value === "主管" ||
    myStaffRole.value === "HR",
);
// 部門主管：只能審核同部門（stage 1）
const isDeptHead = computed(
  () => myStaffRole.value === "主管" && !isManager.value,
);
// HR：負責第二關審核
const isHRRole = computed(() => myStaffRole.value === "HR" || isManager.value);

// ── Leave form ─────────────────────────────────────────────────────────────
const lf = reactive({
  type: "事假",
  unit: "天",
  startDate: "",
  endDate: "",
  halfDay: "",
  days: 0,
  hours: 0,
  startTime: "",
  endTime: "",
  reason: "",
});
const submittingLeave = ref(false);
const leaveMsg = ref("");
const leaveMsgIsErr = ref(false);
const docFile = ref(null);
const docPreviewUrl = ref("");
const docFileInput = ref(null);
function onDocFileChange(e) {
  const f = e.target.files?.[0];
  if (!f) return;
  docFile.value = f;
  docPreviewUrl.value = URL.createObjectURL(f);
}
function clearDocFile() {
  docFile.value = null;
  docPreviewUrl.value = "";
  if (docFileInput.value) docFileInput.value.value = "";
}

watch(
  [
    () => lf.unit,
    () => lf.startDate,
    () => lf.endDate,
    () => lf.halfDay,
    () => lf.startTime,
    () => lf.endTime,
  ],
  () => {
    if (lf.unit === "小時") {
      if (!lf.startTime || !lf.endTime) {
        lf.hours = 0;
        lf.days = 0;
        return;
      }
      const [sh, sm] = lf.startTime.split(":").map(Number);
      const [eh, em] = lf.endTime.split(":").map(Number);
      const minutes = eh * 60 + em - (sh * 60 + sm);
      lf.hours = minutes > 0 ? Math.round((minutes / 60) * 10) / 10 : 0;
      lf.days = Math.round((lf.hours / 8) * 100) / 100;
      return;
    }
    // Day-based
    if (!lf.startDate || !lf.endDate) {
      lf.days = 0;
      return;
    }
    const s = new Date(lf.startDate),
      e = new Date(lf.endDate);
    if (e < s) {
      lf.days = 0;
      return;
    }
    const d = Math.round((e - s) / 86400000) + 1;
    if (lf.startDate !== lf.endDate) lf.halfDay = "";
    lf.days = lf.halfDay ? 0.5 : d;
  },
);

// ── OT form ────────────────────────────────────────────────────────────────
const otf = reactive({
  date: "",
  startTime: "",
  endTime: "",
  hours: 0,
  reason: "",
});
const submittingOT = ref(false);
const otMsg = ref("");
const otMsgIsErr = ref(false);

watch([() => otf.startTime, () => otf.endTime], () => {
  if (!otf.startTime || !otf.endTime) {
    otf.hours = 0;
    return;
  }
  const [sh, sm] = otf.startTime.split(":").map(Number);
  const [eh, em] = otf.endTime.split(":").map(Number);
  const minutes = eh * 60 + em - (sh * 60 + sm);
  otf.hours = minutes > 0 ? Math.round((minutes / 60) * 10) / 10 : 0;
});

// ── My records ─────────────────────────────────────────────────────────────
const myLeaveRecs = ref([]);
const myOTRecs = ref([]);
const loadingMine = ref(false);
const mineFilter = ref("all");
const mineStatus = ref("all");
const tab = ref("leave");

const filteredMine = computed(() => {
  let all = [];
  if (mineFilter.value !== "ot")
    all = myLeaveRecs.value.map((r) => ({ ...r, _col: "leaveRequests" }));
  if (mineFilter.value !== "leave")
    all = [
      ...all,
      ...myOTRecs.value.map((r) => ({ ...r, _col: "overtimeRequests" })),
    ];
  if (mineStatus.value !== "all")
    all = all.filter((r) => r.status === mineStatus.value);
  return all.sort(
    (a, b) =>
      (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0),
  );
});

// ── Approval ───────────────────────────────────────────────────────────────
const approveSubTab = ref("leave");
const loadingPending = ref(false);
const pendingLeave1 = ref([]);
const pendingLeave2 = ref([]);
const pendingOT1 = ref([]);
const pendingOT2 = ref([]);
const approvedLeaveByMe = ref([]);
const approvedOTByMe = ref([]);
const loadingApproved = ref(false);
const _nowA = new Date();
const approvedMonth = ref(
  `${_nowA.getFullYear()}-${String(_nowA.getMonth() + 1).padStart(2, "0")}`,
);

// ── Reject dialog ──────────────────────────────────────────────────────────
const rejectDialog = reactive({
  show: false,
  record: null,
  col: "",
  stage: 0,
  reason: "",
});

// ── Quota ──────────────────────────────────────────────────────────────────
const loadingQuota = ref(false);
const quotaList = ref([]);

// ── OT Report (official hours) ─────────────────────────────────────────────
const loadingOTReport = ref(false);
const _now = new Date();
const otReportMonth = ref(
  `${_now.getFullYear()}-${String(_now.getMonth() + 1).padStart(2, "0")}`,
);
const otReportList = ref([]);
// 按員工分組統計（46h 上限每人各自計算）
const otReportByPerson = computed(() => {
  const map = {};
  for (const r of otReportList.value) {
    const key = r.uid || r.name;
    if (!map[key]) map[key] = { name: r.name, actual: 0, official: 0 };
    map[key].actual += Number(r.hours) || 0;
    map[key].official += Number(r._officialHours) || 0;
  }
  return Object.values(map);
});

// ── Helpers ────────────────────────────────────────────────────────────────
function statusLabel(s) {
  return (
    {
      pending: t("status_pending"),
      approved1: t("status_approved1"),
      approved2: t("status_approved2"),
      rejected: t("status_rejected"),
    }[s] || s
  );
}
function fmtTs(ts) {
  if (!ts) return "—";
  try {
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleString("zh-TW", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  } catch { return "—"; }
}
function statusClass(s) {
  return (
    {
      pending: "st-pending",
      approved1: "st-approved1",
      approved2: "st-approved",
      rejected: "st-rejected",
    }[s] || ""
  );
}
function quotaRemain(key) {
  if (!myQuota.value) return "—";
  const q = myQuota.value[key];
  if (!q) return "—";
  return Math.max(0, (q.total ?? 0) - (q.used ?? 0));
}

// ── Tab switches ────────────────────────────────────────────────────────────
function switchMine() {
  tab.value = "mine";
  loadMyRecords();
}
function switchApprove() {
  tab.value = "approve";
  loadPending();
}
function switchApproved() {
  approveSubTab.value = "approved";
  loadMyApproved();
}
async function loadMyApproved() {
  if (!currentUser.value) return;
  const uid = currentUser.value.uid;
  loadingApproved.value = true;
  try {
    const [la, lb, oa, ob] = await Promise.all([
      getDocs(query(collection(db, "leaveRequests"), where("reviewer1Uid", "==", uid))),
      getDocs(query(collection(db, "leaveRequests"), where("reviewer2Uid", "==", uid))),
      getDocs(query(collection(db, "overtimeRequests"), where("reviewer1Uid", "==", uid))),
      getDocs(query(collection(db, "overtimeRequests"), where("reviewer2Uid", "==", uid))),
    ]);
    const leaveMap = {};
    for (const d of [...la.docs, ...lb.docs]) leaveMap[d.id] = { id: d.id, ...d.data() };
    const otMap = {};
    for (const d of [...oa.docs, ...ob.docs]) otMap[d.id] = { id: d.id, ...d.data() };

    const [y, m] = approvedMonth.value.split("-").map(Number);
    const inMonth = (date) => {
      if (!date) return true;
      const [ry, rm] = date.split("-").map(Number);
      return ry === y && rm === m;
    };
    approvedLeaveByMe.value = Object.values(leaveMap)
      .filter((r) => inMonth(r.startDate))
      .sort((a, b) => (a.startDate > b.startDate ? -1 : 1));
    approvedOTByMe.value = Object.values(otMap)
      .filter((r) => inMonth(r.date))
      .sort((a, b) => (a.date > b.date ? -1 : 1));
  } catch (e) {
    console.error(e);
  } finally {
    loadingApproved.value = false;
  }
}
function switchQuota() {
  tab.value = "quota";
  loadQuotas();
}
function switchOTReport() {
  tab.value = "otreport";
  loadOTReport();
}
async function loadOTReport() {
  loadingOTReport.value = true;
  try {
    const snap = await getDocs(
      query(
        collection(db, "overtimeRequests"),
        where("status", "==", "approved2"),
      ),
    );
    const ym = otReportMonth.value; // "YYYY-MM"
    otReportList.value = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((r) => r.date && r.date.startsWith(ym))
      .sort((a, b) => (a.date > b.date ? 1 : a.date < b.date ? -1 : 0))
      .map((r) => ({
        ...r,
        _officialHours: r.officialHours != null ? r.officialHours : r.hours,
      }));
  } finally {
    loadingOTReport.value = false;
  }
}
async function saveOfficialHours(r) {
  try {
    await updateDoc(doc(db, "overtimeRequests", r.id), {
      officialHours: Number(r._officialHours) || 0,
    });
  } catch (e) {
    alert("儲存失敗：" + e.message);
  }
}

// ── Init ───────────────────────────────────────────────────────────────────
onMounted(async () => {
  await authReadyPromise;
  currentUser.value = auth.currentUser;
  if (!currentUser.value) return;

  const userSnap = await getDoc(doc(db, "Users", currentUser.value.uid));
  if (userSnap.exists()) {
    const u = userSnap.data();
    userRole.value = u.role;
    myName.value = u.displayName || currentUser.value.displayName || "";
    if (u.staffRole) myStaffRole.value = u.staffRole;
    if (u.dept) myDept.value = u.dept;
    if (u.empNo) myEmpNo.value = u.empNo;
  }

  // 補齊：管理者可讀 staff 集合，會覆蓋/補上 Users 缺少的欄位
  try {
    const staffQ = await getDocs(
      query(
        collection(db, "staff"),
        where("email", "==", currentUser.value.email),
      ),
    );
    if (!staffQ.empty) {
      const s = staffQ.docs[0].data();
      if (!myEmpNo.value) myEmpNo.value = s.empNo || staffQ.docs[0].id;
      if (!myDept.value) myDept.value = s.dept || "";
      if (!myStaffRole.value) myStaffRole.value = s.staffRole || "";
      if (!myName.value) myName.value = s.name || "";
    }
  } catch (_) {
    /* staff query fails for non-admin; rely on Users-side data */
  }

  if (!myName.value)
    myName.value = currentUser.value.displayName || currentUser.value.email;

  // Load my quota
  const quotaSnap = await getDoc(doc(db, "leaveQuota", currentUser.value.uid));
  if (quotaSnap.exists()) myQuota.value = quotaSnap.data();

  // 從 query 自動切到審核分頁（從打卡頁的待審 banner 連結進來）
  if (route.query.tab === "approve" && isApprover.value) {
    try {
      switchApprove();
    } catch (_) {
      tab.value = "approve";
    }
  }
});

// ── Submit leave ───────────────────────────────────────────────────────────
async function submitLeave() {
  if (lf.unit === "小時") {
    if (!lf.startDate || !lf.startTime || !lf.endTime || lf.hours <= 0) {
      leaveMsg.value = t("leave_err_time");
      leaveMsgIsErr.value = true;
      return;
    }
  } else {
    if (!lf.startDate || !lf.endDate || lf.days <= 0) {
      leaveMsg.value = t("leave_err_date");
      leaveMsgIsErr.value = true;
      return;
    }
  }
  // Quota check (days = hours/8 for hour-based)
  const qKey = QUOTA_KEY[lf.type];
  if (qKey && myQuota.value) {
    const remain = quotaRemain(qKey);
    if (remain !== "—" && lf.days > remain) {
      leaveMsg.value =
        lf.unit === "小時"
          ? `${lf.type}剩餘 ${remain} 天（${remain * 8} 小時），申請 ${lf.hours} 小時超過餘額`
          : `${lf.type}剩餘 ${remain} 天，申請 ${lf.days} 天超過餘額`;
      leaveMsgIsErr.value = true;
      return;
    }
  }

  const effectiveEnd = lf.unit === "小時" ? lf.startDate : lf.endDate;
  submittingLeave.value = true;
  leaveMsg.value = "";
  try {
    // Upload document if provided
    let docUrl = null;
    if (docFile.value) {
      const ext = docFile.value.name.split(".").pop();
      const path = `leaveDocuments/${currentUser.value.uid}_${Date.now()}.${ext}`;
      const snap = await uploadBytes(storageRef(storage, path), docFile.value);
      docUrl = await getDownloadURL(snap.ref);
    }
    await addDoc(collection(db, "leaveRequests"), {
      uid: currentUser.value.uid,
      empNo: myEmpNo.value,
      dept: myDept.value,
      name: myName.value,
      email: currentUser.value.email,
      type: lf.type,
      unit: lf.unit,
      startDate: lf.startDate,
      endDate: effectiveEnd,
      halfDay: lf.unit === "天" ? lf.halfDay || null : null,
      days: lf.days,
      hours: lf.unit === "小時" ? lf.hours : null,
      startTime: lf.unit === "小時" ? lf.startTime : null,
      endTime: lf.unit === "小時" ? lf.endTime : null,
      reason: lf.reason.trim(),
      status: "pending",
      reviewer1Uid: null,
      reviewer1Name: null,
      reviewedAt1: null,
      reviewer2Uid: null,
      reviewer2Name: null,
      reviewedAt2: null,
      rejectStage: null,
      rejectReason: null,
      docUrl: docUrl,
      createdAt: serverTimestamp(),
    });
    leaveMsg.value =
      lf.unit === "小時"
        ? t("leave_sent_hr")(lf.hours)
        : t("leave_sent_day")(lf.days);
    leaveMsgIsErr.value = false;
    Object.assign(lf, {
      type: "事假",
      unit: "天",
      startDate: "",
      endDate: "",
      halfDay: "",
      days: 0,
      hours: 0,
      startTime: "",
      endTime: "",
      reason: "",
    });
    clearDocFile();
  } catch (e) {
    leaveMsg.value = t("leave_fail") + e.message;
    leaveMsgIsErr.value = true;
  } finally {
    submittingLeave.value = false;
  }
}

// ── Submit OT ──────────────────────────────────────────────────────────────
async function submitOT() {
  if (!otf.date || !otf.startTime || !otf.endTime || otf.hours <= 0) {
    otMsg.value = "請填寫完整加班資訊，且結束時間須晚於開始時間";
    otMsgIsErr.value = true;
    return;
  }
  submittingOT.value = true;
  otMsg.value = "";
  try {
    await addDoc(collection(db, "overtimeRequests"), {
      uid: currentUser.value.uid,
      empNo: myEmpNo.value,
      dept: myDept.value,
      name: myName.value,
      email: currentUser.value.email,
      date: otf.date,
      startTime: otf.startTime,
      endTime: otf.endTime,
      hours: otf.hours,
      reason: otf.reason.trim(),
      status: "pending",
      reviewer1Uid: null,
      reviewer1Name: null,
      reviewedAt1: null,
      reviewer2Uid: null,
      reviewer2Name: null,
      reviewedAt2: null,
      rejectStage: null,
      rejectReason: null,
      createdAt: serverTimestamp(),
    });
    otMsg.value = `加班申請（${otf.hours} 時）已送出，等待主管審核`;
    otMsgIsErr.value = false;
    Object.assign(otf, {
      date: "",
      startTime: "",
      endTime: "",
      hours: 0,
      reason: "",
    });
  } catch (e) {
    otMsg.value = "送出失敗：" + e.message;
    otMsgIsErr.value = true;
  } finally {
    submittingOT.value = false;
  }
}

// ── Load my records ────────────────────────────────────────────────────────
async function loadMyRecords() {
  if (!currentUser.value) return;
  loadingMine.value = true;
  try {
    const [lSnap, oSnap] = await Promise.all([
      getDocs(
        query(
          collection(db, "leaveRequests"),
          where("uid", "==", currentUser.value.uid),
        ),
      ),
      getDocs(
        query(
          collection(db, "overtimeRequests"),
          where("uid", "==", currentUser.value.uid),
        ),
      ),
    ]);
    myLeaveRecs.value = lSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    myOTRecs.value = oSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } finally {
    loadingMine.value = false;
  }
}

// ── Cancel / withdraw ──────────────────────────────────────────────────────
async function cancelRequest(r) {
  if (!confirm("確定撤回這筆申請？")) return;
  try {
    await deleteDoc(doc(db, r._col, r.id));
    loadMyRecords();
  } catch (e) {
    alert("撤回失敗：" + e.message);
  }
}

// ── Load pending (approvers) ───────────────────────────────────────────────
async function loadPending() {
  if (!isApprover.value) return;
  loadingPending.value = true;
  try {
    const [l1, l2, o1, o2] = await Promise.all([
      getDocs(
        query(
          collection(db, "leaveRequests"),
          where("status", "==", "pending"),
        ),
      ),
      getDocs(
        query(
          collection(db, "leaveRequests"),
          where("status", "==", "approved1"),
        ),
      ),
      getDocs(
        query(
          collection(db, "overtimeRequests"),
          where("status", "==", "pending"),
        ),
      ),
      getDocs(
        query(
          collection(db, "overtimeRequests"),
          where("status", "==", "approved1"),
        ),
      ),
    ]);
    let lv1 = l1.docs.map((d) => ({ id: d.id, ...d.data() }));
    let lv2 = l2.docs.map((d) => ({ id: d.id, ...d.data() }));
    let ov1 = o1.docs.map((d) => ({ id: d.id, ...d.data() }));
    let ov2 = o2.docs.map((d) => ({ id: d.id, ...d.data() }));

    // 補齊舊紀錄缺少的 dept：依 email 對照 staff 集合
    try {
      const staffSnap = await getDocs(collection(db, "staff"));
      const emailDept = {};
      staffSnap.docs.forEach((d) => {
        const s = d.data();
        if (s.email) emailDept[s.email] = s.dept || "";
      });
      const fill = (arr) =>
        arr.forEach((r) => {
          if (!r.dept && r.email && emailDept[r.email]) r.dept = emailDept[r.email];
        });
      fill(lv1); fill(lv2); fill(ov1); fill(ov2);
    } catch (_) { /* ignore */ }

    if (isDeptHead.value && myDept.value) {
      // 主管只看同部門 stage 1；stage 2 由 HR 處理
      lv1 = lv1.filter((r) => r.dept === myDept.value);
      ov1 = ov1.filter((r) => r.dept === myDept.value);
      lv2 = [];
      ov2 = [];
    }
    pendingLeave1.value = lv1;
    pendingLeave2.value = lv2;
    pendingOT1.value = ov1;
    pendingOT2.value = ov2;
  } finally {
    loadingPending.value = false;
  }
}

// ── Approve leave ──────────────────────────────────────────────────────────
async function approveLeave(r, stage) {
  const reviewer = myName.value || currentUser.value?.email;
  const upd =
    stage === 1
      ? {
          status: "approved1",
          reviewer1Uid: currentUser.value.uid,
          reviewer1Name: reviewer,
          reviewedAt1: serverTimestamp(),
        }
      : {
          status: "approved2",
          reviewer2Uid: currentUser.value.uid,
          reviewer2Name: reviewer,
          reviewedAt2: serverTimestamp(),
        };
  try {
    await updateDoc(doc(db, "leaveRequests", r.id), upd);
    // Deduct quota on final approval
    if (stage === 2) await deductQuota(r.uid, r.type, r.days);
    loadPending();
    // Refresh own quota if approving own request
    if (r.uid === currentUser.value.uid) {
      const qSnap = await getDoc(doc(db, "leaveQuota", currentUser.value.uid));
      if (qSnap.exists()) myQuota.value = qSnap.data();
    }
  } catch (e) {
    alert("操作失敗：" + e.message);
  }
}

// ── Approve OT ────────────────────────────────────────────────────────────
async function approveOT(r, stage) {
  const reviewer = myName.value || currentUser.value?.email;
  const upd =
    stage === 1
      ? {
          status: "approved1",
          reviewer1Uid: currentUser.value.uid,
          reviewer1Name: reviewer,
          reviewedAt1: serverTimestamp(),
        }
      : {
          status: "approved2",
          reviewer2Uid: currentUser.value.uid,
          reviewer2Name: reviewer,
          reviewedAt2: serverTimestamp(),
        };
  try {
    await updateDoc(doc(db, "overtimeRequests", r.id), upd);
    loadPending();
  } catch (e) {
    alert("操作失敗：" + e.message);
  }
}

// ── Deduct quota helper ────────────────────────────────────────────────────
async function deductQuota(uid, leaveType, days) {
  const qKey = QUOTA_KEY[leaveType];
  if (!qKey) return;
  const qRef = doc(db, "leaveQuota", uid);
  const qSnap = await getDoc(qRef);
  if (!qSnap.exists()) return;
  const current = qSnap.data()[qKey] || { total: 0, used: 0 };
  await updateDoc(qRef, {
    [`${qKey}.used`]: Math.min((current.used || 0) + days, current.total || 99),
  });
}

// ── Reject dialog ──────────────────────────────────────────────────────────
function openReject(record, col, stage) {
  Object.assign(rejectDialog, { show: true, record, col, stage, reason: "" });
}
async function confirmReject() {
  const { record, col, stage, reason } = rejectDialog;
  const colName = col === "leave" ? "leaveRequests" : "overtimeRequests";
  const reviewer = myName.value || currentUser.value?.email;
  const upd = {
    status: "rejected",
    rejectStage: stage,
    rejectReason: reason.trim() || null,
    ...(stage === 1
      ? {
          reviewer1Uid: currentUser.value.uid,
          reviewer1Name: reviewer,
          reviewedAt1: serverTimestamp(),
        }
      : {
          reviewer2Uid: currentUser.value.uid,
          reviewer2Name: reviewer,
          reviewedAt2: serverTimestamp(),
        }),
  };
  try {
    await updateDoc(doc(db, colName, record.id), upd);
    rejectDialog.show = false;
    loadPending();
  } catch (e) {
    alert("操作失敗：" + e.message);
  }
}

// ── Quota management ───────────────────────────────────────────────────────
async function loadQuotas() {
  loadingQuota.value = true;
  try {
    const snap = await getDocs(collection(db, "leaveQuota"));
    quotaList.value = snap.docs.map((d) => ({
      ...{
        uid: d.id,
        empNo: "",
        name: "",
        annual: { total: 0, used: 0 },
        sick: { total: 30, used: 0 },
        personal: { total: 14, used: 0 },
        maternity: { total: 56, used: 0 },
        menstrual: { total: 3, used: 0 },
      },
      ...d.data(),
    }));
  } finally {
    loadingQuota.value = false;
  }
}

async function saveQuota(q) {
  try {
    await setDoc(doc(db, "leaveQuota", q.uid), {
      uid: q.uid,
      empNo: q.empNo || "",
      name: q.name || "",
      year: new Date().getFullYear(),
      annual: { total: q.annual?.total ?? 0, used: q.annual?.used ?? 0 },
      sick: { total: q.sick?.total ?? 0, used: q.sick?.used ?? 0 },
      personal: { total: q.personal?.total ?? 0, used: q.personal?.used ?? 0 },
      maternity: {
        total: q.maternity?.total ?? 56,
        used: q.maternity?.used ?? 0,
      },
      menstrual: {
        total: q.menstrual?.total ?? 3,
        used: q.menstrual?.used ?? 0,
      },
      updatedAt: serverTimestamp(),
    });
    alert("已儲存 " + (q.name || q.uid));
  } catch (e) {
    alert("儲存失敗：" + e.message);
  }
}

async function initQuotaForAll() {
  try {
    const [staffSnap, usersSnap] = await Promise.all([
      getDocs(collection(db, "staff")),
      getDocs(collection(db, "Users")),
    ]);
    const emailToUid = {};
    usersSnap.docs.forEach((d) => {
      const v = d.data();
      if (v.email) emailToUid[v.email] = d.id;
    });

    const existing = new Set(quotaList.value.map((q) => q.uid));
    let added = 0;
    for (const d of staffSnap.docs) {
      const s = d.data();
      const uid = emailToUid[s.email];
      if (!uid || existing.has(uid)) continue;
      await setDoc(doc(db, "leaveQuota", uid), {
        uid,
        empNo: s.empNo || d.id,
        name: s.name || "",
        year: new Date().getFullYear(),
        annual: { total: calcAnnualLeaveDays(s.startDate), used: 0 },
        sick: { total: 30, used: 0 },
        personal: { total: 14, used: 0 },
        maternity: { total: 56, used: 0 },
        menstrual: { total: 3, used: 0 },
        updatedAt: serverTimestamp(),
      });
      added++;
    }
    alert(added ? `已建立 ${added} 筆員工配額` : "所有員工已有配額");
    loadQuotas();
  } catch (e) {
    alert("失敗：" + e.message);
  }
}

// ── 勞基法特休計算（依到職日年資）─────────────────────────────────────────────
// 勞基法第38條：6個月3天、1年7天、2年10天、3年14天、5年15天、10年起每年+1天（上限30天）
function calcAnnualLeaveDays(startDateStr) {
  if (!startDateStr) return 0;
  const start = new Date(startDateStr);
  const today = new Date();
  let months =
    (today.getFullYear() - start.getFullYear()) * 12 +
    (today.getMonth() - start.getMonth());
  if (today.getDate() < start.getDate()) months--;
  if (months < 6) return 0;
  if (months < 12) return 3;
  const years = Math.floor(months / 12);
  if (years < 2) return 7;
  if (years < 3) return 10;
  if (years < 5) return 14;
  if (years < 10) return 15;
  return Math.min(30, 15 + (years - 10));
}

async function recalcAnnualLeave() {
  if (
    !confirm("將依所有員工到職日（年資）重新計算特休天數，已用天數不變，確定？")
  )
    return;
  try {
    const [staffSnap, usersSnap] = await Promise.all([
      getDocs(collection(db, "staff")),
      getDocs(collection(db, "Users")),
    ]);
    const emailToUid = {};
    usersSnap.docs.forEach((d) => {
      const v = d.data();
      if (v.email) emailToUid[v.email] = d.id;
    });
    const emailToStart = {};
    staffSnap.docs.forEach((d) => {
      const v = d.data();
      if (v.email && v.startDate) emailToStart[v.email] = v.startDate;
    });

    let updated = 0;
    for (const q of quotaList.value) {
      // find staff email by uid
      const userDoc = usersSnap.docs.find((d) => d.id === q.uid);
      if (!userDoc) continue;
      const email = userDoc.data().email;
      const startDate = emailToStart[email];
      if (!startDate) continue;
      const days = calcAnnualLeaveDays(startDate);
      await updateDoc(doc(db, "leaveQuota", q.uid), {
        "annual.total": days,
        updatedAt: serverTimestamp(),
      });
      q.annual = { ...q.annual, total: days };
      updated++;
    }
    alert(`已重算 ${updated} 位員工的特休天數`);
  } catch (e) {
    alert("失敗：" + e.message);
  }
}
</script>

<style scoped>
.leave-wrap {
  max-width: 960px;
  margin: 0 auto;
  padding: 16px;
}
.page-title {
  font-size: 1.4rem;
  margin-bottom: 16px;
  color: #2c3e50;
}

.tab-nav {
  display: flex;
  gap: 2px;
  flex-wrap: wrap;
  border-bottom: 2px solid #ddd;
  margin-bottom: 20px;
}
.tab-btn {
  background: none;
  border: none;
  padding: 9px 18px;
  cursor: pointer;
  font-size: 0.92rem;
  color: #555;
  border-bottom: 3px solid transparent;
  margin-bottom: -2px;
  transition: color 0.2s;
}
.tab-btn.active {
  color: #2980b9;
  border-bottom-color: #2980b9;
  font-weight: 600;
}
.tab-btn:hover {
  color: #2980b9;
}
.tab-content {
  padding: 4px 0;
}
h3 {
  font-size: 1.1rem;
  margin-bottom: 16px;
  color: #2c3e50;
}
h4 {
  font-size: 0.97rem;
  color: #555;
  margin: 16px 0 8px;
  font-weight: 600;
}

/* Quota bar */
.quota-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  background: #eaf4fb;
  padding: 8px 14px;
  border-radius: 6px;
  margin-bottom: 16px;
  font-size: 0.88rem;
}
.quota-item b {
  color: #2980b9;
}

/* Form */
.req-form {
  max-width: 500px;
}
.field-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 12px;
}
.field-row > label:first-child {
  min-width: 72px;
  font-weight: 500;
  padding-top: 6px;
  font-size: 0.9rem;
}
.field-row input[type="date"],
.field-row input[type="time"],
.field-row select {
  padding: 6px 8px;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: 0.9rem;
}
.field-row textarea {
  flex: 1;
  padding: 6px 8px;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: 0.9rem;
  resize: vertical;
}
.radio-label {
  display: flex;
  align-items: center;
  gap: 3px;
  cursor: pointer;
  font-size: 0.9rem;
}
.days-display {
  font-size: 1rem;
  font-weight: 700;
  color: #2980b9;
  padding-top: 5px;
}
.field-actions {
  margin-top: 16px;
}

.btn-primary {
  background: #2980b9;
  color: #fff;
  border: none;
  padding: 9px 22px;
  border-radius: 5px;
  cursor: pointer;
  font-size: 0.93rem;
}
.btn-primary:hover:not(:disabled) {
  background: #2471a3;
}
.btn-primary:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.btn-aux {
  background: #ecf0f1;
  color: #555;
  border: 1px solid #ccc;
  padding: 6px 14px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.88rem;
}
.btn-aux:hover {
  background: #dfe6e9;
}
.btn-sm {
  padding: 3px 10px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.8rem;
  margin-right: 4px;
}
.btn-ok {
  background: #27ae60;
  color: #fff;
}
.btn-ok:hover {
  background: #219a52;
}
.btn-danger {
  background: #e74c3c;
  color: #fff;
}
.btn-danger:hover {
  background: #c0392b;
}

.msg {
  margin-top: 10px;
  font-size: 0.88rem;
  padding: 7px 12px;
  border-radius: 4px;
  background: #eafaf1;
  color: #1e8449;
}
.msg.error {
  background: #fdedec;
  color: #c0392b;
}
.loading {
  color: #999;
  font-style: italic;
  font-size: 0.9rem;
}
.hint {
  font-size: 0.88rem;
  color: #666;
  margin-bottom: 12px;
}

/* Filter bar */
.filter-bar {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 14px;
  font-size: 0.9rem;
}
.filter-bar select {
  padding: 4px 8px;
  border: 1px solid #ccc;
  border-radius: 4px;
  margin-left: 6px;
}

/* Table */
.rec-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.86rem;
}
.rec-table th {
  background: #f5f6fa;
  padding: 8px 10px;
  text-align: left;
  border-bottom: 2px solid #ddd;
  white-space: nowrap;
}
.rec-table td {
  padding: 7px 10px;
  border-bottom: 1px solid #eee;
}
.rec-table tr:hover td {
  background: #fafbfc;
}
.empty {
  text-align: center;
  color: #aaa;
  padding: 18px;
}
.action-cell {
  white-space: nowrap;
}

/* Status badges */
.status-badge {
  display: inline-block;
  padding: 2px 9px;
  border-radius: 10px;
  font-size: 0.76rem;
  white-space: nowrap;
}
.st-pending {
  background: #ffeaa7;
  color: #636e72;
}
.st-approved1 {
  background: #74b9ff;
  color: #0039a6;
}
.st-approved {
  background: #00b894;
  color: #fff;
}
.st-rejected {
  background: #ff7675;
  color: #fff;
}
.reject-hint {
  font-size: 0.8rem;
  color: #e67e22;
}

/* Approve sub-tabs */
.approve-tabs {
  display: flex;
  gap: 6px;
  margin-bottom: 16px;
}
.tab-btn-sm {
  background: #ecf0f1;
  border: 1px solid #ccc;
  padding: 5px 16px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.88rem;
}
.tab-btn-sm.active {
  background: #2980b9;
  color: #fff;
  border-color: #2980b9;
}

/* Quota table */
.quota-table .quota-input {
  width: 64px;
  padding: 3px 6px;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: 0.85rem;
}
.quota-table small {
  color: #888;
  font-size: 0.75rem;
  margin-left: 4px;
}

/* Reject dialog */
.dialog-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.dialog {
  background: #fff;
  border-radius: 8px;
  padding: 24px 28px;
  min-width: 320px;
  max-width: 440px;
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.2);
}
.dialog h4 {
  margin-bottom: 12px;
  font-size: 1rem;
}
.reject-textarea {
  width: 100%;
  padding: 8px;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: 0.9rem;
  resize: vertical;
  box-sizing: border-box;
}
.dialog-actions {
  display: flex;
  gap: 10px;
  margin-top: 14px;
  justify-content: flex-end;
}

/* ── Document upload ─────────────────────────────── */
.doc-req-hint {
  color: #ef4444;
  font-size: 0.78rem;
  margin-left: 4px;
}
.doc-upload-area {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.doc-filename {
  font-size: 0.85rem;
  color: #374151;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.doc-preview-link,
.doc-view-link {
  font-size: 0.85rem;
  color: #2563eb;
  text-decoration: underline;
  cursor: pointer;
}
.doc-none {
  color: #9ca3af;
  font-size: 0.85rem;
}
</style>
