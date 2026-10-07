import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(root, rel), "utf8"));
const fail = [];
const note = [];

const raw = readJson("src/data/master-catalog.json");
const patches = readJson("src/data/catalog-patches.json").models ?? {};
const materials = readJson("src/data/material-review.json");
const models = raw.models.map((model) => {
  const patch = patches[model.id];
  return patch ? { ...model, ...patch, colorways: patch.colorways ?? model.colorways } : model;
});

const expected = new Map([
  ["112", { bucket: "ready", count: 104, complete: true }],
  ["112FP", { bucket: "ready", count: 19, complete: true }],
  ["112P", { bucket: "ready", count: 10, complete: true }],
  ["112PFP", { bucket: "ready", count: 36, complete: true }],
  ["168", { bucket: "ready", count: 17, complete: true }],
  ["256", { bucket: "ready", count: 19, complete: true }],
  ["256P", { bucket: "ready", count: 7, complete: true }],
  ["112FPR", { bucket: "ready", count: 17, completeCount: 10 }],
  ["112PM", { bucket: "ready", count: 8, frontOnly: true }],
  ["168P", { bucket: "ready", count: 6, frontOnly: true }],
]);

const byId = new Map(models.map((m) => [m.id, m]));
for (const [id, rule] of expected) {
  const model = byId.get(id);
  if (!model) { fail.push(`Missing model ${id}`); continue; }
  if (model.bucket !== rule.bucket) fail.push(`${id}: expected bucket ${rule.bucket}, found ${model.bucket}`);
  if (model.colorways.length !== rule.count) fail.push(`${id}: expected ${rule.count} colorways, found ${model.colorways.length}`);
  const names = new Set();
  const ids = new Set();
  let completeCount = 0;
  for (const color of model.colorways) {
    if (names.has(color.officialName)) fail.push(`${id}: duplicate color name ${color.officialName}`);
    if (ids.has(color.id)) fail.push(`${id}: duplicate color id ${color.id}`);
    names.add(color.officialName); ids.add(color.id);
    if (!color.id.startsWith(`${id}:`)) fail.push(`${id}: wrong-model color id ${color.id}`);
    const v = color.views ?? {};
    if (v.front && v.side && v.back) completeCount++;
    if (!(v.front && v.side && v.back) && color.assetStatus !== "partial") fail.push(`${id} ${color.officialName}: incomplete photography must retain partial asset status`);
    if (model.bucket === "ready" && !v.front) fail.push(`${id} ${color.officialName}: selectable colorway missing product photo`);
    if (rule.complete && !(v.front && v.side && v.back)) fail.push(`${id} ${color.officialName}: ready colorway missing front/side/back`);
    if (rule.frontOnly && (!v.front || v.side || v.back)) fail.push(`${id} ${color.officialName}: expected front-only asset mapping`);
    if (rule.frontOnly && color.assetStatus !== "partial") fail.push(`${id} ${color.officialName}: single-view photography must retain partial asset status`);
  }
  if (rule.completeCount !== undefined && completeCount !== rule.completeCount) fail.push(`${id}: expected ${rule.completeCount} complete photo sets, found ${completeCount}`);
  note.push(`${id}: ${model.colorways.length} colorways`);
}

const viewRefs = [];
for (const model of models) for (const color of model.colorways) for (const key of ["front","side","back"]) if (color.views?.[key]) viewRefs.push(color.views[key]);
if (new Set(viewRefs).size !== viewRefs.length) fail.push("Hat view mapping contains duplicate image references");
note.push(`${viewRefs.length} unique hat view references`);

