// 水槽狀態 enum 與顯示樣式
// 對應 salesOrders.sinks[].arrival 欄位
// 配色依照原始紙本：未到=紅、代訂=黃、自取=藍、上掛不需到=綠、已到=預設灰

export const SINK_STATUS = {
  notArrived: {
    value: "notArrived",
    label: "水槽未到",
    color: "#e53935",
    bg: "#ffebee",
  },
  preOrder: {
    value: "preOrder",
    label: "代訂水槽",
    color: "#f9a825",
    bg: "#fff8e1",
  },
  selfPickup: {
    value: "selfPickup",
    label: "自取水槽",
    color: "#1565c0",
    bg: "#e3f2fd",
  },
  wallHungNoNeedArrive: {
    value: "wallHungNoNeedArrive",
    label: "上掛水槽不需到",
    color: "#2e7d32",
    bg: "#e8f5e9",
  },
  arrived: { value: "arrived", label: "已到", color: "#424242", bg: "#eeeeee" },
};

export const SINK_STATUS_LIST = Object.values(SINK_STATUS);

export function getSinkStatus(value) {
  return SINK_STATUS[value] || SINK_STATUS.notArrived;
}
