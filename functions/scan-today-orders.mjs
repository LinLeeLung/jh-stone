// Scan Orders updated/created today. Dry-run only: prints count + samples.
// Usage: node scan-today-orders.mjs
import admin from "firebase-admin";
import fs from "node:fs";

const sa = JSON.parse(fs.readFileSync(new URL("./sa.json.json", import.meta.url)));
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

const start = new Date();
start.setHours(0, 0, 0, 0);
const end = new Date();
end.setHours(23, 59, 59, 999);
console.log("Range:", start.toISOString(), "→", end.toISOString());

async function scanByField(field) {
  try {
    const snap = await db.collection("Orders")
      .where(field, ">=", admin.firestore.Timestamp.fromDate(start))
      .where(field, "<=", admin.firestore.Timestamp.fromDate(end))
      .get();
    console.log(`[${field}] matched: ${snap.size}`);
    snap.docs.slice(0, 5).forEach((d) => {
      const x = d.data();
      console.log("  -", d.id, "| orderNo=", x.orderNo || x["訂單號碼"], "| 安裝日=", x["安裝日"]);
    });
    return snap.size;
  } catch (e) {
    console.log(`[${field}] error: ${e.message}`);
    return 0;
  }
}

await scanByField("updatedAt");
await scanByField("sourceUpdatedAt");
await scanByField("createdAt");
await scanByField("importedAt");

process.exit(0);
