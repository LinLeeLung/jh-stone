<template>
  <section class="page-card">
    <div class="page-head">
      <h1>系統設定</h1>
      <p class="muted-text">僅管理者可調整參數</p>
    </div>

    <div v-if="loading" class="muted-text">讀取設定中…</div>

    <div v-else class="settings-wrap">
      <div class="settings-group-label">系統設定</div>

      <!-- NAS 設定 -->
      <div class="settings-section">
        <div class="section-head">
          <h3 class="section-title">NAS 設定</h3>
          <p class="section-desc">
            NAS 伺服器的儲存路徑，影響完工照上傳與訂單資料夾查詢。
          </p>
        </div>
        <div class="field-row">
          <div class="field-item">
            <label for="nas-path">NAS 儲存路徑：</label>
            <input
              id="nas-path"
              v-model="form.nasStoragePath"
              placeholder="例如 /峻晟/test"
            />
          </div>
        </div>
        <div class="field-row">
          <div class="field-item">
            <label for="nas-order-path"
              >訂單資料夾路徑（完工照存放位置）：</label
            >
            <input
              id="nas-order-path"
              v-model="form.nasOrderPath"
              placeholder="例如 /峻晟/01-訂單相關檔案/0--客戶訂貨單"
            />
            <small class="muted-text"
              >完工照會上傳到此路徑下符合訂單號碼的資料夾，未設定則使用上方 NAS
              儲存路徑</small
            >
          </div>
        </div>
      </div>

      <!-- 員工查閱設定 -->
      <div class="settings-section">
        <div class="section-head">
          <h3 class="section-title">員工查閱設定</h3>
          <p class="section-desc">
            員工檢視訂單 PDF
            時的價格遮罩位置，以「頁面寬高比例」定義白色矩形（座標原點為頁面左下角，y
            向上）。僅套用在員工角色，admin／管理者不受影響。
          </p>
        </div>
        <div style="display: flex; gap: 16px; flex-wrap: wrap">
          <div class="field-item" style="max-width: 160px">
            <label for="redact-x">X 比例 (左)</label>
            <input
              id="redact-x"
              type="number"
              step="0.01"
              min="0"
              max="1"
              v-model.number="form.priceRedactBox.xPct"
            />
          </div>
          <div class="field-item" style="max-width: 160px">
            <label for="redact-y">Y 比例 (下)</label>
            <input
              id="redact-y"
              type="number"
              step="0.01"
              min="0"
              max="1"
              v-model.number="form.priceRedactBox.yPct"
            />
          </div>
          <div class="field-item" style="max-width: 160px">
            <label for="redact-w">寬度比例</label>
            <input
              id="redact-w"
              type="number"
              step="0.01"
              min="0"
              max="1"
              v-model.number="form.priceRedactBox.wPct"
            />
          </div>
          <div class="field-item" style="max-width: 160px">
            <label for="redact-h">高度比例</label>
            <input
              id="redact-h"
              type="number"
              step="0.01"
              min="0"
              max="1"
              v-model.number="form.priceRedactBox.hPct"
            />
          </div>
        </div>
      </div>

      <!-- 打卡設定 -->
      <div class="settings-section">
        <div class="section-head">
          <h3 class="section-title">打卡設定</h3>
          <p class="section-desc">
            開啟後員工必須在指定半徑內才能打卡，座標可一鍵擷取目前位置。
          </p>
        </div>
        <div style="display: flex; flex-direction: column; gap: 8px">
          <label class="check-row">
            <input type="checkbox" v-model="form.punchLocation.enabled" />
            啟用地址驗證
          </label>
          <label class="check-row">
            <input type="checkbox" v-model="form.punchLocation.allowOnFail" />
            定位失敗時仍允許打卡（記錄未驗證標註）
          </label>
        </div>
        <div
          style="
            display: flex;
            gap: 12px;
            flex-wrap: wrap;
            align-items: flex-end;
            margin-top: 12px;
          "
        >
          <div class="field-item" style="max-width: 180px">
            <label>緯度（lat）</label>
            <input
              type="number"
              step="0.000001"
              v-model.number="form.punchLocation.lat"
              placeholder="例：25.033"
            />
          </div>
          <div class="field-item" style="max-width: 180px">
            <label>經度（lng）</label>
            <input
              type="number"
              step="0.000001"
              v-model.number="form.punchLocation.lng"
              placeholder="例：121.565"
            />
          </div>
          <div class="field-item" style="max-width: 360px">
            <label>允許半徑（公尺）</label>
            <input
              type="number"
              min="10"
              max="5000"
              v-model.number="form.punchLocation.radiusMeters"
            />
          </div>
        </div>
        <div style="margin-top: 10px">
          <button
            class="btn-aux"
            @click="fillCurrentLocation"
            :disabled="fetchingLoc"
          >
            {{ fetchingLoc ? "定位中…" : "擷取目前位置" }}
          </button>
        </div>
        <p v-if="locMsg" class="muted-text" style="margin: 4px 0">
          {{ locMsg }}
        </p>
      </div>

      <!-- 差勤規則 -->
      <div class="settings-section">
        <div class="section-head">
          <h3 class="section-title">差勤規則</h3>
          <p class="section-desc">
            設定上下班時間及遲到/早退的扣薪方式，計算薪資時自動套用。
          </p>
        </div>
        <div class="att-rules-grid">
          <div class="att-field">
            <label>上班時間</label>
            <input type="time" v-model="form.attendanceRules.workStart" />
          </div>
          <div class="att-field">
            <label>下班時間</label>
            <input type="time" v-model="form.attendanceRules.workEnd" />
          </div>
          <div class="att-field att-field--sm">
            <label>寬限分鐘</label>
            <input
              type="number"
              min="0"
              max="60"
              v-model.number="form.attendanceRules.graceMins"
              placeholder="0"
            />
          </div>
          <div class="att-field">
            <label>扣薪計算單位</label>
            <select v-model="form.attendanceRules.deductUnit">
              <option value="minute">按分鐘（精確計算）</option>
              <option value="30min">每 30 分鐘為一單位</option>
              <option value="60min">每 1 小時為一單位</option>
            </select>
          </div>
          <div class="att-field att-field--check">
            <label>早退扣薪</label>
            <label class="att-check-label">
              <input
                type="checkbox"
                v-model="form.attendanceRules.deductEarlyLeave"
              />
              <span>早退也扣薪（同規則）</span>
            </label>
          </div>
        </div>
      </div>

      <!-- 借款利率設定 -->
      <div class="settings-section">
        <div class="section-head">
          <h3 class="section-title">借款利率</h3>
          <p class="section-desc">員工借款年利率（%），計算每月還款時使用。</p>
        </div>
        <div class="field-row">
          <div class="field-item">
            <label for="loan-rate">年利率（%）：</label>
            <input
              id="loan-rate"
              type="number"
              v-model.number="form.loanInterestRate"
              min="0"
              max="100"
              step="0.1"
              style="width: 100px"
            />
          </div>
        </div>
      </div>

      <!-- 儲存工具列 -->
      <div class="save-bar">
        <button class="btn-query" :disabled="saving" @click="save">
          {{ saving ? "儲存中…" : "儲存設定" }}
        </button>
        <button class="btn-aux" :disabled="saving" @click="reload">
          重新載入
        </button>
        <p v-if="message" class="muted-text save-msg">{{ message }}</p>
        <p v-if="errorMessage" class="error-text save-msg">
          {{ errorMessage }}
        </p>
      </div>

      <!-- 維護工具 -->
      <div class="settings-group-label" style="margin-top: 32px">維護工具</div>

      <!-- NAS 連線測試 -->
      <div class="settings-section">
        <div class="section-head">
          <h3 class="section-title">NAS 連線測試</h3>
          <p class="section-desc">
            測試 NAS 寫入權限及照片上傳，驗證路徑設定是否正確。
          </p>
        </div>
        <div class="toolbar-row">
          <button
            class="btn-aux"
            :disabled="testingNas || saving"
            @click="runNasTest"
          >
            測試 NAS 寫入
          </button>
        </div>
        <div class="field-row" style="margin-top: 12px">
          <div class="field-item">
            <label for="nas-test-photo">測試照片：</label>
            <input
              id="nas-test-photo"
              type="file"
              accept="image/*"
              @change="onTestPhotoSelected"
            />
          </div>
          <button
            class="btn-query"
            :disabled="testingPhotoUpload || saving || testingNas"
            @click="uploadTestPhotoToNas"
          >
            上傳測試照片到 NAS
          </button>
        </div>
      </div>

      <!-- NAS 資料夾查詢 -->
      <div class="settings-section">
        <div class="section-head">
          <h3 class="section-title">NAS 資料夾查詢</h3>
          <p class="section-desc">
            依訂單號碼查詢 NAS
            上的資料夾路徑，支援批次查詢（上傳文字檔，每行一個訂單號碼）。
          </p>
        </div>

        <div class="field-row" style="margin-top: 0">
          <div class="field-item">
            <label for="order-nas-query">查詢訂單號碼（NAS 資料夾）：</label>
            <input
              id="order-nas-query"
              v-model="orderNumberQuery"
              placeholder="請輸入訂單號碼"
              style="width: 200px"
            />
          </div>
          <button
            class="btn-query"
            :disabled="queryingOrderFolder || !orderNumberQuery"
            @click="findOrderFolderOnNasQuery"
          >
            查詢 NAS 資料夾
          </button>
          <span
            v-if="queryingOrderFolder"
            class="muted-text"
            style="margin-left: 12px"
            >查詢中…</span
          >
        </div>
        <pre
          v-if="orderFolderResult"
          class="muted-text"
          style="white-space: pre-wrap; margin: 8px 0"
          >{{ orderFolderResult }}</pre
        >
        <p
          v-if="nasQueryElapsed != null"
          class="muted-text"
          style="margin: 4px 0"
        >
          耗時：{{ nasQueryElapsed }} ms
        </p>
        <p v-if="orderFolderError" class="error-text">{{ orderFolderError }}</p>

        <!-- 批次查詢 -->
        <div
          class="field-row"
          style="margin-top: 16px; align-items: center; gap: 12px"
        >
          <label style="white-space: nowrap; font-weight: 500"
            >批次查詢（文字檔，每行一個訂單號碼）：</label
          >
          <input
            ref="batchFileInput"
            type="file"
            accept=".txt,.csv"
            style="flex: 1"
            @change="onBatchFileChange"
          />
          <button
            class="btn-query"
            :disabled="batchRunning || !batchOrderNumbers.length"
            @click="runBatchOrderFolderSearch"
          >
            {{
              batchRunning
                ? `搜尋中 ${batchDone}/${batchTotal}…`
                : `批次搜尋（${batchOrderNumbers.length} 筆）`
            }}
          </button>
          <button
            v-if="batchRunning"
            class="btn-aux"
            style="color: #dc2626"
            @click="cancelBatchSearch"
          >
            取消
          </button>
          <button
            v-if="batchResults.length"
            class="btn-aux"
            :disabled="batchRunning"
            @click="exportBatchResultsCsv"
          >
            匯出 CSV
          </button>
        </div>
        <div
          v-if="batchResults.length"
          style="margin-top: 12px; overflow-x: auto"
        >
          <table class="batch-result-table">
            <thead>
              <tr>
                <th>#</th>
                <th>訂單號碼</th>
                <th>結果</th>
                <th>資料夾路徑</th>
                <th>耗時(ms)</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(r, i) in batchResults"
                :key="r.orderNumber"
                :class="
                  r.status === 'found'
                    ? ''
                    : r.status === 'error'
                      ? 'row-error'
                      : 'row-notfound'
                "
              >
                <td>{{ i + 1 }}</td>
                <td>{{ r.orderNumber }}</td>
                <td>
                  {{
                    r.status === "found"
                      ? "✅ 找到"
                      : r.status === "error"
                        ? "⚠ 錯誤"
                        : "❌ 找不到"
                  }}
                </td>
                <td style="word-break: break-all; max-width: 400px">
                  {{ r.folderPath || r.message || "" }}
                </td>
                <td>{{ r.totalMs ?? "" }}</td>
              </tr>
            </tbody>
          </table>
          <p class="muted-text" style="margin-top: 6px; font-size: 0.85em">
            共 {{ batchResults.length }} 筆完成，找到
            {{ batchResults.filter((r) => r.status === "found").length }}
            筆，找不到
            {{ batchResults.filter((r) => r.status === "notfound").length }} 筆
            <span v-if="batchResults.filter((r) => r.status === 'error').length"
              >，錯誤
              {{ batchResults.filter((r) => r.status === "error").length }}
              筆</span
            >
          </p>
        </div>
      </div>

      <!-- 完工照片路徑修復 -->
      <div class="settings-section">
        <div class="section-head">
          <h3 class="section-title">完工照片路徑修復</h3>
          <p class="section-desc">
            當 NAS
            上的訂單資料夾被重新命名後，已上傳照片的路徑可能失效（顯示破圖）。先診斷再修復。
          </p>
        </div>
        <div class="toolbar-row">
          <button
            class="btn-aux"
            :disabled="repairingPhotoPaths"
            @click="runPhotoPathDiagnose"
          >
            {{
              repairingPhotoPaths && photoPathDryRun
                ? "診斷中…"
                : "① 診斷（不修改）"
            }}
          </button>
          <button
            class="btn-query"
            :disabled="repairingPhotoPaths || !photoPathDiagnoseResult"
            @click="runPhotoPathRepair"
          >
            {{
              repairingPhotoPaths && !photoPathDryRun ? "修復中…" : "② 執行修復"
            }}
          </button>
        </div>
        <div v-if="photoPathDiagnoseResult" style="margin-top: 10px">
          <p class="muted-text">
            已檢查 {{ photoPathDiagnoseResult.checkedPhotos }} 張， 路徑失效
            <strong
              :style="
                photoPathDiagnoseResult.brokenPhotos > 0 ? 'color:#c00' : ''
              "
            >
              {{ photoPathDiagnoseResult.brokenPhotos }} 張
            </strong>
            <template v-if="!photoPathDiagnoseResult.dryRun">
              ，已修復
              <strong style="color: #16a34a"
                >{{ photoPathDiagnoseResult.fixedPhotos }} 張</strong
              >， 找不到
              {{
                photoPathDiagnoseResult.report.filter(
                  (r) => r.type === "not_found",
                ).length
              }}
              張
            </template>
          </p>
          <table
            v-if="
              photoPathDiagnoseResult.report.filter((r) => r.type !== 'ok')
                .length > 0
            "
            style="
              font-size: 0.82em;
              border-collapse: collapse;
              width: 100%;
              margin-top: 8px;
            "
          >
            <thead>
              <tr style="background: #f0f0f0">
                <th style="padding: 4px 8px; text-align: left">狀態</th>
                <th style="padding: 4px 8px; text-align: left">訂單號碼</th>
                <th style="padding: 4px 8px; text-align: left">照片 ID</th>
                <th style="padding: 4px 8px; text-align: left">路徑</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in photoPathDiagnoseResult.report.filter(
                  (r) => r.type !== 'ok',
                )"
                :key="row.photoId"
                style="border-top: 1px solid #e0e0e0"
              >
                <td
                  style="padding: 4px 8px; font-weight: 600"
                  :style="
                    row.type === 'fixed'
                      ? 'color:#16a34a'
                      : row.type === 'not_found'
                        ? 'color:#888'
                        : 'color:#c00'
                  "
                >
                  {{
                    row.type === "fixed"
                      ? "✓ 已修復"
                      : row.type === "not_found"
                        ? "找不到"
                        : "✗ 失效"
                  }}
                </td>
                <td style="padding: 4px 8px">{{ row.orderNumber || "-" }}</td>
                <td style="padding: 4px 8px; font-size: 0.78em; color: #888">
                  {{ row.photoId }}
                </td>
                <td
                  style="
                    padding: 4px 8px;
                    word-break: break-all;
                    font-size: 0.78em;
                  "
                >
                  {{ row.newNasPath || row.nasPath }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-if="photoPathRepairError" class="error-text">
          {{ photoPathRepairError }}
        </p>
      </div>

      <!-- 照片搬移工具 -->
      <div class="settings-section">
        <div class="section-head">
          <h3 class="section-title">照片搬移工具</h3>
          <p class="section-desc">
            將放錯位置的完工照（來源資料夾）搬回正確訂單資料夾，搬移後刪除空資料夾。
          </p>
        </div>
        <div class="field-row">
          <div class="field-item">
            <label>來源資料夾（放錯的）：</label>
            <input
              v-model="migrateSrcPath"
              placeholder="例如 /峻晟/01-訂單相關檔案/115年3月15日起的訂單"
              style="width: 420px"
            />
          </div>
        </div>
        <div class="field-row">
          <div class="field-item">
            <label
              >目標基底路徑（正確存放位置，同設定中的訂單資料夾路徑）：</label
            >
            <input
              v-model="migrateTargetPath"
              placeholder="例如 /峻晟/01-訂單相關檔案/0--客戶訂貨單"
              style="width: 420px"
            />
          </div>
        </div>
        <div class="toolbar-row">
          <button
            class="btn-aux"
            :disabled="migrating || !migrateSrcPath"
            @click="runMigrateScan"
          >
            {{ migrating && migrateScanMode ? "掃描中…" : "① 掃描來源資料夾" }}
          </button>
          <button
            class="btn-aux"
            :disabled="migrating || !migrateSrcPath || !migrateTargetPath"
            @click="runMigrateDryRun"
          >
            {{
              migrating && migrateDryRun && !migrateScanMode
                ? "查詢中…"
                : "② 預覽（不搬移）"
            }}
          </button>
          <button
            class="btn-query"
            :disabled="
              migrating ||
              !migrateSrcPath ||
              !migrateTargetPath ||
              !migrateHasMatched
            "
            @click="runMigrateActual"
          >
            {{ migrating && !migrateDryRun ? "搬移中…" : "③ 執行搬移" }}
          </button>
        </div>
        <div v-if="migrateResult" style="margin-top: 12px">
          <!-- 掃描模式結果 -->
          <template v-if="migrateResult.scanOnly">
            <p class="muted-text">
              掃描完成，共 {{ migrateResult.total }} 個訂單資料夾。
              <button
                class="btn-aux"
                style="margin-left: 12px; padding: 2px 10px; font-size: 0.85em"
                @click="downloadScanCsv"
              >
                下載 CSV
              </button>
            </p>
            <table
              style="
                font-size: 0.82em;
                border-collapse: collapse;
                width: 100%;
                margin-top: 8px;
              "
            >
              <thead>
                <tr style="background: #f0f0f0">
                  <th style="padding: 4px 8px; text-align: left">#</th>
                  <th style="padding: 4px 8px; text-align: left">
                    來源資料夾名稱
                  </th>
                  <th style="padding: 4px 8px; text-align: left">
                    抽出訂單編號
                  </th>
                  <th style="padding: 4px 8px; text-align: left">來源路徑</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="(row, idx) in migrateResult.report"
                  :key="row.srcPath"
                  style="border-top: 1px solid #e0e0e0"
                >
                  <td style="padding: 4px 8px; color: #888">{{ idx + 1 }}</td>
                  <td style="padding: 4px 8px">{{ row.orderFolder }}</td>
                  <td
                    style="padding: 4px 8px; font-weight: 600"
                    :style="!row.orderNumber ? 'color:#c00' : ''"
                  >
                    {{ row.orderNumber || "（無法辨識）" }}
                  </td>
                  <td
                    style="padding: 4px 8px; word-break: break-all; color: #888"
                  >
                    {{ row.srcPath }}
                  </td>
                </tr>
              </tbody>
            </table>
          </template>

          <!-- 預覽/執行結果 -->
          <template v-else>
            <p class="muted-text">
              {{ migrateResult.dryRun ? "[預覽]" : "[已執行]" }}
              來源共 {{ migrateResult.report?.length || 0 }} 個訂單資料夾，
              找到目標
              {{
                migrateResult.report?.filter((r) => r.status !== "not_found")
                  .length || 0
              }}
              筆， 找不到目標
              {{
                migrateResult.report?.filter((r) => r.status === "not_found")
                  .length || 0
              }}
              筆<span v-if="!migrateResult.dryRun"
                >，移動 {{ migrateResult.movedCount || 0 }} 個檔案，錯誤
                {{ migrateResult.errorCount || 0 }} 筆</span
              >。
            </p>
            <table
              v-if="migrateResult.report?.length"
              style="
                font-size: 0.82em;
                border-collapse: collapse;
                width: 100%;
                margin-top: 8px;
              "
            >
              <thead>
                <tr style="background: #f0f0f0">
                  <th style="padding: 4px 8px; text-align: left">來源資料夾</th>
                  <th style="padding: 4px 8px; text-align: left">訂單編號</th>
                  <th style="padding: 4px 8px; text-align: left">狀態</th>
                  <th style="padding: 4px 8px; text-align: left">檔案數</th>
                  <th style="padding: 4px 8px; text-align: left">目標路徑</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="row in migrateResult.report"
                  :key="row.srcPath"
                  style="border-top: 1px solid #e0e0e0"
                >
                  <td style="padding: 4px 8px">{{ row.orderFolder }}</td>
                  <td style="padding: 4px 8px; font-weight: 600">
                    {{ row.orderNumber || "-" }}
                  </td>
                  <td
                    style="padding: 4px 8px"
                    :style="row.status === 'not_found' ? 'color:#c00' : ''"
                  >
                    {{
                      row.status === "dry_run"
                        ? "✓ 找到"
                        : row.status === "not_found"
                          ? "✗ 找不到"
                          : row.status
                    }}
                  </td>
                  <td style="padding: 4px 8px">{{ row.files ?? "-" }}</td>
                  <td style="padding: 4px 8px; word-break: break-all">
                    {{ row.destPath || row.error || "-" }}
                  </td>
                </tr>
              </tbody>
            </table>
          </template>
        </div>
        <p v-if="migrateError" class="error-text">{{ migrateError }}</p>
      </div>

      <!-- 庫存顏色維護 -->
      <div class="settings-section">
        <div class="section-head">
          <h3 class="section-title">庫存顏色維護</h3>
          <p class="section-desc">
            同步顏色主資料到 Firestore，或修復缺失的照片連結。
          </p>
        </div>
        <div class="toolbar-row">
          <button
            class="btn-aux"
            :disabled="masterSyncing || repairSyncing"
            @click="syncMasterToFirestore"
          >
            {{ masterSyncing ? "同步中..." : "同步現有顏色到 Firestore" }}
          </button>
          <button
            class="btn-aux"
            :disabled="repairSyncing || masterSyncing"
            @click="repairMissingImagesOnly"
          >
            {{ repairSyncing ? "修復中..." : "修復缺失照片（保留現有）" }}
          </button>
        </div>
        <p v-if="masterMessage" class="muted-text" style="margin-top: 8px">
          {{ masterMessage }}
        </p>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import {
  bulkUpsertInventoryColors,
  getSystemSettings,
  listInventoryColors,
  saveSystemSettings,
  testNasWrite,
  testNasUploadPhoto,
  upsertInventoryColor,
  repairCompletionPhotoNasPaths,
} from "../firebase";

const COLOR_CSV_URL =
  "https://docs.google.com/spreadsheets/d/10Gkhuq2iwlpQfw0e-uvP_9UuE1efee_5v7iHX4srW8s/export?format=csv&gid=494306116";

const loading = ref(true);
const saving = ref(false);
const testingNas = ref(false);
const testingPhotoUpload = ref(false);
const testPhotoFile = ref(null);
const message = ref("");
const errorMessage = ref("");
const masterSyncing = ref(false);
const repairSyncing = ref(false);
const masterMessage = ref("");

const form = ref({
  nasStoragePath: "",
  nasOrderPath: "",
  priceRedactBox: {
    xPct: 0.2,
    yPct: 0.04,
    wPct: 0.45,
    hPct: 0.13,
  },
  punchLocation: {
    enabled: false,
    allowOnFail: true,
    lat: null,
    lng: null,
    radiusMeters: 200,
  },
  attendanceRules: {
    workStart: "08:30",
    workEnd: "17:30",
    graceMins: 0,
    deductUnit: "minute",
    deductEarlyLeave: true,
  },
  loanInterestRate: 2,
});

// 新增：訂單號碼查詢相關
const orderNumberQuery = ref("");
const queryingOrderFolder = ref(false);
const orderFolderResult = ref("");
const orderFolderError = ref("");
const nasQueryElapsed = ref(null);
const batchFileInput = ref(null);
const batchOrderNumbers = ref([]);
const batchRunning = ref(false);
const batchCancelled = ref(false);
const batchDone = ref(0);
const batchTotal = ref(0);
const batchResults = ref([]);

// 打卡地點
const fetchingLoc = ref(false);
const locMsg = ref("");
function fillCurrentLocation() {
  if (!navigator.geolocation) {
    locMsg.value = "瀏覽器不支援 GPS";
    return;
  }
  fetchingLoc.value = true;
  locMsg.value = "";
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      form.value.punchLocation.lat = parseFloat(pos.coords.latitude.toFixed(6));
      form.value.punchLocation.lng = parseFloat(
        pos.coords.longitude.toFixed(6),
      );
      locMsg.value = `已擷取：${form.value.punchLocation.lat}, ${form.value.punchLocation.lng}（精度 ±${Math.round(pos.coords.accuracy)} m）`;
      fetchingLoc.value = false;
    },
    (err) => {
      const msgs = {
        1: "位置存取遭拒。請至瀏覽器「網站設定 → 位置」允許本站，或至 Windows 設定 → 隱私權 → 位置，確認位置服務已開啟。",
        2: "無法取得位置（code 2）。桌機請確認 Windows 設定 → 隱私權 → 位置服務已開啟，並已允許瀏覽器存取位置。",
        3: "定位逾時，請確認已開啟定位服務後再試。",
      };
      locMsg.value = msgs[err.code] || "定位失敗：" + err.message;
      fetchingLoc.value = false;
    },
    { enableHighAccuracy: true, timeout: 10000 },
  );
}

