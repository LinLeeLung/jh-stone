import { initializeApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
} from "firebase/auth";

// Use environment variables (VITE_ prefix) for your Firebase config.
// Create a .env.local file at the project root with the following keys:
// VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, VITE_FIREBASE_PROJECT_ID,
// VITE_FIREBASE_STORAGE_BUCKET, VITE_FIREBASE_MESSAGING_SENDER_ID,
// VITE_FIREBASE_APP_ID
// import { initializeApp } from "firebase/app";

import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  collection,
  getDocs,
  query,
  where,
  updateDoc,
  deleteDoc,
  orderBy,
  limit,
  addDoc,
  serverTimestamp,
  writeBatch,
  runTransaction,
} from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import {
  getStorage,
  ref as storageRef,
  uploadBytes,
  uploadBytesResumable,
  getDownloadURL,
  getBytes,
  deleteObject,
} from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyBbG5oJ40Wz7awOCVgb-QiX6_IjDbmFFnk",
  authDomain: "jh-stone.firebaseapp.com",
  projectId: "jh-stone",
  storageBucket: "jh-stone.firebasestorage.app",
  messagingSenderId: "32269929508",
  appId: "1:32269929508:web:208a7b5290475c0c501cb1",
  measurementId: "G-4N2HE3LJ5Z",
};

const app = initializeApp(firebaseConfig);
export { app };
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const db = getFirestore(app);
export const storage = getStorage(app);
// NAS 在台灣，部署到 asia-east1 可大幅降低延遲
export const functionsInstance = getFunctions(app, "asia-east1");

const DEFAULT_PRICE_REDACT_BOX = {
  xPct: 0,
  yPct: 0,
  wPct: 1,
  hPct: 0.17,
};

const MULTIPART_UPLOAD_TIMEOUT_MS = 10 * 60 * 1000;

const authReadyPromise = new Promise((resolve) => {
  const unsubscribe = onAuthStateChanged(auth, () => {
    unsubscribe();
    resolve();
  });
});

export { authReadyPromise };

async function getSignedInUser() {
  await authReadyPromise;
  const user = auth.currentUser;
  if (!user) {
    throw new Error("尚未登入，請重新登入後再試");
  }
  return user;
}

function isAuthRelatedError(error) {
  const code = String(error?.code || "").toLowerCase();
  return code === "functions/unauthenticated" || code === "unauthenticated";
}

function isPermissionDeniedError(error) {
  const code = String(error?.code || "").toLowerCase();
  const message = String(error?.message || "").toLowerCase();
  return (
    code.includes("permission-denied") || message.includes("permission denied")
  );
}

// Designated admin email (as requested)
const ADMIN_EMAIL = "linlilung@gmail.com";
const PERSPECTIVE_STORAGE_PREFIX = "jh-stone:perspective-role:";
const DEPARTMENT_PERSPECTIVE_STORAGE_PREFIX =
  "jh-stone:perspective-department:";

// allowed roles in the system
export const ROLES = [
  "admin",
  "管理者",
  "會計",
  "價格",
  "員工",
  "行動",
  "客戶",
  "遊客",
];
export const DEPARTMENTS = ["1", "2", "3", "4"];

export const RECEIVABLE_BILLING_CYCLE_OPTIONS = [
  { value: "cutoff25", label: "26-25 區間，次月請款" },
  { value: "monthEnd", label: "月底結算，次月請款" },
  { value: "installCompleted", label: "安裝完收款（完工即請款）" },
];

export const RECEIVABLE_INVOICE_PREFERENCE_OPTIONS = [
  { value: "required", label: "固定開發票" },
  { value: "optional", label: "依客戶需求" },
  { value: "none", label: "不開發票" },
];

export const RECEIVABLE_PAYMENT_METHOD_OPTIONS = [
  { value: "transfer", label: "匯款" },
  { value: "check", label: "支票" },
  { value: "cutTicketDeduction", label: "切口票扣款" },
];

function uniqueRoles(list = []) {
  return Array.from(new Set(list.filter((role) => ROLES.includes(role))));
}

function uniqueDepartments(list = []) {
  return Array.from(
    new Set(
      list.filter((dept) => DEPARTMENTS.includes(String(dept || "").trim())),
    ),
  );
}

export function getUserAssignedRoles(userDoc = {}, fallbackRole = "遊客") {
  const roles = [];

  if (Array.isArray(userDoc?.roles)) {
    roles.push(
      ...userDoc.roles.map((role) => String(role || "").trim()).filter(Boolean),
    );
  }

  const legacyRole = String(userDoc?.role || "").trim();
  if (legacyRole) {
    roles.push(legacyRole);
  }

  if (
    String(userDoc?.email || "")
      .trim()
      .toLowerCase() === ADMIN_EMAIL
  ) {
    roles.push("admin");
  }

  const normalized = uniqueRoles(roles);
  if (normalized.length > 0) {
    return normalized;
  }

  return ROLES.includes(fallbackRole) ? [fallbackRole] : ["遊客"];
}

export function getUserActiveRole(userDoc = {}, fallbackRole = "遊客") {
  const assignedRoles = getUserAssignedRoles(userDoc, fallbackRole);
  const candidate = String(userDoc?.activeRole || userDoc?.role || "").trim();
  return assignedRoles.includes(candidate) ? candidate : assignedRoles[0];
}

export function getUserAssignedDepartments(userDoc = {}, fallbackDept = "") {
  const departments = [];

  if (Array.isArray(userDoc?.departments)) {
    departments.push(
      ...userDoc.departments
        .map((dept) => String(dept || "").trim())
        .filter(Boolean),
    );
  }

  const legacyDept = String(userDoc?.dept || "").trim();
  if (legacyDept) {
    departments.push(legacyDept);
  }

  const normalized = uniqueDepartments(departments);
  if (normalized.length > 0) {
    return normalized;
  }

  const safeFallback = String(fallbackDept || "").trim();
  return DEPARTMENTS.includes(safeFallback) ? [safeFallback] : [];
}

export function getUserActiveDepartment(userDoc = {}, fallbackDept = "") {
  const assignedDepartments = getUserAssignedDepartments(userDoc, fallbackDept);
  const candidate = String(
    userDoc?.activeDepartment || userDoc?.dept || "",
  ).trim();
  if (assignedDepartments.includes(candidate)) {
    return candidate;
  }
  return assignedDepartments[0] || "";
}

export function normalizeUserAccessDoc(userDoc = {}, fallbackRole = "遊客") {
  const roles = getUserAssignedRoles(userDoc, fallbackRole);
  const activeRole = getUserActiveRole({ ...userDoc, roles }, fallbackRole);
  const departments = getUserAssignedDepartments(userDoc, userDoc?.dept || "");
  const activeDepartment = getUserActiveDepartment(
    { ...userDoc, departments },
    userDoc?.dept || "",
  );
  return {
    ...userDoc,
    roles,
    activeRole,
    departments,
    activeDepartment,
    dept:
      String(userDoc?.dept || activeDepartment || "").trim() ||
      activeDepartment,
    role: String(userDoc?.role || activeRole || "").trim() || activeRole,
  };
}

function getPerspectiveStorageKey(uid) {
  return `${PERSPECTIVE_STORAGE_PREFIX}${uid}`;
}

function getDepartmentPerspectiveStorageKey(uid) {
  return `${DEPARTMENT_PERSPECTIVE_STORAGE_PREFIX}${uid}`;
}

export function getStoredPerspectiveRole(uid) {
  if (typeof window === "undefined" || !uid) {
    return "";
  }
  try {
    return String(
      localStorage.getItem(getPerspectiveStorageKey(uid)) || "",
    ).trim();
  } catch {
    return "";
  }
}

export function setStoredPerspectiveRole(uid, role) {
  if (typeof window === "undefined" || !uid) {
    return;
  }
  try {
    if (!role) {
      localStorage.removeItem(getPerspectiveStorageKey(uid));
      return;
    }
    localStorage.setItem(getPerspectiveStorageKey(uid), role);
  } catch {
    // ignore storage failures
  }
}

export function getStoredPerspectiveDepartment(uid) {
  if (typeof window === "undefined" || !uid) {
    return "";
  }
  try {
    return String(
      localStorage.getItem(getDepartmentPerspectiveStorageKey(uid)) || "",
    ).trim();
  } catch {
    return "";
  }
}

export function setStoredPerspectiveDepartment(uid, dept) {
  if (typeof window === "undefined" || !uid) {
    return;
  }
  try {
    if (!dept) {
      localStorage.removeItem(getDepartmentPerspectiveStorageKey(uid));
      return;
    }
    localStorage.setItem(getDepartmentPerspectiveStorageKey(uid), dept);
  } catch {
    // ignore storage failures
  }
}

export function getCurrentPerspectiveRole(userDoc = {}, fallbackRole = "遊客") {
  const normalizedUser = normalizeUserAccessDoc(userDoc, fallbackRole);
  const uid = normalizedUser?.uid || normalizedUser?.id;
  const storedRole = getStoredPerspectiveRole(uid);
  return normalizedUser.roles.includes(storedRole)
    ? storedRole
    : normalizedUser.activeRole;
}

export function getCurrentPerspectiveDepartment(
  userDoc = {},
  fallbackDept = "",
) {
  const normalizedUser = normalizeUserAccessDoc(userDoc);
  const uid = normalizedUser?.uid || normalizedUser?.id;
  const storedDept = getStoredPerspectiveDepartment(uid);
  return normalizedUser.departments.includes(storedDept)
    ? storedDept
    : getUserActiveDepartment(normalizedUser, fallbackDept);
}

export function userHasAnyRole(userDoc, allowedRoles = [], options = {}) {
  if (!Array.isArray(allowedRoles) || allowedRoles.length === 0) {
    return false;
  }
  const normalizedUser = normalizeUserAccessDoc(userDoc);
  const effectiveRoles = options.usePerspectiveRole
    ? [getCurrentPerspectiveRole(normalizedUser)]
    : normalizedUser.roles;
  return effectiveRoles.some((role) => allowedRoles.includes(role));
}

export function userHasAnyDept(userDoc, allowedDepts = [], options = {}) {
  if (!Array.isArray(allowedDepts) || allowedDepts.length === 0) {
    return false;
  }
  const normalizedUser = normalizeUserAccessDoc(userDoc);
  const effectiveDepartments = options.usePerspectiveDepartment
    ? [getCurrentPerspectiveDepartment(normalizedUser)]
    : normalizedUser.departments;
  return effectiveDepartments.some((dept) =>
    allowedDepts.includes(String(dept || "")),
  );
}

export function canAccessPermission(userDoc, permission = {}, options = {}) {
  const allowedRoles = Array.isArray(permission?.roles) ? permission.roles : [];
  const allowedDepts = Array.isArray(permission?.depts) ? permission.depts : [];
  const roleOk = allowedRoles.length
    ? userHasAnyRole(userDoc, allowedRoles, options)
    : false;
  const deptOk = allowedDepts.length
    ? userHasAnyDept(userDoc, allowedDepts, options)
    : false;
  return roleOk || deptOk;
}

export function signInWithGoogle() {
  return signInWithPopup(auth, googleProvider);
}

export function logout() {
  return signOut(auth);
}

// helper to subscribe to auth state changes
export function subscribeAuthState(callback) {
  return onAuthStateChanged(auth, async (user) => {
    // when user signs in, ensure we have a Users doc for them
    if (user) {
      try {
        const userRef = doc(db, "Users", user.uid);
        const snap = await getDoc(userRef);
        const existingData = snap.exists() ? snap.data() : {};
        const roles = getUserAssignedRoles(
          { ...existingData, email: user.email || existingData?.email || "" },
          user.email === ADMIN_EMAIL ? "admin" : "遊客",
        );
        const activeRole = getUserActiveRole(
          {
            ...existingData,
            email: user.email || existingData?.email || "",
            roles,
          },
          roles[0],
        );
        const departments = getUserAssignedDepartments(
          existingData,
          existingData?.dept || "",
        );
        const activeDepartment = getUserActiveDepartment(
          { ...existingData, departments },
          existingData?.dept || "",
        );
        const existingName = snap.exists() ? snap.data().displayName : null;
        await setDoc(
          userRef,
          {
            uid: user.uid,
            displayName: existingName || user.displayName || null,
            email: user.email || null,
            photoURL: user.photoURL || null,
            roles,
            activeRole,
            departments,
            activeDepartment,
            dept: activeDepartment || null,
            role: activeRole,
            lastSeen: serverTimestamp(),
          },
          { merge: true },
        );
      } catch (e) {
        console.error("Failed to sync user to Firestore:", e);
      }
    }
    callback(user);
  });
}

// Admin helper: fetch all users
export async function fetchAllUsers() {
  const col = collection(db, "Users");
  const snaps = await getDocs(col);
  return snaps.docs.map((d) =>
    normalizeUserAccessDoc({ id: d.id, ...d.data() }),
  );
}

// Query users with where-clauses. conditions is array of { field, op, value }
export async function queryUsers(conditions = []) {
  const col = collection(db, "Users");
  let q = col;
  if (Array.isArray(conditions) && conditions.length) {
    const clauses = conditions.map((c) => where(c.field, c.op, c.value));
    q = query(col, ...clauses);
  }
  const snaps = await getDocs(q);
  return snaps.docs.map((d) =>
    normalizeUserAccessDoc({ id: d.id, ...d.data() }),
  );
}

