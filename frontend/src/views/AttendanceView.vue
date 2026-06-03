<template>
  <section class="attendance-page">
    <h1>{{ t("attendance_title") }}</h1>

    <!-- ── 待審提醒（主管 / HR / 管理者） ───────────────────── -->
    <router-link
      v-if="isApprover && pendingTotal > 0"
      :to="{ path: '/leave', query: { tab: 'approve' } }"
      class="pending-banner"
    >
      <span class="pb-icon">📢</span>
      <span class="pb-text">
        您有 <b>{{ pendingTotal }}</b> 件待審資料
        <span class="pb-detail">
          （請假 {{ pendingLeaveCount }} · 加班 {{ pendingOTCount }}）
        </span>
      </span>
      <span class="pb-link">前往審核 →</span>
    </router-link>

    <!-- ── 員工打卡區 ─────────────────────────────────────── -->
    <div class="punch-row">
      <!-- 今日請假 -->
      <div class="leave-side-panel">
        <div class="side-panel-title">今日請假</div>
        <div v-if="!todayLeaveList.length" class="side-panel-empty">無</div>
        <div
          v-for="r in todayLeaveList"
          :key="r.name + r.type"
          class="side-panel-item"
        >
          <span class="side-name">{{ r.name }}</span>
          <span class="side-type">{{ r.type }}</span>
        </div>
      </div>

      <div class="punch-card">
        <div class="punch-date">{{ todayLabel }}</div>
        <div class="punch-time-now">{{ clockStr }}</div>

        <template v-if="!loaded">
          <div class="punch-status">{{ t("loading") }}</div>
        </template>
        <template v-else-if="!todayRec">
          <div class="punch-status neutral">{{ t("not_punched") }}</div>
          <button class="btn-punch in" @click="punchIn" :disabled="punching">
            {{ punching ? t("processing") : t("punch_in_btn") }}
          </button>
        </template>
        <template v-else-if="!todayRec.punchOut">
          <div
            class="punch-status in-office"
            :class="{ 'on-leave': todayStatus === 'on_leave' }"
          >
            <template v-if="todayStatus === 'on_leave'">
              外出中：{{ currentLeaveStartText || "已開始請假" }}
            </template>
            <template v-else>
              {{ t("punched_in") }}{{ displayPunchIn(todayRec) }}
            </template>
          </div>
          <div class="punch-actions">
            <button
              v-if="todayStatus === 'on_leave'"
              class="btn-punch back"
              @click="resumeWork"
              :disabled="punching"
            >
              {{ punching ? t("processing") : t("resume_work_btn") }}
            </button>
            <button
              v-else
              class="btn-punch leave"
              @click="startLeave"
              :disabled="punching"
            >
              {{ punching ? t("processing") : t("start_leave_btn") }}
            </button>
            <button
              class="btn-punch out"
              @click="punchOut"
              :disabled="punching"
            >
              {{ punching ? t("processing") : t("punch_out_btn") }}
            </button>
          </div>
          <div v-if="todayTimelineText" class="punch-timeline">
            {{ todayTimelineText }}
          </div>
        </template>
        <template v-else>
          <div class="punch-status done">
            <span>{{ t("punched_in") }}{{ displayPunchIn(todayRec) }}</span>
            <span>{{ t("punched_out") }}{{ displayPunchOut(todayRec) }}</span>
            <span class="hours"
              >{{ t("work_hours_label") }}{{ calcRecordHours(todayRec) }}
              {{ t("hr_unit") }}</span
            >
          </div>
          <div v-if="todayTimelineText" class="punch-timeline">
            {{ todayTimelineText }}
          </div>
          <div class="punch-complete">{{ t("punch_complete") }}</div>
        </template>

        <div v-if="punchErr" class="err-msg">
          {{ punchErr }}
          <div v-if="geoBlocked" class="err-hint">
            {{ t("geo_hint_chrome") }}<br />
            {{ t("geo_hint_safari") }}
          </div>
        </div>
      </div>

      <!-- 明日請假 / 未打卡 -->
      <div class="side-col-right">
        <div class="leave-side-panel">
          <div class="side-panel-title">明日請假</div>
          <div v-if="!tomorrowLeaveList.length" class="side-panel-empty">
            無
          </div>
          <div
            v-for="r in tomorrowLeaveList"
            :key="r.name + r.type"
            class="side-panel-item"
          >
            <span class="side-name">{{ r.name }}</span>
            <span class="side-type">{{ r.type }}</span>
          </div>
        </div>
        <div
          v-if="isApprover"
          class="leave-side-panel not-punched-panel"
          style="margin-top: 10px"
        >
          <div
            class="side-panel-title np-title"
            style="
              display: flex;
              justify-content: space-between;
              align-items: center;
            "
          >
            <span>未打卡 ({{ notPunchedList.length }})</span>
            <button
              class="np-refresh-btn"
              @click="fetchNotPunched"
              title="刷新"
            >
              ↻
            </button>
          </div>
          <div v-if="!notPunchedList.length" class="side-panel-empty">
            全員到齊
          </div>
          <div
            v-for="s in notPunchedList"
            :key="s.email || s.name"
            class="side-panel-item"
          >
            <span class="side-name">{{ s.name }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- ── 個人出勤記錄 ─────────────────────────────────────── -->
    <div v-if="isLoggedIn" class="personal-section">
      <h2>個人出勤記錄</h2>
      <div class="toolbar-row">
        <label
          >月份
          <input
            type="month"
            v-model="personalMonth"
            @change="fetchPersonalRecords"
          />
        </label>
      </div>
      <div v-if="loadingPersonal" class="loading">載入中…</div>
      <div v-else-if="!personalRecords.length" class="empty">
        本月無出勤資料
      </div>
      <table v-else class="att-table">
        <thead>
          <tr>
            <th>日期</th>
            <th>星期</th>
            <th>上班</th>
            <th>下班</th>
            <th>工時</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="r in personalRecords"
            :key="r.date"
            :class="{ weekend: isWeekend(r.date) }"
          >
            <td>{{ r.date }}</td>
            <td>{{ weekDay(r.date) }}</td>
            <td>{{ displayPunchIn(r) || "—" }}</td>
            <td>{{ displayPunchOut(r) || "—" }}</td>
            <td>
              {{ hasCompletedWorkRecord(r) ? calcRecordHours(r) + " h" : "—" }}
            </td>
          </tr>
        </tbody>
        <tfoot>
          <tr class="total-row">
            <th colspan="4">合計工時</th>
            <th>{{ personalTotalHours }} h</th>
          </tr>
        </tfoot>
      </table>
    </div>

    <!-- ── 管理者查詢區 ──────────────────────────────────── -->
    <div v-if="isAdminOrManager" class="admin-section">
      <div class="admin-toolbar">
        <h2>出勤查詢</h2>
        <div class="toolbar-row">
          <label
            >日期
            <input type="date" v-model="queryDate" @change="fetchRecords" />
          </label>
          <label
            >姓名
            <input v-model="queryName" placeholder="篩選姓名" />
          </label>
          <button class="btn-add-punch" @click="openNewRecord">
            ＋ 補打卡
          </button>
          <span class="punch-count-badge"
            >打卡人數：{{ allRecords.length }} 人</span
          >
        </div>
      </div>

      <div v-if="loadingRecords" class="loading">載入中…</div>
      <div v-else-if="!filteredRecords.length" class="empty">無出勤資料</div>
      <table v-else class="att-table">
        <thead>
          <tr>
            <th>姓名</th>
            <th>Email</th>
            <th>上班</th>
            <th>下班</th>
            <th>工時</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in filteredRecords" :key="r.id">
            <td>
              {{ r.name }}
              <span
                v-if="r.manualCorrected"
                class="badge-corrected"
                :title="'補打/修改 by ' + (r.correctedBy || '管理者')"
                >補打</span
              >
            </td>
            <td>{{ r.email }}</td>
            <td>
              {{ displayPunchIn(r) || "—" }}
              <span v-if="r.locationVerified === false" class="badge-unverified"
                >未驗證</span
              >
              <span v-else-if="r.gpsDist != null" class="badge-dist"
                >{{ r.gpsDist }}m</span
              >
            </td>
            <td>
              {{ displayPunchOut(r) || "—" }}
              <span
                v-if="r.locationVerifiedOut === false"
                class="badge-unverified"
                >未驗證</span
              >
              <span v-else-if="r.gpsDistOut != null" class="badge-dist"
                >{{ r.gpsDistOut }}m</span
              >
            </td>
            <td>
              {{ hasCompletedWorkRecord(r) ? calcRecordHours(r) + " h" : "—" }}
            </td>
            <td>
              <button class="btn-edit-sm" @click="openEdit(r)">修改</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- ── 月出勤報表（勞工局用） ─────────────────────────── -->
    <div v-if="isAdminOrManager" class="labor-section">
      <div class="labor-toolbar">
        <h2>月出勤報表（勞工局用）</h2>
        <div class="toolbar-row">
          <label
            >月份
            <input
              type="month"
              v-model="laborMonth"
              @change="fetchLaborReport"
            />
          </label>
          <label
            >員工
            <select v-model="laborEmployee" @change="fetchLaborReport">
              <option value="">全部員工</option>
              <option v-for="s in laborStaffList" :key="s.uid" :value="s.uid">
                {{ s.name }}
              </option>
            </select>
          </label>
          <button class="btn-print" @click="printLabor">列印 / 儲存PDF</button>
        </div>
      </div>
      <div v-if="loadingLabor" class="loading">載入中…</div>
      <div v-else-if="!laborData.length" class="empty">無出勤資料</div>
      <div v-else class="labor-report">
        <div v-for="emp in laborData" :key="emp.uid" class="labor-emp-block">
          <div class="labor-emp-title">
            <strong>{{ emp.name }}</strong>
            &emsp;{{ laborMonth }} 出勤記錄
          </div>
          <table class="labor-table">
            <thead>
              <tr>
                <th>日期</th>
                <th>星期</th>
                <th>上班時間</th>
                <th>下班時間</th>
                <th>工作時數</th>
                <th>備註</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="day in laborDays"
                :key="day"
                :class="{
                  weekend: isWeekend(day),
                  'no-rec': !emp.byDate[day] && !isWeekend(day),
                }"
              >
                <td>{{ day.slice(5) }}</td>
                <td>{{ weekDay(day) }}</td>
                <td>
                  {{
                    displayPunchIn(emp.byDate[day]) ||
                    (isWeekend(day) ? "休" : "—")
                  }}
                </td>
                <td>
                  {{
                    displayPunchOut(emp.byDate[day]) ||
                    (isWeekend(day) ? "休" : "—")
                  }}
                </td>
                <td>
                  {{
                    hasCompletedWorkRecord(emp.byDate[day])
                      ? calcRecordHours(emp.byDate[day]) + " h"
                      : "—"
                  }}
                </td>
                <td>{{ leaveSummary(emp.byDate[day]) }}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr class="total-row">
                <th colspan="4">合計出勤工時</th>
                <th>{{ empTotalHours(emp) }} h</th>
                <th></th>
              </tr>
            </tfoot>
          </table>
        </div>
        <div class="labor-sign-row">
          公司名稱：________________&emsp;主管簽名：________________&emsp;製表日期：{{
            new Date().toLocaleDateString("zh-TW")
          }}
        </div>
      </div>
    </div>

    <!-- ── 修改打卡 modal ─────────────────────────────────── -->
    <div
      v-if="editModal.show"
      class="modal-overlay"
      @click.self="editModal.show = false"
    >
      <div class="modal-box">
        <h3>修改打卡記錄</h3>
        <div class="modal-info">
          {{ editModal.name }}&emsp;{{ editModal.date }}
        </div>
        <div class="segment-editor">
          <div class="segment-section">
            <div class="segment-head">
              <label>工作時段</label>
              <button class="btn-add-segment" @click="addEditWorkSegment">
                ＋ 新增工作時段
              </button>
            </div>
            <div
              v-for="(seg, index) in editModal.workSegments"
              :key="`work-${index}`"
              class="segment-row"
            >
              <input type="time" v-model="seg.start" step="1" />
              <span>至</span>
              <input type="time" v-model="seg.end" step="1" />
              <button
                class="btn-remove-segment"
                @click="removeEditWorkSegment(index)"
              >
                刪除
              </button>
            </div>
          </div>

          <div class="segment-section">
            <div class="segment-head">
              <label>請假時段</label>
              <button class="btn-add-segment" @click="addEditLeaveSegment">
                ＋ 新增請假時段
              </button>
            </div>
            <div v-if="!editModal.leaveSegments.length" class="segment-empty">
              無
            </div>
            <div
              v-for="(seg, index) in editModal.leaveSegments"
              :key="`leave-${index}`"
              class="segment-row segment-row-leave"
            >
              <input type="time" v-model="seg.start" step="1" />
              <span>至</span>
              <input type="time" v-model="seg.end" step="1" />
              <select
                v-model="seg.leaveRequestId"
                @change="syncEditLeaveSegment(index)"
              >
                <option value="">未連結假單</option>
                <option
                  v-for="opt in editModal.leaveOptions"
                  :key="opt.id"
                  :value="opt.id"
                >
                  {{ formatLeaveOption(opt) }}
                </option>
              </select>
              <button
                class="btn-remove-segment"
                @click="removeEditLeaveSegment(index)"
              >
                刪除
              </button>
            </div>
          </div>
        </div>
        <div class="segment-help">
          最後一段可留空，表示仍在上班或外出中；中間區段請填完整時間。
        </div>
        <div v-if="editModal.err" class="modal-err">{{ editModal.err }}</div>
        <div class="modal-btns">
          <button
            class="btn-save"
            :disabled="editModal.saving"
            @click="saveEdit"
          >
            {{ editModal.saving ? "儲存中…" : "儲存" }}
          </button>
          <button class="btn-cancel" @click="editModal.show = false">
            取消
          </button>
        </div>
      </div>
    </div>

    <!-- ── 補打卡 modal ───────────────────────────────────── -->
    <div
      v-if="newRecModal.show"
      class="modal-overlay"
      @click.self="newRecModal.show = false"
    >
      <div class="modal-box">
        <h3>補打卡（手動新增）</h3>
        <div class="form-row">
          <label>員工</label>
          <input
            v-model.trim="newRecEmployeeQuery"
            type="search"
            class="employee-search-input"
            placeholder="輸入姓名、Email 或員編關鍵字"
          />
          <div class="form-helper">
            共 {{ filteredNewRecUsers.length }} 位符合
          </div>
          <select v-model="newRecModal.uid">
            <option value="">請選擇員工</option>
            <option v-for="u in filteredNewRecUsers" :key="u.id" :value="u.id">
              {{ u.displayName || u.email }}
            </option>
          </select>
        </div>
        <div class="form-row">
          <label>日期</label>
          <input type="date" v-model="newRecModal.date" />
        </div>
        <div class="form-row">
          <label>上班時間（必填）</label>
          <input type="time" v-model="newRecModal.punchIn" step="1" />
        </div>
        <div class="form-row">
          <label>下班時間（選填）</label>
          <input type="time" v-model="newRecModal.punchOut" step="1" />
        </div>
        <div v-if="newRecModal.err" class="modal-err">
          {{ newRecModal.err }}
        </div>
        <div class="modal-btns">
          <button
            class="btn-save"
            :disabled="newRecModal.saving"
            @click="saveNewRecord"
          >
            {{ newRecModal.saving ? "儲存中…" : "儲存" }}
          </button>
          <button class="btn-cancel" @click="newRecModal.show = false">
            取消
          </button>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from "vue";
