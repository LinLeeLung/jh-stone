<template>
  <div class="drawing-page">
    <div v-if="props.orderId" class="save-bar">
      <button class="btn-save" :disabled="saving" @click="saveDrawing">
        {{ saving ? "儲存中…" : "💾 儲存繪圖" }}
      </button>
      <span v-if="saveMsg" class="save-msg">{{ saveMsg }}</span>
    </div>

    <!-- 轉角歸屬（接線位置） -->
    <div class="row corner-row">
      <button
        class="corner-btn"
        :class="{ active: cornerSide === 'left' }"
        @click="setCorner('left')"
      >
        重繪左含轉角
      </button>
      <button
        class="corner-btn"
        :class="{ active: cornerSide === 'right' }"
        @click="setCorner('right')"
      >
        重繪右含轉角
      </button>
      <button @click="setCorner(null)">取消轉角接線</button>
    </div>

    <!-- 左段（橫向）桶身 -->
    <div class="row">
      <strong>左段</strong>桶身
      <input
        v-for="i in 7"
        :key="'L' + i"
        type="number"
        v-model.number="leftCabins[i - 1]"
        class="number"
        @change="redraw"
      />
      深度<input
        type="number"
        v-model.number="leftDepth"
        class="number"
        @change="redraw"
      />
      左凸<input
        type="number"
        v-model.number="leftPlus"
        class="number"
        @change="redraw"
      />
      <button @click="toggleLeftCut">
        {{ leftCutToggled ? "取消左接線" : "左接線左起" }}
      </button>
      <input
        type="number"
        v-model.number="leftConnect"
        class="number"
        @change="redraw"
      />
      <button @click="clearLeft">清空左段</button>
    </div>

    <!-- 右段（直向）桶身 -->
    <div class="row">
      <strong>右段</strong>桶身
      <input
        v-for="i in 7"
        :key="'R' + i"
        type="number"
        v-model.number="rightCabins[i - 1]"
        class="number"
        @change="redraw"
      />
      深度<input
        type="number"
        v-model.number="rightDepth"
        class="number"
        @change="redraw"
      />
      右凸<input
        type="number"
        v-model.number="rightPlus"
        class="number"
        @change="redraw"
      />
      <button @click="toggleRightCut">
        {{ rightCutToggled ? "取消右接線" : "右接線上起" }}
      </button>
      <input
        type="number"
        v-model.number="rightConnect"
        class="number"
        @change="redraw"
      />
      <button @click="clearRight">清空右段</button>
    </div>

    <!-- 左段水槽 / 火爐 -->
    <div class="section">
      <div class="section-title">左段 水槽 / 火爐</div>
      <div class="row" v-for="(s, idx) in leftSinks" :key="'ls' + idx">
        <input type="checkbox" v-model="s.enabled" @change="redraw" />水槽{{
          idx + 1
        }}
        <label
          ><input
            type="radio"
            :value="'水中'"
            v-model="s.position"
            @change="redraw"
          />水中</label
        >
        <label
          ><input
            type="radio"
            :value="'左開'"
            v-model="s.position"
            @change="redraw"
          />左開</label
        >
        <label
          ><input
            type="radio"
            :value="'右開'"
            v-model="s.position"
            @change="redraw"
          />右開</label
        >
        <input
          type="number"
          v-model.number="s.center"
          class="number"
          @change="redraw"
        />
        長<input
          type="number"
          v-model.number="s.sinkLength"
          class="number"
          @change="redraw"
        />
        深<input
          type="number"
          v-model.number="s.sinkDepth"
          class="number"
          @change="redraw"
        />
        R角<input
          type="number"
          v-model.number="s.R"
          class="number"
          @change="redraw"
        />
        開挖<input
          type="number"
          v-model.number="s.dig"
          class="number"
          @change="redraw"
        />
      </div>
      <div class="row" v-for="(s, idx) in leftStoves" :key="'lst' + idx">
        <input type="checkbox" v-model="s.enabled" @change="redraw" />火爐{{
          idx + 1
        }}
        <label
          ><input
            type="radio"
            :value="'火中'"
            v-model="s.position"
            @change="redraw"
          />火中</label
        >
        <label
          ><input
            type="radio"
            :value="'左開'"
            v-model="s.position"
            @change="redraw"
          />左開</label
        >
        <label
          ><input
            type="radio"
            :value="'右開'"
            v-model="s.position"
            @change="redraw"
          />右開</label
        >
        <input
          type="number"
          v-model.number="s.dis"
          class="number"
          @change="redraw"
        />
        長<input
          type="number"
          v-model.number="s.stoveLength"
          class="number"
          @change="redraw"
        />
        深<input
          type="number"
          v-model.number="s.stoveDepth"
          class="number"
          @change="redraw"
        />
        R角<input
          type="number"
          v-model.number="s.R"
          class="number"
          @change="redraw"
        />
        開挖<input
          type="number"
          v-model.number="s.dig"
          class="number"
          @change="redraw"
        />
      </div>
    </div>

    <!-- 右段水槽 / 火爐 -->
    <div class="section">
      <div class="section-title">右段 水槽 / 火爐</div>
      <div class="row" v-for="(s, idx) in rightSinks" :key="'rs' + idx">
        <input type="checkbox" v-model="s.enabled" @change="redraw" />水槽{{
          idx + 1
        }}
        <label
          ><input
            type="radio"
            :value="'水中'"
            v-model="s.position"
            @change="redraw"
          />水中</label
        >
        <label
          ><input
            type="radio"
            :value="'上開'"
            v-model="s.position"
            @change="redraw"
          />上開</label
        >
        <label
          ><input
            type="radio"
            :value="'下開'"
            v-model="s.position"
            @change="redraw"
          />下開</label
        >
        <input
          type="number"
          v-model.number="s.center"
          class="number"
          @change="redraw"
        />
        長<input
          type="number"
          v-model.number="s.sinkLength"
          class="number"
          @change="redraw"
        />
        深<input
          type="number"
          v-model.number="s.sinkDepth"
          class="number"
          @change="redraw"
        />
        R角<input
          type="number"
          v-model.number="s.R"
          class="number"
          @change="redraw"
        />
        開挖<input
          type="number"
          v-model.number="s.dig"
          class="number"
          @change="redraw"
        />
      </div>
      <div class="row" v-for="(s, idx) in rightStoves" :key="'rst' + idx">
        <input type="checkbox" v-model="s.enabled" @change="redraw" />火爐{{
          idx + 1
        }}
        <label
          ><input
            type="radio"
            :value="'火中'"
            v-model="s.position"
            @change="redraw"
          />火中</label
        >
        <label
          ><input
            type="radio"
            :value="'上開'"
            v-model="s.position"
            @change="redraw"
          />上開</label
        >
        <label
          ><input
            type="radio"
            :value="'下開'"
            v-model="s.position"
            @change="redraw"
          />下開</label
        >
        <input
          type="number"
          v-model.number="s.dis"
          class="number"
          @change="redraw"
        />
        長<input
          type="number"
          v-model.number="s.stoveLength"
          class="number"
          @change="redraw"
        />
        深<input
          type="number"
          v-model.number="s.stoveDepth"
          class="number"
          @change="redraw"
        />
        R角<input
          type="number"
          v-model.number="s.R"
          class="number"
          @change="redraw"
        />
        開挖<input
          type="number"
          v-model.number="s.dig"
          class="number"
          @change="redraw"
        />
      </div>
    </div>

    <!-- 周邊設定 -->
    <div class="settings">
      <div class="row">
        左端：
        <label
          ><input
            type="radio"
            value="左靠牆"
            v-model="leftEnd"
            @change="redraw"
          />左靠牆</label
        >
        <label
          ><input
            type="radio"
            value="左見光"
            v-model="leftEnd"
            @change="redraw"
          />左見光</label
        >
        <label
          ><input
            type="radio"
            value="左靠側板"
            v-model="leftEnd"
            @change="redraw"
          />左靠側板</label
        >
        <label
          ><input
            type="radio"
            value="左靠櫃"
            v-model="leftEnd"
            @change="redraw"
          />左靠櫃</label
        >
        <label
          ><input
            type="radio"
            value="左側落腳"
            v-model="leftEnd"
            @change="redraw"
          />側落腳</label
        >
        側板/櫃深<input
          type="number"
          v-model.number="leftEndDepth"
          class="number"
          @change="redraw"
        />
        <template v-if="leftEnd === '左側落腳'">
          腳高<input
            type="number"
            v-model.number="leftSideLeg.height"
            class="number"
            @change="redraw"
          />
          深<input
            type="number"
            v-model.number="leftSideLeg.depth"
            class="number"
            @change="redraw"
          />
          厚<input
            type="number"
            v-model.number="leftSideLeg.thickness"
            class="number"
            @change="redraw"
          />
          倒包<input
            type="number"
            v-model.number="leftSideLeg.wrap"
            class="number"
            @change="redraw"
          />
          工法<select v-model="leftSideLeg.method" @change="redraw">
            <option value="K1">K1</option>
            <option value="H1">H1</option>
            <option value="H2">H2</option>
          </select>
        </template>
      </div>
      <div class="row">
        右端（下）：
        <label
          ><input
            type="radio"
            value="右靠牆"
            v-model="rightEnd"
            @change="redraw"
          />右靠牆</label
        >
        <label
          ><input
            type="radio"
            value="右見光"
            v-model="rightEnd"
            @change="redraw"
          />右見光</label
        >
        <label
          ><input
            type="radio"
            value="右靠側板"
            v-model="rightEnd"
            @change="redraw"
          />右靠側板</label
        >
        <label
          ><input
            type="radio"
            value="右靠櫃"
            v-model="rightEnd"
            @change="redraw"
          />右靠櫃</label
        >
        <label
          ><input
            type="radio"
            value="右側落腳"
            v-model="rightEnd"
            @change="redraw"
          />側落腳</label
        >
        側板/櫃深<input
          type="number"
          v-model.number="rightEndDepth"
          class="number"
          @change="redraw"
        />
        <template v-if="rightEnd === '右側落腳'">
          腳高<input
            type="number"
            v-model.number="rightSideLeg.height"
            class="number"
            @change="redraw"
          />
          深<input
            type="number"
            v-model.number="rightSideLeg.depth"
            class="number"
            @change="redraw"
          />
          厚<input
            type="number"
            v-model.number="rightSideLeg.thickness"
            class="number"
            @change="redraw"
          />
          倒包<input
            type="number"
            v-model.number="rightSideLeg.wrap"
            class="number"
            @change="redraw"
          />
          工法<select v-model="rightSideLeg.method" @change="redraw">
            <option value="K1">K1</option>
            <option value="H1">H1</option>
            <option value="H2">H2</option>
          </select>
        </template>
      </div>
      <div class="row">
        後側：
        <label
          ><input
            type="radio"
            value="後靠牆"
            v-model="backOption"
            @change="redraw"
          />後靠牆</label
        >
        <label
          ><input
            type="radio"
            value="後見光"
            v-model="backOption"
            @change="redraw"
          />後見光</label
        >
        <label
          ><input
            type="checkbox"
            v-model="backstop"
            @change="redraw"
          />背牆</label
        >
        <input
          type="number"
          v-model.number="backHeight"
          step="0.1"
          class="number"
          @change="redraw"
        />公分
      </div>
      <div class="row">
        <button @click="redraw">重繪</button>
        <button @click="clearAll">全部清空</button>
      </div>
    </div>

    <!-- SVG 畫布 -->
    <div ref="svgContainerRef" class="svg-container"></div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from "vue";
