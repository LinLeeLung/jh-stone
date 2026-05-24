<template>
  <div class="order-settings">
    <header class="page-header">
      <h2>訂單設定</h2>
      <p class="muted">維護訂單表單的下拉清單與對應表</p>
    </header>

    <p v-if="loading" class="hint">載入中...</p>
    <p v-if="error" class="error">{{ error }}</p>

    <template v-if="!loading">
      <!-- 訂單類別 -->
      <ListSection title="訂單類別" :items="lists.categories" />

      <!-- 台面型別 -->
      <ListSection title="台面型別" :items="lists.countertopTypes" />

      <!-- 特殊作法 -->
      <ListSection title="特殊作法" :items="lists.specialMethods" />

      <!-- 水槽工法 -->
      <ListSection title="水槽工法" :items="lists.sinkMethods" />

      <!-- 爐子工法 -->
      <ListSection title="爐子工法" :items="lists.stoveMethods" />

      <div class="save-bar">
        <button class="btn-primary" :disabled="saving" @click="saveLists">
          {{ saving ? "儲存中..." : "儲存清單" }}
        </button>
        <span v-if="listMsg" class="muted">{{ listMsg }}</span>
      </div>

      <hr style="margin: 28px 0" />

      <!-- 訂單流水號 -->
      <section class="card">
        <header class="card-head">
          <h3>訂單流水號</h3>
          <p class="muted small">發單時自動產生格式：<b>NNN[客戶代號]</b>，例：001[ABC]。手動輸入時可任意格式。</p>
        </header>
        <div class="row">
          <label>目前計數已至</label>
          <input v-model.number="orderSeq" type="number" min="0" step="1" style="width:110px" />
          <span class="muted small" style="margin-left:10px">下一張為第 <b>{{ (orderSeq || 0) + 1 }}</b> 號</span>
        </div>
        <div class="save-bar">
          <button class="btn-primary" :disabled="savingSeq" @click="saveSeq">
            {{ savingSeq ? '儲存中...' : '儲存流水號' }}
          </button>
          <span v-if="seqMsg" class="muted">{{ seqMsg }}</span>
        </div>
      </section>

      <hr style="margin: 28px 0" />
      <section class="card">
        <header class="card-head">
          <h3>品牌 → 材質對應</h3>
          <p class="muted small">
            訂單建立時選石材品牌會自動帶出材質；未列出的品牌預設為「石英石」。
          </p>
        </header>
        <table class="bm-table">
          <thead>
            <tr>
              <th>品牌</th>
              <th>材質</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, i) in brandMatRows" :key="i">
              <td><input v-model="row.brand" placeholder="品牌名稱" /></td>
              <td>
                <select v-model="row.materialType">
                  <option value="quartz">石英石</option>
                  <option value="porcelain">陶板</option>
                  <option value="granite">人造石</option>
                  <option value="other">其他</option>
                </select>
              </td>
              <td>
                <button class="btn-mini" @click="brandMatRows.splice(i, 1)">
                  刪除
                </button>
              </td>
            </tr>
          </tbody>
        </table>
        <div class="save-bar">
          <button
            class="btn-mini"
            @click="brandMatRows.push({ brand: '', materialType: 'quartz' })"
          >
            + 新增品牌
          </button>
          <button class="btn-primary" :disabled="savingBM" @click="saveBM">
            {{ savingBM ? "儲存中..." : "儲存對應表" }}
          </button>
          <span v-if="bmMsg" class="muted">{{ bmMsg }}</span>
        </div>
      </section>
    </template>
  </div>
</template>

<script setup>
import { ref, h, defineComponent, onMounted } from "vue";
import {
  getOrderOptions,
  saveOrderOptions,
  getBrandMaterials,
  saveBrandMaterials,
  getOrderCounter,
  saveOrderCounter,
} from "../firebase";
import { mergeOrderOptions } from "../utils/orderOptions";

const loading = ref(true);
const saving = ref(false);
const savingBM = ref(false);
const savingSeq = ref(false);
const error = ref("");
const listMsg = ref("");
const bmMsg = ref("");
const seqMsg = ref("");
const orderSeq = ref(0);

const lists = ref({
  categories: [],
  countertopTypes: [],
  specialMethods: [],
  sinkMethods: [],
  stoveMethods: [],
});

const brandMatRows = ref([]);

