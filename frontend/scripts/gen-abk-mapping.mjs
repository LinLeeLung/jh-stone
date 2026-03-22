import fs from "node:fs/promises";

const ABK_LIST_URL =
  "https://www.marmotaiwan.com/product-detail/Size/1635x323/";
const SITE_BASE = "https://www.marmotaiwan.com";

function normalizeText(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s\-_/｜|()（）·•.,:：'"`]/g, "");
}

function decodeHtml(value = "") {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

function toAbsoluteUrl(url = "") {
  const text = String(url || "").trim();
  if (!text) return "";
  try {
    if (text.startsWith("//")) {
      return new URL(`https:${text}`).href;
    }
    return new URL(text, `${SITE_BASE}/`).href;
  } catch {
    return text;
  }
}

async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Fetch failed ${response.status} ${url}`);
  }
  return await response.text();
}

function extractListItems(html = "") {
  const items = [];
  const itemRegex = /<li>\s*<div class=\"item\"[\s\S]*?<\/li>/gi;
  let itemMatch;

  while ((itemMatch = itemRegex.exec(html))) {
    const block = itemMatch[0];

    const imageMatch = block.match(/<img[^>]+src=\"([^\"]+)\"[^>]*>/i);
    const imageUrl = toAbsoluteUrl(imageMatch?.[1] || "");
    if (!imageUrl) continue;

    const nameRegex =
      /<h[34]>\s*<a[^>]*href=\"([^\"]+)\"[^>]*>([^<]+)<\/a>\s*<\/h[34]>/gi;
    let nameMatch;
    while ((nameMatch = nameRegex.exec(block))) {
      const href = toAbsoluteUrl(nameMatch[1]);
      if (!href.includes("/product-item/")) continue;

      const name = decodeHtml(nameMatch[2]).replace(/\s+/g, " ").trim();
      if (!name) continue;

      items.push({
        name,
        href,
        imageUrl,
      });
    }
  }

  const dedup = new Map();
  for (const item of items) {
    const key = `${normalizeText(item.name)}|${item.href}|${item.imageUrl}`;
    if (!dedup.has(key)) dedup.set(key, item);
  }

  return [...dedup.values()];
}

async function main() {
  const listHtml = await fetchText(ABK_LIST_URL);
  const listItems = extractListItems(listHtml);

  const rows = listItems
    .map((item) => ({
      brand: "ABK",
      color: item.name,
      imageUrl: String(item.imageUrl || "").trim(),
    }))
    .filter((row) => row.color && row.imageUrl);

  const outLines = ["brand,color,imageUrl"];
  rows.forEach((row) => {
    const esc = (v) => `"${String(v || "").replace(/"/g, '""')}"`;
    outLines.push(
      [esc(row.brand), esc(row.color), esc(row.imageUrl)].join(","),
    );
  });

  const outPath = new URL("../public/abk-image-mapping.csv", import.meta.url);
  await fs.writeFile(outPath, outLines.join("\n"), "utf8");

  console.log(`ABK_LIST_ITEMS=${listItems.length}`);
  console.log(`ABK_MAPPED=${rows.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
