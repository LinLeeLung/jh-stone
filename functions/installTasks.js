/**
 * 派車模組（installTasks）Cloud Functions
 * ─────────────────────────────────────
 * 對應 docs/ERP-架構規劃.md §3.6
 *
 * 提供：
 *   1. nextInstallTaskNo(dateStr)          - 產生 T{yymmdd}-{nn} 序號
 *   2. createInstallTask (onCall)          - 維修組手動建立 / 從 salesOrders 轉檔
 *   3. nightlySyncInstallTasks (schedule)  - 每晚 22:00 掃 salesOrders 自動建立
 *   4. onInstallTaskWritten (firestore)    - 狀態轉換副作用
 *        - completed (install) → salesOrders.installedAt + status='installed'
 *        - completed + chargeable → 自動建立維修 salesOrders
 *        - partial → 自動複製 pending 後續任務 (tripNo+1)
 *        - cancelled (同日) → 自動複製 pending
 *        - assignedCrew 變動 → 寫入 crewChangeLog[]
 */

const admin = require("firebase-admin");
const {onCall, HttpsError} = require("firebase-functions/v2/https");
const {onDocumentWritten} = require("firebase-functions/v2/firestore");
const {onSchedule} = require("firebase-functions/v2/scheduler");
const {logger} = require("firebase-functions/v2");

const REGION = "asia-east1";
const TZ = "Asia/Taipei";
const STAFF_ROLES = new Set(["admin", "管理者", "員工"]);
const SERVICE_OK_ROLES = new Set(["admin", "管理者", "員工"]);
const RECEIVABLE_PAYMENT_METHOD_OPTIONS = ["transfer", "check", "cutTicketDeduction"];

// ─── 共用 helper ────────────────────────────────────────────────────────────

function db() {
  return admin.firestore();
}

function nowTs() {
  return admin.firestore.FieldValue.serverTimestamp();
}

