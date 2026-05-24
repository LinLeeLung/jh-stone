// stores/estimate.js
import { defineStore } from "pinia";
import axios from "axios";

export const useEstimateStore = defineStore("stonePrice", {
  state: () => ({
    price: [
      { color: "cs-201", price: 75 },
      { color: "cs-102", price: 85 },
    ],
    itemList: [],
    priceList: [],
    loading: false,
    error: null,
  }),

  actions: {
    async fetchData() {
      this.loading = true;
      this.error = null;
      try {
        const res = await axios.get(
          "https://script.googleusercontent.com/macros/echo?user_content_key=AehSKLigc6YtS8LeqlGNHC-izL0xaWOPe_q4nGx1b0ecoRSO3zVu53MKoLdd5Ti7qQmRmOKz3YJzyYl9jYfOqAyuJp7vhmwHXKSp6w--mSBwGMgVHC4-9v1c1bT9tgfY0e4zqq4FK5HfZHk8JXsIqGdNeixPUu6YNuxJ-coCUz1kiqo7cC4zu9pw5xIlBuI5MiROhhGgcRvKJRkci7xDfqM4gijY_Se-ARXAKQyANX1FPokbaN1hQU7d_C7uAsUG1Wr5PlXz2JKxv3el4rsF19KJht0E-MYPGQ&lib=MIG840YcRyBozKsoJjxkgz2my7uZSrO0E"
        );
        this.itemList = res.data;

        const res2 = await axios.get(
          "https://script.google.com/macros/s/AKfycbweY4uKhj-NmmqmaKMD401ePMjVrGEE7_fuYNSmEYAOk4I4pW2garBtDCtYehV-I0oX/exec"
        );
        this.priceList = res2.data;
      } catch (error) {
        this.error = "資料抓取失敗，請稍後再試";
        console.error(err);
      } finally {
        this.loading = false;
      }
    },
  },
});
