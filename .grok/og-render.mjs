import { chromium } from "playwright";

const html = "file:///workspace/.grok/og-card.html";
const out = "/workspace/.grok/og-raw.png";

const browser = await chromium.launch({
  args: ["--disable-web-security", "--allow-file-access-from-files"],
});
const page = await browser.newPage({
  viewport: { width: 1200, height: 630 },
  deviceScaleFactor: 2,
});
await page.goto(html, { waitUntil: "networkidle", timeout: 60000 });
await page.evaluate(async () => {
  await document.fonts.ready;
  await Promise.all(
    [...document.images].map((img) =>
      img.complete ? Promise.resolve() : new Promise((res) => {
        img.addEventListener("load", res, { once: true });
        img.addEventListener("error", res, { once: true });
      }),
    ),
  );
});
await page.waitForTimeout(250);
await page.screenshot({ path: out, type: "png", omitBackground: false });
await browser.close();
console.log("wrote", out);
