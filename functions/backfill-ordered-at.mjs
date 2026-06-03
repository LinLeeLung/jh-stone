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

async function backfillCollection(collectionName, legacyField) {
  const snap = await db.collection(collectionName).get();
  let updated = 0;
  let skipped = 0;
  let batch = db.batch();
  let ops = 0;

  for (const doc of snap.docs) {
    const data = doc.data() || {};
    const orderedAt = String(data.orderedAt || "").trim();
    const legacyValue = String(data[legacyField] || "").trim();
    if (orderedAt || !legacyValue) {
      skipped += 1;
      continue;
    }

    batch.update(doc.ref, { orderedAt: legacyValue });
    updated += 1;
    ops += 1;

    if (ops === 400) {
      await batch.commit();
      batch = db.batch();
      ops = 0;
    }
  }

  if (ops > 0) await batch.commit();
  return { collectionName, updated, skipped, total: snap.size };
}

const results = [];
results.push(await backfillCollection("salesOrders", "orderDate"));
results.push(await backfillCollection("pendingOrders", "orderDate"));

for (const result of results) {
  console.log(
    `${result.collectionName}: updated=${result.updated}, skipped=${result.skipped}, total=${result.total}`,
  );
}