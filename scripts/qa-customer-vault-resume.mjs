import { chromium } from "playwright";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
const base = "http://localhost:8080";
if (process.env.DATABASE_URL || process.env.STRIPE_SECRET_KEY || process.env.RESEND_API_KEY) throw Error("Local test target only.");
const { users } = JSON.parse(readFileSync("artifacts/commerce-qa/customer-browser-session.json", "utf8")), saved = JSON.parse(readFileSync("artifacts/commerce-qa/customer-resume.json", "utf8"));
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } }), page = await context.newPage();
  await page.goto(base + "/login"); await page.getByLabel("Email", { exact: true }).fill(users.owner.email); await page.getByLabel("Password", { exact: true }).fill(users.owner.password); await page.getByRole("button", { name: "Sign in", exact: true }).click(); await page.waitForURL("**/account");
  await page.goto(base + saved.customerHref); await page.getByRole("heading", { name: saved.name, exact: true }).waitFor();
  await page.getByRole("button", { name: "Build again", exact: true }).click();
  assert.equal(await page.getByLabel("Exact colorway", { exact: true }).inputValue(), "112:black");
  assert.equal(await page.getByLabel("Quantity", { exact: true }).inputValue(), "3");
  const original = await context.request.get(saved.assetUrl);
  assert.equal(original.status(), 200);
  assert.equal(original.headers()["cache-control"], "private, no-store");
  const hash = (x) => createHash("sha256").update(x).digest("hex");
  assert.equal(hash(await original.body()), hash(readFileSync("artifacts/commerce-qa/TEST-ONLY-original-logo.png")));
  await page.evaluate(() => window.scrollTo(0, 0)); await page.screenshot({ path: "screenshots/customer-vault/phone-reopened-after-server-restart.png", fullPage: true });
  writeFileSync("screenshots/customer-vault/restart-results.json", JSON.stringify({ serverRestartPersistence: true, freshLogin: true, sourceChecksumVerified: true, exactVariant: "112:black", quantity: 3 }, null, 2));
  console.log("Browser verified after server restart: fresh login, profile, exact saved design and original source checksum persist.");
} finally { await browser.close(); }
