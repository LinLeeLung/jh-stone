<template>
  <div class="order-edit">
    <header class="page-header">
      <h2>{{ isEdit ? "編輯訂單" : "新建訂單" }}</h2>
      <div class="header-actions">
        <RouterLink
          v-if="userRole === 'admin' || userRole === '管理者'"
          class="btn-aux"
          to="/orders/settings"
          >訂單設定</RouterLink
        >
        <RouterLink
          v-if="isEdit"
          class="btn-aux"
          :to="`/orders/${route.params.id}/drawing`"
          >📏 繪圖</RouterLink
        >
        <RouterLink
          v-if="isEdit"
          class="btn-aux"
          :to="`/orders/${route.params.id}/confirmation`"
          >📋 確定單</RouterLink
        >
        <button
          v-if="canSendConfirmation"
          class="btn-aux"
          @click="onSendConfirmation"
        >
          📨 傳確定單
        </button>
        <button
          v-if="canIssue"
          class="btn-primary btn-issue"
          @click="showIssuanceDialog = true"
        >
          ✅ 發單
        </button>
        <button class="btn-secondary" @click="$router.back()">取消</button>
        <button class="btn-primary" :disabled="saving" @click="onSave">
          {{ saving ? "儲存中..." : "儲存" }}
        </button>
      </div>
    </header>

    <p v-if="loading" class="hint">載入中...</p>
    <p v-if="error" class="error">{{ error }}</p>

    <div v-if="!loading" class="form-grid">
      <!-- 客戶資訊 -->
      <section class="card">
        <h3>客戶資訊</h3>
        <div class="row">
          <label>客戶</label>
          <div class="customer-picker">
            <input
              v-model="customerKeyword"
              type="text"
              placeholder="輸入代號或名稱搜尋"
              @focus="showCustomerList = true"
              @input="showCustomerList = true"
            />
            <ul
              v-if="showCustomerList && filteredCustomers.length"
              class="dropdown"
            >
              <li
                v-for="c in filteredCustomers.slice(0, 30)"
                :key="c.id"
                @click="pickCustomer(c)"
              >
                <b>{{ c.code }}</b> {{ c.name }}
                <span v-if="c.phone" class="muted">{{ c.phone }}</span>
              </li>
            </ul>
            <div v-if="form.customerId" class="picked">
              已選：<b>{{ form.customerId }}</b> {{ form.customerName }}
            </div>
          </div>
        </div>

        <div class="row">
          <label>客戶端業務</label>
          <div class="inline">
            <input v-model="form.customerContact.name" placeholder="姓名" />
            <input v-model="form.customerContact.phone" placeholder="電話" />
          </div>
        </div>

        <div class="row">
          <label>業主</label>
          <div class="inline">
            <input v-model="form.owner.name" placeholder="姓名" />
            <input v-model="form.owner.phone" placeholder="電話" />
          </div>
        </div>

        <div class="row">
          <label>安裝地點</label>
          <input v-model="form.siteAddress" type="text" />
        </div>

        <div class="row">
          <label>打版日</label>
          <input v-model="form.templatingDate" type="date" />
        </div>

        <div class="row">
          <label>預交日</label>
          <input v-model="form.promisedAt" type="date" />
        </div>

        <div class="row">
          <label>收尾日</label>
          <input v-model="form.finishingDate" type="date" />
        </div>

        <div class="row">
          <label>訂單類別</label>
          <select v-model="form.category">
            <option value="">--</option>
            <option v-for="c in orderCategories" :key="c" :value="c">
              {{ c }}
            </option>
          </select>
        </div>

        <div class="row">
          <label>客戶自編單號</label>
          <input v-model="form.customerOrderNo" type="text" />
        </div>
      </section>

      <!-- 石材 -->
      <section class="card">
        <header class="card-head">
          <h3>石材</h3>
          <button class="btn-mini" @click="addStone">+ 新增石材</button>
        </header>
        <div v-for="(s, i) in form.stones" :key="i" class="sub-row">
          <!-- 下拉模式 -->
          <template v-if="!s.freeInput">
            <select
              v-model="s.brand"
              @change="onStoneBrandChange(i)"
              style="min-width: 130px"
            >
              <option value="">-- 品牌 --</option>
              <option v-for="b in brands" :key="b" :value="b">{{ b }}</option>
            </select>
            <select
              v-model="s.color"
              :disabled="!s.brand"
              @change="onStoneColorChange(i)"
              style="min-width: 160px"
            >
              <option value="">-- 色號 --</option>
              <option
                v-for="c in colorsForBrand(s.brand)"
                :key="c.id"
                :value="c.color"
              >
                {{ c.color }}
              </option>
            </select>
            <span class="material-tag">{{
              MATERIAL_LABEL[s.materialType] || "--"
            }}</span>
          </template>
          <!-- 自由輸入模式 -->
          <template v-else>
            <input
              v-model="s.brand"
              placeholder="品牌"
              style="min-width: 130px"
            />
            <input
              v-model="s.color"
              placeholder="色號"
              style="min-width: 160px"
            />
            <select v-model="s.materialType" style="min-width: 90px">
              <option value="quartz">石英石</option>
              <option value="porcelain">陶板</option>
              <option value="granite">人造石</option>
              <option value="other">其他</option>
            </select>
          </template>
          <button
            class="btn-mini"
            :title="s.freeInput ? '改用下拉選單' : '改用自由輸入'"
            @click="toggleStoneFreeInput(i)"
          >
            {{ s.freeInput ? "☰" : "✎" }}
          </button>
          <button class="btn-del" @click="form.stones.splice(i, 1)">×</button>
        </div>
        <p v-if="!form.stones.length" class="muted small">尚未加入石材</p>
      </section>

      <!-- 計價（由繪圖帶入） -->
      <section class="card full">
        <header class="card-head">
          <h3>計價（由繪圖帶入）</h3>
          <div class="pricing-toolbar">
            <button class="btn-mini" type="button" @click="addPricingItem">
              + 新增項目
            </button>
            <button class="btn-mini" type="button" @click="recalcPricingTotals">
              重算合計
            </button>
            <button
              v-if="isEdit"
              class="btn-mini"
              type="button"
              :disabled="loadingPricingImport"
              @click="importPricingFromDrawing"
            >
              {{ loadingPricingImport ? "帶入中..." : "一鍵帶入繪圖資料" }}
            </button>
            <RouterLink
              v-if="isEdit"
              class="btn-mini"
              :to="`/orders/${route.params.id}/drawing`"
              >前往繪圖更新</RouterLink
            >
          </div>
        </header>

        <div class="pricing-wrap">
          <div v-if="customerPricing" class="pricing-history">
            <div class="pricing-history-head">
              <span>客戶歷史單價</span>
              <span v-if="customerPricing.defaultPricePerCm" class="muted small"
                >預設
                {{
                  customerPricing.defaultPricePerCm.toLocaleString()
                }}
                /cm</span
              >
            </div>
            <div v-if="suggestedPrices.length" class="pricing-suggestions">
              <div
                v-for="s in suggestedPrices"
                :key="s.key"
                class="pricing-sugg-item"
              >
                <span class="muted small">{{ s.label }}</span>
                <strong>{{ s.price.toLocaleString() }} /cm</strong>
                <button
                  class="btn-mini"
                  type="button"
                  @click="form.pricePerCm = s.price"
                >
                  套用
                </button>
              </div>
            </div>
          </div>

          <table class="pricing-table">
            <thead>
              <tr>
                <th>項目</th>
                <th class="num">數量</th>
                <th>單位</th>
                <th class="num">單價</th>
                <th>計算式</th>
                <th class="num">金額</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, idx) in editablePricingRows" :key="`p-${idx}`">
                <td>
                  <input
                    v-model="row.description"
                    class="pricing-input"
                    type="text"
                    placeholder="項目名稱"
                    @input="syncPricingName(row)"
                  />
                </td>
                <td class="num">
                  <input
                    v-model.number="row.qty"
                    class="pricing-input num"
                    type="number"
                    min="0"
                    step="0.01"
                    @input="recalcPricingRowAmount(row)"
                  />
                </td>
                <td>
                  <input
                    v-model="row.unit"
                    class="pricing-input"
                    type="text"
                    placeholder="單位"
                  />
                </td>
                <td class="num">
                  <input
                    v-model.number="row.unitPrice"
                    class="pricing-input num"
                    type="number"
                    min="0"
                    step="1"
                    @input="recalcPricingRowAmount(row)"
                  />
                </td>
                <td class="pricing-formula">
                  {{ formatPricingFormula(row) }}
                </td>
                <td class="num">
                  <input
                    v-model.number="row.amount"
                    class="pricing-input num"
                    type="number"
                    min="0"
                    step="1"
                  />
                </td>
                <td>
                  <div class="pricing-row-actions">
                    <button
                      class="btn-mini"
                      type="button"
                      @click="removePricingItem(idx)"
                    >
                      刪除
                    </button>
                  </div>
                </td>
              </tr>
              <tr v-if="!editablePricingRows.length">
                <td colspan="7" class="muted small">
                  尚未有計價項目，請按「新增項目」或「一鍵帶入繪圖資料」。
                </td>
              </tr>
            </tbody>
          </table>
          <div class="pricing-summary">
            <span>小計：{{ fmtCurrency(pricingSubtotal) }}</span>
            <span>稅額：{{ fmtCurrency(pricingTaxAmount) }}</span>
            <span class="total"
              >含稅總計：{{ fmtCurrency(pricingGrandTotal) }}</span
            >
          </div>

          <div class="pricing-edit-grid">
            <div class="row">
              <label>深度標準 (cm)</label>
              <div class="inline">
                <select v-model.number="form.depthStandard" style="width: 80px">
                  <option :value="60">60</option>
                  <option :value="65">65</option>
                </select>
                <label
                  style="
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    font-size: 12px;
                    color: #555;
                    font-weight: normal;
                  "
                >
                  <input
                    type="checkbox"
                    v-model="form.depthProportional"
                    style="width: auto; height: auto"
                  />
                  超深比例換算
                </label>
              </div>
            </div>
            <div class="row">
              <label>單價 / cm</label>
              <div class="inline">
                <input
                  v-model.number="form.pricePerCm"
                  type="number"
                  min="0"
                  style="width: 120px"
                />
                <button
                  v-if="customerPricing?.defaultPricePerCm"
                  class="btn-mini"
                  type="button"
                  @click="form.pricePerCm = customerPricing.defaultPricePerCm"
                >
                  帶入預設
                </button>
              </div>
            </div>
            <div class="row">
              <label>未稅總價</label>
              <div class="inline">
                <input
                  v-model.number="form.total"
                  type="number"
                  min="0"
                  style="width: 140px"
                />
                <button
                  v-if="form.pricePerCm && form.countertop?.totalCm"
                  class="btn-mini"
                  type="button"
                  @click="
                    form.total = Math.round(
                      form.pricePerCm * form.countertop.totalCm,
                    )
                  "
                >
                  以長度計算
                </button>
              </div>
              <!-- 計價區顯示 -->
              <div
                style="
                  margin-top: 8px;
                  padding: 8px;
                  background: #f5f5f5;
                  border-radius: 4px;
                  font-size: 13px;
                  color: #333;
                  line-height: 1.8;
                  font-family: monospace;
                  width: 100%;
                "
              >
                <div
                  v-if="pricingFormulaDisplay"
                  style="display: flex; flex-direction: column; gap: 2px"
                >
                  <!-- 基礎計算 -->
                  <div v-if="pricingFormulaDisplay.mainItems.length">
                    <span
                      v-for="(item, idx) in pricingFormulaDisplay.mainItems"
                      :key="idx"
                    >
                      <span v-if="idx > 0">+</span>@{{ item.unitPrice }}×{{
                        item.qty
                      }}={{ item.qty * item.unitPrice }}
                    </span>
                  </div>

                  <!-- 下嵌 -->
                  <div v-if="pricingFormulaDisplay.sinkItems.length">
                    下嵌{{ fmtCurrency(pricingFormulaDisplay.sinkSubtotal) }}
                  </div>

                  <!-- 上掛 + 合計 -->
                  <div
                    style="
                      display: flex;
                      gap: 20px;
                      justify-content: space-between;
                      align-items: center;
                    "
                  >
                    <div v-if="pricingFormulaDisplay.stoveItems.length">
                      上掛{{ fmtCurrency(pricingFormulaDisplay.stoveSubtotal) }}
                    </div>
                    <div v-else style="flex: 1"></div>
                    <div style="font-weight: 700; color: #d9534f">
                      合計{{ fmtCurrency(pricingFormulaDisplay.subtotal) }}
                    </div>
                  </div>

                  <!-- 其他開孔 -->
                  <div v-if="pricingFormulaDisplay.otherCutoutItems.length">
                    其他{{
                      fmtCurrency(pricingFormulaDisplay.otherCutoutSubtotal)
                    }}
                  </div>
                </div>
                <div v-else style="color: #999; font-style: italic">
                  尚無計價項目
                </div>
              </div>
            </div>
            <div class="row">
              <label>訂金</label>
              <input
                v-model.number="form.depositPaid"
                type="number"
                min="0"
                style="width: 140px"
              />
            </div>
            <div class="row">
              <label>付款備註</label>
              <input
                v-model="form.paymentNotes"
                type="text"
                placeholder="例如：尾款貨到收現"
              />
            </div>
          </div>
        </div>
      </section>

      <!-- 附件（原始圖檔 / 打板照）-->
      <section v-if="isEdit" class="card full">
        <h3>附件</h3>

        <!-- 原始圖檔 -->
        <div class="attach-section">
          <div class="attach-head">
            <span class="attach-label">原始圖檔</span>
            <button class="btn-mini" @click="designFileInputRef.click()">
              + 上傳
            </button>
            <input
              ref="designFileInputRef"
              type="file"
              accept="image/*,.pdf,.dwg,.dxf,.ai,.eps,.cdr"
              multiple
              style="display: none"
              @change="onDesignFiles"
            />
          </div>
          <p v-if="designUploading" class="hint">上傳中…</p>
          <ul v-if="designFiles.length" class="file-list">
            <li v-for="f in designFiles" :key="f.id">
              <a :href="f.url" target="_blank" rel="noopener">{{ f.name }}</a>
              <button
                class="btn-del"
                title="刪除"
                @click="deleteAttachment('designFiles', f)"
              >
                ×
              </button>
            </li>
          </ul>
          <p v-else-if="!designUploading" class="muted small">尚無原始圖檔</p>
        </div>

        <!-- 打板照 -->
        <div class="attach-section">
          <div class="attach-head">
            <span class="attach-label">打板照</span>
            <button class="btn-mini" @click="samplePhotoInputRef.click()">
              + 上傳
            </button>
            <input
              ref="samplePhotoInputRef"
              type="file"
              accept="image/*"
              multiple
              style="display: none"
              @change="onSamplePhotos"
            />
          </div>
          <p v-if="sampleUploading" class="hint">上傳中…</p>
          <div v-if="samplePhotos.length" class="photo-grid">
            <div v-for="f in samplePhotos" :key="f.id" class="photo-thumb">
              <img :src="f.url" :alt="f.name" @click="lightboxUrl = f.url" />
              <button
                class="thumb-del"
                title="刪除"
                @click="deleteAttachment('samplePhotos', f)"
              >
                ×
              </button>
            </div>
          </div>
          <p v-else-if="!sampleUploading" class="muted small">尚無打板照</p>
        </div>
      </section>

      <!-- 台面 -->
      <section class="card">
        <h3>台面</h3>
        <div class="row">
          <label>台面型別</label>
          <select v-model="form.countertop.type">
            <option value="">--</option>
            <option v-for="t in countertopTypes" :key="t" :value="t">
              {{ t }}
            </option>
          </select>
        </div>
        <div class="row">
          <label>總長 (cm)</label>
          <input
            v-model.number="form.countertop.totalCm"
            type="number"
            min="0"
          />
        </div>
        <div class="row">
          <label>後緣處理</label>
          <select v-model="form.rearTreatment">
            <option value="flush">套平</option>
            <option value="drop16">下降 1.6cm</option>
            <option value="none">平版 (無套板)</option>
            <option value="other">其他</option>
          </select>
        </div>
        <div class="row">
          <label>特殊作法</label>
          <div class="check-grid">
            <label v-for="m in specialMethods" :key="m" class="check-item">
              <input
                type="checkbox"
                :value="m"
                :checked="(form.specialMethods || []).includes(m)"
                @change="toggleSpecialMethod(m, $event.target.checked)"
              />
              {{ m }}
            </label>
          </div>
        </div>
      </section>

      <!-- 水槽 -->
      <section class="card">
        <header class="card-head">
          <h3>水槽 (最多 3 個)</h3>
          <button
            class="btn-mini"
            :disabled="form.sinks.length >= 3"
            @click="addSink"
          >
            + 新增水槽
          </button>
        </header>
        <datalist
          v-for="(_, di) in form.sinks"
          :key="'sdl-' + di"
          :id="'sink-dl-' + di"
        >
          <option
            v-for="m in sinkModels"
            :key="m.id"
            :value="(m.brand ? m.brand + ' ' : '') + m.model"
          />
        </datalist>
        <div v-for="(s, i) in form.sinks" :key="i" class="sink-row">
          <div class="sink-row-main">
            <input
              type="text"
              :value="(s.brand ? s.brand + ' ' : '') + s.model"
              :list="'sink-dl-' + i"
              placeholder="型號（可自行輸入）"
              @change="onSinkTextChange(i, $event.target.value)"
              class="sink-model-input"
            />
            <input
              v-model.number="s.bowlCount"
              type="number"
              min="1"
              max="3"
              placeholder="槽數"
              style="width: 60px"
            />
            <input
              v-model.number="s.holeWidthMm"
              type="number"
              placeholder="開孔長 mm"
            />
            <input
              v-model.number="s.holeDepthMm"
              type="number"
              placeholder="開孔寬 mm"
            />
            <input
              v-model.number="s.holeRadiusMm"
              type="number"
              placeholder="圓角 R"
              style="width: 80px"
            />
            <select v-model="s.method" style="width: 90px">
              <option value="">工法</option>
              <option v-for="m in sinkMethods" :key="m" :value="m">
                {{ m }}
              </option>
            </select>
            <label class="chk">
              <input type="checkbox" v-model="s.hasAccessory" />
              有配件
            </label>
            <button class="btn-del" @click="form.sinks.splice(i, 1)">×</button>
          </div>
          <div class="sink-row-note">
            <input v-model="s.note" type="text" placeholder="備註" />
          </div>
          <div class="sink-row-status">
            <span class="lbl">水槽狀態：</span>
            <label
              v-for="opt in SINK_STATUS_LIST"
              :key="opt.value"
              class="status-pill"
              :class="{ active: s.arrival === opt.value }"
              :style="
                s.arrival === opt.value
                  ? {
                      background: opt.bg,
                      color: opt.color,
                      borderColor: opt.color,
                    }
                  : {}
              "
            >
              <input
                type="radio"
                :value="opt.value"
                v-model="s.arrival"
                style="display: none"
              />
              {{ opt.label }}
            </label>
          </div>
        </div>
        <p v-if="!form.sinks.length" class="muted small">尚未加入水槽</p>

        <div class="row" style="margin-top: 8px">
          <label>水槽收到日</label>
          <input v-model="form.sinkReceivedAt" type="date" />
        </div>
      </section>

      <!-- 爐子 -->
      <section class="card">
        <header class="card-head">
          <h3>爐子 (最多 3 個)</h3>
          <button
            class="btn-mini"
            :disabled="form.stoves.length >= 3"
            @click="addStove"
          >
            + 新增爐子
          </button>
        </header>
        <datalist
          v-for="(_, di) in form.stoves"
          :key="'stdl-' + di"
          :id="'stove-dl-' + di"
        >
          <option
            v-for="m in stoveModels"
            :key="m.id"
            :value="(m.brand ? m.brand + ' ' : '') + m.model"
          />
        </datalist>
        <div v-for="(s, i) in form.stoves" :key="i" class="sub-row">
          <input
            type="text"
            :value="(s.brand ? s.brand + ' ' : '') + s.model"
            :list="'stove-dl-' + i"
            placeholder="型號（可自行輸入）"
            @change="onStoveTextChange(i, $event.target.value)"
            class="sink-model-input"
          />
          <input
            v-model.number="s.holeWidthMm"
            type="number"
            placeholder="開孔長 mm"
          />
          <input
            v-model.number="s.holeDepthMm"
            type="number"
            placeholder="開孔寬 mm"
          />
          <input
            v-model.number="s.holeRadiusMm"
            type="number"
            placeholder="圓角 R"
            style="width: 80px"
          />
          <select v-model="s.method" style="width: 110px">
            <option value="">工法</option>
            <option v-for="m in stoveMethods" :key="m" :value="m">
              {{ m }}
            </option>
          </select>
          <button class="btn-del" @click="form.stoves.splice(i, 1)">×</button>
        </div>
        <p v-if="!form.stoves.length" class="muted small">尚未加入爐子</p>
      </section>

      <!-- 切割/邊緣 -->
      <section class="card">
        <h3>生產指令</h3>
        <div class="row">
          <label>打板人員</label>
          <select v-model="form.templatingStaff">
            <option value="">-- 選擇 --</option>
            <option v-for="s in staffDept1" :key="s.id" :value="s.name">
              {{ s.name }}
            </option>
          </select>
        </div>
        <div class="row">
          <label>對圖人員</label>
          <select v-model="form.drawingStaff">
            <option value="">-- 選擇 --</option>
            <option v-for="s in staffDept1" :key="s.id" :value="s.name">
              {{ s.name }}
            </option>
          </select>
        </div>
        <div class="row">
          <label>安裝人員</label>
          <div class="check-grid">
            <label v-for="s in staffDept2" :key="s.id" class="check-item">
              <input
                type="checkbox"
                :value="s.name"
                :checked="(form.installStaff || []).includes(s.name)"
                @change="toggleInstallStaff(s.name, $event.target.checked)"
              />
              {{ s.name }}
            </label>
          </div>
        </div>
        <div class="row">
          <label>特殊備註</label>
          <textarea v-model="form.specialNotes" rows="3"></textarea>
        </div>
        <div class="row" v-if="userRole === 'admin' || userRole === '管理者'">
          <label>測試標記</label>
          <label
            style="
              display: flex;
              align-items: center;
              gap: 6px;
              font-weight: normal;
              cursor: pointer;
            "
          >
            <input
              type="checkbox"
              v-model="form.isTestData"
              style="width: auto; height: auto"
            />
            <span style="color: #e55"
              >此為測試資料（上線前可於管理介面批次清除）</span
            >
          </label>
        </div>
      </section>
    </div>

    <!-- 燈箱 -->
    <div v-if="lightboxUrl" class="lightbox" @click.self="lightboxUrl = ''">
      <img :src="lightboxUrl" />
      <button class="lb-close" @click="lightboxUrl = ''">✕</button>
    </div>

    <!-- 發單 dialog -->
    <IssuanceDialog
      v-if="showIssuanceDialog"
      :orderId="route.params.id"
      :snapshot="pendingSignSnapshot"
      :drawingVersions="pendingSignDrawingVersions"
      :current="toPayload()"
      @close="showIssuanceDialog = false"
      @issued="onIssued"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from "vue";