// 完工照片路徑修復
const repairingPhotoPaths = ref(false);
const photoPathDryRun = ref(true);
const photoPathDiagnoseResult = ref(null);
const photoPathRepairError = ref("");

async function runPhotoPathDiagnose() {
  repairingPhotoPaths.value = true;
  photoPathDryRun.value = true;
  photoPathDiagnoseResult.value = null;
  photoPathRepairError.value = "";
  try {
    const result = await repairCompletionPhotoNasPaths({ dryRun: true });
    photoPathDiagnoseResult.value = result;
  } catch (err) {
    photoPathRepairError.value = err?.message || "診斷失敗";
  } finally {
    repairingPhotoPaths.value = false;
  }
}

async function runPhotoPathRepair() {
  if (!photoPathDiagnoseResult.value) return;
  const broken = photoPathDiagnoseResult.value.brokenPhotos || 0;
  if (broken === 0) {
    alert("沒有需要修復的照片");
    return;
  }
  if (
    !confirm(
      `確定要修復 ${broken} 張路徑失效的照片？此操作會更新 Firestore 中的 nasPath，無法復原。`,
    )
  )
    return;
  repairingPhotoPaths.value = true;
  photoPathDryRun.value = false;
  photoPathRepairError.value = "";
  try {
    const result = await repairCompletionPhotoNasPaths({ dryRun: false });
    photoPathDiagnoseResult.value = result;
  } catch (err) {
    photoPathRepairError.value = err?.message || "修復失敗";
  } finally {
    repairingPhotoPaths.value = false;
  }
}

