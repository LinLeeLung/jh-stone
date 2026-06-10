<template>
  <div
    class="conf-root"
    @mousemove.prevent="onMouseMove"
    @mouseup="onMouseUp"
    @mouseleave="onMouseUp"
    @click.self="clearSelections"
  >
    <!-- 工具列 -->
    <div class="conf-toolbar no-print">
      <RouterLink :to="`/orders`" class="back-btn">← 訂單列表</RouterLink>
      <RouterLink :to="`/orders/${orderId}/edit`" class="back-btn"
        >✏️ 訂單編輯</RouterLink
      >
      <RouterLink :to="`/orders/${orderId}/drawing`" class="back-btn"
        >← 繪圖</RouterLink
      >
      <RouterLink :to="`/orders/${orderId}/original-review`" class="back-btn"
        >🖼️ 原圖</RouterLink
      >
      <span class="toolbar-title">📋 生產確定單</span>
      <div class="toolbar-right">
        <span class="hint">{{ toolbarHint }}</span>
        <!-- 手繪工具 -->
        <button
          class="btn-draw"
          :class="{ 'draw-on': drawTool === null }"
          @click="setDrawTool(null)"
          title="選取與移動既有物件"
        >
          ↖ 移動
        </button>
        <button
          class="btn-draw"
          :class="{ 'draw-on': drawTool === 'pen' }"
          @click="setDrawTool('pen')"
          title="自由手繪"
        >
          ✏️ 筆
        </button>
        <button
          class="btn-draw"
          :class="{ 'draw-on': drawTool === 'erase' }"
          @click="setDrawTool('erase')"
          title="擦除手繪筆跡"
        >
          🧹 擦
        </button>
        <button
          class="btn-draw"
          :class="{ 'draw-on': drawTool === 'line' }"
          @click="setDrawTool('line')"
          title="拖拉畫直線"
        >
          ╱ 直線
        </button>
        <button
          class="btn-draw"
          :class="{ 'draw-on': drawTool === 'measure' }"
          @click="setDrawTool('measure')"
          title="拖拉畫測量線，會顯示長度"
        >
          ↔ 測量
        </button>
        <button
          class="btn-draw"
          :class="{ 'draw-on': drawTool === 'rect' }"
          @click="setDrawTool('rect')"
          title="拖拉畫矩形"
        >
          ▭ 框
        </button>
        <button
          class="btn-draw"
          :class="{ 'draw-on': drawTool === 'ellipse' }"
          @click="setDrawTool('ellipse')"
          title="拖拉畫橢圓，Shift 可鎖成正圓"
        >
          ◯ 圓
        </button>
        <div
          v-show="
            ['rect', 'ellipse'].includes(drawTool) ||
            ['rect', 'ellipse'].includes(selectedShapeOverlay?.type)
          "
          class="rect-mode-btns"
        >
          <button
            class="rect-mode-btn"
            :class="{ active: rectStyle === 'outline' }"
            title="邊框圖形"
            @click="setRectStyleMode('outline')"
          >
            ▢
          </button>
          <button
            class="rect-mode-btn"
            :class="{ active: rectStyle === 'fill' }"
            title="實體圖形"
            @click="setRectStyleMode('fill')"
          >
            ■
          </button>
        </div>
        <button
          class="btn-draw"
          :class="{ 'draw-on': drawTool === 'text' }"
          @click="setDrawTool('text')"
          title="點一下放入文字，可雙擊既有文字編輯"
        >
          T 文字
        </button>
        <input
          v-show="drawTool === 'text'"
          ref="quickTextInputRef"
          v-model="quickTextDraft"
          class="quick-text-input"
          type="text"
          placeholder="先輸入文字，再點位置可連續貼上"
        />
        <div
          v-show="
            (drawTool && drawTool !== 'erase') ||
            selectedShapeOverlay ||
            selectedTextOverlay
          "
          class="common-color-palette"
          title="常用顏色"
        >
          <button
            v-for="color in commonColors"
            :key="color"
            class="color-swatch"
            :class="{ active: drawColor === color }"
            :style="{ background: color }"
            type="button"
            @click="setDrawColor(color)"
          />
        </div>
        <div
          v-show="
            drawTool !== null || selectedShapeOverlay || selectedTextOverlay
          "
          class="sz-btns"
        >
          <button
            v-for="w in strokeWidths"
            :key="w"
            class="sz-btn"
            :class="{ 'sz-on': drawWidth === w }"
            :title="w + ' px'"
            @click="setStrokeWidth(w)"
          >
            <span
              class="sz-line"
              :style="{
                height: Math.min(w, 18) + 'px',
                background:
                  drawTool === 'erase' ? '#94a3b8' : drawColor || '#e00000',
              }"
            />
          </button>
        </div>
        <button
          v-show="drawTool !== null"
          class="btn-draw"
          @click="clearAnnotCanvas"
          title="清除全部手繪"
        >
          🗑️
        </button>
        <div class="snapshot-tool">
          <button
            class="btn-img"
            :disabled="snapshotting"
            @click="copyConfirmedSnapshot"
            title="快照工具：擷取這張確定單並複製到剪貼簿，可直接貼到 LINE"
          >
            {{ snapshotting ? "快照中…" : "📸 快照確定單" }}
          </button>
          <button
            class="btn-img-caret"
            :class="{ active: showSnapshotMenu }"
            @click.stop="toggleSnapshotMenu"
            title="選擇快照來源"
          >
            ▾
          </button>
          <div v-if="showSnapshotMenu" class="snapshot-menu">
            <button class="snapshot-menu-item" @click="copyConfirmedSnapshot">
              📋 複製確定單快照
            </button>
            <button
              class="snapshot-menu-item"
              @click="downloadConfirmedSnapshot"
            >
              💾 下載 PNG
            </button>
            <button class="snapshot-menu-item" @click="openImagePicker">
              🖼️ 插入圖片
            </button>
          </div>
        </div>
        <input
          ref="imgInputRef"
          type="file"
          accept="image/*"
          style="display: none"
          @change="onImgFile"
        />
        <button
          class="btn-stamp"
          :class="{ active: showStampPanel }"
          @click="showStampPanel = !showStampPanel"
          title="圖章庫"
        >
          🔖 圖章
        </button>
        <button
          v-show="selectedShapeOverlay?.type === 'measure'"
          class="btn-draw"
          @click="setMeasurementReferenceFromSelected"
          title="把目前選中的測量線設定為實際距離，其他測量線會按比例更新"
        >
          📏 設基準
        </button>
        <span v-show="measurementScale !== 1" class="measure-scale-badge">
          基準 {{ measurementScaleText }}
        </span>
        <button
          v-show="measurementScale !== 1"
          class="btn-draw"
          @click="resetMeasurementScale"
          title="清除基準比例，回到版面預設換算"
        >
          ↺ 重設基準
        </button>
        <button class="btn-print" @click="doPrint" title="列印或輸出 PDF">
          🖨️ 列印 / PDF
        </button>
        <button
          class="btn-save"
          :disabled="saving"
          @click="doSave"
          title="儲存目前標註與設定"
        >
          {{ saving ? "儲存中…" : "💾 儲存" }}
        </button>
        <!-- 手動上傳確定單 PDF（手繪版） -->
        <button
          v-if="order?.status === 'confirmed' || confirmedPdfUrl"
          class="btn-upload-pdf"
          :disabled="pdfUploading"
          @click="pdfUploadRef.click()"
          title="上傳手繪確定單PDF（取代現有）"
        >
          {{ pdfUploading ? "上傳中…" : "📤 上傳PDF" }}
        </button>
        <input
          ref="pdfUploadRef"
          type="file"
          accept="application/pdf"
          style="display: none"
          @change="onUploadPdfFile"
        />
        <span v-if="pdfGenerating" class="save-msg pdf-generating"
          >⏳ 封存PDF中…</span
        >
        <template v-else-if="confirmedPdfUrl">
          <a :href="confirmedPdfUrl" target="_blank" class="btn-pdf-link"
            >📄 確定單PDF</a
          >
          <button class="btn-repdf" @click="regeneratePdf" title="重新封存PDF">
            ↺
          </button>
        </template>
        <button
          v-else-if="order?.status === 'confirmed'"
          class="btn-repdf"
          @click="regeneratePdf"
        >
          📄 封存PDF
        </button>
        <span v-if="saveMsg" class="save-msg">{{ saveMsg }}</span>
      </div>
    </div>

    <!-- A4 橫式頁面 -->
    <div class="page-wrap">
      <div class="a4-page" ref="pageRef">
        <!-- ① 頂部標題列 -->
        <div class="top-strip">
          <span class="doc-star">★生產確定單★</span>
          <span class="co-info"
            >新北市林口區南勢里77-3號D棟／電話:02-26080192~3／傳真:02-26080194(確認傳真請撥#56)／出貨.維修#66　對圖#69　打板#18　會計#68</span
          >
        </div>

        <!-- ② 主體 -->
        <div class="body-row">
          <!-- 左側直條 -->
          <div class="vert-strip vert-l">
            <span
              class="vert-txt"
              v-html="
                splitVert(
                  '務必請桶身師父加強水平及桶身懸空處的結構，尤其是有缺角的地方，謝謝！',
                )
              "
            ></span>
          </div>

          <!-- 主內容 -->
          <div class="main-area">
            <!-- 上半：左欄（欄位+水槽+爐子） | 右大繪圖區 -->
            <div class="upper-body">
              <!-- 左欄：訂單欄位 + 水槽 + 爐子 -->
              <div class="left-col" ref="leftColRef">
                <div class="fields-top">
                  <table class="fields-tbl">
                    <tr>
                      <td class="lbl">訂單編號</td>
                      <td class="val" colspan="3">
                        {{ order?.orderNo || "" }}
                      </td>
                    </tr>
                    <tr>
                      <td class="lbl">客戶名稱</td>
                      <td class="val" colspan="3">
                        {{ order?.customerName || "" }}
                      </td>
                    </tr>
                    <tr>
                      <td class="lbl">客戶端業務</td>
                      <td class="val" colspan="3">
                        {{
                          [
                            order?.customerContact?.name,
                            order?.customerContact?.phone,
                          ]
                            .filter(Boolean)
                            .join(" ")
                        }}
                      </td>
                    </tr>
                    <tr>
                      <td class="lbl">圖面傳真</td>
                      <td class="val" colspan="3">{{ customerFaxDisplay }}</td>
                    </tr>
                    <tr>
                      <td class="lbl">備　　註</td>
                      <td class="val note-val" colspan="3">
                        {{ orderRemarkDisplay }}
                      </td>
                    </tr>
                    <tr>
                      <td class="lbl">下　單　日</td>
                      <td class="val" colspan="3">
                        {{ fmtDate(order?.orderedAt) }}
                      </td>
                    </tr>
                    <tr>
                      <td class="lbl">預計交貨日</td>
                      <td class="val" colspan="3">
                        {{ fmtDate(order?.promisedAt) }}
                      </td>
                    </tr>
                    <tr>
                      <td class="lbl">{{ stoneTypeLbl }}</td>
                      <td class="val" colspan="3">
                        <div v-for="(c, i) in stoneColors" :key="i">
                          {{ c }}
                        </div>
                      </td>
                    </tr>
                    <tr class="edge-row">
                      <td class="lbl">前沿<br />造型</td>
                      <td colspan="3" class="edge-cell">
                        <div class="edge-choice-list">
                          <button
                            type="button"
                            class="edge-choice"
                            :class="{ active: cf.edgeType === 'bevel' }"
                            @click="
                              cf.edgeType = 'bevel';
                              markDirty();
                            "
                          >
                            <span class="edge-choice-shape">△</span>
                            <span class="edge-choice-mark"
                              >（{{
                                cf.edgeType === "bevel" ? "✓" : "　"
                              }}）</span
                            >
                            <span class="edge-choice-label">3mm斜角</span>
                          </button>
                          <button
                            type="button"
                            class="edge-choice"
                            :class="{ active: cf.edgeType === 'round' }"
                            @click="
                              cf.edgeType = 'round';
                              markDirty();
                            "
                          >
                            <span class="edge-choice-shape">○</span>
                            <span class="edge-choice-mark"
                              >（{{
                                cf.edgeType === "round" ? "✓" : "　"
                              }}）</span
                            >
                            <span class="edge-choice-label">3mm圓角</span>
                          </button>
                          <button
                            type="button"
                            class="edge-choice"
                            :class="{ active: cf.edgeType === 'dull' }"
                            @click="
                              cf.edgeType = 'dull';
                              markDirty();
                            "
                          >
                            <span class="edge-choice-shape">□</span>
                            <span class="edge-choice-mark"
                              >（{{
                                cf.edgeType === "dull" ? "✓" : "　"
                              }}）</span
                            >
                            <span class="edge-choice-label">1mm磨不利</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  </table>
                </div>
                <!-- fields-top -->

                <!-- 水槽 -->
                <div class="sub-section">
                  <div class="section-head">水槽</div>
                  <table class="detail-tbl">
                    <colgroup>
                      <col style="width: 14%" />
                      <col style="width: 32%" />
                      <col style="width: 54%" />
                    </colgroup>
                    <tbody>
                      <tr v-for="s in paddedSinks" :key="s._i">
                        <td>
                          <span class="detail-cell-text">{{
                            s.method || ""
                          }}</span>
                        </td>
                        <td>
                          <span class="detail-cell-text">{{
                            s.model || ""
                          }}</span>
                        </td>
                        <td>
                          <span class="detail-cell-text">{{
                            sinkSizeText(s)
                          }}</span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <!-- 爐子 -->
                <div class="sub-section stove-section">
                  <div class="section-head">爐子</div>
                  <table class="detail-tbl">
                    <colgroup>
                      <col style="width: 14%" />
                      <col style="width: 32%" />
                      <col style="width: 54%" />
                    </colgroup>
                    <tbody>
                      <tr v-for="s in paddedStoves" :key="s._i">
                        <td>
                          <span class="detail-cell-text">{{
                            s.method || ""
                          }}</span>
                        </td>
                        <td>
                          <span class="detail-cell-text">{{
                            s.model || ""
                          }}</span>
                        </td>
                        <td>
                          <span class="detail-cell-text">{{
                            stoveSizeText(s)
                          }}</span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div class="sub-section faucet-section">
                  <div class="faucet-cell">
                    <div
                      v-for="(line, i) in faucetDisplayLines"
                      :key="`faucet-${i}`"
                      class="faucet-line"
                    >
                      {{ line }}
                    </div>
                  </div>
                </div>
              </div>

              <!-- 右側大繪圖區 -->
              <div class="drawing-area" ref="drawingPlaceholderRef"></div>
            </div>
            <!-- upper-body -->

            <!-- 安裝地點 -->
            <div class="install-row">
              <div class="install-main-row">
                <span class="lbl">安裝地點</span>
                <span class="val site-val">{{ order?.siteAddress || "" }}</span>
                <span class="lbl-s">業主</span
                ><span class="val-s owner-val">{{
                  order?.owner?.name || ""
                }}</span>
                <span class="lbl-s">電話</span
                ><span class="val-s phone-val">{{
                  order?.owner?.phone || ""
                }}</span>
              </div>
              <div class="install-sticker-lines">
                <div class="sticker-line">
                  <span class="sticker-lbl">下單:</span
                  ><span class="sticker-val">{{ issueOperatorDisplay }}</span>
                </div>
                <div class="sticker-line">
                  <span class="sticker-lbl">打板:</span
                  ><span class="sticker-val">{{
                    fmtStaffWithMonthDay(
                      order?.templatingStaff,
                      order?.templatingDate,
                    )
                  }}</span>
                </div>
                <div class="sticker-line">
                  <span class="sticker-lbl">對圖:</span
                  ><span class="sticker-val">{{
                    order?.drawingStaff || ""
                  }}</span>
                </div>
                <div class="sticker-line">
                  <span class="sticker-lbl">傳真:</span
                  ><span class="sticker-val"></span>
                </div>
              </div>
            </div>

            <!-- 交期說明 -->
            <div class="notice-row">
              <span class="notice-icon">📢</span>
              <span class="notice-text"
                >交期為回簽後7個工作天，圖面未簽回無法生產，為避免延誤貴公司交期，麻煩請盡速回簽。如造成急單須收急單費5～7%</span
              >
            </div>

            <!-- 底部：注意 + 計價區 + 未稅價 + 計價區 + 客戶簽名 -->
            <div class="bottom-row">
              <div class="notes-col">
                <div>如需對紋務必先告知，需加價20% 會提供圖樣</div>
                <ol>
                  <li>圖上的尺寸請核圖。</li>
                  <li>開號？地方請知會。</li>
                  <li>確認後請回簽，謝謝你。</li>
                </ol>
              </div>
              <div class="price-col">
                <div class="price-lbl">未稅價</div>
              </div>
              <div class="price-val-col">
                <div
                  v-if="priceBreakdown.lines.length"
                  :class="[
                    'price-grid',
                    `price-grid--cols-${priceBreakdown.columnCount}`,
                    { 'price-grid--dense': priceBreakdown.isDense },
                  ]"
                >
                  <table
                    v-for="(column, columnIndex) in priceBreakdown.columns"
                    :key="`pcol-${columnIndex}`"
                    class="price-table"
                  >
                    <tbody>
                      <tr
                        v-for="(ln, i) in column"
                        :key="`c${columnIndex}-${i}`"
                      >
                        <td class="pt-desc">{{ ln.desc }}</td>
                        <td class="pt-calc">{{ ln.calc }}</td>
                        <td class="pt-amt">{{ ln.amt }}</td>
                      </tr>
                    </tbody>
                  </table>
                  <div class="price-sum">
                    合計 <span>{{ priceBreakdown.total }}</span>
                  </div>
                </div>
                <span v-else class="price-val">{{ untaxedPriceDisplay }}</span>
              </div>
              <div class="sig-col">
                <div class="sig-lbl">客戶回簽</div>
                <div class="sig-box">
                  <div class="sig-hand">👉</div>
                  <div class="sig-pencil">✍️</div>
                </div>
              </div>
            </div>
          </div>
          <!-- main-area -->

          <!-- 右側直條 -->
          <div class="vert-strip vert-r">
            <span class="vert-txt">零樹脂成分之瓷板，無板材保固。★</span>
            <div class="cabinet-ready-wrap">
              <span class="vert-txt2" v-html="cabinetReadyVertText"></span>
              <div class="cabinet-ready-actions">
                <button
                  type="button"
                  class="cabinet-choice"
                  :class="{ active: cf.cabinetReady === 'yes' }"
                  @click="
                    cf.cabinetReady = 'yes';
                    markDirty();
                  "
                >
                  是
                </button>
                <button
                  type="button"
                  class="cabinet-choice"
                  :class="{ active: cf.cabinetReady === 'no' }"
                  @click="
                    cf.cabinetReady = 'no';
                    markDirty();
                  "
                >
                  否
                </button>
              </div>
            </div>
            <span class="vert-txt2"
              >電梯<input
                v-model="cf.elevator"
                class="ii-vert"
                @change="markDirty"
            /></span>
            <div class="vert-fields">
              <div class="vf-row">
                <span class="vf-lbl">列印</span
                ><span class="vf-val">{{ printedByName || "" }}</span>
              </div>
            </div>
          </div>
        </div>
        <!-- body-row -->

        <!-- 底部傳真 -->
        <div class="fax-strip">峻晟傳真:02-26080194</div>

        <!-- ── 手繪標注 canvas ── -->
        <canvas
          ref="annotCanvasRef"
          class="annot-canvas"
          :class="{ 'draw-active': drawTool !== null }"
          width="1123"
          height="794"
          @mousedown.prevent="onCanvasDown"
          @mousemove.prevent="onCanvasMove"
          @mouseup="onCanvasUp"
          @mouseleave="onCanvasUp"
        />
        <!-- 直線/矩形預覽 canvas（只在拖曳時顯示，不存入 Firestore） -->
        <canvas
          ref="previewCanvasRef"
          class="preview-canvas"
          width="1123"
          height="794"
        />
        <!-- 文字工具輸入框（輸入期間暫時顯示） -->
        <div
          v-if="textBox.visible"
          class="text-box-wrap no-print"
          :style="{ left: textBox.x + 'px', top: textBox.y + 'px' }"
        >
          <div class="text-box-handle" @mousedown.stop.prevent="startTextDrag">
            <span style="flex: 1; pointer-events: none">⠿ 拖移</span>
            <button
              class="text-commit-btn"
              @mousedown.stop
              @click.stop="commitText"
            >
              ✓ 確認
            </button>
            <button
              class="text-cancel-btn"
              @mousedown.stop
              @click.stop="cancelText"
            >
              ✕
            </button>
          </div>
          <textarea
            ref="textInputRef"
            v-model="textBox.value"
            class="text-tool-input"
            :style="{ fontSize: textBox.fontSize + 'px', color: drawColor }"
            rows="2"
            placeholder="Enter 換行，Ctrl+Enter 確認"
            @keydown.ctrl.enter.prevent="commitText"
            @keydown.escape="cancelText"
          />
        </div>

        <!-- 文字疊層（確認後可拖移） -->
        <div
          v-for="ovl in textOverlays"
          :key="ovl.id"
          :class="[
            'txt-ovl',
            { 'txt-ovl-selected': selectedTextId === ovl.id },
          ]"
          :style="{
            left: ovl.x + 'px',
            top: ovl.y + 'px',
            fontSize: ovl.fontSize + 'px',
            color: ovl.color,
          }"
          @mousedown.stop="startTxtOvlDrag($event, ovl)"
          @click.stop="selectTextOverlay(ovl)"
          @dblclick.stop="editTextOverlay(ovl)"
        >
          <button
            class="txt-ovl-del no-print"
            @mousedown.stop
            @click.stop="removeTxtOvl(ovl.id)"
          >
            ×
          </button>
          <div
            class="txt-ovl-rh no-print"
            @mousedown.stop="startTxtOvlResize($event, ovl)"
          />
          <div class="txt-ovl-content">{{ ovl.text }}</div>
        </div>

        <!-- 直線/矩形疊層（確認後可拖移） -->
        <div
          v-for="ovl in shapeOverlays"
          :key="ovl.id"
          :class="[
            'shape-ovl',
            { 'shape-ovl-selected': selectedShapeId === ovl.id },
          ]"
          :style="{
            left: Math.min(ovl.x1, ovl.x2) - ovl.width - 4 + 'px',
            top: Math.min(ovl.y1, ovl.y2) - ovl.width - 4 + 'px',
          }"
          @mousedown.stop="startShapeOvlDrag($event, ovl)"
          @click.stop="selectShapeOverlay(ovl)"
        >
          <button
            v-if="['line', 'measure', 'rect', 'ellipse'].includes(ovl.type)"
            class="shape-ovl-del no-print"
            @mousedown.stop
            @click.stop="removeShapeOvl(ovl.id)"
          >
            ×
          </button>
          <div
            v-if="['rect', 'ellipse'].includes(ovl.type)"
            class="rh rh-se no-print"
            @mousedown.stop="startShapeResize($event, ovl, 'se')"
          />
          <svg
            :width="Math.abs(ovl.x2 - ovl.x1) + (ovl.width + 4) * 2"
            :height="Math.abs(ovl.y2 - ovl.y1) + (ovl.width + 4) * 2"
            style="display: block; overflow: visible; pointer-events: none"
          >
            <defs v-if="ovl.type === 'measure'">
              <marker
                :id="`measure-arrow-start-${ovl.id}`"
                markerWidth="8"
                markerHeight="8"
                refX="2"
                refY="4"
                orient="auto"
                markerUnits="strokeWidth"
              >
                <path d="M8,0 L0,4 L8,8 z" :fill="ovl.color" />
              </marker>
              <marker
                :id="`measure-arrow-end-${ovl.id}`"
                markerWidth="8"
                markerHeight="8"
                refX="6"
                refY="4"
                orient="auto"
                markerUnits="strokeWidth"
              >
                <path d="M0,0 L8,4 L0,8 z" :fill="ovl.color" />
              </marker>
            </defs>
            <line
              v-if="ovl.type === 'line' || ovl.type === 'measure'"
              :x1="ovl.x1 - Math.min(ovl.x1, ovl.x2) + ovl.width + 4"
              :y1="ovl.y1 - Math.min(ovl.y1, ovl.y2) + ovl.width + 4"
              :x2="ovl.x2 - Math.min(ovl.x1, ovl.x2) + ovl.width + 4"
              :y2="ovl.y2 - Math.min(ovl.y1, ovl.y2) + ovl.width + 4"
              :stroke="ovl.color"
              :stroke-width="ovl.width"
              :marker-start="
                ovl.type === 'measure'
                  ? `url(#measure-arrow-start-${ovl.id})`
                  : null
              "
              :marker-end="
                ovl.type === 'measure'
                  ? `url(#measure-arrow-end-${ovl.id})`
                  : null
              "
              stroke-linecap="round"
            />
            <g v-if="ovl.type === 'measure'">
              <rect
                :x="
                  (ovl.x1 -
                    Math.min(ovl.x1, ovl.x2) +
                    ovl.width +
                    4 +
                    (ovl.x2 - Math.min(ovl.x1, ovl.x2) + ovl.width + 4)) /
                    2 -
                  30
                "
                :y="
                  (ovl.y1 -
                    Math.min(ovl.y1, ovl.y2) +
                    ovl.width +
                    4 +
                    (ovl.y2 - Math.min(ovl.y1, ovl.y2) + ovl.width + 4)) /
                    2 -
                  24
                "
                width="60"
                height="18"
                rx="3"
                fill="rgba(255,255,255,0.92)"
                :stroke="ovl.color"
                stroke-width="1"
              />
              <text
                :x="
                  (ovl.x1 -
                    Math.min(ovl.x1, ovl.x2) +
                    ovl.width +
                    4 +
                    (ovl.x2 - Math.min(ovl.x1, ovl.x2) + ovl.width + 4)) /
                  2
                "
                :y="
                  (ovl.y1 -
                    Math.min(ovl.y1, ovl.y2) +
                    ovl.width +
                    4 +
                    (ovl.y2 - Math.min(ovl.y1, ovl.y2) + ovl.width + 4)) /
                    2 -
                  11
                "
                :fill="ovl.color"
                font-size="11"
                font-weight="700"
                text-anchor="middle"
              >
                {{ formatMeasurementLabel(ovl) }}
              </text>
            </g>
            <rect
              v-else-if="ovl.type === 'rect'"
              :x="ovl.width + 4"
              :y="ovl.width + 4"
              :width="Math.abs(ovl.x2 - ovl.x1)"
              :height="Math.abs(ovl.y2 - ovl.y1)"
              :stroke="ovl.rectStyle === 'fill' ? 'none' : ovl.color"
              :stroke-width="ovl.rectStyle === 'fill' ? 0 : ovl.width"
              :fill="ovl.rectStyle === 'fill' ? ovl.color : 'none'"
            />
            <ellipse
              v-else-if="ovl.type === 'ellipse'"
              :cx="Math.abs(ovl.x2 - ovl.x1) / 2 + ovl.width + 4"
              :cy="Math.abs(ovl.y2 - ovl.y1) / 2 + ovl.width + 4"
              :rx="Math.abs(ovl.x2 - ovl.x1) / 2"
              :ry="Math.abs(ovl.y2 - ovl.y1) / 2"
              :stroke="ovl.rectStyle === 'fill' ? 'none' : ovl.color"
              :stroke-width="ovl.rectStyle === 'fill' ? 0 : ovl.width"
              :fill="ovl.rectStyle === 'fill' ? ovl.color : 'none'"
            />
          </svg>
        </div>

        <!-- ── 繪圖區塊（絕對定位，可拖移＋四角縮放）── -->
        <div
          v-for="blk in drawingBlocks"
          :key="blk.drawingId"
          class="drawing-blk"
          :class="{
            'blk-selected': selectedBlkId === blk.drawingId,
            'blk-dragging': draggingId === blk.drawingId,
          }"
          :style="{ left: blk.x + 'px', top: blk.y + 'px' }"
          @mousedown.stop="startDrag($event, blk)"
          @click.stop="selectedBlkId = blk.drawingId"
        >
          <!-- SVG 顯示 -->
          <div
            class="svg-outer"
            :style="{
              width: Math.round(blk.origW * blk.scale) + 'px',
              height: Math.round(blk.origH * blk.scale) + 'px',
            }"
          >
            <div
              v-if="blk.svgContent"
              class="svg-inner"
              :style="{
                transform: `scale(${blk.scale})`,
                transformOrigin: 'top left',
                width: blk.origW + 'px',
                height: blk.origH + 'px',
              }"
              v-html="blk.svgContent"
            />
            <div v-else class="svg-ph no-print">
              ⚠ 先在繪圖頁按「💾 儲存繪圖」
            </div>
            <!-- 繪圖頁截圖疊層 -->
            <img
              v-for="img in blk.overlayImages"
              :key="img.id"
              :src="img.src"
              :style="{
                position: 'absolute',
                left: Math.round(img.x * blk.scale) + 'px',
                top: Math.round(img.y * blk.scale) + 'px',
                width: Math.round(img.w * blk.scale) + 'px',
                pointerEvents: 'none',
              }"
            />
          </div>
          <!-- 四角縮放把手（點選後才顯示，列印時隱藏） -->
          <div
            class="rh rh-nw no-print"
            @mousedown.stop="startResize($event, blk, 'nw')"
          ></div>
          <div
            class="rh rh-ne no-print"
            @mousedown.stop="startResize($event, blk, 'ne')"
          ></div>
          <div
            class="rh rh-sw no-print"
            @mousedown.stop="startResize($event, blk, 'sw')"
          ></div>
          <div
            class="rh rh-se no-print"
            @mousedown.stop="startResize($event, blk, 'se')"
          ></div>
        </div>

        <!-- 截圖疊層 -->
        <div
          v-for="img in overlayImgs"
          :key="img.id"
          class="o-img no-print"
          :style="{
            left: img.x + 'px',
            top: img.y + 'px',
            width: img.w + 'px',
          }"
          @mousedown.stop="startImgDrag($event, img)"
          @dblclick.stop="removeOverlayImg(img.id)"
        >
          <img
            :src="img.src"
            style="width: 100%; display: block; pointer-events: none"
            draggable="false"
          />
          <div
            class="o-img-rh no-print"
            @mousedown.stop="startImgResize($event, img)"
          ></div>
        </div>
        <!-- 圖章疊層 -->
        <div
          v-for="sov in stampOverlays"
          :key="sov.id"
          :class="['s-img', { 's-img-selected': selectedStampId === sov.id }]"
          :style="{
            left: sov.x + 'px',
            top: sov.y + 'px',
            width: sov.w + 'px',
          }"
          @mousedown.stop="startImgDrag($event, sov)"
          @click.stop="selectStampOverlay(sov)"
          @dblclick.stop="removeStampOvl(sov.id)"
        >
          <img
            :src="sov.url"
            style="width: 100%; display: block; pointer-events: none"
            draggable="false"
          />
          <button
            class="s-img-del no-print"
            @mousedown.stop
            @click.stop="removeStampOvl(sov.id)"
          >
            ×
          </button>
          <div
            class="s-img-rh no-print"
            @mousedown.stop="startImgResize($event, sov)"
          ></div>
        </div>
        <!-- /a4-page -->
      </div>
      <!-- page-wrap -->
    </div>

    <!-- 圖章面板 -->
    <StampPanel
      v-if="showStampPanel"
      @close="showStampPanel = false"
      @insert="onStampInsert"
    />
  </div>
