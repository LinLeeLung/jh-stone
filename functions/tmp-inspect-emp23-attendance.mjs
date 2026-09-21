import fs from "fs";
import admin from "firebase-admin";

const saPath = fs.existsSync(new URL("./sa.json", import.meta.url))
  ? new URL("./sa.json", import.meta.url)
  : new URL("./sa.json.json", import.meta.url);
const sa = JSON.parse(fs.readFileSync(saPath));
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

function text(value) {
  return String(value || "").trim();
}
function lower(value) {
  return text(value).toLowerCase();
}
function latin(value) {
  return text(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}
function isPossibleEmp23(row) {
  const hay = [row.name, row.staffName, row.email, row.uid, row.id].map(lower).join(" ");
  const latinHay = latin([row.name, row.staffName, row.email].join(" "));
  return (
    hay.includes("nguyen") ||
    hay.includes("tien") ||
    hay.includes("hoa") ||
    hay.includes("08101985") ||
    hay.includes("c2140260") ||
    latinHay.includes("nguyen") ||
    latinHay.includes("tien") ||
    latinHay.includes("hoa")
  );
}

const staffDoc = await db.collection("staff").doc("23").get();
console.log("STAFF_23", staffDoc.exists ? staffDoc.data() : null);

const usersSnap = await db.collection("Users").get();
const users = usersSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
console.log("USERS_MATCH", users
  .filter((u) => text(u.empNo) === "23" || lower(u.email).includes("nguyen") || lower(u.displayName).includes("nguyen") || lower(u.name).includes("nguyen"))
  .map((u) => ({ id: u.id, email: u.email, empNo: u.empNo, displayName: u.displayName, name: u.name, role: u.role, lastSeen: u.lastSeen?.toDate?.()?.toISOString?.() || u.lastSeen || null }))
);

const attSnap = await db.collection("attendance")
  .where("date", ">=", "2026-08-01")
  .where("date", "<=", "2026-08-31")
  .get();
const attendance = attSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
const possible = attendance.filter(isPossibleEmp23).sort((a, b) => text(a.date).localeCompare(text(b.date)));
console.log("ATTENDANCE_POSSIBLE_COUNT", possible.length);
console.log("ATTENDANCE_POSSIBLE", possible.map((r) => ({ id: r.id, date: r.date, uid: r.uid, name: r.name, staffName: r.staffName, email: r.email, punchIn: r.punchIn, punchOut: r.punchOut, workSegments: r.workSegments })));

const uidCounts = new Map();
for (const r of possible) uidCounts.set(text(r.uid), (uidCounts.get(text(r.uid)) || 0) + 1);
console.log("UID_COUNTS", [...uidCounts.entries()]);

const payrollSnap = await db.collection("payroll").where("empNo", "==", "23").where("yyyyMM", "==", "202608").get();
console.log("PAYROLL_DOCS", payrollSnap.docs.map((doc) => {
  const data = doc.data();
  return { id: doc.id, uid: data.uid, empNo: data.empNo, name: data.name, attendanceDays: data.attendanceDays, attendanceHours: data.attendanceHours, updatedAt: data.updatedAt?.toDate?.()?.toISOString?.() || null };
}));
