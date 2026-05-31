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
import ReceivableHelpView from "../views/ReceivableHelpView.vue";
import DrawingLayout from "../views/drawing/DrawingLayout.vue";
import StraightDrawingView from "../views/drawing/StraightDrawingView.vue";
import LShapeDrawingView from "../views/drawing/LShapeDrawingView.vue";
import MShapeDrawingView from "../views/drawing/MShapeDrawingView.vue";
import IslandDrawingView from "../views/drawing/IslandDrawingView.vue";
import OrderEditView from "../views/OrderEditView.vue";
import OrderSettingsView from "../views/OrderSettingsView.vue";
import OrdersView from "../views/OrdersView.vue";
import OrderImportView from "../views/OrderImportView.vue";
import RepairTicketView from "../views/RepairTicketView.vue";
import RepairListView from "../views/RepairListView.vue";
import RepairPrintView from "../views/RepairPrintView.vue";
import DispatchView from "../views/DispatchView.vue";
import ProductionView from "../views/ProductionView.vue";
import ReceivableItemsView from "../views/ReceivableItemsView.vue";
import ReceivableBillsView from "../views/ReceivableBillsView.vue";
import ReceivableBillDetailView from "../views/ReceivableBillDetailView.vue";
import ReceivableBillPrintView from "../views/ReceivableBillPrintView.vue";
import ReceivableBillSignedPrintView from "../views/ReceivableBillSignedPrintView.vue";
import OrderDrawingWrapper from "../views/drawing/OrderDrawingWrapper.vue";
import OrderConfirmationView from "../views/drawing/OrderConfirmationView.vue";
import CustomerMgmtView from "../views/CustomerMgmtView.vue";
import QuotePageView from "../views/QuotePageView.vue";
import InstallTasksView from "../views/InstallTasksView.vue";
import DispatchSheetView from "../views/DispatchSheetView.vue";
import MyTodayTasksView from "../views/MyTodayTasksView.vue";
import VehiclesView from "../views/VehiclesView.vue";
import { auth } from "../firebase";
import {
  getUserByUid,
  authReadyPromise,
  getRoutePermissionsConfig,
  canAccessPermission,
} from "../firebase";
import {
  DEFAULT_ROUTE_PERMISSIONS,
  findPermission,
  mergeRoutePermissions,
} from "../config/routePermissions";

