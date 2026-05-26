<template>
  <div class="print-root">
    <!-- 工具列(不列印) -->
    <div class="toolbar no-print">
      <RouterLink class="btn" to="/orders/repair">← 返回</RouterLink>
      <button class="btn btn-primary" @click="doPrint" :disabled="loading || pdfLoading">
        🖨 列印
      </button>
      <span v-if="loading" class="hint">載入中…</span>
      <span v-if="pdfLoading" class="hint">確定單PDF轉繪中…</span>
      <span v-if="errMsg" class="err">{{ errMsg }}</span>
    </div>

    <!-- A4 直式列印頁 -->
    <div class="a4-portrait" v-if="ticket">
      <header class="doc-header">
        <h1>維修單</h1>
        <div class="doc-sub">
          <span>單號:{{ ticket.id?.slice(-8).toUpperCase() }}</span>
          <span>建立:{{ fmtTime(ticket.createdAt) }}</span>
        </div>
      </header>

      <!-- 基本資料 -->
      <table class="info-tbl">
        <tbody>
          <tr>
            <th>原訂單號</th>
            <td>{{ ticket.sourceOrderNo || "—" }}</td>
            <th>客戶</th>
            <td>{{ ticket.sourceCustomerName || "—" }}</td>
          </tr>
          <tr>
            <th>安裝地址</th>
            <td colspan="3">{{ ticket.sourceSiteAddress || "—" }}</td>
          </tr>
          <tr>
            <th>維修日</th>
            <td>{{ ticket.repairDate || "—" }}</td>
            <th>是否收費</th>
            <td>
              <strong :class="ticket.chargeable ? 'chargeable' : ''">
                {{ ticket.chargeable ? "收費 ✔" : "免費" }}
              </strong>
              <span v-if="ticket.newOrderId" class="ext-link">
                ／已轉新訂單
              </span>
            </td>
          </tr>
          <tr>
            <th>維修原因</th>
            <td colspan="3" class="reason-cell">{{ ticket.reason || "—" }}</td>
          </tr>
        </tbody>
      </table>

      <!-- 原訂單確定單 PDF (1/2 縮圖) -->
      <section class="pdf-section">
        <h2>原訂單確定單</h2>

        <div v-if="ticket.sourceCollection !== 'salesOrders'" class="dr-note">
          ※ 來源為舊系統訂單,無電子確定單PDF
        </div>
        <div v-else-if="pdfLoading" class="dr-note">確定單PDF轉繪中,請稍候…</div>
        <div v-else-if="pdfError" class="dr-note err-note">
          ⚠ 無法載入確定單PDF:{{ pdfError }}
          <div v-if="confirmedPdfUrl" style="margin-top:6px">
            <a :href="confirmedPdfUrl" target="_blank">直接開啟PDF</a>
          </div>
        </div>
        <div v-else-if="!confirmedPdfUrl" class="dr-note">
          ※ 原訂單尚未產生確定單PDF
        </div>
        <div v-else class="pdf-pages">
          <div v-for="(src, i) in pdfImages" :key="i" class="pdf-page-thumb">
            <img :src="src" alt="" />
          </div>
        </div>
      </section>

      <!-- 簽名 -->
      <footer class="sign-row">
        <div class="sign-box"><div class="sign-lbl">客戶簽名</div></div>
        <div class="sign-box"><div class="sign-lbl">服務人員</div></div>
        <div class="sign-box"><div class="sign-lbl">主管</div></div>
      </footer>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from "vue";
import { useRoute } from "vue-router";
import { getRepairTicket, getSalesOrder } from "../firebase";

const route = useRoute();
const ticket = ref(null);
const confirmedPdfUrl = ref("");
const pdfImages = ref([]);
const loading = ref(true);
const pdfLoading = ref(false);
const pdfError = ref("");
const errMsg = ref("");

function fmtTime(ts) {
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

async function renderPdfToImages(url) {
  pdfLoading.value = true;
  pdfError.value = "";
  pdfImages.value = [];
  try {
    const pdfjs = await import("pdfjs-dist");
    if (!pdfjs.GlobalWorkerOptions.workerSrc) {
      const workerUrl = (
        await import("pdfjs-dist/build/pdf.worker.min.mjs?url")
      ).default;
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
    }
    const task = pdfjs.getDocument({ url, withCredentials: false });
    const pdf = await task.promise;
    const imgs = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      // 高解析渲染(scale=2),顯示時再縮放
      // 強制忽略 PDF 內建 rotate;若實際寬<高,再轉 90° 變成 landscape
      let viewport = page.getViewport({ scale: 2, rotation: 0 });
      if (viewport.height > viewport.width) {
        viewport = page.getViewport({ scale: 2, rotation: 90 });
      }
      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({
        canvasContext: canvas.getContext("2d"),
        viewport,
      }).promise;
      imgs.push(canvas.toDataURL("image/png"));
    }
    pdfImages.value = imgs;
  } catch (e) {
    console.error("render pdf failed", e);
    pdfError.value = e?.message || String(e);
  } finally {
    pdfLoading.value = false;
  }
}

