// Synthetic local records only. Captures the prior committed UI then restores
// every working file byte-for-byte, even when browser assertions fail.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import { chromium } from "playwright";
if (process.env.DATABASE_URL || process.env.VERCEL || process.env.STRIPE_SECRET_KEY)
  throw Error("Local disposable QA only.");
const phase = process.argv[2] ?? "after",
  base = "http://localhost:8080";
assert.ok(["before", "after"].includes(phase));
const files = [
  "src/components/admin/command-center.tsx",
  "src/components/admin/order-detail.tsx",
  "src/components/admin/admin.css",
];
const backup = new Map(files.map((file) => [file, readFileSync(file)]));
const fixture = JSON.parse(readFileSync("artifacts/commerce-qa/customer-browser-session.json"));
const directory = "screenshots/owner-workspace/" + phase;
mkdirSync(directory, { recursive: true });
let browser;
const errors = [],
  checks = [];
try {
  if (phase === "before")
    for (const file of files) writeFileSync(file, execFileSync("git", ["show", "d3c5125:" + file]));
  browser = await chromium.launch({ headless: true, channel: "chrome" });
  for (const width of [390, 1440]) {
    const context = await browser.newContext({
        viewport: { width, height: width === 390 ? 844 : 1000 },
      }),
      page = await context.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(base + "/login");
    await page.getByLabel("Email", { exact: true }).fill(fixture.users.owner.email);
    await page.getByLabel("Password", { exact: true }).fill(fixture.users.owner.password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.waitForURL("**/account");
    await page.goto(base + "/admin?section=overview");
    await page
      .getByRole("heading", {
        name: phase === "after" ? "Needs attention" : "Overview",
        exact: true,
      })
      .first()
      .waitFor();
    await page.screenshot({ path: `${directory}/overview-${width}.png`, fullPage: true });
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
      false,
    );
    await page.goto(base + "/admin?section=orders");
    const link = page.locator(".cc-table tbody .cc-link").first();
    await link.waitFor();
    await link.click();
    await page.getByRole("heading", { name: "Financial summary", exact: true }).waitFor();
    if (phase === "after") {
      await page.getByText("NEXT SAFE ACTION", { exact: true }).waitFor();
      assert.match(
        await page.locator("body").innerText(),
        /Financial[\s\S]*Artwork[\s\S]*Production/,
      );
    }
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: `${directory}/order-${width}.png`, fullPage: true });
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
      false,
    );
    checks.push(`${width}px overview and order: no horizontal overflow, actual stored statuses`);
    await context.close();
  }
  assert.equal(errors.length, 0);
} finally {
  if (phase === "before") for (const [file, bytes] of backup) writeFileSync(file, bytes);
  await browser?.close();
  writeFileSync(directory + "/results.json", JSON.stringify({ phase, checks, errors }, null, 2));
}
console.log(JSON.stringify({ phase, checks, errors }));
