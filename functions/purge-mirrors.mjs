// Delete all salesOrders where mirrorSource == "Orders".
// Run AFTER functions deploy completes (so trigger is gone and won't re-create).
// Usage: node purge-mirrors.mjs
import admin from "firebase-admin";
import fs from "node:fs";
const sa = JSON.parse(fs.readFileSync(new URL("./sa.json.json", import.meta.url)));
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

const CHUNK = 400;
let total = 0;
while (true) {
  const snap = await db.collection("salesOrders")
    .where("mirrorSource", "==", "Orders")
    .limit(CHUNK)
    .get();
  if (snap.empty) break;
  const batch = db.batch();
  snap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
  total += snap.size;
  console.log(`deleted ${total}`);
  if (snap.size < CHUNK) break;
}
console.log("DONE. total deleted:", total);
process.exit(0);
