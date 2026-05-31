<template>
  <section class="page-card">
    <div class="page-head sticky-page-head">
      <h1>客戶管理</h1>
      <button class="btn-query" @click="openAdd" v-if="canWrite">＋ 新增客戶</button>
    </div>

    <div v-if="loading" class="muted-text">讀取中…</div>
    <div v-else-if="!canRead" class="muted-text">您沒有權限存取此頁面。</div>

    <div v-else>
      <!-- 搜尋 / 篩選列 -->
      <div class="toolbar-row">
        <input
          v-model="search"
          placeholder="搜尋名稱 / 統編 / 聯絡人 / 電話…"
          class="search-input"
        />
        <select v-model="typeFilter" style="width: auto; min-width: 110px">
          <option value="">全部類型</option>
          <option v-for="t in CUSTOMER_TYPES" :key="t" :value="t">{{ t }}</option>
        </select>
        <span class="staff-count">共 {{ filtered.length }} 筆</span>
      </div>
      <div v-if="canWrite" style="font-size:0.82rem;color:#6b7280;margin-bottom:8px;display:flex;gap:20px">
        <span>一般戶最後號碼：<span class="mono" style="color:#374151;font-weight:600">{{ lastStandardId }}</span></span>
        <span>個人戶最後號碼：<span class="mono" style="color:#374151;font-weight:600">{{ lastIndividualId }}</span></span>
      </div>

      <!-- 列表 -->
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>客戶編號</th>
              <th>名稱</th>
              <th>類型</th>
              <th>聯絡人</th>
              <th>電話</th>
              <th>付款條件</th>
              <th>請款週期</th>
              <th>動作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="c in filtered" :key="c._docId">
              <td class="mono">{{ c.code || c._docId }}</td>
              <td><strong>{{ c.name }}</strong></td>
              <td>
                <span class="badge" :class="typeBadgeClass(c.type)">{{ c.type || '—' }}</span>
              </td>
              <td>{{ c.contactPerson || '—' }}</td>
              <td>{{ c.phone || '—' }}</td>
              <td>{{ c.paymentTerms || '—' }}</td>
              <td>{{ billingCycleLabel(c.billingCycleType) }}</td>
              <td style="white-space:nowrap">
                <button class="btn-aux" @click="openEdit(c)" v-if="canWrite">編輯</button>
                <button class="btn-aux" @click="openView(c)" v-else>查看</button>
                <button
                  v-if="isAdmin"
                  class="btn-aux"
                  style="color:#dc2626;margin-left:4px"
                  @click="deleteCustomer(c)"
                >刪除</button>
              </td>
            </tr>
            <tr v-if="filtered.length === 0">
              <td colspan="8" class="muted-text" style="text-align:center">查無資料</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- ── 新增 / 編輯 / 查看 對話框 ── -->
    <div v-if="dialog.open" class="modal-backdrop" @click.self="closeDialog">
      <div class="modal-box" style="max-width: 680px">
        <h2>{{ dialogTitle }}</h2>
        <!-- 舊客戶代號（唯讀） -->
        <div v-if="dialog.legacyCode" style="font-size:0.82rem; color:#6b7280; margin-bottom:4px">
          客戶代號：<span class="mono">{{ dialog.legacyCode }}</span>
        </div>

        <div class="form-grid">
          <!-- 基本資訊 -->
          <label class="span-2">
            名稱 <span class="req" v-if="!dialog.viewOnly">*</span>
            <input v-model="form.name" :disabled="dialog.viewOnly" placeholder="公司或個人名稱" />
          </label>
          <label>
            統一編號
            <input v-model="form.taxId" :disabled="dialog.viewOnly" placeholder="僅公司填寫" />
          </label>
          <label>
            客戶類型
            <select v-model="form.type" :disabled="dialog.viewOnly">
              <option value="">請選擇</option>
              <option v-for="t in CUSTOMER_TYPES" :key="t" :value="t">{{ t }}</option>
            </select>
          </label>
          <label>
            付款條件
            <select v-model="form.paymentTerms" :disabled="dialog.viewOnly">
              <option value="">請選擇</option>
              <option v-for="p in PAYMENT_TERMS" :key="p" :value="p">{{ p }}</option>
            </select>
          </label>
          <label>
            請款週期
            <select v-model="form.billingCycleType" :disabled="dialog.viewOnly">
              <option v-for="item in BILLING_CYCLE_OPTIONS" :key="item.value" :value="item.value">{{ item.label }}</option>
            </select>
          </label>
          <label>
            開票偏好
            <select v-model="form.invoicePreference" :disabled="dialog.viewOnly">
              <option v-for="item in INVOICE_PREFERENCE_OPTIONS" :key="item.value" :value="item.value">{{ item.label }}</option>
            </select>
          </label>
          <label v-if="isAdmin">
            信用額度
            <input v-model.number="form.creditLimit" type="number" :disabled="dialog.viewOnly" placeholder="0 = 不限" />
          </label>

          <!-- 聯絡資訊 -->
          <label>
            聯絡人
            <input v-model="form.contactPerson" :disabled="dialog.viewOnly" />
          </label>
          <label>
            電話
            <input v-model="form.phone" :disabled="dialog.viewOnly" />
          </label>
          <label>
            傳真
            <input v-model="form.fax" :disabled="dialog.viewOnly" />
          </label>
          <label>
            Email
            <input v-model="form.email" :disabled="dialog.viewOnly" type="email" />
          </label>
          <label class="span-2">
            地址
            <input v-model="form.address" :disabled="dialog.viewOnly" />
          </label>

          <!-- 客戶端業務員清單 -->
          <div class="span-2">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px">
              <strong style="font-size:0.9rem">客戶端業務員</strong>
              <button
                v-if="!dialog.viewOnly"
                class="btn-aux"
                style="padding: 2px 10px; font-size: 0.82rem"
                type="button"
                @click="addContact"
              >＋ 新增</button>
            </div>
            <table class="data-table" style="font-size:0.85rem">
              <thead>
                <tr>
                  <th>姓名</th>
                  <th>電話</th>
                  <th>Email</th>
                  <th v-if="!dialog.viewOnly"></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(sc, idx) in form.salesContacts" :key="idx">
                  <td><input v-model="sc.name" :disabled="dialog.viewOnly" style="height:28px" /></td>
                  <td><input v-model="sc.phone" :disabled="dialog.viewOnly" style="height:28px" /></td>
                  <td><input v-model="sc.email" :disabled="dialog.viewOnly" style="height:28px" /></td>
                  <td v-if="!dialog.viewOnly">
                    <button
                      type="button"
                      style="background:none; border:none; color:#dc2626; cursor:pointer; padding:2px 6px"
                      @click="removeContact(idx)"
                    >✕</button>
                  </td>
                </tr>
                <tr v-if="form.salesContacts.length === 0">
                  <td :colspan="dialog.viewOnly ? 3 : 4" class="muted-text" style="text-align:center">（無）</td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- 備註 -->
          <label class="span-2">
            備註
            <textarea v-model="form.notes" :disabled="dialog.viewOnly" rows="2"
              style="width:100%; border:1px solid #d1d5db; border-radius:8px; padding:0.5rem; font:inherit; resize:vertical" />
          </label>
          <div class="span-2">
            <div style="font-size:13px; margin-bottom:4px">允許收款方式</div>
            <div class="check-grid-mini">
              <label v-for="item in PAYMENT_METHOD_OPTIONS" :key="item.value" class="check-item-mini">
                <input
                  type="checkbox"
                  :disabled="dialog.viewOnly"
                  :value="item.value"
                  :checked="form.paymentMethodsAllowed.includes(item.value)"
                  @change="togglePaymentMethod(item.value, $event.target.checked)"
                />
                {{ item.label }}
              </label>
            </div>
          </div>
          <label class="span-2">
            會計備註
            <textarea v-model="form.accountingNotes" :disabled="dialog.viewOnly" rows="2"
              style="width:100%; border:1px solid #d1d5db; border-radius:8px; padding:0.5rem; font:inherit; resize:vertical" />
          </label>
        </div>

        <div v-if="errMsg" class="err-msg">{{ errMsg }}</div>

        <div class="modal-actions">
          <template v-if="!dialog.viewOnly">
            <button class="btn-query" @click="save" :disabled="saving">
              {{ saving ? '儲存中…' : (dialog.isNew ? '建立客戶' : '儲存變更') }}
            </button>
          </template>
          <button class="btn-aux" @click="closeDialog">{{ dialog.viewOnly ? '關閉' : '取消' }}</button>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import {
  db,
  auth,
  authReadyPromise,
  userHasAnyDept,
  userHasAnyRole,
  RECEIVABLE_BILLING_CYCLE_OPTIONS,
  RECEIVABLE_INVOICE_PREFERENCE_OPTIONS,
  RECEIVABLE_PAYMENT_METHOD_OPTIONS,
} from '../firebase'
import {
  collection, getDocs, setDoc, updateDoc, deleteDoc, doc,
  serverTimestamp, getDoc
} from 'firebase/firestore'

