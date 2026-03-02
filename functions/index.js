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
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
});

// Callable function: search by multiple fields (AND)
exports.searchOrdersByFields = onCall(async (payload, ctx) => {
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
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
});

// Callable function: search by multiple keywords (交集 AND)
exports.searchOrdersByKeywords = onCall(async (payload, ctx) => {
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
  return docs;
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