import { auth, db, authReadyPromise } from "../firebase";
import {
  getUserByUid,
  getSystemSettings,
  fetchAllUsers,
  userHasAnyRole,
} from "../firebase";
import { t, lang } from "../locale";
import {
  collection,
  doc,
  setDoc,
  updateDoc,
  query,
  where,
  getDocs,
} from "firebase/firestore";

// ── 待審狀態 ()(主管/HR/管理者) ──────────────────────────
const myStaffRole = ref("");
const myDept = ref("");
const pendingLeaveCount = ref(0);
const pendingOTCount = ref(0);
const isApprover = computed(
  () =>
    isAdminOrManager.value ||
    myStaffRole.value === "主管" ||
    myStaffRole.value === "HR",
);
const isDeptHead = computed(
  () => myStaffRole.value === "主管" && !isAdminOrManager.value,
);
const pendingTotal = computed(
  () => pendingLeaveCount.value + pendingOTCount.value,
);

// ── 時鐘 ──────────────────────────────────────────────────
const clockStr = ref("");
let clockTimer = null;
function updateClock() {
  clockStr.value = new Date().toLocaleTimeString("zh-TW", { hour12: false });
}

// ── 狀態 ──────────────────────────────────────────────────
const loaded = ref(false);
const punching = ref(false);
const punchErr = ref("");
const geoBlocked = ref(false);
const todayRec = ref(null);
const isAdminOrManager = ref(false);

let punchLocationCfg = {
  enabled: false,
  allowOnFail: false,
  lat: null,
  lng: null,
  radiusMeters: 200,
};

const loadingRecords = ref(false);
const allRecords = ref([]);
const queryDate = ref(todayStr());
const queryName = ref("");
const allUsersCache = ref([]);
const newRecEmployeeQuery = ref("");

