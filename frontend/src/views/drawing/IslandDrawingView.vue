<template>
  <div class="drawing-page">
    <div v-if="orderId" class="save-bar">
      <button class="btn-save" :disabled="saving" @click="saveDrawing">
        {{ saving ? "儲存中…" : "儲存繪圖" }}
      </button>
      <span v-if="saveMsg" class="save-msg">{{ saveMsg }}</span>
    </div>

    <div class="toolbar">
      <div class="toolbar-head">
        <h2>中島繪圖</h2>
        <div class="head-actions">
          <button class="ghost-btn" @click="redraw">重繪</button>
          <button class="ghost-btn" @click="resetDefaults">重設</button>
        </div>
      </div>

      <div class="toolbar-grid">
        <section class="panel panel-wide panel-main">
          <div class="panel-title">主體</div>
          <div class="inline-fields body-fields compact-grid-fields">
            <label class="field short-field">
              <span>左凸</span>
              <input
                v-model.number="form.plusLeft"
                type="number"
                class="number"
                @change="redraw"
              />
            </label>
            <label
              v-for="index in 7"
              :key="`box-${index}`"
              class="field mini-field"
            >
              <span>B{{ index }}</span>
              <input
                v-model.number="form[`box${index}`]"
                type="number"
                class="number compact"
                @change="redraw"
              />
            </label>
            <label class="field short-field">
              <span>右凸</span>
              <input
                v-model.number="form.plusRight"
                type="number"
                class="number"
                @change="redraw"
              />
            </label>
            <label class="field short-field">
              <span>深度</span>
              <input
                v-model.number="form.depth"
                type="number"
                class="number"
                @change="redraw"
              />
            </label>
            <label class="field short-field">
              <span>總長</span>
              <input
                :value="totalLength"
                type="number"
                class="number readonly"
                readonly
              />
            </label>
            <label class="field short-field">
              <span>X0</span>
              <input
                v-model.number="form.originX"
                type="number"
                class="number"
                @change="redraw"
              />
            </label>
            <label class="field short-field">
              <span>Y0</span>
              <input
                v-model.number="form.originY"
                type="number"
                class="number"
                @change="redraw"
              />
            </label>
          </div>
        </section>

        <section class="panel panel-front-markers">
          <div class="panel-title">前後與標示</div>
          <div class="stack-fields">
            <div class="inline-fields compact-grid-fields triple-fields">
              <label class="field mode-field">
                <span>後側</span>
                <select v-model="form.backOption" class="mode" @change="redraw">
                  <option value="後靠牆">後靠牆</option>
                  <option value="後見光">後見光</option>
                </select>
              </label>
              <label class="field short-field checkbox-field">
                <input
                  v-model="form.backstop"
                  type="checkbox"
                  @change="redraw"
                />
                <span>背牆</span>
              </label>
              <label class="field short-field">
                <span>高</span>
                <input
                  v-model.number="form.backHeight"
                  type="number"
                  class="number"
                  @change="redraw"
                />
              </label>
            </div>
            <div class="inline-fields compact-grid-fields triple-fields">
              <label class="field short-field checkbox-field">
                <input
                  v-model="form.frontEdge"
                  type="checkbox"
                  @change="redraw"
                />
                <span>前沿</span>
              </label>
              <label class="field short-field checkbox-field">
                <input
                  v-model="form.leftDepthTag"
                  type="checkbox"
                  @change="redraw"
                />
                <span>左標線</span>
              </label>
              <label class="field short-field checkbox-field">
                <input
                  v-model="form.rightDepthTag"
                  type="checkbox"
                  @change="redraw"
                />
                <span>右標線</span>
              </label>
            </div>
            <div class="inline-fields compact-grid-fields triple-fields">
              <label class="field short-field checkbox-field">
                <input
                  v-model="form.cutEnabled"
                  type="checkbox"
                  @change="redraw"
                />
                <span>接線左起</span>
              </label>
              <label class="field short-field">
                <span>位置</span>
                <input
                  v-model.number="form.connect"
                  type="number"
                  class="number"
                  @change="redraw"
                />
              </label>
            </div>
            <div class="inline-fields compact-grid-fields triple-fields">
              <label class="field short-field checkbox-field">
                <input
                  v-model="form.spaceEnabled"
                  type="checkbox"
                  @change="redraw"
                />
                <span>懸空處</span>
              </label>
              <label class="field short-field">
                <span>距離</span>
                <input
                  v-model.number="form.spaceDistance"
                  type="number"
                  class="number"
                  @change="redraw"
                />
              </label>
              <label class="field mode-field">
                <span>工法</span>
                <select
                  v-model="form.spaceMaterial"
                  class="mode"
                  @change="redraw"
                >
                  <option value="wood">正常套板</option>
                  <option value="stone">包石英石</option>
                </select>
              </label>
            </div>
          </div>
        </section>

        <section class="panel panel-ends">
          <div class="panel-title">左右端 / 側腳</div>
          <div class="stack-fields">
            <div
              class="inline-fields compact-grid-fields triple-fields wrap-fields"
            >
              <label class="field mode-field wide-field">
                <span>左端</span>
                <select
                  v-model="form.leftEnd"
                  class="mode mode-wide"
                  @change="redraw"
                >
                  <option value="左靠牆">左靠牆</option>
                  <option value="左見光">左見光</option>
                  <option value="左靠側板">左靠側板</option>
                  <option value="左齊桶身/側板">左齊桶身/側板</option>
                  <option value="左靠櫃">左靠櫃</option>
                </select>
              </label>
              <label class="field short-field">
                <span>深</span>
                <input
                  v-model.number="form.leftEndDepth"
                  type="number"
                  class="number compact"
                  @change="redraw"
                />
              </label>
            </div>
            <div
              class="inline-fields compact-grid-fields triple-fields wrap-fields"
            >
              <label class="field mode-field wide-field">
                <span>右端</span>
                <select
                  v-model="form.rightEnd"
                  class="mode mode-wide"
                  @change="redraw"
                >
                  <option value="右靠牆">右靠牆</option>
                  <option value="右見光">右見光</option>
                  <option value="右靠側板">右靠側板</option>
                  <option value="右齊桶身/側板">右齊桶身/側板</option>
                  <option value="右靠櫃">右靠櫃</option>
                </select>
              </label>
              <label class="field short-field">
                <span>深</span>
                <input
                  v-model.number="form.rightEndDepth"
                  type="number"
                  class="number compact"
                  @change="redraw"
                />
              </label>
            </div>
            <div class="panel-subtitle">側腳</div>
            <div
              class="inline-fields leg-fields compact-grid-fields triple-fields end-leg-fields"
            >
              <label class="field short-field">
                <span>模式</span>
                <select v-model="form.legMode" class="mode" @change="redraw">
                  <option value="none">無</option>
                  <option value="L">左</option>
                  <option value="B">左右</option>
                  <option value="R">右</option>
                </select>
              </label>
              <label class="field short-field">
                <span>高度</span>
                <input
                  v-model.number="form.legHeight"
                  type="number"
                  class="number compact"
                  @change="redraw"
                />
              </label>
              <label class="field short-field">
                <span>前倒包</span>
                <input
                  v-model.number="form.frontWrap"
                  type="number"
                  class="number compact"
                  @change="redraw"
                />
              </label>
              <label class="field short-field">
                <span>後倒包</span>
                <input
                  v-model.number="form.backWrap"
                  type="number"
                  class="number compact"
                  @change="redraw"
                />
              </label>
              <label class="field short-field">
                <span>厚度</span>
                <input
                  v-model.number="form.legThickness"
                  type="number"
                  class="number compact"
                  @change="redraw"
                />
              </label>
              <label class="field short-field">
                <span>角度</span>
                <input
                  v-model.number="form.legAngle"
                  type="number"
                  class="number compact"
                  @change="redraw"
                />
              </label>
            </div>
          </div>
        </section>
        <section class="panel panel-sinks">
          <div class="panel-title">水槽</div>
          <div class="rows-list sink-stove-list">
            <div
              v-for="(sink, index) in sinks"
              :key="`sink-${index}`"
              class="config-row sink-stove-row"
            >
              <label class="field checkbox-field row-check">
                <input
                  v-model="sink.enabled"
                  type="checkbox"
                  @change="redraw"
                />
                <span>水{{ index + 1 }}</span>
              </label>
              <label class="field mode-field compact-line-field">
                <span>位置</span>
                <select v-model="sink.position" class="mode" @change="redraw">
                  <option value="水中">水中</option>
                  <option value="左開">水左開</option>
                  <option value="右開">水右開</option>
                </select>
              </label>
              <label class="field short-field compact-line-field center-field">
                <span>中心</span>
                <input
                  v-model.number="sink.center"
                  type="number"
                  class="number"
                  @change="redraw"
                />
              </label>
              <label class="field short-field compact-line-field">
                <span>長</span>
                <input
                  v-model.number="sink.sinkLength"
                  type="number"
                  class="number"
                  @change="redraw"
                />
              </label>
              <label class="field short-field compact-line-field">
                <span>深</span>
                <input
                  v-model.number="sink.sinkDepth"
                  type="number"
                  class="number"
                  @change="redraw"
                />
              </label>
              <label class="field short-field compact-line-field">
                <span>開挖</span>
                <input
                  v-model.number="sink.dig"
                  type="number"
                  class="number"
                  @change="redraw"
                />
              </label>
            </div>
          </div>
        </section>

        <section class="panel panel-stoves">
          <div class="panel-title">爐具</div>
          <div class="rows-list sink-stove-list">
            <div
              v-for="(stove, index) in stoves"
              :key="`stove-${index}`"
              class="config-row sink-stove-row"
            >
              <label class="field checkbox-field row-check">
                <input
                  v-model="stove.enabled"
                  type="checkbox"
                  @change="redraw"
                />
                <span>爐{{ index + 1 }}</span>
              </label>
              <label class="field mode-field compact-line-field">
                <span>位置</span>
                <select v-model="stove.position" class="mode" @change="redraw">
                  <option value="爐中">爐中</option>
                  <option value="左開">爐左開</option>
                  <option value="右開">爐右開</option>
                </select>
              </label>
              <label class="field short-field compact-line-field center-field">
                <span>中心</span>
                <input
                  v-model.number="stove.dis"
                  type="number"
                  class="number"
                  @change="redraw"
                />
              </label>
              <label class="field short-field compact-line-field">
                <span>長</span>
                <input
                  v-model.number="stove.stoveLength"
                  type="number"
                  class="number"
                  @change="redraw"
                />
              </label>
              <label class="field short-field compact-line-field">
                <span>寬</span>
                <input
                  v-model.number="stove.stoveDepth"
                  type="number"
                  class="number"
                  @change="redraw"
                />
              </label>
              <label class="field short-field compact-line-field">
                <span>開挖</span>
                <input
                  v-model.number="stove.dig"
                  type="number"
                  class="number"
                  @change="redraw"
                />
              </label>
            </div>
          </div>
        </section>

        <section class="panel panel-settings">
          <div class="panel-title">設定</div>
          <div class="stack-fields">
            <div class="preset-toolbar">
              <label class="field short-field checkbox-field">
                <input
                  v-model="annotation.showGuides"
                  type="checkbox"
                  @change="redraw"
                />
                <span>顯示紅字標示</span>
              </label>
            </div>

            <div class="panel-note">
              紅色編號會直接標在圖面上，設定可對照圖面調整。
            </div>

            <div class="annotation-grid">
              <label
                v-for="item in annotationFields"
                :key="item.key"
                class="field mini-setting-field"
              >
                <span>{{ item.index }}.{{ item.label }}</span>
                <input
                  v-model.number="annotation[item.key]"
                  type="number"
                  class="number compact"
                  :disabled="isAnnotationDisabled(item.key)"
                  @change="redraw"
                />
              </label>
            </div>

            <div class="panel-subtitle">保存槽</div>

            <div class="preset-row">
              <div
                v-for="slot in 3"
                :key="`preset-${slot}`"
                class="preset-actions preset-card"
              >
                <div class="preset-meta">
                  {{
                    presetInfo[slot - 1].savedAt
                      ? formatSavedAt(presetInfo[slot - 1].savedAt)
                      : "未保存"
                  }}
                </div>
                <button class="ghost-btn small-btn" @click="savePreset(slot)">
                  存
                </button>
                <button class="ghost-btn small-btn" @click="loadPreset(slot)">
                  取
                </button>
                <button
                  class="ghost-btn small-btn danger-btn"
                  @click="clearPreset(slot)"
                >
                  清
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>

    <div ref="svgContainerRef" class="svg-container"></div>
  </div>
