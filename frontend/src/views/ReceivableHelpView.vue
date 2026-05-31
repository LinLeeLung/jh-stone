<template>
  <div class="help-wrap">
    <div class="help-header">
      <button class="btn-back" @click="$router.back()">← 返回</button>
      <h2>應收帳功能說明</h2>
      <p class="subtitle">適用對象：會計 / 管理者 / admin</p>
    </div>

    <div class="toc">
      <strong>目錄</strong>
      <ol>
        <li><a href="#s1">功能目的</a></li>
        <li><a href="#s2">標準流程</a></li>
        <li><a href="#s3">應收明細</a></li>
        <li><a href="#s4">應收帳單</a></li>
        <li><a href="#s5">帳單詳情</a></li>
        <li><a href="#s6">列印與回簽</a></li>
        <li><a href="#s7">常見狀況</a></li>
      </ol>
    </div>

    <section id="s1">
      <h3>一、功能目的</h3>
      <p>
        應收帳功能用來把已符合請款條件的訂單，先整理成「應收明細」，再依客戶與帳期彙整成「應收帳單」，供會計追蹤請款、開票、收款與列印。
      </p>
      <div class="note">
        簡單說：訂單先進明細，再由明細組成帳單，最後在帳單上做收款與列印。
      </div>
    </section>

    <section id="s2">
      <h3>二、標準流程</h3>
      <ol>
        <li>進入「應收明細」，建立符合條件的可請款明細。</li>
        <li>確認明細金額、帳期與觸發原因是否正確。</li>
        <li>進入「應收帳單」，將待併帳明細生成帳單。</li>
        <li>在帳單詳情內回填發票號、開票日、備註與收款紀錄。</li>
        <li>需要對帳或請款時，可列印總表；需要附回簽時，可列印回簽。</li>
      </ol>
    </section>

    <section id="s3">
      <h3>三、應收明細</h3>
      <p>「應收明細」是帳單前的準備區，一筆通常對應一張訂單。</p>
      <table>
        <thead>
          <tr>
            <th>功能</th>
            <th>說明</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>建立可請款明細</td>
            <td>系統會掃描符合條件的訂單，建立待併帳資料。</td>
          </tr>
          <tr>
            <td>觸發原因</td>
            <td>會顯示為何這筆訂單可請款，例如完工可請款、逾期未安裝可請款。</td>
          </tr>
          <tr>
            <td>狀態</td>
            <td>常見為待併帳、已併帳、作廢。</td>
          </tr>
        </tbody>
      </table>
      <p>
        若訂單已進入帳單，明細狀態會變成「已併帳」，表示不應再重複建立同一筆帳單內容。
      </p>
    </section>

    <section id="s4">
      <h3>四、應收帳單</h3>
      <p>「應收帳單」會依客戶與帳期，把多筆明細合併成一張正式對帳用帳單。</p>
      <table>
        <thead>
          <tr>
            <th>欄位</th>
            <th>用途</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>帳單號</td>
            <td>系統自動編號，供對帳與查詢。</td>
          </tr>
          <tr>
            <td>帳期</td>
            <td>表示本張帳單歸屬月份與結帳區間。</td>
          </tr>
          <tr>
            <td>應收 / 已收 / 未收</td>
            <td>用來快速判斷這張帳單目前是否尚有餘額未收。</td>
          </tr>
          <tr>
            <td>狀態</td>
            <td>草稿、已出帳、部分收款、已收清、作廢。</td>
          </tr>
        </tbody>
      </table>
    </section>

    <section id="s5">
      <h3>五、帳單詳情</h3>
      <p>帳單詳情是會計實際操作的主畫面，可處理以下內容：</p>
      <ol>
        <li>回填發票號與開票日。</li>
        <li>調整應收總額或補充備註。</li>
        <li>新增、修改或刪除收款紀錄。</li>
        <li>查看每一筆訂單明細與對應的最新回簽。</li>
      </ol>
      <div class="note">
        當帳單已有收款後，系統會依已收與未收金額，自動重算狀態為部分收款或已收清。
      </div>
    </section>

    <section id="s6">
      <h3>六、列印與回簽</h3>
      <table>
        <thead>
          <tr>
            <th>列印功能</th>
            <th>用途</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>總表</td>
            <td>列出帳單摘要、客戶資料、帳期與各筆訂單內容，供請款或對帳使用。</td>
          </tr>
          <tr>
            <td>回簽列印</td>
            <td>批次列出帳單內每筆訂單的最新回簽，供附檔或請款佐證使用。</td>
          </tr>
        </tbody>
      </table>
      <p>
        若同一筆訂單有多張回簽，系統會抓最新一張作為列印來源。
      </p>
    </section>

    <section id="s7">
      <h3>七、常見狀況</h3>
      <table>
        <thead>
          <tr>
            <th>狀況</th>
            <th>處理方式</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>建立明細時沒有資料</td>
            <td>先確認是否真的有符合請款條件的訂單，或該訂單是否已經建立過明細。</td>
          </tr>
          <tr>
            <td>帳單生成後金額不符</td>
            <td>先回頭檢查各筆應收明細的金額與來源訂單，再視需要於帳單內調整。</td>
          </tr>
          <tr>
            <td>收款後想修改</td>
            <td>請到帳單詳情中的收款紀錄區，直接修改或刪除原紀錄，不要重複新增。</td>
          </tr>
          <tr>
            <td>列印時缺少回簽</td>
            <td>先確認訂單是否有上傳回簽，且系統是否抓到最新一張可用檔案。</td>
          </tr>
        </tbody>
      </table>
    </section>
  </div>
