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

function parseArgs(argv) {
  const options = {
    before: "",
    month: "",
    sampleSize: 20,
  };
  for (const arg of argv) {
    if (arg.startsWith("--before=")) {
      options.before = arg.slice("--before=".length).trim();
      continue;
    }
    if (arg.startsWith("--month=")) {
      options.month = arg.slice("--month=".length).trim();
      continue;
    }
    if (arg.startsWith("--sample=")) {
      const value = Number.parseInt(arg.slice("--sample=".length), 10);
      if (Number.isFinite(value) && value > 0) options.sampleSize = value;
    }
  }
  return options;
}

function normalizeText(value) {
  return String(value || "").trim();
}

function pickOrderNo(data) {
  return normalizeText(data["訂單號碼"] || data.orderNo || data.order_number);
}

function pickInstallDate(data) {
  return normalizeText(
    data["安裝日"] || data.installDate || data["施工日期"] || data.date,
  );
}

function normalizeDateToken(value) {
  const raw = normalizeText(value);
  if (!raw) return "";
  const match = raw.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})$/);
  if (!match) return raw;
  const [, year, month, day] = match;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function buildOrderSummary(doc, photoCount) {
  const data = doc.data() || {};
  return {
    id: doc.id,
    orderNo: pickOrderNo(data),
    installDate: pickInstallDate(data),
    normalizedInstallDate: normalizeDateToken(pickInstallDate(data)),
    photoCount,
  };
}

const options = parseArgs(process.argv.slice(2));
const cutoff = normalizeDateToken(options.before);
const monthFilter = String(options.month || "").trim();

const sa = loadServiceAccount();
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

const orderSnap = await db
  .collection("Orders")
  .select("訂單號碼", "orderNo", "安裝日", "installDate", "施工日期", "date")
  .get();

const photoSnap = await db.collectionGroup("completionPhotos").get();

const photoCountByOrderPath = new Map();
for (const photoDoc of photoSnap.docs) {
  const parentDoc = photoDoc.ref.parent.parent;
  if (!parentDoc) continue;
  photoCountByOrderPath.set(
    parentDoc.path,
    (photoCountByOrderPath.get(parentDoc.path) || 0) + 1,
  );
}

const ordersWithPhotos = [];
const ordersWithoutPhotos = [];
const ordersBeforeCutoffWithoutPhotos = [];
const ordersBeforeCutoffWithPhotos = [];
const ordersInMonthWithPhotos = [];
const ordersInMonthWithoutPhotos = [];
const knownOrderPaths = new Set();

for (const doc of orderSnap.docs) {
  const orderPath = doc.ref.path;
  knownOrderPaths.add(orderPath);
  const photoCount = photoCountByOrderPath.get(orderPath) || 0;
  const summary = buildOrderSummary(doc, photoCount);
  if (photoCount > 0) {
    ordersWithPhotos.push(summary);
  } else {
    ordersWithoutPhotos.push(summary);
  }

  if (
    cutoff &&
    summary.normalizedInstallDate &&
    summary.normalizedInstallDate <= cutoff
  ) {
    if (photoCount > 0) {
      ordersBeforeCutoffWithPhotos.push(summary);
    } else {
      ordersBeforeCutoffWithoutPhotos.push(summary);
    }
  }

  if (
    monthFilter &&
    summary.normalizedInstallDate.startsWith(`${monthFilter}-`)
  ) {
    if (photoCount > 0) {
      ordersInMonthWithPhotos.push(summary);
    } else {
      ordersInMonthWithoutPhotos.push(summary);
    }
  }
}

const orphanedPhotoParents = [...photoCountByOrderPath.entries()]
  .filter(([orderPath]) => !knownOrderPaths.has(orderPath))
  .map(([orderPath, photoCount]) => ({ orderPath, photoCount }));

ordersWithoutPhotos.sort((a, b) =>
  a.normalizedInstallDate.localeCompare(b.normalizedInstallDate),
);
ordersWithPhotos.sort((a, b) =>
  a.normalizedInstallDate.localeCompare(b.normalizedInstallDate),
);
ordersBeforeCutoffWithoutPhotos.sort((a, b) =>
  a.normalizedInstallDate.localeCompare(b.normalizedInstallDate),
);
ordersBeforeCutoffWithPhotos.sort((a, b) =>
  a.normalizedInstallDate.localeCompare(b.normalizedInstallDate),
);
ordersInMonthWithPhotos.sort((a, b) =>
  a.normalizedInstallDate.localeCompare(b.normalizedInstallDate),
);
ordersInMonthWithoutPhotos.sort((a, b) =>
  a.normalizedInstallDate.localeCompare(b.normalizedInstallDate),
);
orphanedPhotoParents.sort((a, b) => b.photoCount - a.photoCount);

const report = {
  cutoff: cutoff || null,
  month: monthFilter || null,
  totalOrders: orderSnap.size,
  totalCompletionPhotos: photoSnap.size,
  distinctPhotoParents: photoCountByOrderPath.size,
  ordersWithPhotos: ordersWithPhotos.length,
  ordersWithoutPhotos: ordersWithoutPhotos.length,
  orphanedPhotoParents: orphanedPhotoParents.length,
  beforeCutoff: cutoff
    ? {
        totalOrders:
          ordersBeforeCutoffWithPhotos.length +
          ordersBeforeCutoffWithoutPhotos.length,
        withPhotos: ordersBeforeCutoffWithPhotos.length,
        withoutPhotos: ordersBeforeCutoffWithoutPhotos.length,
      }
    : null,
  inMonth: monthFilter
    ? {
        totalOrders:
          ordersInMonthWithPhotos.length + ordersInMonthWithoutPhotos.length,
        withPhotos: ordersInMonthWithPhotos.length,
        withoutPhotos: ordersInMonthWithoutPhotos.length,
      }
    : null,
  samples: {
    withoutPhotos: ordersWithoutPhotos.slice(0, options.sampleSize),
    withPhotos: ordersWithPhotos.slice(
      -Math.min(options.sampleSize, ordersWithPhotos.length),
    ),
    beforeCutoffWithoutPhotos: ordersBeforeCutoffWithoutPhotos.slice(
      0,
      options.sampleSize,
    ),
    inMonthWithoutPhotos: ordersInMonthWithoutPhotos.slice(
      0,
      options.sampleSize,
    ),
    orphanedPhotoParents: orphanedPhotoParents.slice(0, options.sampleSize),
  },
};

console.log(JSON.stringify(report, null, 2));
