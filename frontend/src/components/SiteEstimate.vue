<template>
  <div class="container mx-auto p-4 print:p-0">
    <!-- 控制面板 (列印時隱藏) -->
    <div class="no-print mb-4 p-4 bg-gray-100 rounded-lg shadow">
      <h2 class="text-xl font-bold text-green-700 mb-3">工地估價單</h2>

      <!-- 訊息提示 -->
      <div
        v-if="message"
        class="mb-3 p-2 rounded text-sm"
        :class="
          messageType === 'error'
            ? 'bg-red-100 text-red-700'
            : 'bg-green-100 text-green-700'
        "
      >
        {{ message }}
      </div>

      <!-- 檔案管理 -->
      <div class="mb-4 p-3 bg-white rounded border">
        <h3 class="text-sm font-semibold text-gray-700 mb-2">📁 檔案管理</h3>
        <div class="flex flex-wrap items-end gap-2 mb-2">
          <div class="flex-1 min-w-[200px]">
            <label class="block text-xs text-gray-600">檔案名稱</label>
            <input
              v-model="filename"
              type="text"
              class="w-full p-1 border rounded text-sm"
              placeholder="例: 2026-05-林口某工地"
            />
          </div>
          <label class="flex items-center gap-1 text-sm">
            <input v-model="isPublic" type="checkbox" />
            <span>公開讓其他人看到</span>
          </label>
          <button
            @click="saveToFirebase"
            :disabled="saving"
            class="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
          >
            {{ saving ? "儲存中..." : "💾 儲存" }}
          </button>
        </div>

        <div class="flex flex-wrap items-end gap-2">
          <div class="flex-1 min-w-[200px]">
            <label class="block text-xs text-gray-600">載入檔案</label>
            <select
              v-model="selectedFile"
              class="w-full p-1 border rounded text-sm"
            >
              <option value="">-- 請選擇 --</option>
              <optgroup label="我的檔案" v-if="myFiles.length">
                <option v-for="f in myFiles" :key="f.id" :value="f.id">
                  {{ f.filename }} {{ f.isPublic ? "(公開)" : "(私人)" }}
                </option>
              </optgroup>
              <optgroup label="他人公開檔案" v-if="publicFiles.length">
                <option v-for="f in publicFiles" :key="f.id" :value="f.id">
                  {{ f.filename }} - {{ f.ownerName || f.ownerEmail || "他人" }}
                </option>
              </optgroup>
            </select>
          </div>
          <button
            @click="loadFile"
            :disabled="!selectedFile || loading"
            class="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {{ loading ? "載入中..." : "📂 載入" }}
          </button>
          <button
            @click="deleteFile"
            :disabled="!selectedFile || !isSelectedMine"
            class="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600 disabled:opacity-50"
          >
            🗑️ 刪除
          </button>
          <button
            @click="fetchFiles"
            class="px-3 py-1 bg-gray-500 text-white rounded hover:bg-gray-600"
          >
            🔄 重新整理
          </button>
        </div>
      </div>

      <!-- 客戶 / 工地基本資訊 -->
      <div
        class="mb-3 p-3 bg-blue-50 rounded border flex flex-wrap items-center gap-2"
      >
        <label class="text-sm text-gray-700">客戶關鍵字</label>
        <input
          v-model="cuskeyword"
          type="text"
          class="p-1 border rounded text-sm"
          placeholder="輸入關鍵字過濾"
        />
        <label class="text-sm text-gray-700">選擇客戶：</label>
        <select
          v-if="filterCustomers.length > 0"
          v-model="selectedCustomer"
          @change="fillSiteDetails"
          class="bg-green-500 text-white rounded p-1 text-sm"
        >
          <option
            v-for="(c, index) in filterCustomers"
            :key="c.name + '-' + index"
            :value="c"
          >
            {{ c.name }}
          </option>
        </select>
      </div>

      <div class="mb-4 p-3 bg-white rounded border">
        <div class="flex items-center justify-between mb-2">
          <h3 class="text-sm font-semibold text-gray-700">該客戶歷史訂單</h3>
          <span v-if="loadingCustomerOrders" class="text-xs text-gray-500">查詢中...</span>
        </div>
        <p v-if="customerOrdersError" class="text-xs text-red-600 mb-2">
          {{ customerOrdersError }}
        </p>
        <p
          v-if="!loadingCustomerOrders && !customerOrders.length"
          class="text-xs text-gray-500"
        >
          尚未查到此客戶訂單。
        </p>
        <div v-else class="max-h-40 overflow-auto border rounded">
          <table class="w-full text-xs">
            <thead class="bg-gray-50">
              <tr>
                <th class="text-left p-2">訂單號</th>
                <th class="text-left p-2">客戶</th>
                <th class="text-left p-2">地址</th>
                <th class="text-left p-2">更新</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="o in customerOrders"
                :key="o.id"
                class="border-t"
              >
                <td class="p-2">{{ o.orderNo || "—" }}</td>
                <td class="p-2">{{ o.customerName || "—" }}</td>
                <td class="p-2">{{ o.siteAddress || "—" }}</td>
                <td class="p-2">{{ fmtOrderDate(o.updatedAt || o.createdAt) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <div
        class="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4 p-3 bg-white rounded border"
      >
        <div>
          <label class="block text-xs text-gray-600">客戶 (採購單位)</label>
          <input
            v-model="info.customer"
            type="text"
            class="w-full p-1 border rounded"
          />
        </div>
        <div>
          <label class="block text-xs text-gray-600">電話</label>
          <input
            v-model="info.tel"
            type="text"
            class="w-full p-1 border rounded"
          />
        </div>
        <div>
          <label class="block text-xs text-gray-600">傳真</label>
          <input
            v-model="info.fax"
            type="text"
            class="w-full p-1 border rounded"
          />
        </div>
        <div>
          <label class="block text-xs text-gray-600">聯絡人</label>
          <input
            v-model="info.contacter"
            type="text"
            class="w-full p-1 border rounded"
          />
        </div>
        <div>
          <label class="block text-xs text-gray-600">建設公司</label>
          <input
            v-model="info.company"
            type="text"
            class="w-full p-1 border rounded"
          />
        </div>
        <div>
          <label class="block text-xs text-gray-600">工地案名</label>
          <input
            v-model="info.siteName"
            type="text"
            class="w-full p-1 border rounded"
          />
        </div>
        <div>
          <label class="block text-xs text-gray-600">預估戶數</label>
          <input
            v-model.number="info.units"
            type="number"
            class="w-full p-1 border rounded"
          />
        </div>
        <div>
          <label class="block text-xs text-gray-600">進場時間</label>
          <input
            v-model="info.enterDate"
            type="date"
            class="w-full p-1 border rounded"
          />
        </div>
        <div>
          <label class="block text-xs text-gray-600">報價日</label>
          <input
            v-model="info.quoteDate"
            type="date"
            class="w-full p-1 border rounded"
          />
        </div>
        <div>
          <label class="block text-xs text-gray-600">報價有效期限</label>
          <input
            v-model="info.expireDate"
            type="date"
            class="w-full p-1 border rounded"
          />
        </div>
      </div>

      <!-- 水槽 / 火爐 報價 -->
      <div
        class="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4 p-3 bg-white rounded border"
      >
        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-1">水槽 單價</label>
          <div class="flex flex-col gap-1">
            <div class="flex gap-4 text-sm">
              <label class="flex items-center gap-1">
                <input type="radio" v-model="prices.sinkName" value="下嵌" /> 下嵌
              </label>
              <label class="flex items-center gap-1">
                <input type="radio" v-model="prices.sinkName" value="上掛" /> 上掛
              </label>
            </div>
            <input
              v-model.number="prices.sink"
              type="number"
              placeholder="元/只"
              class="w-28 p-1 border rounded"
            />
          </div>
        </div>
        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-1">火爐 單價</label>
          <div class="flex flex-col gap-1">
            <div class="flex gap-4 text-sm">
              <label class="flex items-center gap-1">
                <input type="radio" v-model="prices.stoveName" value="上掛" /> 上掛
              </label>
              <label class="flex items-center gap-1">
                <input type="radio" v-model="prices.stoveName" value="平接" /> 平接
              </label>
            </div>
            <input
              v-model.number="prices.stove"
              type="number"
              placeholder="元/只"
              class="w-28 p-1 border rounded"
            />
          </div>
        </div>
      </div>

      <!-- 石材顏色與每公分單價 -->
      <div class="p-3 bg-white rounded border mb-4">
        <div class="flex items-center justify-between mb-2">
          <label class="block text-sm font-semibold text-gray-700">
            石材顏色及每公分單價
          </label>
          <button
            @click="addStone"
            class="px-3 py-1 bg-green-500 text-white rounded text-sm hover:bg-green-600"
          >
            ➕ 新增顏色
          </button>
        </div>
        <table class="w-full text-sm border-collapse">
          <thead class="bg-gray-100">
            <tr>
              <th class="border p-1">#</th>
              <th class="border p-1">石材顏色</th>
              <th class="border p-1">每公分單價 (元/cm)</th>
              <th class="border p-1">備註</th>
              <th class="border p-1"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(s, idx) in stones" :key="idx">
              <td class="border p-1 text-center">{{ idx + 1 }}</td>
              <td class="border p-1">
                <input v-model="s.color" class="w-full p-0.5 border-b" />
              </td>
              <td class="border p-1">
                <input
                  v-model.number="s.pricePerCm"
                  type="number"
                  class="w-full p-0.5 border-b"
                />
              </td>
              <td class="border p-1">
                <input v-model="s.note" class="w-full p-0.5 border-b" />
              </td>
              <td class="border p-1 text-center">
                <button
                  @click="removeStone(idx)"
                  class="text-red-500 hover:text-red-700"
                >
                  ✕
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- 工資項目 -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4 p-3 bg-white rounded border">
        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-1">插座孔工資</label>
          <input
            v-model.number="prices.socketHole"
            type="number"
            placeholder="元/孔"
            class="w-full p-1 border rounded"
          />
        </div>
        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-1">側落腳工資</label>
          <div class="flex gap-3 text-sm mb-1">
            <label class="flex items-center gap-1">
              <input type="radio" v-model="prices.sideFlatJointType" value="K1卡榫接" /> K1卡榫接
            </label>
            <label class="flex items-center gap-1">
              <input type="radio" v-model="prices.sideFlatJointType" value="H1平接" /> H1平接
            </label>
            <label class="flex items-center gap-1">
              <input type="radio" v-model="prices.sideFlatJointType" value="H2平接" /> H2平接
            </label>
          </div>
          <input
            v-model.number="prices.sideFlatJoint"
            type="number"
            placeholder="元/支"
            class="w-full p-1 border rounded"
          />
        </div>
        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-1">其他項目</label>
          <div class="flex gap-2 mb-1">
            <input
              v-model="prices.otherItemName"
              type="text"
              placeholder="項目名稱"
              class="flex-1 p-1 border rounded"
            />
            <input
              v-model="prices.otherItemInstall"
              type="text"
              placeholder="安裝方式"
              class="w-24 p-1 border rounded"
            />
          </div>
          <div class="flex gap-2">
            <input
              v-model.number="prices.otherItemPrice"
              type="number"
              placeholder="單價"
              class="flex-1 p-1 border rounded"
            />
            <input
              v-model="prices.otherItemUnit"
              type="text"
              placeholder="單位"
              class="w-24 p-1 border rounded"
            />
          </div>
        </div>
      </div>

      <!-- 圖片上傳 -->
      <div class="mb-3 p-3 bg-white rounded border">
        <h3 class="text-sm font-semibold text-gray-700 mb-2">🖼️ 上傳圖片</h3>
        <input
          type="file"
          @change="handleImageUpload"
          accept="image/jpeg, image/png"
          class="text-sm"
        />
        <div v-if="uploadedImageUrl" class="mt-2">
          <label class="text-xs text-gray-600"
            >圖片寬度比例：{{ picRatio }}%</label
          >
          <input
            type="range"
            min="10"
            max="100"
            step="1"
            v-model="picRatio"
            class="w-full mt-1"
          />
          <img
            :src="uploadedImageUrl"
            alt="預覽"
            class="mt-2 border rounded shadow-sm mx-auto block"
            :style="{
              width: picRatio + '%',
              height: 'auto',
              objectFit: 'contain',
            }"
          />
          <button
            @click="uploadedImageUrl = ''"
            class="mt-1 px-2 py-0.5 text-xs bg-red-500 text-white rounded hover:bg-red-600"
          >
            移除圖片
          </button>
        </div>
      </div>

      <div class="flex gap-2 items-center">
        <label class="flex items-center gap-1 text-sm text-orange-600 font-semibold">
          <input v-model="isFutures" type="checkbox" />
          <span>期貨</span>
        </label>
        <label class="flex items-center gap-1 text-sm ml-auto">
          <input v-model="showSeal" type="checkbox" />
          <span>蓋公司印章</span>
        </label>
        <button
          @click="printPage"
          class="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600"
        >
          🖨️ 列印 / 另存 PDF
        </button>
      </div>
    </div>

    <!-- 列印區 -->
    <div class="print-area">

      <!-- 期貨警語 -->
      <div
        v-if="isFutures"
        style="border: 2px solid #cc4400; background: #ffffff; padding: 8px 12px; margin-bottom: 8px; font-size: 13px; color: #cc4400;"
      >
        <div style="font-weight: bold; font-size: 15px; margin-bottom: 4px;">⚠️ 期貨訂貨風險</div>
        <div>(1) 期貨消費者須自負材料損耗（價格會較貴）</div>
        <div>(2) 工程進行時，尺寸下錯、板材瑕疵、運送斷裂⋯等狀況發生時，需再訂貨，消費者會有等待風險</div>
        <div>(3) 日後若有維修，可能會有無料可修的窘境</div>
        <div>(4) 訂貨時間至少 3 至 6 個月，到港時間未確定</div>
        <div>(5) 期貨需先預付 7 成訂金（一經訂貨，就無法變更顏色或取消，所以需先預收訂金）</div>
      </div>

      <div class="company-header">峻晟實業股份有限公司　峻倢實業有限公司</div>
      <div class="company-sub">
        新北市林口區南勢街(里)77-3號D棟之1
        <br />TEL:02-26080192-3　　FAX:02-26080194
      </div>
      <div class="title">工地估價單</div>

      <div class="info-row">
        <span
          >客戶: <u>{{ info.customer }}</u></span
        >
        <span
          >電話: <u>{{ info.tel }}</u></span
        >
        <span
          >傳真: <u>{{ info.fax }}</u></span
        >
      </div>
      <div class="info-row">
        <span
          >聯絡人: <u>{{ info.contacter }}</u></span
        >
        <span
          >建設公司: <u>{{ info.company }}</u></span
        >
      </div>
      <div class="info-row">
        <span
          >工地案名: <u>{{ info.siteName }}</u></span
        >
        <span
          >預估戶數: <u>{{ info.units }}</u> 戶</span
        >
        <span
          >進場時間: <u>{{ info.enterDate }}</u></span
        >
      </div>
      <div class="info-row">
        <span
          >報價日: <u>{{ info.quoteDate }}</u> ({{ weekday }})</span
        >
        <span
          >報價有效期限: <u>{{ info.expireDate }}</u></span
        >
        <span></span>
      </div>

      <div class="notice">
        <p>親愛的客戶你好,</p>
        <p>
          1.依[工地圖面估價],若有任何異動,依實際施作的圖面(尺寸+挖孔數量)規格計算價格。
        </p>
        <p>2.工地案件需3個月前備料(請提供正確數量及尺寸)</p>
        <p>*已確定簽約者請事先通知敝司--(請蓋章回傳此份工地估價單,視同合約)</p>
        <p>*避免物價波動,造成雙方成本損失,請提早知會,謝謝</p>
      </div>

      <!-- 設備報價 -->
      <table class="quote-table">
        <thead>
          <tr>
            <th style="width: 20%">項目</th>
            <th style="width: 15%">安裝方式</th>
            <th style="width: 20%">單價</th>
            <th style="width: 10%">單位</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>水槽</td>
            <td>{{ prices.sinkName }}</td>
            <td class="num">{{ formatMoney(prices.sink) }}</td>
            <td>只</td>
          </tr>
          <tr>
            <td>火爐</td>
            <td>{{ prices.stoveName }}</td>
            <td class="num">{{ formatMoney(prices.stove) }}</td>
            <td>只</td>
          </tr>
          <tr v-if="prices.socketHole">
            <td>插座孔工資</td>
            <td></td>
            <td class="num">{{ formatMoney(prices.socketHole) }}</td>
            <td>孔</td>
          </tr>
          <tr v-if="prices.sideFlatJoint">
            <td>側落腳工資</td>
            <td>{{ prices.sideFlatJointType }}</td>
            <td class="num">{{ formatMoney(prices.sideFlatJoint) }}</td>
            <td>支</td>
          </tr>
          <tr v-if="prices.otherItemName || prices.otherItemPrice">
            <td>{{ prices.otherItemName || '其他項目' }}</td>
            <td>{{ prices.otherItemInstall }}</td>
            <td class="num">{{ formatMoney(prices.otherItemPrice) }}</td>
            <td>{{ prices.otherItemUnit }}</td>
          </tr>
        </tbody>
      </table>

      <!-- 石材顏色報價 -->
      <table class="quote-table" style="margin-top: 6px">
        <thead>
          <tr>
            <th style="width: 8%">#</th>
            <th>石材顏色</th>
            <th style="width: 25%">每公分單價</th>
            <th style="width: 35%">備註</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(s, idx) in printStones" :key="idx">
            <td class="center">
              {{ s.color || s.note || s.pricePerCm ? idx + 1 : "" }}
            </td>
            <td>{{ s.color }}</td>
            <td class="num">
              {{ s.pricePerCm ? formatMoney(s.pricePerCm) + " 元/cm" : "" }}
            </td>
            <td>{{ s.note }}</td>
          </tr>
        </tbody>
      </table>

      <div class="remark-block">
        <div class="remark-label">備註</div>
        <div class="remark-content">
          <p>1.不含收尾(不裝龍頭&水槽配件&瓦斯爐)</p>
          <p>2.整批水槽提籠請勿送至加工廠(恕不代保管責任)</p>
          <p>PS:堅持送來加工廠,(一次點交,無法逐一放置戶別)</p>
          <p>3.客變戶分批進場,一戶酌收1500運費</p>
          <p>4.五戶以上進場免收,低於5戶,一戶收1000元運費</p>
        </div>
      </div>

      <div class="pay-row">
        請款方式: <span class="hl">當月安裝戶數,當月請款</span>
      </div>
      <div class="pay-row">付款方式: 票期二個月</div>

      <table class="sign-table">
        <tr>
          <th>客戶簽章</th>
          <th>業務簽章</th>
          <th>公司簽章</th>
        </tr>
        <tr>
          <td></td>
          <td></td>
          <td>
            <img
              v-if="showSeal"
              :src="sealImageUrl"
              alt="公司印章"
              style="width:80px;height:auto;display:block;margin:0 auto;"
            />
          </td>
        </tr>
      </table>

      <div v-if="uploadedImageUrl" style="margin-top: 8px; text-align: center;">
        <img
          :src="uploadedImageUrl"
          alt="估價圖片"
          :style="{
            width: picRatio + '%',
            height: 'auto',
            objectFit: 'contain',
          }"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, reactive, onMounted } from "vue";
