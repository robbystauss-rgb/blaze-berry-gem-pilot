// Browser smoke of the actual production bundle; no provider fixtures are injected.
import { chromium } from "playwright";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import assert from "node:assert/strict";
for (const k of ["DATABASE_URL", "STRIPE_SECRET_KEY", "RESEND_API_KEY"])
  if (process.env[k]) throw Error("Built QA refuses provider credentials and persistent databases");
const base = "http://localhost:8081",
  fixture = JSON.parse(readFileSync("artifacts/commerce-qa/built-session.json", "utf8")),
  browser = await chromium.launch({ channel: "chrome", headless: true });
const owner = await browser.newContext({ viewport: { width: 1440, height: 1000 } }),
  customer = await browser.newContext({ viewport: { width: 390, height: 844 } }),
  page = await owner.newPage(),
  buyer = await customer.newPage();
const result = { checks: [], errors: [] };
for (const p of [page, buyer]) {
  p.on("pageerror", (e) => result.errors.push(e.message));
  p.on("dialog", (d) => d.accept());
}
mkdirSync("screenshots/studio-built", { recursive: true });
async function status(p, text) {
  await p.getByRole("status").filter({ hasText: text }).last().waitFor();
}
async function snapshot(p, name) {
  await p.evaluate(() => window.scrollTo(0, 0));
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await p.screenshot({ path: `screenshots/studio-built/${name}.png`, fullPage: true });
}
try {
  await page.goto(base + "/login");
  await page.getByLabel("Email", { exact: true }).fill(fixture.users.owner.email);
  await page.getByLabel("Password", { exact: true }).fill(fixture.users.owner.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL("**/account", { waitUntil: "commit" });
  await page.goto(fixture.ownerSetupUrl);
  await page.getByRole("button", { name: "Activate owner access", exact: true }).click();
  await page.waitForURL(/\/admin(?:\?|$)/);
  await page.goto(base + "/admin?section=invoices");
  await page.getByLabel("Customer name", { exact: true }).fill("BUILT TEST CUSTOMER");
  await page.getByLabel("Customer email", { exact: true }).fill(fixture.users.customer.email);
  await page
    .getByLabel("Due date (America/Chicago)", { exact: true })
    .fill(new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10));
  await page.getByLabel("Item / service", { exact: true }).fill("BUILT TEST loose patch");
  await page.getByLabel("Unit price (USD)", { exact: true }).fill("12");
  await page.getByLabel("This order requires separate artwork", { exact: false }).check();
  await page.getByLabel("I reviewed the complete price", { exact: false }).check();
  await page.getByLabel("I confirmed availability", { exact: false }).check();
  await page.getByRole("button", { name: "Save Draft", exact: true }).click();
  await status(page, "Draft saved");
  await page.getByRole("button", { name: "Issue Invoice", exact: true }).click();
  await status(page, "Document issued");
  const invoice = await page.getByLabel("Private customer link", { exact: true }).inputValue();
  await page.getByRole("button", { name: "Prepare Stripe payment", exact: true }).click();
  await page
    .getByRole("alert")
    .filter({ hasText: /Stripe is not configured|Confirm REC Mama Made/ })
    .waitFor();
  result.checks.push(
    "Built owner authentication, draft persistence, issue and missing-provider fail-closed behavior",
  );
  const response = await buyer.goto(invoice);
  assert.match(response.headers()["cache-control"], /no-store/);
  assert.equal(response.headers()["referrer-policy"], "no-referrer");
  assert.match(response.headers()["x-robots-tag"], /noindex/);
  await buyer.getByRole("heading", { name: "INVOICE", exact: true }).waitFor();
  assert.equal(
    await buyer.getByRole("button", { name: "Pay Invoice securely", exact: true }).count(),
    0,
  );
  assert.equal(await buyer.getByRole("button", { name: "Approve Proof", exact: true }).count(), 0);
  const download = await customer.request.get(
    base + (await buyer.getByRole("link", { name: "Download Invoice PDF" }).getAttribute("href")),
  );
  assert.equal(download.status(), 200);
  assert.equal(download.headers()["content-type"], "application/pdf");
  writeFileSync("artifacts/studio/built-invoice.pdf", await download.body());
  await snapshot(buyer, "customer-invoice-mobile");
  result.checks.push(
    "Built private HTML security headers and Letter PDF on mobile; no false payment or proof actions",
  );
  await page.goto(base + "/admin?section=proofs");
  await page
    .getByLabel("Order (required)")
    .selectOption({ label: "#1 · BUILT TEST CUSTOMER · new" });
  await page.getByLabel("Proof title", { exact: true }).fill("BUILT TEST separate proof");
  await page
    .getByLabel("Link expiration (your local time)")
    .fill(new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 16));
  await page
    .getByLabel("Upload actual proof images", { exact: false })
    .setInputFiles("public/brand/rec-mama-made-app-logo.jpg");
  await page.locator(".studio-owner-thumbnails img").waitFor();
  await page.getByRole("button", { name: "Save Draft", exact: true }).click();
  await status(page, "Draft saved");
  await page.getByRole("button", { name: "Issue Proof", exact: true }).click();
  await status(page, "Document issued");
  const proof = await page.getByLabel("Private customer link", { exact: true }).inputValue();
  await buyer.goto(proof);
  await buyer.getByRole("heading", { name: "DESIGN PROOF", exact: true }).waitFor();
  await buyer.getByLabel("Your name", { exact: true }).fill("BUILT TEST CUSTOMER");
  await buyer.getByLabel("Customer email", { exact: true }).fill(fixture.users.customer.email);
  await buyer.getByLabel("I reviewed this exact version", { exact: false }).check();
  await buyer.getByRole("button", { name: "Approve Proof", exact: true }).click();
  await buyer.locator(".studio-status").filter({ hasText: "Approved" }).waitFor();
  const proofPdf = await customer.request.get(
    base +
      (await buyer.getByRole("link", { name: "Download Design Proof PDF" }).getAttribute("href")),
  );
  assert.equal(proofPdf.status(), 200);
  writeFileSync("artifacts/studio/built-proof.pdf", await proofPdf.body());
  await snapshot(buyer, "approved-proof-mobile");
  result.checks.push(
    "Built private image upload, independent proof issue, customer approval and separate PDF",
  );
  await page.getByRole("link", { name: /Open order / }).click();
  await page.getByLabel("Workflow stage", { exact: true }).selectOption("engraving");
  await page.getByRole("button", { name: "Update order", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "Full verified payment" }).waitFor();
  await snapshot(page, "approved-unpaid-hold-desktop");
  result.checks.push("Actual production bundle refuses production for approved but unpaid order");
  assert.equal(result.errors.length, 0, JSON.stringify(result.errors));
  result.outcome = "PASS";
} catch (e) {
  result.outcome = "FAIL";
  result.failure = e.stack;
  await page
    .screenshot({ path: "screenshots/studio-built/failure-owner.png", fullPage: true })
    .catch(() => {});
  console.error(e);
  process.exitCode = 1;
} finally {
  writeFileSync("artifacts/studio/built-browser-results.json", JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  await browser.close();
}
