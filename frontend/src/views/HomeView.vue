<template>
  <section class="page-card home-view">
    <div class="page-head">
      <h1>🚀 我的第一個 Vue + Firebase 頁面</h1>
      <p class="muted-text">目前位置：首頁</p>
    </div>

    <div v-if="user">
      <p class="welcome-text">
        歡迎，{{ user.displayName }} (<a href="#" @click.prevent="handleLogout"
          >登出</a
        >)
      </p>
    </div>
    <div v-else>
      <button class="btn-query" @click="handleLogin">使用 Google 登入</button>
    </div>
  </section>
</template>

<script setup>
import { ref, onUnmounted } from "vue";
import { signInWithGoogle, logout, subscribeAuthState } from "../firebase";

const user = ref(null);

const unsubscribe = subscribeAuthState((u) => {
  user.value = u;
});

onUnmounted(() => {
  if (unsubscribe) unsubscribe();
});

function handleLogin() {
  signInWithGoogle().catch((err) => {
    console.error("Google sign-in failed:", err);
    alert("登入失敗，請檢查瀏覽器設定。");
  });
}

function handleLogout() {
  logout().catch((err) => {
    console.error("Sign-out failed:", err);
  });
}
</script>

<style scoped>
.home-view {
  text-align: center;
  padding-top: clamp(1.3rem, 4vw, 3rem);
  padding-bottom: clamp(1.3rem, 4vw, 3rem);
}

.welcome-text {
  font-size: 1rem;
}
</style>