// 照片搬移工具
const migrateSrcPath = ref("");
const migrateTargetPath = ref("");
const migrating = ref(false);
const migrateDryRun = ref(true);
const migrateScanMode = ref(false);
const migrateResult = ref(null);
const migrateError = ref("");
// 是否有預覽結果且存在可搬移的項目（需先預覽才能執行）
const migrateHasMatched = computed(
  () =>
    !!(
      migrateResult.value?.dryRun &&
      migrateResult.value.report?.some((r) => r.status !== "not_found")
    ),
);

function onBatchFileChange(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    const text = ev.target.result || "";
    batchOrderNumbers.value = text
      .split(/[\r\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    batchResults.value = [];
  };
  reader.readAsText(file);
}

function cancelBatchSearch() {
  batchCancelled.value = true;
}

async function runBatchOrderFolderSearch() {
  if (!batchOrderNumbers.value.length || batchRunning.value) return;
  batchRunning.value = true;
  batchCancelled.value = false;
  batchDone.value = 0;
  batchTotal.value = batchOrderNumbers.value.length;
  batchResults.value = [];

  const batchId = `b${Date.now()}`;
  let unsubscribe = null;

  try {
    // 訂閱 Firestore 即時進度
    const { getFirestore, doc, onSnapshot } =
      await import("firebase/firestore");
    const { app } = await import("../firebase");
    const db = getFirestore(app);
    const progressRef = doc(db, "_system", `batchSearch_${batchId}`);

    unsubscribe = onSnapshot(progressRef, (snap) => {
      const data = snap.data();
      if (!data) return;
      batchDone.value = data.done || 0;
      const results = data.results || [];
      batchResults.value = results.map((r) => ({
        orderNumber: r.orderNumber,
        status: r.found ? "found" : "notfound",
        folderPath: r.folderPath || "",
        message: r.message || "",
        totalMs: r.totalMs ?? 0,
      }));
    });

    // 呼叫批次搜尋（登入一次，一筆一筆查）
    const { batchFindOrderFolderOnNas } = await import("../firebase");
    await batchFindOrderFolderOnNas(batchOrderNumbers.value, batchId);
  } catch (err) {
    // 如果還沒有結果，顯示錯誤
    if (!batchResults.value.length) {
      batchResults.value = batchOrderNumbers.value.map((n) => ({
        orderNumber: n,
        status: "error",
        folderPath: "",
        message: err?.message || "批次查詢失敗",
        totalMs: 0,
      }));
      batchDone.value = batchResults.value.length;
    }
  } finally {
    if (unsubscribe) unsubscribe();
    batchRunning.value = false;
  }
}

function exportBatchResultsCsv() {
  const header = "訂單號碼,結果,資料夾路徑,耗時ms";
  const rows = batchResults.value.map((r) => {
    const status =
      r.status === "found" ? "找到" : r.status === "error" ? "錯誤" : "找不到";
    const escape = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    return [
      escape(r.orderNumber),
      escape(status),
      escape(r.folderPath || r.message),
      r.totalMs ?? "",
    ].join(",");
  });
  const csv = "\uFEFF" + [header, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `nas-folder-search-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

async function findOrderFolderOnNasQuery() {
  if (!orderNumberQuery.value) return;
  queryingOrderFolder.value = true;
  orderFolderResult.value = "";
  orderFolderError.value = "";
  nasQueryElapsed.value = null;
  const t0 = Date.now();
  try {
    const { findOrderFolderOnNas } = await import("../firebase");
    const result = await findOrderFolderOnNas(orderNumberQuery.value);
    if (result.found) {
      orderFolderResult.value =
        `✅ ${result.folderName}\n` +
        `資料夾：${result.folderPath}\n` +
        `比對分數：${result.matchScore}`;
    } else {
      orderFolderResult.value = `❌ ${result.message}`;
    }
  } catch (err) {
    orderFolderError.value = err?.message || "查詢失敗";
  } finally {
    nasQueryElapsed.value = Date.now() - t0;
    queryingOrderFolder.value = false;
  }
}

async function runMigrate(dryRun, scanOnly = false) {
  if (!migrateSrcPath.value) return;
  if (!scanOnly && !migrateTargetPath.value) return;
  migrating.value = true;
  migrateDryRun.value = dryRun;
  migrateScanMode.value = scanOnly;
  migrateResult.value = null;
  migrateError.value = "";
  try {
    const { getFunctions, httpsCallable } = await import("firebase/functions");
    const { app } = await import("../firebase");
    const fns = getFunctions(app, "asia-east1");
    const callable = httpsCallable(fns, "migrateMisplacedOrderPhotos", {
      timeout: 3300000,
    }); // 55 分鐘
    const resp = await callable({
      sourceFolderPath: migrateSrcPath.value.trim(),
      targetBasePath: migrateTargetPath.value.trim(),
      dryRun,
      scanOnly,
    });
    migrateResult.value = resp.data;
  } catch (err) {
    migrateError.value = err?.message || "失敗";
  } finally {
    migrating.value = false;
  }
}

function runMigrateScan() {
  return runMigrate(true, true);
}

function runMigrateDryRun() {
  return runMigrate(true);
}
function runMigrateActual() {
  if (
    !confirm("確定要搬移？此操作會在 NAS 上移動檔案並刪除空資料夾，無法復原。")
  )
    return;
  return runMigrate(false);
}

function downloadScanCsv() {
  const rows = migrateResult.value?.report || [];
  const header = "序號,來源資料夾名稱,訂單編號,來源路徑";
  const lines = rows.map((r, i) =>
    [i + 1, `"${r.orderFolder}"`, r.orderNumber || "", `"${r.srcPath}"`].join(
      ",",
    ),
  );
  const csv = "\uFEFF" + [header, ...lines].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "migrate-scan.csv";
  a.click();
  URL.revokeObjectURL(url);
}

async function loadSettings() {
  loading.value = true;
  message.value = "";
  errorMessage.value = "";

  try {
    const data = await getSystemSettings();
    form.value.nasStoragePath = data.nasStoragePath || "";
    form.value.nasOrderPath = data.nasOrderPath || "";
    const box = data.priceRedactBox || {};
    form.value.priceRedactBox = {
      xPct: Number.isFinite(Number(box.xPct)) ? Number(box.xPct) : 0.2,
      yPct: Number.isFinite(Number(box.yPct)) ? Number(box.yPct) : 0.04,
      wPct: Number.isFinite(Number(box.wPct)) ? Number(box.wPct) : 0.45,
      hPct: Number.isFinite(Number(box.hPct)) ? Number(box.hPct) : 0.13,
    };
    const loc = data.punchLocation || {};
    form.value.punchLocation = {
      enabled: loc.enabled === true,
      allowOnFail: loc.allowOnFail !== false,
      lat: Number.isFinite(Number(loc.lat)) ? Number(loc.lat) : null,
      lng: Number.isFinite(Number(loc.lng)) ? Number(loc.lng) : null,
      radiusMeters: Number.isFinite(Number(loc.radiusMeters))
        ? Number(loc.radiusMeters)
        : 200,
    };
    const rules = data.attendanceRules || {};
    form.value.attendanceRules = {
      workStart: rules.workStart || "08:30",
      workEnd: rules.workEnd || "17:30",
      graceMins: Number.isFinite(Number(rules.graceMins))
        ? Number(rules.graceMins)
        : 0,
      deductUnit: rules.deductUnit || "minute",
      deductEarlyLeave: rules.deductEarlyLeave !== false,
    };
    form.value.loanInterestRate = Number.isFinite(Number(data.loanInterestRate))
      ? Number(data.loanInterestRate)
      : 2;
  } catch (error) {
    console.error("讀取系統設定失敗:", error);
    errorMessage.value = "讀取設定失敗，請稍後再試。";
  } finally {
    loading.value = false;
  }
}

async function save() {
  saving.value = true;
  message.value = "";
  errorMessage.value = "";

  try {
    await saveSystemSettings(form.value);
    message.value = "設定已儲存。";
  } catch (error) {
    console.error("儲存系統設定失敗:", error);
    errorMessage.value = "儲存失敗，請確認權限或稍後重試。";
  } finally {
    saving.value = false;
  }
}

async function runNasTest() {
  testingNas.value = true;
  message.value = "";
  errorMessage.value = "";

  try {
    const result = await testNasWrite();
    message.value = `NAS 測試成功：${result.testFilePath || "已寫入測試檔"}`;
  } catch (error) {
    console.error("NAS 測試失敗:", error);
    errorMessage.value =
      error?.message || "NAS 測試失敗，請檢查設定與 Functions 日誌。";
  } finally {
    testingNas.value = false;
  }
}

function onTestPhotoSelected(event) {
  const nextFile = event?.target?.files?.[0] || null;
  testPhotoFile.value = nextFile;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result || "");
    reader.onerror = () => reject(new Error("讀取圖片失敗"));
    reader.readAsDataURL(file);
  });
}

async function uploadTestPhotoToNas() {
  if (!testPhotoFile.value) {
    errorMessage.value = "請先選擇測試照片。";
    return;
  }

  testingPhotoUpload.value = true;
  message.value = "";
  errorMessage.value = "";

  try {
    const dataUrl = await readFileAsDataUrl(testPhotoFile.value);
    const result = await testNasUploadPhoto({
      fileName: testPhotoFile.value.name || "test-photo.jpg",
      dataUrl,
    });
    message.value = `測試照片已上傳到 NAS：${result.targetPath || "成功"}`;
  } catch (error) {
    console.error("測試照片上傳失敗:", error);
    errorMessage.value =
      error?.message || "測試照片上傳失敗，請檢查設定與 Functions 日誌。";
  } finally {
    testingPhotoUpload.value = false;
  }
}

function parseCsv(text = "") {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  const commitField = () => {
    row.push(field);
    field = "";
  };

  const commitRow = () => {
    const hasValue = row.some((col) => String(col || "").trim().length > 0);
    if (hasValue) {
      if (!rows.length && row.length) {
        row[0] = String(row[0] || "").replace(/^\uFEFF/, "");
      }
      rows.push(row);
    }
    row = [];
  };

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const nextChar = text[index + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        field += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      commitField();
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      commitField();
      commitRow();
      if (char === "\r" && nextChar === "\n") {
        index += 1;
      }
      continue;
    }

    field += char;
  }

  if (field.length > 0 || row.length > 0) {
    commitField();
    commitRow();
  }

  return rows;
}

function normalizeHeader(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
}

function buildHeaderIndexMap(headerRow = []) {
  const map = new Map();
  headerRow.forEach((header, index) => {
    map.set(normalizeHeader(header), index);
  });
  return map;
}

function getIndexByAliases(indexMap, aliases = [], fallback = -1) {
  for (const alias of aliases) {
    const key = normalizeHeader(alias);
    if (indexMap.has(key)) {
      return indexMap.get(key);
    }
  }
  return fallback;
}

function getCell(row = [], index = -1) {
  if (index < 0) return "";
  return String(row[index] || "").trim();
}

function normalizeMappingKey(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s\-_/｜|()（）·•.,:：'"`]/g, "");
}

