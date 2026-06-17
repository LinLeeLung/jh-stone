<template>
  <div class="drawing-page">
    <!-- 儲存列 -->
    <div class="save-bar">
      <template v-if="orderId">
        <button class="btn-save" :disabled="saving" @click="saveDrawing">
          {{ saving ? "儲存中…" : "💾 儲存繪圖" }}
        </button>
        <span v-if="saveMsg" class="save-msg">{{ saveMsg }}</span>
      </template>
      <button class="btn-img" @click="imgInputRef.click()">📷 插入截圖</button>
      <input
        ref="imgInputRef"
        type="file"
        accept="image/*"
        style="display: none"
        @change="onImgFile"
      />
      <span class="img-hint"
        >（可 Ctrl+V 貼上｜拖曳移動｜右下角縮放｜雙擊刪除）</span
      >
      <button class="btn-img" @click="showSetUp = !showSetUp">
        {{ showSetUp ? "收合設定" : "設定" }}
      </button>
    </div>

    <!-- 中間桶身（橫向） -->
    <div class="row">
      <strong>中間</strong>桶身
      <input
        v-for="i in 7"
        :key="'M' + i"
        type="number"
        v-model.number="midCabins[i - 1]"
        class="number"
        @change="redraw"
      />
      深度<input
        type="number"
        v-model.number="midDepth"
        class="number"
        @change="redraw"
      />
      中凸<input
        type="number"
        v-model.number="midPlus"
        class="number"
        @change="redraw"
      />
      <button @click="toggleMidCut">
        {{ midCutToggled ? "取消接線" : "接線左起" }}
      </button>
      <input
        type="number"
        v-model.number="midConnect"
        class="number"
        @change="redraw"
      />
      <button @click="clearMid">清空中間</button>
    </div>

    <!-- 左側桶身（直向下） -->
    <div class="row">
      <strong>左側</strong>桶身
      <input
        v-for="i in 7"
        :key="'LA' + i"
        type="number"
        v-model.number="leftArmCabins[i - 1]"
        class="number"
        @change="redraw"
      />
      深度<input
        type="number"
        v-model.number="leftArmDepth"
        class="number"
        @change="redraw"
      />
      左凸<input
        type="number"
        v-model.number="leftArmPlus"
        class="number"
        @change="redraw"
      />
      <button @click="toggleLeftArmCut">
        {{ leftArmCutToggled ? "取消左側接線" : "左側接線上起" }}
      </button>
      <input
        type="number"
        v-model.number="leftArmConnect"
        class="number"
        @change="redraw"
      />
      <button @click="clearLeftArm">清空左側</button>
    </div>

    <!-- 右側桶身（直向下） -->
    <div class="row">
      <strong>右側</strong>桶身
      <input
        v-for="i in 7"
        :key="'RA' + i"
        type="number"
        v-model.number="rightArmCabins[i - 1]"
        class="number"
        @change="redraw"
      />
      深度<input
        type="number"
        v-model.number="rightArmDepth"
        class="number"
        @change="redraw"
      />
      右凸<input
        type="number"
        v-model.number="rightArmPlus"
        class="number"
        @change="redraw"
      />
      <button @click="toggleRightArmCut">
        {{ rightArmCutToggled ? "取消右側接線" : "右側接線上起" }}
      </button>
      <input
        type="number"
        v-model.number="rightArmConnect"
        class="number"
        @change="redraw"
      />
      <button @click="clearRightArm">清空右側</button>
    </div>

    <!-- 三段水槽/火爐並排 -->
    <div class="sections-row">
      <!-- 中間水槽/火爐 -->
      <div class="section">
        <div class="section-title">中間 水槽 / 火爐</div>
        <div class="row" v-for="(s, idx) in midSinks" :key="'ms' + idx">
          <input type="checkbox" v-model="s.enabled" @change="redraw" />水槽{{
            idx + 1
          }}
          <label
            ><input
              type="radio"
              value="水中"
              v-model="s.position"
              @change="redraw"
            />水中</label
          >
          <label
            ><input
              type="radio"
              value="左開"
              v-model="s.position"
              @change="redraw"
            />左開</label
          >
          <label
            ><input
              type="radio"
              value="右開"
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
        <div class="row" v-for="(s, idx) in midStoves" :key="'mst' + idx">
          <input type="checkbox" v-model="s.enabled" @change="redraw" />火爐{{
            idx + 1
          }}
          <label
            ><input
              type="radio"
              value="火中"
              v-model="s.position"
              @change="redraw"
            />火中</label
          >
          <label
            ><input
              type="radio"
              value="左開"
              v-model="s.position"
              @change="redraw"
            />左開</label
          >
          <label
            ><input
              type="radio"
              value="右開"
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

      <!-- 左側水槽/火爐 -->
      <div class="section">
        <div class="section-title">左側 水槽 / 火爐</div>
        <div class="row" v-for="(s, idx) in leftArmSinks" :key="'las' + idx">
          <input type="checkbox" v-model="s.enabled" @change="redraw" />水槽{{
            idx + 1
          }}
          <label
            ><input
              type="radio"
              value="水中"
              v-model="s.position"
              @change="redraw"
            />水中</label
          >
          <label
            ><input
              type="radio"
              value="上開"
              v-model="s.position"
              @change="redraw"
            />上開</label
          >
          <label
            ><input
              type="radio"
              value="下開"
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
        <div class="row" v-for="(s, idx) in leftArmStoves" :key="'last' + idx">
          <input type="checkbox" v-model="s.enabled" @change="redraw" />火爐{{
            idx + 1
          }}
          <label
            ><input
              type="radio"
              value="火中"
              v-model="s.position"
              @change="redraw"
            />火中</label
          >
          <label
            ><input
              type="radio"
              value="上開"
              v-model="s.position"
              @change="redraw"
            />上開</label
          >
          <label
            ><input
              type="radio"
              value="下開"
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

      <!-- 右側水槽/火爐 -->
      <div class="section section-right">
        <div class="section-title">右側 水槽 / 火爐</div>
        <div class="row" v-for="(s, idx) in rightArmSinks" :key="'ras' + idx">
          <input type="checkbox" v-model="s.enabled" @change="redraw" />水槽{{
            idx + 1
          }}
          <label
            ><input
              type="radio"
              value="水中"
              v-model="s.position"
              @change="redraw"
            />水中</label
          >
          <label
            ><input
              type="radio"
              value="上開"
              v-model="s.position"
              @change="redraw"
            />上開</label
          >
          <label
            ><input
              type="radio"
              value="下開"
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
        <div class="row" v-for="(s, idx) in rightArmStoves" :key="'rast' + idx">
          <input type="checkbox" v-model="s.enabled" @change="redraw" />火爐{{
            idx + 1
          }}
          <label
            ><input
              type="radio"
              value="火中"
              v-model="s.position"
              @change="redraw"
            />火中</label
          >
          <label
            ><input
              type="radio"
              value="上開"
              v-model="s.position"
              @change="redraw"
            />上開</label
          >
          <label
            ><input
              type="radio"
              value="下開"
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
    </div>
    <!-- end sections-row -->

    <!-- 周邊設定 -->
    <div class="settings">
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
      </div>
      <div class="row">
        左側：
        <label
          ><input
            type="radio"
            value="左靠牆"
            v-model="leftSideEnd"
            @change="redraw"
          />左靠牆</label
        >
        <label
          ><input
            type="radio"
            value="左見光"
            v-model="leftSideEnd"
            @change="redraw"
          />左見光</label
        >
        <label
          ><input
            type="checkbox"
            v-model="leftSideBackstop"
            @change="redraw"
          />背牆</label
        >
      </div>
      <div class="row">
        左下端：
        <label
          ><input
            type="radio"
            value="左靠牆"
            v-model="leftBottomEnd"
            @change="redraw"
          />左靠牆</label
        >
        <label
          ><input
            type="radio"
            value="左見光"
            v-model="leftBottomEnd"
            @change="redraw"
          />左見光</label
        >
        <label
          ><input
            type="radio"
            value="左靠側板"
            v-model="leftBottomEnd"
            @change="redraw"
          />左靠側板</label
        >
        <label
          ><input
            type="radio"
            value="左齊桶身側板"
            v-model="leftBottomEnd"
            @change="redraw"
          />齊桶身側板</label
        >
        <label
          ><input
            type="radio"
            value="左靠櫃"
            v-model="leftBottomEnd"
            @change="redraw"
          />左靠櫃</label
        >
        側板/櫃深<input
          type="number"
          v-model.number="leftBottomEndDepth"
          class="number"
          @change="redraw"
        />
      </div>
      <div class="row">
        右側：
        <label
          ><input
            type="radio"
            value="右靠牆"
            v-model="rightSideEnd"
            @change="redraw"
          />右靠牆</label
        >
        <label
          ><input
            type="radio"
            value="右見光"
            v-model="rightSideEnd"
            @change="redraw"
          />右見光</label
        >
        <label
          ><input
            type="checkbox"
            v-model="rightSideBackstop"
            @change="redraw"
          />背牆</label
        >
      </div>
      <div class="row">
        右下端：
        <label
          ><input
            type="radio"
            value="右靠牆"
            v-model="rightBottomEnd"
            @change="redraw"
          />右靠牆</label
        >
        <label
          ><input
            type="radio"
            value="右見光"
            v-model="rightBottomEnd"
            @change="redraw"
          />右見光</label
        >
        <label
          ><input
            type="radio"
            value="右靠側板"
            v-model="rightBottomEnd"
            @change="redraw"
          />右靠側板</label
        >
        <label
          ><input
            type="radio"
            value="右齊桶身側板"
            v-model="rightBottomEnd"
            @change="redraw"
          />齊桶身側板</label
        >
        <label
          ><input
            type="radio"
            value="右靠櫃"
            v-model="rightBottomEnd"
            @change="redraw"
          />右靠櫃</label
        >
        側板/櫃深<input
          type="number"
          v-model.number="rightBottomEndDepth"
          class="number"
          @change="redraw"
        />
      </div>
      <div class="row">
        背牆高度<input
          type="number"
          v-model.number="backHeight"
          step="0.1"
          class="number"
          @change="redraw"
        />公分 &nbsp;&nbsp;枱面厚度<input
          type="number"
          v-model.number="counterThick"
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

    <!-- 設定面板 -->
    <div v-show="showSetUp" class="settings setup-panel">
      中桶身字<input
        type="number"
        v-model.number="settings.midFont"
        class="number small-number"
        @change="redraw"
      />
      左桶身字<input
        type="number"
        v-model.number="settings.leftFont"
        class="number small-number"
        @change="redraw"
      />
      右桶身字<input
        type="number"
        v-model.number="settings.rightFont"
        class="number small-number"
        @change="redraw"
      />
      總長字<input
        type="number"
        v-model.number="settings.lengthFont"
        class="number small-number"
        @change="redraw"
      />
      深度字<input
        type="number"
        v-model.number="settings.depthFont"
        class="number small-number"
        @change="redraw"
      />
      水中爐中字<input
        type="number"
        v-model.number="settings.openingFont"
        class="number small-number"
        @change="redraw"
      />
      接線字<input
        type="number"
        v-model.number="settings.connectFont"
        class="number small-number"
        @change="redraw"
      />
      上標線距<input
        type="number"
        v-model.number="settings.topMarkerGap"
        class="number small-number"
        @change="redraw"
      />
      左標線距<input
        type="number"
        v-model.number="settings.leftMarkerGap"
        class="number small-number"
        @change="redraw"
      />
      右標線距<input
        type="number"
        v-model.number="settings.rightMarkerGap"
        class="number small-number"
        @change="redraw"
      />
      下深度距<input
        type="number"
        v-model.number="settings.armDepthGap"
        class="number small-number"
        @change="redraw"
      />
      中分段字距<input
        type="number"
        v-model.number="settings.midCabinLabelGap"
        class="number small-number"
        @change="redraw"
      />
      左分段字距<input
        type="number"
        v-model.number="settings.leftCabinLabelGap"
        class="number small-number"
        @change="redraw"
      />
      右分段字距<input
        type="number"
        v-model.number="settings.rightCabinLabelGap"
        class="number small-number"
        @change="redraw"
      />
      上水爐字距<input
        type="number"
        v-model.number="settings.openingTopGap"
        class="number small-number"
        @change="redraw"
      />
      左水爐字距<input
        type="number"
        v-model.number="settings.openingLeftGap"
        class="number small-number"
        @change="redraw"
      />
      右水爐字距<input
        type="number"
        v-model.number="settings.openingRightGap"
        class="number small-number"
        @change="redraw"
      />
      <button @click="saveSettings(1)">存設定1</button>
      <button @click="saveSettings(2)">存設定2</button>
      <button @click="saveSettings(3)">存設定3</button>
      <button @click="loadSettings(1)">取設定1</button>
      <button @click="loadSettings(2)">取設定2</button>
      <button @click="loadSettings(3)">取設定3</button>
    </div>

    <!-- SVG 畫布 + 圖片疊層 -->
    <div
      class="img-canvas"
      ref="imgCanvasRef"
      @mousemove="onImgMouseMove"
      @mouseup="onImgMouseUp"
      @mouseleave="onImgMouseUp"
    >
      <div ref="svgContainerRef" class="svg-container"></div>
      <div
        v-for="img in overlayImages"
        :key="img.id"
        class="o-img"
        :style="{ left: img.x + 'px', top: img.y + 'px', width: img.w + 'px' }"
        @mousedown.stop="startImgDrag($event, img)"
        @dblclick.stop="removeImg(img.id)"
      >
        <img
          :src="img.src"
          style="width: 100%; display: block; pointer-events: none"
        />
        <div
          class="o-img-rh"
          @mousedown.stop="startImgResize($event, img)"
        ></div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, onUnmounted } from "vue";
