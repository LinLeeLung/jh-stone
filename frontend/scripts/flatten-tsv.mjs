#!/usr/bin/env node
/**
 * 將 customers-raw.tsv 中所有 quoted multi-line fields 展平成單行
 * 多行內容之間以空白合併，並去除前後空白
 *
 * 使用:
 *   node flatten-tsv.mjs          (dry-run，列出修改筆數)
 *   node flatten-tsv.mjs --apply  (正式覆寫檔案)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RAW = resolve(__dirname, "../../data/raw/customers-raw.tsv");
const DRY_RUN = !process.argv.includes("--apply");

const src = readFileSync(RAW, "utf8");

// 解析 TSV（支援 quoted multi-line fields）
function parseTsvToRows(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuote = false;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (inQuote) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuote = false; i++; continue;
      }
      if (ch === "\r") { i++; continue; }
      if (ch === "\n") { field += " "; i++; continue; }
      field += ch; i++; continue;
    }
    if (ch === '"') { inQuote = true; i++; continue; }
    if (ch === "\t") { row.push(field); field = ""; i++; continue; }
    if (ch === "\n" || ch === "\r") {
      row.push(field); field = "";
      if (ch === "\r" && text[i + 1] === "\n") i++;
      rows.push(row); row = [];
      i++; continue;
    }
    field += ch; i++;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const rows = parseTsvToRows(src);

// 重新序列化成乾淨的 TSV（每格 trim，不加引號）
const output = rows
  .map(row => row.map(cell => cell.trim()).join("\t"))
  .join("\n") + "\n";

const origLineCount = src.split("\n").length;
const newLineCount = output.split("\n").length;
console.log(`原始行數: ${origLineCount}  →  修正後行數: ${newLineCount}`);
console.log(`減少了 ${origLineCount - newLineCount} 行（跨行 quoted fields 已展平）`);

if (DRY_RUN) {
  console.log("\n[Dry-run] 加上 --apply 正式覆寫");
  process.exit(0);
}

writeFileSync(RAW, output, "utf8");
console.log("✓ 已覆寫", RAW);
