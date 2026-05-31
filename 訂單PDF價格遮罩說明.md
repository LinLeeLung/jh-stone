# 訂單 PDF 價格遮罩說明

員工角色開啟訂單 PDF 時，系統會自動在價格欄位蓋上白色遮罩（透過 `serveOrderPdf` Cloud Function 處理）。

---

## 遮罩設定

遮罩位置與大小存放於 Firestore **SystemSettings / general** 文件，欄位為：

| 欄位   | 說明                       | 預設值 |
| ------ | -------------------------- | ------ |
| `xPct` | 遮罩左邊界（佔頁面寬度比） | 0.2    |
| `yPct` | 遮罩下邊界（佔頁面高度比） | 0.04   |
| `wPct` | 遮罩寬度（佔頁面寬度比）   | 0.45   |
| `hPct` | 遮罩高度（佔頁面高度比）   | 0.13   |

> 座標系統：pdf-lib 以**左下角為原點**，Y 軸向上。

---

## 已知問題與解決方式

### 問題一：旋轉 PDF 遮罩位置偏移

**症狀**：開啟含 `/Rotate 90`（橫向）的訂單 PDF，白色遮罩出現在錯誤位置。

**原因**：pdf-lib 回傳的 `width`/`height` 是旋轉後的邏輯尺寸，但百分比座標需依旋轉方向重新對應。

**解決**：函式已針對 0 / 90 / 180 / 270 度各做座標轉換，正常情況下無需手動處理。

---

### 問題二：特定 PDF 遮罩完全失效（pdf-lib 無法解析）

**症狀**：log 出現：

```
serveOrderPdf: price redact failed, serving original
```

或 pdf-lib 內部錯誤如 `_this.catalog.Pages is not a function`。

**原因**：該 PDF 使用 **PDF 1.5+ 壓縮物件串流（Object Stream / Cross-Reference Stream）** 結構，pdf-lib 無法解析此格式的頁面樹。

**解決方式（手動）**：

1. 在電腦上用 **Chrome 開啟** 問題 PDF
2. 按 `Ctrl + P`（列印）
3. 目的地選「**另存為 PDF**」，按儲存
4. 用新存的 PDF 替換 NAS 上的原始檔案

新存的 PDF 結構已被 Chrome 攤平為標準格式，pdf-lib 可正常處理。

**影響範圍**：受影響時系統會直接阻擋 PDF 輸出，不再回傳原始（未遮罩）PDF，避免員工看到價格。替換檔案後即恢復正常遮罩。

---

## 系統行為摘要

```
員工開啟訂單 PDF
  ↓
serveOrderPdf 從 NAS 取得 PDF
  ↓
PDF header 驗證（是否為 %PDF-）
  ↓ 是
pdf-lib 載入 → 各頁面畫白色矩形（依旋轉角度換算座標）
  ↓ 若 parse 失敗
阻擋輸出並提示需重新另存 PDF
```
