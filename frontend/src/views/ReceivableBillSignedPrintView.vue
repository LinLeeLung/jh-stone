<template>
  <div class="print-root">
    <div class="toolbar no-print">
      <RouterLink class="btn" :to="`/receivable-bills/${route.params.id}`">← 返回帳單</RouterLink>
      <button class="btn" @click="toggleLayoutMode" :disabled="loading">
        {{ layoutMode === 'portrait-2up' ? '改橫式雙張' : '改直式雙張' }}
      </button>
      <button class="btn btn-primary" @click="doPrint" :disabled="loading || !printEntries.length">🖨 列印回簽</button>
      <span v-if="loading" class="hint">載入中…</span>
      <span v-else class="hint">{{ layoutMode === 'portrait-2up' ? '每頁 2 張最新回簽（直式）' : '每頁 2 張最新回簽（橫式）' }}</span>
      <span v-if="errMsg" class="err">{{ errMsg }}</span>
    </div>

    <div v-if="!loading && !printPages.length" class="empty-card">
      <h2>沒有可列印的回簽</h2>
      <p>這張帳單底下的訂單目前沒有可用的最新回簽檔。</p>
    </div>

    <div
      v-for="(page, pageIndex) in printPages"
      :key="`page-${pageIndex}`"
      :class="['a4-page', { 'portrait-page': layoutMode === 'portrait-2up' }]"
    >
      <header class="page-header">
        <div>
          <div class="doc-title">最新回簽批次列印</div>
          <div class="doc-sub">{{ bill?.billNo || route.params.id }} / {{ bill?.customerSnapshot?.name || "—" }}</div>
        </div>
        <div class="doc-page-no">第 {{ pageIndex + 1 }} / {{ printPages.length }} 頁</div>
      </header>

      <section v-for="entry in page" :key="entry.item.id" class="scan-card">
        <div class="scan-body">
          <img
            v-if="previewImageSrc(entry)"
            class="scan-image"
            :src="previewImageSrc(entry)"
            alt="回簽影像"
          />
          <div v-else class="scan-fallback">
            此檔案格式無法直接預覽，請改用原始檔查看。
            <a :href="entry.scan.url" target="_blank" rel="noopener noreferrer">開啟原始檔</a>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import { RouterLink, useRoute } from "vue-router";
import { getReceivableBill, getSalesOrder, listReceivableItemsByBill } from "../firebase";
import pdfjsWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";

const route = useRoute();
const loading = ref(true);
const errMsg = ref("");
const bill = ref(null);
const items = ref([]);
const renderedPdfPreviews = ref({});
const layoutMode = ref("portrait-2up");

const printEntries = computed(() =>
  items.value
    .map((item) => ({ item, scan: latestSignedScan(item.sourceOrder) }))
    .filter((entry) => entry.scan?.url),
);

const printPages = computed(() => {
  const pages = [];
  const pageSize = 2;
  for (let index = 0; index < printEntries.value.length; index += pageSize) {
    pages.push(printEntries.value.slice(index, index + pageSize));
  }
  return pages;
});

function toggleLayoutMode() {
  layoutMode.value = layoutMode.value === "portrait-2up" ? "landscape-2up" : "portrait-2up";
}

