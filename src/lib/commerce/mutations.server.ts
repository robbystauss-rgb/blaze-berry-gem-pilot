import { z } from "zod";
import { randomUUID } from "node:crypto";
import { getSql } from "@/lib/db";
import {
  audit,
  orderById,
  changeAllocation,
  adjustInventory,
  reserveInventory,
  recordPayment,
  assertPermission,
  notify,
} from "./core.server";
import { CONTENT_KEYS, STAGES, type Role } from "./types";
import { FAMILIES } from "@/lib/catalog";

const id = z.string().uuid(),
  text = z.string().trim(),
  cents = z.number().int().min(0).max(10000000);
const safeImage = text.refine(
  (v) => /^\/(?:assets|brand|api\/catalog-image)\/[a-zA-Z0-9_./-]+$/.test(v) && !v.includes(".."),
  "Use an existing local asset or upload a product image.",
);
export async function mutate(
  action: string,
  payload: Record<string, unknown>,
  actor: { userId: string; role: Role },
) {
  const sql = await getSql();
  return sql.transaction(async (tx) => {
    switch (action) {
      case "order.update": {
        const p = z
          .object({
            id,
            version: z.number().int(),
            stage: z.enum(STAGES),
            dueAt: z.string().datetime().nullable().optional(),
            assignedTo: text.nullable().optional(),
            tracking: text.max(200).optional(),
            carrier: text.max(100).optional(),
          })
          .parse(payload);
        const order = await orderById(tx, p.id, true);
        if (order.version !== p.version) throw new Error("Order changed. Refresh before saving.");
        if (actor.role === "production") {
          if (order.assigned_to !== actor.userId) throw new Error("Order is not assigned to you.");
          if (
            ["canceled", "ready_to_ship", "shipped", "delivered", "completed"].includes(p.stage) ||
            p.assignedTo !== undefined ||
            p.tracking !== undefined ||
            p.dueAt !== undefined
          )
            throw new Error("Production staff may update production stages only.");
        }
        if (["canceled", "completed", "delivered"].includes(order.stage) && p.stage !== order.stage)
          throw new Error(
            "This order is closed; historical fulfillment cannot be silently reopened.",
          );
        if (
          [
            "engraving",
            "assembly",
            "quality_check",
            "packaging",
            "ready_to_ship",
            "shipped",
            "delivered",
            "completed",
          ].includes(p.stage) &&
          order.paid - order.refunded < order.total
        )
          throw new Error("Full verified payment is required before production or shipment.");
        if (
          ["shipped", "delivered", "completed"].includes(order.stage) &&
          (p.stage === "canceled" || STAGES.indexOf(p.stage) < STAGES.indexOf(order.stage))
        )
          throw new Error("Shipment history cannot be rolled back.");
        if (p.stage === "shipped" && !(p.tracking || order.tracking))
          throw new Error("Add shipment tracking before marking shipped.");
        if (p.assignedTo) {
          const [staff] =
            await tx`select user_id from merchant_staff where user_id=${p.assignedTo} and active=true`;
          if (!staff) throw new Error("Assignee must be an active staff member.");
        }
        if (p.stage === "canceled") await changeAllocation(tx, p.id, "release", actor.userId);
        if (
          [
            "engraving",
            "assembly",
            "quality_check",
            "packaging",
            "ready_to_ship",
            "shipped",
            "delivered",
            "completed",
          ].includes(p.stage)
        )
          await changeAllocation(tx, p.id, "consume", actor.userId);
        await tx`update commerce_orders set stage=${p.stage},due_at=${p.dueAt === undefined ? order.due_at : p.dueAt},assigned_to=${p.assignedTo === undefined ? order.assigned_to : p.assignedTo},tracking=${p.tracking ?? order.tracking},carrier=${p.carrier ?? order.carrier},version=version+1 where id=${p.id}`;
        await audit(
          tx,
          actor.userId,
          "order.stage_updated",
          "order",
          p.id,
          {
            stage: order.stage,
            due_at: order.due_at,
            assigned_to: order.assigned_to,
            tracking: order.tracking,
          },
          { ...p },
        );
        if (p.stage === "customer_approval")
          await notify(
            tx,
            `approval:${p.id}:${p.version}`,
            "Order awaiting customer artwork approval",
            p.id,
          );
        return { id: p.id };
      }
      case "order.note": {
        const p = z.object({ id, body: text.min(1).max(4000) }).parse(payload);
        const order = await orderById(tx, p.id, true);
        if (actor.role === "production" && order.assigned_to !== actor.userId)
          throw new Error("Order is not assigned to you.");
        const noteId = randomUUID();
        await tx`insert into commerce_notes(id,order_id,actor_id,body) values(${noteId},${p.id},${actor.userId},${p.body})`;
        await audit(tx, actor.userId, "order.note_added", "order", p.id, null, { note_id: noteId });
        return { id: p.id };
      }
      case "order.draft": {
        assertPermission(actor.role, "orders");
        const p = z
          .object({
            customerName: text.min(1).max(120),
            customerEmail: z.email(),
            title: text.min(1).max(200),
            quantity: z.number().int().min(1).max(250),
            unitAmount: cents.min(1),
            specifications: text.max(4000),
            dueAt: z.string().datetime().nullable(),
            shipping: cents.default(0),
            tax: cents.default(0),
            discount: cents.default(0),
            shippingAddress: z.record(z.string(), text.max(200)).optional(),
            requestId: id,
            productKey: text.min(1).max(250).default("custom_draft"),
          })
          .parse(payload);
        if (await tx`select id from commerce_orders where id=${p.requestId}`.then((r) => r.length))
          return { id: p.requestId };
        const total = p.quantity * p.unitAmount - p.discount + p.shipping + p.tax;
        if (total <= 0) throw new Error("Draft order must have a positive balance.");
        await tx`insert into commerce_orders(id,customer_name,customer_email,source,subtotal,discount,shipping,tax,total,due_at,shipping_address) values(${p.requestId},${p.customerName},${p.customerEmail},'owner_draft',${p.quantity * p.unitAmount},${p.discount},${p.shipping},${p.tax},${total},${p.dueAt},${JSON.stringify(p.shippingAddress ?? null)})`;
        if (
          p.productKey !== "custom_draft" &&
          !(
            await tx`select product_key from commerce_inventory_rules where product_key=${p.productKey}`
          ).length
        )
          throw new Error("Select an existing configured component recipe.");
        await tx`insert into commerce_order_items(id,order_id,product_key,title,quantity,fulfilled_quantity,unit_amount,specifications) values(${randomUUID()},${p.requestId},${p.productKey},${p.title},${p.quantity},${p.quantity},${p.unitAmount},${JSON.stringify({ instructions: p.specifications })})`;
        await reserveInventory(tx, p.requestId, actor.userId);
        await audit(tx, actor.userId, "order.draft_created", "order", p.requestId, null, { total });
        return { id: p.requestId };
      }
      case "payment.manual": {
        assertPermission(actor.role, "finance");
        const p = z
          .object({
            id,
            amount: cents.min(1),
            reference: text.min(3).max(160),
            reason: text.min(5).max(500),
            occurredAt: z.string().datetime(),
            requestId: id,
          })
          .parse(payload);
        if (new Date(p.occurredAt) > new Date())
          throw new Error("Manual payment date cannot be in the future.");
        if (
          (
            await tx`select order_id from commerce_invoices where order_id=${p.id} and provider_id is not null and state<>'void'`
          ).length
        )
          throw new Error(
            "Void the unpaid provider invoice before recording a manual payment; do not leave an active payment link outstanding.",
          );
        if (
          (
            await tx`select order_id from commerce_checkouts where order_id=${p.id} and state='pending'`
          ).length
        )
          throw new Error(
            "An active checkout exists. Expire and reconcile it before recording a manual payment.",
          );
        await recordPayment(tx, {
          orderId: p.id,
          provider: "manual",
          reference: p.reference,
          kind: "payment",
          amount: p.amount,
          occurredAt: p.occurredAt,
          actor: actor.userId,
          reason: p.reason,
        });
        return { id: p.id };
      }
      case "inventory.create": {
        assertPermission(actor.role, "inventory");
        const p = z
          .object({
            sku: text.min(1).max(100),
            title: text.min(1).max(200),
            category: text.min(1).max(100),
            threshold: z.number().int().min(0),
            incoming: z.number().int().min(0).default(0),
          })
          .parse(payload);
        const itemId = randomUUID();
        await tx`insert into commerce_inventory(id,sku,title,category,threshold,incoming) values(${itemId},${p.sku},${p.title},${p.category},${p.threshold},${p.incoming})`;
        await audit(tx, actor.userId, "inventory.created", "inventory", itemId, null, p);
        return { id: itemId };
      }
      case "inventory.adjust": {
        assertPermission(actor.role, "inventory");
        const p = z
          .object({
            id,
            version: z.number().int(),
            delta: z.number().int().min(-1000000).max(1000000),
            reason: text.min(5).max(500),
            requestId: id,
          })
          .parse(payload);
        await adjustInventory(tx, p, actor.userId);
        return { id: p.id };
      }
      case "inventory.settings": {
        assertPermission(actor.role, "inventory");
        const p = z
          .object({
            id,
            version: z.number().int().min(1),
            threshold: z.number().int().min(0),
            incoming: z.number().int().min(0),
            reason: text.min(5).max(500),
          })
          .parse(payload);
        const [before] = await tx<{
          version: number;
        }>`select * from commerce_inventory where id=${p.id} for update`;
        if (!before || before.version !== p.version)
          throw new Error("Stock changed. Refresh and review.");
        await tx`update commerce_inventory set threshold=${p.threshold},incoming=${p.incoming},version=version+1 where id=${p.id}`;
        await audit(tx, actor.userId, "inventory.settings_updated", "inventory", p.id, before, p);
        return { id: p.id };
      }
      case "inventory.rule": {
        assertPermission(actor.role, "inventory");
        const p = z
          .object({
            productKey: text.min(1).max(300),
            inventoryId: id,
            units: z.number().int().min(0).max(10000),
          })
          .parse(payload);
        // Changing future recipes never rewrites existing allocation snapshots.
        const before =
          await tx`select * from commerce_inventory_rules where product_key=${p.productKey} and inventory_id=${p.inventoryId}`;
        if (p.units === 0)
          await tx`delete from commerce_inventory_rules where product_key=${p.productKey} and inventory_id=${p.inventoryId}`;
        else
          await tx`insert into commerce_inventory_rules(product_key,inventory_id,units_per_item) values(${p.productKey},${p.inventoryId},${p.units}) on conflict(product_key,inventory_id) do update set units_per_item=excluded.units_per_item`;
        await audit(
          tx,
          actor.userId,
          "inventory.recipe_updated",
          "inventory",
          p.inventoryId,
          before,
          p,
        );
        return { id: p.inventoryId };
      }
      case "product.builder_content": {
        assertPermission(actor.role, "products");
        const p = z
          .object({
            family: text.refine((v) => v in FAMILIES, "Unknown catalog model"),
            title: text.min(1).max(120),
            description: text.max(10000),
            version: z.number().int().min(0),
          })
          .parse(payload);
        const [before] = await tx<{
          id: string;
          version: number;
        }>`select * from commerce_products where builder_family=${p.family} for update`;
        if ((before?.version ?? 0) !== p.version)
          throw new Error("Catalog content changed. Refresh and review.");
        const productId = before?.id ?? randomUUID();
        await tx`insert into commerce_products(id,builder_family,title,description,category,state) values(${productId},${p.family},${p.title},${p.description},'Custom hats','active') on conflict(builder_family) do update set title=excluded.title,description=excluded.description,version=commerce_products.version+1,updated_at=now()`;
        await audit(
          tx,
          actor.userId,
          "product.catalog_content_edited",
          "product",
          productId,
          before ?? null,
          p,
        );
        return { id: productId };
      }
      case "product.save": {
        assertPermission(actor.role, "products");
        const p = z
          .object({
            id: id.optional(),
            version: z.number().int().optional(),
            builderFamily: text.max(20).nullable().default(null),
            title: text.min(1).max(200),
            description: text.max(10000),
            category: text.min(1).max(100),
            state: z.enum(["draft", "active", "inactive", "archived"]),
            publishAt: z.string().datetime().nullable().default(null),
            images: z.array(safeImage).max(12),
            seoTitle: text.max(120).default(""),
            seoDescription: text.max(300).default(""),
            variants: z
              .array(
                z.object({
                  id: id.optional(),
                  title: text.min(1).max(120),
                  sku: text.min(1).max(100),
                  price: cents,
                  active: z.boolean(),
                  options: z.record(z.string(), text.max(100)).default({}),
                }),
              )
              .max(100),
          })
          .parse(payload);
        if (p.builderFamily)
          throw new Error(
            "Specialized hat configuration is protected. Use existing Studio for visual review; catalog geometry is not editable here.",
          );
        if (
          p.state === "active" &&
          (!p.images.length || !p.variants.some((v) => v.active && v.price > 0))
        )
          throw new Error("An active product needs a real image and a purchasable variant.");
        const productId = p.id ?? randomUUID();
        const [before] = await tx<{
          version: number;
          builder_family: string | null;
        }>`select * from commerce_products where id=${productId} for update`;
        if (before?.builder_family) throw new Error("Builder-linked products cannot be rewritten.");
        if (before && before.version !== p.version)
          throw new Error("Product changed. Refresh before saving.");
        if (p.id && !before) throw new Error("Product not found.");
        await tx`insert into commerce_products(id,title,description,category,state,images,seo_title,seo_description,publish_at) values(${productId},${p.title},${p.description},${p.category},${p.state},${JSON.stringify(p.images)},${p.seoTitle},${p.seoDescription},${p.publishAt}) on conflict(id) do update set title=excluded.title,description=excluded.description,category=excluded.category,state=excluded.state,images=excluded.images,seo_title=excluded.seo_title,seo_description=excluded.seo_description,publish_at=excluded.publish_at,version=commerce_products.version+1,updated_at=now()`;
        const oldVariants = await tx<{
          id: string;
          price: number;
          sku: string;
        }>`select * from commerce_variants where product_id=${productId}`;
        await tx`update commerce_variants set active=false where product_id=${productId}`;
        for (const v of p.variants) {
          if (v.id && !oldVariants.some((old) => old.id === v.id))
            throw new Error("Variant does not belong to this product.");
          await tx`insert into commerce_variants(id,product_id,title,sku,price,active,options) values(${v.id ?? oldVariants.find((old) => old.sku === v.sku)?.id ?? randomUUID()},${productId},${v.title},${v.sku},${v.price},${v.active},${JSON.stringify(v.options)}) on conflict(id) do update set title=excluded.title,sku=excluded.sku,price=excluded.price,active=excluded.active,options=excluded.options`;
        }
        await audit(
          tx,
          actor.userId,
          before ? "product.edited" : "product.created",
          "product",
          productId,
          { product: before, variants: oldVariants },
          p,
        );
        return { id: productId };
      }
      case "product.duplicate": {
        assertPermission(actor.role, "products");
        const p = z.object({ id }).parse(payload);
        const [product] = await tx<{
          title: string;
          description: string;
          category: string;
          images: string[];
        }>`select * from commerce_products where id=${p.id}`;
        if (!product) throw new Error("Product not found.");
        const productId = randomUUID();
        await tx`insert into commerce_products(id,title,description,category,state,images) values(${productId},${product.title + " (copy)"},${product.description},${product.category},'draft',${JSON.stringify(product.images)})`;
        const variants = await tx<{
          title: string;
          sku: string;
          price: number;
          options: Record<string, string>;
        }>`select * from commerce_variants where product_id=${p.id}`;
        for (const v of variants)
          await tx`insert into commerce_variants(id,product_id,title,sku,price,options) values(${randomUUID()},${productId},${v.title},${v.sku + "-" + productId.slice(0, 8)},${v.price},${JSON.stringify(v.options)})`;
        await audit(tx, actor.userId, "product.duplicated", "product", productId, null, {
          source: p.id,
        });
        return { id: productId };
      }
      case "content.save": {
        assertPermission(actor.role, "website");
        const p = z
          .object({
            key: z.enum(CONTENT_KEYS),
            value: text.max(20000),
            version: z.number().int().min(0),
          })
          .parse(payload);
        const [before] = await tx<{
          value: string;
          version: number;
        }>`select * from commerce_content where key=${p.key} for update`;
        if ((before?.version ?? 0) !== p.version)
          throw new Error("Content changed. Refresh before saving.");
        if (p.key === "contact_email" && p.value && !z.email().safeParse(p.value).success)
          throw new Error("Enter a valid contact email.");
        if (
          p.key === "featured_product_ids" &&
          p.value &&
          !p.value.split(",").every((v) => id.safeParse(v.trim()).success)
        )
          throw new Error("Use comma-separated product IDs.");
        await tx`insert into commerce_content(key,value) values(${p.key},${p.value}) on conflict(key) do update set value=excluded.value,version=commerce_content.version+1,updated_at=now()`;
        await audit(tx, actor.userId, "website.content_edited", "content", p.key, before ?? null, {
          value: p.value,
        });
        return { id: p.key };
      }
      case "content.restore": {
        assertPermission(actor.role, "website");
        const p = z.object({ id, version: z.number().int() }).parse(payload);
        const [entry] = await tx<{
          resource_id: string;
          before_value: { value: string } | null;
          after_value: { value: string };
        }>`select * from commerce_audit where id=${p.id} and resource_type='content' and action='website.content_edited'`;
        if (!entry || !CONTENT_KEYS.includes(entry.resource_id as (typeof CONTENT_KEYS)[number]))
          throw new Error("Only website content can be restored.");
        const [current] = await tx<{
          value: string;
          version: number;
        }>`select * from commerce_content where key=${entry.resource_id} for update`;
        if (!current || current.version !== p.version || current.value !== entry.after_value.value)
          throw new Error("Newer changes exist. Review current content instead.");
        const next = entry.before_value?.value ?? "";
        await tx`update commerce_content set value=${next},version=version+1,updated_at=now() where key=${entry.resource_id}`;
        await audit(
          tx,
          actor.userId,
          "website.content_restored",
          "content",
          entry.resource_id,
          current,
          { value: next, source_audit_id: p.id },
        );
        return { id: entry.resource_id };
      }
      case "staff.save": {
        assertPermission(actor.role, "staff");
        const p = z
          .object({
            userId: text.min(1).max(200),
            role: z.enum(["manager", "production"]),
            active: z.boolean(),
          })
          .parse(payload);
        const [before] = await tx<{
          role: Role;
        }>`select * from merchant_staff where user_id=${p.userId} for update`;
        if (before?.role === "owner" || p.userId === actor.userId)
          throw new Error(
            "Owner privileges require secure provisioning; this screen cannot remove an owner.",
          );
        const [user] = await tx`select id from "user" where id=${p.userId}`;
        if (!user) throw new Error("The user must sign in before staff access can be granted.");
        await tx`insert into merchant_staff(user_id,role,active) values(${p.userId},${p.role},${p.active}) on conflict(user_id) do update set role=excluded.role,active=excluded.active`;
        await audit(
          tx,
          actor.userId,
          "staff.permissions_changed",
          "staff",
          p.userId,
          before ?? null,
          p,
        );
        return { id: p.userId };
      }
      case "notification.read": {
        const p = z.object({ id }).parse(payload);
        await tx`insert into commerce_notification_reads(notification_id,user_id) values(${p.id},${actor.userId}) on conflict do nothing`;
        return { id: p.id };
      }
      case "customer.note": {
        assertPermission(actor.role, "customers");
        const p = z.object({ email: z.email(), body: text.min(1).max(4000) }).parse(payload);
        const noteId = randomUUID();
        await tx`insert into commerce_notes(id,customer_email,actor_id,body) values(${noteId},${p.email.toLowerCase()},${actor.userId},${p.body})`;
        await audit(tx, actor.userId, "customer.note_added", "customer", noteId);
        return { id: noteId };
      }
      default:
        throw new Error("Unsupported action.");
    }
  });
}
