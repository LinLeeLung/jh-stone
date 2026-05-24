// 訂單表單下拉預設清單。Firestore 內若有自訂值會覆蓋這份預設。

export const DEFAULT_CATEGORIES = [
  "零售",
  "特力屋",
  "工地",
  "維修",
  "門市",
  "樣品",
  "修改",
  "貿易加工",
  "餘料加工",
  "裁水槽",
  "板材",
  "峻砷代工",
  "人造石代工",
  "自備料",
  "假日工資",
  "致高代工",
  "搬樓梯費用",
  "已生產二次派工",
  "代訂水槽",
  "五金",
  "代請款(峻益)",
  "拆枱面",
  "峻益代工",
  "已取消",
  "東固代工",
  "代請款峻砷",
  "辦公室+業務",
  "廠內",
  "安裝",
  "廣鈺代工",
  "晶瑞代工",
  "運費",
];

export const DEFAULT_COUNTERTOP_TYPES = [
  "一字",
  "L型",
  "ㄇ型",
  "中島",
  "一字+側落",
  "L型+側落",
  "ㄇ字+側落",
  "門檻",
  "浴櫃",
  "包木座",
  "雙一字",
  "一字+L型",
  "L型+中島",
  "一字+中島",
  "中島+側落+美背",
  "雙L",
  "背牆",
  "拆檯面",
  "雙一字+中島",
  "餘料加工",
  "換水槽",
  "貼壁",
  "一字+貼壁",
  "L型+高背",
  "ㄇ字+貼壁",
];

export const DEFAULT_SPECIAL_METHODS = [
  "背牆發翅",
  "法國邊",
  "假腳",
  "包浴缸",
  "包窗框",
  "砧板",
  "水槽蓋板",
  "斜面",
  "R背牆",
  "線孔蓋板",
  "高低差",
  "餘料加工",
  "鐵件",
  "氣口",
  "手工水槽",
];

export const DEFAULT_SINK_METHODS = [
  "上掛",
  "下嵌",
  "下平接",
  "上平接",
  "半嵌",
];

export const DEFAULT_STOVE_METHODS = ["上掛", "平接"];

// 合併 Firestore 自訂值與預設：自訂優先；若自訂為空則用預設
export function mergeOrderOptions(remote = {}) {
  return {
    categories: pickList(remote.categories, DEFAULT_CATEGORIES),
    countertopTypes: pickList(remote.countertopTypes, DEFAULT_COUNTERTOP_TYPES),
    specialMethods: pickList(remote.specialMethods, DEFAULT_SPECIAL_METHODS),
    sinkMethods: pickList(remote.sinkMethods, DEFAULT_SINK_METHODS),
    stoveMethods: pickList(remote.stoveMethods, DEFAULT_STOVE_METHODS),
  };
}

function pickList(remote, fallback) {
  return Array.isArray(remote) && remote.length ? remote : fallback;
}
