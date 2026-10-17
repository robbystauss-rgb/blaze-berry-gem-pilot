import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "vite";
import { createHash, randomUUID } from "node:crypto";
import sharp from "sharp";
import { mkdtempSync, writeFileSync, unlinkSync, rmdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { importReviewedBundle } from "../scripts/import-reviewed-media.mjs";
import exclusions from "../src/data/excluded-media.json" with { type: "json" };
if (process.env.DATABASE_URL || process.env.STRIPE_SECRET_KEY || process.env.RESEND_API_KEY)
  throw Error("Local storage and no provider credentials required.");
let server, sql, media, publishing, importPhoto, original;
const owner = { userId: "review-owner", role: "owner" };
before(async () => {
  server = await createServer({ server: { middlewareMode: true }, appType: "custom" });
  sql = await (await server.ssrLoadModule("/src/lib/db.ts")).getSql();
  ({ importReviewedPhoto: importPhoto } = await server.ssrLoadModule(
    "/src/lib/commerce/reviewed-media-import.server.ts",
  ));
  media = await server.ssrLoadModule("/src/lib/commerce/media.server.ts");
  publishing = await server.ssrLoadModule("/src/lib/commerce/publishing.server.ts");
  original = await sharp({
    create: {
      width: 640,
      height: 400,
      channels: 4,
      background: { r: 120, g: 90, b: 50, alpha: 0.7 },
    },
  })
    .png()
    .toBuffer();
});
after(async () => {
  await server?.close();
});
const record = () => ({
  bytes: original,
  mime: "image/png",
  name: "Finished cap test.png",
  alt: "Local test finished cap",
  source: "Reviewed source test — not a real customer photo",
  tags: ["owner-review"],
});
test("exclusions use exact known image identities and leave genuine catalog sources available", async () => {
  const policy = await server.ssrLoadModule("/src/lib/media-policy.ts");
  const { drivePhoto, MASTER } = await server.ssrLoadModule("/src/lib/studio-store.ts");
  for (const rejected of exclusions.records) {
    for (const digest of rejected.sha256)
      assert.equal(policy.isExcludedMediaSource(undefined, digest), true);
    for (const id of rejected.driveIds) {
      assert.equal(drivePhoto(id), null);
      assert.equal(
        MASTER.work.some((w) => w.driveId === id),
        false,
      );
    }
  }
  assert.equal(policy.isExcludedMediaSource("different-source", "a".repeat(64)), false);
  assert.match(drivePhoto(MASTER.work[0].driveId), /googleusercontent/);
});
test("unauthorized imports fail before any assets or media are written", async () => {
  await assert.rejects(
    () => importPhoto(record(), { userId: "test-production", role: "production" }),
    /Access denied/,
  );
  assert.equal((await sql`select count(*)::int as n from commerce_media`)[0].n, 0);
});
test("original bytes remain exact; derivatives are optimized, transparent and private; duplicate imports reuse media", async () => {
  const first = await importPhoto(record(), owner),
    second = await importPhoto({ ...record(), name: "Alias filename.png" }, owner);
  assert.equal(first.duplicate, false);
  assert.equal(second.duplicate, true);
  assert.equal(first.id, second.id);
  const [row] =
    await sql`select m.*,a.bytes from commerce_media m join commerce_assets a on a.id=m.id where m.id=${first.id}`;
  assert.equal(
    createHash("sha256").update(row.original).digest("hex"),
    createHash("sha256").update(original).digest("hex"),
  );
  const meta = await sharp(Buffer.from(row.bytes)).metadata();
  assert.equal(meta.format, "webp");
  assert.equal(meta.hasAlpha, true);
  assert.equal(meta.exif, undefined);
  assert.equal(meta.xmp, undefined);
  assert.equal(await media.mediaIsPublished(first.id), false);
  assert.equal(
    (
      await sql`select count(*)::int as n from commerce_audit where action='media.reviewed_import'`
    )[0].n,
    1,
  );
});
test("wrong MIME, active payloads and oversized sources are rejected", async () => {
  await assert.rejects(() => importPhoto({ ...record(), mime: "image/jpeg" }, owner), /declared/);
  await assert.rejects(
    () => importPhoto({ ...record(), bytes: Buffer.from("<script>unsafe</script>") }, owner),
    /unsupported|corrupt|image/i,
  );
  await assert.rejects(
    () => importPhoto({ ...record(), bytes: new Uint8Array(25_000_001) }, owner),
    /25 MB/,
  );
});
test("gallery drafts stay private; consent is required before reviewed owner publication", async () => {
  const { id } = await importPhoto(record(), owner),
    key = randomUUID();
  const body = {
    title: "Local finished cap",
    description: "Local browser proof",
    category: "Hats",
    tags: [],
    mediaIds: [id],
    coverId: id,
    featured: true,
    consent: false,
    archived: false,
    family: "112",
  };
  await publishing.saveDocument(
    { scope: "gallery", key, version: 0, action: "draft", body },
    owner,
  );
  assert.equal(await media.mediaIsPublished(id), false);
  await assert.rejects(
    () =>
      publishing.saveDocument(
        { scope: "gallery", key, version: 1, action: "publish", body },
        owner,
      ),
    /permission/,
  );
  await publishing.saveDocument(
    { scope: "gallery", key, version: 1, action: "publish", body: { ...body, consent: true } },
    owner,
  );
  assert.equal(await media.mediaIsPublished(id), true);
});
test("retired family cannot be restored through gallery publishing", async () => {
  const { id } = await importPhoto(record(), owner);
  await assert.rejects(
    () =>
      publishing.saveDocument(
        {
          scope: "gallery",
          key: randomUUID(),
          version: 0,
          action: "publish",
          body: {
            title: "Historic project",
            description: "",
            category: "Hats",
            tags: [],
            mediaIds: [id],
            coverId: id,
            featured: false,
            consent: true,
            archived: false,
            family: "112PM",
          },
        },
        owner,
      ),
    /archived/,
  );
});

test("known excluded media cannot be uploaded or published through gallery, hero, product or calibration", async () => {
  const { id } = await importPhoto(record(), owner);
  assert.equal(await media.mediaIsPublished(id), true, "existing approved project starts public");
  const policy = await server.ssrLoadModule("/src/lib/media-policy.ts");
  const data = (await server.ssrLoadModule("/src/data/excluded-media.json")).default;
  // Isolated synthetic fixture: no rejected customer photos are committed as test assets.
  const md5 = createHash("md5").update(original).digest("hex");
  data.records.push({
    id: "test-only",
    driveIds: [],
    sha256: [createHash("sha256").update(original).digest("hex")],
    md5: [md5],
  });
  policy.EXCLUDED_MEDIA_MD5.push(md5);
  try {
    await assert.rejects(() => importPhoto(record(), owner), /rejected for storefront/);
    await assert.rejects(
      () =>
        media.uploadMedia(
          {
            name: "new-name.png",
            alt: "Alias",
            data: "data:image/png;base64," + original.toString("base64"),
          },
          owner,
        ),
      /rejected for storefront/,
    );
    assert.equal(
      await media.mediaIsPublished(id),
      false,
      "existing publication does not expose a now-rejected original",
    );
    await assert.rejects(
      () =>
        publishing.saveDocument(
          {
            scope: "gallery",
            key: randomUUID(),
            version: 0,
            action: "publish",
            body: {
              title: "Blocked source",
              description: "",
              category: "Hats",
              tags: [],
              mediaIds: [id],
              coverId: id,
              featured: false,
              consent: true,
              archived: false,
              family: "112",
            },
          },
          owner,
        ),
      /rejected for storefront/,
    );
    const { DEFAULT_STOREFRONT } = await server.ssrLoadModule("/src/lib/commerce/owner-schemas.ts");
    await assert.rejects(
      () =>
        publishing.saveDocument(
          {
            scope: "storefront",
            key: "main",
            version: 0,
            action: "publish",
            body: { ...DEFAULT_STOREFRONT, heroMediaId: id },
          },
          owner,
        ),
      /rejected for storefront/,
    );
    const { mutate } = await server.ssrLoadModule("/src/lib/commerce/mutations.server.ts");
    await assert.rejects(
      () =>
        mutate(
          "product.save",
          {
            title: "Blocked source",
            description: "",
            category: "Hats",
            state: "active",
            images: ["/api/media/" + id],
            variants: [
              { title: "Test", sku: randomUUID(), price: 3000, active: true, options: {} },
            ],
          },
          owner,
        ),
      /rejected for storefront/,
    );
    const { registerHatPhoto } = await server.ssrLoadModule(
      "/src/lib/commerce/hat-photos.server.ts",
    );
    const { MASTER } = await server.ssrLoadModule("/src/lib/studio-store.ts");
    await assert.rejects(
      () =>
        registerHatPhoto(
          {
            modelId: "112",
            colorway: MASTER.models.find((m) => m.id === "112").colorways[0].id,
            mediaId: id,
            verified: true,
            provenance: "Isolated synthetic test source",
          },
          owner,
        ),
      /rejected for storefront/,
    );
  } finally {
    data.records.pop();
    policy.EXCLUDED_MEDIA_MD5.pop();
  }
  assert.equal(await media.mediaIsPublished(id), true, "approved records remain intact");
});

test("operator bundle checks active owner and every model before writes; retries reuse originals and gallery drafts", async () => {
  const directory = mkdtempSync(join(tmpdir(), "rec-reviewed-import-"));
  const photoFile = join(directory, "original.png"),
    manifestFile = join(directory, "manifest.json");
  const bytes = await sharp({
    create: { width: 48, height: 48, channels: 4, background: "#a08759" },
  })
    .png()
    .toBuffer();
  const digest = createHash("sha256").update(bytes).digest("hex");
  const source = {
    ...record(),
    bytes: undefined,
    file: "original.png",
    sha256: digest,
    kind: "finished",
    key: digest,
    group: "test-reviewed-bundle",
  };
  const manifest = { version: 1, publish: false, records: [source] };
  writeFileSync(photoFile, bytes);
  writeFileSync(manifestFile, JSON.stringify(manifest));
  try {
    await assert.rejects(() => importReviewedBundle(server, owner, manifestFile), /active owner/);
    await sql`insert into "user"(id,name,email,"emailVerified","createdAt","updatedAt") values(${owner.userId},'Local owner','review-owner@example.invalid',true,now(),now())`;
    await sql`insert into merchant_staff(user_id,role) values(${owner.userId},'owner')`;
    const beforeCount = (await sql`select count(*)::int as n from commerce_media`)[0].n;
    for (const rejected of exclusions.records) {
      for (const sha256 of rejected.sha256) {
        writeFileSync(
          manifestFile,
          JSON.stringify({
            ...manifest,
            records: [source, { ...source, sha256, file: "must-not-be-read.jpg" }],
          }),
        );
        await assert.rejects(
          () => importReviewedBundle(server, owner, manifestFile),
          /rejected for storefront/,
        );
      }
      writeFileSync(
        manifestFile,
        JSON.stringify({
          ...manifest,
          records: [
            source,
            { ...source, driveId: rejected.driveIds[0], file: "must-not-be-read.jpg" },
          ],
        }),
      );
      await assert.rejects(
        () => importReviewedBundle(server, owner, manifestFile),
        /rejected for storefront/,
      );
    }
    assert.equal(
      (await sql`select count(*)::int as n from commerce_media`)[0].n,
      beforeCount,
      "a rejected source anywhere in the batch prevents every write",
    );
    writeFileSync(
      manifestFile,
      JSON.stringify({
        ...manifest,
        records: [
          source,
          {
            ...source,
            kind: "hat_photo",
            modelId: "112PM",
            colorway: "Silver/Grey Camo",
            verified: true,
          },
        ],
      }),
    );
    await assert.rejects(() => importReviewedBundle(server, owner, manifestFile), /active model/);
    assert.equal((await sql`select count(*)::int as n from commerce_media`)[0].n, beforeCount);
    writeFileSync(manifestFile, JSON.stringify(manifest));
    const first = await importReviewedBundle(server, owner, manifestFile);
    const second = await importReviewedBundle(server, owner, manifestFile);
    assert.equal(first[0].duplicate, false);
    assert.equal(second[0].duplicate, true);
    assert.equal(first[0].id, second[0].id);
    const docs =
      await sql`select draft,published from commerce_documents where scope='gallery' and draft->'mediaIds' @> ${JSON.stringify([first[0].id])}::jsonb`;
    assert.equal(docs.length, 1);
    assert.equal(docs[0].published, null);
    assert.equal(docs[0].draft.consent, false);
    assert.equal(docs[0].draft.featured, false);
  } finally {
    unlinkSync(photoFile);
    unlinkSync(manifestFile);
    rmdirSync(directory);
  }
});
