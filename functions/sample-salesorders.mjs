import admin from "firebase-admin";
import fs from "node:fs";
const sa = JSON.parse(fs.readFileSync(new URL("./sa.json.json", import.meta.url)));
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

const snap = await db.collection("salesOrders").limit(3).get();
snap.docs.forEach((d) => {
  console.log("=== id:", d.id);
  console.log(JSON.stringify(d.data(), null, 2));
});
process.exit(0);
