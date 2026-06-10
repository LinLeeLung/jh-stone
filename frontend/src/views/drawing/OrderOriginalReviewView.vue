<template>
  <div class="review-page">
    <header class="review-header">
      <RouterLink class="back-btn" to="/orders">← 返回訂單</RouterLink>
      <RouterLink class="back-btn" :to="`/orders/${orderId}/confirmation`"
        >📋 確定單</RouterLink
      >
      <div class="title-wrap">
        <h1>原圖對圖註記</h1>
        <p v-if="order" class="meta">
          {{ order.customerName || "—" }}
          <span v-if="order.orderNo">｜{{ order.orderNo }}</span>
        </p>
      </div>
      <div class="header-actions">
        <a
          v-if="latestDesignFile?.url"
          :href="latestDesignFile.url"
          target="_blank"
          rel="noopener noreferrer"
          class="btn"
        >
          開原圖
        </a>
        <button
          v-if="canAnnotateFile"
          class="btn"
          :disabled="saveBacking"
          @click="saveBackAsPdf"
        >
          {{ saveBacking ? "另存中..." : "另存PDF註記版" }}
        </button>
        <button class="btn primary" :disabled="saving" @click="saveReview">
          {{ saving ? "儲存中..." : "儲存註記" }}
        </button>
      </div>
    </header>

    <div class="review-layout">
      <aside class="panel">
        <div class="panel-block drawing-shortcut">
          <h3>本單繪圖</h3>
          <div class="drawing-actions">
            <RouterLink class="btn" :to="`/orders/${orderId}/drawing`"
              >前往繪圖</RouterLink
            >
            <a
              class="btn"
              :href="`/orders/${orderId}/drawing`"
              target="_blank"
              rel="noopener noreferrer"
            >
              另開繪圖
            </a>
            <button class="btn" type="button" @click="openDrawingSplitView">
              並排開啟
            </button>
          </div>
        </div>

        <h2>對圖檢核</h2>
        <div class="checklist-head muted">
          已完成 {{ checklistDoneCount }} / {{ checklistItems.length }}
        </div>
        <div class="muted checklist-tip">
          項目為全站共用；勾選狀態為本張原圖獨立。
        </div>
        <p v-if="checklistTemplateMsg" class="checklist-template-msg muted">
          {{ checklistTemplateMsg }}
        </p>
        <div class="checklist-add">
          <input
            v-model.trim="newChecklistText"
            type="text"
            placeholder="新增檢核項目，例如：水槽位置已對圖"
            @keydown.enter.prevent="addChecklistItem"
          />
          <button class="btn" type="button" @click="addChecklistItem">
            新增
          </button>
        </div>
        <ul v-if="checklistItems.length" class="checklist-list">
          <li
            v-for="item in checklistItems"
            :key="item.id"
            class="checklist-row"
          >
            <label class="checklist-main">
              <input v-model="item.checked" type="checkbox" />
              <input
                v-model="item.text"
                type="text"
                class="checklist-text"
                placeholder="檢核項目"
                @blur="saveSharedChecklistTemplateFromCurrent"
              />
            </label>
            <button
              class="btn btn-del-item"
              type="button"
              @click="removeChecklistItem(item.id)"
            >
              刪除
            </button>
          </li>
        </ul>
        <p v-else class="muted">尚未建立檢核項目</p>
        <p v-if="saveMsg" class="save-msg">{{ saveMsg }}</p>

        <div class="panel-block">
          <h3>最新記錄圖</h3>
          <template v-if="latestReviewImageUrl">
            <a
              :href="latestReviewImageUrl"
              target="_blank"
              rel="noopener noreferrer"
            >
              <img :src="latestReviewImageUrl" alt="最新記錄圖" class="thumb" />
            </a>
          </template>
          <p v-else class="muted">尚未儲存記錄圖</p>
        </div>

        <div class="panel-block">
          <h3>最新註記 PDF</h3>
          <a
            v-if="latestReviewPdfUrl"
            :href="latestReviewPdfUrl"
            target="_blank"
            rel="noopener noreferrer"
          >
            開啟最新註記 PDF
          </a>
          <p v-else class="muted">尚未另存註記 PDF</p>
        </div>
      </aside>

      <section class="canvas-section">
        <div class="canvas-body">
          <div class="canvas-main">
            <div v-if="!latestDesignFile" class="empty-state">
              此訂單尚無原圖檔。
            </div>

            <div v-else-if="!canAnnotateFile" class="empty-state">
              目前原圖不是可註記格式（僅支援 PDF / 圖片）。
              <br />
              可先填寫重點記錄並儲存，或點上方「開原圖」檢視原檔。
            </div>

            <div v-else-if="pdfRenderError" class="empty-state">
              PDF 載入失敗：{{ pdfRenderError }}
            </div>
            <div v-else-if="imageRenderError" class="empty-state">
              原圖載入失敗：{{ imageRenderError }}
              <br />
              檔名：{{ latestDesignFile?.name || "(未知檔名)" }}
            </div>
            <div v-else ref="captureRef" class="image-canvas-wrap">
              <img
                v-if="isImageFile"
                ref="baseImageRef"
                :src="latestDesignFile.url"
                alt="原圖"
                class="base-image"
                @load="onBaseImageLoad"
                @error="onBaseImageError"
              />
              <img v-else style="display: none" />
              <canvas
                v-if="isPdfFile"
                ref="pdfBaseCanvasRef"
                class="base-image base-pdf-canvas"
              />
              <div
                ref="objectLayerRef"
                class="object-layer"
                :class="{ interactive: objectLayerInteractive }"
                @pointerdown="onObjectLayerPointerDown"
                @pointermove="onObjectLayerPointerMove"
                @pointerup="onObjectLayerPointerUp"
                @pointerleave="onObjectLayerPointerUp"
              >
                <div
                  v-for="obj in annotationObjects"
                  :key="obj.id"
                  class="annotation-object"
                  :class="[obj.type, { selected: selectedObjectId === obj.id }]"
                  :style="annotationObjectStyle(obj)"
                  @pointerdown.stop="onObjectPointerDown(obj, $event)"
                >
                  <template v-if="obj.type === 'text'">{{ obj.text }}</template>
                </div>
                <div
                  v-if="objectDraft"
                  class="annotation-object draft"
                  :class="objectDraft.type"
                  :style="annotationObjectStyle(objectDraft)"
                >
                  <template v-if="objectDraft.type === 'text'">{{
                    objectDraft.text
                  }}</template>
                </div>
              </div>
              <canvas ref="overlayCanvasRef" class="overlay-canvas" />
              <canvas
                ref="drawCanvasRef"
                class="draw-canvas"
                @pointerdown="onPointerDown"
                @pointermove="onPointerMove"
                @pointerup="onPointerUp"
                @pointerleave="onPointerUp"
              />
            </div>
            <p v-if="isPdfFile" class="muted pdf-tip">
              PDF 共 {{ pdfPageCount || "?" }} 頁（最多預覽 10
              頁），可直接編輯與回存。
            </p>
            <p v-if="isPdfFile && pdfRendering" class="muted pdf-tip">
              PDF 載入中，請稍候...
            </p>
          </div>

          <aside v-if="canAnnotateFile" class="tools-side">
            <div class="tools">
              <div class="tool-group">
                <button class="btn" type="button" @click="clearCanvas">
                  清除畫線
                </button>
                <button
                  class="btn"
                  type="button"
                  :disabled="!canUndo"
                  @click="undoDraw"
                >
                  復原
                </button>
                <button
                  class="btn"
                  type="button"
                  :disabled="!canRedo"
                  @click="redoDraw"
                >
                  重做
                </button>
              </div>
              <div class="tool-group">
                <button
                  class="btn"
                  :class="{ 'btn-tool-active': toolMode === 'text' }"
                  type="button"
                  @click="setToolMode('text')"
                >
                  打字機
                </button>
                <template v-if="toolMode === 'text'">
                  <input
                    v-model="textDraft"
                    class="text-draft"
                    placeholder="輸入文字後，點圖面放置"
                  />
                  <label class="muted">字級 {{ textSize }}</label>
                  <input
                    v-model.number="textSize"
                    type="range"
                    min="10"
                    max="48"
                    step="1"
                  />
                  <label class="muted text-bg-toggle">
                    <input v-model="textBgEnabled" type="checkbox" />
                    文字底色
                  </label>
                </template>
                <button
                  class="btn"
                  :class="{ 'btn-tool-active': toolMode === 'draw' }"
                  type="button"
                  @click="setToolMode('draw')"
                >
                  畫筆
                </button>
                <button
                  class="btn"
                  :class="{ 'btn-tool-active': toolMode === 'rect' }"
                  type="button"
                  @click="setToolMode('rect')"
                >
                  矩形
                </button>
                <button
                  class="btn"
                  :class="{ 'btn-tool-active': toolMode === 'ellipse' }"
                  type="button"
                  @click="setToolMode('ellipse')"
                >
                  圓形
                </button>
              </div>
              <div class="tool-group">
                <button
                  class="btn"
                  :class="{ 'btn-tool-active': eraserMode }"
                  type="button"
                  @click="toggleEraser"
                >
                  {{ eraserMode ? "橡皮擦中" : "橡皮擦" }}
                </button>
              </div>
              <div class="tool-group">
                <label class="muted">筆粗 {{ brushSize }}</label>
                <input
                  v-model.number="brushSize"
                  type="range"
                  min="1"
                  max="14"
                  step="1"
                />
              </div>
              <div class="tool-group color-palette">
                <button
                  v-for="color in brushPalette"
                  :key="color"
                  class="color-chip"
                  :class="{ active: !eraserMode && activeColor === color }"
                  :style="{ backgroundColor: color }"
                  type="button"
                  @click="applyColor(color)"
                />
              </div>
              <div v-if="selectedObject" class="tool-group object-editor">
                <span class="muted"
                  >已選取：{{
                    selectedObject.type === "text"
                      ? "文字"
                      : selectedObject.type === "rect"
                        ? "矩形"
                        : "圓形"
                  }}</span
                >
                <input
                  v-if="selectedObject.type === 'text'"
                  v-model="selectedObject.text"
                  class="text-draft"
                  placeholder="文字內容"
                />
                <label v-if="selectedObject.type === 'text'" class="muted"
                  >字級 {{ selectedObject.fontSize }}</label
                >
                <input
                  v-if="selectedObject.type === 'text'"
                  v-model.number="selectedObject.fontSize"
                  type="range"
                  min="10"
                  max="48"
                  step="1"
                />
                <label v-else class="muted"
                  >線寬 {{ selectedObject.strokeWidth }}</label
                >
                <input
                  v-if="selectedObject.type !== 'text'"
                  v-model.number="selectedObject.strokeWidth"
                  type="range"
                  min="1"
                  max="14"
                  step="1"
                />
                <label
                  v-if="selectedObject.type === 'text'"
                  class="muted text-bg-toggle"
                >
                  <input v-model="selectedObject.background" type="checkbox" />
                  文字底色
                </label>
                <button class="btn" type="button" @click="deleteSelectedObject">
                  刪除物件
                </button>
              </div>
              <span class="muted"
                >可直接在原圖上畫線標記重點，再按「儲存註記」。</span
              >
            </div>
          </aside>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, onBeforeUnmount, ref, nextTick } from "vue";
