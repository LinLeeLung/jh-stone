/**
 * 銀行帳號批量匯入腳本
 *
 * 執行方式（在 functions/ 目錄下）：
 *
 * 步驟一：從 Firebase Console 下載服務帳戶金鑰
 *   https://console.firebase.google.com/project/jh-stone/settings/serviceaccounts/adminsdk
 *   → "產生新的私密金鑰" → 存成 functions\sa.json
 *
 * 步驟二：試跑（不會寫入 Firestore）：
 *   node import-bank-accounts.js --creds=sa.json
 *
 * 步驟三：確認比對結果無誤後正式寫入：
 *   node import-bank-accounts.js --creds=sa.json --apply
 */

const admin = require("firebase-admin");
const path = require("path");

const credsArg = process.argv.find((a) => a.startsWith("--creds="));
if (!credsArg) {
  console.error("請指定 --creds=<服務帳戶JSON路徑>，例如：\n  node import-bank-accounts.js --creds=sa.json");
  process.exit(1);
}
const credsPath = path.resolve(process.cwd(), credsArg.slice(8));
const serviceAccount = require(credsPath);
admin.initializeApp({ credential: admin.credential.cert(serviceAccount), projectId: "jh-stone" });
const db = admin.firestore();

const DRY_RUN = !process.argv.includes("--apply");


