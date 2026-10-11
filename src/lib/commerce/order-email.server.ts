import { randomUUID, timingSafeEqual } from "node:crypto";
import { getSql, type Sql } from "@/lib/db";
import { audit, orderById } from "./core.server";
import { label, money, type ItemRow, type OrderRow, type PaymentRow } from "./types";

const SITE = "https://recmamamade.com";
const EMAIL = /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/;
const EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "application/pdf": "pdf",
};
type Attachment = { filename: string; content: string; content_type: string; content_id?: string };
type Payload = {
  from: string;
  to: string[];
  subject: string;
  html: string;
  text: string;
  attachments: Attachment[];
};
type Job = {
  id: string;
  event_key: string;
  order_id: string;
  attempts: number;
  payload: string | null;
};
type Image = { itemId: string; bytes: Buffer; mime: string };

export function orderEmailConfig() {
  const recipient = process.env.REC_ORDER_EMAIL_TO?.trim() ?? "";
  const sender = process.env.REC_ORDER_EMAIL_FROM?.trim() ?? "";
  const configured =
    EMAIL.test(recipient) &&
    EMAIL.test(sender) &&
    sender.toLowerCase().endsWith("@recmamamade.com") &&
    process.env.REC_ORDER_EMAIL_SENDER_VERIFIED === "true" &&
    !!process.env.RESEND_API_KEY?.trim();
  return { configured, recipient: EMAIL.test(recipient) ? recipient : null };
}
const escape = (value: unknown) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
const printable = (value: unknown): string =>
  value === null || value === undefined
    ? "Not recorded"
    : typeof value === "object"
      ? JSON.stringify(value, null, 2)
      : String(value);

