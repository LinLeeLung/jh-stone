import admin from "firebase-admin";
import fs from "node:fs";

function loadServiceAccount() {
  const candidates = ["./sa.json", "./sa.json.json"];
  for (const candidate of candidates) {
    const url = new URL(candidate, import.meta.url);
    if (!fs.existsSync(url)) continue;
    return JSON.parse(fs.readFileSync(url, "utf8"));
  }
  throw new Error("Missing service account file: sa.json");
}

const sa = loadServiceAccount();
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

const orderNo = String(process.argv[2] || "").trim();
if (!orderNo) {
  console.error("Usage: node inspect-order-date-fields.mjs <orderNo>");
  process.exit(1);
}

async function dumpCollection(collectionName, fieldName) {
  const snap = await db.collection(collectionName).where(fieldName, "==", orderNo).get();
  console.log(`== ${collectionName} (${fieldName}) count=${snap.size}`);
  for (const doc of snap.docs) {
    const data = doc.data() || {};
    console.log(JSON.stringify({
      id: doc.id,
      mirrorSource: data.mirrorSource || null,
      mirrorSourceId: data.mirrorSourceId || null,
      orderNo: data.orderNo || data["訂單號碼"] || null,
      orderedAt: data.orderedAt || null,
      orderDate: data.orderDate || null,
      createdAt: data.createdAt || null,
      promisedAt: data.promisedAt || data["安裝日"] || null,
      下單日: data["下單日"] || null,
      下單日期: data["下單日期"] || null,
      建單日: data["建單日"] || null,
      建立日期: data["建立日期"] || null,
      建立時間: data["建立時間"] || null,
    }, null, 2));
  }
}

await dumpCollection("salesOrders", "orderNo");
await dumpCollection("Orders", "訂單號碼");