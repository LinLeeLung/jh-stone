if (process.platform === "win32") {
  process.stdout.reconfigure?.({ encoding: "utf8" });
  process.stderr.reconfigure?.({ encoding: "utf8" });
}

import admin from "firebase-admin";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MEDIA_EXTS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".bmp",
  ".webp",
  ".heic",
  ".heif",
  ".mp4",
  ".mov",
  ".avi",
  ".m4v",
  ".3gp",
  ".mkv",
  ".webm",
]);

const CONTENT_TYPE_BY_EXT = new Map([
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".png", "image/png"],
  [".gif", "image/gif"],
  [".bmp", "image/bmp"],
  [".webp", "image/webp"],
  [".heic", "image/heic"],
  [".heif", "image/heif"],
  [".mp4", "video/mp4"],
  [".mov", "video/quicktime"],
  [".avi", "video/x-msvideo"],
  [".m4v", "video/x-m4v"],
  [".3gp", "video/3gpp"],
  [".mkv", "video/x-matroska"],
  [".webm", "video/webm"],
]);

function parseArgs(argv) {
  const options = {
    month: "2026-05",
    limit: 20,
    offset: 0,
    concurrency: 3,
    apply: false,
  };
  for (const arg of argv) {
    if (arg.startsWith("--month=")) {
      options.month = arg.slice("--month=".length).trim();
      continue;
    }
    if (arg.startsWith("--limit=")) {
      const value = Number.parseInt(arg.slice("--limit=".length), 10);
      if (Number.isFinite(value) && value > 0) options.limit = value;
      continue;
    }
    if (arg.startsWith("--offset=")) {
      const value = Number.parseInt(arg.slice("--offset=".length), 10);
      if (Number.isFinite(value) && value >= 0) options.offset = value;
      continue;
    }
    if (arg.startsWith("--concurrency=")) {
      const value = Number.parseInt(arg.slice("--concurrency=".length), 10);
      if (Number.isFinite(value) && value > 0) options.concurrency = value;
      continue;
    }
    if (arg === "--apply") {
      options.apply = true;
    }
  }
  return options;
}

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

function loadServiceAccount() {
  const candidates = ["./sa.json", "./sa.json.json"];
  for (const candidate of candidates) {
    const url = new URL(candidate, import.meta.url);
    if (!fs.existsSync(url)) continue;
    return JSON.parse(fs.readFileSync(url, "utf8"));
  }
  throw new Error("Missing service account file: sa.json");
}

function loadEnv() {
  const candidates = [".env.local", ".env"];
  for (const candidate of candidates) {
    const fullPath = path.join(__dirname, candidate);
    if (!fs.existsSync(fullPath)) continue;
    return parseEnv(fullPath);
  }
  throw new Error("Missing .env.local or .env");
}

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeDateToken(value) {
  const raw = normalizeText(value);
  if (!raw) return "";
  const match = raw.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})$/);
  if (!match) return raw;
  const [, year, month, day] = match;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function normalizeSynologyDirPath(inputPath = "") {
  const normalized = String(inputPath || "")
    .replace(/\\/g, "/")
    .replace(/\/+/g, "/")
    .replace(/\/$/, "")
    .trim();
  if (!normalized) return "";
  return normalized.startsWith("/") ? normalized : `/${normalized}`;
}

function normalizeForOrder(value) {
  return String(value || "")
    .replace(/[^A-Z0-9]/gi, "")
    .toUpperCase();
}

function pickOrderSummary(docSnap) {
  const data = docSnap.data() || {};
  const installDate = normalizeText(
    data["安裝日"] || data.installDate || data["施工日期"] || data.date,
  );
  return {
    id: docSnap.id,
    orderNo: normalizeText(
      data["訂單號碼"] || data.orderNo || data.orderNumber,
    ),
    customerName: normalizeText(
      data["客戶名稱"] || data.customerName || data["客戶"],
    ),
    color: normalizeText(data["顏色"] || data.color || data["石材"]),
    installAddress: normalizeText(
      data["安裝地點"] ||
        data.installAddress ||
        data["安裝地址"] ||
        data["地址"],
    ),
    installDate,
    normalizedInstallDate: normalizeDateToken(installDate),
  };
}

async function parseJsonSafe(resp) {
  try {
    return await resp.json();
  } catch {
    return {};
  }
}

async function synologyLogin(baseUrl, username, password) {
  const url = new URL("/webapi/auth.cgi", baseUrl);
  url.searchParams.set("api", "SYNO.API.Auth");
  url.searchParams.set("version", "6");
  url.searchParams.set("method", "login");
  url.searchParams.set("account", username);
  url.searchParams.set("passwd", password);
  url.searchParams.set("session", "FileStation");
  url.searchParams.set("format", "sid");
  const resp = await fetch(url.toString());
  const json = await parseJsonSafe(resp);
  if (!json.success || !json?.data?.sid) {
    throw new Error(`NAS login failed: ${JSON.stringify(json)}`);
  }
  return json.data.sid;
}