</template>

<script setup>
import {
  computed,
  defineProps,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
} from "vue";
import { SVG } from "@svgdotjs/svg.js";
import { updateOrderDrawing } from "../../firebase";

const props = defineProps({
  orderId: { type: String, default: null },
  drawingId: { type: String, default: null },
  savedState: { type: Object, default: null },
  order: { type: Object, default: null },
});

const PRESET_KEY = "island-drawing-preset";
const DRAFT_KEY = "island-drawing-draft";

const annotationFields = [
  { key: "s1", index: 1, label: "總長字體" },
  { key: "s2", index: 2, label: "左端數字上下" },
  { key: "s3", index: 3, label: "左端字體" },
  { key: "s4", index: 4, label: "左端距離" },
  { key: "s5", index: 5, label: "左深字體" },
  { key: "s6", index: 6, label: "接線下移" },
  { key: "s7", index: 7, label: "上標高度" },
  { key: "s8", index: 8, label: "下標距離" },
  { key: "s9", index: 9, label: "水中/爐中字上下" },
  { key: "s10", index: 10, label: "右端主標上下" },
  { key: "s11", index: 11, label: "右端數字上下" },
  { key: "s12", index: 12, label: "右深距離" },
  { key: "s13", index: 13, label: "右端字體" },
  { key: "s14", index: 14, label: "右端距離" },
  { key: "s15", index: 15, label: "右副標距離" },
  { key: "s16", index: 16, label: "底標距離" },
  { key: "s17", index: 17, label: "下標字體" },
  { key: "s18", index: 18, label: "副標字體" },
  { key: "topLabelFont", index: 19, label: "上標字體" },
  { key: "leftMainY", index: 20, label: "左端主標上下" },
];

function createDefaultForm() {
  return {
    plusLeft: 0,
    box1: 0,
    box2: 106,
    box3: 100,
    box4: 86,
    box5: 0,
    box6: 0,
    box7: 0,
    plusRight: 0,
    depth: 100,
    originX: 260,
    originY: 160,
    leftEnd: "左靠牆",
    leftEndDepth: null,
    rightEnd: "右靠牆",
    rightEndDepth: null,
    backOption: "後靠牆",
    backstop: false,
    backHeight: 2,
    frontEdge: false,
    leftDepthTag: false,
    rightDepthTag: true,
    cutEnabled: false,
    connect: 230.5,
    spaceEnabled: false,
    spaceDistance: 40,
    spaceMaterial: "wood",
    legHeight: 90,
    legThickness: 6,
    frontWrap: 12,
    backWrap: 12,
    legAngle: 60,
    legMode: "B",
  };
}

function createDefaultSinks() {
  return [
    {
      enabled: true,
      position: "水中",
      center: 56,
      sinkLength: 72,
      sinkDepth: 45,
      R: 5.6,
      dig: 7,
    },
    {
      enabled: false,
      position: "水中",
      center: 0,
      sinkLength: 72,
      sinkDepth: 45,
      R: 5.6,
      dig: 7,
    },
    {
      enabled: false,
      position: "水中",
      center: 0,
      sinkLength: 72,
      sinkDepth: 45,
      R: 5.6,
      dig: 7,
    },
  ];
}

function createDefaultStoves() {
  return [
    {
      enabled: true,
      position: "爐中",
      dis: 246,
      stoveLength: 67,
      stoveDepth: 35,
      R: 8.5,
      dig: 10,
    },
    {
      enabled: false,
      position: "爐中",
      dis: 0,
      stoveLength: 67,
      stoveDepth: 35,
      R: 8.5,
      dig: 10,
    },
    {
      enabled: false,
      position: "爐中",
      dis: 0,
      stoveLength: 67,
      stoveDepth: 35,
      R: 8.5,
      dig: 10,
    },
  ];
}