import { useRoute, useRouter, onBeforeRouteLeave } from "vue-router";
import {
  listCustomers,
  listProductModels,
  createSalesOrder,
  updateSalesOrder,
  getSalesOrder,
  listInventoryColors,
  getBrandMaterials,
  getOrderOptions,
  auth,
  getUserByUid,
  uploadOrderAttachment,
  listOrderAttachments,
  deleteOrderAttachment,
  listStaffByDept,
  sendConfirmation,
  getCustomerPricing,
  updateCustomerPricing,
  listOrderDrawings,
} from "../firebase";
import IssuanceDialog from "../components/IssuanceDialog.vue";
import { SINK_STATUS_LIST } from "../utils/sinkStatus";
import {
  DEFAULT_CATEGORIES,
  DEFAULT_COUNTERTOP_TYPES,
  DEFAULT_SPECIAL_METHODS,
  DEFAULT_SINK_METHODS,
  DEFAULT_STOVE_METHODS,
  mergeOrderOptions,
} from "../utils/orderOptions";

const userRole = ref("");
const customerPricing = ref(null);
const loadingPricingImport = ref(false);

// ─── 發單作業 ────────────────────────────────────────────────
const orderStatus = ref("");
const pendingSignSnapshot = ref(null);
const pendingSignDrawingVersions = ref({});
const showIssuanceDialog = ref(false);
const canSendConfirmation = computed(
  () => isEdit.value && (!orderStatus.value || orderStatus.value === "draft"),
);
const canIssue = computed(
  () => isEdit.value && orderStatus.value === "pendingSign",
);

