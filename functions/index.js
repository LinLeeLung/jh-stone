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
const { PDFDocument, rgb, PDFName } = require("pdf-lib");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const Busboy = require("busboy");
const admin = require("firebase-admin");
const chromium = require("@sparticuz/chromium");
const puppeteer = require("puppeteer-core");
admin.initializeApp();
const SYNO_USERNAME_SECRET = defineSecret("SYNO_USERNAME");
const SYNO_PASSWORD_SECRET = defineSecret("SYNO_PASSWORD");
const PHOTO_URL_SIGNING_SECRET = defineSecret("PHOTO_URL_SIGNING_SECRET");
const NAS_PDF_API_KEY_SECRET = defineSecret("NAS_PDF_API_KEY");
const GEMINI_API_KEY_SECRET = defineSecret("GEMINI_API_KEY");
const ADMIN_EMAIL = "linlilung@gmail.com";

// Must be called BEFORE any function definitions so it applies to all v2 functions
setGlobalOptions({ maxInstances: 10, region: "asia-east1" });

// 將 NAS 找到的訂單資料夾路徑寫回對應的 Orders 文件，作為下次查詢/上傳的快取。
// 若找不到對應文件就靜默略過——本函式絕不丟例外。
async function cacheOrderFolderPath(orderNumber, folderPath) {
  try {
    const cleanOrder = String(orderNumber || "").trim();
    const cleanPath = String(folderPath || "").trim();
    if (!cleanOrder || !cleanPath) return;
    const db = admin.firestore();
    const direct = await db.collection("Orders").doc(cleanOrder).get();
    if (direct.exists) {
      await direct.ref.set({ nasOrderFolderPath: cleanPath }, { merge: true });
      return;
    }
    // 找不到 doc id == orderNumber 的文件時，用欄位查詢
    const snap = await db
      .collection("Orders")
      .where("訂單號碼", "==", cleanOrder)
      .limit(1)
      .get();
    if (!snap.empty) {
      await snap.docs[0].ref.set(
        { nasOrderFolderPath: cleanPath },
        { merge: true },
      );
    }
  } catch (err) {
    logger.warn("cacheOrderFolderPath: write skipped", {
      orderNumber,
      error: err?.message,
    });
  }
}

function canViewOrderPdfPrice({ profile = null, viewerEmail = "" } = {}) {
  const roles = Array.isArray(profile?.roles)
    ? profile.roles.map((role) => String(role || "").trim())
    : [];
  const normalizedEmail = String(viewerEmail || "")
    .trim()
    .toLowerCase();

  if (
    roles.includes("價格") ||
    roles.includes("admin") ||
    roles.includes("管理者")
  ) {
    return true;
  }

  return normalizedEmail === ADMIN_EMAIL;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatPdfDate(value) {
  if (!value) return "—";
  const date = value?.toDate ? value.toDate() : new Date(value);
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return String(value);
  }
  return new Intl.DateTimeFormat("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function pickOrderRemark(order = {}, customer = {}) {
  return [customer?.notes, order?.specialNotes]
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .join("\n");
}

function buildConfirmedPdfComparisonHtml({
  order = {},
  customer = {},
  confirmation = {},
  generatedAt = new Date(),
}) {
  const customerContact = [
    order?.customerContact?.name,
    order?.customerContact?.phone,
  ]
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .join(" ");
  const customerFax = [
    order?.customerFax,
    customer?.fax,
    customer?.contactFax,
    order?.customerContact?.fax,
  ]
    .map((item) => String(item || "").trim())
    .find(Boolean);
  const noteText = pickOrderRemark(order, customer);
  const drawingBlocks = Array.isArray(confirmation?.drawingBlocks)
    ? confirmation.drawingBlocks.length
    : 0;
  const overlayImgs = Array.isArray(confirmation?.overlayImgs)
    ? confirmation.overlayImgs.length
    : 0;
  const cf = confirmation?.cf || {};
  const rows = [
    ["訂單編號", order?.orderNo || order?.id || "—"],
    ["客戶名稱", order?.customerName || customer?.name || "—"],
    ["客戶端業務", customerContact || "—"],
    ["圖面傳真", customerFax || "—"],
    ["下單日", formatPdfDate(order?.orderedAt)],
    ["預交日", formatPdfDate(order?.promisedAt)],
    ["收尾日", formatPdfDate(order?.finishDate)],
    ["施工地址", order?.siteAddress || "—"],
    [
      "現場/屋主",
      [order?.owner?.name, order?.owner?.phone].filter(Boolean).join(" ") ||
        "—",
    ],
    [
      "打板",
      [order?.templatingStaff, formatPdfDate(order?.templatingDate)]
        .filter(Boolean)
        .join(" / ") || "—",
    ],
    ["繪圖", order?.drawingStaff || "—"],
  ];

  return `<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>生產確定單後端比較版</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #e5e9f0;
      --paper: #f8fafc;
      --ink: #0f172a;
      --muted: #475569;
      --line: #94a3b8;
      --accent: #0f766e;
      --accent-2: #1d4ed8;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 16px;
      background: var(--bg);
      color: var(--ink);
      font-family: "Noto Sans TC", "Microsoft JhengHei", Arial, sans-serif;
    }
    .page {
      width: 1123px;
      min-height: 794px;
      margin: 0 auto;
      background: var(--paper);
      border: 1px solid #cbd5e1;
      box-shadow: 0 16px 40px rgba(15, 23, 42, 0.18);
      padding: 18px 20px 20px;
    }
    .topbar {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
      margin-bottom: 12px;
      padding-bottom: 10px;
      border-bottom: 2px solid var(--line);
    }
    .title {
      font-size: 24px;
      font-weight: 800;
      color: var(--accent);
      letter-spacing: 0.08em;
    }
    .subtitle {
      margin-top: 4px;
      font-size: 12px;
      color: var(--muted);
    }
    .badge {
      padding: 6px 10px;
      border-radius: 999px;
      background: #dbeafe;
      color: #1e40af;
      font-size: 12px;
      font-weight: 700;
      white-space: nowrap;
    }
    .grid {
      display: grid;
      grid-template-columns: 1.2fr 0.8fr;
      gap: 12px;
      margin-top: 12px;
    }
    .card {
      border: 1px solid #cbd5e1;
      border-radius: 10px;
      background: #fff;
      overflow: hidden;
    }
    .card-hd {
      padding: 8px 12px;
      background: linear-gradient(90deg, #0f766e, #1d4ed8);
      color: #fff;
      font-size: 13px;
      font-weight: 700;
    }
    .card-bd {
      padding: 12px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
    }
    td {
      border: 1px solid var(--line);
      padding: 8px 10px;
      vertical-align: top;
      font-size: 13px;
      line-height: 1.35;
      word-break: break-word;
    }
    td.k {
      width: 120px;
      background: #f1f5f9;
      color: #334155;
      font-weight: 700;
    }
    .note {
      min-height: 92px;
      white-space: pre-wrap;
    }
    .list {
      display: grid;
      grid-template-columns: 1fr;
      gap: 8px;
      font-size: 13px;
      line-height: 1.45;
    }
    .kv {
      display: grid;
      grid-template-columns: 110px 1fr;
      gap: 8px;
      align-items: start;
    }
    .kv .key {
      color: #334155;
      font-weight: 700;
    }
    .kv .val {
      white-space: pre-wrap;
      color: #0f172a;
    }
    .footer {
      margin-top: 12px;
      padding-top: 10px;
      border-top: 1px dashed #94a3b8;
      display: flex;
      justify-content: space-between;
      gap: 12px;
      font-size: 11px;
      color: #64748b;
    }
    .source-note {
      margin-top: 10px;
      padding: 10px 12px;
      border: 1px solid #bae6fd;
      background: #f0f9ff;
      border-radius: 8px;
      font-size: 12px;
      color: #0f172a;
      line-height: 1.5;
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="topbar">
      <div>
        <div class="title">生產確定單</div>
        <div class="subtitle">後端無頭瀏覽器比較版，供與前端封存PDF對照</div>
      </div>
      <div class="badge">Backend PDF Comparison</div>
    </div>

    <div class="grid">
      <div class="card">
        <div class="card-hd">訂單資訊</div>
        <div class="card-bd">
          <table>
            ${rows
              .map(
                ([key, value]) => `
              <tr>
                <td class="k">${escapeHtml(key)}</td>
                <td>${escapeHtml(value)}</td>
              </tr>`,
              )
              .join("")}
          </table>
        </div>
      </div>
      <div class="card">
        <div class="card-hd">後端比較摘要</div>
        <div class="card-bd list">
          <div class="kv"><div class="key">資料來源</div><div class="val">salesOrders / confirmationDoc / customers</div></div>
          <div class="kv"><div class="key">繪圖區塊</div><div class="val">${drawingBlocks}</div></div>
          <div class="kv"><div class="key">疊圖數量</div><div class="val">${overlayImgs}</div></div>
          <div class="kv"><div class="key">邊型設定</div><div class="val">${escapeHtml(cf.edgeType || "—")}</div></div>
          <div class="kv"><div class="key">縮放基準</div><div class="val">${escapeHtml(String(confirmation?.measurementScale || 1))}</div></div>
          <div class="kv"><div class="key">產生時間</div><div class="val">${escapeHtml(formatPdfDate(generatedAt))}</div></div>
        </div>
      </div>
    </div>

    <div class="grid">
      <div class="card">
        <div class="card-hd">備註</div>
        <div class="card-bd note">${escapeHtml(noteText || "—")}</div>
      </div>
      <div class="card">
        <div class="card-hd">比較說明</div>
        <div class="card-bd">
          <div class="source-note">
            這份 PDF 是由後端 Puppeteer 直接產生，目的是與前端目前的封存 PDF 對照。
            如果版面差異很大，通常代表前端畫布渲染和後端列印渲染在字型、尺寸或內容載入時序上有差異。
          </div>
          <div style="margin-top: 10px; font-size: 13px; line-height: 1.6; color: #334155;">
            <div>1. 前端版偏向「畫布快照」，較接近目前畫面內容。</div>
            <div>2. 後端版偏向「瀏覽器列印」，較接近實際 HTML 排版。</div>
            <div>3. 兩份一起看，可以快速判斷字型、留白、分頁與載入時序差異。</div>
          </div>
        </div>
      </div>
    </div>

    <div class="footer">
      <div>Generated by Firebase Functions + Puppeteer</div>
      <div>${escapeHtml(String(order?.orderNo || order?.id || ""))}</div>
    </div>
  </div>
</body>
</html>`;
}

async function launchPdfBrowser() {
  const executablePath = await chromium.executablePath();
  return puppeteer.launch({
    args: chromium.args,
    executablePath,
    headless: chromium.headless ?? true,
    defaultViewport: chromium.defaultViewport || {
      width: 1440,
      height: 1024,
      deviceScaleFactor: 1,
    },
  });
}

// 查詢 NAS 是否有包含訂單號碼的資料夾
exports.findOrderFolderOnNas = onCall(
  {
    secrets: [SYNO_USERNAME_SECRET, SYNO_PASSWORD_SECRET],
    timeoutSeconds: 120,
  },
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

      // ── Step 1: 搜尋 訂單號碼.pdf，從 PDF 路徑反推資料夾 ──
      const pdfFileName = `${orderNumber}.pdf`;
      let pdfPath = "";
      try {
        pdfPath = await synologySearchFileByName({
          baseUrl,
          sid,
          rootPath: pathCheck.normalized,
          fileName: pdfFileName,
        });
      } catch (pdfErr) {
        logger.warn("findOrderFolderOnNas: PDF search failed", {
          orderNumber,
          error: pdfErr?.message,
        });
      }

      if (pdfPath) {
        // PDF 找到了，取其所在資料夾
        const parts = pdfPath.split("/");
        parts.pop(); // 移除檔名
        const folderPath = parts.join("/");
        const folderName = parts[parts.length - 1] || "";
        logger.info("findOrderFolderOnNas: found via PDF", {
          orderNumber,
          pdfPath,
          folderPath,
        });
        // 寫入 Orders 文件作為快取，下次同訂單上傳/查詢可以瞬間命中
        cacheOrderFolderPath(orderNumber, folderPath).catch(() => {});
        return {
          found: true,
          folderName,
          folderPath,
          matchScore: 10000,
          message: `透過 PDF 找到資料夾：${folderName}（${folderPath}）`,
        };
      }

      // ── Step 2: PDF 找不到，fallback 搜尋資料夾名稱 ──
      logger.info(
        "findOrderFolderOnNas: PDF not found, fallback to folder search",
        {
          orderNumber,
        },
      );
      const matchResult = await resolveExistingOrderFolderPath({
        baseUrl,
        sid,
        basePath: pathCheck.normalized,
        customerFolder: "unknown",
        orderNumber,
        defaultDetailFolder: orderNumber,
      });
      if (matchResult.matched) {
        cacheOrderFolderPath(orderNumber, matchResult.uploadFolder).catch(
          () => {},
        );
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
          message: `未找到「${orderNumber}」的 PDF 或資料夾`,
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

exports.batchFindOrderFolderOnNas = onCall(
  {
    secrets: [SYNO_USERNAME_SECRET, SYNO_PASSWORD_SECRET],
    timeoutSeconds: 540,
  },
  async (payload, ctx) => {
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
    const pathCheck = validateSynologyDirPath(nasStoragePath);
    if (!pathCheck.ok) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        pathCheck.reason,
      );
    }

    const rawData = payload && payload.data ? payload.data : payload;
    const orderNumbers = Array.isArray(rawData.orderNumbers)
      ? rawData.orderNumbers.map((s) => String(s || "").trim()).filter(Boolean)
      : [];
    if (!orderNumbers.length) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "請提供訂單號碼陣列",
      );
    }
    if (orderNumbers.length > 500) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "一次最多查詢 500 筆",
      );
    }

    // 產生批次ID，用於即時回報進度到 Firestore
    const batchId = rawData.batchId || `batch_${Date.now()}`;
    const progressRef = admin
      .firestore()
      .collection("_system")
      .doc(`batchSearch_${batchId}`);

    let sid = "";
    try {
      sid = await synologyLogin(baseUrl, username, password);
      const apiUrl = new URL("/webapi/entry.cgi", baseUrl).toString();
      const rootPath = pathCheck.normalized;
      const t0Global = Date.now();
      const allResults = [];
      let foundCount = 0;

      // 初始化進度文件
      await progressRef.set({
        status: "running",
        total: orderNumbers.length,
        done: 0,
        found: 0,
        results: [],
        startedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // ══════════════════════════════════════════════════════════════
      // 登入一次，一筆一筆用 Finder (Universal Search) 搜尋，
      // 每筆搜完後立即寫 Firestore，前端即時訂閱顯示。
      // ══════════════════════════════════════════════════════════════

      for (let i = 0; i < orderNumbers.length; i++) {
        const orderNumber = orderNumbers[i];
        const t0 = Date.now();

        // 每筆之間等 1 秒（第一筆不等）
        if (i > 0) {
          await new Promise((r) => setTimeout(r, 1000));
        }

        let result = { orderNumber, found: false, message: "" };

        try {
          // 用 synologySearchFileByName 搜尋 (Finder → FileStation.Search → traversal)
          const pdfFileName = `${orderNumber}.pdf`;
          const pdfPath = await synologySearchFileByName({
            baseUrl,
            sid,
            rootPath,
            fileName: pdfFileName,
          });

          if (pdfPath) {
            const parts = pdfPath.split("/");
            parts.pop();
            const folderPath = parts.join("/");
            const folderName = parts[parts.length - 1] || "";
            result = {
              orderNumber,
              found: true,
              folderName,
              folderPath,
              matchScore: 10000,
              totalMs: Date.now() - t0,
              message: `找到：${folderName}`,
            };
            foundCount++;
          } else {
            // PDF 找不到，fallback 搜資料夾
            const matchResult = await resolveExistingOrderFolderPath({
              baseUrl,
              sid,
              basePath: rootPath,
              customerFolder: "unknown",
              orderNumber,
              defaultDetailFolder: orderNumber,
            });
            if (matchResult.matched) {
              result = {
                orderNumber,
                found: true,
                folderName: matchResult.matchedFolderName,
                folderPath: matchResult.uploadFolder,
                matchScore: matchResult.matchScore,
                totalMs: Date.now() - t0,
                message: `找到：${matchResult.matchedFolderName}`,
              };
              foundCount++;
            } else {
              result = {
                orderNumber,
                found: false,
                totalMs: Date.now() - t0,
                message: `未找到「${orderNumber}」的 PDF 或資料夾`,
              };
            }
          }
        } catch (searchErr) {
          result = {
            orderNumber,
            found: false,
            totalMs: Date.now() - t0,
            message: `搜尋錯誤：${searchErr?.message || "unknown"}`,
          };
          logger.warn("batchFind: search error", {
            orderNumber,
            error: searchErr?.message,
          });
        }

        allResults.push(result);

        // 即時寫進度到 Firestore（每筆都寫）
        try {
          await progressRef.update({
            done: i + 1,
            found: foundCount,
            results: allResults,
          });
        } catch (writeErr) {
          logger.warn("batchFind: progress write failed", {
            error: writeErr?.message,
          });
        }

        logger.info("batchFind: searched", {
          index: i + 1,
          total: orderNumbers.length,
          orderNumber,
          found: result.found,
          ms: result.totalMs,
        });
      }

      // 標記完成
      try {
        await progressRef.update({
          status: "done",
          done: orderNumbers.length,
          found: foundCount,
          results: allResults,
          finishedAt: admin.firestore.FieldValue.serverTimestamp(),
          totalMs: Date.now() - t0Global,
        });
      } catch (_) {}

      logger.info("batchFind: done", {
        total: orderNumbers.length,
        found: foundCount,
        notFound: orderNumbers.length - foundCount,
        totalMs: Date.now() - t0Global,
      });

      return {
        batchId,
        results: allResults,
      };
    } catch (err) {
      // 標記錯誤
      try {
        await progressRef.update({
          status: "error",
          error: err?.message || "批次查詢失敗",
        });
      } catch (_) {}
      logger.error("batchFindOrderFolderOnNas error", {
        error: err?.message || String(err),
      });
      throw new functions.https.HttpsError(
        "internal",
        err?.message || "批次查詢失敗",
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

function buildMockStraightDrawingDraft(data = {}) {
  const orderSummary = data.orderSummary || {};
  const lineItems = Array.isArray(orderSummary.lineItems)
    ? orderSummary.lineItems
    : [];
  const mainItem = lineItems.find(
    (item) => String(item?.unit || "").trim() === "cm",
  );
  const length = Number(mainItem?.qty) > 0 ? Number(mainItem.qty) : 199;
  const depth =
    Number(orderSummary.depthStandard) > 0
      ? Number(orderSummary.depthStandard)
      : 60;
  const crops = Array.isArray(data.aiCrops) ? data.aiCrops : [];
  const primaryCrop =
    crops.find((crop) => crop?.purpose === "countertop") || crops[0] || null;
  return {
    drawingType: "straight",
    length,
    depth,
    thickness: 4,
    cabinetBodies: [],
    crop: primaryCrop
      ? {
          id: primaryCrop.id || "",
          purpose: primaryCrop.purpose || "countertop",
          label: primaryCrop.label || "主檯面",
          width: Number(primaryCrop.width || 0),
          height: Number(primaryCrop.height || 0),
          selection: primaryCrop.selection || null,
          sourceName: primaryCrop.sourceName || "",
        }
      : null,
    aiCrops: crops.map((crop) => ({
      id: crop?.id || "",
      purpose: crop?.purpose || "note",
      label: crop?.label || "AI框",
      width: Number(crop?.width || 0),
      height: Number(crop?.height || 0),
      selection: crop?.selection || null,
      sourceName: crop?.sourceName || "",
    })),
    fixtures: [],
    sideOptions: {},
    confidence: 0.8,
    needsReview: true,
    source: "mock-functions",
  };
}

function parseGeminiJson(text = "") {
  const clean = String(text || "")
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  const jsonStart = clean.indexOf("{");
  const jsonEnd = clean.lastIndexOf("}");
  if (jsonStart < 0 || jsonEnd < jsonStart) {
    throw new Error("Gemini 未回傳 JSON");
  }
  return JSON.parse(clean.slice(jsonStart, jsonEnd + 1));
}

function toPositiveNumber(value, fallbackValue) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallbackValue;
}

function normalizeCabinetBodies(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item, index) => {
      if (!item || typeof item !== "object") return null;
      const width = toPositiveNumber(
        item.width ?? item.length ?? item.qty,
        null,
      );
      if (!width) return null;
      return {
        label: String(item.label || `桶身 ${index + 1}`),
        width,
        length: toPositiveNumber(item.length, width),
        qty: width,
      };
    })
    .filter(Boolean)
    .slice(0, 9);
}

function normalizeStraightSegments(value, fallbackDraft = {}) {
  const rawList = Array.isArray(value) ? value : [];
  const segments = rawList
    .map((item, index) => {
      if (!item || typeof item !== "object") return null;
      const width = toPositiveNumber(
        item.width ?? item.length ?? item.qty,
        null,
      );
      if (!width) return null;
      const rawType = String(item.type || "")
        .trim()
        .toLowerCase();
      const type = ["cabinet", "filler", "appliance", "gap", "stone"].includes(
        rawType,
      )
        ? rawType
        : "stone";
      return {
        type,
        label: String(item.label || `分段 ${index + 1}`),
        width,
        length: toPositiveNumber(item.length, width),
        qty: width,
      };
    })
    .filter(Boolean)
    .slice(0, 9);
  if (segments.length) return segments;
  const cabinets = Array.isArray(fallbackDraft.cabinetBodies)
    ? fallbackDraft.cabinetBodies
    : [];
  return cabinets
    .map((item, index) => {
      const width = toPositiveNumber(
        item.width ?? item.length ?? item.qty,
        null,
      );
      return width
        ? {
            type: "cabinet",
            label: String(item.label || `桶身 ${index + 1}`),
            width,
            length: width,
            qty: width,
          }
        : null;
    })
    .filter(Boolean)
    .slice(0, 9);
}

function normalizeFixturePosition(type, value) {
  const text = String(value || "").trim();
  if (type === "sink") {
    return ["水中", "左開", "右開"].includes(text) ? text : "水中";
  }
  if (text === "爐中") return "火中";
  return ["火中", "左開", "右開"].includes(text) ? text : "火中";
}

function normalizeFixtureIndex(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return null;
  return Math.trunc(number);
}

function getSegmentCenterByIndex(segments, targetIndex, cabinetOnly = false) {
  if (!Array.isArray(segments) || !targetIndex) return null;
  let accumulated = 0;
  let matchedIndex = 0;
  for (const segment of segments) {
    const width = toPositiveNumber(segment?.width ?? segment?.length, null);
    if (!width) continue;
    const isTargetType = !cabinetOnly || segment?.type === "cabinet";
    if (isTargetType) {
      matchedIndex += 1;
      if (matchedIndex === targetIndex) return accumulated + width / 2;
    }
    accumulated += width;
  }
  return null;
}

function inferFixtureCenter(item, segments) {
  const explicitCenter = toPositiveNumber(
    item.center ?? item.centerFromLeft ?? item.dis ?? item.distance,
    null,
  );
  if (explicitCenter) return explicitCenter;
  const centered = [
    item.centered,
    item.isCentered,
    item.centeredInCabinet,
    item.centerRule,
    item.alignment,
  ]
    .map((value) =>
      String(value || "")
        .trim()
        .toLowerCase(),
    )
    .some(
      (value) =>
        value === "true" || value.includes("center") || value.includes("中"),
    );
  if (!centered) return null;
  const segmentIndex = normalizeFixtureIndex(
    item.segmentIndex ?? item.segmentOrder,
  );
  const segmentCenter = getSegmentCenterByIndex(segments, segmentIndex, false);
  if (segmentCenter) return segmentCenter;
  const cabinetIndex = normalizeFixtureIndex(
    item.cabinetIndex ?? item.cabinetOrder,
  );
  return getSegmentCenterByIndex(segments, cabinetIndex, true);
}

function normalizeFixtures(value, segments = []) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item, index) => {
      if (!item || typeof item !== "object") return null;
      const rawType = String(item.type || "")
        .trim()
        .toLowerCase();
      const type =
        rawType.includes("sink") || rawType.includes("水")
          ? "sink"
          : rawType.includes("stove") ||
              rawType.includes("爐") ||
              rawType.includes("火")
            ? "stove"
            : "";
      if (!type) return null;
      const center = inferFixtureCenter(item, segments);
      if (!center) return null;
      return {
        type,
        label: String(item.label || (type === "sink" ? "水槽" : "爐具")),
        position: normalizeFixturePosition(type, item.position),
        center,
        length: toPositiveNumber(item.length ?? item.width, null),
        depth: toPositiveNumber(item.depth, null),
        radius: toPositiveNumber(item.radius ?? item.R, null),
        dig: toPositiveNumber(item.dig, null),
        inferredCenter: !toPositiveNumber(
          item.center ?? item.centerFromLeft ?? item.dis ?? item.distance,
          null,
        ),
        order: Number.isFinite(Number(item.order))
          ? Number(item.order)
          : index + 1,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.order - b.order)
    .slice(0, 4);
}