// ── 修改打卡 modal ──────────────────────────────────────────
const editModal = ref({
  show: false,
  id: "",
  uid: "",
  name: "",
  date: "",
  workSegments: [],
  leaveSegments: [],
  leaveOptions: [],
  sourceRecord: null,
  saving: false,
  err: "",
});
// ── 補打卡 modal ────────────────────────────────────────────
const newRecModal = ref({
  show: false,
  uid: "",
  date: "",
  punchIn: "",
  punchOut: "",
  saving: false,
  err: "",
});

const filteredNewRecUsers = computed(() => {
  const kw = newRecEmployeeQuery.value.trim().toLowerCase();
  if (!kw) return allUsersCache.value;
  return allUsersCache.value.filter((user) => {
    const fields = [user.displayName, user.email, user.id]
      .filter(Boolean)
      .map((value) => String(value).toLowerCase());
    return fields.some((value) => value.includes(kw));
  });
});

// ── 今明日請假名單 ─────────────────────────────────
const notPunchedList = ref([]);

async function fetchNotPunched() {
  try {
    const today = todayStr();
    const [staffSnap, attSnap] = await Promise.all([
      getDocs(query(collection(db, "staff"), where("status", "==", "在職"))),
      getDocs(query(collection(db, "attendance"), where("date", "==", today))),
    ]);
    const punchedEmails = new Set(
      attSnap.docs
        .map((d) => (d.data().email || "").toLowerCase())
        .filter(Boolean),
    );
    notPunchedList.value = staffSnap.docs
      .map((d) => d.data())
      .filter((s) => {
        if (!s.email) return false;
        return !punchedEmails.has(s.email.toLowerCase());
      })
      .sort((a, b) => (a.name || "").localeCompare(b.name || "", "zh-Hant"));
  } catch (e) {
    console.error("fetchNotPunched:", e);
  }
}

const todayLeaveList = ref([]);
const tomorrowLeaveList = ref([]);

async function fetchDayLeaves() {
  try {
    const today = todayStr();
    const tmr = new Date();
    tmr.setDate(tmr.getDate() + 1);
    const tomorrow = tmr.toLocaleDateString("sv-SE");
    const snap = await getDocs(
      query(collection(db, "leaveRequests"), where("endDate", ">=", today)),
    );
    const rawRecs = snap.docs
      .map((d) => ({ ...d.data() }))
      .filter(
        (r) =>
          (r.status === "approved1" || r.status === "approved2") &&
          r.startDate <= tomorrow,
      );

    let recs = rawRecs;
    try {
      const allUsers = await fetchAllUsers();
      const nameMap = {};
      allUsers.forEach((u) => {
        if (u.uid) nameMap[u.uid] = u.displayName || u.name || "";
      });
      recs = rawRecs.map((r) =>
        r.uid && nameMap[r.uid] ? { ...r, name: nameMap[r.uid] } : r,
      );
    } catch (_) {
      /* non-admin can't read all Users; use stored names */
    }

    function groupByName(list) {
      const map = new Map();
      list.forEach((r) => {
        if (map.has(r.name)) {
          const existing = map.get(r.name);
          if (!existing.types.includes(r.type)) existing.types.push(r.type);
        } else {
          map.set(r.name, { name: r.name, types: [r.type] });
        }
      });
      return [...map.values()]
        .map((v) => ({ name: v.name, type: v.types.join("/") }))
        .sort((a, b) => a.name.localeCompare(b.name, "zh-Hant"));
    }
    todayLeaveList.value = groupByName(
      recs.filter((r) => r.startDate <= today && r.endDate >= today),
    );
    tomorrowLeaveList.value = groupByName(
      recs.filter((r) => r.startDate <= tomorrow && r.endDate >= tomorrow),
    );
  } catch (e) {
    console.error("fetchDayLeaves:", e);
  }
}

// ── 日期工具 ──────────────────────────────────────────────
function todayStr() {
  return new Date().toLocaleDateString("sv-SE"); // YYYY-MM-DD
}
const todayLabel = computed(() => {
  const d = new Date();
  return d.toLocaleDateString(lang.value === "vi" ? "vi-VN" : "zh-TW", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });
});

function timeStr() {
  return new Date().toLocaleTimeString("zh-TW", { hour12: false });
}

const EARLIEST_PUNCH_IN = "07:45:00";

function toSeconds(value) {
  if (!value) return null;
  const parts = String(value).split(":").map(Number);
  if (!Number.isFinite(parts[0]) || !Number.isFinite(parts[1] ?? 0))
    return null;
  return parts[0] * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
}

function sortByTime(list, field = "start") {
  return [...list].sort(
    (a, b) => (toSeconds(a?.[field]) ?? 0) - (toSeconds(b?.[field]) ?? 0),
  );
}

function normalizeSegments(list) {
  if (!Array.isArray(list)) return [];
  return sortByTime(
    list
      .map((seg) => {
        const start = seg?.start ? toHMS(seg.start) : null;
        const end = seg?.end ? toHMS(seg.end) : null;
        return start ? { ...seg, start, end } : null;
      })
      .filter(Boolean),
  );
}

function clampEarliestPunchIn(value) {
  const normalized = toHMS(value);
  if (!normalized) return null;
  return (toSeconds(normalized) ?? 0) < toSeconds(EARLIEST_PUNCH_IN)
    ? EARLIEST_PUNCH_IN
    : normalized;
}

function normalizeWorkSegments(list) {
  const segments = normalizeSegments(list);
  if (segments.length) {
    segments[0] = {
      ...segments[0],
      start: clampEarliestPunchIn(segments[0].start),
    };
  }
  return segments;
}

function getWorkSegments(record) {
  const segments = normalizeWorkSegments(record?.workSegments);
  if (segments.length) return segments;
  if (record?.punchIn) {
    return [
      {
        start: clampEarliestPunchIn(record.punchIn),
        end: record?.punchOut ? toHMS(record.punchOut) : null,
      },
    ];
  }
  return [];
}

function getLeaveSegments(record) {
  return normalizeSegments(record?.leaveSegments);
}

function displayPunchIn(record) {
  return getWorkSegments(record)[0]?.start || record?.punchIn || "";
}

function displayPunchOut(record) {
  const lastEndedWork = [...getWorkSegments(record)]
    .reverse()
    .find((seg) => seg?.end)?.end;
  return record?.punchOut || lastEndedWork || "";
}

function getOpenLeaveSegment(record) {
  return (
    [...getLeaveSegments(record)]
      .reverse()
      .find((seg) => seg?.start && !seg?.end) || null
  );
}

function getRecordStatus(record) {
  if (!record) return "idle";
  if (record.punchOut) return "done";
  if (getOpenLeaveSegment(record)) return "on_leave";
  if (displayPunchIn(record)) return "working";
  return "idle";
}

function calcRecordHours(record) {
  const totalSeconds = getWorkSegments(record).reduce((sum, seg) => {
    const start = toSeconds(seg.start);
    const end = toSeconds(seg.end);
    if (start == null || end == null || end <= start) return sum;
    return sum + (end - start);
  }, 0);
  if (!totalSeconds) return "—";
  return (totalSeconds / 3600).toFixed(1);
}

function hasCompletedWorkRecord(record) {
  return calcRecordHours(record) !== "—";
}

function leaveSummary(record) {
  const segments = getLeaveSegments(record);
  if (!segments.length) return "";
  return segments
    .map(
      (seg) =>
        `${seg.start}~${seg.end || "未返場"}${seg.leaveType ? ` (${seg.leaveType})` : ""}`,
    )
    .join("；");
}

function buildTimelineText(record) {
  if (!record) return "";
  const items = [
    ...getWorkSegments(record).map((seg) => ({
      start: seg.start,
      text: `上班 ${seg.start}${seg.end ? `-${seg.end}` : ""}`,
    })),
    ...getLeaveSegments(record).map((seg) => ({
      start: seg.start,
      text: `請假 ${seg.start}${seg.end ? `-${seg.end}` : "-進行中"}`,
    })),
  ];
  return sortByTime(items, "start")
    .map((item) => item.text)
    .join(" ｜ ");
}

function cloneSegments(record, key) {
  const segments =
    key === "workSegments"
      ? normalizeWorkSegments(record?.[key])
      : normalizeSegments(record?.[key]);
  return segments.map((seg) => ({ ...seg }));
}

function emptyWorkSegment() {
  return { start: "", end: "" };
}

function emptyLeaveSegment() {
  return { start: "", end: "", leaveRequestId: "", leaveType: "" };
}

function getActorName() {
  return (
    userDoc?.name ||
    userDoc?.displayName ||
    currentUser?.displayName ||
    currentUser?.email ||
    "system"
  );
}

function buildAuditSnapshot(record) {
  return {
    punchIn: record?.punchIn || null,
    punchOut: record?.punchOut || null,
    currentState: record?.currentState || null,
    workSegments: cloneSegments(record, "workSegments"),
    leaveSegments: cloneSegments(record, "leaveSegments"),
  };
}