import { SVG } from "@svgdotjs/svg.js";
import { updateOrderDrawing } from "../../firebase";

const props = defineProps({
  orderId: { type: String, default: null },
  drawingId: { type: String, default: null },
  savedState: { type: Object, default: null },
  order: { type: Object, default: null },
});

const saving = ref(false);
const saveMsg = ref("");
const savedSignature = ref("");

const svgContainerRef = ref(null);
let draw = null;

// ─── 桶身 ────────────────────────────────────────────────
const leftCabins = ref([90, 30, 90, 60, null, null, null]);
const leftDepth = ref(60);
const leftPlus = ref(null);
const leftConnect = ref(null);
const leftCutToggled = ref(false);

const rightCabins = ref([60, 90, 90, null, null, null, null]);
const rightDepth = ref(60);
const rightPlus = ref(null);
const rightConnect = ref(null);
const rightCutToggled = ref(false);

// 轉角歸屬：'left' = 左段含轉角（接線在右段上方）；'right' = 右段含轉角（接線在左段右側）
const cornerSide = ref(null);

// ─── 水槽 / 火爐 ─────────────────────────────────────────
function makeSink(enabled, position, center) {
  return reactive({
    enabled,
    position,
    center,
    sinkLength: 67.8,
    sinkDepth: 49,
    R: 5.6,
    dig: 7,
  });
}
function makeStove(enabled, position, dis) {
  return reactive({
    enabled,
    position,
    dis,
    stoveLength: 67,
    stoveDepth: 35,
    R: 8.5,
    dig: 7,
  });
}

const leftSinks = [makeSink(true, "水中", 45), makeSink(false, "水中", 0)];
const leftStoves = [makeStove(true, "火中", 165), makeStove(false, "火中", 0)];
const rightSinks = [makeSink(true, "水中", 105), makeSink(false, "水中", 0)];
const rightStoves = [makeStove(true, "火中", 195), makeStove(false, "火中", 0)];

// ─── 周邊 ────────────────────────────────────────────────
const leftEnd = ref("左靠牆");
const leftEndDepth = ref(null);
const leftSideLeg = reactive({
  height: 85,
  depth: 60,
  thickness: 4,
  wrap: 0,
  method: "K1",
});
const rightSideLeg = reactive({
  height: 85,
  depth: 60,
  thickness: 4,
  wrap: 0,
  method: "K1",
});
const rightEnd = ref("右靠牆");
const rightEndDepth = ref(null);
const backOption = ref("後靠牆");
const backstop = ref(false);
const backHeight = ref(4);

// ─── 繪圖座標常數 ────────────────────────────────────────
// L 型佈局：
//   水平段(左段)：從 (x0, y0) 向右延伸，深度 leftDepth 向下
//   垂直段(右段)：從 (x0 + leftTotalLen - rightDepth, y0) 向下延伸，寬度 rightDepth 向右到 x0 + leftTotalLen
//   兩段在右上角重疊，形成 L 型
const ORIGIN_X = 200;
const ORIGIN_Y = 120;
const TABLETOP_THICKNESS = 4;

function getSnapshot() {
  return {
    leftCabins: [...leftCabins.value],
    leftDepth: leftDepth.value,
    leftPlus: leftPlus.value,
    leftConnect: leftConnect.value,
    leftCutToggled: leftCutToggled.value,
    rightCabins: [...rightCabins.value],
    rightDepth: rightDepth.value,
    rightPlus: rightPlus.value,
    rightConnect: rightConnect.value,
    rightCutToggled: rightCutToggled.value,
    cornerSide: cornerSide.value,
    leftSinks: leftSinks.map((s) => ({ ...s })),
    leftStoves: leftStoves.map((s) => ({ ...s })),
    rightSinks: rightSinks.map((s) => ({ ...s })),
    rightStoves: rightStoves.map((s) => ({ ...s })),
    leftEnd: leftEnd.value,
    leftEndDepth: leftEndDepth.value,
    leftSideLeg: { ...leftSideLeg },
    rightSideLeg: { ...rightSideLeg },
    rightEnd: rightEnd.value,
    rightEndDepth: rightEndDepth.value,
    backOption: backOption.value,
    backstop: backstop.value,
    backHeight: backHeight.value,
    svgContent: draw ? draw.svg() : "",
  };
}

