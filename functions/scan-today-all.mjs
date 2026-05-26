import admin from "firebase-admin";
import fs from "node:fs";
const sa = JSON.parse(fs.readFileSync(new URL("./sa.json.json", import.meta.url)));
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

const start = new Date(); start.setHours(0,0,0,0);
const end = new Date(); end.setHours(23,59,59,999);
console.log("Range:", start.toISOString(), "→", end.toISOString());

for (const col of ["salesOrders", "Orders"]) {
  for (const field of ["createdAt","updatedAt","importedAt","sourceUpdatedAt","mirroredAt"]) {
    try {
      const snap = await db.collection(col)
        .where(field, ">=", admin.firestore.Timestamp.fromDate(start))
        .where(field, "<=", admin.firestore.Timestamp.fromDate(end))
        .get();
      if (snap.size) {
        console.log(`${col}.${field} = ${snap.size}`);
        snap.docs.slice(0,5).forEach(d => {
          const x = d.data();
          console.log("  -", d.id, "orderNo=", x.orderNo, "customer=", x.customerName || x["客戶名稱"], "src=", x._source || x.mirrorSource);
        });
      }
    } catch (e) {
      console.log(`${col}.${field} err: ${e.message}`);
    }
  }
}
process.exit(0);
