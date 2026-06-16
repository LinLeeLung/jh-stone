<template>
  <div class="drawing-page">
    <!-- 儲存列（訂單繪圖模式才顯示）-->
    <div v-if="orderId" class="save-bar">
      <button class="btn-save" :disabled="saving" @click="saveDrawing">
        {{ saving ? "儲存中…" : "💾 儲存繪圖" }}
      </button>
      <span v-if="saveMsg" class="save-msg">{{ saveMsg }}</span>
    </div>

    <!-- 桶身輸入列 -->
    <div class="row">
      桶身
      <input
        v-for="i in 9"
        :key="i"
        type="number"
        v-model.number="cabins[i - 1]"
        class="number cabin"
        @change="redraw"
      />
      深度<input
        type="number"
        v-model.number="depthVal"
        class="number"
        @change="redraw"
      />
      <button @click="toggleCutline">
        {{ isCutlineToggled ? "取消接線" : "接線左起" }}
      </button>
      <input
        type="text"
        v-model="connectValue"
        style="width: 4em"
        title="輸入接線左起幾公分"
      />
      <button @click="redraw">繪圖</button>
      <button @click="clearBox">清空</button>
    </div>

    <!-- 水槽 1 -->
    <div class="row">
      <input type="checkbox" v-model="sink1.enabled" @change="redraw" />水槽
      <label
        ><input
          type="radio"
          v-model="sink1.position"
          value="水中"
          @change="redraw"
        />水中</label
      >
      <label
        ><input
          type="radio"
          v-model="sink1.position"
          value="左開"
          @change="redraw"
        />左開</label
      >
      <label
        ><input
          type="radio"
          v-model="sink1.position"
          value="右開"
          @change="redraw"
        />右開</label
      >
      <input
        type="number"
        v-model.number="sink1.center"
        class="number"
        @change="redraw"
      />
      水槽尺吋 長<input
        type="number"
        v-model.number="sink1.sinkLength"
        class="number"
        @change="redraw"
      />
      深<input
        type="number"
        v-model.number="sink1.sinkDepth"
        class="number"
        @change="redraw"
      />
      R角<input
        type="number"
        v-model.number="sink1.R"
        class="number"
        @change="redraw"
      />
      開挖距離<input
        type="number"
        v-model.number="sink1.dig"
        class="number"
        @change="redraw"
      />
      搜尋水槽<input
        type="text"
        v-model="sink1.searchName"
        class="number"
        @input="onSink1SearchInput"
      />
      <select v-model="sink1.selectValue" @change="onSink1SelectChange">
        <option value="">請選擇水槽</option>
        <option v-for="opt in sinkOptions" :key="opt.value" :value="opt.value">
          {{ opt.text }}
        </option>
      </select>
      <span>{{ sink1.showText }}</span>
    </div>

    <!-- 水槽 2 -->
    <div class="row">
      <input type="checkbox" v-model="sink2.enabled" @change="redraw" />水槽
      <label
        ><input
          type="radio"
          v-model="sink2.position"
          value="水中"
          @change="redraw"
        />水中</label
      >
      <label
        ><input
          type="radio"
          v-model="sink2.position"
          value="左開"
          @change="redraw"
        />左開</label
      >
      <label
        ><input
          type="radio"
          v-model="sink2.position"
          value="右開"
          @change="redraw"
        />右開</label
      >
      <input
        type="number"
        v-model.number="sink2.center"
        class="number"
        @change="redraw"
      />
      水槽尺吋 長<input
        type="number"
        v-model.number="sink2.sinkLength"
        class="number"
        @change="redraw"
      />
      深<input
        type="number"
        v-model.number="sink2.sinkDepth"
        class="number"
        @change="redraw"
      />
      R角<input
        type="number"
        v-model.number="sink2.R"
        class="number"
        @change="redraw"
      />
      開挖距離<input
        type="number"
        v-model.number="sink2.dig"
        class="number"
        @change="redraw"
      />
      搜尋水槽<input
        type="text"
        v-model="sink2.searchName"
        class="number"
        @input="onSink2SearchInput"
      />
      <select v-model="sink2.selectValue" @change="onSink2SelectChange">
        <option value="">請選擇水槽</option>
        <option v-for="opt in sinkOptions" :key="opt.value" :value="opt.value">
          {{ opt.text }}
        </option>
      </select>
      <span>{{ sink2.showText }}</span>
    </div>

    <!-- 火爐 1 -->
    <div class="row">
      <input type="checkbox" v-model="stove1.enabled" @change="redraw" />火爐
      <label
        ><input
          type="radio"
          v-model="stove1.position"
          value="火中"
          @change="redraw"
        />火中</label
      >
      <label
        ><input
          type="radio"
          v-model="stove1.position"
          value="左開"
          @change="redraw"
        />左開</label
      >
      <label
        ><input
          type="radio"
          v-model="stove1.position"
          value="右開"
          @change="redraw"
        />右開</label
      >
      <input
        type="number"
        v-model.number="stove1.dis"
        class="number"
        @change="redraw"
      />
      火爐尺吋 長<input
        type="number"
        v-model.number="stove1.stoveLength"
        class="number"
        @change="redraw"
      />
      深<input
        type="number"
        v-model.number="stove1.stoveDepth"
        class="number"
        @change="redraw"
      />
      R角<input
        type="number"
        v-model.number="stove1.R"
        class="number"
        @change="redraw"
      />
      開挖距離<input
        type="number"
        v-model.number="stove1.dig"
        class="number"
        @change="redraw"
      />
    </div>

    <!-- 火爐 2 -->
    <div class="row">
      <input type="checkbox" v-model="stove2.enabled" @change="redraw" />火爐
      <label
        ><input
          type="radio"
          v-model="stove2.position"
          value="火中"
          @change="redraw"
        />火中</label
      >
      <label
        ><input
          type="radio"
          v-model="stove2.position"
          value="左開"
          @change="redraw"
        />左開</label
      >
      <label
        ><input
          type="radio"
          v-model="stove2.position"
          value="右開"
          @change="redraw"
        />右開</label
      >
      <input
        type="number"
        v-model.number="stove2.dis"
        class="number"
        @change="redraw"
      />
      火爐尺吋 長<input
        type="number"
        v-model.number="stove2.stoveLength"
        class="number"
        @change="redraw"
      />
      深<input
        type="number"
        v-model.number="stove2.stoveDepth"
        class="number"
        @change="redraw"
      />
      R角<input
        type="number"
        v-model.number="stove2.R"
        class="number"
        @change="redraw"
      />
      開挖距離<input
        type="number"
        v-model.number="stove2.dig"
        class="number"
        @change="redraw"
      />
    </div>

    <!-- 靠牆 / 前沿 / 計算 設定區 -->
    <div style="display: inline-block; background-color: bisque">
      <div>
        <!-- 左側 -->
        <label
          ><input
            type="radio"
            v-model="leftOption"
            value="左靠牆"
            @change="redraw"
          />左靠牆</label
        >
        <label
          ><input
            type="radio"
            v-model="leftOption"
            value="左見光"
            @change="redraw"
          />左見光</label
        >
        <label
          ><input
            type="radio"
            v-model="leftOption"
            value="左齊桶身"
            @change="redraw"
          />左齊桶身</label
        >
        <label
          ><input
            type="radio"
            v-model="leftOption"
            value="左靠側板"
            @change="redraw"
          />左靠側板</label
        >
        <label>
          <input
            type="radio"
            v-model="leftOption"
            value="左靠櫃"
            @change="redraw"
          />左靠櫃
          <span>側板或櫃深</span>
          <input
            type="number"
            class="number"
            v-model.number="slabDepthLeft"
            @change="redraw"
          />
        </label>
        <br />
        <!-- 右側 -->
        <label
          ><input
            type="radio"
            v-model="rightOption"
            value="右靠牆"
            @change="redraw"
          />右靠牆</label
        >
        <label
          ><input
            type="radio"
            v-model="rightOption"
            value="右見光"
            @change="redraw"
          />右見光</label
        >
        <label
          ><input
            type="radio"
            v-model="rightOption"
            value="右齊桶身"
            @change="redraw"
          />右齊桶身</label
        >
        <label
          ><input
            type="radio"
            v-model="rightOption"
            value="右靠側板"
            @change="redraw"
          />右靠側板</label
        >
        <label>
          <input
            type="radio"
            v-model="rightOption"
            value="右靠櫃"
            @change="redraw"
          />右靠櫃
          <span>側板或櫃深</span>
          <input
            type="number"
            class="number"
            v-model.number="slabDepthRight"
            @change="redraw"
          />
        </label>
        <br />
        <!-- 後側 -->
        <label
          ><input
            type="radio"
            v-model="backOption"
            value="後靠牆"
            @change="redraw"
          />後靠牆</label
        >
        <label
          ><input
            type="radio"
            v-model="backOption"
            value="後見光"
            @change="redraw"
          />後見光</label
        >
        <label>
          <input type="checkbox" v-model="backstop" @change="redraw" />背牆
          <input
            type="number"
            class="number"
            v-model.number="backHeight"
            step="0.1"
            @change="redraw"
          />
          <span>公分</span>
        </label>
      </div>

      <!-- 枱面設定 -->
      <div>
        枱面厚度<input
          type="number"
          class="number"
          v-model.number="counterThick"
          step="0.1"
          @change="redraw"
        />
        <label
          ><input
            type="radio"
            v-model="frontType"
            value="normal"
            @change="redraw"
          />正常</label
        >
        <label
          ><input
            type="radio"
            v-model="frontType"
            value="cleanUp"
            @change="redraw"
          />不套板</label
        >
        <label
          ><input
            type="radio"
            v-model="frontType"
            value="tarkala"
            @change="redraw"
          />不套板倒包3</label
        >
        深度<input
          type="number"
          class="number"
          v-model.number="leaveSpace"
          step="0.1"
          @change="redraw"
        />
        <label
          >賽麗石<input
            type="radio"
            v-model="stoneType"
            value="cs"
            @change="onStoneTypeChange"
        /></label>
        <label
          >晶華石<input
            type="radio"
            v-model="stoneType"
            value="jh"
            @change="onStoneTypeChange"
        /></label>
        板材厚度<input
          type="number"
          class="number"
          v-model.number="slabThick"
          step="0.1"
          @change="redraw"
        />
      </div>

      <!-- 計算區 -->
      <div>
        <label><input type="checkbox" v-model="showCal" />顯示計算區</label>
        <div v-show="showCal" class="cal-area">
          石材單價<input
            type="number"
            v-model.number="price"
            style="width: 3em"
            @input="recal"
          />
          <label
            ><input
              type="radio"
              v-model="sinkRadio"
              value="sink"
              @change="recal"
            />下嵌水槽</label
          >
          <input
            type="number"
            v-model.number="sinkPrice"
            style="width: 4em"
            @input="recal"
          />
          <label
            ><input
              type="radio"
              v-model="sinkRadio"
              value="pinsink"
              @change="recal"
            />平接水槽</label
          >
          <input
            type="number"
            v-model.number="pinsinkPrice"
            style="width: 4em"
            @input="recal"
          /><br />
          <label
            ><input
              type="radio"
              v-model="stoveRadio"
              value="stove"
              @change="recal"
            />上掛爐</label
          >
          <input
            type="number"
            v-model.number="stovePrice"
            style="width: 4em"
            @input="recal"
          /><br />
          <label
            ><input
              type="radio"
              v-model="stoveRadio"
              value="pinstove"
              @change="recal"
            />平接爐</label
          >
          <input
            type="number"
            v-model.number="pinstovePrice"
            style="width: 4em"
            @input="recal"
          /><br />
          <label
            ><input
              type="checkbox"
              v-model="dep65"
              @change="recal"
            />65深比例換算</label
          >
        </div>
      </div>

      <label><input type="checkbox" v-model="showSetUp" />顯示設定</label>
    </div>

    <!-- 設定面板 -->
    <div
      v-show="showSetUp"
      style="
        display: inline-block;
        background-color: yellow;
        vertical-align: top;
      "
    >
      <div
        style="height: 100px; width: 700px; float: right; background: yellow"
      >
        1.字體大小<input
          type="number"
          v-model.number="settings[1]"
          style="width: 3em"
          class="active"
          @change="redraw"
        />
        2.字體大小<input
          type="number"
          v-model.number="settings[2]"
          style="width: 3em"
          class="active"
          @change="redraw"
        />
        3.字體大小<input
          type="number"
          v-model.number="settings[3]"
          style="width: 3em"
          class="active"
          @change="redraw"
        />
        4.距離<input
          type="number"
          v-model.number="settings[4]"
          style="width: 3em"
          class="active"
          @change="redraw"
        />
        5.字體大小<input
          type="number"
          v-model.number="settings[5]"
          style="width: 3em"
          class="active"
          @change="redraw"
        />
        6.距離<input
          type="number"
          v-model.number="settings[6]"
          style="width: 3em"
          class="active"
          @change="redraw"
        />
        7.距離<input
          type="number"
          v-model.number="settings[7]"
          style="width: 3em"
          class="active"
          @change="redraw"
        />
        9.距離<input
          type="number"
          v-model.number="settings[9]"
          style="width: 3em"
          class="active"
          @change="redraw"
        />
        10.距離<input
          type="number"
          v-model.number="settings[10]"
          style="width: 3em"
          class="active"
          @change="redraw"
        />
        11.距離<input
          type="number"
          v-model.number="settings[11]"
          style="width: 3em"
          class="active"
          @change="redraw"
        />
        12.距離<input
          type="number"
          v-model.number="settings[12]"
          style="width: 3em"
          class="active"
          @change="redraw"
        />
        16.距離<input
          type="number"
          v-model.number="settings[16]"
          style="width: 3em"
          class="active"
          @change="redraw"
        />
        17.字體大小<input
          type="number"
          v-model.number="settings[17]"
          style="width: 3em"
          class="active"
          @change="redraw"
        />
        18.字體大小<input
          type="number"
          v-model.number="settings[18]"
          style="width: 3em"
          class="active"
          @change="redraw"
        />
        <br />
        <button @click="saveSettings(1)">存設定1</button>
        <button @click="saveSettings(2)">存設定2</button>
        <button @click="saveSettings(3)">存設定3</button>
        <button @click="loadSettings(1)">取設定1</button>
        <button @click="loadSettings(2)">取設定2</button>
        <button @click="loadSettings(3)">取設定3</button>
      </div>
      <img src="/set.png" style="width: 500px; height: 200px" />
    </div>

    <!-- SVG 畫布 -->
    <div ref="svgContainerRef" id="svgContainer"></div>

    <!-- 計算結果 -->
    <div v-html="calResult" style="background-color: white"></div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, defineProps } from "vue";
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

