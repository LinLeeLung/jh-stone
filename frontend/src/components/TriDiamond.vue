<template>
    <g>
      <!-- 外三角形 -->
      <polygon :points="trianglePoints" :stroke="color" fill="none" stroke-width="2" />
  
      <!-- 內菱形 -->
      <polygon :points="diamondPoints" :fill="color" />
    </g>
  </template>
  
  <script setup>
  import { computed } from 'vue'
  
  const props = defineProps({
    cx: Number, // 中心 X
    cy: Number, // 中心 Y
    size: { type: Number, default: 10 },
    color: { type: String, default: 'black' },
  })
  
  const trianglePoints = computed(() => {
    const s = props.size
    const { cx, cy } = props
    return [
      `${cx},${cy - s}`, // 上點
      `${cx - s * Math.sin(Math.PI / 3)},${cy + s / 2}`, // 左下
      `${cx + s * Math.sin(Math.PI / 3)},${cy + s / 2}` // 右下
    ].join(' ')
  })
  
  const diamondPoints = computed(() => {
    const s = props.size / 3
    const { cx, cy } = props
    return [
      `${cx},${cy - s}`,
      `${cx + s},${cy}`,
      `${cx},${cy + s}`,
      `${cx - s},${cy}`
    ].join(' ')
  })
  </script>
  