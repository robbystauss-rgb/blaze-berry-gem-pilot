import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { z } from "zod";
import type { Permission } from "./types";
// Dynamic server imports keep database, secrets and provider clients out of browser bundles.
const uuid = z.string().uuid();
export const getDraftInventoryOptions = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { requireAccess } = await import("./access.server");
    await requireAccess(context.userId, "orders", context.bearerToken);
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    return sql<{
      key: string;
      title: string;
    }>`select r.product_key as key,string_agg(i.title || ' × ' || r.units_per_item::text,', ' order by i.title) as title from commerce_inventory_rules r join commerce_inventory i on i.id=r.inventory_id group by r.product_key order by title`;
  });
export const stripeHistoryAction = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.discriminatedUnion("action", [
      z
        .object({
          action: z.literal("preview"),
          from: z.string().date(),
          to: z.string().date(),
          cursor: z
            .string()
            .regex(/^cs_[A-Za-z0-9_]+$/)
            .optional(),
        })
        .refine((v) => new Date(v.to) > new Date(v.from), "Choose a valid date range"),
      z.object({ action: z.literal("import"), reference: z.string().regex(/^cs_[A-Za-z0-9_]+$/) }),
    ]),
  )
  .handler(async ({ data, context }) => {
    const { requireAccess } = await import("./access.server");
    await requireAccess(context.userId, "finance", context.bearerToken);
    const { previewStripeHistory, importStripeHistory } = await import("./reconciliation.server");
    return data.action === "preview"
      ? { preview: await previewStripeHistory(data), order: null }
      : { preview: null, order: await importStripeHistory(data.reference, context.userId) };
  });
export const refundAction = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      orderId: uuid,
      paymentId: uuid,
      amount: z.number().int().min(1).max(10000000),
      reason: z.string().trim().min(5).max(500),
      requestId: uuid,
    }),
  )
  .handler(async ({ data, context }) => {
    const { requireAccess } = await import("./access.server");
    await requireAccess(context.userId, "finance", context.bearerToken);
    const { requestRefund } = await import("./refunds.server");
    return requestRefund(data, context.userId);
  });
export const requireStudioAccess = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { requireAccess } = await import("./access.server");
    return requireAccess(context.userId, "products", context.bearerToken);
  });
export const getCustomerDetail = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.email())
  .handler(async ({ data, context }) => {
    const { requireAccess } = await import("./access.server");
    await requireAccess(context.userId, "customers", context.bearerToken);
    const { getSql } = await import("@/lib/db");
    const { ORDER_SELECT } = await import("./core.server");
    const sql = await getSql();
    return {
      orders: await sql.query<import("./types").OrderRow>(
        `${ORDER_SELECT} where lower(o.customer_email)=lower($1) order by o.created_at desc limit 100`,
        [data],
      ),
      notes: await sql<
        import("./types").NoteRow
      >`select id,actor_id,body,created_at from commerce_notes where lower(customer_email)=lower(${data}) order by created_at`,
    };
  });
export const uploadProductImage = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.string().max(5_500_000))
  .handler(async ({ data, context }) => {
    const { requireAccess } = await import("./access.server");
    await requireAccess(context.userId, "products", context.bearerToken);
    const { decodeArtwork } = await import("./checkout.server");
    const file = decodeArtwork(data);
    if (
      !file ||
      !["image/png", "image/jpeg", "image/webp"].includes(file.mime) ||
      file.bytes.length > 4_000_000
    )
      throw new Error("Product images must be PNG, JPG or WebP smaller than 4 MB.");
    const { getSql } = await import("@/lib/db");
    const { randomUUID } = await import("node:crypto");
    const { audit } = await import("./core.server");
    const sql = await getSql();
    const id = randomUUID();
    await sql.transaction(async (tx) => {
      await tx`insert into commerce_assets(id,mime,bytes,actor_id) values(${id},${file.mime},${file.bytes},${context.userId})`;
      await audit(tx, context.userId, "product.image_uploaded", "asset", id);
    });
    return { url: "/api/catalog-image/" + id };
  });