function normalizeSideText(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function normalizeLeftOption(value) {
  const text = normalizeSideText(value);
  if (
    ["左靠牆", "leftwall", "left_wall"].includes(text) ||
    text.includes("左靠牆") ||
    text.includes("wall") ||
    text.includes("靠牆")
  )
    return "左靠牆";
  if (text.includes("齊桶") || text.includes("flush")) return "左齊桶身";
  if (
    text.includes("側落腳") ||
    text.includes("sideleg") ||
    text.includes("side_leg")
  )
    return "左側落腳";
  if (text.includes("見光") || text.includes("open") || text.includes("開放"))
    return "左見光";
  if (text.includes("側板")) return "左靠側板";
  if (text.includes("靠櫃")) return "左靠櫃";
  return null;
}

function normalizeRightOption(value) {
  const text = normalizeSideText(value);
  if (text.includes("齊桶") || text.includes("flush")) return "右齊桶身";
  if (
    text.includes("側落腳") ||
    text.includes("sideleg") ||
    text.includes("side_leg")
  )
    return "右側落腳";
  if (text.includes("見光") || text.includes("open") || text.includes("開放"))
    return "右見光";
  if (
    ["右靠牆", "rightwall", "right_wall"].includes(text) ||
    text.includes("右靠牆") ||
    text.includes("wall") ||
    text.includes("靠牆")
  )
    return "右靠牆";
  if (text.includes("側板")) return "右靠側板";
  if (text.includes("靠櫃")) return "右靠櫃";
  return null;
}

function normalizeBackOption(value) {
  const text = normalizeSideText(value);
  if (text.includes("靠牆") || text.includes("wall")) return "後靠牆";
  if (text.includes("見光") || text.includes("open") || text.includes("開放"))
    return "後見光";
  return null;
}

function normalizeStraightSideOptions(value = {}) {
  if (!value || typeof value !== "object") return {};
  const leftSource = value.leftOption ?? value.left ?? value.leftSide;
  const rightSource = value.rightOption ?? value.right ?? value.rightSide;
  const backSource = value.backOption ?? value.back ?? value.backSide;
  const result = {};
  const leftOption = normalizeLeftOption(leftSource);
  const rightOption = normalizeRightOption(rightSource);
  const backOption = normalizeBackOption(backSource);
  if (leftOption) result.leftOption = leftOption;
  if (rightOption) result.rightOption = rightOption;
  if (backOption) result.backOption = backOption;
  return result;
}

function normalizeStraightDrawingDraft(rawDraft = {}, fallbackDraft = {}) {
  const confidence = Number(rawDraft.confidence);
  const cabinetBodies = normalizeCabinetBodies(rawDraft.cabinetBodies);
  const fallbackWithCabinets = { ...fallbackDraft, cabinetBodies };
  const segments = normalizeStraightSegments(
    rawDraft.segments,
    fallbackWithCabinets,
  );
  return {
    ...fallbackDraft,
    drawingType: "straight",
    length: toPositiveNumber(rawDraft.length, fallbackDraft.length || 199),
    depth: toPositiveNumber(rawDraft.depth, fallbackDraft.depth || 60),
    thickness: toPositiveNumber(
      rawDraft.thickness,
      fallbackDraft.thickness || 4,
    ),
    cabinetBodies,
    segments,
    fixtures: normalizeFixtures(rawDraft.fixtures, segments),
    sideOptions: normalizeStraightSideOptions(
      rawDraft.sideOptions ?? rawDraft.edges ?? rawDraft.boundaries,
    ),
    confidence:
      Number.isFinite(confidence) && confidence >= 0 && confidence <= 1
        ? confidence
        : 0.65,
    needsReview: rawDraft.needsReview !== false,
    notes: Array.isArray(rawDraft.notes)
      ? rawDraft.notes.map((note) => String(note || "")).filter(Boolean)
      : String(rawDraft.notes || "").trim()
        ? [String(rawDraft.notes).trim()]
        : [],
  };
}

function normalizeAiCropForGemini(crop = {}) {
  const dataUrl = String(crop.imageDataUrl || "");
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  return {
    meta: {
      id: String(crop.id || ""),
      purpose: String(crop.purpose || "note"),
      label: String(crop.label || "AI框"),
      width: Number(crop.width || 0),
      height: Number(crop.height || 0),
      selection: crop.selection || null,
      sourceName: String(crop.sourceName || ""),
    },
    inlineData: match
      ? {
          mimeType: match[1],
          data: match[2],
        }
      : null,
  };
}

function getGeminiApiKey() {
  try {
    return String(GEMINI_API_KEY_SECRET.value() || "").trim();
  } catch (err) {
    logger.warn("GEMINI_API_KEY unavailable", {
      error: err?.message || String(err),
    });
    return "";
  }
}

async function generateGeminiContentWithFallback(genAI, parts) {
  const modelNames = [
    "gemini-2.0-flash",
    "gemini-2.5-flash",
    "gemini-1.5-flash",
  ];
  let lastError = null;
  for (const modelName of modelNames) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent(parts);
      return { result, modelName };
    } catch (err) {
      lastError = err;
      logger.warn("Gemini model failed", {
        modelName,
        error: err?.message || String(err),
      });
    }
  }
  throw lastError || new Error("No Gemini model available");
}

exports.analyzeStraightDrawingDraft = onCall(
  {
    secrets: [GEMINI_API_KEY_SECRET],
    timeoutSeconds: 120,
    memory: "1GiB",
  },
  async (payload, ctx) => {
    const authUid = getCallableAuthUid(payload, ctx);
    if (!authUid) {
      throw new functions.https.HttpsError("unauthenticated", "請先登入");
    }
    const role = await readUserRole(authUid);
    if (!isStaffRole(role)) {
      throw new functions.https.HttpsError(
        "permission-denied",
        "僅管理者或員工可使用 AI 繪圖",
      );
    }

    const data = unwrapCallablePayload(payload);
    const crops = Array.isArray(data.aiCrops) ? data.aiCrops.slice(0, 6) : [];
    const mockDraft = buildMockStraightDrawingDraft({
      ...data,
      aiCrops: crops,
    });
    const apiKey = getGeminiApiKey();
    if (!apiKey) {
      return {
        ...mockDraft,
        source: "mock-functions-no-gemini-key",
        message: "尚未設定 GEMINI_API_KEY，已回傳測試草稿。",
      };
    }

    const normalizedCrops = crops
      .map(normalizeAiCropForGemini)
      .filter((crop) => crop.inlineData);
    if (!normalizedCrops.length) {
      return {
        ...mockDraft,
        source: "mock-functions-no-crops",
        message: "未收到可供 AI 讀取的裁切圖，已回傳測試草稿。",
      };
    }

    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const prompt = [
        "你是石材檯面繪圖助理。請根據使用者框選的原圖裁切區，產生一字型檯面繪圖草稿 JSON。",
        "只回傳 JSON，不要 markdown。",
        "JSON 欄位必須固定：drawingType, length, depth, thickness, segments, cabinetBodies, fixtures, sideOptions, confidence, needsReview, notes。",
        "drawingType 固定 straight。length/depth/thickness 使用公分數字。",
        "segments 是從左到右構成總長的全部分段，補板/留料也必須列入。每筆包含 type, label, width。",
        "segments.type 僅可用 cabinet、filler、appliance、gap、stone。補板、左右側補、非桶身但佔總長的石材段請用 filler 或 stone。",
        "cabinetBodies 是陣列，每筆可含 width/length/qty/label；若無法辨識請回空陣列。",
        "fixtures 是水槽/爐具定位陣列，每筆包含 type(sink/stove), label, position, center, length, depth, radius, dig。",
        "水中/爐中標註是中心距離，必須匯入 fixtures.center，單位公分，從左端量起。爐中可回 position=火中。",
        "若圖面沒有標水中/爐中，但水槽或爐具明顯在某個櫃體正中央，仍要回 fixtures；請用 segments 從左到右累加並計算該櫃中心作為 center。",
        "如果無法直接算出 center，但能判斷設備在第幾段或第幾個桶身置中，可在 fixture 回 segmentIndex 或 cabinetIndex，並加 centered=true。",
        "sideOptions 表示左右後邊界條件，可含 leftOption/rightOption/backOption。請使用系統值：左靠牆、左見光、左齊桶身、左側落腳、右靠牆、右見光、右齊桶身、右側落腳、後靠牆、後見光。",
        "若圖面可判斷左邊貼牆，回 leftOption=左靠牆。若右邊是開放邊且檯面齊桶身，回 rightOption=右齊桶身；若只是開放見光，回 rightOption=右見光。",
        "不要因為右端有垂直收邊線就判斷為右靠牆；只有右端明確貼牆或有牆面標註時才可回 rightOption=右靠牆。",
        "原圖常以 mm 標示尺寸；回傳 JSON 一律換算為公分。例如 900 mm 回 90，中心 450 mm 回 45。",
        "confidence 必須是 0 到 1 的數字。notes 必須是字串陣列。",
        "若尺寸不確定，使用 null 或合理推測，並把 needsReview 設 true。",
        `訂單摘要：${JSON.stringify(data.orderSummary || {})}`,
        `框選資訊：${JSON.stringify(normalizedCrops.map((crop) => crop.meta))}`,
      ].join("\n");
      const { result, modelName } = await generateGeminiContentWithFallback(
        genAI,
        [
          { text: prompt },
          ...normalizedCrops.map((crop) => ({ inlineData: crop.inlineData })),
        ],
      );
      const text = result.response.text();
      const parsed = parseGeminiJson(text);
      const normalizedDraft = normalizeStraightDrawingDraft(parsed, mockDraft);
      return {
        ...normalizedDraft,
        aiCrops: mockDraft.aiCrops,
        crop: mockDraft.crop,
        source: "gemini",
        model: modelName,
      };
    } catch (err) {
      logger.error("analyzeStraightDrawingDraft failed", {
        error: err?.message || String(err),
      });
      return {
        ...mockDraft,
        source: "mock-functions-gemini-error",
        message: `Gemini 解析失敗，已回傳測試草稿：${err?.message || "unknown"}`,
      };
    }
  },
);

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
      roles: [],
      companyIds: [],
      customerApproved: false,
    };
  }
  const snap = await admin.firestore().collection("Users").doc(uid).get();
  const data = snap.exists ? snap.data() || {} : {};
  const roles = Array.isArray(data.roles)
    ? data.roles.map((role) => String(role || "").trim()).filter(Boolean)
    : [];
  const legacyRole = String(data.role || "").trim();
  if (legacyRole && !roles.includes(legacyRole)) {
    roles.push(legacyRole);
  }
  return {
    uid,
    role: legacyRole,
    roles,
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

  // 明細資料夾名稱：訂單號 + 顏色（不含安裝地址，避免名稱過長）
  const detailFolderRaw = [orderNumber, color]
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
    installAddress: String(installAddress || "").trim(),
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

// Module-level flag: once we know SYNO.Finder.FileIndexed.Search is unavailable
// on this NAS (errorCode 102 — Universal Search package not installed/disabled),
// every subsequent call inside the same function instance skips the Finder step
// entirely. Saves ~6-10 seconds per query.
let _finderApiUnavailableThisInstance = false;

// Module-level cache: which Finder search API name does this NAS actually
// expose? Universal Search uses different names across DSM versions:
//   - SYNO.Finder.FileIndexed.Search   (older)
//   - SYNO.Finder.File.Search          (newer)
//   - SYNO.Finder.FileIndexing.Search  (alt)
// We probe SYNO.API.Info once per instance to discover the right one.
// Value of null means "not yet probed". Empty string means "probed and none".
let _finderApiName = null;

// 探測這台 NAS 上有哪個 SYNO.Finder.*Search API 可用。回傳完整 API 名稱字串，
// 若都找不到就回空字串。結果會快取到 instance 結束。
async function probeFinderApiName(baseUrl, sid) {
  if (_finderApiName !== null) return _finderApiName;
  try {
    const url = new URL("/webapi/query.cgi", baseUrl);
    url.searchParams.set("api", "SYNO.API.Info");
    url.searchParams.set("version", "1");
    url.searchParams.set("method", "query");
    url.searchParams.set("query", "SYNO.Finder.");
    url.searchParams.set("_sid", sid);
    const resp = await fetch(url.toString(), { method: "GET" });
    const json = await parseJsonSafe(resp);
    if (
      resp.ok &&
      json?.success &&
      json.data &&
      typeof json.data === "object"
    ) {
      const allNames = Object.keys(json.data);
      logger.info("probeFinderApiName: discovered Finder APIs", {
        count: allNames.length,
        names: allNames.slice(0, 30),
      });
      // Prefer FileIndexed.Search → File.Search → FileIndexing.Search → first *.Search
      const preferred = [
        "SYNO.Finder.FileIndexed.Search",
        "SYNO.Finder.File.Search",
        "SYNO.Finder.FileIndexing.Search",
      ];
      for (const name of preferred) {
        if (allNames.includes(name)) {
          _finderApiName = name;
          return name;
        }
      }
      const anySearch = allNames.find((n) => /\.Search$/i.test(n));
      _finderApiName = anySearch || "";
      return _finderApiName;
    }
  } catch (err) {
    logger.warn("probeFinderApiName: error", { error: err?.message });
  }
  _finderApiName = "";
  return "";
}

// 用唯一檔名在整個 NAS 搜尋，直接取得檔案現在的完整路徑
async function synologySearchFileByName({ baseUrl, sid, rootPath, fileName }) {
  const apiUrl = new URL("/webapi/entry.cgi", baseUrl).toString();
  const normalizedRootPath = normalizeSynologyDirPath(String(rootPath || ""));

  // Strip extension for Finder keyword (full-text search matches better without .ext)
  const stemName = fileName.replace(/\.[^.]+$/, "");

  // Helper: pull display name out of a Finder/FileStation item, trying every
  // known field name DSM has used across versions.
  function pickItemName(item) {
    if (!item || typeof item !== "object") return "";
    const candidates = [
      // Synology Universal Search (Finder) Spotlight metadata
      item.SYNOMDFSName,
      item.dentry_name,
      item.name,
      item.title,
      item.display_name,
      item.displayName,
      item.filename,
      item.file_name,
      item.fileName,
      item.basename,
      item.base_name,
    ];
    for (const c of candidates) {
      const s = String(c ?? "").trim();
      if (s) return s;
    }
    // Last resort: derive from a path-ish field
    const pathLike = String(
      item.SYNOMDPath ||
        item.SYNOMDSharePath ||
        item.path ||
        item.full_path ||
        item.fullPath ||
        "",
    ).trim();
    if (pathLike) {
      const seg = pathLike.split("/").filter(Boolean).pop();
      if (seg) return seg;
    }
    return "";
  }

  // Helper: pull parent directory out of a Finder/FileStation item.
  function pickItemDir(item) {
    if (!item || typeof item !== "object") return "";
    const candidates = [
      item.dir,
      item.folder_path,
      item.folderPath,
      item.parent_dir,
      item.parentDir,
      item.parent_path,
      item.parentPath,
      item.parent,
    ];
    for (const c of candidates) {
      const s = String(c ?? "").trim();
      if (s) return s;
    }
    return "";
  }

  // Helper: build the full path for an item, falling back to dir + name.
  function pickItemFullPath(item, name) {
    // Synology Finder 用 SYNOMDSharePath（不含 /volume1 前綴），FileStation 路徑
    // 通常也是 share-relative，所以優先使用 SharePath
    const direct = String(
      item?.SYNOMDSharePath ||
        item?.SYNOMDPath ||
        item?.path ||
        item?.full_path ||
        item?.fullPath ||
        "",
    ).trim();
    if (direct) {
      // Strip leading /volume1, /volume2, ... so it lines up with FileStation paths
      return direct.replace(/^\/volume\d+/, "");
    }
    const dir = pickItemDir(item);
    if (dir && name) return `${dir.replace(/\/+$/, "")}/${name}`;
    return "";
  }

  // Helper: extract matched path from Finder items array
  function extractMatchFromItems(items, keyword) {
    const ext = fileName.includes(".")
      ? fileName.split(".").pop().toLowerCase()
      : "";
    const fileNameLower = fileName.toLowerCase();
    const stemLower = stemName.toLowerCase();

    function isPathAllowed(candidatePath) {
      const normalizedCandidate = normalizeSynologyDirPath(
        String(candidatePath || ""),
      );
      if (!normalizedCandidate) return false;
      if (!normalizedRootPath) return true;
      return (
        normalizedCandidate === normalizedRootPath ||
        normalizedCandidate.startsWith(`${normalizedRootPath}/`)
      );
    }

    // Pass 1: exact filename match (e.g. "27243ASW.pdf")
    for (const item of items) {
      const name = pickItemName(item);
      if (!name) continue;
      if (name.toLowerCase() === fileNameLower) {
        const fullPath = pickItemFullPath(item, name);
        if (fullPath && isPathAllowed(fullPath)) {
          logger.info("synologySearchFileByName: found via Finder (exact)", {
            keyword,
            fileName,
            fullPath,
          });
          return fullPath;
        }
      }
    }
    // Pass 2: stem match – name starts with stemName and ends with target extension
    for (const item of items) {
      const name = pickItemName(item);
      if (!name) continue;
      const nameLower = name.toLowerCase();
      if (
        nameLower.startsWith(stemLower) &&
        ext &&
        nameLower.endsWith(`.${ext}`)
      ) {
        const fullPath = pickItemFullPath(item, name);
        if (fullPath && isPathAllowed(fullPath)) {
          logger.info("synologySearchFileByName: found via Finder (stem)", {
            keyword,
            fileName,
            matchedName: name,
            fullPath,
          });
          return fullPath;
        }
      }
    }
    // Pass 3: contains stem AND ends with .ext (loosest, last resort)
    if (ext) {
      for (const item of items) {
        const name = pickItemName(item);
        if (!name) continue;
        const nameLower = name.toLowerCase();
        if (nameLower.includes(stemLower) && nameLower.endsWith(`.${ext}`)) {
          const fullPath = pickItemFullPath(item, name);
          if (fullPath && isPathAllowed(fullPath)) {
            logger.info(
              "synologySearchFileByName: found via Finder (contains)",
              { keyword, fileName, matchedName: name, fullPath },
            );
            return fullPath;
          }
        }
      }
    }
    return null;
  }

  // 通知 Finder server 釋放 query_id 對應的搜尋會話 (best-effort)
  async function cleanupFinderQuery(apiName, queryId) {
    if (!apiName || !queryId) return;
    try {
      const body = new URLSearchParams();
      body.set("api", apiName);
      body.set("version", "1");
      body.set("method", "clean");
      body.set("query_id", queryId);
      body.set("_sid", sid);
      await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      });
    } catch (_) {}
  }

  // Helper: run Finder search with polling until finished === true (like DSM UI)
  // Returns one of:
  //   { result: "<path>" }     – matched file path
  //   { result: null, apiUnavailable: true }
  //                            – Finder API not available on this DSM (errorCode 102)
  //   { result: null }         – Finder finished but no match
  async function finderSearch(keyword) {
    // 探測這台 NAS 實際提供哪個 Finder Search API 名稱
    const apiName = await probeFinderApiName(baseUrl, sid);
    if (!apiName) {
      return { result: null, apiUnavailable: true };
    }

    // ── DSM Universal Search 單階段流程 ──
    // method=search 直接回 { has_error, hits, total } —— 不要自己生 query_id
    // (帶了無效 query_id 會收到 errorCode 119)
    let lastItemsSample = null;

    // Finder 關鍵字使用 Lucene-like 語法，`-` 會被當成 NOT 運算子，
    // 含 dash 的訂單號碼（例如 27463-1AGR、214-2ABB）會被 reject 為 errorCode 120。
    // 用雙引號包起來讓 dash 視為字面字元。
    const safeKeyword = /[-+!&|()\[\]{}^"~*?:\\\/\s]/.test(
      String(keyword || ""),
    )
      ? `"${String(keyword).replace(/"/g, '\\"')}"`
      : String(keyword);

    const body = new URLSearchParams();
    body.set("api", apiName);
    body.set("version", "1");
    body.set("method", "search");
    body.set("agent", "search_now");
    body.set("indice", "[]");
    body.set("keyword", safeKeyword);
    body.set("orig_keyword", safeKeyword);
    body.set("criteria_list", "[]");
    body.set("from", "0");
    body.set("size", "50");
    body.set("file_type", "");
    body.set(
      "fields",
      JSON.stringify([
        "SYNOMDFSName",
        "SYNOMDFSCreationDate",
        "SYNOMDFSSize",
        "SYNOMDExtension",
        "SYNOMDLastUsedDate",
        "SYNOMDPath",
        "SYNOMDFSContentChangeDate",
      ]),
    );
    body.set(
      "search_weight_list",
      JSON.stringify([
        { field: "SYNOMDWildcard", weight: 1 },
        { field: "SYNOMDTextContent", weight: 1 },
        { field: "SYNOMDSearchFileName", weight: 8.5, trailing_wildcard: true },
      ]),
    );
    body.set("_sid", sid);

    const resp = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    const finderJson = await parseJsonSafe(resp);

    logger.info("synologySearchFileByName: Finder search", {
      keyword,
      fileName,
      success: finderJson?.success,
      total: finderJson?.data?.total,
      hitsCount: Array.isArray(finderJson?.data?.hits)
        ? finderJson.data.hits.length
        : undefined,
      itemsCount: Array.isArray(finderJson?.data?.items)
        ? finderJson.data.items.length
        : undefined,
      errorCode: finderJson?.error?.code,
      dataKeys: finderJson?.data ? Object.keys(finderJson.data) : null,
    });

    if (!finderJson?.success) {
      // 只在 errorCode 102（API 不存在）時才永久禁用 Finder。
      // 其他 error（119 query_id、120 參數、120 SID 過期等）只算這次失敗，
      // 下次同 instance 仍可再試。
      const code = finderJson?.error?.code;
      const fatal = code === 102;
      return { result: null, apiUnavailable: fatal };
    }

    const items =
      finderJson?.data?.hits ||
      finderJson?.data?.items ||
      finderJson?.data?.files ||
      finderJson?.data?.result ||
      finderJson?.data?.list ||
      [];

    if (
      finderJson?.data?.total > 0 &&
      Array.isArray(items) &&
      items.length > 0
    ) {
      logger.info("synologySearchFileByName: Finder first item dump", {
        dataKeys: Object.keys(finderJson.data || {}),
        itemKeys: Object.keys(items[0] || {}),
        firstItem: JSON.stringify(items[0]).slice(0, 1500),
      });
    }
    if (
      finderJson?.data?.total > 0 &&
      (!Array.isArray(items) || items.length === 0)
    ) {
      logger.warn(
        "synologySearchFileByName: Finder reports total>0 but items empty",
        {
          total: finderJson?.data?.total,
          dataKeys: Object.keys(finderJson.data || {}),
          dataSample: JSON.stringify(finderJson.data).slice(0, 1500),
        },
      );
    }

    if (Array.isArray(items) && items.length > 0) {
      lastItemsSample = items.slice(0, 3).map((it) => ({
        keys: Object.keys(it || {}),
        name: pickItemName(it),
        dir: pickItemDir(it),
        path: String(it?.path || it?.full_path || "").trim(),
      }));
    }

    const match = extractMatchFromItems(items, keyword);
    if (match) return { result: match };

    if (lastItemsSample) {
      logger.warn(
        "synologySearchFileByName: Finder returned hits but no match",
        { keyword, fileName, sample: lastItemsSample },
      );
    }
    return { result: null };
  }

  // ── Strategy 1: SYNO.Finder (Universal Search, index-based, instant) ──
  // 索引搜尋只試 1 次（不重試），失敗或無結果就立刻 fall through。
  // 索引是靜態的，重試也不會有不同結果，省下時間給 BFS traversal。
  if (_finderApiUnavailableThisInstance) {
    logger.info(
      "synologySearchFileByName: Finder API marked unavailable for this instance, skipping",
      { fileName },
    );
  } else {
    try {
      const r1 = await finderSearch(stemName);
      if (r1?.result) return r1.result;
      if (r1?.apiUnavailable) {
        _finderApiUnavailableThisInstance = true;
        logger.warn(
          "synologySearchFileByName: Finder API unavailable, skipping",
          { fileName },
        );
      } else if (stemName !== fileName) {
        const r2 = await finderSearch(fileName);
        if (r2?.result) return r2.result;
        if (r2?.apiUnavailable) {
          _finderApiUnavailableThisInstance = true;
        }
      }
    } catch (finderErr) {
      logger.warn("synologySearchFileByName: Finder API failed, falling back", {
        fileName,
        error: finderErr?.message,
      });
    }
  }

  // ── Strategy 2: SYNO.FileStation.Search (real-time scan, fallback) ──
  const startBody = new URLSearchParams();
  startBody.set("api", "SYNO.FileStation.Search");
  startBody.set("version", "2");
  startBody.set("method", "start");
  startBody.set("folder_path", rootPath);
  startBody.set("pattern", `*${fileName}*`);
  startBody.set("recursive", "true");
  startBody.set("_sid", sid);

  const startResp = await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: startBody.toString(),
  });
  const startJson = await parseJsonSafe(startResp);
  if (!startResp.ok || !startJson.success) return null;
  const taskid = startJson?.data?.taskid;
  if (!taskid) return null;

  // ~10s total: keep it tight so callers can fall through to Strategy 3
  // (deterministic directory traversal) quickly when this scan is unhelpful.
  const pollDelays = [
    200, 300, 500, 500, 500, 500, 500, 500, 500, 500, 1000, 1000, 1000, 1000,
    1000, 1000,
  ];
  let foundPath = null;
  for (let i = 0; i < pollDelays.length; i++) {
    await new Promise((r) => setTimeout(r, pollDelays[i]));

    const listBody = new URLSearchParams();
    listBody.set("api", "SYNO.FileStation.Search");
    listBody.set("version", "2");
    listBody.set("method", "list");
    listBody.set("taskid", taskid);
    listBody.set("offset", "0");
    listBody.set("limit", "10");
    listBody.set("_sid", sid);

    const listResp = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: listBody.toString(),
    });
    const listJson = await parseJsonSafe(listResp);
    if (!listResp.ok || !listJson.success) continue;

    const allFiles = Array.isArray(listJson?.data?.files)
      ? listJson.data.files
      : [];
    const hit = allFiles.find(
      (f) => !f?.isdir && String(f?.name || "").includes(fileName),
    );
    if (hit && hit.path) {
      foundPath = String(hit.path).trim();
      break;
    }
    // Synology bug：剛 start 的 task，前幾次 poll 會回 finished:true 但實際還沒掃。
    // 至少要等 4 個 poll (~1.5s) 才能信任 finished:true。
    if (listJson?.data?.finished && i >= 4) break;
  }

  // 清除任務
  const cleanBody = new URLSearchParams();
  cleanBody.set("api", "SYNO.FileStation.Search");
  cleanBody.set("version", "2");
  cleanBody.set("method", "clean");
  cleanBody.set("taskid", taskid);
  cleanBody.set("_sid", sid);
  fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: cleanBody.toString(),
  }).catch(() => {});

  if (foundPath) return foundPath;

  // ── Strategy 3: Deterministic directory traversal (100% reliable) ──
  // List customer folders → find order subfolder by name → return PDF path
  try {
    const orderMatch = stemName.match(/(\d{5})([A-Z]{3})$/i);
    if (orderMatch) {
      const customerCode = orderMatch[2].toUpperCase();
      const customerNumber = CUSTOMER_CODE_LOOKUP[customerCode] || "";

      logger.info(
        "synologySearchFileByName: Strategy 3 - directory traversal",
        {
          fileName,
          stemName,
          customerCode,
          customerNumber,
          rootPath,
        },
      );

      // List all customer folders under rootPath
      let customerFolders = [];
      try {
        customerFolders = await synologyListFolderEntries({
          baseUrl,
          sid,
          folderPath: rootPath,
        });
      } catch (listErr) {
        logger.warn("synologySearchFileByName: cannot list rootPath", {
          rootPath,
          error: listErr?.message,
        });
      }

      const dirFolders = customerFolders.filter((f) => f.isdir);

      // Narrow down: find customer folders containing customer code or number
      const candidates = dirFolders.filter((f) => {
        const name = String(f.name || "").toUpperCase();
        if (name.includes(customerCode)) return true;
        if (customerNumber && name.includes(customerNumber)) return true;
        return false;
      });

      // BFS expansion: NAS may have an extra "category" folder layer between
      // rootPath and the real customer folder (e.g. "900+菲爾體系所有訂單…"),
      // whose name contains neither the customer code nor the customer number.
      // After collecting first-level matches, also expand non-matching first-
      // level folders one layer deep and merge in any second-level folders
      // that DO match. This keeps the search bounded but covers 3-level trees.
      const matchedKeys = new Set(
        candidates.map((c) => c.path || `${rootPath}/${c.name}`),
      );
      const nonMatchingTopFolders = dirFolders.filter(
        (f) => !matchedKeys.has(f.path || `${rootPath}/${f.name}`),
      );
      // 智慧過濾：只展開「看起來像類別資料夾」的 top folders。
      // 客戶資料夾通常以「3 位數字-」開頭（例：`230-菱菲爾...`），
      // 類別資料夾則不是（例：`900+菲爾體系...`、`0--xxx`、`AAA-...`）。
      // 因此只展開那些名稱不以 `\d{3}-` 開頭的 top folder。
      const looksLikeCategory = (n) => !/^\d{3}-/.test(String(n || "").trim());
      const categoryTops = nonMatchingTopFolders.filter((f) =>
        looksLikeCategory(f.name),
      );
      // 處理所有類別資料夾，分批並行（每批 30 個）以避免一次打爆 NAS
      // 同時保持速度（800 個 / 30 = 約 27 批 × 300ms ≈ 8 秒以內）
      const BATCH_SIZE = 30;
      const expandResults = [];
      for (let i = 0; i < categoryTops.length; i += BATCH_SIZE) {
        const batch = categoryTops.slice(i, i + BATCH_SIZE);
        const batchResults = await Promise.all(
          batch.map(async (top) => {
            const topPath = top.path || `${rootPath}/${top.name}`;
            try {
              const subEntries = await synologyListFolderEntries({
                baseUrl,
                sid,
                folderPath: topPath,
              });
              return subEntries.filter((s) => {
                if (!s.isdir) return false;
                const n = String(s.name || "").toUpperCase();
                if (n.includes(customerCode)) return true;
                if (customerNumber && n.includes(customerNumber)) return true;
                return false;
              });
            } catch (_) {
              return [];
            }
          }),
        );
        expandResults.push(...batchResults);
      }
      const topToExpand = categoryTops; // for logging only
      for (const matches of expandResults) {
        for (const m of matches) candidates.push(m);
      }

      // If no narrowed candidates, try ALL folders
      const foldersToCheck = candidates.length > 0 ? candidates : dirFolders;

      logger.info("synologySearchFileByName: traversal candidates", {
        totalFolders: dirFolders.length,
        narrowed: candidates.length,
        checking: foldersToCheck.length,
        expandedTopFolders: topToExpand.length,
      });

      for (const folder of foldersToCheck) {
        const folderPath = folder.path || `${rootPath}/${folder.name}`;
        try {
          const subEntries = await synologyListFolderEntries({
            baseUrl,
            sid,
            folderPath,
          });
          // Look for subfolder starting with order number
          const orderFolder = subEntries.find((sf) => {
            if (!sf.isdir) return false;
            const sfName = String(sf.name || "").toUpperCase();
            return sfName.startsWith(stemName.toUpperCase());
          });
          if (orderFolder) {
            const orderFolderPath =
              orderFolder.path || `${folderPath}/${orderFolder.name}`;
            // Try to confirm PDF exists inside
            try {
              const filesInOrder = await synologyListFolderEntries({
                baseUrl,
                sid,
                folderPath: orderFolderPath,
              });
              const pdfFile = filesInOrder.find(
                (f) =>
                  !f.isdir &&
                  String(f.name || "").toLowerCase() === fileName.toLowerCase(),
              );
              if (pdfFile) {
                const pdfPath =
                  pdfFile.path || `${orderFolderPath}/${pdfFile.name}`;
                logger.info(
                  "synologySearchFileByName: found via traversal (PDF confirmed)",
                  {
                    fileName,
                    pdfPath,
                  },
                );
                return pdfPath;
              }
            } catch (_) {}
            // PDF not found inside but folder is correct — return assumed path
            const assumedPath = `${orderFolderPath}/${fileName}`;
            logger.info(
              "synologySearchFileByName: found folder via traversal (PDF assumed)",
              {
                fileName,
                assumedPath,
              },
            );
            return assumedPath;
          }
        } catch (listErr) {
          // Permission error or folder inaccessible — skip
          continue;
        }
      }
      logger.info("synologySearchFileByName: traversal found nothing", {
        fileName,
      });
    }
  } catch (traverseErr) {
    logger.warn("synologySearchFileByName: directory traversal failed", {
      fileName,
      error: traverseErr?.message,
    });
  }

  return null;
}

