#!/usr/bin/env node
/** Actual-builder regression harness. No draft injection is used for the matrix.
 * The only storage fixture is the separate, explicitly labelled legacy test.
 * CSS layout allows 0.75 px error; normalized anchors allow 1e-5 roundoff.
 * Review the generated contact sheets; screenshots alone are not a visual verdict.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";

const baseUrl = process.argv[2] || "http://127.0.0.1:8080";
const suffix = process.argv[3] || "local";
const smokeMode = process.env.CROWN_QA_SMOKE === "1";
const root = resolve(import.meta.dirname, "..");
const screenDir = resolve(root, "screenshots/crown-qa", suffix);
const artifactDir = resolve(root, "artifacts/crown-qa", suffix);
mkdirSync(screenDir, { recursive: true });
mkdirSync(artifactDir, { recursive: true });
const manifest = JSON.parse(readFileSync(resolve(root, "src/data/crown-calibrations.json"), "utf8"));
const catalog = JSON.parse(readFileSync(resolve(root, "src/data/master-catalog.json"), "utf8"));
const patches = JSON.parse(readFileSync(resolve(root, "src/data/catalog-patches.json"), "utf8"));
const effectiveModels = catalog.models.map((model) => ({ ...model, ...(patches.models[model.id] || {}) }));
const records = manifest.records.map((record) => {
  const color = effectiveModels.find((model) => model.id === record.modelId)?.colorways.find((color) => color.id === record.colorway);
  assert.ok(color, `calibration identifies exact catalog colorway ${record.colorway}`);
  return { ...record, colorwayId: record.colorway, colorway: color.officialName };
});
const canonical = { small: 0.32, medium: 0.42, large: 0.52 };
const sizes = Object.keys(canonical);
const models = ["112", "112FP", "112FPR", "112P", "112PM", "112PFP", "168", "168P", "256", "256P"];
const pixelTolerance = 0.75;
const anchorTolerance = 1e-5;
const evidence = { baseUrl, startedAt: new Date().toISOString(), tolerances: { pixelTolerance, anchorTolerance }, matrix: [], responsive: [], behaviors: [], consoleErrors: [], pageErrors: [], contactSheets: [], actualInventory: [] };
const escape = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const close = (actual, expected, tolerance, name) => assert.ok(Math.abs(actual - expected) <= tolerance, `${name}: ${actual} != ${expected} (+/-${tolerance})`);
const anchorClose = (a, b) => { close(a.x, b.x, anchorTolerance, "anchor x"); close(a.y, b.y, anchorTolerance, "anchor y"); };
const channel = process.env.CROWN_QA_BROWSER_CHANNEL || (!existsSync(chromium.executablePath()) && process.platform === "win32" ? "chrome" : undefined);
const browser = await chromium.launch({ headless: true, ...(channel ? { channel } : {}) });
let lastPage;
let uploadedArtworkHash;

async function pageFor(options = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, ...options });
  const page = await context.newPage();
  lastPage = page;
  page.on("pageerror", (error) => evidence.pageErrors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") evidence.consoleErrors.push(message.text()); });
  if (process.env.CROWN_QA_AUTH_URL) {
    // Visit a user-authorized preview share link once for its cookie, then use the
    // clean deployment URL. The private link is never written into artifacts.
    try { await page.goto(process.env.CROWN_QA_AUTH_URL,{waitUntil:"domcontentloaded"}); }
    catch { throw new Error("Preview authentication did not finish; the private share link has been omitted."); }
  }
  return { context, page };
}

async function failedBeforeHydration() {
  const {context,page}=await pageFor();
  const black=records.find(r=>r.modelId==="112"&&r.colorway==="Black");
  let releaseScripts;
  const blocked=new Promise(resolve=>{releaseScripts=resolve;});
  await context.route("**/*",async route=>{
    const request=route.request();
    if(request.url().endsWith(black.imageUrl))return route.abort("failed");
    if(request.resourceType()==="script"&&new URL(request.url()).origin===new URL(baseUrl).origin)await blocked;
    await route.continue();
  });
  await page.goto(`${baseUrl}/order`,{waitUntil:"commit"});
  await page.waitForFunction(imageUrl=>{
    const image=document.querySelector("[data-hat-preview] > img");
    return image?.src.endsWith(imageUrl)&&image.complete&&image.naturalWidth===0&&!Object.keys(image).some(key=>key.startsWith("__reactProps"));
  },black.imageUrl);
  releaseScripts();
  await page.getByRole("status").filter({hasText:"Calibrated product photo unavailable"}).waitFor();
  assert.equal(await page.locator("[data-patch-overlay]").count(),0,"pre-hydration error is recovered visibly");
  await page.screenshot({path:resolve(screenDir,"photo-failed-before-hydration.png"),fullPage:true});
  evidence.behaviors.push({name:"photograph failure before hydration recovered from complete image state",passed:true});
  await context.close();
}

