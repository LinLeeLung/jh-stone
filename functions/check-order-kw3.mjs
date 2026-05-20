// check-order-kw3.mjs - fetch by document ID pattern
import { execSync } from "child_process";

const token = execSync("gcloud auth print-access-token", {
  encoding: "utf8",
}).trim();

// Try common doc ID patterns
const candidates = ["27381BET", "27381", "27381bet"];

for (const docId of candidates) {
  const url = `https://firestore.googleapis.com/v1/projects/jh-stone/databases/(default)/documents/Orders/${docId}`;
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (resp.status === 404) continue;

  const data = await resp.json();
  if (!data.fields) continue;

  const f = data.fields;
  console.log("FOUND doc:", docId);
  console.log("顏色:", f["顏色"]?.stringValue);
  console.log("客戶名稱:", f["客戶名稱"]?.stringValue);
  console.log("安裝地點:", f["安裝地點"]?.stringValue);
  console.log("地址:", f["地址"]?.stringValue);

  const kwArr = (f.searchKeywords?.arrayValue?.values || []).map(
    (v) => v.stringValue,
  );
  console.log("searchKeywords count:", kwArr.length);
  if (kwArr.length > 0) {
    console.log("has 中壢:", kwArr.includes("中壢"));
    console.log("has cl-803:", kwArr.includes("cl-803"));
    console.log("has 精淦:", kwArr.includes("精淦"));
    console.log("has 精淦809bet:", kwArr.includes("精淦809bet"));
    console.log("has 809bet:", kwArr.includes("809bet"));
    console.log("has 809:", kwArr.includes("809"));
  } else {
    console.log("NO searchKeywords!");
  }
  process.exit(0);
}

console.log("NOT FOUND with any candidate ID");
