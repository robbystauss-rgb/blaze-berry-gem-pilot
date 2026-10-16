// Acceptance tests run only against the isolated QA server. No real customer changes or charges.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import sharp from "sharp";
const root = process.cwd(),
  base = process.argv[2] ?? "http://localhost:8080";
if (!["http://localhost:8080", "http://localhost:8081"].includes(base))
  throw Error("Owner QA only targets its two isolated localhost servers.");
const built = base.endsWith(":8081");
const fixture = JSON.parse(
  readFileSync(
    resolve(
      root,
      built ? "artifacts/commerce-qa/built-session.json" : "artifacts/commerce-qa/session.json",
    ),
    "utf8",
  ),
);
if (process.env.DATABASE_URL || process.env.STRIPE_SECRET_KEY || process.env.PAYPAL_CLIENT_SECRET)
  throw Error("QA refuses provider credentials and persistent databases.");
const screenshots = resolve(
    root,
    built ? "screenshots/owner-upgrade-built" : "screenshots/owner-upgrade",
  ),
  artifacts = resolve(
    root,
    built ? "artifacts/commerce-qa/upgrade-built" : "artifacts/commerce-qa/upgrade",
  );
mkdirSync(screenshots, { recursive: true });
mkdirSync(artifacts, { recursive: true });
const master = JSON.parse(readFileSync(resolve(root, "src/data/master-catalog.json"), "utf8"));
const work = master.work[0];
const imageResponse = await fetch(`https://lh3.googleusercontent.com/d/${work.driveId}=w1000`);
if (!imageResponse.ok) throw Error("Verified finished-work reference did not load.");
const imageFile = resolve(artifacts, "TEST-FIXTURE-finished-work.png");
writeFileSync(imageFile, Buffer.from(await imageResponse.arrayBuffer()));
const artworkFile = resolve(artifacts, "TEST-FIXTURE-original-art.png");
const artworkBytes = await sharp(
  Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="300"><rect x="20" y="20" width="560" height="260" rx="24" fill="none" stroke="black" stroke-width="8"/><text x="300" y="165" text-anchor="middle" font-family="sans-serif" font-weight="bold" font-size="64">REC TEST</text></svg>',
  ),
)
  .png()
  .toBuffer();
writeFileSync(artworkFile, artworkBytes);
const browser = await chromium.launch({ headless: true, channel: "chrome" }),
  context = await browser.newContext({ viewport: { width: 1440, height: 1000 } }),
  page = await context.newPage();
