<template>
  <div v-if="modelValue" class="station-dialog-mask" @click.self="cancel">
    <div class="station-dialog" role="dialog" aria-modal="true">
      <header class="station-dialog-header">
        <h3>{{ title }}</h3>
        <button
          type="button"
          class="station-dialog-close"
          title="關閉"
          @click="cancel"
        >
          ×
        </button>
      </header>

      <p v-if="message" class="station-dialog-message">{{ message }}</p>

      <div class="station-dialog-actions">
        <button type="button" class="station-mini-btn" @click="selectAll">
          全選
        </button>
        <button type="button" class="station-mini-btn" @click="clearAll">
          清除
        </button>
      </div>

      <div class="station-options">
        <label
          v-for="station in stations"
          :key="station"
          class="station-option"
        >
          <input type="checkbox" :value="station" v-model="selected" />
          <span>{{ station }}</span>
        </label>
      </div>

      <footer class="station-dialog-footer">
        <button type="button" class="station-btn secondary" @click="cancel">
          取消
        </button>
        <button
          type="button"
          class="station-btn primary"
          :disabled="!selected.length"
          @click="confirm"
        >
          發單 {{ selected.length }} 關
        </button>
      </footer>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from "vue";
import { DEFAULT_DISPATCH_STATIONS } from "../utils/dispatchPdf";

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  title: { type: String, default: "選擇發單關別" },
  message: { type: String, default: "" },
  stations: { type: Array, default: () => DEFAULT_DISPATCH_STATIONS },
});

const emit = defineEmits(["update:modelValue", "confirm", "cancel"]);
const selected = ref([]);

watch(
  () => props.modelValue,
  (open) => {
    if (open) selected.value = [...props.stations];
  },
);

function selectAll() {
  selected.value = [...props.stations];
}

function clearAll() {
  selected.value = [];
}

function cancel() {
  emit("update:modelValue", false);
  emit("cancel");
}

function confirm() {
  if (!selected.value.length) return;
  emit("confirm", [...selected.value]);
  emit("update:modelValue", false);
}
</script>

<style scoped>
.station-dialog-mask {
  position: fixed;
  inset: 0;
  z-index: 5000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(15, 23, 42, 0.45);
}
.station-dialog {
  width: min(420px, 100%);
  background: #fff;
  color: #111827;
  border-radius: 8px;
  box-shadow: 0 20px 45px rgba(15, 23, 42, 0.28);
  overflow: hidden;
}
.station-dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
  border-bottom: 1px solid #e5e7eb;
}
.station-dialog-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
}
.station-dialog-close {
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 6px;
  background: #f3f4f6;
  color: #374151;
  cursor: pointer;
  font-size: 20px;
  line-height: 1;
}
.station-dialog-close:hover {
  background: #e5e7eb;
}
.station-dialog-message {
  margin: 0;
  padding: 12px 16px 0;
  color: #4b5563;
  font-size: 13px;
  line-height: 1.5;
}
.station-dialog-actions {
  display: flex;
  gap: 8px;
  padding: 12px 16px 0;
}
.station-mini-btn {
  border: 1px solid #d1d5db;
  background: #f9fafb;
  color: #374151;
  border-radius: 6px;
  padding: 4px 10px;
  font-size: 12px;
  cursor: pointer;
}
.station-mini-btn:hover {
  background: #f3f4f6;
}
.station-options {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  padding: 14px 16px 16px;
}
.station-option {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 34px;
  padding: 7px 9px;
  border: 1px solid #dbeafe;
  border-radius: 6px;
  background: #eff6ff;
  color: #1e3a8a;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}
.station-option input {
  width: 15px;
  height: 15px;
  cursor: pointer;
}
.station-dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid #e5e7eb;
  background: #f9fafb;
}
.station-btn {
  border-radius: 6px;
  padding: 7px 14px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}
.station-btn.secondary {
  border: 1px solid #d1d5db;
  background: #fff;
  color: #374151;
}
.station-btn.primary {
  border: 1px solid #2563eb;
  background: #2563eb;
  color: #fff;
}
.station-btn.primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
@media (max-width: 480px) {
  .station-options {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
