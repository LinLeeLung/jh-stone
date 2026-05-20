<template>
  <div class="drawing-layout">
    <nav class="sub-nav">
      <RouterLink class="sub-link" to="/drawing/straight">一字型</RouterLink>
      <RouterLink class="sub-link" to="/drawing/l-shape">L 型</RouterLink>
      <RouterLink class="sub-link" to="/drawing/m-shape">M 型</RouterLink>
      <RouterLink class="sub-link" to="/drawing/island">中島</RouterLink>
    </nav>
    <div class="drawing-body">
      <RouterView />
    </div>
  </div>
</template>

<script setup>
import { RouterLink, RouterView } from "vue-router";
</script>

<style scoped>
.drawing-layout {
  padding: 0;
}
.sub-nav {
  display: flex;
  gap: 4px;
  background: #f1f3f5;
  border-bottom: 1px solid #d0d4d9;
  padding: 6px 10px;
  position: sticky;
  top: 0;
  z-index: 5;
}
.sub-link {
  display: inline-block;
  padding: 6px 14px;
  color: #1f4bb8;
  text-decoration: none;
  font-size: 15px;
  font-weight: 500;
  border-radius: 6px 6px 0 0;
  border: 1px solid transparent;
}
.sub-link:hover {
  background: #e9ecef;
}
.sub-link.router-link-active {
  background: #ffffff;
  border: 1px solid #d0d4d9;
  border-bottom-color: #ffffff;
  color: #0b2e75;
  margin-bottom: -1px;
}
.drawing-body {
  padding: 0;
}
</style>
