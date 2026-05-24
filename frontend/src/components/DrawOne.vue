<template>
  <div class="p-4">
    <h1 class="text-xl font-bold mb-4">一字型檯面繪圖（Vue + SVG）</h1>

    <!-- 控制輸入區 -->
    <div class="flex flex-wrap gap-4 items-end mb-6">
      <!-- 左邊設定 -->
      <label>
        左標線
        <input type="checkbox" v-model="left_label" />
      </label>
      <label class="block">
        左邊情況
        <select
          v-model="leftEndType"
          class="border p-1 w-24 bg-teal-500 rounded text-white"
        >
          <option value="見光">見光</option>
          <option value="牆">靠牆</option>
          <option value="側板">靠側板</option>
          <option value="與桶身齊">與桶身齊</option>
        </select>
      </label>
      <label
        v-if="leftEndType === '牆' || leftEndType === '側板'"
        class="block"
      >
        封邊長度
        <input
          v-model.number="leftEdgeLength"
          type="number"
          class="border p-1 w-20"
        />
      </label>
      <label class="block" v-if="leftEndType === '見光'">
        左凸 (cm)
        <input
          v-model.number="plusL"
          type="number"
          min="0"
          class="border p-1 w-20"
        />
      </label>
      <!-- 右邊設定 -->
      <label class="block">
        右邊情況
        <select
          v-model="rightEndType"
          class="border p-1 w-24 bg-teal-500 rounded text-white"
        >
          <option value="見光">見光</option>
          <option value="牆">靠牆</option>
          <option value="側板">靠側板</option>
          <option value="與桶身齊">與桶身齊</option>
        </select>
      </label>
      <label
        v-if="rightEndType === '牆' || rightEndType === '側板'"
        class="block"
      >
        封邊長度
        <input
          v-model.number="rightEdgeLength"
          type="number"
          class="border p-1 w-20"
        />
      </label>
      <label class="block" v-if="rightEndType === '見光'">
        右凸 (cm)
        <input
          v-model.number="plusR"
          type="number"
          min="0"
          class="border p-1 w-20"
        />
      </label>

      <label class="block">
        桶身 (用逗號分隔)
        <input v-model="boxInput" type="text" class="border p-1 w-60" />
      </label>

      <label class="block">
        深度 (cm)
        <input v-model.number="depth" type="number" class="border p-1 w-20" />
      </label>

      <label>
        水槽1
        <input type="checkbox" v-model="checkWater1" />
      </label>

      <label v-if="checkWater1" class="block">
        水槽1中心 (cm)
        <input v-model.number="sink1X" type="number" class="border p-1 w-20" />
        寛
        <input
          v-model.number="sink1Width"
          type="number"
          class="border p-1 w-20"
        />
        深
        <input
          v-model.number="sink1Depth"
          type="number"
          class="border p-1 w-20"
        />
        R角
        <input
          v-model.number="sink1Radius"
          type="number"
          class="border p-1 w-20"
        />
        開挖
        <input
          v-model.number="sink1Front"
          type="number"
          class="border p-1 w-20"
        />
      </label>
      <label>
        水槽2
        <input type="checkbox" v-model="checkWater2" />
      </label>

      <label v-if="checkWater2" class="block">
        水槽2中心 (cm)
        <input v-model.number="sink2X" type="number" class="border p-1 w-20" />

        寛
        <input
          v-model.number="sink2Width"
          type="number"
          class="border p-1 w-20"
        />
        深
        <input
          v-model.number="sink2Depth"
          type="number"
          class="border p-1 w-20"
        />
        R角
        <input
          v-model.number="sink2Radius"
          type="number"
          class="border p-1 w-20"
        />
        開挖
        <input
          v-model.number="sink2Front"
          type="number"
          class="border p-1 w-20"
        />
      </label>
      <label>
        水槽3
        <input type="checkbox" v-model="checkWater3" />
      </label>

      <label v-if="checkWater3" class="block">
        水槽3中心 (cm)
        <input v-model.number="sink3X" type="number" class="border p-1 w-20" />
        寛
        <input
          v-model.number="sink3Width"
          type="number"
          class="border p-1 w-20"
        />
        深
        <input
          v-model.number="sink3Depth"
          type="number"
          class="border p-1 w-20"
        />
        R角
        <input
          v-model.number="sink3Radius"
          type="number"
          class="border p-1 w-20"
        />
        開挖
        <input
          v-model.number="sink3Front"
          type="number"
          class="border p-1 w-20"
        />
      </label>

      <label>
        爐子1
        <input type="checkbox" v-model="checkStove1" />
      </label>

      <label v-if="checkStove1" class="block">
        爐子1中心 (cm)
        <input v-model.number="stove1X" type="number" class="border p-1 w-20" />
        寛
        <input
          v-model.number="stove1Width"
          type="number"
          class="border p-1 w-20"
        />
        深
        <input
          v-model.number="stove1Depth"
          type="number"
          class="border p-1 w-20"
        />
        R角
        <input
          v-model.number="stove1Radius"
          type="number"
          class="border p-1 w-20"
        />
        開挖
        <input
          v-model.number="stove1Front"
          type="number"
          class="border p-1 w-20"
        />
      </label>
      <label>
        爐子2
        <input type="checkbox" v-model="checkStove2" />
      </label>

      <label v-if="checkStove2" class="block">
        爐子2中心 (cm)
        <input v-model.number="stove2X" type="number" class="border p-1 w-20" />
        寛
        <input
          v-model.number="stove2Width"
          type="number"
          class="border p-1 w-20"
        />
        深
        <input
          v-model.number="stove2Depth"
          type="number"
          class="border p-1 w-20"
        />
        R角
        <input
          v-model.number="stove2Radius"
          type="number"
          class="border p-1 w-20"
        />
        開挖
        <input
          v-model.number="stove2Front"
          type="number"
          class="border p-1 w-20"
        />
      </label>
      <label>
        爐子3
        <input type="checkbox" v-model="checkStove3" />
      </label>

      <label v-if="checkStove3" class="block">
        爐子3中心 (cm)
        <input v-model.number="stove3X" type="number" class="border p-1 w-20" />
        寛
        <input
          v-model.number="stove3Width"
          type="number"
          class="border p-1 w-20"
        />
        深
        <input
          v-model.number="stove3Depth"
          type="number"
          class="border p-1 w-20"
        />
        R角
        <input
          v-model.number="stove3Radius"
          type="number"
          class="border p-1 w-20"
        />
        開挖
        <input
          v-model.number="stove3Front"
          type="number"
          class="border p-1 w-20"
        />
      </label>

      <label>
        右標線
        <input type="checkbox" v-model="right_label" />
        後面情況
        <select
          v-model="backEndType"
          class="border p-1 w-24 bg-teal-500 rounded text-white"
        >
          <option value="見光">見光</option>
          <option value="靠牆">靠牆</option>
          <option value="靠牆+背牆">靠牆+背牆</option>
        </select>
        前面情況
        <select
          v-model="frontEndType"
          class="border p-1 w-24 bg-teal-500 rounded text-white"
        >
          <option value="見光">見光</option>
          <option value="靠牆">靠牆</option>
        </select>
      </label>
      <label class="block">
        縮放倍率
        <input
          v-model.number="scale"
          type="number"
          step="0.1"
          class="border p-1 w-20"
        />
      </label>

      <button
        @click="copyToClipboard"
        class="bg-blue-500 text-white rounded p-1"
      >
        複製主圖到剪貼簿
      </button>
      <label>指定接線位置 </label>
      <input
        type="number"
        v-model="cutPosition"
        class="w-16 bg-teal-500 rounded text-white"
      />
    </div>

    <!-- SVG 繪圖區 -->
    <svg ref="svgRef" :width="svgWidth" :height="svgHeight" class="border">
      <g id="mainContent" stroke="none">
        <!-- 主檯面 -->
        <rect
          :x="scaledX(x0)"
          :y="scaledY(y0)"
          :width="scaledX(totalWidth)"
          :height="scaledY(depth)"
          fill="none"
          stroke="black"
        />

        <!-- 桶身分隔線與標註 -->
        <template v-for="(seg, i) in boxSegments" :key="'segment-' + i">
          <line
            :x1="scaledX(seg)"
            :x2="scaledX(seg)"
            :y1="scaledY(y0)"
            :y2="scaledY(y0 + depth)"
            stroke="black"
            stroke-dasharray="1 5"
          />
          <text
            :x="scaledX((boxStartPositions[i] + seg) / 2)"
            :y="scaledY(y0 + depth + 10)"
            font-size="12"
            text-anchor="middle"
          >
            {{ box[i] }}
          </text>
        </template>

        <!-- 總長度尺寸線 -->
        <line
          :x1="scaledX(x0)"
          :x2="scaledX(x0 + totalWidth)"
          :y1="scaledY(y0 - 40)"
          :y2="scaledY(y0 - 40)"
          stroke="black"
          marker-start="url(#arrow-left)"
          marker-end="url(#arrow-right)"
        />
        <text
          :x="scaledX(x0 + totalWidth / 2)"
          :y="scaledY(y0 - 45)"
          font-size="16"
          text-anchor="middle"
        >
          {{ totalWidth }} cm
        </text>

        <!-- 水槽 -->

        <SinkRect
          v-for="sink in activeSinks"
          :key="sink.index"
          :x="x0 + sink.xRef.value"
          :y="y0 + depth - sink.depth.value - sink.sinkFront.value"
          :x0="x0"
          :index="sink.index"
          :width="sink.width.value"
          :height="sink.depth.value"
          :radius="sink.radius.value"
          :scale="scale"
          :sinkFront="sink.sinkFront.value"
        />
        <!-- 火爐 -->

        <StoveRect
          v-for="stove in activeStoves"
          :key="stove.index"
          :x="x0 + stove.xRef.value"
          :y="y0 + depth - stove.depth.value - stove.stoveFront.value"
          :x0="x0"
          :index="stove.index"
          :width="stove.width.value"
          :height="stove.depth.value"
          :radius="stove.radius.value"
          :scale="scale"
          :stoveFront="stove.stoveFront.value"
        />

        <!-- 左標線 -->
        <line
          v-if="left_label"
          :x1="scaledX(x0 - 19)"
          :y1="scaledY(y0)"
          :x2="scaledX(x0 - 19)"
          :y2="scaledY(y0 + depth)"
          stroke="black"
          marker-start="url(#arrow-left)"
          marker-end="url(#arrow-right)"
        />
        <text
          v-if="left_label"
          :x="scaledX(x0 - 25)"
          :y="scaledY(y0 + depth / 2 + 5)"
          font-size="12"
          text-anchor="middle"
        >
          {{ depth }}
        </text>
        <!-- 右標線 -->
        <line
          v-if="right_label"
          :x1="scaledX(x0 + totalWidth + 17)"
          :y1="scaledY(y0)"
          :x2="scaledX(x0 + totalWidth + 17)"
          :y2="scaledY(y0 + depth)"
          stroke="black"
          marker-start="url(#arrow-left)"
          marker-end="url(#arrow-right)"
        />
        <text
          v-if="right_label"
          :x="scaledX(x0 + totalWidth + 32)"
          :y="scaledY(y0 + depth / 2 + 5)"
          font-size="12"
          text-anchor="middle"
        >
          {{ depth }}
        </text>
        <!-- 後靠牆 -->
        <rect
          v-if="backEndType === '靠牆'"
          :x="scaledX(x0)"
          :y="scaledY(y0 - 2)"
          :width="scaledX(totalWidth)"
          :height="2"
          fill="url(#diagonalHatch)"
        />
        <!-- 後見光  -->
        <TriMark
          v-if="backEndType === '見光'"
          :cx="scaledX(x0 + totalWidth / 2)"
          :cy="scaledY(y0 - 25)"
          :size="6"
          direction="down"
          color="black"
        />
        <!-- 後靠牆+背牆 -->
        <rect
          v-if="backEndType === '靠牆+背牆'"
          :x="scaledX(x0)"
          :y="scaledY(y0 - 2)"
          :width="scaledX(totalWidth)"
          :height="2"
          fill="url(#diagonalHatch)"
        />
        <line
          v-if="backEndType === '靠牆+背牆'"
          :x1="scaledX(x0)"
          :y1="scaledY(y0 + 1)"
          :x2="scaledX(x0 + totalWidth)"
          :y2="scaledY(y0 + 1)"
          stroke="black"
        />
        <!-- 前靠牆 -->
        <rect
          v-if="frontEndType === '靠牆'"
          :x="scaledX(x0)"
          :y="scaledY(y0 + depth)"
          :width="scaledX(totalWidth)"
          :height="2"
          fill="url(#diagonalHatch)"
        />
        <!-- 前見光  -->
        <TriMark
          v-if="frontEndType === '見光'"
          :cx="scaledX(x0 + totalWidth / 2)"
          :cy="scaledY(y0 + depth + 25)"
          :size="6"
          direction="up"
          color="black"
        />

        <TriMark
          v-if="leftEndType === '見光'"
          :cx="scaledX(cx - 4)"
          :cy="scaledY(cy - depth / 2)"
          :size="6"
          direction="right"
          color="black"
        />
        <TriDiamond
          v-if="leftEndType === '與桶身齊'"
          :cx="scaledX(cx - 4)"
          :cy="scaledY(cy - depth / 2)"
          :size="6"
          direction="right"
          color="black"
        />
        <TriMark
          v-if="rightEndType === '見光'"
          :cx="scaledX(cx + totalWidth + 15)"
          :cy="scaledY(cy - depth / 2)"
          :size="6"
          direction="left"
          color="black"
        />
        <TriDiamond
          v-if="rightEndType === '與桶身齊'"
          :cx="scaledX(cx + totalWidth + 15)"
          :cy="scaledY(cy - depth / 2)"
          :size="6"
          direction="left"
          color="black"
        />
        <!-- 左牆圖示 -->
        <template v-if="leftEndType === '牆' || leftEndType === '側板'">
          <rect
            :x="scaledX(x0 - 2)"
            :y="scaledY(y0)"
            :width="scaledX(2)"
            :height="scaledY(depth - leftEdgeLength)"
            fill="url(#diagonalHatch)"
          />

          <text
            v-if="leftEndType === '牆'"
            :x="scaledX(x0 - 8)"
            :y="scaledY(y0 + depth / 2)"
            font-size="12"
            text-anchor="middle"
          >
            {{ leftEndType.charAt(0) }}
          </text>

          <text
            v-if="leftEndType === '側板'"
            :x="scaledX(x0 - 8)"
            :y="scaledY(y0 + depth / 2 - 6)"
            font-size="12"
            text-anchor="middle"
          >
            {{ leftEndType.charAt(0) }}
          </text>

          <text
            v-if="leftEndType === '側板'"
            :x="scaledX(x0 - 8)"
            :y="scaledY(y0 + depth / 2 + 6)"
            font-size="12"
            text-anchor="middle"
          >
            {{ leftEndType.charAt(1) }}
          </text>

          <!-- 左側封邊菱形標註 -->
          <PointDiamond
            v-if="
              (leftEndType === '牆' || leftEndType === '側板') &&
              leftEdgeLength > 0
            "
            :cx="cx + 2"
            :cy="cy - leftEdgeLength / 2"
            :scale="scale"
            :color="'blue'"
          />
          <!-- 封邊數字 -->
          <text
            v-if="
              (leftEdgeLength > 0 && leftEndType === '牆') ||
              leftEndType === '側板'
            "
            :x="scaledX(cx + 2)"
            :y="scaledY(cy - leftEdgeLength / 2) + 16"
            font-size="10"
            text-anchor="middle"
          >
            {{ leftEdgeLength }}
          </text>
        </template>

        <!-- 右牆圖示 -->
        <template v-if="rightEndType === '牆' || rightEndType === '側板'">
          <rect
            :x="scaledX(x0 + totalWidth)"
            :y="scaledY(y0)"
            :width="scaledX(2)"
            :height="scaledY(depth - rightEdgeLength)"
            fill="url(#diagonalHatch)"
          />

          <text
            v-if="rightEndType === '牆'"
            :x="scaledX(x0 + totalWidth + 8)"
            :y="scaledY(y0 + depth / 2)"
            font-size="12"
            text-anchor="middle"
          >
            {{ rightEndType.charAt(0) }}
          </text>

          <text
            v-if="rightEndType === '側板'"
            :x="scaledX(x0 + totalWidth + 8)"
            :y="scaledY(y0 + depth / 2 - 6)"
            font-size="12"
            text-anchor="middle"
          >
            {{ rightEndType.charAt(0) }}
          </text>

          <text
            v-if="rightEndType === '側板'"
            :x="scaledX(x0 + totalWidth + 8)"
            :y="scaledY(y0 + depth / 2 + 6)"
            font-size="12"
            text-anchor="middle"
          >
            {{ rightEndType.charAt(1) }}
          </text>

          <!-- 左側封邊菱形標註 -->
          <PointDiamond
            v-if="
              (rightEndType === '牆' || rightEndType === '側板') &&
              rightEdgeLength > 0
            "
            :cx="cx + totalWidth + 10"
            :cy="cy - rightEdgeLength / 2"
            :scale="scale"
            :color="'blue'"
          />
          <!-- 封邊數字 -->
          <text
            v-if="
              (rightEdgeLength > 0 && rightEndType === '牆') ||
              rightEndType === '側板'
            "
            :x="scaledX(cx + totalWidth + 10)"
            :y="scaledY(cy - rightEdgeLength / 2) + 16"
            font-size="10"
            text-anchor="middle"
          >
            {{ rightEdgeLength }}
          </text>

          <g v-if="cutPosition">
            <!-- 垂直接線 -->
            <line
              :x1="scaleX(cutPosition)"
              y1="0"
              :x2="scaleX(cutPosition)"
              :y2="canvasHeight"
              stroke="red"
              stroke-dasharray="4,2"
            />
            <!-- 尺寸標示 -->
            <text
              :x="scaleX(cutPosition)"
              :y="-10"
              text-anchor="middle"
              fill="red"
              font-size="12"
            >
              {{ cutPosition }} cm
            </text>
          </g>
        </template>
        <defs>
          <marker
            id="arrow-left"
            markerWidth="6"
            markerHeight="6"
            refX="0"
            refY="3"
            orient="auto"
          >
            <path d="M6,0 L0,3 L6,6" fill="black" />
          </marker>
          <marker
            id="arrow-right"
            markerWidth="6"
            markerHeight="6"
            refX="6"
            refY="3"
            orient="auto"
          >
            <path d="M0,0 L6,3 L0,6" fill="black" />
          </marker>
          <pattern
            id="diagonalHatch"
            patternUnits="userSpaceOnUse"
            width="5"
            height="4"
          >
            <path d="M0,0 l6,6" stroke="black" stroke-width="1" />
          </pattern>
        </defs>
      </g>
    </svg>
  </div>
