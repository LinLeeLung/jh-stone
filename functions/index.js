// ====== All requires/imports moved to top ======
const functions = require("firebase-functions");
const { setGlobalOptions } = functions;
const { onRequest } = require("firebase-functions/https");
const logger = require("firebase-functions/logger");
const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const { onCall } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { defineSecret } = require("firebase-functions/params");
const { onRequest: onRequestV2 } = require("firebase-functions/v2/https");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const Busboy = require("busboy");
const admin = require("firebase-admin");
const YahooFinanceClass = require("yahoo-finance2").default;
const yahooFinance = new YahooFinanceClass();
const { GoogleGenAI } = require("@google/genai");
admin.initializeApp();
const SYNO_USERNAME_SECRET = defineSecret("SYNO_USERNAME");
const SYNO_PASSWORD_SECRET = defineSecret("SYNO_PASSWORD");
const PHOTO_URL_SIGNING_SECRET = defineSecret("PHOTO_URL_SIGNING_SECRET");
const NAS_PDF_API_KEY_SECRET = defineSecret("NAS_PDF_API_KEY");

// Must be called BEFORE any function definitions so it applies to all v2 functions
setGlobalOptions({ maxInstances: 10, region: "asia-east1" });

// 查詢 NAS 是否有包含訂單號碼的資料夾
exports.findOrderFolderOnNas = onCall(
  { secrets: [SYNO_USERNAME_SECRET, SYNO_PASSWORD_SECRET] },
  async (payload, ctx) => {
    logger.info("findOrderFolderOnNas called", {
      payload,
      auth: ctx && ctx.auth,
    });
    const auth = (ctx && ctx.auth) || payload.auth || null;
    const authUid = auth && auth.uid ? auth.uid : null;
    if (!authUid) {
      throw new functions.https.HttpsError("unauthenticated", "請先登入");
    }
    const role = await readUserRole(authUid);
    if (!isStaffRole(role)) {
      throw new functions.https.HttpsError(
        "permission-denied",
        "僅管理者或員工可查詢",
      );
    }
    const nasStoragePath = await getNasOrderPath();
    if (!nasStoragePath) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "請先在系統設定填入訂單資料夾路徑（或 NAS 儲存路徑）",
      );
    }
    const baseUrl = buildSynologyBaseUrl();
    const { username, password } = getSynologyCredentials();
    if (!username || !password) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "尚未設定 SYNO_USERNAME / SYNO_PASSWORD",
      );
    }
    const orderNumber = String(
      (payload && payload.data
        ? payload.data.orderNumber
        : payload.orderNumber) || "",
    ).trim();
    if (!orderNumber) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "請提供訂單號碼",
      );
    }
    const pathCheck = validateSynologyDirPath(nasStoragePath);
    if (!pathCheck.ok) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        pathCheck.reason,
      );
    }

    let sid = "";
    try {
      sid = await synologyLogin(baseUrl, username, password);
      // 遞迴搜尋所有子資料夾，並使用評分演算法找出最佳匹配
      const matchResult = await resolveExistingOrderFolderPath({
        baseUrl,
        sid,
        basePath: pathCheck.normalized,
        customerFolder: "unknown",
        orderNumber,
        defaultDetailFolder: orderNumber,
      });
      if (matchResult.matched) {
        return {
          found: true,
          folderName: matchResult.matchedFolderName,
          folderPath: matchResult.uploadFolder,
          matchScore: matchResult.matchScore,
          message: `找到資料夾：${matchResult.matchedFolderName}（${matchResult.uploadFolder}）`,
        };
      } else {
        return {
          found: false,
          message: `未找到包含「${orderNumber}」的資料夾`,
        };
      }
    } catch (err) {
      logger.error("findOrderFolderOnNas error", {
        error: err?.message || String(err),
      });
      throw new functions.https.HttpsError(
        "internal",
        err?.message || "查詢失敗",
      );
    } finally {
      try {
        await synologyLogout(baseUrl, sid);
      } catch (_) {}
    }
  },
);
// For cost control, you can set the maximum number of containers that can be
// running at the same time. This helps mitigate the impact of unexpected
// traffic spikes by instead downgrading performance. This limit is a
// per-function limit. You can override the limit for each function using the
// `maxInstances` option in the function's options, e.g.
// `onRequest({ maxInstances: 5 }, (req, res) => { ... })`.
// NOTE: setGlobalOptions does not apply to functions using the v1 API. V1
// functions should each use functions.runWith({ maxInstances: 10 }) instead.
// In the v1 API, each function can only serve one request per container, so
// this will be the maximum concurrent request count.
// setGlobalOptions is now called at the top of the file (before function definitions)

function unwrapCallablePayload(payload) {
  return payload && payload.data ? payload.data : payload || {};
}

function getCallableAuth(payload, ctx) {
  return (ctx && ctx.auth) || (payload && payload.auth) || null;
}

function getCallableAuthUid(payload, ctx) {
  return String(getCallableAuth(payload, ctx)?.uid || "").trim() || null;
}

function getCallableAuthToken(payload, ctx) {
  return getCallableAuth(payload, ctx)?.token || {};
}

const STAFF_ROLES = new Set(["admin", "管理者", "員工"]);

function isStaffRole(role) {
  return STAFF_ROLES.has(String(role || "").trim());
}

function collectStringValues(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }
  const single = String(value || "").trim();
  return single ? [single] : [];
}

function collectCompanyIdsFromSource(source) {
  if (!source || typeof source !== "object") return [];
  const fields = [
    "companyId",
    "companyIds",
    "customerCompanyId",
    "customerCompanyIds",
    "allowedCompanyIds",
  ];
  const values = fields.flatMap((field) => collectStringValues(source[field]));
  return Array.from(new Set(values));
}

function collectOrderCompanyIds(orderData = {}) {
  if (!orderData || typeof orderData !== "object") return [];
  const fields = [
    "companyId",
    "customerCompanyId",
    "customerTaxId",
    "customerId",
    "客戶統編",
    "統一編號",
    "客戶編號",
  ];
  const values = fields.flatMap((field) =>
    collectStringValues(orderData[field]),
  );
  return Array.from(new Set(values));
}

function hasCompanyIntersection(orderCompanyIds = [], allowedCompanyIds = []) {
  if (!orderCompanyIds.length || !allowedCompanyIds.length) return false;
  const allowedSet = new Set(allowedCompanyIds);
  return orderCompanyIds.some((id) => allowedSet.has(id));
}

async function readUserProfile(uid) {
  if (!uid) {
    return {
      uid: "",
      role: "",
      companyIds: [],
      customerApproved: false,
    };
  }
  const snap = await admin.firestore().collection("Users").doc(uid).get();
  const data = snap.exists ? snap.data() || {} : {};
  return {
    uid,
    role: String(data.role || "").trim(),
    companyIds: collectCompanyIdsFromSource(data),
    customerApproved: data.customerApproved === true,
  };
}

async function getCallableAccessContext(payload, ctx) {
  const uid = getCallableAuthUid(payload, ctx);
  if (!uid) {
    throw new functions.https.HttpsError("unauthenticated", "請先登入");
  }

  const token = getCallableAuthToken(payload, ctx);
  const profile = await readUserProfile(uid);
  const role = String(profile.role || token.role || "").trim();
  const isStaff = isStaffRole(role);
  const companyIds = Array.from(
    new Set([...profile.companyIds, ...collectCompanyIdsFromSource(token)]),
  );
  const customerApproved =
    profile.customerApproved ||
    token.customerApproved === true ||
    token.approvedCustomer === true;

  return {
    uid,
    role,
    isStaff,
    companyIds,
    customerApproved,
  };
}

function assertApprovedCustomerContext(accessCtx) {
  if (accessCtx.role !== "客戶") {
    throw new functions.https.HttpsError(
      "permission-denied",
      "僅客戶可使用此權限",
    );
  }
  if (!accessCtx.customerApproved) {
    throw new functions.https.HttpsError(
      "permission-denied",
      "客戶帳號尚未完成審核",
    );
  }
  if (!accessCtx.companyIds.length) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "客戶帳號尚未綁定 companyId",
    );
  }
}

function filterOrdersByAccess(rows = [], accessCtx) {
  if (accessCtx.isStaff) return rows;
  assertApprovedCustomerContext(accessCtx);
  return rows
    .filter((row) => {
      const orderCompanyIds = collectOrderCompanyIds(row || {});
      return hasCompanyIntersection(orderCompanyIds, accessCtx.companyIds);
    })
    .map((row) => sanitizeOrderForCustomer(row));
}

function sanitizeOrderForCustomer(order = {}) {
  const source = order && typeof order === "object" ? order : {};
  const getFirst = (...keys) => {
    for (const key of keys) {
      const value = source[key];
      if (value !== undefined) return value;
    }
    return undefined;
  };

  // Keep a strict allowlist to avoid leaking internal fields (e.g. 拆料單).
  return {
    id: String(source.id || "").trim(),
    companyId: String(getFirst("companyId", "customerCompanyId") || "").trim(),
    customerName: String(
      getFirst("customerName", "客戶名稱", "客戶") || "",
    ).trim(),
    客戶名稱: String(getFirst("客戶名稱", "客戶", "customerName") || "").trim(),
    orderNumber: String(
      getFirst("orderNumber", "訂單號碼", "訂單編號") || "",
    ).trim(),
    訂單號碼: String(
      getFirst("訂單號碼", "訂單編號", "orderNumber") || "",
    ).trim(),
    color: String(getFirst("color", "顏色", "石材", "石材類型") || "").trim(),
    顏色: String(getFirst("顏色", "石材", "石材類型", "color") || "").trim(),
    installAddress: String(
      getFirst("installAddress", "安裝地點", "安裝地址", "地址") || "",
    ).trim(),
    安裝地點: String(
      getFirst("安裝地點", "安裝地址", "地址", "installAddress") || "",
    ).trim(),
    installDate: String(getFirst("installDate", "安裝日") || "").trim(),
    安裝日: String(getFirst("安裝日", "installDate") || "").trim(),
    status: String(getFirst("status", "狀態", "施工狀態") || "").trim(),
    狀態: String(getFirst("狀態", "施工狀態", "status") || "").trim(),
  };
}

async function assertCanReadOrder(payload, ctx, orderDocId) {
  const safeOrderId = String(orderDocId || "").trim();
  if (!safeOrderId) {
    throw new functions.https.HttpsError("invalid-argument", "缺少訂單識別碼");
  }

  const accessCtx = await getCallableAccessContext(payload, ctx);
  if (accessCtx.isStaff) return accessCtx;

  assertApprovedCustomerContext(accessCtx);

  const orderSnap = await admin
    .firestore()
    .collection("Orders")
    .doc(safeOrderId)
    .get();
  if (!orderSnap.exists) {
    throw new functions.https.HttpsError("not-found", "訂單不存在");
  }

  const orderCompanyIds = collectOrderCompanyIds(orderSnap.data() || {});
  if (!hasCompanyIntersection(orderCompanyIds, accessCtx.companyIds)) {
    throw new functions.https.HttpsError(
      "permission-denied",
      "無法存取其他公司的訂單",
    );
  }

  return accessCtx;
}

exports.listMyCompanyOrders = onCall(async (payload, ctx) => {
  const accessCtx = await getCallableAccessContext(payload, ctx);
  assertApprovedCustomerContext(accessCtx);

  const data = unwrapCallablePayload(payload);
  const maxRows = Math.max(1, Math.min(200, Number(data.maxRows || 120)));

  const db = admin.firestore();
  const collected = [];
  const seen = new Set();

  for (const companyId of accessCtx.companyIds) {
    const snap = await db
      .collection("Orders")
      .where("companyId", "==", companyId)
      .limit(maxRows)
      .get();

    for (const doc of snap.docs) {
      if (seen.has(doc.id)) continue;
      seen.add(doc.id);
      collected.push(
        sanitizeOrderForCustomer({
          id: doc.id,
          ...(doc.data() || {}),
        }),
      );
      if (collected.length >= maxRows) break;
    }

    if (collected.length >= maxRows) break;
  }

  return collected;
});

async function assertStaffRole(uid) {
  if (!uid) {
    throw new functions.https.HttpsError("unauthenticated", "請先登入");
  }
  const role = String((await readUserRole(uid)) || "").trim();
  if (!isStaffRole(role)) {
    logger.warn("assertStaffRole denied", { uid, role });
    throw new functions.https.HttpsError(
      "permission-denied",
      "僅員工與管理者可操作完工照片",
    );
  }
  return role;
}

function getPhotoSigningSecret() {
  let secret = "";
  try {
    secret = String(PHOTO_URL_SIGNING_SECRET.value() || "").trim();
  } catch (_e) {
    secret = "";
  }
  if (!secret) {
    secret = String(process.env.PHOTO_URL_SIGNING_SECRET || "").trim();
  }
  return secret;
}

function base64UrlEncode(buffer) {
  return Buffer.from(buffer)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(value) {
  const normalized = String(value || "")
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const padLen = (4 - (normalized.length % 4)) % 4;
  return Buffer.from(normalized + "=".repeat(padLen), "base64");
}

function createPhotoAccessToken(payload, secret) {
  const body = base64UrlEncode(Buffer.from(JSON.stringify(payload), "utf8"));
  const signature = base64UrlEncode(
    crypto.createHmac("sha256", secret).update(body).digest(),
  );
  return `${body}.${signature}`;
}

function verifyPhotoAccessToken(token, secret) {
  const tokenText = String(token || "");
  const parts = tokenText.split(".");
  if (parts.length !== 2) {
    throw new Error("token 格式錯誤");
  }

  const body = parts[0];
  const signature = parts[1];
  const expected = base64UrlEncode(
    crypto.createHmac("sha256", secret).update(body).digest(),
  );
  if (signature !== expected) {
    throw new Error("token 簽章錯誤");
  }

  const payload = JSON.parse(base64UrlDecode(body).toString("utf8"));
  const expMs = Number(payload?.exp || 0);
  if (!expMs || Date.now() > expMs) {
    throw new Error("token 已過期");
  }

  return payload;
}

function buildServePhotoUrl(token) {
  const projectId =
    String(
      process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || "",
    ).trim() || "jh-stone";
  const url = new URL(
    `https://asia-east1-${projectId}.cloudfunctions.net/serveCompletionPhoto`,
  );
  url.searchParams.set("token", token);
  return url.toString();
}

function buildShareAlbumUrl(albumId) {
  const projectId =
    String(
      process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || "",
    ).trim() || "jh-stone";
  const url = new URL(
    `https://asia-east1-${projectId}.cloudfunctions.net/serveCompletionPhotoAlbum`,
  );
  url.searchParams.set("albumId", String(albumId || ""));
  return url.toString();
}

function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function buildPhotoAccessUrlMap(
  orderDocId,
  ids,
  secret,
  ttlMs = 5 * 60 * 1000,
) {
  const uniqueIds = Array.from(new Set(ids || [])).slice(0, 200);
  const photoRefs = uniqueIds.map((photoId) =>
    admin
      .firestore()
      .collection("Orders")
      .doc(orderDocId)
      .collection("completionPhotos")
      .doc(photoId),
  );

  const photoSnaps = photoRefs.length
    ? await admin.firestore().getAll(...photoRefs)
    : [];

  const result = {};
  for (const snap of photoSnaps) {
    if (!snap.exists) continue;
    const photoData = snap.data() || {};
    const photoId = String(snap.id || "").trim();
    if (!photoId) continue;

    const nasPath = String(photoData.nasPath || "").trim();
    const legacyDownloadUrl = String(photoData.downloadURL || "").trim();

    // Support both NAS-backed files and legacy Firebase Storage links.
    // This avoids order-specific share failures on unmigrated historical photos.
    if (!nasPath && !/^https?:\/\//i.test(legacyDownloadUrl)) {
      continue;
    }

    let resolvedUrl = "";
    if (nasPath) {
      const token = createPhotoAccessToken(
        {
          orderId: orderDocId,
          photoId,
          exp: Date.now() + Math.max(60 * 1000, Number(ttlMs || 0)),
        },
        secret,
      );
      resolvedUrl = buildServePhotoUrl(token);
    } else {
      resolvedUrl = legacyDownloadUrl;
    }

    result[photoId] = {
      url: resolvedUrl,
      fileName: String(photoData.fileName || ""),
      contentType: String(photoData.contentType || ""),
    };
  }

  return result;
}

function setCorsHeaders(res) {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
}

function sendJson(res, status, payload) {
  setCorsHeaders(res);
  res.status(status).json(payload);
}

async function verifyHttpRequestUser(req) {
  const authHeader = String(req.headers.authorization || "");
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match || !match[1]) {
    throw new Error("missing bearer token");
  }

  const decoded = await admin.auth().verifyIdToken(match[1]);
  const uid = String(decoded?.uid || "").trim();
  if (!uid) {
    throw new Error("invalid auth token");
  }

  const role = await readUserRole(uid);
  if (!["admin", "管理者", "員工"].includes(role)) {
    throw new Error("permission denied");
  }

  return {
    uid,
    email: String(decoded?.email || ""),
    name: String(decoded?.name || ""),
  };
}

function parseMultipartForm(req, maxBytes = 120 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const contentType = String(req?.headers?.["content-type"] || "");
    if (!/^multipart\/form-data\b/i.test(contentType)) {
      reject(new Error("invalid content-type"));
      return;
    }

    const fields = {};
    const files = [];
    let settled = false;
    const done = (err, data) => {
      if (settled) return;
      settled = true;
      if (err) {
        reject(err);
        return;
      }
      resolve(data);
    };

    let bb;
    try {
      bb = Busboy({
        headers: req.headers,
        limits: {
          files: 1,
          fileSize: maxBytes,
        },
      });
    } catch (e) {
      done(e);
      return;
    }

    bb.on("field", (name, val) => {
      fields[name] = val;
    });

    bb.on("file", (name, file, info) => {
      const chunks = [];
      let fileTooLarge = false;
      file.on("limit", () => {
        fileTooLarge = true;
      });
      file.on("data", (chunk) => {
        chunks.push(chunk);
      });
      file.on("end", () => {
        if (fileTooLarge) {
          done(new Error("file too large"));
          return;
        }
        files.push({
          fieldName: name,
          fileName: String(info?.filename || ""),
          mimeType: String(info?.mimeType || "application/octet-stream"),
          buffer: Buffer.concat(chunks),
        });
      });
    });

    bb.on("error", (err) => done(err));
    bb.on("finish", () => {
      done(null, { fields, files });
    });

    const rawBody = req?.rawBody;
    if (Buffer.isBuffer(rawBody) && rawBody.length > 0) {
      bb.end(rawBody);
      return;
    }

    if (req && typeof req.pipe === "function") {
      req.pipe(bb);
      return;
    }

    done(new Error("request body unavailable"));
  });
}

function sanitizeFileName(name = "") {
  return String(name)
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .trim();
}

function sanitizePathSegment(name = "") {
  return String(name)
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .trim();
}

async function readUserRole(uid) {
  if (!uid) return null;
  const profile = await readUserProfile(uid);
  return profile.role || null;
}

async function getNasStoragePath() {
  const snap = await admin
    .firestore()
    .collection("SystemSettings")
    .doc("general")
    .get();
  const nasStoragePath = snap.exists
    ? String(snap.data()?.nasStoragePath || "").trim()
    : "";
  return nasStoragePath;
}

// 訂單資料夾路徑（小姐們放訂單的地方），若未設定則 fallback 到 nasStoragePath
async function getNasOrderPath() {
  const snap = await admin
    .firestore()
    .collection("SystemSettings")
    .doc("general")
    .get();
  const data = snap.exists ? snap.data() || {} : {};
  const orderPath = String(data.nasOrderPath || "").trim();
  if (orderPath) return orderPath;
  return String(data.nasStoragePath || "").trim();
}

async function buildOrderNasFolderParts(orderId, completionPhotoData = {}) {
  function normalizeKeyName(key) {
    return String(key || "")
      .replace(/\s+/g, "")
      .trim();
  }

  function readByKeys(source, keys = []) {
    if (!source || typeof source !== "object") return "";
    for (const key of keys) {
      if (source[key] !== undefined && source[key] !== null) {
        const value = String(source[key]).trim();
        if (value) return value;
      }
    }

    // Handle documents where field names differ slightly (spaces/suffixes).
    const map = new Map();
    for (const rawKey of Object.keys(source)) {
      map.set(normalizeKeyName(rawKey), rawKey);
    }
    for (const key of keys) {
      const matchedRawKey = map.get(normalizeKeyName(key));
      if (!matchedRawKey) continue;
      const value = String(source[matchedRawKey] || "").trim();
      if (value) return value;
    }

    return "";
  }

  function readByKeyword(source, keyword) {
    if (!source || typeof source !== "object" || !keyword) return "";
    const normalizedKeyword = normalizeKeyName(keyword);
    for (const rawKey of Object.keys(source)) {
      const normalized = normalizeKeyName(rawKey);
      if (!normalized.includes(normalizedKeyword)) continue;
      const value = String(source[rawKey] || "").trim();
      if (value) return value;
    }
    return "";
  }

  let customerName = readByKeys(completionPhotoData, [
    "customerName",
    "客戶名稱",
    "客戶",
  ]);
  let orderNumber = readByKeys(completionPhotoData, [
    "orderNumber",
    "訂單號碼",
    "訂單編號",
  ]);
  let color = readByKeys(completionPhotoData, [
    "color",
    "顏色",
    "石材",
    "石材類型",
  ]);
  let installAddress = readByKeys(completionPhotoData, [
    "installAddress",
    "安裝地點",
    "安裝地址",
    "地址",
  ]);

  // Fallback to parent order document when photo metadata is incomplete.
  if (!customerName || !orderNumber || !color || !installAddress) {
    const orderSnap = await admin
      .firestore()
      .collection("Orders")
      .doc(orderId)
      .get();
    const orderData = orderSnap.exists ? orderSnap.data() || {} : {};

    if (!customerName) {
      customerName =
        readByKeys(orderData, ["客戶名稱", "客戶", "customerName"]) ||
        readByKeyword(orderData, "客戶");
    }
    if (!orderNumber) {
      orderNumber =
        readByKeys(orderData, ["訂單號碼", "訂單編號", "orderNumber"]) ||
        readByKeyword(orderData, "訂單");
    }
    if (!color) {
      color =
        readByKeys(orderData, ["顏色", "石材", "石材類型", "color"]) ||
        readByKeyword(orderData, "顏色") ||
        readByKeyword(orderData, "石材");
    }
    if (!installAddress) {
      installAddress =
        readByKeys(orderData, [
          "安裝地點",
          "安裝地址",
          "地址",
          "installAddress",
        ]) ||
        readByKeyword(orderData, "安裝") ||
        readByKeyword(orderData, "地址");
    }
  }

  const customerFolder =
    sanitizePathSegment(customerName || "unknown-customer") ||
    "unknown-customer";

  const detailFolderRaw = [orderNumber, color, installAddress]
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join(" ");

  const detailFolder =
    sanitizePathSegment(detailFolderRaw || orderId || "unknown-order") ||
    "unknown-order";

  return {
    customerFolder,
    detailFolder,
    orderNumber: String(orderNumber || "").trim(),
  };
}

function normalizeOrderToken(value = "") {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .trim();
}

function extractOrderMainNumber(value = "") {
  const text = String(value || "").trim();
  if (!text) return "";

  const digitRuns = text.match(/\d{5,}/g) || [];
  if (!digitRuns.length) return "";

  digitRuns.sort((a, b) => b.length - a.length);
  return String(digitRuns[0] || "");
}

function scoreOrderFolderMatch(
  folderName = "",
  orderNumber = "",
  parentName = "",
  expectedCustomerCode = "",
  expectedCustomerNumber = "",
) {
  const name = String(folderName || "").trim();
  const orderText = String(orderNumber || "").trim();
  const parent = String(parentName || "").trim();
  const expectedCode = String(expectedCustomerCode || "")
    .trim()
    .toUpperCase();
  const expectedNumber = String(expectedCustomerNumber || "").replace(
    /^0+/,
    "",
  );
  if (!name || !orderText) return 0;

  // 強化正規化：去除所有空白、括號、特殊符號
  const normalizeForOrder = (str) =>
    String(str || "")
      .replace(/[^A-Z0-9]/gi, "")
      .toUpperCase();
  const normalizedName = normalizeForOrder(name);
  const normalizedOrder = normalizeForOrder(orderText);
  const mainNumber = extractOrderMainNumber(orderText);
  const normalizedNamePrefix = normalizeForOrder(name.slice(0, 48));
  const normalizedParent = normalizeForOrder(parent);

  let score = 0;

  // 只要資料夾名稱包含完整訂單號碼，給最高分
  if (normalizedOrder && normalizedName.includes(normalizedOrder)) {
    score += 10000;
  }

  // 訂單號碼開頭也給高分
  if (normalizedOrder && normalizedName.startsWith(normalizedOrder)) {
    score += 2000;
  }

  // 主號碼（純數字）命中
  if (mainNumber) {
    const boundaryPattern = new RegExp(`(^|[^0-9])${mainNumber}([^0-9]|$)`);
    if (boundaryPattern.test(name)) score += 200;
    if (normalizedNamePrefix.includes(mainNumber)) score += 120;
    else if (normalizedName.includes(mainNumber)) score += 60;
  }

  // 客戶資料夾命名強化：同時包含客戶名稱關鍵字與後六碼，給極高分
  if (expectedNumber) {
    // 例如「後六碼002686」
    const last6 = expectedNumber.padStart(6, "0");
    const regex6 = new RegExp(`${last6}`);
    if (regex6.test(name)) score += 1500;
    // 客戶資料夾名稱同時有 expectedCode 與後六碼，給更高分
    if (expectedCode && name.includes(expectedCode) && regex6.test(name)) {
      score += 2000;
    }
    // 父層資料夾名稱以『去掉前導0的數字-』開頭，給高分
    const regex = new RegExp(`^${expectedNumber}-`, "i");
    if (regex.test(parent)) {
      score += 1000;
    }
  } else if (expectedCode && normalizedParent.includes(expectedCode)) {
    score += 500;
  }

  // 客戶資料夾名稱同時有 expectedCode 與「後六碼」字樣，給額外分
  if (expectedCode && name.includes(expectedCode)) {
    score += 300;
  }

  return score;
}