// ── 銀行帳號對照表 ──────────────────────────────────────────────────────────
// 格式：{ names: [所有可能在 Firestore 存的名稱], bankAccount: '帳號(不含短橫)' }
// 全部為玉山商業銀行 (808)
const bankMap = [
  { names: ["林李龍"], bankAccount: "0336968058047" },
  { names: ["陳麗卿"], bankAccount: "0886979042359" },
  { names: ["陳文賢"], bankAccount: "0886979081173" },
  { names: ["陳永泰"], bankAccount: "0886979037807" },
  { names: ["楊家斌"], bankAccount: "0886979045800" },
  { names: ["張書翰"], bankAccount: "0886979070942" },
  { names: ["高慈霙"], bankAccount: "0886968129925" },
  // 頼/賴 為不同 Unicode，兩個都列
  { names: ["頼慈賢", "賴慈賢"], bankAccount: "0886979045241" },
  { names: ["吳明哲"], bankAccount: "0886979090806" },
  { names: ["許澤和"], bankAccount: "0886979114545" },
  { names: ["柳齡雁"], bankAccount: "0886466001970" },
  { names: ["吳思頻"], bankAccount: "1436979099584" },
  { names: ["黃志楹"], bankAccount: "0886979102347" },
  { names: ["林于真"], bankAccount: "0886979081173" },
  { names: ["林育芳"], bankAccount: "0886979057884" },
  { names: ["張家翔"], bankAccount: "0886979091648" },
  { names: ["楊詠棨"], bankAccount: "0886979110867" },
  { names: ["黃志忠"], bankAccount: "0886979146240" },
  // 越南籍 - 同時列越文名與括號內中文名
  { names: ["DANG VAN ANH", "鄧文英"], bankAccount: "0886968161517" },
  { names: ["阮宏奇"], bankAccount: "0886968161531" },
  { names: ["NGUYEN TIEN HOA", "阮進化"], bankAccount: "0886968161442" },
  // 王冠堯 (帳號開頭 0554)
  { names: ["王冠堯"], bankAccount: "0554979096809" },
  // 顔/顏 為不同 Unicode
  { names: ["顔呈璋", "顏呈璋"], bankAccount: "0233966131024" },
  { names: ["顔呈翰", "顏呈翰"], bankAccount: "0233966131031" },
  { names: ["PHAM NGOC NAM", "范玉南"], bankAccount: "0886968168629" },
  { names: ["林嘉惠"], bankAccount: "0886979038866" },
  { names: ["NGUYEN VAN VIET", "阮文越"], bankAccount: "0886968169834" },
  { names: ["陳湛"], bankAccount: "0886979166289" },
  { names: ["陳秀君"], bankAccount: "0886979167836" },
  { names: ["蔡翰琳"], bankAccount: "0886466009426" },
  { names: ["陳明群"], bankAccount: "1241968049675" },
  { names: ["黃建凱"], bankAccount: "1436979026020" },
  { names: ["TRAN VAN SAO", "陳文星"], bankAccount: "0886968175812" },
  { names: ["黃明和", "HOANG MINH HOA"], bankAccount: "0886968175826" },
  // 兩個 NGUYEN NGOC PHONG - 一個帳號 622，另一個 565（阮玉奉）
  { names: ["NGUYEN NGOC PHONG", "阮玉鳳", "阮玉奉NGUYEN NGOC PHONG"], bankAccount: "0886968176622" },
  { names: ["阮玉奉"], bankAccount: "0886968176565" },
  { names: ["康何義"], bankAccount: "1436979043913" },
  { names: ["顏嘉良"], bankAccount: "0749979113617" },
  { names: ["林雅軒"], bankAccount: "1436979052289" },
  { names: ["張家維"], bankAccount: "1436979055716" },
  { names: ["黃千千"], bankAccount: "0886979208133" },
  { names: ["黃鄭婷萱"], bankAccount: "0015976477292" },
  { names: ["陳慶樺"], bankAccount: "1436979071542" },
  { names: ["陳冠民"], bankAccount: "0820979233263" },
  // 賴泊翡 - 帳號與頼慈賢相同，為不同人
  { names: ["賴泊翡", "頼泊翡"], bankAccount: "0886979045241" },
  { names: ["顏巧芬"], bankAccount: "0886979150064" },
  { names: ["林沂萱"], bankAccount: "0886976008600" },
  { names: ["盧皇文"], bankAccount: "1078979036455" },
  { names: ["楊時強"], bankAccount: "0886979092903" },
  { names: ["黃湘伶"], bankAccount: "1436979076564" },
  { names: ["郭敬仁"], bankAccount: "1241979118971" },
  { names: ["陳政雄"], bankAccount: "0059979210033" },
  { names: ["林韋宏"], bankAccount: "0059966067546" },
  { names: ["林晨弘"], bankAccount: "1436968015455" },
  { names: ["盧玉恩"], bankAccount: "0602979195186" },
  { names: ["姜凱晟"], bankAccount: "1436979080235" },
  { names: ["余慈勵"], bankAccount: "0886979037696" },
  { names: ["羅志成"], bankAccount: "1436979083206" },
  { names: ["邱譯琳"], bankAccount: "0602976046763" },
  { names: ["洪仕謙"], bankAccount: "1230979232958" },
  // 黃豐宏+ (峻倢) 有帳號
  { names: ["黃豐宏"], bankAccount: "0886979115426" },
  { names: ["紀驊展"], bankAccount: "0185979185254" },
  { names: ["NGUYEN HUNG HOAI", "阮興懷"], bankAccount: "0886968195918" },
  { names: ["DANG VINH QUANG", "鄧榮光"], bankAccount: "0886968196137" },
  { names: ["PHAM VAN DUC", "范文德"], bankAccount: "0886968196176" },
  { names: ["林朋達"], bankAccount: "0886979114538" },
  { names: ["LE DINH HIEN", "黎庭現"], bankAccount: "0886968196393" },
  { names: ["HOANG THANH NAM", "黃青南"], bankAccount: "1436968019140" },
  { names: ["PHAM NGOC HIEN", "范玉顯"], bankAccount: "1436968019254" },
  { names: ["許譯丰"], bankAccount: "0886979241681" },
  { names: ["吳進財"], bankAccount: "0886979150370" },
  { names: ["DANG VAN TUAN", "鄧文俊"], bankAccount: "1436968019037" },
  { names: ["梁壹翔"], bankAccount: "1241976034670" },
  { names: ["費俊豪"], bankAccount: "0886979046286" },
  { names: ["傅子洋"], bankAccount: "0886979250335" },
  { names: ["蘇瑞智"], bankAccount: "1436979104939" },
  { names: ["黃信庭"], bankAccount: "1436979105749" },
  { names: ["吳俊宏"], bankAccount: "1090979241127" },
  { names: ["廖浩然"], bankAccount: "1436976047560" },
  { names: ["NGUYEN VAN MANH", "阮文猛"], bankAccount: "1436968020679" },
];