import axios from "axios";
import { auth, db, storage, listSalesOrdersByCustomerName } from "@/firebase";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  setDoc,
  deleteDoc,
  serverTimestamp,
} from "firebase/firestore";
import {
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from "firebase/storage";

const COLLECTION = "siteQuotes";
const STORAGE_DIR = "siteQuotes";

// 客戶搜尋
const cuskeyword = ref("");
const customers = ref([]);
const selectedCustomer = ref(null);
const customerOrders = ref([]);
const loadingCustomerOrders = ref(false);
const customerOrdersError = ref("");

const filterCustomers = computed(() => {
  return [
    { name: "請選擇客戶" },
    ...customers.value.filter((c) =>
      c.name
        .toLowerCase()
        .includes((cuskeyword.value || "").trim().toLowerCase()),
    ),
  ];
});

const fetchCustomers = async () => {
  try {
    const res = await axios.get(
      "https://junchengstone.synology.me/acc/proxy.php",
    );
    customers.value = res.data;
  } catch (err) {
    customers.value = [];
  }
};

async function fetchCustomerOrdersByName(name) {
  const clean = String(name || "").trim();
  if (!clean || clean === "請選擇客戶") {
    customerOrders.value = [];
    customerOrdersError.value = "";
    return;
  }

  loadingCustomerOrders.value = true;
  customerOrdersError.value = "";
  try {
    customerOrders.value = await listSalesOrdersByCustomerName(clean);
  } catch (error) {
    customerOrders.value = [];
    customerOrdersError.value = `查詢失敗：${error?.message || error}`;
  } finally {
    loadingCustomerOrders.value = false;
  }
}

function fmtOrderDate(val) {
  if (!val) return "—";
  const d = val?.toDate ? val.toDate() : new Date(val);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("zh-TW");
}

const fillSiteDetails = () => {
  if (selectedCustomer.value && selectedCustomer.value.name !== "請選擇客戶") {
    info.customer = selectedCustomer.value.name || "";
    info.tel = selectedCustomer.value.tel || "";
    info.fax = selectedCustomer.value.fax || "";
    info.contacter = selectedCustomer.value.contacter || "";
    void fetchCustomerOrdersByName(selectedCustomer.value.name);
  } else {
    customerOrders.value = [];
    customerOrdersError.value = "";
  }
};

const info = reactive({
  customer: "",
  tel: "",
  fax: "",
  contacter: "",
  company: "",
  siteName: "",
  units: null,
  enterDate: "",
  quoteDate: new Date().toISOString().slice(0, 10),
  expireDate: "",
});

const prices = reactive({
  sinkName: "下嵌",
  sink: null,
  stoveName: "上掛",
  stove: null,
  socketHole: null,
  sideFlatJointType: "H1平接",
  sideFlatJoint: null,
  otherItemName: "",
  otherItemInstall: "",
  otherItemPrice: null,
  otherItemUnit: "",
});

const stones = ref([{ color: "", pricePerCm: null, note: "" }]);

function addStone() {
  stones.value.push({ color: "", pricePerCm: null, note: "" });
}
function removeStone(i) {
  stones.value.splice(i, 1);
  if (stones.value.length === 0) addStone();
}

function formatMoney(n) {
  if (n === null || n === "" || isNaN(n)) return "";
  return Number(n).toLocaleString("zh-TW");
}

const MIN_STONE_ROWS = 5;
const displayStones = computed(() => {
  const out = stones.value.map((s) => ({ ...s }));
  while (out.length < MIN_STONE_ROWS) {
    out.push({ color: "", pricePerCm: null, note: "" });
  }
  return out;
});

// 列印用：只顯示有資料的列，不補空白列
const printStones = computed(() => {
  const filled = stones.value.filter((s) => s.color || s.pricePerCm || s.note);
  return filled.length > 0 ? filled : [{ color: "", pricePerCm: null, note: "" }];
});

const weekday = computed(() => {
  if (!info.quoteDate) return "";
  const d = new Date(info.quoteDate);
  return ["日", "一", "二", "三", "四", "五", "六"][d.getDay()];
});

function printPage() {
  window.print();
}

const handleImageUpload = async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  if (!["image/jpeg", "image/png"].includes(file.type)) {
    alert("只能上傳 jpg 或 png 格式的圖片");
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    alert("檔案太大，請選擇小於 5MB 的圖片");
    return;
  }
  const formData = new FormData();
  formData.append("file", file);
  try {
    const res = await axios.post(
      "https://junchengstone.synology.me/accapi/upload.php",
      formData,
      { headers: { "Content-Type": "multipart/form-data" } },
    );
    if (res.data.success) {
      uploadedImageUrl.value = res.data.url;
      showMessage("圖片上傳成功", "success");
    } else {
      alert("上傳失敗，請稍後再試");
    }
  } catch (error) {
    console.error("上傳錯誤", error);
    alert("上傳錯誤，請稍後再試");
  }
};

