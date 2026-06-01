<template>
  <div
    class="conf-root"
    @mousemove.prevent="onMouseMove"
    @mouseup="onMouseUp"
    @mouseleave="onMouseUp"
    @click.self="selectedBlkId = null"
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
      <span class="toolbar-title">📋 生產確定單</span>
      <div class="toolbar-right">
        <span class="hint">點選繪圖：移動；四角藍點：縮放</span>
        <!-- 手繪工具 -->
        <button
          class="btn-draw"
          :class="{ 'draw-on': drawTool === null }"
          @click="setDrawTool(null)"
        >
          ↖ 移動
        </button>
        <button
          class="btn-draw"
          :class="{ 'draw-on': drawTool === 'pen' }"
          @click="setDrawTool('pen')"
        >
          ✏️ 筆
        </button>
        <button
          class="btn-draw"
          :class="{ 'draw-on': drawTool === 'erase' }"
          @click="setDrawTool('erase')"
        >
          🧹 擦
        </button>
        <button
          class="btn-draw"
          :class="{ 'draw-on': drawTool === 'line' }"
          @click="setDrawTool('line')"
        >
          ╱ 直線
        </button>
        <button
          class="btn-draw"
          :class="{ 'draw-on': drawTool === 'rect' }"
          @click="setDrawTool('rect')"
        >
          ▭ 框
        </button>
        <button
          class="btn-draw"
          :class="{ 'draw-on': drawTool === 'text' }"
          @click="setDrawTool('text')"
        >
          T 文字
        </button>
        <input
          v-show="drawTool && drawTool !== 'erase'"
          type="color"
          v-model="drawColor"
          class="color-picker"
          title="顏色"
        />
        <div v-show="drawTool !== null" class="sz-btns">
          <button
            v-for="w in strokeWidths"
            :key="w"
            class="sz-btn"
            :class="{ 'sz-on': drawWidth === w }"
            :title="w + ' px'"
            @click="drawWidth = w"
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
        <button class="btn-img" @click="imgInputRef.click()">
          📷 插入截圖
        </button>
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
        <button class="btn-print" @click="doPrint">🖨️ 列印 / PDF</button>
        <button class="btn-save" :disabled="saving" @click="doSave">
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
                      <td class="lbl">客戶電話</td>
                      <td class="val" colspan="3">
                        {{ order?.customerContact?.phone || "" }}
                      </td>
                    </tr>
                    <tr>
                      <td class="lbl">圖面傳真</td>
                      <td colspan="3">
                        <input
                          v-model="cf.faxNo"
                          class="ii full"
                          @change="markDirty"
                        />
                      </td>
                    </tr>
                    <tr>
                      <td class="lbl">備　　注</td>
                      <td class="val" colspan="3">
                        {{ order?.specialNotes || "" }}
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
                      <td class="lbl">實際交貨日</td>
                      <td colspan="3">
                        <span v-if="pdfGenerating" class="ii full">{{
                          cf.actualDelivery || ""
                        }}</span>
                        <input
                          v-else
                          v-model="cf.actualDelivery"
                          type="date"
                          class="ii full"
                          @change="markDirty"
                        />
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
                    <tr>
                      <td class="lbl">前沿<br />造型</td>
                      <td colspan="3" class="edge-cell">
                        <div class="edge-row">
                          <div
                            class="edge-opt"
                            :class="{ checked: cf.edgeType === 'round' }"
                            @click="
                              cf.edgeType = 'round';
                              markDirty();
                            "
                          >
                            <svg width="44" height="26" viewBox="0 0 54 32">
                              <path
                                d="M4,2 L40,2 Q50,2 50,12 L50,30 L4,30 Z"
                                fill="#e0e0e0"
                                stroke="#444"
                                stroke-width="1.5"
                              />
                            </svg>
                            <div class="edge-lbl">3mm圓角</div>
                          </div>
                          <div
                            class="edge-opt"
                            :class="{ checked: cf.edgeType === 'bevel' }"
                            @click="
                              cf.edgeType = 'bevel';
                              markDirty();
                            "
                          >
                            <svg width="44" height="26" viewBox="0 0 54 32">
                              <path
                                d="M4,2 L40,2 L50,12 L50,30 L4,30 Z"
                                fill="#e0e0e0"
                                stroke="#444"
                                stroke-width="1.5"
                              />
                            </svg>
                            <div class="edge-lbl">3mm斜角</div>
                          </div>
                          <div
                            class="edge-opt"
                            :class="{ checked: cf.edgeType === 'dull' }"
                            @click="
                              cf.edgeType = 'dull';
                              markDirty();
                            "
                          >
                            <svg width="44" height="26" viewBox="0 0 54 32">
                              <path
                                d="M4,2 L48,2 L50,4 L50,30 L4,30 Z"
                                fill="#e0e0e0"
                                stroke="#444"
                                stroke-width="1.5"
                              />
                            </svg>
                            <div class="edge-lbl">1mm磨不利</div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  </table>

                  <!-- 套板截面 -->
                  <div class="sub-section">
                    <div class="section-head">套板截面</div>
                    <div class="panel-row">
                      <div
                        class="panel-opt"
                        :class="{ checked: cf.panelType === 'e' }"
                        @click="
                          cf.panelType = cf.panelType === 'e' ? '' : 'e';
                          markDirty();
                        "
                      >
                        <svg
                          width="56"
                          height="42"
                          viewBox="0 0 60 44"
                          overflow="visible"
                        >
                          <defs>
                            <pattern
                              id="diag"
                              patternUnits="userSpaceOnUse"
                              width="4"
                              height="4"
                            >
                              <line
                                x1="0"
                                y1="4"
                                x2="4"
                                y2="0"
                                stroke="#b55"
                                stroke-width="0.8"
                              />
                            </pattern>
                          </defs>
                          <polygon
                            points="5,16 57,16 53,22 5,22"
                            fill="#e0e0e0"
                            stroke="#444"
                            stroke-width="1"
                          />
                          <rect
                            x="5"
                            y="8"
                            width="8"
                            height="8"
                            fill="#d0d0d0"
                            stroke="#444"
                            stroke-width="1"
                          />
                          <!-- 桶身空間（倒包左側，全高） -->
                          <rect
                            x="5"
                            y="22"
                            width="40"
                            height="8"
                            fill="url(#diag)"
                            stroke="#888"
                            stroke-width="0.5"
                          />
                          <!-- 桶身空間（倒包上方） -->
                          <rect
                            x="45"
                            y="22"
                            width="8"
                            height="5"
                            fill="url(#diag)"
                            stroke="#888"
                            stroke-width="0.5"
                          />
                          <!-- 倒包石材（橫放 4cm=8px，在底部遮木板） -->
                          <rect
                            x="45"
                            y="27"
                            width="8"
                            height="3"
                            fill="#d0d0d0"
                            stroke="#444"
                            stroke-width="1"
                          />
                          <polygon
                            points="53,22 57,16 57,30 53,30"
                            fill="#d0d0d0"
                            stroke="#444"
                            stroke-width="1"
                          />
                        </svg>
                      </div>
                    </div>
                  </div>
                </div>
                <!-- fields-top -->

                <!-- 水槽 -->
                <div class="sub-section">
                  <div class="section-head">水槽</div>
                  <table class="detail-tbl">
                    <colgroup>
                      <col style="width: 40%" />
                      <col style="width: 13%" />
                      <col style="width: 13%" />
                      <col style="width: 14%" />
                      <col style="width: 20%" />
                    </colgroup>
                    <thead>
                      <tr>
                        <th>品名</th>
                        <th>長</th>
                        <th>寬</th>
                        <th>配件</th>
                        <th>工法</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="s in paddedSinks" :key="s._i">
                        <td>{{ s.model || "" }}</td>
                        <td>{{ s.holeWidthMm || "" }}</td>
                        <td>{{ s.holeDepthMm || "" }}</td>
                        <td>
                          {{ s.model ? (s.hasAccessory ? "有" : "無") : "" }}
                        </td>
                        <td>{{ s.method || "" }}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <!-- 爐子 -->
                <div class="sub-section">
                  <div class="section-head">爐子</div>
                  <table class="detail-tbl">
                    <colgroup>
                      <col style="width: 40%" />
                      <col style="width: 13%" />
                      <col style="width: 13%" />
                      <col style="width: 14%" />
                      <col style="width: 20%" />
                    </colgroup>
                    <thead>
                      <tr>
                        <th>品名</th>
                        <th>長</th>
                        <th>寬</th>
                        <th>R角</th>
                        <th>工法</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="s in paddedStoves" :key="s._i">
                        <td>{{ s.model || "" }}</td>
                        <td>{{ s.holeWidthMm || "" }}</td>
                        <td>{{ s.holeDepthMm || "" }}</td>
                        <td>{{ s.holeRadiusMm || "" }}</td>
                        <td>{{ s.method || "" }}</td>
                      </tr>
                    </tbody>
                  </table>
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
              </div>
              <div class="install-meta-row">
                <span class="lbl-s">業主</span
                ><span class="val-s owner-val">{{ order?.owner?.name || "" }}</span>
                <span class="lbl-s">電話</span
                ><span class="val-s phone-val">{{ order?.owner?.phone || "" }}</span>
              </div>
            </div>

            <!-- 交期說明 -->
            <div class="notice-row">
              📢
              交期為回簽後7個工作天，圖面未簽回無法生產，為避免延誤貴公司交期，麻煩請盡速回簽。如造成急單須收急單費5～7%
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
                  v-if="
                    priceBreakdown.left.length || priceBreakdown.right.length
                  "
                  class="price-grid"
                >
                  <table class="price-table">
                    <tbody>
                      <tr v-for="(ln, i) in priceBreakdown.left" :key="'l' + i">
                        <td class="pt-desc">{{ ln.desc }}</td>
                        <td class="pt-calc">{{ ln.calc }}</td>
                        <td class="pt-amt">{{ ln.amt }}</td>
                      </tr>
                    </tbody>
                  </table>
                  <table class="price-table">
                    <tbody>
                      <tr
                        v-for="(ln, i) in priceBreakdown.right"
                        :key="'r' + i"
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
                <div class="sig-box"></div>
              </div>
            </div>
          </div>
          <!-- main-area -->

          <!-- 右側直條 -->
          <div class="vert-strip vert-r">
            <span class="vert-txt">零樹脂成分之瓷板，無板材保固。★</span>
            <span class="vert-txt2" v-html="splitVert('桶身□是□否裝')"></span>
            <span class="vert-txt2"
              >電梯<input
                v-model="cf.elevator"
                class="ii-vert"
                @change="markDirty"
            /></span>
            <div class="vert-fields">
              <div class="vf-row">
                <span class="vf-lbl">下單</span><span class="vf-val"></span>
              </div>
              <div class="vf-row">
                <span class="vf-lbl">打板</span
                ><span class="vf-val">{{ order?.templatingStaff || "" }}</span>
              </div>
              <div class="vf-row">
                <span class="vf-lbl">對圖</span
                ><span class="vf-val">{{ order?.drawingStaff || "" }}</span>
              </div>
              <div class="vf-row">
                <span class="vf-lbl">傳真</span><span class="vf-val"></span>
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
            placeholder="Enter 確認，Shift+Enter 換行"
            @keydown.enter.exact.prevent="commitText"
            @keydown.escape="cancelText"
          />
        </div>

        <!-- 文字疊層（確認後可拖移） -->
        <div
          v-for="ovl in textOverlays"
          :key="ovl.id"
          class="txt-ovl"
          :style="{
            left: ovl.x + 'px',
            top: ovl.y + 'px',
            fontSize: ovl.fontSize + 'px',
            color: ovl.color,
          }"
          @mousedown.stop="startTxtOvlDrag($event, ovl)"
        >
          <button
            class="txt-ovl-del no-print"
            @mousedown.stop
            @click.stop="removeTxtOvl(ovl.id)"
          >
            ×
          </button>
          <div class="txt-ovl-content">{{ ovl.text }}</div>
        </div>

        <!-- 直線/矩形疊層（確認後可拖移） -->
        <div
          v-for="ovl in shapeOverlays"
          :key="ovl.id"
          class="shape-ovl"
          :style="{
            left: Math.min(ovl.x1, ovl.x2) - ovl.width - 4 + 'px',
            top: Math.min(ovl.y1, ovl.y2) - ovl.width - 4 + 'px',
          }"
          @mousedown.stop="startShapeOvlDrag($event, ovl)"
        >
          <button
            class="shape-ovl-del no-print"
            @mousedown.stop
            @click.stop="removeShapeOvl(ovl.id)"
          >
            ×
          </button>
          <svg
            :width="Math.abs(ovl.x2 - ovl.x1) + (ovl.width + 4) * 2"
            :height="Math.abs(ovl.y2 - ovl.y1) + (ovl.width + 4) * 2"
            style="display: block; overflow: visible; pointer-events: none"
          >
            <line
              v-if="ovl.type === 'line'"
              :x1="ovl.x1 - Math.min(ovl.x1, ovl.x2) + ovl.width + 4"
              :y1="ovl.y1 - Math.min(ovl.y1, ovl.y2) + ovl.width + 4"
              :x2="ovl.x2 - Math.min(ovl.x1, ovl.x2) + ovl.width + 4"
              :y2="ovl.y2 - Math.min(ovl.y1, ovl.y2) + ovl.width + 4"
              :stroke="ovl.color"
              :stroke-width="ovl.width"
              stroke-linecap="round"
            />
            <rect
              v-else-if="ovl.type === 'rect'"
              :x="ovl.width + 4"
              :y="ovl.width + 4"
              :width="Math.abs(ovl.x2 - ovl.x1)"
              :height="Math.abs(ovl.y2 - ovl.y1)"
              :stroke="ovl.color"
              :stroke-width="ovl.width"
              fill="none"
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
          class="s-img"
          :style="{
            left: sov.x + 'px',
            top: sov.y + 'px',
            width: sov.w + 'px',
          }"
          @mousedown.stop="startImgDrag($event, sov)"
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
import { useRoute, RouterLink } from "vue-router";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import {
  getSalesOrder,
  listOrderDrawings,
  getOrderConfirmation,
  saveOrderConfirmation,
  uploadOverlayImage,
  uploadConfirmedPdf,
  refreshConfirmedPdfDownloadUrl,
} from "../../firebase";
import StampPanel from "../../components/StampPanel.vue";