import { SVG } from "@svgdotjs/svg.js";
import { updateOrderDrawing, uploadOverlayImage } from "../../firebase";

const props = defineProps({
  orderId: { type: String, default: null },
  drawingId: { type: String, default: null },
  savedState: { type: Object, default: null },
  order: { type: Object, default: null },
});

const saving = ref(false);
const saveMsg = ref("");
const savedSignature = ref("");
const showSetUp = ref(false);

const svgContainerRef = ref(null);
let draw = null;

// ─── 桶身 ────────────────────────────────────────────────
const midCabins = ref([90, 30, 90, 60, null, null, null]);
const midDepth = ref(60);
const midPlus = ref(null);
const midConnect = ref(null);
const midCutToggled = ref(false);

const leftArmCabins = ref([90, null, null, null, null, null, null]);
const leftArmDepth = ref(60);
const leftArmPlus = ref(null);
const leftArmConnect = ref(null);
const leftArmCutToggled = ref(false);

const rightArmCabins = ref([90, null, null, null, null, null, null]);
const rightArmDepth = ref(60);
const rightArmPlus = ref(null);
const rightArmConnect = ref(null);
const rightArmCutToggled = ref(false);

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

const midSinks = [makeSink(true, "水中", 45), makeSink(false, "水中", 0)];
const midStoves = [makeStove(false, "火中", 165), makeStove(false, "火中", 0)];
const leftArmSinks = [makeSink(false, "水中", 45), makeSink(false, "水中", 0)];
const leftArmStoves = [
  makeStove(false, "火中", 45),
  makeStove(false, "火中", 0),
];
const rightArmSinks = [makeSink(false, "水中", 45), makeSink(false, "水中", 0)];
const rightArmStoves = [
  makeStove(false, "火中", 45),
  makeStove(false, "火中", 0),
];