async function load() {
  loading.value = true;
  try {
    const t = await getRepairTicket(route.params.id);
    if (!t) {
      errMsg.value = "找不到此維修單";
      return;
    }
    ticket.value = t;
    if (t.sourceCollection === "salesOrders" && t.sourceOrderId) {
      const ord = await getSalesOrder(t.sourceOrderId).catch(() => null);
      const url = ord?.confirmedPdfUrl || "";
      confirmedPdfUrl.value = url;
      if (url) {
        await renderPdfToImages(url);
      }
    }
  } catch (e) {
    errMsg.value = e?.message || "載入失敗";
  } finally {
    loading.value = false;
  }
}

function doPrint() {
  window.print();
}

onMounted(async () => {
  await load();
  if (!errMsg.value) {
    setTimeout(() => window.print(), 800);
  }
});
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
.btn-primary:disabled {
  background: #6b7280;
  cursor: not-allowed;
}
.hint {
  color: #cbd5e1;
  font-size: 13px;
}
.err {
  color: #fca5a5;
  font-size: 13px;
}

/* A4 直式：210 x 297 mm */
.a4-portrait {
  width: 210mm;
  min-height: 297mm;
  background: #fff;
  margin: 0 auto;
  padding: 12mm 10mm;
  box-sizing: border-box;
  box-shadow: 0 4px 18px rgba(0, 0, 0, 0.35);
  font-family: "微軟正黑體", "Microsoft JhengHei", Arial, sans-serif;
  color: #111;
  font-size: 12pt;
}
.doc-header {
  text-align: center;
  border-bottom: 2px solid #000;
  padding-bottom: 6px;
  margin-bottom: 10px;
}
.doc-header h1 {
  margin: 0;
  font-size: 22pt;
  letter-spacing: 6px;
}
.doc-sub {
  margin-top: 4px;
  font-size: 10pt;
  color: #555;
  display: flex;
  justify-content: space-between;
}

/* 資訊表 */
.info-tbl {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 10px;
  font-size: 11pt;
}
.info-tbl th,
.info-tbl td {
  border: 1px solid #333;
  padding: 5px 8px;
  vertical-align: top;
}
.info-tbl th {
  background: #f0f0f0;
  font-weight: 600;
  width: 70px;
  text-align: center;
  white-space: nowrap;
}
.reason-cell {
  white-space: pre-wrap;
  min-height: 50px;
}
.chargeable {
  color: #b91c1c;
  font-size: 13pt;
}
.ext-link {
  color: #1e40af;
  margin-left: 8px;
  font-size: 10pt;
}

/* PDF 縮圖區 */
.pdf-section h2 {
  margin: 6px 0 6px;
  font-size: 13pt;
  border-left: 4px solid #2563eb;
  padding-left: 6px;
}
.dr-note {
  color: #6b7280;
  font-size: 10pt;
  padding: 12px;
  text-align: center;
  border: 1px dashed #d1d5db;
  border-radius: 4px;
}
.err-note {
  color: #b91c1c;
  border-color: #fca5a5;
  background: #fef2f2;
}
.pdf-pages {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}
.pdf-page-thumb {
  /* A4 橫式 297mm 寬,縮 1/2 = 148.5mm,可塞進 A4 直式 190mm 內 */
  width: 148mm;
  border: 1px solid #ccc;
  page-break-inside: avoid;
  background: #fff;
}
.pdf-page-thumb img {
  display: block;
  width: 100%;
  height: auto;
}

/* 簽名 */
.sign-row {
  display: flex;
  gap: 12px;
  margin-top: 16px;
  page-break-inside: avoid;
}
.sign-box {
  flex: 1;
  border: 1px solid #333;
  height: 60px;
  position: relative;
}
.sign-lbl {
  position: absolute;
  top: 4px;
  left: 6px;
  font-size: 10pt;
  color: #555;
}

/* ─── 列印樣式 ─── */
@media print {
  @page {
    size: A4 portrait;
    margin: 0;
  }
  .print-root {
    background: #fff;
    padding: 0;
  }
  .no-print {
    display: none !important;
  }
  .a4-portrait {
    box-shadow: none;
    margin: 0;
  }
}
</style>
