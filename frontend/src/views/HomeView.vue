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
import { useRouter } from "vue-router";
import { signInWithGoogle, logout, subscribeAuthState } from "../firebase";

const user = ref(null);
const router = useRouter();

const unsubscribe = subscribeAuthState((u) => {
  user.value = u;
  // 若登入成功且有暫存的目標 URL，自動帶回
  if (u) {
    try {
      const target = sessionStorage.getItem("postLoginRedirect");
      if (target && target !== "/") {
        sessionStorage.removeItem("postLoginRedirect");
        router.replace(target).catch(() => {});
      }
    } catch (_e) {
      // ignore
    }
  }
});

onUnmounted(() => {
  if (unsubscribe) unsubscribe();
});

function handleLogin() {
  signInWithGoogle().catch((err) => {
    console.error("Google sign-in failed:", err);
    const code = String(err?.code || "").toLowerCase();
    if (code === "auth/unauthorized-domain") {
      alert("登入失敗：目前網址未加入 Firebase Auth 授權網域。請在 Firebase Console > Authentication > Settings > Authorized domains 新增目前主機。\n目前主機：" + window.location.hostname);
      return;
    }
    if (code === "auth/popup-blocked") {
      alert("登入失敗：瀏覽器封鎖了登入彈出視窗，請允許此網站開啟彈出視窗後再試。");
      return;
    }
    if (code === "auth/popup-closed-by-user") {
      alert("登入已取消：登入視窗被關閉。");
      return;
    }
    alert("登入失敗：" + (err?.message || "未知錯誤"));
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