function coerceJsDate(input) {
  if (!input) return null;
  if (input instanceof Date) return Number.isNaN(input.getTime()) ? null : input;
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
    const normalized = /^\d{4}-\d{2}-\d{2}$/.test(raw)
      ? `${raw}T00:00:00`
      : raw;
    const date = new Date(normalized);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof input === "number") {
    const date = new Date(input);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

function formatMonthKey(date) {
  const source = coerceJsDate(date);
  if (!source) return "";
  return `${source.getFullYear()}-${String(source.getMonth() + 1).padStart(2, "0")}`;
}

function normalizeCustomerReceivableSettings(customer = {}) {
  const allowedMethods = Array.isArray(customer.paymentMethodsAllowed)
    ? customer.paymentMethodsAllowed
        .map((method) => String(method || "").trim())
        .filter(Boolean)
    : [];

  return {
    billingCycleType:
      customer.billingCycleType === "monthEnd" || customer.billingCycleType === "installCompleted"
        ? customer.billingCycleType
        : "cutoff25",
    invoicePreference:
      customer.invoicePreference === "required" || customer.invoicePreference === "none"
        ? customer.invoicePreference
        : "optional",
    paymentTerms: String(customer.paymentTerms || "").trim(),
    paymentMethodsAllowed: allowedMethods.length
      ? allowedMethods
      : RECEIVABLE_PAYMENT_METHOD_OPTIONS,
  };
}

function computeReceivableBillingMonth(dateInput, cycleType = "cutoff25") {
  const date = coerceJsDate(dateInput);
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
  return formatMonthKey(result);
}

function normalizeReceivableLineItems(order = {}) {
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
  return [{
    id: "main",
    category: "other",
    description: description || "訂單金額",
    unit: "式",
    qty: 1,
    unitPrice: baseAmount,
    amount: baseAmount,
    refId: null,
  }];
}

async function autoCreateReceivableItemForOrder(orderId) {
  const cleanOrderId = String(orderId || "").trim();
  if (!cleanOrderId) return {created: false, reason: "missing-order-id"};

  const orderRef = db().collection("salesOrders").doc(cleanOrderId);
  const itemRef = db().collection("accountsReceivableItems").doc(cleanOrderId);
  const [orderSnap, itemSnap] = await Promise.all([orderRef.get(), itemRef.get()]);
  if (!orderSnap.exists) return {created: false, reason: "order-not-found"};
  if (itemSnap.exists) return {created: false, reason: "item-exists"};

  const order = {id: orderSnap.id, ...orderSnap.data()};
  if (!order.customerId) return {created: false, reason: "missing-customer"};

  const customerSnap = await db().collection("customers").doc(order.customerId).get();
  const customer = customerSnap.exists ? {id: customerSnap.id, ...customerSnap.data()} : null;
  const settings = normalizeCustomerReceivableSettings(customer || {});
  if (settings.billingCycleType !== "installCompleted") {
    return {created: false, reason: "billing-cycle-not-install-completed"};
  }
  const installedAt = coerceJsDate(order.installedAt) || new Date();
  const lineItems = normalizeReceivableLineItems(order);
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
  const billingMonth = computeReceivableBillingMonth(installedAt, settings.billingCycleType);
  const billingReason = "安裝完工即請款";

  await itemRef.set({
    sourceOrderId: order.id,
    sourceOrderNo: order.orderNo || "",
    customerId: order.customerId || "",
    customerName: order.customerName || customer?.name || "",
    customerSnapshot: customer
      ? {
          id: customer.id,
          code: customer.code || customer.id,
          name: customer.name || "",
          taxId: customer.taxId || "",
          contactPerson: customer.contactPerson || "",
          phone: customer.phone || "",
          address: customer.address || "",
          billingCycleType: settings.billingCycleType,
          invoicePreference: settings.invoicePreference,
          paymentTerms: settings.paymentTerms,
          paymentMethodsAllowed: settings.paymentMethodsAllowed,
        }
      : null,
    billingMonth,
    billingCycleType: settings.billingCycleType,
    billingTriggerType: "installed",
    billingDate: admin.firestore.Timestamp.fromDate(installedAt),
    billingEligibleReason: billingReason,
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
      installedAt: order.installedAt || admin.firestore.Timestamp.fromDate(installedAt),
      createdAt: order.createdAt || null,
      subtotal: amountUntaxed,
      taxAmount,
      amountTotal,
      depositPaid: Number(order.depositPaid) || 0,
      paymentNotes: String(order.paymentNotes || "").trim(),
    },
    createdAt: nowTs(),
    createdByUid: "system",
    updatedAt: nowTs(),
    updatedByUid: "system",
  });

  await orderRef.set({
    billingEligible: true,
    billingTriggerType: "installed",
    billingEligibleReason: billingReason,
    receivableStatus: "pending",
    receivableTotal: amountTotal,
    receivedTotal: 0,
    balanceDue: amountTotal,
    updatedAt: nowTs(),
    updatedByUid: "system",
  }, {merge: true});

  return {created: true, amountTotal, billingMonth};
}

async function createAccountingNotification(task = {}, order = {}, receivableResult = {}) {
  const orderId = String(order.id || task.salesOrderId || "").trim();
  if (!orderId) return {created: false, reason: "missing-order-id"};

  const ref = db().collection("accountingNotifications").doc(`installCompleted_${orderId}`);
  const amountTotal = Number(receivableResult.amountTotal || order.grandTotal || order.total || 0) || 0;
  const message = [
    "安裝完工即請款",
    order.orderNo || task.salesOrderNo || orderId,
    order.customerName || task.customerName || "",
  ].filter(Boolean).join("｜");

  await ref.set({
    type: "installCompletedReceivable",
    status: "unread",
    title: "安裝完工請會計收款",
    message,
    salesOrderId: orderId,
    salesOrderNo: order.orderNo || task.salesOrderNo || "",
    taskId: task.id || "",
    taskNo: task.taskNo || "",
    customerId: order.customerId || task.customerId || "",
    customerName: order.customerName || task.customerName || "",
    siteAddress: order.siteAddress || task.siteAddress || "",
    amountTotal,
    billingMonth: receivableResult.billingMonth || "",
    createdAt: nowTs(),
    createdByUid: "system",
    updatedAt: nowTs(),
    updatedByUid: "system",
    readAt: null,
    readByUid: "",
  }, {merge: true});

  return {created: true, id: ref.id};
}

