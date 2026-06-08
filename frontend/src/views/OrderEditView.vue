<template>
  <div ref="orderEditRef" class="order-edit">
    <header ref="pageHeaderRef" class="page-header">
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
          :to="`/orders/${route.params.id}/confirmation`"
          >📋 確定單</RouterLink
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
          :to="`/orders/${route.params.id}/sink-print`"
          >🖨 印水槽</RouterLink
        >
        <button
          v-if="isEdit"
          class="btn-aux"
          :disabled="loading || signedScanUploading"
          @click="openSignedScanPicker"
        >
          {{ signedScanUploading ? '回簽上傳中…' : '📎 上傳回簽' }}
        </button>
        <button v-if="canSendConfirmation" class="btn-aux" @click="onSendConfirmation">📨 傳確定單</button>
        <button v-if="canIssue" class="btn-primary btn-issue" @click="showIssuanceDialog = true">✅ 發單</button>
        <button v-if="canRenameIssuedOrderNo" class="btn-aux" @click="onRenameOrderNo">
          ✏️ 改訂單號（{{ currentOrderNo }}）
        </button>
        <button
          class="btn-aux"
          :disabled="saving || hasReusableDraftDuplicate"
          @click="onSaveAndCreateNext"
        >
          {{ saving ? "儲存中..." : "儲存並新建" }}
        </button>
        <button class="btn-secondary" @click="$router.back()">取消</button>
        <button class="btn-primary" :disabled="saving || hasReusableDraftDuplicate" @click="onSave">
          {{ saving ? "儲存中..." : "儲存" }}
        </button>
      </div>
    </header>

    <p v-if="loading" class="hint">載入中...</p>
    <p v-if="error" class="error">{{ error }}</p>

    <div v-if="!loading" class="form-grid" @keydown.capture="onFormKeydown">
      <!-- 客戶資訊 -->
      <section class="card card-customer">
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
          <div>
            <input
              v-model="form.siteAddress"
              type="text"
              @input="onSiteAddressInput"
              @blur="checkDuplicateSiteAddress"
            />
            <div v-if="siteAddressChecking" class="muted small" style="margin-top: 6px">檢查現有地址中…</div>
            <div v-else-if="siteAddressDuplicates.length" class="site-address-warning">
              <div class="site-address-warning-title">
                注意：此安裝地點已存在 {{ siteAddressDuplicates.length }} 筆訂單
              </div>
              <div v-if="issuedSiteAddressDuplicates.length" class="site-address-warning-section">
                <div class="site-address-warning-subtitle">
                  已有正式訂單：若這次是追加，建議沿用下一個編號
                  <strong v-if="suggestedExtensionOrderNo">{{ suggestedExtensionOrderNo }}</strong>
                </div>
                <ul class="site-address-warning-list">
                  <li v-for="dup in issuedSiteAddressDuplicates" :key="dup.id">
                    <RouterLink :to="`/orders/${dup.id}/edit`">
                      {{ dup.orderNo || dup.id }}
                    </RouterLink>
                    <span>{{ dup.customerName || "未填客戶" }}</span>
                    <span>{{ dup.promisedAt || dup.orderedAt || "未填日期" }}</span>
                  </li>
                </ul>
              </div>
              <div v-if="draftSiteAddressDuplicates.length" class="site-address-warning-section site-address-warning-draft">
                <div class="site-address-warning-subtitle">
                  已有草稿：可直接使用現有草稿，不需再新建
                </div>
                <ul class="site-address-warning-list">
                  <li v-for="dup in draftSiteAddressDuplicates" :key="dup.id">
                    <RouterLink :to="`/orders/${dup.id}/edit`">
                      {{ dup.customerName || dup.id }}
                    </RouterLink>
                    <span>{{ dup.promisedAt || dup.orderedAt || "未填日期" }}</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        <div class="row">
          <label>下單日</label>
          <input v-model="form.orderedAt" type="date" />
        </div>

        <div class="row">
          <label>預交日</label>
          <input v-model="form.promisedAt" type="date" />
        </div>

        <div class="row">
          <label>未安裝責任</label>
          <select v-model="form.installDelayResponsibility">
            <option value="unknown">未判定</option>
            <option value="customer">客戶因素</option>
            <option value="internal">我方因素</option>
          </select>
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
      <section class="card card-stone">
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

        <!-- 計價 -->
      <section class="card card-pricing full">
        <header class="card-head">
          <h3>計價</h3>
          <a href="/quote" target="_blank" class="btn-aux">📊 開啟估價單</a>
        </header>

        <!-- 客戶歷史價格提示 -->
        <div v-if="customerPricing" class="pricing-history">
          <div class="pricing-history-head">
            <span>📝 歷史價格</span>
            <span v-if="customerPricing.defaultPricePerCm" class="muted small">上次預設 {{ customerPricing.defaultPricePerCm.toLocaleString() }} 元/cm</span>
          </div>
          <div v-if="suggestedPrices.length" class="pricing-suggestions">
            <div v-for="s in suggestedPrices" :key="s.key" class="pricing-sugg-item">
              <span class="muted small">{{ s.label }}：</span>
              <strong>{{ s.price.toLocaleString() }} 元/cm</strong>
              <button class="btn-mini" type="button" @click="form.pricePerCm = s.price">套用</button>
            </div>
          </div>
          <div v-else-if="customerPricing.defaultPricePerCm" class="pricing-sugg-item">
            <span class="muted small">上次價格：</span>
            <strong>{{ customerPricing.defaultPricePerCm.toLocaleString() }} 元/cm</strong>
            <button class="btn-mini" type="button" @click="form.pricePerCm = customerPricing.defaultPricePerCm">套用</button>
          </div>
          <div v-else class="muted small">尚無此客戶計價記錄</div>

          <div v-if="isSiteCategory" class="site-price-list-block">
            <div class="pricing-history-head" style="margin-top:6px">
              <span>🏗️ 工地案價格（同客戶・同顏色）</span>
            </div>
            <div v-if="sitePriceMatches.length" class="pricing-suggestions">
              <div
                v-for="entry in sitePriceMatches"
                :key="`${entry.projectName}-${entry.color}-${entry.updatedAt || ''}`"
                class="pricing-sugg-item"
              >
                <span class="muted small">{{ entry.projectName }} / {{ entry.color }}</span>
                <strong>{{ Number(entry.price || 0).toLocaleString() }} 元/cm</strong>
                <span class="muted small">水槽 {{ Number(entry.sinkPrice || 0).toLocaleString() }}、火爐 {{ Number(entry.stovePrice || 0).toLocaleString() }}</span>
                <button class="btn-mini" type="button" @click="applySiteProjectPrice(entry)">套用</button>
              </div>
            </div>
            <div v-else class="muted small">尚無符合目前石材顏色的工地案價格</div>
          </div>

          <div class="pricing-sugg-item" style="margin-top:6px">
            <label style="display:inline-flex;align-items:center;gap:6px;cursor:pointer">
              <input
                type="checkbox"
                :checked="!!customerPricing.skipOversizeScaling"
                @change="toggleSkipOversize($event.target.checked)"
              />
              <span class="muted small">此客戶不做大尺寸比例換算（sum&gt;68 不放大）</span>
            </label>
          </div>
        </div>

        <div class="row" style="margin-top:12px">
          <label>每公分售價</label>
          <div class="inline">
            <input v-model.number="form.pricePerCm" type="number" min="0" style="width:100px" placeholder="0" />
            <span class="muted">元/cm</span>
            <span v-if="form.pricePerCm && form.countertop.totalCm" class="muted small">
              台面估算 {{ (form.pricePerCm * form.countertop.totalCm).toLocaleString() }} 元
            </span>
          </div>
        </div>
        <!-- 計價明細 lineItems -->
        <div class="line-items-block">
          <div class="line-items-head">
            <strong>計價明細</strong>
            <div class="line-items-actions">
              <button class="btn-mini" type="button" @click="syncLineItemsFromForm('all')">以表單資料產生明細</button>
              <button v-if="isEdit" class="btn-mini" type="button" @click="syncLineItemsFromDrawings">以繪圖資料產生明細（檯面/水槽/爐子）</button>
              <button class="btn-mini" type="button" @click="addLineItem('other')">+ 新增一行</button>
            </div>
          </div>
          <table class="line-items-table">
            <thead>
              <tr>
                <th style="width:80px">類別</th>
                <th>說明</th>
                <th style="width:55px">單位</th>
                <th style="width:75px">數量</th>
                <th style="width:95px">單價</th>
                <th style="width:110px">小計</th>
                <th style="width:50px"></th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="!form.lineItems.length">
                <td colspan="7" class="muted small" style="text-align:center;padding:10px">
                  尚無明細。可按「以表單資料產生明細」自動帶入檯面/水槽/爐子/特殊作法。
                </td>
              </tr>
              <tr v-for="(li, i) in form.lineItems" :key="li.id">
                <td>
                  <select v-model="li.category" class="li-input">
                    <option value="countertop">檯面</option>
                    <option value="sink">水槽</option>
                    <option value="stove">爐子</option>
                    <option value="special">特殊</option>
                    <option value="other">其他</option>
                  </select>
                </td>
                <td><input v-model="li.description" class="li-input" type="text" /></td>
                <td><input v-model="li.unit" class="li-input" type="text" /></td>
                <td><input v-model.number="li.qty" class="li-input" type="number" min="0" step="0.01" @input="recalcLineAmount(li)" /></td>
                <td>
                  <div class="li-price-cell">
                    <input v-model.number="li.unitPrice" class="li-input" type="number" min="0" @input="recalcLineAmount(li)" />
                    <button
                      v-if="suggestionFor(li) != null && suggestionFor(li) !== li.unitPrice"
                      class="btn-suggest"
                      type="button"
                      :title="`上次 ${suggestionFor(li).toLocaleString()} 元，點擊套用`"
                      @click="applySuggestion(li)"
                    >↑{{ suggestionFor(li).toLocaleString() }}</button>
                  </div>
                </td>
                <td><input v-model.number="li.amount" class="li-input" type="number" min="0" /></td>
                <td><button class="btn-mini btn-del-line" type="button" @click="removeLineItem(i)">×</button></td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="row" v-if="form.lineItems.length">
          <label>未稅小計</label>
          <div class="inline">
            <span class="price-display">{{ subtotalComputed.toLocaleString() }} 元</span>
            <button class="btn-mini" type="button" @click="form.total = subtotalComputed">同步到未稅金額</button>
          </div>
        </div>
        <div class="row">
          <label>未稅金額</label>
          <div class="inline">
            <input v-model.number="form.total" type="number" min="0" style="width:140px" placeholder="0" />
            <span class="muted">元</span>
            <button
              v-if="form.pricePerCm && form.countertop.totalCm && !form.lineItems.length"
              class="btn-mini"
              type="button"
              @click="form.total = form.pricePerCm * form.countertop.totalCm"
            >套用估算</button>
          </div>
        </div>
        <div class="row">
          <label>開立發票</label>
          <div class="inline">
            <label class="inline-check">
              <input type="checkbox" v-model="form.invoiceRequired" />
              <span>需開發票（5% 營業稅）</span>
            </label>
          </div>
        </div>
        <div class="row">
          <label>{{ form.invoiceRequired ? '含稅金額 (5%)' : '應收總額' }}</label>
          <div class="inline">
            <span class="price-display">{{ grandTotalComputed ? grandTotalComputed.toLocaleString() : '—' }} 元</span>
          </div>
        </div>
        <div class="row">
          <label>已收訂金</label>
          <div class="inline">
            <input v-model.number="form.depositPaid" type="number" min="0" style="width:140px" placeholder="0" />
            <span class="muted">元</span>
            <span v-if="grandTotalComputed && form.depositPaid != null" class="muted small">
              餘款 {{ (grandTotalComputed - (form.depositPaid || 0)).toLocaleString() }} 元
            </span>
          </div>
        </div>
        <div class="row">
          <label>收款備註</label>
          <input v-model="form.paymentNotes" type="text" placeholder="例：現金、匯款、分期…" />
        </div>
      </section>

      <section v-if="isEdit" class="card card-receivable full">
        <header class="card-head">
          <h3>應收摘要</h3>
          <div class="inline-actions">
            <RouterLink class="btn-aux" to="/receivable-items">應收明細</RouterLink>
            <RouterLink v-if="latestArBillId" class="btn-aux" :to="`/receivable-bills/${latestArBillId}`">查看帳單</RouterLink>
            <button class="btn-mini" type="button" :disabled="creatingReceivableItem" @click="onCreateReceivableItem">
              {{ creatingReceivableItem ? "建立中…" : "建立應收明細" }}
            </button>
          </div>
        </header>

        <div class="summary-grid-4">
          <div class="summary-tile">
            <span class="summary-label">應收狀態</span>
            <strong>{{ receivableStatusLabel }}</strong>
          </div>
          <div class="summary-tile">
            <span class="summary-label">應收總額</span>
            <strong>{{ formatCurrency(form.receivableTotal) }}</strong>
          </div>
          <div class="summary-tile">
            <span class="summary-label">已收總額</span>
            <strong>{{ formatCurrency(form.receivedTotal) }}</strong>
          </div>
          <div class="summary-tile">
            <span class="summary-label">未收金額</span>
            <strong>{{ formatCurrency(form.balanceDue) }}</strong>
          </div>
        </div>

        <div class="row">
          <label>可請款原因</label>
          <div class="muted">{{ form.billingEligibleReason || "尚未符合可請款條件" }}</div>
        </div>
      </section>

      <!-- 附件（原始圖檔 / 打板照）-->
      <section v-if="isEdit" class="card card-attachments full">
        <h3>附件</h3>

        <div class="attach-section">
          <div class="attach-head">
            <span class="attach-label">回簽檔</span>
            <button class="btn-mini" @click="signedScanInputRef.click()">+ 上傳</button>
            <input
              ref="signedScanInputRef"
              type="file"
              accept="image/*,.pdf"
              multiple
              style="display:none"
              @change="onSignedScans"
            />
            <span v-if="latestSignedScanEntry" class="muted small">
              最新：{{ formatSignedScanTime(latestSignedScanEntry.uploadedAt || form.customerSignedAt) }}
            </span>
          </div>
          <p v-if="signedScanUploading" class="hint">上傳中…</p>
          <p v-if="orderStatus === 'pendingSign'" class="muted small">上傳回簽後，若要正式發單，仍請按上方「✅ 發單」。</p>
          <ul v-if="signedScans.length" class="file-list">
            <li v-for="(scan, index) in signedScans" :key="scan.url || `${scan.name}-${index}`">
              <a :href="scan.url" target="_blank" rel="noopener">{{ signedScanDisplayName(scan, index) }}</a>
              <span class="muted small">{{ formatSignedScanTime(scan.uploadedAt) }}</span>
              <span v-if="index === 0" class="scan-latest-tag">最新</span>
            </li>
          </ul>
          <p v-else-if="!signedScanUploading" class="muted small">尚無回簽檔</p>
        </div>

        <!-- 原始圖檔 -->
        <div class="attach-section">
          <div class="attach-head">
            <span class="attach-label">原始圖檔</span>
            <button class="btn-mini" @click="designFileInputRef.click()">+ 上傳</button>
            <input
              ref="designFileInputRef"
              type="file"
              accept="image/*,.pdf,.dwg,.dxf,.ai,.eps,.cdr"
              multiple
              style="display:none"
              @change="onDesignFiles"
            />
          </div>
          <p v-if="designUploading" class="hint">上傳中…</p>
          <ul v-if="designFiles.length" class="file-list">
            <li v-for="f in designFiles" :key="f.id">
              <a :href="f.url" target="_blank" rel="noopener">{{ f.name }}</a>
              <button class="btn-del" title="刪除" @click="deleteAttachment('designFiles', f)">×</button>
            </li>
          </ul>
          <p v-else-if="!designUploading" class="muted small">尚無原始圖檔</p>
        </div>

        <!-- 打板照 -->
        <div class="attach-section">
          <div class="attach-head">
            <span class="attach-label">打板照</span>
            <button class="btn-mini" @click="samplePhotoInputRef.click()">+ 上傳</button>
            <input
              ref="samplePhotoInputRef"
              type="file"
              accept="image/*"
              multiple
              style="display:none"
              @change="onSamplePhotos"
            />
          </div>
          <p v-if="sampleUploading" class="hint">上傳中…</p>
          <div v-if="samplePhotos.length" class="photo-grid">
            <div v-for="f in samplePhotos" :key="f.id" class="photo-thumb">
              <img :src="f.url" :alt="f.name" @click="lightboxUrl = f.url" />
              <button class="thumb-del" title="刪除" @click="deleteAttachment('samplePhotos', f)">×</button>
            </div>
          </div>
          <p v-else-if="!sampleUploading" class="muted small">尚無打板照</p>
        </div>
      </section>

      <!-- 台面 -->
      <section class="card card-countertop">
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
      <section class="card card-sinks">
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
        <datalist v-for="(_, di) in form.sinks" :key="'sdl-'+di" :id="'sink-dl-'+di">
          <option v-for="m in sinkModels" :key="m.id" :value="(m.brand ? m.brand + ' ' : '') + m.model" />
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
              v-model.trim="s.recipient"
              type="text"
              placeholder="收件人"
              class="sink-recipient-input"
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
      <section class="card card-stoves">
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
        <datalist v-for="(_, di) in form.stoves" :key="'stdl-'+di" :id="'stove-dl-'+di">
          <option v-for="m in stoveModels" :key="m.id" :value="(m.brand ? m.brand + ' ' : '') + m.model" />
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
      <section class="card card-production">
        <h3>生產指令</h3>
        <div class="row">
          <label>打板日</label>
          <input v-model="form.templatingDate" type="date" />
        </div>
        <div class="row">
          <label>打板人員</label>
          <select v-model="form.templatingStaff">
            <option value="">-- 選擇 --</option>
            <option v-for="s in staffDept1" :key="s.id" :value="s.name">{{ s.name }}</option>
          </select>
        </div>
        <div class="row">
          <label>對圖人員</label>
          <select v-model="form.drawingStaff">
            <option value="">-- 選擇 --</option>
            <option v-for="s in staffDept1" :key="s.id" :value="s.name">{{ s.name }}</option>
          </select>
        </div>
        <div class="row">
          <label>特殊備註</label>
          <textarea v-model="form.specialNotes" rows="3"></textarea>
        </div>
        <div class="row" v-if="userRole === 'admin' || userRole === '管理者'">
          <label>測試標記</label>
          <label style="display:flex;align-items:center;gap:6px;font-weight:normal;cursor:pointer">
            <input type="checkbox" v-model="form.isTestData" style="width:auto;height:auto" />
            <span style="color:#e55;">此為測試資料（上線前可於管理介面批次清除）</span>
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
      :suggestedOrderNo="suggestedExtensionOrderNo"
      @close="showIssuanceDialog = false"
      @issued="onIssued"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick } from "vue";
