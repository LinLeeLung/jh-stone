/**
 * 找出 customers-raw.tsv 中所有跨行 quoted fields 的位置
 * 並輸出修正建議
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RAW = resolve(__dirname, "../data/raw/customers-raw.tsv");
const src = readFileSync(RAW, "utf8");

// 逐字元解析，找出所有跨行 quoted fields
const issues = [];
let i = 0;
let lineNo = 1;
let colNo = 0;
let colIdx = 0;
let rowStart = 1;

while (i < src.length) {
  const ch = src[i];
  if (ch === '"') {
    // 進入 quoted field
    const fieldStartLine = lineNo;
    const fieldColIdx = colIdx;
    i++;
    let content = "";
    let newlines = 0;
    while (i < src.length) {
      const c = src[i];
      if (c === '"') {
        if (src[i + 1] === '"') { content += '"'; i += 2; continue; }
        i++; break;
      }
      if (c === '\n') { newlines++; lineNo++; colNo = 0; }
      else if (c === '\r') { i++; continue; }
      content += c;
      i++;
    }
    if (newlines > 0) {
      issues.push({
        line: fieldStartLine,
        col: fieldColIdx,
        rowStart,
        content: content.replace(/\n/g, "\\n"),
        fixed: content.replace(/\r?\n/g, " ").trim(),
      });
    }
    colNo++;
    continue;
  }
  if (ch === '\t') { colIdx++; colNo++; i++; continue; }
  if (ch === '\n') {
    lineNo++;
    colNo = 0;
    colIdx = 0;
    rowStart = lineNo;
    i++;
    continue;
  }
  if (ch === '\r') { i++; continue; }
  colNo++;
  i++;
}

console.log(`找到 ${issues.length} 個跨行 quoted fields:\n`);
issues.forEach((iss, idx) => {
  console.log(`#${idx + 1} 第 ${iss.line} 行 欄位[${iss.col}]:`);
  console.log(`  原始: "${iss.content}"`);
  console.log(`  修正: "${iss.fixed}"`);
  console.log();
});