</template>

<script setup>
import { ref, computed, reactive, onMounted, onUnmounted, nextTick } from "vue";
import { useRoute, RouterLink, onBeforeRouteLeave } from "vue-router";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import {
  auth,
  authReadyPromise,
  getSalesOrder,
  getCustomerById,
  getCustomerPricing,
  getUserByUid,
  listProductModels,
  listStamps,
  listOrderDrawings,
  getOrderConfirmation,
  saveOrderConfirmation,
  updateCustomerPricing,
  uploadOverlayImage,
  uploadConfirmedPdf,
  refreshConfirmedPdfDownloadUrl,
} from "../../firebase";
import StampPanel from "../../components/StampPanel.vue";

const route = useRoute();
const orderId = computed(() => route.params.id);

const order = ref(null);
const customer = ref(null);
const printedByName = ref("");
const issuedByDisplayName = ref("");
const sinkModelSizeById = ref(new Map());
const sinkModelSizeByName = ref(new Map());
const stoveModelSizeById = ref(new Map());
const stoveModelSizeByName = ref(new Map());

const orderRemarkDisplay = computed(() => {
  const lines = [customer.value?.notes, order.value?.specialNotes]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  return [...new Set(lines)].join("\n");
});

const customerFaxDisplay = computed(() => {
  const candidates = [
    order.value?.customerFax,
    customer.value?.fax,
    customer.value?.contactFax,
    order.value?.customerContact?.fax,
  ];
  for (const value of candidates) {
    const text = String(value || "").trim();
    if (text) return text;
  }
  return "";
});

const issueOperatorDisplay = computed(() => {
  const status = String(order.value?.status || "").trim();
  const showStatuses = new Set(["confirmed", "inProduction", "delivered"]);
  if (!showStatuses.has(status)) return "";
  return issuedByDisplayName.value;
});

// 未稅價顯示：優先取 subtotal（lineItems 小計）→ total（手動輸入）→ lineItems 加總 → grandTotal
const untaxedPriceDisplay = computed(() => {
  const o = order.value;
  if (!o) return "";
  let v = o.subtotal;
  if (v == null) v = o.total;
  if (v == null && Array.isArray(o.lineItems) && o.lineItems.length) {
    v = o.lineItems.reduce((s, li) => s + (Number(li.amount) || 0), 0);
  }
  if (v == null) v = o.grandTotal;
  const n = Number(v);
  return n > 0 ? n.toLocaleString() : "";
});

