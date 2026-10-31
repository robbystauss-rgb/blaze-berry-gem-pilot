// Local authenticated owner UI -> durable test DB -> anonymous gallery/builder.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import sharp from "sharp";
if (process.env.DATABASE_URL || process.env.STRIPE_SECRET_KEY || process.env.RESEND_API_KEY)
  throw Error("Disposable localhost only.");
const base = "http://localhost:8080",
  directory = "screenshots/commerce-growth";
mkdirSync(directory, { recursive: true });
const fixture = JSON.parse(readFileSync("artifacts/commerce-qa/customer-browser-session.json"));
const photos = JSON.parse(readFileSync("src/data/hat-display-images.json")).records;
const reference = photos.find(
  (photo) => photo.modelId === "112" && photo.calibrationId.startsWith("112:black@"),
);
const photoFile = "artifacts/commerce-qa/TEST-ONLY-exact-112-catalog-photo.webp";
writeFileSync(photoFile, readFileSync("public" + reference.imageUrl));
const logo = await sharp(
  Buffer.from(
    '<svg width="900" height="900"><circle cx="450" cy="450" r="350" fill="black"/></svg>',
  ),
)
  .png()
  .toBuffer();
const low = await sharp({ create: { width: 90, height: 60, channels: 3, background: "white" } })
  .jpeg()
  .toBuffer();
const browser = await chromium.launch({ headless: true, channel: "chrome" }),
  errors = [],
  checks = [];
