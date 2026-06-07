<template>
  <div class="sp-root no-print">
  <div class="stamp-panel">
    <!-- Header -->
    <div class="sp-header">
      <span class="sp-title">🔖 圖章庫</span>
      <button class="sp-close" @click="emit('close')" title="關閉">✕</button>
    </div>

    <!-- Tabs -->
    <div class="sp-tabs">
      <button :class="['sp-tab', { active: tab === 'mine' }]" @click="tab = 'mine'">我的圖章</button>
      <button :class="['sp-tab', { active: tab === 'company' }]" @click="tab = 'company'">公司圖章</button>
      <button class="sp-add-btn" @click="openCreate">＋ 新增</button>
    </div>

    <!-- Stamp grid -->
    <div class="sp-grid">
      <div v-if="loading" class="sp-empty">載入中…</div>
      <div v-else-if="visibleStamps.length === 0" class="sp-empty">暫無圖章</div>
      <div
        v-for="stamp in visibleStamps"
        :key="stamp.id"
        class="sp-card"
        @click="doInsert(stamp)"
        title="點一下插入到畫面"
      >
        <div class="sp-preview">
          <img v-if="stamp.imageUrl" :src="stamp.imageUrl" draggable="false" />
          <span v-else class="sp-no-img">?</span>
        </div>
        <div class="sp-name" :title="stamp.name">{{ stamp.name }}</div>
        <div class="sp-author" v-if="stamp.authorUid !== myUid">{{ stamp.authorName }}</div>
        <div class="sp-actions">
          <button class="sp-btn sp-ins" @click.stop="doInsert(stamp)" title="插入到畫面">插入</button>
          <!-- Company tab: save/unsave (not own) -->
          <button
            v-if="tab === 'company' && stamp.authorUid !== myUid"
            class="sp-btn sp-save"
            :class="{ saved: savedIds.has(stamp.id) }"
            @click.stop="toggleSave(stamp)"
          >{{ savedIds.has(stamp.id) ? '✓已收藏' : '收藏' }}</button>
          <!-- My tab: unsave (saved from others) -->
          <button
            v-if="tab === 'mine' && stamp.authorUid !== myUid"
            class="sp-btn sp-unsave"
            @click.stop="toggleSave(stamp)"
          >取消收藏</button>
          <!-- Own stamps: share toggle -->
          <button
            v-if="stamp.authorUid === myUid"
            class="sp-btn sp-share"
            :class="{ shared: stamp.shared }"
            @click.stop="doToggleShare(stamp)"
            :title="stamp.shared ? '取消分享' : '分享給公司'"
          >{{ stamp.shared ? '共用中' : '分享' }}</button>
          <!-- Own stamps: delete -->
          <button
            v-if="stamp.authorUid === myUid"
            class="sp-btn sp-del"
            @click.stop="doDelete(stamp)"
            title="刪除"
          >刪除</button>
        </div>
      </div>
    </div>

  </div><!-- /stamp-panel -->

    <!-- ── Create Modal (outside .stamp-panel to avoid transform clipping) ── -->
    <div v-if="showCreate" class="sp-modal-bg" @mousedown.self="showCreate = false">
      <div class="sp-modal">
        <div class="sp-modal-header">
          <span>新增圖章</span>
          <button class="sp-close" @click="showCreate = false">✕</button>
        </div>

        <!-- Create tabs -->
        <div class="sp-ctabs">
          <button :class="['sp-ctab', { active: createTab === 'upload' }]" @click="createTab = 'upload'">上傳圖片</button>
          <button :class="['sp-ctab', { active: createTab === 'text' }]" @click="switchToText">文字圖章</button>
        </div>

        <!-- Upload tab -->
        <div v-if="createTab === 'upload'" class="sp-upload-area" tabindex="0" @paste="onPaste">
          <label class="sp-file-label">
            點此選擇圖片 (PNG / JPG / SVG)
            <input type="file" accept="image/png,image/jpeg,image/svg+xml" @change="onFileSelect" style="display:none" />
          </label>
          <div class="sp-paste-hint">或按 Ctrl+V 貼上圖片</div>
          <img v-if="uploadPreview" :src="uploadPreview" class="sp-img-preview" />
        </div>

        <!-- Text stamp builder -->
        <div v-if="createTab === 'text'" class="sp-text-builder">
          <div class="sp-row">
            <label>文字內容</label>
            <textarea v-model="tc.text" rows="2" class="sp-textarea" @input="renderPreview" placeholder="例：核准" />
          </div>
          <div class="sp-row">
            <label>外框形狀</label>
            <label class="sp-radio"><input type="radio" v-model="tc.shape" value="circle" @change="renderPreview" /> 圓形</label>
            <label class="sp-radio"><input type="radio" v-model="tc.shape" value="rect" @change="renderPreview" /> 方形</label>
          </div>
          <div class="sp-row sp-color-row">
            <label>文字</label>
            <input type="color" v-model="tc.textColor" @input="renderPreview" class="sp-color" />
            <label>外框</label>
            <input type="color" v-model="tc.borderColor" @input="renderPreview" class="sp-color" />
            <label>字級</label>
            <input type="range" v-model.number="tc.fontSize" min="14" max="52" step="2" @input="renderPreview" style="width:80px" />
            <span class="sp-fs-val">{{ tc.fontSize }}px</span>
          </div>
          <div class="sp-canvas-wrap">
            <canvas ref="textCanvasRef" class="sp-text-canvas" />
          </div>
        </div>

        <!-- Common fields -->
        <div class="sp-row sp-name-row">
          <label>圖章名稱</label>
          <input v-model="newName" class="sp-name-input" placeholder="例：已核准" maxlength="20" />
        </div>
        <div class="sp-row">
          <label class="sp-check-label">
            <input type="checkbox" v-model="newShared" />
            分享給公司所有人
          </label>
        </div>

        <div class="sp-modal-footer">
          <button class="sp-btn sp-ins" @click="doCreate" :disabled="creating">
            {{ creating ? '儲存中…' : '💾 儲存' }}
          </button>
          <button class="sp-btn" @click="showCreate = false">取消</button>
        </div>
      </div>
    </div>
  </div><!-- /sp-root -->
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from "vue";
import { auth } from "../firebase";
import {
  listStamps,
  createStamp,
  deleteStamp,
  toggleStampShared,
  saveStampToLibrary,
  removeStampFromLibrary,
  getMySavedStampIds,
} from "../firebase";