/** Actual recorded specifications and artwork only; no live builder re-rendering. */
export function renderOrderEmail(
  order: OrderRow,
  items: ItemRow[],
  payments: PaymentRow[],
  images: Image[],
  title: string,
  sender: string,
  recipient: string,
): Payload {
  // Creation alerts can wait in the queue until after a payment arrives.
  title = title.replace(/ awaiting payment$/, "");
  const lines = [
    "REC Mama Made",
    title,
    `Order #${order.number}`,
    `Order ID: ${order.id}`,
    `Placed: ${new Date(order.created_at).toISOString()}`,
    `Customer: ${order.customer_name}`,
    `Customer email: ${order.customer_email || "Not recorded"}`,
    `Source: ${order.source}`,
    `Payment status: ${label(order.payment_status)}`,
    `Production stage: ${label(order.stage)}`,
    `Due: ${order.due_at ? new Date(order.due_at).toISOString() : "Not recorded"}`,
    `Shipping address: ${printable(order.shipping_address)}`,
    `Carrier: ${order.carrier ?? "Not recorded"}`,
    `Tracking: ${order.tracking ?? "Not recorded"}`,
  ];
  const attachments: Attachment[] = [];
  let bytesAttached = 0;
  const previews: string[] = [];
  for (const item of items) {
    lines.push(
      "",
      item.title,
      `Product key: ${item.product_key}`,
      `Purchased quantity: ${item.quantity}`,
      `Fulfillment quantity (includes any bonus): ${item.fulfilled_quantity}`,
      `Unit price: ${money(item.unit_amount)}`,
      `Line total: ${money(item.unit_amount * item.quantity)}`,
    );
    for (const [key, value] of Object.entries(item.specifications)) {
      if (key === "snapshot_hash" || key === "artworkDataUrl") continue;
      lines.push(`${label(key.replace(/([a-z])([A-Z])/g, "$1 $2"))}: ${printable(value)}`);
    }
    const image = images.find((i) => i.itemId === item.id);
    if (image && EXTENSIONS[image.mime] && bytesAttached + image.bytes.length <= 24_000_000) {
      const cid = `artwork-${item.id}`;
      const inline = ["image/png", "image/jpeg", "image/webp"].includes(image.mime);
      const filename = `REC-order-${order.number}-${item.id}.${EXTENSIONS[image.mime]}`;
      attachments.push({
        filename,
        content: image.bytes.toString("base64"),
        content_type: image.mime,
        ...(inline ? { content_id: cid } : {}),
      });
      bytesAttached += image.bytes.length;
      lines.push(`Original artwork attached: ${filename}`);
      if (inline)
        previews.push(
          `<p><strong>${escape(item.title)} — submitted artwork</strong></p><img src="cid:${cid}" alt="Customer artwork for ${escape(item.title)}" width="480" style="max-width:100%;height:auto;display:block">`,
        );
    } else
      lines.push(
        item.has_artwork
          ? "Artwork available in the protected order; email attachment limit or format prevents attaching it."
          : "No original artwork file was recorded. Check the design text above; an uploaded-artwork marker alone is not an image.",
      );
    const urls = item.specifications.productImages;
    if (Array.isArray(urls))
      for (const url of urls.slice(0, 3)) {
        if (
          typeof url === "string" &&
          /^\/(?:assets|brand|api\/catalog-image)\/[a-zA-Z0-9_./-]+$/.test(url) &&
          !url.includes("..")
        )
          previews.push(
            `<img src="${SITE}${escape(url)}" alt="${escape(item.title)}" width="240" style="max-width:100%;height:auto">`,
          );
      }
  }
  lines.push(
    "",
    ...(order.financial_detail_known
      ? [
          `Subtotal: ${money(order.subtotal)}`,
          `Discount: ${money(order.discount)}`,
          `Shipping: ${money(order.shipping)}`,
          `Tax: ${money(order.tax)}`,
        ]
      : ["Historical subtotal / shipping / tax / discount breakdown unavailable."]),
    `Order total: ${money(order.total)}`,
    `Actual payments recorded: ${money(order.paid)}`,
    `Refunds recorded: ${money(order.refunded)}`,
    `Net collected: ${money(order.paid - order.refunded)}`,
    `Outstanding order balance: ${money(Math.max(0, order.total - order.paid))}`,
  );
  for (const payment of payments)
    lines.push(
      `${label(payment.kind)}: ${money(payment.amount)} · ${payment.provider} · ${payment.reference} · ${new Date(payment.occurred_at).toISOString()}`,
      `Processor fee: ${payment.fee === null ? "Not available" : money(payment.fee)}`,
    );
  if (!payments.length)
    lines.push("No verified payment has been recorded. This email is not proof of payment.");
  const url = `${SITE}/admin?section=orders&orderId=${encodeURIComponent(order.id)}`;
  lines.push("", `Manage order and artwork (owner sign-in required): ${url}`);
  const text = lines.join("\n");
  return {
    from: `REC Mama Made <${sender}>`,
    to: [recipient],
    subject: `REC Mama Made — ${title} — Order #${order.number} — ${money(order.total)}`,
    text,
    attachments,
    html: `<!doctype html><html><body style="margin:0;background:#f5f5f4;color:#262626;font-family:Arial,sans-serif;font-size:16px;line-height:1.55"><main style="max-width:640px;margin:0 auto;padding:24px;background:white"><h1 style="font-size:24px">REC Mama Made · Order #${order.number}</h1><h2 style="font-size:20px">${escape(title)}</h2><p style="white-space:pre-wrap;overflow-wrap:anywhere">${escape(text)}</p>${previews.join("")}<p><a href="${escape(url)}" style="display:inline-block;padding:14px 22px;background:#305c49;color:white;text-decoration:none;border-radius:8px">Open order and artwork</a></p></main></body></html>`,
  };
}

export async function queueOrderEmail(
  sql: Sql,
  notificationId: string,
  key: string,
  orderId: string,
) {
  // Historical imports are reviewed independently, not treated as newly placed orders.
  await sql`insert into commerce_order_emails(id,event_key,order_id)
    select ${notificationId},${key},id from commerce_orders where id=${orderId}
    and source not in ('stripe_history_review','stripe_history_import') on conflict(event_key) do nothing`;
}

async function snapshot(sql: Sql, job: Job): Promise<Payload> {
  // Share the payment mutation's lock so totals, ledger and shipping agree.
  const order = await orderById(sql, job.order_id, true);
  const items = await sql<
    ItemRow & { artwork: Buffer | null }
  >`select *,artwork is not null as has_artwork from commerce_order_items where order_id=${job.order_id} order by id`;
  const payments =
    await sql<PaymentRow>`select * from commerce_payments where order_id=${job.order_id} order by occurred_at,id`;
  const [notification] = await sql<{
    title: string;
  }>`select title from commerce_notifications where id=${job.id}`;
  return renderOrderEmail(
    order,
    items,
    payments,
    items
      .filter((i) => i.artwork && i.artwork_type)
      .map((i) => ({ itemId: i.id, bytes: Buffer.from(i.artwork!), mime: i.artwork_type! })),
    notification.title,
    process.env.REC_ORDER_EMAIL_FROM!.trim(),
    process.env.REC_ORDER_EMAIL_TO!.trim(),
  );
}