function extractColorCode(value = "") {
  const text = String(value || "").toUpperCase();
  const normalized = text.replace(/\s+/g, "");

  const dtMatch = normalized.match(/DT[-_]?([0-9]{2,4})/);
  if (dtMatch) {
    return `DT-${dtMatch[1]}`;
  }

  const csMatch = normalized.match(/CS[-_]?([0-9]{3,4})/);
  if (csMatch) {
    return `CS${csMatch[1]}`;
  }

  return "";
}

function extractNeolithCode(value = "") {
  const text = String(value || "")
    .toUpperCase()
    .replace(/\s+/g, "");
  const match = text.match(/(\d{3}-(?:\d{2}[A-Z]?|[A-Z]\d{2}[A-Z]?))/);
  if (!match) return "";
  return match[1];
}

function extractTiGangCode(value = "") {
  const text = String(value || "")
    .toUpperCase()
    .replace(/\s+/g, "");
  const match = text.match(/([A-Z]{2}[-_]?\d{2})/);
  if (!match) return "";
  return match[1].replace(/[-_]/g, "");
}

function isNonPriorityNeolithColor(value = "") {
  const text = String(value || "");
  return (
    text.includes("停產") || text.includes("期貨") || text.includes("售完為止")
  );
}

function buildNeolithCodeCandidates(value = "") {
  const text = String(value || "")
    .toUpperCase()
    .replace(/\s+/g, "");
  const candidates = [];

  const pushCandidate = (code = "") => {
    const normalized = String(code || "").trim();
    if (!normalized) return;
    if (!candidates.includes(normalized)) {
      candidates.push(normalized);
    }
  };

  const primary = extractNeolithCode(text);
  pushCandidate(primary);

  const trailingLetterCode = primary.match(/^(\d{3})-(\d{2}|[A-Z]\d{2})[A-Z]$/);
  if (trailingLetterCode) {
    pushCandidate(`${trailingLetterCode[1]}-${trailingLetterCode[2]}`);
  }

  const segmentedCode = text.match(/(\d{3})-(\d{2})-[A-Z0-9]+/);
  if (segmentedCode) {
    pushCandidate(`${segmentedCode[1]}-${segmentedCode[2]}`);
  }

  const genericBaseCode = text.match(/(\d{3})-(\d{2})[A-Z0-9]*/);
  if (genericBaseCode) {
    pushCandidate(`${genericBaseCode[1]}-${genericBaseCode[2]}`);
  }

  return candidates;
}