// 計價明細：讓客人看到「如何算出來的」
// 按 (description-without-dims + unitPrice + unit) 聚合；例如「水槽下嵌（陶板） @3,500×3 = 10,500」
const priceBreakdown = computed(() => {
  const o = order.value;
  const empty = {
    lines: [],
    columns: [],
    columnCount: 2,
    isDense: false,
    total: "",
  };
  if (!o || !Array.isArray(o.lineItems)) return empty;

  // 去掉描述尾部的「 尺寸」（例如 67.8×49cm）以便聚合
  const normName = (s) =>
    String(s || "")
      .replace(/\s+\d+(?:\.\d+)?[x×]\d+(?:\.\d+)?\s*cm?$/i, "")
      .replace(/\s+\d+(?:\.\d+)?\s*cm$/i, "")
      .trim();

  const groups = new Map();
  let total = 0;
  for (const li of o.lineItems) {
    const qty = Number(li.qty) || 0;
    const up = Number(li.unitPrice) || 0;
    const amt = Number(li.amount) || Math.round(qty * up);
    if (!qty && !up && !amt) continue;
    const name = normName(li.description) || li.priceKey || "項目";
    const unit = li.unit || "";
    const key = `${name}__${up}__${unit}`;
    const g = groups.get(key) || {
      name,
      unit,
      unitPrice: up,
      qty: 0,
      amount: 0,
    };
    g.qty += qty;
    g.amount += amt;
    groups.set(key, g);
    total += amt;
  }

  const lines = [...groups.values()].map((g) => {
    const qtyStr = Number.isInteger(g.qty)
      ? g.qty
      : Math.round(g.qty * 100) / 100;
    const calc = g.unitPrice
      ? `@${g.unitPrice.toLocaleString()}×${qtyStr}${g.unit}`
      : `${qtyStr}${g.unit}`;
    return {
      desc: g.name,
      calc,
      amt: g.amount > 0 ? g.amount.toLocaleString() : "",
    };
  });

  const columnCount = lines.length >= 7 ? 3 : 2;
  const rowsPerColumn = Math.ceil(lines.length / columnCount);
  const columns = Array.from({ length: columnCount }, (_, index) =>
    lines.slice(index * rowsPerColumn, (index + 1) * rowsPerColumn),
  ).filter((column) => column.length);

  return {
    lines,
    columns,
    columnCount,
    isDense: lines.length >= 5,
    total: total > 0 ? total.toLocaleString() : "",
  };
});

const confirmedPdfUrl = ref(null);
const pdfGenerating = ref(false);
const pdfUploading = ref(false);
const snapshotting = ref(false);
const drawingBlocks = ref([]);
const saving = ref(false);
const saveMsg = ref("");
const selectedBlkId = ref(null);
const dirty = ref(false);
let savePromise = null;
const CUSTOMER_EDGE_TYPES = new Set(["round", "bevel", "dull"]);

const pageRef = ref(null);
const drawingPlaceholderRef = ref(null);

// 確認單可編輯欄位
const cf = reactive({
  elevator: "",
  faxNo: "",
  edgeType: "sharp",
  cabinetReady: "", // '' | 'yes' | 'no'
  actualDelivery: "",
  price: "",
  panelType: "", // '' | 'a' | 'b' | 'c' | 'd' | 'e'
});

const cabinetReadyVertText = computed(() => {
  const yesMark = cf.cabinetReady === "yes" ? "☑" : "□";
  const noMark = cf.cabinetReady === "no" ? "☑" : "□";
  return splitVert(`桶身${yesMark}是${noMark}否裝`);
});

function normalizePreferredEdgeType(value) {
  const normalized = String(value || "").trim();
  return CUSTOMER_EDGE_TYPES.has(normalized) ? normalized : "";
}

// ── Computed ────────────────────────────────────────────────────────
const stoneTypeLbl = computed(() => {
  if (!order.value?.stones?.length) return "石材";
  const s = order.value.stones[0];
  return (
    [s.brand, s.thick ? s.thick + "cm" : ""].filter(Boolean).join("") || "石材"
  );
});

const stoneColors = computed(() => {
  if (!order.value?.stones?.length) return [];
  return order.value.stones.map((s) => s.color || "");
});

function pad(arr, n) {
  const r = (arr || []).map((s, i) => ({ ...s, _i: i }));
  while (r.length < n) r.push({ _i: r.length });
  return r;
}

function sinkAccessoryLabel(sink = {}) {
  if (!sink?.model) return "";
  const labels = [];
  if (sink.hasAccessory === true) labels.push("有");
  else if (sink.hasAccessory === false) labels.push("無");
  if (sink.hasFaucet === true) labels.push("有龍頭");
  return labels.join("/");
}

function normalizeModelKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function buildModelSizeLookup(models = []) {
  const byId = new Map();
  const byName = new Map();
  for (const item of models || []) {
    const size = String(item?.sizeText || item?.rawText || "").trim();
    if (!size) continue;
    const id = String(item?.id || "").trim();
    if (id) byId.set(id, size);

    const model = String(item?.model || "").trim();
    const brand = String(item?.brand || "").trim();
    const modelKey = normalizeModelKey(model);
    if (modelKey) byName.set(modelKey, size);
    const brandModelKey = normalizeModelKey(
      [brand, model].filter(Boolean).join(" "),
    );
    if (brandModelKey) byName.set(brandModelKey, size);
  }
  return { byId, byName };
}

function fallbackSizeText(item = {}, withRadius = false) {
  const width = String(item?.holeWidthMm ?? "").trim();
  const depth = String(item?.holeDepthMm ?? "").trim();
  const radius = String(item?.holeRadiusMm ?? "").trim();
  if (width && depth) {
    return withRadius && radius
      ? `${width}*${depth}*R${radius}`
      : `${width}*${depth}`;
  }
  if (width || depth) return [width, depth].filter(Boolean).join("*");
  if (withRadius && radius) return `R${radius}`;
  return "";
}

function resolveModelSize(item = {}, kind = "sink") {
  const byId =
    kind === "stove" ? stoveModelSizeById.value : sinkModelSizeById.value;
  const byName =
    kind === "stove" ? stoveModelSizeByName.value : sinkModelSizeByName.value;
  const modelId = String(item?.modelId || item?.modelCode || "").trim();
  if (modelId && byId.has(modelId)) return byId.get(modelId) || "";

  const model = String(item?.model || "").trim();
  const brand = String(item?.brand || "").trim();
  const brandModel = [brand, model].filter(Boolean).join(" ");
  const match =
    byName.get(normalizeModelKey(model)) ||
    byName.get(normalizeModelKey(brandModel));
  if (match) return match;

  const direct = String(item?.sizeText || item?.rawText || "").trim();
  if (direct) return direct;
  return fallbackSizeText(item, kind === "stove");
}

function sinkSizeText(item = {}) {
  return resolveModelSize(item, "sink");
}

function stoveSizeText(item = {}) {
  return resolveModelSize(item, "stove");
}

function isHeaderPlaceholderRow(item = {}, kind = "sink") {
  const method = String(item?.method || "").trim();
  const model = String(item?.model || "").trim();
  const size = String(resolveModelSize(item, kind) || "").trim();
  const isMethodHeader = method === "工法";
  const isModelHeader = model === "型號" || model === "品名";
  const isSizeHeader = size === "呎寸" || size === "呎吋" || size === "尺寸";
  return isMethodHeader && (isModelHeader || isSizeHeader);
}

const paddedSinks = computed(() => {
  const list = Array.isArray(order.value?.sinks) ? order.value.sinks : [];
  return pad(
    list.filter((item) => !isHeaderPlaceholderRow(item, "sink")),
    3,
  );
});
const paddedStoves = computed(() => {
  const list = Array.isArray(order.value?.stoves) ? order.value.stoves : [];
  return pad(
    list.filter((item) => !isHeaderPlaceholderRow(item, "stove")),
    2,
  );
});
const faucetDisplayLines = computed(() => {
  const sinks = Array.isArray(order.value?.sinks) ? order.value.sinks : [];
  const labels = sinks
    .filter((sink) => sink?.hasFaucet === true)
    .map((sink, index) => {
      const model = String(sink?.model || "").trim();
      return model ? `${model} 有龍頭` : `水槽${index + 1} 有龍頭`;
    });
  return labels;
});

function fmtDate(val) {
  if (!val) return "";
  const d = val?.toDate ? val.toDate() : new Date(val);
  return isNaN(d) ? "" : d.toLocaleDateString("zh-TW");
}
function fmtMonthDay(val) {
  if (!val) return "";
  const d = val?.toDate ? val.toDate() : new Date(val);
  return isNaN(d) ? "" : `${d.getMonth() + 1}/${d.getDate()}`;
}
function fmtStaffWithMonthDay(staff, dateVal) {
  const parts = [staff || "", fmtMonthDay(dateVal)].filter(Boolean);
  return parts.join(" ");
}
function mmToCm(val) {
  if (!val) return "";
  const cm = parseFloat(val) / 10;
  return isNaN(cm) ? "" : cm % 1 === 0 ? cm : parseFloat(cm.toFixed(1));
}
const A4_WIDTH_MM = 297;
const A4_HEIGHT_MM = 210;
const A4_WIDTH_PX = 1123;
const A4_HEIGHT_PX = 794;
const SNAPSHOT_RENDER_SCALE = 5;
const CONFIRMED_PDF_MAX_BYTES = 3 * 1024 * 1024;
const PDF_FAST_RENDER_SCALE = 2;
const PDF_FAST_JPEG_QUALITY = 0.72;
const PDF_RENDER_SCALE_CANDIDATES = [2, 1];
const PDF_JPEG_QUALITY_CANDIDATES = [0.66, 0.58, 0.5, 0.42];
const ENABLE_EXPORT_READABLE_STYLE = false;
const DEFAULT_SINK_METHOD_STAMP_NAME = "選水槽下嵌做法";
const measurementScale = ref(1);
const measurementScaleText = computed(
  () => `x${measurementScale.value.toFixed(3)}`,
);
function getMeasurementMm(start, end) {
  const dxMm = (end.x - start.x) * (A4_WIDTH_MM / A4_WIDTH_PX);
  const dyMm = (end.y - start.y) * (A4_HEIGHT_MM / A4_HEIGHT_PX);
  return Math.sqrt(dxMm * dxMm + dyMm * dyMm) * measurementScale.value;
}
function parseMeasurementInput(input) {
  const raw = String(input || "")
    .trim()
    .toLowerCase();
  if (!raw) return null;
  const numeric = Number.parseFloat(raw.replace(/[^\d.\-]/g, ""));
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  if (raw.includes("mm") || raw.includes("毫米")) return numeric;
  if (raw.includes("m") || raw.includes("公尺") || raw.includes("米"))
    return numeric * 1000;
  return raw.includes("cm") || raw.includes("公分")
    ? numeric * 10
    : numeric * 10;
}
function formatMeasurementLabel(shape) {
  const mm = getMeasurementMm(
    { x: Number(shape.x1 || 0), y: Number(shape.y1 || 0) },
    { x: Number(shape.x2 || 0), y: Number(shape.y2 || 0) },
  );
  const cm = mmToCm(mm);
  return cm === "" ? "" : `${cm} CM`;
}

async function renderConfirmedCanvas(
  el,
  w,
  h,
  baseScale,
  { tryForeignObject = true } = {},
) {
  // Ensure webfonts are fully ready; otherwise html2canvas may rasterize fallback fonts.
  if (typeof document !== "undefined" && document.fonts?.ready) {
    try {
      await document.fonts.ready;
    } catch (_) {
      // ignore
    }
  }

  const dpr = Math.max(1, Math.ceil(Number(window?.devicePixelRatio || 1)));
  const renderScale = Math.max(1, Math.ceil(Math.max(baseScale, dpr)));

  const commonOptions = {
    scale: renderScale,
    useCORS: true,
    allowTaint: true,
    logging: false,
    backgroundColor: "#fff",
    width: w,
    height: h,
    windowWidth: w,
    windowHeight: h,
    removeContainer: true,
  };

  el.classList.add("export-rendering");
  if (ENABLE_EXPORT_READABLE_STYLE) {
    el.classList.add("export-readable");
  }
  // Let browser apply export-only styles before rasterizing.
  await nextTick();
  await new Promise((resolve) => requestAnimationFrame(resolve));
  try {
    // foreignObjectRendering can be slower and may produce blank canvas in some setups.
    // Keep it optional so PDF flow can use the faster non-foreignObject path.
    if (tryForeignObject) {
      try {
        const canvas = await html2canvas(el, {
          ...commonOptions,
          foreignObjectRendering: true,
        });
        const ctx = canvas.getContext("2d");
        const pixels = ctx?.getImageData(0, 0, 1, 1)?.data;
        const isProbablyBlank =
          !pixels ||
          (pixels[0] >= 245 &&
            pixels[1] >= 245 &&
            pixels[2] >= 245 &&
            pixels[3] >= 250);
        if (!isProbablyBlank) return canvas;
      } catch (_) {
        // Ignore and retry with default renderer below.
      }
    }

    return await html2canvas(el, {
      ...commonOptions,
      foreignObjectRendering: false,
    });
  } finally {
    el.classList.remove("export-rendering");
    if (ENABLE_EXPORT_READABLE_STYLE) {
      el.classList.remove("export-readable");
    }
  }
}
function drawMeasurementArrowheads(ctx, start, end, color, width) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (!len) return;
  const ux = dx / len;
  const uy = dy / len;
  const arrowLen = Math.max(10, width * 3.5);
  const arrowHalf = Math.max(4, width * 1.6);
  const drawHead = (tipX, tipY, dirX, dirY) => {
    const baseX = tipX - dirX * arrowLen;
    const baseY = tipY - dirY * arrowLen;
    const leftX = baseX - dirY * arrowHalf;
    const leftY = baseY + dirX * arrowHalf;
    const rightX = baseX + dirY * arrowHalf;
    const rightY = baseY - dirX * arrowHalf;
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(leftX, leftY);
    ctx.lineTo(rightX, rightY);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  };
  drawHead(start.x, start.y, -ux, -uy);
  drawHead(end.x, end.y, ux, uy);
}
function setMeasurementReferenceFromSelected() {
  const shape = selectedShapeOverlay.value;
  if (!shape || shape.type !== "measure") return;
  const baseRawMm =
    getMeasurementMm(
      { x: Number(shape.x1 || 0), y: Number(shape.y1 || 0) },
      { x: Number(shape.x2 || 0), y: Number(shape.y2 || 0) },
    ) / measurementScale.value;
  if (!baseRawMm) return;
  const input = window.prompt(
    "輸入這條基準線的實際距離，可用 cm / m / mm，例如 273cm 或 2.73m",
    formatMeasurementLabel(shape),
  );
  if (input == null) return;
  const actualMm = parseMeasurementInput(input);
  if (!actualMm) {
    window.alert("請輸入有效距離，例如 273cm、2.73m 或 2730mm");
    return;
  }
  measurementScale.value = actualMm / baseRawMm;
  markDirty();
}
function resetMeasurementScale() {
  measurementScale.value = 1;
  markDirty();
}
function getMeasurementLabelPos(start, end) {
  return {
    x: (start.x + end.x) / 2,
    y: (start.y + end.y) / 2 - 10,
  };
}
function drawMeasurementLabel(ctx, start, end, color) {
  const label = formatMeasurementLabel({
    x1: start.x,
    y1: start.y,
    x2: end.x,
    y2: end.y,
  });
  if (!label) return;
  const pos = getMeasurementLabelPos(start, end);
  ctx.save();
  ctx.font = 'bold 12px "Microsoft JhengHei", Arial, sans-serif';
  const textWidth = ctx.measureText(label).width;
  const boxWidth = textWidth + 10;
  const boxHeight = 18;
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.rect(pos.x - boxWidth / 2, pos.y - boxHeight + 4, boxWidth, boxHeight);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, pos.x, pos.y - 4);
  ctx.restore();
}
function markDirty() {
  dirty.value = true;
}
function markAnnotationDirty() {
  dirty.value = true;
  _historyNeedsRecord = true;
}
function captureAnnotationSnapshot() {
  return {
    drawingBlocks: drawingBlocks.value.map((blk) => ({
      drawingId: blk.drawingId,
      x: blk.x,
      y: blk.y,
      scale: blk.scale,
    })),
    overlayImgs: overlayImgs.value.map((img) => ({ ...img })),
    textOverlays: textOverlays.value.map((ovl) => ({ ...ovl })),
    shapeOverlays: shapeOverlays.value.map((ovl) => ({ ...ovl })),
    stampOverlays: stampOverlays.value.map((ovl) => ({ ...ovl })),
    annotCanvas: annotCanvasRef.value
      ? annotCanvasRef.value.toDataURL("image/png")
      : null,
    measurementScale: measurementScale.value,
  };
}
function applyAnnotationSnapshot(snapshot) {
  if (!snapshot) return;
  _isRestoringAnnotationHistory = true;
  clearSelections();
  drawTool.value = null;
  measurementScale.value =
    Number(snapshot.measurementScale) > 0
      ? Number(snapshot.measurementScale)
      : 1;
  overlayImgs.value = (snapshot.overlayImgs || []).map((img) => ({ ...img }));
  textOverlays.value = (snapshot.textOverlays || []).map((ovl) => ({ ...ovl }));
  shapeOverlays.value = (snapshot.shapeOverlays || []).map((ovl) => ({
    ...ovl,
  }));
  stampOverlays.value = (snapshot.stampOverlays || []).map((ovl) => ({
    ...ovl,
  }));
  const blockMap = new Map(
    (snapshot.drawingBlocks || []).map((blk) => [blk.drawingId, blk]),
  );
  drawingBlocks.value.forEach((blk) => {
    const saved = blockMap.get(blk.drawingId);
    if (!saved) return;
    blk.x = saved.x;
    blk.y = saved.y;
    blk.scale = saved.scale;
  });
  const canvas = annotCanvasRef.value;
  if (canvas) {
    canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
    if (snapshot.annotCanvas) restoreAnnotCanvas(snapshot.annotCanvas);
  }
  _historyNeedsRecord = false;
  _isRestoringAnnotationHistory = false;
}
function getAnnotationSnapshotSignature(snapshot) {
  return JSON.stringify(snapshot);
}
function resetAnnotationHistory() {
  const snapshot = captureAnnotationSnapshot();
  annotationHistory.value = [snapshot];
  annotationHistoryIndex.value = 0;
  _historyNeedsRecord = false;
}
function recordAnnotationHistory() {
  if (_isRestoringAnnotationHistory) return;
  const snapshot = captureAnnotationSnapshot();
  const signature = getAnnotationSnapshotSignature(snapshot);
  const current = annotationHistory.value[annotationHistoryIndex.value];
  if (current && getAnnotationSnapshotSignature(current) === signature) {
    _historyNeedsRecord = false;
    return;
  }
  const nextHistory = annotationHistory.value.slice(
    0,
    annotationHistoryIndex.value + 1,
  );
  nextHistory.push(snapshot);
  if (nextHistory.length > 50) nextHistory.shift();
  annotationHistory.value = nextHistory;
  annotationHistoryIndex.value = nextHistory.length - 1;
  _historyNeedsRecord = false;
}
function undoAnnotationHistory() {
  if (annotationHistoryIndex.value <= 0) return;
  if (textBox.value.visible) cancelText();
  annotationHistoryIndex.value -= 1;
  applyAnnotationSnapshot(
    annotationHistory.value[annotationHistoryIndex.value],
  );
  dirty.value = true;
}
function splitVert(str) {
  return [...str].map((c) => `<div class="vc">${c}</div>`).join("");
}

