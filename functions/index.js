/**
 * Import function triggers from their respective submodules:
 *
 * const {onCall} = require("firebase-functions/v2/https");
 * const {onDocumentWritten} = require("firebase-functions/v2/firestore");
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

const functions = require("firebase-functions");
const { setGlobalOptions } = functions;
const { onRequest } = require("firebase-functions/https");
const logger = require("firebase-functions/logger");
// v2 style imports for Firestore and HTTPS callables
const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const { onCall } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { onRequest: onRequestV2 } = require("firebase-functions/v2/https");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const Busboy = require("busboy");

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
setGlobalOptions({ maxInstances: 10 });

// Create and deploy your first functions
// https://firebase.google.com/docs/functions/get-started

// exports.helloWorld = onRequest((request, response) => {
//   logger.info("Hello logs!", {structuredData: true});
//   response.send("Hello from Firebase!");
// });

// -- search keyword indexing for Orders ----------------------------------
const admin = require("firebase-admin");
admin.initializeApp();

const SYNO_USERNAME_SECRET = defineSecret("SYNO_USERNAME");
const SYNO_PASSWORD_SECRET = defineSecret("SYNO_PASSWORD");
const PHOTO_URL_SIGNING_SECRET = defineSecret("PHOTO_URL_SIGNING_SECRET");

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
    `https://us-central1-${projectId}.cloudfunctions.net/serveCompletionPhoto`,
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
    `https://us-central1-${projectId}.cloudfunctions.net/serveCompletionPhotoAlbum`,
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

    const nasStoragePath = await getNasStoragePath();
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
    const uploadFolder = `${pathCheck.normalized}/${folderParts.customerFolder}/${folderParts.detailFolder}`;
    const targetName = `${photoRef.id}-${logicalFileName}`;
    const nasPath = `${uploadFolder}/${targetName}`;

    let sid = "";
    try {
      sid = await synologyLogin(baseUrl, username, password);
      await synologyUploadFile({
        baseUrl,
        sid,
        targetPath: uploadFolder,
        fileBuffer: uploadFile.buffer,
        fileName: targetName,
        mimeType: contentType,
      });
    } catch (e) {
      sendJson(res, 500, { error: e?.message || "上傳到 NAS 失敗" });
      return;
    } finally {
      try {
        await synologyLogout(baseUrl, sid);
      } catch (_e) {
        // ignore logout failure
      }
    }

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
    const uploadFolder = `${pathCheck.normalized}/${folderParts.customerFolder}/${folderParts.detailFolder}`;
    const targetName = `${photoRef.id}-${fileName}`;
    const nasPath = `${uploadFolder}/${targetName}`;

    let sid = "";
    try {
      sid = await synologyLogin(baseUrl, username, password);
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
      const downloadResp = await synologyDownloadFile({
        baseUrl,
        sid,
        filePath: nasPath,
      });

      if (!downloadResp.ok) {
        const payloadText = await downloadResp.text();
        logger.error("serveCompletionPhoto download failed", {
          orderId,
          photoId,
          nasPath,
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
  console.log("searchOrdersByKeyword payload:", payload);
  // support v2 callable structure where data is under payload.data
  const qRaw = payload.data?.q ?? payload.q ?? "";
  const q = qRaw.toString().toLowerCase().trim();
  console.log("searchOrdersByKeyword computed q=", q);
  if (!q) return [];
  const snap = await admin
    .firestore()
    .collection("Orders")
    .where("searchKeywords", "array-contains", q)
    .limit(100)
    .get();
  console.log("query returned", snap.size, "docs");
  snap.docs.forEach((d) =>
    console.log("doc", d.id, "keywords", d.data().searchKeywords),
  );
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
