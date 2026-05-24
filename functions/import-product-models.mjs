#!/usr/bin/env node
/**
 * 匯入產品型錄到 Firestore productModels collection
 *
 * 使用 (在 functions/ 目錄下):
 *   node import-product-models.mjs --creds=sa.json          (dry-run)
 *   node import-product-models.mjs --creds=sa.json --apply  (正式寫入)
 *
 * 資料來源: data/parsed/parsed-ok.json (1744 筆)
 *
 * Firestore 結構:
 *   productModels/{model} → { model, type, rawText, needsReview, importBatch, ...尺寸欄位 }
 *   文件 ID = model (型號)，如 "TID-7040"
 *
 * type 值: stove | sink | hood | accessory
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

const __dirname = dirname(fileURLToPath(import.meta.url));
const INPUT = resolve(__dirname, "../data/parsed/parsed-ok.json");
const IMPORT_BATCH = "2026-05-23-products-raw";

const credsArg = process.argv.find((a) => a.startsWith("--creds="));
if (!credsArg) {
  console.error(
    "請指定 --creds=<服務帳戶JSON路徑>，例如:\n  node import-product-models.mjs --creds=sa.json --apply",
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

// 過濾掉沒有 model 的資料 (理論上 parsed-ok 不應有)
const valid = records.filter((r) => r.model && String(r.model).trim());

console.log(`讀取 ${valid.length} 筆產品型錄`);

if (DRY_RUN) {
  // 統計各 type 數量
  const counts = {};
  for (const r of valid) counts[r.type] = (counts[r.type] || 0) + 1;
  console.log("類型分佈:");
  Object.entries(counts).forEach(([t, n]) => console.log(`  ${t}: ${n}`));
  console.log("\n前 5 筆預覽:");
  valid
    .slice(0, 5)
    .forEach((r) => console.log(`  ${r.model} (${r.type}) →`, r.rawText));
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
    // Firestore 不允許 "/" 在 doc ID（會被視為子集合路徑），改用 "-"
    const docId = String(record.model).trim().replace(/\//g, "-");
    const ref = db.collection("productModels").doc(docId);

    // 只保留有值的欄位，不存 undefined/null
    const payload = { importBatch: IMPORT_BATCH, updatedAt: now };
    for (const [k, v] of Object.entries(record)) {
      if (v !== undefined && v !== null) payload[k] = v;
    }

    batch.set(ref, payload, { merge: true });
  }

  await batch.commit();
  written += chunk.length;
  console.log(`  已寫入 ${written}/${valid.length}`);
}

console.log("完成！");