import { useRoute, useRouter, RouterLink } from "vue-router";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import {
  getDesignReviewChecklistTemplate,
  getSalesOrder,
  listOrderAttachments,
  saveDesignReviewChecklistTemplate,
  uploadOrderAttachment,
  updateSalesOrder,
  downloadStorageFileBytes,
} from "../../firebase";

const route = useRoute();
const router = useRouter();
const orderId = computed(() => String(route.params.id || ""));

function openDrawingSplitView() {
  if (!orderId.value) return;
  const resolved = router.resolve({
    name: "order-drawing",
    params: { id: orderId.value },
  });
  const width = Math.max(980, Math.round(window.innerWidth * 0.58));
  const height = Math.max(700, Math.round(window.innerHeight * 0.9));
  const left = Math.max(0, window.screenX + (window.outerWidth - width));
  const top = Math.max(0, window.screenY + 40);
  const features = [
    "noopener=yes",
    "noreferrer=yes",
    `width=${width}`,
    `height=${height}`,
    `left=${left}`,
    `top=${top}`,
    "resizable=yes",
    "scrollbars=yes",
  ].join(",");
  window.open(resolved.href, "order-drawing-split", features);
}

const order = ref(null);
const designFiles = ref([]);
const reviewFiles = ref([]);
const reviewPdfFiles = ref([]);
const reviewOverlayFiles = ref([]);
const checklistItems = ref([]);
const sharedChecklistTemplateItems = ref([]);
const newChecklistText = ref("");
const checklistTemplateMsg = ref("");
const saving = ref(false);
const saveBacking = ref(false);
const saveMsg = ref("");