// 用唯一檔名在整個 NAS 搜尋，直接取得檔案現在的完整路徑
async function synologySearchFileByName({ baseUrl, sid, rootPath, fileName }) {
  const startUrl = new URL("/webapi/entry.cgi", baseUrl);
  startUrl.searchParams.set("api", "SYNO.FileStation.Search");
  startUrl.searchParams.set("version", "2");
  startUrl.searchParams.set("method", "start");
  startUrl.searchParams.set("folder_path", rootPath);
  startUrl.searchParams.set("pattern", `*${fileName}*`);
  startUrl.searchParams.set("recursive", "true");
  startUrl.searchParams.set("_sid", sid);

  const startResp = await fetch(startUrl.toString(), { method: "GET" });
  const startJson = await parseJsonSafe(startResp);
  if (!startResp.ok || !startJson.success) return null;
  const taskid = startJson?.data?.taskid;
  if (!taskid) return null;

  const pollDelays = [
    300, 300, 400, 400, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500,
  ];
  let foundPath = null;
  for (let i = 0; i < pollDelays.length; i++) {
    await new Promise((r) => setTimeout(r, pollDelays[i]));
    const listUrl = new URL("/webapi/entry.cgi", baseUrl);
    listUrl.searchParams.set("api", "SYNO.FileStation.Search");
    listUrl.searchParams.set("version", "2");
    listUrl.searchParams.set("method", "list");
    listUrl.searchParams.set("taskid", taskid);
    listUrl.searchParams.set("offset", "0");
    listUrl.searchParams.set("limit", "10");
    listUrl.searchParams.set("_sid", sid);

    const listResp = await fetch(listUrl.toString(), { method: "GET" });
    const listJson = await parseJsonSafe(listResp);
    if (!listResp.ok || !listJson.success) continue;

    const allFiles = Array.isArray(listJson?.data?.files)
      ? listJson.data.files
      : [];
    // 只要非資料夾、名稱含 fileName 的第一筆
    const hit = allFiles.find(
      (f) => !f?.isdir && String(f?.name || "").includes(fileName),
    );
    if (hit && hit.path) {
      foundPath = String(hit.path).trim();
      break;
    }
    if (listJson?.data?.finished) break;
  }

  // 清除任務
  const cleanUrl = new URL("/webapi/entry.cgi", baseUrl);
  cleanUrl.searchParams.set("api", "SYNO.FileStation.Search");
  cleanUrl.searchParams.set("version", "2");
  cleanUrl.searchParams.set("method", "clean");
  cleanUrl.searchParams.set("taskid", taskid);
  cleanUrl.searchParams.set("_sid", sid);
  fetch(cleanUrl.toString(), { method: "GET" }).catch(() => {});

  return foundPath; // 完整路徑如 /峻晟/01-.../26803補BNJ .../A10258xxx.jpg，或 null
}

async function synologyListFolderEntries({ baseUrl, sid, folderPath }) {
  const listUrl = new URL("/webapi/entry.cgi", baseUrl);
  listUrl.searchParams.set("api", "SYNO.FileStation.List");
  listUrl.searchParams.set("version", "2");
  listUrl.searchParams.set("method", "list");
  listUrl.searchParams.set("folder_path", folderPath);
  listUrl.searchParams.set(
    "additional",
    JSON.stringify(["real_path", "time", "size"]),
  );
  listUrl.searchParams.set("_sid", sid);

  const listResp = await fetch(listUrl.toString(), { method: "GET" });
  const listJson = await parseJsonSafe(listResp);
  if (!listResp.ok || !listJson.success) {
    throw new Error(formatSynologyError(listJson, "Synology 列出資料夾失敗"));
  }

  const files = listJson?.data?.files;
  return Array.isArray(files) ? files : [];
}

// 使用 SYNO.FileStation.Search API 搜尋符合關鍵字的資料夾（比逐層列出快很多）
async function synologySearchFolders({ baseUrl, sid, rootPath, pattern }) {
  // Step 1: 啟動搜尋任務（不限 filetype，由客戶端過濾，避免 filetype=dir 漏找）
  const startUrl = new URL("/webapi/entry.cgi", baseUrl);
  startUrl.searchParams.set("api", "SYNO.FileStation.Search");
  startUrl.searchParams.set("version", "2");
  startUrl.searchParams.set("method", "start");
  startUrl.searchParams.set("folder_path", rootPath);
  // Synology pattern 需加萬用字元才能做「包含」搜尋
  startUrl.searchParams.set("pattern", `*${pattern}*`);
  startUrl.searchParams.set("recursive", "true");
  startUrl.searchParams.set("_sid", sid);

  const startResp = await fetch(startUrl.toString(), { method: "GET" });
  const startJson = await parseJsonSafe(startResp);
  if (!startResp.ok || !startJson.success) {
    throw new Error(formatSynologyError(startJson, "Synology 搜尋啟動失敗"));
  }
  const taskid = startJson?.data?.taskid;
  if (!taskid) throw new Error("Synology 搜尋未回傳 taskid");

  // Step 2: 輪詢直到搜尋完成（最多等 10 秒），每次取足夠多筆
  // 首次等較短時間，後續每次等 300ms，找到結果就提早結束
  let finished = false;
  let files = [];
  const pollDelays = [
    300, 300, 300, 300, 300, 400, 400, 400, 400, 500, 500, 500, 500, 500, 500,
    500, 500, 500, 500, 500,
  ];
  for (let i = 0; i < pollDelays.length; i++) {
    await new Promise((r) => setTimeout(r, pollDelays[i]));
    const listUrl = new URL("/webapi/entry.cgi", baseUrl);
    listUrl.searchParams.set("api", "SYNO.FileStation.Search");
    listUrl.searchParams.set("version", "2");
    listUrl.searchParams.set("method", "list");
    listUrl.searchParams.set("taskid", taskid);
    listUrl.searchParams.set("offset", "0");
    listUrl.searchParams.set("limit", "1000");
    listUrl.searchParams.set(
      "additional",
      JSON.stringify(["real_path", "time"]),
    );
    listUrl.searchParams.set("_sid", sid);

    const listResp = await fetch(listUrl.toString(), { method: "GET" });
    const listJson = await parseJsonSafe(listResp);
    if (!listResp.ok || !listJson.success) continue;

    // 只保留資料夾
    const allFiles = Array.isArray(listJson?.data?.files)
      ? listJson.data.files
      : [];
    files = allFiles.filter((f) => f?.isdir === true);
    finished = listJson?.data?.finished === true;
    // 找到結果就提早結束，不必等 Synology 掃完全部
    if (finished || files.length > 0) break;
  }

  // Step 3: 清除任務（fire and forget）
  const cleanUrl = new URL("/webapi/entry.cgi", baseUrl);
  cleanUrl.searchParams.set("api", "SYNO.FileStation.Search");
  cleanUrl.searchParams.set("version", "2");
  cleanUrl.searchParams.set("method", "clean");
  cleanUrl.searchParams.set("taskid", taskid);
  cleanUrl.searchParams.set("_sid", sid);
  fetch(cleanUrl.toString(), { method: "GET" }).catch(() => {});

  logger.info("synologySearchFolders: result", {
    rootPath,
    pattern,
    total: files.length,
    finished,
  });
  return files;
}

// 客戶代碼對照表（依官方客戶清單，含例外）
const CUSTOMER_CODE_LOOKUP = {
  AAA: "001",
  AAB: "002",
  AAC: "003",
  AAD: "004",
  AAE: "005",
  AAF: "007",
  AAG: "008",
  AAH: "009",
  AAI: "010",
  AAJ: "019",
  AAK: "012",
  AAL: "013",
  AAM: "011",
  AAN: "014",
  AAO: "017",
  AAP: "018",
  AAQ: "022",
  AAR: "016",
  AAS: "015",
  AAT: "016",
  AAU: "020",
  AAV: "021",
  AAW: "023",
  AAX: "024",
  AAY: "025",
  AAZ: "026",
  ABA: "027",
  ABB: "028",
  ABC: "029",
  ABD: "030",
  ABE: "031",
  ABF: "032",
  ABG: "033",
  ABH: "034",
  ABI: "035",
  ABJ: "036",
  ABK: "037",
  ABL: "038",
  ABM: "039",
  ABN: "040",
  ABO: "041",
  ABP: "042",
  ABQ: "043",
  ABR: "044",
  ABS: "045",
  ABT: "046",
  ABU: "047",
  ABV: "048",
  ABW: "049",
  ABX: "050",
  ABY: "051",
  AVZ: "052",
  ACA: "053",
  ACB: "054",
  ACC: "055",
  ACD: "056",
  ACE: "057",
  ACF: "058",
  ACG: "059",
  ACH: "060",
  ACI: "061",
  ACJ: "062",
  ACK: "063",
  ACL: "064",
  ACM: "065",
  ACN: "066",
  ACO: "067",
  ACP: "068",
  ACQ: "069",
  ACR: "070",
  ACS: "071",
  ACT: "072",
  ACU: "073",
  ACV: "074",
  ACW: "075",
  ACX: "076",
  ACY: "077",
  ACZ: "078",
  ADA: "079",
  ADB: "080",
  ADC: "081",
  ADD: "082",
  ADE: "083",
  ADF: "084",
  ADG: "085",
  ADH: "086",
  ADI: "087",
  ADJ: "088",
  ADK: "089",
  ADL: "090",
  ADM: "091",
  ADN: "092",
  ADO: "093",
  ADP: "094",
  ADQ: "095",
  ADR: "096",
  ADS: "097",
  ADT: "098",
  ADU: "099",
  ADV: "100",
  ADW: "101",
  ADX: "102",
  ADY: "103",
  ADZ: "104",
  AEA: "105",
  AEB: "106",
  AEC: "107",
  AED: "108",
  AEE: "109",
  AEF: "110",
  AEG: "111",
  AEH: "112",
  AEI: "113",
  AEJ: "114",
  AEK: "115",
  AEL: "116",
  AEM: "117",
  AEN: "118",
  AEO: "119",
  AEP: "120",
  AEQ: "121",
  AER: "122",
  AES: "123",
  AET: "124",
  AEU: "125",
  AEV: "126",
  AEW: "127",
  AEX: "128",
  AEY: "129",
  AEZ: "130",
  AFA: "131",
  AFB: "132",
  AFC: "133",
  AFD: "134",
  AFE: "135",
  AFF: "136",
  AFG: "137",
  AFH: "138",
  AFI: "139",
  AFJ: "140",
  AFK: "141",
  AFL: "142",
  AFM: "143",
  AFN: "144",
  AFO: "145",
  AFP: "146",
  AFQ: "147",
  AFR: "148",
  AFS: "149",
  AFT: "150",
  AFU: "151",
  AFV: "152",
  AFW: "153",
  AFX: "154",
  AFY: "155",
  AFZ: "156",
  AGA: "157",
  AGB: "158",
  AGC: "159",
  AGD: "160",
  AGE: "161",
  AGF: "162",
  AGG: "163",
  AGH: "164",
  AGI: "165",
  AGJ: "166",
  AGK: "167",
  AGL: "168",
  AGM: "169",
  AGN: "170",
  AGO: "171",
  AGP: "172",
  AGQ: "173",
  AGR: "174",
  AGS: "175",
  AGT: "176",
  AGU: "177",
  AGV: "178",
  AGW: "179",
  AGX: "180",
  AGY: "181",
  AGZ: "182",
  AHA: "183",
  AHB: "184",
  AHC: "185",
  AHD: "186",
  AHE: "187",
  AHF: "188",
  AHG: "189",
  AHH: "190",
  AHI: "191",
  AHJ: "192",
  AHK: "193",
  AHL: "194",
  AHM: "195",
  AHN: "196",
  AHO: "197",
  AHP: "198",
  AHQ: "199",
  AHR: "200",
  AHS: "201",
  AHT: "202",
  AHU: "203",
  AHV: "204",
  AHW: "205",
  AHX: "206",
  AHY: "208",
  AHZ: "207",
  AIA: "209",
  AIB: "210",
  AIC: "211",
  AID: "212",
  AIE: "213",
  AIF: "214",
  AIG: "215",
  AIH: "216",
  AII: "217",
  AIJ: "218",
  AIK: "219",
  AIL: "220",
  AIM: "221",
  AIN: "222",
  AIO: "223",
  AIP: "224",
  AIQ: "225",
  AIR: "226",
  AIS: "227",
  AIT: "228",
  AIU: "229",
  AIV: "230",
  AIW: "231",
  AIX: "232",
  AIY: "233",
  AIZ: "234",
  AJA: "235",
  AJB: "236",
  AJC: "237",
  AJD: "238",
  AJE: "239",
  AJF: "240",
  AJG: "241",
  AJH: "242",
  AJI: "243",
  AJJ: "244",
  AJK: "245",
  AJL: "246",
  AJM: "247",
  AJN: "248",
  AJO: "249",
  AJP: "250",
  AJQ: "251",
  AJR: "252",
  AJS: "253",
  AJT: "254",
  AJU: "255",
  AJV: "256",
  AJW: "257",
  AJX: "258",
  AJY: "259",
  AJZ: "260",
  AKA: "261",
  AKB: "262",
  AKC: "263",
  AKD: "264",
  AKE: "265",
  AKF: "266",
  AKG: "267",
  AKH: "268",
  AKI: "269",
  AKJ: "270",
  AKK: "271",
  AKL: "272",
  AKM: "273",
  AKN: "274",
  AKO: "275",
  AKP: "276",
  AKQ: "277",
  AKR: "278",
  AKS: "279",
  AKT: "280",
  AKU: "281",
  AKV: "282",
  AKW: "283",
  AKX: "284",
  AKY: "285",
  AKZ: "286",
  ALA: "287",
  ALB: "288",
  ALC: "289",
  ALD: "290",
  ALE: "291",
  ALF: "292",
  ALG: "293",
  ALH: "294",
  ALI: "295",
  ALJ: "296",
  ALK: "297",
  ALL: "298",
  ALM: "299",
  ALN: "300",
  ALO: "301",
  ALP: "302",
  ALQ: "303",
  ALR: "304",
  ALS: "305",
  ALT: "306",
  ALU: "307",
  ALV: "308",
  ALW: "309",
  ALY: "311",
  ALZ: "312",
  AMA: "313",
  AMB: "314",
  AMC: "315",
  AMD: "316",
  AME: "317",
  AMF: "318",
  AMG: "319",
  AMH: "320",
  AMI: "321",
  AMJ: "322",
  AMK: "323",
  AML: "324",
  AMM: "325",
  AMN: "326",
  AMO: "327",
  AMP: "328",
  AMQ: "329",
  AMR: "330",
  AMS: "331",
  AMT: "332",
  AMU: "333",
  AMV: "334",
  AMX: "336",
  AMY: "337",
  AMZ: "338",
  ANA: "339",
  ANB: "340",
  ANC: "341",
  AND: "342",
  ANE: "343",
  ANF: "344",
  ANG: "345",
  ANH: "346",
  ANI: "347",
  ANJ: "348",
  ANK: "349",
  ANL: "350",
  ANM: "351",
  ANN: "352",
  ANO: "353",
  ANP: "354",
  ANQ: "355",
  ANR: "356",
  ANS: "357",
  ANT: "358",
  ANU: "359",
  ANV: "360",
  ANW: "361",
  ANX: "362",
  ANY: "363",
  ANZ: "364",
  AOA: "365",
  AOB: "366",
  AOC: "367",
  AOD: "368",
  AOE: "369",
  AOF: "370",
  AOG: "371",
  AOH: "372",
  AOI: "373",
  AOJ: "374",
  AOK: "375",
  AOL: "376",
  AOM: "377",
  AON: "378",
  AOO: "379",
  AOP: "380",
  AOQ: "381",
  AOR: "382",
  AOS: "383",
  AOT: "384",
  AOU: "385",
  AOV: "386",
  AOW: "387",
  AOX: "388",
  AOY: "389",
  AOZ: "390",
  APA: "391",
  APB: "392",
  APC: "393",
  APD: "394",
  APE: "395",
  APF: "396",
  APG: "397",
  APH: "398",
  API: "399",
  APJ: "400",
  APK: "401",
  APL: "402",
  APM: "403",
  APN: "404",
  APO: "405",
  APP: "406",
  APQ: "407",
  APR: "408",
  APS: "409",
  APT: "410",
  APU: "411",
  APV: "412",
  APW: "413",
  APX: "414",
  APY: "415",
  APZ: "416",
  AQA: "417",
  AQB: "418",
  AQC: "419",
  AQF: "421",
  AQG: "422",
  AQH: "423",
  AQI: "424",
  AQJ: "425",
  AQK: "426",
  AQL: "427",
  AQM: "428",
  AQN: "429",
  AQO: "430",
  AQP: "431",
  AQQ: "432",
  AQR: "433",
  AQS: "434",
  AQT: "435",
  AQU: "436",
  AQV: "437",
  AQW: "438",
  AQX: "439",
  AQY: "440",
  AQZ: "441",
  ARA: "442",
  ARB: "443",
  ARC: "444",
  ARD: "445",
  ARE: "446",
  ARF: "447",
  ARG: "448",
  ARH: "449",
  ARI: "450",
  ARJ: "451",
  ARK: "452",
  ARL: "453",
  ARM: "454",
  ARN: "455",
  ARO: "456",
  ARP: "457",
  ARQ: "458",
  ARR: "459",
  ARS: "460",
  ART: "461",
  ARU: "462",
  ARV: "463",
  ARW: "464",
  ARX: "465",
  ARY: "466",
  ARZ: "467",
  ASA: "468",
  ASB: "469",
  ASC: "470",
  ASD: "471",
  ASE: "472",
  ASF: "473",
  ASG: "474",
  ASH: "475",
  ASI: "476",
  ASJ: "477",
  ASK: "478",
  ASL: "479",
  ASM: "480",
  ASN: "481",
  ASO: "482",
  ASP: "483",
  ASQ: "484",
  ASR: "485",
  ASS: "486",
  AST: "487",
  ASU: "488",
  ASV: "489",
  ASW: "491",
  ASX: "492",
  ASY: "493",
  ASZ: "494",
  ATA: "495",
  ATB: "496",
  ATC: "497",
  ATD: "498",
  ATE: "499",
  ATF: "500",
  ATG: "501",
  ATH: "502",
  ATI: "503",
  ATJ: "504",
  ATK: "505",
  ATL: "506",
  ATM: "507",
  ATN: "508",
  ATO: "509",
  ATP: "510",
  ATQ: "511",
  ATR: "512",
  ATS: "513",
  ATT: "514",
  ATU: "515",
  ATV: "516",
  ATW: "517",
  ATX: "518",
  ATY: "519",
  ATZ: "520",
  AUA: "521",
  AUB: "522",
  AUC: "523",
  AUD: "524",
  AUE: "525",
  AUF: "526",
  AUG: "527",
  AUH: "528",
  AUI: "529",
  AUJ: "530",
  AUK: "531",
  AUL: "532",
  AUM: "533",
  AUN: "534",
  AUO: "535",
  AUP: "536",
  AUQ: "537",
  AUR: "538",
  AUS: "539",
  AUT: "540",
  AUU: "541",
  AUV: "542",
  AUW: "543",
  AUX: "544",
  AUY: "545",
  AUZ: "546",
  AVA: "547",
  AVB: "548",
  AVC: "549",
  AVD: "550",
  AVE: "551",
  AVF: "552",
  AVG: "553",
  AVH: "554",
  AVI: "555",
  AVJ: "556",
  AVK: "557",
  AVL: "558",
  AVM: "559",
  AVN: "560",
  AVO: "561",
  AVP: "562",
  AVQ: "563",
  AVR: "564",
  AVS: "565",
  AVT: "566",
  AVU: "567",
  AVV: "568",
  AVW: "569",
  AVX: "570",
  AVY: "571",
  AWA: "573",
  AWB: "574",
  AWC: "575",
  AWE: "577",
  AWF: "578",
  AWG: "579",
  AWH: "580",
  AWI: "581",
  AWJ: "582",
  AWL: "584",
  AWM: "585",
  AWN: "586",
  AWO: "587",
  AWP: "588",
  AWQ: "589",
  AWR: "590",
  AWS: "600",
  AWT: "601",
  AWU: "602",
  AWV: "603",
  AWW: "604",
  AWX: "605",
  AWZ: "607",
  AXA: "608",
  AXB: "609",
  AXC: "610",
  AXD: "611",
  AXE: "612",
  AXF: "613",
  AXG: "614",
  AXH: "615",
  AXI: "616",
  AXJ: "617",
  AXK: "618",
  AXL: "619",
  AXM: "620",
  AXN: "621",
  AXO: "622",
  AXP: "623",
  AXQ: "624",
  AXR: "625",
  AXS: "626",
  AXT: "627",
  AXU: "628",
  AXV: "630",
  AXW: "631",
  AXX: "632",
  AXY: "633",
  AXZ: "634",
  AYA: "635",
  AYB: "636",
  AYC: "637",
  AYD: "638",
  AYE: "639",
  AYF: "640",
  AYG: "641",
  AYH: "642",
  AYI: "643",
  AYJ: "644",
  AYK: "645",
  AYL: "646",
  AYM: "647",
  AYN: "648",
  AYO: "649",
  AYP: "650",
  AYQ: "651",
  AYR: "652",
  AYS: "653",
  AYT: "654",
  AYU: "655",
  AYV: "656",
  AYW: "657",
  AYX: "658",
  AYY: "659",
  AYZ: "660",
  AZA: "661",
  AZB: "662",
  AZC: "663",
  AZD: "664",
  AZE: "665",
  AZF: "666",
  AZG: "667",
  AZH: "668",
  AZI: "669",
  AZJ: "670",
  AZK: "671",
  AZL: "672",
  AZN: "673",
  AZO: "674",
  AZP: "675",
  AZQ: "676",
  AZR: "677",
  AZS: "678",
  AZT: "679",
  AZU: "680",
  AZV: "681",
  AZW: "682",
  AZX: "683",
  AZY: "684",
  AZZ: "685",
  BAA: "686",
  BAB: "687",
  BAC: "688",
  BAD: "689",
  BAE: "690",
  BAF: "691",
  BAG: "692",
  BAH: "693",
  BAI: "694",
  BAJ: "695",
  BAK: "696",
  BAL: "697",
  BAM: "698",
  BAN: "699",
  BAO: "700",
  BAP: "701",
  BAQ: "702",
  BAR: "703",
  BAS: "704",
  BAT: "705",
  BAU: "706",
  BAV: "707",
  BAW: "708",
  BAX: "709",
  BAY: "710",
  BAZ: "711",
  BBA: "712",
  BBB: "713",
  BBC: "714",
  BBD: "715",
  BBE: "716",
  BBF: "717",
  BBG: "718",
  BBH: "719",
  BBI: "720",
  BBJ: "721",
  BBK: "722",
  BBL: "723",
  BBM: "724",
  BBN: "725",
  BBO: "726",
  BBP: "727",
  BBQ: "728",
  BBR: "729",
  BBS: "730",
  BBT: "731",
  BBU: "732",
  BBV: "733",
  BBW: "734",
  BBX: "735",
  BBY: "736",
  BBZ: "737",
  BCA: "738",
  BCB: "739",
  BCC: "740",
  BCD: "741",
  BCE: "742",
  BCF: "743",
  BCG: "744",
  BCH: "745",
  BCI: "746",
  BCJ: "747",
  BCK: "748",
  BCL: "749",
  BCM: "750",
  BCN: "751",
  BCO: "752",
  BCP: "753",
  BCQ: "754",
  BCR: "755",
  BCS: "756",
  BCT: "757",
  BCU: "758",
  BCV: "759",
  BCW: "760",
  BCX: "761",
  BCY: "762",
  BCZ: "763",
  BDA: "764",
  BDB: "765",
  BDC: "766",
  BDD: "767",
  BDE: "768",
  BDF: "769",
  BDG: "770",
  BDH: "771",
  BDI: "772",
  BDJ: "773",
  BDK: "774",
  BDL: "775",
  BDM: "776",
  BDN: "777",
  BDO: "778",
  BDP: "779",
  BDQ: "780",
  BDR: "781",
  BDS: "782",
  BDT: "783",
  BDU: "784",
  BDV: "785",
  BDW: "786",
  BDX: "787",
  BDY: "788",
  BDZ: "789",
  BEA: "790",
  BEB: "791",
  BEC: "792",
  BED: "793",
  BEE: "794",
  BEF: "795",
  BEG: "796",
  BEH: "797",
  BEI: "798",
  BEJ: "799",
  BEK: "800",
  BEL: "801",
  BEM: "802",
  BEN: "803",
  BEO: "804",
  BEP: "805",
  BEQ: "806",
  BER: "807",
  BES: "808",
  BET: "809",
  BEU: "810",
  BEV: "811",
  BEW: "812",
  BEX: "813",
  BEY: "814",
  BEZ: "815",
  BFA: "816",
  BFB: "817",
  BFC: "818",
  BFD: "821",
  BFE: "819",
  BFF: "820",
  BFG: "822",
  BFH: "823",
  BFI: "824",
  BFJ: "825",
  BFK: "826",
  BFL: "827",
  BFN: "828",
  BFO: "829",
  BFP: "830",
  BFQ: "831",
  BFR: "832",
  BFS: "833",
  BFT: "834",
  BFU: "835",
  BFV: "836",
  BFW: "837",
  BFX: "838",
  BFY: "839",
  BFZ: "840",
  BGA: "841",
  BGB: "842",
  BGC: "843",
  BGD: "844",
  BGE: "845",
  BGF: "846",
  BGG: "847",
  BGH: "848",
  BGJ: "849",
  BGK: "850",
  BGL: "851",
  BGM: "852",
  BGN: "853",
  BGO: "854",
  BGP: "855",
  BGQ: "856",
  BGR: "858",
  BGS: "857",
  BGT: "859",
  BGU: "860",
  BGV: "861",
  BGW: "862",
  BGX: "863",
  BGY: "864",
  BGZ: "865",
  BHA: "866",
  BHB: "867",
  BHC: "868",
  BHD: "869",
  BHE: "870",
  BHF: "871",
  BHG: "872",
  BHH: "873",
  BHI: "874",
  BHJ: "875",
  BHK: "876",
  BHL: "877",
  BHM: "878",
  BHN: "879",
  BHO: "880",
  BHR: "881",
  BHT: "882",
  BHU: "883",
  BHV: "884",
  BHW: "885",
  BHX: "886",
  BHY: "887",
  BHZ: "888",
  BIA: "889",
  BIB: "890",
  BIC: "891",
  BID: "892",
  BIE: "893",
  BIF: "894",
  BIG: "895",
  BIH: "896",
  BII: "897",
  BIJ: "898",
  BIK: "899",
  BIL: "900",
  BIM: "901",
  BIN: "902",
  BIO: "903",
  BIP: "904",
  BIQ: "905",
  BIR: "906",
  BIS: "907",
  BIT: "908",
  BIU: "909",
  BIV: "910",
  BIW: "911",
  BIX: "912",
  BIY: "913",
  BIZ: "914",
  BJA: "915",
  BJB: "916",
  BJC: "917",
  BJD: "918",
  BJE: "919",
  BJF: "920",
  BJG: "921",
  BJH: "922",
  BJI: "923",
  BJJ: "924",
  BJK: "925",
  BJL: "926",
  BJM: "927",
  BJN: "928",
  BJO: "929",
  BJP: "930",
  BJQ: "931",
  BJR: "932",
  BJS: "933",
  BJT: "934",
  BJU: "935",
  BJV: "936",
  BJW: "937",
  BJX: "938",
  BJY: "939",
  BJZ: "940",
  BKA: "941",
  BKB: "942",
  BKC: "943",
  BKD: "944",
  BKE: "945",
  BKF: "946",
  BKG: "947",
  BKH: "948",
  BKI: "949",
  BKJ: "950",
  BKK: "951",
  BKL: "952",
  BKM: "953",
  BKN: "954",
  BKO: "955",
  BKP: "956",
  BKQ: "957",
  BKR: "958",
  BKS: "959",
  BKT: "960",
  BKU: "961",
  BKV: "962",
  BKW: "963",
  BKX: "964",
  BKY: "965",
  BKZ: "966",
  BLA: "967",
  BLB: "968",
  BLC: "969",
  BLD: "970",
  BLE: "971",
  BLF: "972",
  BLG: "973",
  BLH: "974",
  BLI: "975",
  BLJ: "976",
  BLK: "977",
  BLL: "978",
  BLM: "979",
  BLN: "980",
  BLO: "981",
  BLP: "982",
  BLQ: "983",
  BLR: "984",
  BLS: "985",
  BLT: "986",
  BLU: "987",
  BLV: "988",
  BLW: "989",
  BLX: "990",
  BLY: "991",
  BLZ: "992",
  BMA: "993",
  BMB: "994",
  BMC: "995",
  BMD: "996",
  BME: "997",
  BMF: "998",
  BMG: "999",
  BMH: "1000",
  BMI: "1001",
  BMJ: "1002",
  BMK: "1003",
  BML: "1004",
  BMM: "1005",
  BMN: "1006",
  BMO: "1007",
  BMP: "1008",
  BMQ: "1009",
  BMR: "1010",
  BMS: "1011",
  BMT: "1012",
  BMU: "1013",
  BMV: "1014",
  BMW: "1015",
  BMX: "1016",
  BMY: "1017",
  BMZ: "1018",
  BNA: "1019",
  BNB: "1020",
  BNC: "1021",
  BND: "1022",
  BNE: "1023",
  BNF: "1024",
  BNG: "1025",
  BNH: "1026",
  BNI: "1027",
  BNJ: "1028",
  BNK: "1029",
  BNL: "1030",
  BNM: "1031",
  BNN: "1032",
  BNO: "1033",
  BNP: "1034",
  BNQ: "1035",
  BNR: "1036",
  BNS: "1037",
  BNT: "1038",
  BNU: "1039",
  BNV: "1040",
  BNW: "1041",
  BNX: "1042",
  BNY: "1043",
  BNZ: "1044",
  BOA: "1045",
  BOB: "1046",
  BOC: "1047",
  BOD: "1048",
  BOE: "1049",
  BOF: "1050",
  BOG: "1051",
  BOH: "1052",
  BOI: "1053",
  BOJ: "1054",
  BOK: "1055",
  BOL: "1056",
  BOM: "1057",
  BON: "1058",
  BOO: "1059",
  BOP: "1060",
  BOQ: "1061",
  BOR: "1062",
  BOS: "1063",
  BOT: "1064",
  BOU: "1065",
  BOV: "1066",
  BOW: "1067",
  BOX: "1068",
  BOY: "1069",
  BOZ: "1070",
  BPA: "1071",
  BPB: "1072",
  BPC: "1073",
  BPD: "1074",
  BPE: "1075",
  BPF: "1076",
  BPG: "1077",
  BPH: "1078",
  BPI: "1079",
  BPJ: "1080",
  BPK: "1081",
  BPL: "1082",
  BPM: "1083",
  BPN: "1084",
  BPO: "1085",
  BPP: "1086",
  BPQ: "1087",
  BPR: "1088",
  BPS: "1089",
  BPT: "1090",
  BPU: "1091",
  BPV: "1092",
  BPW: "1093",
  BPX: "1094",
  BPY: "1095",
  BPZ: "1096",
  BQA: "1097",
  ZZY: "999",
  ZZZ: "1000",
};

