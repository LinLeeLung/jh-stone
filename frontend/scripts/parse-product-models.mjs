#!/usr/bin/env node
/**
 * 解析公司既有的「型號 → 開孔尺寸」原始資料 (TSV)
 *
 * 使用:
 *   node scripts/parse-product-models.mjs \
 *     --input ../data/raw/products-raw-sample.tsv \
 *     --outDir ../data/parsed
 *
 * 輸入: TSV (第一行 header, 兩欄: 型號 / 尺寸文字)
 * 輸出:
 *   parsed-ok.json       — 能解析的乾淨資料
 *   needs-review.json    — 解析不完整 / 多義 / 特殊格式
 *   garbage.json         — 垃圾資料 (無/有/電話/空白)
 *   summary.txt          — 統計
 *
 * 解析欄位:
 *   type         (stove/sink/hood/accessory/other) — 用關鍵字猜
 *   holeWidthMm, holeDepthMm, holeRadiusMm
 *   holeDiameterMm (圓形)
 *   frontEdgeMm  ("前沿X開挖")
 *   outerW/D/H, innerW/D/H (水槽外/內徑)
 *   methods[]    (從備註抓 "嵌入"/"前沿8cm" 等)
 *   notes        (其餘文字)
 *   rawText      (原始字串保留)
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------- CLI args ----------
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, arr) => {
    if (cur.startsWith("--")) acc.push([cur.slice(2), arr[i + 1]]);
    return acc;
  }, []),
);
const INPUT = path.resolve(
  __dirname,
  args.input || "../../data/raw/products-raw-sample.tsv",
);
const OUT_DIR = path.resolve(__dirname, args.outDir || "../../data/parsed");
fs.mkdirSync(OUT_DIR, { recursive: true });

// ---------- 分類關鍵字 ----------
const TYPE_RULES = [
  { type: "hood", re: /油機|排油|油煙機/ },
  {
    type: "sink",
    re: /^(KL|BLANCO|SUS|SE-|JT-1[678]|JT-77|JT-A60|JT-S|JT-KS|CSK|MJGL|DS-|PDS|PDK|DHK|DJIS|CB-|CB88|F7446|FW|H-?\d|KS-|MN-|MJGL|EKS|SUBLINE|QUADRA|SCHOCK|SED-|SO-|SPDL|TI-|TV-|T-V|U[12]-|WP-|WT|YW|SD-|SK-|SKL|SC-\d|R7\d|REM-|SBI|SB$|N7\d\dBI|N8\d\dBI|N1\d\dBI|W-?\d{3}|C0[12]-|C10-|ARQ|KBG|FK-|花崗岩水槽|結晶石水槽|單槽|水槽|取回)/i,
  },
  { type: "accessory", re: /插座|透氣孔|BBQ|鐵板燒|烤箱/i },
];

function guessType(model, raw) {
  const text = `${model || ""} ${raw || ""}`;
  for (const r of TYPE_RULES) if (r.re.test(text)) return r.type;
  return "stove"; // 預設爐子(大多數)
}

// ---------- 文字正規化 ----------
function normalize(s) {
  if (!s) return "";
  return (
    s
      .replace(/[Ｗｗ]/g, "W")
      .replace(/[Ｈｈ]/g, "H")
      .replace(/[Ｄｄ]/g, "D")
      .replace(/[Ｒｒ]/g, "R")
      .replace(/[×XxＸｘ✕✖]/g, "*")
      // 移除 (W) / (D) / (H) / (R) 標記文字
      .replace(/\(\s*[WDHR]\s*\)/gi, "")
      // 數字後面的 mm / MM 刪除 (cm 要保留給 detectUnit)
      .replace(/(\d)\s*mm\b/gi, "$1")
      // 「概 / 槽身 / 內徑 左大 / 內徑 右小」中間多餘空格
      .replace(/外\s+徑/g, "外徑")
      .replace(/槽\s+身/g, "槽身")
      .replace(/內\s+徑/g, "內徑")
      .replace(/[，,]/g, " ")
      .replace(/[（(]/g, "(")
      .replace(/[）)]/g, ")")
      .replace(/[：:]/g, ":")
      // 「W\s+\d\s+D\s+\d」 補上 *
      .replace(/(W\s*\d+(?:\.\d+)?)\s+(D\s*\d+)/gi, "$1*$2")
      .replace(/(D\s*\d+(?:\.\d+)?)\s+(H\s*\d+)/gi, "$1*$2")
      // 「\d \d」 (純空白分隔的兩組數字) - 犧琴 W268 D490 / 700 480 類型
      .replace(/(\d{2,4})\s+(\d{2,4})(?!\d)/g, "$1*$2")
      .replace(/\s+/g, " ")
      .trim()
  );
}

// 「9.5*5*R1(CM)」 → mm
function toMm(value, unit) {
  if (!Number.isFinite(value)) return undefined;
  return unit === "cm" ? Math.round(value * 10) : Math.round(value);
}

// 偵測單位:整段文字含 "(CM)"/"cm" → cm,否則預設 mm
function detectUnit(text) {
  return /\b(cm|CM)\b|\(\s*cm\s*\)/i.test(text) ? "cm" : "mm";
}

// ---------- 解析主函式 ----------
function isGarbage(model, raw) {
  if (!model) return true;
  if (
    /^(無|有|有爐子|有水槽|傳真|總公司|庫存|張經理|請款|參考圖面)/.test(model)
  )
    return true;
  if (/^\d{8,}#?/.test(model)) return true; // 電話/工單號殘留
  return false;
}

// 抓 "前沿XX開挖" 的距離
function extractFrontEdge(text) {
  const m = text.match(/前沿\s*(\d+(?:\.\d+)?)\s*(?:CM|cm|公分)?/);
  return m ? parseFloat(m[1]) : undefined;
}

// 抓 R 圓角
function extractRadius(text) {
  const m = text.match(/R\s*(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]) : undefined;
}

// 抓 W*D 或 W*D*R 主開孔(支援前綴 W/D)
const MAIN_RE =
  /(?:W\s*)?(\d{2,4}(?:\.\d+)?)\s*\*\s*(?:D\s*)?(\d{2,4}(?:\.\d+)?)(?:\s*\*\s*R?\s*\d+(?:\.\d+)?)?/;

function extractMain(text) {
  const m = text.match(MAIN_RE);
  if (!m) return null;
  return { w: parseFloat(m[1]), d: parseFloat(m[2]) };
}

// 偵測圓形:「直徑XXX」或 ØXXX
function extractDiameter(text) {
  const m = text.match(
    /(?:直徑|Ø|ϕ)\s*(\d+(?:\.\d+)?)\s*(?:MM|mm|公分|CM|cm)?/,
  );
  return m ? parseFloat(m[1]) : undefined;
}

// 拓外徑 / 內徑 (含別名:槽身=內徑)
function extractOuterInner(text) {
  const out = {};
  const outerM = text.match(
    /外\s*徑?\s*(?:尺寸)?\s*:?\s*(?:W\s*)?(\d+(?:\.\d+)?)\s*[*xX]\s*(?:D\s*)?(\d+(?:\.\d+)?)(?:\s*[*xX]\s*(?:H\s*)?(\d+(?:\.\d+)?))?/,
  );
  if (outerM) {
    out.outerW = parseFloat(outerM[1]);
    out.outerD = parseFloat(outerM[2]);
    if (outerM[3]) out.outerH = parseFloat(outerM[3]);
  }
  const innerM = text.match(
    /(?:內\s*徑|槽身|槽\s*身)?\s*(?:尺寸)?\s*:?\s*(?:W\s*)?(\d+(?:\.\d+)?)\s*[*xX]\s*(?:D\s*)?(\d+(?:\.\d+)?)(?:\s*[*xX]\s*(?:H\s*)?(\d+(?:\.\d+)?))?/,
  );
  // 上面的 innerM 太寬鬆會誤抓,重寫:必須有「內徑」或「槽身」關鍵字
  delete out.innerW;
  delete out.innerD;
  delete out.innerH;
  const innerStrict = text.match(
    /(?:內徑|槽身)\s*(?:尺寸|左大|右小)?\s*:?\s*(?:W\s*)?(\d+(?:\.\d+)?)\s*[*xX]\s*(?:D\s*)?(\d+(?:\.\d+)?)(?:\s*[*xX]\s*(?:H\s*)?(\d+(?:\.\d+)?))?/,
  );
  if (innerStrict) {
    out.innerW = parseFloat(innerStrict[1]);
    out.innerD = parseFloat(innerStrict[2]);
    if (innerStrict[3]) out.innerH = parseFloat(innerStrict[3]);
  }
  return out;
}

function extractMethods(text) {
  const methods = [];
  if (/嵌入爐|嵌入|崁入|嵌爐/.test(text)) methods.push("嵌入");
  if (/前沿\s*\d+/.test(text)) methods.push("前沿開挖");
  if (/下嵌/.test(text)) methods.push("下嵌");
  if (/上嵌/.test(text)) methods.push("上嵌");
  if (/平接|齊平/.test(text)) methods.push("平接");
  if (/爐連烤/.test(text)) methods.push("爐連烤");
  return methods;
}

function parseRow(model, raw) {
  const rec = {
    model: model.trim(),
    rawText: raw || "",
    type: guessType(model, raw),
    needsReview: false,
    reviewReasons: [],
  };

  if (!raw || !raw.trim()) {
    rec.needsReview = true;
    rec.reviewReasons.push("無尺寸資料");
    return rec;
  }

  // model 與 raw 完全相同 → 通常是匯入錯位
  if (rec.model && rec.model === raw.trim()) {
    rec.needsReview = true;
    rec.reviewReasons.push("型號與尺寸欄位相同,可能匯入錯位");
  }

  const text = normalize(raw);
  const unit = detectUnit(text);
  if (unit === "cm") {
    rec.needsReview = true;
    rec.reviewReasons.push("單位 cm,已自動 ×10,請人工確認");
  }

  // 圓形
  const dia = extractDiameter(text);
  if (dia !== undefined) {
    rec.holeDiameterMm = toMm(dia, unit);
  }

  // 主開孔
  const main = extractMain(text);
  if (main) {
    rec.holeWidthMm = toMm(main.w, unit);
    rec.holeDepthMm = toMm(main.d, unit);
  }

  // R 圓角
  const r = extractRadius(text);
  if (r !== undefined) rec.holeRadiusMm = toMm(r, unit);

  // 前沿
  const fe = extractFrontEdge(text);
  if (fe !== undefined) rec.frontEdgeMm = unit === "cm" ? fe * 10 : fe;

  // 外/內徑 (水槽)
  const oi = extractOuterInner(text);
  Object.assign(rec, {
    outerWidthMm: oi.outerW !== undefined ? toMm(oi.outerW, unit) : undefined,
    outerDepthMm: oi.outerD !== undefined ? toMm(oi.outerD, unit) : undefined,
    outerHeightMm: oi.outerH !== undefined ? toMm(oi.outerH, unit) : undefined,
    innerWidthMm: oi.innerW !== undefined ? toMm(oi.innerW, unit) : undefined,
    innerDepthMm: oi.innerD !== undefined ? toMm(oi.innerD, unit) : undefined,
    innerHeightMm: oi.innerH !== undefined ? toMm(oi.innerH, unit) : undefined,
  });
  // 有內徑 → 強制歸類 sink (除非已被判為 hood/accessory),並清掉 hole* (避免重複)
  if (rec.innerWidthMm) {
    if (rec.type === "stove") rec.type = "sink";
    delete rec.holeWidthMm;
    delete rec.holeDepthMm;
    delete rec.holeRadiusMm;
  }

  // 工法
  const methods = extractMethods(text);
  if (methods.length) rec.methods = methods;

  // 沒抓到任何尺寸 → 待審
  if (
    rec.holeWidthMm === undefined &&
    rec.holeDiameterMm === undefined &&
    rec.innerWidthMm === undefined
  ) {
    rec.needsReview = true;
    rec.reviewReasons.push("找不到尺寸");
  }

  // 多組 W*D (例如水槽有外+內)
  const allMatches = text.match(/\d+\s*\*\s*\d+/g) || [];
  if (allMatches.length > 2 && rec.innerWidthMm === undefined) {
    rec.needsReview = true;
    rec.reviewReasons.push(
      `偵測到 ${allMatches.length} 組尺寸,可能有外/內徑未抓對`,
    );
  }

  // 清理 undefined
  Object.keys(rec).forEach((k) => rec[k] === undefined && delete rec[k]);
  if (!rec.reviewReasons.length) delete rec.reviewReasons;
  return rec;
}

// ---------- 讀檔 ----------
const text = fs.readFileSync(INPUT, "utf8");
const rows = parseTsv(text);

function parseTsv(s) {
  // 支援 Excel 風格的雙引號跨行
  const out = [];
  let cur = [];
  let field = "";
  let inQ = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQ) {
      if (c === '"' && s[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') inQ = false;
      else field += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === "\t") {
        cur.push(field);
        field = "";
      } else if (c === "\n") {
        cur.push(field);
        out.push(cur);
        cur = [];
        field = "";
      } else if (c === "\r") {
        /* skip */
      } else field += c;
    }
  }
  if (field !== "" || cur.length) {
    cur.push(field);
    out.push(cur);
  }
  return out.filter((r) => r.length && r.some((x) => x && x.trim() !== ""));
}