// ─── 周邊 ────────────────────────────────────────────────
const backOption = ref("後靠牆");
const backstop = ref(false);
const backHeight = ref(4);
const counterThick = ref(4);
const leftSideEnd = ref("左靠牆");
const leftSideBackstop = ref(false);
const rightSideEnd = ref("右靠牆");
const rightSideBackstop = ref(false);
const leftBottomEnd = ref("左靠牆");
const leftBottomEndDepth = ref(null);
const rightBottomEnd = ref("右靠牆");
const rightBottomEndDepth = ref(null);

const settings = reactive({
  midFont: 10,
  leftFont: 10,
  rightFont: 10,
  lengthFont: 16,
  depthFont: 12,
  openingFont: 11,
  connectFont: 10,
  topMarkerGap: 30,
  leftMarkerGap: 50,
  rightMarkerGap: 50,
  armDepthGap: 20,
  midCabinLabelGap: 4,
  leftCabinLabelGap: 10,
  rightCabinLabelGap: 12,
  openingTopGap: 12,
  openingLeftGap: 12,
  openingRightGap: 12,
});

// ─── 截圖插入 ────────────────────────────────────────────
const overlayImages = ref([]);
const imgInputRef = ref(null);
const imgCanvasRef = ref(null);
let _imgDrag = null;
const _pendingOverlayUploads = new Map();

function onImgFile(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => addOverlayImage(ev.target.result);
  reader.readAsDataURL(file);
  e.target.value = "";
}
function addOverlayImage(src) {
  const id = Date.now();
  overlayImages.value.push({ id, src, x: 20, y: 20, w: 320 });
  if (!props.orderId) return;
  const p = uploadOverlayImage(props.orderId, src)
    .then((url) => {
      const img = overlayImages.value.find((i) => i.id === id);
      if (img) img.src = url;
    })
    .catch((e) => console.warn("截圖上傳失敗", e))
    .finally(() => _pendingOverlayUploads.delete(id));
  _pendingOverlayUploads.set(id, p);
}
function removeImg(id) {
  overlayImages.value = overlayImages.value.filter((i) => i.id !== id);
}
function startImgDrag(e, img) {
  _imgDrag = {
    img,
    type: "drag",
    startX: e.clientX,
    startY: e.clientY,
    origX: img.x,
    origY: img.y,
  };
  e.preventDefault();
}
function startImgResize(e, img) {
  _imgDrag = { img, type: "resize", startX: e.clientX, origW: img.w };
  e.preventDefault();
}
function onImgMouseMove(e) {
  if (!_imgDrag) return;
  if (_imgDrag.type === "drag") {
    _imgDrag.img.x = _imgDrag.origX + (e.clientX - _imgDrag.startX);
    _imgDrag.img.y = _imgDrag.origY + (e.clientY - _imgDrag.startY);
  } else {
    _imgDrag.img.w = Math.max(
      60,
      _imgDrag.origW + (e.clientX - _imgDrag.startX),
    );
  }
}
function onImgMouseUp() {
  _imgDrag = null;
}
function onPaste(e) {
  const items = e.clipboardData?.items;
  if (!items) return;
  for (const item of items) {
    if (item.type.startsWith("image/")) {
      const blob = item.getAsFile();
      const reader = new FileReader();
      reader.onload = (ev) => addOverlayImage(ev.target.result);
      reader.readAsDataURL(blob);
      break;
    }
  }
}

// ─── 繪圖常數 ────────────────────────────────────────────
// M 型佈局：
//   中間（橫向）：從 (x0, y0) 向右，深度 h 向下
//   左側（直向）：從 (x0, y0) 向下，深度 hM 向右
//   右側（直向）：從 (x0+w-hL, y0) 向下，深度 hL 向右
const ORIGIN_X = 160;
const ORIGIN_Y = 120;

