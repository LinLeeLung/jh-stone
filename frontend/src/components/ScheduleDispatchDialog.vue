<template>
  <div v-if="open" class="modal-backdrop" @click.self="cancel">
    <div class="modal">
      <header class="modal-header">
        <h3>排程派車 — {{ task?.taskNo }}</h3>
        <button class="btn-close" @click="cancel">×</button>
      </header>

      <div class="modal-body">
        <div class="meta">
          <div><strong>客戶：</strong>{{ task?.customerName || '—' }}</div>
          <div><strong>地址：</strong>{{ task?.siteAddress || '—' }}</div>
          <div><strong>類型：</strong>{{ kindLabel(task?.kind) }}</div>
          <div><strong>預定：</strong>{{ task?.dueDate || '未定' }}</div>
        </div>

        <div class="field">
          <label>排定日期 *</label>
          <input v-model="form.assignedDateInput" type="date" required />
        </div>

        <div class="field">
          <label>優先級</label>
          <select v-model="form.priority">
            <option value="normal">一般</option>
            <option value="high">高</option>
            <option value="urgent">緊急</option>
          </select>
        </div>

        <div class="field">
          <label>指派人員 * <span class="hint">(可複選)</span></label>
          <div v-if="loadingUsers" class="loading-inline">載入中…</div>
          <div v-else class="crew-list">
            <label v-for="u in installers" :key="u.id" class="crew-item">
              <input type="checkbox" :value="u.id" v-model="form.assignedCrew" />
              {{ u.displayName || u.email || u.id }}
              <span v-if="u.role" class="role-tag">{{ u.role }}</span>
            </label>
            <p v-if="!installers.length" class="empty">尚無可指派人員(需設定部門為「2 裝安」)</p>
          </div>
        </div>

        <div class="field">
          <label>車輛</label>
          <select v-model="form.assignedVehicleId">
            <option :value="null">— 不指定 —</option>
            <option v-for="v in vehicles" :key="v.id" :value="v.id">
              {{ v.plate || v.name || v.id }}<span v-if="v.capacity"> ({{ v.capacity }})</span>
            </option>
          </select>
          <p v-if="!vehicles.length && !loadingVehicles" class="hint">尚未建立車輛資料(可至「車輛管理」新增,或先留空)</p>
        </div>

        <div class="field">
          <label>備註</label>
          <textarea v-model="form.note" rows="2" placeholder="可留客戶交代事項、注意要點等"></textarea>
        </div>
      </div>

      <footer class="modal-footer">
        <button class="btn-secondary" @click="cancel">取消</button>
        <button class="btn-primary" :disabled="!canSave || saving" @click="save">
          {{ saving ? '儲存中…' : '確認派車' }}
        </button>
      </footer>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { collection, doc, getDocs, query, updateDoc, where, serverTimestamp } from 'firebase/firestore';
import { db, auth, normalizeUserAccessDoc, userHasAnyDept, userHasAnyRole } from '../firebase';

const props = defineProps({
  open: { type: Boolean, default: false },
  task: { type: Object, default: null },
});
const emit = defineEmits(['close', 'saved']);

const form = ref(makeBlankForm());
const installers = ref([]);
const vehicles = ref([]);
const loadingUsers = ref(false);
const loadingVehicles = ref(false);
const saving = ref(false);

function makeBlankForm() {
  return {
    assignedDateInput: todayIsoDate(),
    priority: 'normal',
    assignedCrew: [],
    assignedVehicleId: null,
    note: '',
  };
}

function todayIsoDate() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function isoToYmd(iso) {
  return String(iso || '').replace(/-/g, '');
}

function kindLabel(k) {
  return { install: '安裝', repair: '維修', remeasure: '複測', site_visit: '現勘' }[k] || k || '—';
}

const canSave = computed(() => {
  return Boolean(form.value.assignedDateInput) && form.value.assignedCrew.length > 0;
});