// ── Drag & Resize ───────────────────────────────────────────────────
let _mode = null; // 'drag' | 'resize'
const annotationHistory = ref([]);
const annotationHistoryIndex = ref(-1);
let _historyNeedsRecord = false;
let _isRestoringAnnotationHistory = false;
let _activeBlk = null;
let _dragSX = 0,
  _dragSY = 0;
let _origX = 0,
  _origY = 0;
let _origDispW = 0,
  _origDispH = 0;
let _corner = null;
const draggingId = ref(null);

// ── 截圖疊層 ───────────────────────────────────────────────────
const overlayImgs = ref([]);
const showSnapshotMenu = ref(false);
const imgInputRef = ref(null);
const pdfUploadRef = ref(null);
let _activeImg = null,
  _aiType = null,
  _aiSX = 0,
  _aiSY = 0,
  _aiOrigX = 0,
  _aiOrigY = 0,
  _aiOrigW = 0;
// key: id, value: Promise — 追蹤背景上傳中的截圖
const _pendingOverlayUploads = new Map();

// ── 手繪標注 canvas ──────────────────────────────────────────────
const annotCanvasRef = ref(null);
const previewCanvasRef = ref(null);
const drawTool = ref(null); // null | 'pen' | 'erase' | 'line' | 'measure' | 'rect' | 'ellipse' | 'text'
const quickTextDraft = ref("");
const quickTextInputRef = ref(null);
const rectStyle = ref("outline");
const drawColor = ref("#e00000");
const commonColors = ["#ffffff", "#e00000", "#2563eb", "#16a34a", "#111827"];
const drawWidth = ref(5);
const strokeWidths = [1, 2, 3, 4, 5, 7, 9, 12, 16, 20];
const selectedShapeId = ref(null);
const selectedTextId = ref(null);
const selectedStampId = ref(null);
let _cdrawing = false;
let _shapeStart = null; // { x, y } canvas coords

const selectedShapeOverlay = computed(
  () =>
    shapeOverlays.value.find((ovl) => ovl.id === selectedShapeId.value) || null,
);
const selectedTextOverlay = computed(
  () =>
    textOverlays.value.find((ovl) => ovl.id === selectedTextId.value) || null,
);
const toolbarHint = computed(() => {
  if (textBox.value.visible) {
    return "文字編輯中：Enter 換行，Ctrl+Enter 確認，Esc 取消";
  }
  if (selectedTextOverlay.value) {
    return "文字已選取：拖曳移動，右下角縮放，雙擊改內容，Delete 刪除，Esc 或點空白取消選取";
  }
  if (selectedShapeOverlay.value) {
    const shapeLabel =
      selectedShapeOverlay.value.type === "ellipse"
        ? "圓 / 橢圓"
        : selectedShapeOverlay.value.type === "rect"
          ? "矩形"
          : selectedShapeOverlay.value.type === "measure"
            ? "測量線"
            : "線條";
    if (selectedShapeOverlay.value.type === "measure") {
      return `${shapeLabel}已選取：拖曳移動，Delete 刪除，可按「設基準」輸入實際距離，也可重設基準，Esc 或點空白取消選取`;
    }
    if (selectedShapeOverlay.value.type === "line") {
      return `${shapeLabel}已選取：拖曳移動，Delete 刪除，Esc 或點空白取消選取`;
    }
    return `${shapeLabel}已選取：拖曳移動，右下角縮放，右上角刪除，Delete 刪除，Esc 或點空白取消選取`;
  }
  switch (drawTool.value) {
    case null:
      return "移動模式：點選物件可選取並拖曳，Esc 或點空白取消選取";
    case "pen":
      return "畫筆：按住滑鼠自由手繪";
    case "erase":
      return "橡皮擦：按住滑鼠擦除手繪筆跡";
    case "line":
      return "直線：拖拉繪製直線";
    case "measure":
      return "測量：拖拉繪製測量線，顯示 CM，選取後可按「設基準」輸入實際距離，其他測量線會按比例更新";
    case "rect":
      return "矩形：拖拉繪製，可搭配 ▢ / ■ 切換邊框或實體";
    case "ellipse":
      return "圓 / 橢圓：拖拉繪製，按 Shift 可鎖成正圓，可搭配 ▢ / ■ 切換邊框或實體";
    case "text":
      return "文字：先輸入內容後可連續點位貼上；留空時採彈出輸入框，雙擊既有文字可編輯";
    default:
      return "點選物件可移動，右下角可縮放；也可用「快照確定單」複製整張畫面到剪貼簿貼到 LINE";
  }
});

// 文字工具狀態
const textBox = ref({
  visible: false,
  value: "",
  editingId: null,
  x: 0,
  y: 0,
  canvasX: 0,
  canvasY: 0,
  fontSize: 16,
});
const textInputRef = ref(null);
let _textDragging = false;
let _textDragSX = 0,
  _textDragSY = 0,
  _textOrigX = 0,
  _textOrigY = 0;
let _activeTxtResize = null,
  _trSX = 0,
  _trOrigSize = 0;

function setDrawTool(tool) {
  if (textBox.value.visible) cancelText();
  showSnapshotMenu.value = false;
  if (tool !== null) {
    selectedShapeId.value = null;
    selectedTextId.value = null;
    selectedStampId.value = null;
  }
  const nextTool = tool !== null && drawTool.value === tool ? null : tool;
  drawTool.value = nextTool;
  if (nextTool === "text") {
    nextTick(() => quickTextInputRef.value?.focus());
  }
}
function clearSelections() {
  selectedBlkId.value = null;
  selectedShapeId.value = null;
  selectedTextId.value = null;
  selectedStampId.value = null;
}
function toggleSnapshotMenu() {
  showSnapshotMenu.value = !showSnapshotMenu.value;
}
function openImagePicker() {
  showSnapshotMenu.value = false;
  imgInputRef.value?.click();
}
function setTransientMsg(message, timeout = 2600) {
  saveMsg.value = message;
  window.setTimeout(() => {
    if (saveMsg.value === message) saveMsg.value = "";
  }, timeout);
}
function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60000);
}
function playSnapshotShutterSound() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    const noiseBuffer = ctx.createBuffer(
      1,
      ctx.sampleRate * 0.08,
      ctx.sampleRate,
    );
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) {
      data[i] = Math.random() * 2 - 1;
    }

    const noiseSource = ctx.createBufferSource();
    noiseSource.buffer = noiseBuffer;

    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = "highpass";
    noiseFilter.frequency.setValueAtTime(1800, now);

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.0001, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.9, now + 0.004);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);

    const toneOsc = ctx.createOscillator();
    toneOsc.type = "triangle";
    toneOsc.frequency.setValueAtTime(750, now);
    toneOsc.frequency.exponentialRampToValueAtTime(520, now + 0.06);

    const toneGain = ctx.createGain();
    toneGain.gain.setValueAtTime(0.0001, now);
    toneGain.gain.exponentialRampToValueAtTime(0.24, now + 0.006);
    toneGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);

    noiseSource
      .connect(noiseFilter)
      .connect(noiseGain)
      .connect(ctx.destination);
    toneOsc.connect(toneGain).connect(ctx.destination);

    noiseSource.start(now);
    noiseSource.stop(now + 0.09);
    toneOsc.start(now);
    toneOsc.stop(now + 0.09);

    window.setTimeout(() => {
      try {
        ctx.close();
      } catch (_) {
        // ignore
      }
    }, 180);
  } catch (_) {
    // ignore audio errors so snapshot flow is never blocked
  }
}
async function buildConfirmedSnapshotCanvas() {
  if (textBox.value.visible) {
    throw new Error("請先完成文字編輯再快照");
  }
  const previousSelection = {
    blk: selectedBlkId.value,
    shape: selectedShapeId.value,
    text: selectedTextId.value,
    stamp: selectedStampId.value,
  };
  showSnapshotMenu.value = false;
  clearSelections();
  await nextTick();
  try {
    const el = pageRef.value;
    if (!el) throw new Error("找不到確定單頁面");
    const rect = el.getBoundingClientRect();
    const w = Math.round(rect.width || el.offsetWidth || 1123);
    const h = Math.round(rect.height || el.offsetHeight || 794);
    return await renderConfirmedCanvas(el, w, h, SNAPSHOT_RENDER_SCALE);
  } finally {
    selectedBlkId.value = previousSelection.blk;
    selectedShapeId.value = previousSelection.shape;
    selectedTextId.value = previousSelection.text;
    selectedStampId.value = previousSelection.stamp;
  }
}
async function buildConfirmedSnapshotBlob() {
  const canvas = await buildConfirmedSnapshotCanvas();
  return await new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("無法產生快照圖片"));
      },
      "image/png",
      1,
    );
  });
}
function getSnapshotFileName() {
  const orderNo = String(
    order.value?.orderNo || orderId.value || "confirmation",
  ).replace(/[\\/:*?"<>|]+/g, "-");
  return `${orderNo}-snapshot.png`;
}
async function copyConfirmedSnapshot() {
  if (snapshotting.value) return;
  snapshotting.value = true;
  try {
    const blob = await buildConfirmedSnapshotBlob();
    if (!window.ClipboardItem || !navigator.clipboard?.write) {
      downloadBlob(blob, getSnapshotFileName());
      playSnapshotShutterSound();
      setTransientMsg("⚠ 目前瀏覽器不支援直接複製圖片，已改下載 PNG");
      return;
    }
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    playSnapshotShutterSound();
    setTransientMsg("✅ 已複製確定單快照，可直接到 LINE 貼上");
  } catch (e) {
    console.error("快照複製失敗", e);
    setTransientMsg(`❌ 快照失敗：${e?.message || e}`, 3600);
  } finally {
    snapshotting.value = false;
  }
}
async function downloadConfirmedSnapshot() {
  if (snapshotting.value) return;
  snapshotting.value = true;
  try {
    const blob = await buildConfirmedSnapshotBlob();
    downloadBlob(blob, getSnapshotFileName());
    playSnapshotShutterSound();
    setTransientMsg("✅ 已下載確定單快照 PNG");
  } catch (e) {
    console.error("快照下載失敗", e);
    setTransientMsg(`❌ 快照失敗：${e?.message || e}`, 3600);
  } finally {
    snapshotting.value = false;
  }
}
function syncToolbarFromShape(ovl) {
  if (!ovl) return;
  drawColor.value = ovl.color || "#e00000";
  drawWidth.value = ovl.width || 5;
  if (ovl.type === "rect" || ovl.type === "ellipse") {
    rectStyle.value = ovl.rectStyle || "outline";
  }
}
function textFontSizeToWidth(fontSize) {
  const approx = Math.max(1, Math.round((Number(fontSize || 16) - 10) / 3));
  return strokeWidths.reduce(
    (best, next) =>
      Math.abs(next - approx) < Math.abs(best - approx) ? next : best,
    strokeWidths[0],
  );
}
function syncToolbarFromText(ovl) {
  if (!ovl) return;
  drawColor.value = ovl.color || "#e00000";
  drawWidth.value = textFontSizeToWidth(ovl.fontSize);
}
function selectShapeOverlay(ovl) {
  selectedBlkId.value = null;
  selectedTextId.value = null;
  selectedShapeId.value = ovl.id;
  syncToolbarFromShape(ovl);
}
function selectTextOverlay(ovl) {
  selectedBlkId.value = null;
  selectedShapeId.value = null;
  selectedStampId.value = null;
  selectedTextId.value = ovl.id;
  syncToolbarFromText(ovl);
}
function selectStampOverlay(ovl) {
  selectedBlkId.value = null;
  selectedShapeId.value = null;
  selectedTextId.value = null;
  selectedStampId.value = ovl.id;
}
function onColorChange(event) {
  const value = event?.target?.value || "#e00000";
  setDrawColor(value);
}
function setDrawColor(value) {
  drawColor.value = value;
  let changed = false;
  if (selectedShapeOverlay.value) {
    selectedShapeOverlay.value.color = value;
    changed = true;
  }
  if (selectedTextOverlay.value) {
    selectedTextOverlay.value.color = value;
    changed = true;
  }
  if (changed) {
    markAnnotationDirty();
    recordAnnotationHistory();
  }
}
function setStrokeWidth(value) {
  drawWidth.value = value;
  let changed = false;
  if (selectedShapeOverlay.value) {
    selectedShapeOverlay.value.width = value;
    changed = true;
  }
  if (selectedTextOverlay.value) {
    selectedTextOverlay.value.fontSize = value * 3 + 10;
    changed = true;
  }
  if (changed) {
    markAnnotationDirty();
    recordAnnotationHistory();
  }
}
function setRectStyleMode(style) {
  rectStyle.value = style;
  if (["rect", "ellipse"].includes(selectedShapeOverlay.value?.type)) {
    selectedShapeOverlay.value.rectStyle = style;
    markAnnotationDirty();
    recordAnnotationHistory();
  }
}
function getShapeEndPos(start, current, constrainCircle = false) {
  if (!constrainCircle) return current;
  const dx = current.x - start.x;
  const dy = current.y - start.y;
  const radius = Math.min(Math.abs(dx), Math.abs(dy));
  return {
    x: start.x + Math.sign(dx || 1) * radius,
    y: start.y + Math.sign(dy || 1) * radius,
  };
}
function drawPreviewShape(ctx, type, start, end) {
  if (type === "line" || type === "measure") {
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
    if (type === "measure") {
      drawMeasurementArrowheads(
        ctx,
        start,
        end,
        drawColor.value,
        drawWidth.value,
      );
      drawMeasurementLabel(ctx, start, end, drawColor.value);
    }
    return;
  }

  const left = Math.min(start.x, end.x);
  const top = Math.min(start.y, end.y);
  const width = Math.abs(end.x - start.x);
  const height = Math.abs(end.y - start.y);

  if (type === "rect") {
    if (rectStyle.value === "fill") {
      ctx.fillStyle = drawColor.value;
      ctx.fillRect(left, top, width, height);
    } else {
      ctx.beginPath();
      ctx.strokeRect(left, top, width, height);
    }
    return;
  }

  if (type === "ellipse") {
    ctx.beginPath();
    ctx.ellipse(
      left + width / 2,
      top + height / 2,
      width / 2,
      height / 2,
      0,
      0,
      Math.PI * 2,
    );
    if (rectStyle.value === "fill") {
      ctx.fillStyle = drawColor.value;
      ctx.fill();
    } else {
      ctx.stroke();
    }
  }
}
function getCanvasPos(e) {
  const c = annotCanvasRef.value;
  const rect = c.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) * (c.width / rect.width),
    y: (e.clientY - rect.top) * (c.height / rect.height),
  };
}

function _applyStrokeStyle(ctx) {
  ctx.globalCompositeOperation = "source-over";
  ctx.strokeStyle = drawColor.value;
  ctx.lineWidth = drawWidth.value;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
}

