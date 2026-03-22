const fs = require("fs");
const path = require("path");

function parseEnv(filePath) {
  const map = {};
  const content = fs.readFileSync(filePath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx < 1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    map[key] = value;
  }
  return map;
}

async function main() {
  const baseDir = __dirname;
  const local = path.join(baseDir, ".env.local");
  const example = path.join(baseDir, ".env.local.example");
  const envPath = fs.existsSync(local)
    ? local
    : fs.existsSync(example)
      ? example
      : "";

  if (!envPath) {
    console.log("找不到 .env.local 或 .env.local.example");
    process.exit(1);
  }

  const env = parseEnv(envPath);
  const baseUrl = (
    env.SYNO_BASE_URL || "https://junchengstone.synology.me:5001"
  ).replace(/\/+$/, "");
  const username = env.SYNO_USERNAME || "";
  const password = env.SYNO_PASSWORD || "";

  if (!username || !password) {
    console.log(
      `檔案 ${path.basename(envPath)} 缺少 SYNO_USERNAME 或 SYNO_PASSWORD`,
    );
    process.exit(1);
  }

  const loginUrl = new URL("/webapi/auth.cgi", baseUrl);
  loginUrl.searchParams.set("api", "SYNO.API.Auth");
  loginUrl.searchParams.set("version", "6");
  loginUrl.searchParams.set("method", "login");
  loginUrl.searchParams.set("account", username);
  loginUrl.searchParams.set("passwd", password);
  loginUrl.searchParams.set("session", "FileStation");
  loginUrl.searchParams.set("format", "sid");

  try {
    const loginResp = await fetch(loginUrl.toString(), { method: "GET" });
    const loginJson = await loginResp.json().catch(() => ({}));

    if (loginResp.ok && loginJson.success && loginJson?.data?.sid) {
      console.log(`帳密驗證成功（來源: ${path.basename(envPath)}）`);
      const logoutUrl = new URL("/webapi/auth.cgi", baseUrl);
      logoutUrl.searchParams.set("api", "SYNO.API.Auth");
      logoutUrl.searchParams.set("version", "6");
      logoutUrl.searchParams.set("method", "logout");
      logoutUrl.searchParams.set("session", "FileStation");
      logoutUrl.searchParams.set("_sid", loginJson.data.sid);
      try {
        await fetch(logoutUrl.toString(), { method: "GET" });
      } catch {}
      process.exit(0);
    }

    const code = loginJson?.error?.code ?? "unknown";
    console.log(
      `帳密驗證失敗（來源: ${path.basename(envPath)}，錯誤碼: ${code}）`,
    );
    process.exit(2);
  } catch (error) {
    console.log(`連線或驗證失敗: ${error.message || String(error)}`);
    process.exit(3);
  }
}

main();
