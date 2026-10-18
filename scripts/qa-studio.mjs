// Full browser -> server function -> local database -> response acceptance test.
// Stripe and Resend are fixture transports in studio-qa-server.mjs, never live services.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
const base = "http://localhost:8080",
  fixture = JSON.parse(readFileSync("artifacts/studio/browser-session.json", "utf8"));
for (const k of ["DATABASE_URL", "STRIPE_SECRET_KEY", "RESEND_API_KEY"])
  if (process.env[k]) throw Error("QA refuses real credentials");
mkdirSync("screenshots/studio", { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const owner = await browser.newContext({ viewport: { width: 1440, height: 1000 } }),
  customer = await browser.newContext({ viewport: { width: 1280, height: 1000 } }),
  page = await owner.newPage(),
  buyer = await customer.newPage();
const result = { checks: [], errors: [], screenshots: [] };
let saveRequest;
page.on("request", (r) => {
  if (
    r.method() === "POST" &&
    r.postData()?.includes("TEST Richardson 112 custom hats") &&
    r.postData()?.includes("lines")
  ) {
    saveRequest = {
      url: r.url(),
      body: r.postData(),
      headers: Object.fromEntries(
        Object.entries(r.headers()).filter(([k]) =>
          ["content-type", "origin", "x-tsr-serverfn"].includes(k),
        ),
      ),
    };
  }
});
for (const p of [page, buyer]) {
  p.on("pageerror", (e) => result.errors.push(e.message));
  p.on("dialog", (d) => d.accept());
}
const check = (s) => {
  result.checks.push(s);
  console.log("PASS:", s);
};
async function screenshot(p, name) {
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.screenshot({ path: `screenshots/studio/${name}.png`, fullPage: true });
  assert.ok(
    await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
    name + " horizontal overflow",
  );
  result.screenshots.push(name);
}
async function status(p, text) {
  await p.getByRole("status").filter({ hasText: text }).last().waitFor();
}
async function state() {
  const r = await fetch(base + "/__studio-fixture");
  if (!r.ok) throw Error(await r.text());
  return r.json();
}
async function section(s) {
  await page.goto(base + "/admin?section=" + s);
  await page
    .getByRole("heading", {
      name: s === "invoices" ? "Signature Studio Invoices" : "Design Proofs",
      exact: true,
      level: 2,
    })
    .waitFor();
}
async function issue(kind) {
  await page.getByRole("button", { name: "Issue " + kind, exact: true }).click();
  await status(page, "Document issued");
  return new URL(await page.getByLabel("Private customer link", { exact: true }).inputValue());
}
async function email(kind) {
  await page.getByRole("button", { name: "Send separate " + kind + " email", exact: true }).click();
  await status(page, "Email accepted");
}
async function fillProofDate() {
  await page
    .getByLabel("Link expiration (your local time)")
    .fill(new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 16));
}
async function editStage(orderId, stage, expected) {
  await page.goto(base + "/admin?section=orders&orderId=" + orderId);
  await page.getByLabel("Workflow stage", { exact: true }).selectOption(stage);
  await page.getByRole("button", { name: "Update order", exact: true }).click();
  if (expected) await page.getByRole("alert").filter({ hasText: expected }).waitFor();
  else await status(page, "Order updated.");
}
try {
  await page.goto(base + "/login");
  await page.getByLabel("Email", { exact: true }).fill(fixture.users.owner.email);
  await page.getByLabel("Password", { exact: true }).fill(fixture.users.owner.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL("**/account", { waitUntil: "commit" });
  await section("invoices");
  await page.getByLabel("Customer name", { exact: true }).fill("BROWSER TEST CUSTOMER");
  await page.getByLabel("Customer email", { exact: true }).fill("studio-customer@example.invalid");
  await page
    .getByLabel("Due date (America/Chicago)", { exact: true })
    .fill(new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10));
  await page.getByLabel("Item / service", { exact: true }).fill("TEST Richardson 112 custom hats");
  await page.getByLabel("Quantity", { exact: true }).fill("2");
  await page.getByLabel("Unit price (USD)", { exact: true }).fill("30");
  await page
    .getByLabel("Customization description", { exact: true })
    .fill("3 x 2 inch laser-cut leatherette patch; original artwork separate");
  await page.getByRole("button", { name: "Add line item", exact: true }).click();
  await page.getByLabel("Item / service", { exact: true }).nth(1).fill("TEST setup");
  await page.getByLabel("Unit price (USD)", { exact: true }).nth(1).fill("10");
  await page.getByLabel("I reviewed the complete price", { exact: false }).check();
  await page.getByLabel("I confirmed availability", { exact: false }).check();
  await page.getByRole("button", { name: "Save Draft", exact: true }).click();
  await status(page, "Draft saved");
  await screenshot(page, "owner-invoice-draft-desktop");
  const preview = await owner.newPage();
  await preview.goto(
    base +
      (await page.getByRole("link", { name: "Preview customer document" }).getAttribute("href")),
  );
  await preview.getByRole("heading", { name: "INVOICE", exact: true }).waitFor();
  assert.equal(
    await preview.getByRole("button", { name: "Approve Proof", exact: true }).count(),
    0,
  );
  await screenshot(preview, "owner-invoice-preview");
  await preview.close();
  const invoiceUrl = await issue("Invoice");
  await page.getByRole("button", { name: "Prepare Stripe payment", exact: true }).click();
  await status(page, "Provider payment link prepared");
  await email("invoice");
  await page.getByRole("button", { name: "Check provider delivery", exact: true }).click();
  await status(page, "Delivery status refreshed");
  check(
    "Owner creates, previews, issues and captured-sends two-line invoice with PDF; verified fixture delivery status",
  );
  const doc = (await state()).documents.filter((x) => x.kind === "invoice").at(-1),
    orderId = doc.order_id;
  assert.ok(orderId);
  const initialResponse = await buyer.goto(invoiceUrl.href);
  assert.match(initialResponse.headers()["cache-control"], /no-store/);
  assert.equal(initialResponse.headers()["referrer-policy"], "no-referrer");
  await buyer.getByRole("heading", { name: "INVOICE", exact: true }).waitFor();
  assert.equal(await buyer.getByRole("button", { name: "Approve Proof", exact: true }).count(), 0);
  await screenshot(buyer, "customer-invoice-desktop");
  await buyer.setViewportSize({ width: 390, height: 844 });
  await screenshot(buyer, "customer-invoice-mobile");
  const pdfLink = await buyer
    .getByRole("link", { name: "Download Invoice PDF" })
    .getAttribute("href");
  const pdf = await customer.request.get(base + pdfLink);
  assert.equal(pdf.status(), 200);
  assert.equal(pdf.headers()["content-type"], "application/pdf");
  writeFileSync("artifacts/studio/browser-invoice.pdf", await pdf.body());
  check("Private invoice on desktop/mobile, no proof UI, valid PDF and private response headers");
  await section("proofs");
  await page.getByLabel("Order (required)").selectOption(orderId);
  await page.getByLabel("Proof title", { exact: true }).fill("TEST 112 laser-cut patch proof");
  await fillProofDate();
  await page
    .getByLabel("Upload actual proof images", { exact: false })
    .setInputFiles("public/brand/rec-mama-made-app-logo.jpg");
  await page.locator(".studio-owner-thumbnails img").waitFor();
  await page.getByRole("button", { name: "Add design detail", exact: true }).click();
  await page.getByLabel("Specification label", { exact: true }).fill("Physical patch size");
  await page
    .getByLabel("Value / physical dimensions", { exact: true })
    .fill("3 x 2 inches, rounded rectangle, laser-cut leatherette");
  await page
    .getByLabel("Customer-visible proof notes", { exact: true })
    .fill("TEST ONLY. No real production.");
  await page.getByRole("button", { name: "Save Draft", exact: true }).click();
  await status(page, "Draft saved");
  await screenshot(page, "owner-proof-editor-desktop");
  const proofUrl = await issue("Proof");
  await email("proof");
  check(
    "Owner uploads private proof image, records physical details, issues and separately sends proof v1",
  );
  // Browser follows the real Pay action; only the external Stripe page is intercepted.
  await buyer.route("https://invoice.stripe.com/fixture/*", async (route) => {
    const invoiceId = route.request().url().split("/").at(-1);
    await route.fulfill({
      contentType: "text/html",
      body: `<h1>ISOLATED STRIPE TRANSPORT FIXTURE</h1><p>No real charge</p><button id="pay">Complete fixture payment</button><script>document.querySelector('#pay').onclick=()=>location.href='${base}/invoice/${invoiceUrl.pathname.split("/").at(-1)}#fixture-paid=${invoiceId}'</script>`,
    });
  });
  await buyer.getByRole("button", { name: "Pay Invoice securely", exact: true }).click();
  await buyer.getByRole("heading", { name: "ISOLATED STRIPE TRANSPORT FIXTURE" }).waitFor();
  const invoiceId = buyer.url().split("/").at(-1);
  assert.equal((await state()).orders.find((o) => o.id === orderId).paid, 0);
  await buyer.getByRole("button", { name: "Complete fixture payment" }).click();
  await buyer.waitForURL("**/invoice/**");
  const reconciliation = await fetch(base + "/__studio-fixture", {
    method: "POST",
    body: JSON.stringify({ invoiceId }),
  });
  assert.equal(reconciliation.status, 200, await reconciliation.text());
  await buyer.getByRole("button", { name: "Refresh payment status", exact: true }).click();
  await buyer.locator(".studio-status").filter({ hasText: "Paid" }).waitFor();
  assert.equal((await state()).orders.find((o) => o.id === orderId).paid, 7000);
  assert.equal(
    (await state()).documents.find((d) => d.kind === "proof").state,
    "awaiting_approval",
  );
  check(
    "Pay action uses current provider obligation; signed webhook updates payment once without artwork approval (fixture transport, no external charge)",
  );
  await editStage(orderId, "engraving", "Artwork Approval Hold");
  await screenshot(page, "paid-artwork-hold");
  await buyer.goto(proofUrl.href);
  await buyer.getByRole("heading", { name: "DESIGN PROOF", exact: true }).waitFor();
  await buyer.getByRole("img", { name: /Design proof version/ }).waitFor();
  assert.equal(
    await buyer.getByRole("button", { name: "Pay Invoice securely", exact: true }).count(),
    0,
  );
  await screenshot(buyer, "customer-proof-mobile");
  await buyer.getByLabel("Your name", { exact: true }).fill("TEST CUSTOMER");
  await buyer.getByLabel("Customer email", { exact: true }).fill("studio-customer@example.invalid");
  await buyer
    .getByLabel("Changes requested / message", { exact: true })
    .fill("Move the patch slightly lower.");
  await buyer.getByLabel("I reviewed this exact version", { exact: false }).check();
  await buyer.getByRole("button", { name: "Request Changes", exact: true }).click();
  await buyer.locator(".studio-status").filter({ hasText: "Changes Requested" }).waitFor();
  check("Customer requests revisions from separate mobile proof, independent of paid invoice");
  await section("proofs");
  await page
    .getByRole("button", { name: /^P-\d+/ })
    .first()
    .click();
  await page.getByRole("button", { name: "Create revised version", exact: true }).click();
  await fillProofDate();
  await page.getByRole("button", { name: "Save Draft", exact: true }).click();
  await status(page, "Draft saved");
  const revised = await issue("Proof");
  await buyer.goto(proofUrl.href);
  await buyer.getByRole("heading", { name: "Private document unavailable" }).waitFor();
  await buyer.goto(revised.href);
  await buyer.getByLabel("Your name", { exact: true }).fill("TEST CUSTOMER");
  await buyer.getByLabel("Customer email", { exact: true }).fill("studio-customer@example.invalid");
  await buyer.getByLabel("I reviewed this exact version", { exact: false }).check();
  await buyer.getByRole("button", { name: "Approve Proof", exact: true }).click();
  await buyer.locator(".studio-status").filter({ hasText: "Approved" }).waitFor();
  assert.equal((await state()).orders.find((o) => o.id === orderId).paid, 7000);
  await screenshot(buyer, "customer-proof-v2-approved-mobile");
  const proofPdf = await customer.request.get(
    base +
      (await buyer.getByRole("link", { name: "Download Design Proof PDF" }).getAttribute("href")),
  );
  assert.equal(proofPdf.status(), 200);
  writeFileSync("artifacts/studio/browser-proof.pdf", await proofPdf.body());
  await buyer.setViewportSize({ width: 1280, height: 1000 });
  await screenshot(buyer, "customer-proof-v2-approved-desktop");
  check(
    "New proof version revokes old capability; exact v2 approval recorded without changing payment; separate valid PDF",
  );
  await editStage(orderId, "engraving");
  assert.equal((await state()).orders.find((o) => o.id === orderId).stage, "engraving");
  await screenshot(page, "paid-and-approved-production");
  check("Server blocks paid/unapproved production, then releases only paid/current-approved order");
  await section("invoices");
  await page.setViewportSize({ width: 390, height: 844 });
  await screenshot(page, "owner-invoice-mobile");
  await section("proofs");
  await screenshot(page, "owner-proof-mobile");
  // Owner files and workspace stay unavailable to a regular signed-in customer.
  const denied = await customer.request.get(base + `/api/studio-file/${doc.id}`);
  assert.equal(denied.status(), 404);
  const customerLogin = await customer.request.post(base + "/api/auth/sign-in/email", {
    headers: { Origin: base },
    data: { email: fixture.users.customer.email, password: fixture.users.customer.password },
  });
  assert.equal(
    customerLogin.status(),
    200,
    "Real customer session for negative authorization test",
  );
  await buyer.goto(base + "/admin?section=invoices");
  await buyer.getByRole("heading", { name: "Merchant access required", exact: true }).waitFor();
  assert.equal((await customer.request.get(base + `/api/studio-file/${doc.id}`)).status(), 404);
  check(
    "Anonymous and customer private-file requests denied; customer cannot access owner documents",
  );
  assert.ok(saveRequest, "Captured real owner save request");
  const replayBody = JSON.parse(saveRequest.body);
  if (replayBody.context) replayBody.context = {};
  const replay = await customer.request.post(saveRequest.url, {
    headers: saveRequest.headers,
    data: JSON.stringify(replayBody),
  });
  assert.match(await replay.text(), /Access denied|Unauthorized|permission|Forbidden/i);
  check("Customer replay of a real owner invoice mutation is denied by the server");
  const final = await state();
  const documents = final.emails.filter((e) => /\/(invoice|design-proof)\//.test(e.text));
  assert.equal(documents.length, 2);
  assert.ok(documents[0].text.includes("/invoice/"));
  assert.ok(documents[1].text.includes("/design-proof/"));
  assert.equal(result.errors.length, 0, JSON.stringify(result.errors));
  result.providerMode = "isolated fixtures, actual Stripe/Resend delivery unverified";
  result.outcome = "PASS";
} catch (e) {
  result.outcome = "FAIL";
  result.failure = e.stack;
  await page
    .screenshot({ path: "screenshots/studio/failure-owner.png", fullPage: true })
    .catch(() => {});
  await buyer
    .screenshot({ path: "screenshots/studio/failure-customer.png", fullPage: true })
    .catch(() => {});
  console.error(e);
  process.exitCode = 1;
} finally {
  writeFileSync("artifacts/studio/browser-results.json", JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  await browser.close();
}