export const getMerchantAccess = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { membership, sessionHash } = await import("./access.server");
    const { getSql } = await import("@/lib/db");
    const actor = await membership(context.userId, context.bearerToken);
    const sql = await getSql();
    const [mfa] = await sql<{
      enabled: boolean;
    }>`select enabled from commerce_mfa where user_id=${context.userId}`;
    const verified =
      await sql`select session_hash from commerce_mfa_sessions where user_id=${context.userId} and session_hash=${sessionHash(context.bearerToken)} and expires_at>now()`;
    return {
      ...actor,
      mfaEnabled: !!mfa?.enabled,
      mfaRequired: process.env.ADMIN_REQUIRE_MFA === "true" || !!mfa?.enabled,
      mfaVerified: !!verified.length,
      mfaConfigured: !!process.env.ADMIN_MFA_ENCRYPTION_KEY,
      storage: process.env.DATABASE_URL ? "postgres" : "ephemeral development database",
    };
  });
export const getAdminData = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      section: z.enum([
        "overview",
        "orders",
        "production",
        "payments",
        "customers",
        "inventory",
        "products",
        "website",
        "activity",
        "staff",
        "notifications",
        "reports",
      ]),
      search: z.string().max(200).default(""),
      page: z.number().int().min(0).default(0),
      from: z.string().datetime().optional(),
      to: z.string().datetime().optional(),
      status: z.string().max(50).default(""),
    }),
  )
  .handler(async ({ data, context }) => {
    const { requireAccess } = await import("./access.server");
    const permissions: Record<string, Permission> = {
      overview: "orders",
      orders: "orders",
      production: "production",
      payments: "finance",
      customers: "customers",
      inventory: "inventory",
      products: "products",
      website: "website",
      activity: "audit",
      staff: "staff",
      notifications: "orders",
      reports: "reports",
    };
    const actor = await requireAccess(
      context.userId,
      permissions[data.section],
      context.bearerToken,
    );
    const { readAdmin } = await import("./read.server");
    return readAdmin(data, actor);
  });
export const getOrderDetail = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(uuid)
  .handler(async ({ data, context }) => {
    const { requireAccess } = await import("./access.server");
    const { readOrder } = await import("./read.server");
    const actor = await requireAccess(context.userId, "production", context.bearerToken);
    return readOrder(data, actor);
  });
export const mutateAdmin = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      action: z.enum([
        "order.update",
        "order.note",
        "order.draft",
        "payment.manual",
        "inventory.create",
        "inventory.adjust",
        "inventory.settings",
        "inventory.rule",
        "product.save",
        "product.builder_content",
        "product.duplicate",
        "content.save",
        "content.restore",
        "staff.save",
        "notification.read",
        "customer.note",
      ]),
      payload: z.record(z.string(), z.unknown()),
    }),
  )
  .handler(async ({ data, context }) => {
    const { requireAccess } = await import("./access.server");
    const permissions: Record<string, Permission> = {
      "order.update": "production",
      "order.note": "production",
      "order.draft": "orders",
      "payment.manual": "finance",
      "inventory.create": "inventory",
      "inventory.adjust": "inventory",
      "inventory.settings": "inventory",
      "inventory.rule": "inventory",
      "product.save": "products",
      "product.builder_content": "products",
      "product.duplicate": "products",
      "content.save": "website",
      "content.restore": "website",
      "staff.save": "staff",
      "notification.read": "orders",
      "customer.note": "customers",
    };
    const actor = await requireAccess(
      context.userId,
      permissions[data.action],
      context.bearerToken,
    );
    const { mutate } = await import("./mutations.server");
    return mutate(data.action, data.payload, actor);
  });
export const invoiceAction = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ orderId: uuid, action: z.enum(["create", "send", "resend"]) }))
  .handler(async ({ data, context }) => {
    const { requireAccess } = await import("./access.server");
    await requireAccess(context.userId, "finance", context.bearerToken);
    const { manageInvoice } = await import("./invoices.server");
    return manageInvoice(data.orderId, data.action, context.userId);
  });
export const mfaAction = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({ action: z.enum(["enroll", "verify"]), code: z.string().max(6).default("") }),
  )
  .handler(async ({ data, context }) => {
    const { membership, enrollMfa, verifyMfa, sessionHash } = await import("./access.server");
    const { getSql } = await import("@/lib/db");
    await membership(context.userId, context.bearerToken);
    const sql = await getSql();
    if (data.action === "enroll")
      return {
        enrollment: await sql.transaction((tx) => enrollMfa(tx, context.userId)),
        verified: false,
      };
    const verified = await sql.transaction((tx) =>
      verifyMfa(tx, context.userId, data.code, sessionHash(context.bearerToken)),
    );
    if (!verified)
      throw new Error("Invalid or reused code. After five failures, wait five minutes.");
    return { enrollment: null, verified };
  });