function createDefaultAnnotationSettings() {
  return {
    showGuides: true,
    topLabelFont: 16,
    leftMainY: 8,
    s1: 18,
    s2: 24,
    s3: 12,
    s4: 20,
    s5: 18,
    s6: 30,
    s7: 20,
    s8: 45,
    s9: 50,
    s10: 8,
    s11: 24,
    s12: 50,
    s13: 20,
    s14: 45,
    s15: 10,
    s16: 10,
    s17: 10,
    s18: 10,
  };
}

const form = reactive(createDefaultForm());
const annotation = reactive(createDefaultAnnotationSettings());
const sinks = reactive(createDefaultSinks());
const stoves = reactive(createDefaultStoves());
const saving = ref(false);
const saveMsg = ref("");
const svgContainerRef = ref(null);
let draw = null;
let draftPersistTimer = null;

const presetInfo = reactive(createSlotInfo(3));

const totalLength = computed(() => getIslandGeometry().totalLength);

onMounted(() => {
  draw = SVG().addTo(svgContainerRef.value).size(1900, 1200);
  if (props.savedState) {
    restoreSnapshot(props.savedState);
  } else if (restoreDraft()) {
    /* restored from local draft */
  } else if (props.order) {
    preFillFromOrder(props.order);
  }
  refreshPresetStatus();
  redraw();
});

onBeforeUnmount(() => {
  if (draftPersistTimer) clearTimeout(draftPersistTimer);
});

function getTightSvg(d) {
  try {
    const box = d.bbox();
    if (box.width > 0 && box.height > 0) {
      const pad = 10;
      d.viewbox(
        box.x - pad,
        box.y - pad,
        box.width + pad * 2,
        box.height + pad * 2,
      );
      const svg = d.svg();
      d.node.removeAttribute("viewBox");
      return svg;
    }
  } catch (error) {
    /* fallthrough */
  }
  return d.svg();
}

function getSnapshot() {
  return {
    form: { ...form },
    annotation: { ...annotation },
    sinks: sinks.map((item) => ({ ...item })),
    stoves: stoves.map((item) => ({ ...item })),
    svgContent: draw ? getTightSvg(draw) : "",
  };
}

function restoreSnapshot(snapshot) {
  if (!snapshot) return;
  if (snapshot.form) Object.assign(form, snapshot.form);
  if (snapshot.annotation) Object.assign(annotation, snapshot.annotation);
  if (Array.isArray(snapshot.sinks)) {
    snapshot.sinks.forEach((item, index) => {
      if (sinks[index]) Object.assign(sinks[index], item);
    });
  }
  if (Array.isArray(snapshot.stoves)) {
    snapshot.stoves.forEach((item, index) => {
      if (stoves[index]) Object.assign(stoves[index], item);
    });
  }
}

function resetDefaults() {
  Object.assign(form, createDefaultForm());
  Object.assign(annotation, createDefaultAnnotationSettings());
  createDefaultSinks().forEach((item, index) =>
    Object.assign(sinks[index], item),
  );
  createDefaultStoves().forEach((item, index) =>
    Object.assign(stoves[index], item),
  );
  redraw();
}

function savePreset(slot) {
  try {
    localStorage.setItem(
      `${PRESET_KEY}-${slot}`,
      JSON.stringify(wrapStoredSnapshot(getSnapshot())),
    );
    refreshPresetStatus();
    saveMsg.value = `已存設定${slot}`;
    setTimeout(() => {
      saveMsg.value = "";
    }, 1500);
  } catch (error) {
    saveMsg.value = "設定儲存失敗";
  }
}

function loadPreset(slot) {
  try {
    const payload = readStoredSnapshot(`${PRESET_KEY}-${slot}`);
    if (!payload) {
      saveMsg.value = `設定${slot}不存在`;
    } else {
      restoreSnapshot(payload);
      redraw();
      saveMsg.value = `已載入設定${slot}`;
    }
    setTimeout(() => {
      saveMsg.value = "";
    }, 1500);
  } catch (error) {
    saveMsg.value = "設定讀取失敗";
  }
}

function clearPreset(slot) {
  try {
    localStorage.removeItem(`${PRESET_KEY}-${slot}`);
    refreshPresetStatus();
    saveMsg.value = `已清除設定${slot}`;
    setTimeout(() => {
      saveMsg.value = "";
    }, 1500);
  } catch (error) {
    saveMsg.value = "設定清除失敗";
  }
}

async function saveDrawing() {
  if (!props.orderId || !props.drawingId) return;
  saving.value = true;
  try {
    await updateOrderDrawing(props.orderId, props.drawingId, getSnapshot());
    saveMsg.value = "✓ 已儲存";
    setTimeout(() => {
      saveMsg.value = "";
    }, 2000);
  } catch (error) {
    saveMsg.value = "儲存失敗";
  } finally {
    saving.value = false;
  }
}

function preFillFromOrder(order) {
  const orderSinks = order?.sinks || [];
  const orderStoves = order?.stoves || [];
  orderSinks.slice(0, 3).forEach((sink, index) => {
    sinks[index].enabled = true;
    if (sink.holeWidthMm) sinks[index].sinkLength = sink.holeWidthMm / 10;
    if (sink.holeDepthMm) sinks[index].sinkDepth = sink.holeDepthMm / 10;
    if (sink.holeRadiusMm) sinks[index].R = sink.holeRadiusMm / 10;
  });
  orderStoves.slice(0, 3).forEach((stove, index) => {
    stoves[index].enabled = true;
    if (stove.holeWidthMm) stoves[index].stoveLength = stove.holeWidthMm / 10;
    if (stove.holeDepthMm) stoves[index].stoveDepth = stove.holeDepthMm / 10;
    if (stove.holeRadiusMm) stoves[index].R = stove.holeRadiusMm / 10;
  });
}

function getIslandGeometry() {
  const segments = [
    { type: "plusLeft", value: sanitizePositive(form.plusLeft) },
    { type: "box", value: sanitizePositive(form.box1) },
    { type: "box", value: sanitizePositive(form.box2) },
    { type: "box", value: sanitizePositive(form.box3) },
    { type: "box", value: sanitizePositive(form.box4) },
    { type: "box", value: sanitizePositive(form.box5) },
    { type: "box", value: sanitizePositive(form.box6) },
    { type: "box", value: sanitizePositive(form.box7) },
    { type: "plusRight", value: sanitizePositive(form.plusRight) },
  ].filter((segment) => segment.value > 0);

  return {
    depth: Math.max(1, sanitizePositive(form.depth)),
    totalLength: Math.max(
      1,
      segments.reduce((sum, segment) => sum + segment.value, 0),
    ),
    segments,
  };
}

function redraw() {
  if (!draw) return;
  draw.clear();

  const geometry = getIslandGeometry();
  const x0 = Number(form.originX) || 260;
  const y0 = Number(form.originY) || 160;
  const total = geometry.totalLength;
  const depth = geometry.depth;
  const legArgs = {
    totalLength: total,
    depth,
    legHeight: Math.max(1, sanitizePositive(form.legHeight)),
    legThickness: Math.max(1, sanitizePositive(form.legThickness)),
    frontWrap: Math.max(0, sanitizePositive(form.frontWrap)),
    backWrap: Math.max(0, sanitizePositive(form.backWrap)),
    legAngle: Math.max(1, sanitizePositive(form.legAngle)),
    legMode: form.legMode,
  };

  drawIslandBody(x0, y0, geometry);
  drawLeftEnd(x0, y0, depth);
  drawRightEnd(x0 + total, y0, depth);

  if (form.backOption === "後靠牆") drawTopWall(x0, y0, total);
  if (form.backOption === "後見光") drawTri(x0 + total / 2, y0 - 18, "d");
  if (form.backstop) {
    const stopY = y0 + Math.max(0.5, Number(form.backHeight) || 2);
    drawLine(point(x0, stopY), point(x0 + total, stopY));
  }
  if (form.frontEdge) drawTri(x0 + total / 2, y0 + depth + 18, "u");
  if (form.leftDepthTag) drawLeftDepthMarker(x0, y0, depth);
  if (form.rightDepthTag) drawRightDepthMarker(x0 + total, y0, depth);
  if (form.cutEnabled && form.connect > 0 && form.connect < total) {
    drawCutLineH(x0, y0, depth, total, Number(form.connect));
  }
  if (
    form.spaceEnabled &&
    form.spaceDistance > 0 &&
    form.spaceDistance < depth
  ) {
    drawSpaceMarker(
      x0,
      y0,
      total,
      Number(form.spaceDistance),
      form.spaceMaterial,
    );
  }

  sinks.forEach((sink) => {
    if (sink.enabled) drawSinkH(sink, x0, y0, depth, total);
  });
  stoves.forEach((stove) => {
    if (stove.enabled) drawStoveH(stove, x0, y0, depth, total);
  });

  drawLegacyIslandLegs({ x0, y0, ...legArgs });
  drawTopLengthMarker(x0, y0, total);

  const contentWidth = Math.max(1200, x0 + total + 300);
  const contentHeight = Math.max(900, y0 + depth + 220);
  draw.size(contentWidth, contentHeight);
  scheduleDraftPersist();
}

