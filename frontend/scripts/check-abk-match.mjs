import fs from "node:fs";

function parseCsv(text = "") {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  const commitField = () => {
    row.push(field);
    field = "";
  };

  const commitRow = () => {
    const hasValue = row.some((col) => String(col || "").trim().length > 0);
    if (hasValue) rows.push(row);
    row = [];
  };

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const nextChar = text[index + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        field += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      commitField();
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      commitField();
      commitRow();
      if (char === "\r" && nextChar === "\n") index += 1;
      continue;
    }

    field += char;
  }

  if (field.length > 0 || row.length > 0) {
    commitField();
    commitRow();
  }

  return rows;
}

function norm(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s\-_/｜|()（）·•.,:：'"`]/g, "");
}

const csvUrl =
  "https://docs.google.com/spreadsheets/d/10Gkhuq2iwlpQfw0e-uvP_9UuE1efee_5v7iHX4srW8s/export?format=csv&gid=494306116";
const csvText = await (await fetch(csvUrl)).text();
const rows = parseCsv(csvText);
const header = rows[0] || [];

const findIndex = (aliases) => {
  const lowered = aliases.map((a) => String(a).toLowerCase());
  return header.findIndex((h) =>
    lowered.includes(
      String(h || "")
        .trim()
        .toLowerCase(),
    ),
  );
};

const brandIndex = findIndex(["品牌", "brand"]);
const colorIndex = findIndex(["色號", "顏色", "color"]);
const imageIndex = findIndex(["圖片網址", "圖片url", "url", "imageurl"]);

const abkRows = rows
  .slice(1)
  .map((row) => ({
    brand: String(row[brandIndex] || "").trim(),
    color: String(row[colorIndex] || "").trim(),
    imageUrl: String(row[imageIndex] || "").trim(),
  }))
  .filter((row) => row.brand.startsWith("ABK"));

const mapPath = new URL("../public/abk-image-mapping.csv", import.meta.url);
const mapText = fs.readFileSync(mapPath, "utf8");
const mapRows = parseCsv(mapText);
const mapHeader = mapRows[0] || [];
const mapColorIndex = mapHeader.findIndex((h) =>
  ["color", "色號", "顏色", "code"].includes(
    String(h || "")
      .trim()
      .toLowerCase(),
  ),
);

const mapSet = new Set(mapRows.slice(1).map((row) => norm(row[mapColorIndex])));

const directMatch = abkRows.filter((row) => mapSet.has(norm(row.color)));
const missing = abkRows.filter((row) => !mapSet.has(norm(row.color)));

console.log("ABK_ROWS", abkRows.length);
console.log("HAS_IMAGE", abkRows.filter((row) => row.imageUrl).length);
console.log("DIRECT_MATCH", directMatch.length);
console.log("MISSING", missing.length);
console.log("MISSING_SAMPLE");
missing.slice(0, 30).forEach((row) => console.log(row.color));
