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
        <button v-if="canSendConfirmation" class="btn-aux" @click="onSendConfirmation">📨 傳確定單</button>
        <button v-if="canIssue" class="btn-primary btn-issue" @click="showIssuanceDialog = true">✅ 發單</button>
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
          <label>預交日</label>
          <input v-model="form.promisedAt" type="date" />
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

        <!-- 計價 -->
      <section class="card">
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
        <div class="row">
          <label>未稅金額</label>
          <div class="inline">
            <input v-model.number="form.total" type="number" min="0" style="width:140px" placeholder="0" />
            <span class="muted">元</span>
            <button
              v-if="form.pricePerCm && form.countertop.totalCm"
              class="btn-mini"
              type="button"
              @click="form.total = form.pricePerCm * form.countertop.totalCm"
            >套用估算</button>
          </div>
        </div>
        <div class="row">
          <label>含稅金額 (5%)</label>
          <div class="inline">
            <span class="price-display">{{ form.total ? Math.round(form.total * 1.05).toLocaleString() : '—' }} 元</span>
          </div>
        </div>
        <div class="row">
          <label>已收訂金</label>
          <div class="inline">
            <input v-model.number="form.depositPaid" type="number" min="0" style="width:140px" placeholder="0" />
            <span class="muted">元</span>
            <span v-if="form.total && form.depositPaid != null" class="muted small">
              餘款 {{ Math.round(form.total * 1.05 - (form.depositPaid || 0)).toLocaleString() }} 元
            </span>
          </div>
        </div>
        <div class="row">
          <label>收款備註</label>
          <input v-model="form.paymentNotes" type="text" placeholder="例：現金、匯款、分期…" />
        </div>
      </section>

      <!-- 附件（原始圖檔 / 打板照）-->
      <section v-if="isEdit" class="card full">
        <h3>附件</h3>

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
      <section class="card">
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
      @close="showIssuanceDialog = false"
      @issued="onIssued"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
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
  createProductionJob,
  getCustomerPricing,
  updateCustomerPricing,
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

// 上次對當前石材的建議價格
const suggestedPrices = computed(() => {
  if (!customerPricing.value) return [];
  const result = [];
  const prices = customerPricing.value.stonePrices || {};
  for (const s of form.value.stones || []) {
    const key = [s.brand, s.color].filter(Boolean).join('/');
    if (key && prices[key] != null) {
      result.push({ key, label: `${s.brand} ${s.color}`.trim(), price: prices[key] });
    }
  }
  return result;
});

// ─── 發單作業 ────────────────────────────────────────────────
const orderStatus = ref("");
const pendingSignSnapshot = ref(null);
const pendingSignDrawingVersions = ref({});
const showIssuanceDialog = ref(false);
const canSendConfirmation = computed(() => isEdit.value && (!orderStatus.value || orderStatus.value === "draft"));
const canIssue = computed(() => isEdit.value && orderStatus.value === "pendingSign");

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

function onIssued(orderNo) {
  showIssuanceDialog.value = false;
  orderStatus.value = "confirmed";
  // 自動建立生產工單
  createProductionJob(route.params.id, { ...toPayload(), orderNo }).catch(console.error);
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
  templatingStaff: "",
  drawingStaff: "",
  installStaff: [],
  promisedAt: "",
  sinkReceivedAt: "",
  specialNotes: "",
  isTestData: false,
  pricePerCm: null,
  total: null,
  depositPaid: null,
  paymentNotes: "",
});

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
  customerPricing.value = await getCustomerPricing(form.value.customerId);
  // 如果尚未填價格，自動帶入上次預設
  if (customerPricing.value?.defaultPricePerCm && !form.value.pricePerCm) {
    form.value.pricePerCm = customerPricing.value.defaultPricePerCm;
  }
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
    stones: f.stones.map((s) => ({ ...s })),
    countertop: { ...f.countertop },
    rearTreatment: f.rearTreatment || "flush",
    specialMethods: Array.isArray(f.specialMethods) ? [...f.specialMethods] : [],
    sinks: f.sinks.map((s) => ({ ...s })),
    stoves: f.stoves.map((s) => ({ ...s })),
    cutMethod: f.cutMethod || "factory",
    openEdges: { ...f.openEdges },
    extraMm: f.extraMm || null,
    templatingDate: trimDate(f.templatingDate),
    templatingStaff: f.templatingStaff || "",
    drawingStaff: f.drawingStaff || "",
    installStaff: Array.isArray(f.installStaff) ? f.installStaff : (f.installStaff ? [f.installStaff] : []),
    promisedAt: trimDate(f.promisedAt),
    sinkReceivedAt: trimDate(f.sinkReceivedAt),
    specialNotes: f.specialNotes || "",
    isTestData: f.isTestData === true,
    pricePerCm: f.pricePerCm ?? null,
    total: f.total ?? null,
    depositPaid: f.depositPaid ?? null,
    paymentNotes: f.paymentNotes || "",
  };
}

async function onSave() {
  if (!form.value.customerId) {
    alert("請先選擇客戶");
    return;
  }
  saving.value = true;
  try {
    const payload = toPayload();
    if (isEdit.value) {
      await updateSalesOrder(route.params.id, payload);
      alert("已更新");
    } else {
      const id = await createSalesOrder(payload);
      alert(`已建立訂單 (id: ${id})`);
      router.replace({ name: "order-edit", params: { id } });
    }
    // 儲存客戶計價記憑
    if (form.value.customerId && form.value.pricePerCm) {
      const stonePrices = {};
      for (const s of form.value.stones || []) {
        const key = [s.brand, s.color].filter(Boolean).join('/');
        if (key) stonePrices[key] = form.value.pricePerCm;
      }
      await updateCustomerPricing(form.value.customerId, {
        customerName: form.value.customerName,
        stonePrices,
        defaultPricePerCm: form.value.pricePerCm,
      });
      customerPricing.value = await getCustomerPricing(form.value.customerId);
    }
  } catch (e) {
    console.error(e);
    alert("儲存失敗：" + (e?.message || e));
  } finally {
    saving.value = false;
  }
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
          sinks: doc.sinks || [],
          stoves: doc.stoves || [],
          specialMethods: Array.isArray(doc.specialMethods)
            ? doc.specialMethods
            : [],
          installStaff: Array.isArray(doc.installStaff)
            ? doc.installStaff
            : (doc.installStaff ? [doc.installStaff] : []),
        });
        customerKeyword.value =
          `${doc.customerId || ""} ${doc.customerName || ""}`.trim();
        // 統一將 promisedAt 轉成 YYYY-MM-DD（相容 Excel 序號、毫秒時間戳）
        if (form.value.promisedAt) {
          form.value.promisedAt = toDateInputStr(form.value.promisedAt);
        }
        // 載入客戶計價記憑
        if (form.value.customerId) {
          customerPricing.value = await getCustomerPricing(form.value.customerId);
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
  } catch (e) {
    console.error(e);
    error.value = "載入失敗：" + (e?.message || e);
  } finally {
    loading.value = false;
  }
}

onMounted(loadAll);
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
  margin-bottom: 16px;
}
.header-actions {
  display: flex;
  gap: 8px;
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
.price-display {
  font-size: 18px;
  font-weight: 700;
  color: #1565c0;
  letter-spacing: 0.5px;
}
.pricing-history {
  margin-bottom: 12px;
  padding: 10px 12px;
  background: #f0f7ff;
  border: 1px solid #bbdefb;
  border-radius: 6px;
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
