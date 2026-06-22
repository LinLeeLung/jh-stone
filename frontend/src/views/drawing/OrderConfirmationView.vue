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
        <div class="font-presets">
          <span class="font-presets-label">字體預設</span>
          <div
            v-for="slot in FONT_PRESET_SLOTS"
            :key="`font-preset-${slot}`"
            class="font-preset-item"
          >
            <button
              class="btn-draw btn-preset"
              :title="`套用設定${slot}`"
              @click="applyFontPreset(slot)"
            >
              套{{ slot }}
            </button>
            <button
              class="btn-draw btn-preset-save"
              :title="
                fontPresetSavedAt[slot]
                  ? `覆蓋設定${slot}（${fontPresetSavedAt[slot]}）`
                  : `儲存為設定${slot}`
              "
              @click="saveFontPreset(slot)"
            >
              存{{ slot }}
            </button>
          </div>
        </div>
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
        <div
          v-show="drawTool === 'line' || selectedShapeOverlay?.type === 'line'"
          class="line-arrow-btns"
        >
          <button
            v-for="opt in LINE_ARROW_OPTIONS"
            :key="opt.value"
            class="line-arrow-btn"
            :class="{ active: lineArrowStyle === opt.value }"
            :title="opt.title"
            @click="setLineArrowStyle(opt.value)"
          >
            {{ opt.label }}
          </button>
        </div>
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
        <textarea
          v-show="drawTool === 'text'"
          ref="quickTextInputRef"
          v-model="quickTextDraft"
          class="quick-text-input"
          placeholder="先輸入文字，再點位置可連續貼上"
        ></textarea>
        <div v-show="drawTool === 'text'" class="quick-text-calc">
          <label class="quick-text-calc-item">
            <span>拉</span>
            <input v-model="quickTextCalc.pull" type="number" step="0.1" />
          </label>
          <label class="quick-text-calc-item">
            <span>桶</span>
            <input
              v-model="quickTextCalc.cabinet"
              type="number"
              step="0.1"
            />
          </label>
          <label class="quick-text-calc-item">
            <span>門</span>
            <input v-model="quickTextCalc.door" type="number" step="0.1" />
          </label>
          <label class="quick-text-calc-item">
            <span>凸</span>
            <input v-model="quickTextCalc.bump" type="number" step="0.1" />
          </label>
          <label class="quick-text-calc-item total">
            <span>合計</span>
            <input :value="quickTextCalcTotalText" type="text" readonly />
          </label>
          <button
            class="btn-draw quick-text-calc-btn"
            type="button"
            @click="applyQuickTextCalc"
          >
            套用
          </button>
          <button
            class="btn-draw quick-text-calc-btn"
            type="button"
            @click="resetQuickTextCalc"
          >
            清空
          </button>
        </div>
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
        <button class="btn-img" @click="openImagePicker" title="插入圖片">
          🖼️ 插入圖片
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
        <button
          v-show="selectedBlkId !== null"
          class="btn-draw"
          @click="rotateSelectedBlock"
          title="選中的繪圖逆時針轉 90 度"
        >
          ↺ 轉 90°
        </button>
        <button
          v-show="selectedTextId !== null"
          class="btn-draw"
          @click="rotateSelectedText"
          title="選中的文字切換 0° / 90°"
        >
          ↺ 文字轉向
        </button>
        <button class="btn-print" @click="doPrint" title="直接以瀏覽器列印">
          🖨️ 列印
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
          >⏳ 準備列印PDF…</span
        >
        <template v-else-if="confirmedPdfUrl">
          <a :href="confirmedPdfUrl" target="_blank" class="btn-pdf-link"
            >📄 確定單PDF</a
          >
          <button
            class="btn-repdf"
            @click="regeneratePdf"
            title="用列印內容重新另存PDF後上傳封存"
          >
            ↺
          </button>
        </template>

        <button
          v-if="order?.status === 'confirmed' && !confirmedPdfUrl"
          class="btn-repdf"
          @click="regeneratePdf"
          title="開啟前端列印，另存PDF後再上傳封存"
        >
          🖨️ 列印存PDF
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
                      <td
                        class="lbl font-adjustable"
                        :style="fieldFontStyle('orderNoLabel', 13)"
                        title="單擊放大 1 點，雙擊縮小 1 點"
                        @click="onFieldFontClick('orderNoLabel', 13)"
                        @dblclick="onFieldFontDoubleClick('orderNoLabel', 13)"
                      >
                        訂單編號
                      </td>
                      <td
                        class="val font-adjustable"
                        colspan="3"
                        :style="fieldFontStyle('orderNo', 13)"
                        title="單擊放大 1 點，雙擊縮小 1 點"
                        @click="onFieldFontClick('orderNo', 13)"
                        @dblclick="onFieldFontDoubleClick('orderNo', 13)"
                      >
                        {{ order?.orderNo || "" }}
                      </td>
                    </tr>
                    <tr>
                      <td
                        class="lbl font-adjustable"
                        :style="fieldFontStyle('customerNameLabel', 13)"
                        title="單擊放大 1 點，雙擊縮小 1 點"
                        @click="onFieldFontClick('customerNameLabel', 13)"
                        @dblclick="
                          onFieldFontDoubleClick('customerNameLabel', 13)
                        "
                      >
                        客戶名稱
                      </td>
                      <td
                        class="val font-adjustable"
                        colspan="3"
                        :style="fieldFontStyle('customerName', 13)"
                        title="單擊放大 1 點，雙擊縮小 1 點"
                        @click="onFieldFontClick('customerName', 13)"
                        @dblclick="onFieldFontDoubleClick('customerName', 13)"
                      >
                        {{ order?.customerName || "" }}
                      </td>
                    </tr>
                    <tr>
                      <td
                        class="lbl font-adjustable"
                        :style="fieldFontStyle('customerContactLabel', 13)"
                        title="單擊放大 1 點，雙擊縮小 1 點"
                        @click="onFieldFontClick('customerContactLabel', 13)"
                        @dblclick="
                          onFieldFontDoubleClick('customerContactLabel', 13)
                        "
                      >
                        客戶端業務
                      </td>
                      <td
                        class="val font-adjustable"
                        colspan="3"
                        :style="fieldFontStyle('customerContact', 13)"
                        title="單擊放大 1 點，雙擊縮小 1 點"
                        @click="onFieldFontClick('customerContact', 13)"
                        @dblclick="
                          onFieldFontDoubleClick('customerContact', 13)
                        "
                      >
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
                      <td
                        class="lbl font-adjustable"
                        :style="fieldFontStyle('customerFaxLabel', 13)"
                        title="單擊放大 1 點，雙擊縮小 1 點"
                        @click="onFieldFontClick('customerFaxLabel', 13)"
                        @dblclick="
                          onFieldFontDoubleClick('customerFaxLabel', 13)
                        "
                      >
                        圖面傳真
                      </td>
                      <td
                        class="val font-adjustable"
                        colspan="3"
                        :style="fieldFontStyle('customerFax', 13)"
                        title="單擊放大 1 點，雙擊縮小 1 點"
                        @click="onFieldFontClick('customerFax', 13)"
                        @dblclick="onFieldFontDoubleClick('customerFax', 13)"
                      >
                        {{ customerFaxDisplay }}
                      </td>
                    </tr>
                    <tr>
                      <td
                        class="lbl font-adjustable"
                        :style="fieldFontStyle('orderRemarkLabel', 13)"
                        title="單擊放大 1 點，雙擊縮小 1 點"
                        @click="onFieldFontClick('orderRemarkLabel', 13)"
                        @dblclick="
                          onFieldFontDoubleClick('orderRemarkLabel', 13)
                        "
                      >
                        備　　註
                      </td>
                      <td
                        class="val note-val font-adjustable"
                        colspan="3"
                        :style="fieldFontStyle('orderRemark', 13)"
                        title="單擊放大 1 點，雙擊縮小 1 點"
                        @click="onFieldFontClick('orderRemark', 13)"
                        @dblclick="onFieldFontDoubleClick('orderRemark', 13)"
                      >
                        {{ orderRemarkDisplay }}
                      </td>
                    </tr>
                    <tr>
                      <td
                        class="lbl font-adjustable"
                        :style="fieldFontStyle('orderedAtLabel', 13)"
                        title="單擊放大 1 點，雙擊縮小 1 點"
                        @click="onFieldFontClick('orderedAtLabel', 13)"
                        @dblclick="onFieldFontDoubleClick('orderedAtLabel', 13)"
                      >
                        下　單　日
                      </td>
                      <td
                        class="val font-adjustable"
                        colspan="3"
                        :style="fieldFontStyle('orderedAt', 13)"
                        title="單擊放大 1 點，雙擊縮小 1 點"
                        @click="onFieldFontClick('orderedAt', 13)"
                        @dblclick="onFieldFontDoubleClick('orderedAt', 13)"
                      >
                        {{ fmtDate(order?.orderedAt) }}
                      </td>
                    </tr>
                    <tr>
                      <td
                        class="lbl font-adjustable"
                        :style="fieldFontStyle('promisedAtLabel', 13)"
                        title="單擊放大 1 點，雙擊縮小 1 點"
                        @click="onFieldFontClick('promisedAtLabel', 13)"
                        @dblclick="
                          onFieldFontDoubleClick('promisedAtLabel', 13)
                        "
                      >
                        預　交　日
                      </td>
                      <td
                        class="val font-adjustable promised-at-box"
                        colspan="3"
                        :style="fieldFontStyle('promisedAt', 13)"
                        title="單擊放大 1 點，雙擊縮小 1 點"
                        @click="onFieldFontClick('promisedAt', 13)"
                        @dblclick="onFieldFontDoubleClick('promisedAt', 13)"
                      >
                        {{ fmtDate(order?.promisedAt) }}
                      </td>
                    </tr>
                    <tr>
                      <td
                        class="lbl font-adjustable"
                        :style="fieldFontStyle('finishDateLabel', 13)"
                        title="單擊放大 1 點，雙擊縮小 1 點"
                        @click="onFieldFontClick('finishDateLabel', 13)"
                        @dblclick="
                          onFieldFontDoubleClick('finishDateLabel', 13)
                        "
                      >
                        收　尾　日
                      </td>
                      <td
                        class="val font-adjustable"
                        colspan="3"
                        :style="fieldFontStyle('finishDate', 13)"
                        title="單擊放大 1 點，雙擊縮小 1 點"
                        @click="onFieldFontClick('finishDate', 13)"
                        @dblclick="onFieldFontDoubleClick('finishDate', 13)"
                      >
                        {{ fmtDate(order?.finishingDate || order?.finishDate) }}
                      </td>
                    </tr>
                    <tr class="stone-row">
                      <td
                        class="lbl font-adjustable"
                        :style="fieldFontStyle('stoneTypeLabel', 13)"
                        title="單擊放大 1 點，雙擊縮小 1 點"
                        @click="onFieldFontClick('stoneTypeLabel', 13)"
                        @dblclick="onFieldFontDoubleClick('stoneTypeLabel', 13)"
                      >
                        {{ stoneTypeLbl }}
                      </td>
                      <td
                        class="val stone-color-cell font-adjustable"
                        colspan="3"
                        :style="
                          fieldFontStyle('stoneColor', 15, 'stoneFontSize')
                        "
                        title="單擊放大 1 點，雙擊縮小 1 點"
                        @click="
                          onFieldFontClick('stoneColor', 15, 'stoneFontSize')
                        "
                        @dblclick="
                          onFieldFontDoubleClick(
                            'stoneColor',
                            15,
                            'stoneFontSize',
                          )
                        "
                      >
                        <div v-for="(c, i) in stoneColors" :key="i">
                          {{ c }}
                        </div>
                      </td>
                    </tr>
                    <tr
                      class="edge-row"
                      :class="{ 'edge-row-collapsed': edgeRowCompact }"
                    >
                      <td
                        class="lbl edge-toggle-lbl"
                        :title="
                          cf.edgeRowExpanded
                            ? '點擊收合前沿造型列'
                            : '點擊展開前沿造型列'
                        "
                        @click="toggleEdgeRowHeight"
                      >
                        前沿造型
                        <span class="edge-toggle-caret">{{
                          cf.edgeRowExpanded ? "▾" : "▸"
                        }}</span>
                      </td>
                      <td colspan="3" class="edge-cell">
                        <div class="edge-choice-list">
                          <template v-if="visibleEdgeChoices.length">
                            <button
                              v-for="edge in visibleEdgeChoices"
                              :key="edge.value"
                              type="button"
                              class="edge-choice"
                              :class="{ active: cf.edgeType === edge.value }"
                              @click="setEdgeType(edge.value)"
                            >
                              <span class="edge-choice-shape">{{
                                edge.shape
                              }}</span>
                              <span class="edge-choice-mark"
                                >（{{
                                  cf.edgeType === edge.value ? "✓" : "　"
                                }}）</span
                              >
                              <span class="edge-choice-label">{{
                                edge.label
                              }}</span>
                            </button>
                          </template>
                          <span v-else class="edge-choice-empty">未選</span>
                        </div>
                      </td>
                    </tr>
                  </table>
                </div>
                <!-- fields-top -->

                <!-- 水槽 -->
                <div class="sub-section sink-section">
                  <div class="section-head">水槽</div>
                  <table class="detail-tbl">
                    <colgroup>
                      <col style="width: 18%" />
                      <col style="width: 30%" />
                      <col style="width: 52%" />
                    </colgroup>
                    <tbody>
                      <tr v-for="s in paddedSinks" :key="s._i">
                        <td>
                          <span
                            class="detail-cell-text font-adjustable"
                            :style="fieldFontStyle(`sink-method-${s._i}`, 14)"
                            title="單擊放大 1 點，雙擊縮小 1 點"
                            @click="onFieldFontClick(`sink-method-${s._i}`, 14)"
                            @dblclick="
                              onFieldFontDoubleClick(`sink-method-${s._i}`, 14)
                            "
                            >{{ s.method || "" }}</span
                          >
                        </td>
                        <td>
                          <span
                            class="detail-cell-text font-adjustable"
                            :style="fieldFontStyle(`sink-model-${s._i}`, 14)"
                            title="單擊放大 1 點，雙擊縮小 1 點"
                            @click="onFieldFontClick(`sink-model-${s._i}`, 14)"
                            @dblclick="
                              onFieldFontDoubleClick(`sink-model-${s._i}`, 14)
                            "
                            >{{ s.model || "" }}</span
                          >
                        </td>
                        <td>
                          <span
                            class="detail-cell-text font-adjustable"
                            :style="fieldFontStyle(`sink-size-${s._i}`, 14)"
                            title="單擊放大 1 點，雙擊縮小 1 點"
                            @click="onFieldFontClick(`sink-size-${s._i}`, 14)"
                            @dblclick="
                              onFieldFontDoubleClick(`sink-size-${s._i}`, 14)
                            "
                            >{{ sinkSizeText(s) }}</span
                          >
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
                      <col style="width: 18%" />
                      <col style="width: 30%" />
                      <col style="width: 52%" />
                    </colgroup>
                    <tbody>
                      <tr v-for="s in paddedStoves" :key="s._i">
                        <td>
                          <span
                            class="detail-cell-text font-adjustable"
                            :style="fieldFontStyle(`stove-method-${s._i}`, 14)"
                            title="單擊放大 1 點，雙擊縮小 1 點"
                            @click="
                              onFieldFontClick(`stove-method-${s._i}`, 14)
                            "
                            @dblclick="
                              onFieldFontDoubleClick(`stove-method-${s._i}`, 14)
                            "
                            >{{ s.method || "" }}</span
                          >
                        </td>
                        <td>
                          <span
                            class="detail-cell-text font-adjustable"
                            :style="fieldFontStyle(`stove-model-${s._i}`, 14)"
                            title="單擊放大 1 點，雙擊縮小 1 點"
                            @click="onFieldFontClick(`stove-model-${s._i}`, 14)"
                            @dblclick="
                              onFieldFontDoubleClick(`stove-model-${s._i}`, 14)
                            "
                            >{{ s.model || "" }}</span
                          >
                        </td>
                        <td>
                          <span
                            class="detail-cell-text font-adjustable"
                            :style="fieldFontStyle(`stove-size-${s._i}`, 14)"
                            title="單擊放大 1 點，雙擊縮小 1 點"
                            @click="onFieldFontClick(`stove-size-${s._i}`, 14)"
                            @dblclick="
                              onFieldFontDoubleClick(`stove-size-${s._i}`, 14)
                            "
                            >{{ stoveSizeText(s) }}</span
                          >
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
                      class="faucet-line font-adjustable"
                      :style="fieldFontStyle(`faucet-line-${i}`, 13)"
                      title="單擊放大 1 點，雙擊縮小 1 點"
                      @click="onFieldFontClick(`faucet-line-${i}`, 13)"
                      @dblclick="onFieldFontDoubleClick(`faucet-line-${i}`, 13)"
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
                <span
                  class="val site-val font-adjustable"
                  :style="fieldFontStyle('siteAddress', 13)"
                  title="單擊放大 1 點，雙擊縮小 1 點"
                  @click="onFieldFontClick('siteAddress', 13)"
                  @dblclick="onFieldFontDoubleClick('siteAddress', 13)"
                  >{{ order?.siteAddress || "" }}</span
                >
                <span class="lbl-s">業主</span
                ><span
                  class="val-s owner-val font-adjustable"
                  :style="fieldFontStyle('ownerName', 13)"
                  title="單擊放大 1 點，雙擊縮小 1 點"
                  @click="onFieldFontClick('ownerName', 13)"
                  @dblclick="onFieldFontDoubleClick('ownerName', 13)"
                  >{{ order?.owner?.name || "" }}</span
                >
                <span class="lbl-s">電話</span
                ><span
                  class="val-s phone-val font-adjustable"
                  :style="fieldFontStyle('ownerPhone', 13)"
                  title="單擊放大 1 點，雙擊縮小 1 點"
                  @click="onFieldFontClick('ownerPhone', 13)"
                  @dblclick="onFieldFontDoubleClick('ownerPhone', 13)"
                  >{{ order?.owner?.phone || "" }}</span
                >
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
                <div
                  class="price-lbl price-lbl--font-control"
                  title="單擊放大未稅價文字，雙擊縮小"
                  @mousedown.stop
                  @click.stop="onFieldFontClick('priceFormulaDisplay', 17)"
                  @dblclick.stop="
                    onFieldFontDoubleClick('priceFormulaDisplay', 17)
                  "
                >
                  <span>未</span>
                  <span>稅</span>
                  <span>價</span>
                </div>
              </div>
              <div class="price-val-col">
                <!-- 簡潔計價格式（像 PDF 一樣） -->
                <template v-if="true">
                  <div
                    ref="untaxedPriceEditorRef"
                    contenteditable="true"
                    class="font-adjustable confirmation-untaxed-editor"
                    :style="fieldFontStyle('priceFormulaDisplay', 17)"
                    title="可直接編輯確定單未稅價內容"
                    data-placeholder="輸入未稅價內容"
                    @input="onUntaxedPriceEditorInput"
                    @mousedown.stop
                    @click.stop
                    @dblclick.stop
                    v-text="printableUntaxedPriceText"
                  ></div>
                </template>
                <div
                  v-else-if="
                    priceFormulaDisplay && priceFormulaDisplay.mainItems.length
                  "
                  class="font-adjustable"
                  :style="[
                    fieldFontStyle('priceFormulaDisplay', 17),
                    {
                      padding: '4px',
                      color: '#333',
                      lineHeight: '1.6',
                      fontFamily: 'monospace',
                      overflow: 'visible',
                      whiteSpace: 'normal',
                      cursor: 'pointer',
                    },
                  ]"
                  title="單擊放大 1 點，雙擊縮小 1 點"
                  @click="onFieldFontClick('priceFormulaDisplay', 17)"
                  @dblclick="onFieldFontDoubleClick('priceFormulaDisplay', 17)"
                >
                  <!-- 基礎計算 -->
                  <div v-if="priceFormulaDisplay.mainItems.length">
                    <span
                      v-for="(item, idx) in priceFormulaDisplay.mainItems"
                      :key="idx"
                    >
                      <span v-if="idx > 0">+</span>{{ item.calcText }}
                    </span>
                  </div>

                  <!-- 開孔 / 工資 -->
                  <div
                    v-if="
                      priceFormulaDisplay.sinkItems.length ||
                      priceFormulaDisplay.stoveItems.length ||
                      priceFormulaDisplay.legLaborItems.length ||
                      priceFormulaDisplay.otherCutoutItems.length
                    "
                    style="
                      display: flex;
                      gap: 12px;
                      flex-wrap: wrap;
                      align-items: center;
                    "
                  >
                    <span v-if="priceFormulaDisplay.sinkItems.length">
                      下嵌{{
                        priceFormulaDisplay.sinkSubtotal.toLocaleString()
                      }}
                    </span>
                    <span v-if="priceFormulaDisplay.stoveItems.length">
                      上掛{{
                        priceFormulaDisplay.stoveSubtotal.toLocaleString()
                      }}
                    </span>
                    <span
                      v-for="(item, idx) in priceFormulaDisplay.legLaborItems"
                      :key="`leg-labor-${idx}`"
                    >
                      {{ item.displayText }}
                    </span>
                    <span v-if="priceFormulaDisplay.otherCutoutItems.length">
                      其他{{
                        priceFormulaDisplay.otherCutoutSubtotal.toLocaleString()
                      }}
                    </span>
                  </div>

                  <!-- 合計 -->
                  <div
                    style="
                      display: flex;
                      justify-content: flex-end;
                      align-items: center;
                    "
                  >
                    <div style="font-weight: 700; color: #d9534f">
                      合計{{ priceFormulaDisplay.subtotal.toLocaleString() }}
                    </div>
                  </div>
                </div>
                <!-- 舊格式（計價明細表格） -->
                <div
                  v-else-if="priceBreakdown.lines.length"
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
                        <td
                          class="pt-calc font-adjustable"
                          :style="fieldFontStyle('priceCalc', 11)"
                          title="單擊放大 1 點，雙擊縮小 1 點"
                          @click="onFieldFontClick('priceCalc', 11)"
                          @dblclick="onFieldFontDoubleClick('priceCalc', 11)"
                        >
                          {{ ln.calc }}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                  <div
                    class="price-sum font-adjustable"
                    :style="fieldFontStyle('priceSum', 13)"
                    title="單擊放大 1 點，雙擊縮小 1 點"
                    @click="onFieldFontClick('priceSum', 13)"
                    @dblclick="onFieldFontDoubleClick('priceSum', 13)"
                  >
                    合計 <span>{{ priceBreakdown.total }}</span>
                  </div>
                </div>
                <!-- 純數字顯示 -->
                <span v-else class="price-val">{{ untaxedPriceDisplay }}</span>
              </div>
              <div class="sig-col">
                <div class="sig-box">
                  <div class="sig-hand">👉</div>
                  <div class="sig-pencil">✍️</div>
                </div>
              </div>
            </div>
          </div>
          <!-- main-area -->

          <!-- 右側直條 -->
          <div class="elevator-badge">
            <span class="elevator-lbl">電梯</span
            ><input
              v-model="cf.elevator"
              type="number"
              max="999"
              class="elevator-input"
              @change="markDirty"
            /><span class="elevator-print-value">{{ cf.elevator }}</span
            ><span class="elevator-suffix">-5</span>
          </div>
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
            <div class="vert-fields">
              <div class="vf-row">
                <span class="vf-lbl">列印</span
                ><span
                  class="vf-val vf-val-plain font-adjustable"
                  :style="fieldFontStyle('printedBy', 13)"
                  title="單擊放大 1 點，雙擊縮小 1 點"
                  @click="onFieldFontClick('printedBy', 13)"
                  @dblclick="onFieldFontDoubleClick('printedBy', 13)"
                  >{{ printedByName || "" }}</span
                >
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
            transform: ovl.rotation ? `rotate(${ovl.rotation}deg)` : 'none',
            transformOrigin: 'center center',
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
            <defs v-if="ovl.type === 'measure' || ovl.type === 'line'">
              <marker
                :id="`${ovl.type}-arrow-start-${ovl.id}`"
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
                :id="`${ovl.type}-arrow-end-${ovl.id}`"
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
                ovl.type === 'measure' || hasLineArrowStart(ovl)
                  ? `url(#${ovl.type}-arrow-start-${ovl.id})`
                  : null
              "
              :marker-end="
                ovl.type === 'measure' || hasLineArrowEnd(ovl)
                  ? `url(#${ovl.type}-arrow-end-${ovl.id})`
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
              transform: `rotate(${blk.rotation || 0}deg)`,
              transformOrigin: 'center center',
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
  downloadConfirmedPdfComparison,
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
const stoveModelSizeByNumber = ref(new Map());

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

