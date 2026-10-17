// End-to-end estimates with disposable local accounts only. No provider credentials or email.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";
const base = process.argv[2] ?? "http://localhost:8080";
if (
  !["http://localhost:8080", "http://localhost:8081"].includes(base) ||
  process.env.DATABASE_URL ||
  process.env.STRIPE_SECRET_KEY ||
  process.env.PAYPAL_CLIENT_SECRET ||
  process.env.RESEND_API_KEY ||
  process.env.VERCEL
)
  throw Error("Quote QA refuses production, external databases and payment/email credentials.");
const built = base.endsWith(":8081");
const fixture = JSON.parse(
  readFileSync(
    built ? "artifacts/commerce-qa/built-session.json" : "artifacts/commerce-qa/session.json",
    "utf8",
  ),
);
const directory = resolve("screenshots/quotes" + (built ? "-built" : "")),
  artifact = resolve("artifacts/commerce-qa/quotes" + (built ? "-built" : ""));
mkdirSync(directory, { recursive: true });
mkdirSync(artifact, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: "chrome" });
const ownerContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const customerContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
const owner = await ownerContext.newPage(),
  customer = await customerContext.newPage();
const run = "QA-" + randomUUID().slice(0, 8),
  company = `TEST FIXTURE ${run}`,
  title = company + " team estimate";
