// Parse data/raw/customers-raw.tsv -> data/parsed/customers.json
// Columns: 客戶代號, 客戶名稱, 電話, 傳真, 價格傳真/備註, 客戶統編
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");
const RAW = path.join(repoRoot, "data", "raw", "customers-raw.tsv");
const OUT = path.join(repoRoot, "data", "parsed", "customers.json");

const text = fs.readFileSync(RAW, "utf8");

/**
 * 將 TSV 文字解析成 rows（每 row 是欄位陣列）。
 * 支援 RFC-4180 quoted fields：欄位以 " 開頭時，內容可包含換行與 tab，
 * 直到對應的結尾 " 為止。多行電話（如 "02-xxx\n02-yyy"）會用空白合併。
 */
function parseTsv(src) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuote = false;
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (inQuote) {
      if (ch === '"') {
        // doubled quote -> literal "
        if (src[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuote = false; i++; continue;
      }
      // newline inside quoted field: replace with space
      if (ch === "\r") { i++; continue; }
      if (ch === "\n") { field += " "; i++; continue; }
      field += ch; i++; continue;
    }
    if (ch === '"') { inQuote = true; i++; continue; }
    if (ch === "\t") { row.push(field); field = ""; i++; continue; }
    if (ch === "\n" || ch === "\r") {
      row.push(field); field = "";
      if (ch === "\r" && src[i + 1] === "\n") i++;
      rows.push(row); row = [];
      i++; continue;
    }
    field += ch; i++;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const rows = parseTsv(text);
// 模擬原本的 lines 結構：把每個 row 還原成 tab-joined 字串供下方邏輯使用
// 但改用 rows 直接解析，不再 split("\t")
const lines = rows.map(r => r.join("\t"));

const HEADER_TOKENS = ["客戶名稱", "電話", "傳真", "價格傳真/備註", "客戶統編"];

const records = [];
const seenCodes = new Map(); // code -> [{name, phone, fax, finalCode}, ...]
const skipped = { blankCode: 0, headerLike: 0, exactDup: 0 };
const duplicates = []; // {code, line, suffixed}

for (let i = 0; i < lines.length; i++) {
  const raw = lines[i];
  if (!raw.trim()) continue;
  const lineNo = i + 1;

  // skip header line
  if (i === 0 && raw.startsWith("客戶代號")) continue;

  let cols = raw.split("\t");

  // Fix line that got polluted with another header glued on
  // e.g. [...,03-6580869,客戶名稱,電話,傳真,價格傳真/備註,客戶統編]
  const headerStart = cols.findIndex(
    (c, idx) => idx >= 4 && c.trim() === "客戶名稱",
  );
  if (headerStart > 0) {
    const tail = cols
      .slice(headerStart, headerStart + HEADER_TOKENS.length)
      .map((c) => c.trim());
    if (tail.join("|") === HEADER_TOKENS.join("|")) {
      cols = cols.slice(0, headerStart);
    }
  }

  const code = (cols[0] ?? "").trim();
  const name = (cols[1] ?? "").trim();
  const phone = (cols[2] ?? "").trim();
  const fax = (cols[3] ?? "").trim();
  const notes = (cols[4] ?? "").trim();
  const taxId = (cols[5] ?? "").trim();

  // skip if code is missing or starts with a stray quote sentinel
  if (!code || code === '"') {
    skipped.blankCode++;
    continue;
  }
  // skip rows that look like a stray header
  if (code === "客戶代號") {
    skipped.headerLike++;
    continue;
  }

  let finalCode = code;
  const prev = seenCodes.get(code) ?? [];
  if (prev.length > 0) {
    // exact duplicate (same name+phone+fax) -> skip silently
    const isExact = prev.some(
      (p) => p.name === name && p.phone === phone && p.fax === fax,
    );
    if (isExact) {
      skipped.exactDup++;
      continue;
    }
    finalCode = `${code}-${prev.length + 1}`;
    duplicates.push({ code, line: lineNo, suffixed: finalCode, name });
  }
  seenCodes.set(code, [...prev, { name, phone, fax, finalCode }]);

  const rec = { code: finalCode, originalCode: code, name };
  if (phone) rec.phone = phone;
  if (fax) rec.fax = fax;
  if (notes) rec.notes = notes;
  if (taxId) rec.taxId = taxId;
  records.push(rec);
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(records, null, 2), "utf8");

console.log(`Read ${lines.length} lines`);
console.log(`Parsed ${records.length} customer records`);
console.log(
  `Skipped: blankCode=${skipped.blankCode}, headerLike=${skipped.headerLike}, exactDup=${skipped.exactDup}`,
);
console.log(`Duplicate codes auto-suffixed: ${duplicates.length}`);
if (duplicates.length) {
  console.log("First 10 duplicates:");
  duplicates
    .slice(0, 10)
    .forEach((d) =>
      console.log(`  line ${d.line}: ${d.code} -> ${d.suffixed} (${d.name})`),
    );
}
console.log(`Output: ${OUT}`);