// 記憶體快取：Firestore 設定讀取一次後存在此，null 表示「尚未載入」
let _permCache = null;  // false = 已確認 Firestore 無資料；陣列 = 已取得設定
async function getEffectivePermissions() {
  if (_permCache !== null) return _permCache;
  try {
    const firestoreRoutes = await getRoutePermissionsConfig();
    _permCache = mergeRoutePermissions(
      DEFAULT_ROUTE_PERMISSIONS,
      firestoreRoutes || [],
    );
  } catch {
    _permCache = DEFAULT_ROUTE_PERMISSIONS;
  }
  return _permCache;
}
/** 外部（AdminView）儲存後需呼叫此函式讓快取失效 */
export function invalidatePermissionsCache() {
  _permCache = null;
}

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
      meta: { roles: ["員工", "admin", "管理者"], title: "安裝查詢" },
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
    {
      path: "/receivable/help",
      name: "receivable-help",
      component: ReceivableHelpView,
      meta: { roles: ["admin", "管理者", "會計"], title: "應收帳說明" },
    },
    {
      path: "/orders",
      name: "orders",
      component: OrdersView,
      meta: { roles: ["admin", "管理者"], depts: ["1"], title: "訂單列表" },
    },
    {
      path: "/orders/new",
      name: "order-new",
      component: OrderEditView,
      meta: { roles: ["admin", "管理者"], depts: ["1"], title: "新建訂單" },
    },
    {
      path: "/orders/:id/edit",
      name: "order-edit",
      component: OrderEditView,
      meta: { roles: ["admin", "管理者"], depts: ["1"], title: "編輯訂單" },
    },
    {
      path: "/orders/settings",
      name: "order-settings",
      component: OrderSettingsView,
      meta: { roles: ["admin", "管理者"], title: "訂單設定" },
    },
    {
      path: "/orders/dispatch",
      name: "order-dispatch",
      component: DispatchView,
      meta: { roles: ["admin", "管理者"], depts: ["1"], title: "發單作業" },
    },
    {
      path: "/orders/import",
      name: "order-import",
      component: OrderImportView,
      meta: { roles: ["admin", "管理者"], title: "匯入訂單" },
    },
    {
      path: "/receivable-items",
      name: "receivable-items",
      component: ReceivableItemsView,
      meta: { roles: ["admin", "管理者", "會計"], title: "應收明細" },
    },
    {
      path: "/receivable-bills",
      name: "receivable-bills",
      component: ReceivableBillsView,
      meta: { roles: ["admin", "管理者", "會計"], title: "應收帳單" },
    },
    {
      path: "/receivable-bills/:id",
      name: "receivable-bill-detail",
      component: ReceivableBillDetailView,
      meta: { roles: ["admin", "管理者", "會計"], title: "帳單詳情" },
    },
    {
      path: "/receivable-bills/:id/print",
      name: "receivable-bill-print",
      component: ReceivableBillPrintView,
      meta: { roles: ["admin", "管理者", "會計"], title: "應收總表", printLayout: true },
    },
    {
      path: "/receivable-bills/:id/sign-print",
      name: "receivable-bill-sign-print",
      component: ReceivableBillSignedPrintView,
      meta: { roles: ["admin", "管理者", "會計"], title: "回簽列印", printLayout: true },
    },
    {
      path: "/orders/repair",
      name: "order-repair",
      component: RepairListView,
      meta: { roles: ["admin", "管理者"], depts: ["1"], title: "維修單列表" },
    },
    {
      path: "/orders/repair/new",
      name: "order-repair-new",
      component: RepairTicketView,
      meta: { roles: ["admin", "管理者"], depts: ["1"], title: "新建維修單" },
    },
    {
      path: "/orders/repair/:id",
      name: "order-repair-edit",
      component: RepairTicketView,
      meta: { roles: ["admin", "管理者"], depts: ["1"], title: "編輯維修單" },
    },
    {
      path: "/orders/repair/:id/print",
      name: "order-repair-print",
      component: RepairPrintView,
      meta: { roles: ["admin", "管理者"], depts: ["1"], title: "列印維修單", printLayout: true },
    },
    {
      path: "/production",
      name: "production",
      component: ProductionView,
      meta: { roles: ["員工", "admin", "管理者"], depts: ["3"], title: "生產流程" },
    },
    {
      path: "/customers",
      name: "customers",
      component: CustomerMgmtView,
      meta: { roles: ["員工", "admin", "管理者"], depts: ["1"], title: "客戶管理" },
    },
    {
      path: "/quote",
      name: "quote",
      component: QuotePageView,
      meta: { roles: ["員工", "admin", "管理者"], depts: ["1"], title: "估價單" },
    },
    {
      path: "/orders/:id/drawing",
      name: "order-drawing",
      component: OrderDrawingWrapper,
      meta: { roles: ["admin", "管理者"], depts: ["1"], title: "訂單繪圖" },
    },
    {
      path: "/orders/:id/confirmation",
      name: "order-confirmation",
      component: OrderConfirmationView,
      meta: { roles: ["admin", "管理者"], depts: ["1"], title: "生產確定單" },
    },
    {
      path: "/install-tasks",
      name: "install-tasks",
      component: InstallTasksView,
      meta: { roles: ["admin"], title: "派車調度" },
    },
    {
      path: "/dispatch-sheet",
      name: "dispatch-sheet",
      component: DispatchSheetView,
      meta: { roles: ["admin", "管理者"], depts: ["1"], title: "派車表單" },
    },
    {
      path: "/install-tasks/my-today",
      name: "install-tasks-my-today",
      component: MyTodayTasksView,
      meta: { roles: ["admin"], title: "今日我的任務" },
    },
    {
      path: "/vehicles",
      name: "vehicles",
      component: VehiclesView,
      meta: { roles: ["admin", "管理者"], title: "車輛管理" },
    },
  ],
});

// 依路由設定瀏覽器分頁標題（與導覽列文字一致）
router.afterEach((to) => {
  const title = to.meta && to.meta.title;
  document.title = title ? `${title} — ${SITE_NAME}` : SITE_NAME;
});

// 路由守衛：優先使用 Firestore 設定，fallback 至 meta.roles
router.beforeEach(async (to, from, next) => {
  // 若路由本身未設定 meta.roles，且在 DEFAULT_ROUTE_PERMISSIONS 中也找不到，則放行
  const permissions = await getEffectivePermissions();
  const permDef = findPermission(permissions, to.path);
  const allowedRoles = permDef ? permDef.roles : (to.meta?.roles ?? null);
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
    const userDoc = await getUserByUid(user.uid);
    const allowedDepts = permDef?.depts ?? to.meta?.depts ?? null;
    const accessOk = canAccessPermission(userDoc, {
      roles: allowedRoles,
      depts: allowedDepts,
    });
    if (accessOk) {
      next();
    } else {
      console.warn("[router] role/dept not allowed", {
        path: to.fullPath,
        roles: userDoc?.roles,
        activeRole: userDoc?.activeRole,
        dept: userDoc?.dept,
        allowedRoles,
        allowedDepts,
      });
      next("/");
    }
  } catch (error) {
    console.error("[router] 檢查使用者權限失敗:", error);
    next("/");
  }
});

export default router;
