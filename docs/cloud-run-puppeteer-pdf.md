# Cloud Run 搭配 Puppeteer 生成 PDF 设定指南

这份指南适合把「网页转 PDF」做成一个可部署到 Google Cloud Run 的 Node.js 服务。重点是让 Puppeteer 在容器里稳定跑 Chrome，并输出 A4 横向、可控边距的 PDF。

## 1. 先选运行方式

最常见的做法有两种：

1. 使用 `puppeteer-core`，在 Docker 镜像里自己安装 Chrome。
2. 直接使用官方 Puppeteer 基底镜像，省掉 Chrome 安装步骤。

如果你要长期维护、并且希望部署行为更可控，建议用第一种：`Node.js + puppeteer-core + 系统 Chrome`。下面也以这个方案为主。

## 1.1 两种效果比较

如果你的目标是「比较看看」，最核心其实是这两种输出思路：

| 方案 | 结果 | 优点 | 缺点 | 适用场景 |
| --- | --- | --- | --- | --- |
| HTML 转 PDF | 版面尽量接近浏览器画面 | 可搜索文字、文件较小、适合正式列印 | 不能保证像素级一致 | 报表、订单、正式文件 |
| 截图式 PDF | 画面几乎和螢幕看到的一样 | 最接近视觉结果 | 文件大、文字不可选取、列印品质较差 | 需要「看起来完全一样」的页面 |

简单结论：

1. 要「像列印文件」并保留文字，选 HTML 转 PDF。
2. 要「像螢幕截图」并追求视觉一致，选截图式 PDF。
3. 如果页面本身很多浮动排版或复杂互动，截图式通常更稳定。

## 1.2 后端无头浏览器比较版

如果你要真正「比较看看」，最实用的方式是让后端直接用浏览器渲染同一页，再输出 PDF。这样你可以把它和前端现有的 PDF 结果并排对照。

最小做法如下：

1. 后端接收一个 `pageUrl`。
2. Puppeteer 打开同一页。
3. 等页面和资料都载入完成。
4. 用 `page.pdf()` 直接输出 A4 横向 PDF。

```js
import express from 'express';
import puppeteer from 'puppeteer-core';

const app = express();

app.get('/compare-pdf', async (req, res) => {
  const pageUrl = String(req.query.pageUrl || '').trim();
  if (!pageUrl) {
    return res.status(400).send('missing pageUrl');
  }

  const browser = await puppeteer.launch({
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 1024, deviceScaleFactor: 1 });
    await page.goto(pageUrl, { waitUntil: 'networkidle0', timeout: 120000 });
    await page.emulateMediaType('screen');

    const pdf = await page.pdf({
      format: 'A4',
      landscape: true,
      printBackground: true,
      margin: {
        top: '12mm',
        right: '12mm',
        bottom: '12mm',
        left: '12mm',
      },
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="compare.pdf"');
    return res.send(pdf);
  } finally {
    await browser.close();
  }
});
```

比较时建议固定这三个条件：

1. 同一个页面 URL。
2. 同一个 viewport 宽高。
3. 同一套字体和边距。

如果这样做，差异就会很清楚：

1. 前端 PDF 通常更轻、更可搜寻文字。
2. 后端无头浏览器 PDF 通常更接近真实螢幕。
3. 如果页面内容复杂，后端版更适合做视觉对照。

## 2. Dockerfile

Cloud Run 上跑 Puppeteer 时，最重要的是：

1. 容器内要有 Chrome。
2. 需要传 `--no-sandbox` 和 `--disable-setuid-sandbox`。
3. 服务要监听 `0.0.0.0`，并使用 Cloud Run 注入的 `$PORT`。

```dockerfile
FROM node:20-bookworm-slim

ENV NODE_ENV=production
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
     ca-certificates \
     fonts-liberation \
     gnupg \
     wget \
  && wget -q -O - https://dl.google.com/linux/linux_signing_key.pub \
     | gpg --dearmor -o /usr/share/keyrings/googlechrome.gpg \
  && echo "deb [arch=amd64 signed-by=/usr/share/keyrings/googlechrome.gpg] http://dl.google.com/linux/chrome/deb/ stable main" \
     > /etc/apt/sources.list.d/google-chrome.list \
  && apt-get update \
  && apt-get install -y --no-install-recommends google-chrome-stable \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

ENV PORT=8080
EXPOSE 8080

CMD ["node", "server.js"]
```

### package.json 重点

```json
{
  "name": "pdf-service",
  "type": "module",
  "scripts": {
    "start": "node server.js"
  },
  "dependencies": {
    "express": "^4.19.2",
    "puppeteer-core": "^24.0.0"
  }
}
```

## 3. Node.js 生成 PDF 脚本

下面是一个可直接用于 Cloud Run 的最小服务。它提供 `POST /pdf`，传入要渲染的网页 URL，就会回传 PDF。

