#!/usr/bin/env node

import admin from "firebase-admin";
import fs from "node:fs";

function loadServiceAccount() {
  const candidates = ["./sa.json", "./sa.json.json"];
  for (const candidate of candidates) {
    const url = new URL(candidate, import.meta.url);
    if (!fs.existsSync(url)) continue;
    return JSON.parse(fs.readFileSync(url, "utf8"));
  }
  throw new Error("Missing service account file: sa.json");
}

function normalizeSearchableAddress(value) {
  let text = String(value || "").trim();
  if (!text) return "";

  text = text.normalize("NFKC");
  text = text.replace(/臺/g, "台");
  text = text.replace(/[（(][^）)]*[）)]/g, "");
  text = text.replace(/[（(].*$/, "");
  text = text.replace(/^[^\u4e00-\u9fffA-Za-z0-9]+/, "");
  text = text.replace(/^\d{1,2}[:：]\d{2}/, "");
  text = text.replace(/(?:密碼|密码|門禁|门禁|備註|备注)[:：#＃]?.*$/i, "");
  text = text.replace(/[#＃].*$/, "");
  text = text.replace(/([樓Ff])[-－].*$/, "$1");
  text = text.replace(/((?:號(?:之\d+)?|樓(?:之\d+)?|室))(?:[-－+＋].*)$/, "$1");
  text = text.trim();
  text = text.replace(/^(?:台灣|台湾)/, "");
  text = text.replace(/^[\u4e00-\u9fff]{2,3}[縣市]/, "");
  text = text.replace(/^[\u4e00-\u9fff]{1,4}(?:區|鄉|鎮|市)/, "");
  text = text.replace(/[\s,，、。．.\/\\]/g, "");
  text = text.replace(/([段巷弄號樓室層Ff])\1+/g, "$1");
  return text.trim();
}

const APPLY = process.argv.includes("--apply");
if (!APPLY) {
  console.log("[Dry-run] 不會寫入 Firestore，加上 --apply 才正式執行\n");
}

const sa = loadServiceAccount();
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

const snap = await db.collection("salesOrders").get();
let updated = 0;
let unchanged = 0;
let emptyAddress = 0;
let ops = 0;
let batch = db.batch();
const previews = [];

for (const docSnap of snap.docs) {
  const data = docSnap.data() || {};
  const siteAddress = String(data.siteAddress || "").trim();
  const searchableAddress = normalizeSearchableAddress(siteAddress);
  const current = String(data.searchableAddress || "").trim();

  if (!siteAddress) emptyAddress += 1;
  if (current === searchableAddress) {
    unchanged += 1;
    continue;
  }

  if (previews.length < 10) {
    previews.push({
      id: docSnap.id,
      orderNo: data.orderNo || "",
      siteAddress,
      searchableAddress,
    });
  }

  if (!APPLY) {
    updated += 1;
    continue;
  }

  batch.update(docSnap.ref, { searchableAddress });
  updated += 1;
  ops += 1;

  if (ops === 400) {
    await batch.commit();
    batch = db.batch();
    ops = 0;
  }
}

if (APPLY && ops > 0) {
  await batch.commit();
}

console.log(JSON.stringify({
  total: snap.size,
  updated,
  unchanged,
  emptyAddress,
  apply: APPLY,
  preview: previews,
}, null, 2));