// Query any collection by a date range on a specific field.
// start and end are JS Date objects (inclusive start, exclusive end).
export async function queryCollectionByDateRange(
  collectionName,
  field,
  start,
  end,
) {
  if (!collectionName || !field)
    throw new Error("collectionName and field required");
  const col = collection(db, collectionName);
  const q = query(col, where(field, ">=", start), where(field, "<", end));
  const snaps = await getDocs(q);
  return snaps.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// Generic collection query helper using where conditions array
// conditions: [{ field, op, value }, ...]
export async function queryCollection(collectionName, conditions = []) {
  if (!collectionName) throw new Error("collectionName required");
  const col = collection(db, collectionName);
  let q = col;
  if (Array.isArray(conditions) && conditions.length) {
    const clauses = conditions.map((c) => where(c.field, c.op, c.value));
    q = query(col, ...clauses);
  }
  const snaps = await getDocs(q);
  return snaps.docs.map((d) => ({ id: d.id, ...d.data() }));
}

function buildInventoryColorDocId(sheetId = "", gid = "") {
  const sid = String(sheetId || "")
    .trim()
    .replace(/\s+/g, "");
  const gidText = String(gid || "")
    .trim()
    .replace(/\s+/g, "");
  if (!sid || !gidText) {
    throw new Error("sheetId 與 gid 為必填");
  }
  return `${sid}_${gidText}`;
}

export async function listInventoryColors() {
  const col = collection(db, "InventoryColors");
  const snaps = await getDocs(col);
  return snaps.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((left, right) => {
      const a = `${String(left.brand || "")}|${String(left.color || "")}`;
      const b = `${String(right.brand || "")}|${String(right.color || "")}`;
      return a.localeCompare(b, "zh-Hant");
    });
}

export async function upsertInventoryColor(payload = {}) {
  const brand = String(payload.brand || "").trim();
  const color = String(payload.color || "").trim();
  const sheetId = String(payload.sheetId || "").trim();
  const gid = String(payload.gid || "").trim();
  const imageUrl = String(payload.imageUrl || "").trim();
  const status = String(payload.status || "").trim();

  if (!brand || !color || !sheetId || !gid) {
    throw new Error("品牌、顏色、ID、gid 為必填");
  }

  const docId = buildInventoryColorDocId(sheetId, gid);
  const ref = doc(db, "InventoryColors", docId);
  const snap = await getDoc(ref);

  await setDoc(
    ref,
    {
      brand,
      color,
      sheetId,
      gid,
      imageUrl,
      status,
      updatedAt: serverTimestamp(),
      createdAt: snap.exists()
        ? snap.data().createdAt || serverTimestamp()
        : serverTimestamp(),
    },
    { merge: true },
  );

  return docId;
}

export async function bulkUpsertInventoryColors(items = []) {
  const rows = (items || [])
    .map((item) => ({
      brand: String(item.brand || "").trim(),
      color: String(item.color || "").trim(),
      sheetId: String(item.sheetId || "").trim(),
      gid: String(item.gid || "").trim(),
      imageUrl: String(item.imageUrl || "").trim(),
      status: String(item.status || "").trim(),
    }))
    .filter((item) => item.brand && item.color && item.sheetId && item.gid);

  if (!rows.length) return { written: 0 };

  let written = 0;
  for (let index = 0; index < rows.length; index += 400) {
    const chunk = rows.slice(index, index + 400);
    const batch = writeBatch(db);
    chunk.forEach((item) => {
      const docId = buildInventoryColorDocId(item.sheetId, item.gid);
      const ref = doc(db, "InventoryColors", docId);

      const payload = {
        brand: item.brand,
        color: item.color,
        sheetId: item.sheetId,
        gid: item.gid,
        status: item.status,
        updatedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
      };

      if (item.imageUrl) {
        payload.imageUrl = item.imageUrl;
      }

      batch.set(ref, payload, { merge: true });
    });
    await batch.commit();
    written += chunk.length;
  }

  return { written };
}

export async function uploadInventoryColorPhoto(
  payload = {},
  file,
  onProgress,
) {
  const sheetId = String(payload.sheetId || "").trim();
  const gid = String(payload.gid || "").trim();
  const brand = String(payload.brand || "").trim();
  const color = String(payload.color || "").trim();
  const status = String(payload.status || "").trim();

  if (!sheetId || !gid) {
    throw new Error("sheetId 與 gid 為必填");
  }
  if (!file) {
    throw new Error("請先選擇照片檔案");
  }

  const docId = buildInventoryColorDocId(sheetId, gid);
  const safeFileName = sanitizeFilename(file.name || "stone-photo");
  const objectPath = `inventoryColors/${docId}/${Date.now()}_${safeFileName}`;
  const fileRef = storageRef(storage, objectPath);

  const downloadURL = await uploadFileWithRetry(
    fileRef,
    file,
    (bytesTransferred, totalBytes) => {
      if (typeof onProgress !== "function") return;
      const progress =
        totalBytes > 0 ? Math.min(1, bytesTransferred / totalBytes) : 0;
      onProgress(progress);
    },
  );

  const ref = doc(db, "InventoryColors", docId);
  await setDoc(
    ref,
    compactObject({
      brand: brand || undefined,
      color: color || undefined,
      sheetId,
      gid,
      status: status || undefined,
      imageUrl: downloadURL,
      updatedAt: serverTimestamp(),
    }),
    { merge: true },
  );

  return {
    docId,
    imageUrl: downloadURL,
    storagePath: objectPath,
  };
}

export async function listMyCompanyOrders(maxRows = 100) {
  await authReadyPromise;
  const user = await getSignedInUser();
  const userDoc = await getUserByUid(user.uid);

  const isApproved = userDoc?.customerApproved === true;
  const companyId = String(userDoc?.companyId || "").trim();

  if (!userHasAnyRole(userDoc, ["客戶"])) {
    throw new Error("僅客戶帳號可使用此功能");
  }
  if (!isApproved) {
    throw new Error("客戶帳號尚未完成審核");
  }
  if (!companyId) {
    throw new Error("客戶帳號尚未綁定公司識別碼");
  }

  const safeLimit = Math.max(1, Math.min(200, Number(maxRows || 100)));
  const functions = functionsInstance;
  const callable = httpsCallable(functions, "listMyCompanyOrders");
  const resp = await callable({ maxRows: safeLimit });
  return Array.isArray(resp?.data) ? resp.data : [];
}

// Admin helper: update user roles
export async function updateUserRoles(uid, roles = [], activeRole = "") {
  const normalizedRoles = uniqueRoles(
    Array.isArray(roles)
      ? roles.map((role) => String(role || "").trim())
      : [String(roles || "").trim()],
  );
  const nextRoles = normalizedRoles.length ? normalizedRoles : ["遊客"];
  const nextActiveRole = nextRoles.includes(activeRole)
    ? activeRole
    : nextRoles[0];
  const userRef = doc(db, "Users", uid);
  await updateDoc(userRef, {
    roles: nextRoles,
    activeRole: nextActiveRole,
    role: nextActiveRole,
  });
}

export async function updateUserRole(uid, role) {
  const nextRole = String(role || "").trim();
  if (!ROLES.includes(nextRole)) {
    throw new Error(`invalid role "${role}"`);
  }
  await updateUserRoles(uid, [nextRole], nextRole);
}

export async function updateUserDisplayName(uid, displayName) {
  const name = displayName.trim();
  if (!name) throw new Error("姓名不可為空");
  const userRef = doc(db, "Users", uid);
  await updateDoc(userRef, { displayName: name });
}

export async function updateUserDepartments(
  uid,
  departments = [],
  activeDepartment = "",
) {
  const normalizedDepartments = uniqueDepartments(
    Array.isArray(departments)
      ? departments.map((dept) => String(dept || "").trim())
      : [String(departments || "").trim()],
  );
  const nextActiveDepartment = normalizedDepartments.includes(activeDepartment)
    ? activeDepartment
    : normalizedDepartments[0] || "";
  const userRef = doc(db, "Users", uid);
  await updateDoc(userRef, {
    departments: normalizedDepartments,
    activeDepartment: nextActiveDepartment || null,
    dept: nextActiveDepartment || null,
  });
}

export async function updateUserDept(uid, dept) {
  const value = String(dept || "").trim();
  await updateUserDepartments(uid, value ? [value] : [], value);
}

/**
 * 更新使用者細粒度權限旗標(派車模組用)
 * @param {string} uid
 * @param {{ service?: boolean, installer?: boolean, office?: boolean }} flags
 */
export async function updateUserPermissions(uid, flags = {}) {
  const userRef = doc(db, "Users", uid);
  const patch = {};
  if (typeof flags.service === "boolean")
    patch["permissions.service"] = flags.service;
  if (typeof flags.installer === "boolean")
    patch["permissions.installer"] = flags.installer;
  if (typeof flags.office === "boolean")
    patch["permissions.office"] = flags.office;
  if (Object.keys(patch).length === 0) return;
  await updateDoc(userRef, patch);
}

// fetch single user doc
export async function getUserByUid(uid) {
  const userRef = doc(db, "Users", uid);
  const snap = await getDoc(userRef);
  return snap.exists()
    ? normalizeUserAccessDoc({ id: snap.id, ...snap.data() })
    : null;
}

// ── 路由權限設定（Config/routePermissions）────────────────────────────────

/**
 * 讀取 Firestore 中儲存的路由權限覆寫設定。
 * 若文件不存在則回傳 null（由呼叫端 fallback 至預設值）。
 * @returns {Promise<import('./config/routePermissions').RoutePermDef[] | null>}
 */
export async function getRoutePermissionsConfig() {
  const ref = doc(db, "Config", "routePermissions");
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  const data = snap.data();
  return Array.isArray(data.routes) ? data.routes : null;
}

/**
 * 將路由權限設定儲存至 Firestore Config/routePermissions。
 * 僅 admin 可呼叫（由 UI 層限制，此函式本身不做角色驗證）。
 * @param {import('./config/routePermissions').RoutePermDef[]} routes
 */
export async function saveRoutePermissionsConfig(routes) {
  if (!Array.isArray(routes)) throw new Error("routes 必須為陣列");
  // Firestore 不接受 undefined，將每筆資料中 undefined 的欄位移除
  const sanitized = routes.map((r) => {
    const entry = {
      path: r.path,
      title: r.title,
      roles: Array.isArray(r.roles) ? r.roles : [],
      group: r.group || "",
    };
    if (Array.isArray(r.depts) && r.depts.length > 0) entry.depts = r.depts;
    return entry;
  });
  const ref = doc(db, "Config", "routePermissions");
  await setDoc(ref, { routes: sanitized }, { merge: false });
}

export async function getAllPendingOrdersForSearch() {
  const callable = httpsCallable(
    functionsInstance,
    "getAllPendingOrdersForSearch",
    {
      timeout: 60000,
    },
  );
  const resp = await callable({});
  return resp.data || [];
}

function sanitizeFilename(name = "") {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function encodePathSegment(value = "") {
  return encodeURIComponent(String(value));
}

async function uploadFileWithProgress(fileRef, file, onProgress) {
  const task = uploadBytesResumable(fileRef, file, {
    contentType: file.type || "application/octet-stream",
  });

  await new Promise((resolve, reject) => {
    task.on(
      "state_changed",
      (snapshot) => {
        if (typeof onProgress === "function") {
          onProgress(
            snapshot.bytesTransferred,
            snapshot.totalBytes || file.size || 0,
          );
        }
      },
      (error) => reject(error),
      () => resolve(),
    );
  });

  return getDownloadURL(task.snapshot.ref);
}

function isRetryableStorageError(error) {
  const code = String(error?.code || "").toLowerCase();
  const message = String(error?.message || "").toLowerCase();
  return (
    code === "storage/unknown" ||
    code === "storage/retry-limit-exceeded" ||
    code === "storage/network-request-failed" ||
    message.includes("network") ||
    message.includes("timeout")
  );
}

async function uploadFileWithRetry(fileRef, file, onProgress, maxAttempts = 3) {
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await uploadFileWithProgress(fileRef, file, onProgress);
    } catch (e) {
      lastError = e;
      const shouldRetry = isRetryableStorageError(e) && attempt < maxAttempts;
      if (!shouldRetry) {
        throw e;
      }

      // Short backoff to avoid immediate retry on unstable mobile networks.
      const delayMs = 400 * attempt;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw lastError || new Error("上傳失敗");
}

async function getCurrentOperatorMeta() {
  const user = await getSignedInUser();
  const userDoc = await getUserByUid(user.uid);
  return {
    uid: user.uid,
    name:
      userDoc?.displayName || user.displayName || user.email || "未知使用者",
    email: user.email || "",
  };
}

export async function listOrderCompletionPhotos(orderDocId) {
  if (!orderDocId) return [];
  await authReadyPromise;
  const photosRef = collection(db, "Orders", orderDocId, "completionPhotos");
  const q = query(photosRef, orderBy("uploadedAt", "desc"));
  const snaps = await getDocs(q);
  const rows = snaps.docs.map((d) => ({ id: d.id, ...d.data() }));

  const nasPhotoIds = rows
    .filter((row) => String(row?.nasPath || "").trim())
    .map((row) => row.id);

  if (!nasPhotoIds.length) return rows;

  try {
    const functions = functionsInstance;
    const callable = httpsCallable(functions, "getCompletionPhotoAccessUrls");
    const urlMap = {};
    const chunkSize = 50;
    for (let i = 0; i < nasPhotoIds.length; i += chunkSize) {
      const idsChunk = nasPhotoIds.slice(i, i + chunkSize);
      const resp = await callable({ orderDocId, photoIds: idsChunk });
      Object.assign(urlMap, resp?.data || {});
    }

    return rows.map((row) => ({
      ...row,
      downloadURL: urlMap[row.id] || row.downloadURL || "",
    }));
  } catch (e) {
    console.warn("取得 NAS 照片存取連結失敗（詳細）", {
      code: String(e?.code || ""),
      message: String(e?.message || ""),
      orderDocId,
      photoCount: nasPhotoIds.length,
    });
    if (isAuthRelatedError(e)) {
      throw new Error("尚未登入或登入已過期，請重新登入後再試");
    }
    if (isPermissionDeniedError(e)) {
      throw new Error("權限不足：僅員工與管理者可查看完工照片");
    }
    console.warn("取得 NAS 照片存取連結失敗，回退原有 downloadURL：", e);
    return rows;
  }
}

export async function getOrderCompletionPhotoStatus(orderDocIds = []) {
  const ids = Array.from(
    new Set(
      (orderDocIds || []).map((id) => String(id || "").trim()).filter(Boolean),
    ),
  );
  if (!ids.length) return {};

  const result = {};
  // 分批查詢（每批 10 筆），避免一次並行發出過多 Firestore 請求造成 UI 卡頓
  const batchSize = 10;
  for (let i = 0; i < ids.length; i += batchSize) {
    const batch = ids.slice(i, i + batchSize);
    const pairs = await Promise.all(
      batch.map(async (orderDocId) => {
        const photosRef = collection(
          db,
          "Orders",
          orderDocId,
          "completionPhotos",
        );
        // limit(1) 足以判斷是否有照片，不需要讀多筆
        const snap = await getDocs(query(photosRef, limit(1)));
        const hasUsablePhoto = snap.docs.some((docSnap) => {
          const row = docSnap.data() || {};
          return Boolean(
            String(row.nasPath || "").trim() ||
            String(row.downloadURL || "").trim() ||
            String(row.storagePath || "").trim(),
          );
        });
        return [orderDocId, hasUsablePhoto];
      }),
    );
    pairs.forEach(([id, val]) => {
      result[id] = val;
    });
  }

  return result;
}

export async function createCompletionPhotoShareAlbum(
  orderDocId,
  photoIds = [],
  title = "完工照片",
) {
  const safeOrderId = String(orderDocId || "").trim();
  const safePhotoIds = Array.from(
    new Set(
      (photoIds || []).map((id) => String(id || "").trim()).filter(Boolean),
    ),
  );
  if (!safeOrderId || !safePhotoIds.length) {
    throw new Error("缺少分享資料");
  }

  await authReadyPromise;
  const functions = functionsInstance;
  const callable = httpsCallable(functions, "createCompletionPhotoShareAlbum");
  const resp = await callable({
    orderDocId: safeOrderId,
    photoIds: safePhotoIds,
    title: String(title || "完工照片").trim() || "完工照片",
  });
  return resp?.data || {};
}

function compactObject(payload = {}) {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined),
  );
}

export async function logClientUploadError(error, context = {}) {
  try {
    const user = await getSignedInUser();

    const logsRef = collection(db, "ClientUploadErrors");
    const logRef = doc(logsRef);

    await setDoc(
      logRef,
      compactObject({
        uid: user.uid,
        email: user.email || "",
        displayName: user.displayName || "",
        code: String(error?.code || ""),
        name: String(error?.name || ""),
        message: String(error?.message || ""),
        stack: String(error?.stack || "").slice(0, 4000),
        context: compactObject({
          action: String(context?.action || ""),
          orderDocId: String(context?.orderDocId || ""),
          orderNumber: String(context?.orderNumber || ""),
          fileName: String(context?.fileName || ""),
          route: String(context?.route || ""),
          userAgent: String(context?.userAgent || ""),
          platform: String(context?.platform || ""),
          language: String(context?.language || ""),
          online: Boolean(context?.online),
          timezone: String(context?.timezone || ""),
          occurredAtClient: String(context?.occurredAtClient || ""),
        }),
        createdAt: serverTimestamp(),
      }),
    );

    return logRef.id;
  } catch (e) {
    console.warn("寫入 ClientUploadErrors 失敗：", e);
    return "";
  }
}

export async function listClientUploadErrors(maxRows = 200) {
  const safeLimit = Math.max(1, Math.min(500, Number(maxRows || 200)));
  const logsRef = collection(db, "ClientUploadErrors");
  const q = query(logsRef, orderBy("createdAt", "desc"), limit(safeLimit));
  const snaps = await getDocs(q);
  return snaps.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// Server-side audit when 完工照片上傳時找不到訂單資料夾，
// fallback 自動新建 — 理論上不該發生，每筆都需要事後檢視。
export async function listCompletionPhotoFolderCreations(maxRows = 200) {
  const safeLimit = Math.max(1, Math.min(500, Number(maxRows || 200)));
  const logsRef = collection(db, "CompletionPhotoFolderCreations");
  const q = query(logsRef, orderBy("createdAt", "desc"), limit(safeLimit));
  const snaps = await getDocs(q);
  return snaps.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function uploadOrderCompletionPhotos(
  orderDocId,
  orderNumber,
  files = [],
  onProgress,
  orderMeta = {},
) {
  if (!orderDocId) throw new Error("缺少訂單識別碼");
  if (!Array.isArray(files) || files.length === 0) {
    throw new Error("請至少選擇一個檔案");
  }

  const totalBytes = files.reduce((sum, f) => sum + Number(f?.size || 0), 0);
  let completedBytes = 0;

  const postMultipart = async (endpointName, fields, file, onProgress) => {
    const user = await getSignedInUser();
    const token = await user.getIdToken();
    const url = `https://asia-east1-${firebaseConfig.projectId}.cloudfunctions.net/${endpointName}`;
    const form = new FormData();
    Object.entries(fields || {}).forEach(([k, v]) => {
      form.append(k, String(v ?? ""));
    });
    form.append("file", file, file.name || "file");

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", url, true);
      xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      xhr.timeout = MULTIPART_UPLOAD_TIMEOUT_MS;

      xhr.upload.onprogress = (evt) => {
        if (!evt.lengthComputable || typeof onProgress !== "function") return;
        onProgress(evt.loaded, evt.total);
      };

      xhr.onload = () => {
        const raw = String(xhr.responseText || "").trim();
        let json = {};
        if (raw) {
          try {
            json = JSON.parse(raw);
          } catch (_e) {
            json = { error: raw };
          }
        }

        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(json || {});
          return;
        }
        reject(
          new Error(String(json?.error || `http-${xhr.status}: 上傳失敗`)),
        );
      };

      xhr.onerror = () =>
        reject(new Error("network-request-failed: 網路錯誤，無法上傳檔案"));
      xhr.ontimeout = () =>
        reject(new Error("network-timeout: 上傳逾時，請稍後重試"));
      xhr.onabort = () => reject(new Error("network-aborted: 上傳已中止"));
      xhr.send(form);
    });
  };

  const failedFiles = [];

  for (const [index, file] of files.entries()) {
    const fileSize = Number(file.size || 0);
    let uploadAttempt = 0;
    let fileSucceeded = false;
    while (true) {
      uploadAttempt++;
      try {
        await postMultipart(
          "uploadCompletionPhotoToNasHttp",
          {
            orderDocId,
            orderNumber: orderNumber || "",
            customerName: String(orderMeta?.customerName || "").trim(),
            color: String(orderMeta?.color || "").trim(),
            installAddress: String(orderMeta?.installAddress || "").trim(),
            installDate: String(orderMeta?.installDate || "").trim(),
            installer1: String(orderMeta?.installer1 || "").trim(),
            installer2: String(orderMeta?.installer2 || "").trim(),
            installer3: String(orderMeta?.installer3 || "").trim(),
            carNumber: String(orderMeta?.carNumber || "").trim(),
            taskId: String(orderMeta?.taskId || "").trim(),
            fileName: file.name || "",
            contentType: file.type || "application/octet-stream",
          },
          file,
          (bytesTransferred, snapshotTotal) => {
            if (typeof onProgress !== "function") return;

            const perFileTotal = Number(snapshotTotal || fileSize || 0);
            const fileProgress =
              perFileTotal > 0
                ? Math.min(1, bytesTransferred / perFileTotal)
                : 0;

            const overallProgress =
              totalBytes > 0
                ? Math.min(1, (completedBytes + bytesTransferred) / totalBytes)
                : Math.min(1, (index + fileProgress) / files.length);

            onProgress({
              overallProgress,
              fileProgress,
              fileName: file.name || `檔案 ${index + 1}`,
              fileIndex: index + 1,
              totalFiles: files.length,
            });
          },
        );
        fileSucceeded = true;
        break;
      } catch (e) {
        const raw = String(e?.message || "").toLowerCase();
        const networkError =
          raw.includes("network-request-failed") ||
          raw.includes("network-timeout") ||
          raw.includes("network-aborted") ||
          raw.includes("failed to fetch");
        const retryable = networkError && uploadAttempt < 5;
        if (!retryable) {
          // Non-retryable error (auth, size, etc.) → abort the whole batch
          if (!networkError) throw e;
          // Network error but retries exhausted → skip this file
          failedFiles.push({
            name: file.name || `檔案 ${index + 1}`,
            size: fileSize,
            contentType: file.type || "",
            attempts: uploadAttempt,
            errorMessage: String(e?.message || ""),
            error: e,
          });
          break;
        }

        // If browser reports offline, wait until connectivity is restored
        // before sleeping, then add the exponential delay on top.
        if (typeof navigator !== "undefined" && !navigator.onLine) {
          await new Promise((resolve) => {
            const handler = () => {
              window.removeEventListener("online", handler);
              resolve();
            };
            window.addEventListener("online", handler);
            // Safety cap: don't wait more than 60 s even if "online" never fires
            setTimeout(resolve, 60_000);
          });
        }

        // If the page is hidden (user backgrounded the app / locked screen on
        // iOS), iOS aggressively kills sockets and the next XHR will also
        // fail. Wait for visibility before sleeping so the retry happens with
        // the page in foreground.
        if (typeof document !== "undefined" && document.hidden) {
          if (typeof onProgress === "function") {
            onProgress({
              overallProgress:
                totalBytes > 0
                  ? Math.min(1, completedBytes / totalBytes)
                  : Math.min(1, index / files.length),
              fileProgress: 0,
              fileName: file.name || `檔案 ${index + 1}`,
              fileIndex: index + 1,
              totalFiles: files.length,
              retryAttempt: uploadAttempt,
              waitingVisible: true,
            });
          }
          await new Promise((resolve) => {
            const handler = () => {
              if (!document.hidden) {
                document.removeEventListener("visibilitychange", handler);
                resolve();
              }
            };
            document.addEventListener("visibilitychange", handler);
            // Safety cap: don't wait more than 5 minutes
            setTimeout(() => {
              document.removeEventListener("visibilitychange", handler);
              resolve();
            }, 300_000);
          });
        }

        // Exponential backoff: 2 s, 4 s, 8 s, 16 s (capped at 20 s) + small jitter
        const backoffMs =
          Math.min(20_000, 1_000 * Math.pow(2, uploadAttempt)) +
          Math.floor(Math.random() * 500);
        if (typeof onProgress === "function") {
          onProgress({
            overallProgress:
              totalBytes > 0
                ? Math.min(1, completedBytes / totalBytes)
                : Math.min(1, index / files.length),
            fileProgress: 0,
            fileName: file.name || `檔案 ${index + 1}`,
            fileIndex: index + 1,
            totalFiles: files.length,
            retryAttempt: uploadAttempt,
          });
        }
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }
    }

    if (fileSucceeded) {
      completedBytes += fileSize;
    }

    if (typeof onProgress === "function") {
      onProgress({
        overallProgress:
          totalBytes > 0
            ? Math.min(1, completedBytes / totalBytes)
            : Math.min(1, (index + 1) / files.length),
        fileProgress: fileSucceeded ? 1 : 0,
        fileName: file.name || `檔案 ${index + 1}`,
        fileIndex: index + 1,
        totalFiles: files.length,
        skipped: !fileSucceeded,
      });
    }
  }
  return { failedFiles };
}

