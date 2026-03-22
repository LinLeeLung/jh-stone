<template>
  <section class="page-card">
    <div class="page-head">
      <h1>客戶訂單查詢</h1>
      <p class="muted-text">僅顯示你公司可查看的訂單與完工照片（唯讀）</p>
    </div>

    <div v-if="loading" class="muted-text">讀取資料中…</div>

    <div v-else>
      <p v-if="notice" class="muted-text">{{ notice }}</p>
      <p v-if="errorMessage" class="error-text">{{ errorMessage }}</p>

      <div class="toolbar-row">
        <button class="btn-query" :disabled="loading" @click="loadOrders">
          重新整理
        </button>
      </div>

      <div class="table-wrap" v-if="rows.length">
        <table class="data-table">
          <thead>
            <tr>
              <th>訂單號碼</th>
              <th>客戶名稱</th>
              <th>顏色</th>
              <th>安裝地點</th>
              <th>安裝日</th>
              <th>完工照</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in rows" :key="row.id">
              <td>{{ orderNumberOf(row) }}</td>
              <td>{{ customerNameOf(row) }}</td>
              <td>{{ colorOf(row) }}</td>
              <td>{{ addressOf(row) }}</td>
              <td>{{ installDateOf(row) }}</td>
              <td>{{ photoStatusLabel(row.id) }}</td>
              <td>
                <button class="btn-aux" @click="openPhotos(row)">
                  查看照片
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <p v-else class="muted-text">目前沒有可顯示的訂單。</p>
    </div>

    <div v-if="photoDialogOpen" class="dialog-mask" @click.self="closePhotos">
      <div class="dialog-card">
        <h3>
          完工照片 - {{ activeOrder?.orderNumber || activeOrder?.id || "" }}
        </h3>

        <div class="toolbar-row">
          <button
            class="btn-query"
            :disabled="!selectedPhotoIds.length || sharing"
            @click="shareSelectedPhotos"
          >
            {{ sharing ? "建立分享中…" : "分享選取照片" }}
          </button>
          <button class="btn-aux" :disabled="sharing" @click="closePhotos">
            關閉
          </button>
        </div>

        <p v-if="shareUrl" class="share-row">
          分享連結：
          <a :href="shareUrl" target="_blank" rel="noopener noreferrer">{{
            shareUrl
          }}</a>
        </p>

        <p v-if="photoError" class="error-text">{{ photoError }}</p>

        <div class="photo-grid" v-if="photos.length">
          <article v-for="photo in photos" :key="photo.id" class="photo-card">
            <label class="check-row">
              <input
                type="checkbox"
                :value="photo.id"
                v-model="selectedPhotoIds"
                :disabled="sharing"
              />
              選取
            </label>

            <img
              v-if="!isVideo(photo)"
              :src="photo.downloadURL"
              :alt="photo.fileName || '完工照片'"
            />
            <video
              v-else
              controls
              preload="metadata"
              :src="photo.downloadURL"
            ></video>

            <p class="muted-text file-name">{{ photo.fileName || photo.id }}</p>
          </article>
        </div>

        <p v-else class="muted-text">此訂單尚無完工照片。</p>
      </div>
    </div>
  </section>
</template>

<script setup>
import { onMounted, ref } from "vue";
import {
  auth,
  getUserByUid,
  listMyCompanyOrders,
  getOrderCompletionPhotoStatus,
  listOrderCompletionPhotos,
  createCompletionPhotoShareAlbum,
} from "../firebase";

const loading = ref(false);
const notice = ref("");
const errorMessage = ref("");
const rows = ref([]);
const photoStatusMap = ref({});

const photoDialogOpen = ref(false);
const activeOrder = ref(null);
const photos = ref([]);
const selectedPhotoIds = ref([]);
const shareUrl = ref("");
const sharing = ref(false);
const photoError = ref("");

function firstNonEmpty(source, keys = [], fallback = "") {
  for (const key of keys) {
    const value = String(source?.[key] || "").trim();
    if (value) return value;
  }
  return fallback;
}

function orderNumberOf(row) {
  return firstNonEmpty(row, ["訂單號碼", "訂單編號", "orderNumber"], row.id);
}

function customerNameOf(row) {
  return firstNonEmpty(row, ["客戶名稱", "客戶", "customerName"], "-");
}