const captureRef = ref(null);
const baseImageRef = ref(null);
const pdfBaseCanvasRef = ref(null);
const objectLayerRef = ref(null);
const overlayCanvasRef = ref(null);
const drawCanvasRef = ref(null);
const pdfRenderError = ref("");
const pdfRendering = ref(false);
const pdfPageCount = ref(0);
const imageRenderError = ref("");

const isDrawing = ref(false);
const hasInk = ref(false);
const brushColor = ref("#ef4444");
const brushSize = ref(3);
const eraserMode = ref(false);
const toolMode = ref("draw");
const textDraft = ref("");
const textSize = ref(20);
const textBgEnabled = ref(true);
const shapeStartPoint = ref(null);
const annotationObjects = ref([]);
const selectedObjectId = ref(null);
const objectDraft = ref(null);
const dragState = ref(null);
const objectLayerSize = ref({ width: 0, height: 0 });
const undoStack = ref([]);
const redoStack = ref([]);
const brushPalette = ["#ef4444", "#2563eb", "#16a34a", "#eab308", "#111827"];
const canUndo = computed(() => undoStack.value.length > 0);
const canRedo = computed(() => redoStack.value.length > 0);
const checklistDoneCount = computed(
  () => checklistItems.value.filter((item) => item.checked).length,
);
const selectedObject = computed(
  () =>
    annotationObjects.value.find((obj) => obj.id === selectedObjectId.value) ||
    null,
);
const activeColor = computed(
  () => selectedObject.value?.color || brushColor.value,
);
const objectLayerInteractive = computed(
  () => toolMode.value !== "draw" && !eraserMode.value,
);

function isEditedDesignFileName(name) {
  return /-edited-\d{8}-\d{6}\.pdf$/i.test(String(name || ""));
}

