<template>
  <div class="drawing-page">
    <div class="toolbar">
      <div class="row">
        <h2>中島繪圖</h2>
      </div>
      <div class="row">
        左凸
        <input v-model.number="form.plusLeft" type="number" class="number" @change="redraw" />
        桶身
        <input
          v-for="index in 7"
          :key="`box-${index}`"
          v-model.number="form[`box${index}`]"
          type="number"
          class="number compact"
          @change="redraw"
        />
        右凸
        <input v-model.number="form.plusRight" type="number" class="number" @change="redraw" />
        深度
        <input v-model.number="form.depth" type="number" class="number" @change="redraw" />
        總長
        <input :value="totalLength" type="number" class="number readonly" readonly />
      </div>
      <div class="row">
        側腳高
        <input v-model.number="form.legHeight" type="number" class="number" @change="redraw" />
        前倒包
        <input v-model.number="form.frontWrap" type="number" class="number" @change="redraw" />
        後倒包
        <input v-model.number="form.backWrap" type="number" class="number" @change="redraw" />
        側腳厚
        <input v-model.number="form.legThickness" type="number" class="number" @change="redraw" />
        角度
        <input v-model.number="form.legAngle" type="number" class="number" @change="redraw" />
        側腳模式
        <select v-model="form.legMode" class="mode" @change="redraw">
          <option value="none">無</option>
          <option value="L">左</option>
          <option value="B">左右</option>
          <option value="R">右</option>
        </select>
        <button @click="resetDefaults">重設</button>
      </div>
    </div>

    <div ref="svgContainerRef" class="svg-container"></div>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from "vue";
import { SVG } from "@svgdotjs/svg.js";

const svgContainerRef = ref(null);
let draw = null;

const ORIGIN_X = 260;
const ORIGIN_Y = 160;

const form = reactive({
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
  legHeight: 90,
  legThickness: 6,
  frontWrap: 12,
  backWrap: 12,
  legAngle: 60,
  legMode: "B",
});

const totalLength = computed(() => getIslandGeometry().totalLength);

onMounted(() => {
  draw = SVG().addTo(svgContainerRef.value).size(1500, 900);
  redraw();
});

function resetDefaults() {
  form.plusLeft = 0;
  form.box1 = 0;
  form.box2 = 106;
  form.box3 = 100;
  form.box4 = 86;
  form.box5 = 0;
  form.box6 = 0;
  form.box7 = 0;
  form.plusRight = 0;
  form.depth = 100;
  form.legHeight = 90;
  form.legThickness = 6;
  form.frontWrap = 12;
  form.backWrap = 12;
  form.legAngle = 60;
  form.legMode = "B";
  redraw();
}

function redraw() {
  if (!draw) return;
  draw.clear();

  const geometry = getIslandGeometry();
  const legHeight = Math.max(1, Number(form.legHeight) || 0);
  const legThickness = Math.max(1, Number(form.legThickness) || 0);
  const frontWrap = Math.max(0, Number(form.frontWrap) || 0);
  const backWrap = Math.max(0, Number(form.backWrap) || 0);
  const legAngle = Math.max(1, Number(form.legAngle) || 0);

  drawIslandBody(ORIGIN_X, ORIGIN_Y, geometry);

  drawLegacyIslandLegs({
    totalLength: geometry.totalLength,
    depth: geometry.depth,
    legHeight,
    legThickness,
    frontWrap,
    backWrap,
    legAngle,
    legMode: form.legMode,
  });

  drawTopLengthMarker(ORIGIN_X, ORIGIN_Y, geometry.totalLength);
  drawRightDepthMarker(ORIGIN_X + geometry.totalLength, ORIGIN_Y, geometry.depth);
}

function getIslandGeometry() {
  const segments = [
    { key: "plusLeft", type: "plusLeft", value: Math.max(0, Number(form.plusLeft) || 0) },
    { key: "box1", type: "box", value: Math.max(0, Number(form.box1) || 0) },
    { key: "box2", type: "box", value: Math.max(0, Number(form.box2) || 0) },
    { key: "box3", type: "box", value: Math.max(0, Number(form.box3) || 0) },
    { key: "box4", type: "box", value: Math.max(0, Number(form.box4) || 0) },
    { key: "box5", type: "box", value: Math.max(0, Number(form.box5) || 0) },
    { key: "box6", type: "box", value: Math.max(0, Number(form.box6) || 0) },
    { key: "box7", type: "box", value: Math.max(0, Number(form.box7) || 0) },
    { key: "plusRight", type: "plusRight", value: Math.max(0, Number(form.plusRight) || 0) },
  ].filter((segment) => segment.value > 0);

  const totalLength = Math.max(
    1,
    segments.reduce((sum, segment) => sum + segment.value, 0),
  );

  return {
    depth: Math.max(1, Number(form.depth) || 0),
    totalLength,
    segments,
  };
}

