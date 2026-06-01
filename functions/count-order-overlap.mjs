import admin from "firebase-admin";
import fs from "node:fs";

const sa = JSON.parse(fs.readFileSync(new URL("./sa.json.json", import.meta.url)));
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

const [salesOrdersSnap, ordersSnap] = await Promise.all([
  db.collection("salesOrders").get(),
  db.collection("Orders").get(),
]);

const salesOrderNos = new Set();
let salesOrdersWithOrderNo = 0;
for (const doc of salesOrdersSnap.docs) {
  const orderNo = String(doc.data()?.orderNo || "").trim();
  if (!orderNo) continue;
  salesOrderNos.add(orderNo);
  salesOrdersWithOrderNo += 1;
}

let ordersWithOrderNo = 0;
let duplicateOrderNos = 0;
const seenLegacyOrderNos = new Set();
for (const doc of ordersSnap.docs) {
  const data = doc.data() || {};
  const orderNo = String(
    data.orderNo || data["訂單號碼"] || data.orderNumber || data["訂單編號"] || "",
  ).trim();
  if (!orderNo) continue;
  ordersWithOrderNo += 1;
  if (seenLegacyOrderNos.has(orderNo)) continue;
  seenLegacyOrderNos.add(orderNo);
  if (salesOrderNos.has(orderNo)) duplicateOrderNos += 1;
}

console.log("salesOrders with orderNo:", salesOrdersWithOrderNo);
console.log("Orders with orderNo:     ", ordersWithOrderNo);
console.log("duplicate orderNos:      ", duplicateOrderNos);
process.exit(0);