function newChecklistId() {
  return `chk-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeChecklistTemplateItems(rawList, fallbackNote = "") {
  if (Array.isArray(rawList) && rawList.length) {
    return rawList
      .map((item) => ({
        id: String(item?.id || newChecklistId()),
        text: String(item?.text || "").trim(),
      }))
      .filter((item) => item.text);
  }

  const lines = String(fallbackNote || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.map((text) => ({ id: newChecklistId(), text }));
}

function buildChecklistCheckedMap(rawState, rawChecklist = []) {
  const map = {};

  if (Array.isArray(rawState)) {
    for (const item of rawState) {
      const id = String(item?.id || "").trim();
      if (!id) continue;
      map[id] = !!item?.checked;
    }
  } else if (rawState && typeof rawState === "object") {
    for (const [id, checked] of Object.entries(rawState)) {
      const normalizedId = String(id || "").trim();
      if (!normalizedId) continue;
      map[normalizedId] = !!checked;
    }
  }

  if (Array.isArray(rawChecklist)) {
    for (const item of rawChecklist) {
      const id = String(item?.id || "").trim();
      if (!id) continue;
      if (!(id in map)) map[id] = !!item?.checked;
    }
  }

  return map;
}

function hydrateChecklistItems(templateItems, checkedMap) {
  checklistItems.value = templateItems.map((item) => ({
    id: String(item.id || newChecklistId()),
    text: String(item.text || "").trim(),
    checked: !!checkedMap[String(item.id || "")],
  }));
}

function buildChecklistTemplateFromCurrent() {
  return buildChecklistPayload().map((item) => ({
    id: item.id,
    text: item.text,
  }));
}

async function saveSharedChecklistTemplateFromCurrent() {
  const template = buildChecklistTemplateFromCurrent();
  try {
    await saveDesignReviewChecklistTemplate(template);
    sharedChecklistTemplateItems.value = template;
    checklistTemplateMsg.value = "共用項目已更新";
  } catch (_error) {
    checklistTemplateMsg.value = "共用項目更新失敗（可能權限不足）";
  }
}

async function addChecklistItem() {
  const text = String(newChecklistText.value || "").trim();
  if (!text) return;
  checklistItems.value.push({
    id: newChecklistId(),
    text,
    checked: false,
  });
  newChecklistText.value = "";
  await saveSharedChecklistTemplateFromCurrent();
}

async function removeChecklistItem(id) {
  checklistItems.value = checklistItems.value.filter((item) => item.id !== id);
  await saveSharedChecklistTemplateFromCurrent();
}

function buildChecklistPayload() {
  return checklistItems.value
    .map((item) => ({
      id: String(item?.id || newChecklistId()),
      text: String(item?.text || "").trim(),
      checked: !!item?.checked,
    }))
    .filter((item) => item.text);
}

const latestDesignFile = computed(() => {
  const files = Array.isArray(designFiles.value) ? designFiles.value : [];
  const original = files.find((f) => !isEditedDesignFileName(f?.name));
  return original || files[0] || null;
});
const latestReviewImageUrl = computed(() => {
  if (order.value?.latestDesignReviewImageUrl)
    return order.value.latestDesignReviewImageUrl;
  return reviewFiles.value[0]?.url || "";
});

const latestReviewPdfUrl = computed(() => {
  if (order.value?.latestDesignReviewPdfUrl)
    return order.value.latestDesignReviewPdfUrl;
  return reviewPdfFiles.value[0]?.url || "";
});

const latestReviewOverlayUrl = computed(() => {
  if (order.value?.latestDesignReviewOverlayUrl)
    return order.value.latestDesignReviewOverlayUrl;
  return reviewOverlayFiles.value[0]?.url || "";
});

const isImageFile = computed(() => {
  const name = String(latestDesignFile.value?.name || "").toLowerCase();
  return /\.(png|jpe?g|webp|gif|bmp)$/i.test(name);
});

const isPdfFile = computed(() => {
  const name = String(latestDesignFile.value?.name || "").toLowerCase();
  return /\.pdf$/i.test(name);
});

const canAnnotateFile = computed(() => isImageFile.value || isPdfFile.value);

let _pdfJsPromise;
let _pdfWasmUrlPromise;
async function getPdfJs() {
  if (!_pdfJsPromise) {
    _pdfJsPromise = (async () => {
      const pdfjs = await import("pdfjs-dist");
      if (!pdfjs.GlobalWorkerOptions.workerSrc) {
        const workerUrl = (
          await import("pdfjs-dist/build/pdf.worker.min.mjs?url")
        ).default;
        pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
      }
      return pdfjs;
    })();
  }
  return _pdfJsPromise;
}

async function getPdfWasmUrl() {
  if (!_pdfWasmUrlPromise) {
    _pdfWasmUrlPromise = (async () => {
      const jbig2WasmUrl = (await import("pdfjs-dist/wasm/jbig2.wasm?url"))
        .default;
      return jbig2WasmUrl.replace(/jbig2\.wasm(?:\?.*)?$/i, "");
    })();
  }
  return _pdfWasmUrlPromise;
}

async function renderPdfFirstPage(file) {
  if (!file) return;
  pdfRenderError.value = "";
  imageRenderError.value = "";
  pdfRendering.value = true;
  pdfPageCount.value = 0;
  try {
    await nextTick();
    const targetCanvas = pdfBaseCanvasRef.value;
    if (!targetCanvas) {
      throw new Error("PDF 畫布尚未就緒");
    }
    const pdfjs = await getPdfJs();
    const wasmUrl = await getPdfWasmUrl();
    let task;
    if (file.storagePath) {
      try {
        const data = await downloadStorageFileBytes(file.storagePath);
        task = pdfjs.getDocument({
          data,
          disableWorker: true,
          useWasm: true,
          wasmUrl,
        });
      } catch (storageError) {
        console.warn("PDF bytes load failed, fallback to URL", storageError);
        task = pdfjs.getDocument({
          url: file.url,
          withCredentials: false,
          disableWorker: true,
          useWasm: true,
          wasmUrl,
        });
      }
    } else {
      task = pdfjs.getDocument({
        url: file.url,
        withCredentials: false,
        disableWorker: true,
        useWasm: true,
        wasmUrl,
      });
    }
    const pdf = await task.promise;
    pdfPageCount.value = pdf.numPages;
    const maxPages = Math.min(pdf.numPages, 10);
    const gap = 16;
    const pages = [];
    let baseMaxWidth = 0;

    for (let i = 1; i <= maxPages; i++) {
      const page = await pdf.getPage(i);
      const baseViewport = page.getViewport({ scale: 1 });
      pages.push({ page, baseViewport });
      baseMaxWidth = Math.max(baseMaxWidth, baseViewport.width);
    }

    const wrapWidth = captureRef.value?.clientWidth || 1200;
    const displayWidth = Math.max(900, Math.min(1600, wrapWidth - 40));
    const displayScale = Math.max(
      0.5,
      Math.min(2.2, displayWidth / Math.max(1, baseMaxWidth)),
    );
    const renderBoost = Math.max(window.devicePixelRatio || 1, 2);
    const renderScale = Math.max(0.75, Math.min(4, displayScale * renderBoost));

    const rendered = [];
    let renderMaxWidth = 0;
    let renderTotalHeight = 0;
    let displayMaxWidth = 0;
    let displayTotalHeight = 0;
    const renderGap = Math.max(8, Math.round(gap * renderBoost));
    for (const item of pages) {
      const renderViewport = item.page.getViewport({ scale: renderScale });
      const displayViewport = item.page.getViewport({ scale: displayScale });
      const pageCanvas = document.createElement("canvas");
      pageCanvas.width = Math.ceil(renderViewport.width);
      pageCanvas.height = Math.ceil(renderViewport.height);
      await item.page.render({
        canvasContext: pageCanvas.getContext("2d"),
        viewport: renderViewport,
      }).promise;
      rendered.push({ canvas: pageCanvas, renderViewport, displayViewport });
      renderMaxWidth = Math.max(renderMaxWidth, renderViewport.width);
      renderTotalHeight += renderViewport.height + renderGap;
      displayMaxWidth = Math.max(displayMaxWidth, displayViewport.width);
      displayTotalHeight += displayViewport.height + gap;
    }
    renderTotalHeight = Math.max(1, renderTotalHeight - renderGap);
    displayTotalHeight = Math.max(1, displayTotalHeight - gap);

    targetCanvas.width = Math.ceil(renderMaxWidth);
    targetCanvas.height = Math.ceil(renderTotalHeight);
    targetCanvas.style.width = `${Math.ceil(displayMaxWidth)}px`;
    targetCanvas.style.height = `${Math.ceil(displayTotalHeight)}px`;
    const ctx = targetCanvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, targetCanvas.width, targetCanvas.height);

    let y = 0;
    for (const item of rendered) {
      ctx.drawImage(item.canvas, 0, y);
      y += item.renderViewport.height + renderGap;
    }
  } catch (error) {
    console.error("PDF render failed", error);
    pdfRenderError.value = error?.message || String(error);
  } finally {
    pdfRendering.value = false;
  }
}

function onBaseImageLoad() {
  imageRenderError.value = "";
  syncCanvasSize();
}

function onBaseImageError() {
  imageRenderError.value = "可能是檔案連結失效、權限不足或檔案已被移動。";
}

async function loadAll() {
  if (!orderId.value) return;
  imageRenderError.value = "";
  pdfRenderError.value = "";
  const [ord, files, reviews, reviewPdfs, reviewOverlays, sharedTemplate] =
    await Promise.all([
      getSalesOrder(orderId.value),
      listOrderAttachments(orderId.value, "designFiles").catch(() => []),
      listOrderAttachments(orderId.value, "designReviewFiles").catch(() => []),
      listOrderAttachments(orderId.value, "designReviewPdfs").catch(() => []),
      listOrderAttachments(orderId.value, "designReviewOverlays").catch(
        () => [],
      ),
      getDesignReviewChecklistTemplate().catch(() => []),
    ]);
  order.value = ord || null;
  designFiles.value = files || [];
  reviewFiles.value = reviews || [];
  reviewPdfFiles.value = reviewPdfs || [];
  reviewOverlayFiles.value = reviewOverlays || [];
  sharedChecklistTemplateItems.value = normalizeChecklistTemplateItems(
    sharedTemplate,
    ord?.originalDesignReviewNote || "",
  );
  const checkedMap = buildChecklistCheckedMap(
    ord?.designReviewChecklistState,
    ord?.designReviewChecklist,
  );
  hydrateChecklistItems(sharedChecklistTemplateItems.value, checkedMap);
  checklistTemplateMsg.value = "";
  annotationObjects.value = Array.isArray(ord?.designReviewObjects)
    ? ord.designReviewObjects.map((obj) => ({ ...obj }))
    : [];
  selectedObjectId.value = null;

  await nextTick();
  if (isPdfFile.value && latestDesignFile.value?.url) {
    await renderPdfFirstPage(latestDesignFile.value);
  }
  syncCanvasSize();
  await applyLatestOverlayToCanvas();
}

function syncCanvasSize() {
  const baseEl = baseImageRef.value || pdfBaseCanvasRef.value;
  const drawCanvas = drawCanvasRef.value;
  const overlayCanvas = overlayCanvasRef.value;
  const objectLayer = objectLayerRef.value;
  if (!baseEl || !drawCanvas || !overlayCanvas || !objectLayer) return;
  const rect = baseEl.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const left = baseEl.offsetLeft;
  const top = baseEl.offsetTop;

  objectLayer.style.left = `${left}px`;
  objectLayer.style.top = `${top}px`;
  objectLayer.style.width = `${rect.width}px`;
  objectLayer.style.height = `${rect.height}px`;
  objectLayerSize.value = { width: rect.width, height: rect.height };

  const ratio = window.devicePixelRatio || 1;
  for (const canvas of [overlayCanvas, drawCanvas]) {
    canvas.style.left = `${left}px`;
    canvas.style.top = `${top}px`;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    canvas.width = Math.floor(rect.width * ratio);
    canvas.height = Math.floor(rect.height * ratio);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    if (canvas === drawCanvas) {
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = "#ef4444";
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
    }
  }

  // Resizing canvas clears pixels, so redraw persisted overlay after size sync.
  void applyLatestOverlayToCanvas();
}

function getCanvasPoint(event) {
  const canvas = drawCanvasRef.value;
  if (!canvas) return null;
  const rect = canvas.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
}

function snapshotDrawCanvas() {
  return drawCanvasRef.value?.toDataURL("image/png") || "";
}

function pushUndoState() {
  const snapshot = snapshotDrawCanvas();
  undoStack.value.push(snapshot);
  if (undoStack.value.length > 40) {
    undoStack.value.shift();
  }
}

async function restoreDrawCanvas(snapshot) {
  const canvas = drawCanvasRef.value;
  const ctx = canvas?.getContext("2d");
  if (!canvas || !ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!snapshot) {
    hasInk.value = false;
    return;
  }
  await new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const rect = canvas.getBoundingClientRect();
      ctx.drawImage(img, 0, 0, rect.width, rect.height);
      resolve();
    };
    img.onerror = () => resolve();
    img.src = snapshot;
  });
  hasInk.value = true;
}

function setBrushColor(color) {
  brushColor.value = color;
  eraserMode.value = false;
}

function applyColor(color) {
  if (selectedObject.value) selectedObject.value.color = color;
  else setBrushColor(color);
}

function newObjectId() {
  return `obj-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getObjectLayerRect() {
  return (
    objectLayerRef.value?.getBoundingClientRect() ||
    drawCanvasRef.value?.getBoundingClientRect() ||
    null
  );
}

function getObjectLayerSize() {
  const width = Number(objectLayerSize.value?.width || 0);
  const height = Number(objectLayerSize.value?.height || 0);
  if (width > 0 && height > 0) return { width, height };
  const rect = getObjectLayerRect();
  if (rect?.width && rect?.height)
    return { width: rect.width, height: rect.height };
  return { width: 0, height: 0 };
}

function pointToPct(point) {
  const size = getObjectLayerSize();
  if (!size.width || !size.height) return null;
  return {
    xPct: point.x / size.width,
    yPct: point.y / size.height,
  };
}

function sizeToPct(width, height) {
  const size = getObjectLayerSize();
  if (!size.width || !size.height) return null;
  return {
    wPct: width / size.width,
    hPct: height / size.height,
  };
}

function pctToPxX(value) {
  return getObjectLayerSize().width * value;
}

function pctToPxY(value) {
  return getObjectLayerSize().height * value;
}

function annotationObjectStyle(obj) {
  const left = pctToPxX(obj.xPct || 0);
  const top = pctToPxY(obj.yPct || 0);
  if (obj.type === "text") {
    return {
      left: `${left}px`,
      top: `${top}px`,
      color: obj.color || brushColor.value,
      fontSize: `${obj.fontSize || textSize.value}px`,
      background: obj.background ? "rgba(255,255,255,0.78)" : "transparent",
      padding: obj.background ? "4px" : "0",
      whiteSpace: "pre-wrap",
    };
  }
  return {
    left: `${left}px`,
    top: `${top}px`,
    width: `${pctToPxX(obj.wPct || 0)}px`,
    height: `${pctToPxY(obj.hPct || 0)}px`,
    border: `${obj.strokeWidth || brushSize.value}px solid ${obj.color || brushColor.value}`,
    borderRadius: obj.type === "ellipse" ? "999px" : "0",
  };
}

function clearSelection() {
  selectedObjectId.value = null;
}

function onObjectPointerDown(obj, event) {
  if (!objectLayerInteractive.value) return;
  const rect = getObjectLayerRect();
  if (!rect) return;
  selectedObjectId.value = obj.id;
  dragState.value = {
    id: obj.id,
    startClientX: event.clientX,
    startClientY: event.clientY,
    originXPct: obj.xPct || 0,
    originYPct: obj.yPct || 0,
    width: rect.width,
    height: rect.height,
  };
}

function onObjectLayerPointerDown(event) {
  if (!objectLayerInteractive.value) return;
  if (event.target !== event.currentTarget) return;
  const point = getCanvasPoint(event);
  if (!point) return;
  clearSelection();

  if (toolMode.value === "text") {
    const text = String(textDraft.value || "").trim();
    const pos = pointToPct(point);
    if (!text || !pos) return;
    const obj = {
      id: newObjectId(),
      type: "text",
      text,
      color: brushColor.value,
      fontSize: textSize.value,
      background: textBgEnabled.value,
      ...pos,
    };
    annotationObjects.value.push(obj);
    selectedObjectId.value = obj.id;
    return;
  }

  if (toolMode.value === "rect" || toolMode.value === "ellipse") {
    shapeStartPoint.value = point;
    objectDraft.value = null;
    isDrawing.value = true;
  }
}

function onObjectLayerPointerMove(event) {
  if (dragState.value) {
    const dx =
      (event.clientX - dragState.value.startClientX) /
      Math.max(dragState.value.width, 1);
    const dy =
      (event.clientY - dragState.value.startClientY) /
      Math.max(dragState.value.height, 1);
    annotationObjects.value = annotationObjects.value.map((obj) =>
      obj.id === dragState.value.id
        ? {
            ...obj,
            xPct: Math.max(0, dragState.value.originXPct + dx),
            yPct: Math.max(0, dragState.value.originYPct + dy),
          }
        : obj,
    );
    return;
  }
  if (!isDrawing.value || !shapeStartPoint.value) return;
  const point = getCanvasPoint(event);
  if (!point) return;
  const left = Math.min(shapeStartPoint.value.x, point.x);
  const top = Math.min(shapeStartPoint.value.y, point.y);
  const size = sizeToPct(
    Math.abs(point.x - shapeStartPoint.value.x),
    Math.abs(point.y - shapeStartPoint.value.y),
  );
  const pos = pointToPct({ x: left, y: top });
  if (!size || !pos) return;
  objectDraft.value = {
    id: "draft",
    type: toolMode.value,
    color: brushColor.value,
    strokeWidth: brushSize.value,
    ...pos,
    ...size,
  };
}

function onObjectLayerPointerUp() {
  if (dragState.value) {
    dragState.value = null;
    return;
  }
  if (
    (toolMode.value === "rect" || toolMode.value === "ellipse") &&
    objectDraft.value
  ) {
    annotationObjects.value.push({ ...objectDraft.value, id: newObjectId() });
    selectedObjectId.value =
      annotationObjects.value[annotationObjects.value.length - 1]?.id || null;
    objectDraft.value = null;
  }
  shapeStartPoint.value = null;
  isDrawing.value = false;
}

function deleteSelectedObject() {
  if (!selectedObject.value) return;
  annotationObjects.value = annotationObjects.value.filter(
    (obj) => obj.id !== selectedObject.value.id,
  );
  clearSelection();
}

function setToolMode(mode) {
  toolMode.value = mode;
  if (mode === "text" || mode === "rect" || mode === "ellipse") {
    eraserMode.value = false;
  }
}

function drawShapePreview(start, end, shape) {
  const canvas = drawCanvasRef.value;
  const ctx = canvas?.getContext("2d");
  if (!canvas || !ctx || !start || !end) return;
  restoreDrawCanvas(undoStack.value[undoStack.value.length - 1] || "");
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.lineWidth = brushSize.value;
  ctx.strokeStyle = brushColor.value;
  const left = Math.min(start.x, end.x);
  const top = Math.min(start.y, end.y);
  const width = Math.abs(end.x - start.x);
  const height = Math.abs(end.y - start.y);
  if (shape === "rect") {
    ctx.strokeRect(left, top, width, height);
  } else {
    ctx.beginPath();
    ctx.ellipse(
      left + width / 2,
      top + height / 2,
      Math.max(width / 2, 1),
      Math.max(height / 2, 1),
      0,
      0,
      Math.PI * 2,
    );
    ctx.stroke();
  }
  ctx.restore();
}

function toggleEraser() {
  setToolMode("draw");
  eraserMode.value = !eraserMode.value;
}

function drawTextAt(point) {
  const text = String(textDraft.value || "").trim();
  if (!text) return false;
  const ctx = drawCanvasRef.value?.getContext("2d");
  if (!ctx) return false;
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.font = `${textSize.value}px "Microsoft JhengHei", sans-serif`;
  ctx.textBaseline = "top";
  const lines = text.split(/\r?\n/);
  const lineHeight = textSize.value + 4;
  const textWidth = lines.reduce(
    (max, line) => Math.max(max, ctx.measureText(line || " ").width),
    0,
  );
  const textHeight = Math.max(1, lines.length) * lineHeight;
  const pad = 4;

  if (textBgEnabled.value) {
    ctx.fillStyle = "rgba(255, 255, 255, 0.78)";
    ctx.fillRect(
      point.x - pad,
      point.y - pad,
      textWidth + pad * 2,
      textHeight + pad * 2,
    );
  }

  ctx.fillStyle = brushColor.value;
  let y = point.y;
  for (const line of lines) {
    ctx.fillText(line, point.x, y);
    y += lineHeight;
  }
  ctx.restore();
  return true;
}

async function undoDraw() {
  if (!canUndo.value) return;
  const current = snapshotDrawCanvas();
  redoStack.value.push(current);
  const prev = undoStack.value.pop();
  await restoreDrawCanvas(prev);
}

async function redoDraw() {
  if (!canRedo.value) return;
  const current = snapshotDrawCanvas();
  undoStack.value.push(current);
  const next = redoStack.value.pop();
  await restoreDrawCanvas(next);
}

function onPointerDown(event) {
  if (!canAnnotateFile.value) return;
  if (toolMode.value !== "draw") return;
  const p = getCanvasPoint(event);
  if (!p) return;

  const ctx = drawCanvasRef.value?.getContext("2d");
  if (!ctx) return;
  pushUndoState();
  redoStack.value = [];

  ctx.globalCompositeOperation = eraserMode.value
    ? "destination-out"
    : "source-over";
  ctx.lineWidth = brushSize.value;
  ctx.strokeStyle = brushColor.value;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  isDrawing.value = true;
  ctx.beginPath();
  ctx.moveTo(p.x, p.y);
}

function onPointerMove(event) {
  if (!isDrawing.value) return;
  if (toolMode.value !== "draw") return;
  const p = getCanvasPoint(event);
  if (!p) return;

  const ctx = drawCanvasRef.value?.getContext("2d");
  if (!ctx) return;
  ctx.lineTo(p.x, p.y);
  ctx.stroke();
  hasInk.value = true;
}

function onPointerUp() {
  if (toolMode.value !== "draw") return;
  const ctx = drawCanvasRef.value?.getContext("2d");
  if (ctx) ctx.globalCompositeOperation = "source-over";
  isDrawing.value = false;
}

function clearCanvas() {
  const canvas = drawCanvasRef.value;
  const ctx = canvas?.getContext("2d");
  if (!canvas || !ctx) return;
  pushUndoState();
  redoStack.value = [];
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  hasInk.value = false;
}

async function buildMergedOverlayBlob() {
  const overlayCanvas = overlayCanvasRef.value;
  const drawCanvas = drawCanvasRef.value;
  if (!overlayCanvas || !drawCanvas) {
    throw new Error("找不到註記圖層");
  }
  const merged = document.createElement("canvas");
  merged.width = drawCanvas.width;
  merged.height = drawCanvas.height;
  const ctx = merged.getContext("2d");
  ctx.drawImage(overlayCanvas, 0, 0);
  ctx.drawImage(drawCanvas, 0, 0);

  // Render vector objects into overlay so object-only annotations also persist visually.
  const rect = drawCanvas.getBoundingClientRect();
  const cssWidth = Math.max(1, rect.width || drawCanvas.width || 1);
  const cssHeight = Math.max(1, rect.height || drawCanvas.height || 1);
  const scaleX = merged.width / cssWidth;
  const scaleY = merged.height / cssHeight;
  ctx.save();
  ctx.scale(scaleX, scaleY);
  for (const obj of annotationObjects.value) {
    const x = (obj.xPct || 0) * cssWidth;
    const y = (obj.yPct || 0) * cssHeight;
    const color = obj.color || brushColor.value;
    if (obj.type === "text") {
      const fontSize = Number(obj.fontSize || textSize.value || 20);
      const lines = String(obj.text || "").split(/\r?\n/);
      const lineHeight = fontSize + 4;
      ctx.save();
      ctx.font = `${fontSize}px "Microsoft JhengHei", sans-serif`;
      ctx.textBaseline = "top";
      const maxWidth = lines.reduce(
        (max, line) => Math.max(max, ctx.measureText(line || " ").width),
        0,
      );
      const pad = 4;
      if (obj.background) {
        ctx.fillStyle = "rgba(255, 255, 255, 0.78)";
        ctx.fillRect(
          x - pad,
          y - pad,
          maxWidth + pad * 2,
          Math.max(1, lines.length) * lineHeight + pad * 2,
        );
      }
      ctx.fillStyle = color;
      let textY = y;
      for (const line of lines) {
        ctx.fillText(line, x, textY);
        textY += lineHeight;
      }
      ctx.restore();
      continue;
    }

    const w = (obj.wPct || 0) * cssWidth;
    const h = (obj.hPct || 0) * cssHeight;
    const strokeWidth = Number(obj.strokeWidth || brushSize.value || 3);
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = strokeWidth;
    if (obj.type === "ellipse") {
      ctx.beginPath();
      ctx.ellipse(
        x + w / 2,
        y + h / 2,
        Math.max(w / 2, 1),
        Math.max(h / 2, 1),
        0,
        0,
        Math.PI * 2,
      );
      ctx.stroke();
    } else {
      ctx.strokeRect(x, y, w, h);
    }
    ctx.restore();
  }
  ctx.restore();

  return new Promise((resolve, reject) => {
    merged.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("註記層轉檔失敗"))),
      "image/png",
      0.92,
    );
  });
}