function onCanvasDown(e) {
  if (!drawTool.value) return;
  const { x, y } = getCanvasPos(e);

  if (drawTool.value === "text") {
    const c = annotCanvasRef.value;
    const rect = c.getBoundingClientRect();
    const cssX = e.clientX - rect.left;
    const cssY = e.clientY - rect.top;
    const fontSize = drawWidth.value * 3 + 10;

    const quickText = String(quickTextDraft.value || "").trim();
    if (quickText) {
      const newTextOverlay = {
        id: Date.now() + Math.floor(Math.random() * 1000),
        x: cssX,
        y: cssY,
        text: quickText,
        fontSize,
        color: drawColor.value,
      };
      textOverlays.value.push(newTextOverlay);
      selectTextOverlay(newTextOverlay);
      markAnnotationDirty();
      recordAnnotationHistory();
      return;
    }

    textBox.value = {
      visible: true,
      value: "",
      editingId: null,
      x: cssX,
      y: cssY,
      canvasX: x,
      canvasY: y,
      fontSize,
    };
    nextTick(() => textInputRef.value?.focus());
    return;
  }

  _cdrawing = true;
  _shapeStart = { x, y };

  if (drawTool.value === "pen" || drawTool.value === "erase") {
    const ctx = annotCanvasRef.value.getContext("2d");
    ctx.beginPath();
    ctx.moveTo(x, y);
  }
}
function onCanvasMove(e) {
  if (!_cdrawing || !drawTool.value) return;
  const { x, y } = getCanvasPos(e);
  const ctx = annotCanvasRef.value.getContext("2d");

  if (drawTool.value === "pen") {
    _applyStrokeStyle(ctx);
    ctx.lineTo(x, y);
    ctx.stroke();
    markAnnotationDirty();
  } else if (drawTool.value === "erase") {
    ctx.globalCompositeOperation = "destination-out";
    ctx.lineWidth = drawWidth.value * 5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineTo(x, y);
    ctx.stroke();
    markAnnotationDirty();
  } else if (
    (drawTool.value === "line" ||
      drawTool.value === "measure" ||
      drawTool.value === "rect" ||
      drawTool.value === "ellipse") &&
    _shapeStart
  ) {
    const pc = previewCanvasRef.value;
    if (!pc) return;
    const pctx = pc.getContext("2d");
    pctx.clearRect(0, 0, pc.width, pc.height);
    _applyStrokeStyle(pctx);
    const end = getShapeEndPos(
      _shapeStart,
      { x, y },
      drawTool.value === "ellipse" && e.shiftKey,
    );
    drawPreviewShape(pctx, drawTool.value, _shapeStart, end);
  }
}
function onCanvasUp(e) {
  if (
    _cdrawing &&
    _shapeStart &&
    (drawTool.value === "line" ||
      drawTool.value === "measure" ||
      drawTool.value === "rect" ||
      drawTool.value === "ellipse")
  ) {
    let pos;
    try {
      pos = e ? getCanvasPos(e) : null;
    } catch {}
    if (pos) {
      const end = getShapeEndPos(
        _shapeStart,
        pos,
        drawTool.value === "ellipse" && e?.shiftKey,
      );
      const dy = Math.abs(end.y - _shapeStart.y);
      const dx = Math.abs(end.x - _shapeStart.x);
      if (dx > 2 || dy > 2) {
        const newShape = {
          id: Date.now(),
          type: drawTool.value,
          rectStyle:
            drawTool.value === "rect" || drawTool.value === "ellipse"
              ? rectStyle.value
              : undefined,
          x1: _shapeStart.x,
          y1: _shapeStart.y,
          x2: end.x,
          y2: end.y,
          color: drawColor.value,
          width: drawWidth.value,
        };
        shapeOverlays.value.push(newShape);
        if (["line", "measure", "rect", "ellipse"].includes(newShape.type)) {
          drawTool.value = null;
          selectShapeOverlay(newShape);
        }
        markAnnotationDirty();
        recordAnnotationHistory();
      }
    }
    // clear preview
    const pc = previewCanvasRef.value;
    if (pc) pc.getContext("2d").clearRect(0, 0, pc.width, pc.height);
  }
  if (_cdrawing) {
    annotCanvasRef.value?.getContext("2d")?.beginPath();
    _cdrawing = false;
  }
  _shapeStart = null;
  // also reset img/blk drag
  _mode = null;
  _activeBlk = null;
  draggingId.value = null;
  _activeImg = null;
  _activeTxtOvl = null;
  _activeShapeOvl = null;
  _textDragging = false;
}
function commitText() {
  const tb = textBox.value;
  if (!tb.visible) return;
  const text = tb.value.trim();
  if (tb.editingId != null) {
    const existing = textOverlays.value.find((ovl) => ovl.id === tb.editingId);
    if (existing) {
      if (text) {
        existing.text = text;
        existing.fontSize = tb.fontSize;
        existing.color = drawColor.value;
        drawTool.value = null;
        selectTextOverlay(existing);
      } else {
        textOverlays.value = textOverlays.value.filter(
          (ovl) => ovl.id !== tb.editingId,
        );
        if (selectedTextId.value === tb.editingId) selectedTextId.value = null;
      }
      markAnnotationDirty();
      recordAnnotationHistory();
    }
  } else if (text) {
    // 確認後轉為可拖移文字疊層，不燒入 canvas
    const HANDLE_H = 24; // 拖移 handle 高度
    const newTextOverlay = {
      id: Date.now(),
      x: tb.x,
      y: tb.y + HANDLE_H,
      text,
      fontSize: tb.fontSize,
      color: drawColor.value,
    };
    textOverlays.value.push(newTextOverlay);
    drawTool.value = null;
    selectTextOverlay(newTextOverlay);
    markAnnotationDirty();
    recordAnnotationHistory();
  }
  cancelText();
}
function cancelText() {
  textBox.value = {
    ...textBox.value,
    visible: false,
    value: "",
    editingId: null,
  };
}
function startTextDrag(e) {
  _textDragging = true;
  _textDragSX = e.clientX;
  _textDragSY = e.clientY;
  _textOrigX = textBox.value.x;
  _textOrigY = textBox.value.y;
}

// ── 文字疊層拖移 ─────────────────────────────────────────────────
const textOverlays = ref([]); // { id, x, y, text, fontSize, color }
let _activeTxtOvl = null,
  _toSX = 0,
  _toSY = 0,
  _toOrigX = 0,
  _toOrigY = 0;

function startTxtOvlDrag(e, ovl) {
  selectTextOverlay(ovl);
  _activeTxtOvl = ovl;
  _toSX = e.clientX;
  _toSY = e.clientY;
  _toOrigX = ovl.x;
  _toOrigY = ovl.y;
  e.preventDefault();
}
function startTxtOvlResize(e, ovl) {
  selectTextOverlay(ovl);
  _activeTxtResize = ovl;
  _trSX = e.clientX;
  _trOrigSize = Number(ovl.fontSize || 16);
  e.preventDefault();
}
function editTextOverlay(ovl) {
  selectTextOverlay(ovl);
  const HANDLE_H = 24;
  textBox.value = {
    visible: true,
    value: ovl.text || "",
    editingId: ovl.id,
    x: ovl.x,
    y: ovl.y - HANDLE_H,
    canvasX: ovl.x,
    canvasY: ovl.y,
    fontSize: Number(ovl.fontSize || 16),
  };
  drawColor.value = ovl.color || drawColor.value;
  drawWidth.value = textFontSizeToWidth(ovl.fontSize);
  nextTick(() => textInputRef.value?.focus());
}
function removeTxtOvl(id) {
  textOverlays.value = textOverlays.value.filter((o) => o.id !== id);
  if (selectedTextId.value === id) selectedTextId.value = null;
  markAnnotationDirty();
  recordAnnotationHistory();
}

// ── 圖章疊層 ─────────────────────────────────────────────────────
const showStampPanel = ref(false);
const stampOverlays = ref([]); // { id, stampId, url, x, y, w }
function onStampInsert(stamp) {
  const newStamp = {
    id: Date.now(),
    stampId: stamp.id,
    url: stamp.imageUrl,
    x: 200,
    y: 200,
    w: 120,
  };
  stampOverlays.value.push(newStamp);
  showStampPanel.value = false;
  selectStampOverlay(newStamp);
  markAnnotationDirty();
  recordAnnotationHistory();
}

async function buildDefaultSinkMethodStampOverlays() {
  const stamps = await listStamps().catch(() => []);
  if (!Array.isArray(stamps) || !stamps.length) return [];

  const matched = stamps.find(
    (stamp) =>
      String(stamp?.name || "").trim() === DEFAULT_SINK_METHOD_STAMP_NAME,
  );
  if (!matched?.id || !matched?.imageUrl) return [];

  return [
    {
      id: `default-stamp-${matched.id}`,
      stampId: matched.id,
      url: matched.imageUrl,
      x: 36,
      y: 660,
      w: 300,
    },
  ];
}

function removeStampOvl(id) {
  stampOverlays.value = stampOverlays.value.filter((o) => o.id !== id);
  if (selectedStampId.value === id) selectedStampId.value = null;
  markAnnotationDirty();
  recordAnnotationHistory();
}

// ── 直線/矩形疊層拖移 ────────────────────────────────────────────
const shapeOverlays = ref([]); // { id, type, rectStyle?, x1, y1, x2, y2, color, width }
let _activeShapeOvl = null,
  _shapeResizeCorner = null,
  _soSX = 0,
  _soSY = 0,
  _soOX1 = 0,
  _soOY1 = 0,
  _soOX2 = 0,
  _soOY2 = 0,
  _soLeft = 0,
  _soTop = 0,
  _soRight = 0,
  _soBottom = 0;

function startShapeOvlDrag(e, ovl) {
  selectShapeOverlay(ovl);
  _activeShapeOvl = ovl;
  _shapeResizeCorner = null;
  _soSX = e.clientX;
  _soSY = e.clientY;
  _soOX1 = ovl.x1;
  _soOY1 = ovl.y1;
  _soOX2 = ovl.x2;
  _soOY2 = ovl.y2;
  e.preventDefault();
}
function startShapeResize(e, ovl, corner) {
  selectShapeOverlay(ovl);
  _activeShapeOvl = ovl;
  _shapeResizeCorner = corner;
  _soSX = e.clientX;
  _soSY = e.clientY;
  _soLeft = Math.min(ovl.x1, ovl.x2);
  _soTop = Math.min(ovl.y1, ovl.y2);
  _soRight = Math.max(ovl.x1, ovl.x2);
  _soBottom = Math.max(ovl.y1, ovl.y2);
  e.preventDefault();
  e.stopPropagation();
}
function removeShapeOvl(id) {
  shapeOverlays.value = shapeOverlays.value.filter((o) => o.id !== id);
  if (selectedShapeId.value === id) selectedShapeId.value = null;
  markAnnotationDirty();
  recordAnnotationHistory();
}
function onAnnotPointerDown(e) {
  const target = e.target;
  if (!(target instanceof Element)) return;
  if (!target.closest(".snapshot-tool")) {
    showSnapshotMenu.value = false;
  }
  if (
    target.closest(
      ".conf-toolbar, .text-box-wrap, .txt-ovl, .shape-ovl, .drawing-blk, .stamp-panel",
    )
  ) {
    return;
  }
  clearSelections();
}
function onAnnotKeydown(e) {
  const target = e.target;
  const tagName = target?.tagName?.toLowerCase?.() || "";
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "z") {
    if (textBox.value.visible) return;
    if (
      tagName === "input" ||
      tagName === "textarea" ||
      target?.isContentEditable
    )
      return;
    undoAnnotationHistory();
    e.preventDefault();
    return;
  }
  if (e.key === "Escape") {
    if (textBox.value.visible) cancelText();
    clearSelections();
    return;
  }
  if (textBox.value.visible) return;
  if (e.key !== "Delete" && e.key !== "Backspace") return;
  if (
    tagName === "input" ||
    tagName === "textarea" ||
    target?.isContentEditable
  )
    return;

  if (selectedTextId.value != null) {
    removeTxtOvl(selectedTextId.value);
    e.preventDefault();
    return;
  }
  if (selectedStampId.value != null) {
    removeStampOvl(selectedStampId.value);
    e.preventDefault();
    return;
  }
  if (selectedShapeId.value != null) {
    removeShapeOvl(selectedShapeId.value);
    e.preventDefault();
  }
}
function clearAnnotCanvas() {
  const c = annotCanvasRef.value;
  if (!c) return;
  c.getContext("2d").clearRect(0, 0, c.width, c.height);
  markAnnotationDirty();
  recordAnnotationHistory();
}
function restoreAnnotCanvas(dataUrl) {
  if (!dataUrl || !annotCanvasRef.value) return;
  const img = new Image();
  img.onload = () =>
    annotCanvasRef.value?.getContext("2d")?.drawImage(img, 0, 0);
  img.src = dataUrl;
}

function onImgFile(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => addOverlayImg(ev.target.result);
  reader.readAsDataURL(file);
  e.target.value = "";
}
function addOverlayImg(src) {
  const id = Date.now();
  overlayImgs.value.push({ id, src, x: 260, y: 30, w: 300 });
  markAnnotationDirty();
  recordAnnotationHistory();
  if (!orderId.value) return;
  const p = uploadOverlayImage(orderId.value, src)
    .then((url) => {
      const img = overlayImgs.value.find((i) => i.id === id);
      if (img) img.src = url;
    })
    .catch((e) => console.warn("截圖上傳失敗", e))
    .finally(() => _pendingOverlayUploads.delete(id));
  _pendingOverlayUploads.set(id, p);
}
function removeOverlayImg(id) {
  overlayImgs.value = overlayImgs.value.filter((i) => i.id !== id);
  markAnnotationDirty();
  recordAnnotationHistory();
}
function startImgDrag(e, img) {
  _activeImg = img;
  _aiType = "drag";
  _aiSX = e.clientX;
  _aiSY = e.clientY;
  _aiOrigX = img.x;
  _aiOrigY = img.y;
  e.preventDefault();
}
function startImgResize(e, img) {
  _activeImg = img;
  _aiType = "resize";
  _aiSX = e.clientX;
  _aiOrigW = img.w;
  e.preventDefault();
}
function onPaste(e) {
  const items = e.clipboardData?.items;
  if (!items) return;
  for (const item of items) {
    if (item.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = (ev) => addOverlayImg(ev.target.result);
      reader.readAsDataURL(item.getAsFile());
      break;
    }
  }
}

function startDrag(e, blk) {
  _mode = "drag";
  _activeBlk = blk;
  draggingId.value = blk.drawingId;
  selectedBlkId.value = blk.drawingId;
  _dragSX = e.clientX;
  _dragSY = e.clientY;
  _origX = blk.x;
  _origY = blk.y;
  e.preventDefault();
}

function startResize(e, blk, corner) {
  _mode = "resize";
  _activeBlk = blk;
  _corner = corner;
  draggingId.value = blk.drawingId;
  selectedBlkId.value = blk.drawingId;
  _dragSX = e.clientX;
  _dragSY = e.clientY;
  _origX = blk.x;
  _origY = blk.y;
  _origDispW = blk.origW * blk.scale;
  _origDispH = blk.origH * blk.scale;
  e.preventDefault();
  e.stopPropagation();
}

function onMouseMove(e) {
  if (_textDragging) {
    const dx = e.clientX - _textDragSX;
    const dy = e.clientY - _textDragSY;
    textBox.value = {
      ...textBox.value,
      x: _textOrigX + dx,
      y: _textOrigY + dy,
    };
  }
  if (_activeTxtResize) {
    const dx = e.clientX - _trSX;
    _activeTxtResize.fontSize = Math.max(10, Math.round(_trOrigSize + dx / 2));
    drawWidth.value = textFontSizeToWidth(_activeTxtResize.fontSize);
    markAnnotationDirty();
  }
  if (_activeTxtOvl) {
    const dx = e.clientX - _toSX;
    const dy = e.clientY - _toSY;
    _activeTxtOvl.x = _toOrigX + dx;
    _activeTxtOvl.y = _toOrigY + dy;
    markAnnotationDirty();
  }
  if (_activeShapeOvl) {
    const dx = e.clientX - _soSX;
    const dy = e.clientY - _soSY;
    if (
      _shapeResizeCorner &&
      ["rect", "ellipse"].includes(_activeShapeOvl.type)
    ) {
      const minSize = 8;
      let left = _soLeft;
      let top = _soTop;
      let right = _soRight;
      let bottom = _soBottom;

      if (_shapeResizeCorner.includes("n")) {
        top = Math.min(_soBottom - minSize, _soTop + dy);
      }
      if (_shapeResizeCorner.includes("s")) {
        bottom = Math.max(_soTop + minSize, _soBottom + dy);
      }
      if (_shapeResizeCorner.includes("w")) {
        left = Math.min(_soRight - minSize, _soLeft + dx);
      }
      if (_shapeResizeCorner.includes("e")) {
        right = Math.max(_soLeft + minSize, _soRight + dx);
      }

      _activeShapeOvl.x1 = left;
      _activeShapeOvl.y1 = top;
      _activeShapeOvl.x2 = right;
      _activeShapeOvl.y2 = bottom;
    } else {
      _activeShapeOvl.x1 = _soOX1 + dx;
      _activeShapeOvl.y1 = _soOY1 + dy;
      _activeShapeOvl.x2 = _soOX2 + dx;
      _activeShapeOvl.y2 = _soOY2 + dy;
    }
    markAnnotationDirty();
  }
  if (_activeImg) {
    const dx = e.clientX - _aiSX;
    const dy = e.clientY - _aiSY;
    if (_aiType === "drag") {
      _activeImg.x = _aiOrigX + dx;
      _activeImg.y = _aiOrigY + dy;
    } else {
      _activeImg.w = Math.max(60, _aiOrigW + dx);
    }
    markAnnotationDirty();
  }
  if (!_activeBlk) return;
  const dx = e.clientX - _dragSX;
  const dy = e.clientY - _dragSY;

  if (_mode === "drag") {
    _activeBlk.x = _origX + dx;
    _activeBlk.y = _origY + dy;
  } else {
    const ratio = _activeBlk.origH / _activeBlk.origW;
    let newW = _origDispW,
      nx = _origX,
      ny = _origY;

    if (_corner === "se") {
      newW = Math.max(60, _origDispW + dx);
    } else if (_corner === "sw") {
      newW = Math.max(60, _origDispW - dx);
      nx = _origX + (_origDispW - newW);
    } else if (_corner === "ne") {
      newW = Math.max(60, _origDispW + dx);
      ny = _origY + (_origDispH - newW * ratio);
    } else if (_corner === "nw") {
      newW = Math.max(60, _origDispW - dx);
      nx = _origX + (_origDispW - newW);
      ny = _origY + (_origDispH - newW * ratio);
    }
    _activeBlk.scale = newW / _activeBlk.origW;
    _activeBlk.x = nx;
    _activeBlk.y = ny;
  }
  markAnnotationDirty();
}

