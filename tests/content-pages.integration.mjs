import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "vite";
if (
  process.env.DATABASE_URL ||
  process.env.STRIPE_SECRET_KEY ||
  process.env.PAYPAL_CLIENT_SECRET ||
  process.env.RESEND_API_KEY
)
  throw Error("Use isolated storage without provider credentials.");
let server, sql, content, mutations, fields;
const owner = { userId: "content-test-owner", role: "owner" };
before(async () => {
  server = await createServer({ server: { middlewareMode: true }, appType: "custom" });
  sql = await (await server.ssrLoadModule("/src/lib/db.ts")).getSql();
  content = await server.ssrLoadModule("/src/lib/commerce/content-pages.server.ts");
  mutations = await server.ssrLoadModule("/src/lib/commerce/mutations.server.ts");
  fields = await server.ssrLoadModule("/src/lib/commerce/content-fields.ts");
});
after(async () => {
  await server?.close();
});
const save = (key, value, version, action = "draft", extra = {}) =>
  content.saveContentDocument({ key, body: { value }, version, action, ...extra }, owner);
const live = async (key) =>
  (await sql`select value,version from commerce_content where key=${key}`)[0];
test("drafts preserve existing public fields and baseline revision, publish and revert atomically", async () => {
  await sql`insert into commerce_content(key,value,version) values('about_story','Existing real story',7)`;
  assert.equal((await save("about_story", "Private draft", 0)).version, 1);
  assert.equal((await live("about_story")).value, "Existing real story");
  const draft = (await content.contentDocuments()).documents.find((r) => r.key === "about_story");
  assert.equal(draft.draft.value, "Private draft");
  assert.equal(draft.published.value, "Existing real story");
  assert.equal((await save("about_story", "Reviewed story", 1, "publish")).revision, 2);
  assert.equal((await live("about_story")).value, "Reviewed story");
  await save("about_story", "Ignored", 2, "revert", { revision: 1 });
  assert.equal((await live("about_story")).value, "Existing real story");
  assert.equal((await live("about_story")).version, 9);
});
test("stale versions and managers/production cannot publish website content", async () => {
  await assert.rejects(() => save("about_story", "Stale", 0, "publish"), /Content changed/);
  for (const role of ["manager", "production"])
    await assert.rejects(
      () =>
        content.saveContentDocument(
          { key: "about_story", version: 3, body: { value: "Denied" }, action: "publish" },
          { ...owner, role },
        ),
      /denied|permission/i,
    );
  assert.equal((await live("about_story")).value, "Existing real story");
});
test("controlled FAQ, links and page metadata reject executable destinations and invalid structures", async () => {
  assert.throws(() =>
    fields.validateContentValue("footer_links", '[{"label":"Bad","path":"javascript:alert(1)"}]'),
  );
  assert.throws(() =>
    fields.validateContentValue("faq_items", '[{"question":"","answer":"Invalid"}]'),
  );
  assert.throws(() =>
    fields.validateContentValue("page_seo", '{"checkout":{"title":"Bad","description":"Bad"}}'),
  );
  await save(
    "faq_items",
    '[{"question":"How is the proof approved?","answer":"Review the digital proof before production."}]',
    0,
    "publish",
  );
  await save("footer_links", '[{"label":"Our story","path":"/info?page=about"}]', 0, "publish");
  await save(
    "page_seo",
    '{"about":{"title":"Our real story","description":"Made to order."}}',
    0,
    "publish",
  );
  assert.equal(JSON.parse((await live("faq_items")).value).length, 1);
});
test("legacy content saves preserve publication history and optimistic locking", async () => {
  await mutations.mutate(
    "content.save",
    { key: "shipping_policy", value: "First policy", version: 0 },
    owner,
  );
  await mutations.mutate(
    "content.save",
    { key: "shipping_policy", value: "Second policy", version: 1 },
    owner,
  );
  await assert.rejects(
    () =>
      mutations.mutate(
        "content.save",
        { key: "shipping_policy", value: "Stale policy", version: 1 },
        owner,
      ),
    /Content changed/,
  );
  const history = (await content.contentDocuments()).revisions.filter(
    (r) => r.key === "shipping_policy",
  );
  assert.equal(history.length, 2);
  await save("shipping_policy", "", 2, "revert", { revision: 1 });
  assert.equal((await live("shipping_policy")).value, "First policy");
});
test("legacy audit restore uses the same revision path and refuses intervening changes", async () => {
  const [entry] =
    await sql`select id from commerce_audit where resource_type='content' and resource_id='shipping_policy' and after_value->>'value'='Second policy'`;
  await assert.rejects(
    () => mutations.mutate("content.restore", { id: entry.id, version: 3 }, owner),
    /Newer changes/,
  );
  const [latest] =
    await sql`select id from commerce_audit where resource_type='content' and resource_id='shipping_policy' and after_value->>'value'='First policy' order by created_at desc limit 1`;
  await mutations.mutate("content.restore", { id: latest.id, version: 3 }, owner);
  assert.equal((await live("shipping_policy")).value, "Second policy");
});
test("unpublishing preserves drafts and immutable history without changing orders", async () => {
  const [before] = await sql`select count(*)::int n from commerce_orders`;
  await save("footer_links", "[]", 1, "unpublish");
  assert.equal((await live("footer_links")).value, "");
  const [row] =
    await sql`select draft,published from commerce_documents where scope='content' and key='footer_links'`;
  assert.equal(row.published, null);
  assert.equal(row.draft.value, "[]");
  await save(
    "footer_links",
    '[{"label":"Private draft link","path":"/info?page=faq"}]',
    2,
    "draft",
  );
  const [draftOnly] =
    await sql`select draft,published from commerce_documents where scope='content' and key='footer_links'`;
  assert.equal(
    draftOnly.published,
    null,
    "saving a new draft must preserve the explicit unpublished state",
  );
  assert.match(draftOnly.draft.value, /Private draft link/);
  assert.equal((await live("footer_links")).value, "");
  await assert.rejects(() => save("footer_links", "[]", 3, "unpublish"), /not published/);
  await assert.rejects(
    () => sql`delete from commerce_document_revisions where scope='content'`,
    /immutable/i,
  );
  const [after] = await sql`select count(*)::int n from commerce_orders`;
  assert.equal(before.n, after.n);
});
test("concurrent publications accept one version and reject the stale writer", async () => {
  const results = await Promise.allSettled([
    save("contact_phone", "555-0100", 0, "publish"),
    save("contact_phone", "555-0101", 0, "publish"),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(results.filter((r) => r.status === "rejected").length, 1);
});