function appendAuditTrail(record, action, afterRecord, meta = {}) {
  const trail = Array.isArray(record?.auditTrail) ? [...record.auditTrail] : [];
  trail.push({
    action,
    actor: getActorName(),
    at: new Date().toISOString(),
    before: buildAuditSnapshot(record),
    after: buildAuditSnapshot(afterRecord),
    ...meta,
  });
  return trail;
}

function formatLeaveOption(opt) {
  if (!opt) return "";
  const timeRange =
    opt.unit === "小時"
      ? `${opt.startTime || ""}-${opt.endTime || ""}`
      : `${opt.startDate || ""}${opt.endDate && opt.endDate !== opt.startDate ? `~${opt.endDate}` : ""}`;
  return `${opt.type || "假單"} ${timeRange}`.trim();
}

function hydrateLeaveSegment(seg) {
  return {
    start: seg?.start ? String(seg.start).slice(0, 5) : "",
    end: seg?.end ? String(seg.end).slice(0, 5) : "",
    leaveRequestId: seg?.leaveRequestId || "",
    leaveType: seg?.leaveType || "",
  };
}

function timeOverlaps(startA, endA, startB, endB) {
  const aStart = toSeconds(startA);
  const aEnd = toSeconds(endA);
  const bStart = toSeconds(startB);
  const bEnd = toSeconds(endB);
  if (aStart == null || aEnd == null || bStart == null || bEnd == null)
    return false;
  return aStart < bEnd && aEnd > bStart;
}

function validateSegments(workSegments, leaveSegments) {
  const errors = [];
  const normalizedWork = normalizeSegments(workSegments);
  const normalizedLeave = normalizeSegments(leaveSegments);
  if (!normalizedWork.length) {
    errors.push("至少要有一段工作時段");
  }
  const validateList = (list, label) => {
    let openCount = 0;
    list.forEach((seg, index) => {
      if (!seg.start) {
        errors.push(`${label}${index + 1} 缺少開始時間`);
        return;
      }
      if (!seg.end) {
        openCount += 1;
        if (index !== list.length - 1) {
          errors.push(`${label}${index + 1} 若未結束，必須放在最後一段`);
        }
        return;
      }
      if ((toSeconds(seg.end) ?? 0) <= (toSeconds(seg.start) ?? 0)) {
        errors.push(`${label}${index + 1} 結束時間必須晚於開始時間`);
      }
    });
    if (openCount > 1) errors.push(`${label}只能有一段未結束`);
  };
  validateList(normalizedWork, "工作時段");
  validateList(normalizedLeave, "請假時段");
  for (let i = 1; i < normalizedWork.length; i += 1) {
    if (
      timeOverlaps(
        normalizedWork[i - 1].start,
        normalizedWork[i - 1].end,
        normalizedWork[i].start,
        normalizedWork[i].end,
      )
    ) {
      errors.push("工作時段不可互相重疊");
      break;
    }
  }
  for (let i = 1; i < normalizedLeave.length; i += 1) {
    if (
      timeOverlaps(
        normalizedLeave[i - 1].start,
        normalizedLeave[i - 1].end,
        normalizedLeave[i].start,
        normalizedLeave[i].end,
      )
    ) {
      errors.push("請假時段不可互相重疊");
      break;
    }
  }
  normalizedLeave.forEach((leaveSeg) => {
    normalizedWork.forEach((workSeg) => {
      if (
        timeOverlaps(leaveSeg.start, leaveSeg.end, workSeg.start, workSeg.end)
      ) {
        errors.push("工作時段與請假時段不可重疊");
      }
    });
  });
  return { normalizedWork, normalizedLeave, errors: [...new Set(errors)] };
}

function buildAttendanceStateFromSegments(workSegments, leaveSegments) {
  const normalizedWork = normalizeWorkSegments(workSegments);
  const normalizedLeave = normalizeSegments(leaveSegments);
  const punchIn = normalizedWork[0]?.start || null;
  const lastEndedWork =
    [...normalizedWork].reverse().find((seg) => seg.end)?.end || null;
  const hasOpenLeave = normalizedLeave.some((seg) => seg.start && !seg.end);
  const hasOpenWork = normalizedWork.some((seg) => seg.start && !seg.end);
  let currentState = "idle";
  let punchOut = null;
  if (hasOpenLeave) {
    currentState = "on_leave";
  } else if (hasOpenWork) {
    currentState = "working";
  } else if (lastEndedWork) {
    currentState = "done";
    punchOut = lastEndedWork;
  }
  return {
    punchIn,
    punchOut,
    currentState,
    workSegments: normalizedWork,
    leaveSegments: normalizedLeave,
  };
}

async function fetchApprovedLeaveOptions(uid, date) {
  if (!uid || !date) return [];
  const snap = await getDocs(
    query(collection(db, "leaveRequests"), where("uid", "==", uid)),
  );
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter(
      (item) =>
        (item.status === "approved1" || item.status === "approved2") &&
        item.startDate <= date &&
        item.endDate >= date,
    )
    .sort((a, b) =>
      `${a.startDate || ""}${a.startTime || ""}`.localeCompare(
        `${b.startDate || ""}${b.startTime || ""}`,
      ),
    );
}

function matchLeaveOption(options, date, start, end = "") {
  const startSecs = toSeconds(start);
  const endSecs = end ? toSeconds(end) : null;
  return (
    options.find((opt) => {
      if (opt.startDate > date || opt.endDate < date) return false;
      if (opt.unit !== "小時") return true;
      const optStart = toSeconds(opt.startTime);
      const optEnd = toSeconds(opt.endTime);
      if (startSecs == null || optStart == null || optEnd == null) return false;
      if (endSecs == null) return startSecs >= optStart && startSecs <= optEnd;
      return startSecs >= optStart && endSecs <= optEnd;
    }) || null
  );
}

function syncLeaveSegmentWithOption(seg, options) {
  if (!seg.leaveRequestId) {
    seg.leaveType = "";
    return;
  }
  const opt = options.find((item) => item.id === seg.leaveRequestId);
  seg.leaveType = opt?.type || "";
}

function createGeoPayload(geo, suffix = "") {
  const payload = {
    [`locationVerified${suffix}`]: geo.ok === true,
  };
  if (geo.ok === true && geo.lat != null) {
    payload[`gpsLat${suffix}`] = geo.lat;
    payload[`gpsLng${suffix}`] = geo.lng;
    payload[`gpsAccuracy${suffix}`] = geo.accuracy;
    payload[`gpsDist${suffix}`] = geo.dist;
  }
  return payload;
}

function appendEvent(record, type, tStr, geo) {
  const events = Array.isArray(record?.events) ? [...record.events] : [];
  events.push({
    type,
    time: tStr,
    at: new Date().toISOString(),
    locationVerified: geo.ok === true,
    gpsLat: geo.lat ?? null,
    gpsLng: geo.lng ?? null,
    gpsAccuracy: geo.accuracy ?? null,
    gpsDist: geo.dist ?? null,
  });
  return events;
}

function buildManualWorkSegments(punchIn, punchOut) {
  const start = clampEarliestPunchIn(punchIn);
  if (!start) return [];
  return [{ start, end: toHMS(punchOut) ?? null }];
}

const todayStatus = computed(() => getRecordStatus(todayRec.value));
const currentLeaveStartText = computed(
  () => getOpenLeaveSegment(todayRec.value)?.start || "",
);
const todayTimelineText = computed(() => buildTimelineText(todayRec.value));

function calcHours(inStr, outStr) {
  if (!inStr || !outStr) return "—";
  const parse = (s) => {
    const [h, m, sec] = s.split(":").map(Number);
    return h * 3600 + m * 60 + (sec || 0);
  };
  const diff = parse(outStr) - parse(inStr);
  if (diff <= 0) return "—";
  return (diff / 3600).toFixed(1);
}

// ── 初始化 ────────────────────────────────────────────────
let currentUser = null;
let userDoc = null;

onMounted(async () => {
  updateClock();
  clockTimer = setInterval(updateClock, 1000);

  await authReadyPromise;
  fetchDayLeaves();
  currentUser = auth.currentUser;
  if (!currentUser) {
    loaded.value = true;
    return;
  }

  userDoc = await getUserByUid(currentUser.uid);
  isAdminOrManager.value = userHasAnyRole(userDoc, ["admin", "管理者"]);

  try {
    const settings = await getSystemSettings();
    punchLocationCfg = settings.punchLocation || punchLocationCfg;
  } catch (_) {}

  isLoggedIn.value = true;
  await loadTodayRec();
  fetchPersonalRecords();
  if (isAdminOrManager.value) {
    fetchRecords();
    fetchLaborReport();
  }

  // 讀取 staff role/dept 與待審計數
  await loadApproverInfo();
  if (isApprover.value) await loadPendingCounts();
  fetchNotPunched();
});

onUnmounted(() => clearInterval(clockTimer));

