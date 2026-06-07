import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { exec } from "node:child_process";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/postcss";
import { fileURLToPath, URL } from "node:url";

const pkg = JSON.parse(
  readFileSync(resolve(process.cwd(), "package.json"), "utf8"),
);
const buildTime = new Intl.DateTimeFormat("zh-TW", {
  timeZone: "Asia/Taipei",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
})
  .format(new Date())
  .replace(/\//g, "-");
const appVersion = `v${pkg.version} (${buildTime} 台灣時間)`;

export default defineConfig({
  plugins: [
    vue(),
    {
      name: "open-chrome",
      configureServer(server) {
        server.httpServer?.once("listening", () => {
          exec(
            '"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" http://localhost:5173',
          );
        });
      },
    },
    {
      name: "emit-version-json",
      generateBundle() {
        this.emitFile({
          type: "asset",
          fileName: "version.json",
          source: JSON.stringify(
            {
              version: appVersion,
              builtAtUtc: buildTime,
            },
            null,
            2,
          ),
        });
      },
    },
  ],
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  server: {
    host: true, // 監聽 0.0.0.0，區域網路手機可連
    port: 5173,
    proxy: {
      "/legacy-draw-api": {
        target: "https://junchengstone.synology.me",
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/legacy-draw-api/, "/draw"),
      },
    },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  css: {
    postcss: {
      plugins: [tailwindcss()],
    },
  },
  optimizeDeps: {
    exclude: ["pdfjs-dist"],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;

          if (id.includes("pdfjs-dist")) return "vendor-pdfjs";
          if (id.includes("firebase")) return "vendor-firebase";
          if (id.includes("xlsx-js-style")) return "vendor-xlsx-style";
          if (id.includes("/xlsx/")) return "vendor-xlsx";
          if (id.includes("html2canvas")) return "vendor-html2canvas";
          if (id.includes("html2pdf.js")) return "vendor-html2pdf";
          if (id.includes("jspdf")) return "vendor-jspdf";
          if (id.includes("pdf-lib")) return "vendor-pdf-lib";
          if (id.includes("@svgdotjs")) return "vendor-drawing";
          if (
            id.includes("/vue/") ||
            id.includes("/vue-router/") ||
            id.includes("/pinia/") ||
            id.includes("/vuedraggable/")
          ) {
            return "vendor-vue";
          }
        },
      },
    },
  },
});
