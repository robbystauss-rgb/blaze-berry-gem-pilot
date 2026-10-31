import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { createServer } from "vite";
if (process.env.DATABASE_URL || process.env.STRIPE_SECRET_KEY || process.env.VERCEL)
  throw Error("Isolated intake tests only.");
let server, inspect, decode;
before(async () => {
  server = await createServer({ server: { middlewareMode: true }, appType: "custom" });
  inspect = (await server.ssrLoadModule("/src/lib/commerce/artwork-readiness.server.ts"))
    .artworkReadiness;
  decode = (await server.ssrLoadModule("/src/lib/commerce/checkout.server.ts")).decodeArtwork;
});
after(async () => {
  await server?.close();
});
const dimensions = { width: 3, height: 2 };
async function check(bytes, mime) {
  const before = createHash("sha256").update(bytes).digest("hex");
  const art = decode(`data:${mime};base64,${bytes.toString("base64")}`),
    result = await inspect(art, dimensions);
  assert.equal(createHash("sha256").update(art.bytes).digest("hex"), before);
  assert.equal(result.productionApproved, false);
  return result;
}
test("clean transparent PNG retains exact source and assesses visible artwork at production dimensions", async () => {
  const bytes = await sharp(
    Buffer.from(
      '<svg width="1500" height="1000"><rect x="100" y="100" width="1300" height="800" fill="black"/></svg>',
    ),
  )
    .png()
    .toBuffer();
  const result = await check(bytes, "image/png");
  assert.equal(result.status, "Ready for review");
  assert.equal(result.metadata.hasTransparency, true);
  assert.ok(result.pixelsPerInch > 300);
  assert.ok(result.metadata.visibleWidth < 1500);
});
test("low-resolution JPEG and opaque white-edge logo produce honest review warnings without source edits", async () => {
  const bytes = await sharp(
    Buffer.from(
      '<svg width="90" height="60"><rect width="90" height="60" fill="white"/><circle cx="45" cy="30" r="20" fill="black"/></svg>',
    ),
  )
    .jpeg()
    .toBuffer();
  const result = await check(bytes, "image/jpeg");
  assert.equal(result.status, "Low resolution");
  assert.ok(result.messages.some((m) => m.includes("background")));
  assert.equal(result.pixelsPerInch, 30);
  const larger = await sharp(bytes).resize(1500, 1000).png().toBuffer();
  const opaque = await check(larger, "image/png");
  assert.equal(opaque.status, "Background may print");
});
test("self-contained vectors and PDF need manual paths/pages review, never automatic laser readiness", async () => {
  const svg = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><defs><path id="logo" d="M0 0 L100 100"/></defs><use href="#logo"/></svg>',
  );
  const vector = await check(svg, "image/svg+xml");
  assert.equal(vector.status, "Needs owner review");
  assert.equal(vector.pixelsPerInch, null);
  const pdf = await check(
    Buffer.from("%PDF-1.4\nTEST ONLY manual intake\n%%EOF"),
    "application/pdf",
  );
  assert.equal(pdf.status, "Needs owner review");
});
test("unsafe SVG scripts, events, external/encoded references, animation and CSS escapes fail before preview or order storage", () => {
  for (const source of [
    '<svg onload="alert(1)"/>',
    "<svg><script>alert(1)</script></svg>",
    '<svg><image href="https://example.invalid/x"/></svg>',
    "<svg><image href=https://example.invalid/x /></svg>",
    "<!DOCTYPE svg><svg/>",
    '<svg><use href="&#x68;ttps://example.invalid/x"/></svg>',
    '<svg><set attributeName="href" to="https://example.invalid"/></svg>',
    "<svg><style>.x{fill:u\\72l(https://example.invalid)}</style></svg>",
  ])
    assert.throws(
      () => decode("data:image/svg+xml;base64," + Buffer.from(source).toString("base64")),
      /content does not match/,
    );
});