// ── 常數 ──────────────────────────────────────────────
const CUSTOMER_TYPES = ['設計師', '建商', '直客', '經銷']
const PAYMENT_TERMS  = ['現金', '月結30', '月結60', '分期']
const BILLING_CYCLE_OPTIONS = RECEIVABLE_BILLING_CYCLE_OPTIONS
const INVOICE_PREFERENCE_OPTIONS = RECEIVABLE_INVOICE_PREFERENCE_OPTIONS
const PAYMENT_METHOD_OPTIONS = RECEIVABLE_PAYMENT_METHOD_OPTIONS

// ── 狀態 ──────────────────────────────────────────────
const loading  = ref(true)
const saving   = ref(false)
const errMsg   = ref('')
const search   = ref('')
const typeFilter = ref('')
const customers  = ref([])

const userDoc  = ref(null)
const isAdmin  = computed(() => userHasAnyRole(userDoc.value, ['admin', '管理者']))
const isOffice = computed(() =>
  isAdmin.value ||
  userHasAnyDept(userDoc.value, ['1']) ||
  userDoc.value?.permissions?.office === true
)
const canRead  = computed(() => !!userDoc.value)
const canWrite = computed(() => isOffice.value)

// ── 最後號碼 ────────────────────────────────────────────
const lastStandardId = computed(() => {
  const list = customers.value
    .map(c => { const m = (c._docId || '').match(/^[A-Z]{3}(\d{4})$/); return m ? { id: c._docId, n: parseInt(m[1], 10) } : null })
    .filter(Boolean)
    .sort((a, b) => b.n - a.n)
  return list[0]?.id || '（無）'
})
const lastIndividualId = computed(() => {
  const list = customers.value
    .map(c => { const m = (c._docId || '').match(/^ACC(\d+)-(\d+)$/i); return m ? { id: c._docId, acc: parseInt(m[1], 10), seq: parseInt(m[2], 10) } : null })
    .filter(Boolean)
    .sort((a, b) => a.acc !== b.acc ? b.acc - a.acc : b.seq - a.seq)
  return list[0]?.id || '（無）'
})