// ── 比對函式 ─────────────────────────────────────────────────────────────────
// 對照 bankMap 中的 names 陣列，找出與 staffName 最佳匹配的條目
function findBankEntry(staffName) {
  if (!staffName) return null;
  const n = staffName.trim();
  for (const entry of bankMap) {
    for (const alias of entry.names) {
      if (!alias || alias.length < 2) continue;
      if (n === alias) return entry; // 完全比對
      if (n.includes(alias) && alias.length >= 3) return entry; // staff 名包含 alias（外籍複合名）
      if (alias.includes(n) && n.length >= 2) return entry; // alias 包含 staff 名
    }
  }
  return null;
}

// ── 主程式 ────────────────────────────────────────────────────────────────────
async function run() {
  console.log(DRY_RUN ? "=== 試跑模式（不會寫入 Firestore）===" : "=== 正式寫入模式 ===");

  const snap = await db.collection("staff").get();
  console.log(`Firestore 員工總數：${snap.size}`);

  const toUpdate = [];
  const noMatch = [];

  for (const doc of snap.docs) {
    const data = doc.data();
    const staffName = (data.name || "").trim();
    if (!staffName) continue;

    const entry = findBankEntry(staffName);
    if (entry) {
      toUpdate.push({ id: doc.id, name: staffName, bankAccount: entry.bankAccount });
    } else {
      noMatch.push(staffName);
    }
  }

  // 找出 bankMap 條目沒有對應到任何員工的
  const unmappedAliases = [];
  for (const entry of bankMap) {
    const matched = snap.docs.some((doc) => {
      const n = (doc.data().name || "").trim();
      return entry.names.some((alias) => {
        if (!alias || alias.length < 2) return false;
        return n === alias || (n.includes(alias) && alias.length >= 3) || (alias.includes(n) && n.length >= 2);
      });
    });
    if (!matched) unmappedAliases.push(entry.names[0]);
  }

  // ── 輸出結果 ──
  console.log("\n✅ 將更新的員工（共 " + toUpdate.length + " 筆）：");
  for (const u of toUpdate) {
    console.log(`   ${u.name.padEnd(20)} → ${u.bankAccount}`);
  }

  if (noMatch.length) {
    console.log("\n⚠️  Firestore 中無對應銀行帳號的員工（共 " + noMatch.length + " 筆）：");
    for (const n of noMatch) console.log(`   ${n}`);
  }

  if (unmappedAliases.length) {
    console.log("\n❓ 帳號表中未比對到任何員工（可能已離職或名稱不符，共 " + unmappedAliases.length + " 筆）：");
    for (const n of unmappedAliases) console.log(`   ${n}`);
  }

  if (DRY_RUN) {
    console.log("\n試跑完畢，未寫入任何資料。若確認無誤，執行：\n  node import-bank-accounts.js --apply");
    process.exit(0);
  }

  // ── 正式寫入（每批最多 500 筆） ──
  const BATCH_SIZE = 450;
  for (let i = 0; i < toUpdate.length; i += BATCH_SIZE) {
    const batch = db.batch();
    const chunk = toUpdate.slice(i, i + BATCH_SIZE);
    for (const u of chunk) {
      const ref = db.collection("staff").doc(u.id);
      batch.update(ref, {
        bankAccount: u.bankAccount,
        bankName: "玉山商業銀行",
        bankCode: "808",
      });
    }
    await batch.commit();
    console.log(`\n已寫入第 ${i + 1}～${i + chunk.length} 筆`);
  }

  console.log("\n✅ 全部寫入完成！");
  process.exit(0);
}

run().catch((err) => {
  console.error("執行錯誤：", err);
  process.exit(1);
});