function getStateSignature() {
  const snap = getSnapshot();
  const { svgContent, ...stateOnly } = snap;
  return JSON.stringify(stateOnly);
}

function hasUnsavedChanges() {
  if (!props.orderId || !props.drawingId) return false;
  if (!savedSignature.value) return false;
  return getStateSignature() !== savedSignature.value;
}

defineExpose({ hasUnsavedChanges });

function restoreSnapshot(snap) {
  if (!snap) return;
  if (Array.isArray(snap.leftCabins)) leftCabins.value = [...snap.leftCabins];
  if (snap.leftDepth != null) leftDepth.value = snap.leftDepth;
  if (snap.leftPlus != null) leftPlus.value = snap.leftPlus;
  if (snap.leftConnect != null) leftConnect.value = snap.leftConnect;
  if (snap.leftCutToggled != null) leftCutToggled.value = snap.leftCutToggled;
  if (Array.isArray(snap.rightCabins))
    rightCabins.value = [...snap.rightCabins];
  if (snap.rightDepth != null) rightDepth.value = snap.rightDepth;
  if (snap.rightPlus != null) rightPlus.value = snap.rightPlus;
  if (snap.rightConnect != null) rightConnect.value = snap.rightConnect;
  if (snap.rightCutToggled != null)
    rightCutToggled.value = snap.rightCutToggled;
  if (snap.cornerSide !== undefined) cornerSide.value = snap.cornerSide;
  if (snap.leftEnd != null) leftEnd.value = snap.leftEnd;
  if (snap.leftEndDepth != null) leftEndDepth.value = snap.leftEndDepth;
  if (snap.rightEnd != null) rightEnd.value = snap.rightEnd;
  if (snap.rightEndDepth != null) rightEndDepth.value = snap.rightEndDepth;
  if (snap.backOption != null) backOption.value = snap.backOption;
  if (snap.backstop != null) backstop.value = snap.backstop;
  if (snap.backHeight != null) backHeight.value = snap.backHeight;
  if (snap.leftSideLeg && typeof snap.leftSideLeg === "object") {
    Object.assign(leftSideLeg, snap.leftSideLeg);
  }
  if (snap.rightSideLeg && typeof snap.rightSideLeg === "object") {
    Object.assign(rightSideLeg, snap.rightSideLeg);
  }

  const restoreArr = (snapArr, target) => {
    if (!Array.isArray(snapArr)) return;
    snapArr.forEach((s, i) => {
      if (target[i]) Object.assign(target[i], s);
    });
  };
  restoreArr(snap.leftSinks, leftSinks);
  restoreArr(snap.leftStoves, leftStoves);
  restoreArr(snap.rightSinks, rightSinks);
  restoreArr(snap.rightStoves, rightStoves);
}

function preFillFromOrder(ord) {
  if (!ord) return;
  const s1 = ord.sinks?.[0];
  if (s1) {
    leftSinks[0].enabled = true;
    if (s1.holeWidthMm) leftSinks[0].sinkLength = s1.holeWidthMm / 10;
    if (s1.holeDepthMm) leftSinks[0].sinkDepth = s1.holeDepthMm / 10;
    if (s1.holeRadiusMm) leftSinks[0].R = s1.holeRadiusMm / 10;
  }
  const s2 = ord.sinks?.[1];
  if (s2) {
    rightSinks[0].enabled = true;
    if (s2.holeWidthMm) rightSinks[0].sinkLength = s2.holeWidthMm / 10;
    if (s2.holeDepthMm) rightSinks[0].sinkDepth = s2.holeDepthMm / 10;
    if (s2.holeRadiusMm) rightSinks[0].R = s2.holeRadiusMm / 10;
  }
}

async function saveDrawing() {
  if (!props.orderId || !props.drawingId) return;
  saving.value = true;
  try {
    await updateOrderDrawing(props.orderId, props.drawingId, getSnapshot());
    savedSignature.value = getStateSignature();
    saveMsg.value = "✓ 已儲存";
    setTimeout(() => {
      saveMsg.value = "";
    }, 2000);
  } catch (e) {
    saveMsg.value = "儲存失敗";
  } finally {
    saving.value = false;
  }
}

// ─── 生命週期 ────────────────────────────────────────────
onMounted(() => {
  draw = SVG().addTo(svgContainerRef.value).size(1400, 900);
  if (props.savedState) {
    restoreSnapshot(props.savedState);
  } else if (props.order) {
    preFillFromOrder(props.order);
  }
  redraw();
  savedSignature.value = getStateSignature();
});

// ─── 工具 ────────────────────────────────────────────────
function sumCabins(list, plus) {
  let total = 0;
  for (const v of list) {
    const n = parseFloat(v);
    if (!isNaN(n) && n > 0) total += n;
  }
  const p = parseFloat(plus);
  if (!isNaN(p) && p > 0) total += p;
  return Math.round(total * 100) / 100;
}

function getBoxList(list) {
  const arr = [];
  for (const v of list) {
    const n = parseFloat(v);
    if (!isNaN(n) && n > 0) arr.push(n);
  }
  return arr;
}

function setCorner(side) {
  cornerSide.value = side;
  redraw();
}

function clearLeft() {
  leftCabins.value = [0, 0, 0, 0, 0, 0, 0];
  leftPlus.value = null;
  leftConnect.value = null;
  leftCutToggled.value = false;
  redraw();
}

function clearRight() {
  rightCabins.value = [0, 0, 0, 0, 0, 0, 0];
  rightPlus.value = null;
  rightConnect.value = null;
  rightCutToggled.value = false;
  redraw();
}

function toggleLeftCut() {
  leftCutToggled.value = !leftCutToggled.value;
  redraw();
}
function toggleRightCut() {
  rightCutToggled.value = !rightCutToggled.value;
  redraw();
}

function redraw() {
  if (!draw) return;
  draw.clear();

  const w = sumCabins(leftCabins.value, leftPlus.value);
  const h = parseFloat(leftDepth.value) || 60;
  const wL = sumCabins(rightCabins.value, rightPlus.value);
  const hL = parseFloat(rightDepth.value) || 60;
  const x0 = ORIGIN_X;
  const y0 = ORIGIN_Y;

  if (w <= 0 && wL <= 0) return;

  drawLShape(x0, y0, w, h, wL, hL);

  if (w > 0) {
    drawCabinDividersH(
      getBoxList(leftCabins.value),
      leftPlus.value,
      x0,
      y0,
      h,
      w,
      wL > 0 ? hL : 0,
    );
  }
  if (wL > 0) {
    drawCabinDividersV(
      getBoxList(rightCabins.value),
      rightPlus.value,
      x0 + w - hL,
      y0,
      hL,
      wL,
      w > 0 ? h : 0,
    );
  }

  if (w > 0) drawTopLengthMarker(x0, y0, w);
  if (wL > 0) drawRightLengthMarker(x0 + w, y0, wL);
  if (h > 0 && w > 0) drawLeftDepthLabel(x0, y0, h);
  if (hL > 0 && wL > 0) drawBottomDepthLabel(x0 + w - hL, y0 + wL, hL);

  if (backOption.value === "後見光" && w > 0) {
    drawTri(x0 + w / 2, y0 - 18, "d");
  }
  if (backstop.value && w > 0) {
    const bh = parseFloat(backHeight.value) || 2;
    draw
      .line(x0, y0 + bh, x0 + w, y0 + bh)
      .stroke({ width: 1, color: "black" });
  }
  if (backstop.value && wL > 0) {
    const bh = parseFloat(backHeight.value) || 2;
    draw
      .line(x0 + w - bh, y0, x0 + w - bh, y0 + wL)
      .stroke({ width: 1, color: "black" });
  }

  for (const s of leftSinks) if (s.enabled) drawSinkH(s, x0, y0, h, w);
  for (const s of leftStoves) if (s.enabled) drawStoveH(s, x0, y0, h, w);
  if (wL > 0) {
    for (const s of rightSinks)
      if (s.enabled) drawSinkV(s, x0 + w - hL, y0, hL, wL);
    for (const s of rightStoves)
      if (s.enabled) drawStoveV(s, x0 + w - hL, y0, hL, wL);
  }

  if (leftCutToggled.value && w > 0) {
    const ltl = parseFloat(leftConnect.value);
    if (!isNaN(ltl) && ltl > 0 && ltl < w) drawCutLineH(x0, y0, h, w, ltl);
  }
  if (rightCutToggled.value && wL > 0) {
    const ltl = parseFloat(rightConnect.value);
    if (!isNaN(ltl) && ltl > 0 && ltl < wL) {
      drawCutLineV(x0 + w - hL, y0, hL, wL, ltl);
    }
  }

  if (cornerSide.value && w > 0 && wL > 0) {
    drawCornerJoint(x0, y0, w, h, wL, hL, cornerSide.value);
  }

  if (w > 0) drawLeftEnd(x0, y0, h);
  if (wL > 0) drawRightEnd(x0 + w - hL, y0 + wL, hL);

  if (backOption.value === "後靠牆") {
    if (w > 0) drawTopWall(x0, y0, w);
    if (wL > 0) drawRightSideWall(x0 + w, y0, wL);
  }

  const contentRight = x0 + Math.max(w, hL) + 120;
  const maxBottom = Math.max(w > 0 ? h : 0, wL > 0 ? wL : 0);
  draw.size(Math.max(contentRight, 300), Math.max(y0 + maxBottom + 100, 300));
}