const emit = defineEmits(["insert", "close"]);

// ── State ──────────────────────────────────────────────────────────
const tab = ref("mine");
const loading = ref(false);
const stamps = ref([]);
const savedIds = ref(new Set());
const myUid = computed(() => auth.currentUser?.uid);

// Create modal
const showCreate = ref(false);
const createTab = ref("upload");
const uploadPreview = ref(null);
const uploadFileRef = ref(null);
const newName = ref("");
const newShared = ref(false);
const creating = ref(false);
const textCanvasRef = ref(null);
const tc = ref({
  text: "核准",
  shape: "circle",
  textColor: "#cc0000",
  borderColor: "#cc0000",
  fontSize: 30,
});

// ── Computed ───────────────────────────────────────────────────────
const visibleStamps = computed(() => {
  if (tab.value === "mine") {
    return stamps.value.filter(
      (s) => s.authorUid === myUid.value || savedIds.value.has(s.id)
    );
  }
  return stamps.value.filter((s) => s.shared);
});

// ── Data loading ───────────────────────────────────────────────────
async function loadData() {
  loading.value = true;
  try {
    const [all, ids] = await Promise.all([listStamps(), getMySavedStampIds()]);
    stamps.value = all;
    savedIds.value = new Set(ids);
  } catch (e) {
    console.error("loadStamps failed", e);
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  loadData();
  window.addEventListener("paste", onWindowPaste);
});
onUnmounted(() => {
  window.removeEventListener("paste", onWindowPaste);
});

