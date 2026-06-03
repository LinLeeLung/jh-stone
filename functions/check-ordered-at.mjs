import admin from "firebase-admin";
import fs from "node:fs";

function loadServiceAccount() {
  const candidates = ["./sa.json", "./sa.json.json"];
  for (const candidate of candidates) {
    if (!fs.existsSync(new URL(candidate, import.meta.url))) continue;
    return JSON.parse(fs.readFileSync(new URL(candidate, import.meta.url), "utf8"));
  }
  throw new Error("Missing service account file: sa.json");
}

const sa = loadServiceAccount();
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

async function summarize(collectionName, legacyField) {
  const snap = await db.collection(collectionName).get();
  let missingOrderedAt = 0;
  let legacyOnly = 0;
  for (const doc of snap.docs) {
    const data = doc.data() || {};
    const orderedAt = String(data.orderedAt || "").trim();
    const legacyValue = String(data[legacyField] || "").trim();
    if (!orderedAt) missingOrderedAt += 1;
    if (!orderedAt && legacyValue) legacyOnly += 1;
  }
  return { collectionName, total: snap.size, missingOrderedAt, legacyOnly };
}

console.log(JSON.stringify(await summarize("salesOrders", "orderDate"), null, 2));
console.log(JSON.stringify(await summarize("pendingOrders", "orderDate"), null, 2));