// ─── 檔案管理 ───────────────────────────────
const filename = ref("");
const isPublic = ref(true);
const selectedFile = ref("");
const files = ref([]);
const saving = ref(false);
const loading = ref(false);
const uploadedImageUrl = ref("");
const picRatio = ref(50);
const showSeal = ref(false);
const isFutures = ref(false);
const sealImageUrl = '/seal.png';
const message = ref("");
const messageType = ref("success");

const myFiles = computed(() => files.value.filter((f) => f.isOwner));
const publicFiles = computed(() => files.value.filter((f) => !f.isOwner));
const isSelectedMine = computed(() => {
  const f = files.value.find((x) => x.id === selectedFile.value);
  return f?.isOwner;
});

function showMessage(text, type = "success") {
  message.value = text;
  messageType.value = type;
  setTimeout(() => (message.value = ""), 3000);
}

function snapshot() {
  return {
    info: { ...info },
    prices: { ...prices },
    stones: stones.value.map((s) => ({ ...s })),
    uploadedImageUrl: uploadedImageUrl.value,
    picRatio: picRatio.value,
    showSeal: showSeal.value,
    updatedAt: new Date().toISOString(),
  };
}

function applyData(data) {
  if (!data) return;
  if (data.info) Object.assign(info, data.info);
  if (data.prices) Object.assign(prices, data.prices);
  if (Array.isArray(data.stones) && data.stones.length) {
    const loaded = data.stones
      .map((s) => ({
        color: s.color || "",
        pricePerCm: s.pricePerCm ?? null,
        note: s.note || "",
      }))
      .filter((s) => s.color || s.pricePerCm || s.note);
    stones.value = loaded.length > 0 ? loaded : [{ color: "", pricePerCm: null, note: "" }];
  }
  uploadedImageUrl.value = data.uploadedImageUrl || "";
  picRatio.value = data.picRatio ?? 50;
  showSeal.value = data.showSeal ?? false;
}

