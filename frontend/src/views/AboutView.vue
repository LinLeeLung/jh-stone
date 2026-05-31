<template>
  <section class="page-card about-page">
    <!-- Hero -->
    <div class="about-hero">
      <div class="about-hero-icon">🪨</div>
      <h1 class="about-title">JH Stone 石材管理系統</h1>
      <p class="about-subtitle">
        整合訂單查詢、庫存管理、完工照片與客戶服務的一站式平台
      </p>
    </div>

    <!-- 未登入提示 -->
    <div v-if="!userDoc" class="about-guest">
      <p>請先登入以查看您可使用的功能。</p>
    </div>

    <div class="about-guide-link">
      <a href="/guide.html" target="_blank" rel="noopener noreferrer"
        >查看完整功能說明</a
      >
    </div>

    <!-- 功能區塊 -->
    <div v-if="userDoc" class="about-grid">
      <!-- 安裝查詢 -->
      <div v-if="isStaff" class="about-card feature-main">
        <div class="about-card-icon">🔍</div>
        <h2>安裝查詢</h2>
        <p class="about-card-desc">
          安裝作業用的訂單查詢中心，提供多種快捷方式快速找到資料。
        </p>
        <ul class="feature-list">
          <li>
            <span class="feat-tag tag-blue">訂單號碼</span>
            輸入訂單號碼直接定位，可搭配安裝日期縮小範圍
          </li>
          <li>
            <span class="feat-tag tag-blue">快速日期</span>
            一鍵查詢「昨天 / 今天 / 明天」的安裝排程
          </li>
          <li>
            <span class="feat-tag tag-green">關鍵字搜尋</span>
            輸入任意字串（品牌代號、地址片段等）全文比對
          </li>
          <li>
            <span class="feat-tag tag-green">多條件片段</span>
            同時指定石材類型、客戶名稱、地址多欄位交叉搜尋
          </li>
          <li>
            <span class="feat-tag tag-orange">進階篩選</span>
            自由新增欄位條件（==、&gt;=、array-contains 等運算子）
          </li>
          <li>
            <span class="feat-tag tag-purple">統計摘要</span>
            查詢結果即時顯示總金額、件數及平均金額
          </li>
          <li>
            <span class="feat-tag tag-purple">完工照片</span>
            查看或上傳完工照片，支援圖片、影片，可直接分享給客戶
          </li>
          <li>
            <span class="feat-tag tag-purple">拆料單 / 訂單 PDF</span>
            點擊訂單號碼或拆料單連結可直接開啟 PDF
          </li>
          <li>
            <span class="feat-tag tag-green">日期區間</span>
            勾選日期區間條件後輸入起訖日，或點「本月」（上月26日～本月25日）、「上個月」（上上月26日～上月25日）快速帶入
          </li>
          <li>
            <span class="feat-tag tag-orange">欄位排序</span>
            點擊表頭可依安裝日、訂單號碼、銷售額、顏色、客戶名稱、安１、裁切者、水刀者、安裝地點、車號、公分數、完工照片排序，再點一次切換升／降冪
          </li>
        </ul>
      </div>

      <!-- 庫存查詢 -->
      <div v-if="isStaff" class="about-card">
        <div class="about-card-icon">🗃️</div>
        <h2>庫存查詢</h2>
        <p class="about-card-desc">石材庫存即時查詢，支援多品牌管理。</p>
        <ul class="feature-list">
          <li>
            <span class="feat-tag tag-blue">品牌／顏色</span>
            依品牌與顏色篩選目前庫存
          </li>
          <li>
            <span class="feat-tag tag-green">尺寸條件</span>
            設定長寬條件過濾可用板材
          </li>
          <li>
            <span class="feat-tag tag-orange">模式切換</span> 餘料 / 大板 /
            已使用 三種檢視模式
          </li>
          <li>
            <span class="feat-tag tag-purple">石材照片</span>
            顯示石材外觀照片，視覺化選料
          </li>
        </ul>
      </div>

      <!-- 完工照片 -->
      <div v-if="isStaff" class="about-card">
        <div class="about-card-icon">📷</div>
        <h2>完工照片管理</h2>
        <p class="about-card-desc">
          NAS 備份結合 Firebase Storage 的雙軌儲存方案。
        </p>
        <ul class="feature-list">
          <li>
            <span class="feat-tag tag-blue">批量上傳</span>
            支援一次選取多張圖片或影片
          </li>
          <li>
            <span class="feat-tag tag-green">進度顯示</span>
            即時顯示每檔上傳進度條
          </li>
          <li>
            <span class="feat-tag tag-orange">LINE 分享</span>
            直接分享圖片或產生相簿連結
          </li>
          <li>
            <span class="feat-tag tag-purple">NAS 同步</span> 自動備份至
            Synology NAS 永久保存
          </li>
        </ul>
      </div>

      <!-- 管理介面 -->
      <div v-if="isAdmin" class="about-card">
        <div class="about-card-icon">⚙️</div>
        <h2>管理介面</h2>
        <p class="about-card-desc">管理者專屬，控制帳號權限與系統維護。</p>
        <ul class="feature-list">
          <li>
            <span class="feat-tag tag-blue">帳號管理</span>
            指派員工、管理者、客戶等角色
          </li>
          <li>
            <span class="feat-tag tag-green">舊照片遷移</span> 將 Firebase
            Storage 舊照片搬移至 NAS
          </li>
          <li>
            <span class="feat-tag tag-orange">NAS 修復</span>
            掃描並修復照片路徑異常的訂單
          </li>
          <li>
            <span class="feat-tag tag-purple">系統設定</span> 設定 NAS
            儲存路徑等系統參數
          </li>
        </ul>
      </div>

      <!-- 客戶服務 -->
      <div v-if="isCustomer" class="about-card">
        <div class="about-card-icon">🏠</div>
        <h2>客戶服務</h2>
        <p class="about-card-desc">客戶帳號專屬的訂單查詢介面。</p>
        <ul class="feature-list">
          <li>
            <span class="feat-tag tag-blue">訂單查詢</span>
            查看所屬公司的所有歷史訂單
          </li>
          <li>
            <span class="feat-tag tag-green">審核機制</span>
            需管理者審核認證後才可使用
          </li>
          <li>
            <span class="feat-tag tag-orange">Google 登入</span> 使用 Google
            帳號快速登入
          </li>
        </ul>
      </div>
    </div>

    <!-- 更新記錄 -->
    <div v-if="userDoc" class="about-changelog">
      <h2 class="changelog-title">更新記錄</h2>
      <div class="changelog-item">
        <span class="changelog-version">v1.3.0</span>
        <span class="changelog-date">2026-04-28</span>
        <ul class="changelog-list">
          <li>
            員工查詢：訂單號碼、安裝日期、顏色／客戶／地址關鍵字等輸入框支援
            Enter 鍵直接送出查詢
          </li>
          <li>訂單 PDF：修正橫向（旋轉 90°）訂單的價格遮罩位置偏移問題</li>
          <li>
            訂單 PDF：新增 PDF 1.5+ 壓縮格式相容性說明及 Chrome 另存為 PDF
            解決步驟（管理者說明頁）
          </li>
        </ul>
      </div>
      <div class="changelog-item">
        <span class="changelog-version">v1.2.0</span>
        <span class="changelog-date">2026-04-23</span>
        <ul class="changelog-list">
          <li>
            員工查詢：新增表格欄位排序功能，點擊表頭即可排序，再點一次反轉
            <ul>
              <li>
                可排序欄位：訂單號碼、銷售額、顏色、客戶名稱、安１、裁切者、水刀者、安裝地點、車號、公分數、完工照片
              </li>
              <li>銷售額、公分數以數字排序；完工照片依是否已上傳排序</li>
              <li>
                訂單號碼若為純數字以數字排序，其餘以字串排序；空值一律排在最後
              </li>
            </ul>
          </li>
        </ul>
      </div>
      <div class="changelog-item">
        <span class="changelog-version">v1.1.0</span>
        <span class="changelog-date">2026-04-09</span>
        <ul class="changelog-list">
          <li>
            完工照片上傳：新增客戶端圖片壓縮（最大 2048px、JPEG 品質
            0.82），大幅縮小檔案體積，降低行動網路上傳失敗率
          </li>
          <li>
            說明頁面：修正部署新版後舊版快取導致動態載入失敗（自動重新整理）
          </li>
        </ul>
      </div>
      <div class="changelog-item">
        <span class="changelog-version">v1.0.0</span>
        <span class="changelog-date">2026-03-24</span>
        <ul class="changelog-list">
          <li>
            完工照片上傳：修正 Synology 路徑含 <code>//</code> 造成錯誤
            119（上傳失敗）
          </li>
          <li>
            完工照片上傳：修正並發上傳時資料夾被重複建立的競速問題（Transaction
            搶佔機制）
          </li>
          <li>
            完工照片列表：修正 iOS 上快速開關對話框造成
            <code>null.id</code> 崩潰
          </li>
        </ul>
      </div>
    </div>

    <!-- 版本 & 技術 -->
    <div class="about-tech">
      <span>v1.3.0</span>
      <span>Vue 3</span>
      <span>Vite</span>
      <span>Firebase Auth</span>
      <span>Firestore</span>
      <span>Cloud Functions</span>
      <span>Firebase Storage</span>
      <span>Synology NAS</span>
    </div>
  </section>