async function onSendConfirmation() {
  if (
    !confirm(
      "確定要傳送確定單給客戶簽回嗎？\n（系統將記錄目前資料快照，狀態改為「待客戶簽回」）",
    )
  )
    return;
  try {
    await updateSalesOrder(route.params.id, toPayload());
    const snapshot = toPayload();
    await sendConfirmation(route.params.id, snapshot);
    pendingSignSnapshot.value = snapshot;
    pendingSignDrawingVersions.value = {}; // 傳確定單後 firebase 側已記錄最新版本，這裡清空讓 dialog 重新從 Firestore 載
    orderStatus.value = "pendingSign";
    alert("已傳送確定單！狀態更新為「待客戶簽回」");
  } catch (e) {
    console.error(e);
    alert("操作失敗：" + (e?.message || e));
  }
}

function onIssued(orderNo) {
  showIssuanceDialog.value = false;
  orderStatus.value = "confirmed";
  alert(`發單成功！訂單號：${orderNo}\n即將跳轉確定單頁面封存PDF。`);
  router.push({ name: "order-confirmation", params: { id: route.params.id } });
}

// ─── 附件 ────────────────────────────────────────────────
const designFileInputRef = ref(null);
const samplePhotoInputRef = ref(null);
const designFiles = ref([]);
const samplePhotos = ref([]);
const designUploading = ref(false);
const sampleUploading = ref(false);
const lightboxUrl = ref("");

async function onDesignFiles(e) {
  const files = [...(e.target.files || [])];
  e.target.value = "";
  if (!files.length) return;
  designUploading.value = true;
  try {
    for (const file of files) {
      const item = await uploadOrderAttachment(
        route.params.id,
        "designFiles",
        file,
      );
      designFiles.value.unshift(item);
    }
  } catch (err) {
    alert("上傳失敗：" + (err?.message || err));
  } finally {
    designUploading.value = false;
  }
}

async function onSamplePhotos(e) {
  const files = [...(e.target.files || [])];
  e.target.value = "";
  if (!files.length) return;
  sampleUploading.value = true;
  try {
    for (const file of files) {
      const item = await uploadOrderAttachment(
        route.params.id,
        "samplePhotos",
        file,
      );
      samplePhotos.value.unshift(item);
    }
  } catch (err) {
    alert("上傳失敗：" + (err?.message || err));
  } finally {
    sampleUploading.value = false;
  }
}

async function deleteAttachment(category, f) {
  if (!confirm(`確定刪除「${f.name}」？`)) return;
  await deleteOrderAttachment(route.params.id, category, f.id, f.storagePath);
  if (category === "designFiles") {
    designFiles.value = designFiles.value.filter((x) => x.id !== f.id);
  } else {
    samplePhotos.value = samplePhotos.value.filter((x) => x.id !== f.id);
  }
}

// 品牌→材質對應（依公司現有徫存品牌）
// quartz 石英石 / porcelain 陶板 / granite 人造石 / other
const BRAND_MATERIAL_MAP = {
  // 石英石
  賽麗石: "quartz",
  silestone: "quartz",
  帝通石: "quartz",
  廓石: "quartz",
  // 陶板 / 焝結石
  abk: "porcelain",
  耐麗石: "porcelain",
  neolith: "porcelain",
  鉈鋼石: "porcelain",
};

function materialTypeForBrand(brand) {
  if (!brand) return "quartz";
  const raw = String(brand).trim();
  const key = raw.toLowerCase();
  // 使用者自訂優先
  if (customBrandMap.value[raw]) return customBrandMap.value[raw];
  if (customBrandMap.value[key]) return customBrandMap.value[key];
  return BRAND_MATERIAL_MAP[key] || BRAND_MATERIAL_MAP[raw] || "quartz";
}

const MATERIAL_LABEL = {
  quartz: "石英石",
  porcelain: "陶板",
  granite: "人造石",
  other: "其他",
};

// 訂單下拉選項（可在「訂單設定」頁覆寫）
const orderCategories = ref(DEFAULT_CATEGORIES);
const countertopTypes = ref(DEFAULT_COUNTERTOP_TYPES);
const specialMethods = ref(DEFAULT_SPECIAL_METHODS);
const sinkMethods = ref(DEFAULT_SINK_METHODS);
const stoveMethods = ref(DEFAULT_STOVE_METHODS);

const route = useRoute();
const router = useRouter();
const isEdit = computed(() => !!route.params.id);

const loading = ref(true);
const saving = ref(false);
const error = ref("");
const savedFormSignature = ref("");
const formReady = ref(false);

const customers = ref([]);
const sinkModels = ref([]);
const stoveModels = ref([]);
const inventoryColors = ref([]);
const customBrandMap = ref({});
const staffDept1 = ref([]);
const staffDept2 = ref([]);

// 唯一品牌清單
const brands = computed(() => {
  const set = new Set();
  inventoryColors.value.forEach((c) => {
    if (c.brand) set.add(String(c.brand).trim());
  });
  return [...set].sort((a, b) => a.localeCompare(b, "zh-Hant"));
});

// 某品牌下的色號清單
function colorsForBrand(brand) {
  if (!brand) return [];
  return inventoryColors.value
    .filter((c) => String(c.brand || "").trim() === brand)
    .map((c) => ({ color: c.color, id: c.id }))
    .sort((a, b) =>
      String(a.color || "").localeCompare(String(b.color || ""), "zh-Hant"),
    );
}

const customerKeyword = ref("");
const showCustomerList = ref(false);

function newSink() {
  return {
    modelId: "",
    brand: "",
    model: "",
    bowlCount: 1,
    holeWidthMm: null,
    holeDepthMm: null,
    holeRadiusMm: null,
    method: "",
    arrival: "notArrived",
    hasAccessory: false,
    note: "",
  };
}
function newStove() {
  return {
    modelId: "",
    brand: "",
    model: "",
    holeWidthMm: null,
    holeDepthMm: null,
    holeRadiusMm: null,
    method: "",
  };
}

