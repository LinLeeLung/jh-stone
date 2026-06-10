<template>
  <section class="stove-models-view">
    <header class="page-header">
      <h2>爐子型號管理</h2>
      <button class="btn-primary" @click="openCreate">+ 新增型號</button>
    </header>

    <div class="toolbar">
      <input
        v-model.trim="keyword"
        class="kw-input"
        placeholder="搜尋 型號 / 呎吋 / 品牌"
      />
      <span class="count">共 {{ filteredRows.length }} 筆</span>
    </div>

    <div v-if="loading" class="hint">載入中...</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <div v-else-if="!rows.length" class="hint">尚未建立爐子型號資料</div>

    <table v-else class="data-table">
      <thead>
        <tr>
          <th>型號</th>
          <th>呎吋</th>
          <th>品牌</th>
          <th>啟用</th>
          <th>備註</th>
          <th>動作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in filteredRows" :key="row.id">
          <td><input v-model.trim="row.model" /></td>
          <td><input v-model.trim="row.sizeText" placeholder="例如 670*350*R85" /></td>
          <td><input v-model.trim="row.brand" /></td>
          <td style="text-align: center">
            <input type="checkbox" v-model="row.active" />
          </td>
          <td><input v-model.trim="row.notes" /></td>
          <td class="actions">
            <button class="btn-mini" :disabled="!isDirty(row)" @click="save(row)">儲存</button>
            <button class="btn-danger" @click="removeRow(row)">刪除</button>
          </td>
        </tr>
      </tbody>
    </table>

    <div v-if="creating" class="dialog-mask" @click.self="creating = false">
      <div class="dialog-card">
        <h3>新增爐子型號</h3>
        <div class="form-grid">
          <label>
            型號
            <input v-model.trim="createForm.model" placeholder="必填" />
          </label>
          <label>
            呎吋
            <input v-model.trim="createForm.sizeText" placeholder="例如 670*350*R85" />
          </label>
          <label>
            品牌
            <input v-model.trim="createForm.brand" placeholder="選填" />
          </label>
          <label>
            備註
            <input v-model.trim="createForm.notes" placeholder="選填" />
          </label>
          <label class="checkbox-row">
            <input type="checkbox" v-model="createForm.active" />
            啟用
          </label>
        </div>
        <div class="dialog-actions">
          <button class="btn-ghost" @click="creating = false">取消</button>
          <button class="btn-primary" @click="confirmCreate">建立</button>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import {
  createStoveModel,
  deleteStoveModel,
  listStoveModels,
  updateStoveModel,
} from "../firebase";

const rows = ref([]);
const loading = ref(true);
const error = ref("");
const keyword = ref("");

const creating = ref(false);
const createForm = ref({
  model: "",
  sizeText: "",
  brand: "",
  notes: "",
  active: true,
});

function snapshot(doc) {
  const normalized = {
    id: doc.id,
    model: String(doc.model || "").trim(),
    sizeText: String(doc.sizeText || doc.rawText || "").trim(),
    brand: String(doc.brand || "").trim(),
    notes: String(doc.notes || "").trim(),
    active: doc.active !== false,
  };
  return {
    ...normalized,
    _orig: JSON.stringify({
      model: normalized.model,
      sizeText: normalized.sizeText,
      brand: normalized.brand,
      notes: normalized.notes,
      active: normalized.active,
    }),
  };
}

async function load() {
  loading.value = true;
  error.value = "";
  try {
    const list = await listStoveModels();
    rows.value = list.map(snapshot);
  } catch (err) {
    error.value = err?.message || String(err);
  } finally {
    loading.value = false;
  }
}

const filteredRows = computed(() => {
  const kw = keyword.value.toLowerCase();
  if (!kw) return rows.value;
  return rows.value.filter((row) =>
    [row.model, row.sizeText, row.brand, row.notes]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(kw),
  );
});