</template>

<script setup>
import { ref, computed, onMounted } from "vue";
import {
  subscribeAuthState,
  getUserByUid,
  getCurrentPerspectiveRole,
  userHasAnyRole,
} from "../firebase";

const userDoc = ref(null);

onMounted(() => {
  subscribeAuthState(async (user) => {
    if (user) {
      userDoc.value = await getUserByUid(user.uid);
    } else {
      userDoc.value = null;
    }
  });
});

const role = computed(() =>
  userDoc.value ? getCurrentPerspectiveRole(userDoc.value) : "",
);

const isStaff = computed(() =>
  userHasAnyRole(userDoc.value, ["員工", "admin", "管理者"], {
    usePerspectiveRole: true,
  }),
);
const isAdmin = computed(() =>
  userHasAnyRole(userDoc.value, ["admin", "管理者"], {
    usePerspectiveRole: true,
  }),
);
const isAdminOnly = computed(() => role.value === "admin");
const isCustomer = computed(() =>
  userHasAnyRole(userDoc.value, ["客戶"], { usePerspectiveRole: true }),
);
</script>

<style scoped>
.about-page {
  max-width: 960px;
  margin: 0 auto;
}

.about-guest {
  text-align: center;
  padding: 24px;
  color: #6b7280;
  font-size: 1rem;
}

