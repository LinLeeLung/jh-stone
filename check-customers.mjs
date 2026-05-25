import { readFileSync } from "node:fs";
const data = JSON.parse(readFileSync("data/parsed/customers.json", "utf8"));
const bad = data.filter(r =>
  /^\d{2}-\d/.test(r.code) ||
  /^0\d{3}/.test(r.code) ||
  r.code.includes('"') ||
  (r.name && r.name.includes('"')) ||
  r.code.trim() !== r.code
);
bad.forEach(r => console.log(JSON.stringify(r)));
console.log("共", bad.length, "筆異常");