// ── 讀取今日打卡 ──────────────────────────────────────────
async function loadTodayRec() {
  loaded.value = false;
  punchErr.value = "";
  try {
    const snaps = await getDocs(
      query(
        collection(db, "attendance"),
        where("uid", "==", currentUser.uid),
        where("date", "==", todayStr()),
      ),
    );
    todayRec.value = snaps.empty ? null : snaps.docs[0].data();
  } catch (e) {
    punchErr.value = "讀取失敗：" + e.message;
  } finally {
    loaded.value = true;
  }
}

// ── 載入審核身分（staffRole / dept） ─────────────────────────
async function loadApproverInfo() {
  if (!currentUser) return;
  try {
    if (userDoc) {
      if (userDoc.staffRole) myStaffRole.value = userDoc.staffRole;
      if (userDoc.dept) myDept.value = userDoc.dept;
    }
    if (!myStaffRole.value || !myDept.value) {
      const snap = await getDocs(
        query(collection(db, "staff"), where("email", "==", currentUser.email)),
      );
      if (!snap.empty) {
        const s = snap.docs[0].data();
        if (!myStaffRole.value) myStaffRole.value = s.staffRole || "";
        if (!myDept.value) myDept.value = s.dept || "";
      }
    }
  } catch (_) {
    /* 非管理者讀 staff 可能被拒，忽略 */
  }
}

