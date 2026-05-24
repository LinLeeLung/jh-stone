<template>
  <div>
    <div class="quote-tabs no-print">
      <button
        :class="['tab-btn', tab === 'estimate' && 'active']"
        @click="tab = 'estimate'"
      >
        廚具估價單
      </button>
      <button
        :class="['tab-btn', tab === 'site' && 'active']"
        @click="tab = 'site'"
      >
        工地估價單
      </button>
    </div>
    <Estimate v-if="tab === 'estimate'" />
    <SiteEstimate v-else />
  </div>
</template>

<script setup>
import { ref } from 'vue'
import Estimate from '@/components/Estimate.vue'
import SiteEstimate from '@/components/SiteEstimate.vue'

const tab = ref('estimate')
</script>

<style scoped>
.quote-tabs {
  display: flex;
  gap: 8px;
  padding: 12px 16px 0;
  border-bottom: 1px solid #e5e7eb;
  background: #f9fafb;
}
.tab-btn {
  padding: 6px 18px;
  border: 1px solid #d1d5db;
  border-bottom: none;
  border-radius: 6px 6px 0 0;
  background: #fff;
  cursor: pointer;
  font-size: 0.9rem;
  color: #374151;
}
.tab-btn.active {
  background: #1d4ed8;
  color: #fff;
  border-color: #1d4ed8;
}
</style>