```js
// server.js
import express from 'express';
import puppeteer from 'puppeteer-core';

const app = express();
app.use(express.json({ limit: '1mb' }));

app.post('/pdf', async (req, res) => {
  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ error: 'url is required' });
  }

  const browser = await puppeteer.launch({
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 1024, deviceScaleFactor: 1 });
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 120000 });
    await page.emulateMediaType('screen');

    const pdfBuffer = await page.pdf({
      format: 'A4',
      landscape: true,
      printBackground: true,
      margin: {
        top: '12mm',
        right: '12mm',
        bottom: '12mm',
        left: '12mm',
      },
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="output.pdf"');
    return res.send(pdfBuffer);
  } finally {
    await browser.close();
  }
});

app.get('/healthz', (_req, res) => {
  res.status(200).send('ok');
});

const port = process.env.PORT || 8080;
app.listen(port, '0.0.0.0', () => {
  console.log(`Listening on ${port}`);
});
```

### PDF 参数说明

1. `format: 'A4'`：A4 纸张。
2. `landscape: true`：横向输出。
3. `margin`：四边边距建议先用 `12mm` 起跳。
4. `printBackground: true`：保留背景色和背景图。
5. `emulateMediaType('screen')`：尽量接近浏览器画面，而不是打印样式。

### 如果要更像螢幕

可以再加这些做法：

1. 固定 `viewport`，不要让版面因窗口大小变化。
2. 统一字型，并把字型打包进容器。
3. 避免依赖 `@media print` 的样式覆写。
4. 让页面先等数据完全载入，再输出 PDF。

### 如果要更接近「一模一样」

就不要把重点放在 HTML 排版，而是改成截图式输出：

```js
const screenshot = await page.screenshot({
  fullPage: true,
  type: 'png',
});
```

然后再把图片放进 PDF。这样视觉最像螢幕，但代价是：

1. 文件会明显变大。
2. 文字无法直接选取。
3. 列印和缩放时的清晰度不如真正的文字型 PDF。

## 4. 本机测试

在本机先确认容器能正常生成 PDF：

```bash
docker build -t pdf-service .
docker run --rm -p 8080:8080 pdf-service
```

调用测试：

```bash
curl -X POST http://localhost:8080/pdf \
  -H "Content-Type: application/json" \
  -d "{\"url\":\"https://example.com\"}" \
  --output output.pdf
```

如果网页内容需要登录或带 token，建议改成：

1. 让服务先打开目标页，再注入 Cookie / Header。
2. 或者直接让服务渲染你自己控制的内部页面，再输出 PDF。

## 5. 发布到 Artifact Registry

先启用 API：

```bash
gcloud services enable run.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com
```

建立 Artifact Registry 仓库：

```bash
gcloud artifacts repositories create pdf-images \
  --repository-format=docker \
  --location=asia-east1 \
  --description="Puppeteer PDF images"
```

登录 Docker：

```bash
gcloud auth configure-docker asia-east1-docker.pkg.dev
```

建置并推送映像：

```bash
export PROJECT_ID="你的 GCP 专案 ID"
export REGION="asia-east1"
export IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/pdf-images/pdf-service:latest"

docker build -t "$IMAGE" .
docker push "$IMAGE"
```

## 6. 部署到 Cloud Run

Cloud Run 上建议把并发调低，因为每个请求都会启动浏览器。

```bash
gcloud run deploy pdf-service \
  --image "$IMAGE" \
  --region asia-east1 \
  --platform managed \
  --allow-unauthenticated \
  --memory 1Gi \
  --cpu 1 \
  --concurrency 1 \
  --timeout 300 \
  --max-instances 10
```

### 为什么这些参数重要

1. `--concurrency 1`：避免同一个实例同时处理太多浏览器任务。
2. `--memory 1Gi` 以上：Puppeteer 启 Chrome 时会吃不少内存。
3. `--timeout 300`：网页加载或排队资源较慢时更稳。
4. `--allow-unauthenticated`：如果 PDF 服务要给外部系统调用，就需要；若是内部使用，可以关掉并改用 IAM 控管。

## 7. 常见问题

1. 如果启动时报 sandbox 错误，通常是 `args` 少了 `--no-sandbox`。
2. 如果 PDF 字型跑掉，通常是容器里缺字型，优先补 `fonts-liberation` 或额外的中文字体。
3. 如果页面看起来和浏览器不同，确认有呼叫 `emulateMediaType('screen')`，并检查页面是否依赖前端动画或异步数据。
4. 如果某些页面太大，建议先把渲染页做成单独的静态/SSR 页面，再交给 Puppeteer 输出。

## 8. 推荐的最小上线流程

1. 本机用 `docker run` 先验证 PDF 能产出。
2. 推到 Artifact Registry。
3. 用 Cloud Run 部署，先把 `concurrency` 设为 `1`。
4. 观察日志与记忆体，再决定要不要调高资源。

如果你要，我也可以继续帮你把这份指南改成更贴近你目前专案的版本，例如直接补成 `server.js`、`Dockerfile` 和 `cloudbuild.yaml`。