// 平行兩層列出：用字母代碼篩客戶資料夾，再平行列訂單資料夾
// 客戶資料夾命名規則：包含客戶代碼英文（如 ZZY、ANB、ACU）
async function listOrderFoldersParallel({
  baseUrl,
  sid,
  basePath,
  customerCode,
  customerNumber,
}) {
  // 第一層：客戶資料夾
  let clientFolders = [];
  try {
    const entries = await synologyListFolderEntries({
      baseUrl,
      sid,
      folderPath: basePath,
    });
    const allDirs = entries.filter((e) => e?.isdir);
    // 第一優先：用英文代碼（如 ANB）篩選
    if (customerCode) {
      clientFolders = allDirs.filter((e) =>
        String(e.name || "")
          .toUpperCase()
          .includes(customerCode.toUpperCase()),
      );
    }
    // 第二優先：英文找不到時，用對照表的客戶編號（如 340）篩選
    if (clientFolders.length === 0 && customerNumber) {
      const numStr = String(customerNumber).replace(/^0+/, ""); // 去前導零
      clientFolders = allDirs.filter((e) =>
        String(e.name || "").includes(numStr),
      );
    }
    logger.info("listOrderFoldersParallel: level1", {
      basePath,
      customerCode,
      customerNumber,
      total: allDirs.length,
      matched: clientFolders.length,
    });

    // 無論 level1 有沒有匹配，同時啟動「3層結構」掃描：
    // level1 非匹配資料夾（可能是產品分類）→ level2 找客戶 → level3 找訂單
    // 分批掃完所有非匹配的 level1，找到客戶資料夾就立刻停止
    const nonMatchingDirs = allDirs.filter((e) => !clientFolders.includes(e));

    const deepScanPromise = (async () => {
      if (nonMatchingDirs.length === 0) return [];
      const BATCH_SIZE = 40; // 每批 40 個並發，找到即停止
      for (let i = 0; i < nonMatchingDirs.length; i += BATCH_SIZE) {
        const batch = nonMatchingDirs.slice(i, i + BATCH_SIZE);
        const batchLevel2 = (
          await Promise.all(
            batch.map(async (cf) => {
              try {
                const entries = await synologyListFolderEntries({
                  baseUrl,
                  sid,
                  folderPath: cf.path,
                });
                return entries.filter((e) => e?.isdir);
              } catch {
                return [];
              }
            }),
          )
        ).flat();

        // 在這批 level2 結果裡找客戶資料夾
        let clientFoldersL2 = [];
        if (customerCode) {
          clientFoldersL2 = batchLevel2.filter((e) =>
            String(e.name || "")
              .toUpperCase()
              .includes(customerCode.toUpperCase()),
          );
        }
        if (clientFoldersL2.length === 0 && customerNumber) {
          const numStr = String(customerNumber).replace(/^0+/, "");
          clientFoldersL2 = batchLevel2.filter((e) =>
            String(e.name || "").includes(numStr),
          );
        }
        if (clientFoldersL2.length > 0) {
          logger.info(
            "listOrderFoldersParallel: deep scan found client folders",
            {
              batchStart: i,
              level2Total: batchLevel2.length,
              matched: clientFoldersL2.length,
            },
          );
          // 找到客戶資料夾，掃 level3 取訂單資料夾
          const level3Dirs = (
            await Promise.all(
              clientFoldersL2.slice(0, 10).map(async (cf) => {
                try {
                  const entries = await synologyListFolderEntries({
                    baseUrl,
                    sid,
                    folderPath: cf.path,
                  });
                  return entries.filter((e) => e?.isdir);
                } catch {
                  return [];
                }
              }),
            )
          ).flat();
          // 額外多掃一層（level4）：有些訂單放在「已安裝ok」等中介資料夾內
          const level4Results = await Promise.all(
            level3Dirs.map(async (subDir) => {
              try {
                const subEntries = await synologyListFolderEntries({
                  baseUrl,
                  sid,
                  folderPath: subDir.path,
                });
                return subEntries.filter((e) => e?.isdir);
              } catch {
                return [];
              }
            }),
          );
          return [...level3Dirs, ...level4Results.flat()];
        }
      }
      logger.info("listOrderFoldersParallel: deep scan exhausted", {
        scanned: nonMatchingDirs.length,
      });
      return [];
    })();

    if (clientFolders.length === 0) {
      // Level1 完全沒有匹配，只等深層掃描結果
      const deepFolders = await deepScanPromise;
      logger.info("listOrderFoldersParallel: done (3-level only)", {
        basePath,
        orderCount: deepFolders.length,
      });
      return deepFolders;
    }

    // Level1 有匹配：同時並發 2-level 掃描與深層掃描，合併結果
    const shallowScanPromise = Promise.all(
      clientFolders.slice(0, 10).map(async (cf) => {
        try {
          const entries = await synologyListFolderEntries({
            baseUrl,
            sid,
            folderPath: cf.path,
          });
          const level2Dirs = entries.filter((e) => e?.isdir);
          // 額外多掃一層：有些訂單會被移入「已安裝ok」等中介資料夾
          const level3Results = await Promise.all(
            level2Dirs.map(async (subDir) => {
              try {
                const subEntries = await synologyListFolderEntries({
                  baseUrl,
                  sid,
                  folderPath: subDir.path,
                });
                return subEntries.filter((e) => e?.isdir);
              } catch {
                return [];
              }
            }),
          );
          return [...level2Dirs, ...level3Results.flat()];
        } catch {
          return [];
        }
      }),
    ).then((r) => r.flat());

    const [shallowFolders, deepFolders] = await Promise.all([
      shallowScanPromise,
      deepScanPromise,
    ]);
    const combined = [...shallowFolders, ...deepFolders];
    logger.info("listOrderFoldersParallel: done (combined)", {
      basePath,
      shallowCount: shallowFolders.length,
      deepCount: deepFolders.length,
      totalCount: combined.length,
    });
    return combined;
  } catch (e) {
    logger.warn("listOrderFoldersParallel: level1 failed", {
      error: e?.message,
    });
    return [];
  }
}

// 保留遞迴列出作為備用（maxDepth 預設 2）
async function listAllSubfolders({ baseUrl, sid, rootPath, maxDepth = 2 }) {
  let result = [];
  let stack = [{ path: rootPath, depth: 0 }];
  while (stack.length) {
    const { path: current, depth } = stack.pop();
    let entries = [];
    try {
      entries = await synologyListFolderEntries({
        baseUrl,
        sid,
        folderPath: current,
      });
    } catch (e) {
      logger.info("listAllSubfolders: list failed", {
        current,
        error: e?.message || String(e),
      });
      continue;
    }
    for (const entry of entries) {
      if (entry?.isdir) {
        result.push(entry);
        if (depth + 1 < maxDepth) {
          stack.push({ path: entry.path, depth: depth + 1 });
        }
      }
    }
  }
  logger.info("listAllSubfolders: total found", {
    rootPath,
    total: result.length,
  });
  return result;
}

async function resolveExistingOrderFolderPath({
  baseUrl,
  sid,
  basePath,
  customerFolder,
  orderNumber,
  defaultDetailFolder,
}) {
  // ...existing code...
  const baseSearchPath = basePath; // 直接用 storage path 作為搜尋根目錄
  const fallbackPath = `${basePath}/${customerFolder}/${defaultDetailFolder}`;
  const normalizedOrderNumber = String(orderNumber || "").trim();

  if (!normalizedOrderNumber) {
    return {
      uploadFolder: fallbackPath,
      matched: false,
      matchedFolderName: "",
      matchScore: 0,
    };
  }

  // 解析訂單號取得客戶代碼（英文，如 27298ACU → ACU），再由對照表取客戶編號
  let customerCode = "";
  let customerNumber = "";
  const orderMatch = normalizedOrderNumber.match(/(\d{5})([A-Z]{3})$/i);
  if (orderMatch) {
    customerCode = orderMatch[2].toUpperCase();
  } else {
    const codeMatch = normalizedOrderNumber.match(/[A-Z]{3}$/i);
    if (codeMatch) customerCode = codeMatch[0].toUpperCase();
  }
  // 從對照表取正確的客戶編號（例外安全，找不到則保持空字串）
  customerNumber = CUSTOMER_CODE_LOOKUP[customerCode] || "";

  // 同時並發兩種搜尋方式，哪個先有結果就用哪個：
  //   1. listOrderFoldersParallel：直接列出目錄兩層（快，不需輪詢索引）
  //   2. synologySearchFolders：Synology Search API（慢，但可搜更深層結構）
  const sharedFolderRoot = "/" + basePath.split("/").filter(Boolean)[0];
  const searchRoots =
    sharedFolderRoot && sharedFolderRoot !== basePath
      ? [basePath, sharedFolderRoot]
      : [basePath];

  const t0 = Date.now();
  let entries = [];

  const parallelListPromise = listOrderFoldersParallel({
    baseUrl,
    sid,
    basePath: baseSearchPath,
    customerCode,
    customerNumber,
  }).then((r) => {
    if (r.length > 0) {
      logger.info("resolveExistingOrderFolderPath: parallelList won race", {
        count: r.length,
        ms: Date.now() - t0,
      });
      return r;
    }
    return Promise.reject(new Error("parallelList:empty"));
  });

  const searchPromises = searchRoots.map((searchRoot) =>
    synologySearchFolders({
      baseUrl,
      sid,
      rootPath: searchRoot,
      pattern: normalizedOrderNumber,
    }).then((r) => {
      if (r.length > 0) {
        logger.info("resolveExistingOrderFolderPath: search won race", {
          searchRoot,
          count: r.length,
          ms: Date.now() - t0,
        });
        return r;
      }
      return Promise.reject(new Error("search:empty"));
    }),
  );

  // 整體最多等 12 秒，避免單一查詢長時間卡住
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error("timeout")), 12000),
  );

  try {
    entries = await Promise.race([
      Promise.any([parallelListPromise, ...searchPromises]),
      timeoutPromise,
    ]);
  } catch (raceError) {
    // 所有方式都沒找到結果，或到達 12 秒上限
    logger.warn(
      "resolveExistingOrderFolderPath: all strategies returned empty or timeout",
      {
        orderNumber: normalizedOrderNumber,
        ms: Date.now() - t0,
        reason: raceError?.message,
      },
    );
  }

  const candidates = entries
    .map((entry) => {
      const name = String(entry?.name || "").trim();
      const parentPath =
        String(entry?.path || "")
          .trim()
          .split("/")
          .slice(0, -1)
          .pop() || "";
      // 強化正規化
      const normalizeForOrder = (str) =>
        String(str || "")
          .replace(/[^A-Z0-9]/gi, "")
          .toUpperCase();
      const normalizedName = normalizeForOrder(name);
      const score = scoreOrderFolderMatch(
        name,
        normalizedOrderNumber,
        parentPath,
        customerCode,
        customerNumber,
      );
      const mtime = Number(entry?.additional?.time?.mtime || 0);
      return {
        name,
        path: String(entry?.path || "").trim(),
        parent: parentPath,
        score,
        mtime,
        normalizedName,
      };
    })
    .filter((row) => row.name && row.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.mtime !== a.mtime) return b.mtime - a.mtime;
      return a.name.localeCompare(b.name, "zh-Hant");
    });

  // log 所有候選資料夾的父層、名稱、分數、正規化名稱
  logger.info("OrderFolderMatchCandidates", {
    orderNumber: normalizedOrderNumber,
    customerCode,
    customerNumber,
    candidates: candidates.map((c) => ({
      name: c.name,
      path: c.path,
      parent: c.parent,
      score: c.score,
      normalizedName: c.normalizedName,
    })),
  });

  if (!candidates.length) {
    logger.info("OrderFolderSelected", {
      orderNumber: normalizedOrderNumber,
      selectedPath: fallbackPath,
      selectedName: "(fallback)",
      selectedParent: "",
      matchScore: 0,
      totalMs: Date.now() - t0,
    });
    return {
      uploadFolder: fallbackPath,
      matched: false,
      matchedFolderName: "",
      matchScore: 0,
    };
  }

  const selected = candidates[0];
  const selectedPath = String(selected.path || "").trim();
  // 分數 < 5000 表示資料夾名稱未包含完整訂單號碼，視為未匹配（避免同客戶其他訂單被誤選）
  const MIN_MATCH_SCORE = 5000;
  const isConfidentMatch = selected.score >= MIN_MATCH_SCORE;
  logger.info("OrderFolderSelected", {
    orderNumber: normalizedOrderNumber,
    selectedPath: selectedPath || `${customerPath}/${selected.name}`,
    selectedName: selected.name,
    selectedParent: selected.parent,
    matchScore: selected.score,
    isConfidentMatch,
    totalMs: Date.now() - t0,
  });
  if (!isConfidentMatch) {
    return {
      uploadFolder: fallbackPath,
      matched: false,
      matchedFolderName: "",
      matchScore: selected.score,
    };
  }
  return {
    uploadFolder:
      selectedPath || `${basePath}/${customerFolder}/${selected.name}`,
    matched: true,
    matchedFolderName: selected.name,
    matchScore: selected.score,
    matchedParent: selected.parent,
  };
}

function normalizeSynologyDirPath(inputPath = "") {
  const normalized = String(inputPath || "")
    .replace(/\\/g, "/")
    .trim();
  if (!normalized) return "";
  return normalized.startsWith("/") ? normalized : `/${normalized}`;
}

function validateSynologyDirPath(inputPath = "") {
  const normalized = normalizeSynologyDirPath(inputPath);
  if (!normalized) {
    return {
      ok: false,
      normalized,
      reason:
        "NAS 路徑格式錯誤，請使用 Synology 共用資料夾路徑（例如 /岱晨/test 或 /shared/orders）",
    };
  }

  // Reject UNC-like paths (e.g. \\NAS\\Share\\Dir -> //NAS/Share/Dir)
  // because FileStation API expects Synology shared-folder style paths
  if (/^\/{2,}/.test(normalized)) {
    return {
      ok: false,
      normalized,
      reason:
        "NAS 路徑不可使用 \\\\SERVER\\Share 格式，請改用 Synology 共用資料夾路徑（例如 /岱晨/test）",
    };
  }

  return { ok: true, normalized, reason: "" };
}

function buildSynologyBaseUrl() {
  const raw = String(
    process.env.SYNO_BASE_URL || "https://junchengstone.synology.me:5001",
  ).trim();
  return raw.replace(/\/+$/, "");
}

function getSynologyCredentials() {
  let username = "";
  let password = "";
  try {
    username = String(SYNO_USERNAME_SECRET.value() || "").trim();
  } catch (_e) {
    username = "";
  }
  try {
    password = String(SYNO_PASSWORD_SECRET.value() || "").trim();
  } catch (_e) {
    password = "";
  }

  // fallback for local dev only
  if (!username) username = String(process.env.SYNO_USERNAME || "").trim();
  if (!password) password = String(process.env.SYNO_PASSWORD || "").trim();
  return { username, password };
}

async function parseJsonSafe(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch (_e) {
    return { raw: text };
  }
}

function formatSynologyError(payload, fallbackMessage) {
  const code = payload && payload.error && payload.error.code;
  if (!code) return fallbackMessage;

  if (code === 119) {
    return `${fallbackMessage} (Synology code: 119，通常是 path 參數無效；請確認 NAS 路徑是 /共用資料夾/子目錄 格式，例如 /岱晨/test，而非 \\\\SERVER\\Share)`;
  }

  return `${fallbackMessage} (Synology code: ${code})`;
}

async function synologyLogin(baseUrl, username, password) {
  const loginUrl = new URL("/webapi/auth.cgi", baseUrl);
  loginUrl.searchParams.set("api", "SYNO.API.Auth");
  loginUrl.searchParams.set("version", "6");
  loginUrl.searchParams.set("method", "login");
  loginUrl.searchParams.set("account", username);
  loginUrl.searchParams.set("passwd", password);
  loginUrl.searchParams.set("session", "FileStation");
  loginUrl.searchParams.set("format", "sid");

  const loginResp = await fetch(loginUrl.toString(), { method: "GET" });
  const loginJson = await parseJsonSafe(loginResp);
  if (!loginResp.ok || !loginJson.success || !loginJson.data?.sid) {
    throw new Error(formatSynologyError(loginJson, "Synology 登入失敗"));
  }
  return loginJson.data.sid;
}

async function synologyLogout(baseUrl, sid) {
  if (!sid) return;
  const logoutUrl = new URL("/webapi/auth.cgi", baseUrl);
  logoutUrl.searchParams.set("api", "SYNO.API.Auth");
  logoutUrl.searchParams.set("version", "6");
  logoutUrl.searchParams.set("method", "logout");
  logoutUrl.searchParams.set("session", "FileStation");
  logoutUrl.searchParams.set("_sid", sid);
  await fetch(logoutUrl.toString(), { method: "GET" });
}

async function synologyUploadFile({
  baseUrl,
  sid,
  targetPath,
  fileBuffer,
  fileName,
  mimeType,
}) {
  const uploadUrl = new URL("/webapi/entry.cgi", baseUrl);
  uploadUrl.searchParams.set("_sid", sid);
  const form = new FormData();
  form.append("api", "SYNO.FileStation.Upload");
  form.append("version", "2");
  form.append("method", "upload");
  form.append("path", targetPath);
  form.append("create_parents", "true");
  form.append("overwrite", "true");

  const blob = new Blob([fileBuffer], {
    type: mimeType || "application/octet-stream",
  });
  form.append("file", blob, fileName);

  const uploadResp = await fetch(uploadUrl.toString(), {
    method: "POST",
    body: form,
  });
  const uploadJson = await parseJsonSafe(uploadResp);
  if (!uploadResp.ok || !uploadJson.success) {
    throw new Error(formatSynologyError(uploadJson, "Synology 上傳失敗"));
  }
}

