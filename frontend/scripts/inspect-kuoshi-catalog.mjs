function parseCsv(text = "") {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  const commitField = () => { row.push(field); field = ""; };
  const commitRow = () => { if (row.some((c) => String(c || "").trim())) rows.push(row); row = []; };
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];
    if (ch === '"') {
      if (inQuotes && next === '"') { field += '"'; i += 1; }
      else inQuotes = !inQuotes;
      continue;
    }
    if (ch === "," && !inQuotes) { commitField(); continue; }
    if ((ch === "\n" || ch === "\r") && !inQuotes) {
      commitField(); commitRow(); if (ch === "\r" && next === "\n") i += 1; continue;
    }
    field += ch;
  }
  if (field.length || row.length) { commitField(); commitRow(); }
  return rows;
}

const csvUrl = "https://docs.google.com/spreadsheets/d/10Gkhuq2iwlpQfw0e-uvP_9UuE1efee_5v7iHX4srW8s/export?format=csv&gid=494306116";
const text = await (await fetch(csvUrl)).text();
const rows = parseCsv(text);
const header = rows[0] || [];
const idx = (aliases, fallback) => {
  const map = header.map((h) => String(h || "").trim().toLowerCase());
  for (const a of aliases) {
    const found = map.indexOf(String(a).trim().toLowerCase());
    if (found >= 0) return found;
  }
  return fallback;
};
const brandIndex = idx(["品牌", "brand"], 0);
const colorIndex = idx(["色號", "顏色", "color"], 1);
const kuoshiRows = rows.slice(1)
  .map((r) => ({ brand: String(r[brandIndex] || "").trim(), color: String(r[colorIndex] || "").trim() }))
  .filter((r) => r.brand.includes("闊石"));
console.log("KUOSHI_ROWS", kuoshiRows.length);
console.log(kuoshiRows.slice(0, 80).map((r) => `${r.brand} | ${r.color}`).join("\n"));
