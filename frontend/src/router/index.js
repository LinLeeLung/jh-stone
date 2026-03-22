import { createRouter, createWebHistory } from "vue-router";
import HomeView from "../views/HomeView.vue";
import AdminView from "../views/AdminView.vue";
import EmployeeView from "../views/EmployeeView.vue";
import InventoryView from "../views/InventoryView.vue";
import SettingsView from "../views/SettingsView.vue";
import StockView from "../views/StockView.vue";
import { auth } from "../firebase";
import { getUserByUid } from "../firebase";

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: "/", name: "home", component: HomeView },
    {
      path: "/about",
      name: "about",
      component: () => import("../views/AboutView.vue"),
    },
    {
      path: "/admin",
      name: "admin",
      component: AdminView,
      meta: { roles: ["admin", "管理者"] },
    },
    {
      path: "/employee",
      name: "employee",
      component: EmployeeView,
      meta: { roles: ["員工", "admin", "管理者"] },
    },
    {
      path: "/inventory",
      name: "inventory",
      component: InventoryView,
      meta: { roles: ["員工", "admin", "管理者"] },
    },
    {
      path: "/customer/orders",
      name: "customer",
      redirect: "/",
      alias: "/customer",
    },
    {
      path: "/settings",
      name: "settings",
      component: SettingsView,
      meta: { roles: ["admin", "管理者"] },
    },
    {
      path: "/stock",
      name: "stock",
      component: StockView,
      meta: { roles: ["admin"] },
    },
  ],
});

// 路由守衛：檢查 meta.roles（若設定）
router.beforeEach(async (to, from, next) => {
  const allowedRoles = to.meta && to.meta.roles;
  if (!allowedRoles) {
    next();
    return;
  }

  const user = auth.currentUser;
  if (!user) {
    next("/");
    return;
  }

  try {
    const doc = await getUserByUid(user.uid);
    if (doc && allowedRoles.includes(doc.role)) {
      next();
    } else {
      next("/");
    }
  } catch (error) {
    console.error("檢查使用者權限失敗:", error);
    next("/");
  }
});

export default router;
