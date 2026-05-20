import { createRouter, createWebHistory } from "vue-router";
import HomeView from "../views/HomeView.vue";
import AdminView from "../views/AdminView.vue";
import EmployeeView from "../views/EmployeeView.vue";
import InventoryView from "../views/InventoryView.vue";
import SettingsView from "../views/SettingsView.vue";
import StaffView from "../views/StaffView.vue";
import AttendanceView from "../views/AttendanceView.vue";
import LeaveView from "../views/LeaveView.vue";
import PayrollView from "../views/PayrollView.vue";
import PayrollHelpView from "../views/PayrollHelpView.vue";
import DrawingLayout from "../views/drawing/DrawingLayout.vue";
import StraightDrawingView from "../views/drawing/StraightDrawingView.vue";
import LShapeDrawingView from "../views/drawing/LShapeDrawingView.vue";
import MShapeDrawingView from "../views/drawing/MShapeDrawingView.vue";
import IslandDrawingView from "../views/drawing/IslandDrawingView.vue";
import { auth } from "../firebase";
import { getUserByUid, authReadyPromise } from "../firebase";

const SITE_NAME = "峻晟安裝查詢";

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: "/", name: "home", component: HomeView, meta: { title: "首頁" } },
    {
      path: "/about",
      name: "about",
      component: () =>
        import("../views/AboutView.vue").catch(() => {
          window.location.reload();
        }),
      meta: { title: "說明" },
    },
    {
      path: "/admin",
      name: "admin",
      component: AdminView,
      meta: { roles: ["admin", "管理者"], title: "管理介面" },
    },
    {
      path: "/employee",
      name: "employee",
      component: EmployeeView,
      meta: { roles: ["員工", "admin", "管理者"], title: "員工查詢" },
    },
    {
      path: "/inventory",
      name: "inventory",
      component: InventoryView,
      meta: { roles: ["員工", "admin", "管理者"], title: "庫存查詢" },
    },
    {
      path: "/customer/orders",
      name: "customer",
      redirect: "/",
      alias: "/customer",
    },
    {
      path: "/drawing",
      component: DrawingLayout,
      meta: { roles: ["員工", "admin", "管理者"], title: "繪圖系統" },
      children: [
        { path: "", redirect: "/drawing/straight" },
        {
          path: "straight",
          name: "drawing-straight",
          component: StraightDrawingView,
          meta: { roles: ["員工", "admin", "管理者"], title: "一字型繪圖" },
        },
        {
          path: "l-shape",
          name: "drawing-l",
          component: LShapeDrawingView,
          meta: { roles: ["員工", "admin", "管理者"], title: "L 型繪圖" },
        },
        {
          path: "m-shape",
          name: "drawing-m",
          component: MShapeDrawingView,
          meta: { roles: ["員工", "admin", "管理者"], title: "M 型繪圖" },
        },
        {
          path: "island",
          name: "drawing-island",
          component: IslandDrawingView,
          meta: { roles: ["員工", "admin", "管理者"], title: "中島繪圖" },
        },
      ],
    },
    {
      path: "/settings",
      name: "settings",
      component: SettingsView,
      meta: { roles: ["admin", "管理者"], title: "系統設定" },
    },
    {
      path: "/staff",
      name: "staff",
      component: StaffView,
      meta: { roles: ["admin", "管理者"], title: "員工基本資料" },
    },
    {
      path: "/attendance",
      name: "attendance",
      component: AttendanceView,
      meta: { roles: ["員工", "admin", "管理者"], title: "打卡系統" },
    },
    {
      path: "/leave",
      name: "leave",
      component: LeaveView,
      meta: { roles: ["員工", "admin", "管理者"], title: "請假/加班" },
    },
    {
      path: "/payroll",
      name: "payroll",
      component: PayrollView,
      meta: { roles: ["admin", "管理者"], title: "薪資單" },
    },
    {
      path: "/payroll/help",
      name: "payroll-help",
      component: PayrollHelpView,
      meta: { roles: ["admin", "管理者"], title: "薪資計算說明" },
    },
  ],
});

// 依路由設定瀏覽器分頁標題（與導覽列文字一致）
router.afterEach((to) => {
  const title = to.meta && to.meta.title;
  document.title = title ? `${title} — ${SITE_NAME}` : SITE_NAME;
});

// 路由守衛：檢查 meta.roles（若設定）
router.beforeEach(async (to, from, next) => {
  const allowedRoles = to.meta && to.meta.roles;
  if (!allowedRoles) {
    next();
    return;
  }

  // 等待 Firebase Auth 還原本地 session（從外部連結直接進入時 currentUser 還沒就緒）
  await authReadyPromise;

  const user = auth.currentUser;
  if (!user) {
    console.warn("[router] no auth user, redirect to /", { path: to.fullPath });
    // 將原本想去的網址記下來，登入後可自動帶回
    try {
      sessionStorage.setItem("postLoginRedirect", to.fullPath);
    } catch (_e) {
      // ignore storage errors (e.g. private mode)
    }
    next("/");
    return;
  }

  try {
    const doc = await getUserByUid(user.uid);
    if (doc && allowedRoles.includes(doc.role)) {
      next();
    } else {
      console.warn("[router] role not allowed", {
        path: to.fullPath,
        role: doc?.role,
        allowedRoles,
      });
      next("/");
    }
  } catch (error) {
    console.error("[router] 檢查使用者權限失敗:", error);
    next("/");
  }
});

export default router;