function findNeolithImageUrl(imageMap, colorValue = "") {
  const candidates = buildNeolithCodeCandidates(colorValue);
  for (const code of candidates) {
    if (imageMap.has(code)) {
      return imageMap.get(code);
    }
  }
  return "";
}

function normalizeKuoshiCode(value = "") {
  const upper = String(value || "")
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/_/g, "-");
  const match = upper.match(/^(QJ|MQ|EG)-?([A-Z0-9]+)/);
  if (!match) return "";
  return `${match[1]}-${match[2]}`;
}

function buildKuoshiCodeCandidates(value = "") {
  const text = String(value || "")
    .toUpperCase()
    .replace(/\s+/g, "");

  const candidates = [];
  const pushCandidate = (code = "") => {
    const normalized = normalizeKuoshiCode(code);
    if (!normalized) return;
    if (!candidates.includes(normalized)) {
      candidates.push(normalized);
    }
  };

  const matches = text.match(/(?:QJ|MQ|EG)-?[A-Z0-9]+/g) || [];
  matches.forEach((token) => {
    pushCandidate(token);
    const normalized = normalizeKuoshiCode(token);
    const qjExpanded = normalized.match(/^QJ-2([0-9A-Z]{3,})$/);
    if (qjExpanded) {
      pushCandidate(`QJ-${qjExpanded[1]}`);
    }
  });

  return candidates;
}