// 當對話框打開時：預填表單 + 載入人員/車輛
watch(
  () => props.open,
  async (isOpen) => {
    if (!isOpen) return;
    form.value = makeBlankForm();
    if (props.task) {
      form.value.priority = props.task.priority || 'normal';
      form.value.assignedCrew = Array.isArray(props.task.assignedCrew) ? [...props.task.assignedCrew] : [];
      form.value.assignedVehicleId = props.task.assignedVehicleId || null;
      form.value.note = props.task.note || '';
      if (props.task.assignedDate) {
        // assignedDate 存 YYYYMMDD,轉成 YYYY-MM-DD 顯示
        const s = String(props.task.assignedDate);
        if (s.length === 8) {
          form.value.assignedDateInput = `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
        }
      }
    }
    await Promise.all([loadInstallers(), loadVehicles()]);
  },
);

async function loadInstallers() {
  loadingUsers.value = true;
  try {
    // 2 裝安部門(維修=安裝同一群人):dept === '2',或 admin/管理者
    const col = collection(db, 'Users');
    const snap = await getDocs(col);
    installers.value = snap.docs
      .map((d) => normalizeUserAccessDoc({ id: d.id, ...d.data() }))
      .filter((u) => {
        if (userHasAnyRole(u, ['admin', '管理者'])) return true;
        if (userHasAnyRole(u, ['員工', '行動']) && userHasAnyDept(u, ['2'])) return true;
        return false;
      })
      .sort((a, b) => String(a.displayName || a.email || '').localeCompare(String(b.displayName || b.email || '')));
  } catch (err) {
    console.error('[ScheduleDispatchDialog] loadInstallers failed', err);
    installers.value = [];
  } finally {
    loadingUsers.value = false;
  }
}

async function loadVehicles() {
  loadingVehicles.value = true;
  try {
    const q = query(collection(db, 'vehicles'), where('active', '!=', false));
    const snap = await getDocs(q);
    vehicles.value = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    // active != false 查詢失敗時 fallback 拉全部
    try {
      const snap = await getDocs(collection(db, 'vehicles'));
      vehicles.value = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    } catch (err2) {
      console.error('[ScheduleDispatchDialog] loadVehicles failed', err2);
      vehicles.value = [];
    }
  } finally {
    loadingVehicles.value = false;
  }
}

async function save() {
  if (!canSave.value || !props.task) return;
  saving.value = true;
  try {
    const uid = auth.currentUser?.uid;
    await updateDoc(doc(db, 'installTasks', props.task.id), {
      status: 'scheduled',
      assignedDate: isoToYmd(form.value.assignedDateInput),
      assignedCrew: form.value.assignedCrew,
      assignedVehicleId: form.value.assignedVehicleId || null,
      priority: form.value.priority,
      note: form.value.note || '',
      updatedAt: serverTimestamp(),
      updatedByUid: uid,
    });
    emit('saved', { id: props.task.id });
    emit('close');
  } catch (err) {
    alert(`派車儲存失敗：${err?.message || err}`);
  } finally {
    saving.value = false;
  }
}

function cancel() {
  emit('close');
}
</script>

<style scoped>
.modal-backdrop {
  position: fixed; inset: 0; background: rgba(0, 0, 0, 0.45);
  display: flex; align-items: center; justify-content: center; z-index: 1000;
}
.modal {
  background: #fff; border-radius: 8px; width: min(560px, 92vw);
  max-height: 92vh; display: flex; flex-direction: column;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.25);
}
.modal-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 12px 16px; border-bottom: 1px solid #e5e7eb;
}
.modal-header h3 { margin: 0; font-size: 16px; }
.btn-close {
  background: transparent; border: 0; font-size: 22px; cursor: pointer; color: #6b7280;
  line-height: 1; padding: 0 6px;
}
.modal-body { padding: 14px 16px; overflow-y: auto; }
.modal-footer {
  display: flex; justify-content: flex-end; gap: 8px;
  padding: 12px 16px; border-top: 1px solid #e5e7eb;
}

.meta {
  background: #f9fafb; border-radius: 4px; padding: 8px 10px;
  font-size: 13px; margin-bottom: 12px; line-height: 1.6;
}

.field { margin-bottom: 12px; }
.field > label {
  display: block; font-size: 13px; font-weight: 600;
  color: #374151; margin-bottom: 4px;
}
.field input[type="date"],
.field select,
.field textarea,
.field input[type="text"] {
  width: 100%; padding: 6px 8px; border: 1px solid #d1d5db;
  border-radius: 4px; font-size: 14px; box-sizing: border-box;
}
.hint { font-weight: 400; color: #6b7280; font-size: 12px; }

.crew-list {
  border: 1px solid #e5e7eb; border-radius: 4px;
  padding: 6px 8px; max-height: 180px; overflow-y: auto;
}
.crew-item {
  display: flex; align-items: center; gap: 6px;
  padding: 4px 0; font-size: 14px; cursor: pointer;
}
.crew-item input { margin: 0; }
.role-tag {
  font-size: 11px; background: #e5e7eb; color: #4b5563;
  padding: 1px 6px; border-radius: 999px; margin-left: auto;
}
.empty { color: #9ca3af; font-size: 12px; text-align: center; padding: 8px; margin: 0; }
.loading-inline { color: #6b7280; font-size: 13px; padding: 6px; }

.btn-primary {
  background: #2563eb; color: #fff; border: 0;
  padding: 8px 14px; border-radius: 4px; cursor: pointer;
}
.btn-primary:disabled { background: #93c5fd; cursor: not-allowed; }
.btn-secondary {
  background: #f3f4f6; border: 1px solid #d1d5db;
  padding: 8px 14px; border-radius: 4px; cursor: pointer;
}
</style>
