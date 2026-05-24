<template>
    <polygon
      :points="trianglePoints"
      :fill="color"
    />
  </template>
  
  <script setup>
  import { computed } from 'vue'
  
  const props = defineProps({
    cx: Number,         // 中心點 x
    cy: Number,         // 中心點 y
    size: Number,       // 三角形大小（長度）
    direction: String,  // 尖端方向：'left' | 'right' | 'up' | 'down'
    color: String       // 填色
  })
  
  const trianglePoints = computed(() => {
    const { cx, cy, size, direction } = props
    switch (direction) {
      case 'left':
        return `${cx - size},${cy} ${cx + size},${cy - size} ${cx + size},${cy + size}`
      case 'right':
        return `${cx + size},${cy} ${cx - size},${cy - size} ${cx - size},${cy + size}`
      case 'up':
        return `${cx},${cy - size} ${cx - size},${cy + size} ${cx + size},${cy + size}`
      case 'down':
        return `${cx},${cy + size} ${cx - size},${cy - size} ${cx + size},${cy - size}`
      default:
        return ''
    }
  })
  </script>
  