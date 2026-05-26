<template>
  <div class="my-today">
    <header class="page-header">
      <h2>📱 今日我的任務</h2>
      <button class="btn-secondary" @click="reload">🔄</button>
    </header>

    <p v-if="!uid" class="hint">尚未登入</p>
    <p v-else-if="loading" class="hint">載入中…</p>
    <p v-else-if="error" class="error">{{ error }}</p>
    <p v-else-if="!tasks.length" class="hint">今天沒有指派給你的任務 🎉</p>

    <div v-else class="task-list">
      <article v-for="t in tasks" :key="t.id" class="task-card" :class="t.status">
        <div class="card-top">
          <strong>{{ t.taskNo }}</strong>
          <span class="status-pill">{{ statusLabel(t.status) }}</span>
        </div>
        <h3 class="customer">{{ t.customerName || '—' }}</h3>
        <p class="addr">📍 {{ t.siteAddress || '無地址' }}</p>
        <p v-if="t.contactPhone" class="phone">
          📞 <a :href="`tel:${t.contactPhone}`">{{ t.contactPhone }}</a>
          <span v-if="t.contactName"> ({{ t.contactName }})</span>
        </p>
        <p v-if="t.note" class="note">📝 {{ t.note }}</p>
        <p v-if="t.followUpNote" class="followup">⚠️ {{ t.followUpNote }}</p>

        <div class="links">
          <a v-if="t.photoLinkUrl" :href="t.photoLinkUrl" target="_blank" rel="noopener">📷 訂單照片</a>
          <a v-if="t.bomFileUrl" :href="t.bomFileUrl" target="_blank" rel="noopener">📄 BOM</a>
        </div>

        <div class="actions">
          <button
            v-if="t.status === 'scheduled' || t.status === 'dispatched'"
            class="btn-primary"
            @click="startTask(t)"
          >出發</button>
          <button
            v-if="t.status === 'in_progress'"
            class="btn-success"
            @click="completeTask(t)"
          >完工回報</button>
          <button class="btn-secondary" @click="partialTask(t)">部分完工</button>
          <button class="btn-secondary" @click="openPhotos(t)">
            📷 完工照片<span v-if="photoCounts[t.id]"> ({{ photoCounts[t.id] }})</span>
          </button>
        </div>
      </article>
    </div>

    <!-- 完工照片對話框 -->
    <div v-if="photoDialog.open" class="modal-backdrop" @click.self="closePhotos">
      <div class="modal">
        <header class="modal-head">
          <strong>📷 完工照片 — {{ photoDialog.task?.taskNo }}</strong>
          <button class="btn-secondary" @click="closePhotos">關閉</button>
        </header>

        <div class="modal-body">
          <p class="hint" v-if="photoDialog.loading">載入中…</p>
          <p class="error" v-if="photoDialog.error">{{ photoDialog.error }}</p>

          <div v-if="photoDialog.photos.length" class="photo-grid">
            <a
              v-for="p in photoDialog.photos"
              :key="p.id"
              :href="p.downloadURL || '#'"
              target="_blank"
              rel="noopener"
              class="photo-thumb"
              :title="p.fileName || ''"
            >
              <img v-if="p.downloadURL" :src="p.downloadURL" :alt="p.fileName" loading="lazy" />
              <span v-else class="no-thumb">無預覽</span>
            </a>
          </div>
          <p v-else-if="!photoDialog.loading" class="hint">尚未上傳照片</p>

          <div class="upload-zone">
            <input
              type="file"
              ref="fileInputRef"
              accept="image/*,application/pdf"
              multiple
              capture="environment"
              @change="onFilesPicked"
              :disabled="photoDialog.uploading"
            />
            <p v-if="photoDialog.uploading" class="hint">
              上傳中… {{ photoDialog.progressText }}
            </p>
            <p v-if="photoDialog.uploadError" class="error">{{ photoDialog.uploadError }}</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed, reactive } from 'vue';