function findKuoshiImageUrl(imageMap, colorValue = "") {
  const candidates = buildKuoshiCodeCandidates(colorValue);
  for (const code of candidates) {
    if (imageMap.has(code)) {
      return imageMap.get(code);
    }
  }
  return "";
}

function findAbkImageUrl(imageMap, colorValue = "") {
  const key = normalizeMappingKey(colorValue);
  if (!key) return "";

  if (imageMap.has(key)) {
    return imageMap.get(key);
  }

  for (const [candidate, imageUrl] of imageMap.entries()) {
    if (!candidate) continue;
    if (key.includes(candidate) || candidate.includes(key)) {
      return imageUrl;
    }
  }

  return "";
}

function toPermissionMessage(error, fallback = "操作失敗") {
  const code = String(error?.code || "").toLowerCase();
  const messageText = String(error?.message || "").toLowerCase();

  if (
    code.includes("permission-denied") ||
    messageText.includes("insufficient permissions")
  ) {
    return "Firestore 權限不足：請確認目前帳號角色為 管理者/admin";
  }
  return String(error?.message || fallback);
}

async function fetchCsv(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`讀取失敗：${response.status}`);
  }
  return parseCsv(await response.text());
}

async function loadSilestoneImageMap() {
  const mappingPath = "/silestone-image-mapping.csv";
  const response = await fetch(mappingPath, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(
      `讀取賽麗石對照檔失敗（${mappingPath}）：HTTP ${response.status}`,
    );
  }

  const rows = parseCsv(await response.text());
  if (!rows.length) return new Map();

  const header = rows[0] || [];
  const map = buildHeaderIndexMap(header);
  const codeIndex = getIndexByAliases(map, ["color", "色號", "code"], 1);
  const urlIndex = getIndexByAliases(
    map,
    ["imageurl", "圖片網址", "圖片位址", "url"],
    2,
  );

  return new Map(
    rows
      .slice(1)
      .map((row) => ({
        code: extractColorCode(getCell(row, codeIndex)),
        imageUrl: getCell(row, urlIndex),
      }))
      .filter((row) => row.code && row.imageUrl)
      .map((row) => [row.code, row.imageUrl]),
  );
}

