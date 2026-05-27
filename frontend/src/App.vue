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
          >說明</RouterLink
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
            (userDoc.role === 'admin' ||
              userDoc.role === '管理者' ||
              String(userDoc.dept) === '1')
          "
          to="/orders"
          @click="closeNav"
          >訂單</RouterLink
        >
        <RouterLink
          class="nav-link"
          v-if="
            userDoc &&
            (userDoc.role === 'admin' ||
              userDoc.role === '管理者' ||
              String(userDoc.dept) === '1')
          "
          to="/orders/dispatch"
          @click="closeNav"
          >發單作業</RouterLink
        >
        <RouterLink
          class="nav-link"
          v-if="
            userDoc &&
            (userDoc.role === 'admin' ||
              userDoc.role === '管理者' ||
              String(userDoc.dept) === '3')
          "
          to="/production"
          @click="closeNav"
          >生產</RouterLink
        >
        <RouterLink
          class="nav-link"
          v-if="
            userDoc &&
            (userDoc.role === 'admin' ||
              userDoc.role === '管理者' ||
              String(userDoc.dept) === '1')
          "
          to="/customers"
          @click="closeNav"
          >客戶</RouterLink
        >
        <a
          class="nav-link"
          v-if="
            userDoc &&
            (userDoc.role === 'admin' ||
              userDoc.role === '管理者' ||
              String(userDoc.dept) === '1')
          "
          href="https://mystone.web.app/"
          target="_blank"
          rel="noopener noreferrer"
          @click="closeNav"
          >估價</a
        >
        <RouterLink
          class="nav-link"
          v-if="
            userDoc && (userDoc.role === 'admin' || userDoc.role === '管理者')
          "
          to="/settings"
          @click="closeNav"
          >系統設定</RouterLink
        >
        <RouterLink
          class="nav-link"
          v-if="
            userDoc &&
            (userDoc.role === '員工' ||
              userDoc.role === '行動' ||
              userDoc.role === 'admin' ||
              userDoc.role === '管理者')
          "
          to="/attendance"
          @click="closeNav"
          >{{ t("nav_attendance") }}</RouterLink
        >
        <RouterLink
          class="nav-link"
          v-if="
            userDoc &&
            (userDoc.role === '員工' ||
              userDoc.role === '行動' ||
              userDoc.role === 'admin' ||
              userDoc.role === '管理者')
          "
          to="/leave"
          @click="closeNav"
          >{{ t("nav_leave") }}</RouterLink
        >
        <RouterLink
          class="nav-link"
          v-if="
            userDoc && (userDoc.role === 'admin' || userDoc.role === '管理者')
          "
          to="/payroll"
          @click="closeNav"
          >{{ t("nav_payroll") }}</RouterLink
        >
        <RouterLink
          class="nav-link"
          v-if="
            userDoc && (userDoc.role === 'admin' || userDoc.role === '管理者')
          "
          to="/staff"
          @click="closeNav"
          >員工資料</RouterLink
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
          >{{ t("nav_employee") }}</RouterLink
        >
        <RouterLink
          class="nav-link"
          v-if="
            userDoc &&
            (userDoc.role === '員工' ||
              userDoc.role === 'admin' ||
              userDoc.role === '管理者')
          "
          to="/inventory"
          @click="closeNav"
          >{{ t("nav_inventory") }}</RouterLink
        >
        <RouterLink
          class="nav-link"
          v-if="
            userDoc &&
            (userDoc.role === '員工' ||
              userDoc.role === 'admin' ||
              userDoc.role === '管理者')
          "
          to="/drawing/straight"
          @click="closeNav"
          >{{ t("nav_drawing") }}</RouterLink
        >
        <a
          class="nav-link"
          v-if="
            userDoc &&
            (userDoc.role === '員工' ||
              userDoc.role === 'admin' ||
              userDoc.role === '管理者')
          "
          href="https://junchengstone.synology.me/draw/tools.php"
          target="_blank"
          rel="noopener noreferrer"
          @click="closeNav"
          >{{ t("nav_tools") }}</a
        >
      </div>
      <div v-if="user" class="top-nav-user">
        <span v-if="userDoc && userDoc.role" class="nav-user-role">{{
          userDoc.role
        }}</span>
        <img
          v-if="user.photoURL && !avatarFailed"
          :src="user.photoURL"
          alt="user avatar"
          class="user-avatar"
          @error="avatarFailed = true"
        />
        <div v-else class="user-avatar user-avatar-initial">
          {{
            (userDoc?.displayName || user.displayName)?.[0]?.toUpperCase() ||
            "?"
          }}
        </div>
        <span class="nav-user-name">{{
          userDoc?.displayName || user.displayName
        }}</span>

        <button class="btn-aux" @click="handleLogout">登出</button>
        <span class="nav-version">版本：{{ appVersion }}</span>
        <button
          class="btn-lang"
          @click="toggleLang"
          :title="
            lang === 'zh' ? 'Switch to Vietnamese' : 'Chuyển sang tiếng Trung'
          "
        >
          {{ lang === "zh" ? "🇻🇳 VI" : "🇹🇼 ZH" }}
        </button>
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
import { lang, setLang, t } from "./locale";
function toggleLang() {
  setLang(lang.value === "zh" ? "vi" : "zh");
}
const user = ref(null);
const userDoc = ref(null);
const navOpen = ref(false);
const navRef = ref(null);
const avatarFailed = ref(false);
const appVersion =
  typeof __APP_VERSION__ === "string" && __APP_VERSION__.trim()
    ? __APP_VERSION__
    : "-";

onMounted(() => {
  subscribeAuthState(async (currentUser) => {
    user.value = currentUser;
    avatarFailed.value = false;
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

<style scoped>
.nav-user-role {
  font-size: 0.72rem;
  font-weight: 600;
  color: #fff;
  background: #6b7280;
  border-radius: 4px;
  padding: 1px 6px;
  white-space: nowrap;
}

.nav-user-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 180px;
}

.nav-version {
  color: #6b7280;
  font-size: 0.82rem;
  white-space: nowrap;
  overflow: visible;
  text-overflow: clip;
  max-width: none;
}
.btn-lang {
  background: #e5e7eb;
  border: none;
  border-radius: 6px;
  padding: 3px 8px;
  font-size: 0.8rem;
  cursor: pointer;
  white-space: nowrap;
  font-weight: 600;
}
.btn-lang:hover {
  background: #d1d5db;
}
</style>
