import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
const base = process.argv[2] ?? "http://localhost:8080";
if (!["http://localhost:8080", "http://localhost:8081"].includes(base))
  throw Error("Performance QA requires an isolated local preview.");
const browser = await chromium.launch({ headless: true, channel: "chrome" }),
  results = [];
try {
  for (const width of [1280, 390]) {
    const context = await browser.newContext({
        viewport: { width, height: width === 390 ? 844 : 800 },
      }),
      page = await context.newPage();
    await page.goto(base + "/order?family=112&color=Black&type=hat");
    await page.locator("[data-patch-overlay]").waitFor();
    await page.getByRole("button", { name: /^06\s*Place$/ }).click();
    const patch = page.locator("[data-patch-overlay]");
    await patch.scrollIntoViewIfNeeded();
    const box = await patch.boundingBox();
    const sampling = page.evaluate(
      () =>
        new Promise((resolve) => {
          const durations = [],
            longTasks = [];
          const observer = new PerformanceObserver((list) =>
            longTasks.push(...list.getEntries().map((e) => e.duration)),
          );
          observer.observe({ type: "longtask" });
          let prior = performance.now();
          function frame(time) {
            durations.push(time - prior);
            prior = time;
            if (durations.length < 90) requestAnimationFrame(frame);
            else {
              observer.disconnect();
              durations.sort((a, b) => a - b);
              resolve({
                frames: durations.length,
                medianMs: durations[Math.floor(durations.length / 2)],
                p95Ms: durations[Math.floor(durations.length * 0.95)],
                maxMs: durations.at(-1),
                longTasks,
              });
            }
          }
          requestAnimationFrame(frame);
        }),
    );
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    for (let i = 0; i < 5; i++) {
      await page.mouse.move(box.x + box.width / 2 + 20, box.y + box.height / 2 + 12, { steps: 8 });
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 8 });
    }
    await page.mouse.up();
    const sample = await sampling;
    assert.ok(sample.p95Ms < 100, "local drag must not stall at less than 10 frames per second");
    results.push({ width, ...sample });
    await context.close();
  }
} finally {
  await browser.close();
}
mkdirSync("artifacts/commerce-qa", { recursive: true });
writeFileSync(
  "artifacts/commerce-qa/performance.json",
  JSON.stringify(
    {
      base,
      scope:
        "Local headless Chrome, no CPU/network throttling; not a field Core Web Vitals measurement",
      results,
    },
    null,
    2,
  ),
);
console.log(JSON.stringify(results));
