<template>
  <div class="app-shell" :class="{ 'print-layout': isPrintLayout }">
    <nav v-if="!isPrintLayout" ref="navRef" class="top-nav">
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
        <RouterLink v-if="navAccess.admin" :class="['nav-link', { 'nav-link-group-active': isNavItemActive('/admin') }]" to="/admin" @click="closeNav"
          >管理介面</RouterLink
        >
        <RouterLink v-if="navAccess.orders" :class="['nav-link', { 'nav-link-group-active': isNavItemActive('/orders') }]" to="/orders" @click="closeNav"
          >訂單</RouterLink
        >
        <RouterLink
          v-if="navAccess.receivables"
          :class="['nav-link', { 'nav-link-group-active': isNavItemActive('/receivable-bills') }]"
          to="/receivable-bills"
          @click="closeNav"
          >應收帳</RouterLink
        >
        <RouterLink
          v-if="navAccess.production"
          :class="['nav-link', { 'nav-link-group-active': isNavItemActive('/production') }]"
          to="/production"
          @click="closeNav"
          >生產</RouterLink
        >
        <RouterLink
          v-if="navAccess.customers"
          :class="['nav-link', { 'nav-link-group-active': isNavItemActive('/customers') }]"
          to="/customers"
          @click="closeNav"
          >客戶</RouterLink
        >
        <a
          :class="['nav-link', { 'nav-link-group-active': isNavItemActive('/quote') }]"
          v-if="navAccess.quote"
          href="https://mystone.web.app/"
          target="_blank"
          rel="noopener noreferrer"
          @click="closeNav"
          >估價</a
        >
        <RouterLink v-if="navAccess.settings" :class="['nav-link', { 'nav-link-group-active': isNavItemActive('/settings') }]" to="/settings" @click="closeNav"
          >系統設定</RouterLink
        >
        <RouterLink
          v-if="navAccess.attendance"
          :class="['nav-link', { 'nav-link-group-active': isNavItemActive('/attendance') }]"
          to="/attendance"
          @click="closeNav"
          >{{ t("nav_attendance") }}</RouterLink
        >
        <RouterLink v-if="navAccess.leave" :class="['nav-link', { 'nav-link-group-active': isNavItemActive('/leave') }]" to="/leave" @click="closeNav"
          >{{ t("nav_leave") }}</RouterLink
        >
        <RouterLink v-if="navAccess.payroll" :class="['nav-link', { 'nav-link-group-active': isNavItemActive('/payroll') }]" to="/payroll" @click="closeNav"
          >{{ t("nav_payroll") }}</RouterLink
        >
        <RouterLink v-if="navAccess.staff" :class="['nav-link', { 'nav-link-group-active': isNavItemActive('/staff') }]" to="/staff" @click="closeNav"
          >員工資料</RouterLink
        >
        <RouterLink v-if="navAccess.employee" :class="['nav-link', { 'nav-link-group-active': isNavItemActive('/employee') }]" to="/employee" @click="closeNav"
          >{{ t("nav_employee") }}</RouterLink
        >
        <RouterLink
          v-if="navAccess.inventory"
          :class="['nav-link', { 'nav-link-group-active': isNavItemActive('/inventory') }]"
          to="/inventory"
          @click="closeNav"
          >{{ t("nav_inventory") }}</RouterLink
        >
        <RouterLink
          v-if="navAccess.drawing"
          :class="['nav-link', { 'nav-link-group-active': isNavItemActive('/drawing/straight') }]"
          to="/drawing/straight"
          @click="closeNav"
          >{{ t("nav_drawing") }}</RouterLink
        >
        <a
          class="nav-link"
          v-if="navAccess.tools"
          href="https://junchengstone.synology.me/draw/tools.php"
          target="_blank"
          rel="noopener noreferrer"
          @click="closeNav"
          >{{ t("nav_tools") }}</a
        >
      </div>
      <div v-if="user" class="top-nav-user">
        <span v-if="displayRoleLabel" class="nav-user-role">{{
          displayRoleLabel
        }}</span>
        <label v-if="hasMultipleRoles" class="nav-role-switcher">
          <span>視角</span>
          <select v-model="perspectiveRole">
            <option v-for="role in assignedRoles" :key="role" :value="role">
              {{ role }}
            </option>
          </select>
        </label>
        <label v-if="hasMultipleDepartments" class="nav-role-switcher">
          <span>部門</span>
          <select v-model="perspectiveDepartment">
            <option v-for="dept in assignedDepartments" :key="dept" :value="dept">
              {{ departmentLabel(dept) }}
            </option>
          </select>
        </label>
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

    <div v-if="!isPrintLayout && currentGroupLabel" class="section-bar">
      <span class="section-group-pill">{{ currentGroupLabel }}</span>
      <span class="section-page-title">{{ currentPageTitle }}</span>
    </div>

    <main class="app-main" :class="{ 'print-main': isPrintLayout }">
      <RouterView />
    </main>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed } from "vue";
import { useRoute } from "vue-router";
import {
  logout,
  subscribeAuthState,
  getUserByUid,
  getRoutePermissionsConfig,
  getCurrentPerspectiveRole,
  setStoredPerspectiveRole,
  getCurrentPerspectiveDepartment,
  setStoredPerspectiveDepartment,
  canAccessPermission,
} from "./firebase";
import {
  DEFAULT_ROUTE_PERMISSIONS,
  findPermission,
  mergeRoutePermissions,
} from "./config/routePermissions";
import { lang, setLang, t } from "./locale";
const route = useRoute();