async function synologyCreateFolder({ baseUrl, sid, parentFolderPath, name }) {
  const url = new URL("/webapi/entry.cgi", baseUrl);
  url.searchParams.set("api", "SYNO.FileStation.CreateFolder");
  url.searchParams.set("version", "2");
  url.searchParams.set("method", "create");
  url.searchParams.set("folder_path", JSON.stringify([parentFolderPath]));
  url.searchParams.set("name", JSON.stringify([name]));
  url.searchParams.set("force_parent", "true");
  url.searchParams.set("_sid", sid);
  const resp = await fetch(url.toString(), { method: "GET" });
  const json = await parseJsonSafe(resp);
  if (!resp.ok || !json.success) {
    // code 414 = already exists — treat as ok
    if (Number(json?.error?.code || 0) === 414) return { ok: true };
    throw new Error(formatSynologyError(json, "Synology 建立資料夾失敗"));
  }
  return { ok: true };
}

async function synologyRenameFolder({ baseUrl, sid, folderPath, newName }) {
  const url = new URL("/webapi/entry.cgi", baseUrl);
  url.searchParams.set("api", "SYNO.FileStation.Rename");
  url.searchParams.set("version", "2");
  url.searchParams.set("method", "rename");
  url.searchParams.set("path", JSON.stringify([folderPath]));
  url.searchParams.set("name", JSON.stringify([newName]));
  url.searchParams.set("_sid", sid);
  const resp = await fetch(url.toString(), { method: "GET" });
  const json = await parseJsonSafe(resp);
  if (!resp.ok || !json.success) {
    throw new Error(formatSynologyError(json, "Synology 重新命名資料夾失敗"));
  }
  return { ok: true };
}

// Move srcPaths[] into destFolderPath using SYNO.FileStation.CopyMove
async function synologyMoveFiles({ baseUrl, sid, srcPaths, destFolderPath }) {
  if (!srcPaths.length) return;
  // Use POST with form body to avoid GET URL-length limits with long CJK paths
  const startUrl = new URL("/webapi/entry.cgi", baseUrl);
  const startBody = new URLSearchParams();
  startBody.set("api", "SYNO.FileStation.CopyMove");
  startBody.set("version", "3");
  startBody.set("method", "start");
  startBody.set("path", JSON.stringify(srcPaths));
  startBody.set("dest_folder_path", destFolderPath);
  startBody.set("remove_src", "true");
  startBody.set("overwrite", "false");
  startBody.set("_sid", sid);

  const startResp = await fetch(startUrl.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: startBody.toString(),
  });
  const startJson = await parseJsonSafe(startResp);
  if (!startResp.ok || !startJson.success) {
    throw new Error(formatSynologyError(startJson, "Synology 移動失敗"));
  }
  const taskid = startJson?.data?.taskid;
  if (!taskid) throw new Error("Synology CopyMove 未回傳 taskid");

  // Poll up to 30 seconds
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 500));
    const statusUrl = new URL("/webapi/entry.cgi", baseUrl);
    statusUrl.searchParams.set("api", "SYNO.FileStation.CopyMove");
    statusUrl.searchParams.set("version", "3");
    statusUrl.searchParams.set("method", "status");
    statusUrl.searchParams.set("taskid", taskid);
    statusUrl.searchParams.set("_sid", sid);
    const statusResp = await fetch(statusUrl.toString(), { method: "GET" });
    const statusJson = await parseJsonSafe(statusResp);
    if (!statusResp.ok || !statusJson.success) continue;
    if (statusJson?.data?.finished) {
      if (statusJson.data.error?.errors?.length) {
        throw new Error(
          "移動部分檔案失敗：" + JSON.stringify(statusJson.data.error.errors),
        );
      }
      return;
    }
  }
  throw new Error("Synology 移動逾時");
}

async function synologyDeleteFile({ baseUrl, sid, filePath }) {
  async function requestDelete(pathToDelete, version = "2") {
    const deleteUrl = new URL("/webapi/entry.cgi", baseUrl);
    deleteUrl.searchParams.set("_sid", sid);
    deleteUrl.searchParams.set("api", "SYNO.FileStation.Delete");
    deleteUrl.searchParams.set("version", String(version));
    deleteUrl.searchParams.set("method", "delete");
    deleteUrl.searchParams.set("path", JSON.stringify([pathToDelete]));

    const deleteResp = await fetch(deleteUrl.toString(), {
      method: "GET",
    });
    const deleteJson = await parseJsonSafe(deleteResp);
    return { deleteResp, deleteJson };
  }

  async function listFolder(folderPath) {
    const listUrl = new URL("/webapi/entry.cgi", baseUrl);
    listUrl.searchParams.set("api", "SYNO.FileStation.List");
    listUrl.searchParams.set("version", "2");
    listUrl.searchParams.set("method", "list");
    listUrl.searchParams.set("folder_path", folderPath);
    listUrl.searchParams.set("additional", JSON.stringify(["real_path"]));
    listUrl.searchParams.set("_sid", sid);

    const listResp = await fetch(listUrl.toString(), { method: "GET" });
    const listJson = await parseJsonSafe(listResp);
    if (!listResp.ok || !listJson.success) {
      return [];
    }
    const files = listJson?.data?.files;
    return Array.isArray(files) ? files : [];
  }

  const targetPath = String(filePath || "").trim();
  if (!targetPath) {
    throw new Error("Synology 刪除失敗：缺少檔案路徑");
  }

  // Try both API versions for compatibility across DSM variants.
  let firstAttempt = await requestDelete(targetPath, "2");
  if (!firstAttempt.deleteResp.ok || !firstAttempt.deleteJson.success) {
    const firstCode = Number(firstAttempt.deleteJson?.error?.code || 0);
    if (firstCode === 115) {
      const altAttempt = await requestDelete(targetPath, "1");
      if (altAttempt.deleteResp.ok && altAttempt.deleteJson.success) {
        logger.info("synologyDeleteFile deleted with api version 1 fallback", {
          filePath: targetPath,
        });
        return { ok: true, missing: false, code: 0 };
      }
      firstAttempt = altAttempt;
    }
  }

  if (firstAttempt.deleteResp.ok && firstAttempt.deleteJson.success) {
    return { ok: true, missing: false, code: 0 };
  }

  const errorCode = Number(firstAttempt.deleteJson?.error?.code || 0);
  if (errorCode !== 115) {
    throw new Error(
      formatSynologyError(firstAttempt.deleteJson, "Synology 刪除失敗"),
    );
  }

  // Code 115 may indicate stored path mismatch. Retry by locating exact name in parent folder.
  const slashIndex = targetPath.lastIndexOf("/");
  const parentPath = slashIndex > 0 ? targetPath.slice(0, slashIndex) : "";
  const fileName =
    slashIndex >= 0 ? targetPath.slice(slashIndex + 1) : targetPath;

  if (!parentPath || !fileName) {
    throw new Error(
      formatSynologyError(firstAttempt.deleteJson, "Synology 刪除失敗"),
    );
  }

  const entries = await listFolder(parentPath);
  const matched = entries.find(
    (entry) => String(entry?.name || "") === fileName,
  );
  if (!matched) {
    // True idempotent case: file is already absent from NAS.
    logger.warn(
      "synologyDeleteFile target missing, treating as already deleted",
      {
        filePath: targetPath,
        errorCode,
      },
    );
    return { ok: true, missing: true, code: errorCode };
  }

  const matchedPath = String(matched?.path || "").trim();
  if (!matchedPath) {
    throw new Error(
      formatSynologyError(firstAttempt.deleteJson, "Synology 刪除失敗"),
    );
  }

  let retry = await requestDelete(matchedPath, "2");
  if (!retry.deleteResp.ok || !retry.deleteJson.success) {
    const retryCode = Number(retry.deleteJson?.error?.code || 0);
    if (retryCode === 115) {
      const retryAlt = await requestDelete(matchedPath, "1");
      if (retryAlt.deleteResp.ok && retryAlt.deleteJson.success) {
        logger.info(
          "synologyDeleteFile retry deleted with api version 1 fallback",
          {
            requestedPath: targetPath,
            matchedPath,
          },
        );
        return { ok: true, missing: false, code: 0 };
      }
      retry = retryAlt;
    }
  }

  if (!retry.deleteResp.ok || !retry.deleteJson.success) {
    throw new Error(formatSynologyError(retry.deleteJson, "Synology 刪除失敗"));
  }

  logger.info("synologyDeleteFile fallback delete succeeded", {
    requestedPath: targetPath,
    matchedPath,
  });
  return { ok: true, missing: false, code: 0 };
}

async function synologyDownloadFile({ baseUrl, sid, filePath }) {
  const downloadUrl = new URL("/webapi/entry.cgi", baseUrl);
  downloadUrl.searchParams.set("api", "SYNO.FileStation.Download");
  downloadUrl.searchParams.set("version", "2");
  downloadUrl.searchParams.set("method", "download");
  downloadUrl.searchParams.set("path", JSON.stringify([filePath]));
  downloadUrl.searchParams.set("mode", "open");
  downloadUrl.searchParams.set("_sid", sid);

  return fetch(downloadUrl.toString(), { method: "GET" });
}

exports.uploadCompletionPhotoToNasHttp = onRequestV2(
  {
    secrets: [SYNO_USERNAME_SECRET, SYNO_PASSWORD_SECRET],
    memory: "1GiB",
    timeoutSeconds: 540,
    minInstances: 1,
  },
  async (req, res) => {
    // CORS headers for all requests
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");

    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method Not Allowed" });
      return;
    }

    let user;
    try {
      user = await verifyHttpRequestUser(req);
    } catch (e) {
      sendJson(res, 401, { error: e?.message || "unauthorized" });
      return;
    }

    let form;
    try {
      form = await parseMultipartForm(req, 120 * 1024 * 1024);
    } catch (e) {
      logger.warn("uploadCompletionPhotoToNasHttp multipart parse failed", {
        message: e?.message || "",
        contentType: String(req?.headers?.["content-type"] || ""),
      });
      const isTooLarge = String(e?.message || "").includes("too large");
      sendJson(res, isTooLarge ? 413 : 400, {
        error: isTooLarge ? "檔案過大（目前上限 120MB）" : "multipart 解析失敗",
      });
      return;
    }

    const orderDocId = String(form?.fields?.orderDocId || "").trim();
    if (!orderDocId) {
      sendJson(res, 400, { error: "缺少訂單識別碼" });
      return;
    }

    const uploadFile = form.files?.[0];
    if (!uploadFile || !uploadFile.buffer?.length) {
      sendJson(res, 400, { error: "缺少上傳檔案" });
      return;
    }

    const nasStoragePath = await getNasOrderPath();
    const pathCheck = validateSynologyDirPath(nasStoragePath);
    if (!pathCheck.ok) {
      sendJson(res, 400, { error: pathCheck.reason });
      return;
    }

    const baseUrl = buildSynologyBaseUrl();
    const { username, password } = getSynologyCredentials();
    if (!username || !password) {
      sendJson(res, 400, { error: "尚未設定 SYNO_USERNAME / SYNO_PASSWORD" });
      return;
    }

    const photosRef = admin
      .firestore()
      .collection("Orders")
      .doc(orderDocId)
      .collection("completionPhotos");
    const photoRef = photosRef.doc();

    const logicalFileName =
      sanitizeFileName(
        String(form?.fields?.fileName || uploadFile.fileName || "photo"),
      ) || "photo";
    const contentType =
      String(
        form?.fields?.contentType ||
          uploadFile.mimeType ||
          "application/octet-stream",
      ) || "application/octet-stream";

    const folderParts = await buildOrderNasFolderParts(orderDocId, {
      orderNumber: form?.fields?.orderNumber,
      customerName: form?.fields?.customerName,
      color: form?.fields?.color,
      installAddress: form?.fields?.installAddress,
    });

    // 計算期望的資料夾名稱：年-月-日[原資料夾名稱][安裝人員1][安裝人員2][安裝人員3]
    const installDate = String(form?.fields?.installDate || "").trim();
    const installer1 = String(form?.fields?.installer1 || "").trim();
    const installer2 = String(form?.fields?.installer2 || "").trim();
    const installer3 = String(form?.fields?.installer3 || "").trim();
    const carNumber = String(form?.fields?.carNumber || "").trim();
    const installerParts = [installer1, installer2, installer3].filter(Boolean);
    const carPart = carNumber ? `+${carNumber}` : "";
    const desiredParts = [
      installDate,
      folderParts.detailFolder,
      ...installerParts,
    ].filter(Boolean);
    if (carPart) desiredParts.push(carPart);
    const desiredDetailFolder =
      sanitizePathSegment(desiredParts.join(" ")) || folderParts.detailFolder;

    const targetName = `${photoRef.id}-${logicalFileName}`;

    // 先查 Firestore 有沒有已解析過的 NAS 資料夾路徑（同筆訂單多張照片時共用）
    const orderDocRef = admin.firestore().collection("Orders").doc(orderDocId);
    const orderSnap = await orderDocRef.get();
    const cachedNasFolder = String(
      (orderSnap.exists ? orderSnap.data()?.nasOrderFolderPath : "") || "",
    ).trim();

    let sid = "";
    let uploadFolder = `${pathCheck.normalized}/${folderParts.customerFolder}/${folderParts.detailFolder}`;
    let matchMeta = {
      matched: false,
      matchedFolderName: "",
      matchScore: 0,
    };

    // 共用的資料夾解析 + 重命名 + 上傳邏輯，支援快取失效後重試
    async function resolveAndUpload(useCachedFolder) {
      if (useCachedFolder) {
        uploadFolder = cachedNasFolder;
        matchMeta = { matched: true, matchedFolderName: "", matchScore: -1 };
        logger.info("uploadCompletionPhotoToNasHttp: using cached NAS folder", {
          orderDocId,
          uploadFolder,
        });
      } else {
        matchMeta = await resolveExistingOrderFolderPath({
          baseUrl,
          sid,
          basePath: pathCheck.normalized,
          customerFolder: folderParts.customerFolder,
          orderNumber: folderParts.orderNumber || form?.fields?.orderNumber,
          defaultDetailFolder: folderParts.detailFolder,
        });
        uploadFolder = matchMeta.uploadFolder;
        orderDocRef
          .update({ nasOrderFolderPath: uploadFolder })
          .catch(() => {});
      }

      // 上傳前先將資料夾重新命名為新格式：年-月-日[原名稱][安裝人員1][安裝人員2][安裝人員3]
      // 只在第一次上傳（尚無快取路徑）時才改名，避免重複改名出錯
      if (!useCachedFolder && desiredDetailFolder) {
        const lastSlash = uploadFolder.lastIndexOf("/");
        if (lastSlash > 0) {
          const parentPath = uploadFolder.slice(0, lastSlash);
          const currentName = uploadFolder.slice(lastSlash + 1);
          if (currentName !== desiredDetailFolder) {
            if (matchMeta.matched) {
              try {
                await synologyRenameFolder({
                  baseUrl,
                  sid,
                  folderPath: uploadFolder,
                  newName: desiredDetailFolder,
                });
                logger.info("uploadCompletionPhotoToNasHttp: renamed folder", {
                  from: uploadFolder,
                  to: `${parentPath}/${desiredDetailFolder}`,
                  orderDocId,
                });
              } catch (renameError) {
                logger.warn(
                  "uploadCompletionPhotoToNasHttp: rename folder failed, will use desired path",
                  {
                    from: uploadFolder,
                    desiredDetailFolder,
                    error: renameError.message,
                  },
                );
              }
            }
            uploadFolder = `${parentPath}/${desiredDetailFolder}`;
            orderDocRef
              .update({ nasOrderFolderPath: uploadFolder })
              .catch(() => {});
          }
        }
      }

      await synologyUploadFile({
        baseUrl,
        sid,
        targetPath: uploadFolder,
        fileBuffer: uploadFile.buffer,
        fileName: targetName,
        mimeType: contentType,
      });
    }

    try {
      sid = await synologyLogin(baseUrl, username, password);
      try {
        await resolveAndUpload(!!cachedNasFolder);
      } catch (uploadErr) {
        // 若用快取路徑上傳失敗，重新搜尋資料夾後重試一次
        // 注意：不先清空快取，resolveAndUpload(false) 成功後會自行更新快取，
        // 避免「清空 → 搜到不同客戶資料夾 → 建立重複子資料夾」的問題。
        if (cachedNasFolder) {
          logger.warn(
            "uploadCompletionPhotoToNasHttp: cached folder failed, retrying with fresh resolve",
            {
              orderDocId,
              cachedNasFolder,
              error: uploadErr?.message,
            },
          );
          await resolveAndUpload(false);
        } else {
          throw uploadErr;
        }
      }
    } catch (e) {
      logger.error("uploadCompletionPhotoToNasHttp failed", {
        message: e?.message,
        stack: e?.stack,
        step: "synologyLogin/resolve/upload",
        orderDocId,
        uploadFolder,
        customerFolder: folderParts.customerFolder,
        orderNumber: folderParts.orderNumber,
        detailFolder: folderParts.detailFolder,
      });
      sendJson(res, 500, { error: e?.message || "上傳到 NAS 失敗" });
      return;
    } finally {
      try {
        await synologyLogout(baseUrl, sid);
      } catch (_e) {
        // ignore logout failure
      }
    }

    const nasPath = `${uploadFolder}/${targetName}`;

    await photoRef.set({
      orderDocId,
      orderNumber: String(form?.fields?.orderNumber || ""),
      customerName: String(form?.fields?.customerName || ""),
      color: String(form?.fields?.color || ""),
      installAddress: String(form?.fields?.installAddress || ""),
      客戶名稱: String(form?.fields?.customerName || ""),
      顏色: String(form?.fields?.color || ""),
      安裝地點: String(form?.fields?.installAddress || ""),
      fileName: logicalFileName,
      contentType,
      size: Number(uploadFile.buffer.length || 0),
      nasPath,
      uploadedByUid: user.uid,
      uploadedByName: user.name,
      uploadedByEmail: user.email,
      uploadedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedByUid: user.uid,
      updatedByName: user.name,
      updatedByEmail: user.email,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      nasSync: {
        status: "success",
        targetPath: nasPath,
        syncedAt: admin.firestore.FieldValue.serverTimestamp(),
        matchedExistingFolder: Boolean(matchMeta.matched),
        matchedFolderName: String(matchMeta.matchedFolderName || ""),
        matchScore: Number(matchMeta.matchScore || 0),
      },
    });

    sendJson(res, 200, {
      id: photoRef.id,
      nasPath,
      size: Number(uploadFile.buffer.length || 0),
      fileName: logicalFileName,
      contentType,
    });
  },
);

