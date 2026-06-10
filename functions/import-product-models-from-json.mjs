#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

const arg = (name) => {
  const hit = process.argv.find((x) => x.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : "";
};

const inputArg = arg("input");
const credsArg = arg("creds");
const batchTag = arg("batch") || `manual-${new Date().toISOString().slice(0, 10)}`;
const apply = process.argv.includes("--apply");

if (!inputArg || !credsArg) {
  console.error("Usage: node import-product-models-from-json.mjs --input=<parsed-ok.json> --creds=<service-account.json> [--batch=tag] [--apply]");
  process.exit(1);
}

const inputPath = resolve(process.cwd(), inputArg);
const credsPath = resolve(process.cwd(), credsArg);
const records = JSON.parse(readFileSync(inputPath, "utf8"));
const serviceAccount = JSON.parse(readFileSync(credsPath, "utf8"));

if (!Array.isArray(records)) {
  console.error("Input must be a JSON array");
  process.exit(1);
}

console.log(`records: ${records.length}`);
if (!apply) {
  const byType = {};
  for (const r of records) byType[r.type || "unknown"] = (byType[r.type || "unknown"] || 0) + 1;
  console.log("dry-run type summary:", byType);
  console.log("Add --apply to write Firestore.");
  process.exit(0);
}

if (!getApps().length) {
  initializeApp({ credential: cert(serviceAccount), projectId: "jh-stone" });
}

const db = getFirestore();
const now = Timestamp.now();
let written = 0;

for (let i = 0; i < records.length; i += 400) {
  const chunk = records.slice(i, i + 400);
  const batch = db.batch();

  for (const rec of chunk) {
    const model = String(rec?.model || "").trim();
    if (!model) continue;
    const docId = model.replace(/\//g, "-");
    const ref = db.collection("productModels").doc(docId);
    const payload = { importBatch: batchTag, updatedAt: now };
    for (const [k, v] of Object.entries(rec)) {
      if (v !== undefined && v !== null) payload[k] = v;
    }
    batch.set(ref, payload, { merge: true });
    written += 1;
  }

  await batch.commit();
  console.log(`committed ${Math.min(i + 400, records.length)}/${records.length}`);
}

console.log(`done, upserted: ${written}`);
