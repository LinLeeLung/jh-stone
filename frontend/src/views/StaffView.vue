<template>
  <section class="page-card">
    <div class="page-head sticky-page-head">
      <h1>員工基本資料</h1>
      <div style="display: flex; gap: 8px">
        <button class="btn-query" @click="openAdd">＋ 新增員工</button>
        <button class="btn-aux" @click="triggerImport">📥 匯入 Excel</button>
        <input
          ref="fileInputRef"
          type="file"
          accept=".xlsx,.xls,.csv"
          style="display: none"
          @change="onFileChange"
        />
      </div>
    </div>

    <div v-if="loading" class="muted-text">讀取中…</div>

    <div v-else-if="!isAdmin" class="muted-text">您沒有權限存取此頁面。</div>

    <div v-else>
      <!-- 搜尋列 -->
      <div class="toolbar-row">
        <input
          v-model="search"
          placeholder="搜尋姓名 / 員工編號 / 部門…"
          class="search-input"
        />
        <label class="checkbox-label">
          敏感資料
          <select v-model="sensitiveView" class="sensitive-select">
            <option value="hidden">先隱藏</option>
            <option value="all">全部顯示</option>
            <option
              v-for="s in sensitiveOptions"
              :key="`sv-${s.empNo}`"
              :value="String(s.empNo)"
            >
              {{ s.empNo }} {{ s.name }}
            </option>
          </select>
        </label>
        <label class="checkbox-label">
          <input type="checkbox" v-model="onlyActive" />
          只顯示在職
        </label>
        <span class="staff-count">共 {{ filtered.length }} 人</span>
      </div>

      <!-- 員工列表 -->
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th class="sortable" @click="setSort('empNo')">
                員工編號 {{ sortIcon("empNo") }}
              </th>
              <th class="sortable" @click="setSort('name')">
                姓名 {{ sortIcon("name") }}
              </th>
              <th class="sortable" @click="setSort('dept')">
                部門 {{ sortIcon("dept") }}
              </th>
              <th class="sortable" @click="setSort('title')">
                職稱 {{ sortIcon("title") }}
              </th>
              <th class="sortable" @click="setSort('startDate')">
                到職日 {{ sortIcon("startDate") }}
              </th>
              <th class="sortable" @click="setSort('salaryType')">
                薪資類型 {{ sortIcon("salaryType") }}
              </th>
              <th class="sortable" @click="setSort('baseSalary')">
                底薪 {{ sortIcon("baseSalary") }}
              </th>
              <th class="sortable" @click="setSort('status')">
                狀態 {{ sortIcon("status") }}
              </th>
              <th>動作</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="s in filtered"
              :key="s.id"
              :class="{ inactive: s.status === '離職' }"
            >
              <td>{{ s.empNo }}</td>
              <td>{{ s.name }}</td>
              <td>{{ deptLabel(s.dept) }}</td>
              <td>{{ s.title }}</td>
              <td>{{ s.startDate }}</td>
              <td>{{ s.salaryType }}</td>
              <td>
                {{ maskSensitive(s, s.baseSalary?.toLocaleString() || "—") }}
              </td>
              <td>
                <span
                  :class="[
                    'badge',
                    s.status === '在職' ? 'badge-ok' : 'badge-off',
                  ]"
                >
                  {{ s.status }}
                </span>
              </td>
              <td>
                <button class="btn-aux" @click="openEdit(s)">編輯</button>
              </td>
            </tr>
            <tr v-if="filtered.length === 0">
              <td colspan="9" class="muted-text" style="text-align: center">
                查無資料
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- 匯入預覽對話框 -->
    <div
      v-if="importDialog.open"
      class="modal-backdrop"
      @click.self="closeImport"
    >
      <div class="modal-box" style="max-width: 900px">
        <h2>匯入員工資料 — 欄位對應</h2>

        <!-- 欄位對應 -->
        <div class="map-grid">
          <template v-for="f in FIELDS" :key="f.key">
            <span class="map-label">{{ f.label }}</span>
            <select v-model="colMap[f.key]" class="map-select">
              <option value="">(略過)</option>
              <option v-for="h in importHeaders" :key="h" :value="h">
                {{ h }}
              </option>
            </select>
          </template>
        </div>

        <!-- 預覽前 5 筆 -->
        <div
          class="table-wrap"
          style="margin-top: 12px; max-height: 260px; overflow: auto"
        >
          <table class="data-table" style="font-size: 12px">
            <thead>
              <tr>
                <th v-for="h in importHeaders" :key="h">{{ h }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, i) in importRows.slice(0, 5)" :key="i">
                <td v-for="h in importHeaders" :key="h">{{ row[h] }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div v-if="importErrMsg" class="err-msg">{{ importErrMsg }}</div>

        <div class="modal-actions">
          <button class="btn-query" @click="doImport" :disabled="importing">
            {{ importing ? "匯入中…" : `確認匯入 ${importRows.length} 筆` }}
          </button>
          <button class="btn-aux" @click="closeImport">取消</button>
        </div>
      </div>
    </div>

    <!-- 新增 / 編輯對話框 -->
    <div v-if="dialog.open" class="modal-backdrop" @click.self="closeDialog">
      <div class="modal-box">
        <h2>{{ dialog.isNew ? "新增員工" : "編輯員工" }}</h2>

        <div class="form-grid">
          <label
            >員工編號
            <input v-model="form.empNo" :disabled="!dialog.isNew" />
          </label>
          <label
            >姓名 <span class="req">*</span>
            <input v-model="form.name" />
          </label>
          <label
            >身份證字號
            <input v-model="form.idNo" />
          </label>
          <label
            >生日
            <input type="date" v-model="form.birthday" />
          </label>
          <label
            >配偶
            <select v-model="form.spouse">
              <option value="">（未設定）</option>
              <option value="已">已婚</option>
              <option value="未">未婚</option>
            </select>
          </label>
          <label
            >扶養人數
            <input type="number" v-model.number="form.numDependents" min="0" />
          </label>
          <label
            >手機
            <input v-model="form.phone" />
          </label>
          <label
            >電郵
            <input type="email" v-model="form.email" />
          </label>
          <label class="full"
            >地址
            <input v-model="form.address" />
          </label>
          <label
            >部門
            <input v-model="form.dept" list="dept-list" />
            <datalist id="dept-list">
              <option v-for="d in depts" :key="d" :value="d">
                {{ deptLabel(d) }}
              </option>
            </datalist>
          </label>
          <label
            >職稱
            <input v-model="form.title" />
          </label>
          <label
            >到職日
            <input type="date" v-model="form.startDate" />
          </label>
          <label
            >離職日
            <input type="date" v-model="form.endDate" />
          </label>
          <label
            >薪資類型
            <select v-model="form.salaryType">
              <option>月薪</option>
              <option>時薪</option>
              <option>日薪</option>
            </select>
          </label>
          <label
            >底薪（元）
            <input type="number" v-model.number="form.baseSalary" min="0" />
          </label>
          <label
            >獎金(1)（元）
            <input type="number" v-model.number="form.bonus1" min="0" />
          </label>
          <label
            >獎金(2)（元）
            <input type="number" v-model.number="form.bonus2" min="0" />
          </label>
          <label
            >獎金(3)（元）
            <input type="number" v-model.number="form.bonus3" min="0" />
          </label>
          <label
            >獎金(4)（元）
            <input type="number" v-model.number="form.bonus4" min="0" />
          </label>
          <label
            >獎金(5)（元）
            <input type="number" v-model.number="form.bonus5" min="0" />
          </label>
          <label
            >勞保薪資（投保級距）
            <input
              type="number"
              v-model.number="form.laborInsuranceSalary"
              min="0"
            />
          </label>
          <label
            >健保薪資（投保級距）
            <input
              type="number"
              v-model.number="form.healthInsuranceSalary"
              min="0"
            />
          </label>
          <label
            >勞保費扣（元）
            <input type="number" v-model.number="form.laborInsurance" min="0" />
          </label>
          <label
            >健保費扣（本人）（元）
            <input
              type="number"
              v-model.number="form.healthInsurance"
              min="0"
            />
          </label>
          <label
            >眿屬健保費（元）
            <input
              type="number"
              v-model.number="form.dependentHealth"
              min="0"
            />
          </label>
          <label
            >減項互助金（元）
            <input type="number" v-model.number="form.mutualAid" min="0" />
          </label>
          <label
            >便當費扣（元/月）
            <input type="number" v-model.number="form.lunchFee" min="0" />
          </label>
          <label
            >房租-外勞（元/月）
            <input type="number" v-model.number="form.foreignRent" min="0" />
          </label>
          <label
            >水費（元/月）
            <input type="number" v-model.number="form.waterFee" min="0" />
          </label>
          <label
            >電費（元/月）
            <input type="number" v-model.number="form.electricFee" min="0" />
          </label>
          <label
            >體檢費-外勞（元）
            <input type="number" v-model.number="form.foreignMedical" min="0" />
          </label>
          <label
            >服務費-外勞（元/月）
            <input type="number" v-model.number="form.foreignService" min="0" />
          </label>
          <label
            >其他減項（元/月）
            <input type="number" v-model.number="form.otherDeduction" min="0" />
          </label>
          <label
            >其他減項原因
            <input v-model="form.otherDeductionNote" placeholder="可備註原因" />
          </label>
          <label
            >銀行 / 分行
            <input v-model="form.bankName" placeholder="例：台銀 信義分行" />
          </label>
          <label
            >銀行帳號
            <input v-model="form.bankAccount" />
          </label>
          <label
            >緊急聯絡人
            <input v-model="form.emergencyName" />
          </label>
          <label
            >緊急聯絡電話
            <input v-model="form.emergencyPhone" />
          </label>
          <label
            >角色
            <select v-model="form.staffRole">
              <option value="">（未設定）</option>
              <option>員工</option>
              <option>主管</option>
              <option>HR</option>
            </select>
          </label>
          <label
            >狀態
            <select v-model="form.status">
              <option>在職</option>
              <option>離職</option>
            </select>
          </label>
          <label class="full"
            >備註
            <textarea v-model="form.note" rows="3" />
          </label>
        </div>

        <div v-if="errMsg" class="err-msg">{{ errMsg }}</div>

        <div class="modal-actions">
          <button class="btn-query" @click="save" :disabled="saving">
            {{ saving ? "儲存中…" : "儲存" }}
          </button>
          <button class="btn-aux" @click="closeDialog">取消</button>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { ref, computed, onMounted } from "vue";
import {
  db,
  auth,
  getUserByUid,
  authReadyPromise,
  userHasAnyRole,
} from "../firebase";
import {
  collection,
  getDocs,
  doc,
  setDoc,
  updateDoc,
  orderBy,
  query,
  where,
  writeBatch,
} from "firebase/firestore";

let XLSX;

async function loadXlsx() {
  if (!XLSX) XLSX = await import("xlsx");
  return XLSX;
}

// ── 欄位定義（系統欄位 ↔ Excel 標題對應）───────────────────
const FIELDS = [
  { key: "empNo", label: "員工編號" },
  { key: "name", label: "姓名" },
  { key: "idNo", label: "身份證字號" },
  { key: "spouse", label: "配偶" },
  { key: "numDependents", label: "扶養人數", type: "number" },
  { key: "birthday", label: "生日" },
  { key: "phone", label: "手機" },
  { key: "email", label: "電郵" },
  { key: "address", label: "地址" },
  { key: "dept", label: "部門" },
  { key: "title", label: "職稱" },
  { key: "startDate", label: "到職日" },
  { key: "endDate", label: "離職日" },
  { key: "salaryType", label: "薪資類型" },
  { key: "baseSalary", label: "底薪" },
  { key: "bankName", label: "銀行/分行" },
  { key: "bankAccount", label: "銀行帳號" },
  { key: "emergencyName", label: "緊急聯絡人" },
  { key: "emergencyPhone", label: "緊急聯絡電話" },
  { key: "bonus1", label: "獎金(1)", type: "number" },
  { key: "bonus2", label: "獎金(2)", type: "number" },
  { key: "bonus3", label: "獎金(3)", type: "number" },
  { key: "bonus4", label: "獎金(4)", type: "number" },
  { key: "bonus5", label: "獎金(5)", type: "number" },
  { key: "laborInsuranceSalary", label: "勞保薪資", type: "number" },
  { key: "healthInsuranceSalary", label: "健保薪資", type: "number" },
  { key: "laborInsurance", label: "勞保費扣", type: "number" },
  { key: "healthInsurance", label: "健保費扣（本人）", type: "number" },
  { key: "dependentHealth", label: "健保費扣（眷屬）", type: "number" },
  { key: "mutualAid", label: "減項互助金", type: "number" },
  { key: "lunchFee", label: "便當費扣", type: "number" },
  { key: "foreignRent", label: "房租-外勞", type: "number" },
  { key: "waterFee", label: "水費", type: "number" },
  { key: "electricFee", label: "電費", type: "number" },
  { key: "foreignMedical", label: "體檢費-外勞", type: "number" },
  { key: "foreignService", label: "服務費-外勞", type: "number" },
  { key: "otherDeduction", label: "其他減項", type: "number" },
  { key: "otherDeductionNote", label: "其他減項原因" },
  { key: "staffRole", label: "角色" },
  { key: "status", label: "狀態" },
  { key: "note", label: "備註" },
];

// 自動偵測：Excel 標題 → 系統欄位 key
const AUTO_MAP = {
  員工編號: "empNo",
  工號: "empNo",
  姓名: "name",
  員工姓名: "name",
  身份證: "idNo",
  身分證: "idNo",
  身份證字號: "idNo",
  配偶: "spouse",
  扶養人數: "numDependents",
  生日: "birthday",
  出生日期: "birthday",
  手機: "phone",
  電話: "phone",
  聯絡電話: "phone",
  電郵: "email",
  Email: "email",
  信箱: "email",
  地址: "address",
  部門: "dept",
  職稱: "title",
  職位: "title",
  到職日: "startDate",
  入職日: "startDate",
  離職日: "endDate",
  薪資類型: "salaryType",
  薪別: "salaryType",
  底薪: "baseSalary",
  基本薪資: "baseSalary",
  月薪: "baseSalary",
  銀行: "bankName",
  "銀行/分行": "bankName",
  銀行帳號: "bankAccount",
  帳號: "bankAccount",
  緊急聯絡人: "emergencyName",
  緊急聯絡電話: "emergencyPhone",
  獎金1: "bonus1",
  "獎金(1)": "bonus1",
  獎金2: "bonus2",
  "獎金(2)": "bonus2",
  獎金3: "bonus3",
  "獎金(3)": "bonus3",
  獎金4: "bonus4",
  "獎金(4)": "bonus4",
  獎金5: "bonus5",
  "獎金(5)": "bonus5",
  勞保薪資: "laborInsuranceSalary",
  健保薪資: "healthInsuranceSalary",
  勞保費扣: "laborInsurance",
  勞保費: "laborInsurance",
  健保費扣: "healthInsurance",
  健保費: "healthInsurance",
  眷屬健保費: "dependentHealth",
  眷屬健保: "dependentHealth",
  互助金: "mutualAid",
  減項互助金: "mutualAid",
  便當費扣: "lunchFee",
  便當費: "lunchFee",
  "房租-外勞": "foreignRent",
  房租: "foreignRent",
  水費: "waterFee",
  電費: "electricFee",
  "體檢費-外勞": "foreignMedical",
  體檢費: "foreignMedical",
  "服務費-外勞": "foreignService",
  服務費: "foreignService",
  其他減項: "otherDeduction",
  其他扣項: "otherDeduction",
  其他減項原因: "otherDeductionNote",
  其他扣項原因: "otherDeductionNote",
  角色: "staffRole",
  員工角色: "staffRole",
  狀態: "status",
  在離職: "status",
  備註: "note",
};

// ── 狀態 ─────────────────────────────────────────────────
const loading = ref(true);
const isAdmin = ref(false);
const staffList = ref([]);
const search = ref("");
const onlyActive = ref(true);
const sensitiveView = ref("hidden");
const saving = ref(false);
const errMsg = ref("");

const deptMap = { 1: "辦公室", 2: "安裝", 3: "廠內", 4: "外勞" };
const depts = ["1", "2", "3", "4"];
function deptLabel(v) {
  return deptMap[String(v)] ? `${v} ${deptMap[String(v)]}` : v || "—";
}

// ── 筛選 + 排序 ────────────────────────────────────────────
const sortKey = ref("empNo");
const sortDir = ref(1); // 1=遠小 -1=遠大

function setSort(key) {
  if (sortKey.value === key) sortDir.value *= -1;
  else {
    sortKey.value = key;
    sortDir.value = 1;
  }
}

function sortIcon(key) {
  if (sortKey.value !== key) return "▽";
  return sortDir.value === 1 ? "▲" : "▼";
}

const filtered = computed(() => {
  const kw = search.value.trim().toLowerCase();
  let list = staffList.value.filter((s) => {
    if (onlyActive.value && s.status === "離職") return false;
    if (!kw) return true;
    return (
      (s.name || "").toLowerCase().includes(kw) ||
      (s.empNo || "").toLowerCase().includes(kw) ||
      (s.dept || "").toLowerCase().includes(kw)
    );
  });

  const key = sortKey.value;
  const dir = sortDir.value;
  list.sort((a, b) => {
    let va = a[key] ?? "";
    let vb = b[key] ?? "";
    if (key === "empNo" || key === "baseSalary") {
      va = Number(va) || 0;
      vb = Number(vb) || 0;
      return (va - vb) * dir;
    }
    return String(va).localeCompare(String(vb), "zh-TW") * dir;
  });
  return list;
});

const sensitiveOptions = computed(() =>
  staffList.value
    .filter((s) => String(s.status || "") !== "離職")
    .map((s) => ({
      empNo: String(s.empNo ?? ""),
      name: String(s.name ?? ""),
    }))
    .filter((s) => s.empNo),
);

function isSensitiveVisible(s) {
  if (!s) return false;
  if (sensitiveView.value === "all") return true;
  if (sensitiveView.value === "hidden") return false;
  return String(s.empNo ?? "") === String(sensitiveView.value);
}

function maskSensitive(s, value) {
  return isSensitiveVisible(s) ? value : "＊＊＊";
}

// ── 初始化 ────────────────────────────────────────────────
onMounted(async () => {
  await authReadyPromise;
  const uid = auth.currentUser?.uid;
  if (!uid) {
    loading.value = false;
    return;
  }
  const userDoc = await getUserByUid(uid);
  isAdmin.value = userHasAnyRole(userDoc, ["admin", "管理者"]);
  if (isAdmin.value) await fetchStaff();
  loading.value = false;
});

async function fetchStaff() {
  const q = query(collection(db, "staff"), orderBy("empNo"));
  const snap = await getDocs(q);
  staffList.value = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// ── 匯入 Excel ────────────────────────────────────────────
const fileInputRef = ref(null);
const importDialog = ref({ open: false });
const importHeaders = ref([]);
const importRows = ref([]);
const colMap = ref({}); // { empNo: "Excel標題", name: "Excel標題", ... }
const importing = ref(false);
const importErrMsg = ref("");

function triggerImport() {
  const input = fileInputRef.value;
  if (!input) return;
  input.value = "";
  input.click();
}

function onFileChange(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (ev) => {
    try {
      await loadXlsx();
      const wb = XLSX.read(ev.target.result, {
        type: "array",
        cellDates: true,
      });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(ws, { defval: "" });
      if (!json.length) {
        alert("試算表無資料");
        return;
      }
      importHeaders.value = Object.keys(json[0]);
      importRows.value = json;
      // 自動對應
      const map = {};
      for (const f of FIELDS) map[f.key] = "";
      for (const h of importHeaders.value) {
        const matched = AUTO_MAP[h];
        if (matched) map[matched] = h;
      }
      colMap.value = map;
      importErrMsg.value = "";
      importDialog.value.open = true;
    } catch (err) {
      alert("無法讀取檔案：" + err.message);
    }
  };
  reader.readAsArrayBuffer(file);
}

async function doImport() {
  importErrMsg.value = "";
  const nameCol = colMap.value["name"];
  if (!nameCol) {
    importErrMsg.value = "請至少對應「姓名」欄位";
    return;
  }

  importing.value = true;
  try {
    // 每批最多 500 筆（Firestore writeBatch 上限）
    let batch = writeBatch(db);
    let count = 0;
    for (const row of importRows.value) {
      const obj = {};
      for (const f of FIELDS) {
        const col = colMap.value[f.key];
        if (!col) continue;
        let val = row[col];
        // 日期物件轉 YYYY-MM-DD 字串
        if (val instanceof Date) {
          val = val.toISOString().slice(0, 10);
        }
        // 數字欄位（底薪、獎金）先轉，後面統一字串化時跳過 number
        if (
          [
            "baseSalary",
            "bonus1",
            "bonus2",
            "bonus3",
            "bonus4",
            "bonus5",
            "laborInsuranceSalary",
            "healthInsuranceSalary",
            "laborInsurance",
            "healthInsurance",
            "dependentHealth",
            "lunchFee",
            "foreignRent",
            "waterFee",
            "electricFee",
            "foreignMedical",
            "foreignService",
          ].includes(f.key)
        )
          val =
            val === "" || val === null || val === undefined
              ? null
              : Number(val);
        obj[f.key] = val ?? "";
      }
      // 所有欄位強制轉字串（避免 Excel 讀出數字型別）
      for (const key of Object.keys(obj)) {
        if (
          obj[key] !== null &&
          obj[key] !== undefined &&
          typeof obj[key] !== "number"
        ) {
          obj[key] = String(obj[key]).trim();
        }
      }
      if (!obj.name) continue; // 跳過空白列
      if (!obj.dept)
        obj.status = "離職"; // 無部門 → 離職
      else if (!obj.status) obj.status = "在職";
      if (!obj.salaryType) obj.salaryType = "月薪";

      const id = String(obj.empNo || "").trim() || String(obj.name).trim();
      batch.set(doc(db, "staff", id), obj, { merge: true });
      count++;
      if (count % 499 === 0) {
        await batch.commit();
        batch = writeBatch(db);
      }
    }
    await batch.commit();
    await fetchStaff();
    closeImport();
    alert(`匯入完成，共 ${count} 筆`);
  } catch (err) {
    importErrMsg.value = "匯入失敗：" + err.message;
  } finally {
    importing.value = false;
  }
}

function closeImport() {
  importDialog.value.open = false;
}

// ── 對話框 ────────────────────────────────────────────────
const emptyForm = () => ({
  empNo: "",
  name: "",
  idNo: "",
  spouse: "",
  numDependents: null,
  birthday: "",
  phone: "",
  email: "",
  address: "",
  dept: "",
  title: "",
  startDate: "",
  endDate: "",
  salaryType: "月薪",
  baseSalary: null,
  bonus1: null,
  bonus2: null,
  bonus3: null,
  bonus4: null,
  bonus5: null,
  laborInsuranceSalary: null,
  healthInsuranceSalary: null,
  laborInsurance: null,
  healthInsurance: null,
  dependentHealth: null,
  mutualAid: null,
  lunchFee: null,
  foreignRent: null,
  waterFee: null,
  electricFee: null,
  foreignMedical: null,
  foreignService: null,
  otherDeduction: null,
  otherDeductionNote: "",
  bankName: "",
  bankAccount: "",
  emergencyName: "",
  emergencyPhone: "",
  staffRole: "",
  status: "在職",
  note: "",
});

const dialog = ref({ open: false, isNew: true });
const form = ref(emptyForm());

function openAdd() {
  form.value = emptyForm();
  errMsg.value = "";
  dialog.value = { open: true, isNew: true };
}
function openEdit(s) {
  form.value = { ...s };
  errMsg.value = "";
  dialog.value = { open: true, isNew: false };
}
function closeDialog() {
  dialog.value.open = false;
}

async function save() {
  errMsg.value = "";
  if (!String(form.value.name || "").trim()) {
    errMsg.value = "姓名為必填";
    return;
  }
  saving.value = true;
  try {
    const id =
      String(form.value.empNo || "").trim() ||
      String(form.value.name || "").trim();
    const ref = doc(db, "staff", id);
    if (dialog.value.isNew) {
      await setDoc(ref, { ...form.value });
    } else {
      const { id: _id, ...data } = form.value;
      await updateDoc(ref, data);
    }
    // 同步 staffRole / dept / empNo 到對應 Users 文件（依 email 查詢）
    await syncStaffToUser(form.value);
    await fetchStaff();
    closeDialog();
  } catch (e) {
    errMsg.value = e.message;
  } finally {
    saving.value = false;
  }
}

async function syncStaffToUser(s) {
  if (!s || !s.email) return;
  try {
    const snaps = await getDocs(
      query(collection(db, "Users"), where("email", "==", s.email)),
    );
    if (snaps.empty) return;
    for (const d of snaps.docs) {
      const user = d.data() || {};
      const currentRoles = Array.isArray(user.roles)
        ? user.roles.map((role) => String(role || "").trim()).filter(Boolean)
        : [];
      const currentRole = String(user.role || "").trim();
      const nextRoles = currentRoles.length
        ? currentRoles
        : currentRole && currentRole !== "遊客"
          ? [currentRole]
          : ["員工"];
      const nextActiveRole = String(
        user.activeRole || currentRole || "",
      ).trim();
      await updateDoc(doc(db, "Users", d.id), {
        staffRole: s.staffRole || "",
        dept: s.dept || "",
        empNo: s.empNo || "",
        departments: s.dept
          ? [String(s.dept)]
          : Array.isArray(user.departments)
            ? user.departments
            : [],
        activeDepartment: s.dept || user.activeDepartment || "",
        roles: nextRoles,
        activeRole:
          nextActiveRole && nextRoles.includes(nextActiveRole)
            ? nextActiveRole
            : nextRoles[0],
        role:
          currentRole && currentRole !== "遊客" ? currentRole : nextRoles[0],
      });
    }
  } catch (e) {
    console.warn("syncStaffToUser failed for", s.email, e.message);
  }
}
</script>

<style scoped>
.search-input {
  width: 280px;
  height: 30px;
  padding: 0 8px;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: 14px;
}
.checkbox-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  cursor: pointer;
  user-select: none;
}
.sensitive-select {
  height: 30px;
  border: 1px solid #ccc;
  border-radius: 4px;
  padding: 0 8px;
  font-size: 13px;
  background: #fff;
}
.staff-count {
  font-size: 13px;
  color: #666;
}
.map-grid {
  display: grid;
  grid-template-columns: 120px 1fr 120px 1fr 120px 1fr;
  gap: 6px 12px;
  align-items: center;
  margin: 10px 0;
}
.map-label {
  font-size: 13px;
  text-align: right;
  color: #444;
}
.map-select {
  font-size: 13px;
  padding: 2px 4px;
  border: 1px solid #ccc;
  border-radius: 4px;
  width: 100%;
}
.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px 16px;
  margin: 12px 0;
}
.form-grid label {
  display: flex;
  flex-direction: column;
  font-size: 13px;
  gap: 3px;
}
.form-grid .full {
  grid-column: 1 / -1;
}
.form-grid input,
.form-grid select,
.form-grid textarea {
  width: 100%;
  padding: 4px 6px;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: 14px;
  box-sizing: border-box;
}
.form-grid textarea {
  resize: vertical;
}
.req {
  color: red;
}
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  z-index: 1000;
  overflow-y: auto;
  padding: 24px 12px;
}
.modal-box {
  background: #fff;
  border-radius: 8px;
  padding: 20px 24px;
  width: 100%;
  max-width: 700px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.18);
}
.modal-actions {
  display: flex;
  gap: 8px;
  margin-top: 12px;
  justify-content: flex-end;
}
.err-msg {
  color: #c0392b;
  font-size: 13px;
  margin-top: 4px;
}
.badge {
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 12px;
}
.badge-ok {
  background: #d4edda;
  color: #155724;
}
.badge-off {
  background: #f8d7da;
  color: #721c24;
}
.inactive td {
  color: #aaa;
}
.sortable {
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
}
.sortable:hover {
  background: #eef2f7;
}
</style>