function onMouseUp() {
  if (_textDragging) {
    _textDragging = false;
    // sync canvasX/Y with new CSS position (1:1 scale)
    textBox.value = {
      ...textBox.value,
      canvasX: textBox.value.x,
      canvasY: textBox.value.y + textBox.value.fontSize,
    };
    nextTick(() => textInputRef.value?.focus());
  }
  if (
    _cdrawing &&
    _shapeStart &&
    (drawTool.value === "line" ||
      drawTool.value === "measure" ||
      drawTool.value === "rect" ||
      drawTool.value === "ellipse")
  ) {
    const pc = previewCanvasRef.value;
    if (pc) pc.getContext("2d").clearRect(0, 0, pc.width, pc.height);
  }
  if (_cdrawing) {
    annotCanvasRef.value?.getContext("2d")?.beginPath();
    _cdrawing = false;
  }
  _shapeStart = null;
  _mode = null;
  _activeBlk = null;
  draggingId.value = null;
  _activeImg = null;
  _activeTxtOvl = null;
  _activeTxtResize = null;
  _activeShapeOvl = null;
  _shapeResizeCorner = null;
  if (_historyNeedsRecord) recordAnnotationHistory();
}

// ── Load ────────────────────────────────────────────────────────────
const TYPE_LABELS = {
  straight: "一字型",
  "l-shape": "L型",
  "m-shape": "M型",
  island: "中島",
};

function parseSvgForDisplay(svgStr) {
  if (!svgStr) return { svgContent: "", w: 760, h: 300 };
  // If SVG has a tight viewBox (set at save time), use its dimensions
  const vbm = svgStr.match(/viewBox="([^"]+)"/);
  if (vbm) {
    const parts = vbm[1].trim().split(/[\s,]+/);
    if (parts.length >= 4) {
      const w = Math.round(parseFloat(parts[2]));
      const h = Math.round(parseFloat(parts[3]));
      if (w > 10 && h > 10) {
        // Override SVG width/height so it renders at viewBox size (no empty border)
        const fixed = svgStr
          .replace(/(<svg\b[^>]*?)\s+width="[0-9.]+"/, `$1 width="${w}"`)
          .replace(/(<svg\b[^>]*?)\s+height="[0-9.]+"/, `$1 height="${h}"`);
        return { svgContent: fixed, w, h };
      }
    }
  }
  let w = 760,
    h = 300;
  const wm = svgStr.match(/width="([0-9.]+)"/);
  const hm = svgStr.match(/height="([0-9.]+)"/);
  if (wm) w = parseFloat(wm[1]) || w;
  if (hm) h = parseFloat(hm[1]) || h;
  return { svgContent: svgStr, w, h };
}

async function loadAll() {
  try {
    const [ord, drws, conf, sinkModels, stoveModels] = await Promise.all([
      getSalesOrder(orderId.value),
      listOrderDrawings(orderId.value),
      getOrderConfirmation(orderId.value),
      listProductModels("sink").catch(() => []),
      listProductModels("stove").catch(() => []),
    ]);
    {
      const sinkLookup = buildModelSizeLookup(sinkModels);
      sinkModelSizeById.value = sinkLookup.byId;
      sinkModelSizeByName.value = sinkLookup.byName;
      const stoveLookup = buildModelSizeLookup(stoveModels);
      stoveModelSizeById.value = stoveLookup.byId;
      stoveModelSizeByName.value = stoveLookup.byName;
    }
    order.value = ord;
    issuedByDisplayName.value = String(ord?.issuedByName || "").trim();
    customer.value = null;
    let customerPricing = null;
    if (ord?.customerId) {
      try {
        const [customerDoc, pricingDoc] = await Promise.all([
          getCustomerById(ord.customerId),
          getCustomerPricing(ord.customerId),
        ]);
        customer.value = customerDoc;
        customerPricing = pricingDoc;
      } catch (e) {
        console.warn("Could not load customer notes or preferences", e);
      }
    }
    confirmedPdfUrl.value = ord?.confirmedPdfUrl || null;
    // If URL exists but has no download token (e.g. stored before getDownloadURL was used),
    // re-fetch a fresh token URL from Storage so it opens without a 403.
    if (confirmedPdfUrl.value && !confirmedPdfUrl.value.includes("token=")) {
      try {
        confirmedPdfUrl.value = await refreshConfirmedPdfDownloadUrl(
          orderId.value,
        );
      } catch (e) {
        console.warn("Could not refresh confirmedPdfUrl", e);
      }
    }
    if (conf?.cf) Object.assign(cf, conf.cf);
    if (!normalizePreferredEdgeType(conf?.cf?.edgeType)) {
      const preferredEdgeType = normalizePreferredEdgeType(
        customerPricing?.preferredConfirmationEdgeType,
      );
      if (preferredEdgeType) {
        cf.edgeType = preferredEdgeType;
      }
    }
    measurementScale.value =
      Number(conf?.measurementScale) > 0 ? Number(conf.measurementScale) : 1;
    if (Array.isArray(conf?.overlayImgs))
      overlayImgs.value = conf.overlayImgs.map((i) => ({ ...i }));
    if (Array.isArray(conf?.textOverlays))
      textOverlays.value = conf.textOverlays.map((o) => ({ ...o }));
    if (Array.isArray(conf?.shapeOverlays))
      shapeOverlays.value = conf.shapeOverlays.map((o) => ({ ...o }));
    if (Array.isArray(conf?.stampOverlays))
      stampOverlays.value = conf.stampOverlays.map((o) => ({ ...o }));
    else {
      stampOverlays.value = await buildDefaultSinkMethodStampOverlays();
    }
    // 手繪 canvas 等 nextTick 後再還原
    if (conf?.annotCanvas) {
      await nextTick();
      restoreAnnotCanvas(conf.annotCanvas);
    }
    const savedBlocks = conf?.drawingBlocks ?? {};

    drawingBlocks.value = drws.map((d) => {
      const saved = savedBlocks[d.id] ?? {};
      const rawSvg = d.state?.svgContent ?? "";
      const {
        svgContent: svg,
        w: origW,
        h: origH,
      } = parseSvgForDisplay(rawSvg);
      const autoScale = Math.min(350 / origW, 280 / origH, 1);
      const scale = saved.scale ?? Math.round(autoScale * 20) / 20;

      return reactive({
        drawingId: d.id,
        label: `${TYPE_LABELS[d.type] ?? d.type} #${d.seq}`,
        svgContent: svg,
        origW,
        origH,
        x: saved.x !== undefined ? saved.x : 0,
        y: saved.y !== undefined ? saved.y : 0,
        scale,
        _hasSavedPos: saved.x !== undefined,
        overlayImages: Array.isArray(d.state?.overlayImages)
          ? d.state.overlayImages.map((i) => ({ ...i }))
          : [],
      });
    });

    await authReadyPromise;
    const currentUser = auth.currentUser;
    if (currentUser?.uid) {
      try {
        const userDoc = await getUserByUid(currentUser.uid);
        printedByName.value =
          userDoc?.displayName ||
          currentUser.displayName ||
          currentUser.email ||
          currentUser.uid;
      } catch (e) {
        console.warn("Could not load printed-by user", e);
        printedByName.value =
          currentUser.displayName || currentUser.email || currentUser.uid;
      }
    } else {
      printedByName.value = "";
    }

    if (!issuedByDisplayName.value) {
      const issuerUid = String(
        ord?.issuedByUid || ord?.updatedByUid || "",
      ).trim();
      if (issuerUid) {
        try {
          const issuerDoc = await getUserByUid(issuerUid);
          issuedByDisplayName.value =
            String(issuerDoc?.displayName || issuerDoc?.name || "").trim() ||
            issuerUid;
        } catch (e) {
          console.warn("Could not load issued-by user", e);
          issuedByDisplayName.value = issuerUid;
        }
      }
    }

    // 沒有儲存過位置的話，從佔位 ref 取得預設座標
    await nextTick();
    if (drawingPlaceholderRef.value && pageRef.value) {
      const pageRect = pageRef.value.getBoundingClientRect();
      const phRect = drawingPlaceholderRef.value.getBoundingClientRect();
      const phX = Math.round(phRect.left - pageRect.left);
      const phY = Math.round(phRect.top - pageRect.top);
      let offsetY = 0;
      drawingBlocks.value.forEach((blk) => {
        if (!blk._hasSavedPos) {
          blk.x = phX;
          blk.y = phY + offsetY;
          offsetY += Math.round(blk.origH * blk.scale) + 6;
        }
      });
    }

    // 發單後自動封存 PDF（只產生一次）
    if (ord?.status === "confirmed" && !ord?.confirmedPdfUrl) {
      setTimeout(() => generateConfirmedPdf(), 800);
    }
    resetAnnotationHistory();
  } catch (e) {
    console.error("loadAll error", e);
  }
}

// ── 手動上傳確定單PDF（手繪版） ──────────────────────────────────────
async function onUploadPdfFile(e) {
  const file = e.target.files?.[0];
  e.target.value = "";
  if (!file) return;
  if (file.type !== "application/pdf") {
    saveMsg.value = "❗ 請選擇 PDF 檔案";
    setTimeout(() => {
      saveMsg.value = "";
    }, 3000);
    return;
  }
  if (Number(file.size || 0) > CONFIRMED_PDF_MAX_BYTES) {
    const mb = (Number(file.size || 0) / (1024 * 1024)).toFixed(2);
    saveMsg.value = `❗ PDF 過大（${mb}MB），請控制在 3MB 內`;
    setTimeout(() => {
      saveMsg.value = "";
    }, 4000);
    return;
  }
  pdfUploading.value = true;
  try {
    const url = await uploadConfirmedPdf(orderId.value, file);
    confirmedPdfUrl.value = url;
    saveMsg.value = "✅ PDF 已上傳";
  } catch (err) {
    console.error("上傳PDF失敗", err);
    saveMsg.value = "❌ 上傳失敗：" + (err?.message || err);
  } finally {
    pdfUploading.value = false;
    setTimeout(() => {
      saveMsg.value = "";
    }, 4000);
  }
}

// ── 封存確定單 PDF ────────────────────────────────────────────────────
async function regeneratePdf() {
  confirmedPdfUrl.value = null;
  await generateConfirmedPdf();
}

function buildPdfBlobFromCanvas(canvas, jpegQuality) {
  const imgData = canvas.toDataURL("image/jpeg", jpegQuality);
  const pdf = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4",
    compress: true,
  });
  pdf.addImage(imgData, "JPEG", 0, 0, 297, 210, undefined, "FAST");
  return pdf.output("blob");
}

async function buildConfirmedPdfBlob({ enforceSizeLimit = true } = {}) {
  selectedBlkId.value = null;
  await nextTick();
  const el = pageRef.value;
  if (!el) throw new Error("找不到頁面元素");

  // 只截取 A4 可視頁面尺寸；不要用 scrollWidth/scrollHeight，否則被拖到頁面外的圖塊
  // 會把整張 PDF 寬高撐大，導致輸出時內容縮小並在右/下留下大片空白。
  const rect = el.getBoundingClientRect();
  const w = Math.round(rect.width || el.offsetWidth || 1123);
  const h = Math.round(rect.height || el.offsetHeight || 794);

  // Fast path: single render + single encode. For print flow we return immediately.
  const quickCanvas = await renderConfirmedCanvas(
    el,
    w,
    h,
    PDF_FAST_RENDER_SCALE,
    {
      tryForeignObject: false,
    },
  );
  const quickBlob = buildPdfBlobFromCanvas(quickCanvas, PDF_FAST_JPEG_QUALITY);
  const quickSize = Number(quickBlob?.size || 0);
  if (
    !enforceSizeLimit ||
    (quickSize > 0 && quickSize <= CONFIRMED_PDF_MAX_BYTES)
  ) {
    return quickBlob;
  }

  let bestBlob = quickBlob;
  let bestSize = quickSize > 0 ? quickSize : Number.POSITIVE_INFINITY;

  for (const renderScale of PDF_RENDER_SCALE_CANDIDATES) {
    const canvas = await renderConfirmedCanvas(el, w, h, renderScale, {
      tryForeignObject: false,
    });
    for (const jpegQuality of PDF_JPEG_QUALITY_CANDIDATES) {
      const blob = buildPdfBlobFromCanvas(canvas, jpegQuality);
      const size = Number(blob?.size || 0);
      if (size > 0 && size < bestSize) {
        bestSize = size;
        bestBlob = blob;
      }
      if (size > 0 && size <= CONFIRMED_PDF_MAX_BYTES) {
        return blob;
      }
    }
  }

  if (bestBlob) return bestBlob;
  throw new Error("PDF 轉檔失敗");
}

async function generateConfirmedPdf() {
  if (pdfGenerating.value || confirmedPdfUrl.value) return;
  pdfGenerating.value = true;
  try {
    const blob = await buildConfirmedPdfBlob({ enforceSizeLimit: true });
    const url = await uploadConfirmedPdf(orderId.value, blob);
    confirmedPdfUrl.value = url;
    const actualSize = Number(blob.size || 0);
    const mb = (actualSize / (1024 * 1024)).toFixed(2);
    saveMsg.value =
      actualSize <= CONFIRMED_PDF_MAX_BYTES
        ? `✅ 封存PDF完成（${mb}MB）`
        : `⚠️ 封存PDF完成（${mb}MB，未壓到 3MB 內）`;
  } catch (e) {
    console.error("PDF封存失敗", e);
    saveMsg.value = `❌ 封存PDF失敗：${e?.message || e}`;
  } finally {
    pdfGenerating.value = false;
    if (saveMsg.value) {
      setTimeout(() => {
        if (!pdfGenerating.value) saveMsg.value = "";
      }, 5000);
    }
  }
}

// ── Save ────────────────────────────────────────────────────────────
async function persistConfirmation({
  showSuccess = true,
  showFailure = true,
} = {}) {
  if (savePromise) return savePromise;

  savePromise = (async () => {
    if (_pendingOverlayUploads.size)
      await Promise.allSettled([..._pendingOverlayUploads.values()]);
    saving.value = true;
    try {
      const annotCanvas = annotCanvasRef.value
        ? annotCanvasRef.value.toDataURL("image/png")
        : null;
      await saveOrderConfirmation(orderId.value, {
        drawingBlocks: Object.fromEntries(
          drawingBlocks.value.map((b) => [
            b.drawingId,
            { x: b.x, y: b.y, scale: b.scale },
          ]),
        ),
        cf: { ...cf },
        overlayImgs: overlayImgs.value.map((i) => ({ ...i })),
        textOverlays: textOverlays.value.map((o) => ({ ...o })),
        shapeOverlays: shapeOverlays.value.map((o) => ({ ...o })),
        stampOverlays: stampOverlays.value.map((o) => ({ ...o })),
        measurementScale: measurementScale.value,
        annotCanvas,
      });
      const preferredEdgeType = normalizePreferredEdgeType(cf.edgeType);
      if (order.value?.customerId && preferredEdgeType) {
        await updateCustomerPricing(order.value.customerId, {
          customerName: order.value.customerName,
          preferredConfirmationEdgeType: preferredEdgeType,
        });
      }
      dirty.value = false;
      if (showSuccess) {
        saveMsg.value = "✓ 已儲存";
        setTimeout(() => {
          if (saveMsg.value === "✓ 已儲存") saveMsg.value = "";
        }, 2000);
      }
      return true;
    } catch (e) {
      if (showFailure) saveMsg.value = "儲存失敗";
      throw e;
    } finally {
      saving.value = false;
      savePromise = null;
    }
  })();

  return savePromise;
}

async function doSave() {
  try {
    await persistConfirmation();
  } catch (_) {}
}

function triggerBestEffortSave() {
  if (!dirty.value || saving.value || !orderId.value) return;
  void persistConfirmation({ showSuccess: false, showFailure: false }).catch(
    () => {},
  );
}

function handleConfirmationPageHide() {
  triggerBestEffortSave();
}

function handleConfirmationVisibilityChange() {
  if (typeof document === "undefined") return;
  if (document.visibilityState === "hidden") {
    triggerBestEffortSave();
  }
}

