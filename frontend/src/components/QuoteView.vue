<template>
  <div class="container p-4">
    <h1 class="text-2xl font-bold text-green-600 mb-4">估價表分享內容</h1>
    <div v-if="error" class="text-red-500">{{ error }}</div>
    <div v-else-if="loading">載入中...</div>
    <div v-else>
      <pre class="bg-gray-100 p-4 rounded overflow-x-auto">
        {{ JSON.stringify(quoteData, null, 2) }}
      </pre>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import axios from 'axios';

const route = useRoute();
const filename = route.params.filename;
const quoteData = ref(null);
const error = ref('');
const loading = ref(true);

onMounted(async () => {
  try {
    const res = await axios.get(`https://junchengstone.synology.me/accapi/?action=load`, {
      params: { filename }
    });
    quoteData.value = res.data.content;
  } catch (err) {
    error.value = '讀取檔案失敗，請確認檔名是否正確';
  } finally {
    loading.value = false;
  }
});
</script>

<style scoped>
pre {
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