async function step(page, label) {
  await page.getByRole("button", { name: new RegExp(`^\\d{2} ${label}$`) }).click();
}
async function chooseModel(page, model) {
  await step(page, "Hat");
  await page.getByRole("button", { name: new RegExp(`^${model}\\s`) }).click();
  await step(page, "Color");
}
async function chooseColor(page, colorway) {
  await page.locator(`[id=${JSON.stringify(`swatch-${colorway}`)}]`).click();
}
async function chooseSize(page, size) {
  await step(page, "Shape");
  await page.getByRole("button", { name: new RegExp(`^${size}(?:\\s|·)`, "i") }).click();
}
async function ready(page, expectedRecord) {
  await page.waitForFunction(({ model, color, calibration }) => {
    const preview = document.querySelector("[data-hat-preview]");
    const overlay = preview?.querySelector("[data-patch-overlay]");
    const image = preview?.querySelector(":scope > img");
    return preview?.dataset.hatPreview === model && preview?.dataset.colorway === color &&
      preview?.dataset.calibration === calibration && preview?.dataset.imageRect !== "loading" &&
      image?.complete && image?.naturalWidth > 0 && overlay && overlay.querySelector("img")?.complete;
  }, { model: expectedRecord.modelId, color: expectedRecord.colorway, calibration: expectedRecord.id });
  await page.waitForTimeout(270); // Let the unchanged existing patch-pop transition finish.
}
async function geometry(page, expectedSize, expectedAspect = 1.35) {
  const value = await page.locator("[data-hat-preview]").evaluate((preview) => {
    const patch = preview.querySelector("[data-patch-overlay]");
    const art = patch.querySelector("img");
    const frame = patch.getBoundingClientRect();
    const artwork = art.getBoundingClientRect();
    return {
      modelId: preview.dataset.hatPreview, colorway: preview.dataset.colorway,
      calibrationId: preview.dataset.calibration,
      crown: JSON.parse(preview.dataset.crownBounds), image: JSON.parse(preview.dataset.imageRect),
      anchor: JSON.parse(patch.dataset.patchAnchor), size: patch.dataset.patchSize,
      width: frame.width, height: frame.height, center: { x: frame.x + frame.width / 2, y: frame.y + frame.height / 2 },
      preview: { x: preview.getBoundingClientRect().x, y: preview.getBoundingClientRect().y },
      artwork: { width: artwork.width, height: artwork.height, naturalWidth: art.naturalWidth, naturalHeight: art.naturalHeight, src: art.src },
      source: preview.querySelector(":scope > img").src,
      stage: { width: preview.clientWidth, height: preview.clientHeight },
      zoomScale: getComputedStyle(preview).transform === "none" ? 1 : new DOMMatrix(getComputedStyle(preview).transform).a,
    };
  });
  assert.equal(value.size, expectedSize, "selected size survives selection");
  close(value.width, value.crown.width * value.image.width * canonical[expectedSize] * value.zoomScale, pixelTolerance, "patch / crown width");
  close(value.height, value.width / expectedAspect, pixelTolerance, "patch silhouette aspect");
  close(value.artwork.naturalWidth / value.artwork.naturalHeight, 2, 0.001, "uploaded source aspect");
  close(value.artwork.width / value.artwork.height, 2, 0.02, "rendered artwork aspect");
  value.artwork.contentHash = createHash("sha256").update(value.artwork.src).digest("hex");
  uploadedArtworkHash ||= value.artwork.contentHash;
  assert.equal(value.artwork.contentHash,uploadedArtworkHash,"uploaded artwork survives every selection and viewport");
  delete value.artwork.src;
  close(value.center.x - value.preview.x, (value.image.x + (value.crown.x + value.anchor.x * value.crown.width) * value.image.width) * value.zoomScale, pixelTolerance, "projected anchor x");
  close(value.center.y - value.preview.y, (value.image.y + (value.crown.y + value.anchor.y * value.crown.height) * value.image.height) * value.zoomScale, pixelTolerance, "projected anchor y");
  value.patchCrownRatio = value.width / (value.crown.width * value.image.width * value.zoomScale);
  return value;
}
async function makeTestPatch(page) {
  const url = await page.evaluate(() => {
    const canvas = document.createElement("canvas"); canvas.width = 800; canvas.height = 400;
    const c = canvas.getContext("2d"); c.fillStyle = "#f5f5f5"; c.fillRect(0, 0, 800, 400);
    c.strokeStyle = "#999"; c.lineWidth = 2;
    for (let x = 0; x <= 800; x += 50) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, 400); c.stroke(); }
    for (let y = 0; y <= 400; y += 50) { c.beginPath(); c.moveTo(0, y); c.lineTo(800, y); c.stroke(); }
    c.strokeStyle = "#111"; c.lineWidth = 12;
    for (const x of [180, 620]) { c.beginPath(); c.arc(x, 200, 110, 0, Math.PI * 2); c.stroke(); }
    c.fillStyle = "#111"; c.font = "bold 56px sans-serif"; c.textAlign = "center"; c.fillText("REC QA", 400, 220);
    c.strokeRect(6, 6, 788, 388);
    return canvas.toDataURL("image/png");
  });
  const png = Buffer.from(url.split(",")[1], "base64");
  writeFileSync(resolve(artifactDir, "identical-test-patch-800x400.png"), png);
  return png;
}
async function setup(page, png) {
  await page.goto(`${baseUrl}/order`, { waitUntil: "domcontentloaded" });
  // The server-rendered controls exist before React attaches their event handlers.
  await page.waitForFunction(() => document.querySelector("[data-patch-overlay]")?.dataset.patchAnchor);
  await step(page, "Design");
  await page.locator('input[type="file"]').setInputFiles({ name: "identical-rec-qa.png", mimeType: "image/png", buffer: png });
  await step(page, "Shape");
  await page.getByRole("button", { name: /^Rounded Rectangle/ }).click();
  await chooseSize(page, "medium");
  await step(page, "Place");
  await page.getByRole("button", { name: "Reset", exact: true }).click();
}
async function capture(page, filename) {
  await page.locator("[data-hat-preview]").screenshot({ path: resolve(screenDir, filename) });
}