// 共用的清單編輯子元件（行內）
const ListSection = defineComponent({
  props: { title: String, items: { type: Array, required: true } },
  setup(props) {
    return () =>
      h("section", { class: "card" }, [
        h("header", { class: "card-head" }, [h("h3", null, props.title)]),
        h(
          "div",
          { class: "item-grid" },
          props.items.map((_, i) =>
            h("div", { class: "item-row", key: i }, [
              h("input", {
                value: props.items[i],
                onInput: (e) => (props.items[i] = e.target.value),
                placeholder: "項目名稱",
              }),
              h(
                "button",
                {
                  class: "btn-mini",
                  onClick: () => props.items.splice(i, 1),
                },
                "×",
              ),
            ]),
          ),
        ),
        h(
          "button",
          {
            class: "btn-mini",
            style: "margin-top:8px",
            onClick: () => props.items.push(""),
          },
          "+ 新增",
        ),
      ]);
  },
});

async function loadAll() {
  loading.value = true;
  error.value = "";
  try {
    const [opts, bm, seq] = await Promise.all([
      getOrderOptions(),
      getBrandMaterials(),
      getOrderCounter(),
    ]);
    const merged = mergeOrderOptions(opts);
    lists.value = {
      categories: [...merged.categories],
      countertopTypes: [...merged.countertopTypes],
      specialMethods: [...merged.specialMethods],
      sinkMethods: [...merged.sinkMethods],
      stoveMethods: [...merged.stoveMethods],
    };
    brandMatRows.value = Object.keys(bm)
      .sort()
      .map((brand) => ({ brand, materialType: bm[brand] || "quartz" }));
    orderSeq.value = seq;
  } catch (e) {
    console.error(e);
    error.value = "載入失敗：" + (e?.message || e);
  } finally {
    loading.value = false;
  }
}

async function saveLists() {
  saving.value = true;
  listMsg.value = "";
  try {
    await saveOrderOptions(lists.value);
    listMsg.value = "已儲存。";
  } catch (e) {
    listMsg.value = "儲存失敗：" + (e?.message || e);
  } finally {
    saving.value = false;
  }
}

async function saveBM() {
  savingBM.value = true;
  bmMsg.value = "";
  try {
    const map = {};
    for (const row of brandMatRows.value) {
      const brand = String(row.brand || "").trim();
      if (!brand) continue;
      map[brand] = row.materialType || "quartz";
    }
    await saveBrandMaterials(map);
    bmMsg.value = "已儲存。";
  } catch (e) {
    bmMsg.value = "儲存失敗：" + (e?.message || e);
  } finally {
    savingBM.value = false;
  }
}

async function saveSeq() {
  savingSeq.value = true;
  seqMsg.value = "";
  try {
    await saveOrderCounter(orderSeq.value);
    seqMsg.value = "已儲存。";
  } catch (e) {
    seqMsg.value = "儲存失敗：" + (e?.message || e);
  } finally {
    savingSeq.value = false;
  }
}

onMounted(loadAll);
</script>

<style scoped>
.order-settings {
  max-width: 960px;
  margin: 0 auto;
  padding: 16px;
}
.page-header h2 {
  margin: 0;
}
.muted {
  color: #999;
}
.small {
  font-size: 12px;
}
.hint {
  color: #999;
}
.error {
  color: #c0392b;
}
.card {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 14px;
}
.card-head {
  margin-bottom: 10px;
}
.card-head h3 {
  margin: 0 0 4px;
}
.item-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 6px;
}
.item-row {
  display: flex;
  gap: 4px;
}
.item-row input {
  flex: 1;
  padding: 4px 8px;
  border: 1px solid #d1d5db;
  border-radius: 4px;
}
.bm-table {
  width: 100%;
  border-collapse: collapse;
}
.bm-table th,
.bm-table td {
  border-bottom: 1px solid #eee;
  padding: 6px 8px;
  text-align: left;
}
.bm-table input,
.bm-table select {
  width: 100%;
  padding: 4px 8px;
  border: 1px solid #d1d5db;
  border-radius: 4px;
}
.save-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 12px;
}
.btn-primary {
  background: #1565c0;
  color: #fff;
  border: none;
  padding: 8px 18px;
  border-radius: 4px;
  cursor: pointer;
}
.btn-primary:disabled {
  opacity: 0.6;
}
.btn-mini {
  background: #f1f5f9;
  border: 1px solid #cbd5e1;
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
}
</style>