function coerceDate(value) {
  if (!value) return null;
  if (typeof value?.toDate === "function") return value.toDate();
  if (value instanceof Date) return value;
  if (typeof value === "object" && Number.isFinite(Number(value.seconds))) {
    return new Date(Number(value.seconds) * 1000);
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function latestSignedScan(order = {}) {
  const signedScans = Array.isArray(order?.signedScans)
    ? order.signedScans.filter((item) => item?.url)
    : [];

  if (signedScans.length) {
    return [...signedScans].sort((a, b) => {
      const timeA = coerceDate(a?.uploadedAt)?.getTime() || 0;
      const timeB = coerceDate(b?.uploadedAt)?.getTime() || 0;
      return timeB - timeA;
    })[0];
  }

  return order?.signedScanUrl
    ? {
        url: order.signedScanUrl,
        uploadedAt: order.customerSignedAt || null,
      }
    : null;
}

function signedScanUrlExtension(scan = {}) {
  const rawUrl = String(scan?.url || "").trim();
  if (!rawUrl) return "";
  try {
    const parsed = new URL(rawUrl);
    const fileName = decodeURIComponent(parsed.pathname.split("/").pop() || "");
    const match = fileName.match(/\.([a-zA-Z0-9]+)$/);
    return String(match?.[1] || "").toLowerCase();
  } catch {
    const cleanUrl = rawUrl.split("?")[0];
    const match = cleanUrl.match(/\.([a-zA-Z0-9]+)$/);
    return String(match?.[1] || "").toLowerCase();
  }
}

function isPdfScan(scan = {}) {
  return signedScanUrlExtension(scan) === "pdf";
}

function isImageScan(scan = {}) {
  return ["png", "jpg", "jpeg", "webp", "gif"].includes(signedScanUrlExtension(scan));
}

function signedScanPreviewUrl(scan = {}) {
  const rawUrl = String(scan?.url || "").trim();
  if (!rawUrl) return "";
  return isPdfScan(scan)
    ? `${rawUrl}${rawUrl.includes("#") ? "" : "#toolbar=0&navpanes=0&scrollbar=0&view=FitH"}`
    : rawUrl;
}

function previewImageSrc(entry = {}) {
  if (isImageScan(entry.scan)) return entry.scan.url || "";
  if (isPdfScan(entry.scan)) return renderedPdfPreviews.value[entry.scan.url] || "";
  return "";
}

async function renderPdfPreview(url) {
  try {
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

    const task = pdfjs.getDocument({ url, withCredentials: false });
    const pdf = await task.promise;
    const page = await pdf.getPage(1);
    let viewport = page.getViewport({ scale: 1.8, rotation: 0 });
    if (viewport.width < viewport.height) {
      viewport = page.getViewport({ scale: 1.8, rotation: 90 });
    }
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({
      canvasContext: canvas.getContext("2d"),
      viewport,
    }).promise;
    const trimmedCanvas = trimCanvasWhitespace(canvas);
    renderedPdfPreviews.value = {
      ...renderedPdfPreviews.value,
      [url]: trimmedCanvas.toDataURL("image/png"),
    };
  } catch (error) {
    console.error("render signed pdf preview failed", error);
  }
}

function trimCanvasWhitespace(sourceCanvas) {
  const context = sourceCanvas.getContext("2d", { willReadFrequently: true });
  if (!context) return sourceCanvas;
  const { width, height } = sourceCanvas;
  const imageData = context.getImageData(0, 0, width, height).data;
  let top = height;
  let left = width;
  let right = 0;
  let bottom = 0;
  let found = false;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const r = imageData[offset];
      const g = imageData[offset + 1];
      const b = imageData[offset + 2];
      const a = imageData[offset + 3];
      const isBlank = a === 0 || (r > 245 && g > 245 && b > 245);
      if (!isBlank) {
        found = true;
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
  }

  if (!found) return sourceCanvas;

  const padding = 10;
  const cropLeft = Math.max(0, left - padding);
  const cropTop = Math.max(0, top - padding);
  const cropRight = Math.min(width, right + padding);
  const cropBottom = Math.min(height, bottom + padding);
  const cropWidth = Math.max(1, cropRight - cropLeft);
  const cropHeight = Math.max(1, cropBottom - cropTop);
  const trimmedCanvas = document.createElement("canvas");
  trimmedCanvas.width = cropWidth;
  trimmedCanvas.height = cropHeight;
  const trimmedContext = trimmedCanvas.getContext("2d");
  if (!trimmedContext) return sourceCanvas;
  trimmedContext.drawImage(
    sourceCanvas,
    cropLeft,
    cropTop,
    cropWidth,
    cropHeight,
    0,
    0,
    cropWidth,
    cropHeight,
  );
  return trimmedCanvas;
}

async function load() {
  loading.value = true;
  errMsg.value = "";
  try {
    bill.value = await getReceivableBill(route.params.id);
    const rows = await listReceivableItemsByBill(route.params.id);
    items.value = await Promise.all(
      rows.map(async (item) => ({
        ...item,
        sourceOrder: item.sourceOrderId ? await getSalesOrder(item.sourceOrderId) : null,
      })),
    );
    await Promise.all(
      printEntries.value
        .map((entry) => entry.scan)
        .filter((scan) => isPdfScan(scan) && scan?.url)
        .map((scan) => renderPdfPreview(scan.url)),
    );
    if (printEntries.value.length) {
      setTimeout(() => window.print(), 500);
    }
  } catch (error) {
    errMsg.value = error?.message || String(error);
  } finally {
    loading.value = false;
  }
}

function doPrint() {
  window.print();
}

onMounted(load);
</script>

<style scoped>
.print-root {
  background: #e5e7eb;
  min-height: 100vh;
  padding: 16px 0;
}

.toolbar {
  position: sticky;
  top: 0;
  z-index: 100;
  background: #1e293b;
  color: #fff;
  padding: 8px 16px;
  display: flex;
  gap: 12px;
  align-items: center;
  margin-bottom: 16px;
}

.btn {
  padding: 6px 14px;
  border-radius: 6px;
  background: #475569;
  color: #fff;
  border: none;
  text-decoration: none;
  cursor: pointer;
  font-size: 14px;
}

.btn-primary {
  background: #2563eb;
}

.hint {
  color: #cbd5e1;
  font-size: 13px;
}

.err {
  color: #fca5a5;
  font-size: 13px;
}

.empty-card,
.a4-page {
  width: 297mm;
  min-height: 210mm;
  margin: 0 auto 12px;
  background: #fff;
  box-sizing: border-box;
  box-shadow: 0 4px 18px rgba(0, 0, 0, 0.25);
}

.empty-card {
  min-height: auto;
  padding: 24px;
}

.a4-page {
  height: 210mm;
  padding: 3mm 4mm;
  display: grid;
  grid-template-rows: auto repeat(2, minmax(0, 1fr));
  gap: 2mm;
  overflow: hidden;
  page: landscape-sheet;
}

.portrait-page {
  width: 210mm;
  min-height: 297mm;
  height: 297mm;
  grid-template-rows: auto repeat(2, minmax(0, 1fr));
  page: portrait-sheet;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  border-bottom: 1px solid #111;
  padding-bottom: 1.5mm;
}

.doc-title {
  font-size: 11pt;
  font-weight: 700;
}

.doc-sub,
.doc-page-no {
  font-size: 7pt;
  color: #475569;
}

.scan-card {
  min-height: 0;
  border: 1px solid #cbd5e1;
  overflow: hidden;
  break-inside: avoid;
  page-break-inside: avoid;
}

.scan-body {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  padding: 0;
  overflow: hidden;
  background: #fff;
}

.scan-image {
  width: 100%;
  height: 100%;
  max-height: 100%;
  border: 0;
  object-fit: contain;
  object-position: center center;
}

.scan-fallback {
  font-size: 10pt;
  color: #475569;
}

@media print {
  @page landscape-sheet {
    size: A4 landscape;
    margin: 0;
  }

  @page portrait-sheet {
    size: A4 portrait;
    margin: 0;
  }

  .portrait-page {
    width: 210mm;
    height: 297mm;
    min-height: 297mm;
    page-break-after: always;
  }

  .no-print {
    display: none !important;
  }

  .print-root {
    background: #fff;
    padding: 0;
  }

  .empty-card,
  .a4-page {
    box-shadow: none;
    margin: 0;
    height: 210mm;
  }

  .portrait-page {
    height: 297mm;
    min-height: 297mm;
  }

  .a4-page {
    page-break-after: always;
  }

  .a4-page:last-child {
    page-break-after: auto;
  }
}
</style>