async function fetchFiles() {
  const uid = auth.currentUser?.uid;
  if (!uid) {
    showMessage("尚未登入，無法取得檔案", "error");
    return;
  }
  try {
    // 我的檔案
    const mySnap = await getDocs(
      query(collection(db, COLLECTION), where("owner", "==", uid)),
    );
    const mine = mySnap.docs.map((d) => ({
      id: d.id,
      isOwner: true,
      ...d.data(),
    }));

    // 公開檔案 (排除自己)
    let pub = [];
    try {
      const userSnap = await getDoc(doc(db, "Users", uid));
      const role = userSnap.exists()
        ? userSnap.data().role || "guest"
        : "guest";
      if (role !== "guest") {
        const pubSnap = await getDocs(
          query(collection(db, COLLECTION), where("isPublic", "==", true)),
        );
        pub = pubSnap.docs
          .map((d) => ({ id: d.id, isOwner: false, ...d.data() }))
          .filter((f) => f.owner !== uid);
      }
    } catch (e) {
      console.warn("讀取公開檔失敗", e);
    }

    files.value = [...mine, ...pub].sort((a, b) => {
      const t1 = a.createdAt?.seconds || 0;
      const t2 = b.createdAt?.seconds || 0;
      return t2 - t1;
    });
  } catch (err) {
    console.error("❌ 取檔案失敗", err);
    showMessage("讀取檔案列表失敗", "error");
  }
}