const results = { checks: [], pageErrors: [], consoleErrors: [], screenshots: [] };
function watchPage(target) {
  target.on("pageerror", (e) => results.pageErrors.push(e.message));
  target.on("console", (m) => {
    if (m.type() === "error") results.consoleErrors.push(m.text());
  });
}
watchPage(page);
page.on("dialog", (d) => d.accept());
async function capture(name) {
  const path = resolve(screenshots, name + ".png");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path, fullPage: true, caret: "initial" });
  results.screenshots.push(path);
}
async function check(name) {
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
    false,
    name + " has no document overflow",
  );
  results.checks.push(name);
}
async function login(role) {
  await page.goto(base + "/login");
  await page.getByLabel("Email", { exact: true }).fill(fixture.users[role].email);
  await page.getByLabel("Password", { exact: true }).fill(fixture.users[role].password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL("**/account");
}
async function section(s) {
  await page.goto(base + "/admin?section=" + s);
  await page
    .getByRole("heading", {
      name: {
        gallery: "Media library",
        calibration: "Calibrate an exact product photograph",
        pricing: "Custom-builder price book",
        promotions: "Promotion campaigns",
        content: "Homepage & storefront settings",
      }[s],
      exact: true,
    })
    .waitFor();
}
async function published() {
  await page.getByRole("button", { name: "Publish reviewed version", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Published." }).waitFor();
}
try {
  await login("owner");
  if (built) {
    await page.goto(fixture.ownerSetupUrl);
    await page.getByRole("button", { name: "Activate owner access", exact: true }).click();
    await page.waitForURL(/\/admin(?:\?|$)/);
    results.checks.push("built owner invitation uses existing authenticated activation");
  }
  await section("gallery");
  await page.locator("input[type=file]").setInputFiles(imageFile);
  await page.getByRole("status").filter({ hasText: "Photos uploaded privately" }).waitFor();
  await page
    .locator("button.cc-media-card")
    .filter({ hasText: "TEST-FIXTURE-finished-work.png" })
    .click();
  await page
    .getByLabel("Alt text", { exact: true })
    .fill("TEST FIXTURE genuine REC finished hat photograph");
  await page.getByRole("button", { name: "Save photo", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Photo saved." }).waitFor();
  await page.getByLabel("Project title", { exact: true }).fill("TEST FIXTURE QA Gallery");
  await page
    .getByLabel("Description", { exact: true })
    .fill("Authentic source photograph in an isolated acceptance test.");
  await page
    .locator(".compact .cc-media-card")
    .filter({ hasText: "TEST FIXTURE genuine REC" })
    .getByRole("checkbox")
    .check();
  await page.getByLabel(/I have permission/).check();
  await page.getByLabel("Feature on homepage", { exact: true }).check();
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Draft saved." }).waitFor();
  await published();
  await capture("gallery-owner-desktop");
  await check("owner media/project publication");
  const publicContext = await browser.newContext({ viewport: { width: 390, height: 844 } }),
    publicPage = await publicContext.newPage();
  watchPage(publicPage);
  await publicPage.goto(base + "/actual-work");
  await publicPage.getByRole("heading", { name: "TEST FIXTURE QA Gallery", exact: true }).waitFor();
  await publicPage.screenshot({
    caret: "initial",
    path: resolve(screenshots, "gallery-public-phone.png"),
    fullPage: true,
  });
  results.checks.push("published gallery is publicly visible on phone");
  await publicPage.goto(base + "/");
  await publicPage.getByRole("heading", { name: "TEST FIXTURE QA Gallery", exact: true }).waitFor();
  results.checks.push("featured project reaches homepage");
  await section("content");
  await published();
  await page.getByLabel("Hero title", { exact: true }).fill("TEST FIXTURE homepage proof");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Draft saved." }).waitFor();
  const preview = await context.newPage();
  watchPage(preview);
  await preview.goto(base + "/?ownerPreview=true");
  await preview
    .getByRole("heading", { name: "TEST FIXTURE homepage proof", exact: true })
    .waitFor();
  await preview.screenshot({
    caret: "initial",
    path: resolve(screenshots, "homepage-private-draft-desktop.png"),
    fullPage: true,
  });
  await preview.close();
  await publicPage.reload();
  assert.equal(
    await publicPage
      .getByRole("heading", { name: "TEST FIXTURE homepage proof", exact: true })
      .count(),
    0,
    "unpublished draft is private",
  );
  await published();
  await publicPage.reload();
  await publicPage
    .getByRole("heading", { name: "TEST FIXTURE homepage proof", exact: true })
    .waitFor();
  await publicPage.screenshot({
    caret: "initial",
    path: resolve(screenshots, "homepage-published-phone.png"),
    fullPage: true,
  });
  await page.getByLabel("Published history", { exact: true }).selectOption("1");
  await page.getByRole("button", { name: "Revert", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "restored" }).waitFor();
  await publicPage.reload();
  await publicPage.getByRole("heading", { name: "Make it yours.", exact: true }).waitFor();
  results.checks.push("homepage draft, private preview, publication and revert");
  await section("pricing");
  await page.getByLabel("Richardson 112 ($)", { exact: true }).fill("32");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Draft saved." }).waitFor();
  await published();
  await capture("pricing-desktop");
  await section("promotions");
  await page.getByLabel("Code", { exact: true }).fill("QA-ONLY-10");
  await page.getByLabel("Campaign name", { exact: true }).fill("TEST ONLY acceptance offer");
  await page.getByLabel("Status", { exact: true }).selectOption("active");
  await page.getByRole("button", { name: "Save promotion", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Promotion saved." }).waitFor();
  await page.locator(".cc-project-preview").getByText(/\$28\.80/).waitFor();
  await capture("promotion-desktop");
  await publicPage.goto(base + "/order?family=112&color=Black&type=hat");
  await publicPage.locator("[data-patch-overlay]").waitFor();
  await publicPage.getByRole("button", { name: /^05\s*Design$/ }).click();
  await publicPage.getByPlaceholder("Type it. It shows on the hat.").fill("TEST REC");
  await publicPage.locator("input[type=file]").setInputFiles(artworkFile);
  await publicPage.locator("[data-patch-overlay] img[data-engraving-ready=true]").waitFor();
  await publicPage.getByRole("button", { name: /^07\s*Review$/ }).click();
  await publicPage.getByPlaceholder("Name", { exact: true }).fill("TEST FIXTURE checkout");
  await publicPage.getByPlaceholder("Email", { exact: true }).fill("test-fixture@example.invalid");
  await publicPage.getByLabel("Promo code", { exact: true }).fill("QA-ONLY-10");
  await publicPage.getByRole("status").filter({ hasText: "QA-ONLY-10 applied" }).waitFor();
  await publicPage.getByText("$28.80", { exact: true }).first().waitFor();
  await publicPage.getByText("Manual Venmo fallback", { exact: true }).click();
  await publicPage
    .getByRole("button", { name: "Save order for manual Venmo payment", exact: true })
    .click();
  await publicPage
    .getByText(
      built
        ? /Order saved awaiting verified manual payment|Durable order storage is not configured/
        : /Order saved awaiting verified manual payment/,
    )
    .waitFor();
  await publicPage.screenshot({
    caret: "initial",
    path: resolve(screenshots, "builder-quote-order-phone.png"),
    fullPage: true,
  });
  results.checks.push(
    built
      ? "published quote and compiled durable-storage guard"
      : "published price, eligible coupon, displayed total and persisted unpaid order",
  );
  if (!built) {
    await page.getByLabel("Search all business records").fill("TEST FIXTURE checkout");
    await page.locator(".cc-global-results a").filter({ hasText: "Order #" }).first().click();
    await page.getByRole("heading", { name: "Saved customer mockup", exact: true }).waitFor();
    assert.equal(await page.locator(".cc-specs dt").getByText(/Expected\s*Preview|Preview\s*Version|Product\s*Images/i).count(), 0);
    await page.locator(".cc-specs dt").getByText("Patch Size", {exact:true}).waitFor();
    await capture("order-saved-mockup-desktop");
    const originalDownload = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download original artwork", exact: true }).click();
    const originalPath = await (await originalDownload).path();
    assert.equal(
      createHash("sha256").update(readFileSync(originalPath)).digest("hex"),
      createHash("sha256").update(artworkBytes).digest("hex"),
    );
    const mockupDownload = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download composite mockup", exact: true }).click();
    const mockupPath = await (await mockupDownload).path();
    const exported = await sharp(readFileSync(mockupPath)).metadata();
    assert.equal(exported.width, 1200);
    assert.equal(exported.height, 1000);
    assert.notEqual(
      createHash("sha256").update(readFileSync(mockupPath)).digest("hex"),
      createHash("sha256").update(artworkBytes).digest("hex"),
    );
    results.checks.push(
      "global order search, frozen mockup, byte-identical original download and separate composite export",
    );
  }
  await section("promotions");
  await page.getByRole("button").filter({ hasText: "QA-ONLY-10 · TEST ONLY" }).click();
  await page.getByLabel("Status", { exact: true }).selectOption("inactive");
  await page.getByRole("button", { name: "Save promotion", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Promotion saved." }).waitFor();
  await publicPage.reload();
  await publicPage.locator("[data-patch-overlay]").waitFor();
  await publicPage.getByRole("button", { name: /^07\s*Review$/ }).click();
  await publicPage.getByRole("alert").filter({ hasText: "not available" }).waitFor();
  assert.equal(
    await publicPage
      .getByRole("button", { name: "Save order for manual Venmo payment", exact: true })
      .count(),
    0,
  );
  results.checks.push("deactivated coupon blocks new checkout");
  await section("calibration");
  await page.getByRole("button", { name: "Boundary marker 1", exact: true }).press("ArrowRight");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Draft saved." }).waitFor();
  await published();
  await page.getByRole("button", { name: "Unpublish", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Unpublished." }).waitFor();
  results.checks.push("keyboard calibration draft, publication and unpublication");
  await capture("calibration-desktop");
  await check("calibration desktop");
  await page.setViewportSize({ width: 390, height: 844 });
  await capture("calibration-phone");
  await check("calibration phone");
  await section("gallery");
  await capture("gallery-owner-phone");
  await check("gallery phone");
  const customerContext = await browser.newContext(),
    customerPage = await customerContext.newPage();
  watchPage(customerPage);
  await customerPage.goto(base + "/login");
  await customerPage.getByLabel("Email", { exact: true }).fill(fixture.users.customer.email);
  await customerPage.getByLabel("Password", { exact: true }).fill(fixture.users.customer.password);
  await customerPage.getByRole("button", { name: "Sign in", exact: true }).click();
  await customerPage.waitForURL("**/account");
  await customerPage.goto(base + "/admin?section=gallery");
  await customerPage
    .getByRole("heading", { name: "Merchant access required", exact: true })
    .waitFor();
  results.checks.push("regular customer is denied merchant workspace");
  await customerContext.close();
  await publicContext.close();
  assert.equal(results.pageErrors.length, 0);
  assert.equal(results.consoleErrors.length, 0, "owner and public browser flows have no console errors");
  results.passed = true;
  console.log(
    JSON.stringify({
      passed: true,
      checks: results.checks,
      consoleErrors: results.consoleErrors.length,
      screenshots,
    }),
  );
} catch (e) {
  results.passed = false;
  results.error = e.stack;
  await capture("failure");
  console.error(e);
  process.exitCode = 1;
} finally {
  writeFileSync(resolve(artifacts, "results.json"), JSON.stringify(results, null, 2));
  await browser.close();
}
