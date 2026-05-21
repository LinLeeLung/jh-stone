<template>
  <div class="help-wrap">
    <div class="help-header">
      <button class="btn-back" @click="$router.back()">← 返回</button>
      <h2>薪資計算說明</h2>
      <p class="subtitle">適用系統：JH-Stone 人資管理系統 ／ 計算引擎：Cloud Function <code>calculatePayroll</code></p>
    </div>

    <div class="toc">
      <strong>目錄</strong>
      <ol>
        <li><a href="#s1">加班費</a></li>
        <li><a href="#s2">請假扣薪</a></li>
        <li><a href="#s3">新進員工未滿月計薪</a></li>
        <li><a href="#s4">薪資計算觸發方式</a></li>
        <li><a href="#s5">實領薪資公式</a></li>
        <li><a href="#s6">曠職扣薪</a></li>
        <li><a href="#s7">兩次發薪（5日 / 10日）</a></li>
        <li><a href="#s8">國定假日與補班日</a></li>
      </ol>
    </div>

    <!-- 一、加班費 -->
    <section id="s1">
      <h3>一、加班費</h3>
      <h4>資料來源</h4>
      <p>從 <code>overtimeRequests</code> 查詢該員工當月且已雙層主管簽核（<code>status: "approved2"</code>）的加班申請。</p>
      <h4>計算方式（勞基法第 24 條）</h4>
      <p>時薪基準（月薪制）：<code>時薪 = 月薪 ÷ 240</code>（30天 × 8小時）</p>
      <table>
        <thead><tr><th>加班時數</th><th>費率</th></tr></thead>
        <tbody>
          <tr><td>前 2 小時</td><td>時薪 × 4/3 ≈ 1.333</td></tr>
          <tr><td>第 3 小時起</td><td>時薪 × 5/3 ≈ 1.667</td></tr>
        </tbody>
      </table>
      <p class="note">員工 App 提交加班申請 → 主管兩次審核通過 → 點「計算薪資」→ 自動加總計入</p>
    </section>

    <!-- 二、請假扣薪 -->
    <section id="s2">
      <h3>二、請假扣薪</h3>
      <h4>扣薪規則</h4>
      <table>
        <thead><tr><th>假別</th><th>扣薪比例</th></tr></thead>
        <tbody>
          <tr><td>特休、婚假、喪假、產假、公假</td><td class="ok">不扣薪</td></tr>
          <tr><td>病假、生理假</td><td class="warn">半薪（× 0.5）</td></tr>
          <tr><td>事假、無薪假</td><td class="bad">全扣（× 1.0）</td></tr>
        </tbody>
      </table>
      <p><code>扣薪 = 時薪 × 請假時數 × 比例</code>（天數 × 8 = 小時數）</p>
      <h4>遲到 / 早退扣薪（另計）</h4>
      <p>從打卡紀錄比對上下班時間，超過寬限分鐘數後按分鐘扣薪。規則於「系統設定 → 差勤規則」調整。</p>
    </section>

    <!-- 三、新進員工 -->
    <section id="s3">
      <h3>三、新進員工未滿月計薪</h3>
      <p>適用條件：薪資類型為月薪制，且到職日在當月內。</p>
      <p><code>當月底薪 = 月薪 × (到職日至月底天數 ÷ 當月總天數)</code></p>
      <div class="example">
        <strong>範例</strong>：5 月 15 日到職，月薪 40,000<br>
        40,000 × 17 ÷ 31 ≈ <strong>21,935 元</strong>
      </div>
      <h4>日薪制底薪</h4>
      <p>適用條件：薪資類型為日薪制。</p>
      <p><code>當月底薪 = 日薪 × 當月實際出勤天數（有 punchIn 與 punchOut）</code></p>
    </section>

    <!-- 四、觸發方式 -->
    <section id="s4">
      <h3>四、薪資計算觸發方式</h3>
      <table>
        <thead><tr><th>方式</th><th>說明</th></tr></thead>
        <tbody>
          <tr><td>手動計算</td><td>薪資管理頁面選擇月份後點「計算薪資」</td></tr>
          <tr><td>自動排程</td><td><code>autoCalculatePayroll</code> 每月自動執行（計算上個月）</td></tr>
        </tbody>
      </table>
    </section>

    <!-- 五、實領公式 -->
    <section id="s5">
      <h3>五、實領薪資公式</h3>
      <div class="formula">
        實領 = 底薪 + 獎金 + 加班費 + 伙食費<br>
        　　　− 請假扣薪 − 遲到早退扣薪 − <strong>曠職扣薪</strong><br>
        　　　− 勞保費 − 健保費 − 眷屬健保費<br>
        　　　− 便當費 − 住宿費 − 水費 − 電費 − 體檢費 − 服務費<br>
        　　　− 借款本金 − 借款利息
      </div>
      <p class="note">最小值為 0（不會出現負數）。</p>
    </section>

    <!-- 六、曠職 -->
    <section id="s6">
      <h3>六、曠職扣薪</h3>
      <p><strong>定義：</strong>工作日無出勤打卡且無核准請假。</p>
      <h4>自動偵測條件（全部符合才計入）</h4>
      <table>
        <thead><tr><th>條件</th><th>說明</th></tr></thead>
        <tbody>
          <tr><td>① 非未來日期</td><td>計算當天之後不納入</td></tr>
          <tr><td>② 非到職前</td><td>員工 <code>startDate</code> 之前不計</td></tr>
          <tr><td>③ 非週末</td><td>週六、日跳過（補班日除外）</td></tr>
          <tr><td>④ 非國定假日</td><td>需在「系統設定 → 國定假日」中設定</td></tr>
          <tr><td>⑤ 無出勤打卡</td><td><code>attendance</code> 中找不到當日 <code>punchIn</code></td></tr>
          <tr><td>⑥ 無核准請假</td><td><code>leaveRequests</code> 中無 <code>approved2</code> 假單涵蓋該日</td></tr>
        </tbody>
      </table>
      <h4>扣薪計算</h4>
      <p><code>日薪 = 月薪 ÷ 240 × 8</code></p>
      <p><code>曠職扣薪 = 日薪 × 曠職天數</code></p>
    </section>

    <!-- 七、兩次發薪 -->
    <section id="s7">
      <h3>七、兩次發薪（5 日 / 10 日）</h3>
      <h4>5 日實發</h4>
      <div class="formula">
        5日實發 = max(0,<br>
        　投保薪資 + 申報加班費<br>
        　− 勞保 − 健保 − 眷屬健保 − 便當費 − 住宿費<br>
        　− 水費 − 電費 − 體檢費 − 服務費<br>
        　− 借款本金 − 借款利息 − <strong>曠職扣薪</strong> )
      </div>
      <h4>10 日補發</h4>
      <p><code>10日補發 = 實領 − 5日實發</code></p>
      <div class="note">
        若底薪高於投保薪資或加班費較多，差額於 10 日補齊。<br>
        若 5 日已多發，10 日補發為負數（補扣）。
      </div>
    </section>

    <!-- 八、假日設定 -->
    <section id="s8">
      <h3>八、國定假日與補班日</h3>
      <p>均在「<strong>系統設定</strong>」中維護，支援手動新增及一鍵自動載入。</p>
      <table>
        <thead><tr><th>類型</th><th>效果</th><th>設定位置</th></tr></thead>
        <tbody>
          <tr>
            <td>國定假日</td>
            <td class="ok">該日不計曠職</td>
            <td>系統設定 → 國定假日 / 公司休假日</td>
          </tr>
          <tr>
            <td>補班日</td>
            <td class="warn">週末視為工作日；無打卡 → 計曠職</td>
            <td>系統設定 → 補班日</td>
          </tr>
        </tbody>
      </table>
      <h4>判斷邏輯</h4>
      <div class="logic-flow">
        <div class="lf-row">該日 → 是補班日？</div>
        <div class="lf-branch">
          <div class="lf-yes">是 → 當作工作日，繼續往下判斷</div>
          <div class="lf-no">否 → 是週末？→ 直接跳過（不計曠職）</div>
        </div>
        <div class="lf-row">繼續判斷 → 是國定假日？→ 跳過</div>
        <div class="lf-row">→ 有打卡？→ 跳過</div>
        <div class="lf-row">→ 有核准請假？→ 跳過</div>
        <div class="lf-row lf-result">→ 以上皆否 → <strong>計為曠職</strong></div>
      </div>
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
.btn-back:hover { text-decoration: underline; }
h2 {
  font-size: 1.6rem;
  margin: 4px 0 6px;
  border-bottom: 2px solid #2563eb;
  padding-bottom: 8px;
}
.subtitle { color: #666; font-size: 0.85rem; margin: 0; }
.toc {
  background: #f8faff;
  border: 1px solid #d0dff8;
  border-radius: 8px;
  padding: 14px 18px;
  margin-bottom: 28px;
}
.toc ol { margin: 6px 0 0; padding-left: 20px; }
.toc a { color: #2563eb; text-decoration: none; }
.toc a:hover { text-decoration: underline; }
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
h4 {
  font-size: 0.97rem;
  margin: 16px 0 6px;
  color: #333;
}
table {
  width: 100%;
  border-collapse: collapse;
  margin: 8px 0 14px;
  font-size: 0.9rem;
}
th, td {
  border: 1px solid #dde;
  padding: 7px 12px;
  text-align: left;
  vertical-align: top;
}
th { background: #f0f2f8; font-weight: 600; }
code {
  background: #f0f2f8;
  border-radius: 4px;
  padding: 1px 5px;
  font-family: ui-monospace, Consolas, monospace;
  font-size: 0.88em;
}
.formula {
  background: #f7f9ff;
  border: 1px solid #cdd9f5;
  border-radius: 6px;
  padding: 12px 16px;
  font-family: ui-monospace, Consolas, monospace;
  font-size: 0.9rem;
  line-height: 1.9;
  margin: 8px 0;
}
.example {
  background: #fff8e1;
  border-left: 4px solid #ffc107;
  padding: 10px 14px;
  border-radius: 0 6px 6px 0;
  margin: 8px 0;
  font-size: 0.9rem;
}
.note {
  color: #555;
  font-size: 0.88rem;
  background: #f5f5f5;
  border-left: 3px solid #ccc;
  padding: 6px 12px;
  border-radius: 0 4px 4px 0;
  margin: 6px 0;
}
.ok   { color: #1a7a3c; font-weight: 600; }
.warn { color: #b45309; font-weight: 600; }
.bad  { color: #c0392b; font-weight: 600; }
.logic-flow {
  background: #f7f9ff;
  border: 1px solid #cdd9f5;
  border-radius: 6px;
  padding: 12px 16px;
  font-size: 0.9rem;
  line-height: 2;
}
.lf-row { margin-left: 0; }
.lf-branch { margin-left: 18px; }
.lf-yes { color: #1a7a3c; }
.lf-no  { color: #b45309; }
.lf-result { color: #c0392b; margin-top: 4px; }
</style>