</template>

<script setup>
// 此頁面為純靜態說明，不需要任何資料請求
</script>

<style scoped>
.help-wrap {
  max-width: 820px;
  margin: 0 auto;
  padding: 24px 20px 60px;
  font-size: 0.95rem;
  line-height: 1.75;
  color: #222;
}

.help-header {
  margin-bottom: 24px;
}

.btn-back {
  background: none;
  border: none;
  color: #2563eb;
  cursor: pointer;
  font-size: 0.9rem;
  padding: 0;
  margin-bottom: 8px;
}

.btn-back:hover {
  text-decoration: underline;
}

h2 {
  font-size: 1.6rem;
  margin: 4px 0 6px;
  border-bottom: 2px solid #2563eb;
  padding-bottom: 8px;
}

.subtitle {
  color: #666;
  font-size: 0.85rem;
  margin: 0;
}

.toc {
  background: #f8faff;
  border: 1px solid #d0dff8;
  border-radius: 8px;
  padding: 14px 18px;
  margin-bottom: 28px;
}

.toc ol {
  margin: 6px 0 0;
  padding-left: 20px;
}

.toc a {
  color: #2563eb;
  text-decoration: none;
}

.toc a:hover {
  text-decoration: underline;
}

section {
  margin-bottom: 32px;
  padding-top: 4px;
}

h3 {
  font-size: 1.15rem;
  border-left: 4px solid #2563eb;
  padding-left: 10px;
  margin: 0 0 14px;
}

table {
  width: 100%;
  border-collapse: collapse;
  margin: 8px 0 14px;
  font-size: 0.9rem;
}

th,
td {
  border: 1px solid #dde;
  padding: 7px 12px;
  text-align: left;
  vertical-align: top;
}

th {
  background: #f0f2f8;
  font-weight: 600;
}

.note {
  background: #fff8e1;
  border: 1px solid #f1d38a;
  border-radius: 6px;
  padding: 12px 14px;
  color: #5f4b12;
}

ol {
  padding-left: 22px;
}

@media (max-width: 640px) {
  .help-wrap {
    padding: 18px 14px 48px;
  }

  table {
    font-size: 0.85rem;
  }
}
</style>