function drawIslandBody(x0, y0, geometry) {
  const { totalLength, depth, segments } = geometry;
  draw
    .rect(totalLength, depth)
    .move(x0, y0)
    .fill("white")
    .stroke({ width: 1, color: "black" });
  const bottomOffset = getAnnotationValue("s8", 45);
  const bottomFontSize = getAnnotationValue("s17", 10);
  const plusOffset = getAnnotationValue("s16", 10);
  const plusFontSize = getAnnotationValue("s18", 10);

  let cursorX = x0;
  segments.forEach((segment, index) => {
    cursorX += segment.value;
    if (index < segments.length - 1) drawTickBottom(cursorX, y0 + depth);
    if (segment.type === "box")
      drawCenteredText(
        segment.value,
        cursorX - segment.value / 2,
        y0 + depth + bottomOffset,
        bottomFontSize,
      );
  });

  if (sanitizePositive(form.plusLeft) > 0) {
    drawText(
      `+${sanitizePositive(form.plusLeft)}`,
      x0 - 18,
      y0 + depth + plusOffset,
      plusFontSize,
    );
    drawSettingGuide(16, x0 - 28, y0 + depth + plusOffset - 10);
    drawSettingGuide(18, x0 - 12, y0 + depth + plusOffset + 10);
  }
  if (sanitizePositive(form.plusRight) > 0) {
    drawText(
      `+${sanitizePositive(form.plusRight)}`,
      x0 + totalLength + 2,
      y0 + depth + plusOffset,
      plusFontSize,
    );
    drawSettingGuide(16, x0 + totalLength + 12, y0 + depth + plusOffset - 10);
    drawSettingGuide(18, x0 + totalLength + 28, y0 + depth + plusOffset + 10);
  }

  if (segments.some((segment) => segment.type === "box")) {
    drawSettingGuide(
      8,
      x0 + totalLength * 0.12,
      y0 + depth + bottomOffset - 14,
    );
    drawSettingGuide(
      17,
      x0 + totalLength * 0.12,
      y0 + depth + bottomOffset + 4,
    );
  }
}

function drawLeftEnd(x0, y0, depth) {
  if (form.leftEnd === "左靠牆")
    drawVerticalEdgeTreatment(x0, y0, depth, "left", "牆");
  if (
    form.leftEnd === "左見光" &&
    form.legMode !== "L" &&
    form.legMode !== "B"
  ) {
    drawTri(x0 - 18, y0 + depth / 2, "r");
  }
  if (form.leftEnd === "左靠側板") {
    drawVerticalEdgeTreatment(x0, y0, depth, "left", "側板", form.leftEndDepth);
  }
  if (form.leftEnd === "左齊桶身/側板") drawAlignMarkerLeft(x0, y0, depth);
  if (form.leftEnd === "左靠櫃")
    drawVerticalEdgeTreatment(x0, y0, depth, "left", "櫃", form.leftEndDepth);
}

function drawRightEnd(xRight, y0, depth) {
  if (form.rightEnd === "右靠牆")
    drawVerticalEdgeTreatment(xRight, y0, depth, "right", "牆");
  if (form.rightEnd === "右見光") drawTri(xRight + 18, y0 + depth / 2, "l");
  if (form.rightEnd === "右靠側板") {
    drawVerticalEdgeTreatment(
      xRight,
      y0,
      depth,
      "right",
      "側板",
      form.rightEndDepth,
    );
  }
  if (form.rightEnd === "右齊桶身/側板")
    drawAlignMarkerRight(xRight, y0, depth);
  if (form.rightEnd === "右靠櫃")
    drawVerticalEdgeTreatment(
      xRight,
      y0,
      depth,
      "right",
      "櫃",
      form.rightEndDepth,
    );
}

function drawVerticalEdgeTreatment(
  xEdge,
  y0,
  depth,
  side,
  label,
  coverDepth = null,
) {
  const cover = Math.max(
    0,
    Math.min(depth, sanitizeNullablePositive(coverDepth) ?? depth),
  );
  const direction = side === "left" ? -1 : 1;
  const labelDistance = getAnnotationValue(
    side === "left" ? "s4" : "s14",
    side === "left" ? 20 : 45,
  );
  const labelFontSize = getAnnotationValue(
    side === "left" ? "s3" : "s13",
    side === "left" ? 12 : 20,
  );
  const secondaryFontSize = getAnnotationValue("s18", 10);
  const secondaryDistance = getAnnotationValue(
    side === "left" ? "s4" : "s15",
    side === "left" ? 20 : 10,
  );
  const mainLabelY =
    side === "right"
      ? y0 + getAnnotationValue("s10", 8)
      : y0 + getAnnotationValue("leftMainY", 8);
  const primaryNumberY =
    side === "right"
      ? y0 + getAnnotationValue("s11", 24)
      : y0 + getAnnotationValue("s2", 24);
  for (let offset = 0; offset < cover; offset += 8) {
    const x1 = xEdge + direction * 4;
    const x2 = xEdge;
    draw
      .line(x1, y0 + offset, x2, y0 + offset + 6)
      .stroke({ width: 0.6, color: "black" });
  }

  const labelX = xEdge + direction * labelDistance;
  drawCenteredText(label, labelX, mainLabelY, labelFontSize);
  drawSettingGuide(side === "left" ? 3 : 13, labelX + direction * 4, y0 - 18);
  drawSettingGuide(side === "left" ? 4 : 14, labelX + direction * 22, y0 + 18);
  if (side === "right")
    drawSettingGuide(10, labelX + direction * 8, mainLabelY - 16);
  if (side === "left")
    drawSettingGuide(20, labelX + direction * 8, mainLabelY - 16);

  if (cover < depth) {
    const boundaryY = y0 + cover;
    const seal = Math.round((depth - cover + 1) * 10) / 10;
    drawLine(point(xEdge - 3, boundaryY), point(xEdge + 3, boundaryY));
    drawDiamond(
      point(xEdge + direction * 7, boundaryY + (depth - cover) / 2),
      5,
    );
    drawText(
      String(Math.round(cover * 10) / 10),
      labelX - 2,
      primaryNumberY,
      secondaryFontSize,
    );
    drawText(
      String(seal),
      xEdge + direction * secondaryDistance,
      boundaryY + (depth - cover) / 2 + 4,
      secondaryFontSize,
    );
    drawSettingGuide(18, labelX, y0 + 34);
    if (side === "right") drawSettingGuide(11, labelX + 4, primaryNumberY - 12);
    if (side === "right") {
      drawSettingGuide(
        15,
        xEdge + direction * secondaryDistance + 8,
        boundaryY + (depth - cover) / 2 - 8,
      );
    }
  } else if (coverDepth != null && cover > 0) {
    drawText(
      String(Math.round(cover * 10) / 10),
      labelX - 2,
      primaryNumberY,
      secondaryFontSize,
    );
    drawSettingGuide(18, labelX, y0 + 34);
    if (side === "right") drawSettingGuide(11, labelX + 4, primaryNumberY - 12);
  }
}

function drawAlignMarkerLeft(x0, y0, depth) {
  const p = point(x0 - 24, y0 + depth / 2);
  drawDiamond(p, 4);
  drawTri(p.x, p.y + 1, "u");
}

function drawAlignMarkerRight(xRight, y0, depth) {
  const p = point(xRight + 24, y0 + depth / 2);
  drawDiamond(p, 4);
  drawTri(p.x, p.y + 1, "u");
}

function drawSpaceMarker(x0, y0, totalLength, distance, material) {
  const y = y0 + distance;
  drawDashedLine(point(x0, y), point(x0 + totalLength, y));
  const label =
    material === "stone"
      ? `${distance} 懸空處包石英石`
      : `${distance} 懸空處正常套板`;
  drawCenteredText(label, x0 + totalLength / 2, y0 + distance / 2 + 6, 11);
}