/** Leases serialize competing webhook / cron workers. Freeze full payload before first HTTP attempt. */
export async function drainOrderEmails(
  connection?: Sql,
  transport: typeof fetch = fetch,
  limit = 2,
  orderId: string | null = null,
) {
  if (!orderEmailConfig().configured) return { configured: false, accepted: 0, attempted: 0 };
  const sql = connection ?? (await getSql());
  let accepted = 0,
    attempted = 0;
  for (let i = 0; i < Math.min(limit, 10); i++) {
    const token = randomUUID();
    const job = await sql.transaction(async (tx) => {
      // Never re-send an ambiguous attempt after the provider's 24h deduplication window.
      await tx`update commerce_order_emails set state='review_required',last_error='Delivery uncertain: review provider history before retrying',lease_until=null
        where state in ('queued','sending') and first_attempt_at<now()-interval '23 hours' and (lease_until is null or lease_until<now())`;
      const [row] = await tx<Job>`select * from commerce_order_emails
        where state in ('queued','sending') and next_attempt_at<=now() and (lease_until is null or lease_until<now())
        and (${orderId}::text is null or order_id=${orderId})
        order by created_at,id for update skip locked limit 1`;
      if (!row) return null;
      // All of this commits before sending, so a lost HTTP response retries the identical payload.
      const payload = row.payload ?? JSON.stringify(await snapshot(tx, row));
      await tx`update commerce_order_emails set state='sending',payload=${payload},attempts=attempts+1,
        first_attempt_at=coalesce(first_attempt_at,now()),lease_token=${token},lease_until=now()+interval '2 minutes'
        where id=${row.id}`;
      return { ...row, payload };
    });
    if (!job) break;
    attempted++;
    let providerId: string | null = null,
      error = "Email service unavailable",
      permanent = false;
    try {
      const response = await transport("https://api.resend.com/emails", {
        method: "POST",
        signal: AbortSignal.timeout(8000),
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
          "Idempotency-Key": `rec-order-email:${job.id}`,
        },
        body: job.payload,
      });
      if (response.ok) {
        const result = (await response.json()) as { id?: string };
        if (typeof result.id === "string" && result.id.length <= 200) providerId = result.id;
      } else {
        error = `Email provider HTTP ${response.status}`;
        permanent =
          response.status >= 400 &&
          response.status < 500 &&
          ![408, 409, 429].includes(response.status);
      }
    } catch {
      /* A timeout may have accepted delivery. Preserve key / payload for bounded retries. */
    }
    await sql.transaction(async (tx) => {
      const delay = Math.min(3600, 60 * 2 ** Math.min(job.attempts, 6));
      const updated =
        await tx`update commerce_order_emails set state=${providerId ? "accepted" : permanent ? "failed" : "queued"},
        provider_id=${providerId},last_error=${providerId ? null : error},lease_until=null,lease_token=null,
        accepted_at=${providerId ? new Date().toISOString() : null},next_attempt_at=now()+${delay}*interval '1 second'
        where id=${job.id} and lease_token=${token} returning id`;
      if (updated.length && providerId) {
        accepted++;
        await audit(
          tx,
          "order-email-service",
          "order.email_accepted",
          "order",
          job.order_id,
          null,
          { event: job.event_key, provider_id: providerId },
        );
      }
    });
  }
  return { configured: true, accepted, attempted };
}

/** Email outages cannot roll back a legitimate order or payment. */
export async function tryOrderEmails() {
  try {
    return await drainOrderEmails();
  } catch {
    console.error(
      "[order-email] Queue processing failed; queued messages remain available for retry.",
    );
  }
}
export async function orderEmailCron(request: Request) {
  const secret = process.env.CRON_SECRET;
  const supplied = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret ?? ""}`;
  if (
    !secret ||
    Buffer.byteLength(supplied) !== Buffer.byteLength(expected) ||
    !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))
  )
    return new Response("Unauthorized", { status: 401 });
  try {
    return Response.json(await drainOrderEmails(undefined, fetch, 10));
  } catch {
    return new Response("Email queue unavailable", { status: 503 });
  }
}