</template>

<script setup>
import { ref, computed, watch } from "vue";
import PointDiamond from "./PointDiamond.vue";
import TriMark from "./TriMark.vue";
import TriDiamond from "./TriDiamond.vue";
import SinkRect from "./SinkRect.vue";
import StoveRect from "./StoveRect.vue";

import { useEstimateStore } from "@/store/estimate";

const usePrice = useEstimateStore();

console.log(usePrice.price[0]["price"]);
const x0 = 100;
const y0 = 100;
const cutPosition = ref(180);
const scale = ref(2.5);
const left_label = ref(true);
const right_label = ref(true);
const back_label = ref(true);
const scaledX = (x) => x * scale.value;
const scaledY = (y) => y * scale.value;
const checkWater1 = ref(true);
const checkWater2 = ref(false);
const checkWater3 = ref(false);
const checkStove1 = ref(true);
const checkStove2 = ref(false);
const checkStove3 = ref(false);
const svgWidth = computed(() => scaledX(1200));
const svgHeight = computed(() => scaledY(400));

const leftEndType = ref("見光");
const leftEdgeLength = ref(0);
const rightEndType = ref("見光");
const rightEdgeLength = ref(0);
const backEndType = ref("靠牆");
const frontEndType = ref("見光");
const plusL = ref(0);
const plusR = ref(0);
const depth = ref(60);
const sink1X = ref(75);
const sink2X = ref(75);
const sink3X = ref(75);
const stove1X = ref(225);
const stove2X = ref(225);
const stove3X = ref(225);
const boxInput = ref("30,90,60,90");

