<script setup>
import { ref, onMounted } from "vue";
import { useRouter, useRoute } from "vue-router";
import { auth, googleProvider as provider } from "@/firebase";
import { signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  serverTimestamp,
} from "firebase/firestore";

const router = useRouter();
const route = useRoute();
const db = getFirestore();

const user = ref(null);

// ✅ 儲存使用者到 Firestore（僅第一次登入才建立）
async function saveUserToFirestore(user) {
  const ADMIN_EMAIL = "linlilung@gmail.com";
  const docRef = doc(db, "Users", user.uid);
  const snap = await getDoc(docRef);

  if (!snap.exists()) {
    await setDoc(docRef, {
      email: user.email || "",
      name: user.displayName || "",
      photo: user.photoURL || "",
      lastLogin: serverTimestamp(),
      role: user.email === ADMIN_EMAIL ? "admin" : "guest",
    });
    console.log("👤 已新增使用者至 Firestore");
  } else {
    const updateData = { lastLogin: serverTimestamp() };
    // 若為管理員 email 且角色不是 admin，自動升級
    if (user.email === ADMIN_EMAIL && snap.data().role !== "admin") {
      updateData.role = "admin";
    }
    await setDoc(docRef, updateData, { merge: true });
    console.log("⏱ 已更新 lastLogin");
  }
}

// 登入
async function login() {
  try {
    const result = await signInWithPopup(auth, provider);
    const signedUser = result.user;

    console.log("✅ 登入成功", signedUser);
    user.value = signedUser;

    await saveUserToFirestore(signedUser);

    const redirectTo = route.query.redirect || "/";
    router.push(redirectTo);
  } catch (error) {
    alert("登入失敗：" + error.message);
  }
}

// 登出
function logout() {
  signOut(auth);
  user.value = null;
}

// 初次載入就監聽登入狀態
onMounted(() => {
  onAuthStateChanged(auth, (u) => {
    user.value = u;
  });
});
</script>

<template>
  <div class="p-4 space-y-4 border rounded-md max-w-sm bg-white shadow">
    <div v-if="user">
      <div class="flex items-center space-x-3">
        <img
          :src="user.photoURL"
          class="w-12 h-12 rounded-full border border-gray-300"
        />
        <div>
          <p class="font-semibold">{{ user.displayName }}</p>
          <p class="text-sm text-gray-500">{{ user.email }}</p>
        </div>
      </div>
      <button
        @click="logout"
        class="mt-4 bg-gray-500 text-white px-4 py-2 rounded"
      >
        登出
      </button>
    </div>

    <div v-else>
      <button
        @click="login"
        class="bg-blue-600 text-white px-4 py-2 rounded w-full"
      >
        使用 Google 登入
      </button>
    </div>
  </div>
</template>