try {
  const owner = await browser.newContext({ viewport: { width: 390, height: 844 } }),
    page = await owner.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("dialog", (dialog) => dialog.accept());
  await page.goto(base + "/login");
  await page.getByLabel("Email", { exact: true }).fill(fixture.users.owner.email);
  await page.getByLabel("Password", { exact: true }).fill(fixture.users.owner.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL("**/account");
  await page.goto(base + "/admin?section=gallery");
  await page.getByRole("heading", { name: "Media library", exact: true }).waitFor();
  await page.locator("input[type=file]").setInputFiles(photoFile);
  await page.getByRole("status").filter({ hasText: "Photos uploaded privately" }).waitFor();
  await page
    .locator("button.cc-media-card")
    .filter({ hasText: "TEST-ONLY-exact-112-catalog-photo.webp" })
    .first()
    .click();
  await page
    .getByLabel("Alt text", { exact: true })
    .fill("TEST ONLY exact Richardson 112 catalog photograph; not a completed customer job");
  await page.getByRole("button", { name: "Save photo", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Photo saved." }).waitFor();
  const title = "TEST ONLY gallery choices " + Date.now();
  await page.getByLabel("Project title", { exact: true }).fill(title);
  await page
    .getByLabel("Description", { exact: true })
    .fill(
      "Isolated route test using an authentic catalog reference; no claim of finished customer work.",
    );
  await page.getByLabel("Customize a similar model", { exact: true }).selectOption("112");
  await page
    .getByLabel("Link verified product choices to Make one like this", { exact: true })
    .check();
  await page.getByLabel("Exact example color", { exact: true }).selectOption("112:black");
  await page.getByLabel("Example patch shape", { exact: true }).selectOption("Circle");
  await page
    .locator(".compact .cc-media-card")
    .filter({ hasText: "TEST ONLY exact Richardson" })
    .first()
    .getByRole("checkbox")
    .check();
  await page.getByLabel(/I have permission/).check();
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Draft saved." }).waitFor();
  await page.getByRole("button", { name: "Publish reviewed version", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Published." }).waitFor();
  await page.screenshot({ path: directory + "/owner-publish-phone.png", fullPage: true });
  checks.push(
    "iPhone-width authenticated photo intake and reviewed exact configuration publication",
  );
  const anonymous = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 3,
    }),
    shop = await anonymous.newPage();
  shop.on("pageerror", (error) => errors.push(error.message));
  await shop.goto(base + "/actual-work");
  const card = shop
    .locator("article")
    .filter({ has: shop.getByRole("heading", { name: title, exact: true }) });
  await card.getByRole("link", { name: "Make one like this →", exact: true }).click();
  await shop.waitForURL("**/order?**");
  await shop.waitForFunction(() => {
    const value = JSON.parse(localStorage.getItem("rec-mama-order"))?.state;
    return (
      value?.family === "112" &&
      value.colorway === "Black" &&
      value.patchShape === "Circle" &&
      value.patchSize === "medium" &&
      value.artworkDataUrl === ""
    );
  });
  await shop.getByRole("button", { name: /^\d{2} Design$/ }).click();
  await shop
    .locator("input[type=file]")
    .setInputFiles({ name: "TEST-low.jpg", mimeType: "image/jpeg", buffer: low });
  await shop.locator('[data-artwork-readiness="Low resolution"]').waitFor();
  await shop
    .locator("input[type=file]")
    .setInputFiles({ name: "TEST-original.png", mimeType: "image/png", buffer: logo });
  await shop.locator('[data-artwork-readiness="Ready for review"]').waitFor();
  const original = await shop.evaluate(
    () => JSON.parse(localStorage.getItem("rec-mama-order")).state.artworkDataUrl,
  );
  assert.equal(original, "data:image/png;base64," + logo.toString("base64"));
  await shop
    .locator("input[type=file]")
    .setInputFiles({
      name: "TEST-unsafe.svg",
      mimeType: "image/svg+xml",
      buffer: Buffer.from('<svg onload="alert(1)"><script>alert(1)</script></svg>'),
    });
  await shop.getByText(/This SVG contains active content/).waitFor();
  assert.equal(
    await shop.evaluate(
      () => JSON.parse(localStorage.getItem("rec-mama-order")).state.artworkDataUrl,
    ),
    original,
  );
  await shop.reload();
  await shop.waitForFunction(() => {
    const preview = document.querySelector("[data-hat-preview]");
    return (
      preview?.getAttribute("data-image-rect") !== "loading" &&
      preview?.querySelector("[data-patch-overlay]")
    );
  });
  await shop.waitForFunction(
    (expected) =>
      JSON.parse(localStorage.getItem("rec-mama-order")).state.artworkDataUrl === expected,
    original,
  );
  await shop.getByRole("button", { name: /^\d{2} Place$/ }).click();
  await shop
    .getByRole("button", { name: /^\d{2} Place$/ })
    .and(shop.locator('[aria-current="step"]'))
    .waitFor();
  const patch = shop.getByRole("button", {
    name: "Position patch: drag or use arrow keys",
    exact: true,
  });
  await patch.waitFor();
  const anchor = await patch.getAttribute("data-patch-anchor");
  await patch.focus();
  await shop.keyboard.press("ArrowRight");
  await shop.waitForFunction(
    (prior) =>
      document.querySelector("[data-patch-overlay]")?.getAttribute("data-patch-anchor") !== prior,
    anchor,
  );
  await shop.getByRole("button", { name: "Undo", exact: true }).click();
  await shop.waitForFunction(
    (prior) =>
      document.querySelector("[data-patch-overlay]")?.getAttribute("data-patch-anchor") === prior,
    anchor,
  );
  await shop.getByRole("button", { name: "Guides", exact: true }).click();
  assert.equal(
    await shop.getByRole("button", { name: "Guides", exact: true }).getAttribute("aria-pressed"),
    "true",
  );
  assert.equal(
    await shop.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
    false,
  );
  await shop.screenshot({ path: directory + "/gallery-build-artwork-phone.png", fullPage: true });
  checks.push(
    "public gallery prefill contains exact options, no commissioned artwork; original upload survives unsafe SVG rejection and reload; keyboard, Undo and guides work",
  );
  await shop.goto(base + "/");
  await shop.getByRole("link", { name: "Group / business quote", exact: true }).click();
  await shop.waitForLoadState("networkidle");
  await shop.getByLabel("Your name", { exact: true }).fill("TEST ONLY team inquiry");
  await shop.getByLabel("Email", { exact: true }).fill("team@example.invalid");
  await shop.getByLabel("Estimated quantity", { exact: true }).fill("25");
  await shop
    .getByLabel("Project details", { exact: true })
    .fill(
      "TEST ONLY 25 Richardson 112 Black hats, circle patch, same team logo. Availability, deadline and current pricing need review.",
    );
  await shop.getByRole("checkbox", { name: /REC Mama Made may use/ }).check();
  await shop.getByRole("button", { name: "Request an estimate", exact: true }).click();
  await shop.getByRole("status").waitFor();
  await page.goto(base + "/admin?section=quotes");
  await page.getByRole("cell").filter({ hasText: "TEST ONLY team inquiry" }).first().waitFor();
  checks.push(
    "25-unit inquiry reaches existing owner quotes; no fabricated price, payment or message delivery",
  );
  await shop.screenshot({ path: directory + "/bulk-request-phone.png", fullPage: true });
  assert.equal(errors.length, 0);
  await owner.close();
  await anonymous.close();
} catch (error) {
  const last = browser
    .contexts()
    .flatMap((context) => context.pages())
    .at(-1);
  if (last) {
    await last.screenshot({ path: directory + "/failure.png", fullPage: true });
    console.log(
      JSON.stringify({
        url: new URL(last.url()).pathname,
        form: await last
          .locator("input,textarea")
          .evaluateAll((elements) =>
            elements.map((e) => ({ name: e.name, value: e.value, valid: e.checkValidity() })),
          ),
      }),
    );
    console.log((await last.locator("body").innerText()).slice(-4000));
  }
  throw error;
} finally {
  await browser.close();
  writeFileSync(directory + "/results.json", JSON.stringify({ checks, errors }, null, 2));
}
console.log(JSON.stringify({ checks, errors }));