const results = { run, base, checks: [], pageErrors: [], consoleErrors: [], screenshots: [] };
for (const page of [owner, customer]) {
  page.on("pageerror", (e) => results.pageErrors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") results.consoleErrors.push(m.text());
  });
  page.on("dialog", (dialog) => dialog.accept());
}
async function capture(page, name) {
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
    false,
    name + " has no document overflow",
  );
  const path = resolve(directory, name + ".png");
  await page.screenshot({ path, fullPage: true, caret: "initial" });
  results.screenshots.push(path);
}
async function login(page, role) {
  await page.goto(base + "/login");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Email", { exact: true }).fill(fixture.users[role].email);
  await page.getByLabel("Password", { exact: true }).fill(fixture.users[role].password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL("**/account");
  if (built && role === "owner" && process.env.QA_ACTIVATE_OWNER === "1") {
    await page.goto(fixture.ownerSetupUrl);
    await page.getByRole("button", { name: "Activate owner access", exact: true }).click();
    await page.waitForURL(/\/admin/);
  }
}
async function reviewOwner() {
  await owner.goto(base + "/admin?section=quotes");
  await owner.waitForLoadState("networkidle");
  await owner
    .getByRole("heading", { name: "Quotes & bulk requests", exact: true, level: 2 })
    .waitFor();
  await owner
    .getByRole("status")
    .filter({ hasText: "Loading estimates" })
    .waitFor({ state: "hidden" });
}
try {
  await customer.goto(base + "/quote-request");
  await customer.waitForLoadState("networkidle");
  await customer
    .getByLabel("Your name", { exact: true })
    .fill("TEST FIXTURE Estimate Buyer " + run);
  await customer.getByLabel("Email", { exact: true }).fill("estimate-fixture@example.invalid");
  await customer.getByLabel("Team or company (optional)", { exact: true }).fill(company);
  await customer.getByLabel("Estimated quantity", { exact: true }).fill("12");
  await customer
    .getByLabel("Project details", { exact: true })
    .fill(
      "TEST FIXTURE — Richardson 112 Black hats, 3 × 2 inch laser-cut leatherette. Confirm exact model and artwork before production.",
    );
  await customer.getByRole("checkbox").check();
  await capture(customer, "request-mobile");
  await customer.getByRole("button", { name: "Request an estimate", exact: true }).click();
  await customer.getByRole("status").filter({ hasText: "Your request is saved" }).waitFor();
  results.checks.push(
    "customer submits a consented bulk request without order, charge or outbound email",
  );
  await login(owner, "owner");
  await reviewOwner();
  await owner
    .getByRole("row")
    .filter({ hasText: company })
    .getByRole("button", { name: "Prepare estimate", exact: true })
    .click();
  await owner.getByLabel("Estimate title", { exact: true }).fill(title);
  await owner
    .getByLabel("Line 1 title", { exact: true })
    .fill("TEST FIXTURE Richardson 112 Black / 3 × 2 leatherette");
  await owner.getByLabel("Unit price ($)", { exact: true }).fill("30");
  await owner.getByRole("button", { name: "Add item or fee", exact: true }).click();
  await owner.getByLabel("Line 2 title", { exact: true }).fill("TEST FIXTURE artwork setup");
  await owner.getByLabel("Line type", { exact: true }).nth(1).selectOption("setup");
  await owner.getByLabel("Unit price ($)", { exact: true }).nth(1).fill("15");
  await owner.getByLabel("Shipping ($)", { exact: true }).fill("12");
  await owner.getByLabel("Tax ($)", { exact: true }).fill("1.23");
  await owner
    .getByLabel("Private shop notes", { exact: true })
    .fill("PRIVATE TEST FIXTURE production note — never customer-visible");
  await owner.getByRole("checkbox", { name: /I reviewed exact products/ }).check();
  await owner.getByRole("checkbox", { name: /Shipping, tax, quantities/ }).check();
  await owner.getByRole("button", { name: "Save private draft", exact: true }).click();
  await owner.getByRole("status").filter({ hasText: "Draft estimate saved" }).waitFor();
  const saved = owner.getByRole("row").filter({ hasText: title });
  assert.match(await saved.innerText(), /\$388\.23/);
  assert.match(await saved.innerText(), /Draft/);
  await owner.getByLabel("Estimate title", { exact: true }).fill(title + " unsaved");
  assert.equal(
    await owner
      .getByRole("button", { name: "Create private review link", exact: true })
      .isDisabled(),
    true,
  );
  await owner.getByLabel("Estimate title", { exact: true }).fill(title);
  await owner.getByRole("button", { name: "Customer preview", exact: true }).click();
  await owner.getByRole("heading", { name: title, exact: true }).waitFor();
  assert.equal(
    await owner.getByText("PRIVATE TEST FIXTURE production note", { exact: false }).count(),
    0,
  );
  await capture(owner, "owner-preview-desktop");
  await owner.setViewportSize({ width: 390, height: 844 });
  await capture(owner, "owner-preview-mobile");
  await owner.setViewportSize({ width: 1440, height: 1000 });
  results.checks.push(
    "owner creates multiline quote with setup fee, reviewed shipping/tax and private notes, previews on desktop/mobile, and cannot issue unsaved edits",
  );
  await owner.getByRole("button", { name: "Create private review link", exact: true }).click();
  await owner.getByRole("status").filter({ hasText: "Private review link created" }).waitFor();
  const reviewUrl = await owner.getByLabel("Review link", { exact: true }).inputValue();
  assert.equal(new URL(reviewUrl).origin, base);
  const response = await customer.goto(reviewUrl);
  await customer.waitForLoadState("networkidle");
  await customer.getByRole("heading", { name: "Your private estimate", exact: true }).waitFor();
  assert.match(await customer.locator('meta[name="robots"]').getAttribute("content"), /noindex/);
  const visible = await customer.locator("body").innerText();
  assert.ok(!visible.includes("PRIVATE TEST FIXTURE production note"));
  assert.ok(!visible.includes("estimate-fixture@example.invalid"));
  assert.ok(visible.includes("$388.23"));
  results.privateResponseHeaders = {
    cacheControl: response.headers()["cache-control"] ?? null,
    referrerPolicy: response.headers()["referrer-policy"] ?? null,
  };
  assert.match(results.privateResponseHeaders.cacheControl, /private/);
  assert.match(results.privateResponseHeaders.cacheControl, /no-store/);
  assert.equal(results.privateResponseHeaders.referrerPolicy, "no-referrer");
  await capture(customer, "customer-review-mobile");
  await customer.setViewportSize({ width: 1440, height: 1000 });
  await capture(customer, "customer-review-desktop");
  await customer.setViewportSize({ width: 390, height: 844 });
  await customer.getByRole("checkbox").check();
  await customer.getByRole("button", { name: "Accept estimate", exact: true }).click();
  await customer.getByRole("status").filter({ hasText: "Estimate accepted" }).waitFor();
  await customer.reload();
  await customer.getByRole("status").filter({ hasText: "Estimate accepted" }).waitFor();
  await capture(customer, "customer-accepted-mobile");
  await reviewOwner();
  assert.match(await owner.getByRole("row").filter({ hasText: title }).innerText(), /Accepted/);
  await owner
    .getByRole("row")
    .filter({ hasText: title })
    .getByRole("button", { name: "Review", exact: true })
    .click();
  await owner
    .getByRole("button", { name: "Open accepted order & invoice actions", exact: true })
    .click();
  await owner.getByRole("heading", { name: "Financial summary", exact: true }).waitFor();
  const orderId = new URL(owner.url()).searchParams.get("orderId");
  assert.ok(orderId);
  results.orderId = orderId;
  await owner.getByText("TEST FIXTURE artwork setup", { exact: true }).waitFor();
  assert.match(await owner.locator("body").innerText(), /Unpaid/);
  await capture(owner, "accepted-existing-order-desktop");
  results.checks.push(
    "customer accepts exact private estimate and refreshes; owner opens one existing unpaid order with both immutable lines and existing invoice actions",
  );
  await reviewOwner();
  await owner
    .getByRole("row")
    .filter({ hasText: title })
    .getByRole("button", { name: "Review", exact: true })
    .click();
  await owner
    .getByRole("button", { name: "Open accepted order & invoice actions", exact: true })
    .click();
  await owner.getByRole("heading", { name: "Financial summary", exact: true }).waitFor();
  assert.equal(new URL(owner.url()).searchParams.get("orderId"), orderId);
  await reviewOwner();
  await owner.setViewportSize({ width: 390, height: 844 });
  await capture(owner, "quote-list-mobile");
  assert.equal(results.pageErrors.length, 0, JSON.stringify(results.pageErrors));
  assert.equal(results.consoleErrors.length, 0, JSON.stringify(results.consoleErrors));
  writeFileSync(resolve(artifact, "results.json"), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
} catch (error) {
  results.failure = error.stack;
  results.customerAlerts = await customer.getByRole("alert").allTextContents();
  results.ownerAlerts = await owner.getByRole("alert").allTextContents();
  await customer.screenshot({
    path: resolve(directory, "failure-customer.png"),
    fullPage: true,
    caret: "initial",
  });
  await owner.screenshot({
    path: resolve(directory, "failure-owner.png"),
    fullPage: true,
    caret: "initial",
  });
  console.log(JSON.stringify(results, null, 2));
  process.exitCode = 1;
} finally {
  writeFileSync(resolve(artifact, "last-run.json"), JSON.stringify(results, null, 2));
  await browser.close();
}