function isDirty(row) {
  const current = JSON.stringify({
    model: String(row.model || "").trim(),
    sizeText: String(row.sizeText || "").trim(),
    brand: String(row.brand || "").trim(),
    notes: String(row.notes || "").trim(),
    active: row.active !== false,
  });
  return current !== row._orig;
}

function openCreate() {
  createForm.value = {
    model: "",
    sizeText: "",
    brand: "",
    notes: "",
    active: true,
  };
  creating.value = true;
}

async function confirmCreate() {
  if (!createForm.value.model) {
    alert("請輸入型號");
    return;
  }
  try {
    await createStoveModel(createForm.value);
    creating.value = false;
    await load();
  } catch (err) {
    alert(`建立失敗：${err?.message || err}`);
  }
}

async function save(row) {
  if (!row.model) {
    alert("型號不可空白");
    return;
  }
  try {
    await updateStoveModel(row.id, {
      model: row.model,
      sizeText: row.sizeText,
      brand: row.brand,
      notes: row.notes,
      active: row.active,
    });
    row._orig = JSON.stringify({
      model: String(row.model || "").trim(),
      sizeText: String(row.sizeText || "").trim(),
      brand: String(row.brand || "").trim(),
      notes: String(row.notes || "").trim(),
      active: row.active !== false,
    });
  } catch (err) {
    alert(`儲存失敗：${err?.message || err}`);
  }
}

async function removeRow(row) {
  if (!confirm(`確定刪除「${row.model || row.id}」？`)) return;
  try {
    await deleteStoveModel(row.id);
    await load();
  } catch (err) {
    alert(`刪除失敗：${err?.message || err}`);
  }
}

onMounted(load);
</script>

<style scoped>
.stove-models-view {
  padding: 16px;
  max-width: 1200px;
  margin: 0 auto;
}
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.toolbar {
  display: flex;
  gap: 12px;
  align-items: center;
  margin-bottom: 12px;
}
.kw-input {
  flex: 1;
  max-width: 360px;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  padding: 6px 8px;
}
.count {
  color: #6b7280;
  font-size: 13px;
}
.btn-primary {
  background: #2563eb;
  color: #fff;
  border: 0;
  padding: 6px 12px;
  border-radius: 4px;
  cursor: pointer;
}
.btn-mini {
  background: #2563eb;
  color: #fff;
  border: 0;
  padding: 4px 10px;
  border-radius: 3px;
  cursor: pointer;
  margin-right: 4px;
}
.btn-mini:disabled {
  background: #93c5fd;
  cursor: not-allowed;
}
.btn-danger {
  background: #dc2626;
  color: #fff;
  border: 0;
  padding: 4px 10px;
  border-radius: 3px;
  cursor: pointer;
}
.btn-ghost {
  border: 1px solid #d1d5db;
  background: #fff;
  padding: 6px 12px;
  border-radius: 4px;
  cursor: pointer;
}
.data-table {
  width: 100%;
  border-collapse: collapse;
}
.data-table th,
.data-table td {
  border-bottom: 1px solid #e5e7eb;
  padding: 6px 8px;
  text-align: left;
}
.data-table th {
  background: #f9fafb;
  font-size: 13px;
}
.data-table input {
  width: 100%;
  border: 1px solid #d1d5db;
  border-radius: 3px;
  padding: 4px 6px;
  box-sizing: border-box;
}
.actions {
  white-space: nowrap;
}
.hint,
.error {
  text-align: center;
  padding: 24px;
  color: #6b7280;
}
.error {
  color: #dc2626;
}
.dialog-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  display: grid;
  place-items: center;
  z-index: 1000;
}
.dialog-card {
  width: min(560px, calc(100vw - 24px));
  background: #fff;
  border-radius: 10px;
  padding: 16px;
}
.form-grid {
  display: grid;
  gap: 10px;
  margin-top: 10px;
}
.form-grid label {
  display: grid;
  gap: 4px;
  font-size: 14px;
}
.checkbox-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.dialog-actions {
  margin-top: 14px;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
