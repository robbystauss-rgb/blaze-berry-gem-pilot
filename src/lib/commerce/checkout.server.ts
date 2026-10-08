import { randomUUID, createHash } from "node:crypto";
import { z } from "zod";
import { getSql } from "@/lib/db";
import { reserveInventory, audit, changeAllocation, notify, orderById } from "./core.server";
import type { PaymentBuild } from "@/lib/payments";
import { getSessionUser } from "@/lib/auth/verify.server";

export function decodeArtwork(data: string | undefined) {
  if (!data) return null;
  if (data.length > 8_000_000) throw new Error("Artwork must be smaller than 6 MB.");
  const match =
    /^data:(image\/(?:png|jpeg|webp|svg\+xml)|application\/pdf);base64,([A-Za-z0-9+/=\r\n]+)$/.exec(
      data,
    );
  if (!match) throw new Error("Upload a PNG, JPG, WebP, SVG or PDF artwork file.");
  const bytes = Buffer.from(match[2], "base64");
  const mime = match[1];
  if (!bytes.length || bytes.length > 6_000_000)
    throw new Error("Artwork must be smaller than 6 MB.");
  const valid =
    mime === "image/png"
      ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      : mime === "image/jpeg"
        ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
        : mime === "image/webp"
          ? bytes.subarray(0, 4).toString() === "RIFF" &&
            bytes.subarray(8, 12).toString() === "WEBP"
          : mime === "application/pdf"
            ? bytes.subarray(0, 5).toString() === "%PDF-"
            : /<svg[\s>]/i.test(bytes.toString()) &&
              !/<script|on\w+\s*=|<foreignObject|(?:href|src)\s*=\s*["'](?:https?:|javascript:|data:)/i.test(
                bytes.toString(),
              );
  if (!valid) throw new Error("Artwork content does not match a supported file type.");
  return { bytes, mime };
}
export type CheckoutQuote = {
  build: PaymentBuild;
  lineName: string;
  description: string;
  unit: number;
  purchased: number;
  bonus: number;
  fulfilled: number;
  total: number;
};
export async function createCheckoutOrder(
  quote: CheckoutQuote,
  provider: "stripe" | "paypal" | "manual_venmo",
  resolveUser = getSessionUser,
) {
  if (process.env.NODE_ENV === "production" && !process.env.DATABASE_URL?.trim())
    throw new Error("Durable order storage is not configured. Contact the store before paying.");
  const artwork = decodeArtwork(quote.build.artworkDataUrl);
  if (quote.build.hasArtwork && !artwork)
    throw new Error("Upload your original artwork again so it can be attached to your order.");
  const position = quote.build.previewPlacement
    ? z
        .object({
          offsetX: z.number().finite(),
          offsetY: z.number().finite(),
          scale: z.number().finite().min(0.1).max(10),
          position: z.record(z.string(), z.unknown()).optional(),
        })
        .parse(quote.build.previewPlacement)
    : null;
  const spec = {
    ...quote.build,
    artworkDataUrl: undefined,
    previewPlacement: position,
    fulfilledQuantity: quote.fulfilled,
    bonusQuantity: quote.bonus,
    priceDefinition: "Existing storefront quote; no added shipping/tax",
    provider,
  };
  const hash = createHash("sha256")
    .update(JSON.stringify(spec))
    .update(artwork?.bytes ?? "")
    .digest("hex");
  const orderId = quote.build.checkoutRequestId
    ? z.string().uuid().parse(quote.build.checkoutRequestId)
    : randomUUID();
  const sql = await getSql();
  const user = await resolveUser();
  await sql.transaction(async (tx) => {
    const inserted =
      await tx`insert into commerce_orders(id,customer_user_id,customer_name,customer_email,source,subtotal,total) values(${orderId},${user?.id ?? null},${quote.build.customerName},${quote.build.customerEmail},${provider + "_checkout"},${Math.round(quote.total * 100)},${Math.round(quote.total * 100)}) on conflict(id) do nothing returning id`;
    if (!inserted.length) {
      const existing = await orderById(tx, orderId, true);
      if (existing.stage === "canceled")
        throw new Error("This checkout was canceled. Start a new checkout attempt.");
      if (existing.paid > 0)
        throw new Error(
          "This order already has collected payment. Review it before another checkout.",
        );
      const safeRetryHours = provider === "paypal" ? 5 : 23;
      if (
        provider !== "manual_venmo" &&
        Date.now() - new Date(existing.created_at).getTime() > safeRetryHours * 3600000
      )
        throw new Error(
          "This checkout attempt is too old for automatic retry. Start a new attempt after reviewing the prior order.",
        );
      const [item] = await tx<{
        specifications: { snapshot_hash: string };
      }>`select specifications from commerce_order_items where order_id=${orderId}`;
      if (item?.specifications.snapshot_hash !== hash)
        throw new Error("Checkout changed. Start a new checkout attempt.");
      return;
    }
    await tx`insert into commerce_order_items(id,order_id,product_key,title,quantity,fulfilled_quantity,unit_amount,specifications,artwork,artwork_type)
  values(${randomUUID()},${orderId},${quote.build.orderType + ":" + quote.build.family + ":" + quote.build.colorway},${quote.lineName},${quote.purchased},${quote.fulfilled},${Math.round(quote.unit * 100)},${JSON.stringify({ ...spec, snapshot_hash: hash })},${artwork?.bytes ?? null},${artwork?.mime ?? null})`;
    await reserveInventory(tx, orderId, "checkout");
    await audit(tx, "checkout", "order.created", "order", orderId, null, {
      provider,
      total: Math.round(quote.total * 100),
    });
    await notify(tx, `custom:${orderId}`, "New custom order awaiting payment", orderId);
  });
  return orderId;
}
export async function attachCheckout(orderId: string, provider: string, reference: string) {
  const sql = await getSql();
  await sql`insert into commerce_checkouts(order_id,provider,reference) values(${orderId},${provider},${reference}) on conflict(provider,reference) do nothing`;
}
export async function failCheckout(orderId: string) {
  const sql = await getSql();
  await sql.transaction(async (tx) => {
    await tx`select id from commerce_orders where id=${orderId} for update`;
    await changeAllocation(tx, orderId, "release", "checkout");
    await tx`update commerce_orders set stage='canceled',version=version+1 where id=${orderId} and stage='new'`;
    await audit(tx, "checkout", "order.checkout_failed", "order", orderId);
  });
}