exports.replaceCompletionPhotoInNasHttp = onRequestV2(
  {
    secrets: [SYNO_USERNAME_SECRET, SYNO_PASSWORD_SECRET],
    memory: "1GiB",
    timeoutSeconds: 540,
    minInstances: 1,
  },
  async (req, res) => {
    if (req.method === "OPTIONS") {
      setCorsHeaders(res);
      res.status(204).send("");
      return;
    }
    if (req.method !== "POST") {
      sendJson(res, 405, { error: "Method Not Allowed" });
      return;
    }

    let user;
    try {
      user = await verifyHttpRequestUser(req);
    } catch (e) {
      sendJson(res, 401, { error: e?.message || "unauthorized" });
      return;
    }

    let form;
    try {
      form = await parseMultipartForm(req, 120 * 1024 * 1024);
    } catch (e) {
      logger.warn("replaceCompletionPhotoInNasHttp multipart parse failed", {
        message: e?.message || "",
        contentType: String(req?.headers?.["content-type"] || ""),
      });
      const isTooLarge = String(e?.message || "").includes("too large");
      sendJson(res, isTooLarge ? 413 : 400, {
        error: isTooLarge ? "檔案過大（目前上限 120MB）" : "multipart 解析失敗",
      });
      return;
    }

    const orderDocId = String(form?.fields?.orderDocId || "").trim();
    const photoId = String(form?.fields?.photoId || "").trim();
    if (!orderDocId || !photoId) {
      sendJson(res, 400, { error: "缺少照片識別資訊" });
      return;
    }

    const uploadFile = form.files?.[0];
    if (!uploadFile || !uploadFile.buffer?.length) {
      sendJson(res, 400, { error: "缺少替換檔案" });
      return;
    }

    const photoRef = admin
      .firestore()
      .collection("Orders")
      .doc(orderDocId)
      .collection("completionPhotos")
      .doc(photoId);
    const snap = await photoRef.get();
    if (!snap.exists) {
      sendJson(res, 404, { error: "找不到照片資料" });
      return;
    }

    const photoData = snap.data() || {};
    const previousNasPath = String(photoData.nasPath || "").trim();
    if (!previousNasPath) {
      sendJson(res, 400, { error: "舊資料尚未使用 NAS 路徑，無法直接替換" });
      return;
    }

    const logicalFileName =
      sanitizeFileName(
        String(form?.fields?.fileName || uploadFile.fileName || "photo"),
      ) || "photo";
    const contentType =
      String(
        form?.fields?.contentType ||
          uploadFile.mimeType ||
          "application/octet-stream",
      ) || "application/octet-stream";

    const dirPath = previousNasPath.includes("/")
      ? previousNasPath.slice(0, previousNasPath.lastIndexOf("/"))
      : "/";
    const nextName = `${photoId}-${Date.now()}-${logicalFileName}`;
    const nextNasPath = `${dirPath}/${nextName}`;

    const baseUrl = buildSynologyBaseUrl();
    const { username, password } = getSynologyCredentials();
    if (!username || !password) {
      sendJson(res, 400, { error: "尚未設定 SYNO_USERNAME / SYNO_PASSWORD" });
      return;
    }

    let sid = "";
    try {
      sid = await synologyLogin(baseUrl, username, password);
      await synologyUploadFile({
        baseUrl,
        sid,
        targetPath: dirPath,
        fileBuffer: uploadFile.buffer,
        fileName: nextName,
        mimeType: contentType,
      });
      try {
        await synologyDeleteFile({ baseUrl, sid, filePath: previousNasPath });
      } catch (e) {
        logger.warn("replaceCompletionPhotoInNasHttp old file delete failed", {
          orderDocId,
          photoId,
          previousNasPath,
          error: e?.message || String(e),
        });
      }
    } catch (e) {
      sendJson(res, 500, { error: e?.message || "更新 NAS 照片失敗" });
      return;
    } finally {
      try {
        await synologyLogout(baseUrl, sid);
      } catch (_e) {
        // ignore logout failure
      }
    }

    await photoRef.set(
      {
        fileName: logicalFileName,
        contentType,
        size: Number(uploadFile.buffer.length || 0),
        nasPath: nextNasPath,
        updatedByUid: user.uid,
        updatedByName: user.name,
        updatedByEmail: user.email,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        nasSync: {
          status: "success",
          targetPath: nextNasPath,
          syncedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
      },
      { merge: true },
    );

    sendJson(res, 200, {
      ok: true,
      nasPath: nextNasPath,
      fileName: logicalFileName,
      contentType,
      size: Number(uploadFile.buffer.length || 0),
    });
  },
);

async function migrateLegacyPhotoToNas({
  photoRef,
  orderId,
  photoId,
  photoData,
  baseFolder,
  baseUrl,
  sid,
  deleteStorageAfterSync,
  migratedByUid,
  migratedByEmail,
}) {
  const storagePath = String(photoData?.storagePath || "").trim();
  const currentNasPath = String(photoData?.nasPath || "").trim();
  if (!storagePath) {
    return { photoId, orderId, status: "skipped", reason: "缺少 storagePath" };
  }
  if (currentNasPath) {
    return { photoId, orderId, status: "skipped", reason: "已存在 nasPath" };
  }

  const fileName =
    sanitizeFileName(String(photoData?.fileName || "").trim()) || "photo";
  const contentType =
    String(photoData?.contentType || "application/octet-stream") ||
    "application/octet-stream";

  const folderParts = await buildOrderNasFolderParts(orderId, photoData);
  const uploadFolder = `${baseFolder}/${folderParts.customerFolder}/${folderParts.detailFolder}`;
  const targetName = `${photoId}-${fileName}`;
  const nasPath = `${uploadFolder}/${targetName}`;

  const downloadResult = await admin
    .storage()
    .bucket()
    .file(storagePath)
    .download();
  const fileBuffer =
    downloadResult && downloadResult[0] ? downloadResult[0] : Buffer.alloc(0);
  if (!fileBuffer.length) {
    throw new Error("從 Firebase Storage 下載舊檔失敗");
  }

  await synologyUploadFile({
    baseUrl,
    sid,
    targetPath: uploadFolder,
    fileBuffer,
    fileName: targetName,
    mimeType: contentType,
  });

  if (deleteStorageAfterSync) {
    try {
      await admin.storage().bucket().file(storagePath).delete();
    } catch (e) {
      logger.warn("migrateLegacyPhotoToNas delete storage failed", {
        orderId,
        photoId,
        storagePath,
        error: e?.message || String(e),
      });
    }
  }

  await photoRef.set(
    {
      nasPath,
      migratedAt: admin.firestore.FieldValue.serverTimestamp(),
      migratedByUid,
      migratedByEmail,
      nasSync: {
        status: "success",
        targetPath: nasPath,
        syncedAt: admin.firestore.FieldValue.serverTimestamp(),
        source: "migration",
      },
    },
    { merge: true },
  );

  return {
    photoId,
    orderId,
    status: "success",
    nasPath,
    storagePath,
  };
}

exports.migrateLegacyCompletionPhotosToNas = onCall(
  {
    secrets: [SYNO_USERNAME_SECRET, SYNO_PASSWORD_SECRET],
    timeoutSeconds: 540,
    memory: "1GiB",
  },
  async (payload, ctx) => {
    try {
      const authUid = getCallableAuthUid(payload, ctx);
      if (!authUid) {
        throw new functions.https.HttpsError("unauthenticated", "請先登入");
      }

      const authToken = getCallableAuthToken(payload, ctx);

      const role = await readUserRole(authUid);
      if (!["admin", "管理者"].includes(role)) {
        throw new functions.https.HttpsError(
          "permission-denied",
          "僅管理者可執行舊照片遷移",
        );
      }

      const data = unwrapCallablePayload(payload);
      const orderIdFilter = String(data.orderId || "").trim();
      const limitValue = Number(data.limit || 20);
      const limit = Math.max(
        1,
        Math.min(100, Number.isFinite(limitValue) ? limitValue : 20),
      );
      const deleteStorageAfterSync = Boolean(data.deleteStorageAfterSync);
      const scanLimit = Math.max(limit * 5, 80);

      const nasStoragePath = await getNasStoragePath();
      if (!nasStoragePath) {
        throw new functions.https.HttpsError(
          "failed-precondition",
          "請先在系統設定填入 NAS 儲存路徑",
        );
      }

      const pathCheck = validateSynologyDirPath(nasStoragePath);
      if (!pathCheck.ok) {
        throw new functions.https.HttpsError(
          "failed-precondition",
          pathCheck.reason,
        );
      }
      const baseFolder = pathCheck.normalized;

      const baseUrl = buildSynologyBaseUrl();
      const { username, password } = getSynologyCredentials();
      if (!username || !password) {
        throw new functions.https.HttpsError(
          "failed-precondition",
          "尚未設定 SYNO_USERNAME / SYNO_PASSWORD",
        );
      }

      let docSnaps = [];
      if (orderIdFilter) {
        const snap = await admin
          .firestore()
          .collection("Orders")
          .doc(orderIdFilter)
          .collection("completionPhotos")
          .limit(scanLimit)
          .get();
        docSnaps = snap.docs;
      } else {
        const snap = await admin
          .firestore()
          .collectionGroup("completionPhotos")
          .limit(scanLimit)
          .get();
        docSnaps = snap.docs;
      }

      const candidates = [];
      for (const snap of docSnaps) {
        const data = snap.data() || {};
        const storagePath = String(data.storagePath || "").trim();
        const nasPath = String(data.nasPath || "").trim();
        if (!storagePath || nasPath) continue;
        const orderId = String(snap.ref.parent?.parent?.id || "").trim();
        if (!orderId) continue;
        candidates.push({
          photoRef: snap.ref,
          photoId: snap.id,
          orderId,
          photoData: data,
        });
        if (candidates.length >= limit) break;
      }

      if (!candidates.length) {
        return {
          ok: true,
          scanned: docSnaps.length,
          requestedLimit: limit,
          migrated: 0,
          failed: 0,
          skipped: 0,
          details: [],
        };
      }

      let sid = "";
      const details = [];
      let migrated = 0;
      let failed = 0;
      let skipped = 0;

      try {
        sid = await synologyLogin(baseUrl, username, password);
        for (const item of candidates) {
          try {
            const result = await migrateLegacyPhotoToNas({
              ...item,
              baseFolder,
              baseUrl,
              sid,
              deleteStorageAfterSync,
              migratedByUid: authUid,
              migratedByEmail: String(authToken?.email || ""),
            });
            details.push(result);
            if (result.status === "success") migrated += 1;
            else skipped += 1;
          } catch (e) {
            failed += 1;
            details.push({
              photoId: item.photoId,
              orderId: item.orderId,
              status: "failed",
              reason: e?.message || String(e),
            });
          }
        }
      } finally {
        try {
          await synologyLogout(baseUrl, sid);
        } catch (_e) {
          // ignore logout failure
        }
      }

      return {
        ok: true,
        scanned: docSnaps.length,
        requestedLimit: limit,
        migrated,
        failed,
        skipped,
        details,
      };
    } catch (error) {
      logger.error("migrateLegacyCompletionPhotosToNas failed", {
        error: error?.message || String(error),
        code: String(error?.code || ""),
        stack: String(error?.stack || ""),
      });
      return {
        ok: false,
        migrated: 0,
        failed: 0,
        skipped: 0,
        details: [],
        errorCode: String(error?.code || "failed-precondition"),
        errorMessage: String(error?.message || "舊照片遷移失敗"),
      };
    }
  },
);

exports.precheckLegacyCompletionPhotosToNas = onCall(
  {
    secrets: [SYNO_USERNAME_SECRET, SYNO_PASSWORD_SECRET],
  },
  async (payload, ctx) => {
    try {
      const authUid = getCallableAuthUid(payload, ctx);
      if (!authUid) {
        throw new functions.https.HttpsError("unauthenticated", "請先登入");
      }

      const role = await readUserRole(authUid);
      if (!["admin", "管理者"].includes(role)) {
        throw new functions.https.HttpsError(
          "permission-denied",
          "僅管理者可執行舊照片遷移",
        );
      }

      const data = unwrapCallablePayload(payload);
      const orderIdFilter = String(data.orderId || "").trim();
      const limitValue = Number(data.limit || 20);
      const limit = Math.max(
        1,
        Math.min(100, Number.isFinite(limitValue) ? limitValue : 20),
      );
      const scanLimit = Math.max(limit * 5, 80);

      const nasStoragePath = await getNasStoragePath();
      if (!nasStoragePath) {
        throw new functions.https.HttpsError(
          "failed-precondition",
          "請先在系統設定填入 NAS 儲存路徑",
        );
      }

      const pathCheck = validateSynologyDirPath(nasStoragePath);
      if (!pathCheck.ok) {
        throw new functions.https.HttpsError(
          "failed-precondition",
          pathCheck.reason,
        );
      }

      const { username, password } = getSynologyCredentials();
      if (!username || !password) {
        throw new functions.https.HttpsError(
          "failed-precondition",
          "尚未設定 SYNO_USERNAME / SYNO_PASSWORD",
        );
      }

      // Validate NAS connectivity during precheck.
      const baseUrl = buildSynologyBaseUrl();
      let precheckSid = "";
      try {
        precheckSid = await synologyLogin(baseUrl, username, password);
      } catch (e) {
        throw new functions.https.HttpsError(
          "failed-precondition",
          e?.message || "NAS 連線驗證失敗",
        );
      } finally {
        try {
          await synologyLogout(baseUrl, precheckSid);
        } catch (_e) {
          // ignore logout failure
        }
      }

      let docSnaps = [];
      if (orderIdFilter) {
        const snap = await admin
          .firestore()
          .collection("Orders")
          .doc(orderIdFilter)
          .collection("completionPhotos")
          .limit(scanLimit)
          .get();
        docSnaps = snap.docs;
      } else {
        const snap = await admin
          .firestore()
          .collectionGroup("completionPhotos")
          .limit(scanLimit)
          .get();
        docSnaps = snap.docs;
      }

      const candidates = [];
      for (const snap of docSnaps) {
        const row = snap.data() || {};
        const storagePath = String(row.storagePath || "").trim();
        const nasPath = String(row.nasPath || "").trim();
        if (!storagePath || nasPath) continue;
        const orderId = String(snap.ref.parent?.parent?.id || "").trim();
        candidates.push({
          orderId,
          photoId: snap.id,
          storagePath,
          fileName: String(row.fileName || "").trim(),
        });
        if (candidates.length >= limit) break;
      }

      return {
        ok: true,
        role,
        normalizedNasPath: pathCheck.normalized,
        requestedLimit: limit,
        scanned: docSnaps.length,
        candidates: candidates.length,
        sample: candidates.slice(0, 5),
      };
    } catch (error) {
      logger.error("precheckLegacyCompletionPhotosToNas failed", {
        error: error?.message || String(error),
        code: String(error?.code || ""),
        stack: String(error?.stack || ""),
      });
      return {
        ok: false,
        candidates: 0,
        scanned: 0,
        errorCode: String(error?.code || "failed-precondition"),
        errorMessage: String(error?.message || "遷移前檢查失敗"),
      };
    }
  },
);

exports.uploadCompletionPhotoToNas = onCall(
  {
    secrets: [SYNO_USERNAME_SECRET, SYNO_PASSWORD_SECRET],
  },
  async (payload, ctx) => {
    const authUid = getCallableAuthUid(payload, ctx);
    await assertStaffRole(authUid);

    const authToken = getCallableAuthToken(payload, ctx);

    const data = unwrapCallablePayload(payload);
    const orderDocId = String(data.orderDocId || "").trim();
    if (!orderDocId) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "缺少訂單識別碼",
      );
    }

    const fileName = sanitizeFileName(data.fileName || "photo") || "photo";
    const contentType =
      String(data.contentType || "application/octet-stream") ||
      "application/octet-stream";
    const dataBase64 = String(data.dataBase64 || "").trim();
    if (!dataBase64) {
      throw new functions.https.HttpsError("invalid-argument", "缺少檔案資料");
    }

    const fileBuffer = Buffer.from(dataBase64, "base64");
    if (!fileBuffer.length) {
      throw new functions.https.HttpsError("invalid-argument", "檔案內容為空");
    }

    // Callable payload has body size limits; keep a conservative threshold.
    const maxBytes = 8 * 1024 * 1024;
    if (fileBuffer.length > maxBytes) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "檔案過大（目前上限 8MB）",
      );
    }

    const nasStoragePath = await getNasStoragePath();
    if (!nasStoragePath) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "請先在系統設定填入 NAS 儲存路徑",
      );
    }

    const pathCheck = validateSynologyDirPath(nasStoragePath);
    if (!pathCheck.ok) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        pathCheck.reason,
      );
    }

    const baseUrl = buildSynologyBaseUrl();
    const { username, password } = getSynologyCredentials();
    if (!username || !password) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "尚未設定 SYNO_USERNAME / SYNO_PASSWORD",
      );
    }

    const photosRef = admin
      .firestore()
      .collection("Orders")
      .doc(orderDocId)
      .collection("completionPhotos");
    const photoRef = photosRef.doc();

    const folderParts = await buildOrderNasFolderParts(orderDocId, {
      orderNumber: data.orderNumber,
      customerName: data.customerName,
      color: data.color,
      installAddress: data.installAddress,
    });
    const targetName = `${photoRef.id}-${fileName}`;

    let sid = "";
    let uploadFolder = `${pathCheck.normalized}/${folderParts.customerFolder}/${folderParts.detailFolder}`;
    let matchMeta = {
      matched: false,
      matchedFolderName: "",
      matchScore: 0,
    };
    try {
      sid = await synologyLogin(baseUrl, username, password);
      matchMeta = await resolveExistingOrderFolderPath({
        baseUrl,
        sid,
        basePath: pathCheck.normalized,
        customerFolder: folderParts.customerFolder,
        orderNumber: folderParts.orderNumber || data.orderNumber,
        defaultDetailFolder: folderParts.detailFolder,
      });
      uploadFolder = matchMeta.uploadFolder;
      await synologyUploadFile({
        baseUrl,
        sid,
        targetPath: uploadFolder,
        fileBuffer,
        fileName: targetName,
        mimeType: contentType,
      });
    } catch (error) {
      throw new functions.https.HttpsError(
        "internal",
        error?.message || "上傳到 NAS 失敗",
      );
    } finally {
      try {
        await synologyLogout(baseUrl, sid);
      } catch (_e) {
        // ignore logout failure
      }
    }

    const nasPath = `${uploadFolder}/${targetName}`;

    await photoRef.set({
      orderDocId,
      orderNumber: String(data.orderNumber || ""),
      customerName: String(data.customerName || ""),
      color: String(data.color || ""),
      installAddress: String(data.installAddress || ""),
      客戶名稱: String(data.customerName || ""),
      顏色: String(data.color || ""),
      安裝地點: String(data.installAddress || ""),
      fileName,
      contentType,
      size: fileBuffer.length,
      nasPath,
      uploadedByUid: authUid,
      uploadedByName: String(authToken?.name || ""),
      uploadedByEmail: String(authToken?.email || ""),
      uploadedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedByUid: authUid,
      updatedByName: String(authToken?.name || ""),
      updatedByEmail: String(authToken?.email || ""),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      nasSync: {
        status: "success",
        targetPath: nasPath,
        syncedAt: admin.firestore.FieldValue.serverTimestamp(),
        matchedExistingFolder: Boolean(matchMeta.matched),
        matchedFolderName: String(matchMeta.matchedFolderName || ""),
        matchScore: Number(matchMeta.matchScore || 0),
      },
    });

    return {
      id: photoRef.id,
      nasPath,
      size: fileBuffer.length,
      fileName,
      contentType,
    };
  },
);

exports.replaceCompletionPhotoInNas = onCall(
  {
    secrets: [SYNO_USERNAME_SECRET, SYNO_PASSWORD_SECRET],
  },
  async (payload, ctx) => {
    const authUid = getCallableAuthUid(payload, ctx);
    await assertStaffRole(authUid);

    const authToken = getCallableAuthToken(payload, ctx);

    const data = unwrapCallablePayload(payload);
    const orderDocId = String(data.orderDocId || "").trim();
    const photoId = String(data.photoId || "").trim();
    if (!orderDocId || !photoId) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "缺少照片識別資訊",
      );
    }

    const fileName = sanitizeFileName(data.fileName || "photo") || "photo";
    const contentType =
      String(data.contentType || "application/octet-stream") ||
      "application/octet-stream";
    const dataBase64 = String(data.dataBase64 || "").trim();
    if (!dataBase64) {
      throw new functions.https.HttpsError("invalid-argument", "缺少檔案資料");
    }
    const fileBuffer = Buffer.from(dataBase64, "base64");
    if (!fileBuffer.length) {
      throw new functions.https.HttpsError("invalid-argument", "檔案內容為空");
    }

    const maxBytes = 8 * 1024 * 1024;
    if (fileBuffer.length > maxBytes) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "檔案過大（目前上限 8MB）",
      );
    }

    const nasStoragePath = await getNasStoragePath();
    if (!nasStoragePath) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "請先在系統設定填入 NAS 儲存路徑",
      );
    }
    const pathCheck = validateSynologyDirPath(nasStoragePath);
    if (!pathCheck.ok) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        pathCheck.reason,
      );
    }

    const photoRef = admin
      .firestore()
      .collection("Orders")
      .doc(orderDocId)
      .collection("completionPhotos")
      .doc(photoId);
    const snap = await photoRef.get();
    if (!snap.exists) {
      throw new functions.https.HttpsError("not-found", "找不到照片資料");
    }
    const currentData = snap.data() || {};
    const previousNasPath = String(currentData.nasPath || "").trim();
    if (!previousNasPath) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "舊資料尚未使用 NAS 路徑，無法直接替換",
      );
    }

    const dirPath = previousNasPath.includes("/")
      ? previousNasPath.slice(0, previousNasPath.lastIndexOf("/"))
      : pathCheck.normalized;
    const nextName = `${photoId}-${Date.now()}-${fileName}`;
    const nextNasPath = `${dirPath}/${nextName}`;

    const baseUrl = buildSynologyBaseUrl();
    const { username, password } = getSynologyCredentials();
    if (!username || !password) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "尚未設定 SYNO_USERNAME / SYNO_PASSWORD",
      );
    }

    let sid = "";
    try {
      sid = await synologyLogin(baseUrl, username, password);
      await synologyUploadFile({
        baseUrl,
        sid,
        targetPath: dirPath,
        fileBuffer,
        fileName: nextName,
        mimeType: contentType,
      });

      try {
        await synologyDeleteFile({ baseUrl, sid, filePath: previousNasPath });
      } catch (e) {
        logger.warn("replaceCompletionPhotoInNas old file delete failed", {
          orderDocId,
          photoId,
          previousNasPath,
          error: e?.message || String(e),
        });
      }
    } catch (error) {
      throw new functions.https.HttpsError(
        "internal",
        error?.message || "更新 NAS 照片失敗",
      );
    } finally {
      try {
        await synologyLogout(baseUrl, sid);
      } catch (_e) {
        // ignore logout failure
      }
    }

    await photoRef.set(
      {
        fileName,
        contentType,
        size: fileBuffer.length,
        nasPath: nextNasPath,
        updatedByUid: authUid,
        updatedByName: String(authToken?.name || ""),
        updatedByEmail: String(authToken?.email || ""),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        nasSync: {
          status: "success",
          targetPath: nextNasPath,
          syncedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
      },
      { merge: true },
    );

    return {
      ok: true,
      nasPath: nextNasPath,
      fileName,
      contentType,
      size: fileBuffer.length,
    };
  },
);

exports.deleteCompletionPhotoInNas = onCall(
  {
    secrets: [SYNO_USERNAME_SECRET, SYNO_PASSWORD_SECRET],
  },
  async (payload, ctx) => {
    const authUid = getCallableAuthUid(payload, ctx);
    await assertStaffRole(authUid);

    const data = unwrapCallablePayload(payload);
    const orderDocId = String(data.orderDocId || "").trim();
    const photoId = String(data.photoId || "").trim();
    if (!orderDocId || !photoId) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "缺少照片識別資訊",
      );
    }

    const photoRef = admin
      .firestore()
      .collection("Orders")
      .doc(orderDocId)
      .collection("completionPhotos")
      .doc(photoId);
    const snap = await photoRef.get();
    if (!snap.exists) {
      return { ok: true, deleted: false };
    }

    const currentData = snap.data() || {};
    const nasPath = String(currentData.nasPath || "").trim();

    if (nasPath) {
      const baseUrl = buildSynologyBaseUrl();
      const { username, password } = getSynologyCredentials();
      if (!username || !password) {
        throw new functions.https.HttpsError(
          "failed-precondition",
          "尚未設定 SYNO_USERNAME / SYNO_PASSWORD",
        );
      }

      let sid = "";
      try {
        sid = await synologyLogin(baseUrl, username, password);
        await synologyDeleteFile({ baseUrl, sid, filePath: nasPath });
      } catch (error) {
        throw new functions.https.HttpsError(
          "internal",
          error?.message || "刪除 NAS 照片失敗",
        );
      } finally {
        try {
          await synologyLogout(baseUrl, sid);
        } catch (_e) {
          // ignore logout failure
        }
      }
    }

    await photoRef.delete();
    return { ok: true, deleted: true };
  },
);

exports.getCompletionPhotoAccessUrls = onCall(
  {
    secrets: [PHOTO_URL_SIGNING_SECRET],
  },
  async (payload, ctx) => {
    const authUid = getCallableAuthUid(payload, ctx);

    const data = unwrapCallablePayload(payload);
    const orderDocId = String(data.orderDocId || "").trim();
    const ids = Array.isArray(data.photoIds)
      ? data.photoIds.map((id) => String(id || "").trim()).filter(Boolean)
      : [];

    if (!orderDocId || !ids.length) {
      return {};
    }

    await assertCanReadOrder(payload, ctx, orderDocId);

    const secret = getPhotoSigningSecret();
    if (!secret) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "尚未設定 PHOTO_URL_SIGNING_SECRET",
      );
    }

    const detailedMap = await buildPhotoAccessUrlMap(orderDocId, ids, secret);
    const result = Object.fromEntries(
      Object.entries(detailedMap).map(([photoId, meta]) => [photoId, meta.url]),
    );

    logger.info("getCompletionPhotoAccessUrls success", {
      orderDocId,
      requestedCount: ids.length,
      returnedCount: Object.keys(result).length,
      uid: authUid,
    });

    return result;
  },
);

exports.createCompletionPhotoShareAlbum = onCall(
  {
    secrets: [PHOTO_URL_SIGNING_SECRET],
  },
  async (payload, ctx) => {
    const authUid = getCallableAuthUid(payload, ctx);

    const data = unwrapCallablePayload(payload);
    const orderDocId = String(data.orderDocId || "").trim();
    const title = String(data.title || "完工照片").trim() || "完工照片";
    const ids = Array.isArray(data.photoIds)
      ? data.photoIds.map((id) => String(id || "").trim()).filter(Boolean)
      : [];

    if (!orderDocId || !ids.length) {
      throw new functions.https.HttpsError("invalid-argument", "缺少分享資料");
    }

    await assertCanReadOrder(payload, ctx, orderDocId);

    const secret = getPhotoSigningSecret();
    if (!secret) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "尚未設定 PHOTO_URL_SIGNING_SECRET",
      );
    }

    const detailedMap = await buildPhotoAccessUrlMap(
      orderDocId,
      ids,
      secret,
      24 * 60 * 60 * 1000,
    );

    const items = ids
      .filter((id) => detailedMap[id])
      .map((id) => ({
        id,
        url: detailedMap[id].url,
        fileName: detailedMap[id].fileName,
        contentType: detailedMap[id].contentType,
      }));

    if (!items.length) {
      throw new functions.https.HttpsError("not-found", "找不到可分享的照片");
    }

    const albumRef = admin.firestore().collection("PhotoShareAlbums").doc();
    const expiresAtMs = Date.now() + 24 * 60 * 60 * 1000;
    await albumRef.set({
      orderDocId,
      title,
      items,
      createdByUid: authUid,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAtMs,
    });

    return {
      albumId: albumRef.id,
      url: buildShareAlbumUrl(albumRef.id),
      expiresAtMs,
    };
  },
);

exports.serveCompletionPhotoAlbum = onRequestV2(async (req, res) => {
  if (req.method !== "GET") {
    res.status(405).send("Method Not Allowed");
    return;
  }

  const albumId = String(req.query.albumId || "").trim();
  if (!albumId) {
    res.status(400).send("missing albumId");
    return;
  }

  const snap = await admin
    .firestore()
    .collection("PhotoShareAlbums")
    .doc(albumId)
    .get();
  if (!snap.exists) {
    res.status(404).send("album not found");
    return;
  }

  const data = snap.data() || {};
  const expiresAtMs = Number(data.expiresAtMs || 0);
  if (!expiresAtMs || Date.now() > expiresAtMs) {
    res.status(410).send("album expired");
    return;
  }

  const title = escapeHtml(String(data.title || "完工照片"));
  const items = Array.isArray(data.items) ? data.items : [];
  const itemHtml = items
    .map((item) => {
      const url = escapeHtml(String(item?.url || ""));
      if (!url) return "";
      const name = escapeHtml(String(item?.fileName || ""));
      const contentType = String(item?.contentType || "").toLowerCase();
      const isVideo = contentType.startsWith("video/");
      if (isVideo) {
        return `<div class="card"><video controls preload="metadata" src="${url}"></video><div class="name">${name}</div></div>`;
      }
      return `<div class="card"><img loading="lazy" src="${url}" alt="${name}" /><div class="name">${name}</div></div>`;
    })
    .join("\n");

  const html = `<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>
    body{margin:0;font-family:Arial,sans-serif;background:#f8fafc;color:#111827}
    .wrap{max-width:1000px;margin:0 auto;padding:16px}
    h1{font-size:20px;margin:0 0 12px}
    .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px}
    .card{background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:8px}
    img,video{width:100%;height:180px;object-fit:cover;border-radius:8px;background:#000}
    .name{font-size:12px;color:#374151;margin-top:6px;word-break:break-all}
  </style>
</head>
<body>
  <div class="wrap">
    <h1>${title}</h1>
    <div class="grid">${itemHtml}</div>
  </div>
</body>
</html>`;

  res.set("Cache-Control", "private, max-age=120");
  res.status(200).send(html);
});

