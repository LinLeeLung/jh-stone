import admin from "firebase-admin";
import fs from "node:fs";
const sa = JSON.parse(fs.readFileSync(new URL("./sa.json.json", import.meta.url)));
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

const snap = await db.collection("salesOrders").get();
const mine = snap.docs.filter((d) => {
  const x = d.data();
  return x.importedFromExcel !== true && !x.mirrorSource;
});
console.log("non-import / non-mirror count:", mine.length);
mine.forEach((d) => {
  const x = d.data();
  const ts = x.createdAt?.toDate ? x.createdAt.toDate().toISOString() : "-";
  console.log("-", d.id, "| orderNo=", x.orderNo, "| customer=", x.customerName, "| status=", x.status, "| createdAt=", ts);
});
process.exit(0);