const route = useRoute();
const orderId = computed(() => route.params.id);

const order = ref(null);

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
  const empty = { left: [], right: [], total: "" };
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

  // 平均分為左 / 右兩欄
  const mid = Math.ceil(lines.length / 2);
  return {
    left: lines.slice(0, mid),
    right: lines.slice(mid),
    total: total > 0 ? total.toLocaleString() : "",
  };
});

const confirmedPdfUrl = ref(null);
const pdfGenerating = ref(false);
const pdfUploading = ref(false);
const drawingBlocks = ref([]);
const saving = ref(false);
const saveMsg = ref("");
const selectedBlkId = ref(null);
const dirty = ref(false);

const pageRef = ref(null);
const drawingPlaceholderRef = ref(null);

// 確認單可編輯欄位
const cf = reactive({
  elevator: "",
  faxNo: "",
  edgeType: "sharp",
  actualDelivery: "",
  price: "",
  panelType: "", // '' | 'a' | 'b' | 'c' | 'd' | 'e'
});

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
const paddedSinks = computed(() => pad(order.value?.sinks, 3));
const paddedStoves = computed(() => pad(order.value?.stoves, 2));

function fmtDate(val) {
  if (!val) return "";
  const d = val?.toDate ? val.toDate() : new Date(val);
  return isNaN(d) ? "" : d.toLocaleDateString("zh-TW");
}
function mmToCm(val) {
  if (!val) return "";
  const cm = parseFloat(val) / 10;
  return isNaN(cm) ? "" : cm % 1 === 0 ? cm : parseFloat(cm.toFixed(1));
}
function markDirty() {
  dirty.value = true;
}
function splitVert(str) {
  return [...str].map((c) => `<div class="vc">${c}</div>`).join("");
}