async function readUserProfile(uid) {
  if (!uid) return {};
  const snap = await db().collection("Users").doc(uid).get();
  return snap.exists ? snap.data() || {} : {};
}

async function readUserRole(uid) {
  const profile = await readUserProfile(uid);
  return String(profile.role || "").trim();
}

function isStaffRole(role) {
  return STAFF_ROLES.has(String(role || "").trim());
}

async function assertServiceRole(auth) {
  if (!auth?.uid) {
    throw new HttpsError("unauthenticated", "請先登入");
  }
  const profile = await readUserProfile(auth.uid);
  const role = String(profile.role || "").trim();
  // 2 裝安部門(維修=安裝同一群人):admin/管理者 永遠通過;員工/行動 須 dept == '2'
  if (role === "admin" || role === "管理者") return profile;
  if ((role === "員工" || role === "行動") && String(profile.dept || "") === "2") return profile;
  throw new HttpsError("permission-denied", "需要 2 裝安部門權限");
}

/** YYYYMMDD (Asia/Taipei) → yymmdd */
function ymdToYymmdd(ymd) {
  const s = String(ymd || "").replace(/[-/]/g, "");
  if (s.length !== 8) throw new Error(`bad date string: ${ymd}`);
  return s.slice(2);
}

function todayYmdInTaipei(d = new Date()) {
  // Force the Taipei calendar date
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const y = parts.find((p) => p.type === "year").value;
  const m = parts.find((p) => p.type === "month").value;
  const day = parts.find((p) => p.type === "day").value;
  return `${y}${m}${day}`;
}