async function applyLatestOverlayToCanvas() {
  const overlayUrl = latestReviewOverlayUrl.value;
  const canvas = overlayCanvasRef.value;
  const ctx = canvas?.getContext("2d");
  if (!canvas || !ctx) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!overlayUrl) return;

  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;

  await new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      ctx.drawImage(img, 0, 0, rect.width, rect.height);
      resolve();
    };
    img.onerror = () => resolve();
    img.src = overlayUrl;
  });
}

function buildEditedPdfFileName() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const ts = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const baseName = String(latestDesignFile.value?.name || "original").replace(
    /\.pdf$/i,
    "",
  );
  return `${baseName}-edited-${ts}.pdf`;
}

async function saveBackAsPdf() {
  if (!orderId.value || !captureRef.value) return;
  saveBacking.value = true;
  saveMsg.value = "";
  try {
    const snapshot = await html2canvas(captureRef.value, {
      useCORS: true,
      backgroundColor: "#ffffff",
      scale: 2,
    });
    const imgData = snapshot.toDataURL("image/jpeg", 0.95);
    const isLandscape = snapshot.width >= snapshot.height;
    const pdf = new jsPDF({
      orientation: isLandscape ? "landscape" : "portrait",
      unit: "mm",
      format: "a4",
    });

    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    let drawW = pageW;
    let drawH = (snapshot.height / snapshot.width) * drawW;
    if (drawH > pageH) {
      drawH = pageH;
      drawW = (snapshot.width / snapshot.height) * drawH;
    }
    const x = (pageW - drawW) / 2;
    const y = (pageH - drawH) / 2;
    pdf.addImage(imgData, "JPEG", x, y, drawW, drawH, undefined, "FAST");

    const blob = pdf.output("blob");
    const file = new File([blob], buildEditedPdfFileName(), {
      type: "application/pdf",
    });
    const uploaded = await uploadOrderAttachment(
      orderId.value,
      "designReviewPdfs",
      file,
    );

    await updateSalesOrder(orderId.value, {
      latestDesignReviewPdfUrl: uploaded?.url || null,
      latestDesignReviewPdfAt: new Date().toISOString(),
      latestDesignReviewPdfSourceName: latestDesignFile.value?.name || "",
    });

    saveMsg.value = "✅ 已另存註記 PDF（原圖不變）。";
    hasInk.value = false;
    await loadAll();
  } catch (error) {
    saveMsg.value = `❌ PDF 回存失敗：${error?.message || error}`;
  } finally {
    saveBacking.value = false;
  }
}