// 派車任務完工照片：直接掛到 installTasks/{taskId}/completionPhotos 子集合
// 內部仍走相同的 uploadCompletionPhotoToNasHttp,Cloud Function 會自動鏡像寫入
export async function uploadInstallTaskCompletionPhotos(
  task,
  files = [],
  onProgress,
) {
  if (!task || !task.id) throw new Error("缺少派車任務");
  const salesOrderId = String(task.salesOrderId || "").trim();
  const orderDocId = salesOrderId.startsWith("legacy_")
    ? salesOrderId.slice(7)
    : salesOrderId;
  if (!orderDocId)
    throw new Error("派車任務缺少 salesOrderId,無法定位 NAS 資料夾");
  return uploadOrderCompletionPhotos(
    orderDocId,
    String(task.orderNumber || ""),
    files,
    onProgress,
    {
      customerName: task.customerName || "",
      color: task.color || "",
      installAddress: task.siteAddress || "",
      installDate: String(task.assignedDate || "").replace(
        /^(\d{4})(\d{2})(\d{2})$/,
        "$1-$2-$3",
      ),
      installer1: task.installer1 || "",
      installer2: task.installer2 || "",
      installer3: task.installer3 || "",
      carNumber: task.carNumber || "",
      taskId: task.id,
    },
  );
}

export async function listInstallTaskCompletionPhotos(taskId) {
  if (!taskId) return [];
  await authReadyPromise;
  const photosRef = collection(db, "installTasks", taskId, "completionPhotos");
  const q = query(photosRef, orderBy("uploadedAt", "desc"));
  const snaps = await getDocs(q);
  const rows = snaps.docs.map((d) => ({ id: d.id, ...d.data() }));

  // 取 NAS 簽名連結（沿用既有 callable;以 orderDocId 為主鍵）
  const byOrder = new Map();
  for (const row of rows) {
    if (!row.nasPath || !row.orderDocId) continue;
    if (!byOrder.has(row.orderDocId)) byOrder.set(row.orderDocId, []);
    byOrder.get(row.orderDocId).push(row.id);
  }
  if (!byOrder.size) return rows;

  try {
    const callable = httpsCallable(
      functionsInstance,
      "getCompletionPhotoAccessUrls",
    );
    const urlMap = {};
    for (const [orderDocId, photoIds] of byOrder.entries()) {
      const chunkSize = 50;
      for (let i = 0; i < photoIds.length; i += chunkSize) {
        const resp = await callable({
          orderDocId,
          photoIds: photoIds.slice(i, i + chunkSize),
        });
        Object.assign(urlMap, resp?.data || {});
      }
    }
    return rows.map((row) => ({
      ...row,
      downloadURL: urlMap[row.id] || row.downloadURL || "",
    }));
  } catch (e) {
    console.warn("取得派車任務 NAS 照片連結失敗", e);
    return rows;
  }
}

export async function replaceOrderCompletionPhoto(
  orderDocId,
  photoId,
  previousStoragePath,
  nextFile,
  onProgress,
) {
  if (!orderDocId || !photoId) throw new Error("缺少照片識別資訊");
  if (!nextFile) throw new Error("請選擇替換檔案");

  const user = await getSignedInUser();
  const token = await user.getIdToken();
  const url = `https://asia-east1-${firebaseConfig.projectId}.cloudfunctions.net/replaceCompletionPhotoInNasHttp`;

  let replaceAttempt = 0;
  while (true) {
    replaceAttempt++;
    const form = new FormData();
    form.append("orderDocId", String(orderDocId));
    form.append("photoId", String(photoId));
    form.append("fileName", String(nextFile.name || ""));
    form.append(
      "contentType",
      String(nextFile.type || "application/octet-stream"),
    );
    form.append("file", nextFile, nextFile.name || "file");

    try {
      await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", url, true);
        xhr.setRequestHeader("Authorization", `Bearer ${token}`);
        xhr.timeout = MULTIPART_UPLOAD_TIMEOUT_MS;

        xhr.upload.onprogress = (evt) => {
          if (!evt.lengthComputable || typeof onProgress !== "function") return;
          const percent =
            evt.total > 0 ? Math.min(1, evt.loaded / evt.total) : 0;
          onProgress(percent);
        };

        xhr.onload = () => {
          const raw = String(xhr.responseText || "").trim();
          let json = {};
          if (raw) {
            try {
              json = JSON.parse(raw);
            } catch (_e) {
              json = { error: raw };
            }
          }
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(json || {});
            return;
          }
          reject(
            new Error(String(json?.error || `http-${xhr.status}: 替換失敗`)),
          );
        };

        xhr.onerror = () =>
          reject(new Error("network-request-failed: 網路錯誤，無法替換檔案"));
        xhr.ontimeout = () =>
          reject(new Error("network-timeout: 替換逾時，請稍後重試"));
        xhr.onabort = () => reject(new Error("network-aborted: 替換已中止"));
        xhr.send(form);
      });
      break;
    } catch (e) {
      const raw = String(e?.message || "").toLowerCase();
      const retryable =
        (raw.includes("network-request-failed") ||
          raw.includes("network-timeout") ||
          raw.includes("network-aborted") ||
          raw.includes("failed to fetch")) &&
        replaceAttempt < 3;
      if (!retryable) throw e;
      await new Promise((resolve) => setTimeout(resolve, 600 * replaceAttempt));
    }
  }

  if (typeof onProgress === "function") {
    onProgress(1);
  }
}

export async function deleteOrderCompletionPhoto(
  orderDocId,
  photoId,
  storagePath,
) {
  if (!orderDocId || !photoId) throw new Error("缺少照片識別資訊");
  await getSignedInUser();

  const functions = functionsInstance;
  const callable = httpsCallable(functions, "deleteCompletionPhotoInNas");
  await callable({ orderDocId, photoId, storagePath: storagePath || "" });
}

export async function getSystemSettings() {
  const ref = doc(db, "SystemSettings", "general");
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    return {
      nasStoragePath: "",
      nasOrderPath: "",
      priceRedactBox: { ...DEFAULT_PRICE_REDACT_BOX },
    };
  }

  const data = snap.data() || {};
  const box = data.priceRedactBox || {};
  const loc = data.punchLocation || {};
  return {
    nasStoragePath: data.nasStoragePath || "",
    nasOrderPath: data.nasOrderPath || "",
    priceRedactBox: {
      xPct: Number.isFinite(Number(box.xPct))
        ? Number(box.xPct)
        : DEFAULT_PRICE_REDACT_BOX.xPct,
      yPct: Number.isFinite(Number(box.yPct))
        ? Number(box.yPct)
        : DEFAULT_PRICE_REDACT_BOX.yPct,
      wPct: Number.isFinite(Number(box.wPct))
        ? Number(box.wPct)
        : DEFAULT_PRICE_REDACT_BOX.wPct,
      hPct: Number.isFinite(Number(box.hPct))
        ? Number(box.hPct)
        : DEFAULT_PRICE_REDACT_BOX.hPct,
    },
    punchLocation: {
      enabled: loc.enabled === true,
      allowOnFail: false,
      lat: Number.isFinite(Number(loc.lat)) ? Number(loc.lat) : null,
      lng: Number.isFinite(Number(loc.lng)) ? Number(loc.lng) : null,
      radiusMeters: Number.isFinite(Number(loc.radiusMeters))
        ? Number(loc.radiusMeters)
        : 200,
    },
    updatedAt: data.updatedAt || null,
    updatedByUid: data.updatedByUid || "",
    updatedByEmail: data.updatedByEmail || "",
    attendanceRules: (() => {
      const ar = data.attendanceRules || {};
      return {
        workStart: ar.workStart || "08:30",
        workEnd: ar.workEnd || "17:30",
        graceMins: Number.isFinite(Number(ar.graceMins))
          ? Number(ar.graceMins)
          : 0,
        deductUnit: ar.deductUnit || "minute",
        deductEarlyLeave: ar.deductEarlyLeave === true,
      };
    })(),
    loanInterestRate: Number.isFinite(Number(data.loanInterestRate))
      ? Number(data.loanInterestRate)
      : 2,
    publicHolidays: Array.isArray(data.publicHolidays)
      ? data.publicHolidays.map((h) =>
          typeof h === "string"
            ? { date: h, name: "" }
            : { date: h.date || "", name: h.name || "" },
        )
      : [],
    makeupWorkdays: Array.isArray(data.makeupWorkdays)
      ? data.makeupWorkdays.map((h) =>
          typeof h === "string"
            ? { date: h, name: "補班" }
            : { date: h.date || "", name: h.name || "" },
        )
      : [],
    lunchSheetCsvUrl: data.lunchSheetCsvUrl || "",
  };
}

export async function saveSystemSettings(payload = {}) {
  const user = await getSignedInUser();

  const box = payload.priceRedactBox || {};
  const ref = doc(db, "SystemSettings", "general");
  await setDoc(
    ref,
    {
      nasStoragePath: String(payload.nasStoragePath || "").trim(),
      nasOrderPath: String(payload.nasOrderPath || "").trim(),
      priceRedactBox: {
        xPct: Number.isFinite(Number(box.xPct)) ? Number(box.xPct) : 0,
        yPct: Number.isFinite(Number(box.yPct)) ? Number(box.yPct) : 0,
        wPct: Number.isFinite(Number(box.wPct)) ? Number(box.wPct) : 0,
        hPct: Number.isFinite(Number(box.hPct)) ? Number(box.hPct) : 0,
      },
      punchLocation: (() => {
        const pl = payload.punchLocation || {};
        return {
          enabled: pl.enabled === true,
          allowOnFail: false,
          lat: Number.isFinite(Number(pl.lat)) ? Number(pl.lat) : null,
          lng: Number.isFinite(Number(pl.lng)) ? Number(pl.lng) : null,
          radiusMeters: Number.isFinite(Number(pl.radiusMeters))
            ? Number(pl.radiusMeters)
            : 200,
        };
      })(),
      updatedAt: serverTimestamp(),
      updatedByUid: user.uid,
      updatedByEmail: user.email || "",
      attendanceRules: (() => {
        const ar = payload.attendanceRules || {};
        return {
          workStart: String(ar.workStart || "08:30"),
          workEnd: String(ar.workEnd || "17:30"),
          graceMins: Number.isFinite(Number(ar.graceMins))
            ? Number(ar.graceMins)
            : 0,
          deductUnit: ar.deductUnit || "minute",
          deductEarlyLeave: ar.deductEarlyLeave === true,
        };
      })(),
      loanInterestRate: Number.isFinite(Number(payload.loanInterestRate))
        ? Number(payload.loanInterestRate)
        : 2,
      publicHolidays: Array.isArray(payload.publicHolidays)
        ? payload.publicHolidays
            .filter(
              (h) =>
                h &&
                typeof h.date === "string" &&
                /^\d{4}-\d{2}-\d{2}$/.test(h.date),
            )
            .map((h) => ({ date: h.date, name: String(h.name || "") }))
        : [],
      makeupWorkdays: Array.isArray(payload.makeupWorkdays)
        ? payload.makeupWorkdays
            .filter(
              (h) =>
                h &&
                typeof h.date === "string" &&
                /^\d{4}-\d{2}-\d{2}$/.test(h.date),
            )
            .map((h) => ({ date: h.date, name: String(h.name || "") }))
        : [],
      lunchSheetCsvUrl: String(payload.lunchSheetCsvUrl || "").trim(),
    },
    { merge: true },
  );
}

export async function getAllOrdersForSearch() {
  const callable = httpsCallable(functionsInstance, "getAllOrdersForSearch", {
    timeout: 60000,
  });
  const resp = await callable({});
  return resp.data || [];
}

