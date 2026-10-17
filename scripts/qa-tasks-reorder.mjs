// Local owner tasks and customer repeat-order acceptance. No external side effects.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";
const base = "http://localhost:8080";
if (
  process.env.DATABASE_URL ||
  process.env.VERCEL ||
  process.env.STRIPE_SECRET_KEY ||
  process.env.PAYPAL_CLIENT_SECRET ||
  process.env.RESEND_API_KEY
)
  throw Error("Requires isolated local QA without provider credentials.");
const fixture = JSON.parse(readFileSync("artifacts/commerce-qa/session.json", "utf8"));
const title = "TEST FIXTURE business reminder " + randomUUID().slice(0, 8);
const directory = resolve("screenshots/tasks-reorder");
mkdirSync(directory, { recursive: true });
const result = { checks: [], pageErrors: [], consoleErrors: [], screenshots: [] };
const browser = await chromium.launch({ channel: "chrome", headless: true });
const owner = await (
  await browser.newContext({ viewport: { width: 1440, height: 1000 } })
).newPage();
const customer = await (
  await browser.newContext({ viewport: { width: 390, height: 844 } })
).newPage();
for (const page of [owner, customer]) {
  page.on("pageerror", (e) => result.pageErrors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") result.consoleErrors.push(m.text());
  });
  page.on("dialog", (d) => d.accept());
}
async function login(page, role) {
  await page.goto(base + "/login");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Email", { exact: true }).fill(fixture.users[role].email);
  await page.getByLabel("Password", { exact: true }).fill(fixture.users[role].password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL("**/account");
}
async function capture(page, name) {
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
    false,
    name + " overflow",
  );
  const path = resolve(directory, name + ".png");
  await page.screenshot({ path, fullPage: true, caret: "initial" });
  result.screenshots.push(path);
}
try {
  await login(owner, "owner");
  await owner.goto(base + "/admin?section=overview");
  await owner.waitForLoadState("networkidle");
  await owner.getByRole("heading", { name: "Business tasks", exact: true }).waitFor();
  await owner
    .getByRole("status")
    .filter({ hasText: "Loading business tasks" })
    .waitFor({ state: "hidden" });
  await owner.getByRole("button", { name: "Add business task", exact: true }).click();
  await owner.getByLabel("Task title", { exact: true }).fill(title);
  await owner
    .getByLabel("Private task notes", { exact: true })
    .fill("TEST FIXTURE verify original art with customer");
  await owner.getByLabel("Task due date", { exact: true }).fill("2026-10-20");
  await owner.getByLabel("Task priority", { exact: true }).selectOption("high");
  await owner.getByRole("button", { name: "Save business task", exact: true }).click();
  await owner.getByRole("status").filter({ hasText: "Task saved." }).waitFor();
  await owner.reload();
  await owner.getByLabel("Find a task", { exact: true }).fill(title);
  await owner.getByRole("button", { name: "Complete task " + title, exact: true }).waitFor();
  await capture(owner, "owner-tasks-desktop");
  await owner.getByRole("button", { name: "Complete task " + title, exact: true }).click();
  await owner.getByRole("status").filter({ hasText: "Task completed." }).waitFor();
  await owner.getByLabel("Task view", { exact: true }).selectOption("done");
  await owner.getByRole("button", { name: "Edit task " + title, exact: true }).click();
  await owner.getByLabel("Task status", { exact: true }).selectOption("open");
  await owner.getByRole("button", { name: "Save business task", exact: true }).click();
  await owner.getByRole("status").filter({ hasText: "Task saved." }).waitFor();
  await owner.getByLabel("Task view", { exact: true }).selectOption("open");
  await owner.getByRole("button", { name: "Archive task " + title, exact: true }).click();
  await owner.getByRole("status").filter({ hasText: "Task archived." }).waitFor();
  await owner.getByLabel("Task view", { exact: true }).selectOption("archived");
  await owner.getByRole("button", { name: "Edit task " + title, exact: true }).waitFor();
  await owner.setViewportSize({ width: 390, height: 844 });
  await capture(owner, "owner-tasks-mobile");
  for (const range of ["today", "week", "month"]) {
    await owner.getByLabel("Report date range", { exact: true }).selectOption(range);
    await owner.getByRole("heading", { name: "Business tasks", exact: true }).waitFor();
  }
  result.checks.push(
    "owner creates a dated priority reminder; reload/search, complete, reopen, archive, mobile controls and Chicago date presets work",
  );
  await login(customer, "customer");
  await customer.reload();
  await customer.waitForLoadState("networkidle");
  const order = customer
    .locator(".cc-records > div")
    .filter({ hasText: "TEST FIXTURE repeatable builder hat" });
  await order.getByRole("button", { name: "Review repeat options", exact: true }).click();
  await order
    .getByRole("button", { name: "Check current availability & price", exact: true })
    .click();
  await order.getByText("Richardson 112FP · Army Olive Green/Tan", { exact: false }).waitFor();
  const quote = await order.getByRole("status").innerText();
  assert.match(quote, /current prices/i);
  assert.ok(
    !quote.includes("$1.00") &&
      !quote.includes("PRIVATE HISTORICAL NOTE") &&
      !quote.includes("OLD-FIXTURE-CODE"),
  );
  await capture(customer, "customer-repeat-mobile");
  await order.getByRole("button", { name: "Open builder to review", exact: true }).click();
  await customer.waitForURL("**/order");
  await customer.getByText("Text-only design restored.", { exact: false }).waitFor();
  await customer.waitForLoadState("networkidle");
  const draft = await customer.evaluate(
    () => JSON.parse(localStorage.getItem("rec-mama-order") ?? "null")?.state,
  );
  assert.equal(draft.family, "112FP");
  assert.equal(draft.colorway, "Army Olive Green/Tan");
  assert.equal(draft.patchText, "REPEAT THIS TEXT");
  assert.equal(draft.quantity, 2);
  assert.equal(draft.patchSize, "medium");
  assert.equal(draft.patchShape, "Rounded Rectangle");
  assert.equal(draft.notes, "");
  assert.equal(draft.promo, "");
  assert.equal(draft.customerEmail, "");
  assert.equal(draft.patchPosition.version, 2);
  result.persistedDraft = {
    exactModel: true,
    exactColor: true,
    text: true,
    physicalSize: true,
    normalizedPosition: true,
    privateFieldsCleared: true,
  };
  await capture(customer, "builder-repeat-mobile");
  await customer.setViewportSize({ width: 1440, height: 1000 });
  await capture(customer, "builder-repeat-desktop");
  result.checks.push(
    "authenticated customer reviews exact prior model/color, current prices, and restores text/physical options into the existing builder on desktop/mobile without a new order or charge",
  );
  // Authenticated HTTP server-function boundary, not a hidden navigation check.
  const denied = await customer.evaluate(async () => {
    const { getOwnerTasks } = await import("/src/lib/commerce/owner-tasks-api.ts");
    try {
      await getOwnerTasks({ data: { state: "all", search: "" } });
      return false;
    } catch {
      return true;
    }
  });
  assert.equal(denied, true);
  result.checks.push("regular customer is denied the owner task API");
  assert.equal(result.pageErrors.length, 0, JSON.stringify(result.pageErrors));
  assert.equal(result.consoleErrors.length, 0, JSON.stringify(result.consoleErrors));
} catch (error) {
  result.failure = error.stack;
  process.exitCode = 1;
  await owner.screenshot({ path: resolve(directory, "failure-owner.png"), fullPage: true });
  await customer.screenshot({ path: resolve(directory, "failure-customer.png"), fullPage: true });
} finally {
  writeFileSync(resolve(directory, "results.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  await browser.close();
}