// ── 對話框 ─────────────────────────────────────────────
const dialog = ref({ open: false, isNew: true, viewOnly: false, docId: null, legacyCode: '' })
const emptyForm = () => ({
  name: '', taxId: '', type: '', paymentTerms: '',
  billingCycleType: 'cutoff25', invoicePreference: 'optional',
  paymentMethodsAllowed: PAYMENT_METHOD_OPTIONS.map(item => item.value),
  accountingNotes: '',
  creditLimit: 0, contactPerson: '', phone: '', fax: '', email: '',
  address: '', notes: '', salesContacts: []
})
const form = ref(emptyForm())

const dialogTitle = computed(() => {
  if (dialog.value.viewOnly) return '客戶資料'
  return dialog.value.isNew ? '新增客戶' : '編輯客戶'
})

// ── 篩選 ───────────────────────────────────────────────
const filtered = computed(() => {
  const kw = search.value.trim().toLowerCase()
  return customers.value.filter(c => {
    if (typeFilter.value && c.type !== typeFilter.value) return false
    if (!kw) return true
    return (
      (c.name || '').toLowerCase().includes(kw) ||
      (c.taxId || '').toLowerCase().includes(kw) ||
      (c.code || c._docId || '').toLowerCase().includes(kw) ||
      (c.contactPerson || '').toLowerCase().includes(kw) ||
      (c.phone || '').includes(kw)
    )
  })
})