function drawLShape(x0, y0, w, h, wL, hL) {
  if (w > 0 && wL > 0) {
    const hasLeftSideLeg = leftEnd.value === "左側落腳";
    const mergeLeftFrontFace =
      leftEnd.value === "左側落腳" && leftSideLeg.method === "H2";
    const points = [
      [x0, y0],
      [x0 + w, y0],
      [x0 + w, y0 + wL],
      [x0 + w - hL, y0 + wL],
      [x0 + w - hL, y0 + h],
      [x0, y0 + h],
    ];
    const topShape = draw
      .polygon(points.map((p) => p.join(",")).join(" "))
      .fill("white");
    if (!mergeLeftFrontFace && !hasLeftSideLeg) {
      topShape.stroke({ width: 1, color: "black" });
    } else {
      topShape.stroke("none");
      draw.line(x0, y0, x0 + w, y0).stroke({ width: 1, color: "black" });
      draw
        .line(x0, y0, x0, y0 + TABLETOP_THICKNESS)
        .stroke({ width: 1, color: "black" });
      if (hasLeftSideLeg) {
        draw
          .line(x0, y0 + TABLETOP_THICKNESS, x0, y0 + h)
          .stroke({ width: 1, color: "black" });
      }
      draw
        .line(x0 + w, y0, x0 + w, y0 + wL)
        .stroke({ width: 1, color: "black" });
      draw
        .line(x0 + w, y0 + wL, x0 + w - hL, y0 + wL)
        .stroke({ width: 1, color: "black" });
      draw
        .line(x0 + w - hL, y0 + wL, x0 + w - hL, y0 + h)
        .stroke({ width: 1, color: "black" });
      draw
        .line(x0 + w - hL, y0 + h, x0, y0 + h)
        .stroke({ width: 1, color: "black" });
    }

    const innerCornerX = x0 + w - hL - TABLETOP_THICKNESS;
    const leftInnerX = x0 + TABLETOP_THICKNESS;
    const leftOuterX = x0 - TABLETOP_THICKNESS;
    const leftFaceX = mergeLeftFrontFace ? x0 : leftOuterX;
    const rightOuterX = x0 + w + TABLETOP_THICKNESS;
    const frontBottomY = y0 + h + TABLETOP_THICKNESS;
    const bottomFrontY = y0 + wL + TABLETOP_THICKNESS;
    const hideACLine =
      leftEnd.value === "左側落腳" && leftSideLeg.method === "H1";
    const hideRightBottomFrontLine =
      rightEnd.value === "右側落腳" && rightSideLeg.method === "H1";
    const acLineColor = "black";

    draw
      .line(leftInnerX, frontBottomY, innerCornerX, frontBottomY)
      .stroke({ width: 1, color: "black" });
    draw
      .line(innerCornerX, frontBottomY, innerCornerX, y0 + wL)
      .stroke({ width: 1, color: "black" });
    if (!hideACLine) {
      draw
        .line(leftFaceX, y0 + TABLETOP_THICKNESS, leftFaceX, frontBottomY)
        .stroke({ width: 1, color: acLineColor });
    }
    draw
      .line(leftFaceX, y0 + TABLETOP_THICKNESS, x0, y0)
      .stroke({ width: 1, color: "black" });
    draw
      .line(leftFaceX, frontBottomY, x0, y0 + h)
      .stroke({ width: 1, color: "black" });
    draw
      .line(x0 + w - hL, y0 + h, innerCornerX, frontBottomY)
      .stroke({ width: 1, color: "black" });
    draw
      .line(leftFaceX, frontBottomY, innerCornerX, frontBottomY)
      .stroke({ width: 1, color: "black" });
    draw
      .line(innerCornerX, y0 + wL, innerCornerX, bottomFrontY)
      .stroke({ width: 1, color: "black" });
    if (!hideRightBottomFrontLine) {
      draw
        .line(innerCornerX, bottomFrontY, x0 + w, bottomFrontY)
        .stroke({ width: 1, color: "black" });
    }
    draw
      .line(x0 + w - hL, y0 + wL, innerCornerX, bottomFrontY)
      .stroke({ width: 1, color: "black" });
    draw
      .line(x0 + w, y0 + wL, rightOuterX, bottomFrontY)
      .stroke({ width: 1, color: "black" });
    return;
  }

  if (w > 0) {
    draw
      .rect(w, h)
      .move(x0, y0)
      .fill("white")
      .stroke({ width: 1, color: "black" });
    draw
      .line(
        x0,
        y0 + h + TABLETOP_THICKNESS,
        x0 + w,
        y0 + h + TABLETOP_THICKNESS,
      )
      .stroke({ width: 1, color: "black" });
    draw
      .line(x0, y0 + h, x0, y0 + h + TABLETOP_THICKNESS)
      .stroke({ width: 1, color: "black" });
    draw
      .line(x0 + w, y0 + h, x0 + w, y0 + h + TABLETOP_THICKNESS)
      .stroke({ width: 1, color: "black" });
  }

  if (w <= 0 && wL > 0) {
    draw
      .rect(hL, wL)
      .move(x0, y0)
      .fill("white")
      .stroke({ width: 1, color: "black" });
    draw
      .line(x0, y0 + wL, x0 + hL, y0 + wL)
      .stroke({ width: 1, color: "black" });
  }
}

// 左段（水平）桶身分隔（虛線）。cornerW：右端轉角重疊區寬度（= 右段深度 hL）。
// 位於此区區內的桶身寬度標籤與刻度跳過。
function drawCabinDividersH(boxes, plus, x0, y0, h, w, cornerW = 0) {
  const p = parseFloat(plus);
  const xCornerStart = x0 + w - cornerW;
  let x = x0;
  if (!isNaN(p) && p > 0) {
    if (x + p < xCornerStart) {
      drawTickH(x + p, y0 + h);
      draw
        .text(String(p))
        .font({ size: 10, family: "DFKai-sb" })
        .move(x - 4, y0 + h + 4);
    }
    x += p;
  } else if (boxes.length > 0) {
    if (x + boxes[0] < xCornerStart || x + boxes[0] / 2 <= xCornerStart) {
      draw
        .text(String(boxes[0]))
        .font({ size: 10, family: "DFKai-sb" })
        .move(x + boxes[0] / 2 - 8, y0 + h + 4);
    }
  }
  for (let i = 0; i < boxes.length; i++) {
    x += boxes[i];
    if (i < boxes.length - 1) {
      if (x <= xCornerStart) drawTickH(x, y0 + h);
      const nextMidX = x + boxes[i + 1] / 2;
      if (nextMidX <= xCornerStart) {
        draw
          .text(String(boxes[i + 1]))
          .font({ size: 10, family: "DFKai-sb" })
          .move(nextMidX - 8, y0 + h + 4);
      }
    }
  }
  // 內部分隔虛線
  let cx = x0 + (isNaN(p) || p <= 0 ? 0 : p);
  for (let i = 0; i < boxes.length - 1; i++) {
    cx += boxes[i];
    if (cx >= xCornerStart) continue; // 轉角區內不畫內部虛線
    draw
      .line(cx, y0, cx, y0 + h)
      .stroke({ width: 0.5, color: "#888", dasharray: "2,3" });
  }
}

