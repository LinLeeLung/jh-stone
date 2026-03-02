import { initializeApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
} from "firebase/auth";

// Use environment variables (VITE_ prefix) for your Firebase config.
// Create a .env.local file at the project root with the following keys:
// VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, VITE_FIREBASE_PROJECT_ID,
// VITE_FIREBASE_STORAGE_BUCKET, VITE_FIREBASE_MESSAGING_SENDER_ID,
// VITE_FIREBASE_APP_ID
// import { initializeApp } from "firebase/app";

import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  collection,
  getDocs,
  query,
  where,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";

const firebaseConfig = {
  apiKey: "AIzaSyBbG5oJ40Wz7awOCVgb-QiX6_IjDbmFFnk",
  authDomain: "jh-stone.firebaseapp.com",
  projectId: "jh-stone",
  storageBucket: "jh-stone.firebasestorage.app",
  messagingSenderId: "32269929508",
  appId: "1:32269929508:web:208a7b5290475c0c501cb1",
  measurementId: "G-4N2HE3LJ5Z",
};

const app = initializeApp(firebaseConfig);
export { app };
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const db = getFirestore(app);

// Designated admin email (as requested)
const ADMIN_EMAIL = "linlilung@gmal.com";

// allowed roles in the system
export const ROLES = ["admin", "管理者", "員工", "客戶", "遊客"];

export function signInWithGoogle() {
  return signInWithPopup(auth, googleProvider);
}

export function logout() {
  return signOut(auth);
}

// helper to subscribe to auth state changes
export function subscribeAuthState(callback) {
  return onAuthStateChanged(auth, async (user) => {
    // when user signs in, ensure we have a Users doc for them
    if (user) {
      try {
        const userRef = doc(db, "Users", user.uid);
        const snap = await getDoc(userRef);
        let role =
          user.email === ADMIN_EMAIL
            ? "admin"
            : snap.exists()
              ? snap.data().role || "遊客"
              : "遊客";
        // validate against ROLES
        if (!ROLES.includes(role)) {
          role = "遊客";
        }
        await setDoc(
          userRef,
          {
            uid: user.uid,
            displayName: user.displayName || null,
            email: user.email || null,
            photoURL: user.photoURL || null,
            role,
            lastSeen: serverTimestamp(),
          },
          { merge: true },
        );
      } catch (e) {
        console.error("Failed to sync user to Firestore:", e);
      }
    }
    callback(user);
  });
}

// Admin helper: fetch all users
export async function fetchAllUsers() {
  const col = collection(db, "Users");
  const snaps = await getDocs(col);
  return snaps.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// Query users with where-clauses. conditions is array of { field, op, value }
export async function queryUsers(conditions = []) {
  const col = collection(db, "Users");
  let q = col;
  if (Array.isArray(conditions) && conditions.length) {
    const clauses = conditions.map((c) => where(c.field, c.op, c.value));
    q = query(col, ...clauses);
  }
  const snaps = await getDocs(q);
  return snaps.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// Query any collection by a date range on a specific field.
// start and end are JS Date objects (inclusive start, exclusive end).
export async function queryCollectionByDateRange(collectionName, field, start, end) {
  if (!collectionName || !field) throw new Error("collectionName and field required");
  const col = collection(db, collectionName);
  const q = query(col, where(field, ">=", start), where(field, "<", end));
  const snaps = await getDocs(q);
  return snaps.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// Generic collection query helper using where conditions array
// conditions: [{ field, op, value }, ...]
export async function queryCollection(collectionName, conditions = []) {
  if (!collectionName) throw new Error("collectionName required");
  const col = collection(db, collectionName);
  let q = col;
  if (Array.isArray(conditions) && conditions.length) {
    const clauses = conditions.map((c) => where(c.field, c.op, c.value));
    q = query(col, ...clauses);
  }
  const snaps = await getDocs(q);
  return snaps.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// Admin helper: update user role
export async function updateUserRole(uid, role) {
  // validate role before writing
  if (!ROLES.includes(role)) {
    throw new Error(`invalid role "${role}"`);
  }
  const userRef = doc(db, "Users", uid);
  await updateDoc(userRef, { role });
}

// fetch single user doc
export async function getUserByUid(uid) {
  const userRef = doc(db, "Users", uid);
  const snap = await getDoc(userRef);
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

// search Orders by keyword using Cloud Function (fallback to direct query)
export async function searchOrdersByKeyword(keyword) {
  if (!keyword) return [];
  const q = keyword.toString().toLowerCase().trim();
  // try callable first
  try {
    const functions = getFunctions(app);
    const callable = httpsCallable(functions, "searchOrdersByKeyword");
    const resp = await callable({ q });
    return resp.data || [];
  } catch (e) {
    // if cloud function is not deployed or fails, fall back to raw query
    console.warn("searchOrdersByKeyword callable failed, falling back to client query", e);
    const col = collection(db, "Orders");
    const snaps = await getDocs(query(col, where("searchKeywords", "array-contains", q)));
    return snaps.docs.map((d) => ({ id: d.id, ...d.data() }));
  }
}
