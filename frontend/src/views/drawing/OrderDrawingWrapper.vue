<template>
  <div class="order-drawing-root">
    <!-- 頂列：訂單資訊 -->
    <header class="order-drawing-header">
      <RouterLink class="back-btn" :to="`/orders`">← 返回</RouterLink>
      <div class="order-meta" v-if="order">
        <span class="meta-name">{{ order.customerName || "—" }}</span>
        <span v-if="order.customerOrderNo" class="meta-no">{{
          order.customerOrderNo
        }}</span>
        <span v-if="stoneLabel" class="meta-stone">{{ stoneLabel }}</span>
        <span v-if="order.siteAddress" class="meta-addr">{{
          order.siteAddress
        }}</span>
      </div>
      <div class="header-right">
        <!-- 原圖註記（另開） -->
        <a
          class="btn-edit"
          :href="`/orders/${orderId}/original-review`"
          target="_blank"
          rel="noopener noreferrer"
        >
          🖼️ 原圖/註記
        </a>
        <!-- 訂單編輯 -->
        <RouterLink class="btn-edit" :to="`/orders/${orderId}/edit`"
          >✏️ 編輯訂單</RouterLink
        >
        <!-- 生產確定單 -->
        <RouterLink class="btn-conf" :to="`/orders/${orderId}/confirmation`"
          >📋 確認單</RouterLink
        >
        <!-- 新增繪圖 -->
        <div class="add-drawing-wrap">
          <button class="btn-add" @click="showAddMenu = !showAddMenu">
            ＋ 新增繪圖 ▾
          </button>
          <div
            v-if="showAddMenu"
            class="add-menu"
            @mouseleave="showAddMenu = false"
          >
            <button
              v-for="t in DRAWING_TYPES"
              :key="t.type"
              @click="addDrawing(t.type)"
            >
              {{ t.label }}
            </button>
          </div>
        </div>
      </div>
    </header>

    <!-- 繪圖分頁列 -->
    <div class="drawing-tabs" v-if="drawings.length">
      <button
        v-for="d in drawings"
        :key="d.id"
        class="drawing-tab"
        :class="{ active: currentId === d.id }"
        @click="selectDrawing(d.id)"
      >
        {{ typeLabel(d.type) }} #{{ d.seq }}
        <span class="tab-del" @click.stop="confirmDelete(d)">✕</span>
      </button>
    </div>
    <div v-else-if="!loading" class="empty-hint">
      尚無繪圖，點「＋ 新增繪圖」開始。
    </div>

    <!-- 繪圖 canvas 區 -->
    <div class="drawing-canvas-area" v-if="currentDrawing">
      <component
        ref="drawingViewRef"
        :is="drawingComponent"
        :key="currentId"
        :order="order"
        :drawing-id="currentId"
        :order-id="orderId"
        :saved-state="currentDrawing.state"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, defineAsyncComponent } from "vue";
import {
  useRoute,
  useRouter,
  RouterLink,
  onBeforeRouteLeave,
} from "vue-router";
import {
  getSalesOrder,
  listOrderDrawings,
  createOrderDrawing,
  deleteOrderDrawing,
  updateOrderDrawing,
} from "../../firebase";

const route = useRoute();
const router = useRouter();
const orderId = computed(() => route.params.id);

const order = ref(null);
const drawings = ref([]);
const currentId = ref(null);
const loading = ref(true);
const showAddMenu = ref(false);
const drawingViewRef = ref(null);

const DRAWING_TYPES = [
  { type: "straight", label: "一字型" },
  { type: "l-shape", label: "L 型" },
  { type: "m-shape", label: "M 型" },
  { type: "island", label: "中島" },
];

const DRAWING_TYPE_ALIASES = {
  straight: ["straight", "one", "一字", "一字型", "直線", "直線型"],
  "l-shape": ["l-shape", "l", "l型", "l 型", "L", "L型", "L 型"],
  "m-shape": ["m-shape", "m", "m型", "m 型", "M", "M型", "M 型"],
  island: ["island", "中島", "島", "中岛"],
};