// 用訂單 PDF 反推資料夾，PDF 檔名常見有兩種：
//   1) 完整訂單號碼.pdf （例：27298ACU.pdf）
//   2) 主訂單號碼.pdf／主訂單號碼維修單.pdf 等（例：27375-1維修單.pdf 對應訂單 27375-1BEP）
// 為了避免子件號碼（BEP / ACU / B1 …）害我們搜不到，先用完整訂單搜，
// 找不到再剝掉尾碼重搜，並要求結果資料夾的名稱包含完整訂單號，避免誤抓鄰居資料夾。
async function searchOrderPdfWithFallback({
  baseUrl,
  sid,
  rootPath,
  orderNumber,
}) {
  const original = String(orderNumber || "").trim();
  if (!original) return "";

  // Step 1: 完整訂單號
  let pdfPath = await synologySearchFileByName({
    baseUrl,
    sid,
    rootPath,
    fileName: `${original}.pdf`,
  });
  if (pdfPath) return pdfPath;

  // Step 2: 剝掉尾端英文字（例 27375-1BEP → 27375-1）
  const stripped = original.replace(/[A-Z]+$/i, "").replace(/[-_.]+$/, "");
  if (!stripped || stripped === original) return "";

  pdfPath = await synologySearchFileByName({
    baseUrl,
    sid,
    rootPath,
    fileName: `${stripped}.pdf`,
  });
  if (!pdfPath) return "";

  // 防呆：要求 PDF 所在資料夾名稱包含完整訂單號，否則可能抓到隔壁子件的資料夾
  const parts = pdfPath.split("/").filter(Boolean);
  const parentFolderName = parts[parts.length - 2] || "";
  const upperParent = parentFolderName.toUpperCase();
  const upperOrder = original.toUpperCase();
  if (upperParent.includes(upperOrder)) {
    logger.info("searchOrderPdfWithFallback: matched via stripped suffix", {
      orderNumber: original,
      stripped,
      pdfPath,
    });
    return pdfPath;
  }
  logger.info(
    "searchOrderPdfWithFallback: stripped match rejected (parent folder lacks full order)",
    { orderNumber: original, stripped, pdfPath, parentFolderName },
  );
  return "";
}

