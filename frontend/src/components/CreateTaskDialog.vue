<template>
  <div v-if="open" class="modal-backdrop" @click.self="$emit('close')">
    <div class="modal">
      <header class="modal-head">
        <h3>＋ 新增派車任務</h3>
        <button class="btn-icon" @click="$emit('close')" :disabled="saving">✕</button>
      </header>

      <div class="modal-body">
        <div class="form-row">
          <label>任務類型 <span class="req">*</span></label>
          <div class="kind-group">
            <label v-for="k in kindOptions" :key="k.value" class="kind-radio">
              <input type="radio" v-model="form.kind" :value="k.value" />
              <span>{{ k.label }}</span>
            </label>
          </div>
        </div>

        <div class="form-row">
          <label>優先度</label>
          <select v-model="form.priority">
            <option value="normal">一般</option>
            <option value="high">高</option>
            <option value="urgent">急件</option>
          </select>
        </div>

        <div class="form-row">
          <label>客戶名稱 <span class="req">*</span></label>
          <input type="text" v-model.trim="form.customerName" placeholder="客戶或案場名稱" />
        </div>

        <div class="form-row">
          <label>施工地址</label>
          <input type="text" v-model.trim="form.siteAddress" placeholder="完整地址" />
        </div>

        <div class="form-row two-col">
          <div>
            <label>聯絡人</label>
            <input type="text" v-model.trim="form.contactName" />
          </div>
          <div>
            <label>聯絡電話</label>
            <input type="tel" v-model.trim="form.contactPhone" />
          </div>
        </div>

        <div class="form-row">
          <label>預定日期</label>
          <input type="date" v-model="form.dueDate" />
        </div>

        <div class="form-row">
          <label>關聯銷貨訂單 ID</label>
          <input
            type="text"
            v-model.trim="form.salesOrderId"
            placeholder="可空;填入會自動帶客戶/地址/日期"
          />
          <p class="hint">舊系統訂單用 legacy_ 開頭(例:legacy_abc123)</p>
        </div>

        <div class="form-row">
          <label>備註</label>
          <textarea v-model="form.note" rows="3" placeholder="現場注意事項、材料、工序…"></textarea>
        </div>

        <p v-if="error" class="error">{{ error }}</p>
      </div>

      <footer class="modal-foot">
        <button class="btn-secondary" @click="$emit('close')" :disabled="saving">取消</button>
        <button class="btn-primary" @click="submit" :disabled="!canSubmit || saving">
          {{ saving ? '建立中…' : '建立任務' }}
        </button>
      </footer>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, reactive } from 'vue';
import { httpsCallable } from 'firebase/functions';
import { functionsInstance } from '../firebase';

const props = defineProps({
  open: { type: Boolean, default: false },
});
const emit = defineEmits(['close', 'created']);

const kindOptions = [
  { value: 'install', label: '安裝' },
  { value: 'repair', label: '維修' },
  { value: 'remeasure', label: '複丈' },
  { value: 'site_visit', label: '現勘' },
];

const initial = () => ({
  kind: 'install',
  priority: 'normal',
  customerName: '',
  siteAddress: '',
  contactName: '',
  contactPhone: '',
  dueDate: '',
  salesOrderId: '',
  note: '',
});

const form = reactive(initial());
const saving = ref(false);
const error = ref('');

watch(
  () => props.open,
  (v) => {
    if (v) {
      Object.assign(form, initial());
      error.value = '';
      saving.value = false;
    }
  },
);

const canSubmit = computed(() => !!form.customerName);

async function submit() {
  if (!canSubmit.value) return;
  saving.value = true;
  error.value = '';
  try {
    const call = httpsCallable(functionsInstance, 'createInstallTask');
    const payload = {
      kind: form.kind,
      priority: form.priority,
      customerName: form.customerName,
      siteAddress: form.siteAddress || '',
      contactName: form.contactName || '',
      contactPhone: form.contactPhone || '',
      note: form.note || '',
    };
    if (form.dueDate) payload.dueDate = form.dueDate;
    if (form.salesOrderId) payload.salesOrderId = form.salesOrderId;
    const res = await call(payload);
    emit('created', res.data);
    emit('close');
  } catch (e) {
    error.value = e?.message || String(e);
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.modal-backdrop {
  position: fixed; inset: 0; background: rgba(0,0,0,0.5);
  display: flex; align-items: center; justify-content: center;
  z-index: 1000; padding: 12px;
}
.modal {
  background: #fff; border-radius: 8px; width: 100%; max-width: 560px;
  max-height: 90vh; display: flex; flex-direction: column;
}
.modal-head {
  display: flex; justify-content: space-between; align-items: center;
  padding: 12px 16px; border-bottom: 1px solid #e5e7eb;
}
.modal-head h3 { margin: 0; font-size: 16px; }
.btn-icon { background: transparent; border: 0; font-size: 18px; cursor: pointer; color: #6b7280; }
.modal-body { padding: 12px 16px; overflow-y: auto; }
.modal-foot {
  display: flex; gap: 8px; justify-content: flex-end;
  padding: 12px 16px; border-top: 1px solid #e5e7eb;
}

.form-row { margin-bottom: 12px; }
.form-row label { display: block; font-size: 13px; color: #374151; margin-bottom: 4px; }
.form-row input[type="text"],
.form-row input[type="tel"],
.form-row input[type="date"],
.form-row select,
.form-row textarea {
  width: 100%; padding: 6px 8px; border: 1px solid #d1d5db; border-radius: 4px;
  font-size: 14px; font-family: inherit; box-sizing: border-box;
}
.form-row.two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.form-row.two-col > div { margin: 0; }
.req { color: #dc2626; }
.hint { font-size: 12px; color: #6b7280; margin: 4px 0 0; }
.error { color: #dc2626; font-size: 13px; padding: 6px 8px; background: #fef2f2; border-radius: 4px; }

.kind-group { display: flex; gap: 12px; flex-wrap: wrap; }
.kind-radio { display: flex; align-items: center; gap: 4px; font-size: 14px; cursor: pointer; }
.kind-radio input { margin: 0; }

.btn-primary {
  background: #2563eb; color: #fff; border: 0; padding: 8px 16px;
  border-radius: 4px; cursor: pointer; font-size: 14px;
}
.btn-primary:disabled { background: #93c5fd; cursor: not-allowed; }
.btn-secondary {
  background: #f3f4f6; border: 1px solid #d1d5db; padding: 8px 16px;
  border-radius: 4px; cursor: pointer; font-size: 14px;
}
</style>