// ─── 狀態快照 ─────────────────────────────────────────────
function getSnapshot() {
  return {
    midCabins: [...midCabins.value],
    midDepth: midDepth.value,
    midPlus: midPlus.value,
    midConnect: midConnect.value,
    midCutToggled: midCutToggled.value,
    leftArmCabins: [...leftArmCabins.value],
    leftArmDepth: leftArmDepth.value,
    leftArmPlus: leftArmPlus.value,
    leftArmConnect: leftArmConnect.value,
    leftArmCutToggled: leftArmCutToggled.value,
    rightArmCabins: [...rightArmCabins.value],
    rightArmDepth: rightArmDepth.value,
    rightArmPlus: rightArmPlus.value,
    rightArmConnect: rightArmConnect.value,
    rightArmCutToggled: rightArmCutToggled.value,
    backOption: backOption.value,
    backstop: backstop.value,
    backHeight: backHeight.value,
    counterThick: counterThick.value,
    leftSideEnd: leftSideEnd.value,
    leftSideBackstop: leftSideBackstop.value,
    rightSideEnd: rightSideEnd.value,
    rightSideBackstop: rightSideBackstop.value,
    leftBottomEnd: leftBottomEnd.value,
    leftBottomEndDepth: leftBottomEndDepth.value,
    rightBottomEnd: rightBottomEnd.value,
    rightBottomEndDepth: rightBottomEndDepth.value,
    midSinks: midSinks.map((s) => ({ ...s })),
    midStoves: midStoves.map((s) => ({ ...s })),
    leftArmSinks: leftArmSinks.map((s) => ({ ...s })),
    leftArmStoves: leftArmStoves.map((s) => ({ ...s })),
    rightArmSinks: rightArmSinks.map((s) => ({ ...s })),
    rightArmStoves: rightArmStoves.map((s) => ({ ...s })),
    overlayImages: overlayImages.value.map((i) => ({ ...i })),
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
  if (Array.isArray(snap.midCabins)) midCabins.value = [...snap.midCabins];
  if (snap.midDepth != null) midDepth.value = snap.midDepth;
  if (snap.midPlus != null) midPlus.value = snap.midPlus;
  if (snap.midConnect != null) midConnect.value = snap.midConnect;
  if (snap.midCutToggled != null) midCutToggled.value = snap.midCutToggled;
  if (Array.isArray(snap.leftArmCabins))
    leftArmCabins.value = [...snap.leftArmCabins];
  if (snap.leftArmDepth != null) leftArmDepth.value = snap.leftArmDepth;
  if (snap.leftArmPlus != null) leftArmPlus.value = snap.leftArmPlus;
  if (snap.leftArmConnect != null) leftArmConnect.value = snap.leftArmConnect;
  if (snap.leftArmCutToggled != null)
    leftArmCutToggled.value = snap.leftArmCutToggled;
  if (Array.isArray(snap.rightArmCabins))
    rightArmCabins.value = [...snap.rightArmCabins];
  if (snap.rightArmDepth != null) rightArmDepth.value = snap.rightArmDepth;
  if (snap.rightArmPlus != null) rightArmPlus.value = snap.rightArmPlus;
  if (snap.rightArmConnect != null)
    rightArmConnect.value = snap.rightArmConnect;
  if (snap.rightArmCutToggled != null)
    rightArmCutToggled.value = snap.rightArmCutToggled;
  if (snap.backOption != null) backOption.value = snap.backOption;
  if (snap.backstop != null) backstop.value = snap.backstop;
  if (snap.backHeight != null) backHeight.value = snap.backHeight;
  if (snap.counterThick != null) counterThick.value = snap.counterThick;
  if (snap.leftSideEnd != null) leftSideEnd.value = snap.leftSideEnd;
  if (snap.leftSideBackstop != null)
    leftSideBackstop.value = snap.leftSideBackstop;
  if (snap.rightSideEnd != null) rightSideEnd.value = snap.rightSideEnd;
  if (snap.rightSideBackstop != null)
    rightSideBackstop.value = snap.rightSideBackstop;
  if (snap.leftBottomEnd != null) leftBottomEnd.value = snap.leftBottomEnd;
  if (snap.leftBottomEndDepth != null)
    leftBottomEndDepth.value = snap.leftBottomEndDepth;
  if (snap.rightBottomEnd != null) rightBottomEnd.value = snap.rightBottomEnd;
  if (snap.rightBottomEndDepth != null)
    rightBottomEndDepth.value = snap.rightBottomEndDepth;
  if (Array.isArray(snap.overlayImages))
    overlayImages.value = snap.overlayImages.map((i) => ({ ...i }));
  const restoreArr = (snapArr, target) => {
    if (Array.isArray(snapArr))
      snapArr.forEach((s, i) => {
        if (target[i]) Object.assign(target[i], s);
      });
  };
  restoreArr(snap.midSinks, midSinks);
  restoreArr(snap.midStoves, midStoves);
  restoreArr(snap.leftArmSinks, leftArmSinks);
  restoreArr(snap.leftArmStoves, leftArmStoves);
  restoreArr(snap.rightArmSinks, rightArmSinks);
  restoreArr(snap.rightArmStoves, rightArmStoves);
}

function preFillFromOrder(ord) {
  if (!ord) return;
  const s1 = ord.sinks?.[0];
  if (s1) {
    midSinks[0].enabled = true;
    if (s1.holeWidthMm) midSinks[0].sinkLength = s1.holeWidthMm / 10;
    if (s1.holeDepthMm) midSinks[0].sinkDepth = s1.holeDepthMm / 10;
    if (s1.holeRadiusMm) midSinks[0].R = s1.holeRadiusMm / 10;
  }
  const s2 = ord.sinks?.[1];
  if (s2) {
    midSinks[1].enabled = true;
    if (s2.holeWidthMm) midSinks[1].sinkLength = s2.holeWidthMm / 10;
    if (s2.holeDepthMm) midSinks[1].sinkDepth = s2.holeDepthMm / 10;
    if (s2.holeRadiusMm) midSinks[1].R = s2.holeRadiusMm / 10;
  }
}

async function saveDrawing() {
  if (!props.orderId || !props.drawingId) return;
  if (_pendingOverlayUploads.size)
    await Promise.allSettled([..._pendingOverlayUploads.values()]);
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
  document.addEventListener("paste", onPaste);
});
onUnmounted(() => {
  document.removeEventListener("paste", onPaste);
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

function toggleMidCut() {
  midCutToggled.value = !midCutToggled.value;
  redraw();
}
function toggleLeftArmCut() {
  leftArmCutToggled.value = !leftArmCutToggled.value;
  redraw();
}
function toggleRightArmCut() {
  rightArmCutToggled.value = !rightArmCutToggled.value;
  redraw();
}
function clearMid() {
  for (let i = 0; i < midCabins.value.length; i++) midCabins.value[i] = null;
  midPlus.value = null;
  redraw();
}
function clearLeftArm() {
  for (let i = 0; i < leftArmCabins.value.length; i++)
    leftArmCabins.value[i] = null;
  leftArmPlus.value = null;
  redraw();
}
function clearRightArm() {
  for (let i = 0; i < rightArmCabins.value.length; i++)
    rightArmCabins.value[i] = null;
  rightArmPlus.value = null;
  redraw();
}
function clearAll() {
  clearMid();
  clearLeftArm();
  clearRightArm();
}

function saveSettings(n) {
  localStorage.setItem(
    `m-shape-drawing-settings-${n}`,
    JSON.stringify(settings),
  );
  alert(`設定${n}存檔完成`);
}

function loadSettings(n) {
  const raw = localStorage.getItem(`m-shape-drawing-settings-${n}`);
  if (!raw) return;
  Object.assign(settings, JSON.parse(raw));
  redraw();
}

// ─── 主繪圖 ──────────────────────────────────────────────
function redraw() {
  if (!draw) return;
  draw.clear();

  const w = sumCabins(midCabins.value, midPlus.value); // 中間段總長
  const h = parseFloat(midDepth.value) || 60; // 中間段深度
  const wM = sumCabins(leftArmCabins.value, leftArmPlus.value); // 左側臂總長
  const hM = parseFloat(leftArmDepth.value) || 60; // 左側臂深度
  const wL = sumCabins(rightArmCabins.value, rightArmPlus.value); // 右側臂總長
  const hL = parseFloat(rightArmDepth.value) || 60; // 右側臂深度
  const x0 = ORIGIN_X;
  const y0 = ORIGIN_Y;

  if (w <= 0 && wM <= 0 && wL <= 0) return;

  // M 型外框
  drawMShape(x0, y0, w, h, wM, hM, wL, hL);

  // 桶身分隔線（中間，同時跳過左右轉角區）
  if (w > 0) {
    drawMidCabinDividersH(
      getBoxList(midCabins.value),
      midPlus.value,
      x0,
      y0,
      h,
      w,
      wM > 0 ? hM : 0,
      wL > 0 ? hL : 0,
    );
  }
  // 桶身分隔線（左側臂，標籤在左外側）
  if (wM > 0) {
    drawCabinDividersVLeft(
      getBoxList(leftArmCabins.value),
      leftArmPlus.value,
      x0,
      y0,
      hM,
      wM,
      w > 0 ? h : 0,
    );
  }
  // 桶身分隔線（右側臂，標籤在右外側）
  if (wL > 0) {
    drawCabinDividersVRight(
      getBoxList(rightArmCabins.value),
      rightArmPlus.value,
      x0 + w - hL,
      y0,
      hL,
      wL,
      w > 0 ? h : 0,
    );
  }

  // 總長 / 深度 標註
  if (w > 0) drawTopLengthMarker(x0, y0, w);
  if (wM > 0) drawLeftArmLengthMarker(x0, y0, wM);
  if (wL > 0) drawRightArmLengthMarker(x0 + w, y0, wL);
  if (h > 0 && w > 0) drawMidDepthLabel(x0, y0, h, hM, w, hL);
  if (hM > 0 && wM > 0) drawArmDepthLabelBottom(x0, y0 + wM, hM);
  if (hL > 0 && wL > 0) drawArmDepthLabelBottom(x0 + w - hL, y0 + wL, hL);

  // 後側
  if (backOption.value === "後見光") {
    if (w > 0) drawTri(x0 + w / 2, y0 - 18, "d");
  }
  if (backstop.value && w > 0) {
    const bh = parseFloat(backHeight.value) || 2;
    draw
      .line(x0, y0 + bh, x0 + w, y0 + bh)
      .stroke({ width: 1, color: "black" });
  }

  // 水槽 / 火爐（中間段，沿 X 軸）
  for (const s of midSinks) if (s.enabled) drawSinkH(s, x0, y0, h, w);
  for (const s of midStoves) if (s.enabled) drawStoveH(s, x0, y0, h, w);
  // 水槽 / 火爐（左側臂，沿 Y 軸，標籤往左）
  if (wM > 0) {
    for (const s of leftArmSinks)
      if (s.enabled) drawSinkVLeft(s, x0, y0, hM, wM);
    for (const s of leftArmStoves)
      if (s.enabled) drawStoveVLeft(s, x0, y0, hM, wM);
  }
  // 水槽 / 火爐（右側臂，沿 Y 軸，標籤往右）
  if (wL > 0) {
    for (const s of rightArmSinks)
      if (s.enabled) drawSinkVRight(s, x0 + w - hL, y0, hL, wL);
    for (const s of rightArmStoves)
      if (s.enabled) drawStoveVRight(s, x0 + w - hL, y0, hL, wL);
  }

  // 接線
  if (midCutToggled.value && w > 0) {
    const ltl = parseFloat(midConnect.value);
    if (!isNaN(ltl) && ltl > 0 && ltl < w) drawCutLineH(x0, y0, h, w, ltl);
  }
  if (leftArmCutToggled.value && wM > 0) {
    const ltl = parseFloat(leftArmConnect.value);
    if (!isNaN(ltl) && ltl > 0 && ltl < wM)
      drawCutLineVLeft(x0, y0, hM, wM, ltl);
  }
  if (rightArmCutToggled.value && wL > 0) {
    const ltl = parseFloat(rightArmConnect.value);
    if (!isNaN(ltl) && ltl > 0 && ltl < wL)
      drawCutLineVRight(x0 + w - hL, y0, hL, wL, ltl);
  }

  // 端側裝飾
  if (wM > 0) {
    drawLeftArmSideEnd(x0, y0, wM);
    drawLeftArmBottomEnd(x0, y0 + wM, hM);
  }
  if (wL > 0) {
    drawRightArmSideEnd(x0 + w, y0, wL);
    drawRightArmBottomEnd(x0 + w - hL, y0 + wL, hL);
  }

  // 後靠牆（最後畫）
  if (backOption.value === "後靠牆" && w > 0) drawTopWall(x0, y0, w);

  // 動態收縮 SVG 尺寸
  const contentRight = x0 + Math.max(w, hM, hL) + 120;
  const maxBottom = Math.max(w > 0 ? h : 0, wM > 0 ? wM : 0, wL > 0 ? wL : 0);
  draw.size(Math.max(contentRight, 300), Math.max(y0 + maxBottom + 100, 300));
}

// ─── M 型外框 ────────────────────────────────────────────
function drawMShape(x0, y0, w, h, wM, hM, wL, hL) {
  const hasM = w > 0;
  const hasL = wM > 0;
  const hasR = wL > 0;

  if (hasM && hasL && hasR) {
    // 完整 M 形
    const yBotL = y0 + Math.max(wM, h);
    const yBotR = y0 + Math.max(wL, h);
    const points = [
      [x0, y0],
      [x0 + w, y0],
      [x0 + w, yBotR],
      [x0 + w - hL, yBotR],
      [x0 + w - hL, y0 + h],
      [x0 + hM, y0 + h],
      [x0 + hM, yBotL],
      [x0, yBotL],
    ];
    draw
      .polygon(points.map((p) => p.join(",")).join(" "))
      .fill("white")
      .stroke({ width: 1, color: "black" });
  } else if (hasM && hasL) {
    // 中間 + 左臂（反 L 型）
    const yBotL = y0 + Math.max(wM, h);
    const points = [
      [x0, y0],
      [x0 + w, y0],
      [x0 + w, y0 + h],
      [x0 + hM, y0 + h],
      [x0 + hM, yBotL],
      [x0, yBotL],
    ];
    draw
      .polygon(points.map((p) => p.join(",")).join(" "))
      .fill("white")
      .stroke({ width: 1, color: "black" });
  } else if (hasM && hasR) {
    // 中間 + 右臂（標準 L 型）
    const yBotR = y0 + Math.max(wL, h);
    const points = [
      [x0, y0],
      [x0 + w, y0],
      [x0 + w, yBotR],
      [x0 + w - hL, yBotR],
      [x0 + w - hL, y0 + h],
      [x0, y0 + h],
    ];
    draw
      .polygon(points.map((p) => p.join(",")).join(" "))
      .fill("white")
      .stroke({ width: 1, color: "black" });
  } else if (hasM) {
    draw
      .rect(w, h)
      .move(x0, y0)
      .fill("white")
      .stroke({ width: 1, color: "black" });
  } else if (hasL) {
    draw
      .rect(hM, wM)
      .move(x0, y0)
      .fill("white")
      .stroke({ width: 1, color: "black" });
  } else if (hasR) {
    draw
      .rect(hL, wL)
      .move(x0 + w - hL, y0)
      .fill("white")
      .stroke({ width: 1, color: "black" });
  }
}

// ─── 中間段桶身分隔（左右轉角均跳過）─────────────────────
function drawMidCabinDividersH(
  boxes,
  plus,
  x0,
  y0,
  h,
  w,
  leftCornerW = 0,
  rightCornerW = 0,
) {
  const p = parseFloat(plus);
  const xLeftEnd = x0 + leftCornerW; // 左轉角結束
  const xRightStart = x0 + w - rightCornerW; // 右轉角開始
  const labelSize = Math.max(6, Number(settings.midFont) || 10);
  const labelGap = Number(settings.midCabinLabelGap) || 4;
  let x = x0;
  if (!isNaN(p) && p > 0) {
    const midX = x + p / 2;
    if (midX > xLeftEnd && midX < xRightStart) {
      draw
        .text(String(p))
        .font({ size: labelSize, family: "DFKai-sb" })
        .move(midX - 6, y0 + h + labelGap);
    }
    if (x + p > xLeftEnd && x + p < xRightStart) drawTickH(x + p, y0 + h);
    x += p;
  } else if (boxes.length > 0) {
    const midX = x + boxes[0] / 2;
    if (midX > xLeftEnd && midX < xRightStart)
      draw
        .text(String(boxes[0]))
        .font({ size: labelSize, family: "DFKai-sb" })
        .move(midX - 8, y0 + h + labelGap);
  }
  for (let i = 0; i < boxes.length; i++) {
    x += boxes[i];
    if (i < boxes.length - 1) {
      if (x > xLeftEnd && x < xRightStart) drawTickH(x, y0 + h);
      const nextMidX = x + boxes[i + 1] / 2;
      if (nextMidX > xLeftEnd && nextMidX < xRightStart)
        draw
          .text(String(boxes[i + 1]))
          .font({ size: labelSize, family: "DFKai-sb" })
          .move(nextMidX - 8, y0 + h + labelGap);
    }
  }
  // 內部虛線（跳過轉角區）
  let cx = x0 + (isNaN(p) || p <= 0 ? 0 : p);
  for (let i = 0; i < boxes.length - 1; i++) {
    cx += boxes[i];
    if (cx <= xLeftEnd || cx >= xRightStart) continue;
    draw
      .line(cx, y0, cx, y0 + h)
      .stroke({ width: 0.5, color: "#888", dasharray: "2,3" });
  }
}

// ─── 左側臂桶身分隔（標籤在左外側）──────────────────────
function drawCabinDividersVLeft(boxes, plus, x0, y0, hM, wM, cornerH = 0) {
  const p = parseFloat(plus);
  const yCornerEnd = y0 + cornerH;
  const xTick = x0; // 刻度在左臂左邊
  const labelSize = Math.max(6, Number(settings.leftFont) || 10);
  const xLabel = x0 - (Number(settings.leftCabinLabelGap) || 10);
  let y = y0;
  if (!isNaN(p) && p > 0) {
    if (y + p > yCornerEnd) {
      drawTickV(xTick, y + p);
      drawRotLabel(String(p), xLabel, y + p / 2, 90, labelSize);
    }
    y += p;
  } else if (boxes.length > 0) {
    const midY = y + boxes[0] / 2;
    if (midY > yCornerEnd)
      drawRotLabel(String(boxes[0]), xLabel, midY, 90, labelSize);
  }
  for (let i = 0; i < boxes.length; i++) {
    y += boxes[i];
    if (i < boxes.length - 1) {
      if (y > yCornerEnd) drawTickV(xTick, y);
      const nextMidY = y + boxes[i + 1] / 2;
      if (nextMidY > yCornerEnd)
        drawRotLabel(String(boxes[i + 1]), xLabel, nextMidY, 90, labelSize);
    }
  }
  // 內部虛線
  let cy = y0 + (isNaN(p) || p <= 0 ? 0 : p);
  for (let i = 0; i < boxes.length - 1; i++) {
    cy += boxes[i];
    if (cy <= yCornerEnd) continue;
    draw
      .line(x0, cy, x0 + hM, cy)
      .stroke({ width: 0.5, color: "#888", dasharray: "2,3" });
  }
}

// ─── 右側臂桶身分隔（標籤在右外側）──────────────────────
function drawCabinDividersVRight(boxes, plus, x0, y0, hL, wL, cornerH = 0) {
  const p = parseFloat(plus);
  const yCornerEnd = y0 + cornerH;
  const xTick = x0 + hL; // 刻度在右臂右邊
  const labelSize = Math.max(6, Number(settings.rightFont) || 10);
  const xLabel = x0 + hL + (Number(settings.rightCabinLabelGap) || 12);
  let y = y0;
  if (!isNaN(p) && p > 0) {
    if (y + p > yCornerEnd) {
      drawTickVRight(xTick, y + p);
      drawRotLabel(String(p), xLabel, y + p / 2, -90, labelSize);
    }
    y += p;
  } else if (boxes.length > 0) {
    const midY = y + boxes[0] / 2;
    if (midY > yCornerEnd)
      drawRotLabel(String(boxes[0]), xLabel, midY, -90, labelSize);
  }
  for (let i = 0; i < boxes.length; i++) {
    y += boxes[i];
    if (i < boxes.length - 1) {
      if (y > yCornerEnd) drawTickVRight(xTick, y);
      const nextMidY = y + boxes[i + 1] / 2;
      if (nextMidY > yCornerEnd)
        drawRotLabel(String(boxes[i + 1]), xLabel, nextMidY, -90, labelSize);
    }
  }
  // 內部虛線
  let cy = y0 + (isNaN(p) || p <= 0 ? 0 : p);
  for (let i = 0; i < boxes.length - 1; i++) {
    cy += boxes[i];
    if (cy <= yCornerEnd) continue;
    draw
      .line(x0, cy, x0 + hL, cy)
      .stroke({ width: 0.5, color: "#888", dasharray: "2,3" });
  }
}

// ─── 刻度輔助 ────────────────────────────────────────────
function drawTickH(x, y) {
  draw.line(x, y - 2, x, y + 2).stroke({ width: 1, color: "black" });
}
function drawTickV(x, y) {
  draw.line(x - 2, y, x + 2, y).stroke({ width: 1, color: "black" });
}
function drawTickVRight(x, y) {
  draw.line(x - 2, y, x + 2, y).stroke({ width: 1, color: "black" });
}
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
  const markerFont = Math.max(6, Number(settings.lengthFont) || 16);
  const yLine = y0 - (Number(settings.topMarkerGap) || 30);
  draw.line(x0, yLine, x0 + w, yLine).stroke({ width: 1, color: "black" });
  draw.line(x0, yLine - 6, x0, yLine + 6).stroke({ width: 1, color: "black" });
  draw
    .line(x0 + w, yLine - 6, x0 + w, yLine + 6)
    .stroke({ width: 1, color: "black" });
  const t = draw.text(String(w)).font({ size: markerFont, family: "DFKai-sb" });
  const bb = t.bbox();
  t.move(x0 + w / 2 - bb.width / 2, yLine - bb.height - 4);
}

function drawLeftArmLengthMarker(x0, y0, wM) {
  const markerFont = Math.max(6, Number(settings.lengthFont) || 16);
  const xLine = x0 - (Number(settings.leftMarkerGap) || 50);
  draw.line(xLine, y0, xLine, y0 + wM).stroke({ width: 1, color: "black" });
  draw.line(xLine - 6, y0, xLine + 6, y0).stroke({ width: 1, color: "black" });
  draw
    .line(xLine - 6, y0 + wM, xLine + 6, y0 + wM)
    .stroke({ width: 1, color: "black" });
  const t = draw.text(String(wM)).font({ size: markerFont, family: "DFKai-sb" });
  const bb = t.bbox();
  t.move(xLine - 8 - bb.width, y0 + wM / 2 - bb.height / 2);
}

function drawRightArmLengthMarker(xEdge, y0, wL) {
  const markerFont = Math.max(6, Number(settings.lengthFont) || 16);
  const xLine = xEdge + (Number(settings.rightMarkerGap) || 50);
  draw.line(xLine, y0, xLine, y0 + wL).stroke({ width: 1, color: "black" });
  draw.line(xLine - 6, y0, xLine + 6, y0).stroke({ width: 1, color: "black" });
  draw
    .line(xLine - 6, y0 + wL, xLine + 6, y0 + wL)
    .stroke({ width: 1, color: "black" });
  const t = draw.text(String(wL)).font({ size: markerFont, family: "DFKai-sb" });
  const bb = t.bbox();
  t.move(xLine + 8, y0 + wL / 2 - bb.height / 2);
}

// 中間段深度標示（在兩臂中間底部）
function drawMidDepthLabel(x0, y0, h, hM, w, hL) {
  const labelSize = Math.max(6, Number(settings.depthFont) || 12);
  const xMid = x0 + hM + (w - hM - hL) / 2;
  const xLine = xMid;
  draw
    .line(xLine, y0, xLine, y0 + h)
    .stroke({ width: 0.5, color: "#aaa", dasharray: "2,2" });
  draw
    .line(xLine - 4, y0, xLine + 4, y0)
    .stroke({ width: 0.5, color: "black" });
  draw
    .line(xLine - 4, y0 + h, xLine + 4, y0 + h)
    .stroke({ width: 0.5, color: "black" });
  const t = draw.text(String(h)).font({ size: labelSize, family: "DFKai-sb" });
  const bb = t.bbox();
  t.move(xLine + 4, y0 + h / 2 - bb.height / 2);
}

// 臂深度標示（臂底部）
function drawArmDepthLabelBottom(x0, yBottom, armDepth) {
  const labelSize = Math.max(6, Number(settings.depthFont) || 12);
  const yLine = yBottom + (Number(settings.armDepthGap) || 20);
  draw
    .line(x0, yLine, x0 + armDepth, yLine)
    .stroke({ width: 0.5, color: "black" });
  draw
    .line(x0, yLine - 4, x0, yLine + 4)
    .stroke({ width: 0.5, color: "black" });
  draw
    .line(x0 + armDepth, yLine - 4, x0 + armDepth, yLine + 4)
    .stroke({ width: 0.5, color: "black" });
  const t = draw.text(String(armDepth)).font({ size: labelSize, family: "DFKai-sb" });
  const bb = t.bbox();
  t.move(x0 + armDepth / 2 - bb.width / 2, yLine + 4);
}

// ─── 端側裝飾 ────────────────────────────────────────────
function drawLeftArmSideEnd(x0, y0, wM) {
  if (leftSideEnd.value === "左靠牆") drawWallHatchLeft(x0, y0, wM, "牆");
  if (leftSideEnd.value === "左見光") drawTri(x0 - 15, y0 + wM / 2, "r");
  if (leftSideBackstop.value) {
    const bh = parseFloat(backHeight.value) || 2;
    draw
      .line(x0 + bh, y0, x0 + bh, y0 + wM)
      .stroke({ width: 1, color: "black" });
  }
}
function drawRightArmSideEnd(xRight, y0, wL) {
  if (rightSideEnd.value === "右靠牆") drawWallHatchRight(xRight, y0, wL, "牆");
  if (rightSideEnd.value === "右見光") drawTri(xRight + 15, y0 + wL / 2, "l");
  if (rightSideBackstop.value) {
    const bh = parseFloat(backHeight.value) || 2;
    draw
      .line(xRight - bh, y0, xRight - bh, y0 + wL)
      .stroke({ width: 1, color: "black" });
  }
}
function drawWallHatchLeft(x, y, len, label) {
  for (let i = 0; i < len; i += 8) {
    draw
      .line(x - 4, y + i, x, y + i + 6)
      .stroke({ width: 0.5, color: "black" });
  }
  drawRotLabel(label, x - 14, y + len / 2, 0, 12);
}
function drawWallHatchRight(x, y, len, label) {
  for (let i = 0; i < len; i += 8) {
    draw
      .line(x + 4, y + i, x, y + i + 6)
      .stroke({ width: 0.5, color: "black" });
  }
  drawRotLabel(label, x + 14, y + len / 2, 0, 12);
}
function drawLeftArmBottomEnd(x0, yBottom, hM) {
  if (leftBottomEnd.value === "左靠牆")
    drawWallHatchBottom(x0, yBottom, hM, "牆");
  if (leftBottomEnd.value === "左見光") drawTri(x0 + hM / 2, yBottom + 15, "u");
  if (leftBottomEnd.value === "左靠側板")
    drawWallHatchBottom(x0, yBottom, hM, "側板");
  if (leftBottomEnd.value === "左齊桶身側板")
    drawTriangleWithDiamond(x0 + hM / 2, yBottom + 12, 10);
  if (leftBottomEnd.value === "左靠櫃")
    drawWallHatchBottom(x0, yBottom, hM, "櫃");
}
function drawRightArmBottomEnd(x0, yBottom, hL) {
  if (rightBottomEnd.value === "右靠牆")
    drawWallHatchBottom(x0, yBottom, hL, "牆");
  if (rightBottomEnd.value === "右見光")
    drawTri(x0 + hL / 2, yBottom + 15, "u");
  if (rightBottomEnd.value === "右靠側板")
    drawWallHatchBottom(x0, yBottom, hL, "側板");
  if (rightBottomEnd.value === "右齊桶身側板")
    drawTriangleWithDiamond(x0 + hL / 2, yBottom + 12, 10);
  if (rightBottomEnd.value === "右靠櫃")
    drawWallHatchBottom(x0, yBottom, hL, "櫃");
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
  const diamondSize = size / Math.sqrt(3);
  draw
    .polygon([
      [x, y - diamondSize / 2],
      [x + diamondSize / 2, y],
      [x, y + diamondSize / 2],
      [x - diamondSize / 2, y],
    ])
    .fill("black")
    .center(x, y + size / 6);
}
function drawWallHatchBottom(x, y, span, label) {
  for (let i = 0; i < span; i += 8) {
    draw
      .line(x + i, y + 4, x + i + 6, y)
      .stroke({ width: 0.5, color: "black" });
  }
  draw
    .text(label)
    .font({ size: 12, family: "DFKai-sb" })
    .move(x + span / 2 - 6, y + 8);
}

function drawTopWall(x0, y0, w) {
  for (let i = -4; i <= w + 8; i += 5) {
    draw
      .line(x0 + i, y0 - 1, x0 + i + 6, y0 - 6)
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

// ─── 水槽（中間段，水平）────────────────────────────────
function drawSinkH(s, x0, y0, h, w) {
  const { sinkLength: sl, sinkDepth: sd, R: r, dig, center, position } = s;
  let xp;
  if (position === "水中") xp = x0 + center - sl / 2;
  else if (position === "左開") xp = x0 + center;
  else xp = x0 + w - center - sl;
  const yp = y0 + h - dig - sd;
  drawSinkBox(xp, yp, sl, sd, r);
  const refX = position === "右開" ? x0 + w - center : x0 + center;
  const fromX = position === "右開" ? x0 + w : x0;
  drawTopLabel(`${position}${center}`, refX, y0, fromX);
}
function drawStoveH(s, x0, y0, h, w) {
  const { stoveLength: sl, stoveDepth: sd, R: r, dig, dis, position } = s;
  let xp;
  if (position === "火中") xp = x0 + dis - sl / 2;
  else if (position === "左開") xp = x0 + dis;
  else xp = x0 + w - dis - sl;
  const yp = y0 + h - dig - sd;
  drawStoveBox(xp, yp, sl, sd, r);
  const refX = position === "右開" ? x0 + w - dis : x0 + dis;
  const fromX = position === "右開" ? x0 + w : x0;
  drawTopLabel(`${position}${dis}`, refX, y0, fromX);
}

// ─── 水槽（左側臂，垂直；標籤在左外）────────────────────
function drawSinkVLeft(s, x0, y0, hM, wM) {
  const { sinkLength: sl, sinkDepth: sd, R: r, dig, center, position } = s;
  let yp;
  if (position === "水中") yp = y0 + center - sl / 2;
  else if (position === "上開") yp = y0 + center;
  else yp = y0 + wM - center - sl;
  const xp = x0 + hM - dig - sd; // 從右（內）側挖入
  drawSinkBox(xp, yp, sd, sl, r);
  const refY = position === "下開" ? y0 + wM - center : y0 + center;
  const fromY = position === "下開" ? y0 + wM : y0;
  drawLeftLabel(`${position}${center}`, refY, x0, fromY);
}
function drawStoveVLeft(s, x0, y0, hM, wM) {
  const { stoveLength: sl, stoveDepth: sd, R: r, dig, dis, position } = s;
  let yp;
  if (position === "火中") yp = y0 + dis - sl / 2;
  else if (position === "上開") yp = y0 + dis;
  else yp = y0 + wM - dis - sl;
  const xp = x0 + hM - dig - sd;
  drawStoveBox(xp, yp, sd, sl, r);
  const refY = position === "下開" ? y0 + wM - dis : y0 + dis;
  const fromY = position === "下開" ? y0 + wM : y0;
  drawLeftLabel(`${position}${dis}`, refY, x0, fromY);
}

// ─── 水槽（右側臂，垂直；標籤在右外）────────────────────
function drawSinkVRight(s, x0, y0, hL, wL) {
  const { sinkLength: sl, sinkDepth: sd, R: r, dig, center, position } = s;
  let yp;
  if (position === "水中") yp = y0 + center - sl / 2;
  else if (position === "上開") yp = y0 + center;
  else yp = y0 + wL - center - sl;
  const xp = x0 + dig; // 從左（內）側挖入
  drawSinkBox(xp, yp, sd, sl, r);
  const refY = position === "下開" ? y0 + wL - center : y0 + center;
  const fromY = position === "下開" ? y0 + wL : y0;
  drawRightLabel(`${position}${center}`, refY, x0 + hL, fromY);
}
function drawStoveVRight(s, x0, y0, hL, wL) {
  const { stoveLength: sl, stoveDepth: sd, R: r, dig, dis, position } = s;
  let yp;
  if (position === "火中") yp = y0 + dis - sl / 2;
  else if (position === "上開") yp = y0 + dis;
  else yp = y0 + wL - dis - sl;
  const xp = x0 + dig;
  drawStoveBox(xp, yp, sd, sl, r);
  const refY = position === "下開" ? y0 + wL - dis : y0 + dis;
  const fromY = position === "下開" ? y0 + wL : y0;
  drawRightLabel(`${position}${dis}`, refY, x0 + hL, fromY);
}

// ─── 水槽 / 火爐 方框 ────────────────────────────────────
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

// ─── 引線標籤 ────────────────────────────────────────────
function drawTopLabel(text, xPoint, y0, xFrom) {
  const fontSize = Math.max(6, Number(settings.openingFont) || 11);
  const yLine = y0 - (Number(settings.openingTopGap) || 12);
  draw.line(xFrom, yLine, xPoint, yLine).stroke({ width: 0.5, color: "black" });
  draw.line(xPoint, yLine, xPoint, y0).stroke({ width: 0.5, color: "black" });
  const t = draw
    .text(String(text))
    .font({ size: fontSize, family: "DFKai-sb" });
  t.move(xPoint - t.bbox().width / 2, yLine - fontSize - 3);
}
function drawLeftLabel(text, yPoint, xEdge, yFrom) {
  const fontSize = Math.max(6, Number(settings.openingFont) || 11);
  const xLine = xEdge - (Number(settings.openingLeftGap) || 12);
  draw.line(xLine, yFrom, xLine, yPoint).stroke({ width: 0.5, color: "black" });
  draw
    .line(xEdge, yPoint, xLine, yPoint)
    .stroke({ width: 0.5, color: "black" });
  drawRotLabel(String(text), xLine - fontSize - 3, yPoint, 90, fontSize);
}
function drawRightLabel(text, yPoint, xEdge, yFrom) {
  const fontSize = Math.max(6, Number(settings.openingFont) || 11);
  const xLine = xEdge + (Number(settings.openingRightGap) || 12);
  draw.line(xLine, yFrom, xLine, yPoint).stroke({ width: 0.5, color: "black" });
  draw
    .line(xEdge, yPoint, xLine, yPoint)
    .stroke({ width: 0.5, color: "black" });
  drawRotLabel(String(text), xLine + fontSize + 3, yPoint, -90, fontSize);
}

// ─── 接線 ────────────────────────────────────────────────
function drawCutLineH(x0, y0, h, w, ltl) {
  const fontSize = Math.max(6, Number(settings.connectFont) || 10);
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
    .font({ size: fontSize, family: "DFKai-sb" })
    .move(x0 + ltl - 30, yMid + 2);
  draw
    .text(String(Math.round((w - ltl) * 100) / 100))
    .font({ size: fontSize, family: "DFKai-sb" })
    .move(x0 + ltl + 4, yMid + 2);
}
function drawCutLineVLeft(x0, y0, hM, wM, ltl) {
  const fontSize = Math.max(6, Number(settings.connectFont) || 10);
  const xMid = x0 - 15;
  draw.line(x0, y0 + ltl, xMid, y0 + ltl).stroke({ width: 1, color: "black" });
  draw
    .line(xMid, y0 + ltl - 30, xMid, y0 + ltl)
    .stroke({ width: 1, color: "black" });
  draw
    .line(xMid, y0 + ltl + 30, xMid, y0 + ltl)
    .stroke({ width: 1, color: "black" });
  drawRotLabel(String(ltl), xMid - 14, y0 + ltl - 15, 90, fontSize);
  drawRotLabel(
    String(Math.round((wM - ltl) * 100) / 100),
    xMid - 14,
    y0 + ltl + 15,
    90,
    fontSize,
  );
}
function drawCutLineVRight(x0, y0, hL, wL, ltl) {
  const fontSize = Math.max(6, Number(settings.connectFont) || 10);
  const xMid = x0 + hL + 15;
  draw.line(x0, y0 + ltl, xMid, y0 + ltl).stroke({ width: 1, color: "black" });
  draw
    .line(xMid, y0 + ltl - 30, xMid, y0 + ltl)
    .stroke({ width: 1, color: "black" });
  draw
    .line(xMid, y0 + ltl + 30, xMid, y0 + ltl)
    .stroke({ width: 1, color: "black" });
  drawRotLabel(String(ltl), xMid + 14, y0 + ltl - 15, -90, fontSize);
  drawRotLabel(
    String(Math.round((wL - ltl) * 100) / 100),
    xMid + 14,
    y0 + ltl + 15,
    -90,
    fontSize,
  );
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
  gap: 10px;
  padding: 6px 0 8px;
}
.btn-save {
  padding: 5px 16px;
  background: #1f4bb8;
  color: #fff;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
}
.btn-save:disabled {
  opacity: 0.6;
  cursor: default;
}
.save-msg {
  font-size: 13px;
  color: #2d7d46;
}
.btn-img {
  padding: 4px 12px;
  background: #e8eaf0;
  border: 1px solid #bbb;
  border-radius: 5px;
  cursor: pointer;
  font-size: 13px;
}
.img-hint {
  font-size: 12px;
  color: #888;
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
.sections-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 8px;
}
.section {
  border: 1px solid #d0d4d9;
  border-radius: 6px;
  padding: 6px 8px;
  margin: 8px 0;
  background: #fafbfc;
  min-width: 320px;
}
.section-title {
  font-weight: bold;
  margin-bottom: 4px;
  font-size: 13px;
  color: #444;
}
.settings {
  border: 1px solid #d0d4d9;
  border-radius: 6px;
  padding: 8px;
  margin-bottom: 10px;
  background: #f6f8fc;
}
.img-canvas {
  position: relative;
  display: inline-block;
}
.svg-container {
  display: block;
}
.o-img {
  position: absolute;
  cursor: move;
  user-select: none;
}
.o-img-rh {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 14px;
  height: 14px;
  background: #3b82f6;
  border-radius: 2px;
  cursor: se-resize;
  opacity: 0.7;
}
</style>
