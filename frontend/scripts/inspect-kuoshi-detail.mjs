const url = "https://qjquartzstone.com.tw/product_detail.php?id=40";
const html = await (await fetch(url)).text();

const title = (html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || "").trim();
const h1 = (html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || "")
  .replace(/<[^>]+>/g, " ")
  .trim();
const h2 = (html.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i)?.[1] || "")
  .replace(/<[^>]+>/g, " ")
  .trim();
const h3 = (html.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i)?.[1] || "")
  .replace(/<[^>]+>/g, " ")
  .trim();
const og = (
  html.match(/property="og:image"[^>]*content="([^"]+)"/i)?.[1] || ""
).trim();

const imgs = [...html.matchAll(/<img[^>]+src="([^"]+)"[^>]*>/gi)].map(
  (m) => m[1],
);
const texts = [...html.matchAll(/<span[^>]*>([^<]+)<\/span>/gi)]
  .map((m) => m[1].trim())
  .filter(Boolean);

console.log({ title, h1, h2, h3, og, imgCount: imgs.length });
console.log("IMG_SAMPLE", imgs.slice(0, 15));
console.log("SPAN_SAMPLE", texts.slice(0, 30));
