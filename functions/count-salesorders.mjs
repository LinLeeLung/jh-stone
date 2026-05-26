import admin from "firebase-admin";
import fs from "node:fs";
const sa = JSON.parse(fs.readFileSync(new URL("./sa.json.json", import.meta.url)));
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

const snap = await db.collection("salesOrders").get();
console.log("salesOrders total:", snap.size);
snap.docs.forEach((d) => {
  const x = d.data();
  console.log("-", d.id, "| orderNo=", x.orderNo, "| customer=", x.customerName || x["客戶名稱"], "| mirrorSource=", x.mirrorSource || "-");
});
process.exit(0);
