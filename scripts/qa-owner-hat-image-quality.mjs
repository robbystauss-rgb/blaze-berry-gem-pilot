// Read-only photo review through the real owner UI on disposable local fixtures.
import assert from "node:assert/strict";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";
const base = process.argv[2] ?? "http://localhost:8081";
if (
  !["http://localhost:8080", "http://localhost:8081"].includes(base) ||
  process.env.DATABASE_URL ||
  process.env.STRIPE_SECRET_KEY ||
  process.env.PAYPAL_CLIENT_SECRET ||
  process.env.RESEND_API_KEY
)
  throw Error("Owner photo QA requires isolated localhost fixtures without provider credentials.");
const built = base.endsWith(":8081"),
  fixture = JSON.parse(
    readFileSync(
      built ? "artifacts/commerce-qa/built-session.json" : "artifacts/commerce-qa/session.json",
    ),
  ),
  photos = JSON.parse(readFileSync("src/data/crown-calibrations.json")).records,
  displays = JSON.parse(readFileSync("src/data/hat-display-images.json")).records,
  directory = resolve("screenshots/hat-image-quality/owner" + (built ? "-built" : ""));
if (
  !fixture.users.owner.email.endsWith("@example.invalid") ||
  new URL(fixture.ownerSetupUrl).origin !== base
)
  throw Error("Unexpected fixture identity or setup origin.");
mkdirSync(directory, { recursive: true });
const result = { base, checks: [], pageErrors: [], consoleErrors: [] },
  browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on("pageerror", (e) => result.pageErrors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") result.consoleErrors.push(m.text());
  });
  await page.goto(base + "/login");
  await page.getByLabel("Email", { exact: true }).fill(fixture.users.owner.email);
  await page.getByLabel("Password", { exact: true }).fill(fixture.users.owner.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL("**/account");
  await page.goto(base + "/admin?section=calibration");
  await page.waitForFunction(
    () =>
      document.body.textContent.includes("Merchant access required") ||
      document.body.textContent.includes("Calibrate an exact product photograph"),
  );
  if (
    built &&
    !(await page
      .getByRole("heading", { name: "Calibrate an exact product photograph" })
      .isVisible())
  ) {
    await page.goto(fixture.ownerSetupUrl);
    await page.getByRole("button", { name: "Activate owner access", exact: true }).click();
    await page.waitForURL((url) => url.pathname === "/admin");
  }
  await page.goto(base + "/admin?section=calibration");
  await page.getByRole("heading", { name: "Calibrate an exact product photograph" }).waitFor();
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    for (const model of ["112", "112PM"]) {
      const photo = photos.find((p) => p.modelId === model),
        display = displays.find((d) => d.calibrationId === photo.id);
      await page.getByLabel("Richardson model", { exact: true }).selectOption(model);
      await page.getByLabel("Exact color photograph", { exact: true }).selectOption(photo.id);
      await page.waitForFunction(
        ({ url, width }) => {
          const img = document.querySelector(".cc-calibration-photo > img");
          return img?.complete && img.src.endsWith(url) && img.naturalWidth === width;
        },
        { url: display?.imageUrl ?? photo.imageUrl, width: display?.width ?? photo.sourceWidth },
      );
      if (!display) {
        const warning = page.getByRole("status").filter({ hasText: "Limited-detail source photo" });
        await warning.waitFor();
        assert.match(await warning.innerText(), /exact model and color/);
      }
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
        false,
      );
      await page.screenshot({ path: resolve(directory, `${model}-${width}.png`), fullPage: true });
      result.checks.push({
        model,
        viewport: width,
        source: display?.imageUrl ?? photo.imageUrl,
        width: display?.width ?? photo.sourceWidth,
        replacementWarning: !display,
      });
    }
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
