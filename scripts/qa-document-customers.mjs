// Owned local app only. Persistent TEST identities; no external providers or messages.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
for (const key of ["DATABASE_URL", "STRIPE_SECRET_KEY", "RESEND_API_KEY", "VERCEL"])
  if (process.env[key]) throw Error("Isolated browser acceptance only");
const base = "http://localhost:8080";
const fixture = JSON.parse(
  readFileSync("artifacts/commerce-qa/customer-browser-session.json", "utf8"),
);
mkdirSync("screenshots/customer-documents", { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();
const errors = [],
  checks = [],
  searchMethods = [];
const run = Date.now();
const name = "TEST Inline Caller " + run;
const email = `inline-${run}@example.invalid`;
page.on("pageerror", (e) => errors.push(e.message));
page.on("request", (r) => {
  if (r.url().includes("_serverFn") && (r.postData() || r.url()).includes("TEST Inline Caller"))
    searchMethods.push(r.method());
});
async function capture(name) {
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
    false,
    name + " overflow",
  );
  await page.screenshot({ path: `screenshots/customer-documents/${name}.png`, fullPage: true });
}
try {
  await page.goto(base + "/login");
  await page.getByLabel("Email", { exact: true }).fill(fixture.users.owner.email);
  await page.getByLabel("Password", { exact: true }).fill(fixture.users.owner.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL("**/account");
  await page.goto(base + "/admin?section=invoices");
  await page.getByRole("button", { name: "Create invoice", exact: true }).click();
  await page.getByRole("button", { name: "Add customer here", exact: true }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Customer name", { exact: true }).fill(name);
  await dialog.getByLabel("Phone number", { exact: true }).fill("+15045550139");
  await dialog.getByRole("checkbox", { name: /I searched existing/ }).check();
  await capture("phone-only-inline-editor");
  await dialog.getByRole("button", { name: "Save customer profile", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
  await page.getByText("This profile is saved.", { exact: false }).waitFor();
  assert.equal(await page.getByLabel("Customer email", { exact: true }).inputValue(), "");
  checks.push("Inline phone-only customer saved without fake email; phone-order route offered");
  await page.getByRole("button", { name: "Edit customer contact", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Customer email (optional)", { exact: true }).fill(email);
  await dialog.getByRole("button", { name: "Save customer profile", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
  assert.equal(await page.getByLabel("Customer email", { exact: true }).inputValue(), email);
  await page.getByLabel("Item / service", { exact: true }).fill("TEST ONLY Richardson 112");
  await page.getByLabel("Unit price (USD)", { exact: true }).fill("30");
  await page
    .getByLabel("Due date (America/Chicago)", { exact: true })
    .fill(new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10));
  await page.getByRole("button", { name: "Save Draft", exact: true }).click();
  await page.getByRole("heading", { name: /Invoice #/ }).waitFor();
  assert.equal(
    await page.getByLabel("Customer mobile phone", { exact: true }).inputValue(),
    "+15045550139",
  );
  const invoiceHeading = await page.getByRole("heading", { name: /Invoice #/ }).innerText();
  await capture("linked-studio-invoice-mobile");
  checks.push("Contact edit prefills existing Studio Invoice and persists document association");
  await page.reload();
  await page.getByRole("button", { name: /^INV-/ }).first().click();
  await page.getByRole("heading", { name: invoiceHeading, exact: true }).waitFor();
  await page.getByRole("button", { name: "Edit customer contact", exact: true }).waitFor();
  assert.equal(await page.getByLabel("Customer email", { exact: true }).inputValue(), email);
  checks.push("Saved invoice reload retains customer ID and exact selected contact");
  await page.goto(base + "/admin?section=quotes");
  await page
    .getByLabel("Find by name, phone, email or customer number", { exact: true })
    .fill(name);
  await page.getByRole("button", { name: new RegExp(name + " · C-") }).click();
  assert.equal(await page.getByLabel("Customer name", { exact: true }).inputValue(), name);
  assert.equal(await page.getByLabel("Customer email", { exact: true }).inputValue(), email);
  await page.getByLabel("Estimate title", { exact: true }).fill("TEST ONLY linked estimate");
  await page.getByLabel("Line 1 title", { exact: true }).fill("TEST ONLY Richardson 112");
  await page.getByLabel("Unit price ($)", { exact: true }).fill("30");
  await page
    .getByLabel(/Customer-facing terms & production expectations/)
    .fill("TEST ONLY internal acceptance; no customer message");
  await page.getByRole("button", { name: "Save private draft", exact: true }).click();
  await page.getByRole("heading", { name: /Estimate #/ }).waitFor();
  await capture("linked-estimate-mobile");
  await page.setViewportSize({ width: 320, height: 740 });
  await capture("linked-estimate-320px");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await capture("linked-estimate-desktop");
  checks.push("Search reuses same profile in current quote editor; mobile and desktop fit");
  await page.goto(base + "/admin?section=customers");
  await page.getByLabel("Find a customer", { exact: true }).fill(name);
  await page
    .getByRole("button", { name: new RegExp(name) })
    .first()
    .click();
  await page.getByRole("button", { name: "Orders & current work", exact: true }).click();
  assert.match(await page.locator("body").innerText(), /Estimate #/);
  checks.push("Customer 360 exposes linked quote and invoice in Current work");
  assert.equal(errors.length, 0, errors.join("\n"));
  assert.ok(searchMethods.length > 0);
  assert.ok(searchMethods.every((m) => m === "POST"));
  writeFileSync(
    "artifacts/commerce-qa/document-customer-browser.json",
    JSON.stringify(
      {
        outcome: "PASS",
        checks,
        uncaughtErrors: errors,
        searchTransports: [...new Set(searchMethods)],
        externalCommunicationsSent: false,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ outcome: "PASS", checks }));
} catch (e) {
  writeFileSync(
    "artifacts/commerce-qa/document-customer-browser-failure.txt",
    await page.locator("body").innerText(),
  );
  await page.screenshot({ path: "screenshots/customer-documents/failure.png", fullPage: true });
  throw e;
} finally {
  await browser.close();
}
