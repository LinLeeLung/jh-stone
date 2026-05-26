import admin from "firebase-admin";
import fs from "node:fs";
const sa = JSON.parse(fs.readFileSync(new URL("./sa.json.json", import.meta.url)));
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

const so = await db.collection("salesOrders").count().get();
const od = await db.collection("Orders").count().get();
console.log("salesOrders:", so.data().count);
console.log("Orders:     ", od.data().count);
process.exit(0);
