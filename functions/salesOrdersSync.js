/**
 * 舊版 Orders 鏡像同步 (Sheet-synced Orders → salesOrders)
 * ─────────────────────────────────────────────────────
 * 對應 docs/ERP-架構規劃.md §3.5 (legacy 過渡)
 *
 * 目的:
 *   - 讓 nightlySyncInstallTasks 能掃到 legacy 訂單,自動建立 installTasks
 *   - 不影響新 ERP 直接寫入的 salesOrders 文件
 *
 * 策略:
 *   - 鏡像目標 doc id = `legacy_${ordersDocId}` (避免與 ERP 主鍵衝突)
 *   - 寫入 `mirrorSource: 'Orders'` 標記,日後可篩選/清理
 *   - Orders 刪除 → 標記 mirrorDeleted=true (不真刪,避免毀掉 installTasks 參照)
 *
 * 提供:
 *   1. onLegacyOrderWritten (firestore trigger)  - 自動鏡像
 *   2. backfillSalesOrdersFromOrders (onCall)    - admin 手動批次回填
 */

const admin = require("firebase-admin");
const {onCall, HttpsError} = require("firebase-functions/v2/https");
const {onDocumentWritten} = require("firebase-functions/v2/firestore");
const {logger} = require("firebase-functions/v2");

const REGION = "asia-east1";
const LEGACY_PREFIX = "legacy_";

function db() {
  return admin.firestore();
}

function nowTs() {
  return admin.firestore.FieldValue.serverTimestamp();
}

/**
 * 把任意輸入 (Firestore Timestamp / Date / 數字 / 字串) 轉成 admin.firestore.Timestamp;失敗回 null
 */
function toTimestamp(input) {
  if (!input) return null;
  if (input && typeof input.toDate === "function") {
    try { return admin.firestore.Timestamp.fromDate(input.toDate()); } catch (_) {}
  }
  if (input instanceof Date) {
    if (isNaN(input.getTime())) return null;
    return admin.firestore.Timestamp.fromDate(input);
  }
  if (typeof input === "number" && isFinite(input)) {
    if (input > 1e12) return admin.firestore.Timestamp.fromMillis(input);
    if (input > 1e9 && input < 1e12) return admin.firestore.Timestamp.fromMillis(input * 1000);
    return null;
  }
  const ymd = normalizeYmd(input);
  if (ymd) {
    const d = new Date(`${ymd}T00:00:00+08:00`);
    if (!isNaN(d.getTime())) return admin.firestore.Timestamp.fromDate(d);
  }
  return null;
}

