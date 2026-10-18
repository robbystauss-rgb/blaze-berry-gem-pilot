import { createHash, randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import { getSql, type Sql } from "@/lib/db";
import {
  audit,
  assertPermission,
  orderById,
  reserveInventory,
  notify,
  ORDER_SELECT,
} from "./core.server";
import {
  saveStudioSchema,
  studioActionSchema,
  answerProofSchema,
  studioToken,
  invoiceTotals,
  type StudioRow,
  type InvoiceBody,
  type ProofBody,
  type BusinessSender,
} from "./studio-schemas";
import type { Role, OrderRow } from "./types";
import { studioPdf, appendStudioStatement } from "./studio-pdf.server";
import { money, label } from "./types";
import { businessMidnight, shiftBusinessDay } from "./business-dates";
import { assertMediaPublicationAllowed } from "./media-policy.server";
type Actor = { userId: string; role: Role };
export const STUDIO_SELECT =
  "select id,kind,number,order_id,state,body,sender,subtotal,total,version,proof_version,expires_at,issued_at,responded_at,response,created_at,(select i.state from commerce_invoices i where i.order_id=commerce_studio_documents.order_id) as provider_state from commerce_studio_documents";
const hash = (t: string) => createHash("sha256").update(t).digest("hex");
export function studioAccess(actor: Actor) {
  assertPermission(actor.role, "finance");
}
export async function businessSender(sql: Sql): Promise<BusinessSender> {
  const rows = await sql<{
    key: string;
    value: string;
  }>`select key,value from commerce_content where key in ('contact_email','contact_phone')`;
  const values = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const address = process.env.REC_BUSINESS_ADDRESS?.trim() ?? "";
  return {
    name: "REC Mama Made",
    email: z.email().safeParse(values.contact_email).success ? values.contact_email : "",
    phone: values.contact_phone ?? "",
    address,
    website: "https://recmamamade.com",
  };
}
function initialOnly(stage: string) {
  if (!["new", "artwork_review", "customer_approval", "ready_for_production"].includes(stage))
    throw Error("Proofs cannot change after production has started or the order is closed.");
}
async function lockDoc(tx: Sql, id: string) {
  await tx`select pg_advisory_xact_lock(hashtext(${"studio:" + id}))`;
  return (await tx.query<StudioRow>(STUDIO_SELECT + " where id=$1 for update", [id]))[0];
}
export async function listStudio(kind: "invoice" | "proof", actor: Actor) {
  studioAccess(actor);
  const sql = await getSql();
  return {
    documents: await sql.query<StudioRow>(
      STUDIO_SELECT + " where kind=$1 order by created_at desc limit 300",
      [kind],
    ),
    orders: await sql.query<OrderRow>(ORDER_SELECT + " order by o.created_at desc limit 300"),
    media:
      kind === "proof"
        ? await sql<{
            id: string;
            name: string;
          }>`select id,name from commerce_media where not archived order by created_at desc limit 500`
        : [],
  };
}
export async function saveStudio(raw: unknown, actor: Actor) {
  studioAccess(actor);
  const p = saveStudioSchema.parse(raw),
    sql = await getSql();
  return sql.transaction(async (tx) => {
    let body: InvoiceBody | ProofBody = p.body,
      subtotal = 0,
      total = 0,
      proofVersion: number | null = null;
    let order;
    if (p.orderId) {
      order = await orderById(tx, p.orderId, true);
      if (p.kind === "proof") initialOnly(order.stage);
    }
    const previous = await lockDoc(tx, p.id);
    if (previous && (previous.kind !== p.kind || previous.order_id !== p.orderId))
      throw Error("Document association cannot change.");
    if (previous?.state !== undefined && previous.state !== "draft")
      throw Error("Issued documents are frozen. Create a new draft/version.");
    if ((previous?.version ?? 0) !== p.version)
      throw Error("Document changed. Refresh before saving.");
    if (p.kind === "invoice") {
      const totals = invoiceTotals(p.body);
      subtotal = totals.subtotal;
      total = totals.total;
      if (order) {
        if (order.paid > 0 || order.stage === "canceled")
          throw Error("Use an unpaid, uncanceled order.");
        const items = await tx<{
          id: string;
          title: string;
          quantity: number;
          unit_amount: number;
          specifications: Record<string, unknown>;
        }>`select id,title,quantity,unit_amount,specifications from commerce_order_items where order_id=${order.id}`;
        body = {
          ...p.body,
          customerName: order.customer_name,
          customerEmail: order.customer_email,
          shipping: order.shipping,
          tax: order.tax,
          discount: order.discount,
          lines: items.map((i) => ({
            id: i.id,
            title: i.title,
            quantity: i.quantity,
            unitAmount: i.unit_amount,
            kind: "product" as const,
            productKey: "",
            specifications:
              typeof i.specifications.instructions === "string"
                ? i.specifications.instructions
                : "Recorded order customization",
          })),
        };
        subtotal = order.subtotal;
        total = order.total;
      }
    } else {
      await assertMediaPublicationAllowed(tx, p.body.mediaIds);
      for (const mediaId of p.body.mediaIds) {
        const [m] = await tx`select id from commerce_media where id=${mediaId} and not archived`;
        if (!m) throw Error("Select existing available proof media.");
      }
      body = {
        ...p.body,
        customerName: order!.customer_name,
        customerEmail: order!.customer_email,
      } as ProofBody;
      proofVersion =
        previous?.proof_version ??
        (
          await tx<{
            next: number;
          }>`select coalesce(max(proof_version),0)::int+1 as next from commerce_studio_documents where order_id=${p.orderId}`
        )[0].next;
      await tx`insert into commerce_proof_controls(order_id,required) values(${p.orderId},true) on conflict(order_id) do update set required=true,updated_at=now()`;
    }
    if (previous)
      await tx`update commerce_studio_documents set body=${JSON.stringify(body)},subtotal=${subtotal},total=${total},version=version+1,updated_at=now() where id=${p.id}`;
    else
      await tx`insert into commerce_studio_documents(id,kind,order_id,body,subtotal,total,proof_version,actor_id) values(${p.id},${p.kind},${p.orderId},${JSON.stringify(body)},${subtotal},${total},${proofVersion},${actor.userId})`;
    await audit(
      tx,
      actor.userId,
      `${p.kind}.draft_saved`,
      "studio_document",
      p.id,
      previous ? { version: previous.version } : null,
      { version: p.version + 1, total },
    );
    return { id: p.id, version: p.version + 1 };
  });
}
export async function invoiceFromOrder(orderId: string, actor: Actor) {
  studioAccess(actor);
  const sql = await getSql(),
    order = await orderById(sql, orderId);
  const [prior] = await sql<{
    id: string;
  }>`select id from commerce_studio_documents where kind='invoice' and order_id=${orderId} and state<>'void'`;
  return {
    order,
    existingId: prior?.id ?? null,
    items: await sql<{
      id: string;
      title: string;
      quantity: number;
      unit_amount: number;
      specifications: { instructions?: string };
    }>`select id,title,quantity,unit_amount,specifications from commerce_order_items where order_id=${orderId}`,
  };
}
export async function studioOwnerDocument(id: string, actor: Actor) {
  studioAccess(actor);
  const sql = await getSql();
  const [doc] = await sql.query<StudioRow>(STUDIO_SELECT + " where id=$1", [id]);
  if (!doc) throw Error("Document not found.");
  return {
    document: doc,
    financial: doc.order_id ? await orderById(sql, doc.order_id) : null,
    payments:
      doc.kind === "invoice" && doc.order_id
        ? await sql<{
            amount: number;
            kind: string;
            occurred_at: string;
          }>`select amount,kind,occurred_at from commerce_payments where order_id=${doc.order_id} order by occurred_at`
        : [],
    audit: await sql<{
      actor_id: string;
      action: string;
      created_at: string;
    }>`select actor_id,action,created_at from commerce_audit where (resource_type='studio_document' and resource_id=${id}) or (resource_type='order' and resource_id=${doc.order_id} and action like 'invoice.%') order by created_at desc limit 100`,
    emails: await sql<{
      id: string;
      state: string;
      provider_id: string | null;
      attempts: number;
      last_error: string | null;
      created_at: string;
    }>`select id,state,provider_id,attempts,last_error,created_at from commerce_studio_emails where document_id=${id} order by created_at desc`,
  };
}
async function imagesFor(tx: Sql, doc: StudioRow) {
  if (doc.kind !== "proof") return [];
  if (doc.state !== "draft")
    return tx<{
      bytes: Uint8Array;
      mime: string;
    }>`select bytes,mime from commerce_studio_images where document_id=${doc.id} order by position`;
  const out = [];
  for (const id of (doc.body as ProofBody).mediaIds) {
    const [m] = await tx<{
      bytes: Uint8Array;
      mime: string;
    }>`select a.bytes,a.mime from commerce_media m join commerce_assets a on a.id=m.id where m.id=${id} and not m.archived`;
    if (!m) throw Error("Proof image unavailable.");
    out.push(m);
  }
  return out;
}
export async function prepareStudioPayment(
  id: string,
  actor: Actor,
  client?: import("stripe").default,
) {
  studioAccess(actor);
  const { document: d } = await studioOwnerDocument(id, actor);
  if (d.kind !== "invoice" || d.state !== "issued" || !d.order_id)
    throw Error("Issue the invoice before preparing payment.");
  const due =
    new Date(businessMidnight(shiftBusinessDay((d.body as InvoiceBody).dueDate, 1))).getTime() -
    1000;
  if (due <= Date.now())
    throw Error("A future due date is required to create a new provider invoice.");
  const { manageInvoice } = await import("./invoices.server");
  const sql = await getSql();
  const [candidate] = await sql<{
    provider_id: string | null;
    state: string;
  }>`select provider_id,state from commerce_invoices where order_id=${d.order_id}`;
  let verifiedVoidId: string | null = null;
  if (candidate?.state === "void" && candidate.provider_id) {
    const stripe = client ?? (await import("./providers.server")).stripeClient();
    const prior = await stripe.invoices.retrieve(candidate.provider_id);
    if (prior.status !== "void" || prior.metadata?.rec_order_id !== d.order_id)
      throw Error("Reconcile the previous provider invoice before preparing payment.");
    if (prior.metadata?.rec_studio_document_id === d.id)
      throw Error(
        "Void this Studio document and issue a replacement before creating a new payment obligation.",
      );
    verifiedVoidId = prior.id;
  }
  await sql.transaction(async (tx) => {
    const order = await orderById(tx, d.order_id!, true);
    if (order.paid > 0)
      throw Error("This order already has a payment. Reconcile the current provider invoice.");
    const [previous] = await tx<{
      provider_id: string;
      state: string;
      snapshot: Record<string, unknown>;
    }>`select provider_id,state,to_jsonb(i) as snapshot from commerce_invoices i where order_id=${d.order_id} for update`;
    if (previous?.state === "void" && previous.provider_id) {
      if (previous.provider_id !== verifiedVoidId)
        throw Error("The provider invoice changed. Refresh before preparing payment.");
      await tx`insert into commerce_invoice_history(provider_id,order_id,snapshot,actor_id) values(${previous.provider_id},${d.order_id},${JSON.stringify(previous.snapshot)},${actor.userId}) on conflict do nothing`;
      await tx`update commerce_invoices set provider_id=null,state='draft',hosted_url=null,pdf_url=null,sent_at=null,last_error=null,updated_at=now() where order_id=${d.order_id}`;
      await audit(
        tx,
        actor.userId,
        "invoice.voided_provider_archived",
        "studio_document",
        d.id,
        null,
        { providerId: previous.provider_id, orderId: d.order_id },
      );
    }
  });
  return manageInvoice(d.order_id, "create", actor.userId, client, {
    dueDate: Math.floor(due / 1000),
    documentId: d.id,
  });
}
export async function actOnStudio(raw: unknown, actor: Actor) {
  studioAccess(actor);
  const p = studioActionSchema.parse(raw),
    sql = await getSql();
  if (p.action === "prepare_payment")
    return { ...(await prepareStudioPayment(p.id, actor)), path: null };
  if (p.action === "void") {
    const { document: d } = await studioOwnerDocument(p.id, actor);
    if (d.kind !== "invoice" || !d.order_id || d.state !== "issued" || d.version !== p.version)
      throw Error("Refresh the issued invoice before voiding.");
    const [provider] =
      await sql`select provider_id,state from commerce_invoices where order_id=${d.order_id}`;
    if (provider?.provider_id && provider.state !== "void")
      await (await import("./invoice-void.server")).voidInvoice(d.order_id, actor.userId);
  }
  return sql.transaction(async (tx) => {
    const [candidate] = await tx<{
      order_id: string | null;
    }>`select order_id from commerce_studio_documents where id=${p.id}`;
    let order = candidate?.order_id ? await orderById(tx, candidate.order_id, true) : null;
    const d = await lockDoc(tx, p.id);
    if (!d || d.version !== p.version) throw Error("Document changed. Refresh before continuing.");
    if (p.action === "void") {
      if (d.kind !== "invoice" || d.state !== "issued" || !order || order.paid > 0)
        throw Error("Only an unpaid issued invoice may be voided.");
      const [provider] = await tx<{
        provider_id: string | null;
        state: string;
      }>`select provider_id,state from commerce_invoices where order_id=${order.id} for update`;
      if (provider?.state === "processing" || (provider?.provider_id && provider.state !== "void"))
        throw Error(
          "Wait for provider reconciliation and confirmed void before closing this invoice.",
        );
      await tx`update commerce_studio_documents set state='void',token_hash=null,version=version+1,updated_at=now() where id=${d.id}`;
      await audit(tx, actor.userId, "invoice.voided", "studio_document", d.id, null, {
        orderId: d.order_id,
      });
      return { path: null };
    }
    if (p.action === "withdraw") {
      if (d.kind !== "proof" || !order) throw Error("Use Void for an invoice.");
      initialOnly(order.stage);
      await tx`update commerce_studio_documents set state='withdrawn',token_hash=null,version=version+1,updated_at=now() where id=${d.id}`;
      await audit(tx, actor.userId, "proof.withdrawn", "studio_document", d.id, null, {});
      return { path: null };
    }
    if (p.action === "rotate") {
      if (["draft", "void", "withdrawn", "superseded"].includes(d.state))
        throw Error("This document has no active customer link.");
      const token = randomBytes(32).toString("base64url"),
        expires =
          d.kind === "proof"
            ? (d.body as ProofBody).expiresAt
            : new Date(Date.now() + 30 * 86400000).toISOString();
      if (new Date(expires).getTime() <= Date.now())
        throw Error("Create a new proof version with a future expiration.");
      await tx`update commerce_studio_documents set token_hash=${hash(token)},expires_at=${expires},version=version+1,updated_at=now() where id=${d.id}`;
      await audit(tx, actor.userId, `${d.kind}.link_rotated`, "studio_document", d.id, null, {});
      return { path: `/${d.kind === "invoice" ? "invoice" : "design-proof"}/${token}` };
    }
    if (d.state !== "draft") throw Error("Only a draft may be issued. Refresh before continuing.");
    const sender = await businessSender(tx),
      token = randomBytes(32).toString("base64url");
    let expires: string;
    if (d.kind === "invoice") {
      const b = d.body as InvoiceBody;
      if (!b.totalsConfirmed || !b.availabilityConfirmed)
        throw Error("Confirm the complete total and availability before issuing.");
      expires = new Date(Date.now() + 30 * 86400000).toISOString();
      if (new Date(businessMidnight(shiftBusinessDay(b.dueDate, 1))).getTime() <= Date.now())
        throw Error("Choose a future due date.");
      if (!order) {
        const orderId = randomUUID();
        await tx`insert into commerce_orders(id,customer_name,customer_email,source,subtotal,discount,shipping,tax,total) values(${orderId},${b.customerName},${b.customerEmail},'studio_invoice',${d.subtotal},${b.discount},${b.shipping},${b.tax},${d.total})`;
        for (const l of b.lines) {
          if (l.productKey) {
            const [rule] =
              await tx`select product_key from commerce_inventory_rules where product_key=${l.productKey} limit 1`;
            if (!rule) throw Error("Review the selected stock mapping before issue.");
          }
          await tx`insert into commerce_order_items(id,order_id,product_key,title,quantity,fulfilled_quantity,unit_amount,specifications) values(${randomUUID()},${orderId},${l.productKey || `studio:${d.id}:${l.id}`},${l.title},${l.quantity},${l.quantity},${l.unitAmount},${JSON.stringify({ instructions: l.specifications, studioInvoiceId: d.id, terms: b.terms })})`;
        }
        await reserveInventory(tx, orderId, actor.userId);
        order = await orderById(tx, orderId, true);
        d.order_id = orderId;
      } else {
        if (order.total !== d.total || order.paid > 0 || order.stage === "canceled")
          throw Error("The order is no longer eligible for this invoice.");
        const [checkout] =
          await tx`select reference from commerce_checkouts where order_id=${order.id}`;
        if (checkout)
          throw Error(
            "The existing checkout owns this payment obligation. Reconcile it before issuing a separate invoice.",
          );
      }
      if (b.requiresProof) {
        initialOnly(order.stage);
        await tx`insert into commerce_proof_controls(order_id,required) values(${order.id},true) on conflict(order_id) do update set required=true,updated_at=now()`;
      }
    } else {
      if (!order) throw Error("Select the exact proof order.");
      initialOnly(order.stage);
      expires = (d.body as ProofBody).expiresAt;
      if (new Date(expires).getTime() <= Date.now())
        throw Error("Choose a future proof expiration.");
      const [current] = await tx<{
        current_proof_id: string | null;
      }>`select current_proof_id from commerce_proof_controls where order_id=${order.id} for update`;
      const [latest] = await tx<{
        max: number;
      }>`select coalesce(max(proof_version),0)::int as max from commerce_studio_documents where order_id=${order.id} and kind='proof' and state<>'draft'`;
      if ((d.proof_version ?? 0) <= latest.max)
        throw Error("A newer proof version exists. Create a new draft.");
      if (current?.current_proof_id)
        await tx`update commerce_studio_documents set state='superseded',token_hash=null,version=version+1,updated_at=now() where id=${current.current_proof_id}`;
      await tx`insert into commerce_proof_controls(order_id,required,current_proof_id) values(${order.id},true,${d.id}) on conflict(order_id) do update set required=true,current_proof_id=${d.id},updated_at=now()`;
    }
    const images = await imagesFor(tx, d);
    d.sender = sender;
    d.state = d.kind === "invoice" ? "issued" : "awaiting_approval";
    d.issued_at = new Date().toISOString();
    const pdf = await studioPdf(d, images);
    for (let i = 0; i < images.length; i++)
      await tx`insert into commerce_studio_images(document_id,position,mime,bytes) values(${d.id},${i},${images[i].mime},${images[i].bytes})`;
    await tx`update commerce_studio_documents set state=${d.state},order_id=${d.order_id},sender=${JSON.stringify(sender)},pdf=${pdf},issued_at=now(),token_hash=${hash(token)},expires_at=${expires},version=version+1,updated_at=now() where id=${d.id}`;
    await audit(tx, actor.userId, `${d.kind}.issued`, "studio_document", d.id, null, {
      number: d.number,
      proofVersion: d.proof_version,
      orderId: d.order_id,
      total: d.total,
    });
    return { path: `/${d.kind === "invoice" ? "invoice" : "design-proof"}/${token}` };
  });
}
export async function documentByToken(token: string, tx?: Sql) {
  if (!studioToken.safeParse(token).success) return null;
  const sql = tx ?? (await getSql());
  const [d] = await sql.query<StudioRow>(
    STUDIO_SELECT +
      " where token_hash=$1 and expires_at>now() and state not in ('draft','void','withdrawn','superseded')",
    [hash(token)],
  );
  return d ?? null;
}
export async function viewStudio(token: string) {
  const sql = await getSql(),
    d = await documentByToken(token, sql);
  if (!d) return null;
  const order = d.order_id ? await orderById(sql, d.order_id) : null;
  const [provider] =
    d.kind === "invoice"
      ? await sql<{
          state: string;
          hosted_url: string | null;
        }>`select state,hosted_url from commerce_invoices where order_id=${d.order_id}`
      : [];
  const paid = order?.paid ?? 0,
    refunded = order?.refunded ?? 0;
  const status =
    d.kind === "proof"
      ? d.state
      : provider?.state === "void"
        ? "void"
        : order?.payment_status === "disputed"
          ? "disputed"
          : refunded > 0
            ? refunded >= paid
              ? "refunded"
              : "partially_refunded"
            : paid >= d.total
              ? "paid"
              : paid > 0
                ? "partially_paid"
                : order?.payment_status === "failed"
                  ? "failed"
                  : new Date(
                        businessMidnight(shiftBusinessDay((d.body as InvoiceBody).dueDate, 1)),
                      ).getTime() < Date.now()
                    ? "overdue"
                    : provider?.state === "void"
                      ? "void"
                      : "unpaid";
  const payable =
    d.kind === "invoice" &&
    d.state === "issued" &&
    paid < d.total &&
    refunded === 0 &&
    order?.payment_status !== "disputed" &&
    provider?.state === "open";
  return {
    document: d,
    status,
    balance: Math.max(0, d.total - paid + refunded),
    paid,
    refunded,
    payable: !!payable,
    imageCount: d.kind === "proof" ? (d.body as ProofBody).mediaIds.length : 0,
    payments:
      d.kind === "invoice"
        ? await sql<{
            amount: number;
            kind: string;
            occurred_at: string;
          }>`select amount,kind,occurred_at from commerce_payments where order_id=${d.order_id} order by occurred_at`
        : [],
  };
}
export async function payStudio(token: string) {
  const v = await viewStudio(token);
  if (!v?.payable || !v.document.order_id)
    throw Error("This invoice is not available for payment.");
  const sql = await getSql();
  const [p] = await sql<{
    hosted_url: string;
  }>`select hosted_url from commerce_invoices where order_id=${v.document.order_id} and state='open'`;
  if (
    !p?.hosted_url ||
    new URL(p.hosted_url).protocol !== "https:" ||
    new URL(p.hosted_url).hostname !== "invoice.stripe.com"
  )
    throw Error("The verified provider payment link is unavailable.");
  return { url: p.hosted_url };
}
export async function answerProof(raw: unknown) {
  const p = answerProofSchema.parse(raw),
    sql = await getSql();
  return sql.transaction(async (tx) => {
    const candidate = await documentByToken(p.token, tx);
    if (!candidate || candidate.kind !== "proof" || !candidate.order_id)
      throw Error("This proof link is unavailable or expired.");
    const order = await orderById(tx, candidate.order_id, true),
      d = await lockDoc(tx, candidate.id);
    const active = await documentByToken(p.token, tx);
    if (!d || !active) throw Error("This proof link changed or expired.");
    const [control] = await tx<{
      current_proof_id: string;
    }>`select current_proof_id from commerce_proof_controls where order_id=${order.id}`;
    if (control?.current_proof_id !== d.id) throw Error("Only the current proof can be answered.");
    const body = d.body as ProofBody & { customerEmail: string };
    if (p.email.toLowerCase() !== body.customerEmail.toLowerCase())
      throw Error("Use the customer email associated with this proof.");
    const target = p.action === "approve" ? "approved" : "changes_requested";
    if (
      d.state === target &&
      d.response?.name === p.name &&
      d.response?.email === p.email.toLowerCase() &&
      d.response?.message === p.message
    )
      return { state: target, proofVersion: d.proof_version, respondedAt: d.responded_at };
    if (d.version !== p.version || d.state !== "awaiting_approval")
      throw Error("This version has already been answered or changed. Refresh the proof.");
    const response = {
      name: p.name,
      email: p.email.toLowerCase(),
      message: p.message,
      action: p.action,
    };
    const [row] = await tx<{
      responded_at: string;
    }>`update commerce_studio_documents set state=${target},response=${JSON.stringify(response)},responded_at=now(),version=version+1,updated_at=now() where id=${d.id} returning responded_at`;
    await audit(tx, "proof-recipient", `proof.${target}`, "studio_document", d.id, null, {
      proofVersion: d.proof_version,
      orderId: order.id,
      action: p.action,
    });
    await notify(
      tx,
      `proof-response:${d.id}`,
      `Design proof v${d.proof_version}: ${target.replaceAll("_", " ")}`,
      order.id,
    );
    return { state: target, proofVersion: d.proof_version, respondedAt: row.responded_at };
  });
}
export async function studioBinary(
  id: string,
  actor: Actor | null,
  token: string | null,
  mode: "pdf" | "image",
  position = 0,
) {
  const sql = await getSql();
  let d: StudioRow | null | undefined;
  if (actor) {
    studioAccess(actor);
    d = (await sql.query<StudioRow>(STUDIO_SELECT + " where id=$1", [id]))[0];
  } else if (token) {
    d = await documentByToken(token, sql);
    if (d?.id !== id) return null;
  }
  if (!d) return null;
  if (mode === "image") {
    const images = await imagesFor(sql, d);
    return images[position] ?? null;
  }
  const [saved] = await sql<{
    pdf: Uint8Array | null;
  }>`select pdf from commerce_studio_documents where id=${d.id}`;
  let bytes =
    saved?.pdf ??
    (await studioPdf(
      { ...d, sender: d.sender ?? (await businessSender(sql)) },
      await imagesFor(sql, d),
    ));
  if (d.kind === "invoice" && d.order_id && d.state !== "draft") {
    const order = await orderById(sql, d.order_id);
    if (d.state === "void" || d.provider_state === "void")
      return {
        bytes: await appendStudioStatement(bytes, "Invoice void record", [
          `Invoice INV-${String(d.number).padStart(5, "0")}`,
          "Current status: Void",
          "No payment may be collected under this voided document.",
          `Original issued total: ${money(d.total)}`,
          "Any replacement invoice and subsequent order payments are recorded separately. The preceding issued snapshot remains unchanged.",
        ]),
        mime: "application/pdf",
      };
    const overdue =
      new Date(businessMidnight(shiftBusinessDay((d.body as InvoiceBody).dueDate, 1))).getTime() <
      Date.now();
    if (
      order.paid > 0 ||
      d.state === "void" ||
      order.payment_status === "failed" ||
      order.payment_status === "disputed" ||
      overdue
    ) {
      const payments = await sql<{
        kind: string;
        amount: number;
        occurred_at: string;
      }>`select kind,amount,occurred_at from commerce_payments where order_id=${d.order_id} order by occurred_at`;
      bytes = await appendStudioStatement(bytes, "Invoice payment statement", [
        `Invoice INV-${String(d.number).padStart(5, "0")}`,
        `Current status: ${label(d.state === "void" ? "void" : order.payment_status === "unpaid" && overdue ? "overdue" : order.payment_status)}`,
        `Issued total: ${money(d.total)}`,
        `Payments received: ${money(order.paid)}`,
        `Refunds: ${money(order.refunded)}`,
        `Balance: ${money(Math.max(0, d.total - order.paid + order.refunded))}`,
        ...payments.map((p) => `${label(p.kind)}: ${money(p.amount)} | ${p.occurred_at}`),
        "Payment records come from the verified order ledger. The preceding issued amounts remain unchanged.",
      ]);
    }
  } else if (
    d.kind === "proof" &&
    d.state !== "draft" &&
    (d.response || d.state !== "awaiting_approval")
  ) {
    bytes = await appendStudioStatement(bytes, "Separate proof response record", [
      `Proof P-${String(d.number).padStart(5, "0")} / version ${d.proof_version}`,
      `Current status: ${label(d.state)}`,
      ...(d.response
        ? [
            `Response: ${label(d.response.action)}`,
            `Respondent: ${d.response.name} | ${d.response.email}`,
            `Recorded: ${d.responded_at ? new Date(d.responded_at).toISOString() : ""}`,
            `Message: ${d.response.message}`,
          ]
        : []),
      "This records only the response to this proof version. It does not record a payment. The preceding issued mockup remains unchanged.",
    ]);
  }
  return {
    bytes,
    mime: "application/pdf",
  };
}
