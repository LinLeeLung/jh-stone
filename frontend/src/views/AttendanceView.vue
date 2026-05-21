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
        <div v-for="r in todayLeaveList" :key="r.name + r.type" class="side-panel-item">
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
        <div class="punch-status in-office">
          {{ t("punched_in") }}{{ todayRec.punchIn }}
        </div>
        <button class="btn-punch out" @click="punchOut" :disabled="punching">
          {{ punching ? t("processing") : t("punch_out_btn") }}
        </button>
      </template>
      <template v-else>
        <div class="punch-status done">
          <span>{{ t("punched_in") }}{{ todayRec.punchIn }}</span>
          <span>{{ t("punched_out") }}{{ todayRec.punchOut }}</span>
          <span class="hours"
            >{{ t("work_hours_label")
            }}{{ calcHours(todayRec.punchIn, todayRec.punchOut) }}
            {{ t("hr_unit") }}</span
          >
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

      <!-- 明日請假 -->
      <div class="leave-side-panel">
        <div class="side-panel-title">明日請假</div>
        <div v-if="!tomorrowLeaveList.length" class="side-panel-empty">無</div>
        <div v-for="r in tomorrowLeaveList" :key="r.name + r.type" class="side-panel-item">
          <span class="side-name">{{ r.name }}</span>
          <span class="side-type">{{ r.type }}</span>
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
            <td>{{ r.punchIn || "—" }}</td>
            <td>{{ r.punchOut || "—" }}</td>
            <td>
              {{
                r.punchIn && r.punchOut
                  ? calcHours(r.punchIn, r.punchOut) + " h"
                  : "—"
              }}
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
          <button class="btn-add-punch" @click="openNewRecord">＋ 補打卡</button>
          <span class="punch-count-badge">打卡人數：{{ allRecords.length }} 人</span>
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
              <span v-if="r.manualCorrected" class="badge-corrected" :title="'補打/修改 by ' + (r.correctedBy || '管理者')">補打</span>
            </td>
            <td>{{ r.email }}</td>
            <td>
              {{ r.punchIn || "—" }}
              <span v-if="r.locationVerified === false" class="badge-unverified"
                >未驗證</span
              >
              <span v-else-if="r.gpsDist != null" class="badge-dist"
                >{{ r.gpsDist }}m</span
              >
            </td>
            <td>
              {{ r.punchOut || "—" }}
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
              {{
                r.punchIn && r.punchOut
                  ? calcHours(r.punchIn, r.punchOut) + " h"
                  : "—"
              }}
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
                    emp.byDate[day]?.punchIn || (isWeekend(day) ? "休" : "—")
                  }}
                </td>
                <td>
                  {{
                    emp.byDate[day]?.punchOut || (isWeekend(day) ? "休" : "—")
                  }}
                </td>
                <td>
                  {{
                    emp.byDate[day]?.punchIn && emp.byDate[day]?.punchOut
                      ? calcHours(
                          emp.byDate[day].punchIn,
                          emp.byDate[day].punchOut,
                        ) + " h"
                      : "—"
                  }}
                </td>
                <td></td>
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
    <div v-if="editModal.show" class="modal-overlay" @click.self="editModal.show = false">
      <div class="modal-box">
        <h3>修改打卡記錄</h3>
        <div class="modal-info">{{ editModal.name }}&emsp;{{ editModal.date }}</div>
        <div class="form-row">
          <label>上班時間（必填）</label>
          <input type="time" v-model="editModal.punchIn" step="1" />
        </div>
        <div class="form-row">
          <label>下班時間（留空 = 清除誤打卡）</label>
          <div class="time-row">
            <input type="time" v-model="editModal.punchOut" step="1" />
            <button class="btn-clear-time" @click="editModal.punchOut = ''">清除</button>
          </div>
        </div>
        <div v-if="editModal.err" class="modal-err">{{ editModal.err }}</div>
        <div class="modal-btns">
          <button class="btn-save" :disabled="editModal.saving" @click="saveEdit">
            {{ editModal.saving ? "儲存中…" : "儲存" }}
          </button>
          <button class="btn-cancel" @click="editModal.show = false">取消</button>
        </div>
      </div>
    </div>

    <!-- ── 補打卡 modal ───────────────────────────────────── -->
    <div v-if="newRecModal.show" class="modal-overlay" @click.self="newRecModal.show = false">
      <div class="modal-box">
        <h3>補打卡（手動新增）</h3>
        <div class="form-row">
          <label>員工</label>
          <select v-model="newRecModal.uid">
            <option value="">請選擇員工</option>
            <option v-for="u in allUsersCache" :key="u.id" :value="u.id">
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
        <div v-if="newRecModal.err" class="modal-err">{{ newRecModal.err }}</div>
        <div class="modal-btns">
          <button class="btn-save" :disabled="newRecModal.saving" @click="saveNewRecord">
            {{ newRecModal.saving ? "儲存中…" : "儲存" }}
          </button>
          <button class="btn-cancel" @click="newRecModal.show = false">取消</button>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from "vue";