async function saveReview() {
  if (!orderId.value) return;
  saving.value = true;
  saveMsg.value = "";

  try {
    const checklistPayload = buildChecklistPayload();
    const checklistTemplatePayload = checklistPayload.map((item) => ({
      id: item.id,
      text: item.text,
    }));
    const checklistStatePayload = checklistPayload.map((item) => ({
      id: item.id,
      checked: !!item.checked,
    }));
    let sharedTemplateSaved = true;
    try {
      await saveDesignReviewChecklistTemplate(checklistTemplatePayload);
    } catch (sharedError) {
      sharedTemplateSaved = false;
      console.warn("Shared checklist template save failed", sharedError);
    }

    let latestImageUrl = latestReviewImageUrl.value || "";

    let latestOverlayUrl = latestReviewOverlayUrl.value || "";

    const hasObjects = annotationObjects.value.length > 0;
    const needsVisualSave = hasInk.value || hasObjects;
    if (canAnnotateFile.value && needsVisualSave && captureRef.value) {
      const snapshot = await html2canvas(captureRef.value, {
        useCORS: true,
        backgroundColor: "#ffffff",
        scale: 2,
      });
      const blob = await new Promise((resolve, reject) => {
        snapshot.toBlob(
          (b) => (b ? resolve(b) : reject(new Error("影像轉檔失敗"))),
          "image/png",
          0.92,
        );
      });
      const fileName = `design-review-${new Date().toISOString().replace(/[:.]/g, "-")}.png`;
      const file = new File([blob], fileName, { type: "image/png" });
      const uploaded = await uploadOrderAttachment(
        orderId.value,
        "designReviewFiles",
        file,
      );
      latestImageUrl = uploaded?.url || latestImageUrl;

      const overlayBlob = await buildMergedOverlayBlob();
      const overlayFileName = `design-overlay-${new Date().toISOString().replace(/[:.]/g, "-")}.png`;
      const overlayFile = new File([overlayBlob], overlayFileName, {
        type: "image/png",
      });
      const uploadedOverlay = await uploadOrderAttachment(
        orderId.value,
        "designReviewOverlays",
        overlayFile,
      );
      latestOverlayUrl = uploadedOverlay?.url || latestOverlayUrl;
      clearCanvas();
    }

    await updateSalesOrder(orderId.value, {
      originalDesignReviewNote: checklistPayload
        .map((item) => item.text)
        .join("\n"),
      designReviewChecklist: checklistPayload,
      designReviewChecklistState: checklistStatePayload,
      latestDesignReviewImageUrl: latestImageUrl || null,
      latestDesignReviewOverlayUrl: latestOverlayUrl || null,
      designReviewObjects: annotationObjects.value,
      latestDesignReviewAt: new Date().toISOString(),
      latestDesignReviewSourceName: latestDesignFile.value?.name || "",
    });

    const [reviews, overlays] = await Promise.all([
      listOrderAttachments(orderId.value, "designReviewFiles").catch(() => []),
      listOrderAttachments(orderId.value, "designReviewOverlays").catch(
        () => [],
      ),
    ]);
    reviewFiles.value = reviews || [];
    reviewOverlayFiles.value = overlays || [];
    await nextTick();
    await applyLatestOverlayToCanvas();
    saveMsg.value = sharedTemplateSaved
      ? "✅ 已儲存，共用檢核項目與本單勾選已更新。"
      : "⚠️ 本單勾選已儲存，但共用檢核項目更新失敗（可能權限不足）。";
  } catch (error) {
    saveMsg.value = `❌ 儲存失敗：${error?.message || error}`;
  } finally {
    saving.value = false;
  }
}

