<template>
    <g>
      <!-- 水平尺寸線 -->
      <line
        :x1="scaledX(x0)"
        :x2="scaledX(cx)"
        :y1="scaledY(153 - 65)"
        :y2="scaledY(153 - 65)"
        stroke="black"
      />
  
      <!-- 垂直引線 -->
      <line
        :x1="scaledX(cx)"
        :x2="scaledX(cx)"
        :y1="scaledY(153 - 65)"
        :y2="scaledY(153-55)"

        stroke="black"
      />
  
      <!-- 置中文字 -->
      <text
        :x="scaledX( cx )"
        :y="scaledY(153 - (60+10))"
        font-size="16"
        text-anchor="middle"
      >{{ label }}</text>
    </g>
  </template>
  
  <script setup>
  import { computed , watch} from 'vue'
  
  const props = defineProps({
    cx: Number,        // 中心點 X 座標（畫面座標）
    x0: Number,        // 起始座標 x0
    y0: Number,        // 基準高度 y0
    label: String,     // 顯示文字
    scale: Number,      // 縮放倍率
    counterTopDepth:{
    type: Number,
    default: 60  // ✅ 枱面深度預設值為 60 cm 
  }
  })
  
  const scaledX = x => x * props.scale
  const scaledY = y => y * props.scale
 
  // watch(props,(newvalue)=>{
     
  //    const { counterTopDepth,y0 } = props
  //    console.log("y0=",y0) 
  // })
  </script>
  
  <style scoped>
  </style>
  