const TYPE_COMPONENTS = {
  straight: defineAsyncComponent(() => import("./StraightDrawingView.vue")),
  "l-shape": defineAsyncComponent(() => import("./LShapeDrawingView.vue")),
  "m-shape": defineAsyncComponent(() => import("./MShapeDrawingView.vue")),
  island: defineAsyncComponent(() => import("./IslandDrawingView.vue")),
};

const currentDrawing = computed(
  () => drawings.value.find((d) => d.id === currentId.value) ?? null,
);

function normalizeDrawingType(type) {
  const raw = String(type || "").trim();
  if (!raw) return "straight";
  const rawLower = raw.toLowerCase();
  for (const [normalized, aliases] of Object.entries(DRAWING_TYPE_ALIASES)) {
    if (aliases.some((alias) => alias.toLowerCase() === rawLower)) {
      return normalized;
    }
  }
  return raw;
}

const drawingComponent = computed(() =>
  currentDrawing.value
    ? TYPE_COMPONENTS[normalizeDrawingType(currentDrawing.value.type)]
    : null,
);

const stoneLabel = computed(() => {
  if (!order.value?.stones?.length) return "";
  const s = order.value.stones[0];
  return [s.brand, s.color].filter(Boolean).join(" ");
});

function currentDrawingHasUnsavedChanges() {
  const vm = drawingViewRef.value;
  if (!vm || typeof vm.hasUnsavedChanges !== "function") return false;
  try {
    return vm.hasUnsavedChanges();
  } catch {
    return false;
  }
}

function confirmDiscardChanges() {
  if (!currentDrawingHasUnsavedChanges()) return true;
  return window.confirm("目前有未儲存變更，確定要離開嗎？");
}

function typeLabel(type) {
  const normalized = normalizeDrawingType(type);
  return DRAWING_TYPES.find((t) => t.type === normalized)?.label ?? type;
}

async function loadAll() {
  loading.value = true;
  try {
    const [ord, drws] = await Promise.all([
      getSalesOrder(orderId.value),
      listOrderDrawings(orderId.value),
    ]);
    order.value = ord;
    drawings.value = drws;
    if (drws.length && !currentId.value) currentId.value = drws[0].id;
    await consumeAiStraightDraft();
  } catch (e) {
    console.error("loadAll error", e);
  } finally {
    loading.value = false;
  }
}

function buildStraightSnapshotFromAiDraft(draft) {
  const segments = Array.isArray(draft?.segments) ? draft.segments : [];
  const segmentWidths = segments
    .map((item) => Number(item?.width || item?.length || item?.qty || 0))
    .filter((value) => value > 0);
  const cabinetBodies = Array.isArray(draft?.cabinetBodies)
    ? draft.cabinetBodies
    : [];
  const cabinetWidths = cabinetBodies
    .map((item) => Number(item?.width || item?.length || item?.qty || 0))
    .filter((value) => value > 0);
  const length = Number(draft?.length) > 0 ? Number(draft.length) : 199;
  const cabins = [
    ...(segmentWidths.length ? segmentWidths : cabinetWidths).slice(0, 9),
  ];
  if (!cabins.length) cabins.push(length);
  while (cabins.length < 9) cabins.push(null);
  const fixtureState = buildStraightFixtureSnapshot(draft?.fixtures);
  const sideState = buildStraightSideSnapshot(draft?.sideOptions);
  const { cropImageDataUrl: _cropImageDataUrl, ...stateSafeDraft } =
    draft || {};
  if (Array.isArray(stateSafeDraft.aiCrops)) {
    stateSafeDraft.aiCrops = stateSafeDraft.aiCrops.map((crop) => {
      const { imageDataUrl: _imageDataUrl, ...safeCrop } = crop || {};
      return safeCrop;
    });
  }
  return {
    cabins,
    depthVal: Number(draft?.depth) > 0 ? Number(draft.depth) : 60,
    counterThick: Number(draft?.thickness) > 0 ? Number(draft.thickness) : 4,
    ...fixtureState,
    ...sideState,
    aiDraft: {
      source: draft?.source || "original-review",
      confidence: Number(draft?.confidence || 0),
      needsReview: draft?.needsReview !== false,
      rawResult: stateSafeDraft || null,
    },
  };
}

function normalizeFixtureNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function buildSinkFixtureState(fixture) {
  return {
    enabled: true,
    position: ["水中", "左開", "右開"].includes(fixture?.position)
      ? fixture.position
      : "水中",
    center: normalizeFixtureNumber(fixture?.center) || 0,
    ...(normalizeFixtureNumber(fixture?.length)
      ? { sinkLength: normalizeFixtureNumber(fixture.length) }
      : {}),
    ...(normalizeFixtureNumber(fixture?.depth)
      ? { sinkDepth: normalizeFixtureNumber(fixture.depth) }
      : {}),
    ...(normalizeFixtureNumber(fixture?.radius)
      ? { R: normalizeFixtureNumber(fixture.radius) }
      : {}),
    ...(normalizeFixtureNumber(fixture?.dig)
      ? { dig: normalizeFixtureNumber(fixture.dig) }
      : {}),
  };
}

function buildStoveFixtureState(fixture) {
  return {
    enabled: true,
    position: ["火中", "左開", "右開"].includes(fixture?.position)
      ? fixture.position
      : "火中",
    dis: normalizeFixtureNumber(fixture?.center) || 0,
    ...(normalizeFixtureNumber(fixture?.length)
      ? { stoveLength: normalizeFixtureNumber(fixture.length) }
      : {}),
    ...(normalizeFixtureNumber(fixture?.depth)
      ? { stoveDepth: normalizeFixtureNumber(fixture.depth) }
      : {}),
    ...(normalizeFixtureNumber(fixture?.radius)
      ? { R: normalizeFixtureNumber(fixture.radius) }
      : {}),
    ...(normalizeFixtureNumber(fixture?.dig)
      ? { dig: normalizeFixtureNumber(fixture.dig) }
      : {}),
  };
}

function buildStraightFixtureSnapshot(fixtures) {
  const list = Array.isArray(fixtures) ? fixtures : [];
  const sinks = list.filter((item) => item?.type === "sink").slice(0, 2);
  const stoves = list.filter((item) => item?.type === "stove").slice(0, 2);
  const state = {};
  if (sinks[0]) state.sink1 = buildSinkFixtureState(sinks[0]);
  if (sinks[1]) state.sink2 = buildSinkFixtureState(sinks[1]);
  if (stoves[0]) state.stove1 = buildStoveFixtureState(stoves[0]);
  if (stoves[1]) state.stove2 = buildStoveFixtureState(stoves[1]);
  return state;
}

function buildStraightSideSnapshot(sideOptions) {
  if (!sideOptions || typeof sideOptions !== "object") return {};
  const state = {};
  if (
    ["左靠牆", "左見光", "左齊桶身", "左靠側板", "左靠櫃", "左側落腳"].includes(
      sideOptions.leftOption,
    )
  ) {
    state.leftOption = sideOptions.leftOption;
  }
  if (
    ["右靠牆", "右見光", "右齊桶身", "右靠側板", "右靠櫃", "右側落腳"].includes(
      sideOptions.rightOption,
    )
  ) {
    state.rightOption = sideOptions.rightOption;
  }
  if (["後靠牆", "後見光"].includes(sideOptions.backOption)) {
    state.backOption = sideOptions.backOption;
  }
  return state;
}

async function consumeAiStraightDraft() {
  if (route.query.aiDraft !== "straight" || !orderId.value) return;
  const storageKey = `aiStraightDraft:${orderId.value}`;
  const raw = sessionStorage.getItem(storageKey);
  if (!raw) return;
  let draft;
  try {
    draft = JSON.parse(raw);
  } catch (_error) {
    sessionStorage.removeItem(storageKey);
    return;
  }
  sessionStorage.removeItem(storageKey);
  const id = await createOrderDrawing(orderId.value, "straight");
  await updateOrderDrawing(
    orderId.value,
    id,
    buildStraightSnapshotFromAiDraft(draft),
  );
  const refreshed = await listOrderDrawings(orderId.value);
  drawings.value = refreshed;
  currentId.value = id;
  await router.replace({
    name: "order-drawing",
    params: { id: orderId.value },
  });
}

