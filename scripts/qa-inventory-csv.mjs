// Isolated fixture acceptance only: never target production or real merchant data.
import { chromium } from "playwright";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
const base = process.argv[2] ?? "http://localhost:8080";
if (
  base !== "http://localhost:8080" ||
  process.env.DATABASE_URL ||
  process.env.STRIPE_SECRET_KEY ||
  process.env.PAYPAL_CLIENT_SECRET ||
  process.env.VERCEL
)
  throw Error("Inventory QA requires the isolated local QA server without provider credentials.");
const fixture = JSON.parse(readFileSync("artifacts/commerce-qa/session.json", "utf8"));
const directory = resolve("screenshots/owner-operations"),
  artifact = resolve("artifacts/commerce-qa/owner-operations");
mkdirSync(directory, { recursive: true });
mkdirSync(artifact, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: "chrome" });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } }),
  page = await context.newPage();
const results = { checks: [], pageErrors: [], consoleErrors: [], screenshots: [] };
function watch(target) {
  target.on("pageerror", (e) => results.pageErrors.push(e.message));
  target.on("console", (m) => {
    if (m.type() === "error") results.consoleErrors.push(m.text());
  });
}
watch(page);
page.on("dialog", (d) => d.accept());
async function login(target, role) {
  await target.goto(base + "/login");
  await target.getByLabel("Email", { exact: true }).fill(fixture.users[role].email);
  await target.getByLabel("Password", { exact: true }).fill(fixture.users[role].password);
  await target.getByRole("button", { name: "Sign in", exact: true }).click();
  await target.waitForURL("**/account");
}
async function inventory() {
  await page.goto(base + "/admin?section=inventory");
  await page.getByRole("heading", { name: "Import verified stock counts", exact: true }).waitFor();
}
async function capture(name) {
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
    false,
    "No document overflow",
  );
  const path = resolve(directory, name + ".png");
  await page.screenshot({ path, fullPage: true, caret: "initial" });
  results.screenshots.push(path);
}
try {
  await login(page, "owner");
  await inventory();
  const templateEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Blank template", exact: true }).click();
  const template = await templateEvent;
  assert.equal(
    readFileSync(await template.path(), "utf8"),
    "sku,title,category,on_hand,threshold,incoming,reason\r\n",
  );
  results.checks.push("owner downloads a valid blank template");
  const sku = "QA-CSV-" + randomUUID().slice(0, 8),
    title = "TEST FIXTURE CSV blanks";
  await page
    .getByLabel("Count / supplier reference", { exact: true })
    .fill("TEST ONLY counted fixture stock");
  await page
    .getByLabel("CSV contents", { exact: true })
    .fill(
      `sku,title,category,on_hand,threshold,incoming\n${sku},${title},supplies,6,2,4\nINVALID,,supplies,1.5,0,0`,
    );
  await page.getByRole("button", { name: "Preview import", exact: true }).click();
  await page.getByText("1 rows need correction", { exact: false }).waitFor();
  assert.equal(await page.getByRole("button", { name: /Confirm and import/ }).isDisabled(), true);
  await capture("csv-errors-desktop");
  results.checks.push("invalid rows are explained and prevent any import");
  await page
    .getByLabel("CSV contents", { exact: true })
    .fill(`sku,title,category,on_hand,threshold,incoming\n${sku},${title},supplies,6,2,4`);
  await page.getByRole("button", { name: "Preview import", exact: true }).click();
  await page.getByText("1 new · 0 changed", { exact: false }).waitFor();
  await page.getByRole("button", { name: "Confirm and import 1 changes", exact: true }).click();
  await page
    .getByText("Import complete: 1 created, 0 updated, 0 unchanged.", { exact: true })
    .waitFor();
  await page.getByText(sku + " · Supplies", { exact: true }).waitFor();
  results.checks.push("owner previews and atomically imports a new verified stock item");
  const exportEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export editable counts", exact: true }).click();
  const exported = await exportEvent;
  assert.ok(readFileSync(await exported.path(), "utf8").includes(sku));
  results.checks.push("persisted stock appears in the editable CSV export");
  await page
    .getByLabel("Count / supplier reference", { exact: true })
    .fill("TEST ONLY second verified count");
  await page.getByLabel("CSV contents", { exact: true }).fill(`sku,on_hand,threshold\n${sku},2,3`);
  await page.getByRole("button", { name: "Preview import", exact: true }).click();
  await page.getByText("0 new · 1 changed", { exact: false }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await capture("csv-preview-phone");
  await page.getByRole("button", { name: "Confirm and import 1 changes", exact: true }).click();
  await page
    .getByText("Import complete: 0 created, 1 updated, 0 unchanged.", { exact: true })
    .waitFor();
  await page.reload();
  await page.getByRole("heading", { name: "Import verified stock counts", exact: true }).waitFor();
  const stockRow = page.locator("tr").filter({ hasText: sku });
  await stockRow.getByText("2 / 2", { exact: true }).waitFor();
  await stockRow.getByText("Low Stock", { exact: true }).waitFor();
  await capture("csv-imported-phone");
  results.checks.push("phone count update persists and triggers the existing low-stock display");
  const customerContext = await browser.newContext(),
    customerPage = await customerContext.newPage();
  watch(customerPage);
  await login(customerPage, "customer");
  await customerPage.goto(base + "/admin?section=inventory");
  await customerPage
    .getByRole("heading", { name: "Merchant access required", exact: true })
    .waitFor();
  results.checks.push("regular customer cannot reach inventory import");
  await customerContext.close();
  assert.equal(results.pageErrors.length, 0);
  assert.equal(results.consoleErrors.length, 0);
  results.passed = true;
  console.log(JSON.stringify({ passed: true, checks: results.checks, screenshots: directory }));
} catch (e) {
  results.passed = false;
  results.error = e.stack;
  await capture("csv-failure");
  console.error(e);
  process.exitCode = 1;
} finally {
  writeFileSync(resolve(artifact, "results.json"), JSON.stringify(results, null, 2));
  await browser.close();
}
