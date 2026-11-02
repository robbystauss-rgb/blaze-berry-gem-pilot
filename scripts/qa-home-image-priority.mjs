import { chromium } from "playwright";
import sharp from "sharp";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
const base = process.argv[2] ?? "http://localhost:8080";
if (!["http://localhost:8080", "http://localhost:8081"].includes(base))
  throw Error("Local isolated app only");
mkdirSync("screenshots/home-delivery", { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const results = [];
try {
  for (const [width, dpr] of [
    [390, 3],
    [1440, 2],
  ]) {
    const context = await browser.newContext({
      viewport: { width, height: width === 390 ? 844 : 1000 },
      deviceScaleFactor: dpr,
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(base, { waitUntil: "domcontentloaded" });
    const logo = page.getByRole("img", { name: /REC Mama Made Louisiana wildflower logo, signed/ });
    await logo.evaluate(async (image) => {
      await image.decode();
    });
    const data = await logo.evaluate((image) => ({
      src: image.currentSrc,
      cssWidth: image.getBoundingClientRect().width,
    }));
    const response = await context.request.get(data.src);
    assert.ok(response.ok());
    const bytes = await response.body(),
      decoded = await sharp(bytes).metadata();
    assert.ok(decoded.width >= data.cssWidth * dpr, "No logo upscaling at intended device density");
    assert.ok(bytes.length < 200000, "Above-fold logo transfer remains compact");
    const stage = page.locator(".home-reveal-stage");
    const image = stage.locator("img");
    if (await image.count()) {
      const first = await image.getAttribute("src");
      await page.waitForTimeout(5500);
      assert.equal(
        await image.getAttribute("src"),
        first,
        "Offscreen gallery cannot rotate/download new frames",
      );
      assert.equal(await image.getAttribute("loading"), "lazy");
    }
    const cards = page.locator(".product-card-stage img");
    for (const c of await cards.all()) assert.equal(await c.getAttribute("fetchpriority"), "low");
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
      false,
    );
    assert.equal(errors.length, 0, errors.join("\n"));
    await page.screenshot({
      path: `screenshots/home-delivery/${width}-${dpr}x.png`,
      fullPage: true,
    });
    results.push({
      width,
      dpr,
      decodedWidth: decoded.width,
      paintedWidth: data.cssWidth,
      logoBytes: bytes.length,
      uncaughtErrors: errors,
    });
    await context.close();
  }
  writeFileSync(
    "artifacts/commerce-qa/home-delivery.json",
    JSON.stringify({ outcome: "PASS", results }, null, 2),
  );
  console.log(JSON.stringify({ outcome: "PASS", results }));
} finally {
  await browser.close();
}
