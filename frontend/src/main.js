import { createApp } from "vue";
import App from "./App.vue";
import router from "./router"; // 引入 router
import { createPinia } from "pinia";
import "./style.css";

const app = createApp(App);
app.use(router); // 使用 router
app.use(createPinia());
app.mount("#app");