import { useRoute, useRouter, onBeforeRouteLeave } from "vue-router";
import {
  listCustomers,
  listProductModels,
  createSalesOrder,
  updateSalesOrder,
  getSalesOrder,
  findSalesOrdersBySiteAddress,
  listInventoryColors,
  getBrandMaterials,
  getOrderOptions,
  auth,
  getUserByUid,
  uploadOrderAttachment,
  appendSignedScanToOrder,
  listOrderAttachments,
  deleteOrderAttachment,
  listStaffByDept,
  sendConfirmation,
  createProductionJob,
  getCustomerPricing,
  getCustomerPricingByCustomerName,
  updateCustomerPricing,
  listOrderDrawings,
  updateIssuedOrderNo,
  createReceivableItemFromOrder,
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
const orderEditRef = ref(null);
const pageHeaderRef = ref(null);
let headerResizeObserver = null;
const creatingReceivableItem = ref(false);
const customerPricing = ref(null);

// 上次對當前石材的建議價格
const suggestedPrices = computed(() => {
  if (!customerPricing.value) return [];
  const result = [];
  const prices = customerPricing.value.stonePrices || {};
  for (const s of form.value.stones || []) {
    const key = [s.brand, s.color].filter(Boolean).join('/');
    if (!key) continue;
    const val = prices[key];
    if (val == null) continue;
    const price = typeof val === "number" ? val : (val.lastPrice ?? null);
    if (price != null) {
      result.push({ key, label: `${s.brand} ${s.color}`.trim(), price });
    }
  }
  return result;
});

const isSiteCategory = computed(
  () => String(form.value.category || "").trim() === "工地",
);

const sitePriceMatches = computed(() => {
  if (!isSiteCategory.value || !customerPricing.value) return [];
  const entries = Object.values(customerPricing.value.sitePriceEntries || {});
  if (!entries.length) return [];

  const colors = new Set(
    (form.value.stones || [])
      .map((s) => String(s?.color || "").trim().toLowerCase())
      .filter(Boolean),
  );
  if (!colors.size) return [];

  return entries
    .filter((entry) => colors.has(String(entry?.color || "").trim().toLowerCase()))
    .sort((a, b) =>
      String(b?.updatedAt || "").localeCompare(String(a?.updatedAt || "")),
    );
});

// ─── 發單作業 ────────────────────────────────────────────────
const orderStatus = ref("");
const pendingSignSnapshot = ref(null);
const pendingSignDrawingVersions = ref({});
const showIssuanceDialog = ref(false);
const canSendConfirmation = computed(() => isEdit.value && (!orderStatus.value || orderStatus.value === "draft"));
const canIssue = computed(() => isEdit.value && orderStatus.value === "pendingSign");
const currentOrderNo = computed(() => String(form.value.orderNo || "").trim());
const canRenameIssuedOrderNo = computed(() =>
  isEdit.value &&
  !!currentOrderNo.value &&
  ["confirmed", "inProduction", "delivered"].includes(orderStatus.value),
);
const latestArBillId = computed(() => String(form.value.latestArBillId || "").trim());
const receivableStatusLabel = computed(() => ({
  none: "未建立",
  pending: "待併帳",
  grouped: "已成帳單",
  partial: "部分收款",
  paid: "已收清",
}[form.value.receivableStatus] || form.value.receivableStatus || "未建立"));

function formatCurrency(value) {
  const amount = Number(value) || 0;
  return `${amount.toLocaleString()} 元`;
}

async function onCreateReceivableItem() {
  if (!isEdit.value) return;
  creatingReceivableItem.value = true;
  try {
    await updateSalesOrder(route.params.id, toPayload());
    await createReceivableItemFromOrder(route.params.id, { force: true });
    const refreshed = await getSalesOrder(route.params.id);
    if (refreshed) {
      Object.assign(form.value, refreshed, {
        sinks: normalizeSinks(refreshed.sinks),
      });
    }
    alert("已建立或更新此訂單的應收明細。");
  } catch (e) {
    console.error(e);
    alert("建立應收明細失敗：" + (e?.message || e));
  } finally {
    creatingReceivableItem.value = false;
  }
}

async function onSendConfirmation() {
  if (!confirm("確定要傳送確定單給客戶簽回嗎？\n（系統將記錄目前資料快照，狀態改為「待客戶簽回」）")) return;
  try {
    await updateSalesOrder(route.params.id, toPayload());
    const snapshot = toPayload();
    await sendConfirmation(route.params.id, snapshot);
    pendingSignSnapshot.value = snapshot;
    pendingSignDrawingVersions.value = {};  // 傳確定單後 firebase 側已記錄最新版本，這裡清空讓 dialog 重新從 Firestore 載
    orderStatus.value = "pendingSign";
    alert("已傳送確定單！狀態更新為「待客戶簽回」");
  } catch (e) {
    console.error(e);
    alert("操作失敗：" + (e?.message || e));
  }
}

async function onIssued(orderNo) {
  showIssuanceDialog.value = false;
  orderStatus.value = "confirmed";
  form.value.orderNo = orderNo;
  const payload = {
    ...toPayload(),
    orderNo,
    status: "confirmed",
  };
  try {
    await updateSalesOrder(route.params.id, payload);
    // 自動建立生產工單
    await createProductionJob(route.params.id, payload);
    alert(`發單成功！訂單號：${orderNo}\n即將跳轉確定單頁面封存PDF。`);
    router.push({ name: "order-confirmation", params: { id: route.params.id } });
  } catch (e) {
    console.error(e);
    alert("發單失敗：" + (e?.message || e));
  }
}

async function onRenameOrderNo() {
  const current = currentOrderNo.value;
  if (!current) {
    alert("目前沒有可修改的訂單號碼");
    return;
  }
  const next = String(prompt("請輸入新的訂單號碼", current) || "")
    .trim()
    .toUpperCase();
  if (!next || next === current) return;
  if (!confirm(`確定將訂單號碼由 ${current} 改為 ${next}？\n系統會同步更新生產工單、派車與維修關聯資料。`)) {
    return;
  }
  try {
    const result = await updateIssuedOrderNo(route.params.id, next);
    form.value.orderNo = result.orderNo;
    alert(`訂單號碼已更新為 ${result.orderNo}`);
  } catch (e) {
    console.error(e);
    alert("修改訂單號碼失敗：" + (e?.message || e));
  }
}

// ─── 附件 ────────────────────────────────────────────────
const designFileInputRef = ref(null);
const samplePhotoInputRef = ref(null);
const signedScanInputRef = ref(null);
const designFiles = ref([]);
const samplePhotos = ref([]);
const signedScans = ref([]);
const designUploading = ref(false);
const sampleUploading = ref(false);
const signedScanUploading = ref(false);
const lightboxUrl = ref("");

const latestSignedScanEntry = computed(() => signedScans.value[0] || null);

function signedScanTimeMs(value) {
  if (!value) return 0;
  if (typeof value?.toDate === "function") return value.toDate().getTime();
  if (value instanceof Date) return value.getTime();
  if (typeof value === "object" && Number.isFinite(Number(value.seconds))) {
    return Number(value.seconds) * 1000;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function normalizeSignedScans(order = {}) {
  const scans = Array.isArray(order?.signedScans)
    ? order.signedScans.filter((item) => item?.url)
    : [];
  if (scans.length) {
    return [...scans].sort((a, b) => signedScanTimeMs(b.uploadedAt) - signedScanTimeMs(a.uploadedAt));
  }
  return order?.signedScanUrl
    ? [{
        url: order.signedScanUrl,
        uploadedAt: order.customerSignedAt || null,
        name: "回簽檔",
      }]
    : [];
}

function formatSignedScanTime(value) {
  const ts = signedScanTimeMs(value);
  if (!ts) return "—";
  const date = new Date(ts);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function signedScanDisplayName(scan = {}, index = 0) {
  if (scan.name) return scan.name;
  const ext = String(scan.url || "").split("?")[0].split(".").pop();
  return `回簽檔 ${index + 1}${ext ? `.${ext}` : ""}`;
}

async function onSignedScans(e) {
  const files = [...(e.target.files || [])];
  e.target.value = "";
  if (!files.length) return;
  signedScanUploading.value = true;
  try {
    for (const file of files) {
      const item = await appendSignedScanToOrder(route.params.id, file);
      signedScans.value = [...signedScans.value, item].sort(
        (a, b) => signedScanTimeMs(b.uploadedAt) - signedScanTimeMs(a.uploadedAt),
      );
      form.value.signedScanUrl = item.url;
      form.value.customerSignedAt = item.uploadedAt;
    }
  } catch (err) {
    alert("回簽上傳失敗：" + (err?.message || err));
  } finally {
    signedScanUploading.value = false;
  }
}

function openSignedScanPicker() {
  signedScanInputRef.value?.click();
}

async function onDesignFiles(e) {
  const files = [...(e.target.files || [])];
  e.target.value = "";
  if (!files.length) return;
  designUploading.value = true;
  try {
    for (const file of files) {
      const item = await uploadOrderAttachment(route.params.id, "designFiles", file);
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
      const item = await uploadOrderAttachment(route.params.id, "samplePhotos", file);
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
  廓石: "quartz",
  // 陶板 / 焝結石
  abk: "porcelain",
  耐麗石: "porcelain",
  neolith: "porcelain",
  鉈鋼石: "porcelain",
  帝通石: "porcelain",
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
const lastSavedPayloadSignature = ref("");
let savePromise = null;

const customers = ref([]);
const sinkModels = ref([]);
const stoveModels = ref([]);
const inventoryColors = ref([]);
const customBrandMap = ref({});
const staffDept1 = ref([]);
const siteAddressChecking = ref(false);
const siteAddressDuplicates = ref([]);
const lastSiteAddressAlertKey = ref("");
const issuedSiteAddressDuplicates = computed(() =>
  siteAddressDuplicates.value.filter((item) => String(item.orderNo || "").trim()),
);
const draftSiteAddressDuplicates = computed(() =>
  siteAddressDuplicates.value.filter((item) => !String(item.orderNo || "").trim()),
);
const hasReusableDraftDuplicate = computed(() =>
  !isEdit.value && draftSiteAddressDuplicates.value.length > 0,
);

function parseExtensionBase(orderNo = "") {
  const clean = String(orderNo || "").trim().toUpperCase();
  if (!clean) return { prefix: "", suffix: "", seq: 0 };
  const matched = clean.match(/^(\d+)(?:-(\d+))?([A-Z]+)$/);
  if (!matched) {
    return { prefix: clean, suffix: "", seq: 0 };
  }
  return {
    prefix: matched[1],
    suffix: matched[3] || "",
    seq: Number(matched[2]) || 0,
  };
}

const suggestedExtensionOrderNo = computed(() => {
  const numbered = issuedSiteAddressDuplicates.value.filter((item) => String(item.orderNo || "").trim());
  if (!numbered.length) return "";

  const latestParsed = parseExtensionBase(numbered[0].orderNo || "");
  if (!latestParsed.prefix) return "";

  let maxSeq = 0;
  numbered.forEach((item) => {
    const parsed = parseExtensionBase(item.orderNo || "");
    if (parsed.prefix === latestParsed.prefix && parsed.suffix === latestParsed.suffix) {
      maxSeq = Math.max(maxSeq, parsed.seq || 0);
    }
  });
  return `${latestParsed.prefix}-${maxSeq + 1}${latestParsed.suffix}`;
});

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

function normalizeSiteAddress(value) {
  return String(value || "").trim();
}

function onSiteAddressInput() {
  siteAddressDuplicates.value = [];
  lastSiteAddressAlertKey.value = "";
}

async function checkDuplicateSiteAddress() {
  const siteAddress = normalizeSiteAddress(form.value.siteAddress);
  if (!siteAddress) {
    siteAddressDuplicates.value = [];
    lastSiteAddressAlertKey.value = "";
    return;
  }

  siteAddressChecking.value = true;
  try {
    const matches = await findSalesOrdersBySiteAddress(siteAddress, {
      excludeId: isEdit.value ? route.params.id : "",
      limit: 8,
    });
    siteAddressDuplicates.value = matches;

    if (!matches.length) {
      lastSiteAddressAlertKey.value = "";
      return;
    }

    const alertKey = matches.map((item) => item.id).sort().join("|");
    if (lastSiteAddressAlertKey.value === alertKey) return;
    lastSiteAddressAlertKey.value = alertKey;

    const lines = [];
    if (issuedSiteAddressDuplicates.value.length) {
      const summary = issuedSiteAddressDuplicates.value
        .slice(0, 5)
        .map((item) => `${item.orderNo || item.id} ${item.customerName || ""}`.trim())
        .join("\n");
      lines.push(`已有正式訂單 ${issuedSiteAddressDuplicates.value.length} 筆`);
      if (suggestedExtensionOrderNo.value) {
        lines.push(`若要追加，建議訂單號碼：${suggestedExtensionOrderNo.value}`);
      }
      if (summary) lines.push(summary);
    }
    if (draftSiteAddressDuplicates.value.length) {
      const summary = draftSiteAddressDuplicates.value
        .slice(0, 5)
        .map((item) => `${item.customerName || item.id} ${item.promisedAt || item.orderedAt || ""}`.trim())
        .join("\n");
      lines.push(`已有草稿 ${draftSiteAddressDuplicates.value.length} 筆，可直接使用現有草稿，不需新建`);
      if (summary) lines.push(summary);
    }
    alert(`此安裝地點已存在相同資料，請先確認是否重複建單。\n\n${lines.join("\n\n")}`);
  } catch (e) {
    console.warn("check duplicate site address failed", e);
  } finally {
    siteAddressChecking.value = false;
  }
}

function newSink() {
  return {
    modelId: "",
    brand: "",
    model: "",
    bowlCount: 1,
    recipient: "",
    holeWidthMm: null,
    holeDepthMm: null,
    holeRadiusMm: null,
    method: "",
    arrival: "notArrived",
    hasAccessory: false,
  };
}

function normalizeSink(sink = {}) {
  return {
    ...newSink(),
    ...(sink || {}),
    recipient: String(sink?.recipient || "").trim(),
  };
}

function normalizeSinks(list = []) {
  return Array.isArray(list) ? list.map((sink) => normalizeSink(sink)) : [];
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

function createEmptyOrderForm() {
  return {
    customerId: "",
    customerName: "",
    customerContact: { name: "", phone: "" },
    owner: { name: "", phone: "" },
    siteAddress: "",
    category: "",
    customerOrderNo: "",
    orderedAt: "",
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
    templatingStaff: "",
    drawingStaff: "",
    installDelayResponsibility: "unknown",
    promisedAt: "",
    sinkReceivedAt: "",
    specialNotes: "",
    isTestData: false,
    pricePerCm: null,
    total: null,
    lineItems: [],
    invoiceRequired: true,
    depositPaid: null,
    paymentNotes: "",
  };
}

const form = ref(createEmptyOrderForm());

// ── 計價明細 helpers ───────────────────────────────────
function newLineItemId() {
  return "li-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 6);
}

function makeLineItem(category, partial = {}) {
  const defaults = {
    countertop: { unit: "cm", qty: null, unitPrice: null },
    sink:       { unit: "式", qty: 1,    unitPrice: null },
    stove:      { unit: "式", qty: 1,    unitPrice: null },
    special:    { unit: "式", qty: 1,    unitPrice: null },
    other:      { unit: "式", qty: 1,    unitPrice: null },
  };
  const d = defaults[category] || defaults.other;
  return {
    id: newLineItemId(),
    category,
    description: "",
    unit: d.unit,
    qty: d.qty,
    unitPrice: d.unitPrice,
    amount: 0,
    refId: null,
    priceKey: null,
    ...partial,
  };
}

function recalcLineAmount(li) {
  const q = Number(li.qty) || 0;
  const p = Number(li.unitPrice) || 0;
  li.amount = Math.round(q * p);
}

function addLineItem(category = "other") {
  form.value.lineItems.push(makeLineItem(category));
}

function removeLineItem(i) {
  form.value.lineItems.splice(i, 1);
}

const subtotalComputed = computed(() =>
  (form.value.lineItems || []).reduce((s, li) => s + (Number(li.amount) || 0), 0)
);

const grandTotalComputed = computed(() => {
  const base = form.value.lineItems.length
    ? subtotalComputed.value
    : (Number(form.value.total) || 0);
  if (!base) return 0;
  return form.value.invoiceRequired ? Math.round(base * 1.05) : base;
});

// 以表單現有資料產生 / 同步 lineItems
function syncLineItemsFromForm(scope = "all") {
  const items = [...form.value.lineItems];
  const findIdx = (cat, refId) =>
    items.findIndex((x) => x.category === cat && x.refId === refId);

  // 檯面（只一筆）
  if (scope === "all" || scope === "countertop") {
    const cm = Number(form.value.countertop?.totalCm) || 0;
    const ppc = Number(form.value.pricePerCm) || 0;
    if (cm && ppc) {
      const stoneStr = (form.value.stones || [])
        .map((s) => [s.brand, s.color].filter(Boolean).join(" ")).filter(Boolean).join(" / ");
      const firstStone = (form.value.stones || [])[0];
      const priceKey = firstStone ? [firstStone.brand, firstStone.color].filter(Boolean).join("/") : null;
      const desc = `${form.value.countertop?.type || "檯面"} ${cm}cm${stoneStr ? " " + stoneStr : ""}`;
      const idx = findIdx("countertop", "main");
      const li = {
        id: idx >= 0 ? items[idx].id : newLineItemId(),
        category: "countertop", refId: "main", priceKey,
        description: desc, unit: "cm", qty: cm, unitPrice: ppc, amount: Math.round(cm * ppc),
      };
      if (idx >= 0) items[idx] = li; else items.push(li);
    }
  }

  const matLabel = materialLabelFromStones(form.value.stones);

  // 水槽
  if (scope === "all" || scope === "sink") {
    (form.value.sinks || []).forEach((s, i) => {
      const refId = `sink-${i}`;
      const desc = [s.method, matLabel, s.brand, s.model].filter(Boolean).join(" ") || `水槽${i + 1}`;
      const idx = findIdx("sink", refId);
      const existing = idx >= 0 ? items[idx] : null;
      const li = {
        id: existing?.id || newLineItemId(),
        category: "sink", refId, priceKey: holePriceKey(s.method, matLabel),
        description: desc, unit: "式",
        qty: existing?.qty ?? 1,
        unitPrice: existing?.unitPrice ?? null,
        amount: existing?.amount ?? 0,
      };
      if (idx >= 0) items[idx] = li; else items.push(li);
    });
  }

  // 爐子
  if (scope === "all" || scope === "stove") {
    (form.value.stoves || []).forEach((s, i) => {
      const refId = `stove-${i}`;
      const desc = [s.method, matLabel, s.brand, s.model].filter(Boolean).join(" ") || `爐子${i + 1}`;
      const idx = findIdx("stove", refId);
      const existing = idx >= 0 ? items[idx] : null;
      const li = {
        id: existing?.id || newLineItemId(),
        category: "stove", refId, priceKey: holePriceKey(s.method, matLabel),
        description: desc, unit: "式",
        qty: existing?.qty ?? 1,
        unitPrice: existing?.unitPrice ?? null,
        amount: existing?.amount ?? 0,
      };
      if (idx >= 0) items[idx] = li; else items.push(li);
    });
  }

  // 特殊作法
  if (scope === "all" || scope === "special") {
    (form.value.specialMethods || []).forEach((name) => {
      const refId = `special-${name}`;
      const idx = findIdx("special", refId);
      const existing = idx >= 0 ? items[idx] : null;
      const li = {
        id: existing?.id || newLineItemId(),
        category: "special", refId, priceKey: name,
        description: name, unit: "式",
        qty: existing?.qty ?? 1,
        unitPrice: existing?.unitPrice ?? null,
        amount: existing?.amount ?? 0,
      };
      if (idx >= 0) items[idx] = li; else items.push(li);
    });
  }

  form.value.lineItems = items;
}

// 依訂單石材判斷主要材質標籤（用來組 priceKey 區分石英石 / 陶板價）
function materialLabelFromStones(stones) {
  const list = stones || form.value.stones || [];
  if (!list.length) return "";
  const counts = {};
  for (const s of list) {
    const t = s?.materialType || "other";
    counts[t] = (counts[t] || 0) + 1;
  }
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
  return { quartz: "石英石", porcelain: "陶板", other: "其他" }[top] || "";
}

// 組水槽/爐子的 priceKey：工法 + 材質（例如「下嵌-陶板」「上掛-石英石」）
function holePriceKey(method, materialLabel) {
  if (!method) return null;
  return materialLabel ? `${method}-${materialLabel}` : method;
}

// 大尺寸放大門檻：賽麗石 / silestone / 帝通石 = 68；其餘所有品牌 = 73
function thresholdForStone(stone) {
  const brand = String(stone?.brand || "").trim().toLowerCase();
  const is68 =
    brand.includes("賽麗石") ||
    brand.includes("silestone") ||
    brand.includes("帝通");
  return is68 ? 68 : 73;
}

// 將石材依放大門檻分組（混合訂單時要分開計）
function groupStonesByThreshold(stones) {
  const list = stones || form.value.stones || [];
  const groups = new Map();
  for (const s of list) {
    const th = thresholdForStone(s);
    if (!groups.has(th)) groups.set(th, []);
    groups.get(th).push(s);
  }
  if (!groups.size) groups.set(68, []);
  return Array.from(groups, ([threshold, items]) => ({ threshold, stones: items }));
}

function oversizeThresholdFromStones(stones) {
  const list = stones || form.value.stones || [];
  if (!list.length) return 68;
  for (const s of list) if (thresholdForStone(s) === 73) return 73;
  return 68;
}

// 查詢某個 lineItem 的歷史價格建議（返回數字或 null）
function suggestionFor(li) {
  if (!customerPricing.value || !li?.priceKey) return null;
  const mapName = {
    countertop: "stonePrices",
    sink: "sinkPrices",
    stove: "stovePrices",
    special: "specialPrices",
  }[li.category];
  if (!mapName) return null;
  const map = customerPricing.value[mapName] || {};
  // 先查完整 priceKey；若沒有，對水槽/爐子退回只用工法（向後相容舊資料）
  let val = map[li.priceKey];
  if (val == null && (li.category === "sink" || li.category === "stove")) {
    const methodOnly = String(li.priceKey).split("-")[0];
    if (methodOnly && methodOnly !== li.priceKey) val = map[methodOnly];
  }
  if (val == null) return null;
  // 兼容舊格式（純數字）與新格式（{lastPrice, ...}）
  return typeof val === "number" ? val : (val.lastPrice ?? null);
}

function applySuggestion(li) {
  const p = suggestionFor(li);
  if (p != null) {
    li.unitPrice = p;
    recalcLineAmount(li);
  }
}

function applySiteProjectPrice(entry) {
  const ppc = Number(entry?.price || 0);
  if (ppc > 0) form.value.pricePerCm = ppc;

  const sink = Number(entry?.sinkPrice || 0);
  const stove = Number(entry?.stovePrice || 0);
  for (const li of form.value.lineItems || []) {
    if (li.category === "sink" && sink > 0) {
      li.unitPrice = sink;
      recalcLineAmount(li);
    }
    if (li.category === "stove" && stove > 0) {
      li.unitPrice = stove;
      recalcLineAmount(li);
    }
  }
}

function mergePricingDocs(primaryDoc, byNameDoc) {
  if (!primaryDoc && !byNameDoc) return null;
  const primary = primaryDoc || {};
  const byName = byNameDoc || {};
  return {
    ...byName,
    ...primary,
    stonePrices: { ...(byName.stonePrices || {}), ...(primary.stonePrices || {}) },
    sinkPrices: { ...(byName.sinkPrices || {}), ...(primary.sinkPrices || {}) },
    stovePrices: { ...(byName.stovePrices || {}), ...(primary.stovePrices || {}) },
    specialPrices: { ...(byName.specialPrices || {}), ...(primary.specialPrices || {}) },
    sitePriceEntries: { ...(byName.sitePriceEntries || {}), ...(primary.sitePriceEntries || {}) },
  };
}

async function loadCustomerPricingForCurrentForm() {
  const customerId = String(form.value.customerId || "").trim();
  const customerName = String(form.value.customerName || "").trim();
  const [byId, byName] = await Promise.all([
    customerId ? getCustomerPricing(customerId).catch(() => null) : Promise.resolve(null),
    customerName
      ? getCustomerPricingByCustomerName(customerName).catch(() => null)
      : Promise.resolve(null),
  ]);
  customerPricing.value = mergePricingDocs(byId, byName);
}

// ─── 從繪圖資料產生檯面明細 ──────────────────────────────
// 回傳 { cm, formula }；formula 為人可讀的計算式（讓客戶看得到怎麼算）
//   一字型：sum = 枱面厚 + 背牆 + 台面深度
//           sum > 68 ⇒ 長度 × ((sum-8)/60)
//           sum ≤ 40 ⇒ 長度 × 0.85
//   L  型：左右兩段各自依自己深度比例換算後相加，再扣轉角
//           轉角預設 30；若較淺一側 (厚+背牆+淺深) ≤ 40，改扣「淺深/2」
function computeDrawingLengthCm(state, type, opts = {}) {
  if (!state) return { cm: 0, formula: "" };
  const skipOversize = !!opts.skipOversize;
  const oversizeThreshold = Number(opts.threshold) || 68;
  const thick = Number(state.counterThick) || 0;
  const back = state.backstop ? (Number(state.backHeight) || 0) : 0;
  const fmt = (n) => {
    const r = Math.round(Number(n) * 100) / 100;
    return Number.isInteger(r) ? String(r) : r.toFixed(2).replace(/\.?0+$/, "");
  };
  const sumArr = (arr) => {
    let s = 0;
    if (Array.isArray(arr)) {
      for (const v of arr) {
        const n = parseFloat(v);
        if (!isNaN(n) && n > 0) s += n;
      }
    }
    return s;
  };
  // 回傳 { v, note } — v 為換算後長度，note 為說明（無換算時為空字串）
  const scale = (len, depth) => {
    const d = Number(depth) || 0;
    const sum = thick + back + d;
    if (sum > oversizeThreshold) {
      if (skipOversize) {
        return { v: len, note: `${fmt(len)}(不換算)` };
      }
      const ratio = (sum - 8) / 60;
      return {
        v: len * ratio,
        note: `${fmt(len)}×(${fmt(thick)}+${fmt(back)}+${fmt(d)}-8)/60`,
      };
    }
    if (sum <= 40) {
      return { v: len * 0.85, note: `${fmt(len)}×0.85` };
    }
    return { v: len, note: fmt(len) };
  };

  let total = 0;
  let formula = "";
  if (type === "straight") {
    const len = sumArr(state.cabins);
    const r = scale(len, state.depthVal);
    total = r.v;
    formula = `${r.note} = ${fmt(total)} cm`;
  } else if (type === "l-shape") {
    const lenA = sumArr(state.leftCabins);
    const lenB = sumArr(state.rightCabins);
    const a = scale(lenA, state.leftDepth);
    const b = scale(lenB, state.rightDepth);
    const ld = Number(state.leftDepth) || 0;
    const rd = Number(state.rightDepth) || 0;
    const shallow = Math.min(ld, rd);
    const useShallow =
      shallow > 0 && thick + back + shallow <= 40;
    const cornerDeduct = useShallow ? shallow / 2 : 30;
    total = a.v + b.v - cornerDeduct;
    if (total < 0) total = 0;
    const deductNote = useShallow
      ? `-${fmt(cornerDeduct)}(淺深${fmt(shallow)}/2)`
      : `-30(轉角)`;
    formula = `${a.note} + ${b.note} ${deductNote} = ${fmt(total)} cm`;
  } else {
    // 其他類型（M 型、中島、…）暫不做比例換算
    const arrays = [
      state.cabins,
      state.leftCabins,
      state.rightCabins,
      state.midCabins,
      state.leftArmCabins,
      state.rightArmCabins,
    ];
    const parts = [];
    for (const arr of arrays) {
      const s = sumArr(arr);
      if (s > 0) {
        total += s;
        parts.push(fmt(s));
      }
    }
    formula = parts.length
      ? `${parts.join("+")} = ${fmt(total)} cm`
      : `${fmt(total)} cm`;
  }
  return { cm: Math.round(total * 100) / 100, formula };
}

const DRAWING_TYPE_LABEL = {
  straight: "一字型",
  "l-shape": "L 型",
  "m-shape": "M 型",
  island: "中島",
};

// 從繪圖 state 抓出已啟用的水槽 / 爐子洞
function collectHolesFromDrawing(state) {
  const sinks = [];
  const stoves = [];
  if (!state) return { sinks, stoves };
  // 一字型：sink1/sink2、stove1/stove2
  for (const k of ["sink1", "sink2"]) {
    const x = state[k];
    if (x?.enabled) sinks.push({ length: x.sinkLength, depth: x.sinkDepth });
  }
  for (const k of ["stove1", "stove2"]) {
    const x = state[k];
    if (x?.enabled) stoves.push({ length: x.stoveLength, depth: x.stoveDepth });
  }
  // L/M 型：陣列
  const sinkArrKeys = ["leftSinks", "rightSinks", "midSinks", "leftArmSinks", "rightArmSinks"];
  const stoveArrKeys = ["leftStoves", "rightStoves", "midStoves", "leftArmStoves", "rightArmStoves"];
  for (const k of sinkArrKeys) {
    if (Array.isArray(state[k])) {
      for (const x of state[k]) {
        if (x?.enabled) sinks.push({ length: x.sinkLength, depth: x.sinkDepth });
      }
    }
  }
  for (const k of stoveArrKeys) {
    if (Array.isArray(state[k])) {
      for (const x of state[k]) {
        if (x?.enabled) stoves.push({ length: x.stoveLength, depth: x.stoveDepth });
      }
    }
  }
  return { sinks, stoves };
}

async function syncLineItemsFromDrawings() {
  if (!isEdit.value || !route.params.id) {
    alert("此功能僅可在已建立訂單時使用");
    return;
  }
  let drawings = [];
  try {
    drawings = await listOrderDrawings(route.params.id);
  } catch (e) {
    alert("讀取繪圖失敗：" + (e?.message || e));
    return;
  }
  if (!drawings.length) {
    alert("此訂單目前尚無繪圖資料");
    return;
  }

  const firstStone = (form.value.stones || [])[0];
  const stoneStr = (form.value.stones || [])
    .map((s) => [s.brand, s.color].filter(Boolean).join(" "))
    .filter(Boolean)
    .join(" / ");
  const priceKey = firstStone
    ? [firstStone.brand, firstStone.color].filter(Boolean).join("/")
    : null;
  const defaultPpc = Number(form.value.pricePerCm) || 0;

  // 移除所有「來自繪圖」的明細（檯面 / 水槽 / 爐子），其他類別保留
  const items = (form.value.lineItems || []).filter(
    (li) => !((li.refId || "").startsWith("drawing-")),
  );

  let cntCounter = 0;
  let totalSinks = 0;
  let totalStoves = 0;

  // 一、檯面（每張繪圖一筆；若訂單混合不同門檻的石材，則「分開計」每組各一筆）
  const skipOversize = !!customerPricing.value?.skipOversizeScaling;
  const stoneGroups = groupStonesByThreshold(form.value.stones);
  const isMixed = stoneGroups.length > 1;
  for (const d of drawings) {
    const label = DRAWING_TYPE_LABEL[d.type] || d.type;
    for (const g of stoneGroups) {
      const { cm, formula } = computeDrawingLengthCm(d.state, d.type, {
        skipOversize,
        threshold: g.threshold,
      });
      if (cm <= 0) continue;
      const grpStr = g.stones
        .map((s) => [s.brand, s.color].filter(Boolean).join(" "))
        .filter(Boolean)
        .join(" / ");
      const stonePart = grpStr ? " " + grpStr : "";
      const calc = formula ? `（${formula}）` : `${cm}cm`;
      const desc = `${label}#${d.seq}${isMixed ? `[門檻${g.threshold}]` : ""} ${calc}${stonePart}`;
      const grpPriceKey = g.stones[0]
        ? [g.stones[0].brand, g.stones[0].color].filter(Boolean).join("/")
        : priceKey;
      const refSuffix = isMixed ? `-${g.threshold}` : "";
      items.push({
        id: newLineItemId(),
        category: "countertop",
        refId: `drawing-ct-${d.id}${refSuffix}`,
        priceKey: grpPriceKey,
        description: desc,
        unit: "cm",
        qty: cm,
        unitPrice: defaultPpc,
        amount: Math.round(cm * defaultPpc),
      });
      cntCounter++;
    }
  }

  // 二、水槽（預設下嵌）/ 爐子（預設上掛）— 區分石材材質
  const matLabel = materialLabelFromStones(form.value.stones);
  const sinkMethod = "下嵌";
  const stoveMethod = "上掛";
  const matSuffix = matLabel ? `（${matLabel}）` : "";
  let sinkIdx = 0;
  let stoveIdx = 0;
  for (const d of drawings) {
    const { sinks, stoves } = collectHolesFromDrawing(d.state);
    for (const s of sinks) {
      sinkIdx++;
      const dims = s.length && s.depth ? ` ${s.length}×${s.depth}cm` : "";
      items.push({
        id: newLineItemId(),
        category: "sink",
        refId: `drawing-sink-${d.id}-${sinkIdx}`,
        priceKey: holePriceKey(sinkMethod, matLabel),
        description: `水槽${sinkMethod}${matSuffix}${dims}`,
        unit: "式",
        qty: 1,
        unitPrice: null,
        amount: 0,
      });
      totalSinks++;
    }
    for (const t of stoves) {
      stoveIdx++;
      const dims = t.length && t.depth ? ` ${t.length}×${t.depth}cm` : "";
      items.push({
        id: newLineItemId(),
        category: "stove",
        refId: `drawing-stove-${d.id}-${stoveIdx}`,
        priceKey: holePriceKey(stoveMethod, matLabel),
        description: `爐子${stoveMethod}${matSuffix}${dims}`,
        unit: "式",
        qty: 1,
        unitPrice: null,
        amount: 0,
      });
      totalStoves++;
    }
  }

  if (!cntCounter && !totalSinks && !totalStoves) {
    alert("繪圖中沒有可用的桶身尺寸或水槽/爐子");
    return;
  }

  // 自動套用客戶歷史單價（若有）
  for (const li of items) {
    if ((li.unitPrice == null || li.unitPrice === 0) && (li.refId || "").startsWith("drawing-")) {
      const p = suggestionFor(li);
      if (p != null) {
        li.unitPrice = p;
        recalcLineAmount(li);
      }
    }
  }

  form.value.lineItems = items;
  // 同步更新表單檯面總長（所有繪圖合計）
  const totalCm = items
    .filter((li) => li.category === "countertop" && (li.refId || "").startsWith("drawing-"))
    .reduce((s, li) => s + (Number(li.qty) || 0), 0);
  if (totalCm > 0) form.value.countertop.totalCm = totalCm;

  alert(
    `已從 ${drawings.length} 張繪圖產生明細：\n` +
      `‧檯面 ${cntCounter} 筆（合計 ${totalCm} cm）\n` +
      `‧水槽下嵌 ${totalSinks} 個\n` +
      `‧爐子上掛 ${totalStoves} 個\n` +
      `（價格欄如為空，請手動填入或會自動依歷史價帶入）`,
  );
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

async function pickCustomer(c) {
  form.value.customerId = c.code || c.id;
  form.value.customerName = c.name || "";
  if (c.phone && !form.value.customerContact.phone) {
    form.value.customerContact.phone = c.phone;
  }
  customerKeyword.value = `${c.code || ""} ${c.name || ""}`.trim();
  showCustomerList.value = false;
  // 載入歷史價格
  await loadCustomerPricingForCurrentForm();
  // 如果尚未填價格，自動帶入上次預設
  if (customerPricing.value?.defaultPricePerCm && !form.value.pricePerCm) {
    form.value.pricePerCm = customerPricing.value.defaultPricePerCm;
  }
}

async function toggleSkipOversize(checked) {
  if (!form.value.customerId) return;
  // 立即更新本地與遠端
  if (!customerPricing.value) customerPricing.value = {};
  customerPricing.value.skipOversizeScaling = !!checked;
  try {
    await updateCustomerPricing(form.value.customerId, {
      customerName: form.value.customerName,
      skipOversizeScaling: !!checked,
    });
  } catch (e) {
    console.error(e);
    alert("儲存設定失敗：" + (e?.message || e));
  }
}

function toggleSpecialMethod(name, checked) {
  if (!Array.isArray(form.value.specialMethods)) form.value.specialMethods = [];
  const arr = form.value.specialMethods;
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
    (x) => ((x.brand ? x.brand + " " : "") + x.model) === t || x.model === t
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
    (x) => ((x.brand ? x.brand + " " : "") + x.model) === t || x.model === t
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
    if (!isNaN(n) && n > 0 && n < 100000) d = new Date((n - 25569) * 86400 * 1000);
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
  return {
    customerId: f.customerId || "",
    customerName: f.customerName || "",
    customerContact: { ...f.customerContact },
    owner: { ...f.owner },
    siteAddress: f.siteAddress || "",
    category: f.category || "",
    customerOrderNo: f.customerOrderNo || "",
    orderedAt: trimDate(f.orderedAt),
    stones: f.stones.map((s) => ({ ...s })),
    countertop: { ...f.countertop },
    rearTreatment: f.rearTreatment || "flush",
    specialMethods: Array.isArray(f.specialMethods) ? [...f.specialMethods] : [],
    sinks: normalizeSinks(f.sinks),
    stoves: f.stoves.map((s) => ({ ...s })),
    cutMethod: f.cutMethod || "factory",
    openEdges: { ...f.openEdges },
    extraMm: f.extraMm || null,
    templatingDate: trimDate(f.templatingDate),
    templatingStaff: f.templatingStaff || "",
    drawingStaff: f.drawingStaff || "",
    installDelayResponsibility: f.installDelayResponsibility || "unknown",
    promisedAt: trimDate(f.promisedAt),
    sinkReceivedAt: trimDate(f.sinkReceivedAt),
    specialNotes: f.specialNotes || "",
    isTestData: f.isTestData === true,
    pricePerCm: f.pricePerCm ?? null,
    total: f.total ?? null,
    lineItems: (f.lineItems || []).map((li) => ({ ...li })),
    subtotal: subtotalComputed.value || null,
    invoiceRequired: f.invoiceRequired !== false,
    grandTotal: grandTotalComputed.value || null,
    depositPaid: f.depositPaid ?? null,
    paymentNotes: f.paymentNotes || "",
  };
}

function getPayloadSignature() {
  return JSON.stringify(toPayload());
}

const hasUnsavedEditChanges = computed(() => {
  if (!isEdit.value || loading.value || !lastSavedPayloadSignature.value) return false;
  return getPayloadSignature() !== lastSavedPayloadSignature.value;
});

function resetForNewOrder() {
  form.value = createEmptyOrderForm();
  customerKeyword.value = "";
  showCustomerList.value = false;
  customerPricing.value = null;
  orderStatus.value = "";
  pendingSignSnapshot.value = null;
  pendingSignDrawingVersions.value = {};
  signedScans.value = [];
  designFiles.value = [];
  samplePhotos.value = [];
  siteAddressChecking.value = false;
  siteAddressDuplicates.value = [];
  lastSiteAddressAlertKey.value = "";
}

async function saveOrder({ createNext = false, silent = false } = {}) {
  if (savePromise) return savePromise;

  savePromise = (async () => {
    if (!form.value.customerId) {
      if (!silent) alert("請先選擇客戶");
      return false;
    }
    if (!isEdit.value && draftSiteAddressDuplicates.value.length) {
      if (silent) return false;
      const firstDraft = draftSiteAddressDuplicates.value[0];
      const shouldOpen = confirm("此安裝地點已有草稿，建議直接使用既有草稿，不需再新建。\n\n是否直接前往第一筆草稿？");
      if (shouldOpen && firstDraft?.id) {
        router.push({ name: "order-edit", params: { id: firstDraft.id } });
      }
      return false;
    }

      saving.value = true;
      try {
        const pricingSource = {
          customerId: form.value.customerId,
          customerName: form.value.customerName,
          lineItems: (form.value.lineItems || []).map((li) => ({ ...li })),
          pricePerCm: form.value.pricePerCm,
          stones: (form.value.stones || []).map((stone) => ({ ...stone })),
          orderNo: form.value.orderNo || "",
        };
        const payload = toPayload();
        if (isEdit.value) {
          await updateSalesOrder(route.params.id, payload);
          lastSavedPayloadSignature.value = getPayloadSignature();
          if (createNext) {
            await router.push({ name: "order-new" });
            resetForNewOrder();
            await nextTick();
            focusFirstField();
            if (!silent) alert("已更新，已切換到新建訂單");
          } else if (!silent) {
            alert("已更新");
          }
        } else {
          const id = await createSalesOrder(payload);
          if (createNext) {
            resetForNewOrder();
            if (route.name !== "order-new" || route.query.fromEstimate === "1") {
              await router.replace({ name: "order-new" });
            }
            await nextTick();
            focusFirstField();
            if (!silent) alert(`已建立訂單 (id: ${id})，可直接輸入下一筆`);
          } else {
            if (!silent) alert(`已建立訂單 (id: ${id})`);
            router.replace({ name: "order-edit", params: { id } });
          }
        }
        // 儲存客戶計價記憶：收集 lineItems 裡有 priceKey + unitPrice 的項目
        if (pricingSource.customerId) {
          const stonePrices = {};
          const sinkPrices = {};
          const stovePrices = {};
          const specialPrices = {};
          let defaultPpc = pricingSource.pricePerCm || null;
          const today = new Date().toISOString().slice(0, 10);
          const orderNo = pricingSource.orderNo || "";

          const buckets = {
            countertop: stonePrices,
            sink: sinkPrices,
            stove: stovePrices,
            special: specialPrices,
          };

          for (const li of pricingSource.lineItems || []) {
            if (!li.priceKey || !li.unitPrice) continue;
            const bucket = buckets[li.category];
            if (!bucket) continue;
            bucket[li.priceKey] = {
              lastPrice: Number(li.unitPrice),
              lastDate: today,
              lastOrderNo: orderNo,
            };
            if (li.category === "countertop") defaultPpc = Number(li.unitPrice);
          }

          // 舊路徑：若未使用 lineItems，仍用 pricePerCm + stones 記一筆
          if (!pricingSource.lineItems?.length && pricingSource.pricePerCm) {
            for (const s of pricingSource.stones || []) {
              const key = [s.brand, s.color].filter(Boolean).join('/');
              if (key) stonePrices[key] = {
                lastPrice: Number(pricingSource.pricePerCm),
                lastDate: today,
                lastOrderNo: orderNo,
              };
            }
          }

          const hasAny =
            Object.keys(stonePrices).length ||
            Object.keys(sinkPrices).length ||
            Object.keys(stovePrices).length ||
            Object.keys(specialPrices).length ||
            defaultPpc;
          if (hasAny) {
            await updateCustomerPricing(pricingSource.customerId, {
              customerName: pricingSource.customerName,
              stonePrices, sinkPrices, stovePrices, specialPrices,
              defaultPricePerCm: defaultPpc,
            });
            if (!createNext) {
              await loadCustomerPricingForCurrentForm();
            }
          }
        }
        return true;
      } catch (e) {
        console.error(e);
        if (!silent) alert("儲存失敗：" + (e?.message || e));
        return false;
      } finally {
        saving.value = false;
        savePromise = null;
      }
    })();

    return savePromise;
}

async function onSave() {
  await saveOrder();
}

async function onSaveAndCreateNext() {
  await saveOrder({ createNext: true });
}

async function loadAll() {
  loading.value = true;
  error.value = "";
  try {
    const uid = auth.currentUser?.uid;
    if (uid) {
      const doc = await getUserByUid(uid);
      userRole.value = doc?.role || "";
    }
    const [cs, sinks, stoves, invColors, brandMap, orderOpts, sd1] =
      await Promise.all([
        listCustomers(),
        listProductModels("sink"),
        listProductModels("stove"),
        listInventoryColors(),
        getBrandMaterials(),
        getOrderOptions(),
        listStaffByDept("1"),
      ]);
    customers.value = cs;
    sinkModels.value = sinks;
    stoveModels.value = stoves;
    inventoryColors.value = invColors;
    customBrandMap.value = brandMap || {};
    staffDept1.value = sd1;
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
        signedScans.value = normalizeSignedScans(doc);
        Object.assign(form.value, doc, {
          customerContact: {
            ...form.value.customerContact,
            ...(doc.customerContact || {}),
          },
          owner: { ...form.value.owner, ...(doc.owner || {}) },
          countertop: { ...form.value.countertop, ...(doc.countertop || {}) },
          openEdges: { ...form.value.openEdges, ...(doc.openEdges || {}) },
          stones: doc.stones || [],
          sinks: normalizeSinks(doc.sinks),
          stoves: doc.stoves || [],
          specialMethods: Array.isArray(doc.specialMethods)
            ? doc.specialMethods
            : [],
          installDelayResponsibility: doc.installDelayResponsibility || "unknown",
          lineItems: Array.isArray(doc.lineItems) ? doc.lineItems.map((li) => ({ ...li })) : [],
          invoiceRequired: doc.invoiceRequired !== false,
          orderedAt: doc.orderedAt || "",
        });
        customerKeyword.value =
          `${doc.customerId || ""} ${doc.customerName || ""}`.trim();
        if (form.value.orderedAt) {
          form.value.orderedAt = toDateInputStr(form.value.orderedAt);
        }
        // 統一將 promisedAt 轉成 YYYY-MM-DD（相容 Excel 序號、毫秒時間戳）
        if (form.value.promisedAt) {
          form.value.promisedAt = toDateInputStr(form.value.promisedAt);
        }
        // 載入客戶計價記憑
        if (form.value.customerId) {
          await loadCustomerPricingForCurrentForm();
        }
        lastSavedPayloadSignature.value = getPayloadSignature();
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

    // 由估價單一鍵帶入（僅在新建時）
    if (!isEdit.value && route.query.fromEstimate === "1") {
      try {
        const raw = sessionStorage.getItem("pendingOrderFromEstimate");
        if (raw) {
          const data = JSON.parse(raw);
          Object.assign(form.value, {
            customerId: data.customerId || form.value.customerId,
            customerName: data.customerName || form.value.customerName,
            customerContact: {
              ...form.value.customerContact,
              ...(data.customerContact || {}),
            },
            countertop: { ...form.value.countertop, ...(data.countertop || {}) },
            stones: Array.isArray(data.stones) ? data.stones : form.value.stones,
            pricePerCm: data.pricePerCm ?? form.value.pricePerCm,
            lineItems: Array.isArray(data.lineItems) ? data.lineItems : [],
            subtotal: data.subtotal ?? 0,
            grandTotal: data.grandTotal ?? 0,
            invoiceRequired: data.invoiceRequired !== false,
          });
          customerKeyword.value =
            `${data.customerId || ""} ${data.customerName || ""}`.trim();
          // 載入客戶歷史價
          if (form.value.customerId) {
            await loadCustomerPricingForCurrentForm();
          }
          sessionStorage.removeItem("pendingOrderFromEstimate");
        }
      } catch (e) {
        console.warn("載入估價暫存失敗:", e);
      }
    }
  } catch (e) {
    console.error(e);
    error.value = "載入失敗：" + (e?.message || e);
  } finally {
    loading.value = false;
  }
}

function triggerBestEffortEditAutoSave() {
  if (!hasUnsavedEditChanges.value || saving.value) return;
  void saveOrder({ silent: true }).catch(() => {});
}

function handleOrderEditPageHide() {
  triggerBestEffortEditAutoSave();
}

onMounted(async () => {
  await loadAll();
  await nextTick();
  updateOrderHeaderHeight();
  if (typeof ResizeObserver === "function" && pageHeaderRef.value instanceof HTMLElement) {
    headerResizeObserver = new ResizeObserver(() => updateOrderHeaderHeight());
    headerResizeObserver.observe(pageHeaderRef.value);
  }
  window.addEventListener("pagehide", handleOrderEditPageHide);
  window.addEventListener("beforeunload", handleOrderEditPageHide);
});

onUnmounted(() => {
  window.removeEventListener("pagehide", handleOrderEditPageHide);
  window.removeEventListener("beforeunload", handleOrderEditPageHide);
  headerResizeObserver?.disconnect();
  headerResizeObserver = null;
});

onBeforeRouteLeave(async () => {
  if (!hasUnsavedEditChanges.value) return true;
  const saved = await saveOrder({ silent: true });
  if (saved) return true;
  alert("離開前自動儲存失敗，請先手動儲存。");
  return false;
});
</script>

<style scoped>
.order-edit {
  max-width: 1480px;
  margin: 0 auto;
  --order-header-height: 96px;
  padding: calc(var(--page-sticky-top, 58px) + var(--order-header-height)) 20px
    40px;
}
.page-header {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  position: fixed;
  top: var(--page-sticky-top, 100px);
  left: 50%;
  transform: translateX(-50%);
  width: min(calc(100vw - 40px), 1520px);
  box-sizing: border-box;
  z-index: 30;
  padding: 10px 20px 14px;
  margin-bottom: 22px;
  background: #f7f8fc;
  border-bottom: 1px solid rgba(25, 118, 210, 0.12);
  box-shadow: 0 10px 18px rgba(15, 23, 42, 0.05);
}
.page-header h2 {
  margin: 0;
  flex: 0 0 auto;
  min-width: 150px;
  font-size: clamp(1.4rem, 1.8vw, 2rem);
  letter-spacing: 0.02em;
}
.header-actions {
  display: flex;
  flex: 1 1 520px;
  gap: 10px;
  flex-wrap: wrap;
  margin-left: auto;
  min-width: 0;
  justify-content: flex-end;
}
.btn-primary {
  padding: 10px 18px;
  background: #1976d2;
  color: #fff;
  border: 0;
  border-radius: 10px;
  cursor: pointer;
  font-weight: 600;
  box-shadow: 0 10px 20px rgba(25, 118, 210, 0.18);
}
.btn-primary:disabled {
  background: #999;
  box-shadow: none;
}
.btn-secondary {
  padding: 10px 18px;
  background: #fff;
  border: 1px solid #d5dbe7;
  border-radius: 10px;
  cursor: pointer;
}
.btn-mini {
  padding: 4px 10px;
  font-size: 12px;
  border: 1px solid #1976d2;
  background: #fff;
  color: #1976d2;
  border-radius: 999px;
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
  gap: 18px;
}
@media (min-width: 900px) {
  .form-grid {
    grid-template-columns: minmax(0, 1.05fr) minmax(0, 0.95fr);
  }
  .card.full {
    grid-column: 1 / -1;
  }
}
.card-pricing,
.card-attachments {
  grid-column: 1 / -1;
}
@media (min-width: 1240px) {
  .form-grid {
    grid-template-columns: repeat(12, minmax(0, 1fr));
  }
  .card-customer {
    grid-column: span 5;
  }
  .card-stone {
    grid-column: span 7;
  }
  .card-countertop {
    grid-column: span 5;
  }
  .card-production {
    grid-column: span 7;
  }
  .card-sinks {
    grid-column: span 7;
  }
  .card-stoves {
    grid-column: span 5;
  }
}
.card {
  background: linear-gradient(180deg, #ffffff 0%, #fbfdff 100%);
  border: 1px solid #dde6f3;
  border-radius: 18px;
  padding: 18px 20px 20px;
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.06);
}
.card h3 {
  margin: 0 0 14px 0;
  font-size: 1rem;
  color: #183153;
}
.card-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
  padding-bottom: 12px;
  border-bottom: 1px solid #edf2f8;
}
.card-head h3 {
  margin: 0;
}
.row {
  display: grid;
  grid-template-columns: 120px minmax(0, 1fr);
  align-items: start;
  gap: 10px 14px;
  margin-bottom: 12px;
}
.row label {
  font-size: 13px;
  font-weight: 600;
  color: #4c607a;
  padding-top: 11px;
}
.row input,
.row select,
.row textarea {
  min-height: 42px;
  padding: 9px 12px;
  border: 1px solid #cfd8e6;
  border-radius: 10px;
  font-size: 13px;
  width: 100%;
  box-sizing: border-box;
  background: #fff;
  transition: border-color .18s ease, box-shadow .18s ease, background-color .18s ease;
}
.row textarea {
  min-height: 96px;
  resize: vertical;
}
.inline {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}
.inline input {
  min-height: 42px;
  padding: 9px 12px;
  border: 1px solid #cfd8e6;
  border-radius: 10px;
  font-size: 13px;
}
.sub-row {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 10px;
  flex-wrap: wrap;
  padding: 10px 12px;
  border: 1px solid #edf2f8;
  border-radius: 14px;
  background: #fcfdff;
}
.sub-row input,
.sub-row select {
  min-height: 38px;
  padding: 8px 10px;
  border: 1px solid #cfd8e6;
  border-radius: 10px;
  font-size: 12px;
  min-width: 0;
}
.sink-row {
  border: 1px solid #e8eef7;
  border-radius: 16px;
  padding: 12px;
  margin-bottom: 10px;
  background: #fcfdff;
}
.sink-row-main {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
  margin-bottom: 8px;
}
.sink-row-main input,
.sink-row-main select {
  min-height: 38px;
  padding: 8px 10px;
  border: 1px solid #cfd8e6;
  border-radius: 10px;
  font-size: 12px;
  min-width: 0;
}
.sink-model-input {
  min-width: 160px;
  flex: 1 1 160px;
}
.sink-recipient-input {
  min-width: 120px;
  flex: 0 1 140px;
}
.sink-row-status {
  display: flex;
  gap: 6px;
  align-items: center;
  flex-wrap: wrap;
  padding-top: 4px;
  border-top: 1px dashed #eee;
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
  min-height: 42px;
  padding: 9px 12px;
  border: 1px solid #cfd8e6;
  border-radius: 10px;
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
  border: 1px solid #d7e0ec;
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
  margin-top: 8px;
  font-size: 12px;
  color: #1976d2;
}
.site-address-warning {
  margin-top: 8px;
  padding: 10px 12px;
  border: 1px solid #f4c7a1;
  border-radius: 12px;
  background: #fff8f1;
}
.site-address-warning-title {
  font-size: 12px;
  font-weight: 700;
  color: #b45309;
  margin-bottom: 6px;
}
.site-address-warning-section + .site-address-warning-section {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px dashed #f4c7a1;
}
.site-address-warning-subtitle {
  font-size: 12px;
  font-weight: 600;
  color: #92400e;
  margin-bottom: 6px;
}
.site-address-warning-subtitle strong {
  margin-left: 6px;
  color: #b91c1c;
}
.site-address-warning-list {
  margin: 0;
  padding-left: 18px;
  color: #92400e;
  font-size: 12px;
}
.site-address-warning-list li {
  margin-bottom: 4px;
}
.site-address-warning-list a {
  margin-right: 6px;
  color: #b45309;
  font-weight: 600;
}
.muted {
  color: #999;
}
.price-display {
  font-size: 18px;
  font-weight: 700;
  color: #1565c0;
  letter-spacing: 0.5px;
}
.inline-check {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
}
.line-items-block {
  margin: 14px 0;
  padding: 14px;
  background: #f8fbff;
  border: 1px solid #dbe8f6;
  border-radius: 16px;
  overflow-x: auto;
}
.line-items-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
  flex-wrap: wrap;
}
.line-items-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.line-items-table {
  width: 100%;
  min-width: 760px;
  border-collapse: collapse;
  font-size: 13px;
}
.line-items-table th,
.line-items-table td {
  border-bottom: 1px solid #eee;
  padding: 4px 4px;
  vertical-align: middle;
}
.line-items-table th {
  text-align: left;
  background: #f0f0f0;
  font-weight: 600;
}
.li-input {
  width: 100%;
  padding: 4px 6px;
  border: 1px solid #d0d0d0;
  border-radius: 4px;
  font-size: 13px;
  box-sizing: border-box;
}
.btn-del-line {
  background: #ef5350;
  color: #fff;
  padding: 2px 8px;
}
.btn-del-line:hover {
  background: #d32f2f;
}
.li-price-cell {
  display: flex;
  align-items: center;
  gap: 4px;
}
.btn-suggest {
  flex-shrink: 0;
  padding: 2px 5px;
  font-size: 11px;
  background: #fff3cd;
  color: #856404;
  border: 1px solid #ffd966;
  border-radius: 3px;
  cursor: pointer;
  white-space: nowrap;
}
.btn-suggest:hover {
  background: #ffe896;
}
.pricing-history {
  margin-bottom: 12px;
  padding: 12px 14px;
  background: linear-gradient(180deg, #f3f9ff 0%, #eef6ff 100%);
  border: 1px solid #bfdcff;
  border-radius: 14px;
}
.pricing-history-head {
  font-size: 13px;
  font-weight: 600;
  color: #1565c0;
  margin-bottom: 6px;
  display: flex;
  align-items: center;
  gap: 10px;
}
.pricing-suggestions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
}
.pricing-sugg-item {
  display: flex;
  align-items: center;
  gap: 6px;
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
  grid-template-columns: repeat(auto-fill, minmax(132px, 1fr));
  gap: 8px 12px;
  flex: 1;
}
.check-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  padding: 8px 10px;
  border: 1px solid #e9eef6;
  border-radius: 12px;
  background: #fcfdff;
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
  padding-bottom: 14px;
  border-bottom: 1px solid #edf2f8;
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
  gap: 10px;
  border-radius: 4px;
  overflow: hidden;
  border: 1px solid #e0e0e0;
  width: 132px;
  height: 96px;
  border-radius: 12px;
  width: 100%;
  border: 1px solid #dbe3ef;
  object-fit: cover;
}
.row input:focus,
.row select:focus,
.row textarea:focus,
.inline input:focus,
.sub-row input:focus,
.sub-row select:focus,
.sink-row-main input:focus,
.sink-row-main select:focus,
.customer-picker input:focus,
.li-input:focus {
  outline: none;
  border-color: #5a9cff;
  box-shadow: 0 0 0 4px rgba(90, 156, 255, 0.12);
}
@media (max-width: 899px) {
  .order-edit {
    --order-header-height: 128px;
  }
  .page-header {
    flex-direction: column;
  }
  .header-actions {
    width: 100%;
    justify-content: flex-start;
  }
}
@media (max-width: 640px) {
  .order-edit {
    --order-header-height: 146px;
    padding: calc(var(--page-sticky-top, 58px) + var(--order-header-height))
      12px 28px;
  }
  .page-header {
    width: calc(100vw - 24px);
    padding-left: 12px;
    padding-right: 12px;
  }
  .row {
    grid-template-columns: 1fr;
    gap: 6px;
  }
  .row label {
    padding-top: 0;
  }
  .card {
    padding: 16px;
    border-radius: 16px;
  }
  .card-head {
    align-items: flex-start;
  }
  .line-items-block {
    padding: 12px;
  }
}
.thumb-del {
  position: absolute;
  top: 2px;
  right: 2px;
  background: rgba(0,0,0,0.55);
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
  background: rgba(0,0,0,0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}
.lightbox img {
  max-width: 90vw;
  max-height: 90vh;
  border-radius: 4px;
  box-shadow: 0 4px 32px rgba(0,0,0,0.5);
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
</style>