// ── Text stamp canvas preview ──────────────────────────────────────
function renderPreview() {
  const canvas = textCanvasRef.value;
  if (!canvas) return;
  const c = tc.value;
  const rawLines = (c.text || "").split("\n");
  const lines = rawLines.length ? rawLines : [""];
  const fs = c.fontSize || 30;
  const lineH = fs * 1.45;

  // measure
  const tmp = document.createElement("canvas").getContext("2d");
  tmp.font = `bold ${fs}px "微軟正黑體","Microsoft JhengHei",Arial,sans-serif`;
  const maxW = Math.max(10, ...lines.map((l) => tmp.measureText(l || " ").width));

  const ctx = canvas.getContext("2d");

  if (c.shape === "circle") {
    const r = Math.max(50, maxW * 0.62 + fs * 0.5, (lines.length * lineH) * 0.62 + fs * 0.5);
    canvas.width = Math.round(r * 2 + 12);
    canvas.height = Math.round(r * 2 + 12);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = c.borderColor;
    ctx.lineWidth = Math.max(3, fs * 0.13);
    ctx.beginPath();
    ctx.arc(canvas.width / 2, canvas.height / 2, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = c.textColor;
    ctx.font = `bold ${fs}px "微軟正黑體","Microsoft JhengHei",Arial,sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const totalH = lines.length * lineH;
    lines.forEach((line, i) => {
      ctx.fillText(line, canvas.width / 2, canvas.height / 2 - totalH / 2 + i * lineH + lineH / 2);
    });
  } else {
    const padX = fs * 0.7;
    const padY = fs * 0.45;
    canvas.width = Math.round(Math.max(80, maxW + padX * 2));
    canvas.height = Math.round(Math.max(40, lines.length * lineH + padY * 2));
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = c.borderColor;
    ctx.lineWidth = Math.max(3, fs * 0.13);
    ctx.strokeRect(4, 4, canvas.width - 8, canvas.height - 8);
    ctx.fillStyle = c.textColor;
    ctx.font = `bold ${fs}px "微軟正黑體","Microsoft JhengHei",Arial,sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const totalH = lines.length * lineH;
    lines.forEach((line, i) => {
      ctx.fillText(line, canvas.width / 2, canvas.height / 2 - totalH / 2 + i * lineH + lineH / 2);
    });
  }
}

watch(
  [() => tc.value.text, () => tc.value.shape, () => tc.value.textColor, () => tc.value.borderColor, () => tc.value.fontSize],
  () => nextTick(renderPreview)
);

function switchToText() {
  createTab.value = "text";
  nextTick(renderPreview);
}

// ── File upload / paste ───────────────────────────────────────────
function onFileSelect(e) {
  const file = e.target.files[0];
  if (!file) return;
  loadImageFile(file);
}

function onPaste(e) {
  const items = e.clipboardData?.items;
  if (!items) return;
  for (const item of items) {
    if (item.type.startsWith("image/")) {
      const file = item.getAsFile();
      if (file) { loadImageFile(file); e.preventDefault(); return; }
    }
  }
}

function onWindowPaste(e) {
  if (!showCreate.value || createTab.value !== "upload") return;
  onPaste(e);
}

function loadImageFile(file) {
  uploadFileRef.value = file;
  const reader = new FileReader();
  reader.onload = (ev) => (uploadPreview.value = ev.target.result);
  reader.readAsDataURL(file);
}

// ── Create ─────────────────────────────────────────────────────────
function openCreate() {
  newName.value = "";
  newShared.value = false;
  uploadPreview.value = null;
  uploadFileRef.value = null;
  createTab.value = "upload";
  showCreate.value = true;
}

async function canvasToBlob(canvas) {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

async function doCreate() {
  if (!newName.value.trim()) { alert("請輸入圖章名稱"); return; }
  creating.value = true;
  try {
    let imageBlob;
    let textConfig = null;

    if (createTab.value === "upload") {
      if (!uploadFileRef.value) { alert("請選擇圖片"); return; }
      imageBlob = uploadFileRef.value;
    } else {
      const canvas = textCanvasRef.value;
      if (!canvas) return;
      imageBlob = await canvasToBlob(canvas);
      textConfig = { ...tc.value };
    }

    await createStamp({ name: newName.value.trim(), shared: newShared.value, textConfig }, imageBlob);
    await loadData();
    showCreate.value = false;
  } catch (e) {
    alert("儲存失敗：" + e.message);
  } finally {
    creating.value = false;
  }
}

// ── Actions ────────────────────────────────────────────────────────
function doInsert(stamp) {
  emit("insert", stamp);
}

async function doDelete(stamp) {
  if (!confirm(`確定刪除「${stamp.name}」？`)) return;
  try {
    await deleteStamp(stamp.id);
    stamps.value = stamps.value.filter((s) => s.id !== stamp.id);
  } catch (e) {
    alert("刪除失敗：" + e.message);
  }
}

async function doToggleShare(stamp) {
  try {
    await toggleStampShared(stamp.id, !stamp.shared);
    stamp.shared = !stamp.shared;
  } catch (e) {
    alert("操作失敗：" + e.message);
  }
}

async function toggleSave(stamp) {
  try {
    if (savedIds.value.has(stamp.id)) {
      await removeStampFromLibrary(stamp.id);
      const next = new Set(savedIds.value);
      next.delete(stamp.id);
      savedIds.value = next;
    } else {
      await saveStampToLibrary(stamp.id);
      const next = new Set(savedIds.value);
      next.add(stamp.id);
      savedIds.value = next;
    }
  } catch (e) {
    alert("操作失敗：" + e.message);
  }
}
</script>

<style scoped>
.sp-root {
  display: contents;
}
.stamp-panel {
  position: fixed;
  top: 54px;
  left: 50%;
  transform: translateX(-50%);
  width: 560px;
  max-height: 70vh;
  background: #1e293b;
  border: 1px solid #334155;
  border-radius: 8px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.45);
  display: flex;
  flex-direction: column;
  z-index: 1000;
  overflow: hidden;
  font-size: 12px;
  color: #e2e8f0;
}
.sp-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px 6px;
  background: #0f172a;
  border-bottom: 1px solid #334155;
  flex-shrink: 0;
}
.sp-title { font-weight: 700; font-size: 13px; }
.sp-close {
  background: none; border: none; color: #94a3b8;
  cursor: pointer; font-size: 14px; padding: 0 2px; line-height: 1;
}
.sp-close:hover { color: #f87171; }
.sp-tabs {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 6px 10px 4px;
  background: #0f172a;
  border-bottom: 1px solid #334155;
  flex-shrink: 0;
}
.sp-tab {
  padding: 4px 12px;
  background: none;
  border: 1px solid #475569;
  border-radius: 4px;
  color: #94a3b8;
  cursor: pointer;
  font-size: 12px;
}
.sp-tab.active { background: #2563eb; border-color: #2563eb; color: #fff; }
.sp-add-btn {
  margin-left: auto;
  padding: 4px 10px;
  background: #16a34a;
  border: none;
  border-radius: 4px;
  color: #fff;
  cursor: pointer;
  font-size: 12px;
}
.sp-add-btn:hover { background: #15803d; }
.sp-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  padding: 10px;
  overflow-y: auto;
  flex: 1;
}
.sp-empty { grid-column: 1/-1; text-align: center; color: #64748b; padding: 20px 0; }
.sp-card {
  background: #0f172a;
  border: 1px solid #334155;
  border-radius: 6px;
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-items: center;
}
.sp-card:hover { border-color: #2563eb; }
.sp-preview {
  width: 100%;
  aspect-ratio: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #fff;
  border-radius: 4px;
  overflow: hidden;
}
.sp-preview img { max-width: 100%; max-height: 100%; object-fit: contain; }
.sp-no-img { color: #94a3b8; font-size: 22px; }
.sp-name {
  font-size: 11px;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  width: 100%;
  color: #cbd5e1;
}
.sp-author { font-size: 10px; color: #64748b; text-align: center; }
.sp-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
  justify-content: center;
  width: 100%;
}
.sp-btn {
  padding: 2px 7px;
  border-radius: 3px;
  border: 1px solid #475569;
  background: #1e293b;
  color: #cbd5e1;
  cursor: pointer;
  font-size: 10px;
  white-space: nowrap;
}
.sp-btn:hover { background: #334155; }
.sp-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.sp-ins { border-color: #2563eb; color: #93c5fd; }
.sp-ins:hover { background: #1d4ed8; color: #fff; }
.sp-save { border-color: #d97706; color: #fcd34d; }
.sp-save.saved { border-color: #16a34a; color: #86efac; background: #052e16; }
.sp-del { border-color: #dc2626; color: #fca5a5; }
.sp-del:hover { background: #7f1d1d; }
.sp-share { border-color: #7c3aed; color: #c4b5fd; }
.sp-share.shared { background: #3b0764; border-color: #a855f7; }
.sp-unsave { border-color: #64748b; color: #94a3b8; }

/* ── Modal ── */
.sp-modal-bg {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.6);
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
}
.sp-modal {
  background: #1e293b;
  border: 1px solid #475569;
  border-radius: 10px;
  padding: 18px 20px;
  width: 420px;
  max-height: 88vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
  color: #e2e8f0;
}
.sp-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-weight: 700;
  font-size: 14px;
}
.sp-ctabs {
  display: flex;
  gap: 4px;
  border-bottom: 1px solid #334155;
  padding-bottom: 6px;
}
.sp-ctab {
  padding: 5px 14px;
  background: none;
  border: 1px solid #475569;
  border-radius: 4px;
  color: #94a3b8;
  cursor: pointer;
  font-size: 12px;
}
.sp-ctab.active { background: #2563eb; border-color: #2563eb; color: #fff; }
.sp-upload-area {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}
.sp-file-label {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 80px;
  border: 2px dashed #475569;
  border-radius: 6px;
  cursor: pointer;
  color: #94a3b8;
  font-size: 12px;
  text-align: center;
  padding: 10px;
}
.sp-file-label:hover { border-color: #2563eb; color: #93c5fd; }
.sp-paste-hint { font-size: 11px; color: #64748b; text-align: center; margin-top: 4px; }
.sp-img-preview { max-width: 100%; max-height: 160px; object-fit: contain; border-radius: 4px; }
.sp-text-builder { display: flex; flex-direction: column; gap: 8px; }
.sp-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}
.sp-row label { color: #94a3b8; white-space: nowrap; min-width: 52px; }
.sp-textarea {
  flex: 1;
  background: #0f172a;
  border: 1px solid #475569;
  border-radius: 4px;
  color: #e2e8f0;
  font-size: 13px;
  padding: 4px 6px;
  resize: vertical;
  font-family: "微軟正黑體", "Microsoft JhengHei", Arial, sans-serif;
}
.sp-radio { display: flex; align-items: center; gap: 4px; cursor: pointer; color: #cbd5e1; }
.sp-color-row { flex-wrap: wrap; gap: 6px; }
.sp-color { width: 32px; height: 24px; border: none; border-radius: 3px; cursor: pointer; padding: 0; }
.sp-fs-val { color: #94a3b8; min-width: 34px; }
.sp-canvas-wrap {
  display: flex;
  justify-content: center;
  padding: 8px;
  background: #fff;
  border-radius: 6px;
  min-height: 60px;
}
.sp-text-canvas { display: block; }
.sp-name-row { margin-top: 4px; }
.sp-name-input {
  flex: 1;
  background: #0f172a;
  border: 1px solid #475569;
  border-radius: 4px;
  color: #e2e8f0;
  font-size: 13px;
  padding: 4px 8px;
}
.sp-check-label { display: flex; align-items: center; gap: 6px; cursor: pointer; color: #cbd5e1; }
.sp-modal-footer {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  border-top: 1px solid #334155;
  padding-top: 10px;
}
</style>