async function loadDitongImageMap() {
  const mappingPath = "/ditong-image-mapping.csv";
  const response = await fetch(mappingPath, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(
      `讀取帝通石對照檔失敗（${mappingPath}）：HTTP ${response.status}`,
    );
  }

  const rows = parseCsv(await response.text());
  if (!rows.length) return new Map();

  const header = rows[0] || [];
  const map = buildHeaderIndexMap(header);
  const codeIndex = getIndexByAliases(map, ["color", "色號", "code"], 1);
  const urlIndex = getIndexByAliases(
    map,
    ["imageurl", "圖片網址", "圖片位址", "url"],
    2,
  );

  return new Map(
    rows
      .slice(1)
      .map((row) => ({
        code: extractColorCode(getCell(row, codeIndex)),
        imageUrl: getCell(row, urlIndex),
      }))
      .filter((row) => row.code && row.imageUrl)
      .map((row) => [row.code, row.imageUrl]),
  );
}

async function loadNeolithImageMap() {
  const mappingPath = "/neolith-image-mapping.csv";
  const response = await fetch(mappingPath, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(
      `讀取耐麗石對照檔失敗（${mappingPath}）：HTTP ${response.status}`,
    );
  }

  const rows = parseCsv(await response.text());
  if (!rows.length) return new Map();

  const header = rows[0] || [];
  const map = buildHeaderIndexMap(header);
  const codeIndex = getIndexByAliases(map, ["color", "色號", "code"], 1);
  const urlIndex = getIndexByAliases(
    map,
    ["imageurl", "圖片網址", "圖片位址", "url"],
    2,
  );

  const imageMap = new Map();
  rows.slice(1).forEach((row) => {
    const codeText = getCell(row, codeIndex);
    const imageUrl = getCell(row, urlIndex);
    if (!imageUrl) return;

    const candidates = buildNeolithCodeCandidates(codeText);
    candidates.forEach((code) => {
      if (!code || imageMap.has(code)) return;
      imageMap.set(code, imageUrl);
    });
  });

  return imageMap;
}

async function loadTiGangImageMap() {
  const mappingPath = "/tigang-image-mapping.csv";
  const response = await fetch(mappingPath, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(
      `讀取鈦鋼石對照檔失敗（${mappingPath}）：HTTP ${response.status}`,
    );
  }

  const rows = parseCsv(await response.text());
  if (!rows.length) return new Map();

  const header = rows[0] || [];
  const map = buildHeaderIndexMap(header);
  const codeIndex = getIndexByAliases(map, ["color", "色號", "code"], 1);
  const urlIndex = getIndexByAliases(
    map,
    ["imageurl", "圖片網址", "圖片位址", "url"],
    2,
  );

  return new Map(
    rows
      .slice(1)
      .map((row) => ({
        code: extractTiGangCode(getCell(row, codeIndex)),
        imageUrl: getCell(row, urlIndex),
      }))
      .filter((row) => row.code && row.imageUrl)
      .map((row) => [row.code, row.imageUrl]),
  );
}

async function loadAbkImageMap() {
  const mappingPath = "/abk-image-mapping.csv";
  const response = await fetch(mappingPath, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(
      `讀取 ABK 對照檔失敗（${mappingPath}）：HTTP ${response.status}`,
    );
  }

  const rows = parseCsv(await response.text());
  if (!rows.length) return new Map();

  const header = rows[0] || [];
  const map = buildHeaderIndexMap(header);
  const colorIndex = getIndexByAliases(
    map,
    ["color", "色號", "顏色", "code"],
    1,
  );
  const urlIndex = getIndexByAliases(
    map,
    ["imageurl", "圖片網址", "圖片位址", "url"],
    2,
  );

  const imageMap = new Map();
  rows.slice(1).forEach((row) => {
    const key = normalizeMappingKey(getCell(row, colorIndex));
    const imageUrl = getCell(row, urlIndex);
    if (!key || !imageUrl || imageMap.has(key)) return;
    imageMap.set(key, imageUrl);
  });

  return imageMap;
}

async function loadKuoshiImageMap() {
  const mappingPath = "/kuoshi-image-mapping.csv";
  const response = await fetch(mappingPath, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(
      `讀取闊石對照檔失敗（${mappingPath}）：HTTP ${response.status}`,
    );
  }

  const rows = parseCsv(await response.text());
  if (!rows.length) return new Map();

  const header = rows[0] || [];
  const map = buildHeaderIndexMap(header);
  const colorIndex = getIndexByAliases(
    map,
    ["color", "色號", "顏色", "code"],
    1,
  );
  const urlIndex = getIndexByAliases(
    map,
    ["imageurl", "圖片網址", "圖片位址", "url"],
    2,
  );

  const imageMap = new Map();
  rows.slice(1).forEach((row) => {
    const code = normalizeKuoshiCode(getCell(row, colorIndex));
    const imageUrl = getCell(row, urlIndex);
    if (!code || !imageUrl || imageMap.has(code)) return;
    imageMap.set(code, imageUrl);
  });

  return imageMap;
}

async function loadInventoryColorCatalog() {
  const rows = await fetchCsv(COLOR_CSV_URL);
  const headerRow = rows[0] || [];
  const headerMap = buildHeaderIndexMap(headerRow);
  const hit = ["品牌", "色號", "id", "gid", "圖片網址", "status"]
    .map((name) => normalizeHeader(name))
    .filter((key) => headerMap.has(key)).length;
  const hasHeader = hit >= 2;
  const dataRows = hasHeader ? rows.slice(1) : rows;

  const brandIndex = hasHeader
    ? getIndexByAliases(headerMap, ["品牌", "brand"], 0)
    : 0;
  const colorIndex = hasHeader
    ? getIndexByAliases(headerMap, ["色號", "顏色", "color"], 1)
    : 1;
  const sheetIdIndex = hasHeader
    ? getIndexByAliases(headerMap, ["id", "sheetid"], 2)
    : 2;
  const gidIndex = hasHeader ? getIndexByAliases(headerMap, ["gid"], 3) : 3;
  const imageUrlIndex = hasHeader
    ? getIndexByAliases(
        headerMap,
        ["圖片網址", "圖片url", "url", "imageurl"],
        4,
      )
    : 4;
  const statusIndex = hasHeader
    ? getIndexByAliases(headerMap, ["status", "狀態"], 5)
    : 5;

  const csvColors = dataRows
    .map((row) => ({
      brand: getCell(row, brandIndex),
      color: getCell(row, colorIndex),
      sheetId: getCell(row, sheetIdIndex),
      gid: getCell(row, gidIndex),
      imageUrl: getCell(row, imageUrlIndex),
      status: getCell(row, statusIndex),
    }))
    .filter((row) => row.brand && row.color && row.sheetId && row.gid);

  try {
    const firestoreColors = await listInventoryColors();
    const normalizedFirestoreColors = firestoreColors
      .map((row) => ({
        brand: String(row.brand || "").trim(),
        color: String(row.color || "").trim(),
        sheetId: String(row.sheetId || "").trim(),
        gid: String(row.gid || "").trim(),
        imageUrl: String(row.imageUrl || "").trim(),
        status: String(row.status || "").trim(),
      }))
      .filter((row) => row.brand && row.color && row.sheetId && row.gid);

    if (!normalizedFirestoreColors.length) {
      return csvColors;
    }

    const keyOf = (row) => `${row.sheetId}|${row.gid}`;
    const firestoreMap = new Map(
      normalizedFirestoreColors.map((row) => [keyOf(row), row]),
    );
    const csvKeys = new Set(csvColors.map((row) => keyOf(row)));

    const merged = csvColors.map((row) => firestoreMap.get(keyOf(row)) || row);
    normalizedFirestoreColors.forEach((row) => {
      if (!csvKeys.has(keyOf(row))) {
        merged.push(row);
      }
    });

    return merged;
  } catch (error) {
    console.warn("讀取 Firestore 顏色主檔失敗，改用 CSV：", error);
    return csvColors;
  }
}

