#!/usr/bin/env node
/**
 * 解析石材庫存狀態 TSV → stone-status.json
 *
 * 使用:
 *   node scripts/parse-stone-status.mjs
 *
 * 輸出: data/parsed/stone-status.json
 *   格式: { "CS-601": { status: "problematic", note: "色差" }, ... }
 *
 * status 值:
 *   stockOut     — 缺貨 (暫時無貨)
 *   preOrder     — 期貨 (可訂但需等)
 *   discontinued — 停產 (永久下架)
 *   lastStock    — 售完為止
 *   problematic  — 問題色 (有品質注意事項)
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INPUT = path.resolve(__dirname, "../../data/raw/stone-status-raw.tsv");
const OUTPUT = path.resolve(__dirname, "../../data/parsed/stone-status.json");

const text = fs.readFileSync(INPUT, "utf8");
const rows = text.split(/\r?\n/).map((r) => r.split("\t"));

// 跳過 header
const dataRows = rows.slice(1);

// 欄位對應 status 名稱
const COL_STATUS = [
  "stockOut", // col 0 缺貨
  "preOrder", // col 1 期貨
  "discontinued", // col 2 停產
  "lastStock", // col 3 售完為止
  "problematic", // col 4 問題色
];

const result = {};

for (const row of dataRows) {
  const note = (row[5] || "").trim(); // T欄備註 — 只屬於 col 4 (問題色)

  for (let col = 0; col < 5; col++) {
    const code = (row[col] || "").trim();
    if (!code) continue;

    const status = COL_STATUS[col];
    // 備註只給問題色欄(col 4)
    const rowNote = col === 4 ? note : "";

    // 同一色碼可能重複出現,以嚴重度取高者
    if (result[code]) {
      const severity = {
        discontinued: 5,
        lastStock: 4,
        stockOut: 3,
        preOrder: 2,
        problematic: 1,
      };
      if ((severity[status] || 0) > (severity[result[code].status] || 0)) {
        result[code] = { status, ...(rowNote ? { note: rowNote } : {}) };
      } else if (rowNote && !result[code].note) {
        result[code].note = rowNote;
      }
    } else {
      result[code] = { status, ...(rowNote ? { note: rowNote } : {}) };
    }
  }
}

// 統計
const counts = COL_STATUS.reduce((a, s) => {
  a[s] = 0;
  return a;
}, {});
Object.values(result).forEach((v) => counts[v.status]++);

fs.writeFileSync(OUTPUT, JSON.stringify(result, null, 2));

console.log(`輸出: ${OUTPUT}`);
console.log(`總計 ${Object.keys(result).length} 個色碼`);
console.log("分類:");
Object.entries(counts).forEach(([s, n]) => console.log(`  ${s}: ${n}`));