async function synologyLogout(baseUrl, sid) {
  if (!sid) return;
  const url = new URL("/webapi/auth.cgi", baseUrl);
  url.searchParams.set("api", "SYNO.API.Auth");
  url.searchParams.set("version", "6");
  url.searchParams.set("method", "logout");
  url.searchParams.set("session", "FileStation");
  url.searchParams.set("_sid", sid);
  await fetch(url.toString()).catch(() => {});
}

async function listFolderEntries(baseUrl, sid, folderPath) {
  const url = new URL("/webapi/entry.cgi", baseUrl);
  url.searchParams.set("api", "SYNO.FileStation.List");
  url.searchParams.set("version", "2");
  url.searchParams.set("method", "list");
  url.searchParams.set("folder_path", folderPath);
  url.searchParams.set("additional", JSON.stringify(["real_path", "time"]));
  url.searchParams.set("_sid", sid);
  const resp = await fetch(url.toString());
  const json = await parseJsonSafe(resp);
  if (!resp.ok || !json.success) {
    throw new Error(`List folder failed: ${folderPath}`);
  }
  return Array.isArray(json.data?.files) ? json.data.files : [];
}

async function searchFolders(baseUrl, sid, rootPath, pattern) {
  const startUrl = new URL("/webapi/entry.cgi", baseUrl);
  startUrl.searchParams.set("api", "SYNO.FileStation.Search");
  startUrl.searchParams.set("version", "2");
  startUrl.searchParams.set("method", "start");
  startUrl.searchParams.set("folder_path", rootPath);
  startUrl.searchParams.set("pattern", `*${pattern}*`);
  startUrl.searchParams.set("recursive", "true");
  startUrl.searchParams.set("_sid", sid);
  const startResp = await fetch(startUrl.toString());
  const startJson = await parseJsonSafe(startResp);
  if (!startResp.ok || !startJson.success || !startJson.data?.taskid) {
    return [];
  }

  const taskId = startJson.data.taskid;
  let files = [];
  for (let i = 0; i < 20; i += 1) {
    const listUrl = new URL("/webapi/entry.cgi", baseUrl);
    listUrl.searchParams.set("api", "SYNO.FileStation.Search");
    listUrl.searchParams.set("version", "2");
    listUrl.searchParams.set("method", "list");
    listUrl.searchParams.set("taskid", taskId);
    listUrl.searchParams.set("offset", "0");
    listUrl.searchParams.set("limit", "1000");
    listUrl.searchParams.set(
      "additional",
      JSON.stringify(["real_path", "time"]),
    );
    listUrl.searchParams.set("_sid", sid);
    const listResp = await fetch(listUrl.toString());
    const listJson = await parseJsonSafe(listResp);
    if (listResp.ok && listJson.success) {
      const all = Array.isArray(listJson.data?.files)
        ? listJson.data.files
        : [];
      files = all.filter((entry) => entry?.isdir);
      if (listJson.data?.finished === true || files.length > 0) break;
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  const cleanUrl = new URL("/webapi/entry.cgi", baseUrl);
  cleanUrl.searchParams.set("api", "SYNO.FileStation.Search");
  cleanUrl.searchParams.set("version", "2");
  cleanUrl.searchParams.set("method", "clean");
  cleanUrl.searchParams.set("taskid", taskId);
  cleanUrl.searchParams.set("_sid", sid);
  fetch(cleanUrl.toString()).catch(() => {});

  return files;
}

function scoreFolderCandidate(entry, orderNumber) {
  const name = normalizeText(entry?.name);
  const pathValue = normalizeText(entry?.path);
  const normalizedOrder = normalizeForOrder(orderNumber);
  const normalizedName = normalizeForOrder(name);
  const normalizedPath = normalizeForOrder(pathValue);
  let score = 0;
  if (normalizedName.includes(normalizedOrder)) score += 10000;
  if (normalizedPath.includes(normalizedOrder)) score += 3000;
  if (name.includes(orderNumber)) score += 500;
  return score;
}

async function findOrderFolder(baseUrl, sid, basePath, order) {
  const orderNumber = normalizeText(order.orderNo);
  if (!orderNumber) {
    return {
      matched: false,
      uploadFolder: "",
      matchedFolderName: "",
      matchScore: 0,
    };
  }

  const sharedFolderRoot = "/" + basePath.split("/").filter(Boolean)[0];
  const searchRoots =
    sharedFolderRoot && sharedFolderRoot !== basePath
      ? [basePath, sharedFolderRoot]
      : [basePath];

  let entries = [];
  for (const rootPath of searchRoots) {
    const result = await searchFolders(baseUrl, sid, rootPath, orderNumber);
    if (result.length > 0) {
      entries = result;
      break;
    }
  }

  const candidates = entries
    .map((entry) => ({
      name: normalizeText(entry?.name),
      path: normalizeText(entry?.path),
      score: scoreFolderCandidate(entry, orderNumber),
    }))
    .filter((entry) => entry.name && entry.path && entry.score > 0)
    .sort(
      (a, b) => b.score - a.score || a.name.localeCompare(b.name, "zh-Hant"),
    );

  if (!candidates.length || candidates[0].score < 5000) {
    return {
      matched: false,
      uploadFolder: "",
      matchedFolderName: "",
      matchScore: 0,
    };
  }

  return {
    matched: true,
    uploadFolder: candidates[0].path,
    matchedFolderName: candidates[0].name,
    matchScore: candidates[0].score,
  };
}

async function countMediaFiles(baseUrl, sid, folderPath) {
  const stack = [folderPath];
  let mediaCount = 0;
  const sampleFiles = [];
  while (stack.length > 0) {
    const current = stack.pop();
    const entries = await listFolderEntries(baseUrl, sid, current).catch(
      () => [],
    );
    for (const entry of entries) {
      if (entry?.isdir) {
        stack.push(normalizeText(entry.path || `${current}/${entry.name}`));
        continue;
      }
      const name = normalizeText(entry?.name);
      const ext = path.extname(name).toLowerCase();
      if (!MEDIA_EXTS.has(ext)) continue;
      mediaCount += 1;
      if (sampleFiles.length < 5) sampleFiles.push(name);
    }
  }
  return { mediaCount, sampleFiles };
}

async function listMediaFiles(baseUrl, sid, folderPath) {
  const stack = [folderPath];
  const mediaFiles = [];
  while (stack.length > 0) {
    const current = stack.pop();
    const entries = await listFolderEntries(baseUrl, sid, current).catch(
      () => [],
    );
    for (const entry of entries) {
      if (entry?.isdir) {
        stack.push(normalizeText(entry.path || `${current}/${entry.name}`));
        continue;
      }
      const name = normalizeText(entry?.name);
      const ext = path.extname(name).toLowerCase();
      if (!MEDIA_EXTS.has(ext)) continue;
      mediaFiles.push({
        fileName: name,
        nasPath: normalizeText(entry.path || `${current}/${name}`),
        contentType: CONTENT_TYPE_BY_EXT.get(ext) || "application/octet-stream",
      });
    }
  }
  mediaFiles.sort((a, b) => a.fileName.localeCompare(b.fileName, "zh-Hant"));
  return mediaFiles;
}

async function getExistingPhotoPaths(orderId) {
  const snap = await db
    .collection("Orders")
    .doc(orderId)
    .collection("completionPhotos")
    .get();
  const paths = new Set();
  for (const docSnap of snap.docs) {
    const row = docSnap.data() || {};
    const nasPath = normalizeText(row.nasPath);
    if (nasPath) paths.add(nasPath);
  }
  return paths;
}

async function backfillPhotoMetadata(order, folderPath, mediaFiles) {
  const orderRef = db.collection("Orders").doc(order.id);
  const existingPaths = await getExistingPhotoPaths(order.id);
  const toCreate = mediaFiles.filter((row) => !existingPaths.has(row.nasPath));
  if (!toCreate.length) {
    await orderRef.set({ nasOrderFolderPath: folderPath }, { merge: true });
    return { created: 0, skippedExisting: mediaFiles.length };
  }

  let created = 0;
  let skippedExisting = mediaFiles.length - toCreate.length;
  for (let i = 0; i < toCreate.length; i += 400) {
    const chunk = toCreate.slice(i, i + 400);
    const batch = db.batch();
    batch.set(orderRef, { nasOrderFolderPath: folderPath }, { merge: true });
    for (const file of chunk) {
      const photoRef = orderRef.collection("completionPhotos").doc();
      batch.set(photoRef, {
        orderDocId: order.id,
        orderNumber: order.orderNo,
        customerName: order.customerName,
        color: order.color,
        installAddress: order.installAddress,
        客戶名稱: order.customerName,
        顏色: order.color,
        安裝地點: order.installAddress,
        fileName: file.fileName,
        contentType: file.contentType,
        size: 0,
        nasPath: file.nasPath,
        installTaskId: null,
        uploadedByUid: "system-nas-backfill",
        uploadedByName: "system-nas-backfill",
        uploadedByEmail: "",
        uploadedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedByUid: "system-nas-backfill",
        updatedByName: "system-nas-backfill",
        updatedByEmail: "",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        nasSync: {
          status: "success",
          targetPath: file.nasPath,
          syncedAt: admin.firestore.FieldValue.serverTimestamp(),
          matchedExistingFolder: true,
          matchedFolderName: path.basename(folderPath),
          matchScore: 99999,
          source: "nas-legacy-backfill",
        },
      });
    }
    await batch.commit();
    created += chunk.length;
  }

  return { created, skippedExisting };
}

async function runWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;
  async function loop() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await worker(items[currentIndex], currentIndex);
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, () =>
    loop(),
  );
  await Promise.all(workers);
  return results;
}

