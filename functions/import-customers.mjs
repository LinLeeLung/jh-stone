#!/usr/bin/env node
/**
 * 匯入客戶資料到 Firestore customers collection
 *
 * 使用 (在 functions/ 目錄下):
 *   node import-customers.mjs --creds=sa.json          (dry-run)
 *   node import-customers.mjs --creds=sa.json --apply  (正式寫入)
 *
 * 資料來源: data/parsed/customers.json
 *
 * Firestore 結構:
 *   customers/{code} → { code, originalCode, name, phone?, fax?, notes?, taxId?, importBatch, updatedAt }
 *   文件 ID = code (客戶代號，"/" 已換成 "-")
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

const __dirname = dirname(fileURLToPath(import.meta.url));
const INPUT = resolve(__dirname, "../data/parsed/customers.json");
const IMPORT_BATCH = "2026-05-23-customers-raw";

const credsArg = process.argv.find((a) => a.startsWith("--creds="));
if (!credsArg) {
  console.error(
    "請指定 --creds=<服務帳戶JSON路徑>，例如:\n  node import-customers.mjs --creds=sa.json --apply",
  );
  process.exit(1);
}
const credsPath = resolve(process.cwd(), credsArg.slice(8));
const serviceAccount = JSON.parse(readFileSync(credsPath, "utf8"));

const DRY_RUN = !process.argv.includes("--apply");
if (DRY_RUN)
  console.log("[Dry-run] 不會寫入 Firestore，加上 --apply 才正式執行\n");

if (!getApps().length) {
  initializeApp({ credential: cert(serviceAccount), projectId: "jh-stone" });
}
const db = getFirestore();

const records = JSON.parse(readFileSync(INPUT, "utf8"));
const valid = records.filter((r) => r.code && String(r.code).trim());

console.log(`讀取 ${valid.length} 筆客戶`);

if (DRY_RUN) {
  const withPhone = valid.filter((r) => r.phone).length;
  const withFax = valid.filter((r) => r.fax).length;
  const withNotes = valid.filter((r) => r.notes).length;
  const withTaxId = valid.filter((r) => r.taxId).length;
  console.log(`  有電話: ${withPhone}`);
  console.log(`  有傳真: ${withFax}`);
  console.log(`  有備註: ${withNotes}`);
  console.log(`  有統編: ${withTaxId}`);
  console.log("\n前 5 筆預覽:");
  valid
    .slice(0, 5)
    .forEach((r) => console.log(`  ${r.code} | ${r.name} | ${r.phone || ""}`));
  console.log("\n加上 --apply 開始正式寫入");
  process.exit(0);
}

console.log("開始寫入 Firestore...");
const now = Timestamp.now();
let written = 0;

for (let i = 0; i < valid.length; i += 400) {
  const chunk = valid.slice(i, i + 400);
  const batch = db.batch();

  for (const record of chunk) {
    // Firestore 不允許 "/" 在 doc ID，改用 "-"
    const docId = String(record.code).trim().replace(/\//g, "-");
    const ref = db.collection("customers").doc(docId);

    const payload = { importBatch: IMPORT_BATCH, updatedAt: now };
    for (const [k, v] of Object.entries(record)) {
      if (v !== undefined && v !== null && v !== "") payload[k] = v;
    }

    batch.set(ref, payload, { merge: true });
  }

  await batch.commit();
  written += chunk.length;
  console.log(`  已寫入 ${written}/${valid.length}`);
}

console.log("完成！");