.about-guide-link {
  display: flex;
  justify-content: center;
  margin: 0 0 24px;
}

.about-guide-link a {
  display: inline-flex;
  align-items: center;
  padding: 10px 18px;
  border-radius: 999px;
  background: #0f766e;
  color: #fff;
  text-decoration: none;
  font-weight: 700;
  box-shadow: 0 10px 22px rgba(15, 118, 110, 0.18);
}

.about-guide-link a:hover {
  background: #0b5f59;
}

/* Hero */
.about-hero {
  text-align: center;
  padding: 32px 16px 24px;
  border-bottom: 1px solid #e5e7eb;
  margin-bottom: 28px;
}
.about-hero-icon {
  font-size: 3rem;
  line-height: 1;
  margin-bottom: 12px;
}
.about-title {
  font-size: clamp(1.6rem, 3vw, 2rem);
  font-weight: 700;
  margin: 0 0 10px;
  color: #111827;
}
.about-subtitle {
  color: #6b7280;
  font-size: 1rem;
  max-width: 520px;
  margin: 0 auto;
  line-height: 1.6;
}

/* Grid */
.about-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
  margin-bottom: 28px;
}

.about-card {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 20px;
  transition: box-shadow 0.2s;
}
.about-card:hover {
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
}
.feature-main {
  grid-column: 1 / -1;
  background: linear-gradient(135deg, #f0f7ff 0%, #ffffff 60%);
  border-color: #bfdbfe;
}

.about-card-icon {
  font-size: 1.8rem;
  margin-bottom: 8px;
  line-height: 1;
}
.about-card h2 {
  font-size: 1.05rem;
  font-weight: 700;
  margin: 0 0 6px;
  color: #1f2937;
  display: flex;
  align-items: center;
  gap: 8px;
}
.about-card-desc {
  font-size: 0.9rem;
  color: #6b7280;
  margin-bottom: 12px;
  line-height: 1.5;
}

/* Feature list */
.feature-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 7px;
}
.feature-list li {
  font-size: 0.9rem;
  color: #374151;
  display: flex;
  align-items: baseline;
  gap: 7px;
  line-height: 1.45;
}
.feature-main .feature-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 8px;
}

/* Tags */
.feat-tag {
  display: inline-block;
  padding: 1px 9px;
  border-radius: 20px;
  font-size: 0.78rem;
  font-weight: 600;
  white-space: nowrap;
  flex-shrink: 0;
}
.tag-blue {
  background: #dbeafe;
  color: #1d4ed8;
}
.tag-green {
  background: #dcfce7;
  color: #15803d;
}
.tag-orange {
  background: #ffedd5;
  color: #c2410c;
}
.tag-purple {
  background: #ede9fe;
  color: #6d28d9;
}

/* Admin badge */
.badge-admin {
  display: inline-block;
  padding: 1px 8px;
  background: #fef9c3;
  color: #92400e;
  border-radius: 10px;
  font-size: 0.72rem;
  font-weight: 600;
}

/* Tech stack */
/* Changelog */
.about-changelog {
  margin: 28px 0 0;
  padding: 20px 24px;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
}
.changelog-title {
  font-size: 1rem;
  font-weight: 700;
  color: #374151;
  margin: 0 0 16px;
}
.changelog-item {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 12px;
  align-items: baseline;
}
.changelog-version {
  font-size: 0.9rem;
  font-weight: 700;
  color: #1d4ed8;
  background: #dbeafe;
  padding: 2px 10px;
  border-radius: 20px;
  white-space: nowrap;
}
.changelog-date {
  font-size: 0.82rem;
  color: #9ca3af;
  white-space: nowrap;
}
.changelog-list {
  width: 100%;
  margin: 10px 0 0;
  padding-left: 20px;
  color: #374151;
  font-size: 0.88rem;
  line-height: 1.8;
}
.changelog-list code {
  background: #f3f4f6;
  padding: 1px 5px;
  border-radius: 4px;
  font-size: 0.82rem;
  color: #dc2626;
}

.about-tech {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
  padding: 16px 0 4px;
  border-top: 1px solid #f3f4f6;
}
.about-tech span {
  background: #f3f4f6;
  color: #6b7280;
  padding: 3px 12px;
  border-radius: 20px;
  font-size: 0.82rem;
  font-weight: 500;
}
</style>
