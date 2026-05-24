<script setup>
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { onMounted, ref, watch } from "vue";

const container = ref(null);

// 可調整參數
const length = ref(292);
const depth = ref(85);
const height = ref(85);
const thickness = ref(6);
const legThickness = ref(6.5);

let scene, camera, renderer, controls, group, labelGroup;

onMounted(() => {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(
    60,
    container.value.clientWidth / container.value.clientHeight,
    1,
    2000
  );
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(container.value.clientWidth, container.value.clientHeight);
  renderer.setClearColor(0xffffff);
  container.value.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;

  const light = new THREE.AmbientLight(0xffffff, 1);
  scene.add(light);

  buildModel();

  camera.position.set(
    length.value * 1.2,
    height.value * 1.2,
    depth.value * 1.8
  );
  controls.target.set(length.value / 2, height.value / 2, depth.value / 2);
  controls.update();

  function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  }
  animate();
});

function createTextLabel(text, position, align = "center") {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  canvas.width = 256;
  canvas.height = 64;
  ctx.fillStyle = "#000";
  ctx.font = "24px sans-serif";
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(40, 10, 1);
  sprite.position.copy(position);
  return sprite;
}

function buildModel() {
  if (group) scene.remove(group);
  group = new THREE.Group();
  if (labelGroup) scene.remove(labelGroup);
  labelGroup = new THREE.Group();

  const material = new THREE.MeshBasicMaterial({ color: 0xdddddd });
  const edgeMaterial = new THREE.LineBasicMaterial({ color: 0x000000 });

  function addBoxWithEdges(w, h, d, position, edgeOffsetY = 0) {
    const geometry = new THREE.BoxGeometry(w, h, d);
    const box = new THREE.Mesh(geometry, material);
    box.position.copy(position);
    group.add(box);

    const edges = new THREE.EdgesGeometry(geometry);
    const line = new THREE.LineSegments(edges, edgeMaterial);
    line.position.copy(position);
    line.position.y += edgeOffsetY;
    group.add(line);
  }

  // 主檯面
  addBoxWithEdges(
    length.value,
    thickness.value,
    depth.value,
    new THREE.Vector3(length.value / 2, height.value, depth.value / 2)
  );
  // 左右腳
  addBoxWithEdges(
    legThickness.value,
    height.value,
    depth.value,
    new THREE.Vector3(legThickness.value / 2, height.value / 2, depth.value / 2)
  );
  addBoxWithEdges(
    legThickness.value,
    height.value,
    depth.value,
    new THREE.Vector3(
      length.value - legThickness.value / 2,
      height.value / 2,
      depth.value / 2
    )
  );

  labelGroup.add(
    createTextLabel(
      `L: ${length.value}cm`,
      new THREE.Vector3(length.value / 2, height.value + 8, depth.value / 2)
    )
  );
  labelGroup.add(
    createTextLabel(
      `D: ${depth.value}cm`,
      new THREE.Vector3(length.value / 2, height.value + 5, depth.value + 10),
      "center"
    )
  );
  labelGroup.add(
    createTextLabel(
      `T: ${thickness.value}cm`,
      new THREE.Vector3(
        length.value / 2,
        height.value + thickness.value / 2,
        depth.value + 15
      )
    )
  );
  labelGroup.add(
    createTextLabel(
      `H: ${height.value}cm`,
      new THREE.Vector3(length.value + 5, height.value / 2, depth.value / 2),
      "left"
    )
  );

  // 倒包石斜線
  const dashedMaterial = new THREE.LineDashedMaterial({
    color: 0x000000,
    dashSize: 2,
    gapSize: 2,
  });

  const drawDiagonal = (x, y1, y2, z1, z2) => {
    const points = [new THREE.Vector3(x, y1, z1), new THREE.Vector3(x, y2, z2)];
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const line = new THREE.Line(geometry, dashedMaterial);
    line.computeLineDistances();
    group.add(line);
  };

  drawDiagonal(0, 0, height.value - 10, 0, depth.value - 10);
  drawDiagonal(length.value, 0, height.value - 10, 0, depth.value - 10);
  labelGroup.add(
    createTextLabel(
      `12倒包石`,
      new THREE.Vector3(
        legThickness.value / 2 + 3,
        height.value - 10,
        depth.value / 2 - 10
      ),
      "center"
    )
  );
  labelGroup.add(
    createTextLabel(
      `12倒包石`,
      new THREE.Vector3(
        length.value - legThickness.value / 2 - 3,
        height.value - 10,
        depth.value / 2 - 10
      ),
      "center"
    )
  );

  controls.target.set(length.value / 2, height.value / 2, depth.value / 2);
  scene.add(group);
  scene.add(labelGroup);
}

