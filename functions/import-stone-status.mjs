#!/usr/bin/env node
/**
 * 匯入石材庫存狀態到 Firestore stoneStatus collection
 *
 * 使用 (在 functions/ 目錄下):
 *   node import-stone-status.mjs --creds=sa.json          (dry-run，只顯示不寫入)
 *   node import-stone-status.mjs --creds=sa.json --apply  (正式寫入)
 *
 * sa.json: Firebase Console → 專案設定 → 服務帳號 → 產生新的私密金鑰
 *   https://console.firebase.google.com/project/jh-stone/settings/serviceaccounts/adminsdk
 *
 * 資料來源: data/parsed/stone-status.json
 *   格式: { "CS-601": { status, note? }, ... }
 *
 * Firestore 結構:
 *   stoneStatus/{colorCode} → { status, note?, updatedAt }
 *   status 值: stockOut | preOrder | discontinued | lastStock | problematic
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

const __dirname = dirname(fileURLToPath(import.meta.url));
const INPUT = resolve(__dirname, "../data/parsed/stone-status.json");

const credsArg = process.argv.find((a) => a.startsWith("--creds="));
if (!credsArg) {
  console.error(
    "請指定 --creds=<服務帳戶JSON路徑>，例如:\n  node import-stone-status.mjs --creds=sa.json --apply",
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

const data = JSON.parse(readFileSync(INPUT, "utf8"));
const entries = Object.entries(data);

console.log(`讀取 ${entries.length} 筆石材狀態`);
if (DRY_RUN) {
  console.log("前 5 筆預覽:");
  entries
    .slice(0, 5)
    .forEach(([k, v]) => console.log(`  ${k} →`, JSON.stringify(v)));
  console.log("\n加上 --apply 開始正式寫入");
  process.exit(0);
}

console.log("開始寫入 Firestore...");
const now = Timestamp.now();
let written = 0;

// 每批最多 400 筆
for (let i = 0; i < entries.length; i += 400) {
  const chunk = entries.slice(i, i + 400);
  const batch = db.batch();

  for (const [colorCode, val] of chunk) {
    const ref = db.collection("stoneStatus").doc(colorCode);
    const payload = { status: val.status, updatedAt: now };
    if (val.note) payload.note = val.note;
    batch.set(ref, payload, { merge: true });
  }

  await batch.commit();
  written += chunk.length;
  console.log(`  已寫入 ${written}/${entries.length}`);
}

console.log("完成！");
