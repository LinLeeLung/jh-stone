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

function toYmd(input) {
  if (!input) return null;
  if (typeof input?.toDate === "function") {
    try {
      return toYmd(input.toDate());
    } catch (_) {
      return null;
    }
  }
  if (input instanceof Date) {
    if (Number.isNaN(input.getTime())) return null;
    const y = input.getFullYear();
    const m = String(input.getMonth() + 1).padStart(2, "0");
    const d = String(input.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  if (typeof input === "object" && Number.isFinite(Number(input.seconds))) {
    return toYmd(new Date(Number(input.seconds) * 1000));
  }
  if (typeof input === "number") {
    return toYmd(new Date(input));
  }
  const raw = String(input).trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  if (/^\d{8}$/.test(raw)) {
    return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
  }
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : toYmd(date);
}

const sa = loadServiceAccount();
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

const snap = await db.collection("salesOrders").get();
let updated = 0;
let skipped = 0;
let noCreatedAt = 0;
let batch = db.batch();
let ops = 0;

for (const doc of snap.docs) {
  const data = doc.data() || {};
  const orderNo = String(data.orderNo || "").trim();
  const orderedAt = String(data.orderedAt || "").trim();
  if (!orderNo || orderedAt) {
    skipped += 1;
    continue;
  }

  const derived = toYmd(data.createdAt);
  if (!derived) {
    noCreatedAt += 1;
    continue;
  }

  batch.update(doc.ref, { orderedAt: derived });
  updated += 1;
  ops += 1;

  if (ops === 400) {
    await batch.commit();
    batch = db.batch();
    ops = 0;
  }
}

if (ops > 0) await batch.commit();

console.log(JSON.stringify({
  total: snap.size,
  updated,
  skipped,
  noCreatedAt,
}, null, 2));