async function doPrint() {
  const win = window.open("", "_blank");
  if (!win) return;
  try {
    win.document.write(
      '<title>生產確定單 PDF</title><p style="font-family:sans-serif;padding:16px">PDF 產生中…</p>',
    );
    win.document.close();
    const blob = await buildConfirmedPdfBlob({ enforceSizeLimit: false });
    const url = URL.createObjectURL(blob);
    win.location.replace(url);
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (e) {
    console.error("列印PDF產生失敗", e);
    win.close();
  }
}

onMounted(() => {
  loadAll();
  document.addEventListener("paste", onPaste);
  document.addEventListener("pointerdown", onAnnotPointerDown);
  document.addEventListener("keydown", onAnnotKeydown);
  document.addEventListener(
    "visibilitychange",
    handleConfirmationVisibilityChange,
  );
  window.addEventListener("pagehide", handleConfirmationPageHide);
  window.addEventListener("beforeunload", handleConfirmationPageHide);
});
onUnmounted(() => {
  document.removeEventListener("paste", onPaste);
  document.removeEventListener("pointerdown", onAnnotPointerDown);
  document.removeEventListener("keydown", onAnnotKeydown);
  document.removeEventListener(
    "visibilitychange",
    handleConfirmationVisibilityChange,
  );
  window.removeEventListener("pagehide", handleConfirmationPageHide);
  window.removeEventListener("beforeunload", handleConfirmationPageHide);
});

onBeforeRouteLeave(async () => {
  if (!dirty.value) return true;
  try {
    await persistConfirmation({ showSuccess: false, showFailure: false });
    return true;
  } catch (_) {
    setTransientMsg("離開前自動儲存失敗，請先手動儲存", 4000);
    return false;
  }
});
</script>

<style scoped>
/* ══ 外框 ══ */
.conf-root {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background: #b8bec7;
  user-select: none;
}

/* ══ 工具列 ══ */
.conf-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 14px;
  background: #1e293b;
  color: #fff;
  flex-shrink: 0;
}
.back-btn {
  color: #93c5fd;
  text-decoration: none;
  font-size: 13px;
}
.toolbar-title {
  font-size: 15px;
  font-weight: 600;
  flex: 1;
}
.toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}
.hint {
  font-size: 11px;
  color: #94a3b8;
}
.measure-scale-badge {
  padding: 4px 8px;
  background: #0f172a;
  color: #cbd5e1;
  border: 1px solid #475569;
  border-radius: 999px;
  font-size: 11px;
  line-height: 1;
  white-space: nowrap;
}
.btn-img {
  padding: 5px 12px;
  background: #059669;
  color: #fff;
  border: none;
  border-radius: 5px;
  cursor: pointer;
  font-size: 12px;
}
.btn-img:disabled,
.btn-img-caret:disabled {
  opacity: 0.65;
  cursor: default;
}
.snapshot-tool {
  position: relative;
  display: inline-flex;
  align-items: stretch;
}
.snapshot-tool .btn-img {
  border-radius: 5px 0 0 5px;
}
.btn-img-caret {
  padding: 5px 8px;
  background: #047857;
  color: #fff;
  border: none;
  border-left: 1px solid rgba(255, 255, 255, 0.22);
  border-radius: 0 5px 5px 0;
  cursor: pointer;
  font-size: 11px;
  line-height: 1;
}
.btn-img:hover,
.btn-img-caret:hover,
.btn-img-caret.active {
  background: #047857;
}
.snapshot-menu {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  min-width: 146px;
  padding: 6px;
  background: #fff8dc;
  border: 1px solid #d6c78d;
  border-radius: 6px;
  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.24);
  display: flex;
  flex-direction: column;
  gap: 4px;
  z-index: 30;
}
.snapshot-menu-item {
  padding: 7px 10px;
  background: transparent;
  color: #1f2937;
  border: 1px solid transparent;
  border-radius: 4px;
  text-align: left;
  cursor: pointer;
  font-size: 12px;
  white-space: nowrap;
}
.snapshot-menu-item:hover {
  background: #fff3bf;
  border-color: #d6c78d;
}
.btn-stamp {
  padding: 5px 12px;
  background: #7c3aed;
  color: #fff;
  border: 1px solid #7c3aed;
  border-radius: 5px;
  cursor: pointer;
  font-size: 12px;
}
.btn-stamp:hover {
  background: #6d28d9;
}
.btn-stamp.active {
  background: #4c1d95;
  border-color: #a78bfa;
}
/* ══ 圖章疊層 ══ */
.s-img {
  position: absolute;
  cursor: grab;
  border: 1.5px dashed transparent;
  border-radius: 2px;
  user-select: none;
  z-index: 7;
}
.s-img:hover {
  border-color: #a78bfa;
}
.s-img-selected {
  border-color: #7c3aed;
}
.s-img:active {
  cursor: grabbing;
}
.s-img-del {
  position: absolute;
  top: -9px;
  right: -9px;
  width: 17px;
  height: 17px;
  background: #dc2626;
  color: #fff;
  border: none;
  border-radius: 50%;
  font-size: 11px;
  line-height: 15px;
  text-align: center;
  cursor: pointer;
  display: none;
  padding: 0;
  z-index: 1;
}
.s-img:hover .s-img-del {
  display: block;
}
.s-img-rh {
  position: absolute;
  bottom: -5px;
  right: -5px;
  width: 12px;
  height: 12px;
  background: #7c3aed;
  border: 2px solid #fff;
  border-radius: 2px;
  cursor: se-resize;
  opacity: 0;
  transition: opacity 0.15s;
}
.s-img:hover .s-img-rh {
  opacity: 1;
}
.o-img {
  position: absolute;
  cursor: grab;
  border: 1.5px dashed transparent;
  border-radius: 2px;
  user-select: none;
  z-index: 6;
}
.o-img:hover {
  border-color: #aaa;
}
.o-img:active {
  cursor: grabbing;
}
.o-img-rh {
  position: absolute;
  bottom: -5px;
  right: -5px;
  width: 12px;
  height: 12px;
  background: #2563eb;
  border: 2px solid #fff;
  border-radius: 2px;
  cursor: se-resize;
  opacity: 0;
  transition: opacity 0.15s;
}
.o-img:hover .o-img-rh {
  opacity: 1;
}
.btn-print {
  padding: 5px 12px;
  background: #334155;
  color: #fff;
  border: 1px solid #475569;
  border-radius: 5px;
  cursor: pointer;
  font-size: 12px;
}
.btn-save {
  padding: 5px 12px;
  background: #2563eb;
  color: #fff;
  border: none;
  border-radius: 5px;
  cursor: pointer;
  font-size: 12px;
}
.btn-save:disabled {
  opacity: 0.55;
  cursor: default;
}
.save-msg {
  font-size: 12px;
  color: #86efac;
}
.pdf-generating {
  color: #fbbf24;
}
.btn-pdf-link {
  font-size: 12px;
  color: #6ee7b7;
  text-decoration: none;
  border: 1px solid #6ee7b7;
  padding: 2px 8px;
  border-radius: 4px;
  white-space: nowrap;
}
.btn-pdf-link:hover {
  background: #064e3b;
}
.btn-repdf {
  font-size: 12px;
  color: #6ee7b7;
  background: transparent;
  border: 1px solid #6ee7b7;
  padding: 2px 7px;
  border-radius: 4px;
  cursor: pointer;
}
.btn-repdf:hover {
  background: #064e3b;
}
.btn-upload-pdf {
  font-size: 12px;
  color: #fff;
  background: #7c3aed;
  border: none;
  padding: 4px 10px;
  border-radius: 5px;
  cursor: pointer;
  white-space: nowrap;
}
.btn-upload-pdf:hover {
  background: #6d28d9;
}
.btn-upload-pdf:disabled {
  opacity: 0.55;
  cursor: default;
}
/* ══ 頁面容器 ══ */
.page-wrap {
  flex: 1;
  overflow: auto;
  padding: 24px;
  display: flex;
  justify-content: center;
  align-items: flex-start;
}

/* ══ A4 橫式 ══ */
.a4-page {
  position: relative;
  width: 1123px;
  height: 794px;
  background: #fff;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
  box-sizing: border-box;
  font-family: "DFKai-SB", "BiauKai", "標楷體", "KaiTi", serif;
  font-size: 15px;
  overflow: hidden;
  flex-shrink: 0;
  --sheet-grid-border: #000;
  --sheet-grid-width: 0.8px;
}

/* Unified thinner sheet lines (preview + print) */
.a4-page
  :where(
    .vert-strip,
    .main-area,
    .left-col,
    .fields-tbl td,
    .section-head,
    .detail-tbl th,
    .detail-tbl td,
    .install-row,
    .notice-row,
    .notes-col,
    .price-col,
    .price-val-col,
    .sig-col,
    .sig-box,
    .vf-val,
    .sub-section,
    .fields-top > .sub-section:last-child,
    .fields-top > .sub-section:last-child .section-head,
    .stove-section,
    .stove-section .section-head,
    .stove-section .detail-tbl,
    .stove-section .detail-tbl tbody tr:last-child td
  ) {
  border-width: var(--sheet-grid-width) !important;
}
.a4-page .fields-top > .sub-section:last-child::after {
  border-bottom-width: var(--sheet-grid-width) !important;
}

/* ══ 頂部標題 ══ */
.top-strip {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 0 6px 4px;
  border-bottom: 1px solid #000;
  height: 28px;
  background: #fff;
}
.doc-star {
  font-size: 15px;
  font-weight: 900;
  line-height: 1.1;
  white-space: nowrap;
}
.co-info {
  font-size: 12px;
}

/* ══ 主體 ══ */
.body-row {
  display: flex;
  height: calc(794px - 28px - 16px);
}

/* ══ 左右直條 ══ */
.vert-strip {
  width: 22px;
  overflow: hidden;
  border: 1px solid var(--sheet-grid-border);
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 4px 0;
  gap: 6px;
}
.vert-l {
  border-right: none;
}
.vert-r {
  border-left: none;
}
.vert-txt,
.vert-txt2 {
  display: block;
  width: 100%;
  font-size: 15px;
  word-break: break-all;
  line-break: anywhere;
  text-align: center;
  overflow: visible;
  line-height: 1.4;
}
.vert-txt2 {
  font-size: 14px;
}
.cabinet-ready-wrap {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}
.cabinet-ready-actions {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}
.cabinet-choice {
  width: 18px;
  min-height: 18px;
  border: 1px solid #888;
  border-radius: 3px;
  padding: 0;
  font-size: 10px;
  line-height: 1;
  background: #fff;
  color: #333;
  cursor: pointer;
}
.cabinet-choice.active {
  border-color: #1d4ed8;
  color: #1d4ed8;
  font-weight: 700;
}
.vc {
  display: block;
  width: 100%;
  text-align: center;
  line-height: 1.4;
}

.vert-fields {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: auto;
  margin-bottom: 20px;
  width: 100%;
  align-items: center;
}
.vf-row {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 18px;
  gap: 2px;
}
.vf-lbl {
  font-size: 10px;
  font-weight: 600;
  word-break: break-all;
  text-align: center;
  line-height: 1.2;
  color: #444;
}
.vf-val {
  font-size: 10px;
  word-break: break-all;
  text-align: center;
  line-height: 1.2;
  min-height: 28px;
  border-bottom: 1px solid var(--sheet-grid-border);
  color: #000;
}

/* ══ 主內容 ══ */
.main-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--sheet-grid-border);
  overflow: hidden;
  min-width: 0;
}

/* ══ 上半部 ══ */
.upper-body {
  flex: 1;
  display: flex;
  overflow: hidden;
  min-height: 0;
}

