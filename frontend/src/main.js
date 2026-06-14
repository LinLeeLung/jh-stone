import { createApp } from "vue";
import App from "./App.vue";
import router from "./router"; // 引入 router
import { createPinia } from "pinia";
import "./style.css";
import { auth } from "./firebase";
import { signInWithCustomToken } from "firebase/auth";

// When Puppeteer injects a custom token (for backend PDF rendering), auto sign-in
// before mounting so the confirmation page loads with a valid auth session.
async function maybeSignInWithCustomToken() {
  const ct = window.__puppeteerCustomToken;
  if (!ct) return;
  try {
    await signInWithCustomToken(auth, ct);
  } catch (e) {
    console.warn("Puppeteer auto sign-in failed:", e?.message);
  }
}

maybeSignInWithCustomToken().finally(() => {
  const app = createApp(App);
  app.use(router); // 使用 router
  app.use(createPinia());
  app.mount("#app");
});