function drawLegacyIslandLegs({
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
    drawLegacyLegLeft({
      x: ORIGIN_X,
      y: ORIGIN_Y,
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
    drawLegacyLegRight({
      x: ORIGIN_X + totalLength,
      y: ORIGIN_Y,
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
    drawLegacyLegBoth({
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

function drawLegacyLegBoth(args) {
  drawIslandLegB({ x: ORIGIN_X, y: ORIGIN_Y, ...args });
}

function drawLegacyLegLeft({
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
  drawIslandLegL({
    x,
    y,
    totalLength,
    depth,
    legHeight,
    legThickness,
    frontWrap,
    backWrap,
    legAngle,
  });
}

function drawLegacyLegRight({
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
  drawIslandLegR({
    x,
    y,
    totalLength,
    depth,
    legHeight,
    legThickness,
    frontWrap,
    backWrap,
    legAngle,
  });
}

function drawIslandBody(x0, y0, geometry) {
  const { totalLength, depth, segments } = geometry;

  draw
    .rect(totalLength, depth)
    .move(x0, y0)
    .fill("white")
    .stroke({ width: 1, color: "black" });

  let cursorX = x0;
  segments.forEach((segment, index) => {
    cursorX += segment.value;
    if (index < segments.length - 1) {
      drawLine(point(cursorX, y0 + depth), point(cursorX, y0 + depth + 2));
    }
    if (segment.type === "box") {
      drawCenteredText(segment.value, cursorX - segment.value / 2, y0 + depth + 16, 10);
    }
  });

  if (Number(form.plusLeft) > 0) {
    drawText(`+${Number(form.plusLeft)}`, x0 - 16, y0 + depth + 14, 10);
  }
  if (Number(form.plusRight) > 0) {
    drawText(`+${Number(form.plusRight)}`, x0 + totalLength + 2, y0 + depth + 14, 10);
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

  const dh = (frontWrap - 12) / 2;
  const dh2 = (backWrap - 12) / 2;
  const pa = point(p2.x + 18, p2.y - Math.tan(angleRad) * 18 - 2 - dh);
  const pb = point(p9.x + 18, p9.y - Math.tan(angleRad) * 18 - 2 - dh2);

  drawAngledTextSized(`${frontWrap}倒包石`, pa.x, pa.y, 6, legAngle);
  drawAngledTextSized(`${backWrap}倒包石`, pb.x, pb.y, 6, legAngle);
  drawText(String(legThickness), p21.x, p21.y, 8);
  drawPolyline([p0, p1, p2, p6]);
  drawLine(p2, p3);
  drawLine(p3, p4);
  drawLine(p5, p14);
  drawLine(p14, p15);
  drawDashedLine(p7, p8);
  drawDashedLine(p9, p10);
}

function drawIslandLegB({ x, y, totalLength, depth, legHeight, legThickness, frontWrap, backWrap, legAngle }) {
  const angleRad = (legAngle * Math.PI) / 180;
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);

  const p0 = point(x, y);
  const p1 = point(p0.x - legHeight * cos, p0.y + legHeight * sin);
  const p2 = point(p1.x, p1.y + depth);
  const p6 = point(p0.x, p0.y + depth);
  const p3 = point(p2.x + legThickness, p2.y);
  const p4 = point(p3.x + (legHeight - legThickness) * cos, p3.y - (legHeight - legThickness) * sin);
  const p5 = point(p4.x - legThickness, p4.y);
  const p14 = point(p5.x + totalLength, p5.y);
  const p15 = point(p14.x + legThickness * cos, p14.y - legThickness * sin);
  const p7 = point(p2.x, p2.y - frontWrap);
  const p8 = point(p0.x, p0.y + depth - frontWrap);
  const p9 = point(p1.x, p1.y + backWrap);
  const p10 = point(p0.x, p0.y + backWrap);
  const p21 = point(p2.x, p2.y + 10);
  const p11 = point(p14.x - (legHeight - legThickness) * cos, p14.y + (legHeight - legThickness) * sin);
  const p12 = point(p11.x - legThickness, p11.y);
  const p13 = point(p14.x - legThickness, p14.y);
  const p20 = point(p12.x, p14.y);
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
    if (b3.y > p14.y) {
      drawLine(b1, b3);
    }
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
  drawAngledTextSized(String(legHeight), p30.x, p30.y + 15, 16, legAngle);

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

function drawIslandLegR({ x, y, totalLength, depth, legHeight, legThickness, frontWrap, backWrap, legAngle }) {
  const angleRad = (legAngle * Math.PI) / 180;
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);

  const p0 = point(x - totalLength, y);
  const p1 = point(p0.x - legHeight * cos, p0.y + legHeight * sin);
  const p2 = point(p1.x, p1.y + depth);
  const p3 = point(p2.x + legThickness, p2.y);
  const p4 = point(p3.x + (legHeight - legThickness) * cos, p3.y - (legHeight - legThickness) * sin);
  const p5 = point(p4.x - legThickness, p4.y);
  const p14 = point(p5.x + totalLength, p5.y);
  const p15 = point(p14.x + legThickness * cos, p14.y - legThickness * sin);
  const p11 = point(p14.x - (legHeight - legThickness) * cos, p14.y + (legHeight - legThickness) * sin);
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
    if (b3.y > p14.y) {
      drawLine(b1, b3);
    }
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
  const pb = point(p1.x + 18, p1.y + backWrap - Math.tan(angleRad) * 18 - 2 - dh2);
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
  return point(p.x + distance * Math.cos(angleRad), p.y - distance * Math.sin(angleRad));
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
  for (let i = 0; i < points.length - 1; i += 1) {
    drawLine(points[i], points[i + 1]);
  }
}

function drawText(text, x, y, size = 12, rotate = 0) {
  const node = draw.text(String(text)).font({ size, family: "DFKai-sb" });
  node.move(x, y);
  if (rotate) node.rotate(-rotate, x, y);
}

function drawCenteredText(text, centerX, y, size = 10) {
  const node = draw.text(String(text)).font({ size, family: "DFKai-sb" });
  const box = node.bbox();
  node.move(centerX - box.width / 2, y);
}

function drawAngledTextSized(text, x, y, size, angle) {
  const node = draw.text(String(text)).font({ size, family: "DFKai-sb" });
  node.move(x, y);
  node.rotate(-angle, x, y);
}

function drawTopLengthMarker(x0, y0, totalLength) {
  const yLine = y0 - 50;
  draw.line(x0, yLine, x0 + totalLength, yLine).stroke({ width: 1, color: "black" });
  draw.line(x0, yLine - 8, x0, yLine + 8).stroke({ width: 1, color: "black" });
  draw
    .line(x0 + totalLength, yLine - 8, x0 + totalLength, yLine + 8)
    .stroke({ width: 1, color: "black" });
  const t = draw.text(String(totalLength)).font({ size: 16, family: "DFKai-sb" });
  const bb = t.bbox();
  t.move(x0 + totalLength / 2 - bb.width / 2, yLine - bb.height - 4);
}

function drawRightDepthMarker(xEdge, y0, depth) {
  const xLine = xEdge + 50;
  draw.line(xLine, y0, xLine, y0 + depth).stroke({ width: 1, color: "black" });
  draw.line(xLine - 8, y0, xLine + 8, y0).stroke({ width: 1, color: "black" });
  draw
    .line(xLine - 8, y0 + depth, xLine + 8, y0 + depth)
    .stroke({ width: 1, color: "black" });
  const t = draw.text(String(depth)).font({ size: 16, family: "DFKai-sb" });
  const bb = t.bbox();
  t.move(xLine + 12, y0 + depth / 2 - bb.height / 2);
}
</script>

<style scoped>
.drawing-page {
  padding: 12px;
}
.toolbar {
  background: #fff7ea;
  border-radius: 8px;
  padding: 10px;
  margin-bottom: 12px;
}
.row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
}
.number {
  width: 5em;
}
.compact {
  width: 4.2em;
}
.readonly {
  background: #f4efe2;
}
.svg-container {
  background: white;
  border: 1px solid #ddd;
  min-height: 760px;
  overflow: auto;
}
input,
button {
  height: 28px;
  padding: 0 6px;
}
label {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.mode {
  height: 28px;
}
</style>
