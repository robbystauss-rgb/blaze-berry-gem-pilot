// Private, reviewed originals are supplied separately, never bundled in public assets.
import { readFileSync, realpathSync, statSync } from "node:fs";
import { resolve, dirname, relative, isAbsolute } from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

export async function importReviewedBundle(server, actor, manifestPath) {
  const sql = await (await server.ssrLoadModule("/src/lib/db.ts")).getSql();
  const [staff] =
    await sql`select role from merchant_staff where user_id=${actor.userId} and active`;
  if (!staff || staff.role !== actor.role || staff.role !== "owner")
    throw Error("An active owner is required for the reviewed import.");
  const manifestFile = realpathSync(manifestPath),
    root = dirname(manifestFile);
  const manifest = JSON.parse(readFileSync(manifestFile, "utf8"));
  if (
    manifest.version !== 1 ||
    manifest.publish !== false ||
    !Array.isArray(manifest.records) ||
    manifest.records.length > 100
  )
    throw Error("Use a bounded version 1 manifest with automatic publishing disabled.");
  const { importReviewedPhoto } = await server.ssrLoadModule(
    "/src/lib/commerce/reviewed-media-import.server.ts",
  );
  const { saveDocument } = await server.ssrLoadModule("/src/lib/commerce/publishing.server.ts");
  const { registerHatPhoto } = await server.ssrLoadModule("/src/lib/commerce/hat-photos.server.ts");
  const { MASTER } = await server.ssrLoadModule("/src/lib/studio-store.ts");
  const { isExcludedMediaSource } = await server.ssrLoadModule("/src/lib/media-policy.ts");
  // Validate every original before the first write. Paths cannot escape this private bundle.
  const checked = manifest.records.map((r) => {
    if (
      !["finished", "review", "reference", "hat_photo"].includes(r.kind) ||
      !/^[a-f0-9]{64}$/.test(r.sha256)
    )
      throw Error("Invalid reviewed record.");
    if (isExcludedMediaSource(r.driveId, r.sha256))
      throw Error(
        "This image was rejected for storefront use. Remove it from the reviewed import.",
      );
    if (r.kind === "hat_photo") {
      const model = MASTER.models.find((m) => m.id === r.modelId);
      if (
        r.verified !== true ||
        model?.bucket !== "ready" ||
        !model.colorways.some((c) => c.id === r.colorway)
      )
        throw Error("Exact active model and color must have review evidence before importing.");
    }
    const file = realpathSync(resolve(root, r.file)),
      rel = relative(root, file);
    if (
      isAbsolute(rel) ||
      rel === ".." ||
      rel.startsWith("..\\") ||
      rel.startsWith("../") ||
      statSync(file).size > 25_000_000
    )
      throw Error("Original must stay inside the reviewed bundle and fit the size limit.");
    const bytes = readFileSync(file);
    if (createHash("sha256").update(bytes).digest("hex") !== r.sha256)
      throw Error("Reviewed original hash changed.");
    return { ...r, bytes };
  });
  const results = [],
    groups = new Map();
  for (const r of checked) {
    const media = await importReviewedPhoto(r, actor);
    if (media.archived) {
      results.push({ key: r.key, id: media.id, duplicate: true, archived: true });
      continue;
    }
    let photoId;
    if (r.kind === "hat_photo") {
      if (r.verified !== true) throw Error("Exact model and color must have review evidence.");
      const [prior] =
        await sql`select h.id from commerce_hat_photos h join commerce_audit a on a.resource_id=h.id and a.action='hat_photo.registered' where h.model_id=${r.modelId} and h.colorway=${r.colorway} and a.after_value->>'sourceMediaId'=${media.id} limit 1`;
      photoId =
        prior?.id ??
        (
          await registerHatPhoto(
            {
              modelId: r.modelId,
              colorway: r.colorway,
              mediaId: media.id,
              verified: true,
              provenance: r.source,
            },
            actor,
          )
        ).id;
      // Each newly framed photograph is registered independently. No geometry is inherited.
    }
    if (r.kind === "finished") {
      const group = r.group || r.key;
      if (!groups.has(group)) groups.set(group, []);
      groups.get(group).push({ ...r, id: media.id });
    }
    results.push({
      key: r.key,
      id: media.id,
      duplicate: media.duplicate,
      kind: r.kind,
      ...(photoId ? { photoId } : {}),
    });
  }
  for (const [group, items] of groups) {
    const hash = createHash("sha256")
      .update("rec-reviewed-gallery:" + group)
      .digest("hex");
    const key =
      hash.slice(0, 8) +
      "-" +
      hash.slice(8, 12) +
      "-4" +
      hash.slice(13, 16) +
      "-a" +
      hash.slice(17, 20) +
      "-" +
      hash.slice(20, 32);
    const [prior] =
      await sql`select key from commerce_documents where scope='gallery' and key=${key}`;
    if (prior) continue; // Reruns preserve the owner's subsequent edits and publishing decision.
    await saveDocument(
      {
        scope: "gallery",
        key,
        version: 0,
        action: "draft",
        body: {
          title: items[0].name,
          description:
            "Finished-work source prepared for owner review. Confirm authenticity, publication permission and product details before publishing.",
          category: "Hats & engraved patches",
          tags: ["engraved", "owner-review"],
          mediaIds: items.map((x) => x.id),
          coverId: items[0].id,
          featured: false,
          consent: false,
          archived: false,
          family: items.every((x) => x.family === items[0].family) ? items[0].family || "" : "",
        },
      },
      actor,
    );
  }
  return results;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [manifest, ownerId, approvedCommit] = process.argv.slice(2);
  if (!manifest || !ownerId)
    throw Error("Supply the private manifest path and authenticated owner user ID.");
  if (process.env.VERCEL)
    throw Error(
      "Reviewed imports run from a controlled operator environment, not a deployment build.",
    );
  if (process.env.DATABASE_URL) {
    const head = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
    if (
      !/^[a-f0-9]{40}$/.test(approvedCommit || "") ||
      approvedCommit !== head ||
      process.env.REC_APPROVED_MEDIA_IMPORT_COMMIT !== head
    )
      throw Error(
        "Remote import requires separate owner release approval pinned to this exact commit.",
      );
  }
  const { createServer } = await import("vite");
  const server = await createServer({ server: { middlewareMode: true }, appType: "custom" });
  try {
    const result = await importReviewedBundle(server, { userId: ownerId, role: "owner" }, manifest);
    console.log(
      JSON.stringify({
        imported: result.filter((x) => !x.duplicate).length,
        duplicates: result.filter((x) => x.duplicate).length,
        automaticallyPublished: 0,
      }),
    );
  } finally {
    await server.close();
  }
}