// ─── SVG 繪圖用模組級變數（非響應式，每次 redraw 前更新）───
let draw = null;
const svgContainerRef = ref(null);
let _startx = 100;
let _starty = 100;
let _length = 0;
let _depth = 60;
let _slabThick = 1.2;

// ─── 響應式表單狀態 ───────────────────────────────────────────
const cabins = ref([90, 120, 90, null, null, null, null, null, null]);
const depthVal = ref(60);
const connectValue = ref(210);
const isCutlineToggled = ref(false);

const sink1 = reactive({
  enabled: true,
  position: "水中",
  center: 255,
  sinkLength: 67.8,
  sinkDepth: 49,
  R: 5.6,
  dig: 7,
  searchName: "",
  selectValue: "",
  showText: "show",
});
const sink2 = reactive({
  enabled: false,
  position: "水中",
  center: 45,
  sinkLength: 67.8,
  sinkDepth: 49,
  R: 5.6,
  dig: 7,
  searchName: "",
  selectValue: "",
  showText: "show",
});

const stove1 = reactive({
  enabled: false,
  position: "火中",
  dis: 255,
  stoveLength: 67,
  stoveDepth: 35,
  R: 8.5,
  dig: 7,
});
const stove2 = reactive({
  enabled: true,
  position: "火中",
  dis: 45,
  stoveLength: 67,
  stoveDepth: 35,
  R: 8.5,
  dig: 11,
});

