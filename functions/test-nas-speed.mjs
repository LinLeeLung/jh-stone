/**
 * 測試 NAS 資料夾查詢速度
 * 用法：node test-nas-speed.mjs
 */

// Windows PowerShell 預設 code page 不是 UTF-8，強制設成 UTF-8 避免中文亂碼
if (process.platform === "win32") {
  process.stdout.reconfigure?.({ encoding: "utf8" });
  process.stderr.reconfigure?.({ encoding: "utf8" });
}

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseEnv(filePath) {
  const map = {};
  const content = fs.readFileSync(filePath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx < 1) continue;
    map[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return map;
}

const env = parseEnv(path.join(__dirname, ".env.local"));
const BASE_URL = (
  env.SYNO_BASE_URL || "https://junchengstone.synology.me:5001"
).replace(/\/+$/, "");
const USERNAME = env.SYNO_USERNAME || "";
const PASSWORD = env.SYNO_PASSWORD || "";
const NAS_PATH = "/峻晟/01-訂單相關檔案/0--客戶訂貨單";

const ORDER_NUMBERS = [
  "26260-15重ACU",
  "27119ANB",
  "27203-1BIZ",
  "27251-1ACU",
  "27251ACU",
  "27252ZZY",
  "27264BFB",
  "27268BDD",
  "27269AVC",
  "27270BFB",
  "27273BET",
  "27279BAH",
  "27290ANO",
];

const CUSTOMER_CODE_LOOKUP = {
  ACU: "073",
  ANB: "340",
  AQT: "435",
  AXQ: "624",
  BFB: "817",
  ASW: "491",
  ADW: "101",
  AVZ: "052",
  ACC: "055",
  ACI: "061",
  BET: "809",
  AUU: "541",
  AAE: "005",
  BBY: "736",
  BIZ: "914",
  ZZY: "999",
  BDD: "767",
  AVC: "549",
  BAH: "693",
  ANO: "353",
};

async function parseJsonSafe(resp) {
  try {
    return await resp.json();
  } catch {
    return {};
  }
}

async function synologyLogin() {
  const url = new URL("/webapi/auth.cgi", BASE_URL);
  url.searchParams.set("api", "SYNO.API.Auth");
  url.searchParams.set("version", "6");
  url.searchParams.set("method", "login");
  url.searchParams.set("account", USERNAME);
  url.searchParams.set("passwd", PASSWORD);
  url.searchParams.set("session", "FileStation");
  url.searchParams.set("format", "sid");
  const resp = await fetch(url.toString());
  const json = await parseJsonSafe(resp);
  if (!json.success) throw new Error("Login failed: " + JSON.stringify(json));
  return json.data.sid;
}

async function synologyLogout(sid) {
  const url = new URL("/webapi/auth.cgi", BASE_URL);
  url.searchParams.set("api", "SYNO.API.Auth");
  url.searchParams.set("version", "6");
  url.searchParams.set("method", "logout");
  url.searchParams.set("session", "FileStation");
  url.searchParams.set("_sid", sid);
  await fetch(url.toString()).catch(() => {});
}

async function listFolder(sid, folderPath) {
  const url = new URL("/webapi/entry.cgi", BASE_URL);
  url.searchParams.set("api", "SYNO.FileStation.List");
  url.searchParams.set("version", "2");
  url.searchParams.set("method", "list");
  url.searchParams.set("folder_path", folderPath);
  url.searchParams.set("additional", JSON.stringify(["real_path", "time"]));
  url.searchParams.set("_sid", sid);
  const resp = await fetch(url.toString());
  const json = await parseJsonSafe(resp);
  if (!json.success) {
    console.error(
      `[listFolder 失敗] path="${folderPath}" →`,
      JSON.stringify(json),
    );
    return [];
  }
  return (json.data?.files || []).filter((f) => f?.isdir);
}

async function searchFolders(sid, rootPath, pattern) {
  // Start search
  const startUrl = new URL("/webapi/entry.cgi", BASE_URL);
  startUrl.searchParams.set("api", "SYNO.FileStation.Search");
  startUrl.searchParams.set("version", "2");
  startUrl.searchParams.set("method", "start");
  startUrl.searchParams.set("folder_path", rootPath);
  startUrl.searchParams.set("pattern", `*${pattern}*`);
  startUrl.searchParams.set("recursive", "true");
  startUrl.searchParams.set("_sid", sid);
  const startResp = await fetch(startUrl.toString());
  const startJson = await parseJsonSafe(startResp);
  if (!startJson.success) throw new Error("Search start failed");
  const taskid = startJson.data?.taskid;

  const pollDelays = [
    300, 300, 300, 300, 300, 400, 400, 400, 400, 500, 500, 500, 500, 500, 500,
    500, 500, 500, 500, 500,
  ];
  let files = [];
  for (let i = 0; i < pollDelays.length; i++) {
    await new Promise((r) => setTimeout(r, pollDelays[i]));
    const listUrl = new URL("/webapi/entry.cgi", BASE_URL);
    listUrl.searchParams.set("api", "SYNO.FileStation.Search");
    listUrl.searchParams.set("version", "2");
    listUrl.searchParams.set("method", "list");
    listUrl.searchParams.set("taskid", taskid);
    listUrl.searchParams.set("offset", "0");
    listUrl.searchParams.set("limit", "1000");
    listUrl.searchParams.set(
      "additional",
      JSON.stringify(["real_path", "time"]),
    );
    listUrl.searchParams.set("_sid", sid);
    const listResp = await fetch(listUrl.toString());
    const listJson = await parseJsonSafe(listResp);
    if (!listResp.ok || !listJson.success) continue;
    const all = Array.isArray(listJson.data?.files) ? listJson.data.files : [];
    files = all.filter((f) => f?.isdir);
    const finished = listJson.data?.finished === true;
    if (finished || files.length > 0) break;
  }

  // Cleanup
  const cleanUrl = new URL("/webapi/entry.cgi", BASE_URL);
  cleanUrl.searchParams.set("api", "SYNO.FileStation.Search");
  cleanUrl.searchParams.set("version", "2");
  cleanUrl.searchParams.set("method", "clean");
  cleanUrl.searchParams.set("taskid", taskid);
  cleanUrl.searchParams.set("_sid", sid);
  fetch(cleanUrl.toString()).catch(() => {});

  if (files.length === 0) {
    console.error(
      `[searchFolders] root="${rootPath}" pattern="${pattern}" → 0 dirs found (finished=${finished})`,
    );
  }
  return files;
}

async function listOrderFoldersParallel(sid, customerCode, customerNumber) {
  const allDirs = await listFolder(sid, NAS_PATH);
  let clientFolders = [];
  if (customerCode) {
    clientFolders = allDirs.filter((e) =>
      String(e.name || "")
        .toUpperCase()
        .includes(customerCode),
    );
  }
  if (clientFolders.length === 0 && customerNumber) {
    const numStr = String(customerNumber).replace(/^0+/, "");
    clientFolders = allDirs.filter((e) =>
      String(e.name || "").includes(numStr),
    );
  }
  // 找不到客戶代碼時不掃全部，直接回傳空讓 Search API 接手
  if (clientFolders.length === 0) return [];

  const foldersToScan = clientFolders.slice(0, 10);
  const secondLevel = await Promise.all(
    foldersToScan.map(async (cf) => {
      try {
        return await listFolder(sid, cf.path);
      } catch {
        return [];
      }
    }),
  );
  return secondLevel.flat();
}

async function findFolder(sid, orderNumber) {
  const orderMatch = orderNumber.match(/(\d{5})([A-Z]{3})$/i);
  let customerCode = "";
  let customerNumber = "";
  if (orderMatch) {
    customerCode = orderMatch[2].toUpperCase();
  } else {
    const m = orderNumber.match(/[A-Z]{3}$/i);
    if (m) customerCode = m[0].toUpperCase();
  }
  customerNumber = CUSTOMER_CODE_LOOKUP[customerCode] || "";

  const sharedFolderRoot = "/" + NAS_PATH.split("/").filter(Boolean)[0];
  const searchRoots =
    sharedFolderRoot !== NAS_PATH ? [NAS_PATH, sharedFolderRoot] : [NAS_PATH];

  const parallelListPromise = listOrderFoldersParallel(
    sid,
    customerCode,
    customerNumber,
  ).then((r) => (r.length > 0 ? r : Promise.reject(new Error("empty"))));

  const searchPromises = searchRoots.map((root) =>
    searchFolders(sid, root, orderNumber).then((r) =>
      r.length > 0 ? r : Promise.reject(new Error("empty")),
    ),
  );

  try {
    const timeoutPromise = new Promise((_, rej) =>
      setTimeout(() => rej(new Error("timeout")), 12000),
    );
    const entries = await Promise.race([
      Promise.any([parallelListPromise, ...searchPromises]),
      timeoutPromise,
    ]);
    // 找包含訂單號碼的資料夾
    const match = entries.find((e) =>
      String(e.name || "").includes(orderNumber),
    );
    if (match) return { found: match.name, candidates: [] };
    return { found: null, candidates: entries.map((e) => e.name) };
  } catch {
    return { found: null, candidates: [] };
  }
}

async function main() {
  console.log(`登入 NAS ${BASE_URL} ...`);
  const sid = await synologyLogin();
  console.log("登入成功\n");

  // 先列出第一層資料夾，確認命名規則
  console.log("=== 試列 /峻晟 根目錄 ===");
  const root = await listFolder(sid, "/峻晟");
  root.slice(0, 20).forEach((f) => console.log(" ", f.name));
  console.log(`（共 ${root.length} 個）\n`);

  // 再試列 NAS_PATH，如果失敗就印出所有根目錄資料夾名稱的 hex code 輔助診斷
  console.log(`=== 試列 NAS_PATH: ${NAS_PATH} ===`);
  const level1 = await listFolder(sid, NAS_PATH);
  if (level1.length > 0) {
    level1.slice(0, 25).forEach((f) => console.log(" ", f.name));
    console.log(`（共 ${level1.length} 個）\n`);
  } else {
    console.log("→ 失敗！實際根目錄資料夾名稱 hex（前 5 個）:");
    root.slice(0, 5).forEach((f) => {
      const hex = Buffer.from(f.name, "utf8").toString("hex");
      console.log(`  "${f.name}" = ${hex}`);
    });
    console.log();
  }

  const results = [];
  for (const orderNo of ORDER_NUMBERS) {
    const t0 = Date.now();
    let result = { found: null, candidates: [] };
    try {
      result = await findFolder(sid, orderNo);
    } catch (e) {
      result = { found: null, candidates: [], error: e.message };
    }
    const ms = Date.now() - t0;
    results.push({ orderNo, result, ms });
    const summary = result.found
      ? "✓ 找到"
      : result.candidates.length > 0
        ? `(${result.candidates.length} 個候選，無精確匹配)`
        : "未找到";
    console.log(
      `${orderNo.padEnd(16)} ${ms.toString().padStart(6)} ms  ${summary}`,
    );
    if (result.found) {
      console.log(`   → ${result.found}`);
    } else if (result.candidates.length > 0) {
      result.candidates.forEach((n) => console.log(`   → ${n}`));
    }
  }

  console.log("\n--- 統計 ---");
  const times = results.map((r) => r.ms);
  console.log(`最快：${Math.min(...times)} ms`);
  console.log(`最慢：${Math.max(...times)} ms`);
  console.log(
    `平均：${Math.round(times.reduce((a, b) => a + b, 0) / times.length)} ms`,
  );

  await synologyLogout(sid);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