import { collection, query, where, onSnapshot, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import {
  db,
  auth,
  authReadyPromise,
  listInstallTaskCompletionPhotos,
  uploadInstallTaskCompletionPhotos,
} from '../firebase';

const tasks = ref([]);
const loading = ref(true);
const error = ref('');
const uid = ref('');
const photoCounts = reactive({}); // taskId -> 數量
const fileInputRef = ref(null);
const photoDialog = reactive({
  open: false,
  task: null,
  loading: false,
  error: '',
  photos: [],
  uploading: false,
  uploadError: '',
  progressText: '',
});

let unsubscribe = null;
let photoUnsubs = []; // [unsub fn]

function todayYmd() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

async function subscribe() {
  await authReadyPromise;
  const user = auth.currentUser;
  if (!user) {
    loading.value = false;
    return;
  }
  uid.value = user.uid;

  const today = todayYmd();
  // 指派給我的、今天的、未完工的任務
  const q = query(
    collection(db, 'installTasks'),
    where('assignedCrew', 'array-contains', user.uid),
    where('assignedDate', '==', today),
  );
  unsubscribe = onSnapshot(
    q,
    (snap) => {
      tasks.value = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((t) => !['completed', 'cancelled'].includes(t.status))
        .sort((a, b) => (a.taskNo > b.taskNo ? 1 : -1));
      loading.value = false;
      subscribePhotoCounts();
    },
    (err) => {
      error.value = err?.message || String(err);
      loading.value = false;
    },
  );
}

function subscribePhotoCounts() {
  // 為目前顯示中的每個任務訂閱 completionPhotos 數量
  photoUnsubs.forEach((fn) => fn());
  photoUnsubs = [];
  for (const t of tasks.value) {
    const ref = collection(db, 'installTasks', t.id, 'completionPhotos');
    const unsub = onSnapshot(ref, (s) => {
      photoCounts[t.id] = s.size;
    });
    photoUnsubs.push(unsub);
  }
}

onMounted(subscribe);
onUnmounted(() => {
  if (unsubscribe) unsubscribe();
  photoUnsubs.forEach((fn) => fn());
});

function statusLabel(s) {
  return {
    pending: '待派',
    scheduled: '已排程',
    dispatched: '已派車',
    in_progress: '執行中',
    completed: '已完工',
    partial: '部分完工',
    cancelled: '已取消',
  }[s] || s;
}

async function setStatus(t, status, extra = {}) {
  try {
    await updateDoc(doc(db, 'installTasks', t.id), {
      status,
      updatedAt: serverTimestamp(),
      updatedByUid: uid.value,
      ...extra,
    });
  } catch (err) {
    alert(`狀態更新失敗：${err?.message || err}`);
  }
}

function startTask(t) { setStatus(t, 'in_progress'); }

async function completeTask(t) {
  if (!confirm(`確定回報 ${t.taskNo} 完工？`)) return;
  const chargeable = t.kind === 'install' ? false : confirm('是否為有償維修？');
  const chargeableNote = chargeable ? (prompt('有償維修說明：') || '') : '';
  await setStatus(t, 'completed', {
    completedAt: serverTimestamp(),
    completedByUid: uid.value,
    chargeable,
    chargeableNote,
  });
}

async function partialTask(t) {
  const followUpNote = prompt('未完成原因／需追加項目：');
  if (followUpNote === null) return;
  await setStatus(t, 'partial', {
    followUpNote,
    completedAt: serverTimestamp(),
    completedByUid: uid.value,
  });
}

async function openPhotos(t) {
  photoDialog.open = true;
  photoDialog.task = t;
  photoDialog.loading = true;
  photoDialog.error = '';
  photoDialog.photos = [];
  photoDialog.uploadError = '';
  try {
    photoDialog.photos = await listInstallTaskCompletionPhotos(t.id);
  } catch (e) {
    photoDialog.error = e?.message || String(e);
  } finally {
    photoDialog.loading = false;
  }
}

function closePhotos() {
  photoDialog.open = false;
  photoDialog.task = null;
  photoDialog.photos = [];
}

async function onFilesPicked(evt) {
  const input = evt.target;
  const files = Array.from(input.files || []);
  if (!files.length || !photoDialog.task) return;

  photoDialog.uploading = true;
  photoDialog.uploadError = '';
  photoDialog.progressText = `0 / ${files.length}`;
  try {
    const { failedFiles } = await uploadInstallTaskCompletionPhotos(
      photoDialog.task,
      files,
      (info) => {
        if (!info) return;
        const idx = info.fileIndex || 0;
        const tot = info.totalFiles || files.length;
        const pct = Math.round((info.overallProgress || 0) * 100);
        photoDialog.progressText = `${idx} / ${tot}  (${pct}%)`;
      },
    );
    if (failedFiles && failedFiles.length) {
      photoDialog.uploadError = `${failedFiles.length} 個檔案上傳失敗:\n` +
        failedFiles.map((f) => `${f.name}: ${f.errorMessage}`).join('\n');
    }
    // 重新讀取列表
    try {
      photoDialog.photos = await listInstallTaskCompletionPhotos(photoDialog.task.id);
    } catch (_) {}
  } catch (e) {
    photoDialog.uploadError = e?.message || String(e);
  } finally {
    photoDialog.uploading = false;
    photoDialog.progressText = '';
    if (input) input.value = '';
  }
}
</script>

<style scoped>
.my-today { padding: 12px; max-width: 720px; margin: 0 auto; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.btn-secondary { background: #f3f4f6; border: 1px solid #d1d5db; padding: 4px 10px; border-radius: 4px; cursor: pointer; }
.btn-primary { background: #2563eb; color: #fff; border: 0; padding: 8px 14px; border-radius: 4px; cursor: pointer; flex: 1; }
.btn-success { background: #16a34a; color: #fff; border: 0; padding: 8px 14px; border-radius: 4px; cursor: pointer; flex: 1; }

.task-list { display: flex; flex-direction: column; gap: 12px; }
.task-card { background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 14px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
.task-card.in_progress { border-left: 4px solid #2563eb; }
.task-card.partial { border-left: 4px solid #f59e0b; }
.card-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
.status-pill { font-size: 12px; background: #dbeafe; color: #1e40af; padding: 2px 8px; border-radius: 999px; }
.customer { margin: 4px 0; font-size: 18px; }
.addr { color: #4b5563; margin: 2px 0; }
.phone { margin: 4px 0; }
.phone a { color: #2563eb; text-decoration: none; }
.note { background: #fef9c3; padding: 6px 8px; border-radius: 4px; margin: 6px 0; font-size: 13px; }
.followup { background: #fee2e2; padding: 6px 8px; border-radius: 4px; margin: 6px 0; font-size: 13px; color: #991b1b; }
.links { display: flex; gap: 12px; margin: 8px 0; flex-wrap: wrap; }
.links a { color: #2563eb; text-decoration: none; font-size: 13px; }
.actions { display: flex; gap: 8px; margin-top: 10px; }
.hint, .error { text-align: center; padding: 24px; color: #6b7280; }
.error { color: #dc2626; }

/* 完工照片對話框 */
.modal-backdrop {
  position: fixed; inset: 0; background: rgba(0,0,0,0.5);
  display: flex; align-items: center; justify-content: center;
  z-index: 1000; padding: 12px;
}
.modal {
  background: #fff; border-radius: 8px; width: 100%; max-width: 720px;
  max-height: 90vh; display: flex; flex-direction: column;
}
.modal-head {
  display: flex; justify-content: space-between; align-items: center;
  padding: 12px 16px; border-bottom: 1px solid #e5e7eb;
}
.modal-body { padding: 12px 16px; overflow-y: auto; }
.photo-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 8px; margin-bottom: 12px;
}
.photo-thumb {
  display: block; aspect-ratio: 1; background: #f3f4f6; border-radius: 4px;
  overflow: hidden; border: 1px solid #e5e7eb;
}
.photo-thumb img { width: 100%; height: 100%; object-fit: cover; }
.no-thumb { display: flex; align-items: center; justify-content: center; height: 100%; color: #9ca3af; font-size: 12px; }
.upload-zone { border-top: 1px solid #e5e7eb; padding-top: 12px; }
.upload-zone input[type="file"] { display: block; width: 100%; padding: 8px; }
</style>