const sink1Width = ref(72);
const sink1Depth = ref(45);
const sink1Radius = ref(3);
const sink1Front = ref(7);
const sink2Width = ref(72);
const sink2Depth = ref(45);
const sink2Radius = ref(3);
const sink2Front = ref(7);
const sink3Width = ref(72);
const sink3Depth = ref(45);
const sink3Radius = ref(3);
const sink3Front = ref(7);
const stove1Width = ref(67);
const stove1Depth = ref(35);
const stove1Radius = ref(8.5);
const stove1Front = ref(11);
const stove2Width = ref(67);
const stove2Depth = ref(35);
const stove2Radius = ref(8.5);
const stove2Front = ref(11);
const stove3Width = ref(67);
const stove3Depth = ref(35);
const stove3Radius = ref(8.5);
const stove3Front = ref(11);

const cx = computed(() => x0 - 6);
const cy = computed(() => y0 + depth.value);
const size = 4;

const box = computed(() => {
  const segments = boxInput.value
    .split(",")
    .map((s) => parseFloat(s.trim()))
    .filter((n) => !isNaN(n));
  return [plusL.value, ...segments, plusR.value].filter(
    (n) => !isNaN(n) && n > 0
  );
});

const totalWidth = computed(() => {
  return box.value.reduce((sum, v) => sum + v, 0);
});