onMounted(async () => {
  window.addEventListener("resize", syncCanvasSize);
  await loadAll();
});
onBeforeUnmount(() => {
  window.removeEventListener("resize", syncCanvasSize);
});
</script>

<style scoped>
.review-page {
  padding: 12px;
  min-height: 100vh;
  height: 100vh;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.review-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid #dbe1e8;
  border-radius: 10px;
  background: #fff;
}
.back-btn {
  color: #1f4bb8;
  text-decoration: none;
}
.title-wrap {
  flex: 1;
}
.title-wrap h1 {
  margin: 0;
  font-size: 20px;
}
.meta {
  margin: 4px 0 0;
  color: #6b7280;
}
.header-actions {
  display: flex;
  gap: 8px;
}
.review-layout {
  margin-top: 12px;
  display: grid;
  grid-template-columns: 320px 1fr;
  gap: 12px;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
.panel,
.canvas-section {
  background: #fff;
  border: 1px solid #dbe1e8;
  border-radius: 10px;
  padding: 12px;
  min-height: 0;
}
.panel {
  overflow: auto;
}
.canvas-section {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.canvas-body {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 300px;
  gap: 12px;
  align-items: stretch;
  flex: 1;
  min-height: 0;
}
.canvas-main {
  min-width: 0;
  min-height: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.tools-side {
  border-left: 1px dashed #dbe1e8;
  padding-left: 12px;
  position: relative;
  align-self: stretch;
  height: 100%;
  min-height: 0;
  max-height: none;
  overflow: auto;
}
.panel h2,
.panel h3 {
  margin-top: 0;
}
.checklist-head {
  margin-bottom: 8px;
}
.checklist-template-msg {
  margin: 6px 0;
  font-size: 12px;
}
.checklist-add {
  display: flex;
  gap: 6px;
  margin-bottom: 10px;
}
.checklist-add input {
  flex: 1;
}
.checklist-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.checklist-row {
  display: flex;
  gap: 6px;
  align-items: center;
}
.checklist-main {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 6px;
}
.checklist-text {
  flex: 1;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  padding: 5px 8px;
  font-size: 14px;
}
.btn-del-item {
  padding: 5px 8px;
  font-size: 12px;
}
textarea {
  width: 100%;
  resize: vertical;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  padding: 8px;
  font-size: 14px;
}
.panel-block {
  margin-top: 12px;
}
.drawing-shortcut {
  margin-top: 0;
  margin-bottom: 12px;
  padding: 10px;
  border: 1px dashed #cbd5e1;
  border-radius: 8px;
  background: #f8fafc;
}
.drawing-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.thumb {
  width: 100%;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
}
.image-canvas-wrap {
  position: relative;
  width: 100%;
  min-height: 0;
  flex: 1;
  overflow: auto;
  direction: ltr;
  border: 1px solid #e5e7eb;
  background: #fafafa;
}
.base-image {
  display: block;
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;
}
.base-pdf-canvas {
  width: auto !important;
  height: auto !important;
  max-width: 100%;
}
.object-layer {
  position: absolute;
  z-index: 3;
}
.object-layer:not(.interactive) {
  pointer-events: none;
}
.annotation-object {
  position: absolute;
  box-sizing: border-box;
  cursor: move;
}
.annotation-object.text {
  min-width: 24px;
}
.annotation-object.selected {
  outline: 2px dashed #2563eb;
  outline-offset: 2px;
}
.annotation-object.draft {
  opacity: 0.75;
  pointer-events: none;
}
.draw-canvas {
  position: absolute;
  touch-action: none;
  z-index: 2;
}
.overlay-canvas {
  position: absolute;
  pointer-events: none;
  z-index: 1;
}
.tools {
  margin-top: 0;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
}
.tool-group {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}
.object-editor {
  border-top: 1px dashed #dbe1e8;
  padding-top: 10px;
  margin-top: 4px;
}
.btn-tool-active {
  border-color: #ef4444;
  color: #b91c1c;
  background: #fee2e2;
}
.color-palette {
  gap: 4px;
}
.color-chip {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 1px solid #9ca3af;
  cursor: pointer;
}
.color-chip.active {
  outline: 2px solid #1d4ed8;
  outline-offset: 1px;
}
.text-draft {
  min-width: 220px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  padding: 4px 8px;
}
.text-bg-toggle {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.btn {
  border: 1px solid #cbd5e1;
  background: #fff;
  border-radius: 8px;
  padding: 6px 10px;
  text-decoration: none;
  color: #111827;
  cursor: pointer;
}
.btn.primary {
  background: #1d4ed8;
  color: #fff;
  border-color: #1d4ed8;
}
.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.empty-state {
  color: #6b7280;
  padding: 24px;
  border: 1px dashed #d1d5db;
  border-radius: 8px;
  text-align: center;
}
.muted {
  color: #6b7280;
}
.save-msg {
  margin: 8px 0 0;
}
.pdf-tip {
  margin-top: 10px;
}

.canvas-section::after {
  content: "";
  display: block;
  clear: both;
}

@media (max-width: 900px) {
  .review-page {
    min-height: auto;
    overflow: visible;
  }
  .review-layout {
    grid-template-columns: 1fr;
    min-height: auto;
  }
  .canvas-body {
    grid-template-columns: 1fr;
    height: auto;
  }
  .tools-side {
    border-left: none;
    border-top: 1px dashed #dbe1e8;
    padding-left: 0;
    padding-top: 10px;
    position: static;
  }
  .panel,
  .canvas-section {
    overflow: visible;
  }
  .image-canvas-wrap {
    min-height: 300px;
    flex: none;
  }
}
</style>