exports.serveCompletionPhoto = onRequestV2(
  {
    secrets: [
      SYNO_USERNAME_SECRET,
      SYNO_PASSWORD_SECRET,
      PHOTO_URL_SIGNING_SECRET,
    ],
  },
  async (req, res) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }

    if (req.method !== "GET") {
      res.status(405).send("Method Not Allowed");
      return;
    }

    const token = String(req.query.token || "").trim();
    if (!token) {
      res.status(400).send("missing token");
      return;
    }

    const secret = getPhotoSigningSecret();
    if (!secret) {
      res.status(500).send("signing secret missing");
      return;
    }

    let payload;
    try {
      payload = verifyPhotoAccessToken(token, secret);
    } catch (e) {
      res.status(401).send(e?.message || "invalid token");
      return;
    }

    const orderId = String(payload?.orderId || "").trim();
    const photoId = String(payload?.photoId || "").trim();
    if (!orderId || !photoId) {
      res.status(400).send("invalid token payload");
      return;
    }

    const photoSnap = await admin
      .firestore()
      .collection("Orders")
      .doc(orderId)
      .collection("completionPhotos")
      .doc(photoId)
      .get();
    if (!photoSnap.exists) {
      res.status(404).send("photo not found");
      return;
    }

    const photoData = photoSnap.data() || {};
    const nasPath = String(photoData.nasPath || "").trim();
    if (!nasPath) {
      res.status(404).send("nas path missing");
      return;
    }

    const baseUrl = buildSynologyBaseUrl();
    const { username, password } = getSynologyCredentials();
    if (!username || !password) {
      res.status(500).send("nas credentials missing");
      return;
    }

    let sid = "";
    try {
      sid = await synologyLogin(baseUrl, username, password);

      // 嘗試從 nasPath 下載，失敗時自動用訂單的 nasOrderFolderPath 換算新路徑重試
      async function tryDownload(filePath) {
        const resp = await synologyDownloadFile({ baseUrl, sid, filePath });
        return resp;
      }

      let resolvedNasPath = nasPath;
      let downloadResp = await tryDownload(nasPath);

      if (!downloadResp.ok) {
        // 下載失敗，嘗試用訂單層級的快取資料夾路徑重算 nasPath
        const orderSnap = await admin
          .firestore()
          .collection("Orders")
          .doc(orderId)
          .get();
        const currentFolder = String(
          (orderSnap.exists ? orderSnap.data()?.nasOrderFolderPath : "") || "",
        ).trim();

        const fileName = nasPath.includes("/")
          ? nasPath.slice(nasPath.lastIndexOf("/") + 1)
          : "";

        if (currentFolder && fileName) {
          const retryPath = `${currentFolder}/${fileName}`;
          if (retryPath !== nasPath) {
            logger.warn("serveCompletionPhoto: retrying with updated folder", {
              orderId,
              photoId,
              oldPath: nasPath,
              retryPath,
            });
            const retryResp = await tryDownload(retryPath);
            if (retryResp.ok) {
              resolvedNasPath = retryPath;
              downloadResp = retryResp;
              // 更新 Firestore 的 nasPath，避免下次再走重試流程
              admin
                .firestore()
                .collection("Orders")
                .doc(orderId)
                .collection("completionPhotos")
                .doc(photoId)
                .update({ nasPath: retryPath })
                .catch(() => {});
            }
          }
        }
      }

      if (!downloadResp.ok) {
        const payloadText = await downloadResp.text();
        logger.error("serveCompletionPhoto download failed", {
          orderId,
          photoId,
          nasPath: resolvedNasPath,
          status: downloadResp.status,
          payloadText,
        });
        res.status(502).send("download failed");
        return;
      }

      const body = Buffer.from(await downloadResp.arrayBuffer());
      const contentType =
        downloadResp.headers.get("content-type") ||
        String(photoData.contentType || "application/octet-stream");

      res.set("Cache-Control", "private, max-age=120");
      res.set("Content-Type", contentType);
      res.set(
        "Content-Disposition",
        `inline; filename*=UTF-8''${encodeURIComponent(String(photoData.fileName || "photo"))}`,
      );
      res.status(200).send(body);
    } catch (error) {
      logger.error("serveCompletionPhoto failed", {
        orderId,
        photoId,
        nasPath,
        error: error?.message || String(error),
      });
      res.status(500).send("proxy failed");
    } finally {
      try {
        await synologyLogout(baseUrl, sid);
      } catch (_e) {
        // ignore logout failure
      }
    }
  },
);

exports.serveOrderPdf = onRequestV2(
  {
    secrets: [
      SYNO_USERNAME_SECRET,
      SYNO_PASSWORD_SECRET,
      NAS_PDF_API_KEY_SECRET,
    ],
    invoker: "public",
  },
  async (req, res) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }

    if (req.method !== "GET") {
      res.status(405).send("Method Not Allowed");
      return;
    }

    // Accept either a Firebase ID token (web app) or a static API key (GAS)
    const token = String(req.query.token || "").trim();
    const nasKey = String(req.query.nasKey || "").trim();

    if (!token && !nasKey) {
      res.status(401).send("missing token");
      return;
    }

    if (token) {
      // Firebase ID token path (EmployeeView)
      let uid;
      try {
        const decoded = await admin.auth().verifyIdToken(token);
        uid = decoded.uid;
      } catch (e) {
        res.status(401).send("invalid token");
        return;
      }
      const role = await readUserRole(uid);
      if (!role) {
        res.status(403).send("forbidden");
        return;
      }
    } else {
      // Static API key path (Google Apps Script)
      const expectedKey = String(NAS_PDF_API_KEY_SECRET.value() || "").trim();
      logger.info("serveOrderPdf nasKey check", {
        receivedLen: nasKey.length,
        expectedLen: expectedKey.length,
        receivedFirst4: nasKey.slice(0, 4),
        expectedFirst4: expectedKey.slice(0, 4),
      });
      if (!expectedKey || nasKey !== expectedKey) {
        res.status(401).send("invalid api key");
        return;
      }
    }

    const orderNumber = String(req.query.orderNumber || "").trim();
    if (!orderNumber) {
      res.status(400).send("missing orderNumber");
      return;
    }

    const db = admin.firestore();

    // Look up the order doc to get cached NAS folder path
    const orderQuerySnap = await db
      .collection("Orders")
      .where("訂單號碼", "==", orderNumber)
      .limit(1)
      .get();

    let nasOrderFolder = "";
    let orderDocId = "";
    let orderData = {};
    if (!orderQuerySnap.empty) {
      const orderDoc = orderQuerySnap.docs[0];
      orderDocId = orderDoc.id;
      orderData = orderDoc.data() || {};
      nasOrderFolder = String(orderData.nasOrderFolderPath || "").trim();
    }

    const baseUrl = buildSynologyBaseUrl();
    const { username, password } = getSynologyCredentials();
    if (!username || !password) {
      res.status(500).send("nas credentials missing");
      return;
    }

    let sid = "";
    try {
      sid = await synologyLogin(baseUrl, username, password);

      if (!nasOrderFolder) {
        const nasOrderPath = await getNasOrderPath();
        const pathCheck = validateSynologyDirPath(nasOrderPath);
        if (!pathCheck.ok) {
          res.status(500).send("invalid NAS order path");
          return;
        }

        const folderParts = await buildOrderNasFolderParts(
          orderDocId || "_unknown",
          { ...orderData, 訂單號碼: orderNumber },
        );

        const matchMeta = await resolveExistingOrderFolderPath({
          baseUrl,
          sid,
          basePath: pathCheck.normalized,
          customerFolder: folderParts.customerFolder,
          orderNumber,
          defaultDetailFolder: folderParts.detailFolder,
        });
        nasOrderFolder = matchMeta.uploadFolder;

        // Cache the resolved path for future requests
        if (orderDocId && matchMeta.matched) {
          db.collection("Orders")
            .doc(orderDocId)
            .update({ nasOrderFolderPath: nasOrderFolder })
            .catch(() => {});
        }
      }

      // List files in the order folder
      const entries = await synologyListFolderEntries({
        baseUrl,
        sid,
        folderPath: nasOrderFolder,
      });

      // Find PDF file(s) - prefer one containing the order number
      const pdfEntries = entries.filter((e) =>
        String(e?.name || "")
          .toLowerCase()
          .endsWith(".pdf"),
      );

      if (pdfEntries.length === 0) {
        res.status(404).send("找不到訂單 PDF 檔案");
        return;
      }

      const matchingPdf =
        pdfEntries.find((e) => String(e?.name || "").includes(orderNumber)) ||
        pdfEntries[0];

      const pdfPath =
        String(matchingPdf?.path || "").trim() ||
        `${nasOrderFolder}/${matchingPdf.name}`;

      const downloadResp = await synologyDownloadFile({
        baseUrl,
        sid,
        filePath: pdfPath,
      });

      if (!downloadResp.ok) {
        logger.error("serveOrderPdf download failed", {
          orderNumber,
          pdfPath,
          status: downloadResp.status,
        });
        res.status(502).send("download failed");
        return;
      }

      const body = Buffer.from(await downloadResp.arrayBuffer());
      const fileName = String(matchingPdf.name || `${orderNumber}.pdf`);

      res.set("Cache-Control", "private, max-age=120");
      res.set("Content-Type", "application/pdf");
      res.set(
        "Content-Disposition",
        `inline; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      );
      res.status(200).send(body);
    } catch (error) {
      logger.error("serveOrderPdf failed", {
        orderNumber,
        nasOrderFolder,
        error: error?.message || String(error),
        stack: error?.stack,
      });
      res
        .status(500)
        .send("proxy failed: " + (error?.message || String(error)));
    } finally {
      try {
        await synologyLogout(baseUrl, sid);
      } catch (_e) {
        // ignore logout failure
      }
    }
  },
);

exports.syncCompletionPhotoToNas = onDocumentWritten(
  {
    document: "Orders/{orderId}/completionPhotos/{photoId}",
    secrets: [SYNO_USERNAME_SECRET, SYNO_PASSWORD_SECRET],
  },
  async (event) => {
    const afterSnap = event.data?.after;
    if (!afterSnap || !afterSnap.exists) return;

    const beforeSnap = event.data?.before;
    const beforeData =
      beforeSnap && beforeSnap.exists ? beforeSnap.data() : null;
    const afterData = afterSnap.data() || {};

    const storagePath = String(afterData.storagePath || "").trim();
    const fileName = String(afterData.fileName || "").trim();
    if (!storagePath) return;

    if (
      beforeData &&
      beforeData.storagePath === storagePath &&
      String(beforeData.fileName || "").trim() === fileName
    ) {
      return;
    }

    const nasStoragePath = await getNasStoragePath();
    if (!nasStoragePath) {
      await afterSnap.ref.set(
        {
          nasSync: {
            status: "skipped",
            reason: "NAS 路徑未設定",
            checkedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
        },
        { merge: true },
      );
      return;
    }

    const baseUrl = buildSynologyBaseUrl();
    const { username, password } = getSynologyCredentials();
    if (!username || !password) {
      await afterSnap.ref.set(
        {
          nasSync: {
            status: "skipped",
            reason: "SYNO_USERNAME / SYNO_PASSWORD 未設定",
            checkedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
        },
        { merge: true },
      );
      return;
    }

    if (process.env.ENABLE_NAS_TEST !== "1") {
      await afterSnap.ref.set(
        {
          nasSync: {
            status: "skipped",
            reason: "ENABLE_NAS_TEST 未啟用",
            checkedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
        },
        { merge: true },
      );
      return;
    }

    const pathCheck = validateSynologyDirPath(nasStoragePath);
    if (!pathCheck.ok) {
      await afterSnap.ref.set(
        {
          nasSync: {
            status: "failed",
            error: pathCheck.reason,
            checkedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
        },
        { merge: true },
      );
      return;
    }
    const baseFolder = pathCheck.normalized;

    const folderParts = await buildOrderNasFolderParts(
      event.params.orderId,
      afterData,
    );
    const uploadFolder = `${baseFolder}/${folderParts.customerFolder}/${folderParts.detailFolder}`;
    const targetName = `${event.params.photoId}-${sanitizeFileName(fileName || "photo")}`;
    const targetPath = `${uploadFolder}/${targetName}`;
    const mimeType = String(
      afterData.contentType || "application/octet-stream",
    );

    let sid = "";
    try {
      const downloadResult = await admin
        .storage()
        .bucket()
        .file(storagePath)
        .download();
      const fileBuffer =
        downloadResult && downloadResult[0] ? downloadResult[0] : null;
      if (!fileBuffer || !fileBuffer.length) {
        throw new Error("從 Firebase Storage 下載檔案失敗");
      }

      sid = await synologyLogin(baseUrl, username, password);
      await synologyUploadFile({
        baseUrl,
        sid,
        targetPath: uploadFolder,
        fileBuffer,
        fileName: targetName,
        mimeType,
      });

      await afterSnap.ref.set(
        {
          nasSync: {
            status: "success",
            targetPath,
            syncedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
        },
        { merge: true },
      );
    } catch (error) {
      logger.error("syncCompletionPhotoToNas failed", {
        orderId: event.params.orderId,
        photoId: event.params.photoId,
        storagePath,
        error: error?.message || String(error),
        uploadFolder,
        baseUrl,
      });

      await afterSnap.ref.set(
        {
          nasSync: {
            status: "failed",
            error: error?.message || "NAS 同步失敗",
            checkedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
        },
        { merge: true },
      );
    } finally {
      try {
        await synologyLogout(baseUrl, sid);
      } catch (_e) {
        // ignore logout error
      }
    }
  },
);

exports.testNasWrite = onCall(async (payload, ctx) => {
  const auth = (ctx && ctx.auth) || payload.auth || null;
  const authUid = auth && auth.uid ? auth.uid : null;
  if (!authUid) {
    throw new functions.https.HttpsError("unauthenticated", "請先登入");
  }

  const role = await readUserRole(authUid);
  if (!["admin", "管理者"].includes(role)) {
    throw new functions.https.HttpsError(
      "permission-denied",
      "僅管理者可測試 NAS",
    );
  }

  const nasStoragePath = await getNasStoragePath();
  if (!nasStoragePath) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "請先在系統設定填入 NAS 儲存路徑",
    );
  }

  if (process.env.ENABLE_NAS_TEST !== "1") {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "目前未啟用 NAS 測試，請設定環境變數 ENABLE_NAS_TEST=1",
    );
  }

  const testDir = path.join(nasStoragePath, "_nas-test");
  const testFileName = `nas-test-${Date.now()}.txt`;
  const testFilePath = path.join(testDir, testFileName);
  const content = [
    "NAS write test from Firebase Functions",
    `time: ${new Date().toISOString()}`,
    `uid: ${authUid}`,
    `email: ${(auth && auth.token && auth.token.email) || ""}`,
  ].join("\n");

  await fs.promises.mkdir(testDir, { recursive: true });
  await fs.promises.writeFile(testFilePath, content, "utf8");

  return {
    ok: true,
    testFilePath,
  };
});

exports.testNasUploadPhoto = onCall(
  {
    secrets: [SYNO_USERNAME_SECRET, SYNO_PASSWORD_SECRET],
  },
  async (payload, ctx) => {
    const auth = (ctx && ctx.auth) || payload.auth || null;
    const authUid = auth && auth.uid ? auth.uid : null;
    if (!authUid) {
      throw new functions.https.HttpsError("unauthenticated", "請先登入");
    }

    const role = await readUserRole(authUid);
    if (!["admin", "管理者"].includes(role)) {
      throw new functions.https.HttpsError(
        "permission-denied",
        "僅管理者可測試 NAS 照片上傳",
      );
    }

    const nasStoragePath = await getNasStoragePath();
    if (!nasStoragePath) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "請先在系統設定填入 NAS 儲存路徑",
      );
    }

    const baseUrl = buildSynologyBaseUrl();
    const { username, password } = getSynologyCredentials();
    if (!username || !password) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "尚未設定 SYNO_USERNAME / SYNO_PASSWORD",
      );
    }

    if (process.env.ENABLE_NAS_TEST !== "1") {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "目前未啟用 NAS 測試，請設定環境變數 ENABLE_NAS_TEST=1",
      );
    }

    const body = payload && payload.data ? payload.data : payload || {};
    const fileName =
      sanitizeFileName(body.fileName || "test-photo.jpg") || "test-photo.jpg";
    const dataUrl = String(body.dataUrl || "");
    if (!dataUrl.startsWith("data:image/")) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "請提供圖片格式的 dataUrl",
      );
    }

    const dataUrlMatch = dataUrl.match(
      /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/,
    );
    if (!dataUrlMatch) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "圖片資料格式錯誤",
      );
    }

    const mimeType = dataUrlMatch[1];
    const base64 = dataUrlMatch[2];
    const fileBuffer = Buffer.from(base64, "base64");
    if (!fileBuffer.length) {
      throw new functions.https.HttpsError("invalid-argument", "圖片內容為空");
    }

    const maxBytes = 6 * 1024 * 1024;
    if (fileBuffer.length > maxBytes) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "測試圖片過大，請使用 6MB 以下圖片",
      );
    }

    const pathCheck = validateSynologyDirPath(nasStoragePath);
    if (!pathCheck.ok) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        pathCheck.reason,
      );
    }
    const baseFolder = pathCheck.normalized;

    const uploadFolder = `${baseFolder}/_nas-test/photos`;
    const targetName = `${Date.now()}-${fileName}`;
    let sid = "";
    try {
      sid = await synologyLogin(baseUrl, username, password);
      await synologyUploadFile({
        baseUrl,
        sid,
        targetPath: uploadFolder,
        fileBuffer,
        fileName: targetName,
        mimeType,
      });
    } catch (error) {
      logger.error("testNasUploadPhoto failed", {
        error: error?.message || String(error),
        uploadFolder,
        baseUrl,
        uid: authUid,
      });
      throw new functions.https.HttpsError(
        "internal",
        error?.message || "上傳測試照片到 Synology 失敗",
      );
    } finally {
      try {
        await synologyLogout(baseUrl, sid);
      } catch (_e) {
        // ignore logout failure
      }
    }

    return {
      ok: true,
      targetPath: `${uploadFolder}/${targetName}`,
      size: fileBuffer.length,
    };
  },
);

// utility that generates tokens from a string (lowercased)
function generateTokens(str) {
  const tokens = new Set();
  if (!str) return tokens;
  const s = str.toString().toLowerCase();
  // split on whitespace and punctuation
  const words = s.split(/\s+/);
  words.forEach((w) => {
    const len = w.length;
    for (let i = 1; i <= len; i++) {
      // prefix
      tokens.add(w.slice(0, i));
      // any substring of length i
      for (let j = 0; j + i <= len; j++) {
        tokens.add(w.slice(j, j + i));
      }
    }
  });
  return tokens;
}

// Firestore trigger: maintain searchKeywords array on Orders docs
exports.indexOrder = onDocumentWritten("Orders/{orderId}", async (event) => {
  const after = event.data?.after;
  if (!after || !after.exists) return;

  const data = after.data();
  const tokens = new Set();
  function addField(val) {
    generateTokens(val).forEach((t) => tokens.add(t));
  }
  addField(data.顏色);
  addField(data.客戶名稱);
  addField(data.安裝地點);
  addField(data["訂單號碼"]);
  // add other fields as needed

  await after.ref.set({ searchKeywords: Array.from(tokens) }, { merge: true });
});

// Callable function: search by keyword (for frontend interoperability)
exports.searchOrdersByKeyword = onCall(async (payload, ctx) => {
  const accessCtx = await getCallableAccessContext(payload, ctx);
  const qRaw = payload.data?.q ?? payload.q ?? "";
  const q = qRaw.toString().toLowerCase().trim();
  if (!q) return [];
  const snap = await admin
    .firestore()
    .collection("Orders")
    .where("searchKeywords", "array-contains", q)
    .limit(100)
    .get();
  const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  return filterOrdersByAccess(rows, accessCtx);
});

// Callable function: search by multiple fields (AND)
exports.searchOrdersByFields = onCall(async (payload, ctx) => {
  const accessCtx = await getCallableAccessContext(payload, ctx);
  const color = payload.data?.color?.toString().trim();
  const customer = payload.data?.customer?.toString().trim();
  const address = payload.data?.address?.toString().trim();
  const orderNo = payload.data?.orderNo?.toString().trim();
  let query = admin.firestore().collection("Orders");
  if (color) query = query.where("顏色", "==", color);
  if (customer) query = query.where("客戶名稱", "==", customer);
  if (address) query = query.where("安裝地點", "==", address);
  if (orderNo) query = query.where("訂單號碼", "==", orderNo);
  const snap = await query.limit(100).get();
  const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  return filterOrdersByAccess(rows, accessCtx);
});

// Callable function: search by multiple keywords (交集 AND)
exports.searchOrdersByKeywords = onCall(async (payload, ctx) => {
  const accessCtx = await getCallableAccessContext(payload, ctx);
  // 支援多個關鍵字，payload.data.keywords 應為陣列
  const keywords = (payload.data?.keywords || [])
    .map((k) => k && k.toString().toLowerCase().trim())
    .filter((k) => !!k);
  if (!keywords.length) return [];
  // 先查第一個關鍵字
  let query = admin
    .firestore()
    .collection("Orders")
    .where("searchKeywords", "array-contains", keywords[0]);
  const snap = await query.limit(100).get();
  let docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  // 其餘關鍵字在後端做交集
  for (let i = 1; i < keywords.length; i++) {
    const kw = keywords[i];
    docs = docs.filter(
      (doc) =>
        Array.isArray(doc.searchKeywords) && doc.searchKeywords.includes(kw),
    );
  }
  return filterOrdersByAccess(docs, accessCtx);
});

// callable function for one‑time backfill of existing Orders documents
// WARNING: call only once, may run for a long time depending on dataset size
exports.backfillOrderKeywords = onCall(async (payload, ctx) => {
  const db = admin.firestore();
  const col = db.collection("Orders");
  let last = null;
  const batchSize = 500;
  while (true) {
    let q = col
      .orderBy(admin.firestore.FieldPath.documentId())
      .limit(batchSize);
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    if (snap.empty) break;
    const batch = db.batch();
    snap.docs.forEach((doc) => {
      const data = doc.data();
      const tokens = new Set();
      function addField(val) {
        generateTokens(val).forEach((t) => tokens.add(t));
      }
      addField(data.顏色);
      addField(data.客戶名稱);
      addField(data.地址);
      addField(data["訂單號碼"]);
      batch.set(
        doc.ref,
        { searchKeywords: Array.from(tokens) },
        { merge: true },
      );
    });
    await batch.commit();
    last = snap.docs[snap.docs.length - 1];
    // small delay to avoid contention
    await new Promise((r) => setTimeout(r, 100));
  }
  return { status: "done" };
});
// diagnostic function: fetch first order and return its keywords
exports.debugSampleOrder = onCall(async (payload, ctx) => {
  const db = admin.firestore();
  const snap = await db.collection("Orders").limit(1).get();
  if (snap.empty) {
    return { found: false };
  }
  const doc = snap.docs[0];
  return { id: doc.id, data: doc.data() };
});

function normalizePendingHeader(value) {
  return String(value || "")
    .replace(/\r?\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getByAliases(source, aliases = []) {
  if (!source || typeof source !== "object") return "";
  for (const alias of aliases) {
    if (!(alias in source)) continue;
    const v = source[alias];
    if (v === undefined || v === null) continue;
    const s = String(v)
      .replace(/[\u0000-\u001F\u007F]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (s) return s;
  }
  return "";
}

function buildMinimalPendingData(data = {}) {
  return {
    orderNo: String(data.orderNo || "").trim(),
    customerName: String(data.customerName || "").trim(),
    customerPhone: String(data.customerPhone || "").trim(),
    installAddress: String(data.installAddress || "").trim(),
    dueDate: String(data.dueDate || "").trim(),
    orderDate: String(data.orderDate || "").trim(),
    salesAmount: String(data.salesAmount || "").trim(),
    color: String(data.color || "").trim(),
    stoneBrand: String(data.stoneBrand || "").trim(),
    cutBoardTime: String(data.cutBoardTime || "").trim(),
    cutBoardBy: String(data.cutBoardBy || "").trim(),
    waterjetTime: String(data.waterjetTime || "").trim(),
    waterjetBy: String(data.waterjetBy || "").trim(),
    acceptanceTime: String(data.acceptanceTime || "").trim(),
    acceptanceBy: String(data.acceptanceBy || "").trim(),
    status: "pending",
    source: "pending-sheet",
    sourceUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
}

function buildNoKeywordPendingData(data = {}) {
  const copy = { ...(data || {}) };
  delete copy.searchKeywords;
  return copy;
}

function mapPendingRow(raw) {
  const row = {};
  for (const key of Object.keys(raw || {})) {
    row[normalizePendingHeader(key)] = raw[key];
  }

  const orderNo = getByAliases(row, ["訂單號碼"]);
  if (!orderNo) return null;

  const customerName = getByAliases(row, ["客戶名稱"]);
  const customerPhone = getByAliases(row, ["客戶電話"]);
  const installAddress = getByAliases(row, ["安裝地點"]);
  const dueDate = getByAliases(row, ["預交日"]);

  const tokens = new Set();
  [orderNo, customerName, customerPhone, installAddress]
    .filter(Boolean)
    .forEach((s) => {
      generateTokens(s).forEach((t) => {
        const token = String(t || "").trim();
        if (!token) return;
        if (token.length > 24) return;
        if (tokens.size >= 1200) return;
        tokens.add(token);
      });
    });

  const docId = orderNo.replace(/\//g, "_").trim();

  return {
    docId,
    data: {
      orderNo,
      orderDate: getByAliases(row, ["下單日"]),
      dueDate,
      salesAmount: getByAliases(row, ["銷售額"]),
      category: getByAliases(row, ["類別"]),
      customerCode: getByAliases(row, ["客戶代碼"]),
      customerName,
      customerPhone,
      customerFax: getByAliases(row, ["客戶傳真"]),
      installAddress,
      stoneBrand: getByAliases(row, ["石材品牌"]),
      color: getByAliases(row, ["顏色"]),
      sinkModel1: getByAliases(row, ["水槽1型號"]),
      sinkMethod1: getByAliases(row, ["水槽1工法"]),
      stoveModel1: getByAliases(row, ["爐子型號1"]),
      stoveCutSize1: getByAliases(row, ["挖孔尺寸1"]),
      stoveMethod1: getByAliases(row, ["爐子1 工法", "爐子1工法"]),
      owner: getByAliases(row, ["業主"]),
      ownerPhone: getByAliases(row, ["業主電話"]),
      salesName: getByAliases(row, ["業務名稱"]),
      salesPhone: getByAliases(row, ["業務電話"]),
      countertopCm: getByAliases(row, ["台面 cm數", "台面cm數"]),
      cutBoardTime: getByAliases(row, ["裁板時間", "裁切時間"]),
      cutBoardBy: getByAliases(row, ["裁板者", "裁切者"]),
      waterjetTime: getByAliases(row, ["水刀時間"]),
      waterjetBy: getByAliases(row, ["水刀手", "水刀者"]),
      acceptanceTime: getByAliases(row, ["驗收時間"]),
      acceptanceBy: getByAliases(row, ["驗收者"]),
      status: "pending",
      source: "pending-sheet",
      searchKeywords: Array.from(tokens),
      sourceUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
  };
}

async function commitOpsInBatches(ops, chunkSize = 450) {
  if (!ops.length) return;
  const db = admin.firestore();
  for (let i = 0; i < ops.length; i += chunkSize) {
    const batch = db.batch();
    const chunk = ops.slice(i, i + chunkSize);
    chunk.forEach((op) => {
      if (op.type === "set") {
        batch.set(op.ref, op.data, { merge: true });
      } else if (op.type === "delete") {
        batch.delete(op.ref);
      }
    });
    try {
      await batch.commit();
    } catch (batchErr) {
      logger.error("Pending batch commit failed, fallback to per-op", {
        error: String(batchErr?.message || batchErr),
        chunkStart: i,
        chunkSize: chunk.length,
      });

      // Fallback to per-op commits to identify exact failing record.
      for (const op of chunk) {
        try {
          const single = db.batch();
          if (op.type === "set") {
            single.set(op.ref, op.data, { merge: true });
          } else {
            single.delete(op.ref);
          }
          await single.commit();
        } catch (singleErr) {
          // First retry without searchKeywords to preserve business fields.
          if (op.type === "set") {
            try {
              const noKeyword = buildNoKeywordPendingData(op.data || {});
              const singleNoKeyword = db.batch();
              singleNoKeyword.set(op.ref, noKeyword, { merge: true });
              await singleNoKeyword.commit();
              logger.warn(
                "Pending single-op recovered without searchKeywords",
                {
                  docPath: op.ref?.path || "",
                  orderNo: op.meta?.orderNo || "",
                },
              );
              continue;
            } catch (noKeywordErr) {
              logger.error("Pending no-keyword retry failed", {
                docPath: op.ref?.path || "",
                orderNo: op.meta?.orderNo || "",
                error: String(noKeywordErr?.message || noKeywordErr),
              });
            }
          }

          // Last resort: use minimal payload so one bad optional field does not block sync.
          if (op.type === "set") {
            try {
              const minimal = buildMinimalPendingData(op.data || {});
              const singleMinimal = db.batch();
              singleMinimal.set(op.ref, minimal, { merge: true });
              await singleMinimal.commit();
              logger.warn("Pending single-op recovered with minimal payload", {
                docPath: op.ref?.path || "",
                orderNo: op.meta?.orderNo || "",
              });
              continue;
            } catch (retryErr) {
              logger.error("Pending minimal retry failed", {
                docPath: op.ref?.path || "",
                orderNo: op.meta?.orderNo || "",
                error: String(retryErr?.message || retryErr),
              });
            }
          }

          const context = {
            type: op.type,
            docPath: op.ref?.path || "",
            orderNo: op.meta?.orderNo || "",
            error: String(singleErr?.message || singleErr),
          };
          logger.error("Pending single-op failed", context);
          const e = new Error(
            `Pending sync invalid record: ${JSON.stringify(context)}`,
          );
          e.cause = singleErr;
          throw e;
        }
      }
    }
  }
}

async function runPendingSync({
  rows = [],
  removeOrderNos = [],
  fullReplace = false,
}) {
  const db = admin.firestore();
  const col = db.collection("PendingOrders");
  const ops = [];
  const keepIds = new Set();
  let upserted = 0;
  let skipped = 0;

  for (const raw of rows) {
    const mapped = mapPendingRow(raw);
    if (!mapped) {
      skipped += 1;
      continue;
    }
    keepIds.add(mapped.docId);
    ops.push({
      type: "set",
      ref: col.doc(mapped.docId),
      data: mapped.data,
      meta: { orderNo: mapped.data.orderNo, docId: mapped.docId },
    });
    upserted += 1;
  }

  let removed = 0;
  for (const no of removeOrderNos) {
    const orderNo = String(no || "").trim();
    if (!orderNo) continue;
    ops.push({
      type: "delete",
      ref: col.doc(orderNo.replace(/\//g, "_")),
      meta: { orderNo, docId: orderNo.replace(/\//g, "_") },
    });
    removed += 1;
  }

  if (fullReplace) {
    const snap = await col.get();
    snap.docs.forEach((doc) => {
      if (keepIds.has(doc.id)) return;
      ops.push({
        type: "delete",
        ref: doc.ref,
        meta: { orderNo: doc.data()?.orderNo || "", docId: doc.id },
      });
      removed += 1;
    });
  }

  await commitOpsInBatches(ops);
  return {
    ok: true,
    upserted,
    skipped,
    removed,
    fullReplace,
    totalOps: ops.length,
  };
}

async function verifyPendingSyncToken(token) {
  const input = String(token || "").trim();
  if (!input) return false;
  const snap = await admin
    .firestore()
    .collection("SystemSettings")
    .doc("general")
    .get();
  const expected = snap.exists
    ? String(snap.data()?.pendingSyncToken || "").trim()
    : "";
  if (!expected) return false;
  return input === expected;
}

// Callable entry for app-side manual sync.
exports.syncPendingOrders = onCall(
  {
    timeoutSeconds: 540,
    memory: "512MiB",
  },
  async (payload, ctx) => {
    if (!ctx.auth?.uid) {
      throw new functions.https.HttpsError("unauthenticated", "請先登入");
    }
    const role = await readUserRole(ctx.auth.uid);
    if (
      !["admin", "manager", "employee", "管理者", "員工"].includes(role || "")
    ) {
      throw new functions.https.HttpsError("permission-denied", "權限不足");
    }
    const rows = Array.isArray(payload.data?.rows) ? payload.data.rows : [];
    const removeOrderNos = Array.isArray(payload.data?.removeOrderNos)
      ? payload.data.removeOrderNos
      : [];
    const fullReplace = !!payload.data?.fullReplace;
    return runPendingSync({ rows, removeOrderNos, fullReplace });
  },
);

// HTTP webhook entry for Google Apps Script scheduled sync.
exports.syncPendingOrdersHttp = onRequest(
  {
    timeoutSeconds: 540,
    memory: "512MiB",
  },
  async (req, res) => {
    if (req.method === "OPTIONS") {
      res.set("Access-Control-Allow-Origin", "*");
      res.set("Access-Control-Allow-Headers", "content-type,x-sync-token");
      res.set("Access-Control-Allow-Methods", "POST,OPTIONS");
      res.status(204).send("");
      return;
    }
    res.set("Access-Control-Allow-Origin", "*");
    if (req.method !== "POST") {
      res.status(405).json({ ok: false, error: "Method Not Allowed" });
      return;
    }

    try {
      const token =
        req.get("x-sync-token") || req.query?.token || req.body?.token;
      const tokenValid = await verifyPendingSyncToken(token);
      if (!tokenValid) {
        res.status(401).json({ ok: false, error: "Unauthorized" });
        return;
      }

      const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
      const removeOrderNos = Array.isArray(req.body?.removeOrderNos)
        ? req.body.removeOrderNos
        : [];
      const fullReplace = !!req.body?.fullReplace;
      const result = await runPendingSync({
        rows,
        removeOrderNos,
        fullReplace,
      });
      res.json(result);
    } catch (e) {
      logger.error("syncPendingOrdersHttp failed", {
        error: String(e?.message || e),
      });
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  },
);

// Callable: search PendingOrders by one keyword.
exports.searchPendingOrdersByKeyword = onCall(async (payload, ctx) => {
  await assertStaffRole(getCallableAuthUid(payload, ctx));
  const qRaw = payload.data?.q ?? payload.q ?? "";
  const q = String(qRaw).toLowerCase().trim();
  if (!q) return [];

  const snap = await admin
    .firestore()
    .collection("PendingOrders")
    .where("searchKeywords", "array-contains", q)
    .limit(100)
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
});

// Callable: search PendingOrders by multiple keywords (AND intersection).
exports.searchPendingOrdersByKeywords = onCall(async (payload, ctx) => {
  await assertStaffRole(getCallableAuthUid(payload, ctx));
  const keywords = (payload.data?.keywords || [])
    .map((k) =>
      String(k || "")
        .toLowerCase()
        .trim(),
    )
    .filter(Boolean);
  if (!keywords.length) return [];

  const snap = await admin
    .firestore()
    .collection("PendingOrders")
    .where("searchKeywords", "array-contains", keywords[0])
    .limit(200)
    .get();

  let docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  for (let i = 1; i < keywords.length; i++) {
    const kw = keywords[i];
    docs = docs.filter(
      (doc) =>
        Array.isArray(doc.searchKeywords) && doc.searchKeywords.includes(kw),
    );
  }
  return docs.slice(0, 100);
});

// ─── 列出 NAS 訂單資料夾內的舊有照片（尚未透過本系統上傳者）─────────────────
const NAS_LEGACY_IMAGE_EXTS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".webp",
  ".bmp",
  ".heic",
  ".heif",
  ".tif",
  ".tiff",
]);
const NAS_LEGACY_VIDEO_EXTS = new Set([
  ".mp4",
  ".mov",
  ".avi",
  ".mkv",
  ".webm",
]);

exports.listNasLegacyPhotos = onCall(
  {
    secrets: [
      SYNO_USERNAME_SECRET,
      SYNO_PASSWORD_SECRET,
      PHOTO_URL_SIGNING_SECRET,
    ],
  },
  async (payload, ctx) => {
    const authUid = getCallableAuthUid(payload, ctx);
    await assertStaffRole(authUid);

    const data = unwrapCallablePayload(payload);
    const orderNumber = String(data.orderNumber || "").trim();
    const customerName = String(data.customerName || "").trim();
    const color = String(data.color || "").trim();
    const installAddress = String(data.installAddress || "").trim();
    if (!orderNumber) {
      throw new functions.https.HttpsError("invalid-argument", "缺少訂單號碼");
    }

    const nasStoragePath = await getNasOrderPath();
    if (!nasStoragePath) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "請先在系統設定填入 NAS 儲存路徑",
      );
    }
    const pathCheck = validateSynologyDirPath(nasStoragePath);
    if (!pathCheck.ok) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        pathCheck.reason,
      );
    }

    const baseUrl = buildSynologyBaseUrl();
    const { username, password } = getSynologyCredentials();
    if (!username || !password) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "尚未設定 NAS 帳號 / 密碼",
      );
    }

    const secret = getPhotoSigningSecret();
    if (!secret) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "尚未設定 PHOTO_URL_SIGNING_SECRET",
      );
    }

    let sid = "";
    try {
      sid = await synologyLogin(baseUrl, username, password);

      const matchMeta = await resolveExistingOrderFolderPath({
        baseUrl,
        sid,
        basePath: pathCheck.normalized,
        customerFolder: customerName || "unknown",
        orderNumber,
        defaultDetailFolder: [orderNumber, color, installAddress]
          .filter(Boolean)
          .join(" "),
      });

      if (!matchMeta.matched) {
        return {
          found: false,
          files: [],
          message: `未找到訂單 ${orderNumber} 的 NAS 資料夾`,
        };
      }

      const projectId =
        String(
          process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || "",
        ).trim() || "jh-stone";
      const serveBase = `https://asia-east1-${projectId}.cloudfunctions.net/serveNasLegacyPhoto`;

      const EXP_MS = Date.now() + 2 * 60 * 60 * 1000; // 2 hours

      // 遞迴收集訂單資料夾及所有子目錄下的圖片/影片
      const files = [];
      const stack = [matchMeta.uploadFolder];
      while (stack.length > 0) {
        const currentFolder = stack.pop();
        let entries = [];
        try {
          entries = await synologyListFolderEntries({
            baseUrl,
            sid,
            folderPath: currentFolder,
          });
        } catch (e) {
          logger.warn("listNasLegacyPhotos: list folder failed", {
            folder: currentFolder,
            error: e?.message,
          });
          continue;
        }
        for (const entry of entries) {
          if (entry.isdir) {
            stack.push(String(entry.path || `${currentFolder}/${entry.name}`));
            continue;
          }
          const name = String(entry.name || "");
          const dotIdx = name.lastIndexOf(".");
          const ext = dotIdx >= 0 ? name.slice(dotIdx).toLowerCase() : "";
          if (
            !NAS_LEGACY_IMAGE_EXTS.has(ext) &&
            !NAS_LEGACY_VIDEO_EXTS.has(ext)
          )
            continue;

          const nasPath = String(entry.path || `${currentFolder}/${name}`);
          const token = createPhotoAccessToken(
            { nasPath, exp: EXP_MS },
            secret,
          );
          const url = `${serveBase}?token=${encodeURIComponent(token)}`;
          files.push({
            fileName: name,
            nasPath,
            isVideo: NAS_LEGACY_VIDEO_EXTS.has(ext),
            url,
          });
        }
      }

      return {
        found: true,
        folderPath: matchMeta.uploadFolder,
        folderName: matchMeta.matchedFolderName,
        files,
      };
    } catch (err) {
      if (err instanceof functions.https.HttpsError) throw err;
      logger.error("listNasLegacyPhotos error", {
        error: err?.message || String(err),
      });
      throw new functions.https.HttpsError(
        "internal",
        err?.message || "列出 NAS 照片失敗",
      );
    } finally {
      try {
        await synologyLogout(baseUrl, sid);
      } catch (_) {}
    }
  },
);

