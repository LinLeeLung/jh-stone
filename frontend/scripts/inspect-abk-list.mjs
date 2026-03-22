const url = "https://www.marmotaiwan.com/product-detail/Size/1635x323/";
const html = await (await fetch(url)).text();

const needles = ["ANIMA-GRIGIO", "ANIMA-BEIGE", "亞米娜-灰", "亞米娜-米黃"];
for (const needle of needles) {
  const index = html.indexOf(needle);
  if (index < 0) {
    console.log(`NOT_FOUND ${needle}`);
    continue;
  }
  const start = Math.max(0, index - 1200);
  const end = Math.min(html.length, index + 1200);
  const snippet = html.slice(start, end);
  const imageMatches = [
    ...snippet.matchAll(/<img[^>]+src="([^"]+)"[^>]*>/gi),
  ].map((m) => m[1]);
  console.log(`\n=== ${needle} ===`);
  console.log("IMG_AROUND:", imageMatches.slice(0, 8));
}