function drawSinkH(sink, x0, y0, depth, totalLength) {
  const { sinkLength, sinkDepth, R, dig, center, position } = sink;
  const labelOffset = sanitizePositive(center);
  let x;
  if (position === "左開") x = x0 + labelOffset;
  else if (position === "右開") x = x0 + totalLength - labelOffset - sinkLength;
  else x = x0 + labelOffset - sinkLength / 2;
  const y = y0 + depth - sanitizePositive(dig) - sinkDepth;
  drawSinkBox(x, y, sinkLength, sinkDepth, R);
  const label =
    position === "水中"
      ? `水中${labelOffset}`
      : position === "左開"
        ? `水左開${labelOffset}`
        : `水右開${labelOffset}`;
  drawTopLabel(
    label,
    position === "右開" ? x0 + totalLength - labelOffset : x0 + labelOffset,
    y0,
    position === "右開" ? x0 + totalLength : x0,
    {
      fontSize: getAnnotationValue("topLabelFont", 16),
      yAdjust: getAnnotationValue("s9", 50),
      guideIndex: 9,
    },
  );
}

function drawStoveH(stove, x0, y0, depth, totalLength) {
  const { stoveLength, stoveDepth, R, dig, dis, position } = stove;
  const labelOffset = sanitizePositive(dis);
  let x;
  if (position === "左開") x = x0 + labelOffset;
  else if (position === "右開")
    x = x0 + totalLength - labelOffset - stoveLength;
  else x = x0 + labelOffset - stoveLength / 2;
  const y = y0 + depth - sanitizePositive(dig) - stoveDepth;
  drawStoveBox(x, y, stoveLength, stoveDepth, R);
  const label =
    position === "爐中"
      ? `爐中${labelOffset}`
      : position === "左開"
        ? `爐左開${labelOffset}`
        : `爐右開${labelOffset}`;
  drawTopLabel(
    label,
    position === "右開" ? x0 + totalLength - labelOffset : x0 + labelOffset,
    y0,
    position === "右開" ? x0 + totalLength : x0,
    {
      fontSize: getAnnotationValue("topLabelFont", 16),
      yAdjust: getAnnotationValue("s9", 50),
      guideIndex: 9,
    },
  );
}

function drawSinkBox(x, y, width, height, radius) {
  draw
    .rect(width, height)
    .move(x, y)
    .radius(radius)
    .fill("none")
    .stroke({ width: 1, color: "black" });
  const drain = 14;
  draw
    .circle(drain)
    .move(x + width / 2 - drain / 2, y + height / 2 - drain / 2)
    .fill("none")
    .stroke({ width: 1, color: "black" });
}

function drawStoveBox(x, y, width, height, radius) {
  draw
    .rect(width, height)
    .move(x, y)
    .radius(radius)
    .fill("none")
    .stroke({ width: 1, color: "black" });
  const ring = 12;
  draw
    .circle(ring)
    .move(x + width / 4 - ring / 2, y + height / 2 - ring / 2)
    .fill("none")
    .stroke({ width: 1, color: "black" });
  draw
    .circle(ring)
    .move(x + (width * 3) / 4 - ring / 2, y + height / 2 - ring / 2)
    .fill("none")
    .stroke({ width: 1, color: "black" });
}

function drawTopLabel(text, xPoint, y0, xFrom, options = {}) {
  const yLine = y0 - getAnnotationValue("s7", 20);
  draw.line(xFrom, yLine, xPoint, yLine).stroke({ width: 0.5, color: "black" });
  draw.line(xPoint, yLine, xPoint, y0).stroke({ width: 0.5, color: "black" });
  const node = draw.text(String(text)).font({
    size: options.fontSize || getAnnotationValue("topLabelFont", 16),
    family: "DFKai-sb",
  });
  const yAdjust = options.yAdjust || 0;
  node.move(xPoint - node.bbox().width / 2, yLine - 14 - yAdjust / 10);
  drawSettingGuide(7, xPoint + 12, yLine - 12);
  drawSettingGuide(19, xPoint + 26, yLine - 28);
  if (options.guideIndex)
    drawSettingGuide(options.guideIndex, xPoint - 16, yLine - 28);
}

function drawCutLineH(x0, y0, depth, totalLength, fromLeft) {
  const yMid = y0 + depth + getAnnotationValue("s6", 30);
  draw
    .line(x0 + fromLeft, y0, x0 + fromLeft, yMid)
    .stroke({ width: 1, color: "black" });
  draw
    .line(x0 + fromLeft - 30, yMid, x0 + fromLeft, yMid)
    .stroke({ width: 1, color: "black" });
  draw
    .line(x0 + fromLeft + 30, yMid, x0 + fromLeft, yMid)
    .stroke({ width: 1, color: "black" });
  drawText(
    String(Math.round(fromLeft * 10) / 10),
    x0 + fromLeft - 28,
    yMid + 3,
    10,
  );
  drawText(
    String(Math.round((totalLength - fromLeft) * 10) / 10),
    x0 + fromLeft + 4,
    yMid + 3,
    10,
  );
  drawSettingGuide(6, x0 + fromLeft + 8, yMid + 18);
}

function drawTopWall(x0, y0, totalLength) {
  for (let offset = -2; offset <= totalLength + 4; offset += 5) {
    draw
      .line(x0 + offset, y0 - 1, x0 + offset + 6, y0 - 6)
      .stroke({ width: 1, color: "black" });
  }
}

function drawTri(cx, cy, dir) {
  const size = 8;
  let points;
  if (dir === "u") {
    points = [
      [cx, cy - size * 0.6],
      [cx - size / 2, cy + size * 0.3],
      [cx + size / 2, cy + size * 0.3],
    ];
  } else if (dir === "d") {
    points = [
      [cx - size / 2, cy - size * 0.3],
      [cx + size / 2, cy - size * 0.3],
      [cx, cy + size * 0.6],
    ];
  } else if (dir === "l") {
    points = [
      [cx + size * 0.3, cy - size / 2],
      [cx - size * 0.6, cy],
      [cx + size * 0.3, cy + size / 2],
    ];
  } else {
    points = [
      [cx - size * 0.3, cy - size / 2],
      [cx + size * 0.6, cy],
      [cx - size * 0.3, cy + size / 2],
    ];
  }
  draw
    .polygon(points.map((pointItem) => pointItem.join(",")).join(" "))
    .fill("black");
}

function drawDiamond(center, size) {
  const delta = (Math.sqrt(2) * size) / 2;
  draw
    .polygon(
      [
        [center.x, center.y - delta],
        [center.x - delta, center.y],
        [center.x, center.y + delta],
        [center.x + delta, center.y],
      ]
        .map((pointItem) => pointItem.join(","))
        .join(" "),
    )
    .fill("black");
}

function drawLeftDepthMarker(x0, y0, depth) {
  const xLine = x0 - 50;
  draw.line(xLine, y0, xLine, y0 + depth).stroke({ width: 1, color: "black" });
  draw.line(xLine - 8, y0, xLine + 8, y0).stroke({ width: 1, color: "black" });
  draw
    .line(xLine - 8, y0 + depth, xLine + 8, y0 + depth)
    .stroke({ width: 1, color: "black" });
  const textNode = draw
    .text(String(depth))
    .font({ size: getAnnotationValue("s5", 18), family: "DFKai-sb" });
  textNode.move(
    xLine - textNode.bbox().width - 10,
    y0 + depth / 2 - textNode.bbox().height / 2,
  );
  drawSettingGuide(5, xLine - 24, y0 + depth / 2 - 18);
}

function drawRightDepthMarker(xEdge, y0, depth) {
  const xLine = xEdge + getAnnotationValue("s12", 50);
  draw.line(xLine, y0, xLine, y0 + depth).stroke({ width: 1, color: "black" });
  draw.line(xLine - 8, y0, xLine + 8, y0).stroke({ width: 1, color: "black" });
  draw
    .line(xLine - 8, y0 + depth, xLine + 8, y0 + depth)
    .stroke({ width: 1, color: "black" });
  const textNode = draw
    .text(String(depth))
    .font({ size: getAnnotationValue("s5", 18), family: "DFKai-sb" });
  textNode.move(xLine + 12, y0 + depth / 2 - textNode.bbox().height / 2);
  drawSettingGuide(12, xLine + 18, y0 + depth / 2 - 18);
}

