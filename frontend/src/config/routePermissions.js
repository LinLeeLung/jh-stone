/**
 * 路由權限預設設定
 * 這裡定義各頁面對應的角色與部門存取規則。
 * AdminView 中的「權限管理」功能可將自訂覆寫儲存至 Firestore Config/routePermissions，
 * 路由守衛會優先使用 Firestore 設定，找不到時 fallback 至此預設值。
 */

export const ALL_ROLES = ['admin', '管理者', '員工', '行動', '客戶', '遊客'];

/**
 * @typedef {Object} RoutePermDef
 * @property {string} path         - 路由路徑（用於 match）
 * @property {string} title        - 頁面名稱（顯示用）
 * @property {string[]} roles      - 允許存取的角色列表
 * @property {string[]} [depts]    - 允許存取的部門列表（dept 欄位），OR 關係
 * @property {string} [group]      - 分組標籤（顯示用）
 */

/** @type {RoutePermDef[]} */
export const DEFAULT_ROUTE_PERMISSIONS = [
  // ── 管理 ──────────────────────────────────────────────────────────────
  { path: '/admin',             title: '管理介面',       group: '系統管理', roles: ['admin', '管理者'] },
  { path: '/settings',          title: '系統設定',       group: '系統管理', roles: ['admin', '管理者'] },
  { path: '/staff',             title: '員工基本資料',   group: '系統管理', roles: ['admin', '管理者'] },

  // ── 人事 ──────────────────────────────────────────────────────────────
  { path: '/employee',          title: '員工查詢',       group: '人事',     roles: ['員工', 'admin', '管理者'] },
  { path: '/attendance',        title: '打卡系統',       group: '人事',     roles: ['員工', '行動', 'admin', '管理者'] },
  { path: '/leave',             title: '請假/加班',      group: '人事',     roles: ['員工', '行動', 'admin', '管理者'] },
  { path: '/payroll',           title: '薪資單',         group: '人事',     roles: ['admin', '管理者'] },
  { path: '/payroll/help',      title: '薪資計算說明',   group: '人事',     roles: ['admin', '管理者'] },

  // ── 訂單 ──────────────────────────────────────────────────────────────
  { path: '/orders',            title: '訂單列表',       group: '訂單',     roles: ['admin', '管理者'], depts: ['1'] },
  { path: '/orders/new',        title: '新建訂單',       group: '訂單',     roles: ['admin', '管理者'], depts: ['1'] },
  { path: '/orders/:id/edit',   title: '編輯訂單',       group: '訂單',     roles: ['admin', '管理者'], depts: ['1'] },
  { path: '/orders/settings',   title: '訂單設定',       group: '訂單',     roles: ['admin', '管理者'] },
  { path: '/orders/dispatch',   title: '發單作業',       group: '訂單',     roles: ['admin', '管理者'], depts: ['1'] },
  { path: '/orders/import',     title: '匯入訂單',       group: '訂單',     roles: ['admin', '管理者'] },
  { path: '/orders/:id/drawing',      title: '訂單繪圖',   group: '訂單', roles: ['admin', '管理者'], depts: ['1'] },
  { path: '/orders/:id/confirmation', title: '生產確定單', group: '訂單', roles: ['admin', '管理者'], depts: ['1'] },

  // ── 客戶 ──────────────────────────────────────────────────────────────
  { path: '/customers',         title: '客戶管理',       group: '客戶',     roles: ['員工', 'admin', '管理者'], depts: ['1'] },
  { path: '/quote',             title: '估價單',         group: '客戶',     roles: ['員工', 'admin', '管理者'], depts: ['1'] },

  // ── 庫存 ──────────────────────────────────────────────────────────────
  { path: '/inventory',         title: '庫存查詢',       group: '庫存',     roles: ['員工', 'admin', '管理者'] },

  // ── 派車 ──────────────────────────────────────────────────────────────
  // 2 裝安部門:dept '2' 即可進(維修=安裝同一群);admin/管理者 全可進
  // 冷藏中:只 admin 可看見,未來邏輯完成再釋出給 管理者 + dept '2'
  { path: '/install-tasks',          title: '派車調度',     group: '派車', roles: ['admin'] },
  { path: '/install-tasks/my-today', title: '今日我的任務', group: '派車', roles: ['admin'] },
  { path: '/vehicles',               title: '車輛管理',     group: '派車', roles: ['admin', '管理者'] },
  // ── 繪圖 ──────────────────────────────────────────────────────────────
  { path: '/drawing/straight',  title: '一字型繪圖',     group: '繪圖',     roles: ['員工', 'admin', '管理者'] },
  { path: '/drawing/l-shape',   title: 'L 型繪圖',       group: '繪圖',     roles: ['員工', 'admin', '管理者'] },
  { path: '/drawing/m-shape',   title: 'M 型繪圖',       group: '繪圖',     roles: ['員工', 'admin', '管理者'] },
  { path: '/drawing/island',    title: '中島繪圖',       group: '繪圖',     roles: ['員工', 'admin', '管理者'] },
];

/**
 * 將 path 樣式（含 :param）轉換成可比對實際路徑的 regex
 * /orders/:id/edit → /^\/orders\/[^/]+\/edit$/
 */
export function pathToRegex(pattern) {
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const withParams = escaped.replace(/:[^/]+/g, '[^/]+');
  return new RegExp(`^${withParams}$`);
}

/**
 * 從 permissions 陣列中找到與 realPath 最符合的設定
 * @param {RoutePermDef[]} permissions
 * @param {string} realPath
 * @returns {RoutePermDef | undefined}
 */
export function findPermission(permissions, realPath) {
  // 先嘗試完全符合
  let match = permissions.find((p) => p.path === realPath);
  if (match) return match;
  // 再嘗試 :param 樣式
  return permissions.find((p) => p.path.includes(':') && pathToRegex(p.path).test(realPath));
}
