import { PDFDocument, PDFName, rgb } from "pdf-lib";
import { downloadConfirmedPdfBytes } from "../firebase";

export const DEFAULT_DISPATCH_STATIONS = [
  "裁切",
  "水刀",
  "黏合",
  "水磨",
  "套板",
  "驗收",
];

const DISPATCH_PRICE_MASK = {
  xPct: 0.02,
  yPct: 0.845,
  wPct: 0.96,
  hPct: 0.155,
};

function getPageRotation(page) {
  const angle = Number(page.getRotation()?.angle) || 0;
  return ((angle % 360) + 360) % 360;
}

function visualBoxToPdfRect(page, box) {
  const { width, height } = page.getSize();
  const xPct = box.xPct;
  const yPct = 1 - box.yPct - box.hPct;
  const wPct = box.wPct;
  const hPct = box.hPct;
  const rotation = getPageRotation(page);

  if (rotation === 90) {
    return {
      x: width * (1 - yPct - hPct),
      y: height * xPct,
      width: width * hPct,
      height: height * wPct,
    };
  }
  if (rotation === 270) {
    return {
      x: width * yPct,
      y: height * (1 - xPct - wPct),
      width: width * hPct,
      height: height * wPct,
    };
  }
  if (rotation === 180) {
    return {
      x: width * (1 - xPct - wPct),
      y: height * (1 - yPct - hPct),
      width: width * wPct,
      height: height * hPct,
    };
  }
  return {
    x: width * xPct,
    y: height * yPct,
    width: width * wPct,
    height: height * hPct,
  };
}

function pdfNumberValue(value) {
  return typeof value?.value === "function" ? value.value() : Number(value);
}

function removeAnnotationsInRect(pdfDoc, page, rect) {
  const annotsRef = page.node.get(PDFName.of("Annots"));
  if (!annotsRef) return;

  const annotArr = pdfDoc.context.lookup(annotsRef);
  if (!annotArr || typeof annotArr.size !== "function") return;

  const keep = [];
  const rx2 = rect.x + rect.width;
  const ry2 = rect.y + rect.height;

  for (let i = 0; i < annotArr.size(); i++) {
    const item = annotArr.get(i);
    const annotDict =
      item?.constructor?.name === "PDFRef" ? pdfDoc.context.lookup(item) : item;
    let overlapsMask = false;

    try {
      const rectObj = annotDict?.get?.(PDFName.of("Rect"));
      if (rectObj && typeof rectObj.get === "function") {
        const ax1 = pdfNumberValue(rectObj.get(0));
        const ay1 = pdfNumberValue(rectObj.get(1));
        const ax2 = pdfNumberValue(rectObj.get(2));
        const ay2 = pdfNumberValue(rectObj.get(3));
        overlapsMask = ax1 < rx2 && ax2 > rect.x && ay1 < ry2 && ay2 > rect.y;
      }
    } catch (_) {}

    if (!overlapsMask) keep.push(item);
  }

  if (keep.length < annotArr.size()) {
    page.node.set(PDFName.of("Annots"), pdfDoc.context.obj(keep));
  }
}

function maskPriceArea(pdfDoc, page) {
  const rect = visualBoxToPdfRect(page, DISPATCH_PRICE_MASK);
  removeAnnotationsInRect(pdfDoc, page, rect);
  page.drawRectangle({
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
    color: rgb(1, 1, 1),
    opacity: 1,
  });
}

async function createWatermarkImage(pdfDoc, station) {
  const canvas = document.createElement("canvas");
  const scale = 2;
  const width = 320;
  const height = 110;
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext("2d");
  ctx.scale(scale, scale);
  ctx.font = `bold 42px "標楷體", "DFKai-SB", "BiauKai", serif`;
  ctx.fillStyle = "rgba(0, 0, 200, 0.30)";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  ctx.translate(width - 22, height - 32);
  ctx.rotate(-Math.PI / 18);
  ctx.fillText(station, 0, 0);

  const pngBytes = await fetch(canvas.toDataURL("image/png")).then((res) =>
    res.arrayBuffer(),
  );
  return pdfDoc.embedPng(pngBytes);
}

function drawWatermark(page, watermarkImage) {
  const { width, height } = page.getSize();
  const imageWidth = Math.min(width * 0.22, 160);
  const imageHeight =
    imageWidth * (watermarkImage.height / watermarkImage.width);
  page.drawImage(watermarkImage, {
    x: width - imageWidth - 12,
    y: 10,
    width: imageWidth,
    height: imageHeight,
  });
}

export async function buildDispatchPdf(
  orders,
  stations = DEFAULT_DISPATCH_STATIONS,
  options = {},
) {
  const outputDoc = await PDFDocument.create();
  const watermarkImages = new Map();
  const errors = [];
  const total = orders.length * stations.length;
  let done = 0;

  for (const station of stations) {
    if (!watermarkImages.has(station)) {
      watermarkImages.set(
        station,
        await createWatermarkImage(outputDoc, station),
      );
    }
    const watermarkImage = watermarkImages.get(station);

    for (const order of orders) {
      options.onProgress?.(done + 1, total);

      let sourceDoc;
      try {
        const arrayBuffer = await downloadConfirmedPdfBytes(order.id);
        sourceDoc = await PDFDocument.load(new Uint8Array(arrayBuffer), {
          ignoreEncryption: true,
          throwOnInvalidObject: false,
        });
      } catch (error) {
        const label = order.orderNo || order.id || "未知訂單";
        errors.push(`${label}: ${error?.message || error}`);
        done++;
        continue;
      }

      const copiedPages = await outputDoc.copyPages(
        sourceDoc,
        sourceDoc.getPageIndices(),
      );
      for (const page of copiedPages) {
        outputDoc.addPage(page);
        maskPriceArea(outputDoc, page);
        drawWatermark(page, watermarkImage);
      }

      done++;
    }
  }

  if (outputDoc.getPageCount() === 0) {
    throw new Error(
      "所有確定單PDF均無法下載或解析，請檢查是否已封存PDF後再試。",
    );
  }

  const pdfBytes = await outputDoc.save();
  return {
    blob: new Blob([pdfBytes], { type: "application/pdf" }),
    errors,
  };
}
