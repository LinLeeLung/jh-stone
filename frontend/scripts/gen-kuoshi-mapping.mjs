import fs from "node:fs/promises";

const SITE_BASE = "https://qjquartzstone.com.tw";
const CATEGORY_IDS = [1, 2, 3, 4, 5];

function toAbsoluteUrl(url = "") {
  const text = String(url || "").trim();
  if (!text) return "";
  try {
    return new URL(text, `${SITE_BASE}/`).href;
  } catch {
    return text;
  }
}

function normalizeCode(value = "") {
  return String(value || "")
    .toUpperCase()
    .trim()
    .replace(/\s+/g, "")
    .replace(/_/g, "-");
}

async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Fetch failed ${response.status} ${url}`);
  }
  return await response.text();
}

function extractPageLinks(html = "", pid) {
  const links = [...html.matchAll(/href=["']([^"']*\?pid=\d+[^"']*)["']/gi)]
    .map((m) => toAbsoluteUrl(m[1]))
    .filter((url) => url.includes(`pid=${pid}`));
  return [...new Set(links)];
}

function extractProductCards(html = "") {
  const cards = [];
  const liRegex = /<li\s+class=["']in_fade["'][\s\S]*?<\/li>/gi;
  let liMatch;
  while ((liMatch = liRegex.exec(html))) {
    const block = liMatch[0];

    const code =
      block.match(
        /<div\s+class=["']sh-dai\s+ti["'][\s\S]*?<span>([^<]+)<\/span>/i,
      )?.[1] || "";
    const image = block.match(/<img[^>]+src=["']([^"']+)["']/i)?.[1] || "";

    const normalizedCode = normalizeCode(code);
    const imageUrl = toAbsoluteUrl(image);

    if (!normalizedCode || !imageUrl) continue;
    cards.push({ code: normalizedCode, imageUrl });
  }

  return cards;
}

async function crawlCategory(pid) {
  const visited = new Set();
  const queue = [toAbsoluteUrl(`/product.php?pid=${pid}`)];
  const cards = [];

  while (queue.length) {
    const url = queue.shift();
    if (!url || visited.has(url)) continue;
    visited.add(url);

    const html = await fetchText(url);
    cards.push(...extractProductCards(html));

    const links = extractPageLinks(html, pid);
    links.forEach((link) => {
      if (!visited.has(link)) queue.push(link);
    });
  }

  return cards;
}

async function main() {
  const allCards = [];

  for (const pid of CATEGORY_IDS) {
    const cards = await crawlCategory(pid);
    allCards.push(...cards);
  }

  const imageMap = new Map();
  allCards.forEach((row) => {
    if (!row.code || !row.imageUrl || imageMap.has(row.code)) return;
    imageMap.set(row.code, row.imageUrl);
  });

  const outLines = ["brand,color,imageUrl"];
  [...imageMap.entries()].forEach(([code, imageUrl]) => {
    const esc = (value) => `"${String(value || "").replace(/"/g, '""')}"`;
    outLines.push([esc("闊石"), esc(code), esc(imageUrl)].join(","));
  });

  const outPath = new URL(
    "../public/kuoshi-image-mapping.csv",
    import.meta.url,
  );
  await fs.writeFile(outPath, outLines.join("\n"), "utf8");

  console.log(`KUOSHI_RAW_CARDS=${allCards.length}`);
  console.log(`KUOSHI_MAPPED_CODES=${imageMap.size}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
