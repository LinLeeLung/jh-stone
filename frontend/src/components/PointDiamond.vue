<template>
  <polygon
    :points="`
      ${scaledX(cx - size)},${scaledY(cy)}
      ${scaledX(cx)},${scaledY(cy - size)}
      ${scaledX(cx + size)},${scaledY(cy)}
      ${scaledX(cx)},${scaledY(cy + size)}
    `"
    :fill="color"
  />
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  cx: Number,
  cy: Number,
  scale: {
    type: Number,
    default: 2.5,
  },
  size: {
    type: Number,
    default: 3,
  },
  color: {
    type: String,
    default: 'black',
  },
})

const scaledX = x => x * props.scale
const scaledY = y => y * props.scale
</script>