async function syncMasterToFirestore() {
  masterSyncing.value = true;
  masterMessage.value = "";
  try {
    const rows = await fetchCsv(COLOR_CSV_URL);
    const headerRow = rows[0] || [];
    const headerMap = buildHeaderIndexMap(headerRow);
    const hit = ["品牌", "色號", "id", "gid"]
      .map((name) => normalizeHeader(name))
      .filter((key) => headerMap.has(key)).length;
    const hasHeader = hit >= 2;
    const dataRows = hasHeader ? rows.slice(1) : rows;

    const brandIndex = hasHeader
      ? getIndexByAliases(headerMap, ["品牌", "brand"], 0)
      : 0;
    const colorIndex = hasHeader
      ? getIndexByAliases(headerMap, ["色號", "顏色", "color"], 1)
      : 1;
    const sheetIdIndex = hasHeader
      ? getIndexByAliases(headerMap, ["id", "sheetid"], 2)
      : 2;
    const gidIndex = hasHeader ? getIndexByAliases(headerMap, ["gid"], 3) : 3;
    const imageUrlIndex = hasHeader
      ? getIndexByAliases(
          headerMap,
          ["圖片網址", "圖片url", "url", "imageurl"],
          4,
        )
      : 4;
    const statusIndex = hasHeader
      ? getIndexByAliases(headerMap, ["status", "狀態"], 5)
      : 5;

    const payload = dataRows
      .map((row) => ({
        brand: getCell(row, brandIndex),
        color: getCell(row, colorIndex),
        sheetId: getCell(row, sheetIdIndex),
        gid: getCell(row, gidIndex),
        imageUrl: getCell(row, imageUrlIndex),
        status: getCell(row, statusIndex),
      }))
      .filter((row) => row.brand && row.color && row.sheetId && row.gid);

    const result = await bulkUpsertInventoryColors(payload);
    masterMessage.value = `已同步 ${result.written || 0} 筆顏色至 Firestore`;
  } catch (error) {
    console.error("同步顏色主檔失敗:", error);
    masterMessage.value = toPermissionMessage(error, "同步失敗");
  } finally {
    masterSyncing.value = false;
  }
}

async function repairMissingImagesOnly() {
  repairSyncing.value = true;
  masterMessage.value = "";
  try {
    const safeLoadMap = async (loader) => {
      try {
        return await loader();
      } catch (error) {
        console.warn("修復缺失照片：讀取對照檔失敗", error);
        return new Map();
      }
    };

    const colorCatalog = await loadInventoryColorCatalog();
    const [silestoneMap, ditongMap, neolithMap, tigangMap, abkMap, kuoshiMap] =
      await Promise.all([
        safeLoadMap(loadSilestoneImageMap),
        safeLoadMap(loadDitongImageMap),
        safeLoadMap(loadNeolithImageMap),
        safeLoadMap(loadTiGangImageMap),
        safeLoadMap(loadAbkImageMap),
        safeLoadMap(loadKuoshiImageMap),
      ]);

    const missingRows = colorCatalog.filter(
      (row) => !String(row.imageUrl || "").trim(),
    );

    const updates = [];
    missingRows.forEach((row) => {
      const brand = String(row.brand || "").trim();
      let imageUrl = "";

      if (brand.startsWith("賽麗石")) {
        const code = extractColorCode(row.color);
        imageUrl = silestoneMap.get(code) || "";
      } else if (brand.startsWith("帝通石")) {
        const code = extractColorCode(row.color);
        imageUrl = ditongMap.get(code) || "";
      } else if (brand.startsWith("耐麗石")) {
        if (!isNonPriorityNeolithColor(row.color)) {
          imageUrl = findNeolithImageUrl(neolithMap, row.color);
        }
      } else if (brand.startsWith("鈦鋼石")) {
        const code = extractTiGangCode(row.color);
        imageUrl = tigangMap.get(code) || "";
      } else if (brand.includes("ABK")) {
        imageUrl = findAbkImageUrl(abkMap, row.color);
      } else if (brand.includes("闊石")) {
        imageUrl = findKuoshiImageUrl(kuoshiMap, row.color);
      }

      if (!imageUrl) return;

      updates.push({
        ...row,
        imageUrl,
      });
    });

    if (!updates.length) {
      masterMessage.value = `沒有可修復的缺失照片（缺圖 ${missingRows.length} 筆）`;
      return;
    }

    let updated = 0;
    for (const row of updates) {
      await upsertInventoryColor({
        brand: row.brand,
        color: row.color,
        sheetId: row.sheetId,
        gid: row.gid,
        imageUrl: row.imageUrl,
        status: row.status || "active",
      });
      updated += 1;
    }

    masterMessage.value = `已修復缺失照片 ${updated} 筆（原缺圖 ${missingRows.length} 筆）`;
  } catch (error) {
    console.error("修復缺失照片失敗:", error);
    masterMessage.value = toPermissionMessage(error, "修復缺失照片失敗");
  } finally {
    repairSyncing.value = false;
  }
}

function reload() {
  loadSettings();
}

onMounted(() => {
  loadSettings();
});
</script>

<style scoped>
.settings-wrap {
  max-width: 860px;
}

.error-text {
  color: #dc2626;
}

.batch-result-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.88em;
}
.batch-result-table th,
.batch-result-table td {
  border: 1px solid #d1d5db;
  padding: 4px 8px;
  text-align: left;
}
.batch-result-table th {
  background: #f3f4f6;
  font-weight: 600;
}
.batch-result-table .row-notfound td {
  background: #fef9c3;
}
.batch-result-table .row-error td {
  background: #fee2e2;
}

/* 設定頁區塊構成 */
.settings-group-label {
  font-size: 0.7em;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #6b7280;
  padding: 0 4px 6px;
  border-bottom: 2px solid #e5e7eb;
  margin-bottom: 12px;
}
.settings-section {
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 18px 20px 16px;
  margin-bottom: 14px;
  background: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
}
.section-head {
  margin-bottom: 14px;
}
.section-title {
  font-size: 0.92em;
  font-weight: 700;
  color: #111827;
  margin: 0 0 4px;
}
.section-desc {
  font-size: 0.82em;
  color: #6b7280;
  margin: 0;
  line-height: 1.5;
}
.check-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.9em;
  cursor: pointer;
}
.check-row input[type="checkbox"] {
  width: 15px;
  height: 15px;
  accent-color: #1d4ed8;
}
.save-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 20px;
  background: #f8faff;
  border: 1px solid #c7d8f7;
  border-radius: 10px;
  margin-bottom: 8px;
}
.save-msg {
  margin: 0;
  font-size: 0.88em;
}

/* 差勤規則網格（保留） */
.att-rules-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 12px 20px;
  align-items: end;
}
.att-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.att-field label:first-child {
  font-size: 0.82em;
  color: #6b7280;
  font-weight: 500;
}
.att-field input[type="time"],
.att-field input[type="number"],
.att-field select {
  padding: 5px 8px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 0.9em;
  background: #fff;
  width: 100%;
  box-sizing: border-box;
}
.att-field--sm {
  max-width: 110px;
}
.att-field--check {
  justify-content: flex-end;
}
.att-check-label {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 0.88em;
  cursor: pointer;
  padding: 6px 0;
}
.att-check-label input[type="checkbox"] {
  width: 16px;
  height: 16px;
  cursor: pointer;
  accent-color: #1d4ed8;
}
</style>