const options = parseArgs(process.argv.slice(2));
const env = loadEnv();
const sa = loadServiceAccount();
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

const baseUrl = normalizeText(
  env.SYNO_BASE_URL || "https://junchengstone.synology.me:5001",
).replace(/\/+$/, "");
const username = normalizeText(env.SYNO_USERNAME);
const password = normalizeText(env.SYNO_PASSWORD);
if (!username || !password) {
  throw new Error("Missing SYNO_USERNAME or SYNO_PASSWORD in .env.local/.env");
}

const generalSnap = await db.collection("SystemSettings").doc("general").get();
const generalData = generalSnap.exists ? generalSnap.data() || {} : {};
const nasOrderPath = normalizeSynologyDirPath(
  generalData.nasOrderPath || generalData.nasStoragePath || "",
);
if (!nasOrderPath) {
  throw new Error(
    "SystemSettings/general missing nasOrderPath or nasStoragePath",
  );
}

const ordersSnap = await db
  .collection("Orders")
  .select(
    "訂單號碼",
    "orderNo",
    "orderNumber",
    "客戶名稱",
    "customerName",
    "顏色",
    "color",
    "安裝地點",
    "安裝地址",
    "installAddress",
    "地址",
    "安裝日",
    "installDate",
    "施工日期",
    "date",
  )
  .get();