const leftOption = ref("左靠牆");
const rightOption = ref("右靠牆");
const backOption = ref("後靠牆");
const slabDepthLeft = ref(null);
const slabDepthRight = ref(null);
const backstop = ref(true);
const backHeight = ref(4);

const frontType = ref("normal");
const counterThick = ref(4);
const leaveSpace = ref(1.6);
const stoneType = ref("cs");
const slabThick = ref(1.2);

const price = ref(70);
const sinkPrice = ref(2500);
const pinsinkPrice = ref(6000);
const stovePrice = ref(1000);
const pinstovePrice = ref(4000);
const sinkRadio = ref("sink");
const stoveRadio = ref("stove");
const dep65 = ref(false);

const showSetUp = ref(true);
const showCal = ref(true);
const calResult = ref("");

const settings = reactive({
  1: 18,
  2: 16,
  3: 12,
  4: 10,
  5: 15,
  6: 30,
  7: 15,
  9: 50,
  10: 25,
  11: 25,
  12: 50,
  16: 10,
  17: 10,
  18: 10,
});

const sinkOptions = ref([]);

// 快取設定值的輔助函式
function s(key) {
  return settings[key];
}

// ─── 狀態快照（存 / 讀）─────────────────────────────────────────
// ─── 取得含緊縮 viewBox 的 SVG（去除空白邊） ────────────────
function getTightSvg(d) {
  try {
    const bb = d.bbox();
    if (bb.width > 0 && bb.height > 0) {
      const pad = 10;
      d.viewbox(
        bb.x - pad,
        bb.y - pad,
        bb.width + pad * 2,
        bb.height + pad * 2,
      );
      const s = d.svg();
      d.node.removeAttribute("viewBox");
      return s;
    }
  } catch (e) {
    /* fallthrough */
  }
  return d.svg();
}