function drawTopLengthMarker(x0, y0, totalLength) {
  const yLine = y0 - 50;
  draw
    .line(x0, yLine, x0 + totalLength, yLine)
    .stroke({ width: 1, color: "black" });
  draw.line(x0, yLine - 8, x0, yLine + 8).stroke({ width: 1, color: "black" });
  draw
    .line(x0 + totalLength, yLine - 8, x0 + totalLength, yLine + 8)
    .stroke({ width: 1, color: "black" });
  const textNode = draw
    .text(String(totalLength))
    .font({ size: getAnnotationValue("s1", 18), family: "DFKai-sb" });
  textNode.move(
    x0 + totalLength / 2 - textNode.bbox().width / 2,
    yLine - textNode.bbox().height - 4,
  );
  drawSettingGuide(
    1,
    x0 + totalLength / 2 - 22,
    yLine - textNode.bbox().height - 16,
  );
}

function drawLegacyIslandLegs({
  x0,
  y0,
  totalLength,
  depth,
  legHeight,
  legThickness,
  frontWrap,
  backWrap,
  legAngle,
  legMode,
}) {
  if (legMode === "L") {
    drawIslandLegL({
      x: x0,
      y: y0,
      totalLength,
      depth,
      legHeight,
      legThickness,
      frontWrap,
      backWrap,
      legAngle,
    });
    return;
  }
  if (legMode === "R") {
    drawIslandLegR({
      x: x0 + totalLength,
      y: y0,
      totalLength,
      depth,
      legHeight,
      legThickness,
      frontWrap,
      backWrap,
      legAngle,
    });
    return;
  }
  if (legMode === "B") {
    drawIslandLegB({
      x: x0,
      y: y0,
      totalLength,
      depth,
      legHeight,
      legThickness,
      frontWrap,
      backWrap,
      legAngle,
    });
  }
}

function drawIslandLegL({
  x,
  y,
  totalLength,
  depth,
  legHeight,
  legThickness,
  frontWrap,
  backWrap,
  legAngle,
}) {
  const angleRad = (legAngle * Math.PI) / 180;
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  const p0 = point(x, y);
  const p1 = point(p0.x - legHeight * cos, p0.y + legHeight * sin);
  const p2 = point(p1.x, p1.y + depth);
  const p6 = point(p0.x, p0.y + depth);
  const p3 = point(p2.x + legThickness, p2.y);
  const p4 = point(
    p3.x + (legHeight - legThickness) * cos,
    p3.y - (legHeight - legThickness) * sin,
  );
  const p5 = point(p4.x - legThickness, p4.y);
  const p14 = point(p5.x + totalLength, p5.y);
  const p15 = point(p14.x + legThickness * cos, p14.y - legThickness * sin);
  const p7 = point(p2.x, p2.y - frontWrap);
  const p8 = point(p0.x, p0.y + depth - frontWrap);
  const p9 = point(p1.x, p1.y + backWrap);
  const p10 = point(p0.x, p0.y + backWrap);
  const p21 = point(p2.x, p2.y + 10);
  const p22 = point(p1.x, p1.y - 55);
  const p24 = point(p22.x, p22.y - 5);
  const p26 = point(p0.x, p0.y - 50);
  const p28 = PAD(p24, legAngle, 10);
  const p29 = PAD(p26, legAngle + 180, 10);
  const p30 = PAD(p28, legAngle, 30);
  const p31 = point((p24.x + p30.x) / 2, (p24.y + p30.y) / 2);
  const dh = (frontWrap - 12) / 2;
  const dh2 = (backWrap - 12) / 2;
  const pa = point(p2.x + 18, p2.y - Math.tan(angleRad) * 18 - 2 - dh);
  const pb = point(p9.x + 18, p9.y - Math.tan(angleRad) * 18 - 2 - dh2);

  drawAngledTextSized(`${frontWrap}倒包石`, pa.x, pa.y, 6, legAngle);
  drawAngledTextSized(`${backWrap}倒包石`, pb.x, pb.y, 6, legAngle);
  drawText(String(legThickness), p21.x, p21.y, 8);
  drawAngledTextCentered(String(legHeight), p31.x + 8, p31.y - 8, 16, legAngle);
  drawPolyline([p0, p1, p2, p6]);
  drawLine(p2, p3);
  drawLine(p3, p4);
  drawLine(p5, p14);
  drawLine(p14, p15);
  drawDashedLine(p7, p8);
  drawDashedLine(p9, p10);
  drawLine(p22, point(p22.x, p22.y - 10));
  drawLine(p24, p28);
  drawLine(p26, p29);
}

function drawIslandLegB({
  x,
  y,
  totalLength,
  depth,
  legHeight,
  legThickness,
  frontWrap,
  backWrap,
  legAngle,
}) {
  const angleRad = (legAngle * Math.PI) / 180;
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  const p0 = point(x, y);
  const p1 = point(p0.x - legHeight * cos, p0.y + legHeight * sin);
  const p2 = point(p1.x, p1.y + depth);
  const p6 = point(p0.x, p0.y + depth);
  const p3 = point(p2.x + legThickness, p2.y);
  const p4 = point(
    p3.x + (legHeight - legThickness) * cos,
    p3.y - (legHeight - legThickness) * sin,
  );
  const p5 = point(p4.x - legThickness, p4.y);
  const p14 = point(p5.x + totalLength, p5.y);
  const p15 = point(p14.x + legThickness * cos, p14.y - legThickness * sin);
  const p7 = point(p2.x, p2.y - frontWrap);
  const p8 = point(p0.x, p0.y + depth - frontWrap);
  const p9 = point(p1.x, p1.y + backWrap);
  const p10 = point(p0.x, p0.y + backWrap);
  const p21 = point(p2.x, p2.y + 10);
  const p11 = point(
    p14.x - (legHeight - legThickness) * cos,
    p14.y + (legHeight - legThickness) * sin,
  );
  const p12 = point(p11.x - legThickness, p11.y);
  const p13 = point(p14.x - legThickness, p14.y);
  const p20 = point(p12.x, p14.y);
  const p22 = point(p1.x, p1.y - 55);
  const p24 = point(p22.x, p22.y - 5);
  const p26 = point(p0.x, p0.y - 50);
  const p28 = PAD(p24, legAngle, 10);
  const p29 = PAD(p26, legAngle + 180, 10);
  const p30 = PAD(p28, legAngle, 30);
  const p31 = point((p24.x + p30.x) / 2, (p24.y + p30.y) / 2);
  const c1 = point(p0.x + totalLength - legThickness, p0.y);
  const c2 = point(c1.x, c1.y + depth);
  const b1 = p12;
  const b2 = point(b1.x, b1.y - frontWrap);
  const b3 = point(b2.x, b1.y - depth + backWrap);
  const b4 = point(b1.x, b1.y - depth);
  const e1 = point(c1.x, c1.y + depth);
  const e2 = point(e1.x, e1.y - frontWrap);
  const e3 = point(c1.x, c1.y + backWrap);

  drawDashedLine(c1, c2);
  drawDashedLine(p15, e1);

  if (b2.y > p14.y) {
    const f2 = point(b1.x + (b2.y - p14.y) / Math.tan(angleRad), p14.y);
    drawDashedLine(e2, f2);
    drawLine(f2, b2);
  }

  const pmd = point(b4.x, p14.y);
  if (b4.y > p14.y) {
    drawLine(b1, b4);
  } else {
    if (b3.y > p14.y) drawLine(b1, b3);
    drawDashedLine(b4, c1);
    drawDashedLine(b4, pmd);
  }

  if (b3.y < p14.y) {
    drawDashedLine(b3, e3);
  } else {
    const f3 = point(b1.x + (b3.y - p14.y) / Math.tan(angleRad), p14.y);
    drawDashedLine(e3, f3);
    drawLine(f3, b3);
  }

  const dh = (frontWrap - 12) / 2;
  const dh2 = (backWrap - 12) / 2;
  const pa = point(p2.x + 18, p2.y - Math.tan(angleRad) * 18 - 2 - dh);
  const pc = point(pa.x + totalLength - legThickness, pa.y);
  const pb = point(p9.x + 18, p9.y - Math.tan(angleRad) * 18 - 2 - dh2);
  const pd = point(pb.x + totalLength - legThickness, pb.y);

  drawAngledTextSized(`${frontWrap}倒包石`, pa.x, pa.y, 6, legAngle);
  drawAngledTextSized(`${frontWrap}倒包石`, pc.x, pc.y, 6, legAngle);
  drawAngledTextSized(`${backWrap}倒包石`, pb.x, pb.y, 6, legAngle);
  drawAngledTextSized(`${backWrap}倒包石`, pd.x, pd.y, 6, legAngle);
  drawText(String(legThickness), p21.x, p21.y, 8);
  drawAngledTextCentered(String(legHeight), p31.x + 8, p31.y - 8, 16, legAngle);

  drawPolyline([p0, p1, p2, p6]);
  drawLine(p2, p3);
  drawLine(p3, p4);
  drawLine(p5, p14);
  drawLine(p14, p15);
  drawDashedLine(p7, p8);
  drawDashedLine(p9, p10);
  drawLine(p14, p11);
  drawLine(p11, p12);
  drawLine(p12, p13);
  drawLine(p12, p20);
  drawLine(p22, point(p22.x, p22.y - 10));
  drawLine(p24, p28);
  drawLine(p26, p29);
}