// 右段（垂直）桶身分隔。cornerH：轉角重疊區高度（即左段深度），位於此区區內的標記/刻度跳過
// 桶身寬度標註與刻度畫在右段「左側」（櫃前）
function drawCabinDividersV(boxes, plus, x0, y0, hL, wL, cornerH = 0) {
  const p = parseFloat(plus);
  const yCornerEnd = y0 + cornerH;
  const xTick = x0; // 刻度画在右段左邊（櫃前）
  const xLabel = x0 - 10; // 文字位於左邊外側
  let y = y0;
  if (!isNaN(p) && p > 0) {
    if (y + p > yCornerEnd) {
      drawTickV(xTick, y + p);
      drawRotLabel(String(p), xLabel, y + p / 2, 90, 10);
    }
    y += p;
  } else if (boxes.length > 0) {
    if (y + boxes[0] > yCornerEnd && y + boxes[0] / 2 >= yCornerEnd) {
      drawRotLabel(String(boxes[0]), xLabel, y + boxes[0] / 2, 90, 10);
    }
  }
  for (let i = 0; i < boxes.length; i++) {
    y += boxes[i];
    if (i < boxes.length - 1) {
      if (y >= yCornerEnd) drawTickV(xTick, y);
      const nextMidY = y + boxes[i + 1] / 2;
      if (nextMidY >= yCornerEnd) {
        drawRotLabel(String(boxes[i + 1]), xLabel, nextMidY, 90, 10);
      }
    }
  }
  let cy = y0 + (isNaN(p) || p <= 0 ? 0 : p);
  for (let i = 0; i < boxes.length - 1; i++) {
    cy += boxes[i];
    if (cy <= yCornerEnd) continue; // 轉角區內不畫內部虛線
    draw
      .line(x0, cy, x0 + hL, cy)
      .stroke({ width: 0.5, color: "#888", dasharray: "2,3" });
  }
}

function drawTickH(x, y) {
  draw.line(x, y - 2, x, y + 2).stroke({ width: 1, color: "black" });
}
function drawTickV(x, y) {
  draw.line(x - 2, y, x + 2, y).stroke({ width: 1, color: "black" });
}
function drawTextRot(text, x, y) {
  const t = draw
    .text(String(text))
    .font({ size: 10, family: "DFKai-sb" })
    .move(x, y);
  t.rotate(90, x, y);
}

function drawText(text, x, y, size = 10, color = "black") {
  draw
    .text(String(text))
    .font({ size, family: "DFKai-sb", fill: color })
    .move(x, y);
}

// 旋轉文字（以 cx, cy 為中心）——避免與標線重疊
function drawRotLabel(text, cx, cy, angle = -90, fontSize = 12) {
  const t = draw
    .text(String(text))
    .font({ size: fontSize, family: "DFKai-sb", anchor: "middle" });
  const bb = t.bbox();
  t.move(cx - bb.width / 2, cy - bb.height / 2);
  t.rotate(angle, cx, cy);
}

// ─── 標註 ────────────────────────────────────────────────
function drawTopLengthMarker(x0, y0, w) {
  const yLine = y0 - 30;
  draw.line(x0, yLine, x0 + w, yLine).stroke({ width: 1, color: "black" });
  draw.line(x0, yLine - 6, x0, yLine + 6).stroke({ width: 1, color: "black" });
  draw
    .line(x0 + w, yLine - 6, x0 + w, yLine + 6)
    .stroke({ width: 1, color: "black" });
  const t = draw.text(String(w)).font({ size: 16, family: "DFKai-sb" });
  const bb = t.bbox();
  t.move(x0 + w / 2 - bb.width / 2, yLine - bb.height - 4);
}

function drawRightLengthMarker(xEdge, y0, wL) {
  const xLine = xEdge + 40;
  draw.line(xLine, y0, xLine, y0 + wL).stroke({ width: 1, color: "black" });
  draw.line(xLine - 6, y0, xLine + 6, y0).stroke({ width: 1, color: "black" });
  draw
    .line(xLine - 6, y0 + wL, xLine + 6, y0 + wL)
    .stroke({ width: 1, color: "black" });
  // 竖立文字（旋转90度），置於引線右側 - like "火中" label
  const t = draw.text(String(wL)).font({ size: 16, family: "DFKai-sb" });
  const bb = t.bbox();
  // Position text center, then rotate 90 degrees clockwise
  const centerX = xLine + 20;
  const centerY = y0 + wL / 2;
  t.move(centerX - bb.width / 2, centerY - bb.height / 2);
  t.rotate(90, centerX, centerY);
}

function drawLeftDepthLabel(x0, y0, h) {
  const xLine = x0 - 22;
  draw.line(xLine, y0, xLine, y0 + h).stroke({ width: 0.5, color: "black" });
  draw
    .line(xLine - 4, y0, xLine + 4, y0)
    .stroke({ width: 0.5, color: "black" });
  draw
    .line(xLine - 4, y0 + h, xLine + 4, y0 + h)
    .stroke({ width: 0.5, color: "black" });
  // 水平正立文字，置於引線左側
  const t = draw.text(String(h)).font({ size: 14, family: "DFKai-sb" });
  const bb = t.bbox();
  t.move(xLine - 8 - bb.width, y0 + h / 2 - bb.height / 2);
}

function drawBottomDepthLabel(x0, yBottom, hL) {
  const yLine = yBottom + 22;
  draw.line(x0, yLine, x0 + hL, yLine).stroke({ width: 0.5, color: "black" });
  draw
    .line(x0, yLine - 4, x0, yLine + 4)
    .stroke({ width: 0.5, color: "black" });
  draw
    .line(x0 + hL, yLine - 4, x0 + hL, yLine + 4)
    .stroke({ width: 0.5, color: "black" });
  const t = draw.text(String(hL)).font({ size: 14, family: "DFKai-sb" });
  const bb = t.bbox();
  t.move(x0 + hL / 2 - bb.width / 2, yLine + 4);
}

// ─── 端側裝飾 ────────────────────────────────────────────
function drawLeftEnd(x0, y0, h) {
  if (leftEnd.value === "左靠牆") drawWallHatchLeft(x0, y0, h, "牆");
  if (leftEnd.value === "左見光") drawTri(x0 - 15, y0 + h / 2, "r");
  if (leftEnd.value === "左靠側板") drawWallHatchLeft(x0, y0, h, "側板");
  if (leftEnd.value === "左靠櫃") drawWallHatchLeft(x0, y0, h, "櫃");
  if (leftEnd.value === "左側落腳") drawLeftSideLeg(x0, y0, h);
}
function drawRightEnd(x0, yBottom, hL) {
  if (rightEnd.value === "右靠牆") drawWallHatchBottom(x0, yBottom, hL, "牆");
  if (rightEnd.value === "右見光") drawTri(x0 + hL / 2, yBottom + 15, "u");
  if (rightEnd.value === "右靠側板")
    drawWallHatchBottom(x0, yBottom, hL, "側板");
  if (rightEnd.value === "右靠櫃") drawWallHatchBottom(x0, yBottom, hL, "櫃");
  if (rightEnd.value === "右側落腳") drawRightSideLeg(x0, yBottom);
}