// ── Drag & Resize ───────────────────────────────────────────────────
let _mode = null; // 'drag' | 'resize'
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
const drawTool = ref(null); // null | 'pen' | 'erase' | 'line' | 'rect' | 'text'
const drawColor = ref("#e00000");
const drawWidth = ref(5);
const strokeWidths = [1, 2, 3, 4, 5, 7, 9, 12, 16, 20];
let _cdrawing = false;
let _shapeStart = null; // { x, y } canvas coords

// 文字工具狀態
const textBox = ref({
  visible: false,
  value: "",
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

function setDrawTool(tool) {
  if (textBox.value.visible) cancelText();
  drawTool.value = tool !== null && drawTool.value === tool ? null : tool;
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
    textBox.value = {
      visible: true,
      value: "",
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
    markDirty();
  } else if (drawTool.value === "erase") {
    ctx.globalCompositeOperation = "destination-out";
    ctx.lineWidth = drawWidth.value * 5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineTo(x, y);
    ctx.stroke();
    markDirty();
  } else if (
    (drawTool.value === "line" || drawTool.value === "rect") &&
    _shapeStart
  ) {
    const pc = previewCanvasRef.value;
    if (!pc) return;
    const pctx = pc.getContext("2d");
    pctx.clearRect(0, 0, pc.width, pc.height);
    _applyStrokeStyle(pctx);
    if (drawTool.value === "line") {
      pctx.beginPath();
      pctx.moveTo(_shapeStart.x, _shapeStart.y);
      pctx.lineTo(x, y);
      pctx.stroke();
    } else {
      pctx.beginPath();
      pctx.strokeRect(
        _shapeStart.x,
        _shapeStart.y,
        x - _shapeStart.x,
        y - _shapeStart.y,
      );
    }
  }
}
function onCanvasUp(e) {
  if (
    _cdrawing &&
    _shapeStart &&
    (drawTool.value === "line" || drawTool.value === "rect")
  ) {
    let pos;
    try {
      pos = e ? getCanvasPos(e) : null;
    } catch {}
    if (pos) {
      const dx = Math.abs(pos.x - _shapeStart.x);
      const dy = Math.abs(pos.y - _shapeStart.y);
      if (dx > 2 || dy > 2) {
        shapeOverlays.value.push({
          id: Date.now(),
          type: drawTool.value,
          x1: _shapeStart.x,
          y1: _shapeStart.y,
          x2: pos.x,
          y2: pos.y,
          color: drawColor.value,
          width: drawWidth.value,
        });
        markDirty();
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
  if (text) {
    // 確認後轉為可拖移文字疊層，不燒入 canvas
    const HANDLE_H = 24; // 拖移 handle 高度
    textOverlays.value.push({
      id: Date.now(),
      x: tb.x,
      y: tb.y + HANDLE_H,
      text,
      fontSize: tb.fontSize,
      color: drawColor.value,
    });
    markDirty();
  }
  cancelText();
}
function cancelText() {
  textBox.value = { ...textBox.value, visible: false, value: "" };
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
  _activeTxtOvl = ovl;
  _toSX = e.clientX;
  _toSY = e.clientY;
  _toOrigX = ovl.x;
  _toOrigY = ovl.y;
  e.preventDefault();
}
function removeTxtOvl(id) {
  textOverlays.value = textOverlays.value.filter((o) => o.id !== id);
  markDirty();
}

// ── 圖章疊層 ─────────────────────────────────────────────────────
const showStampPanel = ref(false);
const stampOverlays = ref([]); // { id, stampId, url, x, y, w }
function onStampInsert(stamp) {
  stampOverlays.value.push({
    id: Date.now(),
    stampId: stamp.id,
    url: stamp.imageUrl,
    x: 200,
    y: 200,
    w: 120,
  });
  markDirty();
}
function removeStampOvl(id) {
  stampOverlays.value = stampOverlays.value.filter((o) => o.id !== id);
  markDirty();
}

// ── 直線/矩形疊層拖移 ────────────────────────────────────────────
const shapeOverlays = ref([]); // { id, type, x1, y1, x2, y2, color, width }
let _activeShapeOvl = null,
  _soSX = 0,
  _soSY = 0,
  _soOX1 = 0,
  _soOY1 = 0,
  _soOX2 = 0,
  _soOY2 = 0;

function startShapeOvlDrag(e, ovl) {
  _activeShapeOvl = ovl;
  _soSX = e.clientX;
  _soSY = e.clientY;
  _soOX1 = ovl.x1;
  _soOY1 = ovl.y1;
  _soOX2 = ovl.x2;
  _soOY2 = ovl.y2;
  e.preventDefault();
}
function removeShapeOvl(id) {
  shapeOverlays.value = shapeOverlays.value.filter((o) => o.id !== id);
  markDirty();
}
function clearAnnotCanvas() {
  const c = annotCanvasRef.value;
  if (!c) return;
  c.getContext("2d").clearRect(0, 0, c.width, c.height);
  markDirty();
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
  markDirty();
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
  markDirty();
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
  if (_activeTxtOvl) {
    const dx = e.clientX - _toSX;
    const dy = e.clientY - _toSY;
    _activeTxtOvl.x = _toOrigX + dx;
    _activeTxtOvl.y = _toOrigY + dy;
    markDirty();
  }
  if (_activeShapeOvl) {
    const dx = e.clientX - _soSX;
    const dy = e.clientY - _soSY;
    _activeShapeOvl.x1 = _soOX1 + dx;
    _activeShapeOvl.y1 = _soOY1 + dy;
    _activeShapeOvl.x2 = _soOX2 + dx;
    _activeShapeOvl.y2 = _soOY2 + dy;
    markDirty();
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
    markDirty();
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
  markDirty();
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
    (drawTool.value === "line" || drawTool.value === "rect")
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
  _activeShapeOvl = null;
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
    const [ord, drws, conf] = await Promise.all([
      getSalesOrder(orderId.value),
      listOrderDrawings(orderId.value),
      getOrderConfirmation(orderId.value),
    ]);
    order.value = ord;
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
    if (Array.isArray(conf?.overlayImgs))
      overlayImgs.value = conf.overlayImgs.map((i) => ({ ...i }));
    if (Array.isArray(conf?.textOverlays))
      textOverlays.value = conf.textOverlays.map((o) => ({ ...o }));
    if (Array.isArray(conf?.shapeOverlays))
      shapeOverlays.value = conf.shapeOverlays.map((o) => ({ ...o }));
    if (Array.isArray(conf?.stampOverlays))
      stampOverlays.value = conf.stampOverlays.map((o) => ({ ...o }));
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

async function generateConfirmedPdf() {
  if (pdfGenerating.value || confirmedPdfUrl.value) return;
  pdfGenerating.value = true;
  try {
    selectedBlkId.value = null;
    await nextTick();
    const el = pageRef.value;
    if (!el) throw new Error("找不到頁面元素");

    // 抓元素實際內容大小,避免右邊/底邊被切
    const w = Math.max(el.scrollWidth, el.offsetWidth, 1123);
    const h = Math.max(el.scrollHeight, el.offsetHeight, 794);
    const canvas = await html2canvas(el, {
      scale: 3,
      useCORS: true,
      allowTaint: true,
      logging: false,
      backgroundColor: "#fff",
      width: w,
      height: h,
      windowWidth: w,
      windowHeight: h,
    });

    const imgData = canvas.toDataURL("image/jpeg", 0.96);
    const pdf = new jsPDF({
      orientation: "landscape",
      unit: "mm",
      format: "a4",
      compress: true,
    });
    // 依實際長寬比放入 A4 landscape (297x210),保持比例不變形,內容不會被裁切
    const pageW = 297,
      pageH = 210;
    const drawW = w / h >= pageW / pageH ? pageW : pageH * (w / h);
    const drawH = w / h >= pageW / pageH ? pageW * (h / w) : pageH;
    const offX = (pageW - drawW) / 2;
    const offY = (pageH - drawH) / 2;
    pdf.addImage(imgData, "JPEG", offX, offY, drawW, drawH, undefined, "FAST");

    const blob = pdf.output("blob");
    const url = await uploadConfirmedPdf(orderId.value, blob);
    confirmedPdfUrl.value = url;
  } catch (e) {
    console.error("PDF封存失敗", e);
  } finally {
    pdfGenerating.value = false;
  }
}

// ── Save ────────────────────────────────────────────────────────────
async function doSave() {
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
      annotCanvas,
    });
    saveMsg.value = "✓ 已儲存";
    dirty.value = false;
    setTimeout(() => {
      saveMsg.value = "";
    }, 2000);
  } catch (e) {
    saveMsg.value = "儲存失敗";
  } finally {
    saving.value = false;
  }
}

function doPrint() {
  selectedBlkId.value = null;
  setTimeout(() => {
    const el = pageRef.value;
    if (!el) {
      window.print();
      return;
    }
    const html = el.outerHTML;
    // Production builds extract CSS into <link rel="stylesheet">, so copy both
    // inline <style> tags and linked stylesheets into the popup document.
    const inlineStyles = Array.from(document.querySelectorAll("style"))
      .map((s) => s.outerHTML)
      .join("\n");
    const linkedStyles = Array.from(
      document.querySelectorAll('link[rel="stylesheet"]'),
    )
      .map((link) => {
        const href = link.href || link.getAttribute("href") || "";
        return href
          ? `<link rel="stylesheet" href="${href}">`
          : "";
      })
      .join("\n");
    const win = window.open("", "_blank", "width=1200,height=860");
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head>
      <meta charset="utf-8">
      <title>生產確定單</title>
      ${linkedStyles}
      ${inlineStyles}
      <style>
        body { margin:0; background:#fff; }
        @page { size: A4 landscape; margin: 0; }
      </style>
    </head><body>${html}</body></html>`);
    win.document.close();
    const finalizePrint = () => {
      win.requestAnimationFrame(() => {
        win.requestAnimationFrame(() => {
          win.focus();
          win.print();
          win.close();
        });
      });
    };
    const pendingLinks = Array.from(
      win.document.querySelectorAll('link[rel="stylesheet"]'),
    );
    if (!pendingLinks.length) {
      finalizePrint();
      return;
    }
    Promise.all(
      pendingLinks.map(
        (link) =>
          new Promise((resolve) => {
            if (link.sheet) {
              resolve();
              return;
            }
            link.addEventListener("load", resolve, { once: true });
            link.addEventListener("error", resolve, { once: true });
          }),
      ),
    ).finally(finalizePrint);
  }, 80);
}

onMounted(() => {
  loadAll();
  document.addEventListener("paste", onPaste);
});
onUnmounted(() => {
  document.removeEventListener("paste", onPaste);
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
.btn-img {
  padding: 5px 12px;
  background: #059669;
  color: #fff;
  border: none;
  border-radius: 5px;
  cursor: pointer;
  font-size: 12px;
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
  font-family: "微軟正黑體", "Microsoft JhengHei", Arial, sans-serif;
  font-size: 11px;
  overflow: hidden;
  flex-shrink: 0;
}

/* ══ 頂部標題 ══ */
.top-strip {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 0 6px 4px;
  border-bottom: 2px solid #000;
  height: 24px;
  background: #d4d4d4;
}
.doc-star {
  font-size: 13px;
  font-weight: 900;
  line-height: 1.1;
  white-space: nowrap;
}
.co-info {
  font-size: 10px;
}

/* ══ 主體 ══ */
.body-row {
  display: flex;
  height: calc(794px - 24px - 16px);
}

/* ══ 左右直條 ══ */
.vert-strip {
  width: 22px;
  overflow: hidden;
  border: 1px solid #000;
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
  font-size: 13px;
  word-break: break-all;
  line-break: anywhere;
  text-align: center;
  overflow: visible;
  line-height: 1.4;
}
.vert-txt2 {
  font-size: 12px;
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
  margin-top: 4px;
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
  font-size: 8px;
  font-weight: 600;
  word-break: break-all;
  text-align: center;
  line-height: 1.2;
  color: #444;
}
.vf-val {
  font-size: 8px;
  word-break: break-all;
  text-align: center;
  line-height: 1.2;
  min-height: 28px;
  border-bottom: 1px solid #666;
  color: #000;
}

/* ══ 主內容 ══ */
.main-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  border: 1px solid #000;
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
  width: 280px;
  flex-shrink: 0;
  border-right: 1px solid #000;
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
  border-top: 1px solid #000;
  flex-shrink: 0;
  overflow: hidden;
}
/* 右側大繪圖區 */
.drawing-area {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  background: #fafafa;
}

.fields-tbl {
  width: 100%;
  border-collapse: collapse;
  flex-shrink: 0;
}
.fields-tbl td {
  border: 1px solid #aaa;
  padding: 0 4px 2px;
  height: 22px;
  vertical-align: top;
}
.lbl {
  background: #e8e8e8;
  font-weight: 600;
  width: 62px;
  white-space: nowrap;
  text-align: center;
  font-size: 11px;
}
.lbl-s {
  background: #e8e8e8;
  font-weight: 600;
  width: 24px;
  white-space: nowrap;
  text-align: center;
  font-size: 10px;
}
.val {
  font-size: 11px;
}
.val-s {
  width: 58px;
  font-size: 10px;
}
.ii {
  border: none;
  outline: none;
  width: 56px;
  font-size: 11px;
  background: transparent;
}
.ii.full {
  width: 100%;
}
.ii-vert {
  border: none;
  outline: none;
  width: 28px;
  font-size: 11px;
  background: transparent;
  writing-mode: horizontal-tb;
}
.edge-cell {
  padding: 4px 6px;
  height: 72px;
  vertical-align: middle;
}
.edge-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.edge-opt {
  display: flex;
  flex-direction: column;
  align-items: center;
  cursor: pointer;
  padding: 3px 6px;
  border-radius: 3px;
  user-select: none;
  border: 1.5px solid transparent;
}
.edge-opt.checked {
  border-color: #333;
  background: #f0f0f0;
}
.edge-check {
  display: flex;
  align-items: center;
  gap: 1px;
  line-height: 1;
  margin-bottom: 1px;
}
.edge-sym {
  font-size: 9px;
}
.edge-chk {
  font-size: 8px;
  color: #333;
}
.edge-lbl {
  font-size: 7px;
  margin-top: 2px;
}
.panel-row {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 56px;
  width: 100%;
}
.panel-opt {
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 3px;
  border: 1.5px solid transparent;
  user-select: none;
}
.panel-opt.checked {
  border-color: #333;
  background: #f0f0f0;
}

.section-head {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 600;
  width: 18px;
  flex-shrink: 0;
  border-right: 1px solid #000;
  background: #f0f0f0;
  line-height: 1.3;
  text-align: center;
  word-break: break-all;
  padding: 2px 0;
  transform: translateY(-2px);
}

.detail-tbl {
  flex: 1;
  border-collapse: collapse;
  font-size: 10px;
  width: 100%;
  table-layout: fixed;
}
.detail-tbl th,
.detail-tbl td {
  border: 1px solid #bbb;
  padding: 1px 3px 3px;
  height: 20px;
  text-align: center;
  vertical-align: top;
  line-height: 1.25;
  overflow: visible;
  white-space: nowrap;
}
.detail-tbl td:first-child {
  white-space: normal;
  overflow-wrap: anywhere;
  word-break: normal;
  text-align: left;
}
.detail-tbl th {
  background: #e8e8e8;
  font-size: 10px;
  line-height: 1.2;
}

/* ══ 安裝地點 ══ */
.install-row {
  display: flex;
  flex-direction: column;
  justify-content: center;
  border-top: 1px solid #000;
  border-bottom: 1px solid #888;
  padding: 1px 4px 2px;
  gap: 2px;
  min-height: 40px;
  font-size: 11px;
  flex-shrink: 0;
}
.install-main-row,
.install-meta-row {
  display: flex;
  align-items: center;
  gap: 3px;
  min-width: 0;
}
.install-main-row {
  display: grid;
  grid-template-columns: 62px minmax(0, 1fr);
  align-items: start;
  width: 100%;
  gap: 0;
}
.install-meta-row {
  width: 100%;
  justify-content: flex-end;
  font-size: 9px;
}
.site-val {
  display: block;
  min-width: 0;
  overflow: visible;
  white-space: normal;
  line-height: 1.15;
  overflow-wrap: break-word;
  word-break: break-word;
  font-size: 14px;
  padding-left: 3px;
}
.owner-val {
  min-width: 48px;
}
.phone-val {
  min-width: 52px;
}

/* ══ 交期說明 ══ */
.notice-row {
  padding: 1px 6px 3px;
  font-size: 10px;
  border-bottom: 1px solid #000;
  background: #fffbeb;
  height: 18px;
  display: flex;
  align-items: flex-start;
  line-height: 1.1;
  flex-shrink: 0;
  overflow: hidden;
}

/* ══ 底部 ══ */
.bottom-row {
  display: flex;
  height: 90px;
  flex-shrink: 0;
}
.notes-col {
  width: 160px;
  padding: 3px 6px;
  font-size: 10px;
  border-right: 1px solid #aaa;
  overflow: hidden;
  flex-shrink: 0;
}
.notes-col ol {
  margin: 2px 0 0 14px;
  padding: 0;
}

.calc-col {
  flex: 1;
  border-right: 1px solid #aaa;
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
  user-select: none;
}
.inst-item.checked {
  border-color: #333;
  background: #f0f0f0;
}
.inst-sym {
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
  width: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-right: 1px solid #aaa;
  font-size: 11px;
}
.price-lbl {
  font-weight: 600;
  writing-mode: vertical-rl;
  letter-spacing: 2px;
}
.price-val-col {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  border-right: 1px solid #aaa;
  padding: 2px 6px;
  overflow: hidden;
}
.price-val {
  white-space: nowrap;
  font-size: 18px;
  font-weight: 700;
  color: #c0392b;
  letter-spacing: 1px;
}
.price-grid {
  width: 100%;
  display: grid;
  grid-template-columns: 1fr 1fr;
  column-gap: 14px;
  row-gap: 0;
  align-items: start;
  padding: 2px 4px;
}
.price-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 10px;
  line-height: 1.3;
  table-layout: fixed;
}
.price-table td {
  padding: 2px 3px;
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
  width: 52%;
}
.price-table .pt-calc {
  text-align: right;
  color: #666;
  white-space: nowrap;
  width: 28%;
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
  margin-top: 4px;
  padding: 3px 6px 0 0;
  text-align: right;
  font-weight: 700;
  font-size: 13px;
  color: #c0392b;
}
.price-sum span {
  margin-left: 8px;
  font-size: 16px;
  letter-spacing: 1px;
}

.sig-col {
  width: 150px;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-top: 4px;
  margin-left: auto;
}
.sig-lbl {
  font-size: 12px;
  font-weight: 700;
}
.sig-box {
  flex: 1;
  width: 140px;
  border: 1px solid #bbb;
  margin-top: 4px;
}

/* ══ 底部傳真 ══ */
.fax-strip {
  position: absolute;
  bottom: 2px;
  right: 6px;
  font-size: 10px;
  color: #555;
  height: 18px;
  line-height: 18px;
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

/* ══ 直線/矩形疊層 ══ */
.shape-ovl {
  position: absolute;
  cursor: grab;
  user-select: none;
  z-index: 13;
}
.shape-ovl:active {
  cursor: grabbing;
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
  z-index: 1;
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
.color-picker {
  width: 30px;
  height: 26px;
  border: none;
  padding: 1px;
  border-radius: 4px;
  cursor: pointer;
  background: none;
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