/* ══ 左欄位 ══ */
.left-col {
  width: 224px;
  flex-shrink: 0;
  border-right: 1px solid var(--sheet-grid-border);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
/* 水槽/爐子 小節 */
.fields-top {
  flex-shrink: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.sub-section {
  display: flex;
  border-top: 1px solid var(--sheet-grid-border);
  flex-shrink: 0;
  overflow: visible;
}
.fields-top > .sub-section:last-child {
  position: relative;
  border-bottom: 1px solid var(--sheet-grid-border);
}
.fields-top > .sub-section:last-child .section-head {
  border-bottom: 1px solid var(--sheet-grid-border);
}
.fields-top > .sub-section:last-child::after {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  border-bottom: 1px solid var(--sheet-grid-border);
  pointer-events: none;
}
.stove-section {
  border-bottom: 1px solid var(--sheet-grid-border);
}
.stove-section .section-head {
  border-bottom: 1px solid var(--sheet-grid-border);
}
.stove-section .detail-tbl {
  border-bottom: 1px solid var(--sheet-grid-border);
}
.stove-section .detail-tbl tbody tr:last-child td {
  border-bottom: 1px solid var(--sheet-grid-border);
}
.faucet-section {
  display: flex;
  flex: 1;
  min-height: 0;
}
.faucet-cell {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  padding: 3px 10px;
  gap: 2px;
  font-size: 13px;
  line-height: 1.2;
  overflow: hidden;
}
.faucet-line {
  white-space: normal;
  overflow-wrap: anywhere;
  word-break: break-word;
}
/* 右側大繪圖區 */
.drawing-area {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  background: #fff;
}

.fields-tbl {
  width: 100%;
  border-collapse: collapse;
  flex-shrink: 0;
}
.fields-tbl td {
  border: 1px solid var(--sheet-grid-border);
  padding: 0 4px 3px;
  height: 26px;
  vertical-align: middle;
  line-height: 1.1;
}
.fields-tbl .lbl,
.fields-tbl .val {
  position: relative;
  top: -3px;
}
.a4-page:not(.export-rendering) .fields-tbl .lbl,
.a4-page:not(.export-rendering) .fields-tbl .val {
  top: -1px;
}
.fields-tbl td.val {
  text-align: left;
  padding-left: 8px;
}
.fields-tbl tr.edge-row td {
  height: 84px;
  padding-top: 0;
  padding-bottom: 0;
  vertical-align: middle;
}
.fields-tbl tr.edge-row .lbl {
  top: 0;
}
.lbl {
  background: #fff;
  font-weight: 600;
  width: 62px;
  white-space: nowrap;
  text-align: center;
  font-size: 13px;
  line-height: 1.3;
}
.lbl-s {
  background: #fff;
  font-weight: 600;
  width: 24px;
  white-space: nowrap;
  text-align: center;
  font-size: 12px;
  line-height: 1.3;
}
.val {
  font-size: 13px;
  line-height: 1.3;
  text-align: center;
  vertical-align: middle;
}
.note-val {
  white-space: pre-wrap;
  overflow-wrap: break-word;
  word-break: break-word;
  text-align: left;
}
.val-s {
  width: 58px;
  font-size: 12px;
}
.ii {
  border: none;
  outline: none;
  width: 56px;
  font-size: 13px;
  background: transparent;
}
.ii.full {
  width: 100%;
}
.ii-vert {
  border: none;
  outline: none;
  width: 28px;
  font-size: 13px;
  background: transparent;
  writing-mode: horizontal-tb;
}
.edge-cell {
  padding: 0 8px;
  height: 84px;
  display: flex;
  align-items: center;
  vertical-align: middle;
}
.edge-choice-list {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 2px;
  width: 100%;
  transform: translateY(-4px);
}
.edge-choice {
  display: grid;
  grid-template-columns: 16px auto 1fr;
  align-items: center;
  gap: 4px;
  border: none;
  background: transparent;
  padding: 0;
  min-height: 24px;
  font: inherit;
  cursor: pointer;
  color: #111;
  justify-items: start;
}
.edge-choice-shape {
  width: 16px;
  text-align: center;
  font-size: 15px;
  line-height: 1;
}
.edge-choice-mark {
  font-size: 13px;
  line-height: 1;
}
.edge-choice-label {
  font-size: 14px;
  line-height: 1.1;
}
.edge-choice.active .edge-choice-label {
  font-weight: 700;
}
.panel-row {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  min-height: 56px;
  width: 100%;
  padding-left: 12px;
}
.sub-section-panel {
  min-height: 56px;
  align-items: center;
}
.sub-section-panel .panel-row {
  min-height: 56px;
}
.section-head-panel {
  font-size: 12px;
  line-height: 1;
  padding: 0;
  min-height: 60px;
  width: 22px;
  writing-mode: vertical-rl;
  text-orientation: upright;
  letter-spacing: 1px;
  overflow: visible;
}
.panel-opt {
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 3px;
  border: 1px solid transparent;
  user-select: none;
}
.panel-opt.checked {
  border-color: #777;
  background: #fafafa;
}

.section-head {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 600;
  width: 18px;
  flex-shrink: 0;
  border-right: 1px solid var(--sheet-grid-border);
  background: #fff;
  line-height: 1.3;
  text-align: center;
  word-break: break-all;
  padding: 2px 0;
}

.detail-tbl {
  flex: 1;
  border-collapse: collapse;
  font-size: 12px;
  width: 100%;
  table-layout: fixed;
}
.detail-tbl th,
.detail-tbl td {
  border: 1px solid var(--sheet-grid-border);
  padding: 0 3px 1px;
  height: 20px;
  text-align: center;
  vertical-align: top;
  line-height: 1;
  overflow: visible;
  white-space: nowrap;
}
.detail-tbl td:first-child {
  white-space: normal;
  overflow-wrap: anywhere;
  word-break: normal;
  text-align: center;
}
.detail-tbl th {
  background: #fff;
  font-size: 12px;
  line-height: 1.2;
}

/* ══ 安裝地點 ══ */
.install-row {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  position: relative;
  border-top: 1px solid var(--sheet-grid-border);
  border-bottom: none;
  padding: 1px 4px;
  min-height: 34px;
  font-size: 15px;
  flex-shrink: 0;
}
.install-main-row {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  width: 100%;
  padding-right: 124px;
  display: grid;
  grid-template-columns:
    62px minmax(0, 1fr) 28px minmax(80px, auto)
    28px minmax(96px, auto);
  align-items: center;
  line-height: 1.2;
  position: relative;
  top: 0;
}
.site-val {
  display: block;
  min-width: 0;
  overflow: visible;
  text-overflow: clip;
  white-space: normal;
  word-break: break-all;
  line-height: 1.1;
  font-size: 21px;
  text-align: left;
  padding-left: 6px;
  position: relative;
  top: -1px;
}
.owner-val {
  min-width: 80px;
  display: inline-block;
  line-height: 1.2;
}
.phone-val {
  min-width: 96px;
  display: inline-block;
  line-height: 1.2;
}
.install-sticker-lines {
  position: absolute;
  top: -3pt;
  right: 2px;
  width: 140px;
  height: calc(100% + 50px);
  display: grid;
  grid-template-rows: repeat(4, minmax(0, 1fr));
  align-content: stretch;
  font-size: 7pt !important;
  line-height: 1.2;
  justify-items: start;
  padding-left: 2px;
  padding-top: 1px;
  white-space: nowrap;
  pointer-events: none;
  z-index: 2;
  border: 1px solid var(--sheet-grid-border);
  background: #fff;
  overflow: hidden;
  box-sizing: border-box;
}
.install-sticker-lines > div {
  display: flex;
  align-items: center;
  white-space: nowrap;
}
.sticker-line {
  width: 100%;
  gap: 2px;
  align-items: center;
}
.sticker-lbl {
  flex: 0 0 auto;
  font-size: 7pt !important;
}
.sticker-val {
  flex: 1 1 auto;
  min-width: 0;
  overflow: visible;
  text-overflow: clip;
  white-space: nowrap;
  font-size: 7pt !important;
  line-height: 1.2;
}

/* ══ 交期說明 ══ */
.notice-row {
  padding: 0 6px;
  font-size: 14px;
  font-weight: 700;
  color: #0b2bd6;
  border-bottom: 1px solid #000;
  background: #fff;
  min-height: 36px;
  display: grid;
  grid-template-columns: auto 1fr;
  align-items: center;
  gap: 4px;
  line-height: 1.25;
  flex-shrink: 0;
  overflow: visible;
  transform: none;
}
.notice-icon {
  flex-shrink: 0;
  font-size: 16px;
  line-height: 1.2;
}
.notice-text {
  display: block;
  font-size: 17px;
  white-space: nowrap;
  line-height: 1.25;
  text-align: left;
  padding-top: 0;
  transform: translateY(-3px);
}

/* ══ 底部 ══ */
.bottom-row {
  display: flex;
  height: 108px;
  flex-shrink: 0;
}
.notes-col {
  width: 132px;
  padding: 3px 5px;
  font-size: 11px;
  line-height: 1.25;
  border-right: 1px solid var(--sheet-grid-border);
  overflow: hidden;
  flex-shrink: 0;
}
.notes-col ol {
  margin: 3px 0 0 14px;
  padding: 0;
}

.calc-col {
  flex: 1;
  border-right: 1px solid var(--sheet-grid-border);
  display: flex;
  align-items: center;
  justify-content: center;
}
.install-opts {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}
.inst-chk-row {
  display: flex;
  gap: 10px;
}
.inst-item {
  display: flex;
  align-items: center;
  gap: 2px;
  cursor: pointer;
  padding: 2px 5px;
  border-radius: 3px;
  border: 1.5px solid transparent;
  font-size: 9px;
}
.inst-chk {
  font-size: 8px;
  color: #333;
}
.inst-lbl {
  font-size: 8px;
  font-weight: 600;
}

.price-col {
  width: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-right: 1px solid var(--sheet-grid-border);
  font-size: 14px;
}
.price-lbl {
  font-weight: 600;
  writing-mode: vertical-rl;
  letter-spacing: 1px;
}
.price-val-col {
  flex: 1;
  display: flex;
  align-items: stretch;
  justify-content: center;
  border-right: 1px solid var(--sheet-grid-border);
  padding: 2px 4px 10px;
  overflow-x: hidden;
  overflow-y: visible;
}
.price-val {
  white-space: nowrap;
  font-size: 22px;
  font-weight: 700;
  color: #c0392b;
  letter-spacing: 1px;
}
.price-grid {
  width: 100%;
  display: grid;
  column-gap: 10px;
  row-gap: 0;
  align-items: start;
  padding: 1px 2px 2px;
}
.price-grid--cols-2 {
  grid-template-columns: 1fr 1fr;
}
.price-grid--cols-3 {
  grid-template-columns: 1fr 1fr 1fr;
}
.price-grid--dense {
  column-gap: 6px;
}
.price-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
  line-height: 1.2;
  table-layout: fixed;
}
.price-table td {
  padding: 1px 2px 2px;
  vertical-align: top;
  border-bottom: 1px dotted #ddd;
}
.price-table tr:last-child td {
  border-bottom: none;
}
.price-table .pt-desc {
  text-align: left;
  white-space: normal;
  word-break: break-word;
  overflow: visible;
  width: 44%;
}
.price-table .pt-calc {
  text-align: right;
  color: #666;
  white-space: nowrap;
  width: 36%;
  font-variant-numeric: tabular-nums;
}
.price-table .pt-amt {
  text-align: right;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
  width: 20%;
  font-weight: 600;
}
.price-sum {
  grid-column: 1 / -1;
  border-top: 2px solid #c0392b;
  margin-top: 6px;
  padding: 2px 4px 5px 0;
  text-align: right;
  font-weight: 700;
  font-size: 15px;
  line-height: 1.15;
  color: #c0392b;
  position: relative;
  top: -2px;
}
.price-sum span {
  margin-left: 6px;
  font-size: 18px;
  line-height: 1;
  letter-spacing: 1px;
}

.sig-col {
  width: 122px;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-top: 2px;
  margin-left: auto;
  border-left: 1px solid var(--sheet-grid-border);
  margin-top: -3pt;
}
.sig-lbl {
  font-size: 12px;
  font-weight: 700;
  width: 100%;
  text-align: center;
  border-bottom: 1px solid var(--sheet-grid-border);
  line-height: 1.3;
  padding: 1px 0;
}
.sig-box {
  position: relative;
  flex: 1;
  width: 100%;
  border: 1px solid var(--sheet-grid-border);
  border-top: none;
  margin-top: 0;
  background: #fff;
}
.sig-hand {
  position: absolute;
  left: 8px;
  bottom: 12px;
  font-size: 24px;
  line-height: 1;
}
.sig-pencil {
  position: absolute;
  right: 10px;
  bottom: 8px;
  font-size: 20px;
  line-height: 1;
}

/* ══ 底部傳真 ══ */
.fax-strip {
  position: absolute;
  bottom: 2px;
  right: 8px;
  font-size: 12px;
  font-weight: 700;
  color: #111;
  height: 18px;
  line-height: 18px;
}

/* Export-only readability boost: applied only during snapshot/PDF rendering */
.a4-page.export-readable .fields-tbl td {
  height: 24px;
}
.a4-page.export-readable .lbl,
.a4-page.export-readable .val {
  font-size: 14px;
}
.a4-page.export-readable .detail-tbl,
.a4-page.export-readable .detail-tbl th {
  font-size: 13px;
}
.a4-page.export-readable .price-table {
  font-size: 13px;
  line-height: 1.25;
}
.a4-page.export-readable .price-col {
  font-size: 15px;
}
.a4-page.export-readable .price-sum {
  font-size: 16px;
}
.a4-page.export-readable .price-sum span {
  font-size: 19px;
}
.a4-page.export-readable .notice-row {
  font-size: 11px;
}
.a4-page.export-readable .fax-strip {
  font-size: 12px;
  font-weight: 700;
  color: #111;
}
/* PDF export path uses .export-rendering (ENABLE_EXPORT_READABLE_STYLE is false). */
.a4-page.export-rendering .install-main-row {
  top: 0 !important;
}
.a4-page.export-rendering .site-val {
  font-size: 19px !important;
  line-height: 1.2 !important;
  top: -5pt !important;
}
.a4-page.export-rendering .install-main-row > .lbl {
  position: relative;
  top: -5pt !important;
}
.a4-page.export-rendering .install-row {
  margin-top: 0 !important;
}
.a4-page.export-rendering .sig-col {
  margin-top: -3pt !important;
}
.a4-page.export-rendering .install-sticker-lines {
  font-size: 7pt !important;
  top: -3pt !important;
  transform: none !important;
  right: 2px !important;
  width: 140px !important;
  height: calc(100% + 50px) !important;
  line-height: 1.2 !important;
  padding-top: 1px !important;
  align-content: stretch !important;
  overflow: hidden !important;
  box-sizing: border-box !important;
}
.a4-page.export-rendering .sticker-lbl,
.a4-page.export-rendering .sticker-val {
  font-size: 7pt !important;
  line-height: 1.2 !important;
}
.a4-page.export-rendering .sticker-val {
  overflow: visible !important;
  text-overflow: clip !important;
}

/* Export-only fine-tune for print/PDF alignment */
.detail-cell-text {
  display: inline-block;
}
.a4-page.export-rendering .detail-cell-text {
  transform: translateY(-7px);
}
.a4-page.export-rendering .lbl,
.a4-page.export-rendering .val {
  font-size: 15px;
}
.a4-page.export-rendering .fields-tbl td {
  height: 28px;
  line-height: 1.1;
  vertical-align: top;
  padding-top: 0;
  padding-bottom: 2px;
}
.a4-page.export-rendering .fields-tbl .lbl,
.a4-page.export-rendering .fields-tbl .val {
  top: -3px;
}
.a4-page.export-rendering .fields-tbl tr.edge-row td {
  height: 88px;
  vertical-align: middle;
}
.a4-page.export-rendering .fields-tbl td.val {
  padding-top: 0;
  padding-bottom: 4px;
}
.a4-page.export-rendering .detail-tbl,
.a4-page.export-rendering .detail-tbl th {
  font-size: 13px;
}
.a4-page.export-rendering .edge-choice-shape {
  font-size: 15px;
}
.a4-page.export-rendering .edge-choice-mark,
.a4-page.export-rendering .edge-choice-label {
  font-size: 13px;
}
.a4-page.export-rendering .edge-choice-list {
  transform: translateY(-11px);
}

/* ══ 繪圖區塊 ══ */
.drawing-blk {
  position: absolute;
  cursor: grab;
  z-index: 5;
}
.drawing-blk.blk-dragging {
  cursor: grabbing;
  opacity: 0.88;
}

/* 四角把手：預設隱藏，hover 選中後才顯示 */
.rh {
  display: none;
}
.blk-selected:hover .rh {
  display: block;
}

.svg-outer {
  overflow: hidden;
  display: block;
  position: relative;
}
.svg-inner {
  display: block;
}
.svg-ph {
  width: 320px;
  height: 100px;
  background: #fffbeb;
  border: 1px dashed #f59e0b;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  color: #b45309;
}

.rh {
  position: absolute;
  width: 12px;
  height: 12px;
  background: #2563eb;
  border: 2px solid #fff;
  border-radius: 2px;
  z-index: 10;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.45);
}
.rh-nw {
  top: -6px;
  left: -6px;
  cursor: nw-resize;
}
.rh-ne {
  top: -6px;
  right: -6px;
  cursor: ne-resize;
}
.rh-sw {
  bottom: -6px;
  left: -6px;
  cursor: sw-resize;
}
.rh-se {
  bottom: -6px;
  right: -6px;
  cursor: se-resize;
}

/* ══ 文字疊層（確認後可拖移） ══ */
.txt-ovl {
  position: absolute;
  cursor: grab;
  user-select: none;
  z-index: 14;
  white-space: pre-wrap;
  font-family: "微軟正黑體", "Microsoft JhengHei", Arial, sans-serif;
  line-height: 1.3;
  padding: 2px 4px;
}
.txt-ovl-selected {
  outline: none;
  outline-offset: 0;
}
.txt-ovl:hover {
  outline: 1px dashed rgba(37, 99, 235, 0.9);
  outline-offset: 2px;
}
.txt-ovl:active {
  cursor: grabbing;
}
.txt-ovl-del {
  position: absolute;
  top: -9px;
  right: -9px;
  width: 17px;
  height: 17px;
  background: #dc2626;
  color: #fff;
  border: none;
  border-radius: 50%;
  font-size: 11px;
  line-height: 15px;
  text-align: center;
  cursor: pointer;
  display: none;
  padding: 0;
}
.txt-ovl:hover .txt-ovl-del {
  display: block;
}
.txt-ovl-rh {
  position: absolute;
  bottom: -5px;
  right: -5px;
  width: 12px;
  height: 12px;
  background: #2563eb;
  border: 2px solid #fff;
  border-radius: 2px;
  cursor: se-resize;
  opacity: 0;
  transition: opacity 0.15s;
}
.txt-ovl:hover .txt-ovl-rh {
  opacity: 1;
}

/* ══ 直線/矩形疊層 ══ */
.shape-ovl {
  position: absolute;
  cursor: grab;
  user-select: none;
  z-index: 13;
}
.shape-ovl-selected {
  outline: 1px dashed rgba(37, 99, 235, 0.9);
  outline-offset: 2px;
}
.shape-ovl:active {
  cursor: grabbing;
}
.shape-ovl:hover .rh {
  display: block;
}
.shape-ovl-del {
  position: absolute;
  top: -9px;
  right: -9px;
  width: 17px;
  height: 17px;
  background: #dc2626;
  color: #fff;
  border: none;
  border-radius: 50%;
  font-size: 11px;
  line-height: 15px;
  text-align: center;
  cursor: pointer;
  display: none;
  padding: 0;
}
.shape-ovl:hover .shape-ovl-del {
  display: block;
}

/* ══ 手繪 canvas ══ */
.annot-canvas {
  position: absolute;
  top: 0;
  left: 0;
  width: 1123px;
  height: 794px;
  pointer-events: none;
  z-index: 15;
}
.annot-canvas.draw-active {
  pointer-events: all;
  cursor: crosshair;
}
.preview-canvas {
  position: absolute;
  top: 0;
  left: 0;
  width: 1123px;
  height: 794px;
  pointer-events: none;
  z-index: 16;
}

/* ══ 文字工具輸入框 ══ */
.text-box-wrap {
  position: absolute;
  z-index: 17;
  display: flex;
  flex-direction: column;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
  border-radius: 4px;
  overflow: visible;
}
.text-box-handle {
  background: #2563eb;
  color: #fff;
  font-size: 11px;
  padding: 2px 4px;
  cursor: grab;
  border-radius: 4px 4px 0 0;
  user-select: none;
  display: flex;
  align-items: center;
  gap: 4px;
}
.text-box-handle:active {
  cursor: grabbing;
}
.text-commit-btn {
  padding: 1px 6px;
  background: #16a34a;
  color: #fff;
  border: none;
  border-radius: 3px;
  cursor: pointer;
  font-size: 11px;
  flex-shrink: 0;
}
.text-cancel-btn {
  padding: 1px 5px;
  background: #dc2626;
  color: #fff;
  border: none;
  border-radius: 3px;
  cursor: pointer;
  font-size: 11px;
  flex-shrink: 0;
}
.text-tool-input {
  background: rgba(255, 255, 255, 0.9);
  border: 1.5px solid #2563eb;
  border-top: none;
  border-radius: 0 0 4px 4px;
  padding: 4px 6px;
  min-width: 100px;
  resize: both;
  outline: none;
  font-family: "微軟正黑體", "Microsoft JhengHei", Arial, sans-serif;
  line-height: 1.3;
}

.quick-text-input {
  min-width: 240px;
  height: 28px;
  padding: 4px 8px;
  border-radius: 5px;
  border: 1px solid #94a3b8;
  background: #ffffff;
  color: #111827;
  font-size: 12px;
}

.quick-text-input::placeholder {
  color: #6b7280;
}

/* ══ 手繪工具按鈕 ══ */
.btn-draw {
  padding: 4px 10px;
  background: #334155;
  color: #e2e8f0;
  border: 1px solid #475569;
  border-radius: 5px;
  cursor: pointer;
  font-size: 12px;
}
.btn-draw.draw-on {
  background: #f59e0b;
  border-color: #d97706;
  color: #000;
}
.rect-mode-btns {
  display: flex;
  align-items: center;
  gap: 4px;
}
.rect-mode-btn {
  width: 30px;
  height: 30px;
  padding: 0;
  background: #1e293b;
  color: #e2e8f0;
  border: 1px solid #475569;
  border-radius: 5px;
  cursor: pointer;
  font-size: 15px;
  line-height: 1;
}
.rect-mode-btn.active {
  background: #f59e0b;
  border-color: #d97706;
  color: #111827;
}
.common-color-palette {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: 2px;
}
.color-swatch {
  width: 20px;
  height: 20px;
  border: 1px solid #475569;
  border-radius: 5px;
  cursor: pointer;
  flex-shrink: 0;
}
.color-swatch.active {
  border-color: #f59e0b;
  box-shadow: 0 0 0 1px #f59e0b;
}
.sz-btns {
  display: flex;
  align-items: center;
  gap: 2px;
}
.sz-btn {
  width: 26px;
  height: 26px;
  background: #1e293b;
  border: 1px solid #475569;
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  flex-shrink: 0;
}
.sz-btn.sz-on {
  border-color: #f59e0b;
  background: #27374d;
  box-shadow: 0 0 0 1px #f59e0b;
}
.sz-line {
  display: block;
  width: 18px;
  border-radius: 3px;
}

/* ══ 列印 ══ */
@media print {
  .no-print {
    display: none !important;
  }
  .conf-root {
    background: #fff;
  }
  .page-wrap {
    padding: 0;
    overflow: visible;
  }
  .a4-page {
    box-shadow: none;
    width: 297mm;
    height: 210mm;
    overflow: hidden;
  }
  .drawing-blk {
    outline: none !important;
  }
  @page {
    size: A4 landscape;
    margin: 0;
  }
}
</style>