// ─── 代理 NAS 舊有照片（以 signed token 保護）──────────────────────────────
exports.serveNasLegacyPhoto = onRequestV2(
  {
    secrets: [
      SYNO_USERNAME_SECRET,
      SYNO_PASSWORD_SECRET,
      PHOTO_URL_SIGNING_SECRET,
    ],
  },
  async (req, res) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }
    if (req.method !== "GET") {
      res.status(405).send("Method Not Allowed");
      return;
    }

    const token = String(req.query.token || "").trim();
    if (!token) {
      res.status(400).send("missing token");
      return;
    }

    const secret = getPhotoSigningSecret();
    if (!secret) {
      res.status(500).send("signing secret missing");
      return;
    }

    let payload;
    try {
      payload = verifyPhotoAccessToken(token, secret);
    } catch (e) {
      res.status(401).send(e?.message || "invalid token");
      return;
    }

    const nasPath = String(payload?.nasPath || "").trim();
    if (!nasPath) {
      res.status(400).send("invalid token payload");
      return;
    }

    const baseUrl = buildSynologyBaseUrl();
    const { username, password } = getSynologyCredentials();
    if (!username || !password) {
      res.status(500).send("nas credentials missing");
      return;
    }

    let sid = "";
    try {
      sid = await synologyLogin(baseUrl, username, password);
      const downloadResp = await synologyDownloadFile({
        baseUrl,
        sid,
        filePath: nasPath,
      });

      if (!downloadResp.ok) {
        res.status(502).send("download failed");
        return;
      }

      const body = Buffer.from(await downloadResp.arrayBuffer());
      const contentType =
        downloadResp.headers.get("content-type") || "application/octet-stream";
      const fileName = nasPath.split("/").pop() || "photo";

      res.set("Cache-Control", "private, max-age=7200");
      res.set("Content-Type", contentType);
      res.set(
        "Content-Disposition",
        `inline; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      );
      res.status(200).send(body);
    } catch (error) {
      logger.error("serveNasLegacyPhoto failed", {
        nasPath,
        error: error?.message || String(error),
      });
      res.status(500).send("proxy failed");
    } finally {
      try {
        await synologyLogout(baseUrl, sid);
      } catch (_e) {}
    }
  },
);

// ─── 將放錯位置的訂單照片搬回正確資料夾 ──────────────────────────────────────
exports.migrateMisplacedOrderPhotos = onCall(
  {
    secrets: [SYNO_USERNAME_SECRET, SYNO_PASSWORD_SECRET],
    timeoutSeconds: 3600,
  },
  async (payload, ctx) => {
    const authUid = getCallableAuthUid(payload, ctx);
    const role = await readUserRole(authUid);
    if (!["admin", "管理者"].includes(role)) {
      throw new functions.https.HttpsError(
        "permission-denied",
        "僅管理者可執行",
      );
    }

    const data = unwrapCallablePayload(payload);
    const targetBasePath = String(data.targetBasePath || "").trim();
    const dryRun = data.dryRun !== false;
    const scanOnly = data.scanOnly === true; // 僅掃描來源，抽出訂單號碼，不搜目標

    const srcCheck = validateSynologyDirPath(
      String(data.sourceFolderPath || "").trim(),
    );
    if (!srcCheck.ok || !srcCheck.normalized) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        srcCheck.ok ? "缺少來源路徑" : `來源路徑無效：${srcCheck.reason}`,
      );
    }
    const sourceFolderPath = srcCheck.normalized;

    if (!scanOnly && !targetBasePath) {
      throw new functions.https.HttpsError("invalid-argument", "缺少目標路徑");
    }

    let pathCheck = { ok: true, normalized: targetBasePath };
    if (!scanOnly) {
      pathCheck = validateSynologyDirPath(targetBasePath);
      if (!pathCheck.ok) {
        throw new functions.https.HttpsError(
          "failed-precondition",
          pathCheck.reason,
        );
      }
    }

    const baseUrl = buildSynologyBaseUrl();
    const { username, password } = getSynologyCredentials();
    if (!username || !password) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "尚未設定 NAS 帳號 / 密碼",
      );
    }

    const report = [];
    let movedCount = 0;
    let errorCount = 0;

    let sid = "";
    try {
      sid = await synologyLogin(baseUrl, username, password);

      // Step 1: 掃描來源資料夾，收集所有訂單子目錄（兩層：客戶/訂單）
      let customerDirs = [];
      try {
        customerDirs = (
          await synologyListFolderEntries({
            baseUrl,
            sid,
            folderPath: sourceFolderPath,
          })
        ).filter((e) => e?.isdir);
      } catch (e) {
        throw new functions.https.HttpsError(
          "not-found",
          `來源資料夾無法存取（${sourceFolderPath}）：${e?.message || String(e)}`,
        );
      }

      const sourceFlatOrders = []; // { orderDir, customerDirPath }
      for (const customerDir of customerDirs) {
        let orderDirs = [];
        try {
          orderDirs = (
            await synologyListFolderEntries({
              baseUrl,
              sid,
              folderPath: customerDir.path,
            })
          ).filter((e) => e?.isdir);
        } catch (_) {
          continue;
        }
        for (const od of orderDirs) {
          sourceFlatOrders.push({
            orderDir: od,
            customerDirPath: customerDir.path,
          });
        }
      }

      if (sourceFlatOrders.length === 0) {
        return { dryRun, movedCount: 0, errorCount: 0, report: [] };
      }

      // 訂單號碼抽取：資料夾命名 = [訂單編號] [顏色] [其他]，以空白隔開
      // 訂單編號格式：NNNNN[XXX] 或 NNNNN-suffix[XXX]，如 27159ACU / 26260-15ACU / 27239-1ACU
      function extractOrderNumber(folderName) {
        const token = String(folderName || "").split(/\s+/)[0]; // 第一個空白前的 token
        // 5碼數字 + 任意非英文字母（含中文、-N等後綴） + 3碼英文
        // 涵蓋：27159ACU / 26260-15ACU / 27239-1ACU / 26803補BNJ
        const m = token.match(/(\d{5})[^A-Za-z]*([A-Z]{3})/i);
        if (m) return (m[1] + m[2]).toUpperCase();
        return "";
      }

      // scanOnly 模式：只回傳來源資料夾清單與抽出的訂單號碼，不搜目標
      if (scanOnly) {
        const scanReport = sourceFlatOrders.map(({ orderDir }) => {
          const name = String(orderDir.name || "");
          const orderNumber = extractOrderNumber(name);
          return {
            orderFolder: name,
            srcPath: String(orderDir.path || ""),
            orderNumber,
          };
        });
        return { scanOnly: true, total: scanReport.length, report: scanReport };
      }

      // Step 2: 按客戶代碼分組 → 每個客戶代碼只呼叫一次 listOrderFoldersParallel，
      //         結果快取在記憶體內比對，避免重複掃描整個目標目錄。
      const orderNumberMap = new Map(); // orderDir.path → { orderDir, orderNumber }
      const customerGroups = new Map(); // customerCode → [{ orderDir, orderNumber }]

      for (const { orderDir } of sourceFlatOrders) {
        const orderFolderName = String(orderDir.name || "");
        const orderNumber = extractOrderNumber(orderFolderName);
        const customerCode =
          orderNumber.match(/[A-Z]{3}$/)?.[0]?.toUpperCase() || "__none__";
        orderNumberMap.set(String(orderDir.path), { orderDir, orderNumber });
        if (!customerGroups.has(customerCode))
          customerGroups.set(customerCode, []);
        customerGroups.get(customerCode).push({ orderDir, orderNumber });
      }

      // 目標目錄 level-1 只掃一次，快取在記憶體，避免每個客戶代碼重複掃 1141 筆
      let targetLevel1Dirs = [];
      try {
        const entries = await synologyListFolderEntries({
          baseUrl,
          sid,
          folderPath: pathCheck.normalized,
        });
        targetLevel1Dirs = entries.filter((e) => e?.isdir);
        logger.info("migrateMisplacedOrderPhotos: target level1 loaded", {
          count: targetLevel1Dirs.length,
        });
      } catch (e) {
        logger.warn("migrateMisplacedOrderPhotos: target level1 scan failed", {
          error: e?.message,
        });
      }

      // 依客戶代碼在記憶體篩選 level-1，再展開 level-2（及 level-3）
      async function getTargetFoldersForCode(customerCode) {
        const customerNumber = CUSTOMER_CODE_LOOKUP[customerCode] || "";
        // 同一客戶可能有多個命名方式的 level-1 資料夾（如 817-02BFB 和 817+集昌祥(南嵌)...）
        // 必須聯集，不能互斥：先找含代碼的，再找含編號的，合併去重
        const byCode = targetLevel1Dirs.filter((e) =>
          String(e.name || "")
            .toUpperCase()
            .includes(customerCode),
        );
        const byNumber = customerNumber
          ? (() => {
              const numStr = String(customerNumber).replace(/^0+/, "");
              return targetLevel1Dirs.filter((e) =>
                String(e.name || "").includes(numStr),
              );
            })()
          : [];
        // 合併去重（以 path 為 key）
        const seen = new Set(byCode.map((e) => e.path));
        const clientFolders = [
          ...byCode,
          ...byNumber.filter((e) => !seen.has(e.path)),
        ];
        if (clientFolders.length === 0) return [];

        // 展開 level-2 與 level-3（同 listOrderFoldersParallel 的邏輯）
        const level2Results = await Promise.all(
          clientFolders.slice(0, 10).map(async (cf) => {
            try {
              const entries = await synologyListFolderEntries({
                baseUrl,
                sid,
                folderPath: cf.path,
              });
              const level2Dirs = entries.filter((e) => e?.isdir);
              const level3Results = await Promise.all(
                level2Dirs.map(async (sub) => {
                  try {
                    const subs = await synologyListFolderEntries({
                      baseUrl,
                      sid,
                      folderPath: sub.path,
                    });
                    return subs.filter((e) => e?.isdir);
                  } catch {
                    return [];
                  }
                }),
              );
              return [...level2Dirs, ...level3Results.flat()];
            } catch {
              return [];
            }
          }),
        );
        return level2Results.flat();
      }

      // 每個客戶代碼依序取目標資料夾（level-1 已在記憶體，只需再做 level-2/3）
      const resolved = [];
      for (const [customerCode, orders] of customerGroups) {
        let targetFolders = [];
        if (customerCode !== "__none__") {
          try {
            targetFolders = await getTargetFoldersForCode(customerCode);
            logger.info("migrateMisplacedOrderPhotos: targetFolders loaded", {
              customerCode,
              count: targetFolders.length,
            });
          } catch (e) {
            logger.warn(
              "migrateMisplacedOrderPhotos: getTargetFolders failed",
              {
                customerCode,
                error: e?.message,
              },
            );
          }
        }

        for (const { orderDir, orderNumber } of orders) {
          if (!orderNumber || targetFolders.length === 0) {
            resolved.push({
              orderDir,
              orderNumber,
              destPath: "",
              matched: false,
            });
            continue;
          }
          // 在記憶體內比對（包含訂單號即為命中）
          const best = targetFolders.find((f) => {
            const p = String(f.path || "");
            return (
              String(f.name || "")
                .toUpperCase()
                .includes(orderNumber) && !p.startsWith(sourceFolderPath)
            );
          });
          if (best) {
            resolved.push({
              orderDir,
              orderNumber,
              destPath: String(best.path || ""),
              matched: true,
            });
          } else {
            resolved.push({
              orderDir,
              orderNumber,
              destPath: "",
              matched: false,
            });
          }
        }
      }

      // Step 3: 依序搬移檔案（避免同時打太多 CopyMove 工作）
      for (const { orderDir, orderNumber, destPath, matched } of resolved) {
        const orderFolderName = String(orderDir.name || "");
        const srcPath = String(orderDir.path || "");

        if (!matched) {
          report.push({
            orderFolder: orderFolderName,
            orderNumber,
            srcPath,
            destPath: "",
            status: "not_found",
          });
          continue;
        }

        // 預覽模式：不遞迴掃檔，只確認來源/目標
        if (dryRun) {
          report.push({
            orderFolder: orderFolderName,
            orderNumber,
            srcPath,
            destPath,
            status: "dry_run",
          });
          continue;
        }

        // 遞迴收集來源資料夾所有檔案
        const filePaths = [];
        const stack = [srcPath];
        while (stack.length) {
          const cur = stack.pop();
          let entries = [];
          try {
            entries = await synologyListFolderEntries({
              baseUrl,
              sid,
              folderPath: cur,
            });
          } catch (_) {
            continue;
          }
          for (const e of entries) {
            if (e?.isdir) stack.push(String(e.path || `${cur}/${e.name}`));
            else filePaths.push(String(e.path || `${cur}/${e.name}`));
          }
        }

        if (filePaths.length === 0) {
          report.push({
            orderFolder: orderFolderName,
            orderNumber,
            srcPath,
            destPath,
            files: 0,
            status: "empty",
          });
          continue;
        }

        logger.info("migrateMisplacedOrderPhotos: moving order", {
          orderFolderName,
          orderNumber,
          srcPath,
          destPath,
          fileCount: filePaths.length,
          firstFile: filePaths[0] || "",
        });

        try {
          await synologyMoveFiles({
            baseUrl,
            sid,
            srcPaths: filePaths,
            destFolderPath: destPath,
          });
          try {
            await synologyDeleteFile({ baseUrl, sid, filePath: srcPath });
          } catch (_) {}
          report.push({
            orderFolder: orderFolderName,
            orderNumber,
            srcPath,
            destPath,
            files: filePaths.length,
            status: "moved",
          });
          movedCount += filePaths.length;
        } catch (e) {
          logger.error("migrateMisplacedOrderPhotos: move failed", {
            orderFolderName,
            srcPath,
            destPath,
            error: e?.message,
          });
          report.push({
            orderFolder: orderFolderName,
            orderNumber,
            srcPath,
            destPath,
            files: filePaths.length,
            status: "error",
            error: e?.message || String(e),
          });
          errorCount++;
        }
      }

      // Step 4: 刪除已清空的客戶資料夾與來源根目錄
      if (!dryRun) {
        for (const customerDir of customerDirs) {
          try {
            const remaining = await synologyListFolderEntries({
              baseUrl,
              sid,
              folderPath: customerDir.path,
            });
            if (remaining.length === 0)
              await synologyDeleteFile({
                baseUrl,
                sid,
                filePath: customerDir.path,
              });
          } catch (_) {}
        }
        try {
          const remaining = await synologyListFolderEntries({
            baseUrl,
            sid,
            folderPath: sourceFolderPath,
          });
          if (remaining.length === 0)
            await synologyDeleteFile({
              baseUrl,
              sid,
              filePath: sourceFolderPath,
            });
        } catch (_) {}
      }

      return { dryRun, movedCount, errorCount, report };
    } catch (err) {
      if (err instanceof functions.https.HttpsError) throw err;
      logger.error("migrateMisplacedOrderPhotos error", {
        error: err?.message || String(err),
      });
      throw new functions.https.HttpsError(
        "internal",
        err?.message || "搬移失敗",
      );
    } finally {
      try {
        await synologyLogout(baseUrl, sid);
      } catch (_) {}
    }
  },
);

// ─── 完工照片 NAS 路徑診斷 + 修復 ─────────────────────────────────────────────
exports.repairCompletionPhotoNasPaths = onCall(
  {
    secrets: [SYNO_USERNAME_SECRET, SYNO_PASSWORD_SECRET],
    timeoutSeconds: 540,
    memory: "512MiB",
  },
  async (payload, ctx) => {
    const authUid = getCallableAuthUid(payload, ctx);
    const role = await readUserRole(authUid);
    if (!["admin", "管理者"].includes(role)) {
      throw new functions.https.HttpsError(
        "permission-denied",
        "僅管理者可執行",
      );
    }

    const data = unwrapCallablePayload(payload);
    const dryRun = data.dryRun !== false;
    const maxPhotos = Math.min(
      2000,
      Math.max(1, Number(data.maxPhotos || 1000)),
    );

    // 1. CollectionGroup 查詢所有完工照片
    const photosSnap = await admin
      .firestore()
      .collectionGroup("completionPhotos")
      .limit(maxPhotos)
      .get();

    if (photosSnap.empty) {
      return {
        dryRun,
        checkedPhotos: 0,
        brokenPhotos: 0,
        fixedPhotos: 0,
        report: [],
      };
    }

    // 2. 按 NAS 資料夾分組（每個資料夾只 list 一次，多張照片共用）
    const folderPhotoMap = new Map(); // folderPath -> [photoEntry]
    for (const doc of photosSnap.docs) {
      const photoData = doc.data() || {};
      const nasPath = String(photoData.nasPath || "").trim();
      if (!nasPath) continue;
      const orderDocId = doc.ref.parent?.parent?.id || "";
      if (!orderDocId) continue;

      const folderPath = nasPath.includes("/")
        ? nasPath.slice(0, nasPath.lastIndexOf("/"))
        : "";
      if (!folderPath) continue;

      if (!folderPhotoMap.has(folderPath)) folderPhotoMap.set(folderPath, []);
      folderPhotoMap.get(folderPath).push({
        photoId: doc.id,
        photoRef: doc.ref,
        nasPath,
        orderDocId,
        orderNumber: String(photoData.orderNumber || "").trim(),
      });
    }

    const nasOrderPath = await getNasOrderPath();
    if (!nasOrderPath) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "請先設定訂單資料夾路徑",
      );
    }
    const pathCheck = validateSynologyDirPath(nasOrderPath);
    if (!pathCheck.ok) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        pathCheck.reason,
      );
    }

    const baseUrl = buildSynologyBaseUrl();
    const { username, password } = getSynologyCredentials();
    if (!username || !password) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "尚未設定 NAS 憑證",
      );
    }

    let sid = "";
    const report = [];
    let checkedPhotos = 0;
    let brokenPhotos = 0;
    let fixedPhotos = 0;

    try {
      sid = await synologyLogin(baseUrl, username, password);

      for (const [folderPath, photos] of folderPhotoMap.entries()) {
        // 3. 列出資料夾內的檔案（一次取得該資料夾所有照片的存在狀況）
        let existingFiles = new Set();
        let folderExists = true;
        try {
          const entries = await synologyListFolderEntries({
            baseUrl,
            sid,
            folderPath,
          });
          existingFiles = new Set(entries.map((e) => String(e.name || "")));
        } catch (_) {
          folderExists = false;
        }

        // 同一訂單只搜尋一次 NAS 資料夾
        const orderFixMap = new Map(); // orderDocId -> newFolder | null

        for (const photo of photos) {
          checkedPhotos++;
          const fileName = photo.nasPath.includes("/")
            ? photo.nasPath.slice(photo.nasPath.lastIndexOf("/") + 1)
            : photo.nasPath;

          const fileExists = folderExists && existingFiles.has(fileName);
          if (fileExists) continue;

          brokenPhotos++;

          if (dryRun) {
            report.push({
              type: "broken",
              orderDocId: photo.orderDocId,
              orderNumber: photo.orderNumber,
              photoId: photo.photoId,
              nasPath: photo.nasPath,
            });
            continue;
          }

          // 4. 修復：同一筆訂單只搜一次
          if (!orderFixMap.has(photo.orderDocId)) {
            // 策略：用第一張照片的唯一 photoId 在 0--客戶訂貨單 內搜尋檔案，
            // 找到後取其父目錄作為整筆訂單的新資料夾，比搜尋資料夾名稱更可靠。
            let newFolder = null;
            try {
              const foundFilePath = await synologySearchFileByName({
                baseUrl,
                sid,
                rootPath: pathCheck.normalized,
                fileName: photo.photoId,
              });
              if (foundFilePath) {
                // foundFilePath 例如 /峻晟/01-.../0--客戶訂貨單/1028+普德/26803補BNJ.../A10258xxx.jpg
                newFolder = foundFilePath.includes("/")
                  ? foundFilePath.slice(0, foundFilePath.lastIndexOf("/"))
                  : null;
              }
            } catch (_) {}

            // fallback：若檔名搜尋沒找到，改用資料夾名稱比對
            if (!newFolder) {
              try {
                const folderParts = await buildOrderNasFolderParts(
                  photo.orderDocId,
                  { orderNumber: photo.orderNumber },
                );
                const matchMeta = await resolveExistingOrderFolderPath({
                  baseUrl,
                  sid,
                  basePath: pathCheck.normalized,
                  customerFolder: folderParts.customerFolder,
                  orderNumber: folderParts.orderNumber || photo.orderNumber,
                  defaultDetailFolder: folderParts.detailFolder,
                });
                if (matchMeta.matched) newFolder = matchMeta.uploadFolder;
              } catch (_) {}
            }

            orderFixMap.set(photo.orderDocId, newFolder);
            if (newFolder) {
              admin
                .firestore()
                .collection("Orders")
                .doc(photo.orderDocId)
                .update({ nasOrderFolderPath: newFolder })
                .catch(() => {});
            }
          }

          const newFolder = orderFixMap.get(photo.orderDocId);
          if (!newFolder) {
            report.push({
              type: "not_found",
              orderDocId: photo.orderDocId,
              orderNumber: photo.orderNumber,
              photoId: photo.photoId,
              nasPath: photo.nasPath,
            });
            continue;
          }

          // 確認該照片檔案在新資料夾中是否存在
          let newFolderFiles = existingFiles;
          if (newFolder !== folderPath) {
            try {
              const entries = await synologyListFolderEntries({
                baseUrl,
                sid,
                folderPath: newFolder,
              });
              newFolderFiles = new Set(
                entries.map((e) => String(e.name || "")),
              );
            } catch (_) {
              newFolderFiles = new Set();
            }
          }

          const newNasPath = `${newFolder}/${fileName}`;
          if (newFolderFiles.has(fileName)) {
            await photo.photoRef.update({ nasPath: newNasPath });
            fixedPhotos++;
            report.push({
              type: "fixed",
              orderDocId: photo.orderDocId,
              orderNumber: photo.orderNumber,
              photoId: photo.photoId,
              oldNasPath: photo.nasPath,
              newNasPath,
            });
          } else {
            report.push({
              type: "not_found",
              orderDocId: photo.orderDocId,
              orderNumber: photo.orderNumber,
              photoId: photo.photoId,
              nasPath: photo.nasPath,
              foundFolder: newFolder,
            });
          }
        }
      }
    } finally {
      try {
        await synologyLogout(baseUrl, sid);
      } catch (_) {}
    }

    return { dryRun, checkedPhotos, brokenPhotos, fixedPhotos, report };
  },
);

// ── 取得 TWSE 全上市股票清單（依成交量排序）────────────────────────────────────
exports.fetchTwseTopStocks = onCall(
  { timeoutSeconds: 30 },
  async (payload, ctx) => {
    const authUid = getCallableAuthUid(payload, ctx);
    if (!authUid) {
      throw new functions.https.HttpsError("unauthenticated", "請先登入");
    }
    const data = unwrapCallablePayload(payload);
    const limit = Math.min(2000, Math.max(1, Number(data.limit || 200)));

    const resp = await fetch(
      "https://opendata.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL",
    );
    if (!resp.ok) {
      throw new functions.https.HttpsError("unavailable", "無法取得 TWSE 資料");
    }
    const rows = await resp.json();
    if (!Array.isArray(rows)) {
      throw new functions.https.HttpsError("unavailable", "TWSE 資料格式錯誤");
    }

    // 過濾普通股（代碼 4 位數字），依成交量降序
    const stocks = rows
      .filter((r) => /^\d{4}$/.test(String(r.Code || "").trim()))
      .map((r) => ({
        ticker: String(r.Code).trim(),
        name: String(r.Name || "").trim(),
        volume: Number(String(r.TradeVolume || "0").replace(/,/g, "")) || 0,
      }))
      .sort((a, b) => b.volume - a.volume)
      .slice(0, limit)
      .map(({ ticker, name }) => ({ ticker, name, sector: "" }));

    return { stocks, total: stocks.length };
  },
);

// ── 每日排程：更新 TWSE + TPEX 全股清單到 Firestore ─────────────────────────
// 台股收盤後 15:10 (UTC+8) = 07:10 UTC，每個交易日執行
exports.updateTwseStockListDaily = onSchedule(
  {
    schedule: "10 7 * * 1-5",
    timeZone: "Asia/Taipei",
    timeoutSeconds: 120,
    region: "asia-east1",
  },
  async () => {
    await _doUpdateTwseStockList();
  },
);

// 共用更新邏輯
async function _doUpdateTwseStockList() {
    const db = admin.firestore();
    const allStocks = [];

    // 上市 (TWSE)
    try {
      const r = await fetch(
        "https://opendata.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL",
      );
      if (r.ok) {
        const rows = await r.json();
        rows
          .filter((row) => /^\d{4}$/.test(String(row.Code || "").trim()))
          .forEach((row) => {
            allStocks.push({
              ticker: String(row.Code).trim(),
              name: String(row.Name || "").trim(),
              market: "twse",
              volume:
                Number(String(row.TradeVolume || "0").replace(/,/g, "")) || 0,
            });
          });
      }
    } catch (e) {
      console.error("[_doUpdateTwseStockList] TWSE fetch error:", e?.message);
    }

    // 上櫃 (TPEX)
    try {
      const r = await fetch(
        "https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes",
      );
      if (r.ok) {
        const rows = await r.json();
        rows
          .filter((row) =>
            /^\d{4}$/.test(String(row.SecuritiesCompanyCode || "").trim()),
          )
          .forEach((row) => {
            allStocks.push({
              ticker: String(row.SecuritiesCompanyCode).trim(),
              name: String(row.CompanyAbbreviation || "").trim(),
              market: "tpex",
              volume:
                Number(String(row.TradingShares || "0").replace(/,/g, "")) || 0,
            });
          });
      }
    } catch (e) {
      console.error("[_doUpdateTwseStockList] TPEX fetch error:", e?.message);
    }

    if (allStocks.length === 0) {
      console.warn("[_doUpdateTwseStockList] No stocks fetched, skipping update.");
      return 0;
    }

    allStocks.sort((a, b) => b.volume - a.volume);
    const col = db.collection("TwseStockList");
    const existing = await col.listDocuments();
    for (let i = 0; i < existing.length; i += 500) {
      const wb = db.batch();
      existing.slice(i, i + 500).forEach((ref) => wb.delete(ref));
      await wb.commit();
    }
    for (let i = 0; i < allStocks.length; i += 500) {
      const wb = db.batch();
      allStocks.slice(i, i + 500).forEach((s) => wb.set(col.doc(s.ticker), s));
      await wb.commit();
    }
    await db.collection("SystemSettings").doc("twseStockListMeta").set(
      { updatedAt: admin.firestore.FieldValue.serverTimestamp(), total: allStocks.length },
      { merge: true },
    );
    console.log(`[_doUpdateTwseStockList] Done: ${allStocks.length} stocks saved.`);
    return allStocks.length;
}

// ── 手動觸發：立即更新 TWSE 股票清單（admin only）──────────────────────────
exports.triggerUpdateTwseStockList = onCall(
  { timeoutSeconds: 120 },
  async (payload) => {
    const authUid = getCallableAuthUid(payload, null);
    if (!authUid)
      throw new functions.https.HttpsError("unauthenticated", "請先登入");
    const role = await readUserRole(authUid);
    if (role !== "admin")
      throw new functions.https.HttpsError(
        "permission-denied",
        "僅 admin 可使用",
      );

    // 直接呼叫共用邏輯
    const total = await _doUpdateTwseStockList();
    return { ok: true, total };
  },
);

// ── AI 選股分析 ───────────────────────────────────────────────────────────────
// 條件：1. 多頭排列 MA5>MA10>MA20>MA60  2. 低點爆大量(>均量3倍)  3. AI 產業前景分析
exports.screenStocksWithAI = onCall(
  { timeoutSeconds: 180, secrets: ["GEMINI_API_KEY"] },
  async (payload, ctx) => {
    const authUid = getCallableAuthUid(payload, ctx);
    if (!authUid) {
      throw new functions.https.HttpsError("unauthenticated", "請先登入");
    }
    const role = await readUserRole(authUid);
    if (role !== "admin") {
      throw new functions.https.HttpsError(
        "permission-denied",
        "僅 admin 可使用 AI 選股分析",
      );
    }

    const data = unwrapCallablePayload(payload);
    const rawTickers = Array.isArray(data.tickers) ? data.tickers : [];
    if (!rawTickers.length) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "請提供至少一個股票代號",
      );
    }
    if (rawTickers.length > 50) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "一次最多分析 50 支股票",
      );
    }

    const skipAI = data.skipAI === true;
    // reqConds: if provided, only run checks for listed condition keys
    // (future-proof: new conditions can be gated here without changing the contract)
    const reqConds = Array.isArray(data.conditions) ? data.conditions : null;
    const resolvedSkipAI =
      skipAI || (reqConds !== null && !reqConds.includes("showAI"));
    const geminiKey = String(process.env.GEMINI_API_KEY || "").trim();

    const results = [];

    for (const raw of rawTickers) {
      const ticker = String(raw?.ticker || raw || "")
        .trim()
        .toUpperCase();
      if (!ticker) continue;
      const name = String(raw?.name || "").trim();
      const sector = String(raw?.sector || "").trim();

      // Yahoo Finance: 台灣上市用 .TW，上櫃用 .TWO
      const market = String(raw?.market || "twse").trim();
      const yTicker = /\.(TW|TWO|HK|US)$/i.test(ticker)
        ? ticker
        : market === "tpex" ? `${ticker}.TWO` : `${ticker}.TW`;

      const item = { ticker, name, sector, techResult: {}, aiResult: {} };

      // ── 技術面分析 ────────────────────────────────────────────────────────
      try {
        const since = new Date(Date.now() - 130 * 24 * 60 * 60 * 1000);
        let history = [];
        try {
          history = await yahooFinance.historical(
            yTicker,
            { period1: since, period2: new Date(), interval: "1d" },
            { validateResult: false },
          );
        } catch (_histErr) {
          // historical() 在部分欄位 null 時會直接 throw（與 validateResult 無關）
          // 改用底層 chart() 自行處理 null 值
          try {
            const chartData = await yahooFinance.chart(
              yTicker,
              { period1: since, period2: new Date(), interval: "1d" },
              { validateResult: false },
            );
            history = (chartData?.quotes ?? [])
              .filter((q) => q.close != null && q.volume != null)
              .map((q) => ({ ...q, adjClose: q.adjclose ?? q.close }));
          } catch (_chartErr) {
            // 無法取得資料，維持 history = []
          }
        }
        history = history.filter((d) => d.close != null && d.volume != null);

        if (!history || history.length < 60) {
          item.techResult = {
            error: `歷史資料不足（取得 ${history?.length || 0} 筆，需至少 60 個交易日）`,
          };
        } else {
          const closes = history.map((d) => d.close);
          const volumes = history.map((d) => d.volume || 0);
          const sma = (arr, n) => {
            const sl = arr.slice(-n);
            return sl.reduce((a, v) => a + v, 0) / sl.length;
          };

          const ma5 = sma(closes, 5);
          const ma10 = sma(closes, 10);
          const ma20 = sma(closes, 20);
          const ma60 = sma(closes, 60);
          const maAligned = ma5 > ma10 && ma10 > ma20 && ma20 > ma60;

          // 低點爆大量：近 20 根 K 棒中，找最低 low 那天，看成交量是否 > 近 20 日均量 * 3
          const recent20 = history.slice(-20);
          const avgVol20 = volumes.slice(-20).reduce((a, v) => a + v, 0) / 20;
          const lowDay = recent20.reduce(
            (m, d) => (d.low < m.low ? d : m),
            recent20[0],
          );
          const volumeSpike = avgVol20 > 0 && lowDay.volume > avgVol20 * 3;

          // 突破近60日新高
          const high60 = Math.max(
            ...history.slice(-60).map((d) => d.high || d.close),
          );
          const latestClose = closes[closes.length - 1];
          const breakout60High = latestClose >= high60 * 0.99; // 允許 1% 誤差

          // 量能持續放大：近5日均量 > 近20日均量 * 1.5
          const avgVol5 = volumes.slice(-5).reduce((a, v) => a + v, 0) / 5;
          const volumeSurge = avgVol20 > 0 && avgVol5 > avgVol20 * 1.5;

          // 強勢動能：近20日漲幅 > 10%
          const close20DaysAgo = closes[closes.length - 20] || closes[0];
          const momentum20 =
            close20DaysAgo > 0
              ? (latestClose - close20DaysAgo) / close20DaysAgo
              : 0;
          const strongMomentum = momentum20 > 0.1;

          item.techResult = {
            maAligned,
            volumeSpike,
            breakout60High,
            volumeSurge,
            strongMomentum,
            pass: maAligned && volumeSpike,
            ma5: +ma5.toFixed(2),
            ma10: +ma10.toFixed(2),
            ma20: +ma20.toFixed(2),
            ma60: +ma60.toFixed(2),
            latestClose: +latestClose.toFixed(2),
            avgVolume20: Math.round(avgVol20),
            avgVolume5: Math.round(avgVol5),
            momentum20Pct: +(momentum20 * 100).toFixed(1),
            high60: +high60.toFixed(2),
            spikeDay: {
              date: lowDay.date
                ? new Date(lowDay.date).toISOString().slice(0, 10)
                : "",
              low: +lowDay.low.toFixed(2),
              volume: lowDay.volume,
              ratio: avgVol20 > 0 ? +(lowDay.volume / avgVol20).toFixed(2) : 0,
            },
          };
        }
      } catch (e) {
        item.techResult = {
          error: String(e?.message || "技術面資料擷取失敗"),
        };
      }

      // ── AI 產業前景分析 ──────────────────────────────────────────────────
      if (resolvedSkipAI) {
        item.aiResult = null;
      } else if (!geminiKey) {
        item.aiResult = { error: "未設定 GEMINI_API_KEY，無法進行 AI 分析" };
      } else {
        // Check Firestore cache (24h TTL) before calling Gemini
        const cacheRef = admin
          .firestore()
          .collection("aiAnalysisCache")
          .doc(ticker);
        let usedCache = false;
        try {
          const cacheSnap = await cacheRef.get();
          if (cacheSnap.exists) {
            const cached = cacheSnap.data();
            const ageMs = Date.now() - (cached.cachedAt?.toMillis?.() || 0);
            if (ageMs < 24 * 60 * 60 * 1000 && cached.analysis) {
              item.aiResult = { analysis: cached.analysis, fromCache: true };
              usedCache = true;
            }
          }
        } catch (cacheErr) {
          console.warn("[Gemini cache] read error:", cacheErr?.message);
        }

        if (!usedCache) {
          // Add 1s delay between calls to avoid per-minute rate limits
          if (results.length > 0) {
            await new Promise((r) => setTimeout(r, 1000));
          }

          const genAI = new GoogleGenAI({ apiKey: geminiKey });
          const sectorHint = sector || "（未知產業）";
          const nameHint = name ? `${name}（${ticker}）` : ticker;
          const prompt = [
            `你是一位專業的台灣股票產業分析師。`,
            `請針對以下股票進行產業前景分析，使用繁體中文，回覆150字以內：`,
            `公司：${nameHint}，產業：${sectorHint}`,
            `格式：`,
            `【景氣】一句話說明目前景氣。`,
            `【動能】未來1-2年主要成長驅動力一句話。`,
            `【風險】最大風險一句話。`,
            `【評分】X/10，一句結論。`,
          ].join("\n");

          // Retry once on 429 after the specified delay
          let resp = null;
          for (let attempt = 0; attempt < 2; attempt++) {
            try {
              resp = await genAI.models.generateContent({
                model: "gemini-2.5-flash",
                contents: prompt,
              });
              break;
            } catch (e) {
              const is429 = String(e?.message || "").includes("429");
              if (is429 && attempt === 0) {
                // Parse retryDelay from error message (e.g. "retry in 57s")
                const retryMatch = String(e?.message || "").match(
                  /retry[^0-9]*(\d+)/i,
                );
                const waitSec = retryMatch
                  ? Math.min(parseInt(retryMatch[1], 10), 60)
                  : 30;
                console.warn(
                  `[Gemini] 429 for ${ticker}, waiting ${waitSec}s before retry`,
                );
                await new Promise((r) => setTimeout(r, waitSec * 1000));
              } else {
                console.error("[Gemini] error for", ticker, ":", e?.message);
                const is429Final = String(e?.message || "").includes("429");
                item.aiResult = {
                  error: is429Final
                    ? "Gemini 免費配額已用完，請明天再試或至 Google AI Studio 開啟付費方案"
                    : String(e?.message || "AI 分析失敗"),
                  analysis: "AI 分析暫時無法使用，請稍後重試",
                };
                resp = null;
                break;
              }
            }
          }

          if (resp) {
            const analysisText = resp.text.trim();
            item.aiResult = { analysis: analysisText };
            // Write to cache (fire-and-forget)
            cacheRef
              .set({
                analysis: analysisText,
                cachedAt: admin.firestore.FieldValue.serverTimestamp(),
              })
              .catch((err) =>
                console.warn("[Gemini cache] write error:", err?.message),
              );
          } else if (!item.aiResult?.error) {
            item.aiResult = {
              error: "AI 分析失敗",
              analysis: "AI 分析暫時無法使用，請稍後重試",
            };
          }
        }
      }

      results.push(item);
    }

    return { results };
  },
);
