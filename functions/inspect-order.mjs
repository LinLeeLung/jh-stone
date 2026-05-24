import { execSync } from "child_process";
const token = execSync("gcloud auth print-access-token", {
  encoding: "utf8",
}).trim();

const base =
  "https://firestore.googleapis.com/v1/projects/jh-stone/databases/(default)/documents";
const headers = { Authorization: `Bearer ${token}` };

// list first 1 doc from Orders
const resp = await fetch(`${base}/Orders?pageSize=1`, { headers });
const data = await resp.json();
if (!resp.ok) {
  console.error(JSON.stringify(data, null, 2));
  process.exit(1);
}

const doc = data.documents?.[0];
if (!doc) {
  console.log("empty");
  process.exit(0);
}

console.log("docId:", doc.name.split("/").pop());
console.log("fields:", JSON.stringify(Object.keys(doc.fields || {}), null, 2));
// print each field with type+value
for (const [k, v] of Object.entries(doc.fields || {})) {
  const type = Object.keys(v)[0];
  const val =
    type === "arrayValue"
      ? `[${(v.arrayValue.values || [])
          .slice(0, 3)
          .map((x) => JSON.stringify(Object.values(x)[0]))
          .join(", ")}...]`
      : JSON.stringify(v[type]);
  console.log(`  ${k}: ${val}`);
}
