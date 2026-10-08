import { randomUUID } from "node:crypto";
import { getRequest } from "@tanstack/react-start/server";
import { getSql } from "@/lib/db";
import { stripeClient } from "./providers.server";
import { reserveInventory, audit, orderById } from "./core.server";
import { attachCheckout } from "./checkout.server";
import { getSessionUser } from "@/lib/auth/verify.server";
export async function createCatalogCheckout(data: {
  variantId: string;
  quantity: number;
  name: string;
  email: string;
  requestId: string;
}) {
  if (process.env.NODE_ENV === "production" && !process.env.DATABASE_URL)
    throw new Error("Durable order storage is not configured.");
  const stripe = stripeClient();
  const sql = await getSql();
  const user = await getSessionUser();
  const item = await sql.transaction(async (tx) => {
    const [variant] = await tx<{
      title: string;
      product_title: string;
      price: number;
      options: Record<string, string>;
    }>`select v.*,p.title as product_title from commerce_variants v join commerce_products p on p.id=v.product_id where v.id=${data.variantId} and v.active and p.state='active' and (p.publish_at is null or p.publish_at<=now()) for share of v,p`;
    if (!variant || variant.price <= 0) throw new Error("This product variant is not available.");
    const existing = await tx<{
      total: number;
      customer_email: string;
    }>`select total,customer_email from commerce_orders where id=${data.requestId}`;
    if (existing.length) {
      const order = await orderById(tx, data.requestId, true);
      if (order.paid > 0 || order.stage === "canceled")
        throw new Error(
          "This order is already paid or canceled. Review it before another checkout.",
        );
      if (Date.now() - new Date(order.created_at).getTime() > 23 * 3600000)
        throw new Error(
          "This checkout is too old for automatic retry. Review the prior order before starting a new attempt.",
        );
      const [line] = await tx<{
        product_key: string;
        quantity: number;
      }>`select product_key,quantity from commerce_order_items where order_id=${data.requestId}`;
      if (
        line?.product_key !== "variant:" + data.variantId ||
        line.quantity !== data.quantity ||
        existing[0].total !== variant.price * data.quantity ||
        existing[0].customer_email !== data.email
      )
        throw new Error("Checkout changed. Start a new attempt.");
      return variant;
    }
    await tx`insert into commerce_orders(id,customer_user_id,customer_name,customer_email,source,subtotal,total) values(${data.requestId},${user?.id ?? null},${data.name},${data.email},'catalog_checkout',${variant.price * data.quantity},${variant.price * data.quantity})`;
    await tx`insert into commerce_order_items(id,order_id,product_key,title,quantity,fulfilled_quantity,unit_amount,specifications) values(${randomUUID()},${data.requestId},${"variant:" + data.variantId},${variant.product_title + " · " + variant.title},${data.quantity},${data.quantity},${variant.price},${JSON.stringify({ variantId: data.variantId, title: variant.title, options: variant.options })})`;
    await reserveInventory(tx, data.requestId, "checkout");
    await audit(tx, "checkout", "order.created", "order", data.requestId);
    return variant;
  });
  const origin = process.env.PAYMENT_SITE_URL || new URL(getRequest().url).origin;
  const session = await stripe.checkout.sessions.create(
    {
      mode: "payment",
      customer_email: data.email,
      metadata: { rec_order_id: data.requestId },
      success_url: `${origin}/order?payment=stripe-success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/shop`,
      line_items: [
        {
          quantity: data.quantity,
          price_data: {
            currency: "usd",
            unit_amount: item.price,
            product_data: { name: item.product_title + " · " + item.title },
          },
        },
      ],
    },
    { idempotencyKey: `rec-catalog-checkout:${data.requestId}` },
  );
  await attachCheckout(data.requestId, "stripe", session.id);
  if (!session.url) throw new Error("Checkout URL was not returned.");
  return { url: session.url };
}
