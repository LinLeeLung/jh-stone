#!/usr/bin/env node
/**
 * 刪除 Firestore customers collection 中的破損記錄
 * (code 看起來像電話號碼、含引號、或純數字尾碼)
 *
 * 使用:
 *   node cleanup-bad-customers.mjs --creds=sa.json          (dry-run，只列出)
 *   node cleanup-bad-customers.mjs --creds=sa.json --apply  (正式刪除)
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const credsArg = process.argv.find((a) => a.startsWith("--creds="));
if (!credsArg) {
  console.error("請指定 --creds=<路徑>，例如:\n  node cleanup-bad-customers.mjs --creds=sa.json");
  process.exit(1);
}
const credsPath = resolve(process.cwd(), credsArg.slice(8));
const serviceAccount = JSON.parse(readFileSync(credsPath, "utf8"));

const DRY_RUN = !process.argv.includes("--apply");
if (DRY_RUN) console.log("[Dry-run] 加上 --apply 才正式刪除\n");

if (!getApps().length) {
  initializeApp({ credential: cert(serviceAccount), projectId: "jh-stone" });
}
const db = getFirestore();

/** 判斷是否為破損 docId */
function isBadId(id) {
  // 以電話號碼格式開頭: 02-xxx, 03-xxx, 04-xxx, 07-xxx, 0x-xxx
  if (/^\d{2}-\d/.test(id)) return true;
  // 以手機號碼開頭: 09xx
  if (/^09\d{2}/.test(id)) return true;
  // 包含引號
  if (id.includes('"')) return true;
  // 純 8 位數字（漏掉連字符的電話）
  if (/^\d{8}"?$/.test(id)) return true;
  return false;
}

console.log("讀取 customers collection...");
const snapshot = await db.collection("customers").get();
const allDocs = snapshot.docs;
console.log(`共 ${allDocs.length} 筆`);

const badDocs = allDocs.filter((d) => isBadId(d.id));
console.log(`\n找到 ${badDocs.length} 筆破損記錄:`);
badDocs.forEach((d) => {
  const { name, phone } = d.data();
  console.log(`  [${d.id}] name="${name ?? ""}" phone="${phone ?? ""}"`);
});

if (badDocs.length === 0) {
  console.log("沒有需要清理的記錄。");
  process.exit(0);
}

if (DRY_RUN) {
  console.log("\n加上 --apply 開始正式刪除");
  process.exit(0);
}

console.log("\n開始刪除...");
for (let i = 0; i < badDocs.length; i += 400) {
  const chunk = badDocs.slice(i, i + 400);
  const batch = db.batch();
  chunk.forEach((d) => batch.delete(d.ref));
  await batch.commit();
  console.log(`  已刪除 ${Math.min(i + 400, badDocs.length)}/${badDocs.length}`);
}
console.log("清理完成！");