function drawWallHatchLeft(x, y, h, label) {
  for (let i = 0; i < h; i += 8) {
    draw
      .line(x - 4, y + i, x, y + i + 6)
      .stroke({ width: 0.5, color: "black" });
  }
  drawRotLabel(label, x - 14, y + h / 2, 0, 12);
}
function drawWallHatchBottom(x, y, hL, label) {
  for (let i = 0; i < hL; i += 8) {
    draw
      .line(x + i, y + 4, x + i + 6, y)
      .stroke({ width: 0.5, color: "black" });
  }
  draw
    .text(label)
    .font({ size: 12, family: "DFKai-sb" })
    .move(x + hL / 2 - 6, y + 8);
}

function legPoint(x, y) {
  return { x, y };
}

function legPad(point, angleDeg, distance) {
  const rad = (angleDeg * Math.PI) / 180;
  return legPoint(
    point.x + Math.cos(rad) * distance,
    point.y - Math.sin(rad) * distance,
  );
}

function drawLegLine(a, b) {
  draw.line(a.x, a.y, b.x, b.y).stroke({ width: 1, color: "black" });
}

function drawLegDashedLine(a, b) {
  draw
    .line(a.x, a.y, b.x, b.y)
    .stroke({ width: 1, color: "black", dasharray: "5,4" });
}

function drawLegPolyline(points) {
  draw
    .polyline(points.map((point) => [point.x, point.y]))
    .fill("none")
    .stroke({ width: 1, color: "black" });
}

function drawLegAngledText(text, x, y, size, angle) {
  const node = draw.text(String(text)).font({ size, family: "DFKai-sb" });
  node.move(x, y);
  node.rotate(-angle, x, y);
}

function drawLegAngledTextCentered(text, cx, cy, size, angle) {
  const node = draw.text(String(text)).font({ size, family: "DFKai-sb" });
  const box = node.bbox();
  node.move(cx - box.width / 2, cy - box.height / 2);
  node.rotate(-angle, cx, cy);
}

function drawLeftSideLeg(x0, y0, h) {
  const legDepth = Math.max(0, parseFloat(leftSideLeg.depth) || 0);
  const legThickness = Math.max(0, parseFloat(leftSideLeg.thickness) || 0);
  const legHeight = Math.max(0, parseFloat(leftSideLeg.height) || 0);
  const legWrap = Math.max(0, parseFloat(leftSideLeg.wrap) || 0);
  const legMethod = leftSideLeg.method || "K1";
  if (legDepth <= 0 || legThickness <= 0 || legHeight <= 0) return;
  const frontWrap = legWrap;
  const backWrap = backOption.value === "後靠牆" ? 0 : legWrap;
  const legAngle = 45;
  const angleRad = (legAngle * Math.PI) / 180;
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  const legFrontY = y0 + h;
  const legTopY = legFrontY - legDepth;
  const p0 = legPoint(x0, legTopY);
  const p1 = legPoint(p0.x - legHeight * cos, p0.y + legHeight * sin);
  const legBackTop = legPoint(
    p0.x - TABLETOP_THICKNESS * cos,
    p0.y + TABLETOP_THICKNESS * sin,
  );
  const p2 = legPoint(p1.x, p1.y + legDepth);
  const p6 = legPoint(p0.x, legFrontY);
  const p3 = legPoint(p2.x + legThickness, p2.y);
  const p4 = legPoint(
    p3.x + (legHeight - legThickness) * cos,
    p3.y - (legHeight - legThickness) * sin,
  );
  const p7 = legPoint(p2.x, p2.y - frontWrap);
  const p8 = legPoint(p0.x, p0.y + legDepth - frontWrap);
  const p9 = legPoint(p1.x, p1.y + backWrap);
  const p10 = legPoint(p0.x, p0.y + backWrap);
  const p21 = legPoint(p2.x, p2.y + 10);
  const k1Inset = Math.max(legThickness, 0);
  const k1P3 = legPoint(p2.x + k1Inset, p2.y);
  const k1Length = Math.max(
    0,
    legHeight - (sin === 0 ? TABLETOP_THICKNESS : TABLETOP_THICKNESS / sin),
  );
  const k1P4 = legPoint(k1P3.x + k1Length * cos, k1P3.y - k1Length * sin);
  const p22 = legPoint(p1.x, p1.y - 55);
  const p24 = { x: p22.x, y: p22.y - 5 };
  const p26 = legPoint(p0.x, p0.y - 50);
  const p28 = legPad(p24, legAngle, 10);
  const p29 = legPad(p26, legAngle + 180, 10);
  const p30 = legPad(p28, legAngle, 30);
  const p31 = { x: (p24.x + p30.x) / 2, y: (p24.y + p30.y) / 2 };

  const dh = (frontWrap - 12) / 2;
  const dh2 = (backWrap - 12) / 2;
  const pa = legPoint(p2.x + 18, p2.y - Math.tan(angleRad) * 18 - 2 - dh);
  const pb = legPoint(p9.x + 18, p9.y - Math.tan(angleRad) * 18 - 2 - dh2);

  if (legMethod === "H1" || legMethod === "H2") {
    drawLegLine(legBackTop, p1);
    drawLegLine(p1, p2);
    drawLegLine(p2, p6);
  } else {
    drawLegLine(legBackTop, p1);
    drawLegLine(p1, p2);
    drawLegLine(p2, p6);
  }

  if (legMethod === "K1" || legMethod === "H1" || legMethod === "H2") {
    drawLegLine(p2, k1P3);
    drawLegLine(k1P3, k1P4);
  }
  if (frontWrap > 0) {
    drawLegDashedLine(p7, p8);
    drawLegAngledText(`${frontWrap}倒包石`, pa.x, pa.y, 6, legAngle);
  }
  if (backWrap > 0) {
    drawLegDashedLine(p9, p10);
    drawLegAngledText(`${backWrap}倒包石`, pb.x, pb.y, 6, legAngle);
  }
  if (legMethod === "K1" || legMethod === "H1" || legMethod === "H2") {
    drawText(String(legThickness), p21.x, p21.y, 8);
  }
  drawLegAngledTextCentered(
    String(legHeight),
    p31.x + 8,
    p31.y - 8,
    16,
    legAngle,
  );
  drawLegLine(p22, { x: p22.x, y: p22.y - 10 });
  drawLegLine(p24, p28);
  drawLegLine(p26, p29);
}

