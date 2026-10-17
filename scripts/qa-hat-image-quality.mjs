// Source-density and geometry checks in the actual builder, on disposable local QA.
import assert from "node:assert/strict";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";
import sharp from "sharp";
const phase = process.argv[2] ?? "after",
  base = process.argv[3] ?? "http://localhost:8080";
if (
  !["before", "after"].includes(phase) ||
  !["http://localhost:8080", "http://localhost:8081"].includes(base)
)
  throw Error("Explicit local before/after QA only.");
const catalog = JSON.parse(readFileSync("src/data/master-catalog.json")),
  patches = JSON.parse(readFileSync("src/data/catalog-patches.json")).models,
  records = JSON.parse(readFileSync("src/data/crown-calibrations.json")).records;
const cases = ["112", "112FP", "256", "112FPR", "112PM", "168P"].map((model) => {
  const photo = records.find(
    (p) => p.modelId === model && (model !== "112FPR" || p.sourceWidth < 800),
  );
  const data = { ...catalog.models.find((m) => m.id === model), ...patches[model] };
  return { model, photo, color: data.colorways.find((c) => c.id === photo.colorway).officialName };
});
const directory = resolve(
  "screenshots/hat-image-quality/" + phase + (base.endsWith(":8081") ? "-built" : ""),
);
mkdirSync(directory, { recursive: true });
const result = { phase, base, checks: [], frames: [], pageErrors: [], consoleErrors: [] };
const browser = await chromium.launch({ headless: true, channel: "chrome" });
try {
  for (const device of [
    { width: 1440, height: 1000, dpr: 2 },
    { width: 390, height: 844, dpr: 3 },
  ]) {
    const context = await browser.newContext({
      viewport: { width: device.width, height: device.height },
      deviceScaleFactor: device.dpr,
    });
    const page = await context.newPage();
    page.on("pageerror", (e) => result.pageErrors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") result.consoleErrors.push(m.text());
    });
    for (const item of cases) {
      await page.goto(
        base +
          "/order?" +
          new URLSearchParams({ type: "hat", family: item.model, color: item.color }),
        { waitUntil: "domcontentloaded" },
      );
      await page.waitForFunction(({ model, color }) => {
        const frame = document.querySelector("[data-hat-preview]");
        const img = frame?.querySelector("img");
        return (
          frame?.getAttribute("data-hat-preview") === model &&
          frame?.getAttribute("data-colorway") === color &&
          frame?.getAttribute("data-image-rect") !== "loading" &&
          img?.complete &&
          img.naturalWidth > 0
        );
      }, item);
      await page.getByRole("button", { name: "Zoom", exact: true }).waitFor();
      const frame = page.locator("[data-hat-preview]").locator("..");
      const measure = () =>
        page.locator("[data-hat-preview]").evaluate((el) => {
          const img = el.querySelector("img"),
            b = img.getBoundingClientRect(),
            patch = el.querySelector("[data-patch-overlay]")?.getBoundingClientRect();
          const ratio = Math.min(b.width / img.naturalWidth, b.height / img.naturalHeight);
          return {
            url: new URL(img.currentSrc).pathname,
            width: img.naturalWidth,
            height: img.naturalHeight,
            paintedWidth: ratio * img.naturalWidth,
            dpr: devicePixelRatio,
            requiredWidth: ratio * img.naturalWidth * devicePixelRatio,
            rect: JSON.parse(el.getAttribute("data-image-rect")),
            patch: patch
              ? { width: patch.width, height: patch.height, x: patch.x, y: patch.y }
              : null,
            caption: el.textContent,
          };
        });
      const normal = await measure();
      await frame.screenshot({
        path: resolve(directory, item.model + "-" + device.width + "-fit.png"),
        animations: "disabled",
      });
      let zoom = null;
      if (phase === "after" && item.photo.sourceWidth < 800) {
        assert.equal(
          await page.getByRole("button", { name: "Zoom", exact: true }).isDisabled(),
          true,
        );
        await page.getByText(/Catalog photo · detail limited/).waitFor();
      } else {
        await page.getByRole("button", { name: "Zoom", exact: true }).click();
        await page.getByRole("button", { name: "Fit", exact: true }).waitFor();
        // Wait for the actual selected rendition and completed transform, not an arbitrary delay.
        await page.waitForFunction(() => {
          const el = document.querySelector("[data-hat-preview]"),
            i = el.querySelector("img");
          return (
            i.complete &&
            i.naturalWidth > 0 &&
            Math.abs(Number(getComputedStyle(el).transform.match(/matrix\(([^,]+)/)?.[1]) - 1.35) <
              0.001
          );
        });
        zoom = await measure();
        if (phase === "after" && item.photo.sourceWidth >= 800) {
          await page.waitForFunction(() => {
            const el = document.querySelector("[data-hat-preview]"),
              img = el.querySelector("img"),
              b = img.getBoundingClientRect();
            const needed =
              Math.min(b.width / img.naturalWidth, b.height / img.naturalHeight) *
              img.naturalWidth *
              devicePixelRatio;
            return img.complete && img.naturalWidth >= needed * 0.98;
          });
          zoom = await measure();
        }
        await frame.screenshot({
          path: resolve(directory, item.model + "-" + device.width + "-zoom.png"),
          animations: "disabled",
        });
      }
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
        false,
      );
      result.frames.push({
        model: item.model,
        color: item.color,
        viewport: device.width,
        normal,
        zoom,
      });
      if (phase === "after" && item.photo.sourceWidth >= 800) {
        assert.ok(
          zoom.width >= zoom.requiredWidth * 0.98,
          "enough genuine photo pixels for displayed zoom",
        );
        assert.ok(zoom.patch, "calibrated patch remains attached with sharper rendition");
        const prior = JSON.parse(
          readFileSync(resolve("screenshots/hat-image-quality/before/results.json")),
        ).frames.find((f) => f.model === item.model && f.viewport === device.width);
        for (const key of ["x", "y", "width", "height"])
          assert.ok(
            Math.abs(prior.normal.rect[key] - normal.rect[key]) < 0.01,
            "canonical geometry unchanged " + key,
          );
        for (const key of ["x", "y", "width", "height"])
          assert.ok(
            Math.abs(prior.normal.patch[key] - normal.patch[key]) < 0.75,
            "rendered patch geometry unchanged " + key,
          );
      }
    }
    await context.close();
  }
  if (phase === "after") {
    result.checks.push(
      "six exact model/color photos tested on desktop2x and phone3x; genuine native detail, geometry unchanged, and catalog-source limitations shown without extra zoom",
    );
    const item = cases[0],
      display = JSON.parse(readFileSync("src/data/hat-display-images.json")).records.find(
        (r) => r.calibrationId === item.photo.id,
      );
    const wrong = await sharp({
      create: { width: 16, height: 16, channels: 3, background: "#fff" },
    })
      .png()
      .toBuffer();
    for (const fault of ["network", "wrong-size"]) {
      const context = await browser.newContext({
          viewport: { width: 1440, height: 1000 },
          deviceScaleFactor: 2,
        }),
        page = await context.newPage();
      page.on("pageerror", (e) => result.pageErrors.push(e.message));
      await context.route("**" + display.imageUrl, (route) =>
        fault === "network"
          ? route.abort("failed")
          : route.fulfill({ status: 200, contentType: "image/png", body: wrong }),
      );
      await page.goto(
        base +
          "/order?" +
          new URLSearchParams({ type: "hat", family: item.model, color: item.color }),
        { waitUntil: "domcontentloaded" },
      );
      await page.waitForFunction((url) => {
        const f = document.querySelector("[data-hat-preview]"),
          img = f?.querySelector("img");
        return (
          img?.complete &&
          img.naturalWidth > 0 &&
          img.currentSrc.endsWith(url) &&
          f.getAttribute("data-image-rect") !== "loading"
        );
      }, item.photo.imageUrl);
      assert.equal(await page.locator("[data-patch-overlay]").count(), 1);
      result.checks.push(
        fault +
          " sharper rendition safely falls back to the exact immutable original with patch attached",
      );
      await context.close();
    }
    const context = await browser.newContext({
        viewport: { width: 1440, height: 1000 },
        deviceScaleFactor: 2,
      }),
      page = await context.newPage();
    const source = {
      ...catalog.models.find((m) => m.id === item.model),
      ...patches[item.model],
    }.colorways.find((c) => c.id === item.photo.colorway);
    await page.goto(
      base +
        "/order?" +
        new URLSearchParams({ type: "hat", family: item.model, color: item.color }),
      { waitUntil: "domcontentloaded" },
    );
    // SSR buttons are visible before hydration attaches their click handlers.
    await page.waitForFunction(() => {
      const f = document.querySelector("[data-hat-preview]");
      return (
        f &&
        f.getAttribute("data-image-rect") !== "loading" &&
        f.querySelector("[data-patch-overlay]")
      );
    });
    await page.getByRole("button", { name: /^side$/i }).click();
    await page.waitForFunction(() => {
      const i = document.querySelector("[data-hat-preview] > img");
      return i?.alt.endsWith("side") && i.complete && i.naturalWidth > 0;
    });
    const side = await page.locator("[data-hat-preview] > img").getAttribute("src");
    assert.ok(side.startsWith("https://lh3.googleusercontent.com/d/" + source.views.side + "="));
    assert.ok(Number(side.match(/=w(\d+)$/)[1]) > 1200);
    result.checks.push(
      "high-density side view requests a larger rendition of its exact approved side asset",
    );
    await context.close();
  }
  assert.equal(result.pageErrors.length, 0, JSON.stringify(result.pageErrors));
  assert.equal(result.consoleErrors.length, 0, JSON.stringify(result.consoleErrors));
  result.passed = true;
} catch (error) {
  result.failure = error.stack;
  process.exitCode = 1;
} finally {
  writeFileSync(resolve(directory, "results.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  await browser.close();
}