const form = ref({
  customerId: "",
  customerName: "",
  customerContact: { name: "", phone: "" },
  owner: { name: "", phone: "" },
  siteAddress: "",
  category: "",
  customerOrderNo: "",
  stones: [],
  countertop: { type: "", totalCm: null },
  rearTreatment: "flush",
  specialMethods: [],
  sinks: [],
  stoves: [],
  cutMethod: "factory",
  openEdges: { left: false, right: false },
  extraMm: null,
  templatingDate: "",
  finishingDate: "",
  templatingStaff: "",
  drawingStaff: "",
  installStaff: [],
  promisedAt: "",
  sinkReceivedAt: "",
  specialNotes: "",
  isTestData: false,
  pricePerCm: null,
  subtotal: null,
  total: null,
  grandTotal: null,
  taxRate: 0.05,
  depositPaid: null,
  paymentNotes: "",
  lineItems: [],
  depthStandard: 60,
  depthProportional: true,
});

function buildFormSignature() {
  return JSON.stringify(toPayload());
}

function refreshSavedFormSignature() {
  savedFormSignature.value = buildFormSignature();
}

const hasUnsavedChanges = computed(
  () =>
    formReady.value &&
    !loading.value &&
    buildFormSignature() !== savedFormSignature.value,
);

function handleBeforeUnload(event) {
  if (!hasUnsavedChanges.value) return;
  event.preventDefault();
  event.returnValue = "";
}

const filteredCustomers = computed(() => {
  const kw = customerKeyword.value.trim().toLowerCase();
  if (!kw) return customers.value;
  return customers.value.filter(
    (c) =>
      (c.code || "").toLowerCase().includes(kw) ||
      (c.name || "").toLowerCase().includes(kw),
  );
});

const suggestedPrices = computed(() => {
  if (!customerPricing.value) return [];
  const result = [];
  const prices = customerPricing.value.stonePrices || {};
  for (const s of form.value.stones || []) {
    const key = [s.brand, s.color].filter(Boolean).join("/");
    if (key && prices[key] != null) {
      result.push({
        key,
        label: `${s.brand} ${s.color}`.trim(),
        price: Number(prices[key]) || 0,
      });
    }
  }
  return result;
});

function toNum(val) {
  const n = Number(val);
  return Number.isFinite(n) ? n : 0;
}

function normalizePricingItem(row = {}) {
  const description = String(row?.description || row?.name || "").trim();
  const qty = toNum(row?.qty);
  const unitPrice = toNum(row?.unitPrice);
  const existingAmount = Number(row?.amount);
  const amount = Number.isFinite(existingAmount)
    ? existingAmount
    : Math.round(qty * unitPrice);
  return {
    ...row,
    description,
    name: description,
    qty,
    unit: String(row?.unit || "").trim(),
    unitPrice,
    amount,
  };
}

function normalizePricingItems(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => normalizePricingItem(row));
}

function fillMissingUnitPrices(rows, defaultPrice) {
  if (!Array.isArray(rows) || !defaultPrice) return rows;
  return rows.map((row) => {
    if (row.unitPrice === 0 || !row.unitPrice) {
      return {
        ...row,
        unitPrice: defaultPrice,
        amount: Math.round((row.qty || 0) * defaultPrice),
      };
    }
    return row;
  });
}