function pickFirst(src, keys) {
  for (const k of keys) {
    const v = src?.[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") return v;
  }
  return "";
}

/**
 * 將任意格式的日期字串標準化為 YYYY-MM-DD;失敗回 null
 * 接受: 2025-12-31 / 2025/12/31 / 20251231 / 114-12-31 (民國) / Date 物件
 */
function normalizeYmd(input) {
  if (!input) return null;
  if (input instanceof Date) {
    const y = input.getFullYear();
    const m = String(input.getMonth() + 1).padStart(2, "0");
    const d = String(input.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const s = String(input).trim();
  if (!s) return null;
  // YYYYMMDD
  if (/^\d{8}$/.test(s)) {
    return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  }
  // YYYY-MM-DD or YYYY/MM/DD
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) {
    return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  }
  // 民國 yyy-mm-dd (yyy 三碼或 yy 二碼)
  m = s.match(/^(\d{2,3})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) {
    const y = parseInt(m[1], 10) + 1911;
    return `${y}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  }
  return null;
}

/**
 * 將 legacy Orders 狀態映射為 salesOrders 狀態 enum
 * salesOrders 狀態: draft, pendingSign, confirmed, inProduction, delivered, done, cancelled
 *
 * 規則 (寬鬆):
 *   - 包含「完工」「已完」「完成」 → 'done'
 *   - 包含「取消」「作廢」 → 'cancelled'
 *   - 包含「派工」「派車」「安裝中」「生產」 → 'inProduction'
 *   - 包含「確認」「已下單」 → 'confirmed'
 *   - 其他 (有 promisedAt 即視為 confirmed; 無則 draft)
 */
function mapStatus(rawStatus, promisedAt) {
  const s = String(rawStatus || "").trim();
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

/**
 * 從 legacy Orders 文件 → salesOrders 鏡像欄位
 * 只放 installTask 需要的最小欄位 + 一些追溯資訊
 */
function buildMirrorPayload(orderId, orderData) {
  const d = orderData || {};
  const customerName = String(pickFirst(d, ["customerName", "客戶名稱", "客戶"]) || "").trim();
  const orderNo = String(pickFirst(d, ["orderNumber", "訂單號碼", "訂單編號", "orderNo"]) || "").trim();
  const siteAddress = String(pickFirst(d, ["installAddress", "安裝地點", "安裝地址", "地址", "siteAddress"]) || "").trim();
  const contactPhone = String(pickFirst(d, ["contactPhone", "電話", "客戶電話", "聯絡電話", "phone"]) || "").trim();
  const contactName = String(pickFirst(d, ["contactName", "聯絡人", "聯絡人姓名"]) || "").trim();
  const promisedAtRaw = pickFirst(d, ["installDate", "安裝日", "預定安裝日", "promisedAt", "預定日"]);
  const promisedAt = normalizeYmd(promisedAtRaw);
  const rawStatus = String(pickFirst(d, ["status", "狀態", "施工狀態"]) || "").trim();
  const status = mapStatus(rawStatus, promisedAt);
  const companyId = String(pickFirst(d, ["companyId", "customerCompanyId"]) || "").trim();

  // 推導 createdAt:優先用來源 createdAt → 中文建單日 → promisedAt → null
  const sourceCreatedAt =
    toTimestamp(pickFirst(d, ["createdAt", "建立時間", "建立日期", "建單日", "下單日期", "createdTime"])) ||
    toTimestamp(promisedAt);

  return {
    mirrorSource: "Orders",
    mirrorSourceId: orderId,
    mirrorDeleted: false,
    mirroredAt: nowTs(),

    orderNo: orderNo || null,
    customerId: companyId || null,
    customerName: customerName || "",
    contactName: contactName || "",
    contactPhone: contactPhone || "",
    siteAddress: siteAddress || "",
    promisedAt: promisedAt || null,
    status,

    // 追溯原始字串值,方便日後修正映射
    rawStatus: rawStatus || null,
    rawPromisedAt: promisedAtRaw ? String(promisedAtRaw) : null,

    // CF 寫入:以 'system' 取代具名 uid (rules 不會驗 CF 寫入,但留欄位供前端 display)
    createdByUid: "system",
    updatedByUid: "system",
    updatedAt: nowTs(),
    // 衍生欄位:由 writeMirror 取出後 delete,不寫入文件
    __sourceCreatedAt: sourceCreatedAt,
  };
}

function mirrorDocId(orderId) {
  return `${LEGACY_PREFIX}${orderId}`;
}

async function writeMirror(orderId, orderData, opts = {}) {
  const targetId = mirrorDocId(orderId);
  const targetRef = db().collection("salesOrders").doc(targetId);
  const existing = await targetRef.get();
  const payload = buildMirrorPayload(orderId, orderData);
  const sourceCreatedAt = payload.__sourceCreatedAt || null;
  delete payload.__sourceCreatedAt;
  const createdAtValue = sourceCreatedAt || nowTs();

  if (existing.exists) {
    const cur = existing.data() || {};
    if (cur.mirrorSource && cur.mirrorSource !== "Orders") {
      logger.warn(`[salesOrdersSync] skip mirror (target has different mirrorSource)`, {orderId, mirrorSource: cur.mirrorSource});
      return {action: "skipped", reason: "mirror-source-mismatch"};
    }
    const writePayload = {...payload};
    // 預設保留既有 createdAt;forceCreatedAt=true 時用推導值覆寫
    if (opts.forceCreatedAt && sourceCreatedAt) {
      writePayload.createdAt = sourceCreatedAt;
    }
    await targetRef.set(writePayload, {merge: true});
    return {action: "updated"};
  }

  await targetRef.set({
    ...payload,
    createdAt: createdAtValue,
  });
  return {action: "created"};
}

// ─── trigger: Orders/{id} write → salesOrders/legacy_{id} ──────────────────

const onLegacyOrderWritten = onDocumentWritten(
    {document: "Orders/{orderId}", region: REGION},
    async (event) => {
      const orderId = event.params.orderId;
      const before = event.data?.before?.data() || null;
      const after = event.data?.after?.data() || null;

      // 刪除:標記 mirrorDeleted 而不真刪 (避免毀掉 installTasks 參照)
      if (!after) {
        const targetRef = db().collection("salesOrders").doc(mirrorDocId(orderId));
        const exists = await targetRef.get();
        if (exists.exists) {
          await targetRef.update({
            mirrorDeleted: true,
            updatedAt: nowTs(),
            updatedByUid: "system",
          });
          logger.info(`[salesOrdersSync] marked mirror deleted`, {orderId});
        }
        return;
      }

      // 略過完全沒變動的寫入 (避免自家鏡像 trigger 自己;但這 trigger 只看 Orders,不會自觸發)
      if (before) {
        const sameRelevant = ["status", "狀態", "施工狀態", "installDate", "安裝日", "customerName", "客戶名稱",
          "orderNumber", "訂單號碼", "installAddress", "安裝地點", "contactPhone", "電話"]
            .every((k) => JSON.stringify(before[k] || null) === JSON.stringify(after[k] || null));
        if (sameRelevant) {
          logger.debug(`[salesOrdersSync] skip (no relevant field changed)`, {orderId});
          return;
        }
      }

      try {
        const result = await writeMirror(orderId, after);
        logger.info(`[salesOrdersSync] mirror ${result.action}`, {orderId});
      } catch (err) {
        logger.error(`[salesOrdersSync] mirror failed`, {orderId, error: err?.message || String(err)});
        throw err;
      }
    },
);

// ─── onCall: 一次性回填 ────────────────────────────────────────────────────

const backfillSalesOrdersFromOrders = onCall(
    {region: REGION, maxInstances: 5, timeoutSeconds: 540},
    async (req) => {
      if (!req.auth?.uid) {
        throw new HttpsError("unauthenticated", "請先登入");
      }
      const userSnap = await db().collection("Users").doc(req.auth.uid).get();
      const role = String(userSnap.data()?.role || "").trim();
      if (role !== "admin" && role !== "管理者") {
        throw new HttpsError("permission-denied", "需要 admin/管理者 權限");
      }

      const dryRun = req.data?.dryRun === true;
      const limit = Math.max(1, Math.min(5000, Number(req.data?.limit || 1000)));
      const onlyMissing = req.data?.onlyMissing !== false; // 預設只回填還沒鏡像過的
      // 強制覆蓋:即使已存在也重寫(會用來源推導的 createdAt 覆寫既有 createdAt)
      const forceCreatedAt = req.data?.forceCreatedAt === true;

      const snap = await db().collection("Orders").limit(limit).get();
      let created = 0; let updated = 0; let skipped = 0; let failed = 0;
      const errors = [];

      for (const d of snap.docs) {
        const orderId = d.id;
        try {
          if (onlyMissing && !forceCreatedAt) {
            const targetSnap = await db().collection("salesOrders").doc(mirrorDocId(orderId)).get();
            if (targetSnap.exists) {
              skipped += 1;
              continue;
            }
          }
          if (dryRun) {
            created += 1;
            continue;
          }
          const result = await writeMirror(orderId, d.data() || {}, {forceCreatedAt});
          if (result.action === "created") created += 1;
          else if (result.action === "updated") updated += 1;
          else skipped += 1;
        } catch (err) {
          failed += 1;
          errors.push({orderId, error: err?.message || String(err)});
          if (errors.length > 20) errors.length = 20;
        }
      }

      const summary = {
        scanned: snap.size,
        created, updated, skipped, failed,
        dryRun, onlyMissing, forceCreatedAt, limit,
        errors: errors.slice(0, 20),
      };
      logger.info(`[salesOrdersSync] backfill done`, summary);
      return summary;
    },
);

// ─── onCall: 清除 legacy 鏡像 ──────────────────────────────────────────────
// 把 salesOrders 裡所有 mirrorSource === 'Orders' 的文件刪掉
// 用途:回填過程造成 createdAt 全部變成今天,污染 OrdersView;清掉後可重新由
// trigger / backfill 重建 (新版會以來源 createdAt 寫入)
const purgeLegacyMirroredSalesOrders = onCall(
    {region: REGION, maxInstances: 2, timeoutSeconds: 540},
    async (req) => {
      if (!req.auth?.uid) {
        throw new HttpsError("unauthenticated", "請先登入");
      }
      const userSnap = await db().collection("Users").doc(req.auth.uid).get();
      const role = String(userSnap.data()?.role || "").trim();
      if (role !== "admin" && role !== "管理者") {
        throw new HttpsError("permission-denied", "需要 admin/管理者 權限");
      }

      const dryRun = req.data?.dryRun === true;
      const limit = Math.max(1, Math.min(10000, Number(req.data?.limit || 5000)));

      const snap = await db().collection("salesOrders")
          .where("mirrorSource", "==", "Orders")
          .limit(limit)
          .get();

      let deleted = 0; let failed = 0;
      const errors = [];

      if (!dryRun) {
        // 分批 batch 刪除 (Firestore 單 batch 上限 500)
        const docs = snap.docs;
        for (let i = 0; i < docs.length; i += 400) {
          const chunk = docs.slice(i, i + 400);
          const batch = db().batch();
          chunk.forEach((d) => batch.delete(d.ref));
          try {
            await batch.commit();
            deleted += chunk.length;
          } catch (err) {
            failed += chunk.length;
            errors.push({batchStart: i, error: err?.message || String(err)});
            if (errors.length > 20) errors.length = 20;
          }
        }
      }

      const summary = {
        scanned: snap.size,
        deleted: dryRun ? 0 : deleted,
        wouldDelete: dryRun ? snap.size : undefined,
        failed,
        dryRun, limit,
        errors: errors.slice(0, 20),
      };
      logger.info(`[salesOrdersSync] purge done`, summary);
      return summary;
    },
);

module.exports = {
  onLegacyOrderWritten,
  backfillSalesOrdersFromOrders,
  purgeLegacyMirroredSalesOrders,
  // 內部 helper (測試用)
  _internal: {normalizeYmd, mapStatus, buildMirrorPayload, mirrorDocId},
};
