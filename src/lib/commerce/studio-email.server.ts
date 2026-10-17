import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getSql } from "@/lib/db";
import { audit } from "./core.server";
import { orderEmailConfig } from "./order-email.server";
import { documentByToken, studioAccess, studioBinary } from "./studio.server";
import type { Role } from "./types";
import type { InvoiceBody } from "./studio-schemas";
const input = z
  .object({
    id: z.string().uuid(),
    path: z.string().regex(/^\/(invoice|design-proof)\/[A-Za-z0-9_-]{43}$/),
    requestId: z.string().uuid(),
  })
  .strict();
const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object")
    return (
      "{" +
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => JSON.stringify(k) + ":" + canonical(v))
        .join(",") +
      "}"
    );
  return JSON.stringify(value);
}
export function trustedStudioOrigin(origin: string) {
  const u = new URL(origin);
  if (u.origin !== origin || u.username || u.password) throw Error("Invalid document origin.");
  if (
    [
      "https://recmamamade.com",
      "https://www.recmamamade.com",
      process.env.VERCEL_URL ? "https://" + process.env.VERCEL_URL : "",
      process.env.REC_STUDIO_ORIGIN ?? "",
    ].includes(origin) &&
    u.protocol === "https:"
  )
    return origin;
  if (
    process.env.NODE_ENV !== "production" &&
    ["localhost", "127.0.0.1"].includes(u.hostname) &&
    u.protocol === "http:"
  )
    return origin;
  throw Error("Use the verified storefront or configured preview origin.");
}
export async function sendStudioEmail(
  raw: unknown,
  actor: { userId: string; role: Role },
  origin: string,
  transport: typeof fetch = fetch,
) {
  studioAccess(actor);
  const p = input.parse(raw);
  origin = trustedStudioOrigin(origin);
  if (!orderEmailConfig().configured)
    throw Error("Configure the existing verified transactional sender before sending documents.");
  const sql = await getSql(),
    token = p.path.split("/").at(-1)!,
    d = await documentByToken(token, sql);
  if (
    !d ||
    d.id !== p.id ||
    p.path.split("/")[1] !== (d.kind === "invoice" ? "invoice" : "design-proof")
  )
    throw Error("Use the current private link for this document.");
  const b = d.body as InvoiceBody,
    to = b.customerEmail,
    subject = `REC Mama Made - ${d.kind === "invoice" ? "Invoice" : "Design Proof"} #${d.number}${d.proof_version ? " / version " + d.proof_version : ""}`;
  if (!z.email().safeParse(to).success) throw Error("A valid recorded customer email is required.");
  const pdf = await studioBinary(d.id, actor, null, "pdf");
  if (!pdf) throw Error("Document PDF unavailable.");
  const message =
    d.kind === "invoice"
      ? "View your itemized invoice and pay securely through Stripe. Payment status follows verified provider events."
      : "Review this exact proof version, then approve it or request changes. Approval is separate from payment.";
  const payload = {
    from: process.env.REC_ORDER_EMAIL_FROM!,
    to: [to],
    subject,
    text: `${subject}\n${message}\n${origin + p.path}`,
    html: `<html lang="en"><body style="font-family:Arial,sans-serif;color:#282523;background:#fffcf9;padding:24px"><h1>${escape(subject)}</h1><p>${escape(message)}</p><p><a style="display:inline-block;padding:16px;background:#a36f64;color:white" href="${escape(origin + p.path)}">${d.kind === "invoice" ? "View invoice / pay" : "Review design proof"}</a></p><p>This private link is intended for the recorded customer. Keep it private.</p></body></html>`,
    attachments: [
      {
        filename: `REC-${d.kind}-${d.number}${d.proof_version ? "-v" + d.proof_version : ""}.pdf`,
        content: Buffer.from(pdf.bytes).toString("base64"),
        content_type: "application/pdf",
      },
    ],
  };
  if (Buffer.byteLength(JSON.stringify(payload)) > 30_000_000)
    throw Error("PDF is too large for safe email delivery. Use the private download link.");
  const claim = await sql.transaction(async (tx) => {
    await tx`select pg_advisory_xact_lock(hashtext(${"studio-email:" + p.requestId}))`;
    const [old] = await tx<{
      id: string;
      document_id: string;
      payload: typeof payload;
      state: string;
      created_at: string;
      updated_at: string;
    }>`select * from commerce_studio_emails where request_id=${p.requestId} for update`;
    if (old && (old.document_id !== d.id || canonical(old.payload) !== canonical(payload)))
      throw Error("Email request contents changed. Review before starting a new send.");
    if (old && ["accepted", "delivered"].includes(old.state))
      return { id: old.id, skip: true, state: old.state };
    if (old?.state === "sending" && Date.now() - new Date(old.updated_at).getTime() < 120000)
      throw Error("This email is already being submitted.");
    if (
      old &&
      (old.state === "failed" || Date.now() - new Date(old.created_at).getTime() > 23 * 3600000)
    )
      throw Error("This delivery requires owner review; an automatic repeat is not safe.");
    const id = old?.id ?? randomUUID();
    if (old)
      await tx`update commerce_studio_emails set state='sending',attempts=attempts+1,updated_at=now() where id=${id}`;
    else
      await tx`insert into commerce_studio_emails(id,document_id,request_id,payload,state,attempts) values(${id},${d.id},${p.requestId},${JSON.stringify(payload)},'sending',1)`;
    return { id, skip: false, state: "sending" };
  });
  if (claim.skip) return { id: claim.id, state: claim.state };
  let providerId: string | null = null,
    permanent = false;
  try {
    const r = await transport("https://api.resend.com/emails", {
      method: "POST",
      signal: AbortSignal.timeout(10000),
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        "Idempotency-Key": "rec-studio:" + p.requestId,
      },
      body: JSON.stringify(payload),
    });
    if (r.ok) {
      const j = (await r.json()) as { id?: string };
      if (typeof j.id === "string" && j.id.length <= 200) providerId = j.id;
    } else permanent = r.status >= 400 && r.status < 500 && ![408, 409, 429].includes(r.status);
  } catch {
    /* An uncertain send retains the same request key and frozen payload. */
  }
  const state = providerId ? "accepted" : permanent ? "failed" : "pending";
  await sql.transaction(async (tx) => {
    await tx`update commerce_studio_emails set state=${state},provider_id=${providerId},last_error=${providerId ? null : permanent ? "Provider rejected this message. Review sender and recipient." : "Delivery is uncertain. Retry this same request key within 23 hours."},updated_at=now() where id=${claim.id}`;
    await audit(tx, actor.userId, `${d.kind}.email_${state}`, "studio_document", d.id, null, {
      emailId: claim.id,
      state,
    });
  });
  if (!providerId)
    throw Error(
      "Email was not confirmed accepted. Retry the same request or review its delivery history.",
    );
  return { id: claim.id, state };
}
export async function refreshStudioDelivery(
  id: string,
  actor: { userId: string; role: Role },
  transport: typeof fetch = fetch,
) {
  studioAccess(actor);
  const sql = await getSql();
  const [email] = await sql<{
    provider_id: string;
    document_id: string;
    payload: { to: string[] };
  }>`select provider_id,document_id,payload from commerce_studio_emails where id=${id}`;
  if (!email?.provider_id) throw Error("No accepted provider message exists.");
  const r = await transport(
    "https://api.resend.com/emails/" + encodeURIComponent(email.provider_id),
    {
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
      signal: AbortSignal.timeout(10000),
    },
  );
  if (!r.ok) throw Error("Provider delivery status unavailable.");
  const result = (await r.json()) as { id: string; to: string[]; last_event: string };
  if (result.id !== email.provider_id || !result.to?.includes(email.payload.to[0]))
    throw Error("Provider message association mismatch.");
  const state =
    result.last_event === "delivered"
      ? "delivered"
      : ["bounced", "failed", "complained"].includes(result.last_event)
        ? "failed"
        : "accepted";
  await sql`update commerce_studio_emails set state=${state},last_error=${state === "failed" ? "Provider reported failed delivery." : null},updated_at=now() where id=${id}`;
  return { state };
}
