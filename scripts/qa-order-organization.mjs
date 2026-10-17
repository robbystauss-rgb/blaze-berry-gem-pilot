// Disposable local fixtures only; no provider actions or customer communications.
import assert from "node:assert/strict";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { chromium } from "playwright";
if (
  process.env.DATABASE_URL ||
  process.env.VERCEL ||
  process.env.STRIPE_SECRET_KEY ||
  process.env.PAYPAL_CLIENT_SECRET ||
  process.env.RESEND_API_KEY
)
  throw Error("Isolated local QA only.");
const base = process.argv[2] ?? "http://localhost:8080";
if (!["http://localhost:8080", "http://localhost:8081"].includes(base))
  throw Error("Local fixture servers only.");
const built = base.endsWith(":8081");
const fixture = JSON.parse(
  readFileSync(
    built ? "artifacts/commerce-qa/built-session.json" : "artifacts/commerce-qa/session.json",
    "utf8",
  ),
);
if (built) {
  const quote = JSON.parse(readFileSync("artifacts/commerce-qa/quotes-built/results.json", "utf8"));
  assert.equal(quote.base, base);
  assert.ok(quote.orderId);
  assert.ok(!quote.failure);
  fixture.orderId = quote.orderId;
}
const directory = resolve("screenshots/order-organization" + (built ? "-built" : ""));
mkdirSync(directory, { recursive: true });
const tag = "TEST TEAM " + randomUUID().slice(0, 8),
  result = { checks: [], pageErrors: [], consoleErrors: [], screenshots: [] };
const browser = await chromium.launch({ headless: true, channel: "chrome" });
const owner = await (
  await browser.newContext({ viewport: { width: 1440, height: 1000 } })
).newPage();
const customer = await (
  await browser.newContext({ viewport: { width: 390, height: 844 } })
).newPage();
for (const p of [owner, customer]) {
  p.on("pageerror", (e) => result.pageErrors.push(e.message));
  p.on("console", (m) => {
    if (m.type() === "error") result.consoleErrors.push(m.text());
  });
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
  );
  const path = resolve(directory, name + ".png");
  await page.screenshot({ path, fullPage: true, caret: "initial" });
  result.screenshots.push(path);
}
try {
  await login(owner, "owner");
  await owner.goto(base + "/admin?section=orders&orderId=" + fixture.orderId);
  await owner.waitForLoadState("networkidle");
  await owner.getByLabel("Production priority", { exact: true }).selectOption("high");
  await owner
    .getByLabel("Private order tags", { exact: true })
    .fill(tag + ", " + tag.toLowerCase() + ", Art review");
  await owner.getByRole("button", { name: "Save priority & tags", exact: true }).click();
  await owner.getByRole("status").filter({ hasText: "Order updated." }).waitFor();
  await owner.reload();
  await owner.getByLabel("Production priority", { exact: true }).waitFor();
  assert.equal(await owner.getByLabel("Production priority", { exact: true }).inputValue(), "high");
  assert.equal(
    await owner.getByLabel("Private order tags", { exact: true }).inputValue(),
    tag + ", Art review",
  );
  await capture(owner, "order-priority-desktop");
  await owner.setViewportSize({ width: 390, height: 844 });
  await capture(owner, "order-priority-mobile");
  result.checks.push(
    "owner saves priority and deduplicated private tags; values persist through reload on desktop/phone",
  );
  await owner.goto(base + "/admin?section=production");
  await owner.waitForLoadState("networkidle");
  await owner.getByLabel("Filter production priority", { exact: true }).selectOption("high");
  const rows = owner
    .getByRole("row")
    .filter({ has: owner.getByRole("button", { name: /Manage order/ }) });
  await rows.filter({ hasText: tag }).waitFor();
  await owner.waitForFunction(
    () =>
      document.querySelectorAll('table.cc-table tbody button[aria-label^="Manage order"]')
        .length === 1,
  );
  assert.equal(await rows.count(), 1);
  await capture(owner, "filtered-production-mobile");
  await owner.getByRole("button", { name: /Export all matching records/ }).click();
  await owner.getByRole("status").filter({ hasText: "Exported 1 matching records." }).waitFor();
  await owner.getByLabel("Filter production priority", { exact: true }).selectOption("low");
  await owner.getByText("No production work in this view", { exact: true }).waitFor();
  result.checks.push(
    "production priority filter reaches server data and exact row count; phone queue shows private tags and meaningful empty state",
  );
  await login(customer, "customer");
  if (!built) {
    const denied = await customer.evaluate(async (id) => {
      const { mutateAdmin } = await import("/src/lib/commerce/api.ts");
      try {
        await mutateAdmin({
          data: {
            action: "order.organize",
            payload: { id, version: 2, priority: "low", tags: [] },
          },
        });
        return false;
      } catch {
        return true;
      }
    }, fixture.orderId);
    assert.equal(denied, true);
    result.checks.push(
      "ordinary authenticated customer cannot organize an order through the owner API",
    );
  } else {
    await customer.goto(base + "/admin?section=production");
    await customer
      .getByRole("heading", { name: "Merchant access required", exact: true })
      .waitFor();
    assert.equal(await customer.getByLabel("Production priority", { exact: true }).count(), 0);
    result.checks.push(
      "compiled owner workspace denies ordinary customer access; HTTP mutation denial verified separately in dev",
    );
  }
  assert.equal(result.pageErrors.length, 0, JSON.stringify(result.pageErrors));
  assert.equal(result.consoleErrors.length, 0, JSON.stringify(result.consoleErrors));
} catch (error) {
  result.failure = error.stack;
  result.alerts = await owner.getByRole("alert").allTextContents();
  process.exitCode = 1;
  await owner.screenshot({ path: resolve(directory, "failure.png"), fullPage: true });
} finally {
  writeFileSync(resolve(directory, "results.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  await browser.close();
}