function lineItemsSubtotal(orderData) {
  const items = Array.isArray(orderData?.lineItems) ? orderData.lineItems : [];
  if (!items.length) return null;
  const subtotal = items.reduce((sum, item) => {
    const amount = Number(item?.amount);
    if (Number.isFinite(amount)) return sum + amount;
    const qty = Number(item?.qty) || 0;
    const unitPrice = Number(item?.unitPrice) || 0;
    return sum + Math.round(qty * unitPrice);
  }, 0);
  return subtotal > 0 ? subtotal : null;
}

function untaxedSubtotalValue(orderData) {
  if (!orderData) return 0;
  const lineSubtotal = lineItemsSubtotal(orderData);
  if (lineSubtotal != null) return lineSubtotal;
  const subtotal = Number(orderData.subtotal);
  if (Number.isFinite(subtotal) && subtotal > 0) return subtotal;
  const total = Number(orderData.total);
  if (Number.isFinite(total) && total > 0) return total;
  const grandTotal = Number(orderData.grandTotal);
  return Number.isFinite(grandTotal) && grandTotal > 0 ? grandTotal : 0;
}

// 從描述中抽出「第一組完整括號」內的計算式
// 例：L型#1（270+240-30(轉角)=480cm） 鈦鋼石...(12mm)
function extractPricingFormula(s) {
  const text = String(s || "");
  const open = text.search(/[（(]/);
  if (open < 0) return "";
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === "(" || ch === "（") depth += 1;
    if (ch === ")" || ch === "）") {
      depth -= 1;
      if (depth === 0) return text.slice(open + 1, i).trim();
    }
  }
  return "";
}