import { auth, db, authReadyPromise } from "../firebase";
import { getUserByUid, getSystemSettings, fetchAllUsers } from "../firebase";
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
  allowOnFail: true,
  lat: null,
  lng: null,
  radiusMeters: 200,
};

const loadingRecords = ref(false);
const allRecords = ref([]);
const queryDate = ref(todayStr());
const queryName = ref("");
const allUsersCache = ref([]);

// ── 修改打卡 modal ──────────────────────────────────────────
const editModal = ref({ show: false, id: "", uid: "", name: "", date: "", punchIn: "", punchOut: "", saving: false, err: "" });
// ── 補打卡 modal ────────────────────────────────────────────
const newRecModal = ref({ show: false, uid: "", date: "", punchIn: "", punchOut: "", saving: false, err: "" });

// ── 今明日請假名單 ─────────────────────────────────
const todayLeaveList = ref([]);
const tomorrowLeaveList = ref([]);

async function fetchDayLeaves() {
  try {
    const today = todayStr();
    const tmr = new Date();
    tmr.setDate(tmr.getDate() + 1);
    const tomorrow = tmr.toLocaleDateString("sv-SE");
    const snap = await getDocs(
      query(
        collection(db, "leaveRequests"),
        where("endDate", ">=", today),
      ),
    );
    const recs = snap.docs
      .map((d) => ({ ...d.data() }))
      .filter(
        (r) =>
          (r.status === "approved1" || r.status === "approved2") &&
          r.startDate <= tomorrow,
      );

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
  isAdminOrManager.value =
    userDoc?.role === "admin" || userDoc?.role === "管理者";

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
});

onUnmounted(() => clearInterval(clockTimer));

