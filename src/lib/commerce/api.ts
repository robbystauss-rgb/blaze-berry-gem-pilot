import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { z } from "zod";
import type { Permission } from "./types";
import { MAX_NEW_UPLOAD_DATA_URL_LENGTH } from "@/lib/upload-limits";
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
export const connectStripeEvents = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { requireAccess } = await import("./access.server");
    const actor = await requireAccess(context.userId, "finance", context.bearerToken);
    const { registerStripeWebhook, activateStripeWebhook } =
      await import("./webhook-config.server");
    await registerStripeWebhook(actor);
    return activateStripeWebhook(actor);
  });
export const uploadProductImage = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.string().max(MAX_NEW_UPLOAD_DATA_URL_LENGTH, "Upload an image up to 3 MB."))
  .handler(async ({ data, context }) => {
    const { requireAccess } = await import("./access.server");
    const actor = await requireAccess(context.userId, "products", context.bearerToken);
    const { uploadCatalogPhoto } = await import("./media.server");
    const { id } = await uploadCatalogPhoto({ name: "Product photo", data, alt: "" }, actor);
    return { url: "/api/catalog-image/" + id };
  });
export const getMerchantAccess = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { membership } = await import("./access.server");
    const actor = await membership(context.userId, context.bearerToken);
    return {
      ...actor,
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
    const result = await mutate(data.action, data.payload, actor);
    if (["order.draft", "payment.manual"].includes(data.action)) {
      const { tryOrderEmails } = await import("./order-email.server");
      await tryOrderEmails();
    }
    return result;
  });
export const retryOrderEmails = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { requireAccess } = await import("./access.server");
    const actor = await requireAccess(context.userId, "staff", context.bearerToken);
    const { audit } = await import("./core.server");
    const { getSql } = await import("@/lib/db");
    await audit(
      await getSql(),
      actor.userId,
      "order.email_retry_requested",
      "notification",
      "order-email-queue",
    );
    const { drainOrderEmails } = await import("./order-email.server");
    return drainOrderEmails();
  });
export const invoiceAction = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ orderId: uuid, action: z.enum(["create", "send", "resend", "void"]) }))
  .handler(async ({ data, context }) => {
    const { requireAccess } = await import("./access.server");
    await requireAccess(context.userId, "finance", context.bearerToken);
    if (data.action === "void") {
      const { voidInvoice } = await import("./invoice-void.server");
      return voidInvoice(data.orderId, context.userId);
    }
    const { manageInvoice } = await import("./invoices.server");
    return manageInvoice(data.orderId, data.action, context.userId);
  });
export const uploadProductionFile = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      orderId: uuid,
      name: z
        .string()
        .trim()
        .min(1)
        .max(180)
        // Filename validation deliberately rejects NUL and control characters.
        // eslint-disable-next-line no-control-regex
        .regex(/^[^\u0000-\u001f/\\]+$/),
      data: z.string().max(MAX_NEW_UPLOAD_DATA_URL_LENGTH, "Upload a production file up to 3 MB."),
      reason: z.string().trim().min(5).max(500),
      requestId: uuid,
    }),
  )
  .handler(async ({ data, context }) => {
    const { requireAccess } = await import("./access.server");
    const actor = await requireAccess(context.userId, "production", context.bearerToken);
    const { saveProductionFile } = await import("./production-files.server");
    return saveProductionFile(data, actor);
  });
export const exportAdminRecords = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      section: z.enum([
        "orders",
        "production",
        "payments",
        "inventory",
        "products",
        "customers",
        "activity",
        "notifications",
      ]),
      search: z.string().max(200).default(""),
      status: z.string().max(50).default(""),
      from: z.string().datetime().optional(),
      to: z.string().datetime().optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    const { requireAccess } = await import("./access.server");
    const actor = await requireAccess(context.userId, "reports", context.bearerToken);
    const { exportRecords } = await import("./export.server");
    return exportRecords({ ...data, page: 0 }, actor);
  });
