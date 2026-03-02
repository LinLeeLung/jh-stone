const admin = require("firebase-admin");
admin.initializeApp();

async function run() {
  try {
    const snap = await admin
      .firestore()
      .collection("Orders")
      .where("searchKeywords", "array-contains", "1008")
      .get();
    console.log("found", snap.size);
    snap.docs.forEach((d) => console.log(d.id));
  } catch (e) {
    console.error("error", e);
  }
  process.exit(0);
}
run();