function toggleLang() {
  setLang(lang.value === "zh" ? "vi" : "zh");
}
const user = ref(null);
const userDoc = ref(null);
const routePermissions = ref(DEFAULT_ROUTE_PERMISSIONS);
const navOpen = ref(false);
const navRef = ref(null);
const avatarFailed = ref(false);
const appVersion =
  typeof __APP_VERSION__ === "string" && __APP_VERSION__.trim()
    ? __APP_VERSION__
    : "-";

const assignedRoles = computed(() => userDoc.value?.roles || []);
const hasMultipleRoles = computed(() => assignedRoles.value.length > 1);
const assignedDepartments = computed(() => userDoc.value?.departments || []);
const hasMultipleDepartments = computed(() => assignedDepartments.value.length > 1);
const perspectiveRole = computed({
  get() {
    return userDoc.value ? getCurrentPerspectiveRole(userDoc.value) : "";
  },
  set(value) {
    if (!userDoc.value?.uid) {
      return;
    }
    setStoredPerspectiveRole(userDoc.value.uid, value);
    userDoc.value = { ...userDoc.value };
  },
});
const perspectiveDepartment = computed({
  get() {
    return userDoc.value ? getCurrentPerspectiveDepartment(userDoc.value) : "";
  },
  set(value) {
    if (!userDoc.value?.uid) {
      return;
    }
    setStoredPerspectiveDepartment(userDoc.value.uid, value);
    userDoc.value = { ...userDoc.value };
  },
});
const displayRoleLabel = computed(() =>
  perspectiveRole.value || userDoc.value?.activeRole || userDoc.value?.role || "",
);
const isPrintLayout = computed(() => route.meta?.printLayout === true);
const currentPermission = computed(() => findPermission(routePermissions.value, route.path));
const currentGroupLabel = computed(() => currentPermission.value?.group || "");
const currentPageTitle = computed(() => currentPermission.value?.title || String(route.meta?.title || ""));

function departmentLabel(value) {
  return {
    "1": "1 辦公室",
    "2": "2 裝安",
    "3": "3 廠內",
    "4": "4 外勞",
  }[String(value || "")] || String(value || "");
}

function hasPerspectiveAccess(path, fallbackPermission = {}) {
  if (!userDoc.value) {
    return false;
  }
  const permission = findPermission(routePermissions.value, path) || fallbackPermission;
  return canAccessPermission(userDoc.value, permission, {
    usePerspectiveRole: true,
    usePerspectiveDepartment: true,
  });
}

function isNavItemActive(basePath) {
  return route.path === basePath || route.path.startsWith(`${basePath}/`);
}

const navAccess = computed(() => ({
  admin: hasPerspectiveAccess("/admin"),
  orders: hasPerspectiveAccess("/orders"),
  receivables: hasPerspectiveAccess("/receivable-bills"),
  orderDispatch: hasPerspectiveAccess("/orders/dispatch"),
  production: hasPerspectiveAccess("/production"),
  customers: hasPerspectiveAccess("/customers"),
  quote: hasPerspectiveAccess("/quote"),
  settings: hasPerspectiveAccess("/settings"),
  attendance: hasPerspectiveAccess("/attendance"),
  leave: hasPerspectiveAccess("/leave"),
  payroll: hasPerspectiveAccess("/payroll"),
  staff: hasPerspectiveAccess("/staff"),
  employee: hasPerspectiveAccess("/employee"),
  inventory: hasPerspectiveAccess("/inventory"),
  drawing: hasPerspectiveAccess("/drawing/straight"),
  tools: hasPerspectiveAccess("/drawing/straight", {
    roles: ["員工", "admin", "管理者"],
  }),
}));

async function loadRoutePermissions() {
  try {
    const stored = await getRoutePermissionsConfig();
    routePermissions.value = mergeRoutePermissions(
      DEFAULT_ROUTE_PERMISSIONS,
      stored || [],
    );
  } catch {
    routePermissions.value = DEFAULT_ROUTE_PERMISSIONS;
  }
}

onMounted(() => {
  loadRoutePermissions();
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

function handlePermissionsUpdated() {
  loadRoutePermissions();
}

onMounted(() => {
  document.addEventListener("click", handleDocumentClick);
  window.addEventListener("route-permissions-updated", handlePermissionsUpdated);
});

onUnmounted(() => {
  document.removeEventListener("click", handleDocumentClick);
  window.removeEventListener("route-permissions-updated", handlePermissionsUpdated);
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

.nav-role-switcher {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.78rem;
  color: #4b5563;
  white-space: nowrap;
}

.nav-role-switcher select {
  border: 1px solid #d1d5db;
  border-radius: 6px;
  padding: 2px 6px;
  background: #fff;
  font-size: 0.78rem;
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

.nav-link-group-active {
  background: #fff7ed;
  color: #c2410c;
  box-shadow: inset 0 -2px 0 #ea580c;
}

.section-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 16px;
  background: linear-gradient(90deg, #fff7ed 0%, #fffbeb 100%);
  border-bottom: 1px solid #fed7aa;
}

.section-group-pill {
  display: inline-flex;
  align-items: center;
  height: 24px;
  padding: 0 10px;
  border-radius: 999px;
  background: #ea580c;
  color: #fff;
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.04em;
}

.section-page-title {
  color: #7c2d12;
  font-size: 0.92rem;
  font-weight: 600;
}

.print-layout {
  min-height: auto;
}

.print-main {
  max-width: none;
  padding: 0;
}
</style>
