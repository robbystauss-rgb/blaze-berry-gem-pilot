// Isolated browser acceptance only. Never accepts a remote/production target.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
const base = "http://localhost:8080";
if (process.env.DATABASE_URL || process.env.STRIPE_SECRET_KEY || process.env.RESEND_API_KEY)
  throw Error("QA requires isolated test storage and no credentials.");
const fixtures = JSON.parse(readFileSync("artifacts/commerce-qa/session.json", "utf8"));
mkdirSync("screenshots/manual-payment", { recursive: true });
const browser = await chromium.launch({ headless: true, channel: "chrome" });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(e.message));
page.on("dialog", (d) => d.accept());
const checks = [];
try {
  await page.goto(base + "/login");
  await page.getByLabel("Email", { exact: true }).fill(fixtures.users.owner.email);
  await page.getByLabel("Password", { exact: true }).fill(fixtures.users.owner.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL("**/account");
  await page.goto(base + "/admin?section=orders&orderId=" + fixtures.unpaidOrderId);
  await page.getByRole("button", { name: "Record verified manual payment", exact: true }).click();
  await page
    .getByLabel("Transaction / receipt reference", { exact: true })
    .fill("QA-VENMO-" + Date.now());
  await page.getByLabel("Internal verification note", { exact: true }).fill("yes");
  await page.getByRole("button", { name: "Record verified payment", exact: true }).click();
  await page.getByText(/Add a verification note of at least 5 characters/).waitFor();
  assert.doesNotMatch(await page.locator("body").innerText(), /"too_small"|"path":\s*\[/);
  await page.screenshot({
    path: "screenshots/manual-payment/phone-inline-validation.png",
    fullPage: true,
  });
  checks.push("short reason gives inline guidance without raw validation");
  await page.reload();
  await page.getByRole("button", { name: "Record verified manual payment", exact: true }).click();
  assert.equal(
    await page.getByLabel("Internal verification note", { exact: true }).inputValue(),
    "yes",
  );
  await page
    .getByLabel("Internal verification note", { exact: true })
    .fill("TEST ONLY — independent receipt verified in Venmo");
  await page.getByRole("button", { name: "Record verified payment", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Payment recorded:" }).waitFor();
  assert.match(await page.locator("body").innerText(), /remaining \$0\.00/i);
  await page.screenshot({
    path: "screenshots/manual-payment/phone-recorded-receipt.png",
    fullPage: true,
  });
  await page.reload();
  await page.getByRole("heading", { name: "Financial summary", exact: true }).waitFor();
  assert.equal(
    await page
      .locator(".cc-badge.good")
      .filter({ hasText: /^Paid$/ })
      .count(),
    1,
  );
  assert.equal(
    await page
      .getByRole("button", { name: "Record verified manual payment", exact: true })
      .isDisabled(),
    true,
  );
  checks.push("form survives refresh, records one receipt, paid status survives refresh");
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
    false,
  );
  checks.push("390px viewport has no horizontal overflow");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: "screenshots/manual-payment/desktop-recorded-receipt.png",
    fullPage: true,
  });
  assert.deepEqual(pageErrors, []);
  writeFileSync(
    "screenshots/manual-payment/results.json",
    JSON.stringify({ checks, pageErrors, fixtureOnly: true }, null, 2),
  );
  console.log(JSON.stringify({ checks, pageErrors }));
} finally {
  await browser.close();
}
