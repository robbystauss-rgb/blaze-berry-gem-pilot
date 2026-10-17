import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getSql, type Sql } from "@/lib/db";
import { audit, assertPermission } from "./core.server";
import { CONTENT_KEYS, type Role } from "./types";
import type { DocumentRow } from "./owner-schemas";
import { validateContentValue } from "./content-fields";

const input = z
  .object({
    key: z.enum(CONTENT_KEYS),
    version: z.number().int().min(0).optional(),
    legacyVersion: z.number().int().min(0).optional(),
    action: z.enum(["draft", "publish", "revert", "unpublish"]),
    body: z.object({ value: z.string().max(20000) }),
    revision: z.number().int().min(1).optional(),
    expectedValue: z.string().optional(),
  })
  .refine(
    (p) => p.version !== undefined || p.legacyVersion !== undefined,
    "A current version is required.",
  );
type Actor = { userId: string; role: Role };
export async function contentDocuments() {
  const sql = await getSql();
  const { readDocuments } = await import("./publishing.server");
  const result = await readDocuments("content");
  const published = await sql<{
    key: string;
    value: string;
    updated_at: string;
  }>`select key,value,updated_at from commerce_content`;
  for (const row of published)
    if (
      CONTENT_KEYS.includes(row.key as (typeof CONTENT_KEYS)[number]) &&
      !result.documents.some((d) => d.key === row.key)
    )
      result.documents.push({
        scope: "content",
        key: row.key,
        draft: { value: row.value },
        published: { value: row.value },
        version: 0,
        published_revision: 0,
        updated_at: row.updated_at,
      });
  return result;
}
/** Uses the existing draft/revision tables and existing public fields in one transaction. */
export async function saveContentDocument(raw: unknown, actor: Actor, connection?: Sql) {
  assertPermission(actor.role, "website");
  const p = input.parse(raw),
    sql = connection ?? (await getSql());
  const work = async (tx: Sql) => {
    await tx`select pg_advisory_xact_lock(hashtext(${"document:content:" + p.key}))`;
    const [before] = await tx<
      DocumentRow<{ value: string }>
    >`select * from commerce_documents where scope='content' and key=${p.key} for update`;
    const [live] = await tx<{
      value: string;
      version: number;
    }>`select value,version from commerce_content where key=${p.key} for update`;
    if (
      (p.version !== undefined && p.version !== (before?.version ?? 0)) ||
      (p.legacyVersion !== undefined && p.legacyVersion !== (live?.version ?? 0))
    )
      throw Error("Content changed. Refresh and review before saving.");
    if (p.expectedValue !== undefined && live?.value !== p.expectedValue)
      throw Error("Newer changes exist. Review current content instead.");
    let body = p.body;
    if (p.action === "revert") {
      const [old] = await tx<{
        body: { value: string };
      }>`select body from commerce_document_revisions where scope='content' and key=${p.key} and revision=${p.revision ?? 0}`;
      if (!old) throw Error("Published revision not found.");
      body = old.body;
    }
    body = { value: validateContentValue(p.key, body.value) };
    const publish = p.action === "publish" || p.action === "revert";
    if (p.action === "unpublish" && !(before ? before.published : live))
      throw Error("This content is not published.");
    // Capture pre-existing public text once so the first new publication is reversible.
    const baseline = !before && live ? 1 : 0;
    const oldRevision = before?.published_revision ?? baseline;
    const revision = oldRevision + (publish ? 1 : 0);
    const published = publish
      ? body
      : p.action === "unpublish"
        ? null
        : before
          ? before.published
          : live
            ? { value: live.value }
            : null;
    await tx`insert into commerce_documents(scope,key,draft,published,version,published_revision) values('content',${p.key},${JSON.stringify(body)},${published === null ? null : JSON.stringify(published)},1,${revision}) on conflict(scope,key) do update set draft=excluded.draft,published=excluded.published,version=commerce_documents.version+1,published_revision=excluded.published_revision,updated_at=now()`;
    if (baseline)
      await tx`insert into commerce_document_revisions(id,scope,key,revision,body,actor_id) values(${randomUUID()},'content',${p.key},1,${JSON.stringify({ value: live.value })},'system:existing-published-content')`;
    if (publish)
      await tx`insert into commerce_document_revisions(id,scope,key,revision,body,actor_id) values(${randomUUID()},'content',${p.key},${revision},${JSON.stringify(body)},${actor.userId})`;
    if (publish || p.action === "unpublish") {
      const value = publish ? body.value : "";
      await tx`insert into commerce_content(key,value) values(${p.key},${value}) on conflict(key) do update set value=excluded.value,version=commerce_content.version+1,updated_at=now()`;
      await audit(tx, actor.userId, "website.content_edited", "content", p.key, live ?? null, {
        value,
        revision,
      });
    } else
      await audit(
        tx,
        actor.userId,
        "website.content_draft_saved",
        "content",
        p.key,
        before?.draft ?? null,
        body,
      );
    return { id: p.key, version: (before?.version ?? 0) + 1, revision };
  };
  return connection ? work(connection) : sql.transaction(work);
}
