// Actual browser -> authenticated server functions -> durable local test DB.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import sharp from "sharp";
if (process.env.DATABASE_URL || process.env.STRIPE_SECRET_KEY || process.env.RESEND_API_KEY)
  throw Error("No real provider credentials are allowed in browser QA.");
const base = "http://localhost:8080",
  fixture = JSON.parse(readFileSync("artifacts/commerce-qa/customer-browser-session.json", "utf8"));
mkdirSync("screenshots/customer-vault", { recursive: true });
const artwork = await sharp(
  Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600"><circle cx="450" cy="300" r="240" fill="none" stroke="black" stroke-width="20"/><text x="450" y="320" text-anchor="middle" font-size="90" font-family="sans-serif">REC TEST</text></svg>',
  ),
)
  .png()
  .toBuffer();
const artworkPath = "artifacts/commerce-qa/TEST-ONLY-original-logo.png";
writeFileSync(artworkPath, artwork);
const browser = await chromium.launch({ headless: true, channel: "chrome" });
let context = await browser.newContext({ viewport: { width: 390, height: 844 } }),
  page = await context.newPage();
const errors = [],
  checks = [];
let assetUrl = "";
function watch(p) {
  p.on("pageerror", (e) => errors.push(e.message));
  p.on("request", (r) => {
    if (r.url().includes("/api/customer-artwork/")) assetUrl = r.url().split("?")[0];
  });
  p.on("dialog", (d) => d.accept());
}
watch(page);
async function login(role) {
  await page.goto(base + "/login");
  await page.getByLabel("Email", { exact: true }).fill(fixture.users[role].email);
  await page.getByLabel("Password", { exact: true }).fill(fixture.users[role].password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL("**/account");
}
async function capture(name) {
  await page.evaluate(() => window.scrollTo(0, 0));
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
    false,
    name + " overflow",
  );
  await page.screenshot({ path: `screenshots/customer-vault/${name}.png`, fullPage: true });
}
try {
  await login("owner");
  await page.goto(base + "/admin?section=customers");
  await page.getByRole("button", { name: "Add Customer", exact: true }).first().click();
  const name = "TEST Phone Caller " + Date.now();
  await page.getByLabel("Customer name", { exact: true }).fill(name);
  await page.getByLabel("Phone number", { exact: true }).fill("+15045550129");
  await page.getByRole("checkbox", { name: /I searched existing names/ }).check();
  await page.getByRole("button", { name: "Save customer profile", exact: true }).click();
  await page.getByRole("heading", { name, exact: true }).waitFor();
  assert.match(await page.locator("body").innerText(), /Phone-only profile/);
  checks.push("phone-only owner-created customer with no invented email");
  await page.getByRole("button", { name: "Upload Artwork", exact: true }).click();
  await page.getByLabel("Source artwork file", { exact: true }).setInputFiles(artworkPath);
  await page
    .getByLabel("Source / ownership note", { exact: true })
    .fill("TEST ONLY original logo supplied for this customer's orders");
  await page.getByRole("button", { name: "Save private artwork", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Source artwork saved privately" }).waitFor();
  await page.getByRole("button", { name: "Design Vault", exact: true }).click();
  await page.getByRole("button", { name: "Save a design", exact: true }).click();
  await page.getByRole("button", { name: /Start from scratch/ }).click();
  await page
    .getByLabel("Design / project name", { exact: true })
    .fill("TEST Black 112 · 2.5 inch circle");
  await page.getByLabel("Exact colorway", { exact: true }).selectOption("112:black");
  await page.getByLabel("Patch shape", { exact: true }).selectOption("Circle");
  await page
    .getByLabel("Source artwork", { exact: true })
    .selectOption({ label: "TEST-ONLY-original-logo.png · original" });
  await page
    .getByLabel("Design / order instructions", { exact: true })
    .fill("TEST ONLY exact original source and placement retained");
  await capture("phone-design-editor");
  await page.getByRole("button", { name: "Review current price", exact: true }).click();
  await page.getByRole("button", { name: "Save design to customer", exact: true }).click();
  await page.getByRole("heading", { name: "Saved designs", exact: true }).waitFor();
  await page.getByRole("button", { name: "Build again", exact: true }).waitFor();
  await capture("phone-customer-vault");
  checks.push("private original upload and named exact-model saved design");
  await page.getByRole("button", { name: "Build again", exact: true }).click();
  assert.equal(await page.getByLabel("Exact hat model", { exact: true }).inputValue(), "112");
  assert.equal(await page.getByLabel("Exact colorway", { exact: true }).inputValue(), "112:black");
  assert.equal(await page.getByLabel("Patch shape", { exact: true }).inputValue(), "Circle");
  assert.equal(
    await page.getByLabel("Physical patch size", { exact: true }).inputValue(),
    "medium",
  );
  assert.match(
    await page.getByLabel("Source artwork", { exact: true }).locator("option:checked").innerText(),
    /original-logo/,
  );
  await page.getByLabel("Quantity", { exact: true }).fill("3");
  await page.getByRole("button", { name: "Review current price", exact: true }).click();
  await page.getByRole("checkbox", { name: /I reviewed the exact selections/ }).check();
  await page
    .getByRole("button", { name: "Create unissued phone-order draft", exact: true })
    .click();
  await page.getByRole("heading", { name: "Financial summary", exact: true }).waitFor();
  assert.match(await page.locator("body").innerText(), /Artwork Approval Hold/);
  await capture("phone-order-payment-and-proof-holds");
  const customerHref = await page
    .getByRole("link", { name: "Open customer & Design Vault", exact: true })
    .getAttribute("href");
  await page.getByRole("link", { name: "Open customer & Design Vault", exact: true }).click();
  await page.getByRole("heading", { name, exact: true }).waitFor();
  await page.getByRole("button", { name: "Revisions", exact: true }).click();
  await page.getByText("Revision 2", { exact: true }).waitFor();
  await page.getByText("Revision 1", { exact: true }).waitFor();
  checks.push(
    "Build again prefills original artwork, exact options and dimensions; new draft keeps independent proof hold",
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await capture("desktop-customer-vault");
  await page.goto(base + "/account");
  const signedOut = page.waitForResponse(
    (r) => r.url().includes("/api/auth/sign-out") && r.status() === 200,
  );
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await signedOut;
  await context.close();
  context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  page = await context.newPage();
  watch(page);
  await login("owner");
  await page.goto(base + "/admin?section=customers");
  await page.getByLabel("Find a customer", { exact: true }).fill("5045550129");
  await page.getByRole("button").filter({ hasText: name }).click();
  await page.getByRole("button", { name: "Build again", exact: true }).waitFor();
  await page.getByRole("button", { name: "Build again", exact: true }).click();
  assert.equal(await page.getByLabel("Quantity", { exact: true }).inputValue(), "3");
  assert.equal(await page.getByLabel("Exact colorway", { exact: true }).inputValue(), "112:black");
  checks.push("profile and revised design survive logout, new browser context and phone search");
  writeFileSync(
    "artifacts/commerce-qa/customer-resume.json",
    JSON.stringify({ customerHref, name, assetUrl, durableStorage: true }),
  );
  for (const role of ["customer", "production"]) {
    await context.close();
    context = await browser.newContext();
    page = await context.newPage();
    watch(page);
    await login(role);
    const response = await context.request.get(assetUrl);
    assert.equal(response.status(), 403);
  }
  checks.push("customer and production roles cannot download customer-vault sources");
  assert.deepEqual(errors, []);
  writeFileSync(
    "screenshots/customer-vault/results.json",
    JSON.stringify(
      { checks, errors, viewport: "390×844 + 1440×1000", durableTestStorage: true },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ checks, errors }));
} catch (e) {
  await page.screenshot({ path: "screenshots/customer-vault/failure.png", fullPage: true });
  console.error((await page.locator("body").innerText()).slice(-3500));
  throw e;
} finally {
  await browser.close();
}
