<template>
  <section class="attendance-page">
    <h1>{{ t("attendance_title") }}</h1>

    <!-- ── 員工打卡區 ─────────────────────────────────────── -->
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
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in filteredRecords" :key="r.id">
            <td>{{ r.name }}</td>
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
          </tr>
        </tbody>
      </table>
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

  await loadTodayRec();
  if (isAdminOrManager.value) fetchRecords();
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
  margin-bottom: 28px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
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
</style>