function drawRightSideLeg(x0, yBottom) {
  const legDepth = Math.max(0, parseFloat(rightSideLeg.depth) || 0);
  const legThickness = Math.max(0, parseFloat(rightSideLeg.thickness) || 0);
  const legHeight = Math.max(0, parseFloat(rightSideLeg.height) || 0);
  const legWrap = Math.max(0, parseFloat(rightSideLeg.wrap) || 0);
  const legMethod = rightSideLeg.method || "K1";
  if (legDepth <= 0 || legThickness <= 0 || legHeight <= 0) return;

  const frontWrap = legWrap;
  const backWrap = backOption.value === "後靠牆" ? 0 : legWrap;
  const legAngle = 45;
  const angleRad = (legAngle * Math.PI) / 180;
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);

  const toWorld = (p) => legPoint(x0 - p.y, yBottom - p.x);

  // 局部座標：前端為原點，背向為 -Y；再映射到右台面底端
  const p0 = legPoint(0, -legDepth);
  const p1 = legPoint(-legHeight * cos, p0.y + legHeight * sin);
  const legBackTop = legPoint(
    p0.x - TABLETOP_THICKNESS * cos,
    p0.y + TABLETOP_THICKNESS * sin,
  );
  const p2 = legPoint(p1.x, p1.y + legDepth);
  const p6 = legPoint(0, 0);
  const p7 = legPoint(p2.x, p2.y - frontWrap);
  const p8 = legPoint(p0.x, p0.y + legDepth - frontWrap);
  const p9 = legPoint(p1.x, p1.y + backWrap);
  const p10 = legPoint(p0.x, p0.y + backWrap);
  const p21 = legPoint(p2.x, p2.y + 10);

  const k1Inset = Math.max(legThickness, 0);
  const k1P3 = legPoint(p2.x + k1Inset, p2.y);
  const k1Length = Math.max(
    0,
    legHeight - (sin === 0 ? TABLETOP_THICKNESS : TABLETOP_THICKNESS / sin),
  );
  const k1P4 = legPoint(k1P3.x + k1Length * cos, k1P3.y - k1Length * sin);

  const p22 = legPoint(p1.x, p1.y - 55);
  const p24 = { x: p22.x, y: p22.y - 5 };
  const p26 = legPoint(p0.x, p0.y - 50);
  const p28 = legPad(p24, legAngle, 10);
  const p29 = legPad(p26, legAngle + 180, 10);
  const p30 = legPad(p28, legAngle, 30);
  const p31 = { x: (p24.x + p30.x) / 2, y: (p24.y + p30.y) / 2 };

  const h1Inset = Math.max(TABLETOP_THICKNESS, legThickness);
  const h1Start = legPoint(p1.x, p1.y + h1Inset);
  const h1End = legPoint(p0.x, p0.y + h1Inset);

  const topDx = p1.x - p0.x;
  const topDy = p1.y - p0.y;
  const topLen = Math.hypot(topDx, topDy) || 1;
  const rightDx = p6.x - p0.x;
  const rightDy = p6.y - p0.y;
  const rightLen = Math.hypot(rightDx, rightDy) || 1;
  const h2Inset = Math.max(5, legThickness * 2.4);
  const h2SeamTop = legPoint(
    p0.x + (topDx / topLen) * h2Inset,
    p0.y + (topDy / topLen) * h2Inset,
  );
  const h2SeamRight = legPoint(
    p0.x + (rightDx / rightLen) * h2Inset,
    p0.y + (rightDy / rightLen) * h2Inset,
  );

  const dh = (frontWrap - 12) / 2;
  const dh2 = (backWrap - 12) / 2;
  const pa = legPoint(p2.x + 18, p2.y - Math.tan(angleRad) * 18 - 2 - dh);
  const pb = legPoint(p9.x + 18, p9.y - Math.tan(angleRad) * 18 - 2 - dh2);

  drawLegLine(toWorld(legBackTop), toWorld(p1));
  drawLegLine(toWorld(p1), toWorld(p2));
  drawLegLine(toWorld(p2), toWorld(p6));

  if (legMethod === "K1" || legMethod === "H1" || legMethod === "H2") {
    drawLegLine(toWorld(p2), toWorld(k1P3));
    drawLegLine(toWorld(k1P3), toWorld(k1P4));
  }
  if (legMethod === "H2") {
    drawLegLine(toWorld(p0), toWorld(h2SeamTop));
    drawLegLine(toWorld(p0), toWorld(h2SeamRight));
  }

  if (frontWrap > 0) {
    drawLegDashedLine(toWorld(p7), toWorld(p8));
    const paw = toWorld(pa);
    drawLegAngledText(`${frontWrap}倒包石`, paw.x, paw.y, 6, legAngle);
  }
  if (backWrap > 0) {
    drawLegDashedLine(toWorld(p9), toWorld(p10));
    const pbw = toWorld(pb);
    drawLegAngledText(`${backWrap}倒包石`, pbw.x, pbw.y, 6, legAngle);
  }
  if (legMethod === "K1" || legMethod === "H1" || legMethod === "H2") {
    const p21w = toWorld(p21);
    drawText(String(legThickness), p21w.x, p21w.y, 8);
  }

  const p31w = toWorld(p31);
  drawLegAngledTextCentered(
    String(legHeight),
    p31w.x + 8,
    p31w.y - 8,
    16,
    legAngle,
  );
  drawLegLine(toWorld(p22), toWorld({ x: p22.x, y: p22.y - 10 }));
  drawLegLine(toWorld(p24), toWorld(p28));
  drawLegLine(toWorld(p26), toWorld(p29));
}

function drawTopWall(x0, y0, w) {
  // 斜線從外框上緣(y0)往上延伸；步距較密、線稍粗以確保可見
  for (let i = -4; i <= w + 8; i += 5) {
    draw
      .line(x0 + i, y0 - 1, x0 + i + 6, y0 - 6)
      .stroke({ width: 1, color: "black" });
  }
}
function drawRightSideWall(xEdge, y0, wL) {
  // 斜線從外框右緣(xEdge)往右延伸；步距較密、線稍粗以確保可見
  for (let i = -4; i <= wL + 8; i += 5) {
    draw
      .line(xEdge + 1, y0 + i, xEdge + 6, y0 + i + 6)
      .stroke({ width: 1, color: "black" });
  }
}

// ─── 三角形（方向指標）────────────────────────────────────
function drawTri(cx, cy, dir) {
  const s = 8;
  let pts;
  if (dir === "u")
    pts = [
      [cx, cy - s * 0.6],
      [cx - s / 2, cy + s * 0.3],
      [cx + s / 2, cy + s * 0.3],
    ];
  else if (dir === "d")
    pts = [
      [cx - s / 2, cy - s * 0.3],
      [cx + s / 2, cy - s * 0.3],
      [cx, cy + s * 0.6],
    ];
  else if (dir === "l")
    pts = [
      [cx + s * 0.3, cy - s / 2],
      [cx - s * 0.6, cy],
      [cx + s * 0.3, cy + s / 2],
    ];
  else
    pts = [
      [cx - s * 0.3, cy - s / 2],
      [cx + s * 0.6, cy],
      [cx - s * 0.3, cy + s / 2],
    ];
  draw.polygon(pts.map((p) => p.join(",")).join(" ")).fill("black");
}

// ─── 水槽（水平段）────────────────────────────────────────
function drawSinkH(s, x0, y0, h, w) {
  const { sinkLength: sl, sinkDepth: sd, R: r, dig, center, position } = s;
  let xp;
  if (position === "水中") xp = x0 + center - sl / 2;
  else if (position === "左開") xp = x0 + center;
  else xp = x0 + w - center - sl;
  const yp = y0 + h - dig - sd;
  drawSinkBox(xp, yp, sl, sd, r);
  // 標註
  const label = `${position}${center}`;
  drawTopLabel(
    label,
    position === "右開" ? x0 + w - center : x0 + center,
    y0,
    position === "右開" ? x0 + w : x0,
  );
}
function drawStoveH(s, x0, y0, h, w) {
  const { stoveLength: sl, stoveDepth: sd, R: r, dig, dis, position } = s;
  let xp;
  if (position === "火中") xp = x0 + dis - sl / 2;
  else if (position === "左開") xp = x0 + dis;
  else xp = x0 + w - dis - sl;
  const yp = y0 + h - dig - sd;
  drawStoveBox(xp, yp, sl, sd, r);
  const label = `${position}${dis}`;
  drawTopLabel(
    label,
    position === "右開" ? x0 + w - dis : x0 + dis,
    y0,
    position === "右開" ? x0 + w : x0,
  );
}

// ─── 水槽（垂直段）────────────────────────────────────────
function drawSinkV(s, x0, y0, hL, wL) {
  const { sinkLength: sl, sinkDepth: sd, R: r, dig, center, position } = s;
  // 旋轉 90 度：sinkLength 投影到 Y 軸、sinkDepth 投影到 X 軸
  let yp;
  if (position === "水中") yp = y0 + center - sl / 2;
  else if (position === "上開") yp = y0 + center;
  else yp = y0 + wL - center - sl;
  const xp = x0 + dig;
  drawSinkBox(xp, yp, sd, sl, r); // 寬高互換
  const label = `${position}${center}`;
  drawRightLabel(
    label,
    position === "下開" ? y0 + wL - center : y0 + center,
    x0 + hL,
    position === "下開" ? y0 + wL : y0,
  );
}
function drawStoveV(s, x0, y0, hL, wL) {
  const { stoveLength: sl, stoveDepth: sd, R: r, dig, dis, position } = s;
  let yp;
  if (position === "火中") yp = y0 + dis - sl / 2;
  else if (position === "上開") yp = y0 + dis;
  else yp = y0 + wL - dis - sl;
  const xp = x0 + dig;
  drawStoveBoxVertical(xp, yp, sd, sl, r);
  const label = `${position}${dis}`;
  drawRightLabel(
    label,
    position === "下開" ? y0 + wL - dis : y0 + dis,
    x0 + hL,
    position === "下開" ? y0 + wL : y0,
  );
}