// ── Loan Management ────────────────────────────────────────────────────────
export async function createLoan({
  uid,
  empNo,
  name,
  principal,
  installments,
  interestRate,
  startMonth,
}) {
  await getSignedInUser();
  const data = {
    uid: uid || null,
    empNo: String(empNo || ""),
    name: String(name || ""),
    principal: Number(principal) || 0,
    installments: Number(installments) || 1,
    paidInstallments: 0,
    remainingBalance: Number(principal) || 0,
    interestRate: Number(interestRate) || 0.02,
    startMonth: String(startMonth || ""),
    status: "active",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  const ref = await addDoc(collection(db, "loans"), data);
  return ref.id;
}

export async function getLoans({ empNo, status } = {}) {
  let q = collection(db, "loans");
  const constraints = [];
  if (empNo) constraints.push(where("empNo", "==", String(empNo)));
  if (status) constraints.push(where("status", "==", status));
  constraints.push(orderBy("createdAt", "desc"));
  const snap = await getDocs(query(q, ...constraints));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getAllLoans() {
  const snap = await getDocs(
    query(collection(db, "loans"), orderBy("createdAt", "desc")),
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function updateLoan(loanId, updates) {
  await updateDoc(doc(db, "loans", loanId), {
    ...updates,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteLoan(loanId) {
  await deleteDoc(doc(db, "loans", loanId));
}

// ── Payroll lunchFee update ────────────────────────────────────────────────
export async function updatePayrollLunchFee(docId, lunchFee) {
  await updateDoc(doc(db, "payroll", docId), {
    lunchFee: Number(lunchFee) || 0,
    updatedAt: serverTimestamp(),
  });
}

export async function getOrdersByIds(ids) {
  if (!ids || !ids.length) return [];
  const callable = httpsCallable(functionsInstance, "getOrdersByIds");
  const resp = await callable({ ids });
  return resp.data || [];
}

export async function updateOrderIncompleteStatus(orderDocId, payload = {}) {
  await getSignedInUser();
  const callable = httpsCallable(
    functionsInstance,
    "updateOrderIncompleteStatus",
  );
  const resp = await callable({
    orderDocId: String(orderDocId || "").trim(),
    incomplete: payload.incomplete === true,
    reason: String(payload.reason || "").trim(),
  });
  return resp?.data || {};
}

export async function testNasWrite() {
  const functions = functionsInstance;
  const callable = httpsCallable(functions, "testNasWrite");
  const resp = await callable({});
  return resp.data || {};
}

export async function testNasUploadPhoto(payload) {
  const functions = functionsInstance;
  const callable = httpsCallable(functions, "testNasUploadPhoto");
  const resp = await callable(payload || {});
  return resp.data || {};
}

export async function migrateLegacyCompletionPhotosToNas(payload = {}) {
  const functions = functionsInstance;
  const callable = httpsCallable(
    functions,
    "migrateLegacyCompletionPhotosToNas",
  );
  const resp = await callable(payload || {});
  return resp.data || {};
}

export async function precheckLegacyCompletionPhotosToNas(payload = {}) {
  const functions = functionsInstance;
  const callable = httpsCallable(
    functions,
    "precheckLegacyCompletionPhotosToNas",
  );
  const resp = await callable(payload || {});
  return resp.data || {};
}

// 查詢 NAS 是否有包含訂單號碼的資料夾
export async function findOrderFolderOnNas(orderNumber) {
  if (!orderNumber) throw new Error("請輸入訂單號碼");
  const callable = httpsCallable(functionsInstance, "findOrderFolderOnNas");
  const resp = await callable({ orderNumber });
  return resp.data || {};
}

export async function testOrderFolderSearch(orderNumber) {
  if (!orderNumber) throw new Error("請輸入訂單號碼");
  const callable = httpsCallable(functionsInstance, "testOrderFolderSearch", {
    timeout: 120000,
  });
  const resp = await callable({ orderNumber });
  return resp.data || {};
}

// 修復：把先前因搜尋失敗而新建到錯誤資料夾的照片，搬回正確資料夾並刪除空殼資料夾
export async function repairWrongOrderFolder(
  orderNumber,
  dryRun = true,
  wrongPath = "",
  correctPath = "",
) {
  if (!orderNumber) throw new Error("請輸入訂單號碼");
  const callable = httpsCallable(functionsInstance, "repairWrongOrderFolder", {
    timeout: 120000,
  });
  const resp = await callable({ orderNumber, dryRun, wrongPath, correctPath });
  return resp.data || {};
}

export async function batchFindOrderFolderOnNas(orderNumbers, batchId) {
  if (!Array.isArray(orderNumbers) || !orderNumbers.length)
    throw new Error("請提供訂單號碼陣列");
  const callable = httpsCallable(
    functionsInstance,
    "batchFindOrderFolderOnNas",
    { timeout: 540000 },
  );
  const resp = await callable({ orderNumbers, batchId });
  return resp.data || {};
}

export async function repairCompletionPhotoNasPaths(payload = {}) {
  const callable = httpsCallable(
    functionsInstance,
    "repairCompletionPhotoNasPaths",
    {
      timeout: 540000,
    },
  );
  const resp = await callable(payload);
  return resp.data || {};
}

// 列出 NAS 訂單資料夾內的舊有照片（尚未透過本系統上傳者）
export async function listNasLegacyPhotos(payload = {}) {
  const callable = httpsCallable(functionsInstance, "listNasLegacyPhotos");
  const resp = await callable(payload);
  return resp.data || {};
}

// ============================================================================
// salesOrders / customers / productModels (新 ERP 架構)
// ============================================================================

// 取所有客戶（依名稱排序，前端可再做關鍵字過濾）
export async function listCustomers() {
  const snap = await getDocs(
    query(collection(db, "customers"), orderBy("name")),
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getCustomerById(id) {
  if (!id) return null;
  const snap = await getDoc(doc(db, "customers", id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

function isActiveStaffRecord(staff = {}) {
  const status = String(staff?.status || "").trim();
  return !status.includes("離職");
}

// 依部門讀取在職員工（dept: "1" = 辦公室, "2" = 安裝, "3" = 廠內, "4" = 外勞）
export async function listStaffByDept(dept) {
  const snap = await getDocs(collection(db, "staff"));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter(
      (s) => String(s.dept ?? "") === String(dept) && isActiveStaffRecord(s),
    )
    .sort((a, b) =>
      String(a.name || "").localeCompare(String(b.name || ""), "zh-Hant"),
    );
}

export async function listActiveStaff() {
  const snap = await getDocs(collection(db, "staff"));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((s) => isActiveStaffRecord(s))
    .sort((a, b) =>
      String(a.name || "").localeCompare(String(b.name || ""), "zh-Hant"),
    );
}

// 取所有產品型號（可指定 type 過濾：sink / stove / hood / accessory）
export async function listProductModels(type) {
  const ref = collection(db, "productModels");
  const snap = type
    ? await getDocs(query(ref, where("type", "==", type)))
    : await getDocs(ref);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// 取單一銷售訂單
export async function getSalesOrder(id) {
  const snap = await getDoc(doc(db, "salesOrders", id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function findSalesOrdersBySiteAddress(siteAddress, options = {}) {
  const cleanAddress = String(siteAddress || "").trim();
  if (!cleanAddress) return [];

  const excludeId = String(options.excludeId || "").trim();
  const lim = Math.max(1, Math.min(20, Number(options.limit || 8)));
  const snap = await getDocs(
    query(
      collection(db, "salesOrders"),
      where("siteAddress", "==", cleanAddress),
      limit(lim),
    ),
  );

  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((order) => order.id !== excludeId)
    .sort((a, b) =>
      String(b.orderedAt || "").localeCompare(String(a.orderedAt || "")),
    );
}

// 列出銷售訂單（依建檔時間倒序，預設 100 筆）
export async function listSalesOrders({ status, limit: lim = 100 } = {}) {
  const ref = collection(db, "salesOrders");
  const constraints = [];
  if (status) constraints.push(where("status", "==", status));
  const limitValue = Number(lim);

  if (Number.isFinite(limitValue) && limitValue > 0) {
    constraints.push(orderBy("createdAt", "desc"));
    constraints.push(limit(limitValue));
    const snap = await getDocs(query(ref, ...constraints));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }

  const snap = constraints.length
    ? await getDocs(query(ref, ...constraints))
    : await getDocs(ref);

  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => {
      const ta =
        _coerceJsDate(a.createdAt || a.updatedAt || a.orderedAt)?.getTime() ||
        0;
      const tb =
        _coerceJsDate(b.createdAt || b.updatedAt || b.orderedAt)?.getTime() ||
        0;
      return tb - ta;
    });
}

function _coerceJsDate(input) {
  if (!input) return null;
  if (input instanceof Date)
    return Number.isNaN(input.getTime()) ? null : input;
  if (typeof input?.toDate === "function") {
    const date = input.toDate();
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof input === "object" && Number.isFinite(Number(input.seconds))) {
    const date = new Date(Number(input.seconds) * 1000);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof input === "string") {
    const raw = input.trim();
    if (!raw) return null;
    if (/^\d{1,5}$/.test(raw)) {
      const excelSerial = Number(raw);
      if (excelSerial > 0) {
        const date = new Date((excelSerial - 25569) * 86400 * 1000);
        return Number.isNaN(date.getTime()) ? null : date;
      }
    }
    const normalized = /^\d{4}-\d{2}-\d{2}$/.test(raw)
      ? `${raw}T00:00:00`
      : raw;
    const date = new Date(normalized);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof input === "number") {
    if (input > 0 && input < 100000) {
      const date = new Date((input - 25569) * 86400 * 1000);
      return Number.isNaN(date.getTime()) ? null : date;
    }
    const date = new Date(input);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

function _addMonths(date, months) {
  const source = _coerceJsDate(date);
  if (!source) return null;
  return new Date(
    source.getFullYear(),
    source.getMonth() + months,
    source.getDate(),
    0,
    0,
    0,
    0,
  );
}

function _formatMonthKey(date) {
  const source = _coerceJsDate(date);
  if (!source) return "";
  return `${source.getFullYear()}-${String(source.getMonth() + 1).padStart(2, "0")}`;
}

function _formatDateKey(date) {
  const source = _coerceJsDate(date);
  if (!source) return "";
  return `${source.getFullYear()}-${String(source.getMonth() + 1).padStart(2, "0")}-${String(source.getDate()).padStart(2, "0")}`;
}

export function normalizeCustomerReceivableSettings(customer = {}) {
  const allowedMethods = Array.isArray(customer.paymentMethodsAllowed)
    ? customer.paymentMethodsAllowed
        .map((method) => String(method || "").trim())
        .filter(Boolean)
    : [];

  return {
    billingCycleType:
      customer.billingCycleType === "monthEnd" ||
      customer.billingCycleType === "installCompleted"
        ? customer.billingCycleType
        : "cutoff25",
    invoicePreference:
      customer.invoicePreference === "required" ||
      customer.invoicePreference === "none"
        ? customer.invoicePreference
        : "optional",
    paymentTerms: String(customer.paymentTerms || "").trim(),
    paymentMethodsAllowed: allowedMethods.length
      ? allowedMethods
      : RECEIVABLE_PAYMENT_METHOD_OPTIONS.map((item) => item.value),
    accountingNotes: String(customer.accountingNotes || "").trim(),
  };
}

export function computeReceivableBillingMonth(
  dateInput,
  cycleType = "cutoff25",
) {
  const date = _coerceJsDate(dateInput);
  if (!date) return "";
  const result =
    cycleType === "installCompleted"
      ? new Date(date.getFullYear(), date.getMonth(), 1)
      : cycleType === "monthEnd"
        ? new Date(date.getFullYear(), date.getMonth() + 1, 1)
        : new Date(
            date.getFullYear(),
            date.getMonth() + (date.getDate() >= 26 ? 2 : 1),
            1,
          );
  return _formatMonthKey(result);
}

function _parseBillingMonth(monthKey = "") {
  const match = String(monthKey || "").match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: Number(match[2]),
  };
}

export function getReceivableBillingPeriod(
  monthKey = "",
  cycleType = "cutoff25",
) {
  const parsed = _parseBillingMonth(monthKey);
  if (!parsed) return { start: null, end: null };
  if (cycleType === "installCompleted") {
    return {
      start: new Date(parsed.year, parsed.month - 1, 1),
      end: new Date(parsed.year, parsed.month, 0),
    };
  }
  if (cycleType === "monthEnd") {
    return {
      start: new Date(parsed.year, parsed.month - 2, 1),
      end: new Date(parsed.year, parsed.month - 1, 0),
    };
  }
  return {
    start: new Date(parsed.year, parsed.month - 3, 26),
    end: new Date(parsed.year, parsed.month - 2, 25),
  };
}

function _normalizeReceivableLineItems(order = {}) {
  const rows = Array.isArray(order.lineItems)
    ? order.lineItems
        .map((item) => ({
          id: item.id || "",
          category: item.category || "other",
          description: item.description || "",
          unit: item.unit || "",
          qty: Number(item.qty) || 0,
          unitPrice: Number(item.unitPrice) || 0,
          amount: Number(item.amount) || 0,
          refId: item.refId || null,
        }))
        .filter((item) => item.description || item.amount)
    : [];

  if (rows.length) return rows;

  const baseAmount = Number.isFinite(Number(order.subtotal))
    ? Number(order.subtotal)
    : Number.isFinite(Number(order.total))
      ? Number(order.total)
      : 0;
  const description = [
    order.category || "訂單",
    order.countertop?.type || "",
    order.orderNo || "",
  ]
    .filter(Boolean)
    .join(" ");
  return [
    {
      id: "main",
      category: "other",
      description: description || "訂單金額",
      unit: "式",
      qty: 1,
      unitPrice: baseAmount,
      amount: baseAmount,
      refId: null,
    },
  ];
}

export function getReceivableEligibility(order = {}, customer = null) {
  if (!order || !order.id) {
    return {
      eligible: false,
      billingMonth: "",
      billingDate: null,
      billingTriggerType: "",
      billingEligibleReason: "缺少訂單資料",
    };
  }

  if (order.chargeable === false) {
    return {
      eligible: false,
      billingMonth: "",
      billingDate: null,
      billingTriggerType: "",
      billingEligibleReason: "此訂單不收費",
    };
  }

  const customerSettings = normalizeCustomerReceivableSettings(customer || {});
  const installedAt = _coerceJsDate(order.installedAt);
  const legacyCompletedAt = _coerceJsDate(order.promisedAt);
  const normalizedStatus = String(order.status || "")
    .trim()
    .toLowerCase();
  const effectiveInstalledAt =
    installedAt ||
    (legacyCompletedAt &&
    ["done", "delivered", "completed"].includes(normalizedStatus)
      ? legacyCompletedAt
      : null);
  if (effectiveInstalledAt) {
    const immediateBilling =
      customerSettings.billingCycleType === "installCompleted";
    return {
      eligible: true,
      billingMonth: computeReceivableBillingMonth(
        effectiveInstalledAt,
        customerSettings.billingCycleType,
      ),
      billingDate: effectiveInstalledAt,
      billingTriggerType: installedAt ? "installed" : "legacyCompleted",
      billingEligibleReason: immediateBilling
        ? "安裝完工即請款"
        : installedAt
          ? "完工可請款"
          : "舊資料以安裝日/交期欄位視為完工可請款",
    };
  }

  const responsibility =
    String(order.installDelayResponsibility || "unknown").trim() || "unknown";
  const staleEligibleAt =
    _coerceJsDate(order.staleBillingEligibleAt) ||
    _addMonths(order.createdAt, 3);
  if (
    staleEligibleAt &&
    staleEligibleAt.getTime() <= Date.now() &&
    responsibility === "customer"
  ) {
    return {
      eligible: true,
      billingMonth: computeReceivableBillingMonth(
        staleEligibleAt,
        customerSettings.billingCycleType,
      ),
      billingDate: staleEligibleAt,
      billingTriggerType: "staleUninstalled",
      billingEligibleReason: "超過三個月未安裝，且責任在客戶",
    };
  }

  return {
    eligible: false,
    billingMonth: "",
    billingDate: staleEligibleAt,
    billingTriggerType: "",
    billingEligibleReason:
      responsibility === "customer"
        ? "尚未到三個月可請款門檻"
        : "尚未完工或未標記客戶延遲",
  };
}

async function _refreshOrderReceivableSummary(orderId) {
  if (!orderId) return;
  const [itemSnap, billSnap] = await Promise.all([
    getDocs(
      query(
        collection(db, "accountsReceivableItems"),
        where("sourceOrderId", "==", orderId),
      ),
    ),
    getDocs(
      query(
        collection(db, "accountsReceivableBills"),
        where("orderIds", "array-contains", orderId),
      ),
    ),
  ]);

  const items = itemSnap.docs
    .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
    .filter((item) => item.itemStatus !== "void");
  const bills = billSnap.docs
    .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
    .filter((bill) => bill.paymentStatus !== "void");

  const receivableTotal = bills.length
    ? bills.reduce((sum, bill) => sum + (Number(bill.amountTotal) || 0), 0)
    : items.reduce((sum, item) => sum + (Number(item.amountTotal) || 0), 0);
  const receivedTotal = bills.reduce(
    (sum, bill) => sum + (Number(bill.paidAmount) || 0),
    0,
  );
  const balanceDue = Math.max(receivableTotal - receivedTotal, 0);

  let receivableStatus = "none";
  if (items.length && !bills.length) {
    receivableStatus = "pending";
  } else if (receivableTotal > 0 && receivedTotal <= 0) {
    receivableStatus = "grouped";
  } else if (receivableTotal > 0 && balanceDue > 0) {
    receivableStatus = "partial";
  } else if (receivableTotal > 0) {
    receivableStatus = "paid";
  }

  const latestBill =
    bills.sort((a, b) => {
      const aTime = _coerceJsDate(a.updatedAt || a.createdAt)?.getTime() || 0;
      const bTime = _coerceJsDate(b.updatedAt || b.createdAt)?.getTime() || 0;
      return bTime - aTime;
    })[0] || null;

  await updateDoc(doc(db, "salesOrders", orderId), {
    receivableStatus,
    receivableTotal,
    receivedTotal,
    balanceDue,
    latestArBillId: latestBill?.id || "",
    latestInvoiceNo: latestBill?.invoiceNo || "",
    updatedAt: serverTimestamp(),
    updatedByUid: auth.currentUser?.uid || null,
  });
}

async function _buildReceivableItemPayload(order, customer = null) {
  const customerDoc = customer || (await getCustomerById(order.customerId));
  const settings = normalizeCustomerReceivableSettings(customerDoc || {});
  const eligibility = getReceivableEligibility(order, customerDoc);
  const lineItems = _normalizeReceivableLineItems(order);
  const amountUntaxed = Number.isFinite(Number(order.subtotal))
    ? Number(order.subtotal)
    : lineItems.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const invoiceRequired =
    settings.invoicePreference === "required"
      ? true
      : settings.invoicePreference === "none"
        ? false
        : order.invoiceRequired !== false;
  const amountTotal = Number.isFinite(Number(order.grandTotal))
    ? Number(order.grandTotal)
    : invoiceRequired
      ? Math.round(amountUntaxed * 1.05)
      : amountUntaxed;
  const taxAmount = Math.max(amountTotal - amountUntaxed, 0);

  return {
    sourceOrderId: order.id,
    sourceOrderNo: order.orderNo || "",
    customerId: order.customerId || "",
    customerName: order.customerName || customerDoc?.name || "",
    customerSnapshot: customerDoc
      ? {
          id: customerDoc.id,
          code: customerDoc.code || customerDoc.id,
          name: customerDoc.name || "",
          taxId: customerDoc.taxId || "",
          contactPerson: customerDoc.contactPerson || "",
          phone: customerDoc.phone || "",
          address: customerDoc.address || "",
          billingCycleType: settings.billingCycleType,
          invoicePreference: settings.invoicePreference,
          paymentTerms: settings.paymentTerms,
          paymentMethodsAllowed: settings.paymentMethodsAllowed,
        }
      : null,
    billingMonth: eligibility.billingMonth,
    billingCycleType: settings.billingCycleType,
    billingTriggerType: eligibility.billingTriggerType,
    billingDate: eligibility.billingDate,
    billingEligibleReason: eligibility.billingEligibleReason,
    lineItems,
    amountUntaxed,
    taxAmount,
    amountTotal,
    invoiceRequired,
    itemStatus: "pending",
    pricingReviewStatus: "pending",
    pricingReviewedAt: null,
    pricingReviewedByUid: "",
    billId: "",
    notes: String(order.paymentNotes || "").trim(),
    orderSnapshot: {
      orderNo: order.orderNo || "",
      customerName: order.customerName || "",
      siteAddress: order.siteAddress || "",
      installedAt: order.installedAt || null,
      createdAt: order.createdAt || null,
      subtotal: amountUntaxed,
      taxAmount,
      amountTotal,
      depositPaid: Number(order.depositPaid) || 0,
      paymentNotes: String(order.paymentNotes || "").trim(),
    },
  };
}

export async function listReceivableItems({
  billingMonth = "",
  status = "",
  customerId = "",
  limit: lim = 500,
} = {}) {
  await authReadyPromise;
  const snap = await getDocs(
    query(
      collection(db, "accountsReceivableItems"),
      orderBy("createdAt", "desc"),
      limit(lim),
    ),
  );
  return snap.docs
    .map((docSnap) =>
      _normalizeReceivableItemReview({ id: docSnap.id, ...docSnap.data() }),
    )
    .filter((item) => !billingMonth || item.billingMonth === billingMonth)
    .filter((item) => !status || item.itemStatus === status)
    .filter((item) => !customerId || item.customerId === customerId);
}

export async function markReceivableItemPricingReviewed(
  itemId,
  reviewed = true,
) {
  await authReadyPromise;
  const uid = auth.currentUser?.uid || null;
  if (!itemId) throw new Error("缺少應收明細 id");
  await updateDoc(doc(db, "accountsReceivableItems", itemId), {
    pricingReviewStatus: reviewed ? "reviewed" : "pending",
    pricingReviewedAt: reviewed ? serverTimestamp() : null,
    pricingReviewedByUid: reviewed ? uid || "" : "",
    updatedAt: serverTimestamp(),
    updatedByUid: uid,
  });
}

export async function listAccountingNotifications({
  status = "",
  limit: lim = 50,
} = {}) {
  await authReadyPromise;
  const snap = await getDocs(
    query(
      collection(db, "accountingNotifications"),
      orderBy("createdAt", "desc"),
      limit(lim),
    ),
  );
  return snap.docs
    .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
    .filter((item) => !status || item.status === status);
}

export async function markAccountingNotificationRead(notificationId) {
  await authReadyPromise;
  const uid = auth.currentUser?.uid || null;
  if (!notificationId) throw new Error("缺少通知 id");
  await updateDoc(doc(db, "accountingNotifications", notificationId), {
    status: "read",
    readAt: serverTimestamp(),
    readByUid: uid || "",
    updatedAt: serverTimestamp(),
    updatedByUid: uid,
  });
}

export async function createReceivableItemFromOrder(orderOrId, options = {}) {
  await authReadyPromise;
  const uid = auth.currentUser?.uid || null;
  const order =
    typeof orderOrId === "string" ? await getSalesOrder(orderOrId) : orderOrId;
  if (!order?.id) throw new Error("找不到訂單");

  const customer =
    options.customer || (await getCustomerById(order.customerId));
  const eligibility = getReceivableEligibility(order, customer);
  if (!eligibility.eligible && options.allowIneligible !== true) {
    throw new Error(eligibility.billingEligibleReason || "此訂單目前不可請款");
  }

  const itemRef = doc(db, "accountsReceivableItems", order.id);
  const existingSnap = await getDoc(itemRef);
  if (existingSnap.exists() && options.force !== true) {
    return { id: existingSnap.id, ...existingSnap.data(), skipped: true };
  }

  const payload = await _buildReceivableItemPayload(order, customer);
  await setDoc(itemRef, {
    ...payload,
    createdAt: existingSnap.exists()
      ? existingSnap.data().createdAt || serverTimestamp()
      : serverTimestamp(),
    createdByUid: existingSnap.exists()
      ? existingSnap.data().createdByUid || uid
      : uid,
    updatedAt: serverTimestamp(),
    updatedByUid: uid,
  });

  await updateDoc(doc(db, "salesOrders", order.id), {
    billingEligible: eligibility.eligible,
    billingTriggerType: eligibility.billingTriggerType,
    billingEligibleReason: eligibility.billingEligibleReason,
    staleBillingEligibleAt: _addMonths(order.createdAt, 3),
    receivableStatus: "pending",
    receivableTotal: payload.amountTotal,
    receivedTotal: 0,
    balanceDue: payload.amountTotal,
    updatedAt: serverTimestamp(),
    updatedByUid: uid,
  });

  return { id: itemRef.id, ...payload };
}

export async function generateReceivableItemsFromEligibleOrders({
  billingMonth = "",
  customerId = "",
} = {}) {
  await authReadyPromise;
  const [orderSnap, customerList] = await Promise.all([
    getDocs(query(collection(db, "salesOrders"), orderBy("createdAt", "desc"))),
    listCustomers(),
  ]);
  const existingSnap = await getDocs(collection(db, "accountsReceivableItems"));
  const existingIds = new Set(existingSnap.docs.map((docSnap) => docSnap.id));
  const customerMap = new Map(
    customerList.map((customer) => [customer.id, customer]),
  );

  let created = 0;
  let skipped = 0;
  for (const orderDoc of orderSnap.docs) {
    const order = { id: orderDoc.id, ...orderDoc.data() };
    if (!order.customerId || existingIds.has(order.id)) {
      skipped += 1;
      continue;
    }
    if (customerId && order.customerId !== customerId) {
      skipped += 1;
      continue;
    }
    const customer = customerMap.get(order.customerId) || null;
    const eligibility = getReceivableEligibility(order, customer);
    if (!eligibility.eligible) {
      skipped += 1;
      continue;
    }
    if (billingMonth && eligibility.billingMonth !== billingMonth) {
      skipped += 1;
      continue;
    }
    await createReceivableItemFromOrder(order, { customer });
    created += 1;
  }

  return { created, skipped };
}

export async function listReceivableBills({
  billingMonth = "",
  status = "",
  customerId = "",
  limit: lim = 300,
} = {}) {
  await authReadyPromise;
  const snap = await getDocs(
    query(
      collection(db, "accountsReceivableBills"),
      orderBy("createdAt", "desc"),
      limit(lim),
    ),
  );
  return snap.docs
    .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
    .filter((bill) => !billingMonth || bill.billingMonth === billingMonth)
    .filter((bill) => !status || bill.paymentStatus === status)
    .filter((bill) => !customerId || bill.customerId === customerId);
}

export async function getReceivableBill(id) {
  await authReadyPromise;
  if (!id) return null;
  const snap = await getDoc(doc(db, "accountsReceivableBills", id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function listReceivableItemsByBill(billId) {
  await authReadyPromise;
  if (!billId) return [];
  try {
    const snap = await getDocs(
      query(
        collection(db, "accountsReceivableItems"),
        where("billId", "==", billId),
      ),
    );
    return snap.docs
      .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
      .sort((a, b) =>
        String(a.sourceOrderNo || a.sourceOrderId || "").localeCompare(
          String(b.sourceOrderNo || b.sourceOrderId || ""),
          "zh-Hant",
        ),
      );
  } catch (error) {
    const bill = await getReceivableBill(billId);
    const itemIds = Array.isArray(bill?.itemIds) ? bill.itemIds : [];
    if (!itemIds.length) return [];

    const rows = await Promise.all(
      itemIds.map(async (itemId) => {
        const snap = await getDoc(doc(db, "accountsReceivableItems", itemId));
        return snap.exists() ? { id: snap.id, ...snap.data() } : null;
      }),
    );

    return rows
      .filter(Boolean)
      .sort((a, b) =>
        String(a.sourceOrderNo || a.sourceOrderId || "").localeCompare(
          String(b.sourceOrderNo || b.sourceOrderId || ""),
          "zh-Hant",
        ),
      );
  }
}

function _computeAdjustmentDelta(adjustments = []) {
  return (adjustments || []).reduce((sum, item) => {
    const amount = Number(item.amount) || 0;
    return sum + amount;
  }, 0);
}

function _normalizeReceivableItemReview(item = {}) {
  const status = String(item.pricingReviewStatus || "").trim() || "pending";
  return {
    ...item,
    pricingReviewStatus: status,
    pricingReviewedAt: item.pricingReviewedAt || null,
    pricingReviewedByUid: String(item.pricingReviewedByUid || "").trim(),
  };
}

function _computeBillEffectiveTotal(bill = {}) {
  const baseAmount = Number(bill.amountTotal) || 0;
  const adjustedAmountTotal = Number(bill.adjustedAmountTotal);
  if (Number.isFinite(adjustedAmountTotal) && adjustedAmountTotal > 0) {
    return adjustedAmountTotal;
  }
  return Math.max(
    baseAmount + _computeAdjustmentDelta(bill.adjustments || []),
    0,
  );
}

function _deriveReceivableBillStatus(bill = {}, preferredStatus = "draft") {
  const paidAmount = Number(bill.paidAmount) || 0;
  const balanceAmount = Math.max(Number(bill.balanceAmount) || 0, 0);
  const normalizedPreferred =
    String(preferredStatus || bill.paymentStatus || "draft").trim() || "draft";

  if (normalizedPreferred === "void") {
    return "void";
  }
  if (paidAmount > 0) {
    return balanceAmount > 0 ? "partial" : "paid";
  }
  return normalizedPreferred === "paid" || normalizedPreferred === "partial"
    ? "issued"
    : normalizedPreferred;
}

function _formatReceivableBillNo(seq, billingMonth = "") {
  const parsed = _parseBillingMonth(billingMonth);
  const yy = parsed
    ? String(parsed.year).slice(-2)
    : String(new Date().getFullYear()).slice(-2);
  const mm = parsed
    ? String(parsed.month).padStart(2, "0")
    : String(new Date().getMonth() + 1).padStart(2, "0");
  return `ARB${yy}${mm}${String(seq).padStart(3, "0")}`;
}

export async function generateReceivableBills({
  billingMonth = "",
  customerId = "",
} = {}) {
  await authReadyPromise;
  const uid = auth.currentUser?.uid || null;
  const [items, existingBills] = await Promise.all([
    listReceivableItems({
      billingMonth,
      status: "pending",
      customerId,
      limit: 2000,
    }),
    listReceivableBills({ billingMonth, customerId, limit: 1000 }),
  ]);

  const groups = new Map();
  items.forEach((item) => {
    const key = [
      item.customerId,
      item.billingMonth,
      item.billingCycleType || "cutoff25",
    ].join("::");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  });

  let created = 0;
  let skipped = 0;
  for (const [groupKey, groupItems] of groups.entries()) {
    if (!groupItems.length) continue;
    const [groupCustomerId, groupBillingMonth, groupCycleType] =
      groupKey.split("::");
    const hasActiveBill = existingBills.some(
      (bill) => bill.groupKey === groupKey && bill.paymentStatus !== "void",
    );
    if (hasActiveBill) {
      skipped += groupItems.length;
      continue;
    }

    const customerSnapshot = groupItems[0].customerSnapshot || null;
    const totals = groupItems.reduce(
      (sum, item) => {
        sum.amountUntaxed += Number(item.amountUntaxed) || 0;
        sum.taxAmount += Number(item.taxAmount) || 0;
        sum.amountTotal += Number(item.amountTotal) || 0;
        return sum;
      },
      { amountUntaxed: 0, taxAmount: 0, amountTotal: 0 },
    );
    const period = getReceivableBillingPeriod(
      groupBillingMonth,
      groupCycleType,
    );
    const billRef = doc(collection(db, "accountsReceivableBills"));
    const counterRef = doc(db, "SystemSettings", "receivableBillCounter");

    await runTransaction(db, async (tx) => {
      const counterSnap = await tx.get(counterRef);
      const nextSeq =
        (counterSnap.exists() ? Number(counterSnap.data().seq) || 0 : 0) + 1;
      const billNo = _formatReceivableBillNo(nextSeq, groupBillingMonth);

      tx.set(
        counterRef,
        { seq: nextSeq, updatedAt: serverTimestamp() },
        { merge: true },
      );
      tx.set(billRef, {
        billNo,
        groupKey,
        customerId: groupCustomerId,
        customerSnapshot,
        billingMonth: groupBillingMonth,
        billingPeriodStart: period.start,
        billingPeriodEnd: period.end,
        cycleType: groupCycleType,
        itemIds: groupItems.map((item) => item.id),
        orderIds: groupItems.map((item) => item.sourceOrderId),
        orderCount: groupItems.length,
        amountUntaxed: totals.amountUntaxed,
        taxAmount: totals.taxAmount,
        amountTotal: totals.amountTotal,
        adjustedAmountTotal: totals.amountTotal,
        invoiceRequired: groupItems.some(
          (item) => item.invoiceRequired === true,
        ),
        invoiceNo: "",
        invoiceIssuedAt: null,
        paymentStatus: "draft",
        paidAmount: 0,
        balanceAmount: totals.amountTotal,
        payments: [],
        adjustments: [],
        notes: "",
        createdAt: serverTimestamp(),
        createdByUid: uid,
        updatedAt: serverTimestamp(),
        updatedByUid: uid,
      });

      groupItems.forEach((item) => {
        tx.update(doc(db, "accountsReceivableItems", item.id), {
          itemStatus: "grouped",
          billId: billRef.id,
          updatedAt: serverTimestamp(),
          updatedByUid: uid,
        });
      });
    });

    for (const orderId of groupItems.map((item) => item.sourceOrderId)) {
      await _refreshOrderReceivableSummary(orderId);
    }
    created += 1;
  }

  return { created, skipped };
}

export async function recordReceivablePayment(billId, paymentInput = {}) {
  await authReadyPromise;
  const uid = auth.currentUser?.uid || null;
  const ref = doc(db, "accountsReceivableBills", billId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("找不到帳單");
  const bill = { id: snap.id, ...snap.data() };

  const amount = Number(paymentInput.amount) || 0;
  if (amount <= 0) throw new Error("收款金額必須大於 0");
  const payment = {
    paidAt: _coerceJsDate(paymentInput.paidAt) || new Date(),
    method: String(paymentInput.method || "transfer").trim() || "transfer",
    amount,
    referenceNo: String(paymentInput.referenceNo || "").trim(),
    note: String(paymentInput.note || "").trim(),
    recordedByUid: uid,
  };
  const payments = [
    ...(Array.isArray(bill.payments) ? bill.payments : []),
    payment,
  ];
  const paidAmount = payments.reduce(
    (sum, item) => sum + (Number(item.amount) || 0),
    0,
  );
  const billTotal = _computeBillEffectiveTotal(bill);
  const balanceAmount = Math.max(billTotal - paidAmount, 0);
  const paymentStatus = _deriveReceivableBillStatus(
    { ...bill, paidAmount, balanceAmount },
    paidAmount > 0
      ? bill.paymentStatus
      : bill.paymentStatus === "void"
        ? "void"
        : "issued",
  );

  await updateDoc(ref, {
    payments,
    paidAmount,
    balanceAmount,
    paymentStatus,
    updatedAt: serverTimestamp(),
    updatedByUid: uid,
  });

  for (const orderId of bill.orderIds || []) {
    await _refreshOrderReceivableSummary(orderId);
  }
}

export async function updateReceivablePayment(
  billId,
  paymentIndex,
  paymentInput = {},
) {
  await authReadyPromise;
  const uid = auth.currentUser?.uid || null;
  const ref = doc(db, "accountsReceivableBills", billId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("找不到帳單");
  const bill = { id: snap.id, ...snap.data() };
  const payments = Array.isArray(bill.payments) ? [...bill.payments] : [];
  const index = Number(paymentIndex);
  if (!Number.isInteger(index) || index < 0 || index >= payments.length) {
    throw new Error("找不到收款紀錄");
  }

  const currentPayment = payments[index] || {};
  const amount = Number(paymentInput.amount ?? currentPayment.amount) || 0;
  if (amount <= 0) throw new Error("收款金額必須大於 0");

  payments[index] = {
    ...currentPayment,
    paidAt:
      _coerceJsDate(paymentInput.paidAt ?? currentPayment.paidAt) || new Date(),
    method:
      String(
        paymentInput.method ?? currentPayment.method ?? "transfer",
      ).trim() || "transfer",
    amount,
    referenceNo: String(
      paymentInput.referenceNo ?? currentPayment.referenceNo ?? "",
    ).trim(),
    note: String(paymentInput.note ?? currentPayment.note ?? "").trim(),
    recordedByUid: currentPayment.recordedByUid || uid,
    updatedByUid: uid,
    updatedAt: new Date(),
  };

  const paidAmount = payments.reduce(
    (sum, item) => sum + (Number(item.amount) || 0),
    0,
  );
  const billTotal = _computeBillEffectiveTotal(bill);
  const balanceAmount = Math.max(billTotal - paidAmount, 0);
  const paymentStatus = _deriveReceivableBillStatus(
    { ...bill, paidAmount, balanceAmount },
    bill.paymentStatus || "draft",
  );

  await updateDoc(ref, {
    payments,
    paidAmount,
    balanceAmount,
    paymentStatus,
    updatedAt: serverTimestamp(),
    updatedByUid: uid,
  });

  for (const orderId of bill.orderIds || []) {
    await _refreshOrderReceivableSummary(orderId);
  }
}

export async function deleteReceivablePayment(billId, paymentIndex) {
  await authReadyPromise;
  const uid = auth.currentUser?.uid || null;
  const ref = doc(db, "accountsReceivableBills", billId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("找不到帳單");
  const bill = { id: snap.id, ...snap.data() };
  const payments = Array.isArray(bill.payments) ? [...bill.payments] : [];
  const index = Number(paymentIndex);
  if (!Number.isInteger(index) || index < 0 || index >= payments.length) {
    throw new Error("找不到收款紀錄");
  }

  payments.splice(index, 1);
  const paidAmount = payments.reduce(
    (sum, item) => sum + (Number(item.amount) || 0),
    0,
  );
  const billTotal = _computeBillEffectiveTotal(bill);
  const balanceAmount = Math.max(billTotal - paidAmount, 0);
  const fallbackStatus =
    bill.paymentStatus === "void"
      ? "void"
      : payments.length
        ? bill.paymentStatus
        : bill.invoiceNo || bill.invoiceIssuedAt
          ? "issued"
          : "draft";
  const paymentStatus = _deriveReceivableBillStatus(
    { ...bill, paidAmount, balanceAmount },
    fallbackStatus,
  );

  await updateDoc(ref, {
    payments,
    paidAmount,
    balanceAmount,
    paymentStatus,
    updatedAt: serverTimestamp(),
    updatedByUid: uid,
  });

  for (const orderId of bill.orderIds || []) {
    await _refreshOrderReceivableSummary(orderId);
  }
}

export async function updateReceivableBill(billId, payload = {}) {
  await authReadyPromise;
  const uid = auth.currentUser?.uid || null;
  const current = await getReceivableBill(billId);
  if (!current) throw new Error("找不到帳單");

  const nextInvoiceNo = String(
    payload.invoiceNo ?? current.invoiceNo ?? "",
  ).trim();
  const nextNotes = String(payload.notes ?? current.notes ?? "").trim();
  const nextInvoiceRequired =
    typeof payload.invoiceRequired === "boolean"
      ? payload.invoiceRequired
      : current.invoiceRequired === true;
  const nextPaymentStatus = String(
    payload.paymentStatus || current.paymentStatus || "draft",
  ).trim();
  const nextInvoiceIssuedAt =
    payload.invoiceIssuedAt === null
      ? null
      : _coerceJsDate(
          payload.invoiceIssuedAt || current.invoiceIssuedAt || null,
        );
  const billTotal = _computeBillEffectiveTotal(current);
  const paidAmount = Number(current.paidAmount) || 0;
  const balanceAmount = Math.max(billTotal - paidAmount, 0);
  const paymentStatus = _deriveReceivableBillStatus(
    { ...current, paidAmount, balanceAmount },
    payload.paymentStatus || current.paymentStatus || "draft",
  );

  await updateDoc(doc(db, "accountsReceivableBills", billId), {
    invoiceNo: nextInvoiceNo,
    notes: nextNotes,
    invoiceRequired: nextInvoiceRequired,
    invoiceIssuedAt: nextInvoiceIssuedAt,
    paymentStatus,
    balanceAmount,
    updatedAt: serverTimestamp(),
    updatedByUid: uid,
  });

  for (const orderId of current.orderIds || []) {
    await _refreshOrderReceivableSummary(orderId);
  }
}

export async function addReceivableBillAdjustment(
  billId,
  adjustmentInput = {},
) {
  await authReadyPromise;
  const uid = auth.currentUser?.uid || null;
  const current = await getReceivableBill(billId);
  if (!current) throw new Error("找不到帳單");

  const amount = Number(adjustmentInput.amount) || 0;
  if (!amount) throw new Error("調整金額不可為 0");

  const adjustments = [
    ...(Array.isArray(current.adjustments) ? current.adjustments : []),
    {
      type: String(adjustmentInput.type || "manualAdd").trim() || "manualAdd",
      amount,
      note: String(adjustmentInput.note || "").trim(),
      at: _coerceJsDate(adjustmentInput.at) || new Date(),
      byUid: uid,
    },
  ];
  const adjustedAmountTotal = Math.max(
    (Number(current.amountTotal) || 0) + _computeAdjustmentDelta(adjustments),
    0,
  );
  const paidAmount = Number(current.paidAmount) || 0;
  const balanceAmount = Math.max(adjustedAmountTotal - paidAmount, 0);
  const paymentStatus = _deriveReceivableBillStatus(
    { ...current, paidAmount, balanceAmount },
    current.paymentStatus || "draft",
  );

  await updateDoc(doc(db, "accountsReceivableBills", billId), {
    adjustments,
    adjustedAmountTotal,
    balanceAmount,
    paymentStatus,
    updatedAt: serverTimestamp(),
    updatedByUid: uid,
  });

  for (const orderId of current.orderIds || []) {
    await _refreshOrderReceivableSummary(orderId);
  }
}

// ─── legacy Orders 直接列表 (給 OrdersView 合併顯示用) ──────────────────────
// 從 Orders collection 讀出,映射成 salesOrders-like 的最小欄位
// 不寫入 Firestore,純前端轉換;避免之前用 trigger 鏡像產生的 createdAt 污染
function _ordersPickFirst(src, keys) {
  for (const k of keys) {
    const v = src?.[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") return v;
  }
  return "";
}
function _ordersNormalizeYmd(input) {
  if (!input) return null;
  if (input?.toDate) {
    try {
      const dd = input.toDate();
      const y = dd.getFullYear();
      const m = String(dd.getMonth() + 1).padStart(2, "0");
      const da = String(dd.getDate()).padStart(2, "0");
      return `${y}-${m}-${da}`;
    } catch (_) {
      /* ignore */
    }
  }
  if (input instanceof Date) {
    const y = input.getFullYear();
    const m = String(input.getMonth() + 1).padStart(2, "0");
    const da = String(input.getDate()).padStart(2, "0");
    return `${y}-${m}-${da}`;
  }
  const s = String(input).trim();
  if (!s) return null;
  if (/^\d{8}$/.test(s))
    return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = s.match(/^(\d{2,3})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) {
    const y = parseInt(m[1], 10) + 1911;
    return `${y}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  }
  return null;
}
function _ordersMapStatus(raw, promisedAt) {
  const s = String(raw || "").trim();
  if (!s) return promisedAt ? "confirmed" : "draft";
  if (/完工|已完|完成|done|installed|completed/i.test(s)) return "done";
  if (/取消|作廢|cancel/i.test(s)) return "cancelled";
  if (/派工|派車|安裝中|生產|inProduction/i.test(s)) return "inProduction";
  if (/確認|已下單|confirmed/i.test(s)) return "confirmed";
  if (/草稿|draft/i.test(s)) return "draft";
  if (/回簽|pendingSign/i.test(s)) return "pendingSign";
  if (/delivered|交付/i.test(s)) return "delivered";
  return promisedAt ? "confirmed" : "draft";
}
function _ordersMapDoc(id, d) {
  const customerName = String(
    _ordersPickFirst(d, ["customerName", "客戶名稱", "客戶"]) || "",
  ).trim();
  const orderNo = String(
    _ordersPickFirst(d, ["orderNumber", "訂單號碼", "訂單編號", "orderNo"]) ||
      "",
  ).trim();
  const siteAddress = String(
    _ordersPickFirst(d, [
      "installAddress",
      "安裝地點",
      "安裝地址",
      "地址",
      "siteAddress",
    ]) || "",
  ).trim();
  const orderedAtRaw = _ordersPickFirst(d, [
    "orderedAt",
    "下單日",
    "下單日期",
    "建單日",
    "建立日期",
    "建立時間",
    "createdAt",
    "createdTime",
  ]);
  const orderedAt = _ordersNormalizeYmd(orderedAtRaw);
  const promisedAtRaw = _ordersPickFirst(d, [
    "installDate",
    "安裝日",
    "預定安裝日",
    "promisedAt",
    "預定日",
  ]);
  const promisedAt = _ordersNormalizeYmd(promisedAtRaw);
  const rawStatus = String(
    _ordersPickFirst(d, ["status", "狀態", "施工狀態"]) || "",
  ).trim();
  const status = _ordersMapStatus(rawStatus, promisedAt);
  const color = String(
    _ordersPickFirst(d, ["顏色", "color", "stoneColor"]) || "",
  ).trim();
  const totalCmRaw = _ordersPickFirst(d, ["公分數", "totalCm"]);
  const totalCm = Number(totalCmRaw) || 0;
  const totalRaw = _ordersPickFirst(d, ["銷售額", "total", "金額"]);
  const total = Number(totalRaw) || 0;
  return {
    id,
    _source: "Orders",
    orderNo: orderNo || null,
    customerName,
    siteAddress,
    orderedAt: orderedAt || null,
    promisedAt: promisedAt || null,
    status,
    rawStatus: rawStatus || null,
    stones: color ? [{ brand: "", color }] : [],
    countertop: totalCm ? { totalCm } : null,
    total,
    category:
      String(_ordersPickFirst(d, ["category", "類別", "工程類別"]) || "") ||
      null,
    templatingStaff:
      String(
        _ordersPickFirst(d, ["templatingStaff", "打板", "打板人員"]) || "",
      ) || null,
    drawingStaff:
      String(_ordersPickFirst(d, ["drawingStaff", "對圖", "繪圖人員"]) || "") ||
      null,
    isTestData: !!d?.isTestData,
  };
}

// 列出 legacy Orders;預設依 安裝日 倒序 (失敗 fallback 純取最近 N 筆不排序)
export async function listOrders({ limit: lim = 500 } = {}) {
  await authReadyPromise;
  const ref = collection(db, "Orders");
  let snap;
  try {
    snap = await getDocs(query(ref, orderBy("安裝日", "desc"), limit(lim)));
  } catch (e) {
    // 沒索引 / 欄位不存在 → 退而求其次直接取 limit 筆
    snap = await getDocs(query(ref, limit(lim)));
  }
  return snap.docs.map((d) => _ordersMapDoc(d.id, d.data() || {}));
}

// 刪除所有標記為測試資料的訂單
export async function deleteTestOrders() {
  await authReadyPromise;
  const q = query(
    collection(db, "salesOrders"),
    where("isTestData", "==", true),
  );
  const snap = await getDocs(q);
  const ids = snap.docs.map((d) => d.id);
  const CHUNK = 499;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const batch = writeBatch(db);
    ids
      .slice(i, i + CHUNK)
      .forEach((id) => batch.delete(doc(db, "salesOrders", id)));
    await batch.commit();
  }
  return ids.length;
}

export async function resetAllOrderStatusToDraft() {
  await authReadyPromise;
  const uid = auth.currentUser?.uid || null;
  const snap = await getDocs(collection(db, "salesOrders"));
  const ids = snap.docs.map((d) => d.id);
  const CHUNK = 499;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const batch = writeBatch(db);
    ids.slice(i, i + CHUNK).forEach((id) =>
      batch.update(doc(db, "salesOrders", id), {
        status: "draft",
        updatedByUid: uid,
      }),
    );
    await batch.commit();
  }
  return ids.length;
}

export async function createSalesOrder(data) {
  const uid = auth.currentUser?.uid || null;
  const payload = {
    status: "draft",
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdByUid: uid,
    updatedByUid: uid,
  };
  const ref = await addDoc(collection(db, "salesOrders"), payload);
  return ref.id;
}

// ─── 維修單 ────────────────────────────────────────────────────────────────
// repairTickets 集合
// source: { id, source: "salesOrders"|"Orders", orderNo, customerName, siteAddress }
// 若 chargeable=true,會另外建立一筆 salesOrder(category=維修),並把 newOrderId 寫回 ticket
export async function createRepairTicket({
  source,
  repairDate,
  reason,
  chargeable,
}) {
  await authReadyPromise;
  const uid = auth.currentUser?.uid || null;
  if (!source?.id) throw new Error("請選擇來源訂單");
  if (!repairDate) throw new Error("請填寫維修日");

  let newOrderId = null;
  if (chargeable) {
    newOrderId = await createSalesOrder({
      category: "維修",
      customerName: source.customerName || "",
      siteAddress: source.siteAddress || "",
      promisedAt: repairDate,
      specialNotes: `維修來源訂單:${source.orderNo || source.id}\n原因:${reason || ""}`,
      repairSourceOrderId: source.id,
      repairSourceOrderNo: source.orderNo || "",
      repairSource: source.source || "salesOrders",
    });
  }

  const ticket = {
    sourceOrderId: source.id,
    sourceOrderNo: source.orderNo || "",
    sourceCustomerName: source.customerName || "",
    sourceSiteAddress: source.siteAddress || "",
    sourceCollection: source.source || "salesOrders",
    repairDate,
    reason: reason || "",
    chargeable: !!chargeable,
    newOrderId,
    status: chargeable ? "convertedToOrder" : "open",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdByUid: uid,
    updatedByUid: uid,
  };
  const ref = await addDoc(collection(db, "repairTickets"), ticket);
  return { ticketId: ref.id, newOrderId };
}

export async function listRepairTickets({ limit: lim = 100 } = {}) {
  await authReadyPromise;
  const snap = await getDocs(
    query(
      collection(db, "repairTickets"),
      orderBy("createdAt", "desc"),
      limit(lim),
    ),
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getRepairTicket(id) {
  await authReadyPromise;
  const snap = await getDoc(doc(db, "repairTickets", id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function updateRepairTicket(id, patch) {
  await authReadyPromise;
  const uid = auth.currentUser?.uid || null;
  await updateDoc(doc(db, "repairTickets", id), {
    ...patch,
    updatedAt: serverTimestamp(),
    updatedByUid: uid,
  });
}

export async function deleteRepairTicket(id) {
  await authReadyPromise;
  await deleteDoc(doc(db, "repairTickets", id));
}

// ─── 派車表單 (dispatchEntries) ───────────────────────────────────────────────
// 每筆 = 某日期一張派車工單。doc id = `${date}_${kind}_${sourceId}`(避免重複)
// kind: "install" (來自 salesOrders) | "repair" (來自 repairTickets)
function _dispatchEntryId(date, kind, sourceId) {
  return `${date}_${kind}_${sourceId}`;
}

/**
 * 依日期載入派車明細
 * 1) 找 salesOrders 中 promisedAt === date 的訂單
 * 2) 找 repairTickets 中 repairDate === date 的維修單
 * 3) 與 dispatchEntries (該日期) 合併
 * 回傳合併後的 rows,前端可直接編輯
 */
export async function loadDispatchByDate(date) {
  await authReadyPromise;
  if (!date) return [];

  // 並行載入
  const [salesSnap, repairSnap, entriesSnap] = await Promise.all([
    getDocs(
      query(collection(db, "salesOrders"), where("promisedAt", "==", date)),
    ),
    getDocs(
      query(collection(db, "repairTickets"), where("repairDate", "==", date)),
    ),
    getDocs(
      query(collection(db, "dispatchEntries"), where("date", "==", date)),
    ),
  ]);

  const entryMap = new Map();
  entriesSnap.docs.forEach((d) =>
    entryMap.set(d.id, { id: d.id, ...d.data() }),
  );

  const rows = [];

  salesSnap.docs.forEach((d) => {
    const o = { id: d.id, ...d.data() };
    const eid = _dispatchEntryId(date, "install", o.id);
    const ent = entryMap.get(eid) || {};
    rows.push({
      entryId: eid,
      date,
      kind: "install",
      sourceCollection: "salesOrders",
      sourceId: o.id,
      sourceOrderNo: o.orderNo || "",
      customerName: o.customerName || "",
      siteAddress: o.siteAddress || "",
      stoneLabel: [o.stones?.[0]?.brand, o.stones?.[0]?.color]
        .filter(Boolean)
        .join(" "),
      reason: ent.reason || "",
      installerUids: ent.installerUids || [],
      installerNames: ent.installerNames || [],
      vehiclePlate: ent.vehiclePlate || "",
      etaTime: ent.etaTime || "",
      completed: !!ent.completed,
      completedAt: ent.completedAt || null,
      notes: ent.notes || "",
      _persisted: !!entryMap.get(eid),
    });
    entryMap.delete(eid);
  });

  repairSnap.docs.forEach((d) => {
    const r = { id: d.id, ...d.data() };
    const eid = _dispatchEntryId(date, "repair", r.id);
    const ent = entryMap.get(eid) || {};
    rows.push({
      entryId: eid,
      date,
      kind: "repair",
      sourceCollection: "repairTickets",
      sourceId: r.id,
      sourceOrderNo: r.sourceOrderNo || "",
      customerName: r.sourceCustomerName || "",
      siteAddress: r.sourceSiteAddress || "",
      stoneLabel: "",
      reason:
        ent.reason !== undefined && ent.reason !== null && ent.reason !== ""
          ? ent.reason
          : r.reason || "",
      installerUids: ent.installerUids || [],
      installerNames: ent.installerNames || [],
      vehiclePlate: ent.vehiclePlate || "",
      etaTime: ent.etaTime || "",
      completed: !!ent.completed,
      completedAt: ent.completedAt || null,
      notes: ent.notes || "",
      _persisted: !!entryMap.get(eid),
    });
    entryMap.delete(eid);
  });

  // 殘留的 entries(來源已被刪/改日期)也呈現,但標 orphan
  entryMap.forEach((e) => {
    rows.push({
      entryId: e.id,
      date,
      kind: e.kind || "install",
      sourceCollection: e.sourceCollection || "",
      sourceId: e.sourceId || "",
      sourceOrderNo: e.sourceOrderNo || "",
      customerName: e.customerName || "",
      siteAddress: e.siteAddress || "",
      stoneLabel: "",
      reason: e.reason || "",
      installerUids: e.installerUids || [],
      installerNames: e.installerNames || [],
      vehiclePlate: e.vehiclePlate || "",
      etaTime: e.etaTime || "",
      completed: !!e.completed,
      completedAt: e.completedAt || null,
      notes: e.notes || "",
      _persisted: true,
      _orphan: true,
    });
  });

  // 排序:未完工 在前,再依 etaTime
  rows.sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    return String(a.etaTime || "").localeCompare(String(b.etaTime || ""));
  });
  return rows;
}

/**
 * 儲存(upsert)單筆派車紀錄
 */
export async function saveDispatchEntry(row) {
  await authReadyPromise;
  if (!row?.entryId) throw new Error("缺少 entryId");
  const uid = auth.currentUser?.uid || null;
  const ref = doc(db, "dispatchEntries", row.entryId);
  const payload = {
    date: row.date,
    kind: row.kind,
    sourceCollection: row.sourceCollection,
    sourceId: row.sourceId,
    sourceOrderNo: row.sourceOrderNo || "",
    customerName: row.customerName || "",
    siteAddress: row.siteAddress || "",
    reason: row.reason || "",
    installerUids: Array.isArray(row.installerUids) ? row.installerUids : [],
    installerNames: Array.isArray(row.installerNames) ? row.installerNames : [],
    vehiclePlate: row.vehiclePlate || "",
    etaTime: row.etaTime || "",
    completed: !!row.completed,
    completedAt: row.completed ? row.completedAt || serverTimestamp() : null,
    notes: row.notes || "",
    updatedAt: serverTimestamp(),
    updatedByUid: uid,
  };
  // 嘗試 update,若不存在則建立(用 setDoc merge)
  await setDoc(
    ref,
    {
      ...payload,
      createdAt: payload.createdAt || serverTimestamp(),
      createdByUid: uid,
    },
    { merge: true },
  );
}

function _formatDispatchOrderInstallDate(date) {
  const raw = String(date || "").trim();
  if (!raw) return "";
  return raw.replace(/-/g, "/");
}

function _dispatchOrderDocId(row) {
  const orderNo = String(row?.sourceOrderNo || "").trim();
  const date = String(row?.date || "").trim();
  if (!orderNo || !date) return "";
  return `${orderNo}_${date}`;
}

/**
 * 手動將派車表 rows 匯入 Orders。
 * 目的是讓員工查詢能立即讀到派車資料；使用與 Apps Script 相同的 doc id 規則。
 */
export async function importDispatchRowsToOrders(rows = []) {
  await authReadyPromise;
  const uid = auth.currentUser?.uid || null;
  if (!uid) throw new Error("請先登入");

  const validRows = (rows || []).filter((row) => {
    if (row?._orphan) return false;
    return !!_dispatchOrderDocId(row);
  });
  if (!validRows.length) return { imported: 0, skipped: rows.length || 0 };
  const call = httpsCallable(functionsInstance, "importDispatchRowsToOrders", {
    timeout: 540000,
  });
  const res = await call({ rows: validRows });
  return (
    res.data || {
      imported: 0,
      skipped: Math.max(0, (rows?.length || 0) - validRows.length),
    }
  );
}

/**
 * 刪除派車紀錄(約不到客人)。同時可選擇清除來源訂單/維修單的日期。
 */
export async function deleteDispatchEntry(entryId, opts = {}) {
  await authReadyPromise;
  const {
    clearSourceDate = false,
    sourceCollection = "",
    sourceId = "",
  } = opts;
  await deleteDoc(doc(db, "dispatchEntries", entryId));
  if (clearSourceDate && sourceCollection && sourceId) {
    if (sourceCollection === "salesOrders") {
      await updateDoc(doc(db, "salesOrders", sourceId), {
        promisedAt: null,
        updatedAt: serverTimestamp(),
      });
    } else if (sourceCollection === "repairTickets") {
      await updateDoc(doc(db, "repairTickets", sourceId), {
        repairDate: "",
        updatedAt: serverTimestamp(),
      });
    }
  }
}

// ─── 繪圖截圖覆層上傳 ────────────────────────────────────────────────────────
// 將 base64 data URL 上傳至 Firebase Storage，回傳永久 download URL。
// 路徑：drawingOverlays/{orderId}/{timestamp}-{random}.{ext}
export async function uploadOverlayImage(orderId, dataUrl) {
  await authReadyPromise;
  if (!orderId) throw new Error("orderId 必填");
  const commaIdx = dataUrl.indexOf(",");
  if (commaIdx === -1) throw new Error("無效的圖片資料");
  const header = dataUrl.slice(0, commaIdx);
  const b64 = dataUrl.slice(commaIdx + 1);
  const mimeMatch = header.match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : "image/png";
  const byteString = atob(b64);
  const bytes = new Uint8Array(byteString.length);
  for (let i = 0; i < byteString.length; i++)
    bytes[i] = byteString.charCodeAt(i);
  const blob = new Blob([bytes], { type: mime });
  const ext = mime.split("/")[1]?.replace("jpeg", "jpg") || "png";
  const path = `drawingOverlays/${orderId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const ref = storageRef(storage, path);
  await uploadBytes(ref, blob, { contentType: mime });
  return getDownloadURL(ref);
}

// ─── 訂單附件（原始圖檔 / 打板照）────────────────────────────────────────────
// category: "designFiles" | "samplePhotos"

export async function uploadOrderAttachment(orderId, category, file) {
  await authReadyPromise;
  if (!orderId || !category || !file) throw new Error("參數錯誤");
  const uid = auth.currentUser?.uid || null;
  const safeName = sanitizeFilename(file.name || "file");
  const storagePath = `orderFiles/${orderId}/${category}/${Date.now()}_${safeName}`;
  const ref = storageRef(storage, storagePath);
  await uploadBytes(ref, file, {
    contentType: file.type || "application/octet-stream",
  });
  const url = await getDownloadURL(ref);
  const docRef = await addDoc(
    collection(db, "salesOrders", orderId, category),
    {
      name: file.name || "file",
      url,
      storagePath,
      uploadedAt: serverTimestamp(),
      uploadedByUid: uid,
    },
  );
  return { id: docRef.id, name: file.name || "file", url, storagePath };
}

export async function listOrderAttachments(orderId, category) {
  if (!orderId || !category) return [];
  await authReadyPromise;
  const q = query(
    collection(db, "salesOrders", orderId, category),
    orderBy("uploadedAt", "desc"),
  );
  const snaps = await getDocs(q);
  return snaps.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function deleteOrderAttachment(
  orderId,
  category,
  fileId,
  storagePath,
) {
  await authReadyPromise;
  if (storagePath) {
    try {
      await deleteObject(storageRef(storage, storagePath));
    } catch (e) {
      console.warn("Storage 刪除失敗", e);
    }
  }
  await deleteDoc(doc(db, "salesOrders", orderId, category, fileId));
}

// 更新銷售訂單
export async function updateSalesOrder(id, data) {
  const uid = auth.currentUser?.uid || null;
  await updateDoc(doc(db, "salesOrders", id), {
    ...data,
    updatedAt: serverTimestamp(),
    updatedByUid: uid,
  });
}

// 批次標記訂單為已發單（status → inProduction，記錄 dispatchedAt）
/**
 * Download confirmed PDF bytes for an order using Firebase Storage SDK.
 * Avoids CORS issues that arise when using plain fetch().
 */
export async function downloadConfirmedPdfBytes(orderId) {
  const ref = storageRef(storage, `orderPDFs/${orderId}/confirmed.pdf`);
  return new Uint8Array(await getBytes(ref));
}

export async function batchMarkDispatched(orderIds) {
  if (!orderIds?.length) return;
  await authReadyPromise;
  const uid = auth.currentUser?.uid || null;
  const CHUNK = 499;
  for (let i = 0; i < orderIds.length; i += CHUNK) {
    const chunk = orderIds.slice(i, i + CHUNK);
    const batch = writeBatch(db);
    for (const id of chunk) {
      batch.update(doc(db, "salesOrders", id), {
        dispatchedAt: serverTimestamp(),
        status: "inProduction",
        updatedAt: serverTimestamp(),
        updatedByUid: uid,
      });
    }
    await batch.commit();
  }
}

// ── 發單作業 ────────────────────────────────────────────────────────────────

// 傳確定單：記錄快照 + 狀態改為 pendingSign
export async function sendConfirmation(orderId, snapshot) {
  const uid = auth.currentUser?.uid || null;
  // 記錄每張圖的 updatedAt（秒），供發單時比對是否有圖在傳確定單後被修改
  const drawSnap = await getDocs(
    collection(db, "salesOrders", orderId, "drawings"),
  );
  const drawingVersions = {};
  drawSnap.docs.forEach((d) => {
    const ts = d.data().updatedAt;
    drawingVersions[d.id] = ts ? (ts.seconds ?? 0) : 0;
  });
  await updateDoc(doc(db, "salesOrders", orderId), {
    pendingSignSnapshot: snapshot,
    pendingSignDrawingVersions: drawingVersions,
    pendingSignAt: serverTimestamp(),
    status: "pendingSign",
    updatedAt: serverTimestamp(),
    updatedByUid: uid,
  });
}

// 上傳已簽回確定單掃描檔
export async function uploadSignedScan(orderId, file) {
  await authReadyPromise;
  const ext = (file.name || "").split(".").pop() || "pdf";
  const path = `signedScans/${orderId}/${Date.now()}.${ext}`;
  const ref = storageRef(storage, path);
  await uploadBytes(ref, file, { contentType: file.type || "application/pdf" });
  return { url: await getDownloadURL(ref), storagePath: path };
}

export async function appendSignedScanToOrder(orderId, file) {
  await authReadyPromise;
  const uid = auth.currentUser?.uid || null;
  const uploadedAt = new Date();
  const { url, storagePath } = await uploadSignedScan(orderId, file);
  const orderRef = doc(db, "salesOrders", orderId);

  const nextEntry = {
    url,
    storagePath,
    name: String(file?.name || "").trim(),
    contentType: String(file?.type || "").trim(),
    uploadedAt,
    uploadedByUid: uid,
  };

  await runTransaction(db, async (tx) => {
    const orderSnap = await tx.get(orderRef);
    if (!orderSnap.exists()) {
      throw new Error("找不到訂單");
    }
    const existingOrder = orderSnap.data() || {};
    const existingSignedScans = Array.isArray(existingOrder.signedScans)
      ? existingOrder.signedScans.filter(Boolean)
      : [];

    tx.update(orderRef, {
      signedScanUrl: url,
      signedScans: [...existingSignedScans, nextEntry],
      customerSignedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      updatedByUid: uid,
    });
  });

  return nextEntry;
}

// 封存確定單 PDF（發單後自動呼叫）
export async function uploadConfirmedPdf(orderId, blob) {
  await authReadyPromise;
  const path = `orderPDFs/${orderId}/confirmed.pdf`;
  const ref = storageRef(storage, path);
  await uploadBytes(ref, blob, { contentType: "application/pdf" });
  const url = await getDownloadURL(ref);
  await updateDoc(doc(db, "salesOrders", orderId), {
    confirmedPdfUrl: url,
    updatedByUid: auth.currentUser?.uid ?? null,
  });
  return url;
}

// Re-fetch a fresh download URL (with token) for an already-uploaded confirmed PDF.
// Useful when the URL stored in Firestore is missing the &token= parameter.
export async function refreshConfirmedPdfDownloadUrl(orderId) {
  await authReadyPromise;
  const path = `orderPDFs/${orderId}/confirmed.pdf`;
  const ref = storageRef(storage, path);
  const url = await getDownloadURL(ref);
  try {
    await updateDoc(doc(db, "salesOrders", orderId), {
      confirmedPdfUrl: url,
      updatedByUid: auth.currentUser?.uid ?? null,
    });
  } catch (e) {
    console.warn(
      "refreshConfirmedPdfDownloadUrl: could not save to Firestore",
      e,
    );
  }
  return url;
}

// 確認發單：atomic 產生訂單號 + 寫入最終資料 + status = confirmed
// orderNo: 手動指定時直接用；autoIncrement=true 時從 SystemSettings/orderCounter 取下一號
export async function getOrderCounter() {
  const snap = await getDoc(doc(db, "SystemSettings", "orderCounter"));
  return snap.exists() ? Number(snap.data().seq) || 0 : 0;
}

export async function saveOrderCounter(seq) {
  await setDoc(
    doc(db, "SystemSettings", "orderCounter"),
    { seq: Number(seq) },
    { merge: true },
  );
}

export async function issueOrder(
  orderId,
  updatedData,
  signedScanUrl,
  orderNo,
  autoIncrement = true,
) {
  await authReadyPromise;
  const uid = auth.currentUser?.uid || null;
  let finalOrderNo = orderNo || "";
  const counterRef = doc(db, "SystemSettings", "orderCounter");

  await runTransaction(db, async (tx) => {
    const orderRef = doc(db, "salesOrders", orderId);
    const orderSnap = await tx.get(orderRef);
    if (autoIncrement) {
      const snap = await tx.get(counterRef);
      const seq = (snap.exists() ? Number(snap.data().seq) : 0) + 1;
      const rawCode = String(updatedData.customerId || "").trim();
      const alpha3 = (rawCode.match(/[A-Za-z]+/) || [""])[0]
        .slice(0, 3)
        .toUpperCase();
      finalOrderNo = `${String(seq).padStart(3, "0")}${alpha3}`;
      tx.set(counterRef, { seq }, { merge: true });
    }

    const existingOrder = orderSnap.exists() ? orderSnap.data() || {} : {};
    const existingSignedScans = Array.isArray(existingOrder.signedScans)
      ? existingOrder.signedScans.filter(Boolean)
      : [];
    const nextSignedScans = signedScanUrl
      ? [
          ...existingSignedScans,
          {
            url: signedScanUrl,
            uploadedAt: new Date(),
            uploadedByUid: uid,
          },
        ]
      : existingSignedScans;

    tx.update(orderRef, {
      ...updatedData,
      orderNo: finalOrderNo,
      status: "confirmed",
      customerSignedAt: serverTimestamp(),
      signedScanUrl: signedScanUrl || null,
      signedScans: nextSignedScans,
      updatedAt: serverTimestamp(),
      updatedByUid: uid,
    });
  });
  return finalOrderNo;
}

export async function updateIssuedOrderNo(orderId, nextOrderNo) {
  await authReadyPromise;
  const uid = auth.currentUser?.uid || null;
  const cleanOrderId = String(orderId || "").trim();
  const cleanNextOrderNo = String(nextOrderNo || "")
    .trim()
    .toUpperCase();
  if (!cleanOrderId) throw new Error("缺少訂單 ID");
  if (!cleanNextOrderNo) throw new Error("請輸入訂單號碼");

  const orderRef = doc(db, "salesOrders", cleanOrderId);
  const orderSnap = await getDoc(orderRef);
  if (!orderSnap.exists()) throw new Error("找不到訂單");

  const orderData = orderSnap.data() || {};
  const currentOrderNo = String(orderData.orderNo || "").trim();
  if (!currentOrderNo) throw new Error("此訂單尚未發單，沒有可修改的訂單號碼");
  if (currentOrderNo === cleanNextOrderNo) {
    return { orderNo: cleanNextOrderNo, updated: 0 };
  }

  const dupSnap = await getDocs(
    query(
      collection(db, "salesOrders"),
      where("orderNo", "==", cleanNextOrderNo),
    ),
  );
  const duplicated = dupSnap.docs.some((d) => d.id !== cleanOrderId);
  if (duplicated) {
    throw new Error(`訂單號碼 ${cleanNextOrderNo} 已存在`);
  }

  const legacyRefs = await _findLegacyOrderRefsByOrderNo(currentOrderNo);
  const [productionSnap, repairTicketSnap, repairOrderSnap, dispatchSnap] =
    await Promise.all([
      getDocs(
        query(
          collection(db, "productionJobs"),
          where("orderId", "==", cleanOrderId),
        ),
      ),
      getDocs(
        query(
          collection(db, "repairTickets"),
          where("sourceOrderId", "==", cleanOrderId),
        ),
      ),
      getDocs(
        query(
          collection(db, "salesOrders"),
          where("repairSourceOrderId", "==", cleanOrderId),
        ),
      ),
      getDocs(
        query(
          collection(db, "dispatchEntries"),
          where("sourceId", "==", cleanOrderId),
        ),
      ),
    ]);

  const targets = [
    {
      ref: orderRef,
      data: {
        orderNo: cleanNextOrderNo,
        updatedAt: serverTimestamp(),
        updatedByUid: uid,
      },
    },
  ];

  productionSnap.docs.forEach((d) => {
    targets.push({
      ref: d.ref,
      data: {
        orderNo: cleanNextOrderNo,
        updatedAt: serverTimestamp(),
        updatedByUid: uid,
      },
    });
  });

  repairTicketSnap.docs.forEach((d) => {
    targets.push({
      ref: d.ref,
      data: {
        sourceOrderNo: cleanNextOrderNo,
        updatedAt: serverTimestamp(),
        updatedByUid: uid,
      },
    });
  });

  repairOrderSnap.docs.forEach((d) => {
    targets.push({
      ref: d.ref,
      data: {
        repairSourceOrderNo: cleanNextOrderNo,
        updatedAt: serverTimestamp(),
        updatedByUid: uid,
      },
    });
  });

  dispatchSnap.docs
    .filter((d) => d.data()?.sourceCollection === "salesOrders")
    .forEach((d) => {
      targets.push({
        ref: d.ref,
        data: {
          sourceOrderNo: cleanNextOrderNo,
          updatedAt: serverTimestamp(),
          updatedByUid: uid,
        },
      });
    });

  legacyRefs.forEach((ref) => {
    targets.push({
      ref,
      data: {
        orderNo: cleanNextOrderNo,
        orderNumber: cleanNextOrderNo,
        訂單號碼: cleanNextOrderNo,
      },
    });
  });

  const CHUNK = 450;
  for (let i = 0; i < targets.length; i += CHUNK) {
    const batch = writeBatch(db);
    targets.slice(i, i + CHUNK).forEach((item) => {
      batch.set(item.ref, item.data, { merge: true });
    });
    await batch.commit();
  }

  return {
    orderNo: cleanNextOrderNo,
    updated: targets.length,
    previousOrderNo: currentOrderNo,
  };
}

// onProgress(done, total) 可選的進度回呼
export async function batchImportSalesOrders(records, onProgress) {
  const uid = auth.currentUser?.uid || null;
  const importRows = Array.isArray(records) ? records : [];
  const normalizeOrderNo = (value) =>
    String(value || "")
      .trim()
      .toUpperCase();

  const uniqueRows = [];
  const seenImportOrderNos = new Set();
  let skippedWithinImport = 0;

  for (const rawRecord of importRows) {
    const normalizedOrderNo = normalizeOrderNo(
      rawRecord?.orderNo || rawRecord?.customerOrderNo,
    );

    if (normalizedOrderNo) {
      if (seenImportOrderNos.has(normalizedOrderNo)) {
        skippedWithinImport += 1;
        continue;
      }
      seenImportOrderNos.add(normalizedOrderNo);
    }

    uniqueRows.push({
      ...rawRecord,
      orderNo: normalizedOrderNo || String(rawRecord?.orderNo || "").trim(),
      customerOrderNo:
        normalizedOrderNo || String(rawRecord?.customerOrderNo || "").trim(),
    });
  }

  const existingOrderNos = new Set();
  const lookupOrderNos = Array.from(seenImportOrderNos);
  const LOOKUP_CHUNK = 30;

  for (let i = 0; i < lookupOrderNos.length; i += LOOKUP_CHUNK) {
    const orderNoChunk = lookupOrderNos.slice(i, i + LOOKUP_CHUNK);
    if (!orderNoChunk.length) continue;
    const snap = await getDocs(
      query(
        collection(db, "salesOrders"),
        where("orderNo", "in", orderNoChunk),
      ),
    );
    snap.docs.forEach((docSnap) => {
      existingOrderNos.add(normalizeOrderNo(docSnap.data()?.orderNo));
    });
  }

  const rowsToImport = [];
  let skippedExisting = 0;
  for (const record of uniqueRows) {
    const normalizedOrderNo = normalizeOrderNo(
      record?.orderNo || record?.customerOrderNo,
    );
    if (normalizedOrderNo && existingOrderNos.has(normalizedOrderNo)) {
      skippedExisting += 1;
      continue;
    }
    rowsToImport.push(record);
  }

  const CHUNK = 499;
  let done = 0;
  for (let i = 0; i < rowsToImport.length; i += CHUNK) {
    const chunk = rowsToImport.slice(i, i + CHUNK);
    const batch = writeBatch(db);
    for (const rec of chunk) {
      const ref = doc(collection(db, "salesOrders"));
      batch.set(ref, {
        status: "draft",
        dispatchedAt: null,
        ...rec,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdByUid: uid,
        updatedByUid: uid,
        importedFromExcel: true,
      });
    }
    await batch.commit();
    done += chunk.length;
    onProgress?.(done, rowsToImport.length);
  }
  return {
    created: done,
    skippedExisting,
    skippedWithinImport,
    requested: importRows.length,
  };
}

// ── 訂單繪圖子集合（salesOrders/:id/drawings）─────────────────────────────

export async function listOrderDrawings(orderId) {
  const col = collection(db, "salesOrders", orderId, "drawings");
  const snap = await getDocs(query(col, orderBy("seq", "asc")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function createOrderDrawing(orderId, type) {
  const uid = auth.currentUser?.uid || null;
  const col = collection(db, "salesOrders", orderId, "drawings");
  // 算目前最大 seq
  const existing = await getDocs(col);
  const maxSeq = existing.docs.reduce(
    (m, d) => Math.max(m, d.data().seq ?? 0),
    0,
  );
  const ref = await addDoc(col, {
    type,
    seq: maxSeq + 1,
    state: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdByUid: uid,
  });
  return ref.id;
}

export async function updateOrderDrawing(orderId, drawingId, stateObj) {
  const uid = auth.currentUser?.uid || null;
  const ref = doc(db, "salesOrders", orderId, "drawings", drawingId);
  await updateDoc(ref, {
    state: stateObj,
    updatedAt: serverTimestamp(),
    updatedByUid: uid,
  });
}

export async function deleteOrderDrawing(orderId, drawingId) {
  await deleteDoc(doc(db, "salesOrders", orderId, "drawings", drawingId));
}

export async function getOrderConfirmation(orderId) {
  const snap = await getDoc(
    doc(db, "salesOrders", orderId, "confirmationDoc", "layout"),
  );
  return snap.exists() ? snap.data() : null;
}

export async function saveOrderConfirmation(orderId, layout) {
  const uid = auth.currentUser?.uid || null;
  await setDoc(doc(db, "salesOrders", orderId, "confirmationDoc", "layout"), {
    ...layout,
    updatedAt: serverTimestamp(),
    updatedByUid: uid,
  });
}

// 品牌 -> 材質對應表（存在 SystemSettings/brandMaterials）
// 結構：{ map: { "品牌名": "quartz"|"porcelain"|"granite"|"other" } }
export async function getBrandMaterials() {
  const snap = await getDoc(doc(db, "SystemSettings", "brandMaterials"));
  if (!snap.exists()) return {};
  const data = snap.data() || {};
  return data.map && typeof data.map === "object" ? data.map : {};
}

export async function saveBrandMaterials(map = {}) {
  const uid = auth.currentUser?.uid || null;
  const clean = {};
  Object.keys(map).forEach((k) => {
    const brand = String(k || "").trim();
    const val = String(map[k] || "").trim();
    if (brand && val) clean[brand] = val;
  });
  await setDoc(
    doc(db, "SystemSettings", "brandMaterials"),
    {
      map: clean,
      updatedAt: serverTimestamp(),
      updatedByUid: uid,
    },
    { merge: true },
  );
}

// 訂單下拉清單選項（類別/台面型別/特殊作法/水槽工法/爐子工法）
// 結構：{ categories: [], countertopTypes: [], specialMethods: [], sinkMethods: [], stoveMethods: [] }
export async function getOrderOptions() {
  const snap = await getDoc(doc(db, "SystemSettings", "orderOptions"));
  if (!snap.exists()) return {};
  const d = snap.data() || {};
  const pickArr = (a) =>
    Array.isArray(a) ? a.filter((x) => typeof x === "string") : [];
  return {
    categories: pickArr(d.categories),
    countertopTypes: pickArr(d.countertopTypes),
    specialMethods: pickArr(d.specialMethods),
    sinkMethods: pickArr(d.sinkMethods),
    stoveMethods: pickArr(d.stoveMethods),
  };
}

export async function saveOrderOptions(options = {}) {
  const uid = auth.currentUser?.uid || null;
  const clean = (a) =>
    Array.isArray(a)
      ? a.map((s) => String(s || "").trim()).filter(Boolean)
      : [];
  await setDoc(
    doc(db, "SystemSettings", "orderOptions"),
    {
      categories: clean(options.categories),
      countertopTypes: clean(options.countertopTypes),
      specialMethods: clean(options.specialMethods),
      sinkMethods: clean(options.sinkMethods),
      stoveMethods: clean(options.stoveMethods),
      updatedAt: serverTimestamp(),
      updatedByUid: uid,
    },
    { merge: true },
  );
}

// ????????????????????????????????????????????????????????????????????
// ??摨?(Stamps)
// stamps/{id}: { name, type, imageUrl, authorUid, authorName,
//               shared, textConfig, createdAt }
// ????????????????????????????????????????????????????????????????????

export async function listStamps() {
  await authReadyPromise;
  const uid = auth.currentUser?.uid;
  if (!uid) return [];
  const col = collection(db, "stamps");
  const [sharedSnap, mySnap] = await Promise.all([
    getDocs(
      query(col, where("shared", "==", true), orderBy("createdAt", "desc")),
    ),
    getDocs(
      query(col, where("authorUid", "==", uid), orderBy("createdAt", "desc")),
    ),
  ]);
  const map = new Map();
  for (const d of mySnap.docs) map.set(d.id, { id: d.id, ...d.data() });
  for (const d of sharedSnap.docs)
    if (!map.has(d.id)) map.set(d.id, { id: d.id, ...d.data() });
  return Array.from(map.values());
}

export async function createStamp(
  { name, shared, textConfig = null },
  imageBlob,
) {
  const user = await getSignedInUser();
  const col = collection(db, "stamps");
  const docRef = await addDoc(col, {
    name: String(name || "").trim() || "未命名",
    type: textConfig ? "text" : "image",
    imageUrl: "",
    authorUid: user.uid,
    authorName: user.displayName || user.email || "",
    shared: shared === true,
    textConfig: textConfig || null,
    createdAt: serverTimestamp(),
  });
  const sRef = storageRef(storage, `stamps/${docRef.id}/image.png`);
  await uploadBytes(sRef, imageBlob, { contentType: "image/png" });
  const url = await getDownloadURL(sRef);
  await updateDoc(docRef, { imageUrl: url });
  return { id: docRef.id, imageUrl: url };
}

export async function toggleStampShared(stampId, shared) {
  const user = await getSignedInUser();
  const ref = doc(db, "stamps", stampId);
  const snap = await getDoc(ref);
  if (!snap.exists() || snap.data().authorUid !== user.uid)
    throw new Error("無權限");
  await updateDoc(ref, { shared });
}

export async function deleteStamp(stampId) {
  const user = await getSignedInUser();
  const ref = doc(db, "stamps", stampId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  if (snap.data().authorUid !== user.uid) throw new Error("無權限刪除此圖章");
  try {
    await deleteObject(storageRef(storage, `stamps/${stampId}/image.png`));
  } catch (e) {
    /* ignore */
  }
  await deleteDoc(ref);
}

export async function saveStampToLibrary(stampId) {
  const user = await getSignedInUser();
  const ref = doc(db, "Users", user.uid);
  const snap = await getDoc(ref);
  const existing = snap.data()?.savedStampIds || [];
  if (existing.includes(stampId)) return;
  await updateDoc(ref, { savedStampIds: [...existing, stampId] });
}

export async function removeStampFromLibrary(stampId) {
  const user = await getSignedInUser();
  const ref = doc(db, "Users", user.uid);
  const snap = await getDoc(ref);
  const existing = snap.data()?.savedStampIds || [];
  await updateDoc(ref, {
    savedStampIds: existing.filter((id) => id !== stampId),
  });
}

export async function getMySavedStampIds() {
  await authReadyPromise;
  const uid = auth.currentUser?.uid;
  if (!uid) return [];
  const snap = await getDoc(doc(db, "Users", uid));
  return snap.data()?.savedStampIds || [];
}

// ============================================================================
// productionJobs — 生產流程管理
// 工序順序: cut(裁切) → waterjet(水刀) → template(套板) → qc(驗收) → done
// ============================================================================

export const PRODUCTION_STAGES = [
  { key: "cut", label: "裁切", next: "waterjet" },
  { key: "waterjet", label: "水刀", next: "template" },
  { key: "template", label: "套板", next: "qc" },
  { key: "qc", label: "驗收", next: "done" },
];

function _primaryMaterial(stones) {
  if (!stones?.length) return "other";
  const counts = {};
  for (const s of stones) {
    const t = s.materialType || "other";
    counts[t] = (counts[t] || 0) + 1;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}

// 建立或更新生產工單（發單時自動呼叫；orderId 重複時會同步更新顯示資料）
export async function createProductionJob(orderId, orderData) {
  await authReadyPromise;
  const uid = auth.currentUser?.uid || null;

  const stones = (orderData.stones || []).map((s) => ({
    brand: s.brand || "",
    color: s.color || "",
    materialType: s.materialType || "other",
  }));

  // 金額：優先取 grandTotal（含稅）→ subtotal（未稅小計）→ total（舊欄位手動輸入）
  const totalVal =
    orderData.grandTotal ?? orderData.subtotal ?? orderData.total ?? null;

  // 既有工單 → 同步更新基本顯示欄位
  const existing = await getDocs(
    query(collection(db, "productionJobs"), where("orderId", "==", orderId)),
  );
  if (!existing.empty) {
    await updateDoc(doc(db, "productionJobs", existing.docs[0].id), {
      orderNo: orderData.orderNo || "",
      customerName: orderData.customerName || "",
      siteAddress: orderData.siteAddress || "",
      stones,
      countertop: orderData.countertop || {},
      promisedAt: orderData.promisedAt || null,
      total: totalVal,
      primaryMaterial: _primaryMaterial(stones),
      updatedAt: serverTimestamp(),
      updatedByUid: uid,
    });
    return existing.docs[0].id;
  }

  const payload = {
    orderId,
    orderNo: orderData.orderNo || "",
    customerName: orderData.customerName || "",
    siteAddress: orderData.siteAddress || "",
    stones,
    countertop: orderData.countertop || {},
    promisedAt: orderData.promisedAt || null,
    total: totalVal,
    primaryMaterial: _primaryMaterial(stones),
    currentStage: "cut",
    stages: {
      cut: { status: "pending" },
      waterjet: { status: "pending" },
      template: { status: "pending" },
      qc: { status: "pending" },
    },
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdByUid: uid,
  };

  const ref = await addDoc(collection(db, "productionJobs"), payload);
  return ref.id;
}

// 取得全部生產工單（依 promisedAt 升冪，client 端再過濾）
export async function listProductionJobs() {
  await authReadyPromise;
  const snap = await getDocs(collection(db, "productionJobs"));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// 回填：為所有 confirmed / inProduction 訂單 upsert productionJob
// （既有工單也會被同步更新，用來補上金額/客戶/石材等欄位）
export async function backfillProductionJobs(onProgress) {
  await authReadyPromise;

  const statuses = ["confirmed", "inProduction"];
  let orders = [];
  for (const status of statuses) {
    const snap = await getDocs(
      query(collection(db, "salesOrders"), where("status", "==", status)),
    );
    snap.docs.forEach((d) => orders.push({ id: d.id, ...d.data() }));
  }

  let done = 0;
  for (const order of orders) {
    await createProductionJob(order.id, order);
    done++;
    onProgress?.(done, orders.length);
  }
  return { total: orders.length, done };
}

async function _findLegacyOrderRefsByOrderNo(orderNo) {
  const clean = String(orderNo || "").trim();
  if (!clean) return [];

  const refs = new Map();
  const directRef = doc(db, "Orders", clean);
  const directSnap = await getDoc(directRef);
  if (directSnap.exists()) refs.set(directSnap.id, directRef);

  const [orderNoSnap, orderNumberSnap] = await Promise.all([
    getDocs(query(collection(db, "Orders"), where("orderNo", "==", clean))),
    getDocs(query(collection(db, "Orders"), where("訂單號碼", "==", clean))),
  ]);

  for (const snap of [orderNoSnap, orderNumberSnap]) {
    snap.docs.forEach((d) => refs.set(d.id, d.ref));
  }
  return [...refs.values()];
}

function _productionStageMirror(stage) {
  const isDone = stage?.status === "done";
  return {
    time: isDone ? stage.doneAt || null : null,
    by: isDone ? String(stage.doneByName || "").trim() : "",
  };
}

function _legacyOrderProductionUpdates(jobData) {
  const cut = _productionStageMirror(jobData?.stages?.cut);
  const waterjet = _productionStageMirror(jobData?.stages?.waterjet);
  const qc = _productionStageMirror(jobData?.stages?.qc);

  return {
    cutBoardTime: cut.time,
    裁切時間: cut.time,
    裁板時間: cut.time,
    cutBoardBy: cut.by,
    裁切者: cut.by,
    裁板者: cut.by,
    waterjetTime: waterjet.time,
    水刀時間: waterjet.time,
    waterjetBy: waterjet.by,
    水刀者: waterjet.by,
    水刀手: waterjet.by,
    acceptanceTime: qc.time,
    驗收時間: qc.time,
    acceptanceBy: qc.by,
    驗收者: qc.by,
  };
}

async function _syncProductionJobToLegacyOrders(jobInput) {
  await authReadyPromise;
  const payload =
    jobInput && typeof jobInput === "object"
      ? { job: jobInput }
      : { jobId: String(jobInput || "").trim() };
  if (!payload.job && !payload.jobId) return 0;

  const callable = httpsCallable(
    functionsInstance,
    "syncProductionJobToLegacyOrders",
    { timeout: 540000 },
  );
  const res = await callable(payload);
  return Number(res.data?.updated || 0);
}

export async function backfillLegacyOrderProductionFields(onProgress) {
  await authReadyPromise;
  const snap = await getDocs(collection(db, "productionJobs"));
  const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const total = rows.length;
  let done = 0;

  for (const row of rows) {
    await _syncProductionJobToLegacyOrders(row);
    done += 1;
    onProgress?.(done, total);
  }
  return { total, done };
}

// 推進工序（完成目前關卡，currentStage 前進到下一關）
export async function advanceProductionStage(jobId, stageKey, doneByName) {
  await authReadyPromise;
  const uid = auth.currentUser?.uid || null;
  const idx = PRODUCTION_STAGES.findIndex((s) => s.key === stageKey);
  const nextStage =
    idx >= 0 && idx < PRODUCTION_STAGES.length - 1
      ? PRODUCTION_STAGES[idx + 1].key
      : "done";

  const updates = {
    [`stages.${stageKey}.status`]: "done",
    [`stages.${stageKey}.doneAt`]: serverTimestamp(),
    [`stages.${stageKey}.doneByUid`]: uid,
    [`stages.${stageKey}.doneByName`]: doneByName || "",
    currentStage: nextStage,
    updatedAt: serverTimestamp(),
    updatedByUid: uid,
  };
  await updateDoc(doc(db, "productionJobs", jobId), updates);

  // 驗收完成 → 訂單狀態改為 delivered
  if (nextStage === "done") {
    const jobSnap = await getDoc(doc(db, "productionJobs", jobId));
    const orderId = jobSnap.exists() ? jobSnap.data().orderId : null;
    if (orderId) {
      await updateDoc(doc(db, "salesOrders", orderId), {
        status: "delivered",
        updatedAt: serverTimestamp(),
        updatedByUid: uid,
      });
    }
  }

  await _syncProductionJobToLegacyOrders(jobId);
}

// 驗收退回指定工序
export async function rejectProductionQc(jobId, targetStage, notes) {
  await authReadyPromise;
  const uid = auth.currentUser?.uid || null;
  const stageKeys = PRODUCTION_STAGES.map((s) => s.key);
  const targetIdx = stageKeys.indexOf(targetStage);

  const updates = {
    currentStage: targetStage,
    "stages.qc.status": "rejected",
    "stages.qc.notes": notes || "",
    "stages.qc.rejectedAt": serverTimestamp(),
    "stages.qc.rejectedByUid": uid,
    updatedAt: serverTimestamp(),
    updatedByUid: uid,
  };
  // 清空目標關卡（含）到 qc 之前的 done 狀態
  for (let i = targetIdx; i < stageKeys.length - 1; i++) {
    updates[`stages.${stageKeys[i]}.status`] = "pending";
    updates[`stages.${stageKeys[i]}.doneAt`] = null;
    updates[`stages.${stageKeys[i]}.doneByUid`] = null;
    updates[`stages.${stageKeys[i]}.doneByName`] = null;
  }
  await updateDoc(doc(db, "productionJobs", jobId), updates);
  await _syncProductionJobToLegacyOrders(jobId);
}

// 通用退回／重設：從任何狀態（含 done）退回指定關卡
export async function resetProductionJob(jobId, toStage, notes) {
  await authReadyPromise;
  const uid = auth.currentUser?.uid || null;
  const stageKeys = PRODUCTION_STAGES.map((s) => s.key);
  const targetIdx = stageKeys.indexOf(toStage);
  if (targetIdx < 0) throw new Error("無效的工序：" + toStage);

  const updates = {
    currentStage: toStage,
    updatedAt: serverTimestamp(),
    updatedByUid: uid,
  };
  // 清空目標關卡（含）之後的所有工序狀態
  for (let i = targetIdx; i < stageKeys.length; i++) {
    updates[`stages.${stageKeys[i]}.status`] = "pending";
    updates[`stages.${stageKeys[i]}.doneAt`] = null;
    updates[`stages.${stageKeys[i]}.doneByUid`] = null;
    updates[`stages.${stageKeys[i]}.doneByName`] = null;
    updates[`stages.${stageKeys[i]}.rejectedAt`] = null;
    updates[`stages.${stageKeys[i]}.notes`] = notes || null;
  }
  // 若從 done 退回，同步還原訂單狀態為 inProduction
  const jobSnap = await getDoc(doc(db, "productionJobs", jobId));
  if (jobSnap.exists()) {
    const orderId = jobSnap.data().orderId;
    const prevStage = jobSnap.data().currentStage;
    if (orderId && prevStage === "done") {
      await updateDoc(doc(db, "salesOrders", orderId), {
        status: "inProduction",
        updatedAt: serverTimestamp(),
        updatedByUid: uid,
      });
    }
  }
  await updateDoc(doc(db, "productionJobs", jobId), updates);
  await _syncProductionJobToLegacyOrders(jobId);
}

// ─── 客戶計價記憶 ─────────────────────────────────────────────
export async function getCustomerPricing(customerId) {
  if (!customerId) return null;
  await authReadyPromise;
  const snap = await getDoc(doc(db, "customerPricing", customerId));
  return snap.exists() ? snap.data() : null;
}

// 更新客戶計價記憶
// 各 *Prices 參數為「本次要新增/覆蓋的鍵值對」，會 merge 到既有 map 上
// 不傳的 map 不會動到既有資料
export async function updateCustomerPricing(
  customerId,
  {
    customerName,
    stonePrices,
    sinkPrices,
    stovePrices,
    specialPrices,
    defaultPricePerCm,
    skipOversizeScaling,
  } = {},
) {
  if (!customerId) return;
  await authReadyPromise;
  const ref = doc(db, "customerPricing", customerId);
  const snap = await getDoc(ref);
  const cur = snap.exists() ? snap.data() : {};
  const merged = {
    customerId,
    customerName: customerName || cur.customerName || "",
    stonePrices: { ...(cur.stonePrices || {}), ...(stonePrices || {}) },
    sinkPrices: { ...(cur.sinkPrices || {}), ...(sinkPrices || {}) },
    stovePrices: { ...(cur.stovePrices || {}), ...(stovePrices || {}) },
    specialPrices: { ...(cur.specialPrices || {}), ...(specialPrices || {}) },
    defaultPricePerCm: defaultPricePerCm ?? cur.defaultPricePerCm ?? null,
    skipOversizeScaling:
      skipOversizeScaling === undefined
        ? (cur.skipOversizeScaling ?? false)
        : !!skipOversizeScaling,
    updatedAt: serverTimestamp(),
  };
  await setDoc(ref, merged, { merge: true });
}