const boxSegments = computed(() => {
  const result = [];
  let cursor = x0;
  for (const len of box.value) {
    cursor += len;
    result.push(cursor);
  }
  return result;
});

const boxStartPositions = computed(() => {
  const result = [];
  let cursor = x0;
  for (const len of box.value) {
    result.push(cursor);
    cursor += len;
  }
  return result;
});

const sinks = computed(() => [
  {
    index: 1,
    xRef: sink1X,
    check: checkWater1,
    width: sink1Width,
    depth: sink1Depth,
    radius: sink1Radius,
    sinkFront: sink1Front,
  },
  {
    index: 2,
    xRef: sink2X,
    check: checkWater2,
    width: sink2Width,
    depth: sink2Depth,
    radius: sink2Radius,
    sinkFront: sink2Front,
  },
  {
    index: 3,
    xRef: sink3X,
    check: checkWater3,
    width: sink3Width,
    depth: sink3Depth,
    radius: sink3Radius,
    sinkFront: sink3Front,
  },
]);
const stoves = computed(() => [
  {
    index: 1,
    xRef: stove1X,
    check: checkStove1,
    width: stove1Width,
    depth: stove1Depth,
    radius: stove1Radius,
    stoveFront: stove1Front,
  },
  {
    index: 2,
    xRef: stove2X,
    check: checkStove2,
    width: stove2Width,
    depth: stove2Depth,
    radius: stove2Radius,
    stoveFront: stove2Front,
  },
  {
    index: 3,
    xRef: stove3X,
    check: checkStove3,
    width: stove3Width,
    depth: stove3Depth,
    radius: stove3Radius,
    stoveFront: stove3Front,
  },
]);
const activeStoves = computed(
  () => stoves.value.filter((stove) => stove.check.value) // ✅ 注意：check 是 ref，要取 `.value`
);