function getSnapshot() {
  return {
    cabins: [...cabins.value],
    depthVal: depthVal.value,
    connectValue: connectValue.value,
    isCutlineToggled: isCutlineToggled.value,
    sink1: { ...sink1 },
    sink2: { ...sink2 },
    stove1: { ...stove1 },
    stove2: { ...stove2 },
    leftOption: leftOption.value,
    rightOption: rightOption.value,
    backOption: backOption.value,
    slabDepthLeft: slabDepthLeft.value,
    slabDepthRight: slabDepthRight.value,
    backstop: backstop.value,
    backHeight: backHeight.value,
    frontType: frontType.value,
    counterThick: counterThick.value,
    leaveSpace: leaveSpace.value,
    stoneType: stoneType.value,
    slabThick: slabThick.value,
    price: price.value,
    sinkPrice: sinkPrice.value,
    pinsinkPrice: pinsinkPrice.value,
    stovePrice: stovePrice.value,
    pinstovePrice: pinstovePrice.value,
    sinkRadio: sinkRadio.value,
    stoveRadio: stoveRadio.value,
    dep65: dep65.value,
    settings: { ...settings },
    svgContent: draw ? getTightSvg(draw) : "",
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
  if (Array.isArray(snap.cabins)) cabins.value = [...snap.cabins];
  if (snap.depthVal != null) depthVal.value = snap.depthVal;
  if (snap.connectValue != null) connectValue.value = snap.connectValue;
  if (snap.isCutlineToggled != null)
    isCutlineToggled.value = snap.isCutlineToggled;
  if (snap.leftOption != null) leftOption.value = snap.leftOption;
  if (snap.rightOption != null) rightOption.value = snap.rightOption;
  if (snap.backOption != null) backOption.value = snap.backOption;
  if (snap.slabDepthLeft != null) slabDepthLeft.value = snap.slabDepthLeft;
  if (snap.slabDepthRight != null) slabDepthRight.value = snap.slabDepthRight;
  if (snap.backstop != null) backstop.value = snap.backstop;
  if (snap.backHeight != null) backHeight.value = snap.backHeight;
  if (snap.frontType != null) frontType.value = snap.frontType;
  if (snap.counterThick != null) counterThick.value = snap.counterThick;
  if (snap.leaveSpace != null) leaveSpace.value = snap.leaveSpace;
  if (snap.stoneType != null) stoneType.value = snap.stoneType;
  if (snap.slabThick != null) slabThick.value = snap.slabThick;
  if (snap.price != null) price.value = snap.price;
  if (snap.sinkPrice != null) sinkPrice.value = snap.sinkPrice;
  if (snap.pinsinkPrice != null) pinsinkPrice.value = snap.pinsinkPrice;
  if (snap.stovePrice != null) stovePrice.value = snap.stovePrice;
  if (snap.pinstovePrice != null) pinstovePrice.value = snap.pinstovePrice;
  if (snap.sinkRadio != null) sinkRadio.value = snap.sinkRadio;
  if (snap.stoveRadio != null) stoveRadio.value = snap.stoveRadio;
  if (snap.dep65 != null) dep65.value = snap.dep65;
  if (snap.sink1) Object.assign(sink1, snap.sink1);
  if (snap.sink2) Object.assign(sink2, snap.sink2);
  if (snap.stove1) Object.assign(stove1, snap.stove1);
  if (snap.stove2) Object.assign(stove2, snap.stove2);
  if (snap.settings) Object.assign(settings, snap.settings);
}

function preFillFromOrder(ord) {
  if (!ord) return;
  // 石材類型
  const stone = ord.stones?.[0];
  if (stone) {
    const brand = (stone.brand || "").toLowerCase();
    if (brand.includes("晶華") || brand.includes("jh")) {
      stoneType.value = "jh";
      slabThick.value = 1.5;
    } else {
      stoneType.value = "cs";
      slabThick.value = 1.2;
    }
  }
  // 水槽 1
  const s1 = ord.sinks?.[0];
  if (s1) {
    sink1.enabled = true;
    if (s1.holeWidthMm) sink1.sinkLength = s1.holeWidthMm / 10;
    if (s1.holeDepthMm) sink1.sinkDepth = s1.holeDepthMm / 10;
    if (s1.holeRadiusMm) sink1.R = s1.holeRadiusMm / 10;
  }
  // 水槽 2
  const s2 = ord.sinks?.[1];
  if (s2) {
    sink2.enabled = true;
    if (s2.holeWidthMm) sink2.sinkLength = s2.holeWidthMm / 10;
    if (s2.holeDepthMm) sink2.sinkDepth = s2.holeDepthMm / 10;
    if (s2.holeRadiusMm) sink2.R = s2.holeRadiusMm / 10;
  }
  // 爐子 1
  const t1 = ord.stoves?.[0];
  if (t1) {
    stove1.enabled = true;
    if (t1.holeWidthMm) stove1.stoveLength = t1.holeWidthMm / 10;
    if (t1.holeDepthMm) stove1.stoveDepth = t1.holeDepthMm / 10;
    if (t1.holeRadiusMm) stove1.R = t1.holeRadiusMm / 10;
  }
  // 爐子 2
  const t2 = ord.stoves?.[1];
  if (t2) {
    stove2.enabled = true;
    if (t2.holeWidthMm) stove2.stoveLength = t2.holeWidthMm / 10;
    if (t2.holeDepthMm) stove2.stoveDepth = t2.holeDepthMm / 10;
    if (t2.holeRadiusMm) stove2.R = t2.holeRadiusMm / 10;
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

// ─── 生命週期 ──────────────────────────────────────────────────
onMounted(() => {
  draw = SVG().addTo(svgContainerRef.value).size(1300, 250);
  getSinkData();
  if (props.savedState) {
    restoreSnapshot(props.savedState);
  } else if (props.order) {
    preFillFromOrder(props.order);
  }
  redraw();
  savedSignature.value = getStateSignature();
});

// ─── 事件處理 ──────────────────────────────────────────────────
function toggleCutline() {
  isCutlineToggled.value = !isCutlineToggled.value;
  redraw();
}

function clearBox() {
  for (let i = 0; i < cabins.value.length; i++) cabins.value[i] = null;
}

function onStoneTypeChange() {
  slabThick.value = stoneType.value === "jh" ? 1.5 : 1.2;
  redraw();
}

// ─── 主繪圖函式 ────────────────────────────────────────────────
function redraw() {
  if (!draw) return;
  _startx = 100;
  _starty = 100;
  _slabThick = slabThick.value;
  _depth = depthVal.value;
  draw.clear();

  // 計算桶身列表與總長
  const boxlist = [];
  _length = 0;
  for (const v of cabins.value) {
    const n = parseFloat(v);
    if (!isNaN(n) && n > 0) {
      boxlist.push(n);
      _length += n;
    }
  }
  _length = Math.round(_length * 100) / 100;

  drawBoxes(boxlist, _depth, _startx, _starty);

  if (backOption.value === "後靠牆")
    drawWall(_startx, _starty, _startx + _length, _starty);
  if (backOption.value === "後見光") drawBackOpen();

  if (leftOption.value === "左靠牆")
    drawLeftWall(_startx, _starty, _startx, _starty + _depth);
  if (leftOption.value === "左靠側板")
    drawLeftSlabOrCabin(_startx, _starty, _startx, _starty + _depth, "側板");
  if (leftOption.value === "左靠櫃")
    drawLeftSlabOrCabin(_startx, _starty, _startx, _starty + _depth, "櫃");
  if (leftOption.value === "左見光") drawLeftOpen();
  if (leftOption.value === "左齊桶身")
    drawTriangleWithDiamond(_startx - 10, _starty + _depth / 2, 10);

  if (rightOption.value === "右靠牆")
    drawRightWall(
      _startx + _length,
      _starty,
      _startx + _length,
      _starty + _depth,
    );
  if (rightOption.value === "右靠側板")
    drawRightSlabOrCabin(
      _startx + _length,
      _starty,
      _startx + _length,
      _starty + _depth,
      "側板",
    );
  if (rightOption.value === "右靠櫃")
    drawRightSlabOrCabin(
      _startx + _length,
      _starty,
      _startx + _length,
      _starty + _depth,
      "櫃",
    );
  if (rightOption.value === "右見光") drawRightOpen();
  if (rightOption.value === "右齊桶身")
    drawTriangleWithDiamond(_startx + _length + 10, _starty + _depth / 2, 10);

  if (backstop.value) drawBackStop();

  drawLengthMarker(_length);

  if (sink1.enabled) {
    if (sink1.position === "水中") drawSink(sink1);
    if (sink1.position === "左開") drawSinkLeft(sink1);
    if (sink1.position === "右開") drawSinkRight(sink1);
  }
  if (sink2.enabled) {
    if (sink2.position === "水中") drawSink(sink2);
    if (sink2.position === "左開") drawSinkLeft(sink2);
    if (sink2.position === "右開") drawSinkRight(sink2);
  }

  if (stove1.enabled) {
    if (stove1.position === "火中") drawStove(stove1);
    if (stove1.position === "左開") drawStoveLeft(stove1);
    if (stove1.position === "右開") drawStoveRight(stove1);
  }
  if (stove2.enabled) {
    if (stove2.position === "火中") drawStove(stove2);
    if (stove2.position === "左開") drawStoveLeft(stove2);
    if (stove2.position === "右開") drawStoveRight(stove2);
  }

  drawFrontEnd(frontType.value, _depth, counterThick.value, 150 + _length, 100);
  drawFrontOpen();
  leftRule();
  if (isCutlineToggled.value) cutline();
  recal();
}

// ─── 計算報價 ─────────────────────────────────────────────────
function recal() {
  const sinkcount = (sink1.enabled ? 1 : 0) + (sink2.enabled ? 1 : 0);
  const stovecount = (stove1.enabled ? 1 : 0) + (stove2.enabled ? 1 : 0);
  const d = depthVal.value;
  const backheight = backHeight.value;
  const thick = counterThick.value;
  const priceVal = price.value;

  let sinkresult = "",
    stoveresult = "",
    totalPrice = 0;

  const sp = sinkRadio.value === "sink" ? sinkPrice.value : pinsinkPrice.value;
  const spLabel = sinkRadio.value === "sink" ? "下嵌水槽" : "平接水槽";
  if (sinkcount === 2) {
    sinkresult = `${spLabel}:${sp} x 2 =${sp * 2}`;
    totalPrice += sp * 2;
  }
  if (sinkcount === 1) {
    sinkresult = `${spLabel}:${sp}`;
    totalPrice += sp;
  }

  const tp =
    stoveRadio.value === "stove" ? stovePrice.value : pinstovePrice.value;
  const tpLabel = stoveRadio.value === "stove" ? "上掛爐" : "平接爐";
  if (stovecount === 2) {
    stoveresult = `${tpLabel}:${tp}x2=${tp * 2}`;
    totalPrice += tp * 2;
  }
  if (stovecount === 1) {
    stoveresult = `${tpLabel}:${tp}`;
    totalPrice += tp;
  }

  const ratioStandard = dep65.value ? 65 : 60;
  const minus = backheight + thick - 8;
  const effectiveD = d + Math.max(0, minus);
  let total = 0,
    resultshow = "";

  if (effectiveD > ratioStandard) {
    if (minus > 0) {
      const adj = (effectiveD / 60) * _length;
      total = Math.round(priceVal * adj);
      resultshow = `@${priceVal} x (${d}+${minus.toFixed(1)})/60 x ${_length} = ${priceVal} x ${adj.toFixed(1)} = ${total}`;
    } else {
      const adj = (d / 60) * _length;
      total = Math.round(priceVal * adj);
      resultshow = `@${priceVal} x ${d}/60 x ${_length} = ${priceVal} x ${adj.toFixed(1)} = ${total}`;
    }
  } else {
    total = Math.round(priceVal * _length);
    resultshow = `@${priceVal} x ${_length} = ${total}`;
  }

  calResult.value =
    stoveresult +
    "<br>" +
    sinkresult +
    "<br>" +
    resultshow +
    "<br>總計:" +
    (total + totalPrice);
}

// ─── SVG 繪圖函式 ─────────────────────────────────────────────
function leftRule() {
  const d1 = s(9);
  draw
    .line(_startx - d1, _starty, _startx - d1 + 10, _starty)
    .stroke({ width: 0.5, color: "black" });
  draw
    .line(_startx - d1, _starty + _depth, _startx - d1 + 10, _starty + _depth)
    .stroke({ width: 0.5, color: "black" });
  draw
    .line(_startx - d1 + 5, _starty, _startx - d1, _starty + 5)
    .stroke({ width: 0.5, color: "black" });
  draw
    .line(_startx - d1 + 5, _starty, _startx - d1 + 10, _starty + 5)
    .stroke({ width: 0.5, color: "black" });
  draw
    .line(
      _startx - d1 + 5,
      _starty + _depth,
      _startx - d1 + 10,
      _starty - 5 + _depth,
    )
    .stroke({ width: 0.5, color: "black" });
  draw
    .line(
      _startx - d1 + 5,
      _starty + _depth,
      _startx - d1,
      _starty - 5 + _depth,
    )
    .stroke({ width: 0.5, color: "black" });
  draw
    .line(_startx - d1 + 5, _starty, _startx - d1 + 5, _starty + 10)
    .stroke({ width: 0.5, color: "black" });
  draw
    .line(
      _startx - d1 + 5,
      _starty + _depth - 10,
      _startx - d1 + 5,
      _starty + _depth,
    )
    .stroke({ width: 0.5, color: "black" });
  const text = draw
    .text(String(_depth))
    .stroke({ width: 0.5, color: "black" })
    .font({ size: s(5) });
  text.move(_startx - d1, _starty + (_depth - text.bbox().width) / 2);
}

function drawBackOpen() {
  drawTri(_startx + _length / 2, _starty - 15);
}

function drawFrontOpen() {
  drawTri(_startx + _length / 2, _starty + _depth + s(6));
}

function drawLeftSlabOrCabin(x1, y1, _x2, _y2, item) {
  for (let i = y1; i <= _y2 - 10; i += 10) {
    draw.line(x1 - 3, i, x1, i + 10).stroke({ width: 1, color: "black" });
  }
  const seal = _depth - (parseFloat(slabDepthLeft.value) || 0) + 1;
  const text = draw
    .text(item)
    .font({ size: s(3) })
    .stroke({ color: "black", width: 0.5 })
    .attr("writing-mode", "tb");
  let x = x1 - s(4) - text.bbox().width;
  let y = y1 + (_depth - text.bbox().height) / 2;
  text.move(x, y);
  if (seal > 0) {
    drawdiamond(x1 - 10, y1 + _depth - 10, 8);
    draw
      .text(String(seal))
      .font({ size: s(17) })
      .stroke({ width: 0.3, color: "black" })
      .move(x1 - s(16), y1 + _depth - 8);
    text.text(item + "深" + (slabDepthLeft.value || ""));
    x = x1 - s(4) - text.bbox().width;
    y = y1 + (_depth - text.bbox().height) / 2;
    text.move(x, y);
  }
}

function drawRightSlabOrCabin(x1, y1, _x2, _y2, item) {
  for (let i = y1; i <= _y2 - 10; i += 10) {
    draw.line(x1 + 3, i, x1, i + 10).stroke({ width: 1, color: "black" });
  }
  const seal = _depth - (parseFloat(slabDepthRight.value) || 0) + 1;
  const text = draw
    .text(item)
    .font({ size: s(3) })
    .stroke({ color: "black", width: 0.5 })
    .attr("writing-mode", "tb");
  let x = x1 + s(7);
  let y = y1 + (_depth - text.bbox().height) / 2;
  text.move(x, y);
  if (seal > 0) {
    drawdiamond(x1 + 10, y1 + _depth - 10, 8);
    draw
      .text(String(seal))
      .font({ size: s(18) })
      .stroke({ width: 0.3, color: "black" })
      .move(x1 + s(16), y1 + _depth - 8);
    text.text(item + "深" + (slabDepthRight.value || ""));
    x = x1 + s(7);
    y = y1 + (_depth - text.bbox().height) / 2;
    text.move(x, y);
  }
}

function drawLeftOpen() {
  drawTri(_startx - 15, _starty + 25);
}

function drawRightOpen() {
  drawTri(_startx + _length + 10, _starty + _depth / 2);
}

function drawLengthMarker(length) {
  const d1 = s(12),
    d2 = 5,
    d3 = 5;
  const fontsize = s(1);
  const text = draw
    .text(String(length))
    .font({ family: "DFKai-sb", size: fontsize, anchor: "middle" });
  const tw = text.bbox().width,
    th = text.bbox().height;
  text.move(_startx + (length - tw) / 2, _starty - d1 - th);
  draw
    .line(
      _startx,
      _starty - d1 - th / 2 - d2,
      _startx,
      _starty - d1 - th / 2 + d2,
    )
    .stroke({ width: 1, color: "black" });
  draw
    .line(
      _startx + length,
      _starty - d1 - th / 2 - d2,
      _startx + length,
      _starty - d1 - th / 2 + d2,
    )
    .stroke({ width: 1, color: "black" });
  draw
    .line(
      _startx,
      _starty - d1 - th / 2,
      _startx + (length - tw) / 2 - 10,
      _starty - d1 - th / 2,
    )
    .stroke({ width: 1, color: "black" });
  draw
    .line(
      _startx + length,
      _starty - d1 - th / 2,
      _startx + length - (length - tw) / 2 + 10,
      _starty - d1 - th / 2,
    )
    .stroke({ width: 1, color: "black" });
  draw
    .line(
      _startx,
      _starty - d1 - th / 2,
      _startx + d3,
      _starty - d1 - th / 2 - d3,
    )
    .stroke({ width: 1, color: "black" });
  draw
    .line(
      _startx,
      _starty - d1 - th / 2,
      _startx + d3,
      _starty - d1 - th / 2 + d3,
    )
    .stroke({ width: 1, color: "black" });
  draw
    .line(
      _startx + length,
      _starty - d1 - th / 2,
      _startx - d3 + length,
      _starty - d1 - th / 2 - d3,
    )
    .stroke({ width: 1, color: "black" });
  draw
    .line(
      _startx + length,
      _starty - d1 - th / 2,
      _startx - d3 + length,
      _starty - d1 - th / 2 + d3,
    )
    .stroke({ width: 1, color: "black" });
}

function drawSink(sinkObj) {
  const { center, sinkLength: sl, sinkDepth: sd, R: radius, dig } = sinkObj;
  const xp = _startx + center - sl / 2,
    yp = _starty + _depth - dig - sd;
  const g = draw.group();
  const cr = 20;
  g.add(
    draw
      .circle(cr)
      .stroke({ width: 1, color: "black" })
      .fill("none")
      .move((sl - cr) / 2, (sd - cr) / 2),
  );
  g.add(
    draw
      .rect(sl, sd)
      .radius(radius)
      .stroke({ width: 1, color: "black" })
      .fill("none"),
  );
  g.move(xp, yp);
  _drawSinkLabel(center, "水中" + center);
}

function drawSinkLeft(sinkObj) {
  const { center, sinkLength: sl, sinkDepth: sd, R: radius, dig } = sinkObj;
  const xp = _startx + center,
    yp = _starty + _depth - dig - sd;
  const g = draw.group();
  const cr = 20;
  g.add(
    draw
      .circle(cr)
      .stroke({ width: 1, color: "black" })
      .fill("none")
      .move((sl - cr) / 2, (sd - cr) / 2),
  );
  g.add(
    draw
      .rect(sl, sd)
      .radius(radius)
      .stroke({ width: 1, color: "black" })
      .fill("none"),
  );
  g.move(xp, yp);
  _drawSinkLabel(center, "水左開" + center);
}

function drawSinkRight(sinkObj) {
  const { center, sinkLength: sl, sinkDepth: sd, R: radius, dig } = sinkObj;
  const xp = _startx + _length - center - sl,
    yp = _starty + _depth - dig - sd;
  const g = draw.group();
  const cr = 20;
  g.add(
    draw
      .circle(cr)
      .stroke({ width: 1, color: "black" })
      .fill("none")
      .move((sl - cr) / 2, (sd - cr) / 2),
  );
  g.add(
    draw
      .rect(sl, sd)
      .radius(radius)
      .stroke({ width: 1, color: "black" })
      .fill("none"),
  );
  g.move(xp, yp);
  // 右開：從右側量起
  const d4 = s(10),
    d5 = s(11);
  draw
    .line(
      _startx + _length,
      _starty - d4,
      _startx + _length - center,
      _starty - d4,
    )
    .stroke({ width: 1, color: "black" });
  draw
    .line(
      _startx + _length - center,
      _starty - d4,
      _startx + _length - center,
      _starty - d4 / 2,
    )
    .stroke({ width: 1, color: "black" });
  const wt = draw
    .text("水右開" + center)
    .font({ family: "DFKai-sb", size: s(2) })
    .stroke({ width: 0.5, color: "black" });
  wt.move(
    _startx + _length - center - wt.bbox().width / 2,
    _starty - d5 - wt.bbox().height,
  );
}

function _drawSinkLabel(center, label) {
  const d4 = s(10),
    d5 = s(11);
  draw
    .line(_startx, _starty - d4, _startx + center, _starty - d4)
    .stroke({ width: 1, color: "black" });
  draw
    .line(_startx + center, _starty - d4, _startx + center, _starty - d4 / 2)
    .stroke({ width: 1, color: "black" });
  const wt = draw
    .text(label)
    .font({ size: s(2), family: "DFKai-sb" })
    .stroke({ width: 0.5, color: "black" });
  wt.move(
    _startx + center - wt.bbox().width / 2,
    _starty - d5 - wt.bbox().height,
  );
}

function _drawStoveShape(stoveObj, xp, yp) {
  const { stoveLength: sl, stoveDepth: sd, R: radius } = stoveObj;
  const cr = 15,
    cr2 = 4;
  const g = draw.group();
  g.add(draw.circle(cr2).move(sl / 2 - cr2 - 3, ((sd - cr2) / 6) * 5));
  g.add(draw.circle(cr2).move(sl / 2 + 3, ((sd - cr2) / 6) * 5));
  g.add(
    draw
      .circle(cr)
      .stroke({ width: 1, color: "black" })
      .fill("none")
      .move(((sl - cr) / 5) * 4, (sd - cr) / 2),
  );
  g.add(
    draw
      .circle(cr)
      .stroke({ width: 1, color: "black" })
      .fill("none")
      .move((sl - cr) / 5, (sd - cr) / 2),
  );
  g.add(
    draw
      .rect(sl, sd)
      .radius(radius)
      .stroke({ width: 1, color: "black" })
      .fill("none"),
  );
  g.move(xp, yp);
}

function drawStove(stoveObj) {
  const xp = _startx + stoveObj.dis - stoveObj.stoveLength / 2;
  const yp = _starty + _depth - stoveObj.dig - stoveObj.stoveDepth;
  _drawStoveShape(stoveObj, xp, yp);
  _drawSinkLabel(stoveObj.dis, "爐中" + stoveObj.dis);
}

function drawStoveLeft(stoveObj) {
  const xp = _startx + stoveObj.dis;
  const yp = _starty + _depth - stoveObj.dig - stoveObj.stoveDepth;
  _drawStoveShape(stoveObj, xp, yp);
  _drawSinkLabel(stoveObj.dis, "爐左開" + stoveObj.dis);
}

function drawStoveRight(stoveObj) {
  const xp = _startx + _length - stoveObj.dis - stoveObj.stoveLength;
  const yp = _starty + _depth - stoveObj.dig - stoveObj.stoveDepth;
  _drawStoveShape(stoveObj, xp, yp);
  const d4 = s(10),
    d5 = s(11);
  draw
    .line(
      _startx + _length,
      _starty - d4,
      _startx + _length - stoveObj.dis,
      _starty - d4,
    )
    .stroke({ width: 1, color: "black" });
  draw
    .line(
      _startx + _length - stoveObj.dis,
      _starty - d4,
      _startx + _length - stoveObj.dis,
      _starty - d4 / 2,
    )
    .stroke({ width: 1, color: "black" });
  const wt = draw
    .text("爐右開" + stoveObj.dis)
    .font({ family: "DFKai-sb", size: s(2) })
    .stroke({ width: 0.5, color: "black" });
  wt.move(
    _startx + _length - stoveObj.dis - wt.bbox().width / 2,
    _starty - d5 - wt.bbox().height,
  );
}

function drawBackStop() {
  draw
    .line(_startx, _starty + 2, _startx + _length, _starty + 2)
    .stroke({ width: 1, color: "black" });
}

function drawLeftWall(x1, y1, _x2, y2) {
  for (let i = y1; i <= y2 - 10; i += 10) {
    draw.line(x1 - 3, i, x1, i + 10).stroke({ width: 0.3, color: "black" });
  }
  const text = draw
    .text("牆")
    .font({ size: s(3) })
    .stroke({ color: "black", width: 0.3 });
  text.move(
    x1 - s(4) - text.bbox().width,
    y1 + (_depth - text.bbox().height) / 2,
  );
}

function drawRightWall(x1, y1, _x2, y2) {
  for (let i = y1; i <= y2 - 10; i += 10) {
    draw.line(x1 + 3, i + 10, x1, i).stroke({ width: 0.3, color: "black" });
  }
  const text = draw
    .text("牆")
    .font({ size: s(3) })
    .stroke({ color: "black", width: 0.3 });
  text.move(x1 + s(7), y1 + (_depth - text.bbox().height) / 2);
}

function drawWall(x1, y1, x2, _y2) {
  for (let i = x1; i < x2 - 10; i += 10) {
    draw.line(i, y1, i + 10, y1 - 3).stroke({ width: 0.3, color: "black" });
  }
}

function drawTriangleWithDiamond(x, y, size) {
  draw
    .polygon([
      [x, y - size / 2],
      [x + size / 2, y + size / 2],
      [x - size / 2, y + size / 2],
    ])
    .fill("none")
    .stroke({ width: 1, color: "black" });
  const ds = size / Math.sqrt(3);
  const diamond = draw
    .polygon([
      [x, y - ds / 2],
      [x + ds / 2, y],
      [x, y + ds / 2],
      [x - ds / 2, y],
    ])
    .fill("black");
  diamond.center(x, y + size / 6);
}

function drawTri(x, y) {
  draw.polygon("15,5 10,15 20,15").fill("black").move(x, y);
}

function drawdiamond(x, y, size) {
  draw
    .polygon([
      x,
      y - size / 2,
      x + size / 2,
      y,
      x,
      y + size / 2,
      x - size / 2,
      y,
    ])
    .fill("black");
}

function drawBoxes(boxList, depth, sx, sy) {
  let x = sx;
  for (const w of boxList) {
    drawBox(w, depth, x, sy);
    x += w;
  }
  draw
    .rect(_length, depth)
    .stroke({ color: "black", width: 1 })
    .fill("none")
    .move(sx, sy);
}

function drawBox(rectWidth, depth, sx, sy) {
  draw
    .rect(rectWidth, depth)
    .move(sx, sy)
    .stroke({ color: "black", opacity: 0.1 })
    .attr({ "stroke-dasharray": "1, 5" })
    .fill("none");
  const text = draw
    .text(String(rectWidth))
    .font({ size: 6, family: "DFKai-sb", anchor: "start" })
    .fill("black");
  text.move(
    sx + (rectWidth - text.bbox().width) / 2,
    sy + text.bbox().height / 2 + depth,
  );
}

function drawPoint(points, color) {
  let path = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    path += ` L ${points[i].x} ${points[i].y}`;
    draw.path(path).fill("none").stroke({ width: 0.5, color });
  }
}

function drawFrontEnd(type, depth, thick, x0, y0) {
  const st = _slabThick;
  drawPoint(
    [
      { x: x0, y: y0 },
      { x: x0 + depth, y: y0 },
      { x: x0 + depth, y: thick + y0 },
      { x: x0 + depth - st, y: thick + y0 },
      { x: x0 + depth - st, y: y0 + st },
      { x: x0 + depth, y: y0 },
    ],
    "red",
  );
  drawPoint(
    [
      { x: x0, y: y0 },
      { x: x0, y: y0 + st },
      { x: x0 + depth - st, y: y0 + st },
    ],
    "red",
  );

  if (type === "normal") {
    drawPoint(
      [
        { x: x0, y: y0 + thick },
        { x: x0 + depth - thick - st, y: y0 + thick },
        { x: x0 + depth - thick - st, y: y0 + thick - st },
        { x: x0 + depth - st, y: y0 + thick - st },
        { x: x0 + depth - st, y: y0 + thick },
        { x: x0 + depth - thick - st, y: y0 + thick },
      ],
      "blue",
    );
    drawPoint(
      [
        { x: x0 + depth - thick - st, y: y0 + st },
        { x: x0 + depth - thick - st, y: y0 + thick - st },
      ],
      "blue",
    );
    drawPoint(
      [
        { x: x0 + depth - thick, y: y0 + st },
        { x: x0 + depth - thick, y: y0 + thick - st },
      ],
      "blue",
    );
    for (let i = 0; i < depth - 5; i += 5) {
      draw
        .line(x0 + i, y0 + st, x0 + i + 5, y0 + thick)
        .stroke({ color: "blue", width: 0.5 });
    }
  }

  if (type === "cleanUp" || type === "tarkala") {
    const ls = leaveSpace.value;
    if (thick < ls + st)
      alert(
        "請重新考慮枱面厚度或更換板材厚度 --> 不套板空間+板材厚度 > 枱面厚度",
      );
    drawPoint(
      [
        { x: x0, y: y0 + thick - ls },
        { x: x0 + depth - st, y: y0 + thick - ls },
      ],
      "blue",
    );
    draw
      .text(String(ls))
      .font({ size: 8 })
      .stroke({ width: 0.5, color: "black" })
      .move(x0 + depth - 20, y0 + 5);
    for (let i = 0; i < depth - st - 5; i += 5) {
      draw
        .line(x0 + i, y0 + st, x0 + i + 5, y0 + thick - ls)
        .stroke({ color: "blue", width: 0.5 });
    }
    if (type === "tarkala") {
      drawPoint(
        [
          { x: x0 + depth - st, y: y0 + thick },
          { x: x0 + depth - 3, y: y0 + thick },
          { x: x0 + depth - 3, y: y0 + thick - st },
          { x: x0 + depth - st, y: y0 + thick - st },
        ],
        "blue",
      );
      draw
        .text("3")
        .font({ size: 8 })
        .stroke({ width: 0.3, color: "black" })
        .move(x0 + depth - 3, y0 + thick);
    }
  }

  const r = backHeight.value;
  if (r && backstop.value) {
    draw.line(x0, y0, x0, y0 - r).stroke({ width: 1, color: "black" });
    draw
      .line(x0, y0 - r, x0 + st, y0 - r)
      .stroke({ width: 0.5, color: "black" });
    draw
      .line(x0 + st, y0 - r, x0 + st, y0)
      .stroke({ width: 0.5, color: "black" });
    draw
      .text(String(r))
      .stroke({ width: 0.5, color: "black" })
      .font({ size: 10 })
      .move(x0 - 15, y0 - 10);
  } else {
    draw
      .text("免背牆")
      .stroke({ width: 0.5, color: "black" })
      .font({ size: 8 })
      .attr("writing-mode", "tb")
      .move(x0 - 15, y0 - 10);
  }
  draw
    .text(String(depth))
    .stroke({ width: 0.5, color: "black" })
    .font({ size: 10 })
    .move(x0 + depth / 2 - 10, y0 - 10);
  draw
    .text(String(thick))
    .stroke({ width: 0.5, color: "black" })
    .font({ size: 10 })
    .move(x0 + depth + 10, y0 - 5);
}

function cutline() {
  const ltl = parseFloat(connectValue.value);
  const h = _depth;
  const x1 = _startx + ltl,
    y1 = _starty;
  const x2 = _startx + ltl,
    y2 = _starty + h + 15;
  draw.line(x1, y1, x2, y2).stroke({ width: 1, color: "black" });
  const x3 = _startx + ltl - 30,
    y3 = _starty + h + 15;
  draw.line(x2, y2, x3, y3).stroke({ width: 1, color: "black" });
  draw.line(x3 + 3, y3 + 2, x3, y3).stroke({ width: 1, color: "black" });
  draw.line(x3 + 3, y3 - 2, x3, y3).stroke({ width: 1, color: "black" });
  draw
    .text(String(ltl))
    .move(x3 + 5, y3)
    .font({ size: 10, fill: "black" });
  const x6 = _startx + ltl + 30,
    y6 = _starty + h + 15;
  draw.line(x6, y6, x2, y2).stroke({ width: 1, color: "black" });
  draw.line(x6 - 3, y6 + 2, x6, y6).stroke({ width: 1, color: "black" });
  draw.line(x6 - 3, y6 - 2, x6, y6).stroke({ width: 1, color: "black" });
  draw
    .text(String(_length - ltl))
    .move(x2 + 5, y3)
    .font({ size: 10, fill: "black" });
}

// ─── 水槽資料（從 API 取得）──────────────────────────────────
async function getSinkData() {
  try {
    const sinkApiUrl = import.meta.env.DEV
      ? "/legacy-draw-api/getSink.php"
      : "https://junchengstone.synology.me/draw/getSink.php";
    const res = await fetch(sinkApiUrl);
    if (!res.ok) throw new Error("Network error");
    const data = await res.text();
    const nrows = [];
    for (const row of data.split("\n")) {
      const sstart = row.indexOf("(") + 1;
      const send = row.indexOf(")");
      let name = row.substring(send + 1, row.length - 4);
      if (name[0] === "-") name = name.substring(1, name.length - 1);
      if (name.trim() && name.trim().length > 1) {
        const dim = row.substring(sstart, send);
        if (dim.toLowerCase().includes("x")) {
          nrows.push([name.trim().toUpperCase(), dim.toUpperCase()]);
        }
      }
    }
    nrows.sort((a, b) => a[0].toLowerCase().localeCompare(b[0].toLowerCase()));
    sinkOptions.value = nrows.map((r) => ({ text: r[0], value: r[1] }));
  } catch (e) {
    console.error("getSinkData error:", e);
  }
}

function _putSinkData(optionValue, sinkObj) {
  const parts = optionValue.toUpperCase().split("X");
  const w = parseFloat(parts[0]) / 10;
  const right = parts[1] || "";
  let d = 0,
    r = 0;
  if (right.includes("R")) {
    d = parseFloat(right.split("R")[0]) / 10;
    r = parseFloat(right.split("R")[1]) / 10;
  } else {
    d = parseInt(right) / 10;
  }
  sinkObj.sinkLength = w;
  sinkObj.sinkDepth = d;
  sinkObj.R = r;
  sinkObj.showText = optionValue;
  redraw();
}

function onSink1SelectChange() {
  if (sink1.selectValue) _putSinkData(sink1.selectValue, sink1);
}
function onSink2SelectChange() {
  if (sink2.selectValue) _putSinkData(sink2.selectValue, sink2);
}
function onSink1SearchInput() {
  const val = sink1.searchName.toUpperCase();
  const found = sinkOptions.value.find(
    (o) => o.text === val || o.text.includes(val),
  );
  if (found) {
    sink1.selectValue = found.value;
    _putSinkData(found.value, sink1);
  }
}
function onSink2SearchInput() {
  const val = sink2.searchName.toUpperCase();
  const found = sinkOptions.value.find(
    (o) => o.text === val || o.text.includes(val),
  );
  if (found) {
    sink2.selectValue = found.value;
    _putSinkData(found.value, sink2);
  }
}

// ─── 設定存取（改用 localStorage 取代 cookie）─────────────────
function saveSettings(n) {
  const data = {};
  for (const k of [1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 16, 17, 18])
    data[k] = settings[k];
  localStorage.setItem(`drawing-settings-${n}`, JSON.stringify(data));
  alert(`設定${n}存檔完成`);
}
function loadSettings(n) {
  const raw = localStorage.getItem(`drawing-settings-${n}`);
  if (!raw) return;
  const data = JSON.parse(raw);
  for (const k of Object.keys(data)) settings[parseInt(k)] = data[k];
  redraw();
}
</script>

<style scoped>
/* 覆蓋全域 input/select width:100% */
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
  padding: 8px;
  font-size: 14px;
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
.active {
  color: red;
}
.cal-area {
  display: inline-block;
  background-color: white;
  width: 600px;
  min-height: 100px;
}
</style>