// ── 徽章顏色 ────────────────────────────────────────────
function typeBadgeClass(type) {
  return {
    '設計師': 'badge-blue',
    '建商':   'badge-green',
    '直客':   'badge-yellow',
    '經銷':   'badge-purple',
  }[type] || 'badge-gray'
}

function billingCycleLabel(value) {
  return BILLING_CYCLE_OPTIONS.find(item => item.value === value)?.label || '26-25 區間，次月請款'
}

// ── 讀取資料 ────────────────────────────────────────────
async function loadCustomers() {
  loading.value = true
  try {
    const snap = await getDocs(collection(db, 'customers'))
    customers.value = snap.docs
      .map(d => ({ _docId: d.id, ...d.data() }))
      .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'zh-Hant'))
  } finally {
    loading.value = false
  }
}

// ── 產生客戶編號：3英字 + 4數字流水（AAA0001, AAB0002 … BQH1104, BQI1105 …）
// 數字部分直接作為序號，英字部分為同一序號的 base-26 表示（AAA=1）
function numToLetters(n) {
  const n0 = n - 1
  const c3 = n0 % 26
  const c2 = Math.floor(n0 / 26) % 26
  const c1 = Math.floor(n0 / 676) % 26
  return String.fromCharCode(65 + c1, 65 + c2, 65 + c3)
}
async function genCustomerId() {
  const existing = customers.value
    .map(c => { const m = (c._docId || '').match(/^[A-Z]{3}(\d{4})$/); return m ? parseInt(m[1], 10) : 0 })
    .filter(n => n > 0)
  const next = existing.length > 0 ? Math.max(...existing) + 1 : 1
  return `${numToLetters(next)}${String(next).padStart(4, '0')}`
}

// ── 對話框操作 ──────────────────────────────────────────
function openAdd() {
  form.value = emptyForm()
  dialog.value = { open: true, isNew: true, viewOnly: false, docId: null, legacyCode: '' }
  errMsg.value = ''
}
function openEdit(c) {
  form.value = {
    name: c.name || '', taxId: c.taxId || '', type: c.type || '',
    paymentTerms: c.paymentTerms || '', creditLimit: c.creditLimit || 0,
    billingCycleType: c.billingCycleType || 'cutoff25',
    invoicePreference: c.invoicePreference || 'optional',
    paymentMethodsAllowed: Array.isArray(c.paymentMethodsAllowed) && c.paymentMethodsAllowed.length
      ? [...c.paymentMethodsAllowed]
      : PAYMENT_METHOD_OPTIONS.map(item => item.value),
    accountingNotes: c.accountingNotes || '',
    contactPerson: c.contactPerson || '', phone: c.phone || '',
    fax: c.fax || '', email: c.email || '', address: c.address || '',
    notes: c.notes || '',
    salesContacts: (c.salesContacts || []).map(sc => ({ ...sc }))
  }
  const isLegacy = !c.createdAt
  dialog.value = {
    open: true, isNew: false, viewOnly: false,
    docId: c._docId,
    legacyCode: isLegacy ? (c.code || c._docId) : ''
  }
  errMsg.value = ''
}
function openView(c) {
  openEdit(c)
  dialog.value.viewOnly = true
}
function closeDialog() {
  dialog.value.open = false
}
function addContact() {
  form.value.salesContacts.push({ name: '', phone: '', email: '' })
}
function removeContact(idx) {
  form.value.salesContacts.splice(idx, 1)
}

function togglePaymentMethod(value, checked) {
  const next = new Set(form.value.paymentMethodsAllowed || [])
  if (checked) next.add(value)
  else next.delete(value)
  form.value.paymentMethodsAllowed = [...next]
}