function parseLoosePositive(val) {
  const n = Number(val);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

const DRAWING_TYPE_ALIASES = {
  straight: ["straight", "one", "一字", "一字型", "直線", "直線型"],
  "l-shape": ["l-shape", "l", "l型", "l 型", "L", "L型", "L 型"],
  "m-shape": ["m-shape", "m", "m型", "m 型", "M", "M型", "M 型"],
  island: ["island", "中島", "島", "中岛"],
};

const DRAWING_TYPE_LABELS = {
  straight: "一字型",
  "l-shape": "L型",
  "m-shape": "M型",
  island: "中島",
};

function normalizeDrawingType(type) {
  const raw = String(type || "").trim();
  if (!raw) return "straight";
  const rawLower = raw.toLowerCase();
  for (const [normalized, aliases] of Object.entries(DRAWING_TYPE_ALIASES)) {
    if (aliases.some((alias) => alias.toLowerCase() === rawLower)) {
      return normalized;
    }
  }
  return rawLower;
}

function isIslandDrawing(type) {
  return normalizeDrawingType(type) === "island";
}

function getDrawingTypeLabel(type) {
  const normalized = normalizeDrawingType(type);
  return DRAWING_TYPE_LABELS[normalized] || String(type || "").trim() || "繪圖";
}

function formatCmNumber(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "0";
  const rounded = Math.round(n * 100) / 100;
  return String(rounded)
    .replace(/\.0+$/, "")
    .replace(/(\.\d*[1-9])0+$/, "$1");
}

function sumPositiveList(values) {
  if (!Array.isArray(values)) return 0;
  const total = values.reduce(
    (sum, value) => sum + parseLoosePositive(value),
    0,
  );
  return Math.round(total * 100) / 100;
}

function calcDepthFactor(
  actualDepth,
  standard,
  proportional,
  backHeight = 4,
  frontHeight = 4,
) {
  if (!proportional) return 1;
  const d = parseLoosePositive(actualDepth);
  const threshold = parseLoosePositive(standard) || 60;
  const base = 60;
  if (!d) return 1;
  const back = parseLoosePositive(backHeight) || 4;
  const front =
    frontHeight != null && Number.isFinite(Number(frontHeight))
      ? Math.max(Number(frontHeight), 0)
      : 4;
  const adjustedDepth = Math.max(front + back + d - 8, 0);
  if (adjustedDepth <= threshold) return 1;
  return Math.round((adjustedDepth / base) * 1000) / 1000;
}

function getDrawingLengthByType(type, state, depthOpts) {
  const normalized = normalizeDrawingType(type);
  const std = parseLoosePositive(depthOpts?.standard) || 60;
  const prop = depthOpts?.proportional !== false;
  const back = parseLoosePositive(state?.backHeight ?? 4) || 4;
  const rawThick =
    state?.counterThick != null ? parseLoosePositive(state.counterThick) : 4;
  const front = rawThick <= 1.5 ? 0 : rawThick || 4;
  if (normalized === "straight") {
    const rawLen = sumPositiveList(state?.cabins || []);
    const f = calcDepthFactor(state?.depthVal ?? 60, std, prop, back, front);
    return Math.round(rawLen * f);
  }
  if (normalized === "l-shape") {
    const left = sumPositiveList(state?.leftCabins || []);
    const right = sumPositiveList(state?.rightCabins || []);
    const corner =
      Math.min(
        parseLoosePositive(state?.leftDepth ?? 0),
        parseLoosePositive(state?.rightDepth ?? 0),
      ) / 2;
    const fl = calcDepthFactor(state?.leftDepth ?? 60, std, prop, back, front);
    const fr = calcDepthFactor(state?.rightDepth ?? 60, std, prop, back, front);
    return Math.round(left * fl + right * fr - corner);
  }
  if (normalized === "m-shape") {
    const mid = sumPositiveList(state?.midCabins || []);
    const left = sumPositiveList(state?.leftArmCabins || []);
    const right = sumPositiveList(state?.rightArmCabins || []);
    const midDepth = parseLoosePositive(state?.midDepth ?? 0);
    const leftCorner =
      Math.min(midDepth, parseLoosePositive(state?.leftArmDepth ?? 0)) / 2;
    const rightCorner =
      Math.min(midDepth, parseLoosePositive(state?.rightArmDepth ?? 0)) / 2;
    const fm = calcDepthFactor(state?.midDepth ?? 60, std, prop, back, front);
    const fl = calcDepthFactor(
      state?.leftArmDepth ?? 60,
      std,
      prop,
      back,
      front,
    );
    const fr = calcDepthFactor(
      state?.rightArmDepth ?? 60,
      std,
      prop,
      back,
      front,
    );
    return Math.round(
      mid * fm + left * fl + right * fr - leftCorner - rightCorner,
    );
  }
  if (normalized === "island") {
    const rawLen = deriveIslandTotalLengthFromState(state);
    const f = calcDepthFactor(state?.form?.depth ?? 60, std, prop, back, front);
    return Math.round(rawLen * f);
  }
  return 0;
}

function depthScaledTerm(
  length,
  actualDepth,
  standard,
  proportional,
  backHeight = 4,
  frontHeight = 4,
) {
  const len = parseLoosePositive(length);
  if (!len) return "0";
  const threshold = parseLoosePositive(standard) || 60;
  const base = 60;
  const d = parseLoosePositive(actualDepth);
  const back = parseLoosePositive(backHeight) || 4;
  const front =
    frontHeight != null && Number.isFinite(Number(frontHeight))
      ? Math.max(Number(frontHeight), 0)
      : 4;
  if (!proportional || !d) return formatCmNumber(len);
  const totalUse = front + back + d;
  const adjustedDepth = Math.max(totalUse - 8, 0);
  if (adjustedDepth <= threshold) return formatCmNumber(len);
  return `${formatCmNumber(len)}×((${formatCmNumber(totalUse)}-8)/${formatCmNumber(base)})`;
}

function getDrawingLengthFormula(type, state, depthOpts) {
  const normalized = normalizeDrawingType(type);
  const std = parseLoosePositive(depthOpts?.standard) || 60;
  const prop = depthOpts?.proportional !== false;
  const back = parseLoosePositive(state?.backHeight ?? 4) || 4;
  const rawThick =
    state?.counterThick != null ? parseLoosePositive(state.counterThick) : 4;
  const front = rawThick <= 1.5 ? 0 : rawThick || 4;
  if (normalized === "straight") {
    const rawLen = sumPositiveList(state?.cabins || []);
    return depthScaledTerm(
      rawLen,
      state?.depthVal ?? 60,
      std,
      prop,
      back,
      front,
    );
  }
  if (normalized === "l-shape") {
    const left = sumPositiveList(state?.leftCabins || []);
    const right = sumPositiveList(state?.rightCabins || []);
    const shallow = Math.min(
      parseLoosePositive(state?.leftDepth ?? 0),
      parseLoosePositive(state?.rightDepth ?? 0),
    );
    const leftExpr = depthScaledTerm(
      left,
      state?.leftDepth ?? 60,
      std,
      prop,
      back,
      front,
    );
    const rightExpr = depthScaledTerm(
      right,
      state?.rightDepth ?? 60,
      std,
      prop,
      back,
      front,
    );
    return `${leftExpr}+${rightExpr}-${formatCmNumber(shallow / 2)}(轉角)`;
  }
  if (normalized === "m-shape") {
    const mid = sumPositiveList(state?.midCabins || []);
    const left = sumPositiveList(state?.leftArmCabins || []);
    const right = sumPositiveList(state?.rightArmCabins || []);
    const midDepth = parseLoosePositive(state?.midDepth ?? 0);
    const leftShallow = Math.min(
      midDepth,
      parseLoosePositive(state?.leftArmDepth ?? 0),
    );
    const rightShallow = Math.min(
      midDepth,
      parseLoosePositive(state?.rightArmDepth ?? 0),
    );
    const midExpr = depthScaledTerm(
      mid,
      state?.midDepth ?? 60,
      std,
      prop,
      back,
      front,
    );
    const leftExpr = depthScaledTerm(
      left,
      state?.leftArmDepth ?? 60,
      std,
      prop,
      back,
      front,
    );
    const rightExpr = depthScaledTerm(
      right,
      state?.rightArmDepth ?? 60,
      std,
      prop,
      back,
      front,
    );
    return `${midExpr}+${leftExpr}+${rightExpr}-(${formatCmNumber(leftShallow)}/2+${formatCmNumber(rightShallow)}/2)`;
  }
  if (normalized === "island") {
    const f = state?.form || {};
    const rawLen = [
      f.plusLeft,
      f.box1,
      f.box2,
      f.box3,
      f.box4,
      f.box5,
      f.box6,
      f.box7,
      f.plusRight,
      f.frontWrap,
      f.backWrap,
    ]
      .map((v) => parseLoosePositive(v))
      .filter((v) => v > 0)
      .reduce((sum, v) => sum + v, 0);
    const parts = [
      f.plusLeft,
      f.box1,
      f.box2,
      f.box3,
      f.box4,
      f.box5,
      f.box6,
      f.box7,
      f.plusRight,
      f.frontWrap,
      f.backWrap,
    ]
      .map((v) => parseLoosePositive(v))
      .filter((v) => v > 0)
      .map((v) => formatCmNumber(v));
    const base = parts.join("+") || formatCmNumber(rawLen);
    const d = state?.form?.depth ?? 60;
    const islandExpr = depthScaledTerm(rawLen, d, std, prop, back, front);
    if (!islandExpr.includes("×")) return base;
    const totalUse = formatCmNumber(
      (parseLoosePositive(front) || 4) +
        (parseLoosePositive(back) || 4) +
        (parseLoosePositive(d) || 60),
    );
    return `(${base})×((${totalUse}-8)/60)`;
  }
  return "";
}

function getDrawingCutoutItems(type, state) {
  const normalized = normalizeDrawingType(type);
  if (normalized === "straight") {
    return [state?.sink1, state?.sink2, state?.stove1, state?.stove2].filter(
      Boolean,
    );
  }
  if (normalized === "l-shape") {
    return [
      ...(Array.isArray(state?.leftSinks) ? state.leftSinks : []),
      ...(Array.isArray(state?.leftStoves) ? state.leftStoves : []),
      ...(Array.isArray(state?.rightSinks) ? state.rightSinks : []),
      ...(Array.isArray(state?.rightStoves) ? state.rightStoves : []),
    ];
  }
  if (normalized === "m-shape") {
    return [
      ...(Array.isArray(state?.midSinks) ? state.midSinks : []),
      ...(Array.isArray(state?.midStoves) ? state.midStoves : []),
      ...(Array.isArray(state?.leftArmSinks) ? state.leftArmSinks : []),
      ...(Array.isArray(state?.leftArmStoves) ? state.leftArmStoves : []),
      ...(Array.isArray(state?.rightArmSinks) ? state.rightArmSinks : []),
      ...(Array.isArray(state?.rightArmStoves) ? state.rightArmStoves : []),
    ];
  }
  if (normalized === "island") {
    return [
      ...(Array.isArray(state?.sinks) ? state.sinks : []),
      ...(Array.isArray(state?.stoves) ? state.stoves : []),
    ];
  }
  return [];
}

function deriveIslandTotalLengthFromState(state) {
  const f = state?.form || {};
  const parts = [
    f.plusLeft,
    f.box1,
    f.box2,
    f.box3,
    f.box4,
    f.box5,
    f.box6,
    f.box7,
    f.plusRight,
    f.frontWrap,
    f.backWrap,
  ];
  const total = parts.reduce((sum, val) => sum + parseLoosePositive(val), 0);
  return Math.round(total * 100) / 100;
}

function buildCutoutLineItemsFromState(type, state, materialType) {
  const label = getDrawingTypeLabel(type);
  const items = getDrawingCutoutItems(type, state);
  const rows = [];

  // 一鍵帶入繪圖資料時，預設以現場常用工法帶入：
  // 水槽多數為下嵌，爐子多數為上掛。
  const defaultSinkMethod = "下嵌";
  const defaultStoveMethod = "上掛";

  items.forEach((item, index) => {
    if (!item?.enabled) return;
    const isStove = Object.prototype.hasOwnProperty.call(item, "stoveLength");
    const len = parseLoosePositive(
      isStove ? item?.stoveLength : item?.sinkLength,
    );
    const dep = parseLoosePositive(
      isStove ? item?.stoveDepth : item?.sinkDepth,
    );
    const sizeText = len && dep ? ` ${len}x${dep}cm` : "";
    const method =
      String(item?.method || "").trim() ||
      (isStove ? defaultStoveMethod : defaultSinkMethod);
    const baseLabel = isStove ? "爐具開孔" : "水槽開孔";
    rows.push(
      normalizePricingItem({
        description: `${label}${baseLabel}${index + 1}（${method}）${sizeText}`,
        qty: 1,
        unit: "孔",
        unitPrice: 0,
        amount: 0,
      }),
    );
  });

  return rows;
}

function buildLineItemsFromDrawingState(drawings, orderData) {
  const list = Array.isArray(drawings) ? drawings : [];

  // 若某種圖面 state 已帶 lineItems，直接優先使用
  for (const d of list) {
    const rows = normalizePricingItems(d?.state?.lineItems || []);
    if (rows.length) return rows;
  }

  const rows = [];
  const typeCounts = new Map();
  const stoneText =
    Array.isArray(orderData?.stones) && orderData.stones.length
      ? `${orderData.stones[0]?.brand || ""} ${orderData.stones[0]?.color || ""}`.trim()
      : "";
  const unitPrice =
    Number(orderData?.pricePerCm) ||
    Number(customerPricing.value?.defaultPricePerCm) ||
    0;

  const depthOpts = {
    standard: orderData?.depthStandard ?? form.value?.depthStandard ?? 60,
    proportional:
      orderData?.depthProportional !== false &&
      form.value?.depthProportional !== false,
  };

  for (const drawing of list) {
    if (!drawing?.state) continue;
    const label = getDrawingTypeLabel(drawing?.type);
    const normalizedType = normalizeDrawingType(drawing?.type);
    const seq = (typeCounts.get(normalizedType) || 0) + 1;
    typeCounts.set(normalizedType, seq);
    const totalLength = getDrawingLengthByType(
      drawing?.type,
      drawing.state,
      depthOpts,
    );
    if (totalLength > 0) {
      const formula = getDrawingLengthFormula(
        drawing?.type,
        drawing.state,
        depthOpts,
      );
      rows.push(
        normalizePricingItem({
          description: `${label}#${seq}（${formula}=${formatCmNumber(totalLength)}cm）${stoneText ? ` ${stoneText}` : ""}`,
          qty: totalLength,
          unit: "cm",
          unitPrice,
          amount: Math.round(totalLength * unitPrice),
        }),
      );
    }

    rows.push(
      ...buildCutoutLineItemsFromState(
        drawing?.type,
        drawing.state,
        orderData?.stones?.[0]?.materialType,
      ),
    );
  }

  return rows;
}

const editablePricingRows = computed(() => {
  if (!Array.isArray(form.value.lineItems)) form.value.lineItems = [];
  return form.value.lineItems;
});

const pricingRows = computed(() => {
  const rows = Array.isArray(form.value?.lineItems) ? form.value.lineItems : [];
  return rows
    .map((row) => ({
      description: String(row?.description || row?.name || "").trim(),
      qty: toNum(row?.qty),
      unit: String(row?.unit || "").trim(),
      unitPrice: toNum(row?.unitPrice),
      amount: toNum(row?.amount),
    }))
    .filter((row) => row.description || row.amount || row.unitPrice || row.qty);
});

const pricingSubtotal = computed(() => {
  if (pricingRows.value.length) {
    return pricingRows.value.reduce((sum, row) => sum + toNum(row.amount), 0);
  }
  const explicit = Number(form.value?.subtotal);
  return Number.isFinite(explicit) ? explicit : 0;
});

const pricingGrandTotal = computed(() => {
  if (pricingRows.value.length) {
    const taxRate = Number(form.value?.taxRate);
    const rate = Number.isFinite(taxRate) ? taxRate : 0.05;
    return Math.round(pricingSubtotal.value * (1 + rate));
  }
  const explicit = Number(form.value?.grandTotal);
  if (Number.isFinite(explicit)) return explicit;
  const fallbackTotal = Number(form.value?.total);
  if (Number.isFinite(fallbackTotal)) return fallbackTotal;
  const taxRate = Number(form.value?.taxRate);
  const rate = Number.isFinite(taxRate) ? taxRate : 0.05;
  return Math.round(pricingSubtotal.value * (1 + rate));
});

const pricingTaxAmount = computed(() => {
  const diff = pricingGrandTotal.value - pricingSubtotal.value;
  return diff > 0 ? diff : 0;
});

const pricingFormulaDisplay = computed(() => {
  const rows = pricingRows.value;
  if (!rows.length) return null;

  const mainItems = rows.filter((r) => String(r.unit || "").trim() === "cm");
  const cutoutItems = rows.filter((r) => String(r.unit || "").trim() !== "cm");

  // 分類開孔項目：下嵌（水槽）和上掛（爐子）
  const sinkItems = cutoutItems.filter((r) =>
    /水槽/.test(String(r.description || "")),
  );
  const stoveItems = cutoutItems.filter((r) =>
    /(火爐|爐|爐子|爐台|爐口|爐頭|爐位|瓦斯爐|瓦斯灶|電陶爐|電磁爐|感應爐|IH)/.test(
      String(r.description || ""),
    ),
  );
  const otherCutoutItems = cutoutItems.filter(
    (r) => !sinkItems.includes(r) && !stoveItems.includes(r),
  );

  const mainSubtotal = mainItems.reduce((sum, r) => sum + toNum(r.amount), 0);
  const sinkSubtotal = sinkItems.reduce((sum, r) => sum + toNum(r.amount), 0);
  const stoveSubtotal = stoveItems.reduce((sum, r) => sum + toNum(r.amount), 0);
  const otherCutoutSubtotal = otherCutoutItems.reduce(
    (sum, r) => sum + toNum(r.amount),
    0,
  );
  const cutoutSubtotal = sinkSubtotal + stoveSubtotal + otherCutoutSubtotal;
  const taxRate = Number(form.value?.taxRate) || 0.05;

  return {
    mainItems,
    sinkItems,
    stoveItems,
    otherCutoutItems,
    mainSubtotal,
    sinkSubtotal,
    stoveSubtotal,
    otherCutoutSubtotal,
    cutoutSubtotal,
    subtotal: pricingSubtotal.value,
    taxRate,
    taxAmount: pricingTaxAmount.value,
    grandTotal: pricingGrandTotal.value,
  };
});

function fmtCurrency(val) {
  const n = toNum(val);
  return n.toLocaleString("zh-TW");
}

function syncPricingName(row) {
  if (!row || typeof row !== "object") return;
  row.description = String(row.description || "").trim();
  row.name = row.description;
}

function recalcPricingRowAmount(row) {
  if (!row || typeof row !== "object") return;
  row.qty = toNum(row.qty);
  row.unitPrice = toNum(row.unitPrice);
  row.amount = Math.round(row.qty * row.unitPrice);
  syncPricingName(row);
}

function formatPricingFormula(row) {
  if (!row || typeof row !== "object") return "";
  const qty = toNum(row.qty);
  const unitPrice = toNum(row.unitPrice);
  const amount = toNum(row.amount);
  const unit = String(row.unit || "").trim();
  if (!qty && !unitPrice && !amount) return "";
  const qtyText = Number.isInteger(qty) ? qty : Math.round(qty * 100) / 100;
  const unitText = unit || "";
  return `${qtyText}${unitText ? unitText : ""} × ${fmtCurrency(unitPrice)} = ${fmtCurrency(amount)}`;
}

function addPricingItem() {
  if (!Array.isArray(form.value.lineItems)) form.value.lineItems = [];
  form.value.lineItems.push(
    normalizePricingItem({
      description: "",
      qty: 1,
      unit: "式",
      unitPrice: 0,
      amount: 0,
    }),
  );
}

function removePricingItem(index) {
  if (!Array.isArray(form.value.lineItems)) return;
  form.value.lineItems.splice(index, 1);
}

function recalcPricingTotals() {
  const subtotal = pricingRows.value.reduce(
    (sum, row) => sum + toNum(row.amount),
    0,
  );
  const taxRate = Number(form.value.taxRate);
  const rate = Number.isFinite(taxRate) ? taxRate : 0.05;
  form.value.subtotal = subtotal;
  form.value.total = subtotal;
  form.value.grandTotal = Math.round(subtotal * (1 + rate));
}

function formatPricingRowPreview(row, idx) {
  const item = normalizePricingItem(row);
  const desc = item.description || `項目${idx + 1}`;
  const qtyText = Number.isFinite(Number(item.qty))
    ? Number(item.qty).toLocaleString("zh-TW")
    : "0";
  const unitText = item.unit || "式";
  const unitPriceText = Number(item.unitPrice || 0).toLocaleString("zh-TW");
  const amountText = Number(item.amount || 0).toLocaleString("zh-TW");
  return `${idx + 1}. ${desc}｜${qtyText}${unitText} x ${unitPriceText} = ${amountText}`;
}

function buildPricingImportPreviewText(rows) {
  if (!Array.isArray(rows) || !rows.length) return "（無可帶入項目）";
  const lines = rows
    .slice(0, 20)
    .map((row, idx) => formatPricingRowPreview(row, idx));
  if (rows.length > 20) {
    lines.push(`...其餘 ${rows.length - 20} 項省略`);
  }
  return lines.join("\n");
}

async function importPricingFromDrawing() {
  if (!isEdit.value) return;
  loadingPricingImport.value = true;
  try {
    const latest = await getSalesOrder(route.params.id);
    const drawings = await listOrderDrawings(route.params.id);
    let rows = buildLineItemsFromDrawingState(drawings, latest);
    if (!rows.length) {
      rows = normalizePricingItems(latest?.lineItems || []);
    }

    if (!rows.length) {
      alert("找不到可帶入的繪圖計價資料（中島圖若只有尺寸，請先設定單價 /cm）");
      return;
    }

    const previewText = buildPricingImportPreviewText(rows);
    const ok = confirm(
      `要以目前「繪圖頁已儲存」的計價資料覆蓋此區內容嗎？\n\n帶入明細：\n${previewText}`,
    );
    if (!ok) return;

    // 從舊的 lineItems 中恢復已有的價格
    const oldItems = form.value.lineItems || [];
    rows = rows.map((newRow) => {
      // 先嘗試用 description 匹配
      const matchedOld = oldItems.find(
        (old) =>
          String(old.description || "").trim() ===
          String(newRow.description || "").trim(),
      );
      if (matchedOld && Number(matchedOld.unitPrice) > 0) {
        return {
          ...newRow,
          unitPrice: Number(matchedOld.unitPrice),
          amount: Math.round((newRow.qty || 0) * Number(matchedOld.unitPrice)),
        };
      }
      return newRow;
    });

    form.value.lineItems = rows;

    const taxRate = Number(latest?.taxRate);
    if (Number.isFinite(taxRate)) form.value.taxRate = taxRate;
    if (Number.isFinite(Number(latest?.pricePerCm)))
      form.value.pricePerCm = Number(latest.pricePerCm);

    if (Number.isFinite(Number(latest?.subtotal)))
      form.value.subtotal = Number(latest.subtotal);
    if (Number.isFinite(Number(latest?.total)))
      form.value.total = Number(latest.total);
    if (Number.isFinite(Number(latest?.grandTotal)))
      form.value.grandTotal = Number(latest.grandTotal);

    if (
      !Number.isFinite(Number(form.value.subtotal)) ||
      !Number.isFinite(Number(form.value.grandTotal)) ||
      rows.length
    ) {
      recalcPricingTotals();
    }

    alert(`已帶入繪圖計價資料（共 ${rows.length} 項）`);
  } catch (e) {
    console.error(e);
    alert("帶入失敗：" + (e?.message || e));
  } finally {
    loadingPricingImport.value = false;
  }
}

async function pickCustomer(c) {
  form.value.customerId = c.code || c.id;
  form.value.customerName = c.name || "";
  if (c.phone && !form.value.customerContact.phone) {
    form.value.customerContact.phone = c.phone;
  }
  customerKeyword.value = `${c.code || ""} ${c.name || ""}`.trim();
  showCustomerList.value = false;
  customerPricing.value = await getCustomerPricing(form.value.customerId);
  if (customerPricing.value?.defaultPricePerCm && !form.value.pricePerCm) {
    form.value.pricePerCm = customerPricing.value.defaultPricePerCm;
    // 補充 lineItems 中為 0 的 unitPrice
    form.value.lineItems = fillMissingUnitPrices(
      form.value.lineItems,
      customerPricing.value.defaultPricePerCm,
    );
  }
  if (customerPricing.value?.depthStandard)
    form.value.depthStandard = Number(customerPricing.value.depthStandard);
  if (customerPricing.value?.depthProportional !== undefined)
    form.value.depthProportional = customerPricing.value.depthProportional;
}

function toggleSpecialMethod(name, checked) {
  if (!Array.isArray(form.value.specialMethods)) form.value.specialMethods = [];
  const arr = form.value.specialMethods;
  const idx = arr.indexOf(name);
  if (checked && idx < 0) arr.push(name);
  if (!checked && idx >= 0) arr.splice(idx, 1);
}

function toggleInstallStaff(name, checked) {
  if (!Array.isArray(form.value.installStaff)) form.value.installStaff = [];
  const arr = form.value.installStaff;
  const idx = arr.indexOf(name);
  if (checked && idx < 0) arr.push(name);
  if (!checked && idx >= 0) arr.splice(idx, 1);
}

function addStone() {
  form.value.stones.push({
    brand: "",
    color: "",
    modelCode: "",
    materialType: "quartz",
    freeInput: false,
  });
}

function toggleStoneFreeInput(i) {
  const s = form.value.stones[i];
  s.freeInput = !s.freeInput;
  // 切換時清空當下值，避免下拉模式留下非清單值
  if (!s.freeInput) {
    s.brand = "";
    s.color = "";
    s.modelCode = "";
    s.materialType = "other";
  }
}

function onStoneBrandChange(i) {
  const s = form.value.stones[i];
  s.color = "";
  s.modelCode = "";
  s.materialType = materialTypeForBrand(s.brand);
}

function onStoneColorChange(i) {
  const s = form.value.stones[i];
  const hit = inventoryColors.value.find(
    (c) => String(c.brand || "").trim() === s.brand && c.color === s.color,
  );
  if (hit) {
    s.modelCode = hit.id || "";
  }
}

function addSink() {
  if (form.value.sinks.length >= 3) return;
  form.value.sinks.push(newSink());
}

function addStove() {
  if (form.value.stoves.length >= 3) return;
  form.value.stoves.push(newStove());
}

function onSinkTextChange(i, text) {
  const s = form.value.sinks[i];
  const t = text.trim();
  // Try to match against inventory list (by "Brand Model" or just "Model")
  const m = sinkModels.value.find(
    (x) => (x.brand ? x.brand + " " : "") + x.model === t || x.model === t,
  );
  if (m) {
    s.modelId = m.id;
    s.brand = m.brand || "";
    s.model = m.model || "";
    if (m.holeWidthMm) s.holeWidthMm = m.holeWidthMm;
    if (m.holeDepthMm) s.holeDepthMm = m.holeDepthMm;
    if (m.holeRadiusMm) s.holeRadiusMm = m.holeRadiusMm;
    if (m.bowlCount) s.bowlCount = m.bowlCount;
  } else {
    // Free text — store as model name, clear inventory link
    s.modelId = "";
    s.brand = "";
    s.model = t;
  }
}
function onSinkModelChange(i) {
  // kept for compatibility (unused now)
}

function onStoveTextChange(i, text) {
  const s = form.value.stoves[i];
  const t = text.trim();
  const m = stoveModels.value.find(
    (x) => (x.brand ? x.brand + " " : "") + x.model === t || x.model === t,
  );
  if (m) {
    s.modelId = m.id;
    s.brand = m.brand || "";
    s.model = m.model || "";
    if (m.holeWidthMm) s.holeWidthMm = m.holeWidthMm;
    if (m.holeDepthMm) s.holeDepthMm = m.holeDepthMm;
    if (m.holeRadiusMm) s.holeRadiusMm = m.holeRadiusMm;
  } else {
    s.modelId = "";
    s.brand = "";
    s.model = t;
  }
}
function onStoveModelChange(i) {
  // kept for compatibility (unused now)
}

function toDateInputStr(val) {
  if (!val) return "";
  let d;
  if (val?.toDate) d = val.toDate();
  else {
    const n = Number(val);
    if (!isNaN(n) && n > 0 && n < 100000)
      d = new Date((n - 25569) * 86400 * 1000);
    else if (!isNaN(n) && n >= 1000000000000) d = new Date(n);
    else d = new Date(String(val).slice(0, 10));
  }
  if (!d || isNaN(d)) return "";
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function toPayload() {
  const f = form.value;
  const trimDate = (v) => (v && String(v).trim()) || null;
  const numOrNull = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  return {
    customerId: f.customerId || "",
    customerName: f.customerName || "",
    customerContact: { ...f.customerContact },
    owner: { ...f.owner },
    siteAddress: f.siteAddress || "",
    category: f.category || "",
    customerOrderNo: f.customerOrderNo || "",
    stones: f.stones.map((s) => ({ ...s })),
    countertop: { ...f.countertop },
    rearTreatment: f.rearTreatment || "flush",
    specialMethods: Array.isArray(f.specialMethods)
      ? [...f.specialMethods]
      : [],
    sinks: f.sinks.map((s) => ({ ...s })),
    stoves: f.stoves.map((s) => ({ ...s })),
    cutMethod: f.cutMethod || "factory",
    openEdges: { ...f.openEdges },
    extraMm: f.extraMm || null,
    templatingDate: trimDate(f.templatingDate),
    finishingDate: trimDate(f.finishingDate),
    templatingStaff: f.templatingStaff || "",
    drawingStaff: f.drawingStaff || "",
    installStaff: Array.isArray(f.installStaff)
      ? f.installStaff
      : f.installStaff
        ? [f.installStaff]
        : [],
    promisedAt: trimDate(f.promisedAt),
    sinkReceivedAt: trimDate(f.sinkReceivedAt),
    specialNotes: f.specialNotes || "",
    isTestData: f.isTestData === true,
    pricePerCm: numOrNull(f.pricePerCm),
    subtotal: numOrNull(f.subtotal),
    total: numOrNull(f.total),
    grandTotal: numOrNull(f.grandTotal),
    taxRate: numOrNull(f.taxRate),
    depositPaid: numOrNull(f.depositPaid),
    paymentNotes: f.paymentNotes || "",
    depthStandard: numOrNull(f.depthStandard) ?? 60,
    depthProportional: f.depthProportional !== false,
    lineItems: Array.isArray(f.lineItems)
      ? f.lineItems.map((li) => ({
          ...li,
          description: String(li?.description || li?.name || "").trim(),
          name: String(li?.description || li?.name || "").trim(),
          unit: String(li?.unit || "").trim(),
          qty: numOrNull(li?.qty),
          unitPrice: numOrNull(li?.unitPrice),
          amount: numOrNull(li?.amount),
        }))
      : [],
  };
}

async function onSave({
  showSuccess = true,
  showFailure = true,
  redirectAfterCreate = true,
} = {}) {
  if (!form.value.customerId) {
    if (showFailure) alert("請先選擇客戶");
    return false;
  }
  saving.value = true;
  try {
    form.value.lineItems = normalizePricingItems(form.value.lineItems);
    const payload = toPayload();
    let customerPricingSyncFailed = false;
    if (isEdit.value) {
      await updateSalesOrder(route.params.id, payload);
    } else {
      const id = await createSalesOrder(payload);
      if (redirectAfterCreate) {
        router.replace({ name: "order-edit", params: { id } });
      }
    }

    const syncCustomerPricingSafely = async (pricingPayload) => {
      try {
        await updateCustomerPricing(form.value.customerId, pricingPayload);
        customerPricing.value = await getCustomerPricing(form.value.customerId);
      } catch (pricingErr) {
        console.warn(
          "updateCustomerPricing skipped during order save",
          pricingErr,
        );
        customerPricingSyncFailed = true;
      }
    };

    if (form.value.customerId && Number(form.value.pricePerCm) > 0) {
      const stonePrices = {};
      for (const s of form.value.stones || []) {
        const key = [s.brand, s.color].filter(Boolean).join("/");
        if (key) stonePrices[key] = Number(form.value.pricePerCm);
      }
      // 收集 lineItems 中所有非 0 的 unitPrice 用來記錄歷史價格
      const usedPrices = new Set();
      for (const item of form.value.lineItems || []) {
        if (Number(item.unitPrice) > 0) {
          usedPrices.add(Number(item.unitPrice));
        }
      }
      const mainPrice =
        usedPrices.size === 1
          ? Array.from(usedPrices)[0]
          : Number(form.value.pricePerCm);
      await syncCustomerPricingSafely({
        customerName: form.value.customerName,
        stonePrices,
        defaultPricePerCm: mainPrice,
        depthStandard: Number(form.value.depthStandard) || 60,
        depthProportional: form.value.depthProportional !== false,
      });
    } else if (form.value.customerId && form.value.lineItems?.length) {
      // 即使 pricePerCm 為 0，也嘗試從 lineItems 中提取並保存價格歷史
      const usedPrices = new Set();
      for (const item of form.value.lineItems || []) {
        if (Number(item.unitPrice) > 0) {
          usedPrices.add(Number(item.unitPrice));
        }
      }
      if (usedPrices.size > 0) {
        const mainPrice = usedPrices.size === 1 ? Array.from(usedPrices)[0] : 0;
        if (mainPrice > 0) {
          await syncCustomerPricingSafely({
            customerName: form.value.customerName,
            defaultPricePerCm: mainPrice,
            depthStandard: Number(form.value.depthStandard) || 60,
            depthProportional: form.value.depthProportional !== false,
          });
        }
      }
    }
    if (showSuccess) {
      if (isEdit.value) {
        alert(
          customerPricingSyncFailed
            ? "已更新訂單，但客戶價格偏好未同步"
            : "已更新",
        );
      } else {
        const createdId = route.params.id || "";
        alert(
          customerPricingSyncFailed
            ? `已建立訂單${createdId ? ` (id: ${createdId})` : ""}，但客戶價格偏好未同步`
            : `已建立訂單${createdId ? ` (id: ${createdId})` : ""}`,
        );
      }
    }
    refreshSavedFormSignature();
    return true;
  } catch (e) {
    console.error(e);
    if (showFailure) alert("儲存失敗：" + (e?.message || e));
    return false;
  } finally {
    saving.value = false;
  }
}

async function loadAll() {
  loading.value = true;
  formReady.value = false;
  error.value = "";
  try {
    const uid = auth.currentUser?.uid;
    if (uid) {
      const doc = await getUserByUid(uid);
      userRole.value = doc?.role || "";
    }
    const [cs, sinks, stoves, invColors, brandMap, orderOpts, sd1, sd2] =
      await Promise.all([
        listCustomers(),
        listProductModels("sink"),
        listProductModels("stove"),
        listInventoryColors(),
        getBrandMaterials(),
        getOrderOptions(),
        listStaffByDept("1"),
        listStaffByDept("2"),
      ]);
    customers.value = cs;
    sinkModels.value = sinks;
    stoveModels.value = stoves;
    inventoryColors.value = invColors;
    customBrandMap.value = brandMap || {};
    staffDept1.value = sd1;
    staffDept2.value = sd2;
    const merged = mergeOrderOptions(orderOpts);
    orderCategories.value = merged.categories;
    countertopTypes.value = merged.countertopTypes;
    specialMethods.value = merged.specialMethods;
    sinkMethods.value = merged.sinkMethods;
    stoveMethods.value = merged.stoveMethods;
    if (isEdit.value) {
      const doc = await getSalesOrder(route.params.id);
      if (!doc) {
        error.value = "找不到該訂單";
      } else {
        // 合併到 form（保留預設結構欄位）
        orderStatus.value = doc.status || "";
        pendingSignSnapshot.value = doc.pendingSignSnapshot || null;
        pendingSignDrawingVersions.value = doc.pendingSignDrawingVersions || {};
        Object.assign(form.value, doc, {
          customerContact: {
            ...form.value.customerContact,
            ...(doc.customerContact || {}),
          },
          owner: { ...form.value.owner, ...(doc.owner || {}) },
          countertop: { ...form.value.countertop, ...(doc.countertop || {}) },
          openEdges: { ...form.value.openEdges, ...(doc.openEdges || {}) },
          stones: doc.stones || [],
          sinks: (doc.sinks || []).map((s) => ({
            ...newSink(),
            ...s,
            note: String(s?.note || s?.deliveryNote || "").trim(),
          })),
          stoves: doc.stoves || [],
          lineItems: normalizePricingItems(doc.lineItems || []),
          specialMethods: Array.isArray(doc.specialMethods)
            ? doc.specialMethods
            : [],
          installStaff: Array.isArray(doc.installStaff)
            ? doc.installStaff
            : doc.installStaff
              ? [doc.installStaff]
              : [],
        });
        customerKeyword.value =
          `${doc.customerId || ""} ${doc.customerName || ""}`.trim();
        // 統一將 promisedAt 轉成 YYYY-MM-DD（相容 Excel 序號、毫秒時間戳）
        if (form.value.promisedAt) {
          form.value.promisedAt = toDateInputStr(form.value.promisedAt);
        }
        if (form.value.templatingDate) {
          form.value.templatingDate = toDateInputStr(form.value.templatingDate);
        }
        if (form.value.finishingDate) {
          form.value.finishingDate = toDateInputStr(form.value.finishingDate);
        }
        if (form.value.customerId) {
          customerPricing.value = await getCustomerPricing(
            form.value.customerId,
          );
          if (
            customerPricing.value?.defaultPricePerCm &&
            !form.value.pricePerCm
          ) {
            form.value.pricePerCm = customerPricing.value.defaultPricePerCm;
          }
          // 補充 lineItems 中為 0 的 unitPrice
          if (
            customerPricing.value?.defaultPricePerCm &&
            form.value.lineItems?.length
          ) {
            form.value.lineItems = fillMissingUnitPrices(
              form.value.lineItems,
              customerPricing.value.defaultPricePerCm,
            );
          }
          if (customerPricing.value?.depthStandard && !doc.depthStandard)
            form.value.depthStandard = Number(
              customerPricing.value.depthStandard,
            );
          if (
            customerPricing.value?.depthProportional !== undefined &&
            doc.depthProportional === undefined
          )
            form.value.depthProportional =
              customerPricing.value.depthProportional;
        }
      }
    }
    if (isEdit.value) {
      const [df, sp] = await Promise.all([
        listOrderAttachments(route.params.id, "designFiles"),
        listOrderAttachments(route.params.id, "samplePhotos"),
      ]);
      designFiles.value = df;
      samplePhotos.value = sp;
    }
    refreshSavedFormSignature();
    formReady.value = true;
  } catch (e) {
    console.error(e);
    error.value = "載入失敗：" + (e?.message || e);
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  window.addEventListener("beforeunload", handleBeforeUnload);
  void loadAll();
});

onBeforeUnmount(() => {
  window.removeEventListener("beforeunload", handleBeforeUnload);
});

onBeforeRouteLeave(async () => {
  if (!isEdit.value || !formReady.value || !hasUnsavedChanges.value)
    return true;
  return await onSave({
    showSuccess: false,
    showFailure: true,
    redirectAfterCreate: false,
  });
});
</script>

<style scoped>
.order-edit {
  max-width: 1100px;
  margin: 0 auto;
  padding: 16px;
}
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  position: sticky;
  top: 76px;
  z-index: 20;
  background: #fff;
  padding: 10px 0;
  border-bottom: 1px solid #e5e7eb;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  margin-bottom: 16px;
}
.header-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}
.pricing-toolbar {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}
.btn-primary {
  padding: 8px 16px;
  background: #1976d2;
  color: #fff;
  border: 0;
  border-radius: 4px;
  cursor: pointer;
}
.btn-primary:disabled {
  background: #999;
}
.btn-secondary {
  padding: 8px 16px;
  background: #fff;
  border: 1px solid #ccc;
  border-radius: 4px;
  cursor: pointer;
}
.btn-mini {
  padding: 4px 10px;
  font-size: 12px;
  border: 1px solid #1976d2;
  background: #fff;
  color: #1976d2;
  border-radius: 4px;
  cursor: pointer;
}
.btn-mini:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.btn-del {
  background: transparent;
  border: 0;
  color: #c62828;
  font-size: 20px;
  cursor: pointer;
  padding: 0 6px;
}
.form-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
}
@media (min-width: 900px) {
  .form-grid {
    grid-template-columns: 1fr 1fr;
  }
  .card.full {
    grid-column: 1 / -1;
  }
}
.card {
  background: #fff;
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  padding: 12px 16px;
}
.card h3 {
  margin: 0 0 10px 0;
  font-size: 15px;
  color: #333;
}
.card-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}
.card-head h3 {
  margin: 0;
}
.row {
  display: grid;
  grid-template-columns: 100px 1fr;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.row label {
  font-size: 13px;
  color: #555;
}
.row input,
.row select,
.row textarea {
  padding: 6px 8px;
  border: 1px solid #ccc;
  border-radius: 3px;
  font-size: 13px;
  width: 100%;
  box-sizing: border-box;
}
.inline {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}
.inline input {
  padding: 6px 8px;
  border: 1px solid #ccc;
  border-radius: 3px;
  font-size: 13px;
}
.sub-row {
  display: flex;
  gap: 6px;
  align-items: center;
  margin-bottom: 6px;
  flex-wrap: wrap;
}
.sub-row input,
.sub-row select {
  padding: 5px 7px;
  border: 1px solid #ccc;
  border-radius: 3px;
  font-size: 12px;
  min-width: 0;
}
.sink-row {
  border: 1px solid #eee;
  border-radius: 4px;
  padding: 8px;
  margin-bottom: 8px;
}
.sink-row-main {
  display: flex;
  gap: 6px;
  align-items: center;
  flex-wrap: wrap;
  margin-bottom: 6px;
}
.sink-row-main input,
.sink-row-main select {
  padding: 5px 7px;
  border: 1px solid #ccc;
  border-radius: 3px;
  font-size: 12px;
  min-width: 0;
}
.sink-model-input {
  min-width: 160px;
  flex: 1 1 160px;
}
.sink-row-status {
  display: flex;
  gap: 6px;
  align-items: center;
  flex-wrap: wrap;
  padding-top: 4px;
  border-top: 1px dashed #eee;
}
.sink-row-note {
  margin-bottom: 6px;
}
.sink-row-note input {
  width: 100%;
  padding: 5px 7px;
  border: 1px solid #ccc;
  border-radius: 3px;
  font-size: 12px;
  box-sizing: border-box;
}
.sink-row-status .lbl {
  font-size: 12px;
  color: #666;
}
.status-pill {
  display: inline-block;
  padding: 3px 10px;
  border: 1px solid #ccc;
  border-radius: 12px;
  font-size: 12px;
  cursor: pointer;
  background: #fff;
  color: #666;
  user-select: none;
}
.status-pill.active {
  font-weight: 600;
}
.chk {
  display: inline-flex;
  gap: 4px;
  align-items: center;
  font-size: 12px;
}
.customer-picker {
  position: relative;
}
.customer-picker input {
  padding: 6px 8px;
  border: 1px solid #ccc;
  border-radius: 3px;
  font-size: 13px;
  width: 100%;
  box-sizing: border-box;
}
.dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  max-height: 280px;
  overflow-y: auto;
  background: #fff;
  border: 1px solid #ccc;
  border-top: 0;
  list-style: none;
  margin: 0;
  padding: 0;
  z-index: 50;
}
.dropdown li {
  padding: 6px 10px;
  cursor: pointer;
  font-size: 13px;
  border-bottom: 1px solid #f0f0f0;
}
.dropdown li:hover {
  background: #f5f5f5;
}
.dropdown .muted {
  color: #999;
  margin-left: 6px;
  font-size: 12px;
}
.picked {
  margin-top: 4px;
  font-size: 12px;
  color: #1976d2;
}
.muted {
  color: #999;
}
.material-tag {
  display: inline-block;
  padding: 3px 10px;
  border-radius: 12px;
  background: #eef5ff;
  color: #1565c0;
  font-size: 12px;
  font-weight: 600;
}
.check-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 6px 12px;
  flex: 1;
}
.check-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
}
.small {
  font-size: 12px;
}
.hint {
  color: #666;
}
.error {
  color: #c62828;
}
/* ── 附件區塊 ── */
.attach-section {
  margin-bottom: 14px;
  padding-bottom: 12px;
  border-bottom: 1px solid #f0f0f0;
}
.attach-section:last-child {
  border-bottom: 0;
  margin-bottom: 0;
}
.attach-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}
.attach-label {
  font-size: 13px;
  font-weight: 600;
  color: #444;
  min-width: 70px;
}
.file-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.file-list li {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
  font-size: 13px;
  border-bottom: 1px solid #f5f5f5;
}
.file-list a {
  flex: 1;
  color: #1565c0;
  word-break: break-all;
}
.photo-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.photo-thumb {
  position: relative;
  width: 120px;
  height: 90px;
  border-radius: 4px;
  overflow: hidden;
  border: 1px solid #e0e0e0;
  cursor: pointer;
}
.photo-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.thumb-del {
  position: absolute;
  top: 2px;
  right: 2px;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  border: 0;
  border-radius: 50%;
  width: 20px;
  height: 20px;
  font-size: 13px;
  line-height: 1;
  cursor: pointer;
  display: none;
  align-items: center;
  justify-content: center;
  padding: 0;
}
.photo-thumb:hover .thumb-del {
  display: flex;
}
/* 燈箱 */
.lightbox {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}
.lightbox img {
  max-width: 90vw;
  max-height: 90vh;
  border-radius: 4px;
  box-shadow: 0 4px 32px rgba(0, 0, 0, 0.5);
}
.lb-close {
  position: absolute;
  top: 16px;
  right: 20px;
  background: transparent;
  border: 0;
  color: #fff;
  font-size: 28px;
  cursor: pointer;
  line-height: 1;
}
.pricing-wrap {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.pricing-history {
  border: 1px solid #e2e8f0;
  background: #f8fafc;
  border-radius: 6px;
  padding: 8px 10px;
}
.pricing-history-head {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  align-items: center;
  margin-bottom: 6px;
  font-size: 13px;
}
.pricing-suggestions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.pricing-sugg-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid #dbeafe;
  background: #eff6ff;
  border-radius: 999px;
  padding: 4px 8px;
}
.pricing-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.pricing-table th,
.pricing-table td {
  border-bottom: 1px solid #eceff3;
  padding: 6px 8px;
  text-align: left;
}
.pricing-input {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  padding: 4px 6px;
  font-size: 12px;
}
.pricing-input.num {
  text-align: right;
}
.pricing-formula {
  color: #475569;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.pricing-table th {
  color: #475569;
  background: #f8fafc;
  font-weight: 600;
}
.pricing-table .num {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.pricing-row-actions {
  display: flex;
  gap: 6px;
}
.pricing-summary {
  display: flex;
  gap: 18px;
  justify-content: flex-end;
  font-size: 13px;
  color: #334155;
}
.pricing-summary .total {
  font-weight: 700;
  color: #0f172a;
}
.pricing-edit-grid {
  border-top: 1px dashed #cbd5e1;
  padding-top: 8px;
}
</style>