/** Same as todayYmdInTaipei but YYYY-MM-DD (matches salesOrders.promisedAt) */
function todayDashYmdInTaipei(d = new Date()) {
  const ymd = todayYmdInTaipei(d);
  return `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
}

/** Normalize misc date input to YYYY-MM-DD; null on failure */
function normalizeDashYmd(input) {
  if (!input) return null;
  const s = String(input).trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  const m = s.match(/^(\d{4})[\/.](\d{1,2})[\/.](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  return null;
}

/**
 * 產生 T{yymmdd}-{NN} 序號（每日從 01 起算，使用 transaction 保證唯一）
 * @param {string} dateYmd - 'YYYYMMDD'
 * @returns {Promise<string>}
 */
async function nextInstallTaskNo(dateYmd) {
  const yymmdd = ymdToYymmdd(dateYmd);
  const counterId = `installTaskSeq_${yymmdd}`;
  const ref = db().collection("counters").doc(counterId);
  const seq = await db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const cur = snap.exists ? Number(snap.data()?.seq || 0) : 0;
    const next = cur + 1;
    tx.set(
        ref,
        {seq: next, updatedAt: nowTs()},
        {merge: true},
    );
    return next;
  });
  return `T${yymmdd}-${String(seq).padStart(2, "0")}`;
}

// ─── createInstallTask (onCall) ─────────────────────────────────────────────

/**
 * payload:
 * {
 *   sourceRef?: { kind: 'salesOrders'|'serviceTicket'|'manual', id?: string },
 *   salesOrderId?: string,        // 為轉檔時帶入
 *   kind: 'install'|'repair'|'remeasure'|'site_visit',
 *   priority?: 'normal'|'high'|'urgent',
 *   dueDate?: 'YYYY-MM-DD',
 *   customerId?: string,
 *   customerName?: string,
 *   contactName?: string,
 *   contactPhone?: string,
 *   siteAddress?: string,
 *   note?: string,
 *   bomFileUrl?: string,
 *   photoLinkUrl?: string,
 * }
 */
const createInstallTask = onCall({region: REGION, maxInstances: 10}, async (req) => {
  const profile = await assertServiceRole(req.auth);
  const uid = req.auth.uid;
  const p = req.data || {};

  const kind = String(p.kind || "install").trim();
  if (!["install", "repair", "remeasure", "site_visit"].includes(kind)) {
    throw new HttpsError("invalid-argument", `unknown kind: ${kind}`);
  }

  const today = todayYmdInTaipei();
  const taskNo = await nextInstallTaskNo(today);

  // 從 salesOrder 補資料（若有）
  let salesOrderSnap = null;
  if (p.salesOrderId) {
    salesOrderSnap = await db().collection("salesOrders").doc(p.salesOrderId).get();
    if (!salesOrderSnap.exists) {
      throw new HttpsError("not-found", `salesOrder not found: ${p.salesOrderId}`);
    }
  }
  const so = salesOrderSnap?.data() || {};

  const doc = {
    taskNo,
    kind,
    status: "pending",       // pending → scheduled → dispatched → in_progress → completed / partial / cancelled
    priority: p.priority || so.priority || "normal",
    tripNo: 1,

    sourceRef: p.sourceRef || (p.salesOrderId ?
      {kind: "salesOrders", id: p.salesOrderId} :
      {kind: "manual"}),
    salesOrderId: p.salesOrderId || null,
    salesOrderNo: so.orderNo || null,

    customerId: p.customerId || so.customerId || null,
    customerName: p.customerName || so.customerName || "",
    contactName: p.contactName || so.contactName || so.customerContact?.name || "",
    contactPhone: p.contactPhone || so.contactPhone || so.customerContact?.phone || "",
    siteAddress: p.siteAddress || so.siteAddress || "",

    dueDate: normalizeDashYmd(p.dueDate || so.promisedAt) || (p.dueDate || so.promisedAt || null),
    assignedDate: null,                              // 排程日（派車後）
    assignedCrew: [],                                // [uid,...]
    assignedVehicleId: null,
    crewChangeLog: [],

    bomFileUrl: p.bomFileUrl || so.bomFileUrl || "",
    photoLinkUrl: p.photoLinkUrl || so.photoLinkUrl || "",
    note: p.note || "",
    followUpNote: "",

    chargeable: false,           // 完工回報時可勾選；true 會自動建立維修 salesOrders
    chargeableNote: "",

    completionPhotos: [],        // 完工照片 metadata（細節存子集合）
    completedAt: null,
    completedByUid: null,

    createdAt: nowTs(),
    createdByUid: uid,
    createdByName: profile.displayName || profile.name || "",
    updatedAt: nowTs(),
    updatedByUid: uid,
  };

  const ref = await db().collection("installTasks").add(doc);
  logger.info(`installTasks created`, {taskNo, id: ref.id, kind, salesOrderId: p.salesOrderId});
  return {id: ref.id, taskNo};
});

// ─── nightlySyncInstallTasks (scheduled) ────────────────────────────────────

/**
 * 核心邏輯：掃未來 daysAhead 天內 status='done' 且未建任務的 salesOrders，
 * 自動建立 kind='install' 的 pending 任務。供排程、手動觸發共用。
 */
async function runNightlySyncCore({daysAhead = 7, dryRun = false} = {}) {
  const startDash = todayDashYmdInTaipei();
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + Number(daysAhead || 7));
  const endDash = todayDashYmdInTaipei(endDate);

  const snap = await db()
      .collection("salesOrders")
      .where("status", "==", "done")
      .where("promisedAt", ">=", startDash)
      .where("promisedAt", "<=", endDash)
      .get();

  let created = 0;
  let skipped = 0;
  const createdTasks = [];
  for (const d of snap.docs) {
    const so = d.data() || {};
    if (so.installTaskCreated === true) {
      skipped += 1;
      continue;
    }
    if (dryRun) {
      created += 1;
      createdTasks.push({salesOrderId: d.id, customerName: so.customerName || "", promisedAt: so.promisedAt || ""});
      continue;
    }
    const today = todayYmdInTaipei();
    const taskNo = await nextInstallTaskNo(today);
    const taskRef = db().collection("installTasks").doc();
    const batch = db().batch();
    batch.set(taskRef, {
      taskNo,
      kind: "install",
      status: "pending",
      priority: so.priority || "normal",
      tripNo: 1,
      sourceRef: {kind: "salesOrders", id: d.id},
      salesOrderId: d.id,
      salesOrderNo: so.orderNo || null,
      customerId: so.customerId || null,
      customerName: so.customerName || "",
      contactName: so.contactName || so.customerContact?.name || "",
      contactPhone: so.contactPhone || so.customerContact?.phone || "",
      siteAddress: so.siteAddress || "",
      dueDate: normalizeDashYmd(so.promisedAt) || so.promisedAt || null,
      assignedDate: null,
      assignedCrew: [],
      assignedVehicleId: null,
      crewChangeLog: [],
      bomFileUrl: so.bomFileUrl || "",
      photoLinkUrl: so.photoLinkUrl || "",
      note: "",
      followUpNote: "",
      chargeable: false,
      chargeableNote: "",
      completionPhotos: [],
      completedAt: null,
      completedByUid: null,
      createdAt: nowTs(),
      createdByUid: "system",
      createdByName: "nightlySync",
      updatedAt: nowTs(),
      updatedByUid: "system",
    });
    batch.update(d.ref, {
      installTaskCreated: true,
      installTaskId: taskRef.id,
      installTaskNo: taskNo,
      updatedAt: nowTs(),
    });
    await batch.commit();
    created += 1;
    createdTasks.push({salesOrderId: d.id, taskId: taskRef.id, taskNo, customerName: so.customerName || ""});
  }
  logger.info(`nightlySyncInstallTasks core done`, {created, skipped, total: snap.size, dryRun});
  return {scanned: snap.size, created, skipped, dryRun, daysAhead, range: {start: startDash, end: endDash}, createdTasks};
}

/**
 * 每晚 22:00 (Asia/Taipei) 自動執行。
 */
const nightlySyncInstallTasks = onSchedule(
    {
      schedule: "0 22 * * *",
      timeZone: TZ,
      region: REGION,
    },
    async () => {
      await runNightlySyncCore({daysAhead: 7, dryRun: false});
    },
);

/**
 * 手動觸發。admin / 管理者 可呼叫。
 * payload: { daysAhead?: number (1–30), dryRun?: boolean }
 */
const runNightlySyncNow = onCall({region: REGION, maxInstances: 5}, async (req) => {
  if (!req.auth) throw new HttpsError("unauthenticated", "需要登入");
  const profile = await db().collection("Users").doc(req.auth.uid).get();
  const role = profile.exists ? String(profile.data()?.role || "") : "";
  if (role !== "admin" && role !== "管理者") {
    throw new HttpsError("permission-denied", "僅 admin / 管理者 可手動觸發夜班同步");
  }
  const daysAhead = Math.min(30, Math.max(1, Number(req.data?.daysAhead) || 7));
  const dryRun = req.data?.dryRun === true;
  return await runNightlySyncCore({daysAhead, dryRun});
});

// ─── onInstallTaskWritten (firestore trigger) ───────────────────────────────

/**
 * 處理狀態轉換的副作用。
 *
 * 注意：所有寫回本身 installTask 的動作（如 crewChangeLog）由前端負責；
 * 此 trigger 只處理「跨文件」的副作用，避免無限遞迴。
 */
const onInstallTaskWritten = onDocumentWritten(
    {
      document: "installTasks/{taskId}",
      region: REGION,
    },
    async (event) => {
      const before = event.data?.before?.data() || null;
      const after = event.data?.after?.data() || null;

      // 刪除事件不處理
      if (!after) return;

      const taskId = event.params.taskId;
      const prevStatus = before?.status || null;
      const nextStatus = after.status;

      // ── 1. 狀態變為 completed (install) → 回寫 salesOrders ────────────────
      if (
        prevStatus !== "completed" &&
      nextStatus === "completed" &&
      after.kind === "install" &&
      after.salesOrderId
      ) {
        try {
          const orderRef = db().collection("salesOrders").doc(after.salesOrderId);
          await orderRef.set(
              {
                installedAt: after.completedAt || nowTs(),
                installTaskCompletedAt: after.completedAt || nowTs(),
                status: "installed",
                warrantyStartedAt: after.completedAt || nowTs(),
                updatedAt: nowTs(),
              },
              {merge: true},
          );
          const orderSnap = await orderRef.get();
          const orderData = orderSnap.exists ? {id: orderSnap.id, ...orderSnap.data()} : {id: after.salesOrderId};
          logger.info(`installTask completed → salesOrder updated`, {
            taskId,
            salesOrderId: after.salesOrderId,
          });

          const receivableResult = await autoCreateReceivableItemForOrder(after.salesOrderId);
          logger.info(`installTask completed → auto receivable checked`, {
            taskId,
            salesOrderId: after.salesOrderId,
            receivableResult,
          });

          if (receivableResult.created) {
            const notificationResult = await createAccountingNotification(
                {id: taskId, ...after},
                orderData,
                receivableResult,
            );
            logger.info(`installTask completed → accounting notification created`, {
              taskId,
              salesOrderId: after.salesOrderId,
              notificationResult,
            });
          }
        } catch (err) {
          logger.error(`failed to update salesOrder on install completion`, {taskId, err});
        }
      }

      // ── 2. 完工 + chargeable=true → 自動建立維修 salesOrders ─────────────
      if (
        prevStatus !== "completed" &&
      nextStatus === "completed" &&
      after.chargeable === true
      ) {
        try {
          const repairSO = {
            orderNo: null, // 留空由 sales 後補
            sourceRef: {kind: "installTasks", id: taskId, taskNo: after.taskNo},
            kind: "repair",
            customerId: after.customerId || null,
            customerName: after.customerName || "",
            contactName: after.contactName || "",
            contactPhone: after.contactPhone || "",
            siteAddress: after.siteAddress || "",
            status: "pending",
            priority: "normal",
            note: `由派車任務 ${after.taskNo} 衍生的有償維修：${after.chargeableNote || ""}`,
            createdAt: nowTs(),
            createdByUid: "system",
            createdByName: "installTask-chargeable",
            updatedAt: nowTs(),
            updatedByUid: "system",
          };
          const ref = await db().collection("salesOrders").add(repairSO);
          await db().collection("installTasks").doc(taskId).set(
              {derivedRepairSalesOrderId: ref.id, updatedAt: nowTs()},
              {merge: true},
          );
          logger.info(`chargeable install → repair salesOrder created`, {
            taskId,
            repairSalesOrderId: ref.id,
          });
        } catch (err) {
          logger.error(`failed to create repair salesOrder`, {taskId, err});
        }
      }

      // ── 3. partial / cancelled-same-day → 自動複製 pending 任務 ───────────
      const needFollowUp =
      (prevStatus !== "partial" && nextStatus === "partial") ||
      (prevStatus !== "cancelled" &&
        nextStatus === "cancelled" &&
        after.assignedDate &&
        after.assignedDate === todayYmdInTaipei());

      if (needFollowUp && !after.followUpTaskId) {
        try {
          const today = todayYmdInTaipei();
          const taskNo = await nextInstallTaskNo(today);
          const cloneRef = db().collection("installTasks").doc();
          const batch = db().batch();
          batch.set(cloneRef, {
            taskNo,
            kind: after.kind,
            status: "pending",
            priority: after.priority || "normal",
            tripNo: (Number(after.tripNo) || 1) + 1,
            sourceRef: after.sourceRef || null,
            salesOrderId: after.salesOrderId || null,
            salesOrderNo: after.salesOrderNo || null,
            customerId: after.customerId || null,
            customerName: after.customerName || "",
            contactName: after.contactName || "",
            contactPhone: after.contactPhone || "",
            siteAddress: after.siteAddress || "",
            dueDate: null,
            assignedDate: null,
            assignedCrew: [],
            assignedVehicleId: null,
            crewChangeLog: [],
            bomFileUrl: after.bomFileUrl || "",
            photoLinkUrl: after.photoLinkUrl || "",
            note: after.note || "",
            followUpNote:
              nextStatus === "partial" ?
                `承接前次任務 ${after.taskNo} 未完成部分：${after.followUpNote || ""}` :
                `承接前次任務 ${after.taskNo} 當日取消：${after.followUpNote || ""}`,
            previousTaskId: taskId,
            chargeable: false,
            chargeableNote: "",
            completionPhotos: [],
            completedAt: null,
            completedByUid: null,
            createdAt: nowTs(),
            createdByUid: "system",
            createdByName: "auto-followUp",
            updatedAt: nowTs(),
            updatedByUid: "system",
          });
          batch.update(db().collection("installTasks").doc(taskId), {
            followUpTaskId: cloneRef.id,
            followUpTaskNo: taskNo,
            updatedAt: nowTs(),
          });
          await batch.commit();
          logger.info(`follow-up task auto-created`, {fromTaskId: taskId, newTaskId: cloneRef.id});
        } catch (err) {
          logger.error(`failed to create follow-up task`, {taskId, err});
        }
      }

      // ── 4. assignedCrew 變動 → 寫入 crewChangeLog (避免遞迴：只在差異時寫) ─
      const prevCrew = Array.isArray(before?.assignedCrew) ? before.assignedCrew : [];
      const nextCrew = Array.isArray(after.assignedCrew) ? after.assignedCrew : [];
      const crewChanged =
      prevCrew.length !== nextCrew.length ||
      prevCrew.some((u, i) => u !== nextCrew[i]);

      if (before && crewChanged) {
        const lastLog = Array.isArray(after.crewChangeLog) ?
          after.crewChangeLog[after.crewChangeLog.length - 1] :
          null;
        // 若前端剛剛已經寫過同樣的 log，跳過避免無限迴圈
        const alreadyLogged = lastLog &&
          JSON.stringify(lastLog.from) === JSON.stringify(prevCrew) &&
          JSON.stringify(lastLog.to) === JSON.stringify(nextCrew);
        if (!alreadyLogged) {
          try {
            await db().collection("installTasks").doc(taskId).update({
              crewChangeLog: admin.firestore.FieldValue.arrayUnion({
                from: prevCrew,
                to: nextCrew,
                changedAt: new Date(),
                changedByUid: after.updatedByUid || "system",
              }),
            });
          } catch (err) {
            logger.error(`failed to write crewChangeLog`, {taskId, err});
          }
        }
      }
    },
);

// ─── exports ────────────────────────────────────────────────────────────────

module.exports = {
  // 內部 helpers（測試 / 其他模組用）
  _helpers: {
    nextInstallTaskNo,
    todayYmdInTaipei,
    isStaffRole,
    readUserRole,
  },
  // Cloud Functions（由 functions/index.js re-export）
  createInstallTask,
  nightlySyncInstallTasks,
  runNightlySyncNow,
  onInstallTaskWritten,
};