// 略過 header
const dataRows = rows.slice(1);

const ok = [];
const review = [];
const garbage = [];

for (const r of dataRows) {
  const model = (r[0] || "").trim();
  const raw = (r[1] || "").trim();
  if (isGarbage(model, raw)) {
    garbage.push({ model, raw });
    continue;
  }
  const rec = parseRow(model, raw);
  if (rec.needsReview) review.push(rec);
  else ok.push(rec);
}

fs.writeFileSync(
  path.join(OUT_DIR, "parsed-ok.json"),
  JSON.stringify(ok, null, 2),
);
fs.writeFileSync(
  path.join(OUT_DIR, "needs-review.json"),
  JSON.stringify(review, null, 2),
);
fs.writeFileSync(
  path.join(OUT_DIR, "garbage.json"),
  JSON.stringify(garbage, null, 2),
);

// 統計
const byType = ok.reduce((a, r) => {
  a[r.type] = (a[r.type] || 0) + 1;
  return a;
}, {});
const summary = [
  `輸入檔: ${INPUT}`,
  `總列數(扣除 header): ${dataRows.length}`,
  `  乾淨可匯入: ${ok.length}`,
  `  待人工確認: ${review.length}`,
  `  垃圾資料: ${garbage.length}`,
  ``,
  `OK 分類:`,
  ...Object.entries(byType).map(([t, n]) => `  ${t}: ${n}`),
].join("\n");

fs.writeFileSync(path.join(OUT_DIR, "summary.txt"), summary);
console.log(summary);
console.log(`\n輸出: ${OUT_DIR}`);