function drawIslandLegR({
  x,
  y,
  totalLength,
  depth,
  legHeight,
  legThickness,
  frontWrap,
  backWrap,
  legAngle,
}) {
  const angleRad = (legAngle * Math.PI) / 180;
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  const p0 = point(x - totalLength, y);
  const p1 = point(p0.x - legHeight * cos, p0.y + legHeight * sin);
  const p2 = point(p1.x, p1.y + depth);
  const p3 = point(p2.x + legThickness, p2.y);
  const p4 = point(
    p3.x + (legHeight - legThickness) * cos,
    p3.y - (legHeight - legThickness) * sin,
  );
  const p5 = point(p4.x - legThickness, p4.y);
  const p14 = point(p5.x + totalLength, p5.y);
  const p15 = point(p14.x + legThickness * cos, p14.y - legThickness * sin);
  const p11 = point(
    p14.x - (legHeight - legThickness) * cos,
    p14.y + (legHeight - legThickness) * sin,
  );
  const p12 = point(p11.x - legThickness, p11.y);
  const p13 = point(p14.x - legThickness, p14.y);
  const p20 = point(p12.x, p14.y);
  const p21 = point(p2.x, p2.y + 10);
  const p22 = point(p1.x, p1.y - 55);
  const p24 = point(p22.x, p22.y - 5);
  const p26 = point(p0.x, p0.y - 50);
  const p28 = PAD(p24, legAngle, 10);
  const p29 = PAD(p26, legAngle + 180, 10);
  const p30 = PAD(p28, legAngle, 30);
  const c1 = point(p0.x + totalLength - legThickness, p0.y);
  const c2 = point(c1.x, c1.y + depth);
  const b1 = p12;
  const b2 = point(b1.x, b1.y - frontWrap);
  const b3 = point(b2.x, b1.y - depth + backWrap);
  const b4 = point(b1.x, b1.y - depth);
  const e1 = point(c1.x, c1.y + depth);
  const e2 = point(e1.x, e1.y - frontWrap);
  const e3 = point(c1.x, c1.y + backWrap);
  const p51 = point(p5.x, p5.y - depth);
  const p61 = point(p21.x + totalLength - 5, p21.y);

  drawDashedLine(c1, c2);
  drawDashedLine(p15, e1);

  if (b2.y > p14.y) {
    const f2 = point(b1.x + (b2.y - p14.y) / Math.tan(angleRad), p14.y);
    drawDashedLine(e2, f2);
    drawLine(f2, b2);
  }

  const pmd = point(b4.x, p14.y);
  if (b4.y > p14.y) {
    drawLine(b1, b4);
  } else {
    if (b3.y > p14.y) drawLine(b1, b3);
    drawDashedLine(b4, c1);
    drawDashedLine(b4, pmd);
  }

  if (b3.y < p14.y) {
    drawDashedLine(b3, e3);
  } else {
    const f3 = point(b1.x + (b3.y - p14.y) / Math.tan(angleRad), p14.y);
    drawDashedLine(e3, f3);
    drawLine(f3, b3);
  }

  const dh = (frontWrap - 12) / 2;
  const dh2 = (backWrap - 12) / 2;
  const pa = point(p2.x + 18, p2.y - Math.tan(angleRad) * 18 - 2 - dh);
  const pc = point(pa.x + totalLength - legThickness, pa.y);
  const pb = point(
    p1.x + 18,
    p1.y + backWrap - Math.tan(angleRad) * 18 - 2 - dh2,
  );
  const pd = point(pb.x + totalLength - legThickness, pb.y);

  drawAngledTextSized(`${frontWrap}倒包石`, pc.x, pc.y, 6, legAngle);
  drawAngledTextSized(`${backWrap}倒包石`, pd.x, pd.y, 6, legAngle);
  drawText(String(legThickness), p61.x, p61.y, 8);
  drawAngledTextSized(String(legHeight), p30.x, p30.y + 15, 16, legAngle);

  drawLine(p14, p5);
  drawLine(p14, p15);
  drawLine(point(p0.x, p0.y + depth), p5);
  drawLine(p5, p51);
  drawLine(p0, p51);
  drawLine(p14, p11);
  drawLine(p11, p12);
  drawLine(p12, p13);
  drawLine(p12, p20);
  drawLine(p22, point(p22.x, p22.y - 10));
  drawLine(p24, p28);
  drawLine(p26, p29);
}

function point(x, y) {
  return { x, y };
}

function PAD(p, angle, distance) {
  const angleRad = (angle * Math.PI) / 180;
  return point(
    p.x + distance * Math.cos(angleRad),
    p.y - distance * Math.sin(angleRad),
  );
}

function drawLine(a, b) {
  draw.line(a.x, a.y, b.x, b.y).stroke({ width: 1, color: "black" });
}

function drawDashedLine(a, b) {
  draw
    .line(a.x, a.y, b.x, b.y)
    .stroke({ width: 1, color: "black", dasharray: "5,4" });
}

function drawPolyline(points) {
  for (let index = 0; index < points.length - 1; index += 1) {
    drawLine(points[index], points[index + 1]);
  }
}

function drawText(text, x, y, size = 12, rotate = 0) {
  const node = draw.text(String(text)).font({ size, family: "DFKai-sb" });
  node.move(x, y);
  if (rotate) node.rotate(-rotate, x, y);
}

function drawCenteredText(text, centerX, y, size = 10) {
  const node = draw.text(String(text)).font({ size, family: "DFKai-sb" });
  node.move(centerX - node.bbox().width / 2, y);
}

function drawAngledTextSized(text, x, y, size, angle) {
  const node = draw.text(String(text)).font({ size, family: "DFKai-sb" });
  node.move(x, y);
  node.rotate(-angle, x, y);
}

function drawAngledTextCentered(text, cx, cy, size, angle) {
  const node = draw.text(String(text)).font({ size, family: "DFKai-sb" });
  const box = node.bbox();
  node.move(cx - box.width / 2, cy - box.height / 2);
  node.rotate(-angle, cx, cy);
}

function drawSettingGuide(index, x, y) {
  if (!annotation.showGuides) return;
  const node = draw
    .text(`${index}.`)
    .font({ size: 12, family: "Arial", weight: 700 });
  node.fill("#d62828");
  node.move(x, y);
}

function drawTickBottom(x, y) {
  draw.line(x, y, x, y + 2).stroke({ width: 1, color: "black" });
}

function sanitizePositive(value) {
  return Math.max(0, Number(value) || 0);
}

function sanitizeNullablePositive(value) {
  if (value == null || value === "") return null;
  return Math.max(0, Number(value) || 0);
}