try {
  if(process.env.CROWN_QA_REGRESSION_ONLY==="1"){
    await failedBeforeHydration();
    evidence.targetedRegressionPassed=true;
    writeFileSync(resolve(artifactDir,"results.json"),JSON.stringify(evidence,null,2));
    console.log(JSON.stringify({targetedRegressionPassed:true,behaviors:evidence.behaviors}));
    await browser.close();process.exit(0);
  }
  const { context, page } = await pageFor();
  const png = await makeTestPatch(page);
  await setup(page, png);
  const originAnchor = JSON.parse(await page.locator("[data-patch-overlay]").getAttribute("data-patch-anchor"));
  anchorClose(originAnchor, { x: 0.5, y: 0.5 });
  await step(page, "Hat");
  const actualModels = await page.getByRole("button").allTextContents();
  for (const model of models) assert.ok(actualModels.some((text) => new RegExp(`^${model}\\s`).test(text.trim())), `selectable exact model ${model}`);

  for (const model of smokeMode ? ["112", "112FP"] : models) {
    await chooseModel(page, model);
    const colorways = await page.locator('[id^="swatch-"]').evaluateAll((buttons) => buttons.map((button) => button.id.slice("swatch-".length)));
    evidence.actualInventory.push({ modelId: model, colorways });
    const calibrated = records.filter((r) => r.modelId === model).map((r) => r.colorway);
    assert.deepEqual([...colorways].sort(), [...calibrated].sort(), `calibration coverage of actual ${model} selections`);
    for (const colorway of smokeMode ? colorways.slice(0,1) : colorways) {
      await step(page, "Color");
      await chooseColor(page, colorway);
      const record = records.find((r) => r.modelId === model && r.colorway === colorway);
      await ready(page, record);
      for (const size of sizes) {
        await chooseSize(page, size);
        await ready(page, record);
        const result = await geometry(page, size);
        anchorClose(result.anchor, originAnchor);
        assert.ok(result.source.endsWith(record.imageUrl), "rendered calibrated asset identity");
        const filename = `${model}-${slug(colorway)}-${size}.png`;
        await capture(page, filename);
        evidence.matrix.push({ ...result, filename, assetId: record.assetId });
      }
      console.log(`matrix ${model} ${colorway}: all three sizes (${evidence.matrix.length}/${records.length * 3})`);
    }
    writeFileSync(resolve(artifactDir,"results.json"), JSON.stringify(evidence,null,2));
  }
  if (smokeMode) {
    await step(page,"Place");
    const box = await page.locator("[data-patch-overlay]").boundingBox();
    await page.mouse.move(box.x+box.width/2,box.y+box.height/2); await page.mouse.down();
    await page.mouse.move(box.x+box.width/2+25,box.y+box.height/2+10,{steps:5}); await page.mouse.up();
    const anchor = JSON.parse(await page.locator("[data-patch-overlay]").getAttribute("data-patch-anchor"));
    assert.ok(anchor.x>0.5 && anchor.y>0.5);
    evidence.smokePassed=true;
    writeFileSync(resolve(artifactDir,"results.json"),JSON.stringify(evidence,null,2));
    console.log(JSON.stringify({smokePassed:true,matrix:evidence.matrix.length,anchor}));
    await context.close(); await browser.close(); process.exit(0);
  }
  assert.equal(evidence.matrix.length, records.length * 3);

  // Every model is checked at every responsive breakpoint, using an actual color selection.
  const viewports = [[1280,800], [1024,768], [1023,768], [768,1024], [767,1024], [640,960], [639,960], [390,844], [320,740], [844,390]];
  for (const [width, height] of viewports) {
    await page.setViewportSize({ width, height });
    for (const model of models) {
      await chooseModel(page, model);
      const modelRecords = records.filter((r) => r.modelId === model);
      const record = (model === "112FP" ? modelRecords.find((r) => r.colorway === "Pale Khaki/Loden Green") :
        model === "168" ? modelRecords.find((r) => r.colorway === "Black") :
        model === "112FPR" ? [...modelRecords].sort((a,b) => a.bounds.width-b.bounds.width)[0] : null) || modelRecords[0];
      await chooseColor(page, record.colorway);
      for (const size of sizes) {
        await chooseSize(page, size); await ready(page, record);
        const result = await geometry(page, size); anchorClose(result.anchor, originAnchor);
        const filename = `responsive-${width}x${height}-${model}-${size}.png`;
        if (size === "medium") {
          await capture(page, filename);
          if (model === "112") {
            const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
            assert.equal(horizontalOverflow, false, `responsive document overflow ${width}x${height}`);
            await page.screenshot({ path:resolve(screenDir,`responsive-ui-${width}x${height}.png`), fullPage:true });
          }
        }
        evidence.responsive.push({ ...result, viewport: { width, height }, filename: size === "medium" ? filename : null });
      }
    }
    console.log(`responsive ${width}x${height}: ten models, three sizes`);
    writeFileSync(resolve(artifactDir,"results.json"), JSON.stringify(evidence,null,2));
  }

  await page.setViewportSize({ width: 1280, height: 800 });
  const first = records.find((r) => r.modelId === "112");
  await chooseModel(page, "112"); await chooseColor(page, first.colorway); await chooseSize(page, "medium"); await ready(page, first);
  for (const [name, aspect] of [["Rectangle",1.35], ["Circle",1], ["Oval",1.45], ["Hexagon",1.35], ["Shield",1.35], ["Custom Shape",1.35], ["Rounded Rectangle",1.35]]) {
    await page.getByRole("button", { name: new RegExp(`^${name}\\s`) }).click();
    await ready(page, first); await geometry(page, "medium", aspect);
  }
  evidence.behaviors.push({ name: "existing silhouettes and artwork fitting", passed: true });

  await page.getByRole("button", { name:"Zoom",exact:true }).click();
  await page.waitForTimeout(350);
  const zoomed = await geometry(page,"medium"); anchorClose(zoomed.anchor,originAnchor);
  close(zoomed.zoomScale,1.35,0.001,"unchanged existing zoom control");
  await page.getByRole("button", { name:"Fit",exact:true }).click(); await page.waitForTimeout(350);
  anchorClose((await geometry(page,"medium")).anchor,originAnchor);
  evidence.behaviors.push({ name:"zoom and fit preserve patch-to-crown proportions and anchor",passed:true });

  await step(page, "Place");
  const patch = page.locator("[data-patch-overlay]");
  await patch.scrollIntoViewIfNeeded();
  let box = await patch.boundingBox();
  const beforeDrag = JSON.parse(await patch.getAttribute("data-patch-anchor"));
  await page.mouse.move(box.x + box.width/2, box.y + box.height/2); await page.mouse.down();
  await page.mouse.move(box.x + box.width/2 + 30, box.y + box.height/2 + 18, { steps: 8 }); await page.mouse.up();
  const dragged = JSON.parse(await patch.getAttribute("data-patch-anchor"));
  assert.ok(dragged.x > beforeDrag.x && dragged.y > beforeDrag.y, "mouse drag changes free anchor");
  for (let cycle = 0; cycle < 3; cycle++) {
    for (const model of ["256P", "112FP", "112"]) {
      const record = records.find((r) => r.modelId === model);
      await chooseModel(page, model); await chooseColor(page, record.colorway); await ready(page, record);
      anchorClose((await geometry(page, "medium")).anchor, dragged);
    }
  }
  await page.reload({ waitUntil: "domcontentloaded" }); await ready(page, first);
  anchorClose((await geometry(page, "medium")).anchor, dragged);
  evidence.behaviors.push({ name: "mouse free drag, three switching cycles and persisted reload", passed: true, anchor: dragged });

  // Deliberately delay the new photograph: no previous-photo patch may remain visible.
  const delayed = records.find((r) => r.modelId === "112" && r.colorway !== first.colorway);
  let releaseImage;
  const blocked = new Promise((resolve) => { releaseImage = resolve; });
  await context.route(`**${delayed.imageUrl}`, async (route) => { await blocked; await route.continue(); });
  await step(page, "Color"); await chooseColor(page, delayed.colorway);
  await page.waitForFunction(() => document.querySelector("[data-hat-preview]")?.dataset.imageRect === "loading");
  assert.equal(await patch.count(), 0, "old overlay suppressed until new image loads");
  releaseImage(); await ready(page, delayed);
  anchorClose((await geometry(page, "medium")).anchor, dragged);
  evidence.behaviors.push({ name: "delayed image loading has no stale overlay and retains anchor", passed: true });
  await context.close();

  const { context: touchContext, page: touchPage } = await pageFor({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
  await setup(touchPage, png);
  await chooseModel(touchPage, "112"); await chooseColor(touchPage, first.colorway); await ready(touchPage, first); await step(touchPage, "Place");
  await touchPage.locator("[data-patch-overlay]").scrollIntoViewIfNeeded();
  box = await touchPage.locator("[data-patch-overlay]").boundingBox();
  const session = await touchContext.newCDPSession(touchPage);
  const touchStart = { x: box.x + box.width/2, y: box.y + box.height/2, id: 1, radiusX: 4, radiusY: 4 };
  await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [touchStart] });
  await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ ...touchStart, x: touchStart.x + 22, y: touchStart.y + 12 }] });
  await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  const touched = JSON.parse(await touchPage.locator("[data-patch-overlay]").getAttribute("data-patch-anchor"));
  assert.ok(touched.x > 0.5 && touched.y > 0.5, "trusted touch drag moves anchor");
  await touchPage.setViewportSize({ width: 844, height: 390 }); await ready(touchPage, first);
  anchorClose((await geometry(touchPage, "medium")).anchor, touched);
  evidence.behaviors.push({ name: "touch drag and portrait-to-landscape orientation", passed: true, anchor: touched });
  await touchContext.close();

  for (const failure of ["network-failure", "source-dimensions-changed"]) {
    const { context: failedContext, page: failedPage } = await pageFor();
    await setup(failedPage, png);
    await chooseModel(failedPage, "112"); await chooseColor(failedPage, first.colorway); await ready(failedPage, first);
    await failedContext.route(`**${delayed.imageUrl}`, (route) => failure === "network-failure" ? route.abort("failed") : route.fulfill({ status:200, contentType:"image/png", body:png }));
    await step(failedPage, "Color"); await chooseColor(failedPage, delayed.colorway);
    await failedPage.getByRole("status").filter({ hasText: "Calibrated product photo unavailable" }).waitFor();
    assert.equal(await failedPage.locator("[data-patch-overlay]").count(), 0, `${failure}: no invented sizing geometry`);
    evidence.behaviors.push({ name: `${failure} detectable in actual builder`, passed: true });
    await failedContext.close();
  }

  const { context: legacyContext, page: legacyPage } = await pageFor();
  await legacyContext.addInitScript(() => {
    localStorage.setItem("rec-mama-order", JSON.stringify({ state: { family: "112", colorway: "Black", patchSize: "medium", patchShape: "Rounded Rectangle", placement: "front-center", patchOffsetX: 7, patchOffsetY: -4, patchScale: 1 }, version: 0 }));
  });
  await legacyPage.goto(`${baseUrl}/order`, { waitUntil: "domcontentloaded" });
  await legacyPage.waitForFunction(() => document.querySelector("[data-patch-overlay]")?.dataset.patchAnchor);
  const legacy = await legacyPage.locator("[data-hat-preview]").evaluate((preview) => {
    const p = preview.querySelector("[data-patch-overlay]").getBoundingClientRect(); const b = preview.getBoundingClientRect();
    return { centerX: p.x+p.width/2-b.x, centerY:p.y+p.height/2-b.y, width:preview.clientWidth, height:preview.clientHeight, anchor:JSON.parse(preview.querySelector("[data-patch-overlay]").dataset.patchAnchor), saved:JSON.parse(localStorage.getItem("rec-mama-order")).state.patchPosition };
  });
  close(legacy.centerX, 0.57 * legacy.width, pixelTolerance, "legacy container percent x");
  close(legacy.centerY, 0.40 * legacy.height, pixelTolerance, "legacy container percent y");
  assert.equal(legacy.saved.version, 2);
  assert.ok(Math.abs(legacy.anchor.x - 0.07) > 0.1, "legacy percentages not reinterpreted as crown anchor");
  evidence.behaviors.push({ name: "legacy percent placement adapted once to explicit version 2", passed: true, legacy });
  await legacyContext.close();

  const { context: invalidContext, page: invalidPage } = await pageFor();
  await invalidContext.addInitScript(() => {
    localStorage.setItem("rec-mama-order", JSON.stringify({ state:{ family:"112",colorway:"Black",placement:"front-center",patchPosition:{version:99,anchor:{x:0.2,y:0.3}} },version:0 }));
  });
  await invalidPage.goto(`${baseUrl}/order`,{waitUntil:"domcontentloaded"});
  await invalidPage.getByRole("status").filter({hasText:"Saved placement format unavailable"}).waitFor();
  assert.equal(await invalidPage.locator("[data-patch-overlay]").count(),0,"unknown saved position is not reinterpreted");
  await step(invalidPage,"Place"); await invalidPage.getByRole("button",{name:"Reset",exact:true}).click();
  await invalidPage.waitForFunction(() => document.querySelector("[data-patch-overlay]")?.dataset.patchAnchor);
  anchorClose(JSON.parse(await invalidPage.locator("[data-patch-overlay]").getAttribute("data-patch-anchor")),originAnchor);
  evidence.behaviors.push({name:"invalid saved coordinate version stays visible and only explicit Reset replaces it",passed:true});
  await invalidContext.close();
  await failedBeforeHydration();

  // Contact sheets contain only screenshots captured from the real builder above.
  const review = await browser.newPage({ viewport: { width: 1320, height: 900 } });
  for (const model of models) {
    const colorways = evidence.actualInventory.find((m) => m.modelId === model).colorways;
    for (let start = 0; start < colorways.length; start += 6) {
      const selected = colorways.slice(start, start+6);
      const frames = selected.flatMap((colorway) => sizes.map((size) => evidence.matrix.find((r) => r.modelId === model && r.colorway === colorway && r.size === size)));
      const tiles = frames.map((frame) => `<article><header><b>${escape(frame.modelId)} · ${escape(frame.colorway)} · ${escape(frame.size)}</b><br><span>${escape(frame.calibrationId)}</span></header><img src="data:image/png;base64,${readFileSync(resolve(screenDir, frame.filename)).toString("base64")}"></article>`).join("");
      await review.setContent(`<html><head><style>body{margin:0;padding:18px;background:#ede9e3;font:16px Arial;color:#24201b}h1{font-size:23px;margin:0 0 12px}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}article{background:#fff;border:1px solid #bbb}header{padding:9px;min-height:46px;font-size:14px;line-height:19px}span{font-size:10px;overflow-wrap:anywhere}img{display:block;width:100%;height:330px;object-fit:contain;background:#f5f1eb}</style></head><body><h1>Actual builder · Richardson ${model} · colorways ${start+1}–${Math.min(start+6,colorways.length)} · Small / Medium / Large</h1><div class="grid">${tiles}</div></body></html>`);
      const filename = `comparison-${model}-${String(start/6+1).padStart(2,"0")}.png`;
      await review.screenshot({ path: resolve(artifactDir, filename), fullPage: true });
      evidence.contactSheets.push(filename);
    }
  }
  await review.close();
  const relativeScreens = `../../../screenshots/crown-qa/${suffix}`;
  writeFileSync(resolve(artifactDir,"index.html"), `<!doctype html><meta charset="utf-8"><title>REC Mama Made crown-scale review</title><style>body{font:15px Arial;background:#eee;color:#222;margin:20px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:16px}article{background:white;padding:12px}img{width:100%;height:300px;object-fit:contain}code{font-size:11px;overflow-wrap:anywhere}</style><h1>Actual builder patch scale comparison</h1><p>${evidence.matrix.length} rendered matrix frames. Same uploaded 800×400 artwork, rounded rectangle, center anchor, scale 1. Width/crown ratios: Small .32, Medium .42, Large .52. All labels identify exact calibration. Automated evidence is in results.json; visual inspection is reported separately.</p><div class="grid">${evidence.matrix.map((r)=>`<article><b>${escape(r.modelId)} · ${escape(r.colorway)} · ${escape(r.size)}</b><p><code>${escape(r.calibrationId)}</code></p><img loading="lazy" src="${relativeScreens}/${r.filename}"></article>`).join("")}</div>`);
  evidence.completedAt = new Date().toISOString();
  evidence.automatedPassed = true;
  assert.equal(evidence.pageErrors.length, 0, "uncaught browser errors");
  writeFileSync(resolve(artifactDir,"results.json"), JSON.stringify(evidence,null,2));
  console.log(JSON.stringify({ passed:true, matrix:evidence.matrix.length, responsive:evidence.responsive.length, behaviors:evidence.behaviors.length, contactSheets:evidence.contactSheets.length, consoleErrors:evidence.consoleErrors.length, artifactDir },null,2));
} catch (error) {
  evidence.automatedPassed = false; evidence.failure = error.stack;
  if (lastPage && !lastPage.isClosed()) {
    await lastPage.screenshot({path:resolve(screenDir,"failure.png"),fullPage:true}).catch(()=>{});
    evidence.failureUiText = await lastPage.locator("body").innerText().catch(()=>"");
  }
  writeFileSync(resolve(artifactDir,"results.json"), JSON.stringify(evidence,null,2));
  console.error(error); process.exitCode = 1;
} finally { await browser.close(); }