// ── 儲存 ────────────────────────────────────────────────
async function save() {
  errMsg.value = ''
  if (!form.value.name.trim()) {
    errMsg.value = '名稱為必填'
    return
  }
  saving.value = true
  try {
    const uid = auth.currentUser?.uid || ''
    const data = {
      name:          form.value.name.trim(),
      taxId:         form.value.taxId.trim(),
      type:          form.value.type,
      paymentTerms:  form.value.paymentTerms,
      billingCycleType: form.value.billingCycleType || 'cutoff25',
      invoicePreference: form.value.invoicePreference || 'optional',
      paymentMethodsAllowed: (form.value.paymentMethodsAllowed || []).filter(Boolean),
      accountingNotes: form.value.accountingNotes.trim(),
      creditLimit:   form.value.creditLimit || 0,
      contactPerson: form.value.contactPerson.trim(),
      phone:         form.value.phone.trim(),
      fax:           form.value.fax.trim(),
      email:         form.value.email.trim(),
      address:       form.value.address.trim(),
      notes:         form.value.notes.trim(),
      salesContacts: form.value.salesContacts
        .filter(sc => sc.name || sc.phone)
        .map(sc => ({
          name:  sc.name.trim(),
          phone: sc.phone.trim(),
          email: sc.email.trim(),
        })),
      updatedAt:     serverTimestamp(),
      updatedByUid:  uid,
    }

    if (dialog.value.isNew) {
      const newId = await genCustomerId()
      await setDoc(doc(db, 'customers', newId), {
        ...data,
        code:         newId,
        createdAt:    serverTimestamp(),
        createdByUid: uid,
      })
    } else {
      await updateDoc(doc(db, 'customers', dialog.value.docId), data)
    }

    await loadCustomers()
    closeDialog()
  } catch (e) {
    errMsg.value = `儲存失敗：${e.message}`
  } finally {
    saving.value = false
  }
}

// ── 刪除客戶 ────────────────────────────────────────────
async function deleteCustomer(c) {
  if (!confirm(`確定要刪除「${c.name}」？此操作無法復原。`)) return
  try {
    await deleteDoc(doc(db, 'customers', c._docId))
    await loadCustomers()
  } catch (e) {
    alert(`刪除失敗：${e.message}`)
  }
}

// ── 初始化 ──────────────────────────────────────────────
onMounted(async () => {
  await authReadyPromise
  const uid = auth.currentUser?.uid
  if (uid) {
    const snap = await getDoc(doc(db, 'Users', uid))
    if (snap.exists()) userDoc.value = snap.data()
  }
  await loadCustomers()
})
</script>

<style scoped>
.mono { font-family: monospace; font-size: 0.88rem; }
.badge-blue   { background: #dbeafe; color: #1d4ed8; }
.badge-green  { background: #dcfce7; color: #15803d; }
.badge-yellow { background: #fef9c3; color: #a16207; }
.badge-purple { background: #f3e8ff; color: #7e22ce; }
.badge-gray   { background: #f3f4f6; color: #6b7280; }
.check-grid-mini {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 6px 10px;
}
.check-item-mini {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
}

/* ── 共用 modal / form ─────────────────────────── */
.req { color: red; }
.modal-backdrop {
  position: fixed; inset: 0;
  background: rgba(0,0,0,.4);
  display: flex; align-items: flex-start; justify-content: center;
  z-index: 1000; overflow-y: auto; padding: 24px 12px;
}
.modal-box {
  background: #fff; border-radius: 8px; padding: 20px 24px;
  width: 100%; max-width: 700px;
  box-shadow: 0 4px 24px rgba(0,0,0,.18);
}
.modal-actions {
  display: flex; gap: 8px; margin-top: 12px; justify-content: flex-end;
}
.err-msg { color: #c0392b; font-size: 13px; margin-top: 4px; }
.badge { padding: 2px 8px; border-radius: 10px; font-size: 12px; }
.form-grid {
  display: grid; grid-template-columns: 1fr 1fr;
  gap: 10px 16px; margin: 12px 0;
}
.form-grid label {
  display: flex; flex-direction: column; font-size: 13px; gap: 3px;
}
.form-grid .span-2 { grid-column: 1 / -1; }
.span-2 { grid-column: 1 / -1; }
.form-grid input,
.form-grid select,
.form-grid textarea {
  width: 100%; padding: 4px 6px;
  border: 1px solid #ccc; border-radius: 4px;
  font-size: 14px; box-sizing: border-box;
}
</style>