function normalizeFormulaText(value) {
  const normalized = String(value || "")
    .replace(/cm\s*$/i, "")
    .replace(/乘以|乘/g, "×")
    .replace(/[xX*＊]/g, "×")
    .replace(/[÷／]/g, "/")
    .replace(/\s+/g, "")
    .trim();
  return compactIslandBodyFormula(normalized);
}

function compactIslandBodyFormula(value) {
  return String(value || "").replace(
    /^((?:\d+(?:\.\d+)?\+){2,}\d+(?:\.\d+)?)(\+\d+(?:\.\d+)?×\(\()/,
    (_match, bodyExpr, legExprStart) => {
      const bodyTotal = bodyExpr
        .split("+")
        .reduce((sum, part) => sum + (Number(part) || 0), 0);
      return `${formatQty(bodyTotal)}${legExprStart}`;
    },
  );
}

function formatQty(value) {
  const n = Number(value) || 0;
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

function formatMainPriceCalc(item) {
  const qty = Number(item?.qty) || 0;
  const unitPrice = Number(item?.unitPrice) || 0;
  const amount = Number(item?.amount) || Math.round(qty * unitPrice);
  const formula = normalizeFormulaText(
    extractPricingFormula(item?.description),
  );
  const qtyText = formatQty(qty);
  const base = formula ? `(${formula})` : qtyText;
  return `${base}×${unitPrice}=${amount.toLocaleString()}`;
}

function formatUntaxedFormulaLine(item) {
  const formula = normalizeFormulaText(
    extractPricingFormula(item?.description),
  );
  const qtyText = formatQty(item?.qty);
  if (!formula) return `${qtyText}(公分)`;
  return formula.replace(/=\s*([\d.]+)$/, "=$1(公分)");
}

function formatUntaxedAmountLine(item) {
  const qty = Number(item?.qty) || 0;
  const unitPrice = Number(item?.unitPrice) || 0;
  const amount = Number(item?.amount) || Math.round(qty * unitPrice);
  return `@${unitPrice.toLocaleString()}×${formatQty(qty)}=${amount.toLocaleString()}`;
}

function formatUntaxedCutoutPart(label, items, subtotal) {
  if (!Array.isArray(items) || !items.length) return "";
  const unitPrices = new Set(
    items
      .map((item) => Number(item?.unitPrice) || 0)
      .filter((price) => price > 0),
  );
  const totalQty = items.reduce(
    (sum, item) => sum + (Number(item?.qty) || 0),
    0,
  );
  const amount = Number(subtotal) || 0;
  if (unitPrices.size === 1) {
    const unitPrice = [...unitPrices][0];
    const qtyText = formatQty(totalQty || 1);
    const needsQty = Math.abs(totalQty - 1) > 0.0001;
    const needsAmount =
      needsQty || Math.round(unitPrice) !== Math.round(amount);
    return `${label}@${unitPrice.toLocaleString()}${needsQty ? `×${qtyText}` : ""}${needsAmount ? `=${amount.toLocaleString()}` : ""}`;
  }
  return `${label}${amount.toLocaleString()}`;
}

function formatLegLaborDisplay(item) {
  const desc = String(item?.description || item?.name || "");
  const unitPrice = Number(item?.unitPrice) || 0;
  const qty = Number(item?.qty) || 0;
  const amount = Number(item?.amount) || Math.round(qty * unitPrice);
  const priceText = unitPrice
    ? unitPrice.toLocaleString()
    : amount.toLocaleString();
  const isK1 = /K1|卡榫/.test(desc);
  const isH2 = /H2/.test(desc);
  const isH1 = /H1/.test(desc);
  const label = isK1 ? "K1卡榫接" : isH2 ? "H2平接" : isH1 ? "H1平接" : "平接";
  const qtyText = qty > 1 ? `×${formatQty(qty)}` : "";
  const amountText = qty > 1 ? `=${amount.toLocaleString()}` : "";
  return `${label}@${priceText}${qtyText}${amountText}`;
}

function normalizeLegMethodText(value) {
  const text = String(value || "")
    .replace(/H2H2平接/g, "H2平接")
    .replace(/H1H1平接/g, "H1平接")
    .replace(/K1K1卡榫接/g, "K1卡榫接")
    .replace(/K1K1卡榫/g, "K1卡榫");
  return text
    .split("\n")
    .map((line) =>
      line
        .replace(
          /(H[12]平接|K1卡榫接?)@\s*(\d{1,3}(?:,\d{3})*|\d+)(?:×[\d.]+)?(?:=[\d,]+)?/g,
          (match, label, priceText) => {
            const price = Number(String(priceText || "").replace(/,/g, ""));
            const isValidLegPrice =
              (/^H[12]/.test(label) && price === 6000) ||
              (/^K1/.test(label) && price === 2000);
            return isValidLegPrice ? match : "";
          },
        )
        .replace(/[ \t]{3,}/g, "  ")
        .trimEnd(),
    )
    .join("\n");
}

// 未稅價顯示：有 lineItems 時優先取明細小計，避免 subtotal/total 舊值殘留
const untaxedPriceDisplay = computed(() => {
  const o = order.value;
  if (!o) return "";
  const n = untaxedSubtotalValue(o);
  return n > 0 ? n.toLocaleString() : "";
});

// 計算公式顯示：小計 + 稅額 = 含稅總計
const priceFormulaDisplay = computed(() => {
  const o = order.value;
  if (!o) return null;

  const subtotal = untaxedSubtotalValue(o);

  // 分類項目
  const lineItems = Array.isArray(o.lineItems) ? o.lineItems : [];
  const mainItems = lineItems
    .filter((r) => String(r.unit || "").trim() === "cm")
    .map((r) => ({
      ...r,
      calcText: formatMainPriceCalc(r),
    }));
  const sinkItems = lineItems.filter((r) =>
    /水槽/.test(String(r.description || "")),
  );
  const stoveItems = lineItems.filter((r) =>
    /(火爐|爐|爐子|爐台|爐口|爐頭|爐位|瓦斯爐|瓦斯灶|電陶爐|電磁爐|感應爐|IH)/.test(
      String(r.description || ""),
    ),
  );
  const isLegLaborItem = (row) =>
    /(側腳|側落腳|工資|卡榫)/.test(String(row.description || ""));
  const legLaborItems = lineItems.filter(isLegLaborItem).map((r) => ({
    ...r,
    displayText: formatLegLaborDisplay(r),
  }));
  const otherCutoutItems = lineItems.filter(
    (r) =>
      String(r.unit || "").trim() !== "cm" &&
      !sinkItems.includes(r) &&
      !stoveItems.includes(r) &&
      !isLegLaborItem(r),
  );

  const mainSubtotal = mainItems.reduce(
    (s, r) => s + (Number(r.amount) || 0),
    0,
  );
  const sinkSubtotal = sinkItems.reduce(
    (s, r) => s + (Number(r.amount) || 0),
    0,
  );
  const stoveSubtotal = stoveItems.reduce(
    (s, r) => s + (Number(r.amount) || 0),
    0,
  );
  const legLaborSubtotal = legLaborItems.reduce(
    (s, r) => s + (Number(r.amount) || 0),
    0,
  );
  const otherCutoutSubtotal = otherCutoutItems.reduce(
    (s, r) => s + (Number(r.amount) || 0),
    0,
  );

  const taxRate = Number(o.taxRate) || 0.05;
  const taxAmount = Math.round(subtotal * taxRate);
  const grandTotal = subtotal + taxAmount;

  return {
    mainItems,
    sinkItems,
    stoveItems,
    legLaborItems,
    otherCutoutItems,
    mainSubtotal,
    sinkSubtotal,
    stoveSubtotal,
    legLaborSubtotal,
    otherCutoutSubtotal,
    subtotal,
    taxRate,
    taxAmount,
    grandTotal,
  };
});

const defaultUntaxedPriceText = computed(() => {
  const display = priceFormulaDisplay.value;
  if (display?.mainItems?.length) {
    const leftLines = display.mainItems.map((item, index) => {
      const prefix = index > 0 ? "+" : "";
      return `${prefix}${formatUntaxedFormulaLine(item)}`;
    });
    const rightLines = display.mainItems.map((item) =>
      formatUntaxedAmountLine(item),
    );
    const formulaWidth = Math.max(...leftLines.map((line) => line.length), 0);
    const lines = leftLines.map((line, index) => {
      const separator = "  ";
      return `${line.padEnd(formulaWidth + separator.length, " ")}${rightLines[index] || ""}`.trimEnd();
    });
    const cutoutParts = [];
    if (display.sinkItems.length) {
      cutoutParts.push(
        formatUntaxedCutoutPart(
          "下嵌",
          display.sinkItems,
          display.sinkSubtotal,
        ),
      );
    }
    if (display.stoveItems.length) {
      cutoutParts.push(
        formatUntaxedCutoutPart(
          "上掛",
          display.stoveItems,
          display.stoveSubtotal,
        ),
      );
    }
    if (display.legLaborItems.length) {
      cutoutParts.push(
        display.legLaborItems.map((item) => item.displayText).join("  "),
      );
    }
    if (display.otherCutoutItems.length) {
      cutoutParts.push(
        formatUntaxedCutoutPart(
          "其他",
          display.otherCutoutItems,
          display.otherCutoutSubtotal,
        ),
      );
    }
    if (cutoutParts.filter(Boolean).length)
      lines.push(cutoutParts.filter(Boolean).join("  "));
    lines.push(`合計${display.subtotal.toLocaleString()}`);
    return normalizeLegMethodText(lines.join("\n"));
  }
  const fallback = untaxedPriceDisplay.value;
  return normalizeLegMethodText(fallback ? `合計${fallback}` : "");
});

function migrateSavedUntaxedPriceText(savedText) {
  const text = String(savedText || "");
  const display = priceFormulaDisplay.value;
  if (!text.trim()) return defaultUntaxedPriceText.value;
  if (!display?.legLaborItems?.length) return normalizeLegMethodText(text);

  let nextText = text;
  const legText = display.legLaborItems
    .map((item) => item.displayText)
    .filter(Boolean)
    .join("  ");

  for (const item of display.legLaborItems) {
    const unitPrice = Number(item?.unitPrice) || 0;
    if (!unitPrice || !item.displayText) continue;
    const priceText = unitPrice.toLocaleString();
    nextText = nextText.replace(`平接@${priceText}`, item.displayText);
    nextText = nextText.replace(`平接@${unitPrice}`, item.displayText);
  }

  if (legText && /平接@/.test(nextText) && !nextText.includes(legText)) {
    nextText = nextText.replace(
      /平接@\d{1,3}(?:,\d{3})*(?:×[\d.]+)?(?:=[\d,]+)?/g,
      legText,
    );
  }
  return normalizeLegMethodText(nextText);
}

// 計價明細：只保留數字的計算過程與結果
// 按 (description-without-dims + unitPrice + unit) 聚合，避免同類項目重複列印
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
      .replace(/\s*[（(].*[）)]\s*$/g, "")
      .replace(/\s+\d+(?:\.\d+)?[x×]\d+(?:\.\d+)?\s*cm?$/i, "")
      .replace(/\s+\d+(?:\.\d+)?\s*cm$/i, "")
      .trim();
  // 去掉尾部石材品牌色號（如 ABK MN139D12普爾比斯象牙白）
  const stripStone = (s) =>
    String(s || "")
      .replace(/\s+[A-Z]{2,}[\w\s\u4e00-\u9fff\u3000-\u303f]*$/u, "")
      .trim();

  // 僅保留算式中的數字與運算符號，移除中文與其他說明文字
  const toNumericFormula = (value) => {
    const raw = String(value || "")
      .replace(/[（]/g, "(")
      .replace(/[）]/g, ")")
      .replace(/乘以|乘/g, "×")
      .replace(/除以|除/g, "/")
      .replace(/加/g, "+")
      .replace(/減|扣/g, "-")
      .replace(/[－–—]/g, "-")
      .replace(/[xX*＊]/g, "×")
      .replace(/[÷／]/g, "/");
    let cleaned = raw
      .replace(/[^0-9.,+\-\/()%×=\s]/g, " ")
      .replace(/\(\s*\)/g, " ")
      .replace(/\s*([+\-×/=()])\s*/g, "$1")
      .replace(/\s+/g, " ")
      .trim();

    // 括號內若為以空白分隔的數字（例如 480 10 12），視為連續扣減
    cleaned = cleaned.replace(
      /\((\d+(?:\.\d+)?(?:\s+\d+(?:\.\d+)?){1,})\)/g,
      (_m, group) => {
        const nums = String(group).trim().split(/\s+/).filter(Boolean);
        return `(${nums.join("-")})`;
      },
    );

    // 註記括號（例如 -10(淺深20/2)）不視為乘法，這裡不自動補隱含乘號

    // 移除不成對括號，避免輸出難懂的殘缺算式
    let openCount = 0;
    let balanced = "";
    for (const ch of cleaned) {
      if (ch === "(") {
        openCount += 1;
        balanced += ch;
      } else if (ch === ")") {
        if (openCount > 0) {
          openCount -= 1;
          balanced += ch;
        }
      } else {
        balanced += ch;
      }
    }
    if (openCount > 0) {
      for (let i = balanced.length - 1; i >= 0 && openCount > 0; i -= 1) {
        if (balanced[i] === "(") {
          balanced = balanced.slice(0, i) + balanced.slice(i + 1);
          openCount -= 1;
        }
      }
    }

    cleaned = balanced
      .replace(/\(\s*\)/g, " ")
      .replace(/^[+\-×/=]+/, "")
      .replace(/[+\-×/=]+$/, "")
      .replace(/([+\-×/=]){2,}/g, "$1")
      .replace(/\s*([+\-×/=])\s*/g, " $1 ")
      .replace(/\(\s+/g, "(")
      .replace(/\s+\)/g, ")")
      .replace(/\s+/g, " ")
      .trim();

    return cleaned;
  };

  // 算式可讀性檢查：避免出現「4801012」這類缺少運算符的連續數字
  const isReadableFormula = (expr) => {
    const text = String(expr || "").trim();
    if (!text) return false;
    if (!/[+\-×/=]/.test(text)) return false;
    // 連續數字中間僅有空白（沒有運算符）視為不可讀
    if (/\d\s+\d/.test(text)) return false;
    // 移除運算符和括號後不應殘留異常片段
    const residue = text.replace(/[0-9.,+\-×/=()\s]/g, "");
    return residue.length === 0;
  };

  const groups = new Map();
  let total = 0;
  for (const li of o.lineItems) {
    const qty = Number(li.qty) || 0;
    const up = Number(li.unitPrice) || 0;
    const amt = Number(li.amount) || Math.round(qty * up);
    if (!qty && !up && !amt) continue;
    const name = normName(li.description) || li.priceKey || "項目";
    const displayName = stripStone(name) || name;
    const unit = li.unit || "";
    const key = `${displayName}__${up}__${unit}`;
    const formula = extractPricingFormula(li.description);
    const g = groups.get(key) || {
      name: displayName,
      unit,
      unitPrice: up,
      qty: 0,
      amount: 0,
      formula: "",
    };
    if (formula) {
      if (!g.formula) g.formula = formula;
      else if (!g.formula.includes(formula)) g.formula += ` / ${formula}`;
    }
    g.qty += qty;
    g.amount += amt;
    groups.set(key, g);
    total += amt;
  }

  const lines = [...groups.values()].map((g) => {
    const qtyStr = Number.isInteger(g.qty)
      ? g.qty
      : Math.round(g.qty * 100) / 100;
    const formulaExpr = toNumericFormula(g.formula);
    const hasProcessFormula = isReadableFormula(formulaExpr);
    const processExpr = hasProcessFormula
      ? formulaExpr.replace(/\s+/g, "")
      : "";
    const unitEq = g.unitPrice
      ? `@${g.unitPrice}*${qtyStr}=${Math.round(Number(g.amount) || 0)}`
      : "";
    const calc =
      processExpr && unitEq
        ? `${processExpr}, ${unitEq}`
        : unitEq || processExpr;
    return {
      calc,
    };
  });

  const columnCount = 4;
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
const exportRenderingActive = ref(false);
const drawingBlocks = ref([]);
const saving = ref(false);
const saveMsg = ref("");
const untaxedPriceText = ref("");
const printableUntaxedPriceText = computed(() => {
  const savedText = String(untaxedPriceText.value || "").trim();
  return savedText || defaultUntaxedPriceText.value;
});
const untaxedPriceEditorRef = ref(null);
function onUntaxedPriceEditorInput(event) {
  const text = String(event?.currentTarget?.innerText || "").replace(
    /\u00a0/g,
    " ",
  );
  untaxedPriceText.value = text;
  markDirty();
}
const selectedBlkId = ref(null);
const dirty = ref(false);
let dirtyRevision = 0;
let savedRevision = 0;
let savePromise = null;
const CUSTOMER_EDGE_TYPES = new Set(["round", "bevel", "dull"]);

const pageRef = ref(null);
const drawingPlaceholderRef = ref(null);

// 確認單可編輯欄位
const cf = reactive({
  elevator: "",
  faxNo: "",
  edgeType: "sharp",
  edgeRowExpanded: true,
  cabinetReady: "", // '' | 'yes' | 'no'
  actualDelivery: "",
  price: "",
  panelType: "", // '' | 'a' | 'b' | 'c' | 'd' | 'e'
  stoneFontSize: 15,
  fieldFontSizes: {},
});

const FIELD_FONT_SIZE_MIN = 9;
const FIELD_FONT_SIZE_MAX = 24;
const FONT_PRESET_SLOTS = [1, 2, 3];
const fontPresetUserUid = ref("");
const fontPresetSavedAt = reactive({ 1: "", 2: "", 3: "" });
const fieldFontClickTimers = new Map();
const EDGE_CHOICES = [
  { value: "bevel", shape: "△", label: "3mm斜角" },
  { value: "round", shape: "○", label: "3mm圓角" },
  { value: "dull", shape: "□", label: "1mm磨不利" },
];

const cabinetReadyVertText = computed(() => {
  const yesMark = cf.cabinetReady === "yes" ? "☑" : "□";
  const noMark = cf.cabinetReady === "no" ? "☑" : "□";
  return splitVert(`桶身${yesMark}是否${noMark}裝`);
});

const edgeRowCompact = computed(
  () => exportRenderingActive.value || !cf.edgeRowExpanded,
);

function normalizePreferredEdgeType(value) {
  const normalized = String(value || "").trim();
  return CUSTOMER_EDGE_TYPES.has(normalized) ? normalized : "";
}

function toggleEdgeRowHeight() {
  cf.edgeRowExpanded = !cf.edgeRowExpanded;
  markDirty();
}

function setEdgeType(value) {
  if (cf.edgeType === value) return;
  cf.edgeType = value;
  markDirty();
}

// ── Computed ────────────────────────────────────────────────────────
const visibleEdgeChoices = computed(() => {
  if (!edgeRowCompact.value) return EDGE_CHOICES;
  return EDGE_CHOICES.filter((edge) => edge.value === cf.edgeType);
});

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

function normalizeModelNumberKey(value) {
  return String(value || "").replace(/\D+/g, "");
}

function buildModelSizeLookup(models = []) {
  const byId = new Map();
  const byName = new Map();
  const byNumber = new Map();
  for (const item of models || []) {
    const size = String(item?.sizeText || item?.rawText || "").trim();
    if (!size) continue;
    const id = String(item?.id || "").trim();
    if (id) byId.set(id, size);

    const model = String(item?.model || "").trim();
    const brand = String(item?.brand || "").trim();
    const modelKey = normalizeModelKey(model);
    if (modelKey) byName.set(modelKey, size);
    const numberKey = normalizeModelNumberKey(model);
    if (numberKey) byNumber.set(numberKey, size);
    const brandModelKey = normalizeModelKey(
      [brand, model].filter(Boolean).join(" "),
    );
    if (brandModelKey) byName.set(brandModelKey, size);
  }
  return { byId, byName, byNumber };
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
  const byNumber = kind === "stove" ? stoveModelSizeByNumber.value : null;
  const modelId = String(item?.modelId || item?.modelCode || "").trim();
  if (modelId && byId.has(modelId)) return byId.get(modelId) || "";

  const model = String(item?.model || "").trim();
  const brand = String(item?.brand || "").trim();
  const brandModel = [brand, model].filter(Boolean).join(" ");
  const match =
    byName.get(normalizeModelKey(model)) ||
    byName.get(normalizeModelKey(brandModel));
  if (match) return match;

  const numberKey = normalizeModelNumberKey(model || modelId);
  if (byNumber && numberKey && byNumber.has(numberKey)) {
    return byNumber.get(numberKey) || "";
  }

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
  let d = null;
  if (val?.toDate) {
    d = val.toDate();
  } else {
    const n = Number(val);
    if (!Number.isNaN(n) && n > 0 && n < 100000) {
      // Excel serial date
      d = new Date((n - 25569) * 86400 * 1000);
    } else if (!Number.isNaN(n) && n >= 1000000000000) {
      // Unix epoch milliseconds
      d = new Date(n);
    } else {
      // Date string with relaxed separators, keep only date part
      d = new Date(String(val).slice(0, 10).replace(/[./]/g, "-"));
    }
  }
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
const CONFIRMED_PDF_MAX_BYTES = 3 * 1024 * 1024;
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

function drawMeasurementArrowheads(ctx, start, end, color, width) {
  drawLineArrowheads(ctx, start, end, color, width, "both");
}
function getLineEndpointDirection(start, end) {
  if (Number(start.x) < Number(end.x)) return "start-left";
  if (Number(start.x) > Number(end.x)) return "end-left";
  if (Number(start.y) <= Number(end.y)) return "start-left";
  return "end-left";
}
function shouldDrawArrowAtStart(start, end, style) {
  if (style === "both") return true;
  if (style !== "left" && style !== "right") return false;
  const direction = getLineEndpointDirection(start, end);
  return style === "left"
    ? direction === "start-left"
    : direction === "end-left";
}
function shouldDrawArrowAtEnd(start, end, style) {
  if (style === "both") return true;
  if (style !== "left" && style !== "right") return false;
  const direction = getLineEndpointDirection(start, end);
  return style === "left"
    ? direction === "end-left"
    : direction === "start-left";
}
function hasLineArrowStart(shape) {
  if (!shape || shape.type !== "line") return false;
  return shouldDrawArrowAtStart(
    { x: Number(shape.x1 || 0), y: Number(shape.y1 || 0) },
    { x: Number(shape.x2 || 0), y: Number(shape.y2 || 0) },
    shape.arrowStyle || "none",
  );
}
function hasLineArrowEnd(shape) {
  if (!shape || shape.type !== "line") return false;
  return shouldDrawArrowAtEnd(
    { x: Number(shape.x1 || 0), y: Number(shape.y1 || 0) },
    { x: Number(shape.x2 || 0), y: Number(shape.y2 || 0) },
    shape.arrowStyle || "none",
  );
}
function drawLineArrowheads(ctx, start, end, color, width, style = "none") {
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
  if (shouldDrawArrowAtStart(start, end, style)) {
    drawHead(start.x, start.y, -ux, -uy);
  }
  if (shouldDrawArrowAtEnd(start, end, style)) {
    drawHead(end.x, end.y, ux, uy);
  }
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
function rotateSelectedBlock() {
  const blk = drawingBlocks.value.find(
    (b) => b.drawingId === selectedBlkId.value,
  );
  if (!blk) return;
  blk.rotation = ((blk.rotation || 0) - 90) % 360;
  markAnnotationDirty();
  recordAnnotationHistory();
}
function rotateSelectedText() {
  const ovl = textOverlays.value.find((o) => o.id === selectedTextId.value);
  if (!ovl) return;
  ovl.rotation = ovl.rotation ? 0 : 90;
  markAnnotationDirty();
  recordAnnotationHistory();
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
  dirtyRevision += 1;
  dirty.value = true;
}
function markAnnotationDirty() {
  dirtyRevision += 1;
  dirty.value = true;
  _historyNeedsRecord = true;
}
function getFieldFontSize(key, fallback = 13, legacyKey = "") {
  const stored = Number(cf.fieldFontSizes?.[key]);
  const legacy = legacyKey ? Number(cf[legacyKey]) : NaN;
  const size = Number.isFinite(stored)
    ? stored
    : Number.isFinite(legacy)
      ? legacy
      : fallback;
  return Math.min(FIELD_FONT_SIZE_MAX, Math.max(FIELD_FONT_SIZE_MIN, size));
}
function fieldFontStyle(key, fallback = 13, legacyKey = "") {
  return {
    fontSize: `${getFieldFontSize(key, fallback, legacyKey)}px`,
  };
}
function adjustFieldFontSize(key, fallback = 13, delta = 1, legacyKey = "") {
  const current = getFieldFontSize(key, fallback, legacyKey);
  const next = Math.min(
    FIELD_FONT_SIZE_MAX,
    Math.max(FIELD_FONT_SIZE_MIN, current + delta),
  );
  if (next === current) return;
  const sizes = {
    ...(cf.fieldFontSizes && typeof cf.fieldFontSizes === "object"
      ? cf.fieldFontSizes
      : {}),
    [key]: next,
  };
  cf.fieldFontSizes = sizes;
  if (legacyKey) cf[legacyKey] = next;
  markDirty();
}
function onFieldFontClick(key, fallback = 13, legacyKey = "") {
  const timer = fieldFontClickTimers.get(key);
  if (timer) clearTimeout(timer);
  const nextTimer = window.setTimeout(() => {
    fieldFontClickTimers.delete(key);
    adjustFieldFontSize(key, fallback, 1, legacyKey);
  }, 220);
  fieldFontClickTimers.set(key, nextTimer);
}
function onFieldFontDoubleClick(key, fallback = 13, legacyKey = "") {
  const timer = fieldFontClickTimers.get(key);
  if (timer) {
    clearTimeout(timer);
    fieldFontClickTimers.delete(key);
  }
  adjustFieldFontSize(key, fallback, -1, legacyKey);
}

function getFontPresetStorageKey(slot) {
  const uid =
    String(
      fontPresetUserUid.value || auth.currentUser?.uid || "guest",
    ).trim() || "guest";
  return `order-confirmation-font-preset-${uid}-${slot}`;
}

function clampFieldFontSize(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.min(FIELD_FONT_SIZE_MAX, Math.max(FIELD_FONT_SIZE_MIN, n));
}

function sanitizeFieldFontSizes(source) {
  if (!source || typeof source !== "object") return {};
  const out = {};
  for (const [key, value] of Object.entries(source)) {
    const size = clampFieldFontSize(value);
    if (size !== null) out[key] = size;
  }
  return out;
}

function formatPresetSavedAt(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${y}/${m}/${day} ${hh}:${mm}`;
}

function readFontPreset(slot) {
  try {
    const raw = localStorage.getItem(getFontPresetStorageKey(slot));
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function refreshFontPresetStatus() {
  for (const slot of FONT_PRESET_SLOTS) {
    const preset = readFontPreset(slot);
    fontPresetSavedAt[slot] = formatPresetSavedAt(preset?.savedAt || "");
  }
}

function saveFontPreset(slot) {
  try {
    const payload = {
      savedAt: new Date().toISOString(),
      stoneFontSize: clampFieldFontSize(cf.stoneFontSize) || 15,
      fieldFontSizes: sanitizeFieldFontSizes(cf.fieldFontSizes),
    };
    localStorage.setItem(
      getFontPresetStorageKey(slot),
      JSON.stringify(payload),
    );
    refreshFontPresetStatus();
    setTransientMsg(`✅ 已儲存字體設定 ${slot}`);
  } catch {
    setTransientMsg("❌ 儲存字體設定失敗");
  }
}

function applyFontPreset(slot) {
  const preset = readFontPreset(slot);
  if (!preset) {
    setTransientMsg(`⚠ 設定 ${slot} 尚未儲存`);
    return;
  }
  cf.fieldFontSizes = sanitizeFieldFontSizes(preset.fieldFontSizes);
  const stoneSize = clampFieldFontSize(preset.stoneFontSize);
  if (stoneSize !== null) cf.stoneFontSize = stoneSize;
  markDirty();
  setTransientMsg(`✅ 已套用字體設定 ${slot}`);
}

function captureAnnotationSnapshot() {
  return {
    drawingBlocks: drawingBlocks.value.map((blk) => ({
      drawingId: blk.drawingId,
      x: blk.x,
      y: blk.y,
      scale: blk.scale,
      rotation: Number(blk.rotation || 0),
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
    blk.rotation = Number(saved.rotation || 0);
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
  markDirty();
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
const quickTextCalc = reactive({
  pull: "",
  cabinet: "",
  door: "",
  bump: "",
});
const quickTextInputRef = ref(null);
const rectStyle = ref("outline");
const lineArrowStyle = ref("none");
const LINE_ARROW_OPTIONS = [
  { value: "none", label: "—", title: "直線無箭頭" },
  { value: "left", label: "←", title: "左箭頭" },
  { value: "right", label: "→", title: "右箭頭" },
  { value: "both", label: "↔", title: "雙箭頭" },
];
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
function parseQuickTextCalcNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}
function formatQuickTextCalcNumber(value) {
  const rounded = Math.round((Number(value) || 0) * 1000) / 1000;
  if (Number.isInteger(rounded)) return String(rounded);
  return String(rounded).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}
const quickTextCalcTotal = computed(() => {
  return (
    parseQuickTextCalcNumber(quickTextCalc.pull) +
    parseQuickTextCalcNumber(quickTextCalc.cabinet) +
    parseQuickTextCalcNumber(quickTextCalc.door) +
    parseQuickTextCalcNumber(quickTextCalc.bump)
  );
});
const quickTextCalcTotalText = computed(() =>
  formatQuickTextCalcNumber(quickTextCalcTotal.value),
);
function applyQuickTextCalc() {
  const lines = [
    `拉${formatQuickTextCalcNumber(parseQuickTextCalcNumber(quickTextCalc.pull))}`,
    `桶${formatQuickTextCalcNumber(parseQuickTextCalcNumber(quickTextCalc.cabinet))}`,
    `門${formatQuickTextCalcNumber(parseQuickTextCalcNumber(quickTextCalc.door))}`,
    `凸${formatQuickTextCalcNumber(parseQuickTextCalcNumber(quickTextCalc.bump))}`,
    `=${quickTextCalcTotalText.value}`,
  ];
  quickTextDraft.value = lines.join("\n");
}
function resetQuickTextCalc() {
  quickTextCalc.pull = "";
  quickTextCalc.cabinet = "";
  quickTextCalc.door = "";
  quickTextCalc.bump = "";
}
const toolbarHint = computed(() => {
  const shortcutHint =
    "快捷鍵：I 文字 / L 直線 / O 圓 / R 矩形 / S 圖章 / Esc 移動";
  let base = "";
  if (textBox.value.visible) {
    base = "文字編輯中：Enter 換行，Ctrl+Enter 確認，Esc 取消";
  } else if (selectedTextOverlay.value) {
    base =
      "文字已選取：拖曳移動，右下角縮放，雙擊改內容，Delete 刪除，Esc 或點空白取消選取";
  } else if (selectedShapeOverlay.value) {
    const shapeLabel =
      selectedShapeOverlay.value.type === "ellipse"
        ? "圓 / 橢圓"
        : selectedShapeOverlay.value.type === "rect"
          ? "矩形"
          : selectedShapeOverlay.value.type === "measure"
            ? "測量線"
            : "線條";

    if (selectedShapeOverlay.value.type === "measure") {
      base = `${shapeLabel}已選取：拖曳移動，Delete 刪除，可按「設基準」輸入實際距離，也可重設基準，Esc 或點空白取消選取`;
    } else if (selectedShapeOverlay.value.type === "line") {
      base = `${shapeLabel}已選取：拖曳移動，Delete 刪除，Esc 或點空白取消選取`;
    } else {
      base = `${shapeLabel}已選取：拖曳移動，右下角縮放，右上角刪除，Delete 刪除，Esc 或點空白取消選取`;
    }
  } else {
    switch (drawTool.value) {
      case null:
        base = "移動模式：點選物件可選取並拖曳，Esc 或點空白取消選取";
        break;
      case "pen":
        base = "畫筆：按住滑鼠自由手繪";
        break;
      case "erase":
        base = "橡皮擦：按住滑鼠擦除手繪筆跡";
        break;
      case "line":
        base = "直線：拖拉繪製直線";
        break;
      case "measure":
        base =
          "測量：拖拉繪製測量線，顯示 CM，選取後可按「設基準」輸入實際距離，其他測量線會按比例更新";
        break;
      case "rect":
        base = "矩形：拖拉繪製，可搭配 ▢ / ■ 切換邊框或實體";
        break;
      case "ellipse":
        base =
          "圓 / 橢圓：拖拉繪製，按 Shift 可鎖成正圓，可搭配 ▢ / ■ 切換邊框或實體";
        break;
      case "text":
        base =
          "文字：先在輸入框打字，再點位置可連續貼上；雙擊既有文字可編輯";
        break;
      default:
        base = "";
        break;
    }
  }

  if (!base) return shortcutHint;
  return `${base}｜${shortcutHint}`;
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
function openImagePicker() {
  imgInputRef.value?.click();
}
function setTransientMsg(message, timeout = 2600) {
  saveMsg.value = message;
  window.setTimeout(() => {
    if (saveMsg.value === message) saveMsg.value = "";
  }, timeout);
}
function syncToolbarFromShape(ovl) {
  if (!ovl) return;
  drawColor.value = ovl.color || "#e00000";
  drawWidth.value = ovl.width || 5;
  if (ovl.type === "line") lineArrowStyle.value = ovl.arrowStyle || "none";
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
function setLineArrowStyle(style) {
  lineArrowStyle.value = style;
  if (selectedShapeOverlay.value?.type === "line") {
    selectedShapeOverlay.value.arrowStyle = style;
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
    if (type === "line") {
      drawLineArrowheads(
        ctx,
        start,
        end,
        drawColor.value,
        drawWidth.value,
        lineArrowStyle.value,
      );
    }
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
          arrowStyle:
            drawTool.value === "line" ? lineArrowStyle.value : undefined,
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
    const rotation = 0;
    const newTextOverlay = {
      id: Date.now(),
      x: tb.x,
      y: tb.y + HANDLE_H,
      text,
      fontSize: tb.fontSize,
      color: drawColor.value,
      rotation,
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
  const isTypingTarget =
    tagName === "input" || tagName === "textarea" || target?.isContentEditable;
  const isPlainHotkey = !e.ctrlKey && !e.metaKey && !e.altKey;
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "p") {
    e.preventDefault();
    void doPrint();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "z") {
    if (textBox.value.visible) return;
    if (
      isTypingTarget
    )
      return;
    undoAnnotationHistory();
    e.preventDefault();
    return;
  }
  if (isPlainHotkey && !e.shiftKey && e.key.toLowerCase() === "i") {
    if (textBox.value.visible || isTypingTarget) return;
    setDrawTool("text");
    clearSelections();
    e.preventDefault();
    return;
  }
  if (isPlainHotkey && !e.shiftKey && e.key.toLowerCase() === "l") {
    if (textBox.value.visible || isTypingTarget) return;
    setDrawTool("line");
    clearSelections();
    e.preventDefault();
    return;
  }
  if (isPlainHotkey && !e.shiftKey && e.key.toLowerCase() === "o") {
    if (textBox.value.visible || isTypingTarget) return;
    setDrawTool("ellipse");
    clearSelections();
    e.preventDefault();
    return;
  }
  if (isPlainHotkey && !e.shiftKey && e.key.toLowerCase() === "r") {
    if (textBox.value.visible || isTypingTarget) return;
    setDrawTool("rect");
    clearSelections();
    e.preventDefault();
    return;
  }
  if (isPlainHotkey && !e.shiftKey && e.key.toLowerCase() === "s") {
    if (textBox.value.visible || isTypingTarget) return;
    showStampPanel.value = !showStampPanel.value;
    setDrawTool(null);
    clearSelections();
    e.preventDefault();
    return;
  }
  if (e.key === "Escape") {
    if (textBox.value.visible) cancelText();
    setDrawTool(null);
    clearSelections();
    return;
  }
  if (textBox.value.visible) return;
  if (e.key !== "Delete" && e.key !== "Backspace") return;
  if (isTypingTarget) return;

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
      _activeImg.w = Math.max(8, _aiOrigW + dx);
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
      stoveModelSizeByNumber.value = stoveLookup.byNumber;
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
    untaxedPriceText.value =
      typeof conf?.untaxedPriceText === "string" && conf.untaxedPriceText.trim()
        ? migrateSavedUntaxedPriceText(conf.untaxedPriceText)
        : defaultUntaxedPriceText.value;
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
        rotation: Number(saved.rotation || 0),
        _hasSavedPos: saved.x !== undefined,
        overlayImages: Array.isArray(d.state?.overlayImages)
          ? d.state.overlayImages.map((i) => ({ ...i }))
          : [],
      });
    });

    await authReadyPromise;
    const currentUser = auth.currentUser;
    if (currentUser?.uid) {
      fontPresetUserUid.value = currentUser.uid;
      refreshFontPresetStatus();
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
      fontPresetUserUid.value = "";
      refreshFontPresetStatus();
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

    dirty.value = false;
    savedRevision = dirtyRevision;
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
  await archivePrintedPdf();
}

async function archivePrintedPdf() {
  if (pdfGenerating.value) return;
  pdfGenerating.value = true;
  try {
    await doPrint();
    saveMsg.value = "請在列印視窗另存PDF，完成後按「上傳PDF」封存";
  } finally {
    pdfGenerating.value = false;
  }
}

function buildConfirmationPrintOverrideCss() {
  return `
    @page { size: A4 landscape; margin: 0; }
    * {
      box-sizing: border-box !important;
    }
    html, body {
      width: 297mm !important;
      height: 0 !important;
      margin: 0 !important;
      padding: 0 !important;
      overflow: hidden !important;
      background: #fff !important;
      position: fixed !important;
      left: 0 !important;
      top: 0 !important;
    }
    .conf-root,
    .page-wrap,
    .a4-page {
      width: 297mm !important;
      height: 210mm !important;
      max-width: 297mm !important;
      max-height: 210mm !important;
      margin: 0 !important;
      padding: 0 !important;
      display: block !important;
      flex: none !important;
      transform: none !important;
      clip-path: none !important;
      box-shadow: none !important;
      page-break-inside: avoid !important;
      page-break-after: avoid !important;
      break-inside: avoid-page !important;
      break-after: avoid-page !important;
      overflow: hidden !important;
    }
    .conf-root {
      min-height: auto !important;
      background: #fff !important;
    }
    .a4-page {
      position: fixed !important;
      left: 0 !important;
      top: 0 !important;
      right: auto !important;
      bottom: auto !important;
    }
    .no-print,
    .conf-toolbar {
      display: none !important;
    }
    .drawing-blk {
      outline: none !important;
    }
    .elevator-input {
      display: none !important;
    }
    .elevator-print-value {
      display: inline-block !important;
      width: 7ch !important;
      min-width: 7ch !important;
      max-width: 7ch !important;
      height: 20px !important;
      line-height: 18px !important;
      padding: 0 !important;
      border: none !important;
      border-bottom: 1px solid #999 !important;
      border-radius: 0 !important;
      background: transparent !important;
      text-align: center !important;
      font-size: 13px !important;
      color: #111 !important;
      box-sizing: border-box !important;
      vertical-align: baseline !important;
    }
    .cabinet-ready-actions {
      display: none !important;
    }
    .confirmation-untaxed-editor {
      display: block !important;
      padding: 7px 8px !important;
      color: #333 !important;
      line-height: 1.6 !important;
      font-family: monospace !important;
      white-space: pre-wrap !important;
      overflow-wrap: anywhere !important;
      overflow: hidden !important;
    }
    .body-row,
    .upper-body {
      overflow: hidden !important;
    }
  `;
}

async function createConfirmationPrintFrame() {
  const pageEl = pageRef.value;
  if (!pageEl) throw new Error("找不到頁面元素");

  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.position = "fixed";
  iframe.style.left = "-10000px";
  iframe.style.top = "0";
  iframe.style.width = `${A4_WIDTH_PX}px`;
  iframe.style.height = `${A4_HEIGHT_PX}px`;
  iframe.style.border = "0";
  iframe.style.opacity = "0";
  iframe.style.pointerEvents = "none";
  document.body.appendChild(iframe);

  const cleanup = () => {
    if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
  };

  const cloneHead = Array.from(
    document.querySelectorAll('link[rel="stylesheet"], style'),
  )
    .map((node) => node.outerHTML)
    .join("\n");

  const doc = iframe.contentDocument;
  if (!doc) {
    cleanup();
    throw new Error("無法建立列印頁面");
  }

  doc.open();
  doc.write(`
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <base href="${document.baseURI}" />
        ${cloneHead}
        <style>${buildConfirmationPrintOverrideCss()}</style>
      </head>
      <body>
        ${pageEl.outerHTML}
      </body>
    </html>
  `);
  doc.close();

  const waitForImages = () => {
    const images = Array.from(doc.images || []);
    return Promise.all(
      images.map((img) =>
        img.complete
          ? Promise.resolve()
          : new Promise((resolve) => {
              img.onload = resolve;
              img.onerror = resolve;
            }),
      ),
    );
  };

  if (doc.fonts?.ready) {
    try {
      await doc.fonts.ready;
    } catch (_) {
      // ignore
    }
  }
  await waitForImages();
  await new Promise((resolve) => requestAnimationFrame(resolve));
  await new Promise((resolve) => setTimeout(resolve, 150));

  const printPageEl = doc.querySelector(".a4-page");
  if (!printPageEl) {
    cleanup();
    throw new Error("找不到列印頁面元素");
  }

  return { iframe, pageEl: printPageEl, cleanup };
}

// ── Save ────────────────────────────────────────────────────────────
async function persistConfirmation({
  showSuccess = true,
  showFailure = true,
} = {}) {
  if (savePromise) return savePromise;

  savePromise = (async () => {
    const revisionAtStart = dirtyRevision;
    if (_pendingOverlayUploads.size)
      await Promise.allSettled([..._pendingOverlayUploads.values()]);
    saving.value = true;
    try {
      const annotCanvas = annotCanvasRef.value
        ? annotCanvasRef.value.toDataURL("image/png")
        : null;
      const payload = {
        drawingBlocks: Object.fromEntries(
          drawingBlocks.value.map((b) => [
            b.drawingId,
            {
              x: b.x,
              y: b.y,
              scale: b.scale,
              rotation: Number(b.rotation || 0),
            },
          ]),
        ),
        cf: { ...cf },
        overlayImgs: overlayImgs.value.map((i) => ({ ...i })),
        textOverlays: textOverlays.value.map((o) => ({ ...o })),
        shapeOverlays: shapeOverlays.value.map((o) => ({ ...o })),
        stampOverlays: stampOverlays.value.map((o) => ({ ...o })),
        measurementScale: measurementScale.value,
        untaxedPriceText: String(untaxedPriceText.value || "").trim(),
        annotCanvas,
      };

      const isDocTooLargeError = (err) => {
        const code = String(err?.code || "").toLowerCase();
        const msg = String(err?.message || "").toLowerCase();
        return (
          code.includes("resource-exhausted") ||
          msg.includes("document too large") ||
          msg.includes("maximum size") ||
          msg.includes("size")
        );
      };

      try {
        await saveOrderConfirmation(orderId.value, payload);
      } catch (saveErr) {
        if (!annotCanvas || !isDocTooLargeError(saveErr)) throw saveErr;
        await saveOrderConfirmation(orderId.value, {
          ...payload,
          annotCanvas: null,
        });
        setTransientMsg("⚠ 手繪畫布過大，已略過畫布儲存；其餘內容已儲存", 3500);
      }

      const preferredEdgeType = normalizePreferredEdgeType(cf.edgeType);
      if (order.value?.customerId && preferredEdgeType) {
        try {
          await updateCustomerPricing(order.value.customerId, {
            customerName: order.value.customerName,
            preferredConfirmationEdgeType: preferredEdgeType,
          });
        } catch (pricingErr) {
          console.warn(
            "updateCustomerPricing skipped during confirmation save",
            pricingErr,
          );
          setTransientMsg("已儲存生產確定單，未同步客戶邊型偏好", 2500);
        }
      }
      savedRevision = Math.max(savedRevision, revisionAtStart);
      dirty.value = dirtyRevision > savedRevision;
      if (showSuccess) {
        saveMsg.value = "✓ 已儲存";
        setTimeout(() => {
          if (saveMsg.value === "✓ 已儲存") saveMsg.value = "";
        }, 2000);
      }
      return true;
    } catch (e) {
      if (showFailure)
        saveMsg.value = `儲存失敗：${e?.message || e || "未知錯誤"}`;
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
    do {
      await persistConfirmation();
    } while (dirty.value);
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
  let printFrame = null;
  try {
    printFrame = await createConfirmationPrintFrame();
    printFrame.iframe.contentWindow?.focus();
    printFrame.iframe.contentWindow?.print();
    setTimeout(printFrame.cleanup, 500);
  } catch (e) {
    printFrame?.cleanup?.();
    console.error("列印失敗", e);
    saveMsg.value = `❌ 列印失敗：${e?.message || e}`;
    setTimeout(() => {
      if (String(saveMsg.value || "").startsWith("❌ 列印失敗")) {
        saveMsg.value = "";
      }
    }, 4000);
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
  flex-wrap: wrap;
  gap: 8px;
  margin-left: auto;
}
.hint {
  font-size: 11px;
  color: #94a3b8;
}
.font-presets {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 6px;
  border: 1px solid #334155;
  border-radius: 6px;
  background: #0f172a;
}
.font-presets-label {
  font-size: 11px;
  color: #cbd5e1;
  margin-right: 2px;
}
.font-preset-item {
  display: inline-flex;
  align-items: center;
  gap: 3px;
}
.btn-preset,
.btn-preset-save {
  padding: 3px 7px;
  font-size: 11px;
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
.btn-img:disabled {
  opacity: 0.65;
  cursor: default;
}
.btn-img:hover {
  background: #047857;
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
.btn-backend-pdf {
  font-size: 12px;
  color: #fff;
  background: #0f766e;
  border: none;
  padding: 4px 10px;
  border-radius: 5px;
  cursor: pointer;
  white-space: nowrap;
}
.btn-backend-pdf:hover {
  background: #115e59;
}
.btn-backend-pdf:disabled {
  opacity: 0.55;
  cursor: default;
}
.btn-backend-pdf-link {
  font-size: 12px;
  color: #67e8f9;
  text-decoration: none;
  border: 1px solid #67e8f9;
  padding: 2px 8px;
  border-radius: 4px;
  white-space: nowrap;
}
.btn-backend-pdf-link:hover {
  background: #164e63;
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
  --sheet-grid-width: 1px;
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
  position: relative;
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
  overflow: visible;
}
.elevator-badge {
  position: absolute;
  top: 2px;
  right: 26px;
  display: flex;
  align-items: center;
  gap: 2px;
  font-size: 13px;
  background: #fff;
  z-index: 5;
  padding: 1px 3px;
}
.elevator-lbl {
  white-space: nowrap;
  font-size: 13px;
}
.elevator-input {
  width: 7ch;
  min-width: 7ch;
  max-width: 7ch;
  height: 20px;
  line-height: 18px;
  padding: 0;
  border: none;
  border-bottom: 1px solid #999;
  outline: none;
  font-size: 13px;
  background: transparent;
  text-align: center;
  appearance: textfield;
}
.elevator-print-value {
  display: none;
  width: 7ch;
  min-width: 7ch;
  max-width: 7ch;
  height: 20px;
  line-height: 18px;
  border-bottom: 1px solid #999;
  text-align: center;
  font-size: 13px;
  color: #111;
  box-sizing: border-box;
}
.elevator-suffix {
  white-space: nowrap;
  font-size: 13px;
}
.elevator-input::-webkit-outer-spin-button,
.elevator-input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
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
.vf-val-plain {
  border: none !important;
  border-bottom: none !important;
  border-width: 0 !important;
  box-shadow: none !important;
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
  position: relative;
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
.fields-top + .sub-section {
  border-top: none;
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
.sink-section .detail-tbl {
  font-size: 14px;
}
.stove-section .detail-tbl {
  border-bottom: 1px solid var(--sheet-grid-border);
  font-size: 14px;
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
  border-collapse: separate;
  border-spacing: 0;
  flex-shrink: 0;
  position: relative;
}
.fields-tbl td {
  border: none;
  border-right: var(--sheet-grid-width) solid var(--sheet-grid-border);
  border-bottom: var(--sheet-grid-width) solid var(--sheet-grid-border);
  padding: 0 4px 3px;
  height: 26px;
  vertical-align: middle;
  line-height: 1.1;
}
.fields-tbl tr:first-child td {
  border-top: var(--sheet-grid-width) solid var(--sheet-grid-border);
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
.fields-tbl td:first-child {
  border-left: var(--sheet-grid-width) solid var(--sheet-grid-border);
}
.fields-tbl td.lbl {
  border-top: inherit;
  border-bottom: inherit;
}
.promised-at-box {
  border: 3px solid #000 !important;
}
.fields-tbl tr.edge-row td {
  height: 84px;
  padding-top: 0;
  padding-bottom: 0;
  vertical-align: middle;
}
.fields-tbl tr.edge-row.edge-row-collapsed td {
  height: 34px;
}
.fields-tbl tr.stone-row td {
  height: 31px;
}
.fields-tbl tr.stone-row .val {
  font-size: 15px;
}
.font-adjustable,
.stone-color-cell {
  cursor: pointer;
  user-select: none;
}
.fields-tbl tr.edge-row .lbl {
  top: 0;
}
.fields-tbl tr.edge-row > td:first-child {
  border-left: var(--sheet-grid-width) solid var(--sheet-grid-border) !important;
}
.edge-toggle-lbl {
  cursor: pointer;
  user-select: none;
}
.edge-toggle-caret {
  display: block;
  font-size: 10px;
  line-height: 1;
  margin-top: 2px;
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
  transition: height 0.18s ease;
}
.fields-tbl tr.edge-row.edge-row-collapsed .edge-cell {
  height: 34px;
  padding: 0 6px;
}
.edge-choice-list {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 2px;
  width: 100%;
  transform: translateY(-4px);
  transition: transform 0.18s ease;
}
.fields-tbl tr.edge-row.edge-row-collapsed .edge-choice-list {
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  transform: none;
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
.fields-tbl tr.edge-row.edge-row-collapsed .edge-choice {
  grid-template-columns: 12px auto auto;
  gap: 2px;
  min-height: 18px;
  flex: 1 1 0;
}
.edge-choice-shape {
  width: 16px;
  text-align: center;
  font-size: 15px;
  line-height: 1;
}
.fields-tbl tr.edge-row.edge-row-collapsed .edge-choice-shape {
  width: 12px;
  font-size: 12px;
}
.edge-choice-mark {
  font-size: 13px;
  line-height: 1;
}
.fields-tbl tr.edge-row.edge-row-collapsed .edge-choice-mark {
  font-size: 11px;
}
.edge-choice-label {
  font-size: 14px;
  line-height: 1.1;
}
.fields-tbl tr.edge-row.edge-row-collapsed .edge-choice-label {
  font-size: 11px;
  white-space: nowrap;
}
.edge-choice-empty {
  display: inline-flex;
  align-items: center;
  min-height: 18px;
  font-size: 12px;
  color: #666;
  white-space: nowrap;
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
  text-align: center;
  vertical-align: top;
  line-height: 1;
  overflow: visible;
  white-space: normal;
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
  top: -1pt;
  right: 0px;
  width: 138px;
  height: calc(100% + 38px);
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
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  line-height: 1;
  letter-spacing: 0;
}
.price-lbl span {
  display: block;
}
.price-lbl--font-control {
  cursor: pointer;
  user-select: none;
}
.price-val-col {
  flex: 1;
  display: flex;
  align-items: stretch;
  justify-content: center;
  border-right: 1px solid var(--sheet-grid-border);
  padding: 0;
  overflow: hidden;
}
.price-val {
  white-space: nowrap;
  font-size: 22px;
  font-weight: 700;
  color: #c0392b;
  letter-spacing: 1px;
}
.confirmation-untaxed-editor {
  flex: 1 1 auto;
  align-self: stretch;
  box-sizing: border-box;
  display: block;
  width: 100%;
  height: 100%;
  min-height: 0;
  resize: none;
  border: 1px solid transparent;
  border-radius: 2px;
  padding: 7px 8px;
  color: #333;
  line-height: 1.6;
  font-family: monospace;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  overflow: hidden;
  background: transparent;
}
.confirmation-untaxed-editor:empty::before {
  content: attr(data-placeholder);
  color: #9ca3af;
}
.confirmation-untaxed-editor:focus {
  outline: none;
  border-color: #8bb8ff;
  background: rgba(255, 255, 255, 0.78);
  box-shadow: inset 0 0 0 1px rgba(59, 130, 246, 0.15);
}
.price-grid {
  width: 100%;
  display: grid;
  column-gap: 10px;
  row-gap: 0;
  align-items: start;
  padding: 1px 3px 2px;
}
.price-grid--cols-2 {
  grid-template-columns: 1fr 1fr;
}
.price-grid--cols-3 {
  grid-template-columns: 1fr 1fr 1fr;
}
.price-grid--cols-4 {
  grid-template-columns: 1fr 1fr 1fr 1fr;
}
.price-grid--dense {
  column-gap: 8px;
}
.price-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 11px;
  line-height: 1.22;
  table-layout: fixed;
}
.price-table td {
  padding: 0 2px 1px;
  vertical-align: top;
  border-bottom: 1px dotted #ccc;
}
.price-table tr:last-child td {
  border-bottom: none;
}
.price-table .pt-calc {
  text-align: right;
  color: #555;
  white-space: normal;
  word-break: keep-all;
  overflow-wrap: anywhere;
  width: 100%;
  font-variant-numeric: tabular-nums;
  font-size: 10.5px;
  line-height: 1.22;
}
.price-sum {
  border-top: 1px solid #c0392b;
  margin-top: 3px;
  padding: 1px 2px 2px 0;
  text-align: center;
  font-weight: 700;
  font-size: 12px;
  line-height: 1.1;
  color: #c0392b;
  position: relative;
  top: 0;
}
.price-grid--cols-4 .price-sum {
  grid-column: 4 / 5;
}
.price-sum span {
  margin-left: 4px;
  font-size: 14px;
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
  bottom: 0;
  right: 8px;
  font-size: 12px;
  font-weight: 700;
  color: #111;
  height: 18px;
  line-height: 18px;
}

/* Export-only readability boost: applied only during snapshot/PDF rendering */
.a4-page.export-readable .fields-tbl td {
  height: 29px;
}
.a4-page.export-readable .fields-tbl tr.stone-row td {
  height: 37px;
}
.a4-page.export-readable .fields-tbl tr.stone-row .val {
  font-size: 16px;
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
  display: block;
  min-height: 18px;
  line-height: 1.1;
  white-space: normal;
  overflow-wrap: anywhere;
  word-break: break-word;
}
.a4-page.export-rendering .detail-cell-text {
  transform: none;
}
.a4-page.export-rendering .lbl,
.a4-page.export-rendering .val {
  font-size: 15px;
}
.a4-page.export-rendering .fields-tbl td {
  height: 33px;
  line-height: 1.1;
  vertical-align: top;
  padding-top: 0;
  padding-bottom: 2px;
}
.a4-page.export-rendering .fields-tbl tr.stone-row td {
  height: 41px;
}
.a4-page.export-rendering .fields-tbl tr.stone-row .val {
  font-size: 16px;
}
.a4-page.export-rendering .fields-tbl .lbl,
.a4-page.export-rendering .fields-tbl .val {
  top: -3px;
}
.a4-page.export-rendering .fields-tbl tr:first-child td.val {
  top: -6px;
}
.a4-page.export-rendering .fields-tbl tr:first-child td,
.a4-page.export-rendering .fields-tbl tr.edge-row td {
  border-bottom: none !important;
}
.a4-page.export-rendering .fields-tbl tr.edge-row td {
  height: 33px;
  vertical-align: middle;
  padding-top: 0;
  padding-bottom: 0;
}
.a4-page.export-rendering .fields-tbl tr.edge-row .lbl,
.a4-page.export-rendering .fields-tbl tr.edge-row .val {
  top: -3px;
}
.a4-page.export-rendering .edge-cell {
  height: 33px !important;
  padding: 0 4px !important;
  border-top: none !important;
}
.a4-page.export-rendering .edge-toggle-lbl {
  font-size: 15px;
  line-height: 1.05;
}
.a4-page.export-rendering .edge-toggle-caret {
  display: none;
}
.a4-page.export-rendering .fields-tbl td.val {
  padding-top: 0;
  padding-bottom: 4px;
}
.a4-page.export-rendering .fields-tbl tr.edge-row td.val {
  padding-top: 0;
  padding-bottom: 0;
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
  font-size: 15px;
  line-height: 1.05;
}
.a4-page.export-rendering .edge-choice-list {
  transform: none;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 4px;
}
.a4-page.export-rendering .edge-choice {
  grid-template-columns: 12px auto auto;
  gap: 2px;
  min-height: 22px;
}
.a4-page.export-rendering .edge-choice-shape {
  width: 12px;
  font-size: 15px;
}
.a4-page.export-rendering .edge-choice-empty {
  font-size: 15px;
}
.a4-page.export-rendering .confirmation-untaxed-editor {
  display: block !important;
  padding: 7px 8px !important;
  color: #333 !important;
  line-height: 1.6 !important;
  white-space: pre-wrap !important;
  overflow-wrap: anywhere !important;
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

.line-arrow-btns {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 2px;
  background: rgba(15, 23, 42, 0.45);
  border-radius: 6px;
}
.line-arrow-btn {
  min-width: 28px;
  height: 28px;
  border: 1px solid rgba(148, 163, 184, 0.55);
  border-radius: 4px;
  background: #1f2a3a;
  color: #e5e7eb;
  font-size: 15px;
  line-height: 1;
  cursor: pointer;
}
.line-arrow-btn.active {
  border-color: #f59e0b;
  background: #f59e0b;
  color: #111827;
  font-weight: 700;
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
  order: 999;
  flex: 1 0 100%;
  max-width: 420px;
  min-width: 260px;
  width: 100%;
  min-height: 56px;
  padding: 4px 8px;
  border-radius: 5px;
  border: 1px solid #94a3b8;
  background: #ffffff;
  color: #111827;
  font-size: 13px;
  line-height: 1.35;
  resize: vertical;
}

.quick-text-input::placeholder {
  color: #6b7280;
}

.quick-text-calc {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  border: 1px solid #334155;
  border-radius: 6px;
  background: #0f172a;
}

.quick-text-calc-item {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: #cbd5e1;
  font-size: 12px;
}

.quick-text-calc-item input {
  width: 82px;
  min-width: 82px;
  height: 28px;
  border: 1px solid #475569;
  border-radius: 4px;
  background: #fff;
  color: #0f172a;
  font-size: 14px;
  padding: 3px 6px;
}

.quick-text-calc-item.total input {
  width: 92px;
  min-width: 92px;
  background: #e2e8f0;
  font-weight: 700;
}

.quick-text-calc-btn {
  padding: 3px 8px;
  font-size: 11px;
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
@page {
  size: A4 landscape;
  margin: 0;
}

@media print {
  * {
    margin: 0 !important;
    padding: 0 !important;
    box-sizing: border-box !important;
  }

  html,
  body {
    width: 297mm !important;
    height: 210mm !important;
    overflow: hidden !important;
    display: block !important;
  }

  .no-print,
  .conf-toolbar {
    display: none !important;
  }

  .conf-root,
  .page-wrap,
  .a4-page {
    width: 297mm !important;
    height: 210mm !important;
    overflow: hidden !important;
  }

  .conf-root {
    background: #fff !important;
    margin: 0 !important;
    padding: 0 !important;
    min-height: auto !important;
  }

  .page-wrap {
    padding: 0 !important;
    margin: 0 !important;
    display: block !important;
    flex: none !important;
  }

  .a4-page {
    margin: 0 !important;
    box-shadow: none !important;
    page-break-inside: avoid !important;
    page-break-after: avoid !important;
    break-inside: avoid-page !important;
    break-after: avoid-page !important;
    flex-shrink: 0 !important;
    position: relative !important;
    clip-path: inset(0) !important;
  }

  .drawing-blk {
    outline: none !important;
  }

  .elevator-input {
    display: none !important;
  }

  .elevator-print-value {
    display: inline-block !important;
    width: 7ch !important;
    min-width: 7ch !important;
    max-width: 7ch !important;
    height: 20px !important;
    line-height: 18px !important;
    padding: 0 !important;
    border: none !important;
    border-bottom: 1px solid #999 !important;
    border-radius: 0 !important;
    background: transparent !important;
    text-align: center !important;
    font-size: 13px !important;
    color: #111 !important;
    box-sizing: border-box !important;
    vertical-align: baseline !important;
  }

  .cabinet-ready-actions {
    display: none !important;
  }

  .confirmation-untaxed-editor {
    display: block !important;
    padding: 7px 8px !important;
    color: #333 !important;
    line-height: 1.6 !important;
    font-family: monospace !important;
    white-space: pre-wrap !important;
    overflow-wrap: anywhere !important;
    overflow: hidden !important;
  }

  .body-row,
  .upper-body {
    overflow: hidden !important;
  }

  canvas {
    width: 297mm !important;
    height: 210mm !important;
    max-width: 297mm !important;
    max-height: 210mm !important;
    clip-path: inset(0) !important;
  }

  .a4-page * {
    max-width: 297mm !important;
  }

  body::after {
    content: "" !important;
    display: none !important;
  }
}
</style>
