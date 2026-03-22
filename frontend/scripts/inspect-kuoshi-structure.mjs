const startUrl = "https://qjquartzstone.com.tw/product.php?pid=5";

const html = await (await fetch(startUrl)).text();

const categoryLinks = [
  ...html.matchAll(
    /<a[^>]+href="([^"]*product\.php\?[^"#]+)"[^>]*>([^<]*)<\/a>/gi,
  ),
]
  .map((m) => ({ href: m[1], text: m[2].trim() }))
  .filter((item) => item.href.includes("pid="));

const detailLinks = [
  ...html.matchAll(
    /<a[^>]+href="([^"]*product_detail\.php\?id=\d+)"[^>]*>([^<]*)<\/a>/gi,
  ),
].map((m) => ({ href: m[1], text: m[2].trim() }));

console.log("CATEGORY_LINKS", categoryLinks.length);
console.log(categoryLinks.slice(0, 30));
console.log("DETAIL_LINKS_ON_START", detailLinks.length);
console.log(detailLinks.slice(0, 20));

const cardImageNearDetail = [
  ...html.matchAll(
    /<img[^>]+src="([^"]+)"[^>]*>[\s\S]{0,400}<a[^>]+href="([^"]*product_detail\.php\?id=\d+)"/gi,
  ),
].map((m) => ({ image: m[1], detail: m[2] }));

console.log("CARD_IMAGE_NEAR_DETAIL", cardImageNearDetail.length);
console.log(cardImageNearDetail.slice(0, 20));