// ── 讀取今日打卡 ──────────────────────────────────────────
async function loadTodayRec() {
  loaded.value = false;
  punchErr.value = "";
  const id = `${todayStr()}_${currentUser.uid}`;
  try {
    const { getDoc } = await import("firebase/firestore");
    const snap = await getDoc(doc(db, "attendance", id));
    todayRec.value = snap.exists() ? snap.data() : null;
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
        query(
          collection(db, "staff"),
          where("email", "==", currentUser.email),
        ),
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
// 回傳 { ok: true } 或 { ok: false, warn: '...' }（allowOnFail 時）
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
      if (cfg.allowOnFail) {
        resolve({ ok: false, warn: "瀏覽器不支援 GPS，位置未驗證" });
        return;
      }
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
        if (cfg.allowOnFail) {
          resolve({ ok: false, warn: msg + t("geo_unverified") });
        } else {
          reject(new Error(msg));
        }
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
    if (!geo.ok) throw new Error(geo.warn || t("geo_fail"));
    const id = `${todayStr()}_${currentUser.uid}`;
    const data = {
      uid: currentUser.uid,
      name: currentUser.displayName || currentUser.email,
      email: currentUser.email,
      date: todayStr(),
      punchIn: timeStr(),
      punchOut: null,
      locationVerified: true,
      ...(geo.lat != null
        ? {
            gpsLat: geo.lat,
            gpsLng: geo.lng,
            gpsAccuracy: geo.accuracy,
            gpsDist: geo.dist,
          }
        : {}),
    };
    await setDoc(doc(db, "attendance", id), data);
    todayRec.value = data;
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
    if (!geo.ok) throw new Error(geo.warn || t("geo_fail"));
    const id = `${todayStr()}_${currentUser.uid}`;
    const tStr = timeStr();
    const upd = { punchOut: tStr };
    if (geo.lat != null) {
      upd.gpsLatOut = geo.lat;
      upd.gpsLngOut = geo.lng;
      upd.gpsAccuracyOut = geo.accuracy;
      upd.gpsDistOut = geo.dist;
    }
    await updateDoc(doc(db, "attendance", id), upd);
    todayRec.value = { ...todayRec.value, punchOut: tStr };
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
      .sort((a, b) => (a.displayName || "").localeCompare(b.displayName || "", "zh-Hant"));
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
  editModal.value = {
    show: true,
    id: r.id,
    uid: r.uid,
    name: r.name,
    date: r.date,
    punchIn: (r.punchIn || "").slice(0, 5),
    punchOut: (r.punchOut || "").slice(0, 5),
    saving: false,
    err: "",
  };
}

async function saveEdit() {
  const m = editModal.value;
  if (!m.punchIn) { m.err = "請填上班時間"; return; }
  m.saving = true; m.err = "";
  try {
    const upd = {
      punchIn: toHMS(m.punchIn),
      punchOut: toHMS(m.punchOut) ?? null,
      manualCorrected: true,
      correctedBy: userDoc?.name || currentUser?.displayName || currentUser?.email || "admin",
      correctedAt: new Date().toISOString(),
    };
    // 清除下班打卡時，同時清掉舊的 GPS 距離欄位，避免殘留標籤
    if (!m.punchOut) {
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
  newRecModal.value = { show: true, uid: "", date: queryDate.value, punchIn: "", punchOut: "", saving: false, err: "" };
}

async function saveNewRecord() {
  const m = newRecModal.value;
  if (!m.uid) { m.err = "請選擇員工"; return; }
  if (!m.punchIn) { m.err = "請填上班時間"; return; }
  m.saving = true; m.err = "";
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
      manualCorrected: true,
      correctedBy: userDoc?.name || currentUser?.displayName || currentUser?.email || "admin",
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
    if (r.punchIn && r.punchOut) {
      const h = parseFloat(calcHours(r.punchIn, r.punchOut));
      if (!isNaN(h)) total += h;
    }
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
    if (r.punchIn && r.punchOut) {
      const h = parseFloat(calcHours(r.punchIn, r.punchOut));
      if (!isNaN(h)) total += h;
    }
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
  box-shadow: 0 2px 8px rgba(0,0,0,.06);
  min-height: 80px;
}
.side-panel-title {
  font-size: .8rem;
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
  font-size: .82rem;
  margin-top: 8px;
}
.side-panel-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 3px 0;
  border-bottom: 1px solid #f0f0f0;
}
.side-panel-item:last-child { border-bottom: none; }
.side-name { font-size: .82rem; font-weight: 500; color: #333; }
.side-type {
  font-size: .72rem;
  color: #fff;
  background: #e57373;
  border-radius: 4px;
  padding: 1px 5px;
  white-space: nowrap;
  margin-left: 4px;
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
.btn-add-punch:hover { background: #1e8449; }
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
.btn-edit-sm:hover { background: #1a6090; }
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
  background: rgba(0,0,0,0.45);
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
  box-shadow: 0 8px 32px rgba(0,0,0,0.2);
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
.form-row input[type="time"],
.form-row input[type="date"],
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
.time-row input { flex: 1; }
.btn-clear-time {
  padding: 5px 10px;
  font-size: 0.8rem;
  background: #e74c3c;
  color: #fff;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  white-space: nowrap;
}
.btn-clear-time:hover { background: #c0392b; }
.modal-err {
  color: #c0392b;
  font-size: 0.88rem;
  margin-bottom: 10px;
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
  border: none;
  border-radius: 5px;
  cursor: pointer;
  font-size: 0.9rem;
}
.btn-save:disabled { opacity: 0.6; cursor: default; }
.btn-save:not(:disabled):hover { background: #1e4a7e; }
.btn-cancel {
  padding: 7px 16px;
  background: #bbb;
  color: #fff;
  border: none;
  border-radius: 5px;
  cursor: pointer;
  font-size: 0.9rem;
}
.btn-cancel:hover { background: #999; }

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
  .side-name::after { content: "\00a0"; }
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