function getAnnotationValue(key, fallback) {
  const value = Number(annotation[key]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function hasRightSecondaryLabel() {
  if (form.rightEnd !== "右靠側板" && form.rightEnd !== "右靠櫃") return false;
  const depth = Math.max(1, sanitizePositive(form.depth));
  const cover = sanitizeNullablePositive(form.rightEndDepth);
  return cover != null && cover > 0 && cover < depth;
}

function hasLeftEndLabel() {
  return (
    form.leftEnd === "左靠牆" ||
    form.leftEnd === "左靠側板" ||
    form.leftEnd === "左靠櫃"
  );
}

function hasLeftPrimaryNumber() {
  if (form.leftEnd !== "左靠側板" && form.leftEnd !== "左靠櫃") return false;
  const cover = sanitizeNullablePositive(form.leftEndDepth);
  return cover != null && cover > 0;
}

function isAnnotationDisabled(key) {
  if (key === "s4") return !hasLeftEndLabel();
  if (key === "s2") return !hasLeftPrimaryNumber();
  if (key === "s15") return !hasRightSecondaryLabel();
  if (key === "leftMainY") return !hasLeftEndLabel();
  return false;
}

function createSlotInfo(count) {
  return Array.from({ length: count }, () => ({ savedAt: null }));
}

function wrapStoredSnapshot(snapshot) {
  return {
    savedAt: Date.now(),
    snapshot,
  };
}

function readStoredSnapshot(key) {
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  const parsed = JSON.parse(raw);
  if (parsed?.snapshot) return parsed.snapshot;
  if (parsed?.form || parsed?.sinks || parsed?.stoves) return parsed;
  return null;
}

function readStoredSavedAt(key) {
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  const parsed = JSON.parse(raw);
  return parsed?.savedAt || null;
}

function refreshPresetStatus() {
  for (let index = 0; index < presetInfo.length; index += 1) {
    presetInfo[index].savedAt = readStoredSavedAt(`${PRESET_KEY}-${index + 1}`);
  }
}

function scheduleDraftPersist() {
  if (draftPersistTimer) clearTimeout(draftPersistTimer);
  draftPersistTimer = setTimeout(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(getSnapshot()));
    } catch (error) {
      /* ignore local draft failures */
    }
  }, 200);
}

function restoreDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return false;
    restoreSnapshot(JSON.parse(raw));
    return true;
  } catch (error) {
    return false;
  }
}

function formatSavedAt(savedAt) {
  if (!savedAt) return "";
  const date = new Date(savedAt);
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  const hour = `${date.getHours()}`.padStart(2, "0");
  const minute = `${date.getMinutes()}`.padStart(2, "0");
  return `${month}/${day} ${hour}:${minute}`;
}
</script>

<style scoped>
input,
select,
button {
  height: 30px;
  padding: 0 6px;
  font-size: 13px;
}

.drawing-page input[type="number"] {
  appearance: auto;
  -moz-appearance: auto;
  padding-right: 4px;
}

.drawing-page input[type="number"]::-webkit-outer-spin-button,
.drawing-page input[type="number"]::-webkit-inner-spin-button {
  -webkit-appearance: auto;
  margin: 0;
}

input[type="checkbox"] {
  width: auto;
  height: auto;
  padding: 0;
}

.drawing-page {
  padding: 10px;
  font-size: 14px;
}

.save-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.btn-save {
  padding: 0 14px;
  border: 0;
  border-radius: 6px;
  background: #1f6feb;
  color: #fff;
  cursor: pointer;
}

.btn-save:disabled {
  opacity: 0.7;
  cursor: default;
}

.save-msg {
  color: #2d7d46;
  font-size: 13px;
}

.toolbar {
  background: #fff7ea;
  border-radius: 10px;
  padding: 10px 12px;
  margin-bottom: 12px;
}

.toolbar-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.toolbar-head h2 {
  margin: 0;
  font-size: 18px;
}

.head-actions {
  display: flex;
  gap: 6px;
}

.toolbar-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  grid-template-areas:
    "main main main"
    "front ends settings"
    "sinks stoves settings";
  gap: 8px;
}

.panel-main {
  grid-area: main;
}

.panel-front-markers {
  grid-area: front;
}

.panel-ends {
  grid-area: ends;
}

.panel-sinks {
  grid-area: sinks;
}

.panel-stoves {
  grid-area: stoves;
}

.panel-settings {
  grid-area: settings;
  align-self: stretch;
}

.panel {
  border: 1px solid #ead3b0;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.55);
  padding: 8px;
  min-width: 0;
}

.panel-wide {
  grid-column: 1 / -1;
}

.panel-title {
  font-size: 12px;
  font-weight: 700;
  color: #8c5b1d;
  margin-bottom: 6px;
}

.inline-fields,
.config-row,
.preset-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 8px;
}

.stack-fields,
.rows-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.compact-grid-fields {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(96px, 1fr));
  gap: 6px 8px;
  align-items: center;
}

.triple-fields {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.field {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  white-space: nowrap;
}

.field span {
  font-size: 12px;
  color: #57452c;
}

.checkbox-field span {
  color: #3f372c;
}

.short-field {
  min-width: 62px;
}

.mini-field {
  min-width: 52px;
}

.mode-field {
  min-width: 82px;
}

.wide-field {
  min-width: 136px;
}

.row-check {
  min-width: 66px;
}

.number {
  width: 2.8em;
}

.compact {
  width: 2.6em;
}

.readonly {
  background: #f4efe2;
}

.mode {
  min-width: 56px;
}

.mode-wide {
  min-width: 92px;
}

.triple-config-list {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}

.compact-card-row {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px 8px;
  padding: 6px;
  border: 1px solid #ead3b0;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.5);
}

.compact-card-row .row-check {
  grid-column: 1 / -1;
}

.sink-stove-list {
  gap: 4px;
}

.sink-stove-row {
  flex-wrap: nowrap;
  gap: 4px 6px;
  padding: 4px 0;
  overflow-x: auto;
}

.sink-stove-row .row-check {
  min-width: 44px;
}

.compact-line-field {
  min-width: 0;
  gap: 3px;
}

.compact-line-field span {
  font-size: 11px;
}

.sink-stove-row .mode {
  min-width: 60px;
  width: 68px;
}

.sink-stove-row .number {
  width: 3.6em;
}

.sink-stove-row .center-field .number {
  width: 4.4em;
}

.ghost-btn {
  border: 1px solid #d7bb8b;
  border-radius: 6px;
  background: #fff;
  cursor: pointer;
}

.small-btn {
  height: 28px;
}

.preset-actions {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.preset-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 8px;
}

.annotation-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px 8px;
  padding: 8px;
  border: 1px solid #e5d3a5;
  border-radius: 8px;
  background: #fff3b0;
}

.panel-settings .preset-row {
  flex-wrap: nowrap;
  align-items: stretch;
}

.panel-settings .preset-card {
  flex: 1 1 0;
  box-sizing: border-box;
}

.mini-setting-field {
  min-width: 0;
  align-items: center;
  justify-content: flex-start;
  gap: 4px;
  white-space: normal;
}

.mini-setting-field span {
  min-width: 0;
  flex: 0 1 auto;
  white-space: normal;
  line-height: 1.15;
  word-break: break-all;
}

.mini-setting-field .compact {
  width: 3.6em;
  flex: 0 0 auto;
}

.mini-setting-field input:disabled {
  background: #f1eadb;
  color: #9a896c;
  cursor: not-allowed;
}

.panel-note {
  font-size: 12px;
  color: #7b5f2d;
}

.panel-subtitle {
  font-size: 12px;
  font-weight: 700;
  color: #8c5b1d;
}

.annotation-inline-group {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 8px;
}

.preset-card {
  padding: 6px 8px;
  border: 1px solid #ead3b0;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.55);
}

.preset-meta {
  font-size: 11px;
  color: #7a6853;
  min-width: 72px;
}

.danger-btn {
  color: #9a2c20;
}

.svg-container {
  background: #fff;
  border: 1px solid #ddd;
  min-height: 760px;
  overflow: auto;
}

@media (max-width: 980px) {
  .toolbar-grid,
  .triple-config-list,
  .triple-fields {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .toolbar-grid {
    grid-template-areas:
      "main main main"
      "front ends settings"
      "sinks stoves settings";
  }
}

@media (max-width: 720px) {
  .toolbar-grid,
  .triple-config-list,
  .compact-grid-fields,
  .triple-fields,
  .compact-card-row {
    grid-template-columns: 1fr;
  }

  .sink-stove-row {
    flex-wrap: wrap;
    overflow-x: visible;
  }

  .wide-field,
  .mode-field,
  .short-field,
  .mini-field {
    min-width: unset;
  }

  .annotation-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .toolbar-grid {
    grid-template-areas: none;
  }
}

@media (max-width: 1200px) {
  .annotation-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