watch([length, depth, height, thickness, legThickness], () => {
  buildModel();
});
</script>

<template>
  <div class="p-4 space-y-4">
    <div class="flex gap-4 flex-wrap">
      <label
        >長度(cm):
        <input type="number" v-model.number="length" class="border p-1 w-20"
      /></label>
      <label
        >深度(cm):
        <input type="number" v-model.number="depth" class="border p-1 w-20"
      /></label>
      <label
        >高度(cm):
        <input type="number" v-model.number="height" class="border p-1 w-20"
      /></label>
      <label
        >前厚(cm):
        <input type="number" v-model.number="thickness" class="border p-1 w-20"
      /></label>
      <label
        >腳厚(cm):
        <input
          type="number"
          v-model.number="legThickness"
          class="border p-1 w-20"
      /></label>
    </div>
    <svg
      :width="800"
      :height="500"
      viewBox="0 0 800 500"
      class="border"
      xmlns="http://www.w3.org/2000/svg"
    >
      <!-- 底面檯面 -->
      <polygon
        points="100,300 650,300 650,280 100,280"
        fill="#ddd"
        stroke="black"
      />

      <!-- 左腳 -->
      <polygon
        points="100,280 130,100 150,100 120,280"
        fill="#ddd"
        stroke="black"
      />
      <line
        x1="130"
        y1="100"
        x2="120"
        y2="280"
        stroke="black"
        stroke-dasharray="4"
      />
      <text x="135" y="160" font-size="12" transform="rotate(-65 135,160)">
        12倒包石
      </text>

      <!-- 右腳 -->
      <polygon
        points="650,280 620,100 600,100 630,280"
        fill="#ddd"
        stroke="black"
      />
      <line
        x1="620"
        y1="100"
        x2="630"
        y2="280"
        stroke="black"
        stroke-dasharray="4"
      />
      <text x="615" y="160" font-size="12" transform="rotate(-65 615,160)">
        12倒包石
      </text>

      <!-- 主檯面上標注 -->
      <line x1="100" y1="260" x2="650" y2="260" stroke="black" />
      <text x="360" y="250" font-size="16" :textContent="length + ' cm'" />

      <!-- 檯面切分尺寸 -->
      <line x1="206" y1="260" x2="206" y2="265" stroke="black" />
      <line x1="306" y1="260" x2="306" y2="265" stroke="black" />
      <line x1="392" y1="260" x2="392" y2="265" stroke="black" />
      <text x="160" y="275" font-size="10">106</text>
      <text x="260" y="275" font-size="10">100</text>
      <text x="420" y="275" font-size="10">86</text>

      <!-- 左側垂直尺寸 -->
      <line x1="85" y1="100" x2="85" y2="280" stroke="black" />
      <text
        x="70"
        y="200"
        font-size="16"
        transform="rotate(-90 70,200)"
        :textContent="height + ' cm'"
      />

      <!-- 厚度標示 -->
      <text x="90" y="295" font-size="12" :textContent="thickness + ' cm'" />
    </svg>
  </div>
</template>

<style scoped>
canvas {
  display: block;
}
</style>