const provenance = readJson("src/data/catalog-photo-provenance.json");
const localPhotos = new Map(provenance.assets.map((asset) => [asset.path, asset]));
for (const model of models) for (const color of model.colorways) {
  for (const [view, ref] of Object.entries(color.views ?? {})) {
    if (!ref.startsWith("/")) continue;
    const asset = localPhotos.get(ref);
    const file = path.join(root, "public", ref);
    if (!ref.startsWith(`/assets/hats/${model.id.toLowerCase()}-`) || ref.includes("..")) {
      fail.push(`${model.id} ${color.officialName}: invalid or wrong-model local photo ${ref}`);
      continue;
    }
    if (!asset || asset.modelId !== model.id || asset.colorwayId !== color.id || asset.officialName !== color.officialName || view !== "front") {
      fail.push(`${model.id} ${color.officialName}: photo provenance does not match catalog mapping`);
    }
    if (!fs.existsSync(file)) fail.push(`Missing catalog photo ${ref}`);
    else if (asset && crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex") !== asset.sha256) fail.push(`Catalog photo changed: ${ref}`);
  }
}
for (const asset of provenance.assets) {
  const color = byId.get(asset.modelId)?.colorways.find((color) => color.id === asset.colorwayId);
  if (color?.views.front !== asset.path) fail.push(`Unmapped local photo provenance ${asset.path}`);
}
for (const asset of provenance.driveAssets) {
  const color = byId.get(asset.modelId)?.colorways.find((color) => color.id === asset.colorwayId);
  if (color?.views[asset.view] !== asset.sourceDriveId || color.officialName !== asset.officialName) fail.push(`Wrong-model Drive photo provenance ${asset.sourceDriveId}`);
}
note.push(`${localPhotos.size} byte-verified local catalog photos; ${provenance.driveAssets.length} recovered Drive angles`);

const sourceRel = "public/materials/review/source.png";
const sourcePath = path.join(root, sourceRel);
const expectedSourceSha = "0599792323e2758701af9b997b3225b0db4eca7578ea9bba7fd9ba297886df2a";
if (!fs.existsSync(sourcePath)) fail.push(`Missing ${sourceRel}`);
else {
  const sha = crypto.createHash("sha256").update(fs.readFileSync(sourcePath)).digest("hex");
  if (sha !== expectedSourceSha) fail.push(`Material source changed: expected ${expectedSourceSha}, found ${sha}`);
  note.push(`Material source SHA-256 ${sha}`);
}
const named = materials.filter((m) => m.named && m.name && m.swatch);
if (named.length !== 31) fail.push(`Expected 31 named approved-source material records, found ${named.length}`);
for (const item of named) {
  if (item.sourceFileId !== "15zmpsoRUBMsIs7q1luA6j53Q_QVpEl74") fail.push(`${item.id}: wrong material source file ID`);
  for (const field of ["swatch","detail"]) {
    const rel = item[field]?.replace(/^\//, "public/");
    if (!rel || !fs.existsSync(path.join(root, rel))) fail.push(`${item.id}: missing ${field} file ${item[field] ?? "(blank)"}`);
  }
}
note.push(`${named.length} named real-source material swatches`);

const sourceFiles = [];
function walk(dir) { if (!fs.existsSync(dir)) return; for (const e of fs.readdirSync(dir,{withFileTypes:true})) { const p=path.join(dir,e.name); if(e.isDirectory()) walk(p); else if(/\.(ts|tsx|js|jsx)$/.test(p)) sourceFiles.push(p); } }
walk(path.join(root,"src"));
for (const file of sourceFiles) {
  const relFile = path.relative(root, file).replaceAll("\\", "/");
  if (relFile === "src/lib/colorways.ts") continue;
  const text = fs.readFileSync(file,"utf8");
  if (text.includes("/products/hat-")) fail.push(`${relFile} still references unverified hat art`);
  if (text.includes("photoFor(") || text.includes("dedicatedPhoto(")) fail.push(`${relFile} still contains image-substitution fallback logic`);
}
const og = fs.readFileSync(path.join(root,".grok/og-card.html"),"utf8");
if (og.includes("/products/")) fail.push(".grok/og-card.html still references old product art");

if (fail.length) { console.error("REC Mama Made asset validation FAILED"); for (const x of fail) console.error(`- ${x}`); process.exit(1); }
console.log("REC Mama Made asset validation passed."); for (const x of note) console.log(`- ${x}`);