// ── 計算待審件數 ──────────────────────────────────────────
async function loadPendingCounts() {
  try {
    const [lp, la, op, oa] = await Promise.all([
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
    let leave1 = lp.docs.map((d) => d.data());
    let leave2 = la.docs.map((d) => d.data());
    let ot1 = op.docs.map((d) => d.data());
    let ot2 = oa.docs.map((d) => d.data());
    if (isDeptHead.value && myDept.value) {
      // 部門主管只看同部門 stage1，stage2 由 HR 處理
      leave1 = leave1.filter((r) => r.dept === myDept.value);
      ot1 = ot1.filter((r) => r.dept === myDept.value);
      leave2 = [];
      ot2 = [];
    }
    pendingLeaveCount.value = leave1.length + leave2.length;
    pendingOTCount.value = ot1.length + ot2.length;
  } catch (e) {
    console.error("loadPendingCounts:", e);
  }
}

// ── GPS 地理圍欄驗證 ──────────────────────────────────────
function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function checkGeofence() {
  return new Promise((resolve, reject) => {
    const cfg = punchLocationCfg;
    if (!cfg.enabled || cfg.lat == null || cfg.lng == null) {
      resolve({ ok: true });
      return;
    }
    if (!navigator.geolocation) {
      reject(new Error(t("geo_unsupported")));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const accuracy = pos.coords.accuracy || 0;
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        if (accuracy > cfg.radiusMeters) {
          reject(new Error(t("geo_accuracy")(Math.round(accuracy))));
          return;
        }
        const dist = haversineDistance(lat, lng, cfg.lat, cfg.lng);
        if (dist <= cfg.radiusMeters) {
          resolve({ ok: true, lat, lng, accuracy, dist: Math.round(dist) });
        } else {
          reject(new Error(t("geo_far")(Math.round(dist), cfg.radiusMeters)));
        }
      },
      (err) => {
        let msg = t("geo_fail_retry");
        if (err.code === 1) {
          msg = t("geo_denied");
          geoBlocked.value = true;
        } else if (err.code === 2) msg = t("geo_no_signal");
        else if (err.code === 3) msg = t("geo_timeout_msg");
        reject(new Error(msg));
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  });
}

// ── 上班打卡 ──────────────────────────────────────────────
async function punchIn() {
  punching.value = true;
  punchErr.value = "";
  geoBlocked.value = false;
  try {
    const freshSettings = await getSystemSettings();
    punchLocationCfg = freshSettings.punchLocation || punchLocationCfg;
    const geo = await checkGeofence();
    const id = `${todayStr()}_${currentUser.uid}`;
    const tStr = clampEarliestPunchIn(timeStr());
    const data = {
      uid: currentUser.uid,
      name:
        userDoc?.displayName || currentUser.displayName || currentUser.email,
      email: currentUser.email,
      date: todayStr(),
      punchIn: tStr,
      punchOut: null,
      currentState: "working",
      workSegments: [{ start: tStr, end: null }],
      leaveSegments: [],
      events: appendEvent(null, "punchIn", tStr, geo),
      auditTrail: [],
      ...createGeoPayload(geo),
    };
    data.auditTrail = appendAuditTrail(null, "punchIn", data, {
      source: "employee",
    });
    await setDoc(doc(db, "attendance", id), data);
    todayRec.value = data;
    fetchNotPunched();
  } catch (e) {
    punchErr.value = t("punch_fail") + e.message;
  } finally {
    punching.value = false;
  }
}

async function startLeave() {
  if (!todayRec.value || todayStatus.value !== "working") return;
  punching.value = true;
  punchErr.value = "";
  geoBlocked.value = false;
  try {
    const freshSettings = await getSystemSettings();
    punchLocationCfg = freshSettings.punchLocation || punchLocationCfg;
    const geo = await checkGeofence();
    const id = `${todayStr()}_${currentUser.uid}`;
    const tStr = timeStr();
    const leaveOptions = await fetchApprovedLeaveOptions(
      currentUser.uid,
      todayStr(),
    );
    const workSegments = cloneSegments(todayRec.value, "workSegments");
    if (workSegments.length) {
      const lastWork = workSegments[workSegments.length - 1];
      if (!lastWork.end) lastWork.end = tStr;
    }
    const leaveSegments = cloneSegments(todayRec.value, "leaveSegments");
    const matchedLeave = matchLeaveOption(leaveOptions, todayStr(), tStr);
    leaveSegments.push({
      start: tStr,
      end: null,
      leaveRequestId: matchedLeave?.id || "",
      leaveType: matchedLeave?.type || "",
    });
    const afterRecord = {
      ...todayRec.value,
      workSegments,
      leaveSegments,
      currentState: "on_leave",
    };
    const upd = {
      workSegments,
      leaveSegments,
      currentState: "on_leave",
      events: appendEvent(todayRec.value, "leaveStart", tStr, geo),
      auditTrail: appendAuditTrail(todayRec.value, "leaveStart", afterRecord, {
        source: "employee",
        leaveRequestId: matchedLeave?.id || null,
        leaveType: matchedLeave?.type || null,
      }),
      ...createGeoPayload(geo, "LeaveStart"),
    };
    await updateDoc(doc(db, "attendance", id), upd);
    todayRec.value = { ...todayRec.value, ...upd };
  } catch (e) {
    punchErr.value = t("punch_fail") + e.message;
  } finally {
    punching.value = false;
  }
}

async function resumeWork() {
  if (!todayRec.value || todayStatus.value !== "on_leave") return;
  punching.value = true;
  punchErr.value = "";
  geoBlocked.value = false;
  try {
    const freshSettings = await getSystemSettings();
    punchLocationCfg = freshSettings.punchLocation || punchLocationCfg;
    const geo = await checkGeofence();
    const id = `${todayStr()}_${currentUser.uid}`;
    const tStr = timeStr();
    const leaveOptions = await fetchApprovedLeaveOptions(
      currentUser.uid,
      todayStr(),
    );
    const leaveSegments = cloneSegments(todayRec.value, "leaveSegments");
    if (leaveSegments.length) {
      const lastLeave = leaveSegments[leaveSegments.length - 1];
      if (!lastLeave.end) {
        lastLeave.end = tStr;
        if (!lastLeave.leaveRequestId) {
          const matchedLeave = matchLeaveOption(
            leaveOptions,
            todayStr(),
            lastLeave.start,
            tStr,
          );
          lastLeave.leaveRequestId = matchedLeave?.id || "";
          lastLeave.leaveType = matchedLeave?.type || lastLeave.leaveType || "";
        }
      }
    }
    const workSegments = cloneSegments(todayRec.value, "workSegments");
    workSegments.push({ start: tStr, end: null });
    const afterRecord = {
      ...todayRec.value,
      leaveSegments,
      workSegments,
      currentState: "working",
    };
    const upd = {
      leaveSegments,
      workSegments,
      currentState: "working",
      events: appendEvent(todayRec.value, "leaveEnd", tStr, geo),
      auditTrail: appendAuditTrail(todayRec.value, "leaveEnd", afterRecord, {
        source: "employee",
        leaveRequestId:
          leaveSegments[leaveSegments.length - 1]?.leaveRequestId || null,
        leaveType: leaveSegments[leaveSegments.length - 1]?.leaveType || null,
      }),
      ...createGeoPayload(geo, "LeaveEnd"),
    };
    await updateDoc(doc(db, "attendance", id), upd);
    todayRec.value = { ...todayRec.value, ...upd };
  } catch (e) {
    punchErr.value = t("punch_fail") + e.message;
  } finally {
    punching.value = false;
  }
}

// ── 下班打卡 ──────────────────────────────────────────────
async function punchOut() {
  punching.value = true;
  punchErr.value = "";
  geoBlocked.value = false;
  try {
    const freshSettings = await getSystemSettings();
    punchLocationCfg = freshSettings.punchLocation || punchLocationCfg;
    const geo = await checkGeofence();
    const id = `${todayStr()}_${currentUser.uid}`;
    const tStr = timeStr();
    const workSegments = cloneSegments(todayRec.value, "workSegments");
    const leaveSegments = cloneSegments(todayRec.value, "leaveSegments");
    if (todayStatus.value === "on_leave") {
      if (leaveSegments.length) {
        const lastLeave = leaveSegments[leaveSegments.length - 1];
        if (!lastLeave.end) lastLeave.end = tStr;
      }
    } else if (workSegments.length) {
      const lastWork = workSegments[workSegments.length - 1];
      if (!lastWork.end) lastWork.end = tStr;
    }
    const upd = {
      punchOut: tStr,
      currentState: "done",
      workSegments,
      leaveSegments,
      events: appendEvent(todayRec.value, "punchOut", tStr, geo),
      auditTrail: appendAuditTrail(
        todayRec.value,
        "punchOut",
        {
          ...todayRec.value,
          punchOut: tStr,
          currentState: "done",
          workSegments,
          leaveSegments,
        },
        { source: "employee" },
      ),
      ...createGeoPayload(geo, "Out"),
    };
    await updateDoc(doc(db, "attendance", id), upd);
    todayRec.value = { ...todayRec.value, ...upd };
  } catch (e) {
    punchErr.value = t("punch_fail") + e.message;
  } finally {
    punching.value = false;
  }
}

// ── 管理查詢 ──────────────────────────────────────────────
async function fetchRecords() {
  loadingRecords.value = true;
  try {
    const [snaps, allUsers] = await Promise.all([
      getDocs(
        query(
          collection(db, "attendance"),
          where("date", "==", queryDate.value),
        ),
      ),
      fetchAllUsers(),
    ]);
    const nameMap = Object.fromEntries(
      allUsers.filter((u) => u.displayName).map((u) => [u.id, u.displayName]),
    );
    allUsersCache.value = allUsers
      .filter((u) => u.displayName)
      .sort((a, b) =>
        (a.displayName || "").localeCompare(b.displayName || "", "zh-Hant"),
      );
    allRecords.value = snaps.docs.map((d) => {
      const r = { id: d.id, ...d.data() };
      if (r.uid && nameMap[r.uid]) r.name = nameMap[r.uid];
      return r;
    });
    allRecords.value.sort((a, b) =>
      (a.punchIn || "").localeCompare(b.punchIn || ""),
    );
  } catch (e) {
    console.error(e);
  } finally {
    loadingRecords.value = false;
  }
}

const filteredRecords = computed(() => {
  const kw = queryName.value.trim();
  if (!kw) return allRecords.value;
  return allRecords.value.filter(
    (r) => r.name?.includes(kw) || r.email?.includes(kw),
  );
});

function toHMS(t) {
  if (!t) return null;
  return t.length === 5 ? t + ":00" : t;
}

function openEdit(r) {
  const leaveOptions = (editModal.value.leaveOptions || []).filter(Boolean);
  editModal.value = {
    show: true,
    id: r.id,
    uid: r.uid,
    name: r.name,
    date: r.date,
    workSegments: getWorkSegments(r).map((seg) => ({
      start: seg.start ? String(seg.start).slice(0, 5) : "",
      end: seg.end ? String(seg.end).slice(0, 5) : "",
    })),
    leaveSegments: getLeaveSegments(r).map(hydrateLeaveSegment),
    leaveOptions,
    sourceRecord: { ...r },
    saving: false,
    err: "",
  };
  fetchApprovedLeaveOptions(r.uid, r.date)
    .then((options) => {
      editModal.value.leaveOptions = options;
      editModal.value.leaveSegments.forEach((seg) => {
        if (!seg.leaveRequestId) {
          const matched = matchLeaveOption(options, r.date, seg.start, seg.end);
          seg.leaveRequestId = matched?.id || "";
          seg.leaveType = matched?.type || seg.leaveType || "";
        } else {
          syncLeaveSegmentWithOption(seg, options);
        }
      });
    })
    .catch((e) => {
      console.error("fetchApprovedLeaveOptions:", e);
    });
}

function addEditWorkSegment() {
  editModal.value.workSegments.push(emptyWorkSegment());
}

function removeEditWorkSegment(index) {
  editModal.value.workSegments.splice(index, 1);
}

function addEditLeaveSegment() {
  editModal.value.leaveSegments.push(emptyLeaveSegment());
}

function removeEditLeaveSegment(index) {
  editModal.value.leaveSegments.splice(index, 1);
}

function syncEditLeaveSegment(index) {
  const seg = editModal.value.leaveSegments[index];
  if (!seg) return;
  syncLeaveSegmentWithOption(seg, editModal.value.leaveOptions || []);
}

async function saveEdit() {
  const m = editModal.value;
  m.saving = true;
  m.err = "";
  try {
    const { normalizedWork, normalizedLeave, errors } = validateSegments(
      m.workSegments,
      m.leaveSegments,
    );
    if (errors.length) {
      m.err = errors[0];
      return;
    }
    normalizedLeave.forEach((seg) => {
      if (!seg.leaveRequestId) {
        const matched = matchLeaveOption(
          m.leaveOptions || [],
          m.date,
          seg.start,
          seg.end,
        );
        seg.leaveRequestId = matched?.id || "";
        seg.leaveType = matched?.type || seg.leaveType || "";
      } else {
        syncLeaveSegmentWithOption(seg, m.leaveOptions || []);
      }
    });
    const derived = buildAttendanceStateFromSegments(
      normalizedWork,
      normalizedLeave,
    );
    const nextRecord = {
      ...m.sourceRecord,
      ...derived,
    };
    const upd = {
      punchIn: derived.punchIn,
      punchOut: derived.punchOut,
      workSegments: derived.workSegments,
      leaveSegments: derived.leaveSegments,
      currentState: derived.currentState,
      auditTrail: appendAuditTrail(m.sourceRecord, "manualEdit", nextRecord, {
        source: "admin",
      }),
      manualCorrected: true,
      correctedBy: getActorName(),
      correctedAt: new Date().toISOString(),
    };
    if (!derived.punchOut) {
      upd.punchOut = null;
      upd.gpsDistOut = null;
      upd.gpsLatOut = null;
      upd.gpsLngOut = null;
      upd.gpsAccuracyOut = null;
      upd.locationVerifiedOut = null;
    }
    await updateDoc(doc(db, "attendance", m.id), upd);
    editModal.value.show = false;
    await fetchRecords();
  } catch (e) {
    m.err = "儲存失敗：" + e.message;
  } finally {
    m.saving = false;
  }
}

function openNewRecord() {
  if (!allUsersCache.value.length) fetchRecords();
  newRecEmployeeQuery.value = "";
  newRecModal.value = {
    show: true,
    uid: "",
    date: queryDate.value,
    punchIn: "",
    punchOut: "",
    saving: false,
    err: "",
  };
}

async function saveNewRecord() {
  const m = newRecModal.value;
  if (!m.uid) {
    m.err = "請選擇員工";
    return;
  }
  if (!m.punchIn) {
    m.err = "請填上班時間";
    return;
  }
  m.saving = true;
  m.err = "";
  try {
    const employee = allUsersCache.value.find((u) => u.id === m.uid);
    const id = `${m.date}_${m.uid}`;
    await setDoc(doc(db, "attendance", id), {
      uid: m.uid,
      name: employee?.displayName || m.uid,
      email: employee?.email || "",
      date: m.date,
      punchIn: toHMS(m.punchIn),
      punchOut: toHMS(m.punchOut) ?? null,
      workSegments: buildManualWorkSegments(m.punchIn, m.punchOut),
      leaveSegments: [],
      currentState: m.punchOut ? "done" : "working",
      events: [],
      auditTrail: appendAuditTrail(
        null,
        "manualCreate",
        {
          punchIn: toHMS(m.punchIn),
          punchOut: toHMS(m.punchOut) ?? null,
          currentState: m.punchOut ? "done" : "working",
          workSegments: buildManualWorkSegments(m.punchIn, m.punchOut),
          leaveSegments: [],
        },
        { source: "admin" },
      ),
      manualCorrected: true,
      correctedBy: getActorName(),
      correctedAt: new Date().toISOString(),
    });
    newRecModal.value.show = false;
    queryDate.value = m.date;
    await fetchRecords();
  } catch (e) {
    m.err = "儲存失敗：" + e.message;
  } finally {
    m.saving = false;
  }
}

// ── 個人出勤記錄 ──────────────────────────────────────────────
const isLoggedIn = ref(false);
const personalMonth = ref(todayStr().slice(0, 7));
const loadingPersonal = ref(false);
const personalRecords = ref([]);

const personalTotalHours = computed(() => {
  let total = 0;
  for (const r of personalRecords.value) {
    const h = parseFloat(calcRecordHours(r));
    if (!isNaN(h)) total += h;
  }
  return total.toFixed(1);
});

async function fetchPersonalRecords() {
  if (!currentUser) return;
  loadingPersonal.value = true;
  try {
    const m = personalMonth.value;
    const snaps = await getDocs(
      query(collection(db, "attendance"), where("uid", "==", currentUser.uid)),
    );
    personalRecords.value = snaps.docs
      .map((d) => d.data())
      .filter((r) => r.date && r.date.startsWith(m))
      .sort((a, b) => a.date.localeCompare(b.date));
  } catch (e) {
    console.error(e);
  } finally {
    loadingPersonal.value = false;
  }
}

// ── 月出勤報表（勞工局用） ──────────────────────────────────
const WEEKDAYS_ZH = ["日", "一", "二", "三", "四", "五", "六"];
function weekDay(dateStr) {
  return WEEKDAYS_ZH[new Date(dateStr + "T00:00:00").getDay()];
}
function isWeekend(dateStr) {
  const d = new Date(dateStr + "T00:00:00").getDay();
  return d === 0 || d === 6;
}

const laborMonth = ref(todayStr().slice(0, 7));
const laborEmployee = ref("");
const loadingLabor = ref(false);
const laborData = ref([]);
const laborStaffList = ref([]);

const laborDays = computed(() => {
  const [y, m] = laborMonth.value.split("-").map(Number);
  const count = new Date(y, m, 0).getDate();
  return Array.from(
    { length: count },
    (_, i) => `${laborMonth.value}-${String(i + 1).padStart(2, "0")}`,
  );
});

function empTotalHours(emp) {
  let total = 0;
  for (const r of Object.values(emp.byDate)) {
    const h = parseFloat(calcRecordHours(r));
    if (!isNaN(h)) total += h;
  }
  return total.toFixed(1);
}

async function fetchLaborReport() {
  loadingLabor.value = true;
  try {
    const m = laborMonth.value;
    const [snaps, allUsers] = await Promise.all([
      getDocs(
        query(
          collection(db, "attendance"),
          where("date", ">=", `${m}-01`),
          where("date", "<=", `${m}-31`),
        ),
      ),
      fetchAllUsers(),
    ]);
    const nameMap = Object.fromEntries(
      allUsers.filter((u) => u.displayName).map((u) => [u.id, u.displayName]),
    );
    laborStaffList.value = allUsers
      .filter((u) => u.displayName)
      .map((u) => ({ uid: u.id, name: u.displayName }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const byUid = {};
    for (const d of snaps.docs) {
      const r = d.data();
      const uid = r.uid || r.email;
      if (!byUid[uid]) {
        byUid[uid] = {
          uid,
          name: (r.uid && nameMap[r.uid]) || r.name || uid,
          byDate: {},
        };
      }
      byUid[uid].byDate[r.date] = r;
    }
    let result = Object.values(byUid).sort((a, b) =>
      (a.name || "").localeCompare(b.name || ""),
    );
    if (laborEmployee.value) {
      result = result.filter((e) => e.uid === laborEmployee.value);
    }
    laborData.value = result;
  } catch (e) {
    console.error(e);
  } finally {
    loadingLabor.value = false;
  }
}

function printLabor() {
  window.print();
}
</script>

<style scoped>
.attendance-page {
  max-width: 760px;
  margin: 0 auto;
  padding: 16px;
}
h1 {
  font-size: 1.4rem;
  margin-bottom: 16px;
}

/* ── 打卡卡片 ── */
.punch-card {
  background: #fff;
  border: 1px solid #ddd;
  border-radius: 12px;
  padding: 28px 24px;
  text-align: center;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}
.punch-row {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 28px;
}
.punch-row .punch-card {
  flex: 1;
  min-width: 0;
}
.leave-side-panel {
  width: 145px;
  flex-shrink: 0;
  background: #fff;
  border: 1px solid #ddd;
  border-radius: 12px;
  padding: 12px 10px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  min-height: 80px;
}
.side-panel-title {
  font-size: 0.8rem;
  font-weight: 700;
  color: #1565c0;
  text-align: center;
  margin-bottom: 8px;
  border-bottom: 1px solid #e0e8f8;
  padding-bottom: 4px;
}
.side-panel-empty {
  text-align: center;
  color: #aaa;
  font-size: 0.82rem;
  margin-top: 8px;
}
.side-panel-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 3px 0;
  border-bottom: 1px solid #f0f0f0;
}
.side-panel-item:last-child {
  border-bottom: none;
}
.side-name {
  font-size: 0.82rem;
  font-weight: 500;
  color: #333;
}
.side-type {
  font-size: 0.72rem;
  color: #fff;
  background: #e57373;
  border-radius: 4px;
  padding: 1px 5px;
  white-space: nowrap;
  margin-left: 4px;
}
.side-col-right {
  width: 145px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
}
.not-punched-panel {
  border-color: #ffa726 !important;
}
.np-title {
  color: #e65100 !important;
  border-bottom-color: #ffe0b2 !important;
}
.np-refresh-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 0.95rem;
  color: #e65100;
  padding: 0 2px;
  line-height: 1;
}
.punch-date {
  font-size: 1rem;
  color: #666;
  margin-bottom: 4px;
}
.punch-time-now {
  font-size: 2.4rem;
  font-weight: 700;
  letter-spacing: 2px;
  margin-bottom: 20px;
}

.punch-status {
  font-size: 1.1rem;
  margin-bottom: 16px;
}
.punch-status.neutral {
  color: #888;
}
.punch-status.in-office {
  color: #1a7a1a;
}
.punch-status.in-office.on-leave {
  color: #a45a00;
}
.punch-status.done {
  display: flex;
  flex-direction: column;
  gap: 4px;
  color: #333;
}
.punch-status .hours {
  font-weight: 600;
  color: #1a7a1a;
}
.punch-complete {
  font-size: 1.1rem;
  color: #1a7a1a;
  font-weight: 600;
}
.punch-actions {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  justify-content: center;
}
.punch-timeline {
  max-width: 100%;
  font-size: 0.92rem;
  color: #555;
  line-height: 1.6;
}

.btn-punch {
  padding: 14px 48px;
  font-size: 1.2rem;
  font-weight: 700;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: opacity 0.15s;
}
.btn-punch:disabled {
  opacity: 0.5;
  cursor: default;
}
.btn-punch.in {
  background: #2c6e2c;
  color: #fff;
}
.btn-punch.in:hover:not(:disabled) {
  background: #235523;
}
.btn-punch.out {
  background: #c0392b;
  color: #fff;
}
.btn-punch.out:hover:not(:disabled) {
  background: #9b2d23;
}
.btn-punch.leave {
  background: #d97706;
  color: #fff;
}
.btn-punch.leave:hover:not(:disabled) {
  background: #b85f00;
}
.btn-punch.back {
  background: #2563eb;
  color: #fff;
}
.btn-punch.back:hover:not(:disabled) {
  background: #1d4ed8;
}

/* ── 管理查詢 ── */
.admin-section {
  background: #fff;
  border: 1px solid #ddd;
  border-radius: 10px;
  padding: 20px;
}
.admin-section h2 {
  margin: 0 0 12px;
  font-size: 1.1rem;
}
.toolbar-row {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}
.toolbar-row label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 0.85rem;
  color: #555;
}
.toolbar-row input {
  padding: 5px 8px;
  border: 1px solid #ccc;
  border-radius: 5px;
  font-size: 0.9rem;
}

.att-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
}
.att-table th {
  background: #f0f0f0;
  padding: 7px 10px;
  text-align: left;
  border-bottom: 2px solid #ccc;
}
.att-table td {
  padding: 7px 10px;
  border-bottom: 1px solid #eee;
}
.att-table tr:hover td {
  background: #f9f9f9;
}

.loading,
.empty {
  color: #888;
  font-size: 0.95rem;
  padding: 12px 0;
}
.err-msg {
  color: #c0392b;
  font-size: 0.9rem;
  margin-top: 10px;
}
.err-hint {
  margin-top: 6px;
  font-size: 0.82rem;
  color: #666;
  line-height: 1.6;
  background: #fff3f3;
  border-radius: 6px;
  padding: 6px 10px;
}
.badge-unverified {
  background: #f39c12;
  color: #fff;
  font-size: 0.72rem;
  padding: 1px 5px;
  border-radius: 4px;
  margin-left: 4px;
}
.badge-dist {
  background: #27ae60;
  color: #fff;
  font-size: 0.72rem;
  padding: 1px 5px;
  border-radius: 4px;
  margin-left: 4px;
}

/* ── 個人出勤記錄 ── */
.personal-section {
  background: #fff;
  border: 1px solid #ddd;
  border-radius: 10px;
  padding: 20px;
  margin-bottom: 24px;
}
.personal-section h2 {
  margin: 0 0 12px;
  font-size: 1.1rem;
}
.att-table tfoot .total-row th {
  background: #e8f0e8;
  padding: 7px 10px;
  border-top: 2px solid #ccc;
}
tr.weekend td {
  background: #f5f5f5;
  color: #999;
}
tr.no-rec td {
  color: #ccc;
}

/* ── 勞工局報表 ── */
.labor-section {
  background: #fff;
  border: 1px solid #ddd;
  border-radius: 10px;
  padding: 20px;
  margin-top: 24px;
}
.labor-toolbar h2 {
  margin: 0 0 12px;
  font-size: 1.1rem;
}
.btn-print {
  padding: 6px 16px;
  background: #2c5e9e;
  color: #fff;
  border: none;
  border-radius: 5px;
  cursor: pointer;
  font-size: 0.9rem;
  align-self: flex-end;
}
.btn-print:hover {
  background: #1e4a7e;
}
.labor-emp-block {
  margin-bottom: 32px;
}
.labor-emp-title {
  font-size: 1rem;
  font-weight: 600;
  padding: 6px 0;
  border-bottom: 2px solid #333;
  margin-bottom: 6px;
}
.labor-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.88rem;
}
.labor-table th {
  background: #e8e8e8;
  padding: 6px 8px;
  text-align: center;
  border: 1px solid #bbb;
}
.labor-table td {
  padding: 5px 8px;
  text-align: center;
  border: 1px solid #ddd;
}
.labor-table .total-row th {
  background: #d4e8d4;
  border: 1px solid #bbb;
}
.labor-sign-row {
  margin-top: 20px;
  font-size: 0.9rem;
  color: #444;
  border-top: 1px solid #ccc;
  padding-top: 10px;
}