function drawSinkBox(x, y, w, h, r) {
  draw
    .rect(w, h)
    .move(x, y)
    .radius(r)
    .fill("none")
    .stroke({ width: 1, color: "black" });
  const cr = 14;
  draw
    .circle(cr)
    .move(x + (w - cr) / 2, y + (h - cr) / 2)
    .fill("none")
    .stroke({ width: 1, color: "black" });
}
function drawStoveBox(x, y, w, h, r) {
  draw
    .rect(w, h)
    .move(x, y)
    .radius(r)
    .fill("none")
    .stroke({ width: 1, color: "black" });
  const cr = 12;
  // 兩個爐眼
  draw
    .circle(cr)
    .move(x + w / 4 - cr / 2, y + h / 2 - cr / 2)
    .fill("none")
    .stroke({ width: 1, color: "black" });
  draw
    .circle(cr)
    .move(x + (w * 3) / 4 - cr / 2, y + h / 2 - cr / 2)
    .fill("none")
    .stroke({ width: 1, color: "black" });
}

function drawStoveBoxVertical(x, y, w, h, r) {
  draw
    .rect(w, h)
    .move(x, y)
    .radius(r)
    .fill("none")
    .stroke({ width: 1, color: "black" });
  const cr = 12;
  // 右台面爐眼改為上下排列
  draw
    .circle(cr)
    .move(x + w / 2 - cr / 2, y + h / 4 - cr / 2)
    .fill("none")
    .stroke({ width: 1, color: "black" });
  draw
    .circle(cr)
    .move(x + w / 2 - cr / 2, y + (h * 3) / 4 - cr / 2)
    .fill("none")
    .stroke({ width: 1, color: "black" });
}

function drawTopLabel(text, xPoint, y0, xFrom) {
  const yLine = y0 - 12;
  draw.line(xFrom, yLine, xPoint, yLine).stroke({ width: 0.5, color: "black" });
  draw.line(xPoint, yLine, xPoint, y0).stroke({ width: 0.5, color: "black" });
  const t = draw.text(String(text)).font({ size: 11, family: "DFKai-sb" });
  t.move(xPoint - t.bbox().width / 2, yLine - 14);
}
function drawRightLabel(text, yPoint, xEdge, yFrom) {
  // 與左段一致：所有右段標註共用同一條引線 xLine，
  // 文字放在各自 yPoint 處（類似左段文字放在 xPoint 處）
  const xLine = xEdge + 12;
  draw.line(xLine, yFrom, xLine, yPoint).stroke({ width: 0.5, color: "black" });
  draw
    .line(xEdge, yPoint, xLine, yPoint)
    .stroke({ width: 0.5, color: "black" });
  // 旋轉文字位於引線右外側，高度對齊 yPoint
  drawRotLabel(String(text), xLine + 14, yPoint, 90, 11);
}

// ─── 接線 ────────────────────────────────────────────────
function drawCutLineH(x0, y0, h, w, ltl) {
  const yMid = y0 + h + 15;
  draw.line(x0 + ltl, y0, x0 + ltl, yMid).stroke({ width: 1, color: "black" });
  draw
    .line(x0 + ltl - 30, yMid, x0 + ltl, yMid)
    .stroke({ width: 1, color: "black" });
  draw
    .line(x0 + ltl + 30, yMid, x0 + ltl, yMid)
    .stroke({ width: 1, color: "black" });
  draw
    .text(String(ltl))
    .font({ size: 10, family: "DFKai-sb" })
    .move(x0 + ltl - 30, yMid + 2);
  draw
    .text(String(Math.round((w - ltl) * 100) / 100))
    .font({ size: 10, family: "DFKai-sb" })
    .move(x0 + ltl + 4, yMid + 2);
}
function drawCutLineV(x0, y0, hL, wL, ltl) {
  const xMid = x0 + hL + 15;
  draw.line(x0, y0 + ltl, xMid, y0 + ltl).stroke({ width: 1, color: "black" });
  draw
    .line(xMid, y0 + ltl - 30, xMid, y0 + ltl)
    .stroke({ width: 1, color: "black" });
  draw
    .line(xMid, y0 + ltl + 30, xMid, y0 + ltl)
    .stroke({ width: 1, color: "black" });
  drawTextRot(String(ltl), xMid + 4, y0 + ltl - 30);
  drawTextRot(
    String(Math.round((wL - ltl) * 100) / 100),
    xMid + 4,
    y0 + ltl + 4,
  );
}

// 轉角接線：side === 'left' 表示左段含轉角 → 接線畫在右段的上緣（y = y0+h），
//              從 x0+w-hL 到 x0+w；
// side === 'right' 表示右段含轉角 → 接線畫在左段的右緣（x = x0+w-hL），
//              從 y0 到 y0+h。
function drawCornerJoint(x0, y0, w, h, wL, hL, side) {
  if (side === "left") {
    const y = y0 + h;
    const xa = x0 + w - hL;
    const xb = x0 + w;
    draw
      .line(xa, y, xb, y)
      .stroke({ width: 1.5, color: "black", dasharray: "6,3" });
    const t = draw
      .text("接線（左含轉角）")
      .font({ size: 11, family: "DFKai-sb", fill: "black" });
    t.move(xb + 8, y - 8);
  } else if (side === "right") {
    const x = x0 + w - hL;
    const ya = y0;
    const yb = y0 + h;
    draw
      .line(x, ya, x, yb)
      .stroke({ width: 1.5, color: "black", dasharray: "6,3" });
    const t = draw
      .text("接線（右含轉角）")
      .font({ size: 11, family: "DFKai-sb", fill: "black" });
    t.move(x + 4, ya - 16);
  }
}
</script>

<style scoped>
input,
select {
  width: auto;
  height: 26px;
  padding: 0 4px;
  border-radius: 4px;
}
input[type="checkbox"],
input[type="radio"] {
  width: auto;
  height: auto;
  padding: 0;
  border: none;
  background: none;
  border-radius: 0;
}

.drawing-page {
  padding: 10px;
  font-size: 14px;
}
.save-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.btn-save {
  background: #1f4bb8;
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 6px 12px;
  cursor: pointer;
}
.btn-save:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.save-msg {
  color: #2d7d46;
  font-size: 13px;
}
.row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  margin-bottom: 6px;
}
label {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  white-space: nowrap;
  cursor: pointer;
}
.number {
  width: 4em !important;
}
.section {
  border: 1px solid #d0d4d9;
  border-radius: 6px;
  padding: 6px 8px;
  margin: 8px 0;
  background: #fafbfc;
}
.section-title {
  font-weight: 600;
  margin-bottom: 4px;
  color: #2b3a55;
}
.settings {
  background: bisque;
  padding: 6px 8px;
  border-radius: 6px;
}
.svg-container {
  margin-top: 16px;
  background: #fff;
  border: 1px solid #e0e0e0;
  border-radius: 4px;
  overflow: auto;
}
strong {
  margin-right: 4px;
  color: #1f4bb8;
}

.corner-row {
  background: yellow;
  padding: 8px;
  border-radius: 6px;
  margin: 8px 0;
  justify-content: center;
}
.corner-btn {
  font-size: 16px;
  font-weight: 600;
  padding: 6px 18px;
  background: #fff;
  border: 1px solid #888;
  border-radius: 4px;
  cursor: pointer;
}
.corner-btn:hover {
  background: #ffe;
}
.corner-btn.active {
  background: #ff6b6b;
  color: #fff;
  border-color: #c0392b;
}
</style>
