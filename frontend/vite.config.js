import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { exec } from "node:child_process";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

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

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    {
      name: "open-chrome",
      configureServer(server) {
        server.httpServer?.once("listening", () => {
          exec('"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" http://localhost:5173');
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
  },
});
