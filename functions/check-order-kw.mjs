import { createRequire } from "module";
const require = createRequire(import.meta.url);

// Use firebase-tools auth token via environment
const admin = require("firebase-admin");
admin.initializeApp({ projectId: "jh-stone" });
const db = admin.firestore();

const orderNo = process.argv[2] || "27381";

async function main() {
  // Try as string first, then number
  let snap = await db
    .collection("Orders")
    .where("訂單號碼", "==", orderNo)
    .limit(1)
    .get();
  if (snap.empty) {
    snap = await db
      .collection("Orders")
      .where("訂單號碼", "==", Number(orderNo))
      .limit(1)
      .get();
  }
  if (snap.empty) {
    console.log("NOT FOUND");
    process.exit(1);
  }
  const doc = snap.docs[0];
  const d = doc.data();
  const kw = d.searchKeywords || [];
  console.log("doc id:", doc.id);
  console.log("顏色:", d["顏色"]);
  console.log("客戶名稱:", d["客戶名稱"]);
  console.log("安裝地點:", d["安裝地點"]);
  console.log("地址:", d["地址"]);
  console.log("searchKeywords count:", kw.length);
  console.log("has 中壢:", kw.includes("中壢"));
  console.log("has cl-803:", kw.includes("cl-803"));
  console.log("has 精淦:", kw.includes("精淦"));
  console.log("has 精淦809bet:", kw.includes("精淦809bet"));
  console.log("has 809:", kw.includes("809"));
  console.log("has bet:", kw.includes("bet"));
  process.exit(0);
}
main();