function colorOf(row) {
  return firstNonEmpty(row, ["顏色", "石材", "石材類型", "color"], "-");
}

function addressOf(row) {
  return firstNonEmpty(
    row,
    ["安裝地點", "安裝地址", "地址", "installAddress"],
    "-",
  );
}

function installDateOf(row) {
  return firstNonEmpty(row, ["安裝日", "installDate"], "-");
}

function photoStatusLabel(orderDocId) {
  return photoStatusMap.value[orderDocId] ? "有" : "無";
}

function isVideo(photo) {
  return String(photo?.contentType || "")
    .toLowerCase()
    .startsWith("video/");
}

async function loadOrders() {
  loading.value = true;
  notice.value = "";
  errorMessage.value = "";

  try {
    const user = auth.currentUser;
    if (!user) {
      throw new Error("請先登入");
    }

    const userDoc = await getUserByUid(user.uid);
    if (!userDoc) {
      throw new Error("找不到使用者資料");
    }

    if (String(userDoc.role || "") !== "客戶") {
      throw new Error("此頁面僅供客戶帳號使用");
    }

    if (userDoc.customerApproved !== true) {
      notice.value = "帳號審核中，通過後即可查看公司訂單。";
      rows.value = [];
      photoStatusMap.value = {};
      return;
    }

    const result = await listMyCompanyOrders(120);
    rows.value = result;

    const statusMap = await getOrderCompletionPhotoStatus(
      result.map((r) => r.id),
    );
    photoStatusMap.value = statusMap;
  } catch (error) {
    console.error("讀取客戶訂單失敗:", error);
    rows.value = [];
    photoStatusMap.value = {};
    errorMessage.value = String(error?.message || "讀取失敗，請稍後再試");
  } finally {
    loading.value = false;
  }
}

async function openPhotos(order) {
  activeOrder.value = {
    id: String(order?.id || ""),
    orderNumber: orderNumberOf(order),
  };
  shareUrl.value = "";
  selectedPhotoIds.value = [];
  photoError.value = "";
  photos.value = [];
  photoDialogOpen.value = true;

  try {
    photos.value = await listOrderCompletionPhotos(activeOrder.value.id);
  } catch (error) {
    console.error("讀取完工照片失敗:", error);
    photoError.value = String(error?.message || "讀取完工照片失敗");
  }
}

function closePhotos() {
  photoDialogOpen.value = false;
  activeOrder.value = null;
  photos.value = [];
  selectedPhotoIds.value = [];
  shareUrl.value = "";
  photoError.value = "";
}

async function shareSelectedPhotos() {
  if (!activeOrder.value?.id || !selectedPhotoIds.value.length) return;
  sharing.value = true;
  shareUrl.value = "";
  photoError.value = "";

  try {
    const resp = await createCompletionPhotoShareAlbum(
      activeOrder.value.id,
      selectedPhotoIds.value,
      `訂單 ${activeOrder.value.orderNumber} 完工照片`,
    );
    shareUrl.value = String(resp?.url || "");
  } catch (error) {
    console.error("建立照片分享失敗:", error);
    photoError.value = String(error?.message || "建立分享連結失敗");
  } finally {
    sharing.value = false;
  }
}

onMounted(() => {
  loadOrders();
});
</script>

<style scoped>
.error-text {
  color: #dc2626;
}

.dialog-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: grid;
  place-items: center;
  z-index: 40;
  padding: 0.8rem;
}

.dialog-card {
  width: min(980px, 100%);
  max-height: 90vh;
  overflow: auto;
  background: #fff;
  border-radius: 12px;
  border: 1px solid #e5e7eb;
  padding: 0.9rem;
}

.share-row {
  margin: 0.45rem 0;
  word-break: break-all;
}

.photo-grid {
  margin-top: 0.7rem;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 0.6rem;
}

.photo-card {
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 0.5rem;
  background: #fff;
}

.check-row {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  margin-bottom: 0.4rem;
}

.photo-card img,
.photo-card video {
  width: 100%;
  height: 170px;
  object-fit: cover;
  border-radius: 8px;
  background: #000;
}

.file-name {
  margin-top: 0.35rem;
  font-size: 0.85rem;
}
</style>