async function addDrawing(type) {
  if (!confirmDiscardChanges()) return;
  showAddMenu.value = false;
  const id = await createOrderDrawing(orderId.value, type);
  await loadAll();
  currentId.value = id;
}

function selectDrawing(id) {
  if (id === currentId.value) return;
  if (!confirmDiscardChanges()) return;
  currentId.value = id;
}

async function confirmDelete(d) {
  if (d.id === currentId.value && !confirmDiscardChanges()) return;
  if (!confirm(`確定刪除「${typeLabel(d.type)} #${d.seq}」？`)) return;
  await deleteOrderDrawing(orderId.value, d.id);
  if (currentId.value === d.id) currentId.value = null;
  await loadAll();
}

onMounted(loadAll);

onBeforeRouteLeave(() => {
  if (!confirmDiscardChanges()) return false;
  return true;
});
</script>

<style scoped>
.order-drawing-root {
  display: flex;
  flex-direction: column;
  height: 100%;
}

/* ── 頂列 ── */
.order-drawing-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 6px 14px;
  background: #fff;
  border-bottom: 1px solid #d8dde3;
  flex-shrink: 0;
}
.back-btn {
  color: #1f4bb8;
  text-decoration: none;
  font-size: 14px;
  white-space: nowrap;
}
.order-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
  flex-wrap: wrap;
}
.meta-name {
  font-weight: 600;
  font-size: 15px;
}
.meta-no {
  font-size: 13px;
  color: #555;
  background: #f1f3f5;
  border-radius: 4px;
  padding: 1px 6px;
}
.meta-stone {
  font-size: 13px;
  color: #2d7d46;
}
.meta-addr {
  font-size: 12px;
  color: #888;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 260px;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

/* ── 編輯訂單 ── */
.btn-edit {
  padding: 5px 12px;
  background: #fff;
  color: #555;
  border: 1px solid #ccc;
  border-radius: 6px;
  font-size: 14px;
  text-decoration: none;
  white-space: nowrap;
}
.btn-edit:hover {
  background: #f5f5f5;
}

/* ── 確認單 ── */
.btn-conf {
  padding: 5px 12px;
  background: #fff;
  color: #1f4bb8;
  border: 1px solid #b6c5ee;
  border-radius: 6px;
  font-size: 14px;
  text-decoration: none;
  white-space: nowrap;
}
.btn-conf:hover {
  background: #f0f4ff;
}

/* ── 新增下拉 ── */
.add-drawing-wrap {
  position: relative;
}
.btn-add {
  padding: 5px 12px;
  background: #1f4bb8;
  color: #fff;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
}
.btn-add:hover {
  background: #163a91;
}
.add-menu {
  position: absolute;
  right: 0;
  top: calc(100% + 4px);
  background: #fff;
  border: 1px solid #d0d4d9;
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
  z-index: 50;
  min-width: 120px;
  overflow: hidden;
}
.add-menu button {
  display: block;
  width: 100%;
  padding: 8px 16px;
  background: none;
  border: none;
  text-align: left;
  cursor: pointer;
  font-size: 14px;
}
.add-menu button:hover {
  background: #f1f3f5;
}

/* ── 分頁列 ── */
.drawing-tabs {
  display: flex;
  gap: 4px;
  padding: 6px 10px 0;
  background: #f1f3f5;
  border-bottom: 1px solid #d0d4d9;
  flex-shrink: 0;
}
.drawing-tab {
  padding: 5px 14px;
  font-size: 14px;
  background: #e2e6ea;
  border: 1px solid transparent;
  border-radius: 6px 6px 0 0;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
}
.drawing-tab.active {
  background: #fff;
  border: 1px solid #d0d4d9;
  border-bottom-color: #fff;
  margin-bottom: -1px;
  font-weight: 600;
}
.tab-del {
  font-size: 11px;
  color: #aaa;
  line-height: 1;
  padding: 0 2px;
  border-radius: 50%;
}
.tab-del:hover {
  color: #c0392b;
  background: #fdecea;
}

.empty-hint {
  padding: 24px 20px;
  color: #888;
  font-size: 14px;
}

/* ── canvas 區 ── */
.drawing-canvas-area {
  flex: 1;
  overflow: auto;
}
</style>