const activeSinks = computed(() =>
  sinks.value.filter((sink) => sink.check.value)
);

watch([leftEndType, rightEndType], ([newLeft, newRight]) => {
  if (newLeft === "側板" || newLeft === "牆") {
    plusL.value = 0;
  }
  if (newRight === "側板" || newRight === "牆") {
    plusR.value = 0;
  }
});

const svgRef = ref(null);

function copyToClipboard() {
  const svgElement = svgRef.value;
  const g = svgElement?.querySelector("#mainContent");
  if (!g) {
    alert("找不到 mainContent！");
    return;
  }

  const { x, y, width, height } = g.getBBox();
  const padding = 20;
  const newX = x - padding;
  const newY = y - padding;
  const newWidth = width + padding * 2;
  const newHeight = height + padding * 2;

  // 建立新的 SVG
  const svgNS = "http://www.w3.org/2000/svg";
  const newSvg = document.createElementNS(svgNS, "svg");
  newSvg.setAttribute("xmlns", svgNS);
  newSvg.setAttribute("viewBox", `${newX} ${newY} ${newWidth} ${newHeight}`);
  newSvg.setAttribute("width", newWidth);
  newSvg.setAttribute("height", newHeight);

  // 白色背景
  const bg = document.createElementNS(svgNS, "rect");
  bg.setAttribute("x", newX);
  bg.setAttribute("y", newY);
  bg.setAttribute("width", newWidth);
  bg.setAttribute("height", newHeight);
  bg.setAttribute("fill", "white");
  newSvg.appendChild(bg);

  // 複製 mainContent 進來
  const clonedG = g.cloneNode(true);
  newSvg.appendChild(clonedG);

  // 轉成 PNG 貼上剪貼簿
  const svgData = new XMLSerializer().serializeToString(newSvg);
  const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);

  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = newWidth;
    canvas.height = newHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);

    canvas.toBlob((blob) => {
      if (!blob) return;
      navigator.clipboard
        .write([new ClipboardItem({ "image/png": blob })])
        .then(() => {
          alert("✅ 已複製到剪貼簿");
        })
        .catch((err) => {
          console.error("❌ 無法寫入剪貼簿", err);
        });
    });

    URL.revokeObjectURL(url);
  };

  img.onerror = () => alert("❌ 圖片載入失敗");
  img.src = url;
}
</script>

<style scoped>
svg {
  background-color: #fdfdfd;
}
</style>