/* ── 補打/修改按鈕 ── */
.btn-add-punch {
  padding: 6px 14px;
  background: #27ae60;
  color: #fff;
  border: none;
  border-radius: 5px;
  cursor: pointer;
  font-size: 0.9rem;
  align-self: flex-end;
}
.btn-add-punch:hover {
  background: #1e8449;
}
.punch-count-badge {
  display: inline-flex;
  align-items: center;
  padding: 4px 14px;
  border-radius: 20px;
  background: #eaf4fb;
  color: #1a6fa0;
  font-weight: 600;
  font-size: 0.95rem;
  border: 1px solid #b3d8ef;
}
.btn-edit-sm {
  padding: 3px 10px;
  font-size: 0.8rem;
  background: #2980b9;
  color: #fff;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  white-space: nowrap;
}
.btn-edit-sm:hover {
  background: #1a6090;
}
.badge-corrected {
  background: #8e44ad;
  color: #fff;
  font-size: 0.7rem;
  padding: 1px 5px;
  border-radius: 4px;
  margin-left: 4px;
  cursor: default;
}

/* ── Modal ── */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.modal-box {
  background: #fff;
  border-radius: 10px;
  padding: 28px 28px 22px;
  width: 340px;
  max-width: 95vw;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
}
.modal-box h3 {
  margin: 0 0 12px;
  font-size: 1.1rem;
}
.modal-info {
  font-size: 0.9rem;
  color: #555;
  margin-bottom: 16px;
}
.form-row {
  margin-bottom: 14px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.form-row label {
  font-size: 0.85rem;
  color: #444;
}
.form-helper {
  font-size: 0.8rem;
  color: #777;
}
.form-row input[type="time"],
.form-row input[type="date"],
.form-row input[type="search"],
.form-row select {
  padding: 6px 8px;
  border: 1px solid #ccc;
  border-radius: 5px;
  font-size: 0.95rem;
  width: 100%;
}
.time-row {
  display: flex;
  gap: 8px;
  align-items: center;
}
.time-row input {
  flex: 1;
}
.btn-clear-time {
  padding: 5px 10px;
  font-size: 0.8rem;
  background: #e74c3c;
  color: #fff;
  border: none;
  border-radius: 4px;
  width: 680px;
  white-space: nowrap;
}
.btn-clear-time:hover {
  background: #c0392b;
}
.modal-err {
  color: #c0392b;
  font-size: 0.88rem;
  margin-bottom: 10px;
}
.segment-editor {
  display: grid;
  gap: 16px;
}
.segment-section {
  border: 1px solid #e3e3e3;
  border-radius: 8px;
  padding: 12px;
  background: #fafafa;
}
.segment-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}
.segment-head label {
  font-size: 0.9rem;
  font-weight: 700;
  color: #333;
}
.segment-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr) minmax(
      0,
      1.4fr
    ) auto;
  gap: 8px;
  align-items: center;
  margin-bottom: 8px;
}
.segment-row:last-child {
  margin-bottom: 0;
}
.segment-row span {
  color: #666;
  font-size: 0.85rem;
}
.segment-row input,
.segment-row select {
  min-width: 0;
}
.segment-row:not(.segment-row-leave) {
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr) auto;
}
.segment-empty,
.segment-help {
  font-size: 0.84rem;
  color: #666;
}
.segment-help {
  margin-top: 8px;
}
.btn-add-segment,
.btn-remove-segment {
  border: none;
  border-radius: 5px;
  cursor: pointer;
  font-size: 0.85rem;
}
.btn-add-segment {
  background: #eef3ff;
  color: #2447a5;
  padding: 6px 10px;
}
.btn-add-segment:hover {
  background: #dbe6ff;
}
.btn-remove-segment {
  background: #fce8e6;
  color: #b42318;
  padding: 6px 8px;
}
.btn-remove-segment:hover {
  background: #fad2cf;
}
.modal-btns {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  margin-top: 6px;
}
.btn-save {
  padding: 7px 20px;
  background: #2c5e9e;
  color: #fff;
  .modal-box {
    width: 95vw;
    padding: 20px 16px 18px;
  }
  .segment-row,
  .segment-row:not(.segment-row-leave) {
    grid-template-columns: 1fr;
  }
  border: none;
  border-radius: 5px;
  cursor: pointer;
  font-size: 0.9rem;
}
.btn-save:disabled {
  opacity: 0.6;
  cursor: default;
}
.btn-save:not(:disabled):hover {
  background: #1e4a7e;
}
.btn-cancel {
  padding: 7px 16px;
  background: #bbb;
  color: #fff;
  border: none;
  border-radius: 5px;
  cursor: pointer;
  font-size: 0.9rem;
}
.btn-cancel:hover {
  background: #999;
}

