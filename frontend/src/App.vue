<template>
  <div class="app-shell">
    <nav ref="navRef" class="top-nav">
      <button
        class="nav-toggle"
        type="button"
        :aria-expanded="navOpen"
        aria-label="切換導覽選單"
        @click="toggleNav"
      >
        ☰
      </button>

      <div class="top-nav-links" :class="{ open: navOpen }">
        <RouterLink class="nav-link" to="/" @click="closeNav">首頁</RouterLink>
        <RouterLink class="nav-link" to="/about" @click="closeNav"
          >關於我</RouterLink
        >
        <RouterLink
          class="nav-link"
          v-if="
            userDoc && (userDoc.role === 'admin' || userDoc.role === '管理者')
          "
          to="/admin"
          @click="closeNav"
          >管理介面</RouterLink
        >
        <RouterLink
          class="nav-link"
          v-if="
            userDoc &&
            (userDoc.role === '員工' ||
              userDoc.role === 'admin' ||
              userDoc.role === '管理者')
          "
          to="/employee"
          @click="closeNav"
          >員工查詢</RouterLink
        >
      </div>
      <div v-if="user" class="top-nav-user">
        <img :src="user.photoURL" alt="user avatar" class="user-avatar" />
        <span>{{ user.displayName }}</span>

        <button class="btn-aux" @click="handleLogout">登出</button>
      </div>
    </nav>

    <main class="app-main">
      <RouterView />
    </main>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from "vue";
import { logout, subscribeAuthState, getUserByUid } from "./firebase";
const user = ref(null);
const userDoc = ref(null);
const navOpen = ref(false);
const navRef = ref(null);

onMounted(() => {
  subscribeAuthState(async (currentUser) => {
    user.value = currentUser;
    if (currentUser) {
      userDoc.value = await getUserByUid(currentUser.uid);
    } else {
      userDoc.value = null;
    }
  });
});
function handleLogout() {
  logout().catch((err) => {
    console.error("Sign-out failed:", err);
  });
}

function toggleNav() {
  navOpen.value = !navOpen.value;
}

function closeNav() {
  navOpen.value = false;
}

function handleDocumentClick(event) {
  if (!navOpen.value) return;
  const navElement = navRef.value;
  if (!navElement) return;
  if (!navElement.contains(event.target)) {
    navOpen.value = false;
  }
}

onMounted(() => {
  document.addEventListener("click", handleDocumentClick);
});

onUnmounted(() => {
  document.removeEventListener("click", handleDocumentClick);
});
</script>
