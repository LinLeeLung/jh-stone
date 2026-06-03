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

function pickFirst(src, keys) {
  for (const key of keys) {
    const value = src?.[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return value;
    }
  }
  return "";
}

function normalizeYmd(input) {
  if (!input) return null;
  if (input?.toDate) {
    try {
      return normalizeYmd(input.toDate());
    } catch (_) {
      return null;
    }
  }
  if (input instanceof Date) {
    if (Number.isNaN(input.getTime())) return null;
    const year = input.getFullYear();
    const month = String(input.getMonth() + 1).padStart(2, "0");
    const day = String(input.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  const raw = String(input).trim();
  if (!raw) return null;
  if (/^\d{8}$/.test(raw)) {
    return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
  }
  let match = raw.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (match) {
    return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
  }
  match = raw.match(/^(\d{2,3})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (match) {
    const year = Number(match[1]) + 1911;
    return `${year}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
  }
  return null;
}

function deriveOrderedAt(source = {}) {
  const raw = pickFirst(source, [
    "orderedAt",
    "下單日",
    "下單日期",
    "建單日",
    "建立日期",
    "建立時間",
    "createdAt",
    "createdTime",
  ]);
  return normalizeYmd(raw);
}

const sa = loadServiceAccount();
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

const snap = await db.collection("salesOrders")
  .where("mirrorSource", "==", "Orders")
  .get();

let updated = 0;
let missingSource = 0;
let noOrderedAt = 0;
let skipped = 0;
let batch = db.batch();
let ops = 0;

for (const doc of snap.docs) {
  const data = doc.data() || {};
  if (String(data.orderedAt || "").trim()) {
    skipped += 1;
    continue;
  }

  const sourceId = String(data.mirrorSourceId || "").trim();
  if (!sourceId) {
    missingSource += 1;
    continue;
  }

  const sourceSnap = await db.collection("Orders").doc(sourceId).get();
  if (!sourceSnap.exists) {
    missingSource += 1;
    continue;
  }

  const orderedAt = deriveOrderedAt(sourceSnap.data() || {});
  if (!orderedAt) {
    noOrderedAt += 1;
    continue;
  }

  batch.update(doc.ref, { orderedAt });
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
  totalMirrors: snap.size,
  updated,
  skipped,
  missingSource,
  noOrderedAt,
}, null, 2));