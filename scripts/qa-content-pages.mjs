// Isolated owner/public draft/publish/revert acceptance. Never target a live database.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
const base = process.argv[2] ?? "http://localhost:8080";
if (
  !["http://localhost:8080", "http://localhost:8081"].includes(base) ||
  process.env.DATABASE_URL ||
  process.env.STRIPE_SECRET_KEY ||
  process.env.PAYPAL_CLIENT_SECRET ||
  process.env.RESEND_API_KEY
)
  throw Error("Content QA requires isolated local storage without provider credentials.");
const built = base.endsWith(":8081");
const story = "TEST FIXTURE private story draft " + randomUUID();
const fixture = JSON.parse(
  readFileSync(
    built ? "artifacts/commerce-qa/built-session.json" : "artifacts/commerce-qa/session.json",
    "utf8",
  ),
);
const directory = resolve("screenshots/content-pages" + (built ? "-built" : ""));
mkdirSync(directory, { recursive: true });
const result = { checks: [], pageErrors: [], consoleErrors: [], screenshots: [] };
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } }),
  page = await context.newPage();
const publicContext = await browser.newContext({ viewport: { width: 390, height: 844 } }),
  visitor = await publicContext.newPage();
for (const target of [page, visitor]) {
  target.on("pageerror", (e) => result.pageErrors.push(e.message));
  target.on("console", (m) => {
    if (m.type() === "error") result.consoleErrors.push(m.text());
  });
}
page.on("dialog", (d) => d.accept());
async function capture(name, target = page) {
  assert.equal(
    await target.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
    false,
    "no horizontal overflow",
  );
  const path = resolve(directory, name + ".png");
  await target.screenshot({ path, fullPage: true, caret: "initial" });
  result.screenshots.push(path);
}
async function publish() {
  await page.getByRole("button", { name: "Publish reviewed version", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Published." }).waitFor();
}
try {
  await page.goto(base + "/login");
  await page.getByLabel("Email", { exact: true }).fill(fixture.users.owner.email);
  await page.getByLabel("Password", { exact: true }).fill(fixture.users.owner.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL("**/account");
  if (built) {
    await page.goto(fixture.ownerSetupUrl);
    await page.getByRole("button", { name: "Activate owner access", exact: true }).click();
    await page.waitForURL(/\/admin/);
  }
  await page.goto(base + "/admin?section=website");
  await page
    .getByRole("heading", { name: "Website pages & public information", exact: true })
    .waitFor();
  await page.getByLabel("Content to edit", { exact: true }).selectOption("about_story");
  await page.getByLabel("About / our story", { exact: true }).fill(story);
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Draft saved." }).waitFor();
  await visitor.goto(base + "/info?page=about");
  assert.equal(await visitor.getByText(story, { exact: true }).count(), 0);
  const preview = await context.newPage();
  await preview.goto(base + "/info?page=about&ownerPreview=true");
  await preview.getByText(story, { exact: true }).waitFor();
  assert.equal(
    await preview.locator("meta[name=robots]").getAttribute("content"),
    "noindex, nofollow",
  );
  await preview.close();
  result.checks.push("owner draft preview is authenticated; public story is unchanged");
  await publish();
  await visitor.reload();
  await visitor.getByText(story, { exact: true }).waitFor();
  const first = Number(
    (await page.locator(".cc-publish-controls .cc-help").innerText()).match(
      /Published revision (\d+)/,
    )[1],
  );
  await page
    .getByLabel("About / our story", { exact: true })
    .fill("TEST FIXTURE replacement story");
  await publish();
  await visitor.reload();
  await visitor.getByText("TEST FIXTURE replacement story", { exact: true }).waitFor();
  await page.getByLabel("Published history", { exact: true }).selectOption(String(first));
  await page.getByRole("button", { name: "Revert", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Published revision restored." }).waitFor();
  await visitor.reload();
  await visitor.getByText(story, { exact: true }).waitFor();
  await capture("story-published-phone", visitor);
  result.checks.push("publish reaches public page and revision revert restores prior story");
  await page.getByLabel("Content to edit", { exact: true }).selectOption("faq_items");
  await page.getByRole("button", { name: "Add question", exact: true }).click();
  await page.getByLabel("Question 1", { exact: true }).fill("");
  assert.equal(await page.getByLabel("Question 1", { exact: true }).count(), 1);
  await page
    .getByLabel("Question 1", { exact: true })
    .fill("TEST FIXTURE: will I approve the proof?");
  await page
    .getByLabel("Answer 1", { exact: true })
    .fill("Yes. Review the digital proof before production.");
  await publish();
  await visitor.goto(base + "/info?page=faq");
  // Native details can toggle before React hydrates; wait for the hydrated page.
  await visitor.waitForLoadState("networkidle");
  await visitor.getByText("TEST FIXTURE: will I approve the proof?", { exact: true }).click();
  await visitor
    .getByText("Yes. Review the digital proof before production.", { exact: true })
    .waitFor();
  await capture("faq-public-phone", visitor);
  result.checks.push("structured FAQ publishes without raw HTML and keeps empty edits usable");
  await page.getByLabel("Content to edit", { exact: true }).selectOption("page_seo");
  await page.getByLabel("SEO page", { exact: true }).selectOption("faq");
  await page.getByLabel("Page SEO title", { exact: true }).fill("TEST FIXTURE FAQ");
  await page.getByLabel("Page meta description", { exact: true }).fill("Test-only page metadata.");
  await publish();
  await visitor.reload();
  assert.equal(await visitor.title(), "TEST FIXTURE FAQ");
  assert.equal(
    await visitor.locator("meta[name=description]").getAttribute("content"),
    "Test-only page metadata.",
  );
  result.checks.push("page metadata reaches the actual public information page");
  await page.getByLabel("Content to edit", { exact: true }).selectOption("footer_links");
  await page.getByRole("button", { name: "Add footer link", exact: true }).click();
  await page.getByLabel("Link label 1", { exact: true }).fill("TEST FIXTURE FAQ link");
  await page.getByLabel("Link destination 1", { exact: true }).selectOption("/info?page=faq");
  await publish();
  await visitor.reload();
  await visitor.getByRole("link", { name: "TEST FIXTURE FAQ link", exact: true }).waitFor();
  result.checks.push("owner-managed footer link appears beside protected existing links");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Phone preview", exact: true }).click();
  await capture("website-owner-phone");
  result.checks.push("phone editor and publish controls remain visible without overflow");
  const denied = await publicContext.newPage();
  await denied.goto(base + "/info?page=about&ownerPreview=true");
  await denied.getByText(story, { exact: true }).waitFor({ state: "hidden" });
  assert.equal(
    await denied
      .locator("body")
      .innerText()
      .then((v) => v.includes("Unauthorized") || v.includes("Sign in")),
    true,
  );
  await denied.close();
  result.checks.push("anonymous private preview is denied");
  assert.equal(result.pageErrors.length, 0);
  assert.equal(result.consoleErrors.length, 0);
  result.passed = true;
} catch (error) {
  result.passed = false;
  result.failure = error.stack;
  result.alerts = await page.getByRole("alert").allTextContents();
  await page.screenshot({
    path: resolve(directory, "failure.png"),
    fullPage: true,
    caret: "initial",
  });
  process.exitCode = 1;
} finally {
  await browser.close();
  writeFileSync(resolve(directory, "results.json"), JSON.stringify(result, null, 2));
}
console.log(JSON.stringify(result));
