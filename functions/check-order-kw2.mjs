// check-order-kw2.mjs - uses REST API with gcloud token
import { execSync } from "child_process";

const token = execSync("gcloud auth print-access-token", {
  encoding: "utf8",
}).trim();
const orderNo = process.argv[2] || "27381";

const body = JSON.stringify({
  structuredQuery: {
    from: [{ collectionId: "Orders" }],
    where: {
      fieldFilter: {
        field: { fieldPath: "`訂單號碼`" },
        op: "EQUAL",
        value: { stringValue: orderNo },
      },
    },
    limit: 1,
    select: {
      fields: [
        { fieldPath: "`訂單號碼`" },
        { fieldPath: "`顏色`" },
        { fieldPath: "`客戶名稱`" },
        { fieldPath: "`安裝地點`" },
        { fieldPath: "`地址`" },
        { fieldPath: "searchKeywords" },
      ],
    },
  },
});

const resp = await fetch(
  "https://firestore.googleapis.com/v1/projects/jh-stone/databases/(default)/documents:runQuery",
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body,
  },
);

const data = await resp.json();
if (!resp.ok) {
  console.error("Error:", JSON.stringify(data, null, 2));
  process.exit(1);
}

const doc = data[0]?.document;
if (!doc) {
  console.log("NOT FOUND");
  process.exit(0);
}

const f = doc.fields || {};
console.log("id:", doc.name);
console.log("顏色:", f["顏色"]?.stringValue);
console.log("客戶名稱:", f["客戶名稱"]?.stringValue);
console.log("安裝地點:", f["安裝地點"]?.stringValue);
console.log("地址:", f["地址"]?.stringValue);

const kwArr = (f.searchKeywords?.arrayValue?.values || []).map(
  (v) => v.stringValue,
);
console.log("searchKeywords count:", kwArr.length);
console.log("has 中壢:", kwArr.includes("中壢"));
console.log("has cl-803:", kwArr.includes("cl-803"));
console.log("has 精淦:", kwArr.includes("精淦"));
console.log("has 精淦809bet:", kwArr.includes("精淦809bet"));