async function synologyListFolderEntries({ baseUrl, sid, folderPath }) {
  // Use POST with form body to avoid GET URL-length limits with long CJK paths
  const listUrl = new URL("/webapi/entry.cgi", baseUrl);
  const body = new URLSearchParams();
  body.set("api", "SYNO.FileStation.List");
  body.set("version", "2");
  body.set("method", "list");
  body.set("folder_path", folderPath);
  body.set("additional", JSON.stringify(["real_path", "time", "size"]));
  body.set("_sid", sid);

  const listResp = await fetch(listUrl.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const listJson = await parseJsonSafe(listResp);
  if (!listResp.ok || !listJson.success) {
    throw new Error(formatSynologyError(listJson, "Synology 列出資料夾失敗"));
  }

  const files = listJson?.data?.files;
  return Array.isArray(files) ? files : [];
}

// 使用 SYNO.Finder (Universal Search / 索引搜尋) 搜尋資料夾，速度遠勝 FileStation.Search
async function synologyFinderSearchFolders({ baseUrl, sid, pattern }) {
  if (_finderApiUnavailableThisInstance) {
    logger.info(
      "synologyFinderSearchFolders: Finder API marked unavailable for this instance, skipping",
      { pattern },
    );
    return [];
  }
  // 探測這台 NAS 上實際提供哪個 Finder Search API 名稱
  const apiName = await probeFinderApiName(baseUrl, sid);
  if (!apiName) {
    _finderApiUnavailableThisInstance = true;
    logger.info(
      "synologyFinderSearchFolders: no Finder Search API discovered, marking instance",
      { pattern },
    );
    return [];
  }
  const apiUrl = new URL("/webapi/entry.cgi", baseUrl).toString();
  try {
    // 若關鍵字含 Lucene 特殊字元（- + ! 等），需用引號包起來避免被當運算子
    // 否則例如 "27375-1BEP" 會被解析為 NOT 1BEP，造成無結果
    const safeKeyword = /[-+!&|()[\]{}^"~*?:\\/\s]/.test(pattern)
      ? `"${pattern.replace(/"/g, '\\"')}"`
      : pattern;
    // 單階段 search call (跟 finderSearch 一樣)，不要自己生 query_id
    const body = new URLSearchParams();
    body.set("api", apiName);
    body.set("version", "1");
    body.set("method", "search");
    body.set("agent", "search_now");
    body.set("indice", "[]");
    body.set("keyword", safeKeyword);
    body.set("orig_keyword", safeKeyword);
    body.set("criteria_list", "[]");
    body.set("from", "0");
    body.set("size", "50");
    body.set("file_type", "");
    body.set(
      "fields",
      JSON.stringify([
        "SYNOMDFSName",
        "SYNOMDFSCreationDate",
        "SYNOMDFSSize",
        "SYNOMDExtension",
        "SYNOMDPath",
        "SYNOMDIsDir",
      ]),
    );
    body.set(
      "search_weight_list",
      JSON.stringify([
        { field: "SYNOMDWildcard", weight: 1 },
        { field: "SYNOMDTextContent", weight: 1 },
        { field: "SYNOMDSearchFileName", weight: 8.5, trailing_wildcard: true },
      ]),
    );
    body.set("_sid", sid);

    const resp = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    const json = await parseJsonSafe(resp);
    logger.info("synologyFinderSearchFolders: search", {
      pattern,
      success: json?.success,
      total: json?.data?.total,
      hitsCount: Array.isArray(json?.data?.hits)
        ? json.data.hits.length
        : undefined,
      errorCode: json?.error?.code,
    });
    if (!json?.success) {
      // 只在 errorCode 102 (API 不存在) 時才永久禁用
      if (json?.error?.code === 102) {
        _finderApiUnavailableThisInstance = true;
        logger.warn(
          "synologyFinderSearchFolders: Finder API not installed, marking instance",
          { pattern },
        );
      } else {
        logger.warn("synologyFinderSearchFolders: search failed (non-fatal)", {
          pattern,
          errorCode: json?.error?.code,
        });
      }
      return [];
    }

    const items =
      json?.data?.hits ||
      json?.data?.items ||
      json?.data?.files ||
      json?.data?.result ||
      [];
    // 轉換 Finder 回傳格式為與 FileStation 一致的 { name, path, isdir, additional }
    const folders = [];
    for (const item of items) {
      const isDir =
        item?.SYNOMDIsDir === "y" ||
        item?.SYNOMDIsDir === true ||
        item?.is_dir === true ||
        item?.type === "dir" ||
        item?.isdir === true;
      if (!isDir) continue;
      const name = String(
        item?.SYNOMDFSName ||
          item?.dentry_name ||
          item?.name ||
          item?.title ||
          "",
      ).trim();
      const rawPath = String(
        item?.SYNOMDSharePath || item?.SYNOMDPath || item?.path || "",
      ).trim();
      // 去掉 /volume1 前綴對齊 FileStation 路徑
      const fullPath = rawPath.replace(/^\/volume\d+/, "");
      if (name && fullPath) {
        folders.push({
          name,
          path: fullPath,
          isdir: true,
          additional: {
            time: { mtime: Number(item?.mtime || item?.last_modified || 0) },
          },
        });
      }
    }
    if (folders.length > 0) {
      logger.info("synologyFinderSearchFolders: folders found", {
        pattern,
        count: folders.length,
      });
    }
    return folders;
  } catch (err) {
    logger.warn("synologyFinderSearchFolders: error", {
      pattern,
      error: err?.message,
    });
    return [];
  }
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

  // Step 2: 輪詢直到搜尋完成（最多等 30 秒），每次取足夠多筆
  // 首次等較短時間（200ms），快速遞增，找到結果就提早結束
  let finished = false;
  let files = [];
  const pollDelays = [
    200, 300, 500, 500, 500, 500, 500, 500, 500, 500, 1000, 1000, 1000, 1000,
    1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000,
    1000, 1000, 1000, 1000,
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
    // 找到結果就提早結束。Synology bug：前幾次 poll 可能假回 finished:true，
    // 至少要等 4 個 poll (~1.5s) 才能信任 finished:true。
    if (files.length > 0) break;
    if (finished && i >= 4) break;
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
            "listOrderFoldersParallel: deep scan found client folders at L2",
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

        // Level2 也沒找到客戶資料夾 → 再往下掃 level3（處理 4 層結構：
        //   basePath/category/subcategory/clientFolder/orderFolder）
        const batchLevel3 = (
          await Promise.all(
            batchLevel2.slice(0, 60).map(async (dir) => {
              try {
                const entries = await synologyListFolderEntries({
                  baseUrl,
                  sid,
                  folderPath: dir.path,
                });
                return entries.filter((e) => e?.isdir);
              } catch {
                return [];
              }
            }),
          )
        ).flat();

        let clientFoldersL3 = [];
        if (customerCode) {
          clientFoldersL3 = batchLevel3.filter((e) =>
            String(e.name || "")
              .toUpperCase()
              .includes(customerCode.toUpperCase()),
          );
        }
        if (clientFoldersL3.length === 0 && customerNumber) {
          const numStr = String(customerNumber).replace(/^0+/, "");
          clientFoldersL3 = batchLevel3.filter((e) =>
            String(e.name || "").includes(numStr),
          );
        }
        if (clientFoldersL3.length > 0) {
          logger.info(
            "listOrderFoldersParallel: deep scan found client folders at L3",
            {
              batchStart: i,
              level3Total: batchLevel3.length,
              matched: clientFoldersL3.length,
            },
          );
          // 掃 level4 取訂單資料夾
          const level4Dirs = (
            await Promise.all(
              clientFoldersL3.slice(0, 10).map(async (cf) => {
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
          // 額外多掃一層（level5）：有些訂單放在「已安裝ok」等中介資料夾內
          const level5Results = await Promise.all(
            level4Dirs.map(async (subDir) => {
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
          return [...level4Dirs, ...level5Results.flat()];
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

  // 優先 Universal Search (Finder API)，若不可用則 fallback 到 FileStation.Search
  const sharedFolderRoot = "/" + basePath.split("/").filter(Boolean)[0];
  const t0 = Date.now();
  let entries = [];

  // Step 1: Finder API
  entries = await synologyFinderSearchFolders({
    baseUrl,
    sid,
    pattern: normalizedOrderNumber,
  });

  // Step 2: Finder 無結果 → fallback FileStation.Search
  if (entries.length === 0) {
    logger.info(
      "resolveExistingOrderFolderPath: Finder empty, fallback to FileStation.Search",
    );
    const searchRoots =
      sharedFolderRoot && sharedFolderRoot !== basePath
        ? [basePath, sharedFolderRoot]
        : [basePath];

    const searchPromises = searchRoots.map((searchRoot) =>
      synologySearchFolders({
        baseUrl,
        sid,
        rootPath: searchRoot,
        pattern: normalizedOrderNumber,
      }),
    );

    const timeoutPromise = new Promise((resolve) =>
      setTimeout(() => resolve([]), 60000),
    );

    try {
      const results = await Promise.race([
        Promise.any(
          searchPromises.map((p) =>
            p.then((r) =>
              r.length > 0 ? r : Promise.reject(new Error("empty")),
            ),
          ),
        ),
        timeoutPromise,
      ]);
      entries = Array.isArray(results) ? results : [];
    } catch {
      entries = [];
    }
  }

  logger.info("resolveExistingOrderFolderPath: search result", {
    count: entries.length,
    ms: Date.now() - t0,
  });

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
  const resolvedPath =
    selectedPath || `${basePath}/${customerFolder}/${selected.name}`;
  return {
    uploadFolder: resolvedPath,
    matched: true,
    matchedFolderName: selected.name,
    matchScore: selected.score,
    matchedParent: selected.parent,
  };
}

function normalizeSynologyDirPath(inputPath = "") {
  const normalized = String(inputPath || "")
    .replace(/\\/g, "/")
    .replace(/\/+/g, "/") // collapse double slashes
    .replace(/\/$/, "") // remove trailing slash
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
    return `${fallbackMessage} (Synology code: 119，SID 不存在或已過期，可能是 NAS 連線逾時)`;
  }

  return `${fallbackMessage} (Synology code: ${code})`;
}

function isSidExpiredError(err) {
  return String(err?.message || "").includes("Synology code: 119");
}

// ── Global SID cache ──────────────────────────────────────────────
// Reuse Synology SID across requests within the same Cloud Functions instance
// to avoid login/logout round-trips (~200-500ms each, ~5-7s on cold start TLS).
// TTL is conservative (8 min) since Synology default session timeout is 15 min.
const _sidCache = { sid: "", ts: 0 };
const SID_CACHE_TTL_MS = 8 * 60 * 1000; // 8 minutes

async function getOrCreateSid(baseUrl, username, password) {
  // Backward-compat wrapper; new code can just call synologyLogin directly.
  return synologyLogin(baseUrl, username, password);
}

async function refreshSid(baseUrl, username, password) {
  return synologyLoginForce(baseUrl, username, password);
}

function invalidateSidCache() {
  _sidCache.sid = "";
  _sidCache.ts = 0;
}

// 真實打 NAS auth.cgi 的底層 login（不經快取）
async function synologyLoginFresh(baseUrl, username, password) {
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

// 公用 login：優先回傳 instance 級快取的 sid。
// 所有 call site 維持原樣即可自動受益。
async function synologyLogin(baseUrl, username, password) {
  if (_sidCache.sid && Date.now() - _sidCache.ts < SID_CACHE_TTL_MS) {
    return _sidCache.sid;
  }
  const sid = await synologyLoginFresh(baseUrl, username, password);
  _sidCache.sid = sid;
  _sidCache.ts = Date.now();
  return sid;
}

// 強制重新登入（用於 SID 過期 119 重試）
async function synologyLoginForce(baseUrl, username, password) {
  _sidCache.sid = "";
  _sidCache.ts = 0;
  const sid = await synologyLoginFresh(baseUrl, username, password);
  _sidCache.sid = sid;
  _sidCache.ts = Date.now();
  return sid;
}

async function synologyLogout(baseUrl, sid) {
  if (!sid) return;
  // 如果這個 sid 是 instance 共用快取，就保留它供下次請求重用
  // (省掉每次請求 ~0.3-0.5s 的 login round-trip)。TTL 到期前都安全。
  if (sid === _sidCache.sid) return;
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
  // Use POST with form body to avoid GET URL-length limits with long CJK paths
  const url = new URL("/webapi/entry.cgi", baseUrl);
  const body = new URLSearchParams();
  body.set("api", "SYNO.FileStation.CreateFolder");
  body.set("version", "2");
  body.set("method", "create");
  body.set("folder_path", JSON.stringify([parentFolderPath]));
  body.set("name", JSON.stringify([name]));
  body.set("force_parent", "true");
  body.set("_sid", sid);
  const resp = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const json = await parseJsonSafe(resp);
  if (!resp.ok || !json.success) {
    // code 414 = already exists — treat as ok
    if (Number(json?.error?.code || 0) === 414) return { ok: true };
    throw new Error(formatSynologyError(json, "Synology 建立資料夾失敗"));
  }
  return { ok: true };
}

async function synologyRenameFolder({ baseUrl, sid, folderPath, newName }) {
  // Use POST with form body to avoid GET URL-length limits with long CJK paths
  const url = new URL("/webapi/entry.cgi", baseUrl);
  const body = new URLSearchParams();
  body.set("api", "SYNO.FileStation.Rename");
  body.set("version", "2");
  body.set("method", "rename");
  body.set("path", JSON.stringify([folderPath]));
  body.set("name", JSON.stringify([newName]));
  body.set("_sid", sid);
  const resp = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
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
    // Use POST with form body to avoid GET URL-length limits with long CJK paths
    const deleteUrl = new URL("/webapi/entry.cgi", baseUrl);
    const body = new URLSearchParams();
    body.set("_sid", sid);
    body.set("api", "SYNO.FileStation.Delete");
    body.set("version", String(version));
    body.set("method", "delete");
    body.set("path", JSON.stringify([pathToDelete]));

    const deleteResp = await fetch(deleteUrl.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    const deleteJson = await parseJsonSafe(deleteResp);
    return { deleteResp, deleteJson };
  }

  async function listFolder(folderPath) {
    // Use POST with form body to avoid GET URL-length limits with long CJK paths
    const listUrl = new URL("/webapi/entry.cgi", baseUrl);
    const body = new URLSearchParams();
    body.set("api", "SYNO.FileStation.List");
    body.set("version", "2");
    body.set("method", "list");
    body.set("folder_path", folderPath);
    body.set("additional", JSON.stringify(["real_path"]));
    body.set("_sid", sid);

    const listResp = await fetch(listUrl.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
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
  // Use POST with form body to avoid GET URL-length limits with long CJK paths.
  // SYNO.FileStation.Download streams the response body regardless of method.
  const downloadUrl = new URL("/webapi/entry.cgi", baseUrl);
  const body = new URLSearchParams();
  body.set("api", "SYNO.FileStation.Download");
  body.set("version", "2");
  body.set("method", "download");
  body.set("path", JSON.stringify([filePath]));
  body.set("mode", "open");
  body.set("_sid", sid);

  return fetch(downloadUrl.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
}

exports.uploadCompletionPhotoToNasHttp = onRequestV2(
  {
    secrets: [SYNO_USERNAME_SECRET, SYNO_PASSWORD_SECRET],
    memory: "1GiB",
    timeoutSeconds: 540,
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

    // 派車任務模式：若帶 taskId,自動從 installTasks 載入並推導 orderDocId
    const taskId = String(form?.fields?.taskId || "").trim();
    let taskData = null;
    let orderDocId = String(form?.fields?.orderDocId || "").trim();
    if (taskId) {
      try {
        const taskSnap = await admin
          .firestore()
          .collection("installTasks")
          .doc(taskId)
          .get();
        if (!taskSnap.exists) {
          sendJson(res, 404, { error: "找不到派車任務" });
          return;
        }
        taskData = taskSnap.data() || {};
        if (!orderDocId) {
          const soId = String(taskData.salesOrderId || "").trim();
          orderDocId = soId.startsWith("legacy_") ? soId.slice(7) : soId;
        }
      } catch (e) {
        logger.warn("uploadCompletionPhotoToNasHttp: load task failed", {
          taskId,
          error: e?.message,
        });
        sendJson(res, 500, { error: "讀取派車任務失敗" });
        return;
      }
    }
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
      orderNumber: form?.fields?.orderNumber || taskData?.orderNumber || "",
      customerName: form?.fields?.customerName || taskData?.customerName || "",
      color: form?.fields?.color || taskData?.color || "",
      installAddress:
        form?.fields?.installAddress || taskData?.siteAddress || "",
    });

    // 計算期望的資料夾名稱：年-月-日[原資料夾名稱][安裝人員1][安裝人員2][安裝人員3]
    const installDate = String(form?.fields?.installDate || "").trim();
    const installer1 = String(form?.fields?.installer1 || "").trim();
    const installer2 = String(form?.fields?.installer2 || "").trim();
    const installer3 = String(form?.fields?.installer3 || "").trim();
    const carNumber = String(form?.fields?.carNumber || "").trim();
    const installerParts = [installer1, installer2, installer3].filter(Boolean);
    const carPart = carNumber ? `+${carNumber}` : "";
    // 新建資料夾用：日期 + 訂單號+顏色 + 安裝員 + 車號（不含安裝地址，名稱較短）
    const desiredParts = [
      installDate,
      folderParts.detailFolder,
      ...installerParts,
    ].filter(Boolean);
    if (carPart) desiredParts.push(carPart);
    const desiredDetailFolder =
      sanitizePathSegment(desiredParts.join(" ")) || folderParts.detailFolder;
    // 找到既有 PDF 資料夾時改名用：日期 + 訂單號+顏色 + 安裝地址 + 安裝員 + 車號
    const addressPart = String(folderParts.installAddress || "").trim();
    const desiredPartsWithAddress = [
      installDate,
      folderParts.detailFolder,
      addressPart,
      ...installerParts,
    ].filter(Boolean);
    if (carPart) desiredPartsWithAddress.push(carPart);
    const desiredDetailFolderWithAddress =
      sanitizePathSegment(desiredPartsWithAddress.join(" ")) ||
      desiredDetailFolder;

    const targetName = `${photoRef.id}-${logicalFileName}`;

    // 先查 Firestore 有沒有已解析過的 NAS 資料夾路徑（同筆訂單多張照片時共用）
    const orderDocRef = admin.firestore().collection("Orders").doc(orderDocId);
    const orderSnap = await orderDocRef.get();
    const cachedNasFolder = String(
      (orderSnap.exists ? orderSnap.data()?.nasOrderFolderPath : "") || "",
    ).trim();

    const orderNumber = String(
      form?.fields?.orderNumber || folderParts.orderNumber || "",
    ).trim();
    const orderToken = normalizeOrderToken(
      folderParts.orderNumber || orderNumber,
    );

    function canUseCachedNasFolder(pathValue) {
      const candidate = normalizeSynologyDirPath(
        String(pathValue || "").trim(),
      );
      if (!candidate) return false;

      // Cached folder must stay under configured order root.
      const orderRoot = normalizeSynologyDirPath(pathCheck.normalized);
      const inOrderRoot =
        candidate === orderRoot || candidate.startsWith(`${orderRoot}/`);
      if (!inOrderRoot) return false;

      // Guard against stale migration paths.
      if (/\/outbox\//i.test(candidate)) return false;

      // Cached folder should still look like this order's folder.
      if (orderToken && !normalizeOrderToken(candidate).includes(orderToken)) {
        return false;
      }

      return true;
    }
    const useCachedNasFolder = canUseCachedNasFolder(cachedNasFolder);
    if (cachedNasFolder && !useCachedNasFolder) {
      logger.warn(
        "uploadCompletionPhotoToNasHttp: ignore stale cached NAS folder",
        {
          orderDocId,
          cachedNasFolder,
          orderRoot: pathCheck.normalized,
          orderToken,
        },
      );
    }

    let sid = "";
    let uploadFolder = `${pathCheck.normalized}/${folderParts.customerFolder}/${folderParts.detailFolder}`;
    let matchMeta = {
      matched: false,
      matchedFolderName: "",
      matchScore: 0,
    };
    // 偵錯用：紀錄這次上傳如何決定資料夾，方便事後稽核
    const searchDiag = {
      usedCachedFolder: false,
      cachedFolder: "",
      pdfSearchAttempted: false,
      pdfSearchSucceeded: false,
      pdfSearchError: "",
      nameMatchAttempted: false,
      nameMatchScore: 0,
      nameMatched: false,
      nameMatchedFolderName: "",
    };

    // 共用的資料夾解析 + 上傳邏輯
    async function resolveAndUpload(useCachedFolder) {
      if (useCachedFolder) {
        uploadFolder = cachedNasFolder;
        matchMeta = { matched: true, matchedFolderName: "", matchScore: -1 };
        searchDiag.usedCachedFolder = true;
        searchDiag.cachedFolder = cachedNasFolder;
        logger.info("uploadCompletionPhotoToNasHttp: using cached NAS folder", {
          orderDocId,
          uploadFolder,
        });
      } else {
        // 只走一條路：用訂單號碼.pdf 搜尋（含剝尾碼 fallback）。
        // 找到 → 用它；找不到 → 直接建新資料夾並寫稽核紀錄，
        // 不再做名稱模糊比對、不再 list 父層，以維持「同一張完工照片只會落在唯一正確資料夾」的一致性。
        const pdfFileName = `${folderParts.orderNumber || orderNumber}.pdf`;
        searchDiag.pdfSearchAttempted = true;
        let pdfPath = "";
        try {
          pdfPath = await searchOrderPdfWithFallback({
            baseUrl,
            sid,
            rootPath: pathCheck.normalized,
            orderNumber: folderParts.orderNumber || orderNumber,
          });
        } catch (pdfSearchErr) {
          searchDiag.pdfSearchError = String(
            pdfSearchErr?.message || pdfSearchErr || "",
          ).slice(0, 500);
          logger.warn(
            "uploadCompletionPhotoToNasHttp: PDF search threw error",
            { orderDocId, pdfFileName, error: pdfSearchErr?.message },
          );
        }

        if (pdfPath) {
          const pdfLastSlash = pdfPath.lastIndexOf("/");
          if (pdfLastSlash > 0) {
            const candidateFolder = normalizeSynologyDirPath(
              pdfPath.slice(0, pdfLastSlash),
            );
            const isOutbox = /\/outbox\//i.test(candidateFolder);
            if (candidateFolder && !isOutbox) {
              uploadFolder = candidateFolder;
              matchMeta = {
                matched: true,
                matchedFolderName: uploadFolder.split("/").pop() || "",
                matchScore: 99999,
              };
              searchDiag.pdfSearchSucceeded = true;
              logger.info(
                "uploadCompletionPhotoToNasHttp: found order folder via PDF search",
                { orderDocId, pdfPath, uploadFolder },
              );
              orderDocRef
                .update({ nasOrderFolderPath: uploadFolder })
                .catch(() => {});
            } else {
              logger.warn(
                "uploadCompletionPhotoToNasHttp: ignore PDF match in outbox",
                {
                  orderDocId,
                  pdfPath,
                  candidateFolder,
                },
              );
            }
          }
        }
      }

      // PDF 找不到 → 建新資料夾，並寫稽核紀錄方便事後核對／搬檔
      if (!matchMeta.matched) {
        const lastSlash = uploadFolder.lastIndexOf("/");
        if (lastSlash > 0) {
          const parentPath = uploadFolder.slice(0, lastSlash);
          uploadFolder = `${parentPath}/${desiredDetailFolder}`;
          orderDocRef
            .update({ nasOrderFolderPath: uploadFolder })
            .catch(() => {});
          let createFolderError = "";
          try {
            await synologyCreateFolder({
              baseUrl,
              sid,
              parentFolderPath: parentPath,
              name: desiredDetailFolder,
            });
          } catch (createErr) {
            createFolderError = String(
              createErr?.message || createErr || "",
            ).slice(0, 500);
            logger.warn(
              "uploadCompletionPhotoToNasHttp: explicit folder create failed, will rely on create_parents",
              { orderDocId, error: createErr?.message },
            );
          }

          const reason = searchDiag.usedCachedFolder
            ? "cachedFolderNotMatched"
            : searchDiag.pdfSearchError
              ? "pdfSearchError"
              : "pdfNotFound";

          logger.warn(
            "uploadCompletionPhotoToNasHttp: created NEW order folder (PDF not found)",
            {
              orderDocId,
              orderNumber,
              parentPath,
              newFolderName: desiredDetailFolder,
              reason,
              diag: searchDiag,
              createFolderError,
            },
          );

          admin
            .firestore()
            .collection("CompletionPhotoFolderCreations")
            .add({
              orderDocId,
              orderNumber,
              customerFolder: folderParts.customerFolder,
              parentPath,
              newFolderName: desiredDetailFolder,
              fullPath: uploadFolder,
              reason,
              diag: searchDiag,
              createFolderError: createFolderError || null,
              uploadedByUid: user?.uid || "",
              uploadedByEmail: String(user?.token?.email || user?.email || ""),
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
            })
            .catch((auditErr) => {
              logger.warn(
                "uploadCompletionPhotoToNasHttp: audit log write failed",
                { orderDocId, error: auditErr?.message },
              );
            });
        }
      }

      await synologyUploadFile({
        baseUrl,
        sid,
        targetPath: normalizeSynologyDirPath(uploadFolder),
        fileBuffer: uploadFile.buffer,
        fileName: targetName,
        mimeType: contentType,
      });

      // Post-upload: rename folder to include date prefix + installer names if needed.
      // Runs after a successful upload so photos are never split across two folders.
      // 兩種情況：
      //   1) 找到既有訂單.pdf 資料夾 → 改名加入安裝地址：日期+訂單號+顏色+地址+安裝員+車號
      //   2) 新建資料夾（PDF 找不到）→ 已經是 desiredDetailFolder（不含地址），不用改名
      const renameTarget = searchDiag.pdfSearchSucceeded
        ? desiredDetailFolderWithAddress
        : desiredDetailFolder;
      if (renameTarget && uploadFolder) {
        const lastSlash = uploadFolder.lastIndexOf("/");
        if (lastSlash > 0) {
          const parentPath = uploadFolder.slice(0, lastSlash);
          const currentName = uploadFolder.slice(lastSlash + 1);
          const hasDatePrefix = /^\d{2,4}-\d{2}-\d{2}/.test(currentName);

          if (!hasDatePrefix && currentName !== renameTarget) {
            const newFolderPath = `${parentPath}/${renameTarget}`;
            let shouldRename = false;
            const originalName = currentName;

            try {
              uploadFolder = await admin
                .firestore()
                .runTransaction(async (tx) => {
                  const snap = await tx.get(orderDocRef);
                  const storedPath = String(
                    snap?.data()?.nasOrderFolderPath || "",
                  ).trim();
                  const storedName = storedPath.split("/").pop();
                  if (storedPath && /^\d{2,4}-\d{2}-\d{2}/.test(storedName)) {
                    // Another concurrent upload already renamed — use its result
                    return storedPath;
                  }
                  tx.update(orderDocRef, { nasOrderFolderPath: newFolderPath });
                  shouldRename = true;
                  return newFolderPath;
                });
            } catch (txErr) {
              logger.warn(
                "uploadCompletionPhotoToNasHttp: post-upload rename transaction failed",
                { orderDocId, error: txErr.message },
              );
            }

            if (shouldRename) {
              try {
                await synologyRenameFolder({
                  baseUrl,
                  sid,
                  folderPath: `${parentPath}/${originalName}`,
                  newName: renameTarget,
                });
                logger.info(
                  "uploadCompletionPhotoToNasHttp: renamed folder after upload",
                  { orderDocId, from: originalName, to: renameTarget },
                );
                // Update nasPath on all existing photo records in this order
                const oldPrefix = `${parentPath}/${originalName}/`;
                const newPrefix = `${parentPath}/${renameTarget}/`;
                const existingPhotosSnap = await admin
                  .firestore()
                  .collection("Orders")
                  .doc(orderDocId)
                  .collection("completionPhotos")
                  .get();
                const batch = admin.firestore().batch();
                let batchCount = 0;
                for (const photoDoc of existingPhotosSnap.docs) {
                  const oldNasPath = String(
                    photoDoc.data()?.nasPath || "",
                  ).trim();
                  if (oldNasPath.startsWith(oldPrefix)) {
                    batch.update(photoDoc.ref, {
                      nasPath: newPrefix + oldNasPath.slice(oldPrefix.length),
                    });
                    batchCount++;
                  }
                }
                if (batchCount > 0) await batch.commit();
              } catch (renameErr) {
                // Rename failed: revert Firestore so next upload retries
                const oldFolderPath = `${parentPath}/${originalName}`;
                uploadFolder = oldFolderPath;
                try {
                  await orderDocRef.update({
                    nasOrderFolderPath: oldFolderPath,
                  });
                } catch (_) {}
                logger.warn(
                  "uploadCompletionPhotoToNasHttp: post-upload rename failed, reverted Firestore",
                  {
                    orderDocId,
                    from: originalName,
                    to: renameTarget,
                    error: renameErr.message,
                  },
                );
              }
            }
          }
        }
      }
    }

    try {
      sid = await getOrCreateSid(baseUrl, username, password);
      try {
        await resolveAndUpload(useCachedNasFolder);
      } catch (uploadErr) {
        // SID 過期 (code 119)：重新登入後再試一次
        if (isSidExpiredError(uploadErr)) {
          logger.warn(
            "uploadCompletionPhotoToNasHttp: SID expired (119), re-login and retry",
            { orderDocId, error: uploadErr?.message },
          );
          sid = await refreshSid(baseUrl, username, password);
          await resolveAndUpload(useCachedNasFolder);
          // 若用快取路徑上傳失敗，重新搜尋資料夾後重試一次
        } else if (useCachedNasFolder) {
          logger.warn(
            "uploadCompletionPhotoToNasHttp: cached folder failed, retrying with fresh resolve",
            {
              orderDocId,
              cachedNasFolder,
              error: uploadErr?.message,
            },
          );
          try {
            await resolveAndUpload(false);
          } catch (retryErr) {
            // 重試也遇到 SID 過期：再登入一次
            if (isSidExpiredError(retryErr)) {
              logger.warn(
                "uploadCompletionPhotoToNasHttp: SID expired on retry, re-login",
                { orderDocId, error: retryErr?.message },
              );
              sid = await refreshSid(baseUrl, username, password);
              await resolveAndUpload(false);
            } else {
              throw retryErr;
            }
          }
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
    }

    const nasPath = `${uploadFolder}/${targetName}`;

    const photoDocData = {
      orderDocId,
      orderNumber: String(
        form?.fields?.orderNumber || taskData?.orderNumber || "",
      ),
      customerName: String(
        form?.fields?.customerName || taskData?.customerName || "",
      ),
      color: String(form?.fields?.color || taskData?.color || ""),
      installAddress: String(
        form?.fields?.installAddress || taskData?.siteAddress || "",
      ),
      客戶名稱: String(
        form?.fields?.customerName || taskData?.customerName || "",
      ),
      顏色: String(form?.fields?.color || taskData?.color || ""),
      安裝地點: String(
        form?.fields?.installAddress || taskData?.siteAddress || "",
      ),
      fileName: logicalFileName,
      contentType,
      size: Number(uploadFile.buffer.length || 0),
      nasPath,
      installTaskId: taskId || null,
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
    };

    await photoRef.set(photoDocData);

    // 派車任務模式：同時鏡像寫入 installTasks/{taskId}/completionPhotos/{photoId}
    // 方便 MyTodayTasksView 直接訂閱任務子集合,不必反查 Orders
    if (taskId) {
      try {
        await admin
          .firestore()
          .collection("installTasks")
          .doc(taskId)
          .collection("completionPhotos")
          .doc(photoRef.id)
          .set(photoDocData);
      } catch (mirrorErr) {
        logger.warn(
          "uploadCompletionPhotoToNasHttp: installTask mirror write failed",
          { taskId, photoId: photoRef.id, error: mirrorErr?.message },
        );
      }
    }

    sendJson(res, 200, {
      id: photoRef.id,
      nasPath,
      size: Number(uploadFile.buffer.length || 0),
      fileName: logicalFileName,
      contentType,
      installTaskId: taskId || null,
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

      const doUploadAndCleanup = async () => {
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
          logger.warn(
            "replaceCompletionPhotoInNasHttp old file delete failed",
            {
              orderDocId,
              photoId,
              previousNasPath,
              error: e?.message || String(e),
            },
          );
        }
      };

      try {
        await doUploadAndCleanup();
      } catch (uploadErr) {
        if (isSidExpiredError(uploadErr)) {
          logger.warn(
            "replaceCompletionPhotoInNasHttp: SID expired (119), re-login and retry",
            { orderDocId, photoId, error: uploadErr?.message },
          );
          sid = await synologyLoginForce(baseUrl, username, password);
          await doUploadAndCleanup();
        } else {
          throw uploadErr;
        }
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
      try {
        await synologyUploadFile({
          baseUrl,
          sid,
          targetPath: uploadFolder,
          fileBuffer,
          fileName: targetName,
          mimeType: contentType,
        });
      } catch (uploadErr) {
        if (isSidExpiredError(uploadErr)) {
          sid = await synologyLoginForce(baseUrl, username, password);
          await synologyUploadFile({
            baseUrl,
            sid,
            targetPath: uploadFolder,
            fileBuffer,
            fileName: targetName,
            mimeType: contentType,
          });
        } else {
          throw uploadErr;
        }
      }
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

      const doUploadAndCleanup = async () => {
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
      };

      try {
        await doUploadAndCleanup();
      } catch (uploadErr) {
        if (isSidExpiredError(uploadErr)) {
          sid = await synologyLoginForce(baseUrl, username, password);
          await doUploadAndCleanup();
        } else {
          throw uploadErr;
        }
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
        try {
          await synologyDeleteFile({ baseUrl, sid, filePath: nasPath });
        } catch (delErr) {
          if (isSidExpiredError(delErr)) {
            sid = await synologyLoginForce(baseUrl, username, password);
            await synologyDeleteFile({ baseUrl, sid, filePath: nasPath });
          } else {
            throw delErr;
          }
        }
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
      sid = await getOrCreateSid(baseUrl, username, password);

      // 嘗試從 nasPath 下載，失敗時自動用訂單的 nasOrderFolderPath 換算新路徑重試
      async function tryDownload(filePath) {
        const resp = await synologyDownloadFile({ baseUrl, sid, filePath });
        return resp;
      }

      let resolvedNasPath = nasPath;
      let downloadResp = await tryDownload(nasPath);

      // SID 過期時自動刷新重試
      if (!downloadResp.ok) {
        const bodyText = await downloadResp.clone().text();
        if (bodyText.includes('"code":119') || bodyText.includes("code: 119")) {
          sid = await refreshSid(baseUrl, username, password);
          downloadResp = await tryDownload(nasPath);
        }
      }

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

      res.set("Cache-Control", "private, max-age=3600");
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
    const viewerEmail = String(req.query.viewerEmail || req.query.email || "")
      .trim()
      .toLowerCase();

    if (!token && !nasKey) {
      res.status(401).send("missing token");
      return;
    }

    let callerRole = null;
    let callerProfile = null;
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
      const profile = await readUserProfile(uid);
      callerProfile = profile;
      const perspectiveRole = String(req.query.perspectiveRole || "").trim();
      if (perspectiveRole && profile.roles.includes(perspectiveRole)) {
        callerRole = perspectiveRole;
      } else {
        callerRole = profile.role || null;
      }
      if (!callerRole) {
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
        viewerEmail,
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

      let pdfPath = "";

      if (nasOrderFolder) {
        // Strategy 1: Prefer the order's cached NAS folder so we don't accidentally
        // pick a same-named PDF from outbox or another derived folder.
        logger.info(
          "serveOrderPdf: trying direct folder listing from cached order folder",
          {
            orderNumber,
            nasOrderFolder,
          },
        );
        try {
          const folderEntries = await synologyListFolderEntries({
            baseUrl,
            sid,
            folderPath: nasOrderFolder,
          });
          const pdfFile = folderEntries.find(
            (f) =>
              !f.isdir &&
              String(f.name || "")
                .toLowerCase()
                .includes(`${orderNumber.toLowerCase()}.pdf`),
          );
          if (pdfFile && pdfFile.path) {
            pdfPath = String(pdfFile.path).trim();
            logger.info("serveOrderPdf: found via folder listing", {
              orderNumber,
              pdfPath,
            });
          }
        } catch (listErr) {
          logger.warn("serveOrderPdf: cached folder listing failed", {
            orderNumber,
            nasOrderFolder,
            error: listErr?.message,
          });
        }
      }

      // Strategy 2: Universal search by filename — fallback when the order folder is
      // missing, stale, or does not contain the PDF.
      const nasSearchRoot =
        (await getNasOrderPath()) ||
        (() => {
          const parts = (nasOrderFolder || "/峻晟").split("/").filter(Boolean);
          return "/" + (parts[0] || "峻晟");
        })();

      if (!pdfPath) {
        pdfPath = await synologySearchFileByName({
          baseUrl,
          sid,
          rootPath: nasSearchRoot,
          fileName: `${orderNumber}.pdf`,
        });
      }

      logger.info("serveOrderPdf: search result", {
        orderNumber,
        nasSearchRoot,
        nasOrderFolder,
        pdfPath,
      });

      if (!pdfPath) {
        res.status(404).send("找不到訂單 PDF 檔案");
        return;
      }

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

      let body = Buffer.from(await downloadResp.arrayBuffer());
      const fileName = pdfPath.split("/").pop() || `${orderNumber}.pdf`;

      const canViewPrice = canViewOrderPdfPrice({
        profile: callerProfile,
        viewerEmail,
      });

      // 只有價格角色可看原始 PDF，其餘身分一律套用白色矩形價格遮罩。
      if (!canViewPrice) {
        try {
          const settingsSnap = await admin
            .firestore()
            .collection("SystemSettings")
            .doc("general")
            .get();
          const box = settingsSnap.exists
            ? settingsSnap.data()?.priceRedactBox || {}
            : {};
          let xPct =
            Number.isFinite(Number(box.xPct)) && box.xPct !== undefined
              ? Number(box.xPct)
              : 0;
          let yPct =
            Number.isFinite(Number(box.yPct)) && box.yPct !== undefined
              ? Number(box.yPct)
              : 0;
          let wPct =
            Number.isFinite(Number(box.wPct)) && box.wPct !== undefined
              ? Number(box.wPct)
              : 1;
          let hPct =
            Number.isFinite(Number(box.hPct)) && box.hPct !== undefined
              ? Number(box.hPct)
              : 0.17;

          // 先前曾誤把發單 PDF 的座標存進這組員工遮罩設定，這裡回退到原本的員工 PDF 遮罩框。
          const looksLikeMistakenDispatchBox =
            Math.abs(xPct - 0.59) < 0.0001 &&
            Math.abs(yPct - 0.01) < 0.0001 &&
            Math.abs(wPct - 0.27) < 0.0001 &&
            Math.abs(hPct - 0.12) < 0.0001;
          if (looksLikeMistakenDispatchBox) {
            xPct = 0;
            yPct = 0;
            wPct = 1;
            hPct = 0.17;
          }
          if (wPct > 0 && hPct > 0) {
            const pdfHeader = body.slice(0, 5).toString("ascii");
            if (!pdfHeader.startsWith("%PDF-")) {
              logger.warn("serveOrderPdf: not a valid PDF, redact required", {
                orderNumber,
              });
              res
                .status(415)
                .send(
                  "此訂單 PDF 無法套用價格遮罩，請通知管理者重新輸出 PDF 後再試。",
                );
              return;
            } else {
              const pdfDoc = await PDFDocument.load(body, {
                ignoreEncryption: true,
                throwOnInvalidObject: false,
              });
              const pages = pdfDoc.getPages();
              for (const page of pages) {
                const { width, height } = page.getSize();
                const rotation = page.getRotation().angle; // 0, 90, 180, 270

                // 將視覺百分比座標轉換為 PDF 原始座標（依旋轉方向換算）
                let rx1, ry1, rw, rh;
                if (rotation === 90) {
                  // 視覺 W = native H, 視覺 H = native W
                  rx1 = width * (1 - yPct - hPct);
                  ry1 = height * xPct;
                  rw = width * hPct;
                  rh = height * wPct;
                } else if (rotation === 270) {
                  rx1 = width * yPct;
                  ry1 = height * (1 - xPct - wPct);
                  rw = width * hPct;
                  rh = height * wPct;
                } else if (rotation === 180) {
                  rx1 = width * (1 - xPct - wPct);
                  ry1 = height * (1 - yPct - hPct);
                  rw = width * wPct;
                  rh = height * hPct;
                } else {
                  // rotation === 0（一般直向）
                  rx1 = xPct * width;
                  ry1 = yPct * height;
                  rw = wPct * width;
                  rh = hPct * height;
                }
                const rx2 = rx1 + rw;
                const ry2 = ry1 + rh;

                // 先刪除落在遮罩範圍內的 annotations（否則 annotation 層會疊在白色矩形上）
                const annotsRef = page.node.get(PDFName.of("Annots"));
                if (annotsRef) {
                  const annotArr = pdfDoc.context.lookup(annotsRef);
                  if (annotArr && typeof annotArr.size === "function") {
                    const keep = [];
                    for (let i = 0; i < annotArr.size(); i++) {
                      const item = annotArr.get(i);
                      const annotDict =
                        item &&
                        item.constructor &&
                        item.constructor.name === "PDFRef"
                          ? pdfDoc.context.lookup(item)
                          : item;
                      let inBox = false;
                      try {
                        const rectObj =
                          annotDict && annotDict.get(PDFName.of("Rect"));
                        if (rectObj && typeof rectObj.get === "function") {
                          const ax1 = rectObj.get(0).value
                            ? rectObj.get(0).value()
                            : Number(rectObj.get(0));
                          const ay1 = rectObj.get(1).value
                            ? rectObj.get(1).value()
                            : Number(rectObj.get(1));
                          const ax2 = rectObj.get(2).value
                            ? rectObj.get(2).value()
                            : Number(rectObj.get(2));
                          const ay2 = rectObj.get(3).value
                            ? rectObj.get(3).value()
                            : Number(rectObj.get(3));
                          // 只要有重疊就刪除
                          inBox =
                            ax1 < rx2 && ax2 > rx1 && ay1 < ry2 && ay2 > ry1;
                        }
                      } catch (_) {}
                      if (!inBox) keep.push(item);
                    }
                    if (keep.length < annotArr.size()) {
                      page.node.set(
                        PDFName.of("Annots"),
                        pdfDoc.context.obj(keep),
                      );
                    }
                  }
                }

                // 畫白色矩形蓋住遮罩區
                page.drawRectangle({
                  x: rx1,
                  y: ry1,
                  width: rw,
                  height: rh,
                  color: rgb(1, 1, 1),
                  opacity: 1,
                });
              }
              body = Buffer.from(await pdfDoc.save());
            } // end if valid PDF header
          }
        } catch (redactErr) {
          logger.warn("serveOrderPdf: price redact failed, blocking original", {
            orderNumber,
            error: redactErr?.message,
          });
          res
            .status(409)
            .send(
              "此訂單 PDF 無法套用價格遮罩，已阻擋原始檔案輸出，請通知管理者重新另存 PDF。",
            );
          return;
        }
      }

      res.set(
        "Cache-Control",
        "private, no-store, no-cache, must-revalidate, max-age=0",
      );
      res.set("Pragma", "no-cache");
      res.set("Expires", "0");
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

exports.generateConfirmedPdfComparison = onRequestV2(
  {
    invoker: "public",
    memory: "1GiB",
    timeoutSeconds: 300,
  },
  async (req, res) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Authorization, Content-Type");

    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }

    if (req.method !== "GET") {
      res
        .status(405)
        .type("text/plain; charset=utf-8")
        .send("Method Not Allowed");
      return;
    }

    const authHeader = String(req.get("Authorization") || "").trim();
    const bearerToken = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7).trim()
      : "";
    const queryToken = String(req.query.token || "").trim();
    const token = bearerToken || queryToken;
    if (!token) {
      res.status(401).type("text/plain; charset=utf-8").send("missing token");
      return;
    }

    const orderId = String(req.query.orderId || "").trim();
    if (!orderId) {
      res.status(400).type("text/plain; charset=utf-8").send("missing orderId");
      return;
    }

    let uid;
    try {
      const decoded = await admin.auth().verifyIdToken(token);
      uid = decoded.uid;
    } catch (e) {
      res.status(401).type("text/plain; charset=utf-8").send("invalid token");
      return;
    }

    const profile = await readUserProfile(uid);
    const role = String(profile.role || "").trim();
    if (!role) {
      res.status(403).type("text/plain; charset=utf-8").send("forbidden");
      return;
    }

    const db = admin.firestore();
    const orderSnap = await db.collection("salesOrders").doc(orderId).get();
    if (!orderSnap.exists) {
      res.status(404).type("text/plain; charset=utf-8").send("order not found");
      return;
    }

    const order = orderSnap.data() || {};

    let browser;
    try {
      // Generate a short-lived custom token so Puppeteer can sign in as this user
      const customToken = await admin.auth().createCustomToken(uid);
      const pageUrl = `https://jh-stone.web.app/orders/${encodeURIComponent(orderId)}/confirmation`;

      browser = await launchPdfBrowser();
      const page = await browser.newPage();

      // Inject custom token before the app boots so main.js can auto-sign-in
      await page.evaluateOnNewDocument((ct) => {
        window.__puppeteerCustomToken = ct;
      }, customToken);

      await page.setViewport({
        width: 1123,
        height: 794,
        deviceScaleFactor: 1,
      });

      // networkidle0 can be slow on SPA pages with long-lived connections.
      // Optimized fast-path: balance speed with content loading
      await page.goto(pageUrl, {
        waitUntil: "domcontentloaded",
        timeout: 20000,
      });

      // Wait for page to be ready with content (shorter timeout than before)
      await page.waitForSelector(".a4-page", { timeout: 8000 });

      // Quick content check with reduced timeout
      await Promise.race([
        page.waitForFunction(
          () => {
            const sheet = document.querySelector(".a4-page");
            if (!sheet) return false;
            const text = (sheet.innerText || "").trim();
            return text.length >= 50;
          },
          { timeout: 5000 },
        ),
        new Promise((resolve) => setTimeout(resolve, 4000)), // Fallback after 4s
      ]).catch(() => {}); // Don't fail if timeout

      // Inject styles immediately
      await page.evaluate(() => {
        const styleId = "__pdf-compare-print-style";
        let style = document.getElementById(styleId);
        if (!style) {
          style = document.createElement("style");
          style.id = styleId;
          style.textContent = `
            @page { size: A4 landscape; margin: 0; }
            html, body {
              margin: 0 !important;
              padding: 0 !important;
              width: 297mm !important;
              height: 210mm !important;
              overflow: hidden !important;
              background: #fff !important;
            }
            body * {
              visibility: hidden !important;
            }
            .a4-page, .a4-page * {
              visibility: visible !important;
            }
            .a4-page {
              position: fixed !important;
              left: 0 !important;
              top: 0 !important;
              margin: 0 !important;
              width: 297mm !important;
              height: 210mm !important;
              box-shadow: none !important;
              overflow: hidden !important;
              transform: none !important;
            }
          `;
          document.head.appendChild(style);
        }
      });

      // Minimal font wait with aggressive timeout
      await page.evaluate(async () => {
        if (!document.fonts || !document.fonts.ready) return;
        await Promise.race([
          document.fonts.ready,
          new Promise((resolve) => setTimeout(resolve, 300)),
        ]);
      });

      await page.emulateMediaType("print");

      const pdfBuffer = await page.pdf({
        printBackground: true,
        preferCSSPageSize: true,
        margin: { top: "0", right: "0", bottom: "0", left: "0" },
      });

      const fileName = `${String(order.orderNo || orderId || "confirmation")}-backend-compare.pdf`;
      res.set("Content-Type", "application/pdf");
      res.set(
        "Content-Disposition",
        `inline; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      );
      res.status(200).send(pdfBuffer);
    } catch (err) {
      logger.error("generateConfirmedPdfComparison failed", {
        orderId,
        uid,
        error: err?.message || String(err),
      });
      res
        .status(500)
        .type("text/plain; charset=utf-8")
        .send(err?.message || "pdf generation failed");
    } finally {
      if (browser) {
        try {
          await browser.close();
        } catch (_) {
          // ignore
        }
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

// One-time cleanup: remove searchKeywords field from all Orders docs
exports.removeSearchKeywords = onCall(
  { timeoutSeconds: 540, memory: "512MiB" },
  async (payload, ctx) => {
    const db = admin.firestore();
    const col = db.collection("Orders");
    let last = null;
    const batchSize = 100;
    let totalProcessed = 0;
    let totalCleaned = 0;
    while (true) {
      let q = col
        .select("searchKeywords")
        .orderBy(admin.firestore.FieldPath.documentId())
        .limit(batchSize);
      if (last) q = q.startAfter(last);
      const snap = await q.get();
      if (snap.empty) break;
      // Split into sub-batches of 50 to avoid transaction size limit
      const docsToClean = snap.docs.filter(
        (doc) => doc.data().searchKeywords !== undefined,
      );
      for (let i = 0; i < docsToClean.length; i += 50) {
        const chunk = docsToClean.slice(i, i + 50);
        const batch = db.batch();
        for (const doc of chunk) {
          batch.update(doc.ref, {
            searchKeywords: admin.firestore.FieldValue.delete(),
          });
        }
        await batch.commit();
        totalCleaned += chunk.length;
      }
      totalProcessed += snap.docs.length;
      last = snap.docs[snap.docs.length - 1];
      await new Promise((r) => setTimeout(r, 50));
    }
    return { status: "done", totalProcessed, totalCleaned };
  },
);

// Server-side cache for search index (persists across invocations on same instance)
let _searchIndexCache = null;
let _searchIndexCacheTime = 0;
const SEARCH_INDEX_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Return lightweight search index: only id + 4 search fields
exports.getAllOrdersForSearch = onCall(
  { timeoutSeconds: 120, memory: "512MiB" },
  async (payload, ctx) => {
    const accessCtx = await getCallableAccessContext(payload, ctx);
    const now = Date.now();

    // Use server-side cache if available and fresh
    if (
      !_searchIndexCache ||
      now - _searchIndexCacheTime > SEARCH_INDEX_CACHE_TTL
    ) {
      const db = admin.firestore();
      const col = db.collection("Orders");
      const allDocs = [];
      let last = null;
      const batchSize = 5000;
      while (true) {
        let q = col
          .select(
            "顏色",
            "color",
            "客戶名稱",
            "customerName",
            "安裝地點",
            "installAddress",
            "訂單號碼",
            "orderNumber",
            "安裝日",
          )
          .orderBy(admin.firestore.FieldPath.documentId())
          .limit(batchSize);
        if (last) q = q.startAfter(last);
        const snap = await q.get();
        if (snap.empty) break;
        for (const doc of snap.docs) {
          const d = doc.data();
          allDocs.push({
            id: doc.id,
            顏色: d.顏色 || d.color || "",
            客戶名稱: d.客戶名稱 || d.customerName || "",
            安裝地點: d.安裝地點 || d.installAddress || "",
            訂單號碼: d["訂單號碼"] || d.orderNumber || "",
            安裝日: d.安裝日 || "",
          });
        }
        last = snap.docs[snap.docs.length - 1];
      }
      _searchIndexCache = allDocs;
      _searchIndexCacheTime = now;
    }

    if (!accessCtx.isStaff) {
      return filterOrdersByAccess([..._searchIndexCache], accessCtx);
    }
    return _searchIndexCache;
  },
);

// Fetch full order docs by IDs (for displaying search results)
exports.getOrdersByIds = onCall(async (payload, ctx) => {
  const accessCtx = await getCallableAccessContext(payload, ctx);
  const ids = payload.data?.ids || [];
  if (!ids.length || ids.length > 200) return [];
  const db = admin.firestore();
  const col = db.collection("Orders");
  // Firestore getAll supports up to 500 refs
  const refs = ids.map((id) => col.doc(String(id)));
  const snaps = await db.getAll(...refs);
  const docs = snaps
    .filter((s) => s.exists)
    .map((s) => {
      const data = s.data();
      return { id: s.id, ...data };
    });
  return filterOrdersByAccess(docs, accessCtx);
});

exports.updateOrderIncompleteStatus = onCall(async (payload, ctx) => {
  const data = unwrapCallablePayload(payload);
  const authUid = getCallableAuthUid(payload, ctx);
  await assertStaffRole(authUid);

  const orderDocId = String(data.orderDocId || "").trim();
  if (!orderDocId) {
    throw new functions.https.HttpsError("invalid-argument", "缺少訂單識別碼");
  }

  const incomplete = data.incomplete === true;
  const reason = String(data.reason || "").trim();

  const db = admin.firestore();
  const orderRef = db.collection("Orders").doc(orderDocId);
  const orderSnap = await orderRef.get();
  if (!orderSnap.exists) {
    throw new functions.https.HttpsError("not-found", "找不到訂單");
  }

  const userSnap = await db.collection("Users").doc(authUid).get();
  const userData = userSnap.exists ? userSnap.data() || {} : {};
  const authToken = getCallableAuthToken(payload, ctx);
  const updatedByName = String(
    userData.displayName || authToken.name || authToken.displayName || "",
  ).trim();
  const updatedByEmail = String(userData.email || authToken.email || "").trim();

  await orderRef.set(
    {
      incomplete,
      未完工: incomplete,
      completed: !incomplete,
      reason,
      原因: reason,
      未完工原因: reason,
      incompleteUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      incompleteUpdatedByUid: authUid,
      incompleteUpdatedByName: updatedByName,
      incompleteUpdatedByEmail: updatedByEmail,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedByUid: authUid,
      updatedByName: updatedByName,
      updatedByEmail: updatedByEmail,
      最後更新員工: updatedByName,
      最後更新員工Uid: authUid,
      最後更新員工Email: updatedByEmail,
    },
    { merge: true },
  );

  return {
    ok: true,
    orderDocId,
    incomplete,
    reason,
    updatedByUid: authUid,
    updatedByName,
    updatedByEmail,
  };
});

exports.updateOrderIncompleteReason = onCall(async (payload, ctx) => {
  const data = unwrapCallablePayload(payload);
  const authUid = getCallableAuthUid(payload, ctx);
  await assertStaffRole(authUid);

  const orderDocId = String(data.orderDocId || "").trim();
  if (!orderDocId) {
    throw new functions.https.HttpsError("invalid-argument", "缺少訂單識別碼");
  }

  const reason = String(data.reason ?? "").trim();

  const db = admin.firestore();
  const orderRef = db.collection("Orders").doc(orderDocId);
  const orderSnap = await orderRef.get();
  if (!orderSnap.exists) {
    throw new functions.https.HttpsError("not-found", "找不到訂單");
  }

  const orderData = orderSnap.data() || {};
  const incomplete =
    orderData.incomplete === true || orderData["未完工"] === true;

  const userSnap = await db.collection("Users").doc(authUid).get();
  const userData = userSnap.exists ? userSnap.data() || {} : {};
  const authToken = getCallableAuthToken(payload, ctx);
  const updatedByName = String(
    userData.displayName || authToken.name || authToken.displayName || "",
  ).trim();
  const updatedByEmail = String(userData.email || authToken.email || "").trim();

  await orderRef.set(
    {
      reason,
      原因: reason,
      未完工原因: reason,
      reasonUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      reasonUpdatedByUid: authUid,
      reasonUpdatedByName: updatedByName,
      reasonUpdatedByEmail: updatedByEmail,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedByUid: authUid,
      updatedByName,
      updatedByEmail,
      最後更新員工: updatedByName,
      最後更新員工Uid: authUid,
      最後更新員工Email: updatedByEmail,
    },
    { merge: true },
  );

  return {
    ok: true,
    orderDocId,
    incomplete,
    reason,
    updatedByUid: authUid,
    updatedByName,
    updatedByEmail,
  };
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
    orderedAt: String(data.orderedAt || "").trim(),
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

  const docId = orderNo.replace(/\//g, "_").trim();

  return {
    docId,
    data: {
      orderNo,
      orderedAt: getByAliases(row, ["下單日"]),
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

// Callable: return all PendingOrders for client-side search.
exports.getAllPendingOrdersForSearch = onCall(
  { timeoutSeconds: 60, memory: "256MiB" },
  async (payload, ctx) => {
    await assertStaffRole(getCallableAuthUid(payload, ctx));
    const snap = await admin.firestore().collection("PendingOrders").get();
    return snap.docs.map((d) => {
      const data = d.data();
      delete data.searchKeywords;
      return { id: d.id, ...data };
    });
  },
);

// Admin callable: preview/delete test rows in PendingOrders by keyword.
exports.purgePendingTestOrders = onCall(
  { timeoutSeconds: 540, memory: "512MiB" },
  async (payload, ctx) => {
    const authUid = getCallableAuthUid(payload, ctx);
    if (!authUid) {
      throw new functions.https.HttpsError("unauthenticated", "請先登入");
    }

    const role = await readUserRole(authUid);
    if (!["admin", "管理者"].includes(String(role || "").trim())) {
      throw new functions.https.HttpsError(
        "permission-denied",
        "需要 admin/管理者 權限",
      );
    }

    const keyword = String(payload.data?.keyword || "")
      .trim()
      .toLowerCase();
    if (!keyword) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "請輸入要刪除的測試關鍵字",
      );
    }

    const dryRun = payload.data?.dryRun === true;
    const limit = Math.max(
      1,
      Math.min(10000, Number(payload.data?.limit || 3000)),
    );

    const snap = await admin
      .firestore()
      .collection("PendingOrders")
      .limit(limit)
      .get();
    const matchedDocs = snap.docs.filter((docSnap) => {
      const data = docSnap.data() || {};
      const haystacks = [
        docSnap.id,
        data.orderNo,
        data["訂單號碼"],
        data.customerName,
        data["客戶名稱"],
        data.installAddress,
        data["安裝地點"],
        data.owner,
        data.salesName,
        data.color,
      ].map((value) => String(value || "").toLowerCase());

      return haystacks.some((value) => value.includes(keyword));
    });

    let deleted = 0;
    const errors = [];

    if (!dryRun && matchedDocs.length) {
      for (let i = 0; i < matchedDocs.length; i += 400) {
        const chunk = matchedDocs.slice(i, i + 400);
        const batch = admin.firestore().batch();
        chunk.forEach((docSnap) => batch.delete(docSnap.ref));
        try {
          await batch.commit();
          deleted += chunk.length;
        } catch (err) {
          errors.push({
            batchStart: i,
            error: String(err?.message || err),
          });
          if (errors.length > 20) errors.length = 20;
        }
      }
    }

    return {
      ok: true,
      keyword,
      scanned: snap.size,
      matched: matchedDocs.length,
      deleted: dryRun ? 0 : deleted,
      wouldDelete: dryRun ? matchedDocs.length : undefined,
      limit,
      dryRun,
      samples: matchedDocs.slice(0, 20).map((docSnap) => {
        const data = docSnap.data() || {};
        return {
          id: docSnap.id,
          orderNo: data.orderNo || data["訂單號碼"] || "",
          customerName: data.customerName || data["客戶名稱"] || "",
          installAddress: data.installAddress || data["安裝地點"] || "",
        };
      }),
      errors,
    };
  },
);

// Admin callable: preview/delete test rows in Orders by keyword.
exports.purgeOrdersTestData = onCall(
  { timeoutSeconds: 540, memory: "512MiB" },
  async (payload, ctx) => {
    const authUid = getCallableAuthUid(payload, ctx);
    if (!authUid) {
      throw new functions.https.HttpsError("unauthenticated", "請先登入");
    }

    const role = await readUserRole(authUid);
    if (!["admin", "管理者"].includes(String(role || "").trim())) {
      throw new functions.https.HttpsError(
        "permission-denied",
        "需要 admin/管理者 權限",
      );
    }

    const keywordRaw = String(payload.data?.keyword || "").trim();
    const keyword = keywordRaw.toLowerCase();
    if (!keywordRaw) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "請輸入要刪除的測試關鍵字",
      );
    }

    const dryRun = payload.data?.dryRun === true;
    const limit = Math.max(
      1,
      Math.min(10000, Number(payload.data?.limit || 3000)),
    );

    const ordersCol = admin.firestore().collection("Orders");
    const candidateMap = new Map();
    let scanned = 0;

    const addCandidates = (docs = []) => {
      docs.forEach((docSnap) => {
        if (!candidateMap.has(docSnap.id))
          candidateMap.set(docSnap.id, docSnap);
      });
    };

    const isOrderPrefixKeyword = /^[0-9A-Za-z-]+$/.test(keywordRaw);
    if (isOrderPrefixKeyword) {
      const seeds = [...new Set([keywordRaw, keywordRaw.toUpperCase()])].filter(
        Boolean,
      );
      const queries = [];
      for (const seed of seeds) {
        const upperBound = `${seed}\uf8ff`;
        queries.push(
          ordersCol
            .where(admin.firestore.FieldPath.documentId(), ">=", seed)
            .where(admin.firestore.FieldPath.documentId(), "<=", upperBound)
            .limit(limit)
            .get(),
          ordersCol
            .where("訂單號碼", ">=", seed)
            .where("訂單號碼", "<=", upperBound)
            .limit(limit)
            .get(),
          ordersCol
            .where("orderNo", ">=", seed)
            .where("orderNo", "<=", upperBound)
            .limit(limit)
            .get(),
          ordersCol
            .where("orderNumber", ">=", seed)
            .where("orderNumber", "<=", upperBound)
            .limit(limit)
            .get(),
        );
      }
      const targetedResults = await Promise.allSettled(queries);
      for (const result of targetedResults) {
        if (result.status !== "fulfilled") continue;
        scanned += result.value.size;
        addCandidates(result.value.docs);
      }
    }

    if (!candidateMap.size || !isOrderPrefixKeyword) {
      const snap = await ordersCol.limit(limit).get();
      scanned += snap.size;
      addCandidates(snap.docs);
    }

    const matchedDocs = [...candidateMap.values()].filter((docSnap) => {
      const data = docSnap.data() || {};
      const haystacks = [
        docSnap.id,
        data.orderNo,
        data.orderNumber,
        data["訂單號碼"],
        data.customerName,
        data["客戶名稱"],
        data.installAddress,
        data["安裝地點"],
        data.owner,
        data.salesName,
        data.color,
        data["顏色"],
      ].map((value) => String(value || "").toLowerCase());

      return haystacks.some((value) => value.includes(keyword));
    });

    let deleted = 0;
    const errors = [];

    if (!dryRun && matchedDocs.length) {
      for (let i = 0; i < matchedDocs.length; i += 400) {
        const chunk = matchedDocs.slice(i, i + 400);
        const batch = admin.firestore().batch();
        chunk.forEach((docSnap) => batch.delete(docSnap.ref));
        try {
          await batch.commit();
          deleted += chunk.length;
        } catch (err) {
          errors.push({
            batchStart: i,
            error: String(err?.message || err),
          });
          if (errors.length > 20) errors.length = 20;
        }
      }
    }

    return {
      ok: true,
      keyword: keywordRaw,
      scanned,
      matched: matchedDocs.length,
      deleted: dryRun ? 0 : deleted,
      wouldDelete: dryRun ? matchedDocs.length : undefined,
      limit,
      dryRun,
      searchMode: isOrderPrefixKeyword ? "prefix+scan" : "scan",
      samples: matchedDocs.slice(0, 20).map((docSnap) => {
        const data = docSnap.data() || {};
        return {
          id: docSnap.id,
          orderNo: data.orderNo || data.orderNumber || data["訂單號碼"] || "",
          customerName: data.customerName || data["客戶名稱"] || "",
          installAddress: data.installAddress || data["安裝地點"] || "",
        };
      }),
      errors,
    };
  },
);

exports.importDispatchRowsToOrders = onCall(
  { timeoutSeconds: 540, memory: "512MiB" },
  async (payload, ctx) => {
    const authUid = getCallableAuthUid(payload, ctx);
    if (!authUid) {
      throw new functions.https.HttpsError("unauthenticated", "請先登入");
    }

    const userSnap = await admin
      .firestore()
      .collection("Users")
      .doc(authUid)
      .get();
    const userData = userSnap.exists ? userSnap.data() || {} : {};
    const role = String(userData.role || "").trim();
    const dept = String(userData.dept || "").trim();
    if (!["admin", "管理者"].includes(role) && dept !== "1") {
      throw new functions.https.HttpsError(
        "permission-denied",
        "需要 admin/管理者 或 1 部門權限",
      );
    }

    const rows = Array.isArray(payload?.data?.rows) ? payload.data.rows : [];
    const validRows = rows.filter((row) => {
      if (!row || row._orphan) return false;
      const orderNo = String(row.sourceOrderNo || "").trim();
      const date = String(row.date || "").trim();
      return !!orderNo && !!date;
    });

    if (!validRows.length) {
      return { imported: 0, skipped: rows.length || 0 };
    }

    let imported = 0;
    const CHUNK = 400;
    const db = admin.firestore();
    for (let i = 0; i < validRows.length; i += CHUNK) {
      const chunk = validRows.slice(i, i + CHUNK);
      const batch = db.batch();
      for (const row of chunk) {
        const orderNo = String(row.sourceOrderNo || "").trim();
        const date = String(row.date || "").trim();
        const docId = `${orderNo}_${date}`;
        const [yyyy, mm, dd] = date.split("-");
        const installDate = `${Number(yyyy || 0)}/${Number(mm || 0)}/${Number(dd || 0)}`;
        const installers = Array.isArray(row.installerNames)
          ? row.installerNames.filter(Boolean)
          : [];
        const installer1 = installers[0] || "";
        const installer2 = installers[1] || "";
        const installer3 = installers[2] || "";
        const vehiclePlate = String(row.vehiclePlate || "").trim();
        const isRepair = row.kind === "repair";
        batch.set(
          db.collection("Orders").doc(docId),
          {
            orderNo,
            訂單號碼: orderNo,
            customerName: row.customerName || "",
            客戶名稱: row.customerName || "",
            installAddress: row.siteAddress || "",
            安裝地址: row.siteAddress || "",
            安裝地點: row.siteAddress || "",
            color: row.stoneLabel || "",
            顏色: row.stoneLabel || "",
            dueDate: installDate,
            安裝日: installDate,
            是否維修: isRepair ? "維修" : "安裝",
            reason: row.reason || "",
            原因: row.reason || "",
            etaTime: row.etaTime || "",
            預計到達: row.etaTime || "",
            vehiclePlate,
            車號: vehiclePlate,
            installers,
            安裝人員: installers.join("、"),
            installer1,
            installer2,
            installer3,
            安裝人員1: installer1,
            安裝人員2: installer2,
            安裝人員3: installer3,
            source: "dispatch-sheet-manual",
            sourceCollection: row.sourceCollection || "",
            sourceId: row.sourceId || "",
            dispatchDate: row.date || "",
            completed: !!row.completed,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedByUid: authUid,
          },
          { merge: true },
        );
        imported += 1;
      }
      await batch.commit();
    }

    return {
      imported,
      skipped: Math.max(0, (rows.length || 0) - validRows.length),
    };
  },
);

function _mirrorProductionStage(stage) {
  const isDone = stage?.status === "done";
  return {
    time: isDone ? stage.doneAt || null : null,
    by: isDone ? String(stage.doneByName || "").trim() : "",
  };
}

function _buildLegacyOrderProductionUpdates(jobData, authUid) {
  const cut = _mirrorProductionStage(jobData?.stages?.cut);
  const waterjet = _mirrorProductionStage(jobData?.stages?.waterjet);
  const qc = _mirrorProductionStage(jobData?.stages?.qc);

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
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedByUid: authUid,
  };
}

exports.syncProductionJobToLegacyOrders = onCall(
  { timeoutSeconds: 540, memory: "512MiB" },
  async (payload, ctx) => {
    const authUid = getCallableAuthUid(payload, ctx);
    if (!authUid) {
      throw new functions.https.HttpsError("unauthenticated", "請先登入");
    }

    const userSnap = await admin
      .firestore()
      .collection("Users")
      .doc(authUid)
      .get();
    const userData = userSnap.exists ? userSnap.data() || {} : {};
    const role = String(userData.role || "").trim();
    const dept = String(userData.dept || "").trim();
    if (!["admin", "管理者", "員工"].includes(role) && dept !== "3") {
      throw new functions.https.HttpsError(
        "permission-denied",
        "需要員工以上或廠內部門權限",
      );
    }

    const data = unwrapCallablePayload(payload);
    const db = admin.firestore();
    let jobData = data?.job && typeof data.job === "object" ? data.job : null;

    if (!jobData) {
      const jobId = String(data?.jobId || "").trim();
      if (!jobId) {
        throw new functions.https.HttpsError("invalid-argument", "缺少 jobId");
      }
      const jobSnap = await db.collection("productionJobs").doc(jobId).get();
      if (!jobSnap.exists) {
        throw new functions.https.HttpsError(
          "not-found",
          "找不到 production job",
        );
      }
      jobData = { id: jobSnap.id, ...jobSnap.data() };
    }

    const orderNo = String(jobData?.orderNo || "").trim();
    if (!orderNo) return { updated: 0 };

    const refs = new Map();
    const directRef = db.collection("Orders").doc(orderNo);
    const directSnap = await directRef.get();
    if (directSnap.exists) refs.set(directSnap.id, directRef);

    const [orderNoSnap, orderNumberSnap] = await Promise.all([
      db.collection("Orders").where("orderNo", "==", orderNo).get(),
      db.collection("Orders").where("訂單號碼", "==", orderNo).get(),
    ]);
    [orderNoSnap, orderNumberSnap].forEach((snap) => {
      snap.docs.forEach((d) => refs.set(d.id, d.ref));
    });

    if (!refs.size) return { updated: 0 };

    const updates = _buildLegacyOrderProductionUpdates(jobData, authUid);
    const batch = db.batch();
    refs.forEach((ref) => batch.set(ref, updates, { merge: true }));
    await batch.commit();

    logger.info("syncProductionJobToLegacyOrders: synced", {
      authUid,
      orderNo,
      updated: refs.size,
      jobId: jobData.id || null,
    });
    return { updated: refs.size };
  },
);

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

// 修復：將「先前因搜尋失敗而新建到錯誤資料夾」的訂單照片，搬回真正的資料夾並刪掉錯誤資料夾
// 用法：在 client 端 callable 呼叫 repairWrongOrderFolder({ orderNumber: "27375-1BEP", dryRun: true })
exports.repairWrongOrderFolder = onCall(
  { secrets: [SYNO_USERNAME_SECRET, SYNO_PASSWORD_SECRET] },
  async (payload, ctx) => {
    const authUid = getCallableAuthUid(payload, ctx);
    await assertStaffRole(authUid);

    const data = unwrapCallablePayload(payload);
    const orderNumber = String(data.orderNumber || "").trim();
    const dryRun = data.dryRun !== false; // 預設 dryRun=true，要實際執行請傳 false
    // 可選：直接指定錯誤資料夾路徑（從 CompletionPhotoFolderCreations 的 parentPath + newFolderName 帶入）
    const explicitWrongPath = String(data.wrongPath || "").trim();
    if (!orderNumber) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "缺少 orderNumber",
      );
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

    // 先找到 Orders 文件
    const db = admin.firestore();
    let orderDoc = await db.collection("Orders").doc(orderNumber).get();
    if (!orderDoc.exists) {
      const snap = await db
        .collection("Orders")
        .where("訂單號碼", "==", orderNumber)
        .limit(1)
        .get();
      if (!snap.empty) orderDoc = snap.docs[0];
    }
    if (!orderDoc.exists) {
      throw new functions.https.HttpsError(
        "not-found",
        `找不到訂單 ${orderNumber}`,
      );
    }
    const orderDocId = orderDoc.id;
    const orderData = orderDoc.data() || {};
    const wrongPath =
      explicitWrongPath || String(orderData.nasOrderFolderPath || "").trim();

    // 新增：允許使用者自訂正確路徑
    const explicitCorrectPath = String(data.correctPath || "").trim();

    const folderParts = await buildOrderNasFolderParts(orderDocId, {});

    let sid = "";
    try {
      sid = await synologyLogin(baseUrl, username, password);

      // 用「修正後」的搜尋找真正的資料夾，若有自訂路徑則直接用
      let correctPath = explicitCorrectPath;
      let matchMeta = null;
      if (!correctPath) {
        matchMeta = await resolveExistingOrderFolderPath({
          baseUrl,
          sid,
          basePath: pathCheck.normalized,
          customerFolder: folderParts.customerFolder,
          orderNumber: folderParts.orderNumber || orderNumber,
          defaultDetailFolder: folderParts.detailFolder,
        });
        correctPath = matchMeta.matched
          ? String(matchMeta.uploadFolder || "").trim()
          : "";
      }

      if ((matchMeta && !matchMeta.matched) || !correctPath) {
        return {
          ok: false,
          orderNumber,
          orderDocId,
          wrongPath,
          message: "搜尋不到真正的資料夾，無法判斷正確路徑",
          matchMeta,
        };
      }
      if (!wrongPath) {
        return {
          ok: false,
          orderNumber,
          orderDocId,
          correctPath,
          message: "Firestore 沒有 nasOrderFolderPath，無法判斷錯誤路徑",
        };
      }
      if (correctPath === wrongPath) {
        return {
          ok: true,
          orderNumber,
          orderDocId,
          wrongPath,
          correctPath,
          message: "Firestore 路徑已正確，無需修復",
        };
      }

      // 列出錯誤資料夾的所有檔案，並記錄 debug log
      let entries = [];
      logger.info("repairWrongOrderFolder: synologyListFolderEntries", {
        baseUrl,
        sid: sid ? sid.slice(0, 6) + "..." : "",
        wrongPath,
        correctPath,
      });
      try {
        entries = await synologyListFolderEntries({
          baseUrl,
          sid,
          folderPath: wrongPath,
        });
        logger.info("repairWrongOrderFolder: listFolderEntries result", {
          wrongPath,
          correctPath,
          entryCount: entries.length,
        });
      } catch (e) {
        logger.error("repairWrongOrderFolder: listFolderEntries error", {
          wrongPath,
          correctPath,
          error: e?.message,
        });
        return {
          ok: false,
          orderNumber,
          orderDocId,
          wrongPath,
          correctPath,
          message: `讀取錯誤資料夾失敗：${e?.message || e}`,
        };
      }
      const filePaths = entries
        .filter((e) => !e?.isdir)
        .map((e) => String(e?.path || `${wrongPath}/${e?.name || ""}`));
      const subDirs = entries.filter((e) => e?.isdir);

      if (dryRun) {
        return {
          ok: true,
          dryRun: true,
          orderNumber,
          orderDocId,
          wrongPath,
          correctPath,
          fileCount: filePaths.length,
          files: filePaths,
          subDirCount: subDirs.length,
          message: "DRY RUN：未實際搬移。要執行請再呼叫一次並帶 dryRun=false",
        };
      }

      // 實際搬移
      let moved = 0;
      if (filePaths.length > 0) {
        await synologyMoveFiles({
          baseUrl,
          sid,
          srcPaths: filePaths,
          destFolderPath: correctPath,
        });
        moved = filePaths.length;
      }

      // 嘗試刪除錯誤資料夾（若還有子資料夾就不刪）
      let folderDeleted = false;
      if (subDirs.length === 0) {
        try {
          await synologyDeleteFile({
            baseUrl,
            sid,
            filePath: wrongPath,
          });
          folderDeleted = true;
        } catch (delErr) {
          logger.warn("repairWrongOrderFolder: delete wrong folder failed", {
            wrongPath,
            error: delErr?.message,
          });
        }
      }

      // 更新 Firestore
      // 更新 Firestore：只在 nasOrderFolderPath 仍是錯誤路徑時改寫，避免覆蓋掉已經是正確路徑的紀錄
      const currentNasPath = String(orderData.nasOrderFolderPath || "").trim();
      if (currentNasPath === wrongPath || !currentNasPath) {
        await orderDoc.ref.update({ nasOrderFolderPath: correctPath });
      }

      // 同步更新 completionPhotos.nasPath
      const photosSnap = await db
        .collection("Orders")
        .doc(orderDocId)
        .collection("completionPhotos")
        .get();
      const oldPrefix = wrongPath.endsWith("/") ? wrongPath : `${wrongPath}/`;
      const newPrefix = correctPath.endsWith("/")
        ? correctPath
        : `${correctPath}/`;
      const batch = db.batch();
      let updatedPhotos = 0;
      for (const p of photosSnap.docs) {
        const oldNas = String(p.data()?.nasPath || "").trim();
        if (oldNas.startsWith(oldPrefix)) {
          batch.update(p.ref, {
            nasPath: newPrefix + oldNas.slice(oldPrefix.length),
          });
          updatedPhotos++;
        }
      }
      if (updatedPhotos > 0) await batch.commit();

      return {
        ok: true,
        dryRun: false,
        orderNumber,
        orderDocId,
        wrongPath,
        correctPath,
        movedFiles: moved,
        folderDeleted,
        updatedPhotoDocs: updatedPhotos,
        subDirsRemaining: subDirs.length,
      };
    } finally {
      try {
        await synologyLogout(baseUrl, sid);
      } catch (_) {}
    }
  },
);

// 測試：用 PDF 搜尋找訂單資料夾，回傳找到的路徑與耗時
exports.testOrderFolderSearch = onCall(
  { secrets: [SYNO_USERNAME_SECRET, SYNO_PASSWORD_SECRET] },
  async (payload, ctx) => {
    const auth = (ctx && ctx.auth) || payload.auth || null;
    const authUid = auth && auth.uid ? auth.uid : null;
    if (!authUid) {
      throw new functions.https.HttpsError("unauthenticated", "請先登入");
    }
    const role = await readUserRole(authUid);
    if (!isStaffRole(role)) {
      throw new functions.https.HttpsError(
        "permission-denied",
        "僅管理者或員工可使用",
      );
    }

    const orderNumber = String(
      (payload && (payload.data?.orderNumber || payload.orderNumber)) || "",
    ).trim();
    if (!orderNumber) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "請提供 orderNumber",
      );
    }

    const nasOrderPath = await getNasOrderPath();
    if (!nasOrderPath) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "請先在系統設定填入訂單資料夾路徑",
      );
    }

    const baseUrl = buildSynologyBaseUrl();
    const { username, password } = getSynologyCredentials();

    let sid = null;
    try {
      const loginStart = Date.now();
      sid = await synologyLogin(baseUrl, username, password);
      const loginMs = Date.now() - loginStart;

      // Discover available Finder/Search APIs on NAS
      const discoveryStart = Date.now();
      const queryUrl = new URL("/webapi/query.cgi", baseUrl).toString();
      const queryBody = new URLSearchParams();
      queryBody.set("api", "SYNO.API.Info");
      queryBody.set("version", "1");
      queryBody.set("method", "query");
      queryBody.set("query", "SYNO.Finder");
      const queryResp = await fetch(queryUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: queryBody.toString(),
      });
      const queryJson = await parseJsonSafe(queryResp);
      const finderApis = queryJson?.data ? Object.keys(queryJson.data) : [];
      const discoveryMs = Date.now() - discoveryStart;

      const searchStart = Date.now();
      const pdfPath = await synologySearchFileByName({
        baseUrl,
        sid,
        rootPath: nasOrderPath,
        fileName: `${orderNumber}.pdf`,
      });
      const searchMs = Date.now() - searchStart;

      if (!pdfPath) {
        // Diagnostic: try folder-name search to see if the order folder exists
        let folderHint = null;
        try {
          const folders = await synologyFinderSearchFolders({
            baseUrl,
            sid,
            pattern: orderNumber,
          });
          const match = folders.find((f) =>
            String(f?.name || "").includes(orderNumber),
          );
          if (match) folderHint = match.path;
        } catch (_) {
          /* ignore */
        }

        const totalMs = Date.now() - loginStart;
        return {
          found: false,
          orderNumber,
          searchedRoot: nasOrderPath,
          loginMs,
          searchMs,
          discoveryMs,
          finderApis,
          totalMs,
          folderHint,
          message: folderHint
            ? `找不到 ${orderNumber}.pdf，但找到資料夾: ${folderHint}`
            : `找不到 ${orderNumber}.pdf，資料夾也找不到`,
        };
      }

      const lastSlash = pdfPath.lastIndexOf("/");
      const folderPath = lastSlash > 0 ? pdfPath.slice(0, lastSlash) : "";

      return {
        found: true,
        orderNumber,
        pdfPath,
        folderPath,
        searchedRoot: nasOrderPath,
        loginMs,
        searchMs,
        discoveryMs,
        finderApis,
        totalMs: loginMs + searchMs,
      };
    } finally {
      if (sid) {
        synologyLogout(baseUrl, sid).catch(() => {});
      }
    }
  },
);

// ══════════════════════════════════════════════════════════════════════════════
// 薪資計算
// ══════════════════════════════════════════════════════════════════════════════

/**
 * 計算指定月份（yyyyMM）所有在職員工的薪資，存入 payroll/{uid}_{yyyyMM}。
 * 項目：底薪 + 獎金(1~5) + 加班費(勞基法) − 請假扣薪
 * 勞基法加班費：前2小時 × 4/3，第3小時起 × 5/3（以月薪/240為時薪）
 * 請假扣薪：事假/無薪假 = 全扣，病假/生理假 = 扣半，年假/婚假/喪假/產假/陪產假/公假 = 不扣
 */
async function runPayrollCalculation(yyyyMM) {
  if (!yyyyMM || !/^\d{6}$/.test(String(yyyyMM))) {
    throw new Error("yyyyMM 格式錯誤，請提供 6 位數字（例：202504）");
  }
  const yyyy = yyyyMM.slice(0, 4);
  const mm = yyyyMM.slice(4, 6);
  const monthPrefix = `${yyyy}-${mm}`;
  const monthLabel = `${yyyy}年${parseInt(mm, 10)}月`;
  const daysInMonth = new Date(Number(yyyy), Number(mm), 0).getDate();
  const monthStart = `${yyyy}-${mm}-01`;
  const monthEnd = `${yyyy}-${mm}-${String(daysInMonth).padStart(2, "0")}`;

  const db = admin.firestore();

  // 讀取差勤規則設定
  const settingsDoc = await db
    .collection("SystemSettings")
    .doc("general")
    .get();
  const settingsData = settingsDoc.exists ? settingsDoc.data() : {};
  const attRules = settingsData.attendanceRules || {};
  const legacyWorkWindow =
    attRules.workStart === "08:30" && attRules.workEnd === "17:30";
  const workStart = legacyWorkWindow ? "08:00" : attRules.workStart || "08:00"; // "HH:MM"
  const workEnd = legacyWorkWindow ? "17:00" : attRules.workEnd || "17:00"; // "HH:MM"
  const graceMins = Number(attRules.graceMins) || 0;
  const deductUnit = attRules.deductUnit || "minute"; // "minute"|"30min"|"60min"
  const deductEarlyLeave = attRules.deductEarlyLeave !== false;

  // 年利率（百分比），預設 2%
  const annualInterestRatePct = Number.isFinite(
    Number(settingsData.loanInterestRate),
  )
    ? Number(settingsData.loanInterestRate)
    : 2;
  const annualInterestRate = annualInterestRatePct / 100;
  const healthInsuranceRatePct = Number.isFinite(
    Number(settingsData.healthInsuranceRate),
  )
    ? Number(settingsData.healthInsuranceRate)
    : 5.17;
  const rawHealthInsuranceEmployeeShare = Number(
    settingsData.healthInsuranceEmployeeShare,
  );
  const healthInsuranceEmployeeShare = Number.isFinite(
    rawHealthInsuranceEmployeeShare,
  )
    ? rawHealthInsuranceEmployeeShare > 1
      ? rawHealthInsuranceEmployeeShare / 100
      : rawHealthInsuranceEmployeeShare
    : 0.3;

  // 將 "HH:MM" 轉成分鐘數
  function toMins(hhmm) {
    const [h, m] = String(hhmm).split(":").map(Number);
    return h * 60 + (m || 0);
  }
  // 將 "HH:MM:SS" 或 "HH:MM" 轉成分鐘數
  function timeStrToMins(s) {
    const parts = String(s || "")
      .split(":")
      .map(Number);
    return parts[0] * 60 + (parts[1] || 0);
  }
  function normalizeTimeStr(value) {
    if (!value) return null;
    const raw = String(value);
    return raw.length <= 5 ? `${raw}:00` : raw;
  }
  function clampEarliestPunchIn(value) {
    const normalized = normalizeTimeStr(value);
    if (!normalized) return null;
    return timeStrToMins(normalized) < timeStrToMins("07:45:00")
      ? "07:45:00"
      : normalized;
  }
  function getWorkSegmentsFromAttendance(att) {
    const rawSegments = Array.isArray(att.workSegments) ? att.workSegments : [];
    const normalized = rawSegments
      .map((seg) => ({
        start: normalizeTimeStr(seg && seg.start),
        end: normalizeTimeStr(seg && seg.end),
      }))
      .filter((seg) => seg.start)
      .sort((a, b) => timeStrToMins(a.start) - timeStrToMins(b.start));
    if (normalized.length) {
      normalized[0].start = clampEarliestPunchIn(normalized[0].start);
    }
    if (normalized.length) return normalized;
    if (att.punchIn) {
      return [
        {
          start: clampEarliestPunchIn(att.punchIn),
          end: normalizeTimeStr(att.punchOut),
        },
      ];
    }
    return [];
  }
  function getFirstWorkStart(att) {
    return (
      getWorkSegmentsFromAttendance(att)[0]?.start ||
      clampEarliestPunchIn(att.punchIn)
    );
  }
  function getLastWorkEnd(att) {
    const segments = getWorkSegmentsFromAttendance(att).filter(
      (seg) => seg.end,
    );
    return (
      normalizeTimeStr(att.punchOut) ||
      segments[segments.length - 1]?.end ||
      null
    );
  }
  function overlapsWindow(segments, windowStart, windowEnd) {
    return segments.some(
      (seg) =>
        seg.start && seg.end && seg.start < windowEnd && seg.end > windowStart,
    );
  }
  function calcRegularWorkHours(att) {
    const segments = getWorkSegmentsFromAttendance(att).filter(
      (seg) => seg.start && seg.end,
    );
    if (!segments.length) return 0;

    const lunchStartMins = 12 * 60;
    const lunchEndMins = 13 * 60;
    let totalMins = 0;
    let lunchOverlapMins = 0;

    for (const seg of segments) {
      const segStart = timeStrToMins(seg.start);
      const segEnd = timeStrToMins(seg.end);
      if (!Number.isFinite(segStart) || !Number.isFinite(segEnd)) continue;
      const clippedStart = Math.max(segStart, workStartMins);
      const clippedEnd = Math.min(segEnd, workEndMins);
      if (clippedEnd <= clippedStart) continue;

      totalMins += clippedEnd - clippedStart;

      const overlap =
        Math.min(clippedEnd, lunchEndMins) -
        Math.max(clippedStart, lunchStartMins);
      if (overlap > 0) lunchOverlapMins += overlap;
    }

    if (totalMins <= 0) return 0;
    const payableMins = Math.max(0, totalMins - Math.min(60, lunchOverlapMins));
    return payableMins / 60;
  }
  function calcOtIntersectionHours(ot, attendanceByDate) {
    const otDate = String(ot && ot.date ? ot.date : "").trim();
    const otStart = normalizeTimeStr(ot && ot.startTime);
    const otEnd = normalizeTimeStr(ot && ot.endTime);
    if (!otDate || !otStart || !otEnd) {
      return Number(ot && ot.hours) || 0;
    }
    const otStartMins = timeStrToMins(otStart);
    const otEndMins = timeStrToMins(otEnd);
    if (otEndMins <= otStartMins) return 0;

    const att = attendanceByDate.get(otDate);
    if (!att) return 0;

    const workSegments = getWorkSegmentsFromAttendance(att).filter(
      (seg) => seg.start && seg.end,
    );
    const calcOverlapMins = (segments = []) => {
      let overlapMins = 0;
      for (const seg of segments) {
        const segStart = timeStrToMins(seg.start);
        const segEnd = timeStrToMins(seg.end);
        if (segEnd <= segStart) continue;
        const start = Math.max(otStartMins, segStart);
        const end = Math.min(otEndMins, segEnd);
        if (end > start) overlapMins += end - start;
      }
      return overlapMins;
    };

    const overlapBySegments = calcOverlapMins(workSegments);

    // Fallback: some records may have stale/trimmed workSegments,
    // but punchIn/punchOut still represents the real work window.
    const punchStart = clampEarliestPunchIn(att.punchIn);
    const punchEnd = normalizeTimeStr(att.punchOut);
    let overlapByPunchWindow = 0;
    if (punchStart && punchEnd) {
      overlapByPunchWindow = calcOverlapMins([
        { start: punchStart, end: punchEnd },
      ]);
    }

    const overlapMins = Math.max(overlapBySegments, overlapByPunchWindow);
    return Math.round((overlapMins / 60) * 10) / 10;
  }

  function isSaturdayDate(dateStr) {
    const s = String(dateStr || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    const [y, m, d] = s.split("-").map(Number);
    const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    return dow === 6;
  }

  function calcOvertimePay(hours, dateStr, hourlyRate) {
    const h = Number(hours) || 0;
    if (h <= 0) return 0;

    // 公司規則：星期六加班時數全部以 1.67 倍計算
    if (isSaturdayDate(dateStr)) {
      return Math.round(h * hourlyRate * (5 / 3));
    }

    if (h <= 2) {
      return Math.round(h * hourlyRate * (4 / 3));
    }
    return Math.round(
      2 * hourlyRate * (4 / 3) + (h - 2) * hourlyRate * (5 / 3),
    );
  }
  // 依扣薪單位計算扣薪金額
  function calcDeductionAmt(deductMins, hourlyRate) {
    if (deductMins <= 0) return 0;
    if (deductUnit === "30min") {
      return Math.ceil(deductMins / 30) * 0.5 * hourlyRate;
    } else if (deductUnit === "60min") {
      return Math.ceil(deductMins / 60) * hourlyRate;
    } else {
      return (deductMins / 60) * hourlyRate;
    }
  }
  function normalizeDateStr(value) {
    if (!value) return null;
    const s = String(value).slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
  }
  function daysBetweenInclusive(startDate, endDate) {
    if (!startDate || !endDate || endDate < startDate) return 0;
    const start = new Date(`${startDate}T00:00:00`);
    const end = new Date(`${endDate}T00:00:00`);
    return Math.floor((end - start) / 86400000) + 1;
  }

  function resolveLeaveEndDate(lv, startDate) {
    let end = normalizeDateStr(lv.endDate || lv.date);
    if (end) return end;
    if (!startDate) return "";
    const daysN = lv.unit === "小時" ? 1 : Math.max(1, Number(lv.days) || 1);
    const d = new Date(`${startDate}T00:00:00`);
    d.setDate(d.getDate() + (daysN - 1));
    return d.toISOString().slice(0, 10);
  }

  const workStartMins = toMins(workStart);
  const workEndMins = toMins(workEnd);

  function tsToMs(value) {
    if (!value) return 0;
    if (typeof value.toMillis === "function") return value.toMillis();
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  function toMoneyNumber(value) {
    if (value === null || value === undefined) return 0;
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;
    const normalized = String(value).replace(/[^\d.-]/g, "");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function pickPreferredUser(existing, incoming) {
    if (!existing) return incoming;
    const exMs = tsToMs(existing.lastSeen);
    const inMs = tsToMs(incoming.lastSeen);
    if (inMs !== exMs) return inMs > exMs ? incoming : existing;
    return String(incoming.uid || "") > String(existing.uid || "")
      ? incoming
      : existing;
  }

  const staffSnap = await db.collection("staff").get();
  const usersSnap = await db.collection("Users").get();
  const usersByEmpNo = new Map();
  const usersByEmail = new Map();
  const userUidsByEmpNo = new Map();
  const userUidsByEmail = new Map();
  usersSnap.docs.forEach((d) => {
    const data = d.data() || {};
    const user = { uid: d.id, ...data };
    const empNoKey = String(data.empNo || "").trim();
    if (empNoKey) {
      usersByEmpNo.set(
        empNoKey,
        pickPreferredUser(usersByEmpNo.get(empNoKey), user),
      );
      if (!userUidsByEmpNo.has(empNoKey))
        userUidsByEmpNo.set(empNoKey, new Set());
      userUidsByEmpNo.get(empNoKey).add(String(d.id));
    }
    const emailKey = String(data.email || "")
      .trim()
      .toLowerCase();
    if (emailKey) {
      usersByEmail.set(
        emailKey,
        pickPreferredUser(usersByEmail.get(emailKey), user),
      );
      if (!userUidsByEmail.has(emailKey))
        userUidsByEmail.set(emailKey, new Set());
      userUidsByEmail.get(emailKey).add(String(d.id));
    }
  });

  const results = [];

  for (const staffDoc of staffSnap.docs) {
    const s = staffDoc.data();
    const empNo = s.empNo || staffDoc.id;
    const empNoKey = String(empNo || "").trim();
    const email = String(s.email || "")
      .trim()
      .toLowerCase();

    // Resolve uid by Users.empNo first (account-switch safe), then email fallback.
    let userUid = null;
    const matchedByEmpNo = usersByEmpNo.get(empNoKey);
    const matchedByEmail = email ? usersByEmail.get(email) : null;
    if (matchedByEmpNo && matchedByEmpNo.uid) {
      userUid = String(matchedByEmpNo.uid);
    } else if (matchedByEmail && matchedByEmail.uid) {
      userUid = String(matchedByEmail.uid);
    } else if (email) {
      try {
        const userRecord = await admin.auth().getUserByEmail(email);
        userUid = userRecord.uid;
      } catch (_) {
        userUid = null;
      }
    }

    if (!userUid) {
      logger.info(
        `payroll: staff ${empNo} (${email || "no-email"}) has no resolved uid, using empNo key only`,
      );
    }

    const candidateUidSet = new Set();
    if (userUid) candidateUidSet.add(String(userUid));
    const empNoUids = userUidsByEmpNo.get(empNoKey);
    if (empNoUids) empNoUids.forEach((uid) => candidateUidSet.add(String(uid)));
    if (email) {
      const emailUids = userUidsByEmail.get(email);
      if (emailUids)
        emailUids.forEach((uid) => candidateUidSet.add(String(uid)));
    }
    const candidateUids = [...candidateUidSet].filter(Boolean);
    if (candidateUids.length > 1) {
      logger.info(`payroll: ${empNo} merged multiple uids`, {
        empNo,
        email,
        primaryUid: userUid || null,
        candidateUids,
      });
    }

    // Use docKey/docId early so manual fields on existing payroll can survive recalculation.
    const docKey = userUid || `empNo_${String(empNo)}`;
    const docId = `${docKey}_${yyyyMM}`;
    const existingPayrollSnap = await db.collection("payroll").doc(docId).get();
    const existingPayroll = existingPayrollSnap.exists
      ? existingPayrollSnap.data() || {}
      : {};

    // Approved overtime records in this month
    // Query by merged candidate uids to handle account switches.
    let otRecords = [];
    let leaveRecords = [];
    if (candidateUids.length > 0) {
      const otSnaps = await Promise.all(
        candidateUids.map((uid) =>
          db
            .collection("overtimeRequests")
            .where("uid", "==", uid)
            .where("status", "==", "approved2")
            .get(),
        ),
      );
      const otByDocId = new Map();
      otSnaps.forEach((snap) => {
        snap.docs.forEach((d) => otByDocId.set(d.id, d.data()));
      });
      otRecords = [...otByDocId.values()].filter((r) =>
        String(r.date || "").startsWith(monthPrefix),
      );

      const leaveSnaps = await Promise.all(
        candidateUids.map((uid) =>
          db
            .collection("leaveRequests")
            .where("uid", "==", uid)
            .where("status", "==", "approved2")
            .get(),
        ),
      );
      const leaveByDocId = new Map();
      leaveSnaps.forEach((snap) => {
        snap.docs.forEach((d) => leaveByDocId.set(d.id, d.data()));
      });
      leaveRecords = [...leaveByDocId.values()];
    }

    // Base hourly rate (for OT and leave deduction)
    const base = Number(s.baseSalary) || 0;
    const salType = s.salaryType || "月薪";
    const isSalesCommissionSalary = salType === "營業額1%";
    const salesAmount = Math.max(
      0,
      toMoneyNumber(existingPayroll.salesAmountManual ?? existingPayroll.salesAmount),
    );
    const salesCommissionRate = 0.01;
    const empStartDate = normalizeDateStr(s.startDate);
    const empEndDate = normalizeDateStr(
      s.endDate || s.leaveDate || s.resignDate || s.terminationDate,
    );

    // 不在職於該月份：跳過本月計薪
    if (
      (empStartDate && empStartDate > monthEnd) ||
      (empEndDate && empEndDate < monthStart)
    ) {
      logger.info(
        `payroll: skip ${empNo} ${s.name || ""} ${yyyyMM}, out of employment range`,
      );
      continue;
    }

    const employmentStart =
      empStartDate && empStartDate > monthStart ? empStartDate : monthStart;
    const employmentEnd =
      empEndDate && empEndDate < monthEnd ? empEndDate : monthEnd;

    // 月薪制：底薪維持月薪，未上班天數扣薪另列（含月中到職/離職）
    let effectiveBase = base;
    let basePayForGross = base;
    let partialMonthNoWorkDays = 0;
    let partialMonthDeduction = 0;
    let attendanceDays = 0;
    let attendanceHours = 0;
    if (salType === "月薪") {
      const employedDays = daysBetweenInclusive(employmentStart, employmentEnd);
      partialMonthNoWorkDays = Math.max(0, daysInMonth - employedDays);
      if (partialMonthNoWorkDays > 0) {
        // 月薪日薪基準採 30 天，利於人資核算
        partialMonthDeduction = Math.round(
          (base / 30) * partialMonthNoWorkDays,
        );
      }
      effectiveBase = base;
    }

    let baseHourlyRate;
    if (salType === "月薪" || isSalesCommissionSalary) {
      baseHourlyRate = effectiveBase / 240; // 30 天 × 8 小時
    } else if (salType === "時薪") {
      baseHourlyRate = base;
    } else {
      // 日薪
      baseHourlyRate = base / 8;
    }

    // 當月打卡資料（供加班交集計算與伙食/遲到早退）
    let attendanceRecordsThisMonth = [];
    if (candidateUids.length > 0) {
      const attSnaps = await Promise.all(
        candidateUids.map((uid) =>
          db.collection("attendance").where("uid", "==", uid).get(),
        ),
      );
      const attendanceByDocId = new Map();
      attSnaps.forEach((snap) => {
        snap.docs.forEach((d) => attendanceByDocId.set(d.id, d.data()));
      });
      attendanceRecordsThisMonth = [...attendanceByDocId.values()].filter(
        (r) => {
          const d = normalizeDateStr(r.date);
          return d && d >= employmentStart && d <= employmentEnd;
        },
      );
    }
    const attendanceByDate = new Map(
      attendanceRecordsThisMonth.map((r) => [String(r.date || ""), r]),
    );

    // 在職區間內的加班/請假資料
    otRecords = otRecords.filter((r) => {
      const d = normalizeDateStr(r.date);
      return d && d >= employmentStart && d <= employmentEnd;
    });
    leaveRecords = leaveRecords.filter((lv) => {
      const start = normalizeDateStr(lv.startDate);
      const end = resolveLeaveEndDate(lv, start);
      if (!start) return false;
      return start <= employmentEnd && end >= employmentStart;
    });

    const leaveCoveredDates = new Set();
    for (const lv of leaveRecords) {
      const start = normalizeDateStr(lv.startDate || lv.date);
      const end = resolveLeaveEndDate(lv, start);
      const clippedStart = start > employmentStart ? start : employmentStart;
      const clippedEnd = end < employmentEnd ? end : employmentEnd;
      const daysN = daysBetweenInclusive(clippedStart, clippedEnd);
      for (let i = 0; i < daysN; i++) {
        const d = new Date(`${clippedStart}T00:00:00`);
        d.setDate(d.getDate() + i);
        leaveCoveredDates.add(d.toISOString().slice(0, 10));
      }
    }

    const approvedOtDateSet = new Set(
      otRecords
        .map((r) => normalizeDateStr(r.date))
        .filter(Boolean),
    );

    // OT pay (勞基法第24條)
    let otPay = 0;
    let otHours = 0;
    const otDetail = [];
    for (const ot of otRecords) {
      const h = Math.max(0, calcOtIntersectionHours(ot, attendanceByDate));
      otHours += h;
      const pay = calcOvertimePay(h, ot.date, baseHourlyRate);
      otPay += pay;
      otDetail.push({ date: ot.date || "", hours: h, pay });
    }

    // Official OT (for labor compliance ≤46 h/month)
    const OT_MONTHLY_CAP = 46;
    let otPayOfficial = 0;
    let otHoursOfficial = 0;
    const otDetailOfficial = [];
    for (const ot of otRecords) {
      const actualIntersectionH = Math.max(
        0,
        calcOtIntersectionHours(ot, attendanceByDate),
      );
      const hRaw =
        Number(
          ot.officialHours != null ? ot.officialHours : actualIntersectionH,
        ) || 0;
      const hOff = Math.min(
        hRaw,
        Math.max(0, OT_MONTHLY_CAP - otHoursOfficial),
      );
      if (hOff <= 0) continue;
      otHoursOfficial += hOff;
      const payOff = calcOvertimePay(hOff, ot.date, baseHourlyRate);
      otPayOfficial += payOff;
      otDetailOfficial.push({ date: ot.date || "", hours: hOff, pay: payOff });
    }

    // Leave deduction
    let leaveDeduction = 0;
    const leaveDetail = [];
    for (const lv of leaveRecords) {
      const unit = lv.unit || "天";
      const start = normalizeDateStr(lv.startDate || lv.date);
      const end = resolveLeaveEndDate(lv, start);
      const clippedStart = start > employmentStart ? start : employmentStart;
      const clippedEnd = end < employmentEnd ? end : employmentEnd;
      const clippedDays = daysBetweenInclusive(clippedStart, clippedEnd);
      if (clippedDays <= 0) continue;
      const hrs =
        unit === "小時" ? Number(lv.hours) || 0 : clippedDays * 8;
      let deduction = 0;
      if (salType !== "時薪") {
        if (
          lv.type === "年假（特休）" ||
          lv.type === "特休" ||
          lv.type === "婚假" ||
          lv.type === "喪假" ||
          lv.type === "產假" ||
          lv.type === "陪產假" ||
          lv.type === "公假"
        ) {
          deduction = 0; // 帶薪假，不扣薪
        } else if (lv.type === "病假" || lv.type === "生理假") {
          deduction = Math.round(baseHourlyRate * hrs * 0.5); // 半薪
        } else {
          deduction = Math.round(baseHourlyRate * hrs); // 全扣（事假、無薪假等）
        }
      }
      leaveDeduction += deduction;
      leaveDetail.push({
        type: lv.type,
        unit,
        startDate: clippedStart,
        endDate: clippedEnd,
        days: unit === "小時" ? null : clippedDays,
        hours: lv.hours != null ? lv.hours : null,
        deduction,
      });
    }

    // 伙食費：依打卡紀錄判斷每日餐費
    // 上班時間涵蓋 11:00~14:00 → +100；涵蓋 17:30~18:30 → 再+100
    let mealAllowance = 0;
    const mealDetail = [];
    const deptRaw = String(s.dept || "").trim();
    const deptNameRaw = String(s.deptName || "").trim();
    const isForeignWorker =
      s.isForeignWorker === true ||
      deptRaw === "4" ||
      deptRaw === "外勞" ||
      deptNameRaw === "外勞";
    const hasMealAllowance = salType !== "營業額1%";

    // 外勞便當改為整月計算：午餐 + 晚餐 = 200 / 天
    if (hasMealAllowance && isForeignWorker) {
      mealAllowance = daysInMonth * 200;
    }

    let lateEarlyDeduction = 0;
    const lateEarlyDetail = [];
    let absentDeduction = 0;
    let absentDays = 0;
    const absentDetail = [];
    if (candidateUids.length > 0) {
      const publicHolidaySet = new Set(
        (settingsData.publicHolidays || [])
          .map((h) => (typeof h === "string" ? h : h && h.date ? h.date : null))
          .filter(Boolean),
      );
      const makeupWorkdaySet = new Set(
        (settingsData.makeupWorkdays || [])
          .map((h) => (typeof h === "string" ? h : h && h.date ? h.date : null))
          .filter(Boolean),
      );
      const isRegularWorkday = (dateStr) => {
        const d = String(dateStr || "").slice(0, 10);
        if (!d) return false;
        const dow = new Date(d + "T00:00:00").getDay();
        const isMakeup = makeupWorkdaySet.has(d);
        if ((dow === 0 || dow === 6) && !isMakeup) return false;
        if (publicHolidaySet.has(d)) return false;
        return true;
      };
      const isWeekendOrPublicHoliday = (dateStr) => {
        const d = String(dateStr || "").slice(0, 10);
        if (!d) return false;
        const dow = new Date(d + "T00:00:00").getDay();
        return dow === 0 || dow === 6 || publicHolidaySet.has(d);
      };

      const attRecords = attendanceRecordsThisMonth.filter(
        (r) => getFirstWorkStart(r) && getLastWorkEnd(r),
      );
      attendanceDays = new Set(
        attRecords.map((r) => String(r.date || "").slice(0, 10)),
      ).size;
      if (salType === "日薪") {
        // 日薪制：底薪依當月實際出勤天數計算
        effectiveBase = Math.round(base * attendanceDays);
        basePayForGross = effectiveBase;
      }
      if (salType === "時薪") {
        attendanceHours = attRecords.reduce(
          (sum, att) => sum + calcRegularWorkHours(att),
          0,
        );
        basePayForGross = Math.round(base * attendanceHours);
      }
      for (const att of attRecords) {
        const workSegments = getWorkSegmentsFromAttendance(att).filter(
          (seg) => seg.start && seg.end,
        );
        const inT = getFirstWorkStart(att);
        const outT = getLastWorkEnd(att);
        if (!inT || !outT) continue;
        const attDate = String(att.date || "").slice(0, 10);
        if (hasMealAllowance && !isForeignWorker) {
          let dayLunch = 0;
          let dayDinner = 0;
          if (overlapsWindow(workSegments, "11:00:00", "14:00:00"))
            dayLunch += 100; // 午餐
          if (
            approvedOtDateSet.has(attDate) &&
            overlapsWindow(workSegments, "17:30:00", "18:30:00")
          ) {
            dayDinner += 100; // 晚餐（需同日核准加班）
          }
          const dayMeal = dayLunch + dayDinner;
          if (dayMeal > 0) {
            mealAllowance += dayMeal;
            mealDetail.push({
              date: att.date,
              punchIn: inT,
              punchOut: outT,
              mealLunch: dayLunch,
              mealDinner: dayDinner,
              meal: dayMeal,
            });
          }
        }

        // 假日（週末/國定假日）不計遲到早退扣薪；時薪制與營業額1%不扣遲到早退
        if (
          salType !== "時薪" &&
          salType !== "營業額1%" &&
          !isWeekendOrPublicHoliday(attDate) &&
          !leaveCoveredDates.has(attDate)
        ) {
          const inMins = timeStrToMins(inT);
          const outMins = timeStrToMins(outT);
          const lateMins = Math.max(0, inMins - (workStartMins + graceMins));
          const earlyMins = deductEarlyLeave
            ? Math.max(0, workEndMins - graceMins - outMins)
            : 0;
          const totalDeductMins = lateMins + earlyMins;
          if (totalDeductMins > 0) {
            const deduction = Math.round(
              calcDeductionAmt(totalDeductMins, baseHourlyRate),
            );
            lateEarlyDeduction += deduction;
            lateEarlyDetail.push({
              date: att.date,
              punchIn: inT,
              punchOut: outT,
              lateMins,
              earlyMins,
              deduction,
            });
          }
        }
      }

      // 曠職自動偵測：工作日（週一至五）無打卡且無請假；時薪制與營業額1%不扣曠職
      if (salType !== "時薪" && salType !== "營業額1%") {
        // 有打卡（至少有 punchIn）的日期
        const punchedDates = new Set(
          attendanceRecordsThisMonth
            .filter(
              (r) => String(r.date || "").startsWith(monthPrefix) && r.punchIn,
            )
            .map((r) => r.date),
        );
        // 每天檢查
        const daysInMonthN = new Date(Number(yyyy), Number(mm), 0).getDate();
        const todayStr = new Date().toISOString().slice(0, 10);
        for (let day = 1; day <= daysInMonthN; day++) {
          const dateStr = `${yyyy}-${mm}-${String(day).padStart(2, "0")}`;
          if (dateStr >= todayStr) continue; // 未來日期與今天不計（今天可能還在上班）
          if (dateStr < employmentStart) continue; // 到職前
          if (dateStr > employmentEnd) continue; // 離職後
          if (!isRegularWorkday(dateStr)) continue;
          if (punchedDates.has(dateStr)) continue; // 有打卡
          if (leaveCoveredDates.has(dateStr)) continue; // 有請假
          absentDays++;
          absentDetail.push(dateStr);
        }
        absentDeduction = Math.round(baseHourlyRate * 8 * absentDays);
      }
    }

    // Fixed monthly bonuses
    const bonusItems = [s.bonus1, s.bonus2, s.bonus3, s.bonus4, s.bonus5].map(
      (b) => Number(b) || 0,
    );
    const bonusTotal = bonusItems.reduce((acc, b) => acc + b, 0);

    // Fixed monthly deductions
    const laborInsurance = Math.max(0, Number(s.laborInsurance) || 0);
    const hasManualHealthInsurance =
      s.healthInsurance !== undefined &&
      s.healthInsurance !== null &&
      String(s.healthInsurance).trim() !== "";
    const healthInsuranceBase = Math.max(
      0,
      Number(s.healthInsuranceSalary) || 0,
    );
    const autoHealthInsurance = Math.round(
      healthInsuranceBase *
        (healthInsuranceRatePct / 100) *
        healthInsuranceEmployeeShare,
    );
    const healthInsurance = hasManualHealthInsurance
      ? Math.max(0, Number(s.healthInsurance) || 0)
      : autoHealthInsurance;
    const dependentHealth = Math.max(0, Number(s.dependentHealth) || 0);
    const mutualAid = Math.max(0, Number(s.mutualAid) || 0);

    // Foreign worker monthly deductions
    const foreignRent = Math.max(0, Number(s.foreignRent) || 0);
    const waterFee = Math.max(0, Number(s.waterFee) || 0);
    const electricFee = Math.max(0, Number(s.electricFee) || 0);
    const foreignMedical = Math.max(0, Number(s.foreignMedical) || 0);
    const foreignService = Math.max(0, Number(s.foreignService) || 0);
    const otherDeduction = Math.max(0, Number(s.otherDeduction) || 0);
    const otherDeductionNote = String(s.otherDeductionNote || "").trim();

    // 便當費：從現有薪資單讀取（若已設定），否則用員工預設
    let lunchFee = Math.max(0, Number(s.lunchFee) || 0);
    if (existingPayroll.lunchFee !== undefined && existingPayroll.lunchFee !== null) {
      lunchFee = Math.max(0, Number(existingPayroll.lunchFee) || 0);
    }

    let performanceSalesAmount = 0;
    let performancePay = 0;
    if (salType === "營業額1%") {
      const existing = existingPayrollSnap.exists ? existingPayrollSnap.data() || {} : {};
      performanceSalesAmount = Math.max(
        0,
        Number(
          existing.performanceSalesAmount ??
            existing.salesAmountManual ??
            existing.salesAmount ??
            s.performanceSalesAmount ??
            s.salesAmount,
        ) || 0,
      );
      performancePay = Math.round(performanceSalesAmount * 0.01);
      effectiveBase = performancePay;
      basePayForGross = performancePay;
    }

    // 借款扣款（等額本金法）
    // 每筆借款以 processedMonths[yyyyMM] 獨立追蹤是否已處理，
    // 避免重算時漏算新增借款或重複異動餘額。
    let loanPrincipal = 0;
    let loanInterest = 0;
    const loanUpdates = []; // { loanId, newRemaining, newPaid, newStatus, monthlyPrincipal, monthlyInterestAmt }

    const loansSnap = await db
      .collection("loans")
      .where("empNo", "==", String(empNo))
      .where("status", "==", "active")
      .get();

    for (const loanDoc of loansSnap.docs) {
      const ln = loanDoc.data();
      // Only process if startMonth <= yyyyMM
      const loanStartNum = String(ln.startMonth || "").replace("-", "");
      if (loanStartNum > yyyyMM) continue;

      const processedMonths = ln.processedMonths || {};
      if (processedMonths[yyyyMM]) {
        // 本月已處理過此筆借款：沿用已記錄金額，不重複異動餘額
        loanPrincipal += Number(processedMonths[yyyyMM].principal) || 0;
        loanInterest += Number(processedMonths[yyyyMM].interest) || 0;
      } else {
        // 本月尚未處理：計算並排入更新
        const monthlyPrincipal = Math.round(
          (Number(ln.principal) || 0) / (Number(ln.installments) || 1),
        );
        const monthlyInterestAmt =
          loanStartNum === yyyyMM
            ? 0
            : Math.round(
                (Number(ln.remainingBalance) || 0) * (annualInterestRate / 12),
              );
        loanPrincipal += monthlyPrincipal;
        loanInterest += monthlyInterestAmt;

        const newRemaining = Math.max(
          0,
          (Number(ln.remainingBalance) || 0) - monthlyPrincipal,
        );
        const newPaid = (Number(ln.paidInstallments) || 0) + 1;
        const newStatus =
          newPaid >= (Number(ln.installments) || 1) ? "paid" : "active";
        loanUpdates.push({
          loanId: loanDoc.id,
          newRemaining,
          newPaid,
          newStatus,
          monthlyPrincipal,
          monthlyInterestAmt,
        });
      }
    }

    const grossPay = Math.max(
      0,
      basePayForGross +
        bonusTotal +
        otPay +
        mealAllowance -
        partialMonthDeduction -
        leaveDeduction -
        lateEarlyDeduction -
        absentDeduction -
        laborInsurance -
        healthInsurance -
        dependentHealth -
        mutualAid -
        lunchFee -
        foreignRent -
        waterFee -
        electricFee -
        foreignMedical -
        foreignService -
        otherDeduction -
        loanPrincipal -
        loanInterest,
    );
    // 分兩次發薪：5日依投保薪資為底薪，先扣請假/曠職/遲到早退及員工自付保費/互助金/便當費；10日補差額
    const laborInsuranceSalaryBase = Math.max(
      0,
      Number(s.laborInsuranceSalary) || 0,
    );
    // 5 日薪資的未上班扣款改以投保薪資（日薪基準 30 天）計算
    const partialMonthDeductionFirst =
      salType === "月薪" && partialMonthNoWorkDays > 0
        ? Math.round((laborInsuranceSalaryBase / 30) * partialMonthNoWorkDays)
        : 0;
    const firstPayment = Math.max(
      0,
      laborInsuranceSalaryBase +
        otPayOfficial -
        leaveDeduction -
        lateEarlyDeduction -
        absentDeduction -
        laborInsurance -
        healthInsurance -
        dependentHealth -
        mutualAid -
        lunchFee -
        otherDeduction,
    );
    // 申報所得 = 投保薪資 - 請假扣款 - 曠職扣款 - 遲到/早退扣款
    const reportedIncome = Math.max(
      0,
      laborInsuranceSalaryBase -
        leaveDeduction -
        absentDeduction -
        lateEarlyDeduction,
    );
    const secondPayment = grossPay - firstPayment;

    await db
      .collection("payroll")
      .doc(docId)
      .set({
        uid: userUid || null,
        empNo,
        name: s.name || "",
        dept: s.dept || "",
        deptName: s.deptName || "",
        isForeignWorker,
        yyyyMM,
        monthLabel,
        employmentStart,
        employmentEnd,
        salaryType: salType,
        baseSalary: effectiveBase,
        basePay: basePayForGross,
        baseSalaryFull: base,
        salesAmount: performanceSalesAmount,
        salesAmountManual: performanceSalesAmount,
        salesCommissionRate: isSalesCommissionSalary ? salesCommissionRate : 0,
        salesCommissionPay: isSalesCommissionSalary ? performancePay : 0,
        performanceSalesAmount,
        performancePay,
        bonus1: bonusItems[0],
        bonus2: bonusItems[1],
        bonus3: bonusItems[2],
        bonus4: bonusItems[3],
        bonus5: bonusItems[4],
        bonusTotal,
        otDetail,
        otHours,
        otPay,
        otDetailOfficial,
        otHoursOfficial,
        otPayOfficial,
        mealAllowance,
        mealDetail,
        leaveDetail,
        leaveDeduction,
        attendanceDays,
        attendanceHours,
        partialMonthNoWorkDays,
        partialMonthDeduction,
        partialMonthDeductionFirst,
        lateEarlyDeduction,
        lateEarlyDetail,
        absentDeduction,
        absentDays,
        absentDetail,
        laborInsurance,
        healthInsurance,
        dependentHealth,
        mutualAid,
        lunchFee,
        foreignRent,
        waterFee,
        electricFee,
        foreignMedical,
        foreignService,
        otherDeduction,
        otherDeductionNote,
        loanPrincipal,
        loanInterest,
        laborInsuranceSalaryBase,
        firstPayment,
        secondPayment,
        grossPay,
        reportedIncome,
        status: "draft",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

    // Update loan records after payroll is written
    for (const lu of loanUpdates) {
      await db
        .collection("loans")
        .doc(lu.loanId)
        .update({
          remainingBalance: lu.newRemaining,
          paidInstallments: lu.newPaid,
          status: lu.newStatus,
          [`processedMonths.${yyyyMM}`]: {
            principal: lu.monthlyPrincipal,
            interest: lu.monthlyInterestAmt,
          },
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
    }

    results.push({ empNo, name: s.name || "", grossPay });
    logger.info(`payroll: ${empNo} ${s.name} ${yyyyMM} grossPay=${grossPay}`);
  }

  return { count: results.length, results };
}

// ── 手動觸發（管理者 onCall） ────────────────────────────────────────────────────
exports.calculatePayroll = onCall(async (req) => {
  const authUid = req.auth && req.auth.uid;
  if (!authUid) {
    throw new functions.https.HttpsError("unauthenticated", "請先登入");
  }
  const role = await readUserRole(authUid);
  if (role !== "admin" && role !== "管理者") {
    throw new functions.https.HttpsError(
      "permission-denied",
      "僅管理者可執行薪資計算",
    );
  }
  const yyyyMM = String((req.data && req.data.yyyyMM) || "").trim();
  try {
    const result = await runPayrollCalculation(yyyyMM);
    return { ok: true, ...result };
  } catch (e) {
    throw new functions.https.HttpsError("internal", e.message);
  }
});

// ── 每月 1 日自動計算上個月薪資 ─────────────────────────────────────────────────
exports.autoCalculatePayroll = onSchedule(
  { schedule: "0 9 1 * *", timeZone: "Asia/Taipei" },
  async (_event) => {
    const now = new Date();
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const yyyy = String(prev.getFullYear());
    const mm = String(prev.getMonth() + 1).padStart(2, "0");
    try {
      const result = await runPayrollCalculation(yyyy + mm);
      logger.info("autoCalculatePayroll done", result);
    } catch (e) {
      logger.error("autoCalculatePayroll failed", { error: e.message });
    }
  },
);

//  派車模組 (installTasks)
const _installTasks = require("./installTasks");
exports.createInstallTask = _installTasks.createInstallTask;
exports.nightlySyncInstallTasks = _installTasks.nightlySyncInstallTasks;
exports.runNightlySyncNow = _installTasks.runNightlySyncNow;
exports.onInstallTaskWritten = _installTasks.onInstallTaskWritten;

// salesOrders 鏡像同步 (legacy Orders -> salesOrders)
const _salesOrdersSync = require("./salesOrdersSync");
// 2026-05-26 停用自動鏡像 trigger:OrdersView 改為前端直接讀 Orders + salesOrders 合併,
// 不再需要鏡像。需要恢復時取消下行註解即可。
// exports.onLegacyOrderWritten = _salesOrdersSync.onLegacyOrderWritten;
exports.backfillSalesOrdersFromOrders =
  _salesOrdersSync.backfillSalesOrdersFromOrders;
exports.purgeLegacyMirroredSalesOrders =
  _salesOrdersSync.purgeLegacyMirroredSalesOrders;