/* ── 手機響應式：側邊請假面板改為上下排列 ── */
@media (max-width: 640px) {
  .punch-row {
    flex-direction: column;
  }
  .leave-side-panel {
    width: 100%;
    min-height: unset;
    padding: 8px 12px;
  }
  .side-panel-title {
    display: inline;
    margin-right: 8px;
    border-bottom: none;
    padding-bottom: 0;
  }
  .side-panel-item {
    display: inline-flex;
    margin-right: 10px;
    border-bottom: none;
    padding: 0;
  }
  .side-name::after {
    content: "\00a0";
  }
}

/* ── 列印樣式 ── */
@media print {
  nav,
  header,
  h1,
  .punch-card,
  .personal-section,
  .admin-section,
  .labor-toolbar {
    display: none !important;
  }
  .labor-section {
    border: none;
    padding: 0;
    margin: 0;
  }
  .labor-emp-block {
    page-break-after: always;
  }
  .labor-table {
    font-size: 10pt;
  }
}

/* 待審提醒 banner */
.pending-banner {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  background: linear-gradient(90deg, #fff8e1 0%, #ffecb3 100%);
  border: 1px solid #ffb300;
  border-left: 5px solid #f57c00;
  border-radius: 8px;
  padding: 0.7rem 1rem;
  margin: 0.4rem 0 1rem;
  color: #5d4037;
  text-decoration: none;
  font-size: 0.95rem;
  transition: background 0.15s;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}
.pending-banner:hover {
  background: linear-gradient(90deg, #fff3c4 0%, #ffd54f 100%);
}
.pending-banner .pb-icon {
  font-size: 1.3rem;
}
.pending-banner .pb-text {
  flex: 1;
}
.pending-banner .pb-text b {
  color: #d84315;
  font-size: 1.1rem;
  padding: 0 0.15rem;
}
.pending-banner .pb-detail {
  color: #6d4c41;
  font-size: 0.85rem;
  margin-left: 0.4rem;
}
.pending-banner .pb-link {
  color: #1565c0;
  font-weight: 600;
  white-space: nowrap;
}
@media print {
  .pending-banner {
    display: none !important;
  }
}
</style>
