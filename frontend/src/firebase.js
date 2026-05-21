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
} from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import {
  getStorage,
  ref as storageRef,
  uploadBytes,
  uploadBytesResumable,
  getDownloadURL,
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

// allowed roles in the system
export const ROLES = ["admin", "管理者", "員工", "客戶", "遊客"];

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
        let role =
          user.email === ADMIN_EMAIL
            ? "admin"
            : snap.exists()
              ? snap.data().role || "遊客"
              : "遊客";
        // validate against ROLES
        if (!ROLES.includes(role)) {
          role = "遊客";
        }
        const existingName = snap.exists() ? snap.data().displayName : null;
        await setDoc(
          userRef,
          {
            uid: user.uid,
            displayName: existingName || user.displayName || null,
            email: user.email || null,
            photoURL: user.photoURL || null,
            role,
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
  return snaps.docs.map((d) => ({ id: d.id, ...d.data() }));
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
  return snaps.docs.map((d) => ({ id: d.id, ...d.data() }));
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

  const role = String(userDoc?.role || "").trim();
  const isApproved = userDoc?.customerApproved === true;
  const companyId = String(userDoc?.companyId || "").trim();

  if (role !== "客戶") {
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

// Admin helper: update user role
export async function updateUserRole(uid, role) {
  // validate role before writing
  if (!ROLES.includes(role)) {
    throw new Error(`invalid role "${role}"`);
  }
  const userRef = doc(db, "Users", uid);
  await updateDoc(userRef, { role });
}

export async function updateUserDisplayName(uid, displayName) {
  const name = displayName.trim();
  if (!name) throw new Error("姓名不可為空");
  const userRef = doc(db, "Users", uid);
  await updateDoc(userRef, { displayName: name });
}

// fetch single user doc
export async function getUserByUid(uid) {
  const userRef = doc(db, "Users", uid);
  const snap = await getDoc(userRef);
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
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
    };
  }

  const data = snap.data() || {};
  const box = data.priceRedactBox || {};
  const loc = data.punchLocation || {};
  return {
    nasStoragePath: data.nasStoragePath || "",
    nasOrderPath: data.nasOrderPath || "",
    priceRedactBox: {
      xPct: Number.isFinite(Number(box.xPct)) ? Number(box.xPct) : 0.2,
      yPct: Number.isFinite(Number(box.yPct)) ? Number(box.yPct) : 0.04,
      wPct: Number.isFinite(Number(box.wPct)) ? Number(box.wPct) : 0.45,
      hPct: Number.isFinite(Number(box.hPct)) ? Number(box.hPct) : 0.13,
    },
    punchLocation: {
      enabled: loc.enabled === true,
      allowOnFail: loc.allowOnFail !== false,
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
          allowOnFail: pl.allowOnFail !== false,
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
