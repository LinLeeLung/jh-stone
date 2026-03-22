const url = "https://qjquartzstone.com.tw/product.php?pid=5";
const html = await (await fetch(url)).text();

const keys = ["經典", "雅緻", "奢華", "工業風", "EG", "product_detail.php", "pid="];
for (const key of keys) {
  const index = html.indexOf(key);
  console.log(`--- ${key} idx=${index}`);
  if (index >= 0) {
    console.log(html.slice(Math.max(0, index - 260), Math.min(html.length, index + 360)));
  }
}

const pidLinks = [...html.matchAll(/href=["']([^"']*pid=\d+[^"']*)["']/gi)].map((m) => m[1]);
console.log("PID_LINKS", pidLinks.length);
console.log(pidLinks.slice(0, 50));

const onclicks = [...html.matchAll(/onclick=["']([^"']+)["']/gi)].map((m) => m[1]);
const interestingOnclick = onclicks.filter((v) => /pid|cat|product|page|fill|tab|class|show|ajax/i.test(v));
console.log("INTERESTING_ONCLICKS", interestingOnclick.length);
console.log(interestingOnclick.slice(0, 80));

const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
const hints = scripts
  .flatMap((s) => [...s.matchAll(/(product\.php\?[^'"\s]+|product_detail\.php\?id=\d+|pid\s*=\s*\d+|cid\s*=\s*\d+|cat\w*\s*=\s*\d+|page\s*=\s*\d+)/gi)].map((m) => m[1]))
  .filter(Boolean);
console.log("SCRIPT_HINTS", hints.length);
console.log(hints.slice(0, 120));
