<template>
  <div>
    <!-- 公司資訊 -->
    <div class="header">峻晟實業股份有限公司 / 峻倢實業有限公司</div>
    <div class="add">
      新北市林口區南勢街(里)77-3號
      <br />
      TEL: 02-26080192-3 | FAX: 02-26080194
      <br />
      峻晟業務: 楊家斌 0977-087-192 王冠堯 0985-980-568
      <div>估價單</div>
    </div>

    <div class="grid grid-cols-3 gap-x-8 text-sm mb-2">
      <span class="t16 col-span-1">客戶名稱：{{ customer || "" }}</span>
      <span class="t16 col-span-1">☎️：{{ tel || "" }}</span>
      <span class="t16 col-span-1">📠：{{ fax || "" }}</span>
    </div>

    <div class="grid grid-cols-3 gap-x-8 text-sm mb-2">
      <span class="t16 col-span-1">聯絡人：{{ contacter || "" }}</span>
      <span class="t16 col-span-2 break-words min-w-[400px]"
        >地址：{{ add || "" }}</span
      >
    </div>

    <!-- 提醒事項 -->
    <div class="notice">
      <p><span>親愛的客戶你好:</span> 請詳看備註事項,謝謝您</p>
      <p>1. 估價是以現有提供的圖面尺寸初估價格, 未包含任何對圖細節。</p>
      <p>
        PS: 若有任何異動. 依實際施作的台面(尺寸數量)規格計算價格。Ps:
        請桶身師父加强櫃體懸空處結構。
      </p>
      <p>
        2. 其他特殊加工作法, 以實際生產溝通對圖的作法(價格)為主。EX:
        台面懸空處支撐(訂木座或訂製織架&平接處&對紋)
      </p>
      <p>
        單價一律是順紋不對紋的價格（對紋價格會特別備註） PS：紋路板對紋價（單價
        +20%），正式下單時會以實際進貨板料作為電腦對紋模擬彩圖，確定後才施作（盡量對紋）
      </p>

      <p>
        3. 台面尺寸, 要做一整片時, 需看樓層現場電梯是否可進？若需搬運
        (樓梯搬運費另計)。
      </p>
      <p>4. 若有溢估處, 確定不生產或挖孔時, 該筆金額請自行刪除即可。</p>
      <p>
        5. 若為正式訂單, 麻煩貴司傳真最終的完整平面圖及立面圖至峻晟,
        以便安排對圖及安装事宜, 謝謝您。
      </p>
    </div>
  </div>
</template>

<script>
export default {
  name: "QuotationHeader",
  props: {
    customer: String,
    tel: String,
    fax: String,
    contacter: String,
    add: String,
  },
  computed: {
    currentDate() {
      return new Date().toISOString().split("T")[0];
    },
  },
};
</script>
<style scoped></style>
