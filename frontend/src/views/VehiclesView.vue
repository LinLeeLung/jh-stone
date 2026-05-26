<template>
  <section class="vehicles-view">
    <header class="page-header">
      <h2>🚚 車輛管理</h2>
      <button class="btn-primary" @click="openCreate">＋ 新增車輛</button>
    </header>

    <div v-if="loading" class="hint">載入中…</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <div v-else-if="!vehicles.length" class="hint">尚未建立任何車輛資料</div>

    <table v-else class="data-table">
      <thead>
        <tr>
          <th>車牌</th>
          <th>名稱／別稱</th>
          <th>類型</th>
          <th>載重(kg)</th>
          <th>備註</th>
          <th>啟用</th>
          <th>動作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="v in vehicles" :key="v.id">
          <td><input v-model="v.plate" /></td>
          <td><input v-model="v.name" /></td>
          <td>
            <select v-model="v.kind">
              <option value="truck">貨車</option>
              <option value="van">廂車</option>
              <option value="pickup">皮卡</option>
              <option value="other">其他</option>
            </select>
          </td>
          <td><input v-model.number="v.capacity" type="number" min="0" style="width: 90px" /></td>
          <td><input v-model="v.note" /></td>
          <td style="text-align:center">
            <input type="checkbox" v-model="v.active" />
          </td>
          <td class="actions">
            <button class="btn-mini" :disabled="!isDirty(v)" @click="save(v)">儲存</button>
            <button class="btn-danger" @click="remove(v)">刪除</button>
          </td>
        </tr>
      </tbody>
    </table>
  </section>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import {
  collection, doc, getDocs, addDoc, updateDoc, deleteDoc, serverTimestamp,
} from 'firebase/firestore';
import { db, auth } from '../firebase';

const vehicles = ref([]);
const loading = ref(true);
const error = ref('');

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const snap = await getDocs(collection(db, 'vehicles'));
    vehicles.value = snap.docs.map((d) => snapshot(d.id, d.data()));
  } catch (err) {
    error.value = err?.message || String(err);
  } finally {
    loading.value = false;
  }
}

function snapshot(id, data) {
  return {
    id,
    plate: data.plate || '',
    name: data.name || '',
    kind: data.kind || 'truck',
    capacity: data.capacity || 0,
    note: data.note || '',
    active: data.active !== false,
    _orig: JSON.stringify({
      plate: data.plate || '',
      name: data.name || '',
      kind: data.kind || 'truck',
      capacity: data.capacity || 0,
      note: data.note || '',
      active: data.active !== false,
    }),
  };
}

function isDirty(v) {
  const cur = JSON.stringify({
    plate: v.plate || '',
    name: v.name || '',
    kind: v.kind || 'truck',
    capacity: v.capacity || 0,
    note: v.note || '',
    active: v.active !== false,
  });
  return cur !== v._orig;
}

onMounted(load);

async function openCreate() {
  try {
    const uid = auth.currentUser?.uid || 'system';
    await addDoc(collection(db, 'vehicles'), {
      plate: '',
      name: '新車輛',
      kind: 'truck',
      capacity: 0,
      note: '',
      active: true,
      createdAt: serverTimestamp(),
      createdByUid: uid,
      updatedAt: serverTimestamp(),
      updatedByUid: uid,
    });
    await load();
  } catch (err) {
    alert(`新增失敗：${err?.message || err}`);
  }
}

async function save(v) {
  try {
    const uid = auth.currentUser?.uid || 'system';
    await updateDoc(doc(db, 'vehicles', v.id), {
      plate: v.plate || '',
      name: v.name || '',
      kind: v.kind || 'truck',
      capacity: Number(v.capacity) || 0,
      note: v.note || '',
      active: v.active !== false,
      updatedAt: serverTimestamp(),
      updatedByUid: uid,
    });
    await load();
  } catch (err) {
    alert(`儲存失敗：${err?.message || err}`);
  }
}

async function remove(v) {
  if (!confirm(`確定刪除車輛「${v.plate || v.name || v.id}」?`)) return;
  try {
    await deleteDoc(doc(db, 'vehicles', v.id));
    await load();
  } catch (err) {
    alert(`刪除失敗：${err?.message || err}`);
  }
}
</script>

<style scoped>
.vehicles-view { padding: 16px; max-width: 1100px; margin: 0 auto; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.btn-primary { background: #2563eb; color: #fff; border: 0; padding: 6px 12px; border-radius: 4px; cursor: pointer; }
.btn-mini { background: #2563eb; color: #fff; border: 0; padding: 4px 10px; border-radius: 3px; cursor: pointer; margin-right: 4px; }
.btn-mini:disabled { background: #93c5fd; cursor: not-allowed; }
.btn-danger { background: #dc2626; color: #fff; border: 0; padding: 4px 10px; border-radius: 3px; cursor: pointer; }
.data-table { width: 100%; border-collapse: collapse; }
.data-table th, .data-table td { padding: 6px 8px; border-bottom: 1px solid #e5e7eb; text-align: left; }
.data-table th { background: #f9fafb; font-size: 13px; }
.data-table input { padding: 4px 6px; border: 1px solid #d1d5db; border-radius: 3px; width: 100%; box-sizing: border-box; }
.data-table select { padding: 4px 6px; border: 1px solid #d1d5db; border-radius: 3px; }
.actions { white-space: nowrap; }
.hint, .error { padding: 24px; text-align: center; color: #6b7280; }
.error { color: #dc2626; }
</style>
