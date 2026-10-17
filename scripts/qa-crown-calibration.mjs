// Isolated test-only calibration arithmetic and owner UI; no real measurements are asserted.
import assert from "node:assert/strict";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";
const base = process.argv[2] ?? "http://localhost:8080";
if (base !== "http://localhost:8080" || process.env.DATABASE_URL || process.env.STRIPE_SECRET_KEY)
  throw Error("Calibration QA requires isolated local fixtures.");
const root = process.cwd(),
  fixture = JSON.parse(readFileSync(resolve(root, "artifacts/commerce-qa/session.json"), "utf8"));
const photos = JSON.parse(
  readFileSync(resolve(root, "src/data/crown-calibrations.json"), "utf8"),
).records;
const directory = resolve(root, "screenshots/crown-qa/completion");
mkdirSync(directory, { recursive: true });
const result = {
  scope:
    "Local fixtures only. Entered 3-inch reference is SYNTHETIC TEST DATA, not a physical measurement of this hat.",
  checks: [],
  pageErrors: [],
  screenshots: [],
};
const b = await chromium.launch({ channel: "chrome", headless: true }),
  context = await b.newContext({ viewport: { width: 1440, height: 1000 } }),
  page = await context.newPage();
page.on("pageerror", (e) => result.pageErrors.push(e.message));
page.on("dialog", (d) => d.accept());
try {
  await page.goto(base + "/login");
  await page.getByLabel("Email", { exact: true }).fill(fixture.users.owner.email);
  await page.getByLabel("Password", { exact: true }).fill(fixture.users.owner.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL("**/account");
  await page.goto(base + "/admin?section=calibration");
  await page.getByRole("heading", { name: "Calibrate an exact product photograph" }).waitFor();
  const photo = photos.find((p) => p.modelId === "112" && p.colorway === "112:black");
  await page.getByLabel("Exact color photograph", { exact: true }).selectOption(photo.id);
  await page.getByText("Advanced image coordinates", { exact: true }).click();
  const x = page.getByLabel("Crown x (source fraction)", { exact: true });
  await x.waitFor();
  const oldX = Number(await x.inputValue());
  await page.getByRole("button", { name: "Draw new boundary", exact: true }).click();
  await page.getByRole("button", { name: "Cancel drawing", exact: true }).click();
  assert.equal(Number(await x.inputValue()), oldX);
  result.checks.push("Cancel keeps original boundary");
  await page.getByRole("button", { name: "Draw new boundary", exact: true }).click();
  const svg = page.getByLabel("Calibration markers", { exact: true });
  await svg.scrollIntoViewIfNeeded();
  const box = await svg.boundingBox();
  const points = [
    [photo.bounds.x - 0.02, photo.bounds.y - 0.02],
    [photo.bounds.x + photo.bounds.width + 0.02, photo.bounds.y - 0.02],
    [photo.bounds.x + photo.bounds.width + 0.02, photo.bounds.y + photo.bounds.height + 0.02],
    [photo.bounds.x - 0.02, photo.bounds.y + photo.bounds.height + 0.02],
  ];
  for (const [x, y] of points)
    await page.mouse.click(box.x + x * box.width, box.y + y * box.height);
  await page.getByRole("button", { name: "Finish drawing boundary", exact: true }).click();
  assert.ok(
    Math.abs(Number(await x.inputValue()) - (oldX - 0.02)) < 0.001,
    "outline expands outside old bounds",
  );
  result.checks.push("New boundary expands beyond old crop");
  await page.getByLabel("Known reference length (inches)", { exact: true }).fill("3");
  await page.getByLabel("Horizontal perspective", { exact: true }).fill(".72");
  const diagram = page.locator(".cc-calibration-photo");
  await diagram.scrollIntoViewIfNeeded();
  const source = await diagram.boundingBox(),
    mounted = await page.locator(".cc-calibration-patch").boundingBox();
  assert.ok(
    Math.abs(mounted.width - source.width * 0.3) < 1,
    "3-inch synthetic horizontal reference span is mounted once",
  );
  result.checks.push("Synthetic reference does not double-compress");
  const capture = resolve(directory, "owner-SYNTHETIC-reference-perspective.png");
  await page.screenshot({ path: capture, fullPage: true });
  result.screenshots.push(capture);
  await page
    .getByRole("button", { name: "Reset to this photo’s visual bounds", exact: true })
    .click();
  assert.equal(
    await page.getByLabel("Known reference length (inches)", { exact: true }).inputValue(),
    "",
  );
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await page.getByText("Draft saved.", { exact: true }).waitFor();
  await page.reload();
  await page.getByRole("heading", { name: "Calibrate an exact product photograph" }).waitFor();
  await page.getByLabel("Exact color photograph", { exact: true }).selectOption(photo.id);
  assert.equal(
    await page.getByLabel("Known reference length (inches)", { exact: true }).inputValue(),
    "",
  );
  result.checks.push(
    "Estimated default draft persists; synthetic ruler was not saved or published",
  );
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    for (const [family, color] of [
      ["112", "Black"],
      ["112FP", "Army Olive Green/Tan"],
      ["256", "Birch/Black"],
    ]) {
      await page.goto(base + "/order?" + new URLSearchParams({ family, color, type: "hat" }));
      const patch = page.locator("[data-patch-overlay]");
      await patch.waitFor();
      await page
        .getByText(/Estimated photo scale/)
        .first()
        .waitFor();
      await page
        .getByText("Updating quote…", { exact: true })
        .first()
        .waitFor({ state: "hidden", timeout: 20000 });
      assert.equal(await page.getByText("Quote unavailable", { exact: true }).count(), 0);
      const inches = JSON.parse(await patch.getAttribute("data-physical-inches"));
      assert.deepEqual(inches, { width: 3, height: 2 });
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
        false,
      );
      const file = resolve(directory, `estimated-${family}-${width}.png`);
      await page.screenshot({ path: file, fullPage: true });
      result.screenshots.push(file);
      result.checks.push(
        `${family} ${color} ${width}: nominal3x2, explicit estimated scale, no overflow`,
      );
    }
    await page.goto(base + "/order?type=patch");
    const card = page.locator("[data-patch-card]");
    await card.waitFor();
    const frame = await card.boundingBox(),
      inches = JSON.parse(await card.getAttribute("data-physical-inches"));
    assert.ok(Math.abs(frame.width / frame.height - inches.width / inches.height) < 0.005);
    result.checks.push(
      `Patch-only physical silhouette matches ${inches.width}x${inches.height} at ${width}`,
    );
  }
  await page.goto(base + "/admin?section=calibration");
  await page.getByRole("heading", { name: "Calibrate an exact product photograph" }).waitFor();
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
    false,
  );
  await page.getByRole("button", { name: "Save draft", exact: true }).scrollIntoViewIfNeeded();
  const mobileOwner = resolve(directory, "owner-calibration-390.png");
  await page.screenshot({ path: mobileOwner, fullPage: true });
  result.screenshots.push(mobileOwner);
  result.checks.push(
    "Phone owner calibration has no overflow and publishing controls are reachable",
  );
  assert.deepEqual(result.pageErrors, []);
  result.passed = true;
} catch (error) {
  result.passed = false;
  result.failure = error.stack;
  await page.screenshot({ path: resolve(directory, "failure.png"), fullPage: true });
  process.exitCode = 1;
} finally {
  await b.close();
  writeFileSync(resolve(directory, "results.json"), JSON.stringify(result, null, 2));
}
console.log(JSON.stringify(result));