const scopedOrders = ordersSnap.docs
  .map(pickOrderSummary)
  .filter(
    (row) =>
      row.orderNo && row.normalizedInstallDate.startsWith(`${options.month}-`),
  )
  .sort(
    (a, b) =>
      a.normalizedInstallDate.localeCompare(b.normalizedInstallDate) ||
      a.orderNo.localeCompare(b.orderNo),
  );

const targetOrders = scopedOrders.slice(
  options.offset,
  options.offset + options.limit,
);

let sid = "";
try {
  sid = await synologyLogin(baseUrl, username, password);
  const results = await runWithConcurrency(
    targetOrders,
    options.concurrency,
    async (order) => {
      const folder = await findOrderFolder(baseUrl, sid, nasOrderPath, order);
      if (!folder.matched) {
        return {
          ...order,
          foundFolder: false,
          folderPath: "",
          folderName: "",
          mediaCount: 0,
          sampleFiles: [],
          created: 0,
          skippedExisting: 0,
        };
      }
      const mediaFiles = options.apply
        ? await listMediaFiles(baseUrl, sid, folder.uploadFolder)
        : [];
      const media = options.apply
        ? {
            mediaCount: mediaFiles.length,
            sampleFiles: mediaFiles.slice(0, 5).map((row) => row.fileName),
          }
        : await countMediaFiles(baseUrl, sid, folder.uploadFolder);
      const backfillResult = options.apply
        ? await backfillPhotoMetadata(order, folder.uploadFolder, mediaFiles)
        : { created: 0, skippedExisting: 0 };
      return {
        ...order,
        foundFolder: true,
        folderPath: folder.uploadFolder,
        folderName: folder.matchedFolderName,
        mediaCount: media.mediaCount,
        sampleFiles: media.sampleFiles,
        created: backfillResult.created,
        skippedExisting: backfillResult.skippedExisting,
      };
    },
  );

  const foundFolders = results.filter((row) => row.foundFolder);
  const withMedia = foundFolders.filter((row) => row.mediaCount > 0);
  const createdPhotos = results.reduce(
    (sum, row) => sum + Number(row.created || 0),
    0,
  );
  const skippedExistingPhotos = results.reduce(
    (sum, row) => sum + Number(row.skippedExisting || 0),
    0,
  );
  const report = {
    mode: options.apply ? "apply" : "dry-run",
    month: options.month,
    totalOrdersInMonth: scopedOrders.length,
    scanned: targetOrders.length,
    offset: options.offset,
    limit: options.limit,
    nasOrderPath,
    foundFolders: foundFolders.length,
    foldersWithMedia: withMedia.length,
    foldersWithoutMedia: foundFolders.length - withMedia.length,
    missingFolders: results.length - foundFolders.length,
    createdPhotos,
    skippedExistingPhotos,
    sampleMatches: withMedia.slice(0, 20),
    sampleMissing: results.filter((row) => !row.foundFolder).slice(0, 20),
  };

  console.log(JSON.stringify(report, null, 2));
} finally {
  await synologyLogout(baseUrl, sid);
}
