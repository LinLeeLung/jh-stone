<template>
    <g v-if="x !== null">
      <!-- 水槽主體 -->
      <rect
        :x="scaledX(x - width / 2)"
        :y="scaledY(y)"
        :width="scaledX(width)"
        :height="scaledY(height)"
        :rx="scaledX(radius)"
        :ry="scaledY(radius)"
        fill="white"
        stroke="blue"
      />
  
      <!-- 水槽文字 -->
      <text
        :x="scaledX(x)"
        :y="scaledY(y + height / 2)"
        font-size="12"
        text-anchor="middle"
        dominant-baseline="middle"
      >水槽{{ index }}</text>
  
      <!-- 中心線標記 -->
      <CenterMark
        
        :x0="x0"
        :cx="x"
        :y0="y + height"
        :label="`水中${x-x0}`"
        :scale="scale"
        :counterTopDepth="depth"
      />
    </g>
  </template>
  
  <script setup>
  import { computed } from 'vue'
  import CenterMark from './CenterMark.vue'
  
  const props = defineProps({
    x: Number,         // 中心點 X
    y: Number,         // 水槽 Y 座標
    depth:Number, //   枱面深
    width: Number,     // 水槽寬度
    height: Number,    // 水槽高度
    radius: Number,    // 圓角
    x0: Number,        // 起始座標
    index: Number,     // 第幾個水槽
    scale: Number      // 縮放倍率
  })
  
  const scaledX = x => x * props.scale
  const scaledY = y => y * props.scale
  </script>
  