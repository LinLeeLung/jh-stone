import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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
});
