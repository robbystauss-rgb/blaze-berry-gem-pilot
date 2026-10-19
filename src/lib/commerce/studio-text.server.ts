import { z } from "zod";
import { getSql, type Sql } from "@/lib/db";
import { audit } from "./core.server";
import { STUDIO_SELECT, studioAccess, documentByToken } from "./studio.server";
import { trustedStudioOrigin } from "./studio-email.server";
import { studioContactSchema, studioTextSchema, studioTextMessage } from "./studio-text";
import type { InvoiceBody, StudioRow } from "./studio-schemas";
import type { Role } from "./types";
type Actor = { userId: string; role: Role };
export type StudioContact = { phone: string; version: number };
async function contactKey(sql: Sql, id: string) {
  const [doc] = await sql.query<StudioRow>(STUDIO_SELECT + " where id=$1", [id]);
  if (!doc) throw Error("Document not found.");
  const email = z.email().safeParse((doc.body as InvoiceBody).customerEmail);
  if (!email.success) throw Error("Save a document with a valid customer email first.");
  return email.data.toLowerCase();
}
export async function readStudioContact(
  id: string,
  actor: Actor,
  tx?: Sql,
): Promise<StudioContact> {
  studioAccess(actor);
  const sql = tx ?? (await getSql()),
    email = await contactKey(sql, z.string().uuid().parse(id));
  const [contact] =
    await sql<StudioContact>`select phone,version from commerce_customer_contacts where customer_email=${email}`;
  return contact ?? { phone: "", version: 0 };
}
export async function saveStudioContact(raw: unknown, actor: Actor) {
  studioAccess(actor);
  const p = studioContactSchema.parse(raw),
    sql = await getSql();
  return sql.transaction(async (tx) => {
    const email = await contactKey(tx, p.id);
    await tx`select pg_advisory_xact_lock(hashtext(${"studio-contact:" + email}))`;
    const [previous] =
      await tx<StudioContact>`select phone,version from commerce_customer_contacts where customer_email=${email} for update`;
    if ((previous?.version ?? 0) !== p.version)
      throw Error("Customer phone changed. Reopen the document before saving.");
    const version = p.version + 1;
    await tx`insert into commerce_customer_contacts(customer_email,phone,version,actor_id) values(${email},${p.phone},${version},${actor.userId}) on conflict(customer_email) do update set phone=excluded.phone,version=excluded.version,actor_id=excluded.actor_id,updated_at=now()`;
    // Audit the operation without duplicating private contact values or tokens.
    await audit(tx, actor.userId, "studio.customer_phone_updated", "studio_document", p.id, null, {
      phonePresent: !!p.phone,
      version,
    });
    return { phone: p.phone, version };
  });
}
export async function prepareStudioText(raw: unknown, actor: Actor, origin: string) {
  studioAccess(actor);
  const p = studioTextSchema.parse(raw),
    sql = await getSql();
  origin = trustedStudioOrigin(origin);
  const doc = await documentByToken(p.path.split("/").at(-1)!, sql);
  if (
    !doc ||
    doc.id !== p.id ||
    p.path.split("/")[1] !== (doc.kind === "invoice" ? "invoice" : "design-proof")
  )
    throw Error("Use the current, unexpired private link for this document.");
  const contact = await readStudioContact(p.id, actor, sql);
  if (!contact.phone) throw Error("Save a customer phone number before texting.");
  return {
    ...contact,
    message: studioTextMessage(doc.kind, origin + p.path),
    expiresAt: doc.expires_at!,
  };
}
