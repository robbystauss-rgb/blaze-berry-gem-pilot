// Read-only HTTP checks against the two isolated local QA servers. Never targets production.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const base = process.argv[2] || "http://localhost:8080";
if (!["http://localhost:8080", "http://localhost:8081"].includes(base))
  throw Error("Retirement QA is limited to isolated local servers.");
if (process.env.DATABASE_URL || process.env.STRIPE_SECRET_KEY || process.env.RESEND_API_KEY)
  throw Error("Retirement QA refuses remote databases and live provider credentials.");
const results = {
  base,
  checkedAt: new Date().toISOString(),
  routes: [],
  photos: [],
  privateMedia: [],
};
const root = process.cwd();
const get = (path, options = {}) => fetch(base + path, { redirect: "manual", ...options });
for (const [path, status] of [
  ["/112pm", 301],
  ["/order?type=hat&family=112PM", 302],
]) {
  const response = await get(path);
  assert.equal(response.status, status, path);
  assert.equal(response.headers.get("location"), "/hats");
  results.routes.push({ path, status, redirect: "/hats" });
}
for (const path of [
  "/",
  "/hats",
  "/actual-work",
  "/order?type=hat",
  "/112",
  "/112fp",
  "/112fpr",
  "/112p",
  "/112pfp",
  "/168",
  "/168p",
  "/256",
  "/256p",
]) {
  const response = await get(path);
  assert.equal(response.status, 200, path);
  const html = await response.text();
  const visible = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
  assert.doesNotMatch(visible, /Richardson\s+112PM|href=["'][^"']*\/112pm(?:[?#"'])/i, path);
  results.routes.push({ path, status: 200, retiredReferences: 0 });
}
const photoManifest = JSON.parse(
  readFileSync(resolve(root, "src/data/catalog-photo-refresh.json")),
);
for (const record of photoManifest.records) {
  const response = await get(record.imageUrl);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /^image\/webp/);
  const hash = createHash("sha256")
    .update(Buffer.from(await response.arrayBuffer()))
    .digest("hex");
  const expected = createHash("sha256")
    .update(readFileSync(resolve(root, "public" + record.imageUrl)))
    .digest("hex");
  assert.equal(hash, expected);
  results.photos.push({ model: record.modelId, color: record.sourceLabel, deliveredHash: hash });
}
// The dev server's separately reviewed import is optional; the built QA DB starts empty.
const importedPath = resolve(root, "screenshots/catalog-retirement/reviewed-import.private.json");
if (base.endsWith(":8080") && existsSync(importedPath)) {
  const imported = JSON.parse(readFileSync(importedPath));
  const fixture = JSON.parse(readFileSync(resolve(root, "artifacts/commerce-qa/session.json")));
  const login = await get("/api/auth/sign-in/email", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: base },
    body: JSON.stringify(fixture.users.owner),
  });
  assert.equal(login.status, 200, "Synthetic owner sign-in");
  const cookie = login.headers
    .getSetCookie()
    .map((s) => s.split(";")[0])
    .join("; ");
  assert.ok(cookie, "Authenticated owner cookie");
  for (const record of imported) {
    for (const query of ["", "?thumbnail=1", "?original=1"]) {
      const response = await get("/api/media/" + record.id + query);
      assert.equal(response.status, 404, "Reviewed business media remains private");
    }
    const original = await get("/api/media/" + record.id + "?original=1", {
      headers: { Cookie: cookie },
    });
    assert.equal(original.status, 200, "Owner can retrieve exact original");
    assert.equal(original.headers.get("cache-control"), "private, no-store");
    const hash = createHash("sha256")
      .update(Buffer.from(await original.arrayBuffer()))
      .digest("hex");
    assert.equal(hash, record.key);
    results.privateMedia.push({
      kind: record.kind,
      anonymousAccess: "denied",
      originalPreserved: true,
    });
  }
}
const dir = resolve(root, "artifacts/catalog-retirement");
mkdirSync(dir, { recursive: true });
writeFileSync(
  resolve(dir, base.endsWith(":8081") ? "built-http.json" : "dev-http.json"),
  JSON.stringify(results, null, 2),
);
console.log(
  JSON.stringify({
    passed: true,
    routes: results.routes.length,
    exactPhotos: results.photos.length,
    privateMedia: results.privateMedia.length,
  }),
);
