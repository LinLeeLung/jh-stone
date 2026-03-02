<template>
  <section class="page-card">
    <div class="page-head">
      <h1>管理介面</h1>
    </div>

    <div v-if="loading" class="muted-text">讀取中…</div>

    <div v-else>
      <div v-if="!isAdmin">
        <p>您沒有權限存取此頁面。</p>
      </div>

      <div v-else>
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>姓名</th>
                <th class="secondary-col">電郵</th>
                <th>角色</th>
                <th>動作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="u in users" :key="u.id">
                <td>{{ u.displayName }}</td>
                <td class="secondary-col">{{ u.email }}</td>
                <td>
                  <select v-model="u.role">
                    <option v-for="r in roles" :key="r" :value="r">
                      {{ r }}
                    </option>
                  </select>
                </td>
                <td>
                  <button
                    class="btn-manage"
                    @click="applyRole(u)"
                    :disabled="!changed(u) || u.email === adminEmail"
                  >
                    更新
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { ref, onMounted } from "vue";
import {
  subscribeAuthState,
  fetchAllUsers,
  updateUserRole,
  ROLES,
} from "../firebase";
import { getUserByUid } from "../firebase";

const users = ref([]);
const loading = ref(true);
const isAdmin = ref(false);
const currentUid = ref(null);
// 不能修改的超級管理者 email
const adminEmail = "linlilung@gmal.com";

// 可用角色清單
const roles = ROLES;

async function loadUsers() {
  loading.value = true;
  const list = await fetchAllUsers();
  users.value = list.map((u) => ({
    ...u,
    role: u.role || "遊客",
    _origRole: u.role || "遊客",
  }));
  loading.value = false;
}

function changed(u) {
  return u.role !== u._origRole;
}

async function applyRole(u) {
  if (u.id === currentUid.value) {
    alert("無法變更自己的角色。");
    return;
  }
  if (u.email === adminEmail) {
    alert("此帳號的角色不可變更。");
    return;
  }
  await updateUserRole(u.id, u.role);
  await loadUsers();
}

onMounted(() => {
  subscribeAuthState(async (u) => {
    if (!u) {
      isAdmin.value = false;
      currentUid.value = null;
      return;
    }
    currentUid.value = u.uid;
    const doc = await getUserByUid(u.uid);
    isAdmin.value = doc && (doc.role === "admin" || doc.role === "管理者");
    if (isAdmin.value) await loadUsers();
  });
});
</script>