async function saveToFirebase() {
  const uid = auth.currentUser?.uid;
  if (!uid) {
    showMessage("尚未登入，無法儲存", "error");
    return;
  }
  const fname =
    filename.value?.trim() ||
    `${info.quoteDate || new Date().toISOString().slice(0, 10)}-${
      info.siteName || info.customer || "工地估價"
    }`;
  saving.value = true;
  try {
    const content = snapshot();
    const blob = new Blob([JSON.stringify(content)], {
      type: "application/json",
    });
    const fileRef = storageRef(storage, `${STORAGE_DIR}/${uid}/${fname}.json`);
    await uploadBytes(fileRef, blob, {
      contentType: "application/json",
      customMetadata: { isPublic: isPublic.value ? "true" : "false" },
    });
    const downloadURL = await getDownloadURL(fileRef);

    // upsert metadata
    const q = query(
      collection(db, COLLECTION),
      where("owner", "==", uid),
      where("filename", "==", fname),
    );
    const snap = await getDocs(q);
    const docRef = snap.empty
      ? doc(collection(db, COLLECTION))
      : doc(db, COLLECTION, snap.docs[0].id);

    await setDoc(
      docRef,
      {
        filename: fname,
        owner: uid,
        ownerEmail: auth.currentUser.email || "",
        ownerName: auth.currentUser.displayName || "",
        isPublic: isPublic.value,
        downloadURL,
        ...(snap.empty ? { createdAt: serverTimestamp() } : {}),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );

    filename.value = fname;
    showMessage(`✅ 已儲存 ${fname}`);
    await fetchFiles();
  } catch (err) {
    console.error("❌ 儲存失敗", err);
    showMessage("儲存失敗: " + err.message, "error");
  } finally {
    saving.value = false;
  }
}

async function loadFile() {
  const f = files.value.find((x) => x.id === selectedFile.value);
  if (!f) return;
  loading.value = true;
  try {
    let url = f.downloadURL;
    if (!url) {
      const fref = storageRef(
        storage,
        `${STORAGE_DIR}/${f.owner}/${f.filename}.json`,
      );
      url = await getDownloadURL(fref);
    }
    const res = await fetch(url);
    if (!res.ok) throw new Error("下載失敗");
    const data = await res.json();
    applyData(data);
    filename.value = f.filename;
    isPublic.value = !!f.isPublic;
    showMessage(`✅ 已載入 ${f.filename}`);
  } catch (err) {
    console.error("❌ 載入失敗", err);
    showMessage("載入失敗: " + err.message, "error");
  } finally {
    loading.value = false;
  }
}

async function deleteFile() {
  const f = files.value.find((x) => x.id === selectedFile.value);
  if (!f || !f.isOwner) return;
  if (!confirm(`確定要刪除「${f.filename}」嗎？`)) return;
  try {
    try {
      await deleteObject(
        storageRef(storage, `${STORAGE_DIR}/${f.owner}/${f.filename}.json`),
      );
    } catch (e) {
      console.warn("Storage 刪除失敗 (可能不存在)", e);
    }
    await deleteDoc(doc(db, COLLECTION, f.id));
    selectedFile.value = "";
    showMessage(`✅ 已刪除 ${f.filename}`);
    await fetchFiles();
  } catch (err) {
    console.error("❌ 刪除失敗", err);
    showMessage("刪除失敗: " + err.message, "error");
  }
}

onMounted(() => {
  fetchCustomers();
  // 等 auth 就緒再抓檔案列表
  if (auth.currentUser) {
    fetchFiles();
  } else {
    const unsub = auth.onAuthStateChanged((u) => {
      if (u) {
        fetchFiles();
        unsub();
      }
    });
  }
});
</script>

<style scoped>
.print-area {
  background: #fff;
  padding: 12px 20px;
  border: 1px solid #999;
  font-family: "DFKai-SB", "標楷體", "BiauKai", "Noto Serif TC", serif;
  color: #000;
  max-width: 820px;
  margin: 0 auto;
}
.company-header {
  text-align: center;
  font-size: 20px;
  font-weight: bold;
  letter-spacing: 2px;
}
.company-sub {
  text-align: center;
  font-size: 12px;
  line-height: 1.4;
  margin-bottom: 4px;
}
.title {
  text-align: center;
  font-size: 22px;
  font-weight: bold;
  margin: 4px 0 8px;
  letter-spacing: 4px;
}
.info-row {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  margin-bottom: 4px;
  gap: 12px;
}
.info-row span {
  flex: 1;
}
.info-row u {
  display: inline-block;
  min-width: 90px;
}
.notice {
  font-size: 12px;
  line-height: 1.5;
  margin: 6px 0;
}
.notice p {
  margin: 0;
}
.quote-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.quote-table th,
.quote-table td {
  border: 1px solid #000;
  padding: 4px 6px;
  text-align: center;
  height: 24px;
}
.quote-table th {
  background: #f3f3f3;
}
.quote-table td.num {
  text-align: right;
}
.quote-table td.center {
  text-align: center;
}
.remark-block {
  display: flex;
  border: 1px solid #000;
  border-top: none;
  font-size: 12px;
  margin-top: 6px;
}
.remark-label {
  width: 50px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
  border-right: 1px solid #000;
}
.remark-content {
  flex: 1;
  padding: 2px 6px;
}
.remark-content p {
  margin: 0;
  line-height: 1.4;
}
.pay-row {
  font-size: 12px;
  margin-top: 4px;
}
.pay-row .hl {
  color: red;
  font-weight: bold;
}
.sign-table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 6px;
  font-size: 13px;
}
.sign-table th,
.sign-table td {
  border: 1px solid #000;
  text-align: center;
  padding: 4px;
}
.sign-table td {
  height: 60px;
}

@page {
  margin: 10mm 12mm;
  size: A4 portrait;
}

@media print {
  * {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  .no-print {
    display: none !important;
  }
  .print-area {
    border: none;
    padding: 0;
    max-width: none;
    width: 100%;
  }
  .quote-table th {
    background: #f3f3f3 !important;
  }
  body, html {
    margin: 0 !important;
    padding: 0 !important;
  }
}
</style>
